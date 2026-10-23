// Scoring checks. Run before every deploy.
import { PAIRS, GIFT_KEYS, DEFAULT_TEAMS, PINEWOOD_BELIEFS, DEFAULT_COMMITMENTS } from "../src/bank.js";
import { countGifts, topGifts, recommendTeams, results, staffSteps, memberSteps } from "../src/engine.js";
import { classCodeFrom } from "../src/native.js";

let fail = 0;
const ok = (c, m) => { console.log(c ? "ok -" : "FAIL -", m); if (!c) fail++; };

// The question bank is balanced: 33 pairs, every gift exactly 6 times, never paired with itself
ok(PAIRS.length === 33, "33 gift questions");
const seen = Object.fromEntries(GIFT_KEYS.map((k) => [k, 0]));
for (const p of PAIRS) { seen[p[1]]++; seen[p[3]]++; if (p[1] === p[3]) ok(false, "a pair compares a gift with itself"); }
ok(GIFT_KEYS.every((k) => seen[k] === 6), "each of the 11 gifts appears 6 times");

// Always picking the gift that comes first in the pair
const allA = PAIRS.map((p) => p[1]);
const s = countGifts(allA);
ok(Object.values(s).reduce((a, b) => a + b, 0) === 33, "33 picks count as 33 points");
ok(countGifts(["zz", "te", null]).te === 1 && countGifts(["zz"]).sh === 0, "a pick that isn't in the pair is ignored");

// A Mercy/Faith person lands on Prayer; a Kids-tapping Shepherd lands on Kids
const pick = (prefer) => PAIRS.map((p) => (prefer.indexOf(p[1]) !== -1 && (prefer.indexOf(p[3]) === -1 || prefer.indexOf(p[1]) < prefer.indexOf(p[3])) ? p[1] : prefer.indexOf(p[3]) !== -1 ? p[3] : p[1]));
const r1 = results({ passions: ["Prayer"], skills: [] }, pick(["me", "fa", "en"]), DEFAULT_TEAMS);
ok(r1.top.map((g) => g.key).join() === "fa,me,en", "top gifts: Faith (tie broken by tapping prayer), Mercy, Encouragement");
ok(r1.teams[0].name === "Prayer", "Mercy + Faith + tapped prayer recommends Prayer");
const r2 = results({ passions: ["Kids"], skills: ["Teaching"] }, pick(["sh", "te", "he"]), DEFAULT_TEAMS);
ok(r2.teams[0].name === "Kids" && r2.teams[0].check, "Shepherding + tapped kids recommends Kids, with a background check");

// Ties break on passions
const tie = { ...Object.fromEntries(GIFT_KEYS.map((k) => [k, 0])), sh: 4, te: 4 };
ok(topGifts(tie, [])[0].key === "sh" && topGifts(tie, ["Students"])[0].key === "sh", "tie keeps fixed order without passions");
const tie2 = { ...tie, sh: 4, te: 4, ev: 4 };
ok(topGifts(tie2, ["Our city"])[0].key === "ev", "a tapped passion lifts its gift in a tie");

// Next steps
const steps = staffSteps({ faith: "Not sure", bapt: "Not yet", group: "No", when: "Sundays" }, "not_ready", ["Kids"], DEFAULT_TEAMS).map((x) => x.kind);
ok(steps.join() === "faith,baptism,group,followup", "steps for an unsure, unbaptized, not-ready person: no team intro until they join");
const joinSteps = staffSteps({ faith: "Yes", bapt: "Yes", group: "Yes", when: "Sundays" }, "joining", ["Kids"], DEFAULT_TEAMS).map((x) => x.kind);
ok(joinSteps.join() === "check,team", "someone joining and headed to Kids gets a background check and a team intro");
const full = staffSteps({ faith: "Yes", bapt: "Yes", group: "Yes", when: "My season is full right now" }, "joining", ["Kids"], DEFAULT_TEAMS).map((x) => x.kind);
ok(full.join() === "season", "a full season gets one gentle check-in, no team or check");
ok(memberSteps({ group: "Yes", when: "Sundays" }).length === 1, "a grouped, ready person sees one step");

// Content
ok(DEFAULT_COMMITMENTS.length === 8 && PINEWOOD_BELIEFS.length === 12, "8 commitments, 12 belief lines");
ok(PINEWOOD_BELIEFS.some((b) => /for every believer/.test(b.text)), "communion line says it's for every believer");
ok(recommendTeams(s, [], []).length === 0, "no teams, no recommendations");

// The phone app's QR scanner only accepts class codes
ok(classCodeFrom("https://heretoserve.app/#/j/ab12cd34ef56") === "ab12cd34ef56" && classCodeFrom("ab12cd34ef56") === "ab12cd34ef56", "scanner reads a class link or a bare code");
ok(classCodeFrom("https://example.com/login") === null, "scanner ignores anything that isn't a class code");

process.exit(fail ? 1 : 0);
