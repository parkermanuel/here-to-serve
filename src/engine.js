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

// The staff tasks the server creates on submit (mirrors hts_make_steps in setup.sql; tested to agree).
export function staffSteps(answers = {}, decision, recTeams = [], teams = []) {
  const out = [];
  const add = (kind, title, owner, days) => out.push({ kind, title, owner, days });
  if (answers.faith === "Not yet" || answers.faith === "Not sure") add("faith", "Talk about following Jesus", "Next steps pastor", 3);
  if (answers.bapt === "Not yet" || answers.bapt === "I'd like to talk about it") add("baptism", "Baptism conversation", "Next steps pastor", 3);
  const seasonFull = answers.when === SEASON_FULL;
  const first = recTeams[0];
  const team = teams.find((t) => t.name === first);
  if (first && !seasonFull && decision === "joining" && team?.check) add("check", `Background check for ${first}`, "Next steps pastor", 5);
  if (first && !seasonFull && decision === "joining") add("team", `Introduce to the ${first} team lead`, `${first} lead`, 5);
  if (answers.group !== "Yes") add("group", "Connect to a group", "Groups pastor", 7);
  if (decision === "not_ready") add("followup", "Follow up: not ready to join", "Next steps pastor", 7);
  if (seasonFull) add("season", "Check back in when their season opens up", "Next steps pastor", 60);
  return out;
}
