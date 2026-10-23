// Simulation: one Growth Track class, 10 people, start to finish, against the real database rules (PGlite).
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "fs";
import { PAIRS, GIFT_KEYS } from "../src/bank.js";
import { results, staffSteps } from "../src/engine.js";

const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
  create table auth.users (id uuid primary key, email text);
  create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.uid', true), '')::uuid $$;
  create publication supabase_realtime;
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on functions to anon, authenticated;
  alter default privileges in schema public grant all on sequences to anon, authenticated;`);
await db.exec(readFileSync(new URL("../supabase/setup.sql", import.meta.url), "utf8"));
const q = async (s, p) => (await db.query(s, p)).rows;
const as = async (uid, fn) => { await db.exec(`set role ${uid ? "authenticated" : "anon"}; select set_config('request.uid', '${uid || ""}', false);`); try { return await fn(); } finally { await db.exec(`reset role; select set_config('request.uid', '', false);`); } };
const one = async (uid, s, p) => (await as(uid, () => q(s, p)))[0];
const tryAs = async (uid, s, p) => { try { return { ok: (await as(uid, () => q(s, p)))[0] }; } catch (e) { return { err: e.message }; } };
const issues = [], notes = [];
const issue = (who, what) => { issues.push(`${who}: ${what}`); };

const ADMIN = "11111111-1111-1111-1111-111111111111", HOST = "22222222-2222-2222-2222-222222222222";
await db.exec(`insert into auth.users values ('${ADMIN}','parker@pinewood.church'), ('${HOST}','host@pinewood.church')`);
const cid = (await one(ADMIN, `select public.hts_create_church('Pinewood Church', 'Parker') id`)).id;
const k = await one(ADMIN, `insert into public.classes(church_id, name, class_date, created_by) values ($1, 'Growth Track', current_date, $2) returning id, join_code`, [cid, ADMIN]);
const typed = (t) => String(t).trim().toLowerCase().replace(/[^a-z0-9]/g, ""); // same as the /join screen
const shown = (c) => c.toUpperCase().replace(/(.{4})(?=.)/g, "$1-");

// Picks that lean toward a person's gifts, in order of preference
const lean = (prefer) => PAIRS.map((p) => { const a = prefer.indexOf(p[1]), b = prefer.indexOf(p[3]); return a !== -1 && (b === -1 || a < b) ? p[1] : b !== -1 ? p[3] : p[1]; });
const base = { married: "Single", kids: "No kids", faith: "Yes", bapt: "Yes", group: "Yes", found: "A friend invited me", served: "No", skills: [], passions: [], when: "Sundays", often: "Weekly" };
const people = [
  { n: "Josh Kim", a: { married: "Married", kids: "2", passions: ["Kids"], skills: ["Teaching"] }, g: ["sh", "te", "he"], d: "joining" },
  { n: "Hannah Kim", a: { married: "Married", kids: "2", passions: ["Kids", "Welcoming new people"] }, g: ["ho", "sh", "me"], d: "joining" },
  { n: "Priya Shah", a: { passions: ["Prayer", "The hurting"], prayer: "My mom's surgery next week" }, g: ["fa", "me", "en"], d: "joining" },
  { n: "Marcus Lee", a: { bapt: "Not yet", passions: ["Our city"] }, g: ["ev", "le"], d: "joining" },
  { n: "Dee Carter", a: { faith: "Not sure", bapt: "I'd like to talk about it", group: "No" }, g: ["me", "en"], d: "not_ready" },
  { n: "Tom Reyes", a: { when: "My season is full right now", skills: ["Tech or AV"] }, g: ["he", "ad"], d: "joining" },
  { n: "Lena Park", a: { skills: ["Music or vocals"], passions: ["Worship"] }, g: ["fa", "en"], d: "joining", dropsSignal: true },
  { n: "Sam Ortiz", a: { skills: ["Military or law enforcement"] }, g: ["le", "he"], d: "joining", typesCode: true },
  { n: "Ana Ruiz", a: { group: "Interested", passions: ["Students"] }, g: ["sh", "en", "te"], d: "joining", scansTwice: true },
  { n: "", a: { faith: "Yes" }, g: ["gi", "ad"], d: "joining", skipsContact: true },
];

const keys = [];
for (const [i, p] of people.entries()) {
  const who = p.n || "Person 10 (no name)";
  const code = p.typesCode ? typed(` ${shown(k.join_code)} `) : k.join_code;
  if (p.typesCode && code !== k.join_code) issue(who, "typed code didn't match the class");
  const j = (await one(null, `select public.hts_join($1) r`, [code])).r;
  if (!j?.key) { issue(who, "couldn't join the class"); continue; }
  if (p.scansTwice) { await one(null, `select public.hts_join($1) r`, [code]); }
  const key = j.key; keys.push(key);
  const a = { ...base, ...p.a, adult: true, name: p.n, email: p.skipsContact ? "" : `${p.n.split(" ")[0].toLowerCase()}@mail.com`, phone: "" };
  const picks = lean(p.g);
  for (let step = 1; step <= 9; step++) await one(null, `select public.hts_save($1, $2, '[]'::jsonb, $3) r`, [key, a, step]);
  if (p.dropsSignal) { // Part 2 half done, phone loses signal, comes back, page reopens from the saved key
    await one(null, `select public.hts_save($1, $2, $3, 10) r`, [key, a, JSON.stringify(picks.slice(0, 15))]);
    const back = (await one(null, `select public.hts_open($1) r`, [key])).r;
    if ((back.member.picks || []).filter(Boolean).length !== 15) issue(who, "lost answers after the signal dropped");
  }
  const commits = (j.church.commitments || []).map((c) => c.k);
  const r = await tryAs(null, `select public.hts_submit($1, $2, $3, $4, $5) r`, [key, a, JSON.stringify(picks), p.d, JSON.stringify(p.d === "joining" ? commits : [])]);
  if (r.err) issue(who, `submit failed: ${r.err}`);
}

// What the staff sees
const members = await as(ADMIN, () => q(`select * from public.members where class_id = $1 order by created_at`, [k.id]));
const teams = (await one(ADMIN, `select settings->'teams' t from public.churches where id=$1`, [cid])).t;
const submitted = members.filter((m) => m.status === "submitted");
notes.push(`${members.length} cards in the class, ${submitted.length} submitted`);
for (const m of submitted) {
  const local = results(m.answers, m.picks, teams);
  if (local.top.map((g) => g.key).join() !== m.top_gifts.join()) issue(m.name || "no name", `phone showed gifts ${local.top.map((g) => g.key)} but staff sees ${m.top_gifts}`);
  if (local.teams.map((t) => t.name).join() !== m.rec_teams.join()) issue(m.name || "no name", `phone showed teams ${local.teams.map((t) => t.name)} but staff sees ${m.rec_teams}`);
  if (m.decision === "joining" && ["Not yet", "I'd like to talk about it"].includes(m.answers.bapt)) issue(m.name, `not baptized ("${m.answers.bapt}") but checked "I have trusted Jesus and been baptized" and joined`);
  if (m.decision === "joining" && ["Not yet", "Not sure"].includes(m.answers.faith)) issue(m.name, "not sure about faith but joined");
  if (!m.name) issue("Person 10", "submitted with no name, so staff can't tell who it is");
  if (!m.email && !m.phone) issue(m.name || "Person 10", "no email or phone, so nobody can follow up");
}
const ghosts = members.filter((m) => m.status !== "submitted");
if (ghosts.length) issue("Ana Ruiz", `scanning twice left ${ghosts.length} empty "in progress" card(s) in the class`);
const steps = await as(ADMIN, () => q(`select m.name, s.title from public.next_steps s join public.members m on m.id = s.member_id order by m.name, s.title`));
const byPerson = {}; for (const s of steps) (byPerson[s.name || "(no name)"] ||= []).push(s.title);
const prayers = await as(ADMIN, () => q(`select who, body from public.prayer_requests`));
const snap = (await one(ADMIN, `select public.hts_snapshot($1) s`, [cid])).s;

// Admin edits commitments while someone is mid-form, then that person submits
const late = (await one(null, `select public.hts_join($1) r`, [k.join_code])).r;
await as(ADMIN, () => q(`update public.churches set settings = jsonb_set(settings, '{commitments}', (settings->'commitments') || '[{"k":"sabbath","word":"Rest","statement":"I will keep a weekly rhythm of rest.","verse":"Exodus 20:8"}]'::jsonb) where id = $1`, [cid]));
const lateA = { ...base, adult: true, name: "Late Changer", email: "late@mail.com" };
const stale = await tryAs(null, `select public.hts_submit($1, $2, $3, 'joining', $4) r`, [late.key, lateA, JSON.stringify(lean(["he"])), JSON.stringify(late.church.commitments.map((c) => c.k))]);
notes.push(stale.err ? "old commitment list is refused after an edit (the app now reloads the list before the commitment step)" : "old commitment list accepted");
const fresh = (await one(null, `select public.hts_open($1) r`, [late.key])).r.church.commitments.map((c) => c.k); // what the app does on "I'm ready to join"
const lr = await tryAs(null, `select public.hts_submit($1, $2, $3, 'joining', $4) r`, [late.key, lateA, JSON.stringify(lean(["he"])), JSON.stringify(fresh)]);
if (lr.err) issue("Late Changer", `still can't submit after reloading commitments: "${lr.err}"`);

// Class closed: the code stops working
await as(ADMIN, () => q(`update public.classes set open = false where id = $1`, [k.id]));
const closed = (await one(null, `select public.hts_join($1) r`, [k.join_code])).r;
notes.push(closed ? "closed class still let someone join" : "closed class blocks new joins");

console.log("NOTES"); notes.forEach((n) => console.log(" -", n));
console.log("STEPS"); Object.entries(byPerson).forEach(([n, t]) => console.log(" -", n, "→", t.join("; ")));
console.log("PRAYER", JSON.stringify(prayers));
console.log("SNAPSHOT keys", Object.keys(snap || {}).join(","));
console.log("ISSUES"); issues.forEach((i) => console.log(" -", i));
