// Browser check of the staff screens for each access level, against a fake database (no network).
// Needs Playwright: node build.mjs && node test/staff.e2e.mjs
import { createServer } from "http";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { DEFAULT_TEAMS, DEFAULT_COMMITMENTS, PINEWOOD_BELIEFS } from "../src/bank.js";
const { chromium } = await import(process.env.PW_PATH || "playwright");
const cfg = JSON.parse(readFileSync(process.env.HTS_CONFIG || new URL("../config.json", import.meta.url)));
const ref = new URL(cfg.supabaseUrl).host.split(".")[0];

const root = new URL("../dist/", import.meta.url).pathname;
const srv = createServer((req, res) => {
  const p = join(root, decodeURIComponent(req.url.split("?")[0]).replace(/^\/$/, "/index.html"));
  if (!existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "Content-Type": p.endsWith(".html") ? "text/html" : "image/png" }); res.end(readFileSync(p));
}).listen(0);
const base = `http://localhost:${srv.address().port}`;

const C = "c0000000-0000-0000-0000-000000000001", ME = "u0000000-0000-0000-0000-000000000001", TLU = "u0000000-0000-0000-0000-000000000002";
const K = "k0000000-0000-0000-0000-000000000001";
const church = { id: C, name: "Pinewood Church", logo_url: null, accent: "#1E4D3A", settings: { teams: DEFAULT_TEAMS, commitments: DEFAULT_COMMITMENTS, beliefs: PINEWOOD_BELIEFS } };
const member = (id, name, extra) => ({ id, class_id: K, status: "submitted", step: 100, name, email: name.split(" ")[0].toLowerCase() + "@x.com", phone: "555", answers: { faith: "Yes", bapt: "Not yet", group: "No", when: "Sundays", often: "Weekly", skills: ["Teaching"], passions: ["Kids"] }, scores: { sh: 5, te: 5, he: 4, me: 2, le: 3, en: 3, ad: 2, fa: 3, ho: 2, ev: 2, gi: 2 }, top_gifts: ["sh", "te", "he"], rec_teams: ["Kids", "Youth"], decision: "joining", commitments: { faith: "2026-10-19T15:00:00Z" }, team: null, gifts_override: null, first_sunday: null, submitted_at: "2026-10-19T15:00:00Z", created_at: "2026-10-19T14:00:00Z", ...extra });
const members = [member("m1", "Daniel Brooks"), member("m2", "Hannah Kim", { decision: "not_ready", commitments: {} }), member("m3", "Sam Lee", { status: "started", step: 4, decision: null, scores: null, top_gifts: null, rec_teams: null })];
const steps = [{ id: "s1", member_id: "m1", kind: "baptism", title: "Baptism conversation", owner_label: "Next steps pastor", owner_user: TLU, due: "2026-10-20", done_at: null }, { id: "s2", member_id: "m2", kind: "followup", title: "Follow up: not ready to join", owner_label: "Next steps pastor", owner_user: null, due: "2030-01-01", done_at: null }];

