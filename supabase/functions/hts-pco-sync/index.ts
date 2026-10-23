// Planning Center sync.
//  - Push: everyone in pco_queue (finished class, or a leader changed their gifts/team) goes to Planning Center People.
//  - Pull: every Services team and who's on it, so the snapshot's "serving now" is real.
// Called every 15 minutes by the scheduled GitHub Action (x-cron-secret), or by Staff/Administrators with "Sync now".
import { makeClient, ensureSetup, pushMember, pullTeams, PcoError } from "../_shared/pco.js";
import { admin, caller, cors, env, json, levelIn } from "../_shared/server.ts";

const PUSH_PER_RUN = 60;           // keeps one run well inside the rate limit and the function time limit
const PULL_EVERY_MS = 60 * 60_000; // scheduled pulls at most hourly; "Sync now" pulls right away

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const db = admin();
  const who = await caller(req, db);
  let body: { church?: string; pull?: boolean } = {};
  try { body = await req.json(); } catch { /* empty body is fine */ }

  let churches: string[] = [];
  if (who.cron) {
    const { data } = await db.from("pco_connections").select("church_id");
    churches = (data || []).map((c) => c.church_id);
  } else {
    if (!who.userId || !body.church) return json({ error: "Sign in first" }, 401);
    const lvl = await levelIn(db, body.church, who.userId);
    if (lvl !== "admin" && lvl !== "staff") return json({ error: "Only Administrators and Staff can sync" }, 403);
    churches = [body.church];
  }

  const out: Record<string, unknown>[] = [];
  for (const churchId of churches) out.push(await syncChurch(db, churchId, !!body.pull || !who.cron));
  return json({ ok: true, churches: out });
});

// deno-lint-ignore no-explicit-any
async function syncChurch(db: any, churchId: string, forcePull: boolean) {
  const { data: conn } = await db.from("pco_connections").select("*").eq("church_id", churchId).maybeSingle();
  if (!conn) return { churchId, skipped: "not connected" };
  const client = makeClient(conn, {
    fetch, clientId: env("PCO_CLIENT_ID"), clientSecret: env("PCO_CLIENT_SECRET"),
    onTokens: async (c: { access_token: string; refresh_token: string; expires_at: string }) => {
      await db.from("pco_connections").update({ access_token: c.access_token, refresh_token: c.refresh_token, expires_at: c.expires_at }).eq("church_id", churchId);
    },
  });
  const { data: church } = await db.from("churches").select("settings").eq("id", churchId).single();
  const commitments = church?.settings?.commitments || [];
  const result: Record<string, unknown> = { churchId };

  // ---- push ----
  const { data: queue } = await db.from("pco_queue").select("member_id, tries").eq("church_id", churchId).lt("tries", 8).order("queued_at").limit(PUSH_PER_RUN);
  if (queue?.length) {
    const { data: run } = await db.from("pco_sync_runs").insert({ church_id: churchId, kind: "push" }).select("id").single();
    let pushed = 0; const errors: string[] = [];
    try {
      const ids = await ensureSetup(client, conn.field_ids || {});
      if (JSON.stringify(ids) !== JSON.stringify(conn.field_ids)) await db.from("pco_connections").update({ field_ids: ids }).eq("church_id", churchId);
      for (const q of queue) {
        const { data: m } = await db.from("members").select("*").eq("id", q.member_id).maybeSingle();
        if (!m) { await db.from("pco_queue").delete().eq("member_id", q.member_id); continue; }
        try {
          const r = await pushMember(client, ids, m, commitments, { noteAlreadySent: !!m.decision && m.pco_noted === m.decision });
          await db.from("members").update({ pco_person_id: r.personId, pco_synced_at: new Date().toISOString(), pco_noted: r.noted ? m.decision : m.pco_noted }).eq("id", m.id);
          await db.from("pco_queue").delete().eq("member_id", m.id);
          pushed++;
        } catch (e) {
          const msg = e instanceof PcoError ? `${m.name || "Someone"}: ${e.message}` : `${m.name || "Someone"}: ${String(e)}`;
          errors.push(msg);
          await db.from("pco_queue").update({ tries: q.tries + 1, last_error: msg.slice(0, 500) }).eq("member_id", m.id);
          if (e instanceof PcoError && e.status === 401) break; // the connection itself is broken; stop for this church
        }
      }
    } catch (e) { errors.push(String((e as Error).message || e)); }
    await db.from("pco_sync_runs").update({ finished_at: new Date().toISOString(), ok: errors.length === 0, pushed, error: errors.slice(0, 5).join(" | ") || null }).eq("id", run.id);
    result.pushed = pushed; result.errors = errors.length;
  }

  // ---- pull ----
  const { data: last } = await db.from("pco_sync_runs").select("started_at").eq("church_id", churchId).eq("kind", "pull").eq("ok", true).order("started_at", { ascending: false }).limit(1).maybeSingle();
  if (forcePull || !last || Date.now() - new Date(last.started_at).getTime() > PULL_EVERY_MS) {
    const { data: run } = await db.from("pco_sync_runs").insert({ church_id: churchId, kind: "pull" }).select("id").single();
    try {
      const { teams, roster } = await pullTeams(client);
      // Keep each team's mapping; add new teams; refresh names
      await db.from("pco_team_map").upsert(teams.map((t: { id: string; name: string }) => ({ church_id: churchId, pco_team_id: t.id, pco_team_name: t.name })), { onConflict: "church_id,pco_team_id", ignoreDuplicates: false });
      await db.from("pco_rosters").delete().eq("church_id", churchId);
      for (let i = 0; i < roster.length; i += 500) {
        await db.from("pco_rosters").upsert(roster.slice(i, i + 500).map((r: { teamId: string; personId: string; name: string }) => ({ church_id: churchId, pco_team_id: r.teamId, pco_person_id: r.personId, name: r.name })));
      }
      await db.from("pco_sync_runs").update({ finished_at: new Date().toISOString(), ok: true, pulled: roster.length }).eq("id", run.id);
      result.pulledTeams = teams.length; result.pulledPeople = roster.length;
    } catch (e) {
      await db.from("pco_sync_runs").update({ finished_at: new Date().toISOString(), ok: false, error: String((e as Error).message || e).slice(0, 500) }).eq("id", run.id);
      result.pullError = String((e as Error).message || e);
    }
  }
  result.requests = client.calls;
  return result;
}
