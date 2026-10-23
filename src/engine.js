// Scoring: gift counts, top gifts, team matches and next steps. Pure functions, no browser or database.
import { GIFTS, GIFT_KEYS, VERSES, PAIRS, PASSION_GIFT, SEASON_FULL } from "./bank.js";

// picks[i] = the gift code chosen on question i. Anything that isn't one of that pair's two gifts is ignored.
export function countGifts(picks = []) {
  const scores = Object.fromEntries(GIFT_KEYS.map((k) => [k, 0]));
  PAIRS.forEach((p, i) => { const g = picks[i]; if (g === p[1] || g === p[3]) scores[g] += 1; });
  return scores;
}

// Highest scores first; ties broken by the Part 1 passions (e.g. "Kids" lifts Shepherding over Teaching).
export function rankGifts(scores, passions = []) {
  const tie = { ...scores };
  for (const p of passions) { const g = PASSION_GIFT[p]; if (g) tie[g] = (tie[g] || 0) + 0.1; }
  return GIFT_KEYS.slice().sort((a, b) => tie[b] - tie[a] || GIFT_KEYS.indexOf(a) - GIFT_KEYS.indexOf(b));
}

export function topGifts(scores, passions = [], n = 3) {
  return rankGifts(scores, passions).slice(0, n).map((k) => ({ key: k, name: GIFTS[k], score: scores[k] || 0, verse: VERSES[k] }));
}

// Team score = average of the person's scores for the team's gifts + 1.5 for each matching skill or passion tapped.
export function recommendTeams(scores, tapped = [], teams = [], n = 2) {
  return teams
    .map((t) => {
      const gifts = (t.gifts || []).filter((g) => GIFTS[g]);
      const avg = gifts.length ? gifts.reduce((s, g) => s + (scores[g] || 0), 0) / gifts.length : 0;
      const hits = (t.boosts || []).filter((b) => tapped.includes(b));
      const best = gifts.slice().sort((a, b) => (scores[b] || 0) - (scores[a] || 0)).slice(0, 2).map((g) => GIFTS[g]);
      let reason = best.length ? "Strong in " + best.join(" and ") : "";
      if (hits.length) reason += (reason ? " · " : "") + "you tapped " + hits[0].toLowerCase();
      return { name: t.name, total: avg + 1.5 * hits.length, reason, check: !!t.check };
    })
    .sort((a, b) => b.total - a.total)
    .slice(0, n);
}

// Everything the results screen needs, from Part 1 answers + picks.
export function results(answers = {}, picks = [], teams = []) {
  const scores = countGifts(picks);
  const passions = answers.passions || [], skills = answers.skills || [];
  const top = topGifts(scores, passions);
  const recs = recommendTeams(scores, [...passions, ...skills], teams);
  const seasonFull = answers.when === SEASON_FULL;
  return { scores, top, teams: recs, seasonFull, nextSteps: memberSteps(answers, seasonFull) };
}

// What the member sees as their next steps (plain words). Staff tasks are created by the server on submit.
export function memberSteps(answers = {}, seasonFull = answers.when === SEASON_FULL) {
  const s = [];
  if (answers.faith === "Not yet" || answers.faith === "Not sure") s.push("A pastor will reach out to talk about following Jesus");
  if (answers.bapt === "Not yet" || answers.bapt === "I'd like to talk about it") s.push("Talk with a pastor about baptism");
  if (answers.group !== "Yes") s.push("Find a group that fits your week");
  s.push(seasonFull ? "We'll check back in when your season opens up" : "Meet a team leader before your first Sunday serving");
  return s;
}