function db(level) {
  const meRow = level === "team_lead" ? { church_id: C, user_id: ME, role: "team_lead", teams: ["Kids"], prayer: false, name: "Kim", email: "kim@p.com" } : { church_id: C, user_id: ME, role: level, teams: [], prayer: true, name: "Parker", email: "parker@p.com" };
  const team = [meRow, { church_id: C, user_id: TLU, role: "team_lead", teams: ["Kids"], prayer: false, name: "Kids Lead", email: "kids@p.com" }];
  const core = level !== "team_lead";
  return {
    staff: (q) => (q.includes("user_id=eq.") ? [meRow] : team),
    churches: () => [church],
    classes: () => (core || level === "team_lead_interviewing" ? [{ id: K, church_id: C, name: "October class", class_date: "2026-10-19", join_code: "abc123def456", open: true }] : []),
    class_leaders: () => [],
    members: () => (core ? members : []),
    next_steps: () => (core ? steps : [{ ...steps[0], owner_user: ME }]),
    prayer_requests: () => (meRow.prayer ? [{ id: "p1", member_id: "m1", who: "Daniel B.", body: "Wisdom for a new job", created_at: "2026-10-19T15:00:00Z", prayed_at: null }] : []),
    staff_invites: () => [],
    notes: () => [{ id: "n1", body: "Teacher by trade.", author_name: "Parker", created_at: "2026-10-19T16:00:00Z" }],
    rpc_hts_handoff: () => [{ member_id: "m1", name: "Daniel Brooks", email: "daniel@x.com", phone: "555", team: "Kids", top_gifts: ["sh", "te", "he"], serve_when: "Sundays", often: "Weekly", first_sunday: null, check_pending: true }],
    rpc_hts_snapshot: () => ({ people: 1, gifts: { sh: 1, te: 1, he: 1 }, teams: DEFAULT_TEAMS.map((t) => ({ name: t.name, serving: t.name === "Kids" ? 3 : 0, fromSource: t.name === "Kids", gifted: 1 })), source: "breeze" }),
    rpc_hts_conn_status: () => ({ connected: true, system: "breeze", orgName: "Pinewood", connectedAt: "2026-10-20T10:00:00Z", source: "breeze", queued: 0, runs: level === "admin" ? [{ system: "breeze", kind: "pull", started_at: "2026-10-23T12:00:00Z", ok: true, pushed: 0, pulled: 12, error: null }] : [], map: [{ source: "breeze", extTeamId: "42", extTeamName: "Volunteers › Kids Check-in", htsTeam: "Kids", people: 12 }, { source: "breeze", extTeamId: "43", extTeamName: "Volunteers › Band", htsTeam: null, people: 0 }] }),
    rpc_hts_export_people: () => [{ first_name: "Daniel", last_name: "Brooks", email: "daniel@x.com", phone: "555", membership_status: "Member", gift_1: "Shepherding", gift_1_score: 5, recommended_team: "Kids", open_next_steps: "=cmd" }],
    rpc_hts_export_steps: () => [{ person: "Daniel Brooks", email: "daniel@x.com", step: "Baptism conversation", owner: "Kids Lead", due: "2026-10-20" }],
    rpc_hts_import_roster: (_q, body) => ({ rows: 3, counted: body.p_teams?.Greeters ? 3 : 2, matchedPeople: 1, saved: !!body.p_commit, skipped: [{ row: 3, reason: "No team" }],
      teams: { Kids: { htsTeam: "Kids", people: 2 }, Greeters: { htsTeam: body.p_teams?.Greeters || null, people: 1 } }, unmatchedTeams: body.p_teams?.Greeters ? [] : ["Greeters"] }),
  };
}

let fail = 0; const ok = (c, m) => { console.log(c ? "ok -" : "FAIL -", m); if (!c) fail++; };
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });

async function asLevel(level, visits, more) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const calls = [];
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const fake = db(level);
  await page.route("**/*", async (r) => {
    const u = new URL(r.request().url());
    if (u.hostname.endsWith("supabase.co")) {
      const m = u.pathname.match(/\/rest\/v1\/(rpc\/)?(\w+)/);
      const key = m ? (m[1] ? "rpc_" : "") + m[2] : "";
      let sent = {}; try { sent = JSON.parse(r.request().postData() || "{}"); } catch {}
      if (key) calls.push([key, sent]);
      const body = fake[key] ? fake[key](u.search, sent) : [];
      return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    }
    if (u.hostname === "localhost") return r.continue();
    return r.abort();
  });
  await page.addInitScript(([k, v]) => localStorage.setItem(k, v), [`sb-${ref}-auth-token`, JSON.stringify({ access_token: "x.y.z", refresh_token: "r", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: ME, email: "me@p.com", aud: "authenticated", role: "authenticated" } })]);
  for (const [hash, want, label] of visits) {
    await page.goto(base + "/" + hash);
    try { await page.waitForSelector(`text=${want}`, { timeout: 8000 }); ok(true, `${level}: ${label}`); }
    catch { ok(false, `${level}: ${label} (no "${want}")`); if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/fail-${level}-${label.replace(/\W+/g, "-")}.png` }); }
    if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${level}-${label.replace(/\W+/g, "-")}.png`, fullPage: true });
  }
  if (more) await more(page, calls);
  ok(errors.length === 0, `${level}: no script errors` + (errors.length ? ": " + errors.join(" | ") : ""));
  await page.close();
}

