// Screens: the member phone flow (#/j/<code>, #/m/<key>, #/demo) and the staff dashboard (#/ and #/s/...).
import qrcode from "qrcode-generator";
import { GIFTS, GIFT_KEYS, VERSES, PAIRS, CHOICES, PINEWOOD_BELIEFS, ROLE_NAMES, DEFAULT_TEAMS, DEFAULT_JOIN_TERM, DEFAULT_HOST_SCRIPT, DEFAULT_GUIDE, lines } from "./bank.js";
import { results, countGifts, cleanTeams, parseCommitments, canJoin, joinsAfterBaptism, AFTER_BAPTISM_FAITH, memberSteps } from "./engine.js";
import * as L from "./live.js";
import * as N from "./native.js";
import { privacyPage, termsPage } from "./pages.js";
import { parseCsv, toCsv, rosterRows, PEOPLE_COLUMNS, STEP_COLUMNS, fileName } from "./csv.js";

// ---------------- utilities ----------------
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const safeUrl = (u) => { try { const x = new URL(String(u)); return x.protocol === "https:" ? x.href : null; } catch { return null; } };
const hex = (c) => (/^#[0-9A-Fa-f]{6}$/.test(String(c)) ? c : "#1E4D3A");
const today = () => new Date().toISOString().slice(0, 10);
const fmt = (d) => { if (!d) return ""; try { return new Date(String(d).length === 10 ? d + "T12:00:00" : d).toLocaleDateString(undefined, { month: "short", day: "numeric" }); } catch { return d; } };
const toast = (msg) => { const t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status"); t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2400); };
const errMsg = (e) => e?.message || String(e);
const ICON = {
  back: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>',
  check: (w = 16, sw = 3) => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg>`,
  circle: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0;margin-top:1px;color:var(--accent)"><circle cx="12" cy="12" r="9"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/></svg>',
  lock: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0;margin-top:2px"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
  x: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
};
const MARK = '<span class="mark">here to serve<i>.</i></span>';
const logoBox = (church) => {
  const u = safeUrl(church?.logoUrl ?? church?.logo_url);
  return `<div class="logo" role="img" aria-label="${esc(church?.name || "Church")} logo">${u ? `<img src="${esc(u)}" alt="">` : esc((church?.name || "?").trim()[0] || "?")}</div>`;
};
const setAccent = (c) => document.documentElement.style.setProperty("--accent", hex(c));

// ---------------- routing ----------------
let route = { name: "home", arg: null };
function parse() {
  // heretoserve.app/join (typed by hand) loads through 404.html; send it to the code screen
  if (!location.hash && /^\/join\/?$/i.test(location.pathname)) return { name: "typecode", arg: null };
  const h = location.hash.replace(/^#\/?/, "");
  const [a, b, c] = stripQuery(h).split("/");
  if (a === "j" && b) return { name: "join", arg: b };
  if (a === "join") return { name: "typecode", arg: null };
  if (a === "m" && b) return { name: "member", arg: b };
  if (a === "demo") return { name: "member", arg: "demo" };
  if (a === "invite" && b) return { name: "invite", arg: b };
  if (a === "privacy" || a === "terms") return { name: a, arg: null };
  if (a === "s" && b) return { name: b, arg: c || null };
  return { name: "home", arg: null };
}
const stripQuery = (h) => h.split("?")[0];
const go = (hash) => { if (location.hash !== hash) location.hash = hash; else onRoute(); };
window.addEventListener("hashchange", onRoute);

async function onRoute() {
  route = parse();
  window.scrollTo(0, 0);
  if (route.name === "join") return startJoin(route.arg);
  if (route.name === "typecode") return renderTypeCode();
  if (route.name === "member") return startMember(route.arg);
  render();
}

// Owner, 23 Oct 2026: a typed fallback for phones that can't scan. heretoserve.app/join, then the code on the screen.
const showCode = (c) => String(c || "").toUpperCase().replace(/(.{4})(?=.)/g, "$1-");
const readCode = (t) => String(t || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
function renderTypeCode(err) {
  $("#top").innerHTML = "";
  $("#app").innerHTML = `<div class="phone"><div class="pbody"><h1>Join your class</h1><p class="lead">Type the code on the screen. Dashes and capitals don't matter.</p>
    <form data-form="typecode" class="q"><input class="in" id="tc-code" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABCD-1234-EF56" required aria-label="Class code" style="font-size:22px;letter-spacing:.08em;text-transform:uppercase">
    ${err ? `<div class="err">${esc(err)}</div>` : ""}<button class="cta" type="submit">Start</button></form></div></div>`;
}

// ================= MEMBER FLOW =================
const STEPS = ["welcome", "about", "household", "faith", "story", "skills", "passions", "availability", "prayer", "pause", "gifts", "results", "decide", "baptismfirst", "commit", "sent"];
// What this church calls joining (owner, 23 Oct 2026): "join the serve team", "become a covenant member"...
const joinTerm = (c) => String(c?.joinTerm || DEFAULT_JOIN_TERM).trim();
const PART1 = 8; // about .. prayer
let M = null; // { key, church, i, q, a, picks, decision, commits, sheet, busy, error, demo, saved }

async function startJoin(code) {
  $("#app").innerHTML = `<div class="phone"><div class="pbody center"><p class="lead">Opening your class…</p></div></div>`;
  try {
    const key = await L.join(code);
    if (!key) { $("#app").innerHTML = `<div class="phone"><div class="pbody center"><h1>This class link isn't open</h1><p class="lead">Ask the person leading your class for the current code.</p></div></div>`; return; }
    location.replace("#/m/" + key);
  } catch (e) { $("#app").innerHTML = `<div class="phone"><div class="pbody center"><h1>We couldn't open the class</h1><p class="lead">${esc(errMsg(e))}</p></div></div>`; }
}

async function startMember(key) {
  $("#top").innerHTML = ""; $("#foot").innerHTML = "";
  $("#app").innerHTML = `<div class="phone"><div class="pbody center"><p class="lead">Loading…</p></div></div>`;
  try {
    const r = await L.open(key);
    if (!r) { $("#app").innerHTML = `<div class="phone"><div class="pbody center"><h1>We couldn't find your form</h1><p class="lead">Scan the class code again to start.</p></div></div>`; return; }
    const mem = r.member;
    const a = { ...(mem.answers || {}), adult: mem.adult, prayer: mem.prayer || "" };
    let i = mem.status === "submitted" ? STEPS.indexOf("sent") : Math.min(Math.max(0, mem.step || 0), STEPS.indexOf("results"));
    const picks = Array.isArray(mem.picks) ? mem.picks.slice() : [];
    let q = 0; while (q < PAIRS.length - 1 && picks[q]) q++;
    if (STEPS[i] === "gifts" && picks.length >= PAIRS.length && picks.every(Boolean)) i = STEPS.indexOf("results");
    M = { key, church: r.church || L.DEMO_CHURCH, i, q, a, picks, decision: mem.decision || null, commits: Object.keys(mem.commitments || {}), sheet: false, busy: false, error: null, demo: !!r.demo || key === "demo", saved: mem.status === "submitted" ? mem : null };
    setAccent(M.church.accent);
    document.title = (M.church.name || "Here To Serve") + " · " + (M.church.className || "Growth Track");
    renderMember();
  } catch (e) { $("#app").innerHTML = `<div class="phone"><div class="pbody center"><h1>Something went wrong</h1><p class="lead">${esc(errMsg(e))}</p></div></div>`; }
}

const stepName = () => STEPS[M.i];
async function persist() {
  try {
    const r = await L.save(M.key, M.a, M.picks, M.i);
    M.error = r === "queued" ? "No signal right now. Your answers are saved on this phone and will send when you're back online." : null;
  } catch (e) { M.error = "We couldn't save just now. Keep going; we'll try again on the next screen."; }
}
// Back online: send anything that waited on this phone
window.addEventListener("online", async () => { if (M && !M.demo) { await L.flushPending(M.key); if (!L.pending(M.key)) { M.error = null; renderMember(); } } });

function chips(key, multi) {
  const cur = M.a[key];
  return `<div class="chips">${CHOICES[key].map((o) => {
    const on = multi ? (cur || []).includes(o) : cur === o;
    return `<button type="button" class="chip" aria-pressed="${on}" data-act="${multi ? "multi" : "single"}" data-k="${key}" data-v="${esc(o)}">${esc(o)}</button>`;
  }).join("")}</div>`;
}
const field = (id, label, type, placeholder, key) => `<div><label class="fl" for="${id}">${label}</label><input class="in" id="${id}" type="${type}" placeholder="${esc(placeholder)}" data-in="${key}" value="${esc(M.a[key] || "")}" autocomplete="${type === "email" ? "email" : type === "tel" ? "tel" : key === "name" ? "name" : "off"}"></div>`;

function screen() {
  const c = M.church, s = stepName();
  if (s === "welcome") return `<div class="pbody" style="padding-top:56px">
    ${MARK.replace('class="mark"', 'class="mark" style="font-size:20px"')}
    <div class="church">${logoBox(c)}<b>${esc(c.name)}</b></div>
    <h1 class="big">Let's find where you fit.</h1>
    <p class="lead">About 15 minutes. Part 1 now, Part 2 after a short break. Your answers help our team walk with you into your next step.</p>
    <div class="card parts"><div class="part"><span class="num">1</span>About you · 7 minutes</div><div class="part"><span class="num">2</span>Your gifts · 8–10 minutes</div></div>
    <p class="fine">By tapping Get started, you confirm you're 18 or older. Your answers stay with our church team. <a href="#/privacy">Privacy</a></p></div>`;
  if (s === "about") return `<div class="pbody"><h1>First, the basics.</h1>${field("f-name", "Name", "text", "First and last name", "name")}${field("f-email", "Email", "email", "you@email.com", "email")}${field("f-phone", "Phone", "tel", "(555) 555-5555", "phone")}</div>`;
  if (s === "household") return `<div class="pbody"><h1>Your household</h1><div class="q"><div class="qt">Are you single or married?</div>${chips("married")}</div>${M.a.married === "Married" ? field("f-spouse", "Spouse's name, if they're in this class too (optional)", "text", "First and last name", "spouseName") : ""}<div class="q"><div class="qt">Kids at home?</div>${chips("kids")}</div>${field("f-ages", "Kids' ages (optional)", "text", "e.g. 3, 7, 12", "kidsAges")}</div>`;
  if (s === "faith") return `<div class="pbody"><h1>Your faith steps</h1><div class="q"><div class="qt">Have you put your faith in Jesus?</div>${chips("faith")}</div><div class="q"><div class="qt">Have you been baptized as a believer?</div>${chips("bapt")}</div><div class="q"><div class="qt">Are you in a group?</div>${chips("group")}</div></div>`;
  if (s === "story") return `<div class="pbody"><h1>How you got here</h1><div class="q"><div class="qt">How did you first find ${esc(c.name)}?</div>${chips("found")}</div><div class="q"><div class="qt">Have you served at a church before?</div>${chips("served")}</div>${field("f-served", "Where, and on what team? (optional)", "text", "e.g. Kids at Grace Church", "servedWhere")}</div>`;
  if (s === "skills") return `<div class="pbody"><h1>What are you good at?</h1><p class="sub">Tap all that apply. Work, hobbies, anything.</p>${chips("skills", true)}</div>`;
  if (s === "passions") return `<div class="pbody"><h1>Who do you care about most?</h1><p class="sub">Tap all that tug at your heart.</p>${chips("passions", true)}</div>`;
  if (s === "availability") return `<div class="pbody"><h1>When can you serve?</h1><div class="q"><div class="qt">Days</div>${chips("when")}</div><div class="q"><div class="qt">How often?</div>${chips("often")}</div></div>`;
  if (s === "prayer") return `<div class="pbody"><h1>How can we pray for you?</h1><div><label class="fl" for="f-prayer">Prayer request (optional)</label><textarea class="in" id="f-prayer" rows="6" placeholder="Share as much or as little as you'd like." data-in="prayer">${esc(M.a.prayer || "")}</textarea></div><div class="row" style="gap:10px;align-items:flex-start;font-size:14px;color:var(--quiet)">${ICON.lock}<span>Seen by staff and the prayer team.</span></div></div>`;
  if (s === "pause") return `<div class="pbody" style="padding-top:48px"><div class="check">${ICON.check(30, 2.4)}</div><h1 style="font-size:32px">Part 1 is done. Thank you!</h1><p class="lead">Set your phone down and listen in for a few minutes. Next, we'll discover how God has gifted you.</p><div class="card"><p class="verse">"Just as each one has received a gift, use it to serve others."</p><p class="ref">1 Peter 4:10</p></div></div>`;
  if (s === "gifts") {
    const p = PAIRS[M.q], swap = M.q % 2 === 1;
    const A = swap ? [p[2], p[3]] : [p[0], p[1]], B = swap ? [p[0], p[1]] : [p[2], p[3]];
    const chosen = M.picks[M.q];
    return `<div class="pbody"><h1 style="font-size:26px">Which sounds more like you?</h1>
      <button type="button" class="opt" aria-pressed="${chosen === A[1]}" data-act="pick" data-v="${A[1]}"><span class="badge">A</span><span>${esc(A[0])}</span></button>
      <button type="button" class="opt" aria-pressed="${chosen === B[1]}" data-act="pick" data-v="${B[1]}"><span class="badge">B</span><span>${esc(B[0])}</span></button>
      <p class="fine" style="font-size:14px">Go with your gut. Neither answer is wrong.</p></div>`;
  }
  if (s === "results") {
    const r = results(M.a, M.picks, c.teams || []);
    return `<div class="pbody"><h1>Here's how God has gifted you.</h1>
      <div class="q"><div class="kick">Your top gifts</div>${r.top.map((g) => `<div class="gift"><div class="top"><b>${esc(g.name)}</b><span class="small">${g.score} of 6</span></div><div class="bar"><span style="width:${Math.round((g.score / 6) * 100)}%"></span></div><div class="small">${esc(g.verse)}</div></div>`).join("")}</div>
      <div class="q"><div class="kick">Teams to talk about</div>${r.seasonFull ? `<p class="sub" style="font-size:14px">You said your season is full right now. No pressure. These are here for when it opens up.</p>` : ""}
        ${r.teams.map((t) => `<div class="team"><b>${esc(t.name)}</b><span>${esc(t.reason)}</span>${t.check ? `<div class="flag">Background check needed</div>` : ""}</div>`).join("")}</div>
      <div class="q"><div class="kick">Your next steps</div>${r.nextSteps.map((t) => `<div class="stepline">${ICON.circle}<span>${esc(t)}</span></div>`).join("")}</div>
      <div class="note">Keep this screen open. A leader will sit down with you now and go over it in your one-on-one.</div></div>`;
  }
  if (s === "decide") return `<div class="pbody"><h1>One last step</h1><p class="sub">Are you ready to ${esc(joinTerm(c))} at ${esc(c.name)}? Either answer is a good one.</p>
    <button type="button" class="choice go" data-act="ready"><b>I'm ready to ${esc(joinTerm(c))}</b><span>Next, you'll make our commitments.</span></button>
    <button type="button" class="choice" data-act="notready"><b>I'm not ready yet</b><span>No pressure. We'll submit your answers and stay in touch.</span></button></div>`;
  if (s === "baptismfirst") return `<div class="pbody"><h1>One step first</h1><p class="lead">To ${esc(joinTerm(c))}, we ask that you've trusted Jesus first. That's the most important step there is, and we'd love to talk with you about it. That's a great next step, and we'd love to walk with you into it.</p>
    <button type="button" class="choice go" data-act="notready"><b>Submit as "not ready yet"</b><span>A pastor will reach out to talk about following Jesus.</span></button>
    <button type="button" class="choice" data-act="fixfaith"><b>I answered that wrong</b><span>Go back to your faith steps and change your answer.</span></button></div>`;
  if (s === "commit") {
    const list = c.commitments || [];
    return `<div class="pbody" style="gap:14px"><h1>Our commitment</h1><p class="sub">This is a promise we make to each other. Check each one you're ready to make.</p>
      ${list.map((x) => { const on = M.commits.includes(x.k); return `<div class="commit"><button type="button" class="crow" aria-pressed="${on}" data-act="commit" data-v="${esc(x.k)}"><span class="box">${ICON.check()}</span><span><span class="cw">${esc(x.word)}</span><span class="cs">${esc(x.k === "faith" && joinsAfterBaptism(M.a, c.requireBaptism !== false) ? AFTER_BAPTISM_FAITH : x.statement)}</span><span class="cv">${esc(x.verse)}</span></span></button>${x.k === "belief" && (c.beliefs || []).length ? `<button type="button" class="textlink" data-act="sheet">Read what we believe</button>` : ""}</div>`; }).join("")}
      ${allCommitted() ? "" : `<p class="sub" style="font-size:14px">Check each one to submit. Not ready on one? That's okay. Go back and choose "I'm not ready yet."</p>`}</div>`;
  }
  if (s === "sent") return sentScreen();
  return "";
}
// Their own copy: gifts, teams, commitments and next steps, kept at their link and sent to their own phone or email
function myCopy() {
  const c = M.church, sv = M.saved || {};
  const r = results(M.a, M.picks, c.teams || []);
  const gifts = (sv.topGifts?.length ? sv.topGifts : r.top.map((g) => g.key)).map((g) => GIFTS[g]).filter(Boolean);
  const teams = sv.team ? [sv.team] : sv.recTeams?.length ? sv.recTeams : r.teams.map((t) => t.name);
  const made = new Set(sv.commitments ? Object.keys(sv.commitments) : M.commits);
  const commits = (c.commitments || []).filter((x) => made.has(x.k));
  const decision = sv.decision || M.decision;
  return { gifts, teams, commits, steps: memberSteps(M.a), decision, link: `${L.siteUrl()}/#/m/${M.key}` };
}
function copyText() {
  const c = M.church, x = myCopy();
  return [`${c.name}: my results from ${c.className || "class"}`, `Top gifts: ${x.gifts.join(", ")}`, `Teams to talk about: ${x.teams.join(", ")}`,
    x.commits.length ? `Commitments I made: ${x.commits.map((k) => k.word).join(", ")}` : "", `Next steps: ${x.steps.join("; ")}`, `See it any time: ${x.link}`].filter(Boolean).join("\n");
}
function sentScreen() {
  const c = M.church, x = myCopy();
  const joining = x.decision === "joining";
  return `<div class="pbody"><div class="center"><div class="check" style="width:72px;height:72px;background:var(--accent);color:#fff;margin:0 auto">${ICON.check(34, 2.4)}</div><h1 style="font-size:32px">Submitted!</h1>
    <p class="lead">${joining && joinsAfterBaptism(M.a, c.requireBaptism !== false) ? `Thank you for saying yes. Your next step is baptism, and a pastor will reach out soon to talk with you about it.` : joining ? `Thank you for saying yes. A pastor will confirm your next step after your one-on-one, and someone from our team will reach out soon.` : `Your answers are in. Someone from our team will reach out soon about your next steps.`}</p></div>
    <div class="card q"><div class="kick">Your top gifts</div><p style="margin:0"><b>${esc(x.gifts.join(" · "))}</b></p>
      <div class="kick">Teams to talk about</div><p style="margin:0">${esc(x.teams.join(" · "))}</p>
      ${x.commits.length ? `<div class="kick">Commitments you made</div><p style="margin:0">${esc(x.commits.map((k) => k.word).join(" · "))}</p>` : ""}
      <div class="kick">Your next steps</div>${x.steps.map((t) => `<div class="stepline">${ICON.circle}<span>${esc(t)}</span></div>`).join("")}</div>
    <div class="card q"><h2 style="font-size:20px;margin:0">Send yourself a copy</h2><p class="sub" style="font-size:14px;margin:0">No more screenshots. It includes a link back to this page.</p>
      <label class="fl" for="cp-phone">Phone</label><input class="in" id="cp-phone" type="tel" value="${esc(M.a.phone || M.saved?.phone || "")}" autocomplete="tel">
      <button class="btn" data-act="copy-sms">Text me a copy</button>
      <label class="fl" for="cp-email">Email</label><input class="in" id="cp-email" type="email" value="${esc(M.a.email || M.saved?.email || "")}" autocomplete="email">
      <button class="btn ghost" data-act="copy-email">Email me a copy</button></div>
    ${M.demo ? `<button class="btn quiet" data-act="demo-reset">Start the demo over</button>` : ""}</div>`;
}
const allCommitted = () => (M.church.commitments || []).every((x) => M.commits.includes(x.k));

function renderMember() {
  if (!M) return;
  const s = stepName();
  const inPart1 = M.i >= 1 && M.i <= PART1;
  let pct = 0, plabel = "";
  if (inPart1) { pct = Math.round((M.i / PART1) * 100); plabel = `Part 1 · ${M.i} of ${PART1}`; }
  if (s === "gifts") { pct = Math.round(((M.q + 1) / PAIRS.length) * 100); plabel = `Part 2 · ${M.q + 1} of ${PAIRS.length}`; }
  const top = s === "welcome" || s === "sent" ? "" : `<div class="ptop"><div class="prow">${s === "commit" || s === "decide" || s === "baptismfirst" || M.i > 0 ? `<button class="round" aria-label="Back" data-act="back">${ICON.back}</button>` : `<span class="spacer"></span>`}${MARK}<span class="spacer"></span></div>
    ${plabel ? `<div class="plabel">${plabel}</div><div class="bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct}%"></span></div>` : ""}</div>`;
  const labels = { welcome: "Get started", prayer: "Finish Part 1", pause: "Start Part 2", results: "Continue after my one-on-one", commit: "Submit" };
  const showCta = !["gifts", "decide", "baptismfirst", "sent"].includes(s);
  const locked = s === "commit" && !allCommitted();
  const sheet = M.sheet ? `<div class="sheetwrap" data-act="sheet-close-bg"><div class="sheet" role="dialog" aria-modal="true" aria-label="What we believe"><div class="sheethead"><div><h2>What we believe</h2><div class="small">The short version</div></div><button class="round" aria-label="Close" data-act="sheet-close">${ICON.x}</button></div>
    <div class="sheetbody">${(M.church.beliefs || []).map((b) => `<div class="belief"><span class="cw">${esc(b.word)}</span><p>${esc(b.text)}</p><span class="small">${esc(b.verse)}</span></div>`).join("")}<p class="sub" style="font-size:14px;margin-top:16px">Want the full statement? Ask your leader in your one-on-one.</p></div></div></div>` : "";
  $("#app").innerHTML = `<div class="phone">${top}${screen()}${M.error ? `<div style="padding:0 24px"><div class="err" role="alert">${esc(M.error)}</div></div>` : ""}
    ${showCta ? `<div class="pfoot"><button class="cta" data-act="next" aria-disabled="${locked || M.busy}">${M.busy ? "Saving…" : labels[s] || "Continue"}</button></div>` : ""}</div>${sheet}`;
}

async function memberAct(act, el) {
  const s = stepName();
  if (act === "single") { M.a[el.dataset.k] = el.dataset.v; return renderMember(); }
  if (act === "multi") { const k = el.dataset.k, v = el.dataset.v, cur = M.a[k] || []; M.a[k] = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]; return renderMember(); }
  if (act === "back") {
    if (s === "gifts" && M.q > 0) { M.q--; return renderMember(); }
    if (s === "commit" || s === "baptismfirst") { M.i = STEPS.indexOf("decide"); return renderMember(); }
    M.i = Math.max(0, M.i - 1); if (stepName() === "gifts") M.q = PAIRS.length - 1;
    return renderMember();
  }
  if (act === "pick") {
    M.picks[M.q] = el.dataset.v;
    if (M.q >= PAIRS.length - 1) { M.i = STEPS.indexOf("results"); renderMember(); await persist(); return renderMember(); }
    M.q++; renderMember();
    if (M.q % 3 === 0) persist(); // save every few answers; the rest are kept in this page until then
    return;
  }
  if (act === "next") {
    if (M.busy) return;
    if (s === "commit") { if (!allCommitted()) return; return doSubmit("joining"); }
    if (s === "welcome") M.a.adult = true;
    if (s === "about" && !(M.a.name || "").trim()) { M.error = "Add your name so our team knows who you are."; return renderMember(); }
    // Simulation, 23 Oct 2026: with no email or phone nobody could follow up, so one of them is required
    if (s === "about" && !(M.a.email || "").trim() && !(M.a.phone || "").trim()) { M.error = "Add an email or phone number so we can follow up with your next steps."; return renderMember(); }
    M.i = Math.min(M.i + 1, STEPS.indexOf("decide"));
    if (stepName() === "gifts") { M.q = 0; while (M.q < PAIRS.length - 1 && M.picks[M.q]) M.q++; if (M.picks.length >= PAIRS.length && M.picks.every(Boolean)) M.i = STEPS.indexOf("results"); }
    M.busy = true; renderMember(); await persist(); M.busy = false; return renderMember();
  }
  if (act === "ready") {
    if (!M.demo) { try { const r = await L.open(M.key); if (r?.church) M.church = r.church; } catch {} }
    // Baptism comes first when the church requires it
    if (!canJoin(M.a, M.church.requireBaptism !== false)) { M.i = STEPS.indexOf("baptismfirst"); return renderMember(); }
    M.commits = M.commits.filter((k) => (M.church.commitments || []).some((x) => x.k === k));
    M.i = STEPS.indexOf("commit"); return renderMember();
  }
  if (act === "notready") return doSubmit("not_ready");
  if (act === "fixfaith") { M.i = STEPS.indexOf("faith"); return renderMember(); }
  if (act === "copy-sms" || act === "copy-email") {
    const sms = act === "copy-sms", to = ($(sms ? "#cp-phone" : "#cp-email")?.value || "").trim();
    if (!to) { M.error = sms ? "Add your phone number first." : "Add your email first."; return renderMember(); }
    const body = encodeURIComponent(copyText());
    location.href = sms ? `sms:${to.replace(/[^0-9+]/g, "")}?&body=${body}` : `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(M.church.name + ": my gifts and next steps")}&body=${body}`;
    return;
  }
  if (act === "commit") { const k = el.dataset.v; M.commits = M.commits.includes(k) ? M.commits.filter((x) => x !== k) : [...M.commits, k]; return renderMember(); }
  if (act === "sheet") { M.sheet = true; return renderMember(); }
  if (act === "sheet-close" || act === "sheet-close-bg") { M.sheet = false; return renderMember(); }
  if (act === "demo-reset") { L.resetDemo(); return startMember("demo"); }
}

