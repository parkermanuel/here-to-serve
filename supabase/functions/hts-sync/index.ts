// Sync with the church's connected people system (Planning Center or Breeze), through one shared interface.
//  - Push: everyone in sync_queue (finished class, or a leader changed their gifts/team/first Sunday).
//  - Pull: the system's teams and, for teams matched in Settings, who's on them, so "serving now" is real.
// Called every 15 minutes by the scheduled GitHub Action (x-cron-secret), or by Staff/Administrators with "Sync now".
import { CONNECTORS } from "../_shared/connectors.js";
import { admin, caller, clientFor, cors, json, levelIn } from "../_shared/server.ts";

const PULL_EVERY_MS = 60 * 60_000; // scheduled pulls at most hourly; "Sync now" pulls right away
const TIME_BUDGET_MS = 100_000;    // stop starting new work well before the function's time limit

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const db = admin();
  const who = await caller(req, db);
  let body: { church?: string; pull?: boolean } = {};
  try { body = await req.json(); } catch { /* empty body is fine */ }

  let churches: string[] = [];
  if (who.cron) {
    const { data } = await db.from("connections").select("church_id");
    churches = (data || []).map((c) => c.church_id);
  } else {
    if (!who.userId || !body.church) return json({ error: "Sign in first" }, 401);
    const lvl = await levelIn(db, body.church, who.userId);
    if (lvl !== "admin" && lvl !== "staff") return json({ error: "Only Administrators and Staff can sync" }, 403);
    churches = [body.church];
  }
  const deadline = Date.now() + TIME_BUDGET_MS;
  const out: Record<string, unknown>[] = [];
  for (const churchId of churches) {
    if (Date.now() > deadline) break; // the rest go next run
    out.push(await syncChurch(db, churchId, !!body.pull || !who.cron, deadline));
  }
  return json({ ok: true, churches: out });
});

// deno-lint-ignore no-explicit-any
async function syncChurch(db: any, churchId: string, forcePull: boolean, deadline: number) {
  const { data: conn } = await db.from("connections").select("*").eq("church_id", churchId).maybeSingle();
  if (!conn) return { churchId, skipped: "not connected" };
  const sys = conn.system as "pco" | "breeze";
  const C = CONNECTORS[sys];
  const client = clientFor(db, conn);
  const { data: church } = await db.from("churches").select("settings").eq("id", churchId).single();
  const commitments = church?.settings?.commitments || [];
  const result: Record<string, unknown> = { churchId, system: sys };

  // ---- push ----
  const { data: queue } = await db.from("sync_queue").select("member_id, tries").eq("church_id", churchId).lt("tries", 8).order("queued_at").limit(C.pushPerRun);
  let ids = conn.ext_ids || {};
  if (queue?.length) {
    const { data: run } = await db.from("sync_runs").insert({ church_id: churchId, system: sys, kind: "push" }).select("id").single();
    let pushed = 0; const errors: string[] = [];
    try {
      ids = await C.setup(client, ids);
      if (JSON.stringify(ids) !== JSON.stringify(conn.ext_ids)) await db.from("connections").update({ ext_ids: ids }).eq("church_id", churchId);
      for (const q of queue) {
        if (Date.now() > deadline) break;
        const { data: m } = await db.from("members").select("*").eq("id", q.member_id).maybeSingle();
        if (!m) { await db.from("sync_queue").delete().eq("member_id", q.member_id); continue; }
        try {
          const prev = m.ext_system === sys ? m.ext_state || {} : {};
          const r = await C.push(client, ids, m, commitments, prev);
          await db.from("members").update({ ext_system: sys, ext_person_id: r.personId, ext_synced_at: new Date().toISOString(), ext_state: r.state }).eq("id", m.id);
          await db.from("sync_queue").delete().eq("member_id", m.id);
          if (r.noteError) errors.push(`${m.name || "Someone"}: sent, but the note didn't save (${r.noteError})`);
          pushed++;
        } catch (e) {
          const msg = `${m.name || "Someone"}: ${(e as Error).message || e}`;
          errors.push(msg);
          await db.from("sync_queue").update({ tries: q.tries + 1, last_error: msg.slice(0, 500) }).eq("member_id", m.id);
          if ((e as { status?: number }).status === 401) break; // the connection itself is broken; stop for this church
        }
      }
      if (JSON.stringify(ids) !== JSON.stringify(conn.ext_ids)) await db.from("connections").update({ ext_ids: ids }).eq("church_id", churchId);
    } catch (e) { errors.push(String((e as Error).message || e)); }
    await db.from("sync_runs").update({ finished_at: new Date().toISOString(), ok: errors.length === 0, pushed, error: errors.slice(0, 5).join(" | ") || null }).eq("id", run.id);
    result.pushed = pushed; result.errors = errors.length;
  }

  // ---- pull ----
  const { data: last } = await db.from("sync_runs").select("started_at").eq("church_id", churchId).eq("system", sys).eq("kind", "pull").eq("ok", true).order("started_at", { ascending: false }).limit(1).maybeSingle();
  if (Date.now() < deadline && (forcePull || !last || Date.now() - new Date(last.started_at).getTime() > PULL_EVERY_MS)) {
    const { data: run } = await db.from("sync_runs").insert({ church_id: churchId, system: sys, kind: "pull" }).select("id").single();
    try {
      const { data: maps } = await db.from("team_map").select("ext_team_id, hts_team").eq("church_id", churchId).eq("source", sys);
      const mapped = (maps || []).filter((m: { hts_team: string | null }) => m.hts_team).map((m: { ext_team_id: string }) => m.ext_team_id);
      const { teams, roster } = await C.pull(client, { mapped, ids });
      // Keep each team's match; add new teams; refresh names
      if (teams.length) await db.from("team_map").upsert(teams.map((t: { id: string; name: string }) => ({ church_id: churchId, source: sys, ext_team_id: t.id, ext_team_name: t.name })), { onConflict: "church_id,source,ext_team_id" });
      await db.from("rosters").delete().eq("church_id", churchId).eq("source", sys);
      for (let i = 0; i < roster.length; i += 500) {
        await db.from("rosters").upsert(roster.slice(i, i + 500).map((r: { teamId: string; personId: string; name: string }) => ({ church_id: churchId, source: sys, ext_team_id: r.teamId, person_key: r.personId, name: r.name })));
      }
      // Link roster rows to people who took the class here
      const { data: known } = await db.from("members").select("id, ext_person_id").eq("church_id", churchId).eq("ext_system", sys).not("ext_person_id", "is", null);
      for (const k of known || []) await db.from("rosters").update({ member_id: k.id }).eq("church_id", churchId).eq("source", sys).eq("person_key", k.ext_person_id);
      await db.from("sync_runs").update({ finished_at: new Date().toISOString(), ok: true, pulled: roster.length }).eq("id", run.id);
      result.pulledTeams = teams.length; result.pulledPeople = roster.length;
    } catch (e) {
      await db.from("sync_runs").update({ finished_at: new Date().toISOString(), ok: false, error: String((e as Error).message || e).slice(0, 500) }).eq("id", run.id);
      result.pullError = String((e as Error).message || e);
    }
  }
  result.requests = client.calls;
  return result;
}
