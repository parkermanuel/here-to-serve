// Planning Center sync logic against a fake Planning Center (no network).
import { makeClient, makePacer, ensureSetup, pushMember, pullTeams, fieldValues, splitName, findPerson } from "../supabase/functions/_shared/pco.js";
import { PCO_HOST, TOKEN_URL, FIELDS, TAB_NAME } from "../supabase/functions/_shared/pco-constants.js";
import { apnsToken } from "../supabase/functions/_shared/apns.js";
import { webcrypto } from "crypto";

let fail = 0;
const ok = (c, m) => { console.log(c ? "ok -" : "FAIL -", m); if (!c) fail++; };
const res = (status, body, headers = {}) => ({ status, ok: status >= 200 && status < 300, headers: { get: (k) => headers[k] ?? null }, json: async () => body });
const soon = () => new Date(Date.now() + 3600_000).toISOString();

// ---------- a tiny fake Planning Center ----------
function fakePco() {
  const db = { people: [], emails: [], phones: [], tabs: [], defs: [], data: [], cats: [], notes: [], teams: [{ id: "t1", name: "Kids Check-in" }, { id: "t2", name: "Band" }], teamPeople: { t1: ["P-a", "P-b", "P-c"], t2: ["P-d"] } };
  let n = 100;
  const id = () => String(n++);
  const log = [];
  const handler = async (url, init = {}) => {
    const method = init.method || "GET";
    const body = init.body ? JSON.parse(init.body) : null;
    log.push(`${method} ${url.replace(PCO_HOST, "")}`);
    if (url === TOKEN_URL) return res(200, { access_token: "AT2", refresh_token: "RT2", expires_in: 7200 });
    const u = new URL(url), p = u.pathname;
    const page = (items, size = 2) => { const off = Number(u.searchParams.get("offset") || 0); const next = off + size < items.length ? `${PCO_HOST}${p}?offset=${off + size}` : null; return res(200, { data: items.slice(off, off + size), links: next ? { next } : {} }); };
    if (p === "/people/v2/people" && method === "GET") {
      const q = (u.searchParams.get("where[search_name_or_email]") || "").toLowerCase();
      const hits = db.people.filter((x) => (x.attributes.first_name + " " + x.attributes.last_name).toLowerCase().includes(q) || db.emails.some((e) => e.person === x.id && e.attributes.address.toLowerCase() === q));
      return res(200, { data: hits.map((x) => ({ ...x, relationships: { emails: { data: db.emails.filter((e) => e.person === x.id).map((e) => ({ id: e.id })) }, phone_numbers: { data: db.phones.filter((e) => e.person === x.id).map((e) => ({ id: e.id })) } } })),
        included: [...db.emails.map((e) => ({ type: "Email", id: e.id, attributes: e.attributes })), ...db.phones.map((e) => ({ type: "PhoneNumber", id: e.id, attributes: e.attributes }))] });
    }
    if (p === "/people/v2/people" && method === "POST") { const x = { type: "Person", id: id(), attributes: body.data.attributes }; db.people.push(x); return res(201, { data: x }); }
    let m;
    if ((m = p.match(/^\/people\/v2\/people\/(\w+)$/))) return db.people.some((x) => x.id === m[1]) ? res(200, { data: db.people.find((x) => x.id === m[1]) }) : res(404, { errors: [{ title: "Not found" }] });
    if ((m = p.match(/^\/people\/v2\/people\/(\w+)\/emails$/))) { db.emails.push({ id: id(), person: m[1], attributes: body.data.attributes }); return res(201, { data: {} }); }
    if ((m = p.match(/^\/people\/v2\/people\/(\w+)\/phone_numbers$/))) { db.phones.push({ id: id(), person: m[1], attributes: body.data.attributes }); return res(201, { data: {} }); }
    if (p === "/people/v2/tabs") { if (method === "POST") { const x = { id: id(), attributes: body.data.attributes }; db.tabs.push(x); return res(201, { data: x }); } return page(db.tabs); }
    if ((m = p.match(/^\/people\/v2\/tabs\/(\w+)\/field_definitions$/))) { if (method === "POST") { const x = { id: id(), tab: m[1], attributes: body.data.attributes }; db.defs.push(x); return res(201, { data: x }); } return page(db.defs.filter((d) => d.tab === m[1])); }
    if ((m = p.match(/^\/people\/v2\/people\/(\w+)\/field_data$/))) {
      if (method === "POST") { const x = { id: id(), person: m[1], attributes: body.data.attributes, relationships: body.data.relationships }; db.data.push(x); return res(201, { data: x }); }
      return page(db.data.filter((d) => d.person === m[1]));
    }
    if ((m = p.match(/^\/people\/v2\/field_data\/(\w+)$/))) { const x = db.data.find((d) => d.id === m[1]); x.attributes.value = body.data.attributes.value; return res(200, { data: x }); }
    if (p === "/people/v2/note_categories") { if (method === "POST") { const x = { id: id(), attributes: body.data.attributes }; db.cats.push(x); return res(201, { data: x }); } return page(db.cats); }
    if ((m = p.match(/^\/people\/v2\/people\/(\w+)\/notes$/))) { db.notes.push({ person: m[1], ...body.data.attributes }); return res(201, { data: {} }); }
    if (p === "/services/v2/teams") return page(db.teams.map((t) => ({ id: t.id, attributes: { name: t.name } })));
    if ((m = p.match(/^\/services\/v2\/teams\/(\w+)\/people$/))) return page(db.teamPeople[m[1]].map((pid) => ({ id: pid, attributes: { full_name: "Person " + pid } })));
    return res(404, { errors: [{ title: "No route " + p }] });
  };
  return { db, log, handler };
}
const noSleep = async () => {};
const client = (fake, conn = { access_token: "AT", refresh_token: "RT", expires_at: soon() }, extra = {}) =>
  makeClient(conn, { fetch: fake.handler, sleep: noSleep, pace: async () => {}, clientId: "id", clientSecret: "secret", ...extra });