async function doSubmit(decision) {
  M.busy = true; M.decision = decision; renderMember();
  try {
    await L.submit(M.key, M.a, M.picks, decision, decision === "joining" ? M.commits : []);
    M.i = STEPS.indexOf("sent"); M.error = null;
    if (!M.demo) { try { const r = await L.open(M.key); if (r?.member) M.saved = r.member; } catch {} }
  } catch (e) { M.error = errMsg(e); }
  M.busy = false; renderMember();
}

// ================= STAFF =================
// Three levels: Administrator (everything), Staff (no settings or team management), Team Lead (their own teams,
// steps assigned to them, and interview mode for a class they're helping with). The database enforces all of this;
// these screens just don't offer what someone can't do.
const V = { filter: "all", inviteLink: null, signinSent: null, snapOpen: false, connMsg: null, connForm: null, exportFilter: "all", exportClass: "", imp: null };
const P = () => L.state;
const memberById = (id) => P().members.find((m) => m.id === id);
const giftsOf = (m) => (m.gifts_override?.length ? m.gifts_override : m.top_gifts || []);
const teamOf = (m) => m.team || (m.rec_teams || [])[0] || "";
// "Joined" only once a pastor approves after the one-on-one (owner, 23 Oct 2026)
const statusOf = (m) => (m.status !== "submitted" ? ["In progress", "pill"] : m.decision !== "joining" ? ["Not ready yet", "pill warn"]
  : m.approved_at ? ["Joined", "pill ok"] : m.held_at ? ["On hold", "pill late"] : (m.answers || {}).bapt !== "Yes" ? ["Joining after baptism", "pill warn"] : ["Waiting for approval", "pill warn"]);
