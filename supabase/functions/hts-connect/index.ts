// Connect Breeze (subdomain + API key), or test whichever system is connected.
//   { action: "breeze", church, subdomain, key }  Administrator only. Tests the key, then stores it server-side.
//   { action: "test", church }                    Administrator or Staff.
// The API key is never sent back to a browser.
import { CONNECTORS } from "../_shared/connectors.js";
import { SUBDOMAIN_RE } from "../_shared/breeze-constants.js";
import { admin, caller, clientFor, cors, json, levelIn, queueEveryone } from "../_shared/server.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const db = admin();
  const who = await caller(req, db);
  let body: { action?: string; church?: string; subdomain?: string; key?: string } = {};
  try { body = await req.json(); } catch { /* checked below */ }
  if (!who.userId || !body.church) return json({ error: "Sign in first" }, 401);
  const lvl = await levelIn(db, body.church, who.userId);

  if (body.action === "breeze") {
    if (lvl !== "admin") return json({ error: "Only Administrators can connect Breeze" }, 403);
    const sub = String(body.subdomain || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\.breezechms\.com.*$/, "");
    const key = String(body.key || "").trim();
    if (!SUBDOMAIN_RE.test(sub)) return json({ error: "Enter just the first part of your Breeze address (for yourchurch.breezechms.com, enter yourchurch)" }, 400);
    if (key.length < 16 || key.length > 200) return json({ error: "That doesn't look like a Breeze API key" }, 400);
    const { data: cur } = await db.from("connections").select("system").eq("church_id", body.church).maybeSingle();
    if (cur && cur.system !== "breeze") return json({ error: "Planning Center is connected. Disconnect it first; a church connects one system at a time." }, 409);
    let orgName: string | null = null;
    try {
      const c = CONNECTORS.breeze.client({ subdomain: sub, api_key: key }, { fetch });
      orgName = (await CONNECTORS.breeze.test(c)).orgName;
    } catch (e) {
      return json({ error: `Breeze didn't connect: ${(e as Error).message}` }, 400);
    }
    await db.from("connections").upsert({ church_id: body.church, system: "breeze", subdomain: sub, api_key: key, org_name: orgName || sub,
      access_token: null, refresh_token: null, expires_at: null, ext_ids: {}, connected_by: who.userId, connected_at: new Date().toISOString() });
    await db.from("sync_runs").insert({ church_id: body.church, system: "breeze", kind: "connect", ok: true, finished_at: new Date().toISOString() });
    await queueEveryone(db, body.church);
    return json({ ok: true, orgName: orgName || sub });
  }

  if (body.action === "test") {
    if (lvl !== "admin" && lvl !== "staff") return json({ error: "Only Administrators and Staff can test the connection" }, 403);
    const { data: conn } = await db.from("connections").select("*").eq("church_id", body.church).maybeSingle();
    if (!conn) return json({ error: "Nothing is connected" }, 400);
    const { data: run } = await db.from("sync_runs").insert({ church_id: body.church, system: conn.system, kind: "test" }).select("id").single();
    try {
      const r = await CONNECTORS[conn.system as "pco" | "breeze"].test(clientFor(db, conn));
      await db.from("sync_runs").update({ finished_at: new Date().toISOString(), ok: true }).eq("id", run.id);
      return json({ ok: true, orgName: r.orgName });
    } catch (e) {
      const msg = String((e as Error).message || e);
      await db.from("sync_runs").update({ finished_at: new Date().toISOString(), ok: false, error: msg.slice(0, 500) }).eq("id", run.id);
      return json({ ok: false, error: msg });
    }
  }
  return json({ error: "Unknown action" }, 400);
});
