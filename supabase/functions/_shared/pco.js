// Planning Center client and sync logic. Plain JavaScript with no imports beyond the constants, so the same file
// runs in the Supabase Edge Functions (Deno) and in the Node tests with a fake fetch.
import { PCO_HOST, TOKEN_URL, RATE, PATH, TAB_NAME, FIELDS, NOTE_CATEGORY } from "./pco-constants.js";

const GIFT_NAMES = { sh: "Shepherding", te: "Teaching", me: "Mercy", le: "Leadership", en: "Encouragement", he: "Helps", ad: "Administration", fa: "Faith", ho: "Hospitality", ev: "Evangelism", gi: "Giving" };

export class PcoError extends Error {
  constructor(status, message, body) { super(message); this.status = status; this.body = body; }
}

// Keeps us under ~90 requests per 20 seconds, and waits out a 429 using Retry-After.
export function makePacer({ requests = RATE.requests, perMs = RATE.perMs, now = () => Date.now(), sleep } = {}) {
  const stamps = [];
  return async function pace() {
    for (;;) {
      const t = now();
      while (stamps.length && t - stamps[0] >= perMs) stamps.shift();
      if (stamps.length < requests) { stamps.push(t); return; }
      await sleep(perMs - (t - stamps[0]) + 5);
    }
  };
}

/**
 * conn: { access_token, refresh_token, expires_at }  (expires_at: ISO string)
 * opts: { fetch, sleep, clientId, clientSecret, onTokens(conn) }  onTokens saves refreshed tokens.
 */
