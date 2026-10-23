// Spreadsheets: CSV in and out. Files open in Excel, Google Sheets and Numbers.

// Read a CSV (or a semicolon/tab separated file, which some spreadsheet apps save). Returns a list of rows (lists of cells).
export function parseCsv(text) {
  text = String(text || "").replace(/^﻿/, "");
  const first = text.split(/\r?\n/, 1)[0] || "";
  const delim = [",", ";", "\t"].map((d) => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = []; let row = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false; }
      else cell += c;
    } else if (c === '"' && cell === "") quoted = true;
    else if (c === delim) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

// A cell that starts with = + - @ could run as a formula when opened in a spreadsheet; a leading ' keeps it as text.
const safe = (v) => {
  if (v === null || v === undefined) return "";
  let s = v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
  if (/^\d{4}-\d{2}-\d{2}T00:00:00(\.000)?Z$/.test(s)) s = s.slice(0, 10);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
// rows: list of objects. columns: list of keys (also the header row). The BOM makes Excel read accents correctly.
export function toCsv(rows, columns) {
  const cols = columns || Object.keys(rows[0] || {});
  return "﻿" + [cols.map(safe).join(","), ...rows.map((r) => cols.map((c) => safe(r[c])).join(","))].join("\r\n") + "\r\n";
}

// Roster import: find the email, name and team columns whatever the spreadsheet calls them.
const norm = (h) => String(h || "").toLowerCase().replace(/[^a-z]/g, "");
const ALIASES = {
  email: ["email", "emailaddress", "email1", "primaryemail", "emailaddresses", "mail"],
  name: ["name", "fullname", "person", "personname", "volunteer", "member"],
  first: ["firstname", "first", "givenname"],
  last: ["lastname", "last", "surname", "familyname"],
  team: ["team", "teamname", "ministry", "serviceteam", "servingteam", "group", "position", "role", "tag"],
};
export function rosterColumns(header) {
  const h = header.map(norm);
  const find = (k) => h.findIndex((x) => ALIASES[k].includes(x));
  return { email: find("email"), name: find("name"), first: find("first"), last: find("last"), team: find("team") };
}
export function rosterRows(table) {
  if (!table.length) return { error: "That file is empty." };
  const cols = rosterColumns(table[0]);
  if (cols.team < 0) return { error: "We couldn't find a Team column. Name one column \"team\" and try again." };
  if (cols.email < 0 && cols.name < 0 && cols.first < 0) return { error: "We couldn't find an Email or Name column. Add one of those and try again." };
  const at = (r, i) => (i >= 0 ? String(r[i] ?? "").trim() : "");
  const rows = table.slice(1).map((r) => ({
    email: at(r, cols.email),
    name: at(r, cols.name) || [at(r, cols.first), at(r, cols.last)].filter(Boolean).join(" "),
    team: at(r, cols.team),
  }));
  return { rows, columns: cols };
}

// Export columns, in order, with the plain header each spreadsheet shows
export const PEOPLE_COLUMNS = ["first_name", "last_name", "email", "phone", "marital_status", "kids_at_home", "kids_ages", "faith_in_jesus", "baptized", "in_a_group",
  "how_they_found_us", "membership_status", "membership_date", "gift_1", "gift_1_score", "gift_2", "gift_2_score", "gift_3", "gift_3_score",
  "recommended_team", "assigned_team", "first_sunday", "can_serve", "how_often", "skills", "passions", "class_name", "class_date", "open_next_steps"];
export const STEP_COLUMNS = ["person", "email", "step", "owner", "due", "done_at", "created_at"];

export const fileName = (what, churchName, date = new Date()) =>
  `${String(churchName || "church").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${what}-${date.toISOString().slice(0, 10)}.csv`;
