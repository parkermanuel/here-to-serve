// Data layer: Supabase sign-in for church staff, key-based saving for members (no account).
// Without a configured database (or on #/demo) the member flow runs on this device only, so it can be shown anywhere.
import { createClient } from "@supabase/supabase-js";
import { DEFAULT_TEAMS, DEFAULT_COMMITMENTS, PINEWOOD_BELIEFS } from "./bank.js";

const CFG = (typeof window !== "undefined" && window.HTS_CONFIG) || {};
export const LIVE = !!(CFG.supabaseUrl && CFG.supabaseAnonKey);
export const sb = LIVE ? createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, { auth: { persistSession: true, detectSessionInUrl: true, flowType: "pkce" } }) : null;

export const siteUrl = () => (CFG.siteUrl || location.origin).replace(/\/$/, "");
export const joinLink = (code) => `${siteUrl()}/#/j/${code}`;
export const inviteLink = (token) => `${siteUrl()}/#/invite/${token}`;
const must = ({ data, error }) => { if (error) throw error; return data; };
const store = {
  get: (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

// ================= Member side =================
export const DEMO_CHURCH = { name: "Pinewood Church", logoUrl: null, accent: "#1E4D3A", teams: DEFAULT_TEAMS, commitments: DEFAULT_COMMITMENTS, beliefs: PINEWOOD_BELIEFS, className: "Membership class" };

// Scan the class code. Returns the member key; the device remembers it per class so a refresh doesn't start over.
export async function join(code) {
  const mine = store.get("hts.class." + code);
  if (mine) return mine;
  if (!LIVE) throw new Error("Not connected");
  const r = must(await sb.rpc("hts_join", { p_code: code }));
  if (!r) return null;
  store.set("hts.class." + code, r.key);
  return r.key;
}

export async function open(key) {
  if (key === "demo" || !LIVE) {
    const saved = store.get("hts.demo") || {};
    return { member: { status: saved.status || "started", step: saved.step || 0, answers: saved.answers || {}, picks: saved.picks || [], decision: saved.decision || null, adult: !!saved.adult, prayer: saved.prayer || "" }, church: DEMO_CHURCH, demo: true };
  }
  const r = must(await sb.rpc("hts_open", { p_key: key }));
  return r;
}

// Saves after every screen. With no signal, the answers wait on this device and go up as soon as it's back online.
export async function save(key, answers, picks, step) {
  if (key === "demo" || !LIVE) { store.set("hts.demo", { ...(store.get("hts.demo") || {}), answers, picks, step, adult: answers.adult, prayer: answers.prayer }); return true; }
  store.set("hts.pending." + key, { answers, picks, step });
  try {
    const ok = must(await sb.rpc("hts_save", { p_key: key, p_answers: answers, p_picks: picks, p_step: step }));
    store.set("hts.pending." + key, null);
    return ok;
  } catch (e) {
    if (isOffline(e)) return "queued";
    throw e;
  }
}
const isOffline = (e) => (typeof navigator !== "undefined" && navigator.onLine === false) || /fetch|network|load failed/i.test(String(e?.message || e));
export async function flushPending(key) {
  const p = store.get("hts.pending." + key);
  if (p) { try { await save(key, p.answers, p.picks, p.step); } catch {} }
}
export const pending = (key) => !!store.get("hts.pending." + key);

export async function submit(key, answers, picks, decision, commitments) {
  if (key === "demo" || !LIVE) { store.set("hts.demo", { status: "submitted", decision }); return true; }
  try {
    const ok = must(await sb.rpc("hts_submit", { p_key: key, p_answers: answers, p_picks: picks, p_decision: decision, p_commitments: commitments }));
    store.set("hts.pending." + key, null);
    return ok;
  } catch (e) {
    if (isOffline(e)) { store.set("hts.pending." + key, { answers, picks, step: 12 }); throw new Error("No signal right now. Your answers are saved on this phone. Tap Submit again once you're back online."); }
    throw e;
  }
}
export const resetDemo = () => store.set("hts.demo", null);

// ================= Staff side =================
export const state = {
  session: null, loaded: false, error: null,
  staff: [], churches: [], activeId: null,
  classes: [], classLeaders: [], members: [], steps: [], prayer: [], team: [], invites: [], handoff: [], notes: {}, snapshot: null, pco: null,
};
const listeners = new Set();
export const onChange = (fn) => listeners.add(fn);
const emit = (why) => listeners.forEach((fn) => fn(why));
export const uid = () => state.session?.user?.id;

export const active = () => state.churches.find((c) => c.id === state.activeId) || null;
export const me = () => state.staff.find((s) => s.church_id === state.activeId) || null;
export const myRole = () => me()?.role || null;
export const can = (...roles) => roles.includes(myRole());
export const isCore = () => can("admin", "staff");
export const prayerOk = () => !!me()?.prayer;

export async function initAuth() {
  if (!LIVE) return;
  const { data } = await sb.auth.getSession();
  state.session = data.session;
  sb.auth.onAuthStateChange((_e, session) => {
    const was = !!state.session;
    state.session = session;
    if (session && !was) loadAll();
    if (!session) Object.assign(state, { loaded: false, staff: [], churches: [], classes: [], members: [], steps: [], prayer: [] });
    emit("auth");
  });
  if (state.session) await loadAll();
}
export async function sendMagicLink(email, back = "") {
  const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: siteUrl() + "/" + back } });
  if (error) throw error;
}
// In the phone app, staff type the 6-digit code from the same email instead of tapping the link
export async function verifyCode(email, token) {
  const { error } = await sb.auth.verifyOtp({ email, token, type: "email" });
  if (error) throw error;
}
export async function exchangeCode(code) { const { error } = await sb.auth.exchangeCodeForSession(code); if (error) throw error; }
export async function signOut() { await sb.auth.signOut(); }