// ---------- mapping ----------
ok(splitName("Daniel van Brooks").first_name === "Daniel" && splitName("Daniel van Brooks").last_name === "van Brooks", "names split into first and last");
const member = { id: "m1", name: "Daniel Brooks", email: "Daniel@B.com", phone: "(555) 123-4567", top_gifts: ["sh", "te", "he"], rec_teams: ["Kids", "Youth"], decision: "joining", submitted_at: "2026-10-23T15:00:00Z", commitments: { faith: "x", serve: "y" } };
const fv = fieldValues(member);
ok(fv[FIELDS.gifts] === "Shepherding, Teaching, Helps" && fv[FIELDS.team] === "Kids" && fv[FIELDS.membership] === "Member since 2026-10-23", "fields: top gifts, team, membership");
ok(fieldValues({ ...member, gifts_override: ["le"], team: "Security" })[FIELDS.team] === "Security", "a leader's team change wins over the recommendation");

// ---------- setup, push, idempotent ----------
{
  const fake = fakePco(); const c = client(fake);
  const ids = await ensureSetup(c, {});
  ok(fake.db.tabs.length === 1 && fake.db.tabs[0].attributes.name === TAB_NAME && fake.db.defs.length === 4 && fake.db.cats.length === 1, "first sync creates the Here To Serve tab, 4 fields and a note category");
  const again = await ensureSetup(c, {});
  ok(fake.db.tabs.length === 1 && fake.db.defs.length === 4 && again.tab === ids.tab, "running setup again finds them instead of making duplicates");
  const commitments = [{ k: "faith", word: "Faith" }, { k: "serve", word: "Serve" }, { k: "pray", word: "Pray" }];
  const r1 = await pushMember(c, ids, member, commitments);
  ok(fake.db.people.length === 1 && fake.db.emails[0].attributes.address === "Daniel@B.com" && fake.db.phones.length === 1, "a new person is created with email and phone");
  ok(fake.db.data.length === 3 && fake.db.notes.length === 1 && /joined on 2026-10-23.*Faith, Serve/.test(fake.db.notes[0].note), "fields filled (blank first Sunday skipped) and a note with the decision and commitments");
  const r2 = await pushMember(c, ids, { ...member, ext_system: "pco", ext_person_id: r1.personId, first_sunday: "2026-11-01" }, commitments, r1.state);
  ok(fake.db.people.length === 1 && fake.db.data.length === 4 && fake.db.notes.length === 1 && r2.personId === r1.personId, "pushing again updates in place: no duplicate person, field or note");
  const r3 = await pushMember(c, ids, { ...member, ext_person_id: null }, commitments, {});
  ok(r3.personId === r1.personId && r1.state.noted === "joining", "matched by email when we don't have their id yet");
  ok(await findPerson(c, { name: "Daniel Brooks", phone: "555.123.4567" }) === r1.personId, "matched by name + phone when there's no email");
  ok(await findPerson(c, { name: "Daniel Brooks", phone: "999-999-9999" }) === null, "same name, different phone: not the same person");
}

