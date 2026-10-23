// Planning Center sends the Administrator back here after they approve the connection.
// Exchanges the one-time code for tokens and stores them server-side only, then returns to Settings.
// Deploy with --no-verify-jwt (Planning Center can't send a Supabase sign-in).
import { TOKEN_URL, PCO_HOST, PATH } from "../_shared/pco-constants.js";
import { admin, env, SITE_URL, queueEveryone } from "../_shared/server.ts";

const back = (status: string) => Response.redirect(`${SITE_URL()}/#/s/settings?pco=${status}`, 302);

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code"), state = url.searchParams.get("state");
  if (url.searchParams.get("error")) return back("cancelled");
  if (!code || !state) return back("error");
  const db = admin();

  // The state code ties this back to the church and Administrator who clicked Connect (good for one hour, used once)
  const { data: st } = await db.from("oauth_states").select("*").eq("state", state).maybeSingle();
  if (!st) return back("expired");
  await db.from("oauth_states").delete().eq("state", state);
  if (Date.now() - new Date(st.created_at).getTime() > 3600_000) return back("expired");
  const { data: lvl } = await db.from("staff").select("role").eq("church_id", st.church_id).eq("user_id", st.user_id).maybeSingle();
  if (lvl?.role !== "admin") return back("error");
  // One system at a time
  const { data: other } = await db.from("connections").select("system").eq("church_id", st.church_id).maybeSingle();
  if (other && other.system !== "pco") return back("other");

  const redirectUri = `${env("SUPABASE_URL")}/functions/v1/hts-pco-callback`;
  const res = await fetch(TOKEN_URL, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ grant_type: "authorization_code", code, client_id: env("PCO_CLIENT_ID"), client_secret: env("PCO_CLIENT_SECRET"), redirect_uri: redirectUri }),
  });
  if (!res.ok) {
    await db.from("sync_runs").insert({ church_id: st.church_id, system: "pco", kind: "connect", ok: false, finished_at: new Date().toISOString(), error: `Token exchange failed (${res.status})` });
    return back("error");
  }
  const t = await res.json();
  let orgName: string | null = null;
  try {
    const o = await fetch(PCO_HOST + PATH.organization, { headers: { Authorization: `Bearer ${t.access_token}` } }).then((r) => r.json());
    orgName = o?.data?.attributes?.name ?? null;
  } catch { /* the name is nice to have */ }

  await db.from("connections").upsert({
    church_id: st.church_id, system: "pco", access_token: t.access_token, refresh_token: t.refresh_token,
    expires_at: new Date(Date.now() + (t.expires_in || 7200) * 1000).toISOString(),
    org_name: orgName, connected_by: st.user_id, connected_at: new Date().toISOString(),
  });
  await db.from("sync_runs").insert({ church_id: st.church_id, system: "pco", kind: "connect", ok: true, finished_at: new Date().toISOString() });
  await queueEveryone(db, st.church_id);
  return back("connected");
});