const waiting = () => P().members.filter((m) => m.status === "submitted" && m.decision === "joining" && !m.approved_at && !m.held_at);
const faithFlag = (a = {}) => a.faith !== "Yes" || a.bapt !== "Yes";
const churchSet = () => L.active()?.settings || {};
const guideHtml = () => `<details class="panel guide"><summary><b>One-on-one guide</b></summary>${lines(churchSet().guide || DEFAULT_GUIDE).map((g) => `<p><b>${esc(g.title)}.</b> ${esc(g.text)}</p>`).join("")}</details>`;
const spouseOf = (m) => {
  const n = (x) => String(x || "").trim().toLowerCase();
  return P().members.find((o) => o.id !== m.id && o.class_id === m.class_id && ((n(m.answers?.spouseName) && n(o.name) === n(m.answers.spouseName)) || (n(o.answers?.spouseName) && n(o.answers.spouseName) === n(m.name))));
};
function approveForm(m) {
  return `<div class="q"><div class="row"><button class="btn" data-act="approve" data-id="${m.id}">Approve</button></div>
    <form data-form="hold" data-id="${m.id}" class="inline"><input class="in" name="note" maxlength="1000" placeholder="Private note for the team (optional)" aria-label="Why it's on hold"><button class="btn quiet" type="submit">Put on hold</button></form></div>`;
}
const openSteps = () => P().steps.filter((s) => !s.done_at);
const isLate = (s) => !s.done_at && s.due && s.due < today();
const teamNames = () => (L.active()?.settings?.teams || []).map((t) => t.name);
const personName = (uid) => { const t = P().team.find((x) => x.user_id === uid); return t ? t.name || t.email : ""; };
const myClasses = () => P().classes; // the database returns only the classes this person may see

