// Staff phone notifications: "someone finished class" and "a next step is overdue".
// Run every 15 minutes by the scheduled GitHub Action (x-cron-secret). Does nothing until the APNs secrets are set.
import { apnsToken, sendApns, message } from "../_shared/apns.js";
import { admin, caller, cors, env, json } from "../_shared/server.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const db = admin();
  const who = await caller(req, db);
  if (!who.cron) return json({ error: "Scheduled job only" }, 403);

  await db.rpc("hts_queue_overdue");
  const { data: items } = await db.from("notify_queue").select("*").is("sent_at", null).order("created_at").limit(200);
  if (!items?.length) return json({ ok: true, sent: 0 });

  const keyP8 = env("APNS_KEY_P8"), keyId = env("APNS_KEY_ID"), teamId = env("APNS_TEAM_ID");
  if (!keyP8 || !keyId || !teamId) return json({ ok: true, sent: 0, note: "APNs not set up yet; notifications are waiting" });
  const token = await apnsToken({ keyP8, keyId, teamId });
  const topic = env("APNS_TOPIC", "app.heretoserve"), production = env("APNS_PRODUCTION", "true") === "true";

  let sent = 0;
  for (const it of items) {
    // Who hears about it: everyone at Staff level and up for a new submission; the step's owner (or Staff and up) for overdue
    let users: string[] = [];
    if (it.kind === "overdue") {
      const { data: s } = await db.from("next_steps").select("owner_user, done_at").eq("id", it.step_id).maybeSingle();
      if (!s || s.done_at) { await db.from("notify_queue").update({ sent_at: new Date().toISOString() }).eq("id", it.id); continue; }
      if (s.owner_user) users = [s.owner_user];
    }
    // Approved to join: the Team Leads of the team they're headed to
    if (it.kind === "handoff") {
      const { data: m } = await db.from("members").select("team, rec_teams").eq("id", it.member_id).maybeSingle();
      const team = m?.team || m?.rec_teams?.[0];
      const { data: leads } = team ? await db.from("staff").select("user_id").eq("church_id", it.church_id).eq("role", "team_lead").contains("teams", [team]) : { data: [] };
      users = (leads || []).map((r) => r.user_id);
      if (!users.length) { await db.from("notify_queue").update({ sent_at: new Date().toISOString() }).eq("id", it.id); continue; }
    }
    if (!users.length) {
      const { data: st } = await db.from("staff").select("user_id").eq("church_id", it.church_id).in("role", ["admin", "staff"]);
      users = (st || []).map((r) => r.user_id);
    }
    const { data: church } = await db.from("churches").select("name").eq("id", it.church_id).single();
    const { data: devs } = users.length ? await db.from("devices").select("token, platform").in("user_id", users).eq("platform", "ios") : { data: [] };
    const msg = message(it.kind, church?.name);
    for (const d of devs || []) {
      const r = await sendApns({ token, deviceToken: d.token, topic, production, ...msg, data: { route: it.kind === "overdue" ? "#/s/home" : it.kind === "handoff" ? "#/s/handoff" : `#/s/person/${it.member_id}` } });
      if (r === "gone") await db.from("devices").delete().eq("token", d.token);
      if (r === "ok") sent++;
    }
    await db.from("notify_queue").update({ sent_at: new Date().toISOString() }).eq("id", it.id);
  }
  return json({ ok: true, sent });
});
