// Breeze sync logic against a fake Breeze (no network).
import { makeClient, ensureSetup, pushMember, pullTeams, test, contactOf, wantedTags } from "../supabase/functions/_shared/breeze.js";
import { base, FOLDER_NAME, SUBDOMAIN_RE } from "../supabase/functions/_shared/breeze-constants.js";
import { CONNECTORS } from "../supabase/functions/_shared/connectors.js";

let fail = 0;
const ok = (c, m) => { console.log(c ? "ok -" : "FAIL -", m); if (!c) fail++; };
const res = (status, body, headers = {}) => ({ status, ok: status >= 200 && status < 300, headers: { get: (k) => headers[k] ?? null }, json: async () => body });

function fakeBreeze({ noteRoute = true } = {}) {
  const db = {
    people: [
      { id: "11", first_name: "Daniel", last_name: "Brooks", details: { "2001": [{ address: "daniel@b.com", is_primary: 1 }], "2002": [{ phone_mobile: "(555) 123-4567" }] } },
      { id: "12", first_name: "Pat", last_name: "Volunteer", details: {} },
    ],
    folders: [{ id: "f1", name: "Volunteers" }],
    tags: { f1: [{ id: "t1", name: "Kids" }, { id: "t2", name: "Band" }] },
    assigned: { t1: ["11", "12"], t2: ["12"] },
    notes: [], keySeen: [],
  };
  let n = 500;
  const handler = async (url, init) => {
    db.keySeen.push(init.headers["Api-Key"]);
    if (init.headers["Api-Key"] !== "GOOD") return res(401, {});
    const u = new URL(url), p = u.pathname.replace(/^\/api/, ""), g = (k) => u.searchParams.get(k);
    if (p === "/account/summary") return res(200, { name: "Pinewood Church" });
    if (p === "/profile") return res(200, [{ name: "Contact", fields: [{ field_id: "2001", field_type: "email", name: "Email" }, { field_id: "2002", field_type: "phone", name: "Phone" }] }]);
    if (p === "/people") {
      const off = Number(g("offset") || 0), lim = Number(g("limit") || 1000);
      let list = db.people;
      const f = g("filter_json"); if (f) { const tag = JSON.parse(f).tag_contains.slice(2); list = list.filter((x) => (db.assigned[tag] || []).includes(x.id)); }
      return res(200, list.slice(off, off + lim));
    }
    if (p.startsWith("/people/") && !["/people/add", "/people/update", "/people/add_note"].includes(p)) { const x = db.people.find((y) => y.id === p.split("/")[2]); return x ? res(200, x) : res(404, {}); }
    if (p === "/people/add") { const x = { id: String(n++), first_name: g("first"), last_name: g("last"), details: Object.fromEntries((JSON.parse(g("fields_json") || "[]")).map((f) => [f.field_id, [f.details]])) }; db.people.push(x); return res(200, x); }
    if (p === "/people/add_note") { if (!noteRoute) return res(404, {}); db.notes.push({ person: g("person_id"), note: g("note") }); return res(200, { success: true }); }
    if (p === "/tags/list_folders") return res(200, db.folders);
    if (p === "/tags/add_folder") { const x = { id: "f" + n++, name: g("name") }; db.folders.push(x); db.tags[x.id] = []; return res(200, x); }
    if (p === "/tags/list_tags") return res(200, db.tags[g("folder_id")] || []);
    if (p === "/tags/add_tag") { const x = { id: "t" + n++, name: g("name") }; db.tags[g("folder_id")].push(x); return res(200, x); }
    if (p === "/tags/assign") { (db.assigned[g("tag_id")] ||= []).push(g("person_id")); return res(200, true); }
    if (p === "/tags/unassign") { db.assigned[g("tag_id")] = (db.assigned[g("tag_id")] || []).filter((x) => x !== g("person_id")); return res(200, true); }
    return res(404, {});
  };
  return { db, handler };
}
const noWait = async () => {};
const client = (fake, key = "GOOD", extra = {}) => makeClient({ subdomain: "pinewood", api_key: key }, { fetch: fake.handler, sleep: noWait, pace: noWait, ...extra });
const tagNames = (db, pid) => Object.entries(db.assigned).filter(([, ps]) => ps.includes(pid)).map(([tid]) => Object.values(db.tags).flat().find((t) => t.id === tid)?.name).sort();

ok(base("pinewood") === "https://pinewood.breezechms.com/api", "each church's Breeze address comes from its subdomain");
ok(SUBDOMAIN_RE.test("pinewood") && !SUBDOMAIN_RE.test("evil.com/x") && !SUBDOMAIN_RE.test("-bad"), "only a plain subdomain is accepted");
ok(contactOf({ details: { a: [{ address: "X@Y.org" }], b: { phone_home: "555.123.4567 ext" } } }).emails[0] === "x@y.org", "emails are found wherever Breeze keeps them");
ok(CONNECTORS.breeze.label === "Breeze" && CONNECTORS.pco.label === "Planning Center" && typeof CONNECTORS.breeze.push === "function", "both systems sit behind the same interface");

{
  const fake = fakeBreeze();
  let err = null; try { await test(client(fake, "WRONG")); } catch (e) { err = e; }
  ok(err && err.status === 401 && /API key/.test(err.message), "a wrong API key gives a plain message");
  ok((await test(client(fake))).orgName === "Pinewood Church", "test connection reads the church's name");
}

