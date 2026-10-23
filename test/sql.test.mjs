// Database checks: runs supabase/setup.sql in an in-memory Postgres (PGlite) with Supabase's auth pieces stubbed.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "fs";
import { PAIRS, DEFAULT_TEAMS, DEFAULT_COMMITMENTS } from "../src/bank.js";
import { countGifts, topGifts, recommendTeams, staffSteps } from "../src/engine.js";

export async function makeDb() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create table auth.users (id uuid primary key, email text);
    create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.uid', true), '')::uuid $$;
    create publication supabase_realtime;
  `);
  // Supabase's defaults: anon and authenticated get everything on new tables and functions in public
  await db.exec(`grant usage on schema public to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated;
    alter default privileges in schema public grant all on functions to anon, authenticated;
    alter default privileges in schema public grant all on sequences to anon, authenticated;`);
  const sql = readFileSync(new URL("../supabase/setup.sql", import.meta.url), "utf8");
  await db.exec(sql);
  await db.exec(sql); // must be safe to run twice
  return db;
}

const db = await makeDb();
let failed = 0;
const ok = (c, m) => { console.log(c ? "ok -" : "FAIL -", m); if (!c) failed++; };
const q = async (s, p) => (await db.query(s, p)).rows;
const as = async (uid, fn) => {
  await db.exec(`set role ${uid ? "authenticated" : "anon"}; select set_config('request.uid', '${uid || ""}', false);`);
  try { return await fn(); } finally { await db.exec(`reset role; select set_config('request.uid', '', false);`); }
};
const tryAs = async (uid, sql, p) => { try { await as(uid, () => db.query(sql, p)); return null; } catch (e) { return e.message; } };
const one = async (uid, sql, p) => (await as(uid, () => q(sql, p)))[0];
const count = async (uid, t) => (await one(uid, `select count(*)::int n from public.${t}`)).n;

// The server's question bank and team defaults match the app's
const pairs = await q(`select i, a, b from public.hts_pairs() order by i`);
ok(pairs.length === 33 && pairs.every((r, i) => r.a === PAIRS[i][1] && r.b === PAIRS[i][3]), "server's 33 pairs match src/bank.js");
const def = (await q(`select public.hts_default_settings() s`))[0].s;
const canon = (v) => JSON.stringify(v, (k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort()) : x));
ok(canon(def.teams) === canon(DEFAULT_TEAMS), "server's default teams match src/bank.js");
ok(canon(def.commitments) === canon(DEFAULT_COMMITMENTS), "server's default commitments match src/bank.js");

const ADMIN = "11111111-1111-1111-1111-111111111111", TL2 = "22222222-2222-2222-2222-222222222222", TL = "33333333-3333-3333-3333-333333333333",
  PRAYTL = "44444444-4444-4444-4444-444444444444", OTHER = "55555555-5555-5555-5555-555555555555", STAFF = "66666666-6666-6666-6666-666666666666", ADMIN2 = "77777777-7777-7777-7777-777777777777";
await db.exec(`insert into auth.users values ('${ADMIN}','parker@p.com'), ('${TL2}','youth@p.com'), ('${TL}','kids@p.com'), ('${PRAYTL}','pray@p.com'), ('${OTHER}','x@other.org'), ('${STAFF}','staff@p.com'), ('${ADMIN2}','jess@p.com')`);

// Church and its three access levels
const cid = (await one(ADMIN, `select public.hts_create_church('Pinewood Church', 'Parker') as id`)).id;
ok(!!cid, "an Administrator creates a church");
const invite = async (uid, email, role, teams, prayer) => {
  const iid = (await one(ADMIN, `select public.hts_invite_staff($1, $2, $3, $4, $5) as id`, [cid, email, role, teams, prayer])).id;
  const tok = (await q(`select token from public.staff_invites where id=$1`, [iid]))[0].token;
  await as(uid, () => q(`select public.hts_accept_invite($1)`, [tok]));
};
await invite(STAFF, "staff@p.com", "staff", [], null);
await invite(TL, "kids@p.com", "team_lead", ["Kids"], null);
await invite(TL2, "youth@p.com", "team_lead", ["Youth", "Worship"], null);
await invite(PRAYTL, "pray@p.com", "team_lead", ["Prayer"], true);
const lvl = await q(`select user_id, role, teams, prayer from public.staff where church_id=$1`, [cid]);
const L_ = (u) => lvl.find((r) => r.user_id === u);
ok(lvl.length === 5, "four people join by email invite");
ok(L_(ADMIN).prayer && L_(STAFF).prayer && !L_(TL).prayer && L_(PRAYTL).prayer, "prayer access: on for Administrator and Staff, off for Team Leads unless given");
ok(L_(TL2).teams.slice().sort().join() === "Worship,Youth", "a Team Lead can lead more than one team");
ok(!!(await tryAs(ADMIN, `select public.hts_invite_staff($1, 'a@b.co', 'leader')`, [cid])), "only the three levels exist");
ok(!!(await tryAs(ADMIN, `select public.hts_invite_staff($1, 'a@b.co', 'team_lead', '{}')`, [cid])), "a Team Lead invite needs a team");
ok(!!(await tryAs(ADMIN, `select public.hts_invite_staff($1, 'a@b.co', 'team_lead', '{Choir}')`, [cid])), "a Team Lead's team must be on the list");
ok(!!(await tryAs(STAFF, `select public.hts_invite_staff($1, 'a@b.co', 'staff')`, [cid])), "Staff can't invite");
ok(!!(await tryAs(STAFF, `select public.hts_set_staff($1, $2, 'admin')`, [cid, STAFF])), "Staff can't change levels");
ok(!!(await tryAs(ADMIN, `select public.hts_set_staff($1, $2, 'staff')`, [cid, ADMIN])), "the last Administrator can't step down");
const oid = (await one(OTHER, `select public.hts_create_church('Other Church') as id`)).id;

// Classes
const klass = await one(STAFF, `insert into public.classes(church_id, name, created_by) values ($1, 'October class', $2) returning id, join_code`, [cid, STAFF]);
ok(!!klass.join_code && klass.join_code.length === 12, "Staff create a class with a join code");
ok(!!(await tryAs(TL, `insert into public.classes(church_id, name, created_by) values ($1, 'X', $2)`, [cid, TL])), "Team Leads can't create classes");
ok(!!(await tryAs(OTHER, `insert into public.classes(church_id, name, created_by) values ($1, 'X', $2)`, [cid, OTHER])), "another church can't add a class here");
ok((await count(TL, "classes")) === 0, "Team Leads don't see classes they aren't helping with");

// A member joins by the QR code and fills it out
const j = (await one(null, `select public.hts_join($1) j`, [klass.join_code])).j;
ok(j && j.key.length === 64 && j.church.name === "Pinewood Church" && j.church.teams.length === 9, "scanning the code gives a 64-character key and the church's look and teams");
ok((await one(null, `select public.hts_join('nope') j`)).j === null, "a made-up code does nothing");
const key = j.key;
const prefer = ["sh", "te", "he"];
const picks = PAIRS.map((p) => (prefer.includes(p[1]) && (!prefer.includes(p[3]) || prefer.indexOf(p[1]) < prefer.indexOf(p[3])) ? p[1] : prefer.includes(p[3]) ? p[3] : p[1]));
const answers = { name: "Daniel Brooks", email: "Daniel@b.com", phone: "555", faith: "Yes", bapt: "Not yet", group: "No", when: "Sundays", passions: ["Kids"], skills: ["Teaching"] };
ok((await one(null, `select public.hts_save($1, $2, $3, 3) r`, [key, { ...answers, adult: true, prayer: "Wisdom for a new job" }, JSON.stringify(picks.slice(0, 10))])).r === true, "saving mid-way works");
let opened = (await one(null, `select public.hts_open($1) o`, [key])).o;
ok(opened.member.step === 3 && opened.member.answers.name === "Daniel Brooks" && opened.member.picks.length === 10 && opened.member.prayer === "Wisdom for a new job", "reopening the link picks up where they left off");
ok(!("prayer" in opened.member.answers), "the prayer request is kept out of the answers");

// Interview mode: a Team Lead assigned to this class sees its people while it's open
ok(!!(await tryAs(TL, `select public.hts_set_class_leader($1, $2, true)`, [klass.id, TL])), "a Team Lead can't assign themselves to a class");
await as(STAFF, () => q(`select public.hts_set_class_leader($1, $2, true)`, [klass.id, TL]));
ok((await count(TL, "classes")) === 1 && (await count(TL, "members")) === 1, "the assigned Team Lead sees this class and its people");
ok((await count(TL2, "members")) === 0, "a Team Lead not on the class sees no one");

ok(!!(await tryAs(null, `select public.hts_submit($1, $2, $3, 'joining', '[]')`, [key, answers, JSON.stringify(picks.slice(0, 10))])), "can't submit before all 33 gift questions");
ok(!!(await tryAs(null, `select public.hts_submit($1, $2, $3, 'joining', '["faith"]')`, [key, answers, JSON.stringify(picks)])), "joining needs every commitment checked");
const allK = JSON.stringify(DEFAULT_COMMITMENTS.map((c) => c.k));
answers.faith = "Not sure";
ok(/comes first/.test((await tryAs(null, `select public.hts_submit($1, $2, $3, 'joining', $4)`, [key, answers, JSON.stringify(picks), allK])) || ""), "someone not sure about faith can't choose to join; they're pointed to not ready yet");
answers.faith = "Yes";
answers.bapt = "Yes";
ok((await one(null, `select public.hts_submit($1, $2, $3, 'joining', $4) r`, [key, answers, JSON.stringify(picks), allK])).r === true, "joining with all 8 commitments submits");
const m = (await q(`select * from public.members where key=$1`, [key]))[0];
ok(Object.keys(m.commitments).length === 8 && m.decision === "joining" && m.status === "submitted", "commitments saved with a time each");
ok(m.email === "daniel@b.com", "email stored in lower case");
ok((await q(`select count(*)::int n from public.notify_queue where member_id=$1 and kind='submitted'`, [m.id]))[0].n === 1, "a submission queues a staff phone notification");

// Server and app agree on the scoring
const sc = countGifts(picks);
ok(JSON.stringify(Object.fromEntries(Object.entries(m.scores).sort())) === JSON.stringify(Object.fromEntries(Object.entries(sc).sort())), "server's gift counts match the app's");
ok(m.top_gifts.join() === topGifts(sc, answers.passions).map((g) => g.key).join(), "server's top 3 match the app's");
ok(m.rec_teams.join() === recommendTeams(sc, [...answers.passions, ...answers.skills], DEFAULT_TEAMS).map((t) => t.name).join(), "server's team matches agree with the app's");
const steps = await q(`select kind from public.next_steps where member_id=$1 order by created_at, kind`, [m.id]);
const want = staffSteps(answers, "joining", m.rec_teams, DEFAULT_TEAMS).map((s) => s.kind).sort();
ok(JSON.stringify(steps.map((s) => s.kind).sort()) === JSON.stringify(want) && want.join() === "approve,group", "on submit: approval and a group, matching the app; no team steps until approved");
opened = (await one(null, `select public.hts_open($1) o`, [key])).o;
ok(opened.member.topGifts.length === 3 && opened.member.recTeams.length === 2 && Object.keys(opened.member.commitments).length === 8 && opened.member.approved === false, "after submitting, their link shows their own gifts, teams and commitments");
ok((await as(TL, () => q(`select * from public.hts_handoff($1)`, [cid]))).length === 0, "nobody is handed to a team before a pastor approves");
ok(!!(await tryAs(TL, `select public.hts_approve($1, true)`, [m.id])), "a Team Lead can't approve someone joining");
await as(ADMIN, () => q(`update public.churches set settings = settings || jsonb_build_object('stepOwners', jsonb_build_object('check', $2::text, 'approve', $2::text)) where id = $1`, [cid, STAFF]));
await as(STAFF, () => q(`select public.hts_approve($1, false, 'Wants to talk about baptism first')`, [m.id]));
let mm = (await q(`select held_at, approved_at, hold_note from public.members where id=$1`, [m.id]))[0];
ok(mm.held_at && !mm.approved_at && mm.hold_note === "Wants to talk about baptism first" && (await q(`select owner_user from public.next_steps where member_id=$1 and kind='hold' and done_at is null`, [m.id]))[0].owner_user === STAFF, "a pastor can put joining on hold with a private note and a follow-up step");
await as(STAFF, () => q(`select public.hts_approve($1, true)`, [m.id]));
const st2 = await q(`select kind, owner_user, done_at from public.next_steps where member_id=$1`, [m.id]);
ok(st2.find((x) => x.kind === "check" && !x.done_at)?.owner_user === STAFF && st2.find((x) => x.kind === "team" && !x.done_at)?.owner_user === TL && st2.every((x) => !["approve", "hold"].includes(x.kind) || x.done_at), "approving creates the background check (owned by the person picked in Settings) and the intro (owned by the Kids lead)");
ok((await q(`select count(*)::int n from public.notify_queue where member_id=$1 and kind='handoff'`, [m.id]))[0].n === 1, "approving tells the team lead's phone");
ok((await one(null, `select public.hts_save($1, '{}', '[]', 1) r`, [key])).r === false, "a submitted form can't be changed from the link");
opened = (await one(null, `select public.hts_open($1) o`, [key])).o;
ok(opened.member.prayer === null, "after submitting, the link no longer shows the prayer request");

// A second member: not ready
const j2 = (await one(null, `select public.hts_join($1) j`, [klass.join_code])).j;
const a2 = { name: "Hannah Kim", faith: "Yes", bapt: "Yes", group: "Yes", when: "Midweek", passions: [], skills: [] };
ok(!!(await tryAs(null, `select public.hts_submit($1, $2, $3, 'not_ready', '[]')`, [j2.key, a2, JSON.stringify(PAIRS.map((p) => p[3]))])), "can't submit without confirming 18+");
await one(null, `select public.hts_save($1, $2, '[]', 1)`, [j2.key, { ...a2, adult: true }]);
ok((await one(null, `select public.hts_submit($1, $2, $3, 'not_ready', '[]') r`, [j2.key, a2, JSON.stringify(PAIRS.map((p) => p[3]))])).r === true, "not ready to join submits without commitments");
const m2 = (await q(`select id, commitments from public.members where key=$1`, [j2.key]))[0];
ok(Object.keys(m2.commitments).length === 0 && (await q(`select count(*)::int n from public.next_steps where member_id=$1 and kind in ('followup', 'invite')`, [m2.id]))[0].n === 2, "not ready gets a follow-up, an invite to the next class, and no commitments");
ok(!!(await tryAs(STAFF, `select public.hts_approve($1, true)`, [m2.id])), "only people who chose to join can be approved");
await as(STAFF, () => q(`select public.hts_set_interviewer($1, $2)`, [m2.id, PRAYTL]));
ok((await q(`select interviewer from public.members where id=$1`, [m2.id]))[0].interviewer === PRAYTL && (await count(PRAYTL, "members")) >= 1, "the host pairs someone with a one-on-one leader, who can then see that class");
ok(!!(await tryAs(TL, `select public.hts_set_interviewer($1, $2)`, [m2.id, TL])), "Team Leads can't make pairings");
await as(STAFF, () => q(`select public.hts_set_interviewer($1, null)`, [m2.id]));
await as(STAFF, () => q(`select public.hts_set_class_leader($1, $2, false)`, [klass.id, PRAYTL]));

// Who sees what, level by level
ok((await count(ADMIN, "members")) === 2 && (await count(STAFF, "members")) === 2, "Administrator and Staff see everyone");
ok((await count(PRAYTL, "members")) === 0, "a Team Lead outside the class sees no one's record");
ok((await count(OTHER, "members")) === 0 && (await count(OTHER, "next_steps")) === 0 && (await count(OTHER, "prayer_requests")) === 0, "another church sees nothing of ours");
{ let n = 0, err = null; try { n = await count(null, "members"); } catch (e) { err = e; } ok(err || n === 0, "visitors can't list people, even with the class code"); }
ok((await count(ADMIN, "prayer_requests")) === 1 && (await count(STAFF, "prayer_requests")) === 1 && (await count(PRAYTL, "prayer_requests")) === 1, "Administrator, Staff and a Team Lead with prayer access see prayer requests");
ok((await count(TL, "prayer_requests")) === 0 && (await count(TL2, "prayer_requests")) === 0, "Team Leads without prayer access never see them, even while interviewing");
ok((await q(`select who from public.prayer_requests`))[0].who === "Daniel B.", "prayer list shows first name and last initial");
await as(ADMIN, () => q(`select public.hts_set_staff($1, $2, 'staff', null, false)`, [cid, STAFF]));
ok((await count(STAFF, "prayer_requests")) === 0, "an Administrator can turn prayer access off for anyone");
await as(ADMIN, () => q(`select public.hts_set_staff($1, $2, 'staff', null, true)`, [cid, STAFF]));
ok((await count(TL, "connections")) === 0 && (await count(ADMIN, "connections")) === 0, "nobody, not even an Administrator, can read connection credentials");

// Handoff: Team Leads see only their own teams
const hk = await as(TL, () => q(`select * from public.hts_handoff($1)`, [cid]));
ok(hk.length === 1 && hk[0].name === "Daniel Brooks" && hk[0].team === "Kids" && !("prayer" in hk[0]), "the Kids lead sees only people headed to Kids, with no notes or prayer");
ok((await as(TL2, () => q(`select * from public.hts_handoff($1)`, [cid]))).length === 0, "the Youth and Worship lead doesn't see Kids people");
ok((await as(STAFF, () => q(`select * from public.hts_handoff($1)`, [cid]))).length === 1, "Staff see every team's handoff");
ok((await as(OTHER, () => q(`select * from public.hts_handoff($1)`, [cid]))).length === 0, "another church's lead sees no handoffs here");
ok((await as(TL, () => q(`select * from public.hts_handoff($1)`, [cid])))[0].check_pending === true, "the Kids lead sees the background check is still pending");
ok(/background check/.test((await tryAs(TL, `select public.hts_set_first_sunday($1, '2026-11-01')`, [m.id])) || ""), "no first Sunday on a background-check team until the check is done");
await as(STAFF, () => q(`update public.next_steps set done_at = now() where member_id=$1 and kind='check'`, [m.id]));
ok(!(await tryAs(TL, `select public.hts_set_first_sunday($1, '2026-11-01')`, [m.id])), "the Kids lead schedules Daniel's first Sunday");
ok((await q(`select done_at from public.next_steps where member_id=$1 and kind='team'`, [m.id]))[0].done_at !== null, "scheduling a first Sunday checks off the team intro");
ok(!!(await tryAs(TL2, `select public.hts_set_first_sunday($1, '2026-11-01')`, [m.id])), "another team's lead can't schedule him");
ok((await one(TL, `select public.hts_snapshot($1) s`, [cid])).s === null, "Team Leads don't get the church snapshot");
const snap = (await one(STAFF, `select public.hts_snapshot($1) s`, [cid])).s;
ok(snap.people === 1 && snap.gifts.sh === 1 && snap.teams.find((t) => t.name === "Kids").serving === 1, "the snapshot counts gifts and who's serving, with no names");

// Interview mode edits and notes
ok(!(await tryAs(TL, `select public.hts_member_edit($1, 'Kids', array['sh','te'])`, [m.id])), "the class's interviewing Team Lead adjusts gifts and team");
await as(STAFF, () => q(`select public.hts_member_edit($1, 'Youth', null)`, [m.id]));
const yst = await q(`select title, owner_user from public.next_steps where member_id=$1 and kind='team' and done_at is null`, [m.id]);
ok(yst.length === 1 && yst[0].title === "Introduce to the Youth team lead" && yst[0].owner_user === TL2 && (await q(`select count(*)::int n from public.next_steps where member_id=$1 and kind='check' and done_at is null`, [m.id]))[0].n === 0, "changing the team redoes the intro for the new team's lead, and a finished background check still counts");
await as(STAFF, () => q(`select public.hts_member_edit($1, 'Kids', array['sh','te'])`, [m.id]));
ok(!!(await tryAs(TL2, `select public.hts_member_edit($1, 'Youth', null)`, [m.id])), "a Team Lead not on the class can't");
ok(!!(await tryAs(STAFF, `select public.hts_member_edit($1, 'Choir', null)`, [m.id])), "a team that isn't on the list is refused");
ok(!!(await tryAs(OTHER, `select public.hts_add_note($1, 'x')`, [m.id])), "another church can't add notes");
await as(TL, () => q(`select public.hts_add_note($1, 'Teacher by trade. Great with 4th and 5th grade.')`, [m.id]));
ok((await count(STAFF, "notes")) === 1 && (await count(TL, "notes")) === 1 && (await count(TL2, "notes")) === 0, "notes stay with Staff, Administrators and the class's interviewer");
ok(!!(await tryAs(ADMIN, `update public.members set answers='{"x":1}' where id=$1`, [m.id])) || (await q(`select answers from public.members where id=$1`, [m.id]))[0].answers.x === undefined, "nobody edits a member's answers directly");

// Next steps checklist
const st = (await q(`select id from public.next_steps where member_id=$1 and kind='group'`, [m.id]))[0].id;
ok(!(await tryAs(STAFF, `update public.next_steps set owner_user=$2 where id=$1`, [st, TL])), "Staff assign a step to a Team Lead");
ok(!!(await tryAs(STAFF, `update public.next_steps set owner_user=$2 where id=$1`, [st, OTHER])), "a step's owner must be on the team");
ok((await count(TL2, "next_steps")) === 0 && (await as(TL, () => q(`select count(*)::int n from public.next_steps where id=$1`, [st])))[0].n === 1, "a Team Lead sees the steps assigned to them");
ok(!(await tryAs(TL, `update public.next_steps set done_at=now() where id=$1`, [st])), "a Team Lead marks their own step done");
ok(!!(await tryAs(TL, `update public.next_steps set due='2030-01-01' where id=$1`, [st])), "but can't change its date or owner");
const other = (await as(STAFF, () => q(`insert into public.next_steps(church_id, member_id, kind, title) values ($1, $2, 'custom', 'Coffee with Daniel') returning id`, [cid, m.id])))[0].id;
await tryAs(TL, `update public.next_steps set done_at=now() where id=$1`, [other]);
ok((await q(`select done_at from public.next_steps where id=$1`, [other]))[0].done_at === null, "or touch steps that aren't theirs");
ok(!!(await tryAs(OTHER, `insert into public.next_steps(church_id, member_id, kind, title) values ($1, $2, 'x', 'x')`, [oid, m.id])), "a step can't point at another church's person");
ok(!(await tryAs(PRAYTL, `update public.prayer_requests set prayed_at=now()`)), "the prayer team marks a request as prayed for");
ok(!!(await tryAs(PRAYTL, `update public.prayer_requests set body='changed'`)), "nobody rewrites a prayer request");
ok((await q(`select public.hts_queue_overdue() n`))[0].n === 0, "nothing overdue yet");
await q(`update public.next_steps set due = current_date - 1 where member_id=$1 and done_at is null`, [m2.id]);
ok((await q(`select public.hts_queue_overdue() n`))[0].n === 2 && (await q(`select public.hts_queue_overdue() n`))[0].n === 0, "each overdue step notifies once");
ok(!!(await tryAs(STAFF, `select public.hts_queue_overdue()`)), "only the server runs the overdue check");

// Settings: Administrators only
ok(!!(await tryAs(STAFF, `update public.churches set name='X' where id=$1`, [cid])) || (await q(`select name from public.churches where id=$1`, [cid]))[0].name === "Pinewood Church", "Staff can't change church settings");
ok(!(await tryAs(ADMIN, `update public.churches set accent='#123456', logo_url='https://pinewood.church/logo.png' where id=$1`, [cid])), "an Administrator sets the logo and color");
ok(!!(await tryAs(ADMIN, `update public.churches set accent='red' where id=$1`, [cid])), "accent must be a hex color");
ok(!!(await tryAs(ADMIN, `update public.classes set join_code='abc' where church_id=$1`, [cid])), "class codes can't be changed by hand");

// Spreadsheets: export (Administrator and Staff) and roster import (Administrator)
const exp = await as(STAFF, () => q(`select * from public.hts_export_people($1)`, [cid]));
const dan = exp.find((r) => r.email === "daniel@b.com");
ok(exp.length === 2 && dan.first_name === "Daniel" && dan.last_name === "Brooks" && dan.membership_status === "Joined" && dan.gift_1 && Number.isInteger(dan.gift_1_score) && /Coffee with Daniel/.test(dan.open_next_steps || "") && !/Baptism/.test(dan.open_next_steps || ""), "Staff export people with names split, status, gifts with scores and open steps");
ok(!("prayer" in dan) && !Object.values(dan).some((v) => String(v).includes("Wisdom for a new job")), "exports never include prayer requests");
ok((await as(ADMIN, () => q(`select * from public.hts_export_people($1, 'not_ready')`, [cid]))).length === 1, "export filtered to not ready");
ok((await as(ADMIN, () => q(`select * from public.hts_export_people($1, 'all', $2)`, [cid, klass.id]))).length === 2, "export filtered to one class");
ok(!!(await tryAs(TL, `select * from public.hts_export_people($1)`, [cid])), "Team Leads can't export");
ok(!!(await tryAs(OTHER, `select * from public.hts_export_people($1)`, [cid])), "another church can't export ours");
ok((await as(STAFF, () => q(`select * from public.hts_export_steps($1)`, [cid]))).length >= 2 && !!(await tryAs(TL, `select * from public.hts_export_steps($1)`, [cid])), "Staff export next steps; Team Leads can't");
const rows = [{ email: "daniel@b.com", team: "Kids Check-in" }, { name: "Pat Volunteer", team: "Kids Check-in" }, { email: "x@y.org", team: "kids" }, { email: "bad", team: "Kids" }, { name: "No Team" }, { email: "daniel@b.com", team: "Kids Check-in" }, { name: "Sam Band", team: "Band" }];
ok(!!(await tryAs(STAFF, `select public.hts_import_roster($1, $2)`, [cid, JSON.stringify(rows)])), "Staff can't import");
const pv = (await one(ADMIN, `select public.hts_import_roster($1, $2, $3) r`, [cid, JSON.stringify(rows), JSON.stringify({ "Kids Check-in": "Kids" })])).r;
ok(pv.saved === false && pv.rows === 7 && pv.skipped.length === 2 && pv.teams["Kids Check-in"].people === 2 && pv.teams.kids.htsTeam === "Kids" && pv.unmatchedTeams.join() === "Band", "the preview matches teams, finds bad rows and unmatched teams, and counts a repeat once");
ok(pv.matchedPeople === 1 && pv.counted === 3, "the preview says who took the class here and how many will count");
ok((await q(`select count(*)::int n from public.rosters where church_id=$1`, [cid]))[0].n === 0, "the preview saves nothing");
ok(!!(await tryAs(ADMIN, `select public.hts_import_roster($1, $2, $3, true)`, [cid, JSON.stringify(rows), JSON.stringify({ Band: "Choir" })])), "a team that isn't on the list is refused");
await as(ADMIN, () => q(`select public.hts_import_roster($1, $2, $3, true)`, [cid, JSON.stringify(rows), JSON.stringify({ "Kids Check-in": "Kids" })]));
let snapK = (await one(STAFF, `select public.hts_snapshot($1) s`, [cid])).s;
ok(snapK.source === "csv" && snapK.teams.find((t) => t.name === "Kids").serving === 3 && snapK.teams.find((t) => t.name === "Kids").fromSource, "after import, 'serving now' for Kids comes from the spreadsheet (3 people)");
ok((await q(`select member_id from public.rosters where person_key='daniel@b.com'`))[0].member_id === m.id, "imported rows are linked to people who took the class");
await as(ADMIN, () => q(`select public.hts_set_map($1, 'csv', 'band', 'Worship')`, [cid]));
ok((await one(STAFF, `select public.hts_snapshot($1) s`, [cid])).s.teams.find((t) => t.name === "Worship").serving === 1, "matching an unmatched team afterwards counts it");
await as(ADMIN, () => q(`select public.hts_import_roster($1, $2, '{}', true)`, [cid, JSON.stringify([{ email: "solo@x.org", team: "Kids" }])]));
ok((await q(`select count(*)::int n from public.rosters where church_id=$1`, [cid]))[0].n === 1, "a new import replaces the last one");
ok((await count(TL, "rosters")) === 0, "Team Leads don't see rosters");

// Connections: one system at a time, credentials never readable
ok(!!(await tryAs(STAFF, `select public.hts_connect_begin($1)`, [cid])), "only Administrators connect a people system");
const state = (await one(ADMIN, `select public.hts_connect_begin($1) s`, [cid])).s;
ok(state && state.length === 64, "connect starts with a one-time state code");
ok((await count(ADMIN, "oauth_states")) === 0, "state codes aren't readable from the browser");
await q(`insert into public.connections(church_id, system, subdomain, api_key, org_name) values ($1, 'breeze', 'pinewood', 'SECRETKEY', 'Pinewood')`, [cid]);
ok(!!(await tryAs(ADMIN, `select public.hts_connect_begin($1)`, [cid])), "can't start Planning Center while Breeze is connected");
await as(ADMIN, () => q(`select public.hts_member_edit($1, 'Kids', array['sh'])`, [m.id]));
ok((await q(`select count(*)::int n from public.sync_queue where member_id=$1`, [m.id]))[0].n === 1, "a leader's change queues the person for the connected system");
const cst = (await one(STAFF, `select public.hts_conn_status($1) s`, [cid])).s;
ok(cst.connected && cst.system === "breeze" && cst.orgName === "Pinewood" && !JSON.stringify(cst).includes("SECRETKEY"), "status shows Breeze is connected without ever sending the key");
await q(`insert into public.team_map(church_id, source, ext_team_id, ext_team_name) values ($1, 'breeze', '42', 'Volunteers › Kids')`, [cid]);
await q(`insert into public.rosters(church_id, source, ext_team_id, person_key, name) values ($1, 'breeze', '42', 'p1', 'A'), ($1, 'breeze', '42', 'p2', 'B'), ($1, 'breeze', '42', 'p3', 'C'), ($1, 'breeze', '42', 'p4', 'D')`, [cid]);
ok(!!(await tryAs(STAFF, `select public.hts_set_map($1, 'breeze', '42', 'Kids')`, [cid])), "Staff can't match teams");
await as(ADMIN, () => q(`select public.hts_set_map($1, 'breeze', '42', 'Kids')`, [cid]));
snapK = (await one(STAFF, `select public.hts_snapshot($1) s`, [cid])).s;
ok(snapK.source === "breeze" && snapK.teams.find((t) => t.name === "Kids").serving === 4, "while Breeze is connected, 'serving now' comes from its roster, not the spreadsheet");
await as(ADMIN, () => q(`select public.hts_disconnect($1)`, [cid]));
ok((await q(`select count(*)::int n from public.connections where church_id=$1`, [cid]))[0].n === 0, "disconnect removes the credentials");
ok((await one(STAFF, `select public.hts_snapshot($1) s`, [cid])).s.source === "csv", "after disconnecting, counts fall back to the spreadsheet import");
await q(`insert into public.connections(church_id, system, access_token, refresh_token, expires_at) values ($1, 'pco', 'AT', 'RT', now())`, [cid]);
ok((await one(STAFF, `select public.hts_conn_status($1) s`, [cid])).s.system === "pco", "Planning Center shows as the connected system");
await as(ADMIN, () => q(`select public.hts_disconnect($1)`, [cid]));

// Devices and account deletion
ok(!(await tryAs(TL, `select public.hts_register_device($1, 'ios')`, ["t".repeat(64)])), "a staff phone registers for notifications");
ok((await count(TL, "devices")) === 1 && (await count(STAFF, "devices")) === 0, "each person sees only their own devices");
ok(!!(await tryAs(ADMIN, `select public.hts_delete_my_account()`)), "the only Administrator of a church with a team can't delete their account");
await as(TL, () => q(`select public.hts_delete_my_account()`));
ok((await q(`select count(*)::int n from auth.users where id=$1`, [TL]))[0].n === 0 && (await q(`select count(*)::int n from public.staff where user_id=$1`, [TL]))[0].n === 0 && (await q(`select count(*)::int n from public.devices where user_id=$1`, [TL]))[0].n === 0, "a Team Lead deletes their account; their access and devices go with it");
const solo = (await one(OTHER, `select public.hts_delete_my_account() r`)).r;
ok(solo.churchesDeleted === 1 && (await q(`select count(*)::int n from public.churches where id=$1`, [oid]))[0].n === 0, "a church's only person deleting their account deletes that church too");

await as(ADMIN, () => q(`update public.classes set open=false where church_id=$1`, [cid]));
ok((await one(null, `select public.hts_join($1) j`, [klass.join_code])).j === null, "a closed class stops taking new people");
ok((await one(ADMIN, `select public.hts_platform_stats() s`)).s === null, "platform counts are only for platform admins");
await as(ADMIN, () => q(`delete from public.members where id=$1`, [m2.id]));
ok((await q(`select count(*)::int n from public.next_steps where member_id=$1`, [m2.id]))[0].n === 0, "an Administrator deletes a person's data on request, steps go too");
ok(!!(await tryAs(STAFF, `delete from public.members where id=$1`, [m.id])) || (await q(`select count(*)::int n from public.members where id=$1`, [m.id]))[0].n === 1, "only Administrators delete people");

process.exit(failed ? 1 : 0);