export async function loadAll() {
  try {
    state.staff = must(await sb.from("staff").select("church_id,role,teams,prayer,name,email").eq("user_id", uid()));
    state.churches = must(await sb.from("churches").select("*").order("created_at", { ascending: true }));
    const saved = store.get("hts.church");
    state.activeId = state.churches.find((c) => c.id === saved)?.id || state.churches[0]?.id || null;
    await loadChurch();
    state.loaded = true; state.error = null;
  } catch (err) { state.error = err.message || String(err); state.loaded = true; }
  emit("load");
}

let channel = null;
export async function loadChurch() {
  const cid = state.activeId;
  Object.assign(state, { classes: [], classLeaders: [], members: [], steps: [], prayer: [], team: [], invites: [], handoff: [], notes: {}, snapshot: null, pco: null });
  if (!cid) return;
  const role = myRole();
  // Each query only returns what this person's level may see; the database enforces it either way.
  const jobs = [
    sb.from("staff").select("*").eq("church_id", cid).then(must).then((r) => (state.team = r)),
    sb.from("classes").select("*").eq("church_id", cid).order("class_date", { ascending: false }).then(must).then((r) => (state.classes = r)),
    sb.from("class_leaders").select("*").eq("church_id", cid).then(must).then((r) => (state.classLeaders = r)),
    sb.from("members").select("id,class_id,status,step,name,email,phone,answers,scores,top_gifts,rec_teams,decision,commitments,team,gifts_override,first_sunday,pco_person_id,pco_synced_at,submitted_at,created_at,updated_at").eq("church_id", cid).order("created_at", { ascending: false }).then(must).then((r) => (state.members = r)),
    sb.from("next_steps").select("*").eq("church_id", cid).order("due", { ascending: true }).then(must).then((r) => (state.steps = r)),
    sb.rpc("hts_handoff", { p_church: cid }).then(must).then((r) => (state.handoff = r || [])),
  ];
  if (prayerOk()) jobs.push(sb.from("prayer_requests").select("*").eq("church_id", cid).order("created_at", { ascending: false }).then(must).then((r) => (state.prayer = r)));
  if (role === "admin" || role === "staff") {
    jobs.push(sb.rpc("hts_snapshot", { p_church: cid }).then(must).then((r) => (state.snapshot = r)));
    jobs.push(sb.rpc("hts_pco_status", { p_church: cid }).then(must).then((r) => (state.pco = r)));
  }
  if (role === "admin") jobs.push(sb.from("staff_invites").select("*").eq("church_id", cid).is("accepted_at", null).then(must).then((r) => (state.invites = r)));
  await Promise.all(jobs);
  // Live: the dashboard updates as people submit in class
  if (channel) { sb.removeChannel(channel); channel = null; }
  let t = null;
  const later = () => { clearTimeout(t); t = setTimeout(() => loadChurch().then(() => emit("live")), 800); };
  channel = sb.channel("church-" + cid)
    .on("postgres_changes", { event: "*", schema: "public", table: "members", filter: `church_id=eq.${cid}` }, later)
    .on("postgres_changes", { event: "*", schema: "public", table: "next_steps", filter: `church_id=eq.${cid}` }, later)
    .subscribe();
}
export async function switchChurch(id) { state.activeId = id; store.set("hts.church", id); await loadChurch(); emit("load"); }
const refresh = async () => { await loadChurch(); emit("load"); };