function staffNav() {
  const r = L.myRole(), items = [];
  if (L.isCore()) items.push(["home", "Today"], ["people", "People"], ["classes", "Classes"], ["handoff", "Team handoff"]);
  if (r === "team_lead") { items.push(["handoff", "My team"]); if (myClasses().length) items.push(["classes", "Class"]); }
  if (L.prayerOk()) items.push(["prayer", "Prayer"]);
  if (r === "admin") items.push(["settings", "Settings"]);
  items.push(["account", "Account"]);
  return items;
}
function staffHeader() {
  const c = L.active();
  if (!c) { $("#top").innerHTML = `<div class="shead"><div class="shead-in"><div class="who">${MARK}</div>${P().session ? `<button class="navb" data-act="nav" data-to="account">Account</button>` : ""}</div></div>`; return; }
  setAccent(c.accent);
  const cur = route.name === "person" ? (L.isCore() ? "people" : "classes") : route.name === "class" ? "classes" : route.name;
  $("#top").innerHTML = `<div class="shead"><div class="shead-in"><div class="who">${logoBox(c)}<div><b>${esc(c.name)}</b>${MARK} <span class="small">· ${esc(ROLE_NAMES[L.myRole()] || "")}</span></div></div>
    <nav class="snav" aria-label="Sections">${staffNav().map(([k, l]) => `<button class="navb" data-act="nav" data-to="${k}" ${cur === k ? 'aria-current="page"' : ""}>${l}</button>`).join("")}
    ${P().churches.length > 1 ? `<select class="in" style="width:auto" data-act-change="church" aria-label="Church">${P().churches.map((x) => `<option value="${x.id}" ${x.id === c.id ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select>` : ""}</nav></div></div>`;
}

function render() {
  $("#foot").innerHTML = "";
  if (route.name === "privacy" || route.name === "terms") { $("#top").innerHTML = ""; $("#app").innerHTML = `<main class="smain" style="max-width:760px">${route.name === "privacy" ? privacyPage() : termsPage()}<p><a href="#/">← Back</a></p></main>`; return; }
  if (route.name === "invite") return renderInvite();
  if (!L.LIVE) { $("#top").innerHTML = ""; $("#app").innerHTML = `<div class="signin"><div>${MARK}</div><h1>Not connected yet</h1><p class="sub">The database settings aren't in this build. You can still try the member flow on this device.</p><a class="btn" href="#/demo" style="text-align:center;text-decoration:none">Try the member flow</a></div>`; return; }
  if (!P().session) return renderSignIn();
  if (!P().loaded) { $("#app").innerHTML = `<div class="signin"><p class="sub">Loading…</p></div>`; return; }
  if (P().error) { staffHeader(); $("#app").innerHTML = `<div class="signin"><div class="err">${esc(P().error)}</div><button class="btn" data-act="reload">Try again</button><button class="btn quiet" data-act="signout">Sign out</button></div>`; return; }
  if (!L.active()) { if (route.name === "account") { staffHeader(); $("#app").innerHTML = `<main class="smain">${viewAccount()}</main>`; return; } return renderCreateChurch(); }
  staffHeader();
  let name = route.name;
  const allowed = staffNav().map(([k]) => k).concat(["person", "class"]);
  if (!allowed.includes(name)) name = staffNav()[0][0];
  if (name === "person" && !memberById(route.arg)) name = staffNav()[0][0];
  if (name === "class" && !P().classes.some((k) => k.id === route.arg)) name = staffNav()[0][0];
  const views = { home: viewHome, people: viewPeople, person: viewPerson, classes: viewClasses, class: viewClass, handoff: viewHandoff, prayer: viewPrayer, settings: viewSettings, account: viewAccount };
  $("#app").innerHTML = `<main class="smain">${views[name]()}</main>`;
}

function renderSignIn() {
  $("#top").innerHTML = "";
  const scan = N.NATIVE ? `<div class="card q"><h2 style="font-size:20px">In a membership class?</h2><p class="sub">Scan the code on the screen to start.</p><button class="cta" data-act="scan">Scan the class code</button></div>` : "";
  $("#app").innerHTML = `<div class="signin"><div>${MARK}</div>${scan}<h1>Staff sign in <span class="pill ok" style="vertical-align:middle">Beta</span></h1>
    ${V.signinSent ? `<p class="sub">Check <b>${esc(V.signinSent)}</b>. ${N.NATIVE ? "Type the 6-digit code from the email:" : "Tap the link in the email to sign in. You can close this tab."}</p>
      ${N.NATIVE ? `<form data-form="code" class="q"><input class="in" id="si-code" inputmode="numeric" autocomplete="one-time-code" maxlength="10" required aria-label="Code from the email"><button class="btn" type="submit">Sign in</button></form>` : ""}
      <button class="namebtn" data-act="signin-again">Use a different email</button>`
    : `<p class="sub">We'll email you a ${N.NATIVE ? "code" : "link"}. No password needed.</p>
    <form data-form="signin" class="q"><label class="fl" for="si-email">Email</label><input class="in" id="si-email" type="email" required autocomplete="email"><button class="btn" type="submit">Email me a ${N.NATIVE ? "code" : "link"}</button></form>`}
    ${N.NATIVE ? "" : `<p class="fine">Here for membership class? Scan the code on the screen with your phone's camera.</p>`}
    <p class="fine"><a href="#/privacy">Privacy</a> · <a href="#/terms">Terms</a></p></div>`;
}
function renderCreateChurch() {
  staffHeader();
  $("#app").innerHTML = `<div class="signin"><h1>Set up your church</h1><p class="sub">You'll be its Administrator. You can add your logo, color and team next.</p>
    <form data-form="church" class="q"><label class="fl" for="c-name">Church name</label><input class="in" id="c-name" required maxlength="120"><label class="fl" for="c-self">Your name</label><input class="in" id="c-self" maxlength="120"><button class="btn" type="submit">Create</button></form>
    <p class="fine">Joining a church that's already set up? Open the invite link you were sent.</p></div>`;
}
async function renderInvite() {
  $("#top").innerHTML = "";
  if (!L.LIVE) { $("#app").innerHTML = `<div class="signin"><h1>Not connected</h1></div>`; return; }
  let info = null; try { info = await L.inviteInfo(route.arg); } catch {}
  if (!info) { $("#app").innerHTML = `<div class="signin"><h1>This invite has expired</h1><p class="sub">Ask your church's Administrator for a new one.</p></div>`; return; }
  const lvl = `${esc(ROLE_NAMES[info.role] || info.role)}${info.teams?.length ? ` for ${esc(info.teams.join(", "))}` : ""}`;
  if (!P().session) { $("#app").innerHTML = `<div class="signin"><div>${MARK}</div><h1>Join ${esc(info.church)}</h1><p class="sub">You've been invited as ${lvl}. Sign in with <b>${esc(info.email)}</b> to accept.</p>
    ${V.signinSent ? `<p class="sub">Check your email to sign in.</p>${N.NATIVE ? `<form data-form="code" class="q"><input class="in" id="si-code" inputmode="numeric" maxlength="10" required aria-label="Code from the email"><button class="btn" type="submit">Sign in</button></form>` : ""}` : `<form data-form="signin" data-back="#/invite/${esc(route.arg)}" class="q"><input class="in" id="si-email" type="email" value="${esc(info.email)}" required aria-label="Email"><button class="btn" type="submit">Email me a ${N.NATIVE ? "code" : "link"}</button></form>`}</div>`; return; }
  $("#app").innerHTML = `<div class="signin"><div>${MARK}</div><h1>Join ${esc(info.church)}</h1><p class="sub">As ${lvl}.</p><form data-form="accept" class="q"><label class="fl" for="ac-name">Your name</label><input class="in" id="ac-name" maxlength="120"><button class="btn" type="submit">Accept invite</button></form></div>`;
}

function stepRow(s, showWho = true) {
  const m = memberById(s.member_id);
  const owner = s.owner_user ? personName(s.owner_user) : s.owner_label;
  const core = L.isCore();
  const mine = s.owner_user === L.uid();
  return `<div class="taskrow"><button class="tick" aria-pressed="${!!s.done_at}" aria-label="Done: ${esc(s.title)}" data-act="step-done" data-id="${s.id}" ${core || mine ? "" : "disabled"}>${ICON.check(14)}</button>
    <div class="t"><b class="${s.done_at ? "done" : ""}">${esc(s.title)}</b><span class="small">${showWho && m ? `<button class="namebtn" style="min-height:0;font-size:13px" data-act="person" data-id="${m.id}">${esc(m.name || "No name")}</button> · ` : ""}${esc(owner || "No owner")}</span></div>
    ${core ? `<select class="in" style="width:auto;min-height:40px;padding:6px 8px;font-size:13px" data-act-change="step-owner" data-id="${s.id}" aria-label="Owner"><option value="">${esc(s.owner_label || "No owner")}</option>${P().team.map((t) => `<option value="${t.user_id}" ${s.owner_user === t.user_id ? "selected" : ""}>${esc(t.name || t.email)}</option>`).join("")}</select>
      <input type="date" class="in" style="width:auto;min-height:40px;padding:6px 8px;font-size:13px" value="${esc(s.due || "")}" data-act-change="step-due" data-id="${s.id}" aria-label="Due date">` : ""}
    <span class="${isLate(s) ? "pill late" : "pill"}">${isLate(s) ? "Overdue · " : ""}${s.due ? fmt(s.due) : "No date"}</span></div>`;
}

function snapshotPanel() {
  const s = P().snapshot;
  if (!s) return "";
  const max = Math.max(1, ...Object.values(s.gifts || {}));
  const ranked = GIFT_KEYS.slice().sort((a, b) => (s.gifts[b] || 0) - (s.gifts[a] || 0));
  const summary = s.people ? `Strongest in ${GIFTS[ranked[0]]} · thinnest in ${GIFTS[ranked[ranked.length - 1]]}` : "Fills in as people join";
  return `<section class="panel"><button class="namebtn" style="color:var(--ink);text-decoration:none;display:flex;gap:12px;align-items:center;width:100%" data-act="snap" aria-expanded="${V.snapOpen}">
    <span class="grow" style="display:flex;flex-direction:column;gap:2px"><span style="font-size:20px;font-weight:800">Church snapshot</span><span class="small" style="font-weight:500">${esc(summary)}</span></span><span aria-hidden="true">${V.snapOpen ? "▲" : "▼"}</span></button>
    ${V.snapOpen ? `<p class="hint">${s.people} members who've taken the assessment. Each person counts once for each of their top 3 gifts. Counts only, never names.</p>
      <div class="cols"><div class="panel" style="border:none;padding:0"><h2 style="font-size:16px">Gifts across the church</h2>${ranked.map((g) => `<div class="giftbar"><span>${GIFTS[g]}</span><span class="bar"><span style="width:${Math.round(((s.gifts[g] || 0) / max) * 100)}%"></span></span><b>${s.gifts[g] || 0}</b></div>`).join("")}</div>
      <div class="panel" style="border:none;padding:0"><h2 style="font-size:16px">Teams</h2>${(s.teams || []).map((t) => `<div class="taskrow"><div class="t"><b>${esc(t.name)}</b><span class="small">${t.serving} serving now${t.fromSource ? ` (${esc(L.SYSTEMS[s.source] || "")})` : ""} · ${t.gifted} gifted members not placed yet</span></div></div>`).join("")}</div></div>` : ""}</section>`;
}

function viewHome() {
  const ms = P().members;
  const sub = ms.filter((m) => m.status === "submitted");
  const joined = sub.filter((m) => m.decision === "joining" && m.approved_at).length;
  const open = openSteps();
  const late = open.filter(isLate);
  const latest = P().classes[0];
  return `<div class="row"><div class="grow"><h1>Today</h1><p class="sub">${latest ? `Latest class: ${esc(latest.name)} · ${fmt(latest.class_date)}` : "No classes yet."}</p></div><button class="btn" data-act="nav" data-to="classes">New class</button></div>
    <div class="tiles"><div class="tile"><span>Finished the class</span><b>${sub.length}</b></div><div class="tile"><span>Joined</span><b style="color:var(--accent)">${joined}</b></div><div class="tile"><span>Waiting for approval</span><b>${waiting().length}</b></div><div class="tile"><span>Not ready yet</span><b>${sub.filter((m) => m.decision === "not_ready").length}</b></div><div class="tile dark"><span>Open next steps</span><b>${open.length}</b></div></div>
    ${waiting().length ? `<section class="panel" style="border:2px solid var(--accent)"><h2>Waiting for approval</h2><p class="hint">They chose to join. Approve after their one-on-one, or put it on hold with a private note. Team leads only see people you approve.</p>
      ${waiting().map((m) => `<div class="taskrow"><div class="t"><b><button class="namebtn" data-act="person" data-id="${m.id}">${esc(m.name || "No name")}</button></b><span class="small">${esc(giftsOf(m).map((g) => GIFTS[g]).join(", "))}${faithFlag(m.answers) ? ` · <b style="color:var(--warm-ink)">Check faith and baptism</b>` : ""}</span></div><button class="btn" data-act="approve" data-id="${m.id}">Approve</button></div>`).join("")}</section>` : ""}
    ${late.length ? `<section class="panel" style="border:2px solid var(--warm)"><h2>Needs attention</h2><p class="hint">Next steps past their due date.</p>${late.map((s) => stepRow(s)).join("")}</section>` : ""}
    <section class="panel"><h2>Next steps checklist</h2><p class="hint">Every step has an owner and a due date. Tap to check off.</p>${open.length ? open.map((s) => stepRow(s)).join("") : `<p class="sub">All caught up.</p>`}</section>
    ${snapshotPanel()}`;
}

function viewPeople() {
  const f = V.filter;
  const list = P().members.filter((m) => f === "all" || (f === "joined" ? m.decision === "joining" && m.approved_at : f === "waiting" ? m.status === "submitted" && m.decision === "joining" && !m.approved_at : f === "notready" ? m.decision === "not_ready" : m.status !== "submitted"));
  return `<div class="row"><h1 class="grow">People</h1><div class="filters">${[["all", "All"], ["joined", "Joined"], ["waiting", "Waiting"], ["notready", "Not ready"], ["progress", "In progress"]].map(([k, l]) => `<button class="pillbtn" aria-pressed="${f === k}" data-act="filter" data-v="${k}">${l}</button>`).join("")}</div></div>
    <section class="panel"><div class="tablewrap"><table><thead><tr><th>Name</th><th>Top gifts</th><th>Team</th><th>Can serve</th><th>Status</th></tr></thead><tbody>
    ${list.map((m) => { const [st, cls] = statusOf(m); return `<tr><td><button class="namebtn" data-act="person" data-id="${m.id}">${esc(m.name || "No name yet")}</button></td><td>${esc(giftsOf(m).map((g) => GIFTS[g]).join(", "))}</td><td>${esc(teamOf(m))}</td><td style="color:var(--quiet)">${esc(m.answers?.when || "")}</td><td><span class="${cls}">${st}</span></td></tr>`; }).join("") || `<tr><td colspan="5" style="color:var(--quiet)">No one here yet.</td></tr>`}
    </tbody></table></div></section>
    ${exportPanel()}`;
}

// Spreadsheet export: Administrators and Staff. Opens in Excel, Google Sheets, Numbers, and imports into most church software.
function exportPanel() {
  if (!L.isCore()) return "";
  return `<section class="panel"><h2>Export to a spreadsheet</h2><p class="hint">A CSV file that opens in Excel, Google Sheets or Numbers, with columns most church software can import (first name, last name, email, phone, membership status, gifts, team). Prayer requests and one-on-one notes are never included.</p>
    <div class="inline"><select class="in" data-act-change="export-filter" aria-label="Who to export">${[["all", "Everyone"], ["joined", "Joined"], ["not_ready", "Not ready yet"], ["in_progress", "In progress"]].map(([k, l]) => `<option value="${k}" ${V.exportFilter === k ? "selected" : ""}>${l}</option>`).join("")}</select>
      <select class="in" data-act-change="export-class" aria-label="Class"><option value="">All classes</option>${P().classes.map((k) => `<option value="${k.id}" ${V.exportClass === k.id ? "selected" : ""}>${esc(k.name)}</option>`).join("")}</select></div>
    <div class="row"><button class="btn" data-act="export-people">Download people (CSV)</button><button class="btn ghost" data-act="export-steps">Download open next steps (CSV)</button></div></section>`;
}

function viewPerson() {
  const m = memberById(route.arg);
  if (!P().notes[m.id]) L.loadNotes(m.id).catch(() => {});
  const core = L.isCore();
  const [st, cls] = statusOf(m);
  const a = m.answers || {};
  const teams = L.active().settings?.teams || [];
  const scores = m.scores || countGifts(m.picks || []);
  const ranked = GIFT_KEYS.slice().sort((x, y) => (scores[y] || 0) - (scores[x] || 0));
  const gifts = giftsOf(m);
  const steps = P().steps.filter((s) => s.member_id === m.id);
  const comm = Object.entries(m.commitments || {});
  const commList = L.active().settings?.commitments || [];
  const notes = P().notes[m.id] || [];
  const back = core ? `<button class="btn quiet" data-act="nav" data-to="people">← People</button>` : `<button class="btn quiet" data-act="class" data-id="${m.class_id}">← Class</button>`;
  const sp = spouseOf(m);
  const iv = m.interviewer ? personName(m.interviewer) : "";
  const pending = m.status === "submitted" && m.decision === "joining" && !m.approved_at;
  return `<div class="row">${back}<h1 class="grow">${esc(m.name || "No name yet")}</h1><span class="${cls}">${st}</span>${m.ext_person_id ? `<span class="pill ok">In ${esc(L.SYSTEMS[m.ext_system] || "")}</span>` : ""}</div>
  ${core && pending ? `<section class="panel" style="border:2px solid var(--accent)"><h2>${m.held_at ? "On hold" : "Approve joining"}</h2>
    <p class="hint">${m.held_at ? `Put on hold ${fmt(m.held_at)}.${m.hold_note ? ` Note: ${esc(m.hold_note)}` : ""}` : "They chose to join and made every commitment. Approve after their one-on-one."}${faithFlag(a) ? ` <b style="color:var(--warm-ink)">They answered faith "${esc(a.faith || "")}" and baptized "${esc(a.bapt || "")}". Talk about this before approving.</b>` : ""}</p>${approveForm(m)}</section>` : ""}
  ${m.status !== "submitted" || pending ? guideHtml() : ""}
  <div class="cols">
    <section class="panel"><h2>Gifts</h2>
      ${m.scores ? ranked.map((g) => `<div class="giftbar"><span>${GIFTS[g]}${gifts.includes(g) ? " ★" : ""}</span><span class="bar"><span style="width:${Math.round(((scores[g] || 0) / 6) * 100)}%"></span></span><b>${scores[g] || 0} of 6</b></div>`).join("") : `<p class="sub">Gifts show once they finish Part 2.</p>`}
      ${m.gifts_override?.length ? `<p class="hint">★ Top gifts changed by a leader (assessment said ${esc((m.top_gifts || []).map((g) => GIFTS[g]).join(", "))}).</p>` : m.scores ? `<p class="hint">★ Top 3 from the assessment.</p>` : ""}
      ${m.status === "submitted" ? `<form data-form="gifts" data-id="${m.id}" class="q"><span class="fl">Leader adjustment</span><div class="inline">${[0, 1, 2].map((n) => `<select class="in" name="g${n}" aria-label="Gift ${n + 1}"><option value="">—</option>${GIFT_KEYS.map((g) => `<option value="${g}" ${gifts[n] === g ? "selected" : ""}>${GIFTS[g]}</option>`).join("")}</select>`).join("")}</div>
        <div class="inline"><select class="in" name="team" aria-label="Team"><option value="">No team yet</option>${teams.map((t) => `<option ${teamOf(m) === t.name ? "selected" : ""}>${esc(t.name)}</option>`).join("")}</select><button class="btn" type="submit">Save</button></div>
        <p class="hint">Recommended: ${esc((m.rec_teams || []).join(", ") || "none yet")}${m.first_sunday ? ` · First Sunday ${fmt(m.first_sunday)}` : ""}</p></form>` : ""}
    </section>
    <section class="panel"><h2>About</h2><dl class="kv">
      <dt>Email</dt><dd>${esc(m.email || "")}</dd><dt>Phone</dt><dd>${esc(m.phone || "")}</dd>
      <dt>Household</dt><dd>${esc([a.married, a.kids && a.kids !== "No kids" ? `${a.kids} kid${a.kids === "1" ? "" : "s"}${a.kidsAges ? ` (${a.kidsAges})` : ""}` : a.kids].filter(Boolean).join(" · "))}</dd>
      <dt>Faith in Jesus</dt><dd>${esc(a.faith || "")}</dd><dt>Baptized</dt><dd>${esc(a.bapt || "")}</dd><dt>In a group</dt><dd>${esc(a.group || "")}</dd>
      <dt>Found us</dt><dd>${esc(a.found || "")}</dd><dt>Served before</dt><dd>${esc([a.served, a.servedWhere].filter(Boolean).join(" · "))}</dd>
      <dt>Skills</dt><dd>${esc((a.skills || []).join(", "))}</dd><dt>Passions</dt><dd>${esc((a.passions || []).join(", "))}</dd>
      <dt>Can serve</dt><dd>${esc([a.when, a.often].filter(Boolean).join(" · "))}</dd>
      <dt>Commitments</dt><dd>${comm.length ? `All ${comm.length} on ${fmt(comm[0][1])}` : m.decision === "not_ready" ? "Not ready yet" : "Not yet"}</dd>
      ${sp ? `<dt>Spouse</dt><dd><button class="namebtn" data-act="person" data-id="${sp.id}">${esc(sp.name)}</button></dd>` : a.spouseName ? `<dt>Spouse</dt><dd>${esc(a.spouseName)}</dd>` : ""}
      <dt>One-on-one</dt><dd>${core ? `<select class="in" style="width:auto;min-height:40px" data-act-change="interviewer" data-id="${m.id}" aria-label="One-on-one leader"><option value="">Not paired yet</option>${P().team.map((t) => `<option value="${t.user_id}" ${m.interviewer === t.user_id ? "selected" : ""}>${esc(t.name || t.email)}</option>`).join("")}</select>` : esc(iv || "Not paired yet")}</dd></dl>
      ${comm.length ? `<p class="hint">${esc(commList.filter((x) => m.commitments[x.k]).map((x) => x.word).join(" · "))}</p>` : ""}
    </section>
  </div>
  <div class="cols">
    ${core ? `<section class="panel"><h2>Next steps</h2>${steps.map((s) => stepRow(s, false)).join("") || `<p class="sub">None yet.</p>`}
      <form data-form="step" data-id="${m.id}" class="inline"><input class="in" name="title" placeholder="Add a step" required maxlength="200" aria-label="New step">
      <select class="in" name="owner" aria-label="Owner"><option value="">No owner</option>${P().team.map((t) => `<option value="${t.user_id}">${esc(t.name || t.email)}</option>`).join("")}</select>
      <input class="in" type="date" name="due" style="flex:0 1 160px" aria-label="Due date"><button class="btn" type="submit">Add</button></form></section>` : ""}
    <section class="panel"><h2>One-on-one notes</h2>${notes.map((n) => `<div class="prayer" style="flex:none"><p>${esc(n.body)}</p><span class="small">${esc(n.author_name || "")} · ${fmt(n.created_at)}</span></div>`).join("") || `<p class="sub">No notes yet.</p>`}
      <form data-form="note" data-id="${m.id}" class="q"><label class="fl" for="n-body">Add a note</label><textarea class="in" id="n-body" name="body" required maxlength="4000" style="min-height:96px"></textarea><button class="btn" type="submit" style="align-self:flex-start">Save note</button></form></section>
  </div>
  ${L.can("admin") ? `<p class="fine"><button class="namebtn" style="color:var(--warm-ink)" data-act="delete-member" data-id="${m.id}">Delete this person's data</button> (only when they ask; this can't be undone)</p>` : ""}`;
}

