// Shared bits for the Edge Functions: the service-role database client and who's calling.
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";
import { CONNECTORS } from "./connectors.js";

export const env = (k: string, fallback = "") => Deno.env.get(k) ?? fallback;
export const SITE_URL = () => env("SITE_URL", "https://heretoserve.app").replace(/\/$/, "");

// Full access, server only. Never sent to a browser.
export function admin(): SupabaseClient {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
}

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// The scheduled job proves itself with CRON_SECRET; people prove themselves with their sign-in.
export async function caller(req: Request, db: SupabaseClient): Promise<{ cron: boolean; userId: string | null }> {
  const secret = env("CRON_SECRET");
  if (secret && req.headers.get("x-cron-secret") === secret) return { cron: true, userId: null };
  const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!jwt) return { cron: false, userId: null };
  const { data } = await db.auth.getUser(jwt);
  return { cron: false, userId: data.user?.id ?? null };
}

export async function levelIn(db: SupabaseClient, churchId: string, userId: string): Promise<string | null> {
  const { data } = await db.from("staff").select("role").eq("church_id", churchId).eq("user_id", userId).maybeSingle();
  return data?.role ?? null;
}

// Everyone who already finished the class goes to a newly connected system on its first sync
// deno-lint-ignore no-explicit-any
export async function queueEveryone(db: any, churchId: string) {
  const { data: done } = await db.from("members").select("id").eq("church_id", churchId).eq("status", "submitted");
  if (done?.length) await db.from("sync_queue").upsert(done.map((m: { id: string }) => ({ member_id: m.id, church_id: churchId })));
}

// A client for whichever system this church connected (refreshed Planning Center tokens are saved as they change)
// deno-lint-ignore no-explicit-any
export function clientFor(db: any, conn: any) {
  const c = CONNECTORS[conn.system as "pco" | "breeze"];
  return c.client(conn, {
    fetch, clientId: env("PCO_CLIENT_ID"), clientSecret: env("PCO_CLIENT_SECRET"),
    onTokens: async (t: { access_token: string; refresh_token: string; expires_at: string }) => {
      await db.from("connections").update({ access_token: t.access_token, refresh_token: t.refresh_token, expires_at: t.expires_at }).eq("church_id", conn.church_id);
    },
  });
}