const member = { name: "Daniel Brooks", email: "daniel@b.com", phone: "555-123-4567", top_gifts: ["sh", "te", "he"], rec_teams: ["Kids"], decision: "joining", submitted_at: "2026-10-23T15:00:00Z", approved_at: "2026-10-24T15:00:00Z", commitments: { faith: "x" } };
ok(wantedTags(member).join() === "Member,Gift: Shepherding,Gift: Teaching,Gift: Helps,Team: Kids", "tags: membership, top gifts and team");
ok(!wantedTags({ ...member, approved_at: null }).includes("Member"), "no Member tag until a pastor approves");
{
  const fake = fakeBreeze(); const c = client(fake);
  const ids = await ensureSetup(c, {});
  ok(fake.db.folders.some((f) => f.name === FOLDER_NAME) && ids.folder, "first sync creates the Here To Serve tag folder");
  ok((await ensureSetup(c, {})).folder === ids.folder && fake.db.folders.filter((f) => f.name === FOLDER_NAME).length === 1, "running setup again finds it instead of making another");
  const r1 = await pushMember(c, ids, member, [{ k: "faith", word: "Faith" }], {});
  ok(r1.personId === "11" && fake.db.people.length === 2, "found by email: no duplicate person");
  ok(tagNames(fake.db, "11").join() === "Gift: Helps,Gift: Shepherding,Gift: Teaching,Kids,Member,Team: Kids", "tags assigned in the Here To Serve folder");
  ok(fake.db.notes.length === 1 && /2026-10-23.*Faith.*approved to join on 2026-10-24/.test(fake.db.notes[0].note), "a note with the decision and commitments");
  const r2 = await pushMember(c, ids, { ...member, ext_system: "breeze", ext_person_id: "11", team: "Security", gifts_override: ["le", "he"] }, [], r1.state);
  ok(tagNames(fake.db, "11").join() === "Gift: Helps,Gift: Leadership,Kids,Member,Team: Security", "a leader's change swaps only the tags that changed");
  ok(fake.db.notes.length === 1, "the note isn't repeated for the same decision");
  const r3 = await pushMember(c, ids, { name: "Ann New", email: "ann@new.org", phone: "555-999-0000", top_gifts: ["ho"], decision: "not_ready", submitted_at: "2026-10-23" }, [], {});
  const ann = fake.db.people.find((p) => p.id === r3.personId);
  ok(ann && ann.first_name === "Ann" && contactOf(ann).emails[0] === "ann@new.org", "someone new is created with their email");
  ok(tagNames(fake.db, r3.personId).includes("Not ready yet"), "not ready gets its own tag");
  const byPhone = await pushMember(c, ids, { name: "Daniel Brooks", phone: "(555) 123 4567", top_gifts: [], decision: null }, [], {});
  ok(byPhone.personId === "11", "found by name + phone when there's no email");
}
{
  const fake = fakeBreeze({ noteRoute: false }); const c = client(fake);
  const ids = await ensureSetup(c, {});
  const r = await pushMember(c, ids, member, [], {});
  ok(r.personId === "11" && r.state.noted === null && r.noteError, "if Breeze has no notes route, the sync carries on with the tags");
}
{
  const fake = fakeBreeze(); const c = client(fake);
  const ids = await ensureSetup(c, {});
  const first = await pullTeams(c, { mapped: [], ids });
  ok(first.teams.map((t) => t.name).join() === "Volunteers › Kids,Volunteers › Band" && first.roster.length === 0, "first pull lists tags as teams (not the Here To Serve folder) without fetching people");
  const mapped = await pullTeams(c, { mapped: ["t1"], ids });
  ok(mapped.roster.length === 2 && mapped.roster.every((r) => r.teamId === "t1"), "only matched tags fetch their people");
}
{
  const many = { people: Array.from({ length: 2300 }, (_, i) => ({ id: String(i) })) };
  let calls = 0;
  const f = async (url) => { calls++; const u = new URL(url); const off = Number(u.searchParams.get("offset")); return res(200, many.people.slice(off, off + 1000)); };
  const c = makeClient({ subdomain: "x", api_key: "k" }, { fetch: f, sleep: noWait, pace: noWait });
  ok((await c.all((o) => `/people?limit=1000&offset=${o}`)).length === 2300 && calls === 3, "paging: 2,300 people take 3 requests");
}
{
  const waits = []; let tries = 0;
  const f = async () => { tries++; return tries < 3 ? res(429, {}, tries === 1 ? { "Retry-After": "12" } : {}) : res(200, { name: "x" }); };
  const c = makeClient({ subdomain: "x", api_key: "k" }, { fetch: f, sleep: async (ms) => waits.push(ms), pace: noWait });
  await c.get("/account/summary");
  ok(tries === 3 && waits.join() === "12000,10000", "a 429 waits Retry-After, or backs off 5s, 10s, ...");
}
{
  const f = async () => res(200, { success: false, errors: "Invalid tag" });
  const c = makeClient({ subdomain: "x", api_key: "k" }, { fetch: f, sleep: noWait, pace: noWait });
  let err = null; try { await c.get("/tags/assign"); } catch (e) { err = e; }
  ok(err && /Invalid tag/.test(err.message), "an error Breeze reports inside a 200 is caught");
}
process.exit(fail ? 1 : 0);
