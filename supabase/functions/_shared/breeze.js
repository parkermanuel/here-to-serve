// Breeze ChMS client and sync logic. Plain JavaScript (runs in the Edge Functions and in the Node tests with a fake fetch).
// Same shape as pco.js: makeClient, ensureSetup, pushMember, pullTeams, test.
import { base, KEY_HEADER, RATE, PATH, FOLDER_NAME, TAG } from "./breeze-constants.js";
import { makePacer, splitName } from "./pco.js";

const GIFT_NAMES = { sh: "Shepherding", te: "Teaching", me: "Mercy", le: "Leadership", en: "Encouragement", he: "Helps", ad: "Administration", fa: "Faith", ho: "Hospitality", ev: "Evangelism", gi: "Giving" };

export class BreezeError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

/** conn: { subdomain, api_key }  opts: { fetch, sleep, pace, maxTries } */
export function makeClient(conn, opts) {
  const fetchFn = opts.fetch, sleep = opts.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const pace = opts.pace || makePacer({ requests: RATE.requests, perMs: RATE.perMs, sleep });
  const maxTries = opts.maxTries ?? 4;
  let calls = 0;
  const cache = {};

  async function get(path) {
    for (let attempt = 1; ; attempt++) {
      await pace();
      calls++;
      const res = await fetchFn(base(conn.subdomain) + path, { method: "GET", headers: { [KEY_HEADER]: conn.api_key, Accept: "application/json" } });
      if ((res.status === 429 || res.status >= 500) && attempt < maxTries) {
        const ra = Number(res.headers?.get?.("Retry-After"));
        await sleep(Number.isFinite(ra) && ra > 0 ? ra * 1000 : Math.min(60_000, 5000 * 2 ** (attempt - 1)));
        continue;
      }
      if (res.status === 401 || res.status === 403) throw new BreezeError(res.status, "Breeze didn't accept the API key. Check it in Settings.");
      let body = null; try { body = await res.json(); } catch { /* not JSON */ }
      if (!res.ok) throw new BreezeError(res.status, `Breeze returned ${res.status}`);
      // Breeze reports some errors as 200 with {success:false, errors}
      if (body && body.success === false) throw new BreezeError(400, String(body.errors || body.error || "Breeze refused the request"));
      return body;
    }
  }

  // Breeze pages with limit/offset; stop when a page comes back short
  async function all(pathFor, limit = 20000) {
    const out = [];
    for (let offset = 0; out.length < limit; offset += 1000) {
      const page = await get(pathFor(offset));
      const list = Array.isArray(page) ? page : [];
      out.push(...list);
      if (list.length < 1000) break;
    }
    return out;
  }
  return { get, all, cache, get calls() { return calls; } };
}

// ---------------- reading people ----------------
const digits = (s) => String(s || "").replace(/\D/g, "").slice(-10);
// Breeze keeps emails and phones inside "details" keyed by each church's field ids, so look through all of it
function strings(v, out = []) {
  if (v == null) return out;
  if (typeof v === "string" || typeof v === "number") out.push(String(v));
  else if (Array.isArray(v)) v.forEach((x) => strings(x, out));
  else if (typeof v === "object") Object.values(v).forEach((x) => strings(x, out));
  return out;
}
export function contactOf(p) {
  const all = strings(p?.details);
  return {
    emails: all.filter((s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s.trim())).map((s) => s.trim().toLowerCase()),
    phones: all.map(digits).filter((d) => d.length === 10),
  };
}
async function everyone(client) {
  if (!client.cache.people) client.cache.people = await client.all((o) => PATH.people(o));
  return client.cache.people;
}
export async function findPerson(client, m) {
  const people = await everyone(client);
  const email = String(m.email || "").toLowerCase();
  if (email) { const hit = people.find((p) => contactOf(p).emails.includes(email)); if (hit) return String(hit.id); }
  if (m.name && m.phone) {
    const { first_name, last_name } = splitName(m.name);
    const want = digits(m.phone);
    const hit = people.find((p) => String(p.first_name || "").toLowerCase() === first_name.toLowerCase()
      && String(p.last_name || "").toLowerCase() === last_name.toLowerCase() && contactOf(p).phones.includes(want));
    if (hit) return String(hit.id);
  }
  return null;
}

// The church's email and phone field ids, from its profile layout
async function contactFields(client) {
  if (client.cache.fields) return client.cache.fields;
  const prof = await client.get(PATH.profileFields);
  const flat = [];
  const walk = (v) => { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === "object") { if (v.field_id && v.field_type) flat.push(v); Object.values(v).forEach(walk); } };
  walk(prof);
  client.cache.fields = { email: flat.find((f) => /email/i.test(f.field_type))?.field_id, phone: flat.find((f) => /phone/i.test(f.field_type))?.field_id };
  return client.cache.fields;
}

