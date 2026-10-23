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
    rpc_hts_handoff: () => [{ member_id: "m1", name: "Daniel Brooks", email: "daniel@x.com", phone: "555", team: "Kids", top_gifts: ["sh", "te", "he"], serve_when: "Sundays", often: "Weekly", first_sunday: null }],
    rpc_hts_snapshot: () => ({ people: 1, gifts: { sh: 1, te: 1, he: 1 }, teams: DEFAULT_TEAMS.map((t) => ({ name: t.name, serving: t.name === "Kids" ? 3 : 0, fromPco: t.name === "Kids", gifted: 1 })) }),
    rpc_hts_pco_status: () => ({ connected: true, orgName: "Pinewood", connectedAt: "2026-10-20T10:00:00Z", queued: 0, runs: [{ kind: "pull", started_at: "2026-10-23T12:00:00Z", ok: true, pushed: 0, pulled: 12, error: null }], map: [{ pcoTeamId: "42", pcoTeamName: "Kids Check-in", htsTeam: "Kids" }, { pcoTeamId: "43", pcoTeamName: "Band", htsTeam: null }] }),
  };
}

let fail = 0; const ok = (c, m) => { console.log(c ? "ok -" : "FAIL -", m); if (!c) fail++; };
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });

async function asLevel(level, visits) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const fake = db(level);
  await page.route("**/*", async (r) => {
    const u = new URL(r.request().url());
    if (u.hostname.endsWith("supabase.co")) {
      const m = u.pathname.match(/\/rest\/v1\/(rpc\/)?(\w+)/);
      const key = m ? (m[1] ? "rpc_" : "") + m[2] : "";
      const body = fake[key] ? fake[key](u.search) : [];
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
  ["#/s/settings", cfg.pcoClientId ? "Match your Services teams" : "Planning Center app hasn", "settings with team levels and Planning Center"],
  ["#/s/account", "Delete my account", "account deletion"],
]);
await asLevel("staff", [
  ["#/s/home", "Church snapshot", "Today with the snapshot"],
  ["#/s/settings", "Next steps checklist", "settings not offered to Staff (lands on Today)"],
]);
await asLevel("team_lead", [
  ["#/s/handoff", "Kids: new people", "their team's handoff"],
  ["#/s/handoff", "Assigned to you", "steps assigned to them"],
  ["#/s/people", "Kids: new people", "no People list (lands on their team)"],
  ["#/s/prayer", "Kids: new people", "no prayer without prayer access"],
]);
await browser.close(); srv.close();
process.exit(fail ? 1 : 0);