await asLevel("admin", [
  ["#/s/home", "Needs attention", "Today shows overdue steps"],
  ["#/s/people", "Hannah Kim", "People list"],
  ["#/s/person/m1", "Leader adjustment", "person page with interview edits"],
  ["#/s/class/" + K, "One-on-one leaders", "class page with QR and class leaders"],
  ["#/s/handoff", "Team handoff", "team handoff"],
  ["#/s/prayer", "Wisdom for a new job", "prayer requests"],
  ["#/s/settings", "Connected: Breeze", "settings shows which system is connected"],
  ["#/s/settings", "Match your tags", "Breeze tags to match to teams"],
  ["#/s/account", "Delete my account", "account deletion"],
  ["#/s/home", "Waiting for approval", "Today lists people waiting for a pastor's approval"],
  ["#/s/person/m1", "Talk about this before approving", "person page flags faith and baptism before approving"],
  ["#/s/person/m1", "One-on-one guide", "person page shows the one-on-one guide while waiting"],
  ["#/s/class/" + K, "Run the class", "class page has the host's run sheet"],
  ["#/s/class/" + K, "One-on-one with", "class page pairs people with one-on-one leaders"],
  ["#/s/settings", "What do you call joining?", "settings: the church's own words for joining"],
  ["#/s/settings", "Who owns each next step", "settings: step owners"],
], async (page, calls) => {
  await page.goto(base + "/#/s/person/m1"); await page.waitForSelector("text=Approve joining");
  await page.click('section [data-act="approve"]'); await page.waitForTimeout(300);
  ok(calls.some(([k, b]) => k === "rpc_hts_approve" && b.p_member === "m1" && b.p_ok === true), "admin: Approve sends the approval");
  await page.fill('[data-form="hold"] input[name="note"]', "Talk about baptism first"); await page.click('[data-form="hold"] button[type="submit"]'); await page.waitForTimeout(300);
  ok(calls.some(([k, b]) => k === "rpc_hts_approve" && b.p_ok === false && b.p_note === "Talk about baptism first"), "admin: Put on hold sends the private note");
  await page.goto(base + "/#/s/class/" + K); await page.waitForSelector("text=Run the class");
  await page.selectOption('[data-act-change="interviewer"][data-id="m1"]', TLU); await page.waitForTimeout(300);
  ok(calls.some(([k, b]) => k === "rpc_hts_set_interviewer" && b.p_member === "m1" && b.p_user === TLU), "admin: pairing a one-on-one leader is saved");
  // Export: a real CSV download, formulas neutralized
  await page.goto(base + "/#/s/people"); await page.waitForSelector("text=Export to a spreadsheet");
  await page.selectOption('[data-act-change="export-filter"]', "joined");
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click('[data-act="export-people"]')]);
  const text = readFileSync(await dl.path(), "utf8");
  ok(/^pinewood-church-people-\d{4}-\d{2}-\d{2}\.csv$/.test(dl.suggestedFilename()), "admin: people export downloads as a dated CSV");
  ok(text.startsWith("\uFEFFfirst_name,last_name,email,phone") && text.includes("Daniel,Brooks,daniel@x.com") && text.includes("'=cmd"), "admin: CSV has ChMS headers and a neutralized formula");
  ok(calls.some(([k, b]) => k === "rpc_hts_export_people" && b.p_filter === "joined"), "admin: export uses the chosen filter");
  const [dl2] = await Promise.all([page.waitForEvent("download"), page.click('[data-act="export-steps"]')]);
  ok(readFileSync(await dl2.path(), "utf8").includes("Baptism conversation"), "admin: next steps export");
  // Import: preview, match a team, save
  await page.goto(base + "/#/s/settings"); await page.waitForSelector("text=Import team rosters");
  await page.setInputFiles("#imp-file", { name: "rosters.csv", mimeType: "text/csv", buffer: Buffer.from("Email,Name,Ministry\ndaniel@x.com,Daniel Brooks,Kids\nann@x.com,Ann,Kids\n,Bob,\nzoe@x.com,Zoe,Greeters\n") });
  await page.click('[data-form="roster-file"] button[type="submit"]');
  await page.waitForSelector("text=Team in the file");
  ok(await page.isVisible("text=Not matched yet: Greeters") && await page.isVisible("text=1 row skipped"), "admin: import preview shows unmatched teams and skipped rows");
  const first = calls.find(([k]) => k === "rpc_hts_import_roster")[1];
  ok(first.p_commit === false && first.p_rows.length === 4 && first.p_rows[0].team === "Kids", "admin: preview sends parsed rows without saving");
  await page.selectOption('[data-act-change="imp-map"][data-id="Greeters"]', "Kids");
  await page.waitForSelector("text=3 will count as serving");
  await page.click('[data-act="imp-save"]');
  await page.waitForTimeout(300);
  const last = calls.filter(([k]) => k === "rpc_hts_import_roster").at(-1)[1];
  ok(last.p_commit === true && last.p_teams.Greeters === "Kids", "admin: save commits with the chosen team matches");
});
await asLevel("staff", [
  ["#/s/home", "Church snapshot", "Today with the snapshot"],
  ["#/s/people", "Download people (CSV)", "Staff can export"],
  ["#/s/settings", "Next steps checklist", "settings not offered to Staff (lands on Today)"],
]);
await asLevel("team_lead", [
  ["#/s/handoff", "Kids: new people", "their team's handoff"],
  ["#/s/handoff", "Assigned to you", "steps assigned to them"],
  ["#/s/handoff", "Background check pending", "a pending background check blocks the first Sunday"],
  ["#/s/people", "Kids: new people", "no People list (lands on their team)"],
  ["#/s/prayer", "Kids: new people", "no prayer without prayer access"],
], async (page) => {
  ok(!(await page.isVisible("text=Export to a spreadsheet")) && !(await page.isVisible("text=Import team rosters")), "team_lead: no export or import offered");
});
await browser.close(); srv.close();
process.exit(fail ? 1 : 0);