// ---------- pagination ----------
{
  const fake = fakePco(); const c = client(fake);
  const { teams, roster } = await pullTeams(c);
  ok(teams.length === 2 && roster.length === 4 && roster.filter((r) => r.teamId === "t1").length === 3, "pull follows every page: 2 teams, 4 people");
  ok(fake.log.filter((l) => l.startsWith("GET /services/v2/teams/t1/people")).length === 2, "a 3-person team on 2-per-page takes 2 requests");
}

// ---------- rate limits, retries, token refresh ----------
{
  const waits = []; let tries = 0;
  const f = async () => { tries++; return tries < 3 ? res(429, {}, { "Retry-After": "7" }) : res(200, { data: [] }); };
  const c = makeClient({ access_token: "AT", refresh_token: "RT", expires_at: soon() }, { fetch: f, sleep: async (ms) => waits.push(ms), pace: async () => {} });
  await c.get("/people/v2/tabs");
  ok(tries === 3 && waits.join() === "7000,7000", "a 429 waits the Retry-After seconds, then retries");
}
{
  let tries = 0;
  const f = async () => { tries++; return res(429, {}, {}); };
  const c = makeClient({ access_token: "AT", refresh_token: "RT", expires_at: soon() }, { fetch: f, sleep: noSleep, pace: async () => {}, maxTries: 4 });
  let err = null; try { await c.get("/x"); } catch (e) { err = e; }
  ok(err && err.status === 429 && tries === 4, "gives up after a few tries instead of looping forever");
}
{
  const saved = []; const seen = [];
  const f = async (url, init) => { seen.push(url === TOKEN_URL ? "token" : init.headers.Authorization); return url === TOKEN_URL ? res(200, { access_token: "NEW", refresh_token: "RT9", expires_in: 7200 }) : res(200, { data: [] }); };
  const conn = { access_token: "OLD", refresh_token: "RT", expires_at: new Date(Date.now() - 1000).toISOString() };
  const c = makeClient(conn, { fetch: f, sleep: noSleep, pace: async () => {}, onTokens: async (x) => saved.push({ ...x }) });
  await c.get("/people/v2/tabs");
  ok(seen.join() === "token,Bearer NEW" && saved[0].refresh_token === "RT9", "an expired token refreshes first and the new tokens are saved");
}
{
  let n = 0;
  const f = async (url) => { if (url === TOKEN_URL) return res(200, { access_token: "NEW", expires_in: 7200 }); n++; return n === 1 ? res(401, {}) : res(200, { data: [] }); };
  const c = makeClient({ access_token: "AT", refresh_token: "RT", expires_at: soon() }, { fetch: f, sleep: noSleep, pace: async () => {} });
  await c.get("/x");
  ok(n === 2, "a 401 refreshes once and retries");
}
{
  let t = 0; const slept = [];
  const pace = makePacer({ requests: 3, perMs: 1000, now: () => t, sleep: async (ms) => { slept.push(ms); t += ms; } });
  for (let i = 0; i < 7; i++) await pace();
  ok(slept.length === 2, "the pacer holds us under the limit (7 calls at 3 per second wait twice)");
}

// ---------- APNs signing ----------
{
  const kp = await webcrypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const der = Buffer.from(await webcrypto.subtle.exportKey("pkcs8", kp.privateKey)).toString("base64");
  const pem = `-----BEGIN PRIVATE KEY-----\n${der}\n-----END PRIVATE KEY-----`;
  const jwt = await apnsToken({ keyP8: pem, keyId: "ABC123", teamId: "TEAM1", nowSec: 1, subtle: webcrypto.subtle });
  const [h, b, s] = jwt.split(".");
  const valid = await webcrypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, kp.publicKey, Buffer.from(s, "base64url"), new TextEncoder().encode(`${h}.${b}`));
  ok(valid && JSON.parse(Buffer.from(h, "base64url")).kid === "ABC123" && JSON.parse(Buffer.from(b, "base64url")).iss === "TEAM1", "the APNs token is a valid ES256 signature with the key id and team id");
}

process.exit(fail ? 1 : 0);