// The staff tasks the server creates (mirrors hts_make_steps and hts_team_steps in setup.sql; tested to agree).
// Someone who chose to join waits for a pastor's approval after the one-on-one; the background check and team
// introduction come only once they're approved (owner, 23 Oct 2026).
export function staffSteps(answers = {}, decision, recTeams = [], teams = [], approved = false) {
  const out = [];
  const add = (kind, title, owner, days) => out.push({ kind, title, owner, days });
  const unsure = answers.faith !== "Yes" || answers.bapt !== "Yes";
  if (decision === "joining") add("approve", "Approve joining after the one-on-one" + (unsure ? " (check faith and baptism)" : ""), "Lead pastor", 3);
  if (answers.faith === "Not yet" || answers.faith === "Not sure") add("faith", "Talk about following Jesus", "Next steps pastor", 3);
  if (answers.bapt === "Not yet" || answers.bapt === "I'd like to talk about it") add("baptism", "Baptism conversation", "Next steps pastor", 3);
  if (answers.group !== "Yes") add("group", "Connect to a group", "Groups pastor", 7);
  if (decision === "not_ready") { add("followup", "Follow up: not ready yet", "Next steps pastor", 7); add("invite", "Invite to the next class", "Next steps pastor", 30); }
  const seasonFull = answers.when === SEASON_FULL;
  if (seasonFull) add("season", "Check back in when their season opens up", "Next steps pastor", 60);
  const first = recTeams[0];
  const team = teams.find((t) => t.name === first);
  if (first && !seasonFull && decision === "joining" && approved) {
    if (team?.check) add("check", `Background check for ${first}`, "Next steps pastor", 5);
    add("team", `Introduce to the ${first} team lead`, `${first} lead`, 7);
  }
  return out;
}

// Baptism comes first: a church that requires it won't take "I'm ready to join" until faith and baptism are both Yes
export const canJoin = (answers = {}, requireBaptism = true) => !requireBaptism || (answers.faith === "Yes" && answers.bapt === "Yes");

// ---------- Church settings editing (owner, 23 Oct 2026: teams and commitments are each church's own; questions and gifts stay fixed) ----------
const clip = (s, n) => String(s ?? "").trim().slice(0, n);
const slug = (s) => clip(s, 40).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Cleans the team list a church saves. Keeps each team's passions (boosts) by its original name. */
export function cleanTeams(rows = [], prev = [], giftKeys = []) {
  const byName = new Map(prev.map((t) => [t.name, t]));
  const out = [], names = new Set();
  for (const r of rows) {
    if (r.remove) continue;
    const name = clip(r.name, 40);
    if (!name) continue;
    if (names.has(name.toLowerCase())) return { error: `"${name}" is listed twice. Give each team its own name.` };
    names.add(name.toLowerCase());
    const gifts = [...new Set((r.gifts || []).filter((g) => giftKeys.includes(g)))].slice(0, 3);
    if (!gifts.length) return { error: `Pick at least one gift for ${name}.` };
    const old = byName.get(r.orig || name);
    out.push({ name, gifts, boosts: old?.boosts || [], check: !!r.check });
  }
  if (!out.length) return { error: "Keep at least one team." };
  if (out.length > 30) return { error: "That's more than 30 teams. Combine a few." };
  return { teams: out };
}

/** Reads commitments typed one per line as "Word | Statement | Passage". Keeps existing keys so past members stay matched. */
export function parseCommitments(text = "", prev = []) {
  const byWord = new Map(prev.map((c) => [c.word.toLowerCase(), c.k]));
  const out = [], keys = new Set();
  for (const line of String(text).split("\n")) {
    const [w, s, v] = line.split("|").map((x) => x.trim());
    if (!w && !s) continue;
    if (!w || !s) return { error: `Each line needs a word and a statement: "${clip(line, 40)}"` };
    let k = byWord.get(w.toLowerCase()) || slug(w) || `c${out.length + 1}`;
    while (keys.has(k)) k += "-2";
    keys.add(k);
    out.push({ k, word: clip(w, 30), statement: clip(s, 200), verse: clip(v, 80) });
  }
  if (!out.length) return { error: "Keep at least one commitment." };
  if (out.length > 12) return { error: "Keep it to 12 commitments or fewer." };
  return { commitments: out };
}