export async function createChurch(name, selfName) {
  const id = must(await sb.rpc("hts_create_church", { p_name: name, p_name_self: selfName || null }));
  store.set("hts.church", id);
  await loadAll();
  return id;
}
export async function updateChurch(patch) { must(await sb.from("churches").update(patch).eq("id", state.activeId)); await loadAll(); }
export async function createClass(name, date) {
  const r = must(await sb.from("classes").insert({ church_id: state.activeId, name, class_date: date, created_by: uid() }).select().single());
  await refresh(); return r;
}
export async function setClassOpen(id, open) { must(await sb.from("classes").update({ open }).eq("id", id)); await refresh(); }
export async function setClassLeader(classId, userId, on) { must(await sb.rpc("hts_set_class_leader", { p_class: classId, p_user: userId, p_on: on })); await refresh(); }

// The team: three levels (admin, staff, team_lead), team(s) for Team Leads, and the prayer access switch
export async function inviteStaff(email, role, teams, prayer) {
  const id = must(await sb.rpc("hts_invite_staff", { p_church: state.activeId, p_email: email, p_role: role, p_teams: teams || [], p_prayer: prayer }));
  await refresh();
  // Email hook: once Resend is set up for heretoserve.app, an edge function can send inviteLink(token). Until then, copy the link.
  return state.invites.find((i) => i.id === id);
}
export async function setStaff(userId, role, teams, prayer) {
  must(await sb.rpc("hts_set_staff", { p_church: state.activeId, p_user: userId, p_role: role, p_teams: teams ?? null, p_prayer: prayer ?? null }));
  if (userId === uid()) await loadAll(); else await refresh();
}
export const inviteInfo = async (token) => must(await sb.rpc("hts_invite_info", { p_token: token }));
export async function acceptInvite(token, name) { const id = must(await sb.rpc("hts_accept_invite", { p_token: token, p_name: name || null })); store.set("hts.church", id); await loadAll(); }

export async function memberEdit(id, team, gifts) { must(await sb.rpc("hts_member_edit", { p_member: id, p_team: team || null, p_gifts: gifts })); await refresh(); }
export async function loadNotes(id) { state.notes[id] = must(await sb.from("notes").select("*").eq("member_id", id).order("created_at")); emit("notes"); }
export async function addNote(id, body) { must(await sb.rpc("hts_add_note", { p_member: id, p_body: body })); await loadNotes(id); }
export async function setStep(id, patch) { must(await sb.from("next_steps").update(patch).eq("id", id)); await refresh(); }
export async function addStep(memberId, title, ownerUser, due) {
  must(await sb.from("next_steps").insert({ church_id: state.activeId, member_id: memberId, kind: "custom", title, owner_user: ownerUser || null, due: due || null }));
  await refresh();
}
export async function setFirstSunday(memberId, date) { must(await sb.rpc("hts_set_first_sunday", { p_member: memberId, p_date: date || null })); await refresh(); }
export async function markPrayed(id, on) { must(await sb.from("prayer_requests").update({ prayed_at: on ? new Date().toISOString() : null }).eq("id", id)); await refresh(); }
export async function deleteMember(id) { must(await sb.from("members").delete().eq("id", id)); await refresh(); }

// Planning Center
export const pcoReady = () => !!CFG.pcoClientId;
export async function pcoConnect() {
  const state_ = must(await sb.rpc("hts_pco_begin", { p_church: state.activeId }));
  const redirect = `${CFG.supabaseUrl}/functions/v1/hts-pco-callback`;
  const u = new URL("https://api.planningcenteronline.com/oauth/authorize");
  u.search = new URLSearchParams({ client_id: CFG.pcoClientId, redirect_uri: redirect, response_type: "code", scope: "people services", state: state_ }).toString();
  return u.toString();
}
export async function pcoDisconnect() { must(await sb.rpc("hts_pco_disconnect", { p_church: state.activeId })); await refresh(); }
export async function pcoSetMap(pcoTeam, htsTeam) { must(await sb.rpc("hts_pco_set_map", { p_church: state.activeId, p_pco_team: pcoTeam, p_hts_team: htsTeam || null })); await refresh(); }
export async function pcoSync() {
  const { data, error } = await sb.functions.invoke("hts-pco-sync", { body: { church: state.activeId, pull: true } });
  if (error) throw error;
  await refresh();
  return data;
}

// Phone app: push notifications and account deletion
export async function registerDevice(token, platform) { must(await sb.rpc("hts_register_device", { p_token: token, p_platform: platform })); }
export async function deleteMyAccount() {
  const r = must(await sb.rpc("hts_delete_my_account"));
  try { await sb.auth.signOut(); } catch {}
  return r;
}