export async function createPerson(client, m) {
  const { first_name, last_name } = splitName(m.name);
  const f = await contactFields(client);
  const fields = [];
  if (m.email && f.email) fields.push({ field_id: f.email, field_type: "email", response: true, details: { address: m.email } });
  if (m.phone && f.phone) fields.push({ field_id: f.phone, field_type: "phone", response: true, details: { phone_mobile: m.phone } });
  const r = await client.get(PATH.addPerson(first_name, last_name, fields.length ? fields : null));
  const id = r?.id ?? r?.person_id;
  if (!id) throw new BreezeError(400, "Breeze didn't return the new person's id");
  if (client.cache.people) client.cache.people.push({ id, first_name, last_name, details: { email: m.email, phone: m.phone } });
  return String(id);
}

// ---------------- tags ----------------
export async function ensureSetup(client, known = {}) {
  const ids = { ...known, tags: { ...(known.tags || {}) } };
  if (!ids.folder) {
    const folders = (await client.get(PATH.folders)) || [];
    ids.folder = String(folders.find((f) => f.name === FOLDER_NAME)?.id || "") || null;
    if (!ids.folder) { const r = await client.get(PATH.addFolder(FOLDER_NAME)); ids.folder = String(r?.id ?? r?.folder_id); }
    const tags = (await client.get(PATH.tags(ids.folder))) || [];
    for (const t of tags) ids.tags[t.name] = String(t.id);
  }
  return ids;
}
async function tagId(client, ids, name) {
  if (ids.tags[name]) return ids.tags[name];
  const r = await client.get(PATH.addTag(name, ids.folder));
  ids.tags[name] = String(r?.id ?? r?.tag_id);
  return ids.tags[name];
}

export function wantedTags(m) {
  const gifts = (m.gifts_override?.length ? m.gifts_override : m.top_gifts || []).map((g) => GIFT_NAMES[g] || g);
  const team = m.team || (m.rec_teams || [])[0];
  return [
    ...(m.decision === "joining" ? [TAG.member] : m.decision === "not_ready" ? [TAG.notReady] : []),
    ...gifts.map(TAG.gift),
    ...(team ? [TAG.team(team)] : []),
  ];
}

export function noteText(m, commitments = []) {
  const date = String(m.submitted_at || "").slice(0, 10);
  if (m.decision === "joining") return `Here To Serve: joined on ${date} and made the membership commitments (${commitments.filter((c) => m.commitments?.[c.k]).map((c) => c.word).join(", ")}).`;
  return `Here To Serve: finished membership class on ${date} and isn't ready to join yet.`;
}

// Push one person. Idempotent: finds before creating, only changes tags that changed, writes the note once per decision.
// state = what we last wrote for them ({tags: [...], noted: decision}); returns the new state.
export async function pushMember(client, ids, m, commitments, state = {}) {
  let personId = m.ext_system === "breeze" ? m.ext_person_id : null;
  if (personId) {
    const p = await client.get(PATH.person(personId)).catch((e) => { if (e.status === 404) return null; throw e; });
    if (!p || !p.id) personId = null;
  }
  if (!personId) personId = (await findPerson(client, m)) || (await createPerson(client, m));
  const prev = personId === m.ext_person_id ? state.tags || [] : [];
  const want = wantedTags(m);
  for (const t of want) if (!prev.includes(t)) await client.get(PATH.assign(personId, await tagId(client, ids, t)));
  for (const t of prev) if (!want.includes(t) && ids.tags[t]) await client.get(PATH.unassign(personId, ids.tags[t]));
  let noted = state.noted || null, noteError = null;
  if (m.decision && noted !== m.decision) {
    try { await client.get(PATH.addNote(personId, noteText(m, commitments))); noted = m.decision; }
    catch (e) { noteError = e.message; }  // see the CONFIRM note on addNote
  }
  return { personId, state: { tags: want, noted }, noteError };
}

// Tags (outside the Here To Serve folder) are the teams. People are only fetched for tags matched to a team,
// so a church with hundreds of tags doesn't hit the rate limit.
export async function pullTeams(client, { mapped = [], ids = {} } = {}) {
  const folders = ((await client.get(PATH.folders)) || []).filter((f) => String(f.id) !== String(ids.folder) && f.name !== FOLDER_NAME);
  const teams = [];
  for (const f of folders) {
    for (const t of (await client.get(PATH.tags(f.id))) || []) teams.push({ id: String(t.id), name: `${f.name} › ${t.name}` });
  }
  const roster = [];
  for (const t of teams.filter((x) => mapped.includes(x.id))) {
    for (const p of await client.all((o) => PATH.peopleWithTag(t.id, o))) {
      roster.push({ teamId: t.id, personId: String(p.id), name: [p.first_name, p.last_name].filter(Boolean).join(" ") });
    }
  }
  return { teams, roster };
}

export async function test(client) {
  const a = await client.get(PATH.account);
  return { orgName: a?.name || a?.account_name || null };
}