function viewClasses() {
  const core = L.isCore();
  return `<div class="row"><h1 class="grow">${core ? "Classes" : "Your class"}</h1></div>
    ${core ? `<section class="panel"><h2>New class</h2><form data-form="class" class="inline"><input class="in" name="name" placeholder="e.g. Growth Track · November" required maxlength="120" aria-label="Class name"><input class="in" type="date" name="date" value="${today()}" style="flex:0 1 180px" aria-label="Class date"><button class="btn" type="submit">Create</button></form></section>` : `<p class="sub">You're helping with one-on-ones. Tap a class to see its people.</p>`}
    <section class="panel"><h2>${core ? "All classes" : "Classes you're helping with"}</h2>${P().classes.map((k) => { const n = P().members.filter((m) => m.class_id === k.id); return `<div class="taskrow"><div class="t"><b><button class="namebtn" data-act="class" data-id="${k.id}">${esc(k.name)}</button></b><span class="small">${fmt(k.class_date)} · ${n.filter((m) => m.status === "submitted").length} of ${n.length} finished</span></div><span class="${k.open ? "pill ok" : "pill"}">${k.open ? "Open" : "Closed"}</span></div>`; }).join("") || `<p class="sub">No classes yet.</p>`}</section>`;
}

function viewClass() {
  const k = P().classes.find((x) => x.id === route.arg);
  const core = L.isCore();
  const link = L.joinLink(k.join_code);
  let img = "";
  try { const qr = qrcode(0, "M"); qr.addData(link); qr.make(); img = qr.createDataURL(8, 2); } catch {}
  const ms = P().members.filter((m) => m.class_id === k.id);
  const leaders = P().classLeaders.filter((c) => c.class_id === k.id).map((c) => c.user_id);
  return `<div class="row"><button class="btn quiet" data-act="nav" data-to="classes">← Classes</button><h1 class="grow">${esc(k.name)}</h1><span class="${k.open ? "pill ok" : "pill"}">${k.open ? "Open" : "Closed"}</span></div>
    <div class="cols">${core ? `<section class="panel"><h2>Put this on the screen</h2><p class="hint">People scan it with their phone camera, or with the Here To Serve app. No download needed.</p>
      ${img ? `<img class="qr" src="${img}" alt="QR code for the class link">` : ""}
      <p class="hint" style="margin-bottom:0">Can't scan? Go to <b>${esc(L.typeUrl())}</b> and type:</p><div class="code" style="font-size:28px;letter-spacing:.08em;text-align:center">${esc(showCode(k.join_code))}</div>
      <p class="fine">Answers save on each phone as people go, so a weak signal won't lose anything. Put your Wi-Fi name and password on the screen too.</p>
      <div class="row"><button class="btn ghost" data-act="copy" data-v="${esc(link)}">Copy link</button><button class="btn quiet" data-act="class-open" data-id="${k.id}" data-v="${k.open ? "0" : "1"}">${k.open ? "Close the class" : "Reopen the class"}</button></div>
      <p class="fine">Links stop taking new people 30 days after the class date, or when you close the class.</p>
      <h2 style="margin-top:8px">One-on-one leaders</h2><p class="hint">Team Leads you add here can see and take notes on this class's people while the class is open.</p>
      ${P().team.filter((t) => t.role === "team_lead").map((t) => `<label class="taskrow" style="cursor:pointer"><input type="checkbox" data-act-change="class-leader" data-id="${k.id}" data-user="${t.user_id}" ${leaders.includes(t.user_id) ? "checked" : ""} style="width:22px;height:22px"><span class="t"><b>${esc(t.name || t.email)}</b><span class="small">Team Lead · ${esc((t.teams || []).join(", "))}</span></span></label>`).join("") || `<p class="sub">No Team Leads yet. An Administrator invites them in Settings.</p>`}</section>` : ""}
    ${runPanel()}
    <section class="panel ${core ? "wide" : ""}"><h2>In this class</h2><p class="hint">${core ? "Updates live as people finish. Pair each person with a one-on-one leader." : "Your one-on-ones are first. Tap a name for their card: add notes and adjust their gifts or team."}</p>
      ${(() => { const empty = ms.filter((m) => m.status !== "submitted" && !m.name).length; return empty ? `<p class="hint">${empty} ${empty === 1 ? "phone has" : "phones have"} opened the form without a name yet. If someone scanned twice on another phone, that extra one can be ignored.</p>` : ""; })()}
      ${ms.filter((m) => m.status === "submitted" || m.name).sort((x, y) => (y.interviewer === L.uid()) - (x.interviewer === L.uid())).map((m) => { const [st, cls] = statusOf(m); return `<div class="taskrow"><div class="t"><b><button class="namebtn" data-act="person" data-id="${m.id}">${esc(m.name || "Just started")}</button></b><span class="small">${m.status === "submitted" ? esc(giftsOf(m).map((g) => GIFTS[g]).join(", ")) : `Step ${m.step} of ${STEPS.length - 1}`}${!core && m.interviewer === L.uid() ? " · your one-on-one" : ""}</span></div>
        ${core ? `<select class="in" style="width:auto;min-height:40px;font-size:13px" data-act-change="interviewer" data-id="${m.id}" aria-label="One-on-one leader for ${esc(m.name || "")}"><option value="">One-on-one with…</option>${P().team.map((t) => `<option value="${t.user_id}" ${m.interviewer === t.user_id ? "selected" : ""}>${esc(t.name || t.email)}</option>`).join("")}</select>` : ""}<span class="${cls}">${st}</span></div>`; }).join("") || `<p class="sub">No one has scanned in yet.</p>`}</section></div>`;
}

// The host's run sheet: the script, the lead pastor's video and the one-on-one guide
function runPanel() {
  const st = churchSet(), jt = String(st.joinTerm || DEFAULT_JOIN_TERM);
  const video = safeUrl(st.videoUrl);
  return `<section class="panel wide"><h2>Run the class</h2>
    ${video ? `<a class="btn" style="align-self:flex-start;text-decoration:none" href="${esc(video)}" target="_blank" rel="noopener">Play the lead pastor's video</a>` : `<p class="hint">Add the lead pastor's video link in Settings and a play button shows here.</p>`}
    <ol class="script">${lines(st.hostScript || DEFAULT_HOST_SCRIPT).map((x) => `<li><b>${esc(x.title)}.</b> ${esc(x.text.replace(/\{join\}/g, jt))}</li>`).join("")}</ol>
    ${guideHtml()}</section>`;
}

function viewHandoff() {
  const tl = L.myRole() === "team_lead";
  const teams = tl ? L.me()?.teams || [] : [];
  const list = P().handoff;
  const mySteps = tl ? openSteps().filter((s) => s.owner_user === L.uid()) : [];
  return `<div class="row"><h1 class="grow">${tl ? `${esc(teams.join(", "))}: new people` : "Team handoff"}</h1></div><p class="sub">${tl ? "People a pastor has approved for your team. Reach out and set their first Sunday." : "Everyone approved to join, by the team they're headed to."}</p>
    ${tl && mySteps.length ? `<section class="panel"><h2>Assigned to you</h2>${mySteps.map((s) => stepRow(s, false)).join("")}</section>` : ""}
    <div class="row" style="align-items:stretch">${list.map((h) => `<div class="hcard"><span class="kick" style="font-size:12px">${esc(h.team || "No team yet")}</span><b style="font-size:16px">${esc(h.name || "")}</b><span class="small">${esc((h.top_gifts || []).map((g) => GIFTS[g]).join(", "))}</span><span class="small">${esc([h.serve_when, h.often].filter(Boolean).join(" · "))}</span><span class="small">${esc([h.email, h.phone].filter(Boolean).join(" · "))}</span>
      ${h.check_pending ? `<span class="pill late">Background check pending</span><span class="small">Set their first Sunday once it's done.</span>` : `<label class="small" style="display:flex;flex-direction:column;gap:4px">First Sunday<input type="date" class="in" style="min-height:44px" value="${esc(h.first_sunday || "")}" data-act-change="first-sunday" data-id="${h.member_id}"></label>`}</div>`).join("") || `<p class="sub">No one yet.</p>`}</div>`;
}

function viewPrayer() {
  return `<div class="row"><h1 class="grow">Prayer requests</h1><span class="row small" style="gap:6px">${ICON.lock}Only people with prayer access</span></div>
    <div class="row" style="align-items:stretch">${P().prayer.map((r) => `<div class="prayer"><p>${esc(r.body)}</p><span class="small">${esc(r.who || "")} · ${fmt(r.created_at)}</span><button class="btn ${r.prayed_at ? "quiet" : "ghost"}" style="align-self:flex-start" data-act="prayed" data-id="${r.id}" data-v="${r.prayed_at ? "0" : "1"}">${r.prayed_at ? "Prayed for ✓" : "Mark prayed for"}</button></div>`).join("") || `<p class="sub">No requests yet.</p>`}</div>`;
}

function teamChecks(name, chosen = []) {
  return `<div class="chips">${teamNames().map((t) => `<label class="chip" style="display:flex;gap:6px;align-items:center"><input type="checkbox" name="${name}" value="${esc(t)}" ${chosen.includes(t) ? "checked" : ""}>${esc(t)}</label>`).join("")}</div>`;
}

// Connections: one people system at a time (Planning Center or Breeze), or a spreadsheet roster import.
const when = (d) => `${fmt(d)} ${new Date(d).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
function runLabel(r) {
  if (r.kind === "push") return `Sent ${r.pushed} ${r.pushed === 1 ? "person" : "people"}`;
  if (r.kind === "pull") return `Pulled ${r.pulled} team members`;
  if (r.kind === "import") return `Imported a spreadsheet: ${r.pulled} on matched teams`;
  if (r.kind === "test") return "Tested the connection";
  return "Connected";
}
function mapRows(map, source) {
  return map.map((t) => `<div class="taskrow"><div class="t"><b>${esc(t.extTeamName || t.extTeamId)}</b><span class="small">${t.people} ${t.people === 1 ? "person" : "people"}</span></div><select class="in" style="width:auto" data-act-change="team-map" data-source="${esc(source)}" data-id="${esc(t.extTeamId)}" aria-label="Here To Serve team for ${esc(t.extTeamName || "")}"><option value="">Not counted</option>${teamNames().map((n) => `<option ${t.htsTeam === n ? "selected" : ""}>${esc(n)}</option>`).join("")}</select></div>`).join("");
}
function connPanel() {
  const p = P().conn || {};
  const msg = V.connMsg ? `<div class="${V.connMsg.ok ? "note" : "err"}">${esc(V.connMsg.text)}</div>` : "";
  const runs = p.runs || [];
  const runList = runs.length ? `<h2 style="font-size:16px">Recent activity</h2>${runs.map((r) => `<div class="taskrow"><div class="t"><b>${esc(runLabel(r))}</b><span class="small">${esc(L.SYSTEMS[r.system] || "")} · ${when(r.started_at)}${r.error ? ` · ${esc(r.error)}` : ""}</span></div><span class="${r.ok ? "pill ok" : r.ok === false ? "pill late" : "pill"}">${r.ok ? "OK" : r.ok === false ? "Problem" : "Running"}</span></div>`).join("")}` : "";
  if (p.connected) {
    const name = L.SYSTEMS[p.system];
    const what = p.system === "breeze" ? "tags" : "Services teams";
    return `<section class="panel" id="connections"><h2>Connected: ${esc(name)}</h2>${msg}<p class="hint">Connected${p.orgName ? ` to <b>${esc(p.orgName)}</b>` : ""} on ${fmt(p.connectedAt)}. New members, their gifts, team and membership go into ${esc(name)} every 15 minutes. ${p.queued ? `${p.queued} waiting to send.` : ""} A church connects one system at a time.</p>
      <div class="row"><button class="btn" data-act="conn-sync">Sync now</button><button class="btn ghost" data-act="conn-test">Test connection</button><button class="btn quiet" data-act="conn-disconnect">Disconnect</button></div>
      <h2 style="font-size:16px">Match your ${what}</h2><p class="hint">Pick which Here To Serve team each one counts as, so the snapshot shows who's really serving. Unmatched ones are ignored.</p>
      ${mapRows(p.map || [], p.system) || `<p class="sub">These show here after the first sync.</p>`}
      ${runList}</section>`;
  }
  const breeze = V.connForm === "breeze"
    ? `<form data-form="breeze" class="q"><label class="fl" for="bz-sub">Your Breeze address</label><div class="inline" style="align-items:center"><span class="small">https://</span><input class="in" id="bz-sub" name="sub" placeholder="yourchurch" required maxlength="63" autocomplete="off" autocapitalize="none" spellcheck="false"><span class="small">.breezechms.com</span></div>
        <label class="fl" for="bz-key">API key</label><input class="in" id="bz-key" name="key" type="password" required maxlength="200" autocomplete="off" spellcheck="false">
        <p class="hint">In Breeze, an administrator opens <b>Extensions</b>, then <b>API</b>, and copies the key. It's stored on our server only and never shown again.</p>
        <div class="row"><button class="btn" type="submit">Test and connect</button><button class="btn quiet" type="button" data-act="conn-form" data-v="">Cancel</button></div></form>`
    : "";
  const csvMap = p.source === "csv" && (p.map || []).length
    ? `<h2 style="font-size:16px">Spreadsheet rosters in use</h2><p class="hint">Imported ${p.csvImportedAt ? fmt(p.csvImportedAt) : ""}. Change a match here, or import a new file to replace them.</p>${mapRows(p.map, "csv")}` : "";
  return `<section class="panel" id="connections"><h2>Connect your people system</h2>${msg}<p class="hint">Connect one and new members, their gifts, team and membership go into it automatically, and your teams come back so the snapshot shows who's really serving. No people system? Import team rosters from a spreadsheet below.</p>
    <div class="row">${L.pcoReady() ? `<button class="btn" data-act="conn-pco">Connect Planning Center</button>` : `<span class="small">Planning Center: not available yet (one-time app setup; see SETUP.md).</span>`}
      ${V.connForm === "breeze" ? "" : `<button class="btn ghost" data-act="conn-form" data-v="breeze">Connect Breeze</button>`}</div>
    ${breeze}${csvMap}${runList}</section>`;
}

// Roster import from a spreadsheet: Administrators only. Preview, match teams, then save.
function importPanel() {
  const p = P().conn || {};
  const im = V.imp;
  const note = p.connected ? `<p class="hint">You're connected to ${esc(L.SYSTEMS[p.system])}, so its teams are what the snapshot counts. An import is kept and used if you disconnect.</p>` : "";
  let body = `<form data-form="roster-file" class="q"><label class="fl" for="imp-file">Spreadsheet (CSV)</label><input class="in" id="imp-file" name="file" type="file" accept=".csv,.txt,text/csv" required>
    <button class="btn" type="submit" style="align-self:flex-start">Preview</button></form>`;
  if (im?.error) body = `<div class="err">${esc(im.error)}</div>` + body;
  if (im?.preview) {
    const pv = im.preview;
    const teams = Object.entries(pv.teams || {});
    body = `<p class="hint"><b>${esc(im.file)}</b>: ${pv.rows} rows, ${teams.length} teams. ${pv.matchedPeople} ${pv.matchedPeople === 1 ? "person has" : "people have"} taken the class here. ${pv.counted} will count as serving.</p>
      <div class="tablewrap"><table><thead><tr><th>Team in the file</th><th>People</th><th>Counts as</th></tr></thead><tbody>
      ${teams.map(([label, t]) => `<tr><td><b>${esc(label)}</b></td><td>${t.people}</td><td><select class="in" style="width:auto" data-act-change="imp-map" data-id="${esc(label)}" aria-label="Here To Serve team for ${esc(label)}"><option value="">Not counted</option>${teamNames().map((n) => `<option ${t.htsTeam === n ? "selected" : ""}>${esc(n)}</option>`).join("")}</select></td></tr>`).join("")}</tbody></table></div>
      ${pv.unmatchedTeams?.length ? `<p class="hint">Not matched yet: ${esc(pv.unmatchedTeams.join(", "))}. Pick a team above, or leave them out.</p>` : ""}
      ${pv.skipped?.length ? `<details><summary class="small">${pv.skipped.length} ${pv.skipped.length === 1 ? "row" : "rows"} skipped</summary><ul class="small">${pv.skipped.slice(0, 50).map((x) => `<li>Row ${x.row + 1}: ${esc(x.reason)}</li>`).join("")}${pv.skipped.length > 50 ? `<li>…and ${pv.skipped.length - 50} more</li>` : ""}</ul></details>` : ""}
      <div class="row"><button class="btn" data-act="imp-save">Save these rosters</button><button class="btn quiet" data-act="imp-cancel">Cancel</button></div>
      <p class="fine">Saving replaces the last spreadsheet import.</p>`;
  }
  return `<section class="panel" id="import"><h2>Import team rosters</h2><p class="hint">A spreadsheet with one row per person per team: an <b>Email</b> or <b>Name</b> column (or First and Last name), and a <b>Team</b> column. Export it from any church software, or type it in Excel or Google Sheets and save as CSV.</p>${note}${body}</section>`;
}

// Owner, 23 Oct 2026: Beta pricing by church size, 30-day free trial, code BETA = a third off for life (until 5 Jan 2027).
// Web only: the iPhone app doesn't link out to payment.
const PLANS = [
  ["Plant", "$15/month", "Under 2 years old or under 100 people", "https://buy.stripe.com/5kQ3cvaPq3yJ8RY3Il9R60e"],
  ["Church", "$29/month", "100 to 499 people", "https://buy.stripe.com/7sY14n0aMc5ffgma6J9R60f"],
  ["Large", "$59/month", "500 people or more", "https://buy.stripe.com/aFa14naPq1qBc4a4Mp9R60g"],
];
function planLink(base) {
  const u = new URL(base), c = L.active(), email = P().session?.user?.email;
  if (c) u.searchParams.set("client_reference_id", c.id);
  if (email) u.searchParams.set("prefilled_email", email);
  return u.toString();
}
function planPanel() {
  if (N.NATIVE) return "";
  return `<section class="panel"><h2>Your plan <span class="pill ok">Beta</span></h2>
    <p class="hint">Every plan starts with a 30-day free trial. Cancel before day 30 and you're never charged. Beta churches: use code <b>BETA</b> at checkout for a third off, for life.</p>
    ${PLANS.map(([name, price, who, url]) => `<div class="taskrow"><div class="t"><b>${name} · ${price}</b><span class="small">${who}</span></div><a class="btn ghost" href="${esc(planLink(url))}" target="_blank" rel="noopener">Start free trial</a></div>`).join("")}</section>`;
}
const STEP_KINDS = [["approve", "Approve joining (and on-hold follow-ups)"], ["faith", "Talk about following Jesus"], ["baptism", "Baptism conversation"], ["group", "Connect to a group"],
  ["followup", "Follow up: not ready yet"], ["invite", "Invite to the next class"], ["check", "Background checks"], ["team", "Team introductions (when a team has no Team Lead)"], ["season", "Season-full check-ins"]];
function viewSettings() {
  const c = L.active();
  const s = c.settings || {};
  const beliefs = (s.beliefs || []).map((b) => [b.word, b.text, b.verse].join(" | ")).join("\n");
  return `<h1>Settings</h1>
  ${planPanel()}
  <div class="cols"><section class="panel"><h2>Your church</h2><form data-form="church-edit" class="q">
    <label class="fl" for="s-name">Name</label><input class="in" id="s-name" name="name" value="${esc(c.name)}" required maxlength="120">
    <label class="fl" for="s-logo">Logo link (https)</label><input class="in" id="s-logo" name="logo" value="${esc(c.logo_url || "")}" placeholder="https://…/logo.png">
    <label class="fl" for="s-accent">Accent color</label><input class="in" id="s-accent" name="accent" type="color" value="${esc(hex(c.accent))}" style="width:96px;padding:4px">
    <button class="btn" type="submit" style="align-self:flex-start">Save</button></form></section>
  <section class="panel"><h2>What we believe</h2><p class="hint">Shown in the pop-up by the Belief commitment. One per line: <b>Word | Statement | Passage</b>.</p>
    <form data-form="beliefs" class="q"><textarea class="in" name="beliefs" style="min-height:220px;font-size:14px" aria-label="Beliefs">${esc(beliefs)}</textarea>
    <div class="row"><button class="btn" type="submit">Save beliefs</button><button class="btn quiet" type="button" data-act="pinewood-beliefs">Fill with Pinewood's</button></div></form></section></div>
  <section class="panel"><h2>Team</h2><p class="hint"><b>Administrator</b>: everything. <b>Staff</b>: people, notes, next steps, classes and the snapshot; no settings. <b>Team Lead</b>: only their own teams, steps assigned to them, and one-on-ones for a class they're added to. <b>Prayer access</b> is a separate switch.</p>
    <div class="tablewrap"><table><thead><tr><th>Person</th><th>Access level</th><th>Teams (Team Leads)</th><th>Prayer</th><th></th></tr></thead><tbody>
    ${P().team.map((t) => `<tr><td><b>${esc(t.name || t.email)}</b><div class="small">${esc(t.email || "")}</div></td>
      <td><select class="in" style="width:auto" data-act-change="staff-role" data-user="${t.user_id}" aria-label="Access level for ${esc(t.name || t.email)}">${Object.entries(ROLE_NAMES).map(([k, v]) => `<option value="${k}" ${t.role === k ? "selected" : ""}>${v}</option>`).join("")}</select></td>
      <td>${t.role === "team_lead" ? `<form data-form="staff-teams" data-user="${t.user_id}">${teamChecks("teams", t.teams || [])}<button class="btn quiet" type="submit" style="margin-top:6px">Save teams</button></form>` : `<span class="small">All</span>`}</td>
      <td><input type="checkbox" style="width:22px;height:22px" data-act-change="staff-prayer" data-user="${t.user_id}" ${t.prayer ? "checked" : ""} aria-label="Prayer access for ${esc(t.name || t.email)}"></td>
      <td>${t.user_id !== L.uid() ? `<button class="btn quiet" data-act="remove-staff" data-id="${t.user_id}">Remove</button>` : `<span class="small">You</span>`}</td></tr>`).join("")}</tbody></table></div>
    <form data-form="invite" class="q"><span class="fl">Invite someone by email</span><div class="inline"><input class="in" name="email" type="email" placeholder="name@church.org" required aria-label="Email">
      <select class="in" name="role" aria-label="Access level">${Object.entries(ROLE_NAMES).map(([k, v]) => `<option value="${k}" ${k === "staff" ? "selected" : ""}>${v}</option>`).join("")}</select>
      <label class="small" style="display:flex;gap:6px;align-items:center"><input type="checkbox" name="prayer" checked> Prayer access</label></div>
      <span class="small">Team Leads: pick their team(s)</span>${teamChecks("teams")}
      <button class="btn" type="submit" style="align-self:flex-start">Create invite</button></form>
    ${V.inviteLink ? `<div class="q"><span class="fl">Send them this link</span><div class="code">${esc(V.inviteLink)}</div><button class="btn ghost" style="align-self:flex-start" data-act="copy" data-v="${esc(V.inviteLink)}">Copy invite link</button></div>` : ""}
    ${P().invites.length ? `<p class="hint">Waiting to accept: ${esc(P().invites.map((i) => `${i.email} (${ROLE_NAMES[i.role]})`).join(", "))}</p>` : ""}</section>
  ${connPanel()}
  ${importPanel()}
  <section class="panel"><h2>Your words and your class</h2><form data-form="class-setup" class="q">
    <label class="fl" for="s-join">What do you call joining?</label><input class="in" id="s-join" name="joinTerm" maxlength="60" value="${esc(s.joinTerm || DEFAULT_JOIN_TERM)}" placeholder="join the serve team">
    <p class="hint" style="margin:0">People see "I'm ready to ${esc(s.joinTerm || DEFAULT_JOIN_TERM)}". For example: join the serve team, become a covenant member, become a member.</p>
    <label class="small"><input type="checkbox" name="requireBaptism" ${s.requireBaptism !== false ? "checked" : ""}> Believer's baptism comes first (people who've trusted Jesus but aren't baptized join after baptism)</label>
    <label class="fl" for="s-video">Lead pastor's video link (https)</label><input class="in" id="s-video" name="videoUrl" value="${esc(s.videoUrl || "")}" placeholder="https://youtube.com/…">
    <label class="fl" for="s-script">Host script</label><p class="hint" style="margin:0">One step per line: <b>Step | What to say or do</b>. {join} becomes your words above.</p><textarea class="in" id="s-script" name="hostScript" style="min-height:200px;font-size:14px">${esc(s.hostScript || DEFAULT_HOST_SCRIPT)}</textarea>
    <label class="fl" for="s-guide">One-on-one guide</label><p class="hint" style="margin:0">What leaders ask and listen for. One per line: <b>Heading | Text</b>.</p><textarea class="in" id="s-guide" name="guide" style="min-height:160px;font-size:14px">${esc(s.guide || DEFAULT_GUIDE)}</textarea>
    <button class="btn" type="submit" style="align-self:flex-start">Save</button></form></section>
  <section class="panel"><h2>Who owns each next step</h2><p class="hint">New steps go straight to these people, and their phones get the overdue alerts. Team introductions go to that team's Team Lead first.</p>
    <form data-form="owners" class="q">${STEP_KINDS.map(([k, label]) => `<label class="taskrow"><span class="t"><b>${esc(label)}</b></span><select class="in" style="width:auto" name="${k}" aria-label="Owner for ${esc(label)}"><option value="">No one yet</option>${P().team.map((t) => `<option value="${t.user_id}" ${(s.stepOwners || {})[k] === t.user_id ? "selected" : ""}>${esc(t.name || t.email)}</option>`).join("")}</select></label>`).join("")}
    <button class="btn" type="submit" style="align-self:flex-start">Save owners</button></form></section>
  <section class="panel"><h2>Serving teams</h2><p class="hint">Your teams and the gifts that point people to each (up to 3). Removing or renaming a team doesn't move anyone already placed on it.</p>
    <form data-form="teams" class="q">${[...(s.teams || []), { name: "", gifts: [], check: false, _new: true }].map((t, i) => `<div class="teamedit">
      <input class="in" name="t-name-${i}" value="${esc(t.name)}" maxlength="40" placeholder="${t._new ? "Add a team" : ""}" aria-label="Team name">
      <input type="hidden" name="t-orig-${i}" value="${esc(t.name)}">
      <div class="giftpick">${GIFT_KEYS.map((g) => `<label class="small"><input type="checkbox" name="t-gift-${i}" value="${g}" ${(t.gifts || []).includes(g) ? "checked" : ""}> ${esc(GIFTS[g])}</label>`).join("")}</div>
      <div class="inline"><label class="small"><input type="checkbox" name="t-check-${i}" ${t.check ? "checked" : ""}> Background check</label>${t._new ? "" : `<label class="small"><input type="checkbox" name="t-remove-${i}"> Remove</label>`}</div></div>`).join("")}
      <input type="hidden" name="t-count" value="${(s.teams || []).length + 1}">
      <div class="row"><button class="btn" type="submit">Save teams</button><button class="btn quiet" type="button" data-act="pinewood-teams">Reset to Pinewood's</button></div></form></section>
  <section class="panel"><h2>Commitments</h2><p class="hint">What people check off when they join. One per line: <b>Word | Statement | Passage</b>. Keep a line starting with <b>Belief</b> to show the "Read what we believe" pop-up beside it.</p>
    <form data-form="commitments" class="q"><textarea class="in" name="commitments" style="min-height:220px;font-size:14px" aria-label="Commitments">${esc((s.commitments || []).map((x) => [x.word, x.statement, x.verse].join(" | ")).join("\n"))}</textarea>
    <button class="btn" type="submit" style="align-self:flex-start">Save commitments</button></form></section>`;
}

function viewAccount() {
  const email = P().session?.user?.email || "";
  return `<h1>Account</h1>
    <section class="panel"><h2>${esc(email)}</h2>${L.active() ? `<p class="hint">${esc(ROLE_NAMES[L.myRole()] || "")} at ${esc(L.active().name)}${L.prayerOk() ? " · prayer access" : ""}</p>` : ""}
      ${N.PLATFORM === "ios" ? `<button class="btn ghost" style="align-self:flex-start" data-act="push">Turn on notifications</button><p class="hint">Get a notification when someone finishes class or a next step is overdue.</p>` : ""}
      <div class="row"><button class="btn quiet" data-act="signout">Sign out</button><a href="#/privacy">Privacy</a><a href="#/terms">Terms</a></div></section>
    <section class="panel"><h2>Give feedback</h2><p class="hint">Here To Serve is in beta. Tell Parker what confused you, what almost made you quit, and what would make it worth paying for.</p><a class="btn ghost" style="align-self:flex-start" href="https://parkermanuel.com/beta-feedback?product=here-to-serve" target="_blank" rel="noopener">Give feedback</a></section>
    <section class="panel"><h2>Delete my account</h2><p class="hint">This removes your sign-in and your access to every church you're on. It can't be undone. If you're the only Administrator of a church that has other people on its team, make someone else an Administrator first. If you're the only person on a church's team, that church and everything in it is deleted too.</p>
      <button class="btn" style="align-self:flex-start;background:var(--warm-ink)" data-act="delete-account">Delete my account</button></section>`;
}

// ---------------- events ----------------
const confirmIt = (msg) => window.confirm(msg); // the only dialog in the app: keeps destructive actions deliberate
document.addEventListener("click", async (e) => {
  const el = e.target.closest("[data-act]");
  if (!el) return;
  const act = el.dataset.act;
  if (route.name === "member" && M) { if (act === "sheet-close-bg" && e.target !== el) return; return memberAct(act, el); }
  try {
    if (act === "nav") return go("#/s/" + el.dataset.to);
    if (act === "person") return go("#/s/person/" + el.dataset.id);
    if (act === "class") return go("#/s/class/" + el.dataset.id);
    if (act === "filter") { V.filter = el.dataset.v; return render(); }
    if (act === "snap") { V.snapOpen = !V.snapOpen; return render(); }
    if (act === "signout") { await L.signOut(); return go("#/"); }
    if (act === "signin-again") { V.signinSent = null; return render(); }
    if (act === "reload") { await L.loadAll(); return render(); }
    if (act === "scan") { const code = await N.scanClassCode(); if (code) return go("#/j/" + code); return toast("That isn't a class code. Try again."); }
    if (act === "push") { const on = await N.enablePush(L.registerDevice, (r) => go(r)); return toast(on ? "Notifications are on" : "Notifications are off in your phone's Settings"); }
    if (act === "copy") { try { await navigator.clipboard.writeText(el.dataset.v); toast("Copied"); } catch { toast("Press and hold the link to copy it"); } return; }
    if (act === "approve") { await L.approve(el.dataset.id, true); toast("Approved. Their team lead can see them now."); return render(); }
    if (act === "step-done") { const s = P().steps.find((x) => x.id === el.dataset.id); await L.setStep(s.id, { done_at: s.done_at ? null : new Date().toISOString() }); return render(); }
    if (act === "class-open") { await L.setClassOpen(el.dataset.id, el.dataset.v === "1"); return render(); }
    if (act === "prayed") { await L.markPrayed(el.dataset.id, el.dataset.v === "1"); return render(); }
    if (act === "remove-staff") { if (!confirmIt("Remove this person from your team?")) return; await L.setStaff(el.dataset.id, "remove"); return render(); }
    if (act === "delete-member") { if (!confirmIt("Delete everything this person entered, plus their notes and steps? This can't be undone.")) return; await L.deleteMember(el.dataset.id); return go("#/s/people"); }
    if (act === "delete-account") { if (!confirmIt("Delete your account? This can't be undone.")) return; await L.deleteMyAccount(); toast("Your account was deleted"); return go("#/"); }
    if (act === "pinewood-teams") { if (!confirmIt("Replace your teams with Pinewood's nine? People already placed stay where they are.")) return; const c = L.active(); await L.updateChurch({ settings: { ...(c.settings || {}), teams: DEFAULT_TEAMS } }); toast("Teams reset"); return render(); }
    if (act === "pinewood-beliefs") { const t = $('textarea[name="beliefs"]'); if (t) t.value = PINEWOOD_BELIEFS.map((b) => [b.word, b.text, b.verse].join(" | ")).join("\n"); return; }
    if (act === "conn-pco") { location.href = await L.connectPco(); return; }
    if (act === "conn-form") { V.connForm = el.dataset.v || null; V.connMsg = null; render(); $("#bz-sub")?.focus(); return; }
    if (act === "conn-sync") {
      el.disabled = true; el.textContent = "Syncing…";
      const c = (await L.sync())?.churches?.[0] || {};
      V.connMsg = c.pullError ? { ok: false, text: `Sync problem: ${c.pullError}` } : { ok: !c.errors, text: `Synced: ${c.pushed || 0} sent${c.errors ? ` (${c.errors} had a problem; see Recent activity)` : ""}, ${c.pulledPeople ?? 0} team members pulled.` };
      return render();
    }
    if (act === "conn-test") {
      el.disabled = true; el.textContent = "Testing…";
      const r = await L.testConnection();
      V.connMsg = r.ok ? { ok: true, text: `Connection works${r.orgName ? ` (${r.orgName})` : ""}.` } : { ok: false, text: `Connection problem: ${r.error}` };
      await L.loadChurch(); return render();
    }
    if (act === "conn-disconnect") { const n = L.SYSTEMS[P().conn?.system] || "it"; if (!confirmIt(`Disconnect ${n}? Nothing already sent is removed from ${n}.`)) return; await L.disconnect(); V.connMsg = null; return render(); }
    if (act === "export-people" || act === "export-steps") {
      const people = act === "export-people";
      el.disabled = true;
      const rows = people ? await L.exportPeople(V.exportFilter, V.exportClass) : await L.exportSteps(true);
      el.disabled = false;
      if (!rows.length) return toast("No one to export with those choices");
      const how = await N.saveFile(fileName(people ? "people" : "next-steps", L.active().name), toCsv(rows, people ? PEOPLE_COLUMNS : STEP_COLUMNS));
      if (how !== "cancelled") toast(`${rows.length} ${rows.length === 1 ? "row" : "rows"} exported`);
      return;
    }
    if (act === "imp-cancel") { V.imp = null; return render(); }
    if (act === "imp-save") {
      el.disabled = true;
      const r = await L.importRoster(V.imp.rows, V.imp.teams);
      V.imp = null; toast(`Saved: ${r.counted} people on matched teams${r.skipped?.length ? `, ${r.skipped.length} rows skipped` : ""}`);
      return render();
    }
  } catch (err) { toast(errMsg(err)); render(); }
});

document.addEventListener("input", (e) => {
  const el = e.target.closest("[data-in]");
  if (el && M) M.a[el.dataset.in] = el.value;
});
document.addEventListener("change", async (e) => {
  const el = e.target.closest("[data-act-change]");
  if (!el) return;
  try {
    const k = el.dataset.actChange;
    if (k === "church") { await L.switchChurch(el.value); return render(); }
    if (k === "step-due") { await L.setStep(el.dataset.id, { due: el.value || null }); return render(); }
    if (k === "step-owner") { await L.setStep(el.dataset.id, { owner_user: el.value || null }); return render(); }
    if (k === "first-sunday") { await L.setFirstSunday(el.dataset.id, el.value); toast("First Sunday saved"); return render(); }
    if (k === "interviewer") { await L.setInterviewer(el.dataset.id, el.value); toast("Paired"); return render(); }
    if (k === "class-leader") { await L.setClassLeader(el.dataset.id, el.dataset.user, el.checked); return render(); }
    if (k === "staff-role") {
      const t = P().team.find((x) => x.user_id === el.dataset.user);
      const teams = el.value === "team_lead" ? (t.teams?.length ? t.teams : [teamNames()[0]]) : null;
      await L.setStaff(el.dataset.user, el.value, teams); if (el.value === "team_lead") toast("Now pick their team(s) and save"); return render();
    }
    if (k === "staff-prayer") { const t = P().team.find((x) => x.user_id === el.dataset.user); await L.setStaff(t.user_id, t.role, t.teams, el.checked); return render(); }
    if (k === "team-map") { await L.setMap(el.dataset.source, el.dataset.id, el.value); toast("Saved"); return render(); }
    if (k === "export-filter") { V.exportFilter = el.value; return; }
    if (k === "export-class") { V.exportClass = el.value; return; }
    if (k === "imp-map") { V.imp.teams[el.dataset.id] = el.value; V.imp.preview = await L.previewRoster(V.imp.rows, V.imp.teams); return render(); }
  } catch (err) { toast(errMsg(err)); render(); }
});
document.addEventListener("submit", async (e) => {
  const f = e.target.closest("[data-form]");
  if (!f) return;
  e.preventDefault();
  const v = (n) => (f.elements[n]?.value || "").trim();
  const checked = (n) => [...f.querySelectorAll(`input[name="${n}"]:checked`)].map((x) => x.value);
  const btn = f.querySelector('[type="submit"]'); if (btn) btn.disabled = true;
  try {
    const kind = f.dataset.form;
    if (kind === "signin") { const email = $("#si-email", f).value.trim(); await L.sendMagicLink(email, f.dataset.back || ""); V.signinSent = email; }
    if (kind === "code") { await L.verifyCode(V.signinSent, $("#si-code", f).value.trim()); V.signinSent = null; }
    if (kind === "church") { await L.createChurch($("#c-name").value.trim(), $("#c-self").value.trim()); go("#/s/settings"); }
    if (kind === "accept") { await L.acceptInvite(route.arg, $("#ac-name").value.trim()); go("#/"); }
    if (kind === "class") { const k = await L.createClass(v("name"), v("date") || today()); go("#/s/class/" + k.id); }
    if (kind === "gifts") { const g = [v("g0"), v("g1"), v("g2")].filter(Boolean); await L.memberEdit(f.dataset.id, v("team"), [...new Set(g)]); toast("Saved"); }
    if (kind === "note") { await L.addNote(f.dataset.id, v("body")); toast("Note saved"); }
    if (kind === "step") { await L.addStep(f.dataset.id, v("title"), v("owner"), v("due")); }
    if (kind === "breeze") {
      const r = await L.connectBreeze(v("sub"), v("key"));
      V.connForm = null; V.connMsg = { ok: true, text: `Breeze connected${r.orgName ? ` (${r.orgName})` : ""}. Everyone who's finished class goes in on the next sync, within 15 minutes, or tap Sync now.` };
    }
    if (kind === "roster-file") {
      const file = f.elements.file.files[0];
      if (!file) throw new Error("Pick a file first");
      if (file.size > 5e6) throw new Error("That file is over 5 MB. Split it and import each part.");
      const parsed = rosterRows(parseCsv(await file.text()));
      if (parsed.error) V.imp = { error: parsed.error };
      else { V.imp = { file: file.name, rows: parsed.rows, teams: {} }; V.imp.preview = await L.previewRoster(parsed.rows, {}); }
    }
    if (kind === "hold") { await L.approve(f.dataset.id, false, v("note")); toast("Put on hold. A follow-up step is on the checklist."); }
    if (kind === "class-setup") {
      const c = L.active(), video = v("videoUrl");
      if (video && !safeUrl(video)) throw new Error("The video link needs to start with https://");
      await L.updateChurch({ settings: { ...(c.settings || {}), joinTerm: v("joinTerm").slice(0, 60) || DEFAULT_JOIN_TERM, requireBaptism: !!f.querySelector('input[name="requireBaptism"]')?.checked,
        videoUrl: video || null, hostScript: v("hostScript").slice(0, 6000), guide: v("guide").slice(0, 4000) } });
      toast("Saved");
    }
    if (kind === "owners") {
      const c = L.active(), owners = Object.fromEntries(STEP_KINDS.map(([k]) => [k, v(k)]).filter(([, u]) => u));
      await L.updateChurch({ settings: { ...(c.settings || {}), stepOwners: owners } }); toast("Owners saved. New steps go to them.");
    }
    if (kind === "staff-teams") { await L.setStaff(f.dataset.user, "team_lead", checked("teams")); toast("Teams saved"); }
    if (kind === "typecode") {
      const code = readCode(v("tc-code"));
      if (!/^[0-9a-f]{12}$/.test(code)) { renderTypeCode("That code doesn't look right. It's 12 letters and numbers, like ABCD-1234-EF56."); return; }
      return go("#/j/" + code);
    }
    if (kind === "church-edit") {
      const logo = v("logo");
      if (logo && !safeUrl(logo)) throw new Error("The logo link needs to start with https://");
      await L.updateChurch({ name: v("name"), logo_url: logo || null, accent: hex(v("accent")) }); toast("Saved");
    }
    if (kind === "teams") {
      const c = L.active(), n = Number(v("t-count")) || 0, rows = [];
      for (let i = 0; i < n; i++) rows.push({ name: v(`t-name-${i}`), orig: v(`t-orig-${i}`), gifts: checked(`t-gift-${i}`), check: !!f.querySelector(`input[name="t-check-${i}"]`)?.checked, remove: !!f.querySelector(`input[name="t-remove-${i}"]`)?.checked });
      const r = cleanTeams(rows, c.settings?.teams || [], GIFT_KEYS);
      if (r.error) throw new Error(r.error);
      await L.updateChurch({ settings: { ...(c.settings || {}), teams: r.teams } }); toast("Teams saved");
    }
    if (kind === "commitments") {
      const c = L.active(), r = parseCommitments(v("commitments"), c.settings?.commitments || []);
      if (r.error) throw new Error(r.error);
      await L.updateChurch({ settings: { ...(c.settings || {}), commitments: r.commitments } }); toast("Commitments saved");
    }
    if (kind === "beliefs") {
      const lines = v("beliefs").split("\n").map((l) => l.split("|").map((x) => x.trim())).filter((p) => p[0] && p[1]);
      const c = L.active();
      await L.updateChurch({ settings: { ...(c.settings || {}), beliefs: lines.slice(0, 30).map(([word, text, verse]) => ({ word: word.slice(0, 40), text: text.slice(0, 400), verse: (verse || "").slice(0, 80) })) } });
      toast("Beliefs saved");
    }
    if (kind === "invite") {
      const role = v("role");
      const inv = await L.inviteStaff(v("email"), role, role === "team_lead" ? checked("teams") : [], !!f.querySelector('input[name="prayer"]')?.checked);
      V.inviteLink = inv ? L.inviteLink(inv.token) : null;
    }
  } catch (err) { toast(errMsg(err)); }
  if (btn) btn.disabled = false;
  if (route.name !== "member") render();
});

// ---------------- start ----------------
L.onChange(() => { if (route.name !== "member" && route.name !== "join") render(); });
// Back from Planning Center: show how it went
{
  const q = new URLSearchParams(location.hash.split("?")[1] || "");
  const pco = q.get("pco");
  const m = { connected: [true, "Planning Center connected. The first sync runs within 15 minutes, or tap Sync now."], cancelled: [false, "Planning Center wasn't connected (cancelled)."],
    expired: [false, "That Planning Center link expired. Try Connect again."], other: [false, "Breeze is connected. Disconnect it first; a church connects one system at a time."],
    error: [false, "Planning Center didn't connect. Try again, or check the app setup in SETUP.md."] }[pco];
  if (m) V.connMsg = { ok: m[0], text: m[1] };
}
// Phone app: links to heretoserve.app (class codes, sign-in links) open here
N.onAppLink(async (url) => {
  const code = url.searchParams.get("code");
  if (code) { try { await L.exchangeCode(code); } catch (e) { toast(errMsg(e)); } }
  if (url.hash) go(url.hash);
});
(async () => {
  route = parse();
  if (route.name === "join" || route.name === "member") return onRoute();
  render();
  await L.initAuth();
  render();
})();