export function makeClient(conn, opts) {
  const fetchFn = opts.fetch, sleep = opts.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const pace = opts.pace || makePacer({ sleep });
  const maxTries = opts.maxTries ?? 5;
  let calls = 0;

  async function refresh() {
    const res = await fetchFn(TOKEN_URL, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grant_type: "refresh_token", refresh_token: conn.refresh_token, client_id: opts.clientId, client_secret: opts.clientSecret }),
    });
    if (!res.ok) throw new PcoError(res.status, "Planning Center sign-in expired. Reconnect it in Settings.", await safeJson(res));
    const t = await res.json();
    conn.access_token = t.access_token;
    if (t.refresh_token) conn.refresh_token = t.refresh_token;
    conn.expires_at = new Date(Date.now() + (t.expires_in || 7200) * 1000).toISOString();
    if (opts.onTokens) await opts.onTokens(conn);
  }

  async function request(method, path, body) {
    if (!conn.expires_at || new Date(conn.expires_at).getTime() - Date.now() < 60_000) await refresh();
    const url = path.startsWith("http") ? path : PCO_HOST + path;
    let refreshed = false;
    for (let attempt = 1; ; attempt++) {
      await pace();
      calls++;
      const res = await fetchFn(url, {
        method, headers: { Authorization: `Bearer ${conn.access_token}`, "Content-Type": "application/json", "User-Agent": "HereToServe (heretoserve.app)" },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (res.status === 401 && !refreshed) { refreshed = true; await refresh(); continue; }
      if ((res.status === 429 || res.status >= 500) && attempt < maxTries) {
        const ra = Number(res.headers?.get?.("Retry-After"));
        await sleep(Number.isFinite(ra) && ra > 0 ? ra * 1000 : Math.min(30_000, 1000 * 2 ** (attempt - 1)));
        continue;
      }
      if (res.status === 204) return null;
      const json = await safeJson(res);
      if (!res.ok) throw new PcoError(res.status, pcoMessage(json) || `Planning Center returned ${res.status}`, json);
      return json;
    }
  }

  // JSON:API pagination: follow links.next until there isn't one. Returns all data items plus everything included.
  async function all(path, limit = 5000) {
    const data = [], included = [];
    let next = path;
    while (next && data.length < limit) {
      const page = await request("GET", next);
      data.push(...(page?.data || []));
      included.push(...(page?.included || []));
      next = page?.links?.next || null;
    }
    return { data, included };
  }

  return {
    get: (p) => request("GET", p), post: (p, b) => request("POST", p, b), patch: (p, b) => request("PATCH", p, b), all,
    get calls() { return calls; },
  };
}

async function safeJson(res) { try { return await res.json(); } catch { return null; } }
const pcoMessage = (j) => j?.errors?.map((e) => e.detail || e.title).filter(Boolean).join("; ");

// ---------------- mapping ----------------
export function splitName(full = "") {
  const parts = String(full).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { first_name: "Guest", last_name: "" };
  return { first_name: parts[0], last_name: parts.slice(1).join(" ") };
}
const digits = (s) => String(s || "").replace(/\D/g, "").slice(-10);

// What we write into the "Here To Serve" fields for one person
export function fieldValues(m) {
  const gifts = (m.gifts_override?.length ? m.gifts_override : m.top_gifts || []).map((g) => GIFT_NAMES[g] || g);
  const team = m.team || (m.rec_teams || [])[0] || "";
  const membership = m.decision === "joining"
    ? `Member since ${String(m.submitted_at || "").slice(0, 10)}`
    : m.decision === "not_ready" ? "Took the class, not ready to join yet" : "";
  return {
    [FIELDS.gifts]: gifts.join(", "),
    [FIELDS.team]: team,
    [FIELDS.membership]: membership,
    [FIELDS.firstSunday]: m.first_sunday || "",
  };
}

export function noteText(m, commitments = []) {
  const date = String(m.submitted_at || "").slice(0, 10);
  if (m.decision === "joining") {
    const words = commitments.filter((c) => m.commitments?.[c.k]).map((c) => c.word);
    return `Here To Serve: joined on ${date} and made the membership commitments (${words.join(", ")}).`;
  }
  return `Here To Serve: finished membership class on ${date} and isn't ready to join yet.`;
}

// Find the person: email first, then name + phone. Returns a PCO person id or null.
export async function findPerson(client, m) {
  const email = String(m.email || "").toLowerCase();
  if (email) {
    const r = await client.get(PATH.searchPeople(email));
    const emails = (r?.included || []).filter((x) => x.type === "Email" && String(x.attributes?.address || "").toLowerCase() === email);
    const hit = (r?.data || []).find((p) => emails.some((e) => p.relationships?.emails?.data?.some((d) => d.id === e.id)));
    if (hit) return hit.id;
  }
  if (m.name && m.phone) {
    const r = await client.get(PATH.searchPeople(m.name));
    const want = digits(m.phone);
    const phones = (r?.included || []).filter((x) => x.type === "PhoneNumber" && digits(x.attributes?.number) === want);
    const { first_name, last_name } = splitName(m.name);
    const hit = (r?.data || []).find((p) =>
      String(p.attributes?.first_name || "").toLowerCase() === first_name.toLowerCase() &&
      String(p.attributes?.last_name || "").toLowerCase() === last_name.toLowerCase() &&
      phones.some((ph) => p.relationships?.phone_numbers?.data?.some((d) => d.id === ph.id)));
    if (hit) return hit.id;
  }
  return null;
}

export async function createPerson(client, m) {
  const r = await client.post(PATH.people, { data: { type: "Person", attributes: splitName(m.name) } });
  const id = r.data.id;
  if (m.email) await client.post(PATH.emails(id), { data: { type: "Email", attributes: { address: m.email, location: "Home", primary: true } } });
  if (m.phone) await client.post(PATH.phones(id), { data: { type: "PhoneNumber", attributes: { number: m.phone, location: "Mobile", primary: true } } });
  return id;
}

// Make sure the "Here To Serve" tab, its fields and the note category exist. Returns their ids (saved per church).
export async function ensureSetup(client, known = {}) {
  const ids = { ...known, fields: { ...(known.fields || {}) } };
  if (!ids.tab) {
    const tabs = await client.all(PATH.tabs);
    ids.tab = tabs.data.find((t) => t.attributes?.name === TAB_NAME)?.id
      || (await client.post(PATH.createTab, { data: { type: "Tab", attributes: { name: TAB_NAME } } })).data.id;
  }
  const names = Object.values(FIELDS);
  if (names.some((n) => !ids.fields[n])) {
    const defs = await client.all(PATH.fieldDefinitions(ids.tab));
    for (const n of names) {
      if (ids.fields[n]) continue;
      ids.fields[n] = defs.data.find((d) => d.attributes?.name === n)?.id
        || (await client.post(PATH.createFieldDefinition(ids.tab), { data: { type: "FieldDefinition", attributes: { name: n, data_type: "string" } } })).data.id;
    }
  }
  if (!ids.noteCategory) {
    const cats = await client.all(PATH.noteCategories);
    ids.noteCategory = cats.data.find((c) => c.attributes?.name === NOTE_CATEGORY)?.id
      || (await client.post(PATH.createNoteCategory, { data: { type: "NoteCategory", attributes: { name: NOTE_CATEGORY } } })).data.id;
  }
  return ids;
}

// Push one person. Idempotent: finds before creating, updates fields in place, adds the note only once.
// state = what we last wrote for them ({noted: decision}); returns the new state.
export async function pushMember(client, ids, m, commitments, state = {}) {
  let personId = m.ext_system === "pco" ? m.ext_person_id || null : null;
  if (personId) {
    try { await client.get(PATH.person(personId)); } catch (e) { if (e.status === 404) personId = null; else throw e; }
  }
  if (!personId) personId = (await findPerson(client, m)) || (await createPerson(client, m));
  const want = fieldValues(m);
  const have = await client.all(PATH.fieldData(personId));
  for (const [name, value] of Object.entries(want)) {
    const defId = ids.fields[name];
    if (!defId) continue;
    const cur = have.data.find((d) => d.relationships?.field_definition?.data?.id === defId);
    if (cur) {
      if ((cur.attributes?.value || "") !== value) await client.patch(PATH.fieldDatum(cur.id), { data: { type: "FieldDatum", id: cur.id, attributes: { value } } });
    } else if (value) {
      await client.post(PATH.createFieldDatum(personId), { data: { type: "FieldDatum", attributes: { value }, relationships: { field_definition: { data: { type: "FieldDefinition", id: defId } } } } });
    }
  }
  let noted = personId === m.ext_person_id ? state.noted || null : null;
  if (m.decision && noted !== m.decision) {
    await client.post(PATH.createNote(personId), { data: { type: "Note", attributes: { note: noteText(m, commitments), note_category_id: ids.noteCategory } } });
    noted = m.decision;
  }
  return { personId, state: { ...state, noted } };
}

// Pull every Services team and who's on it. Returns { teams: [{id, name}], roster: [{teamId, personId, name}] }.
export async function pullTeams(client, _opts = {}) {
  const teams = (await client.all(PATH.servicesTeams)).data.map((t) => ({ id: String(t.id), name: t.attributes?.name || "Team " + t.id }));
  const roster = [];
  for (const t of teams) {
    const people = await client.all(PATH.teamPeople(t.id));
    for (const p of people.data) {
      const a = p.attributes || {};
      roster.push({ teamId: t.id, personId: String(p.id), name: a.full_name || [a.first_name, a.last_name].filter(Boolean).join(" ") || a.name || "" });
    }
  }
  return { teams, roster };
}

export async function test(client) {
  const o = await client.get(PATH.organization);
  return { orgName: o?.data?.attributes?.name || null };
}
