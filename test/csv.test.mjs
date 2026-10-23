// Spreadsheet checks: reading and writing CSV, and finding roster columns.
import { parseCsv, toCsv, rosterRows, rosterColumns, PEOPLE_COLUMNS, fileName } from "../src/csv.js";

let fail = 0;
const ok = (c, m) => { console.log(c ? "ok -" : "FAIL -", m); if (!c) fail++; };

const t = parseCsv('﻿Name,Email,Team\r\n"Brooks, Daniel",d@b.com,Kids\r\n"Say ""hi""",x@y.org,"Band\nNights"\r\n\r\n');
ok(t.length === 3 && t[1][0] === "Brooks, Daniel" && t[2][0] === 'Say "hi"' && t[2][2] === "Band\nNights", "reads quotes, commas, line breaks inside cells, and skips blank lines");
ok(parseCsv("name;team\nAnn;Kids").at(1)[1] === "Kids" && parseCsv("name\tteam\nAnn\tKids").at(1)[1] === "Kids", "reads semicolon and tab files too");

const csv = toCsv([{ first_name: "Daniel", note: "=HYPERLINK(\"x\")", n: -3, d: "2026-10-23T00:00:00.000Z", e: "a,b" }], ["first_name", "note", "n", "d", "e"]);
ok(csv.startsWith("﻿") && csv.includes("\r\n"), "writes a byte-order mark and Windows line endings so Excel opens it cleanly");
ok(csv.includes(`"'=HYPERLINK(""x"")"`) && csv.includes(",-3,") && csv.includes(",2026-10-23,") && csv.includes('"a,b"'), "formulas are neutralized, negative numbers and dates kept, commas quoted");
ok(parseCsv(csv)[1][0] === "Daniel", "what we write reads back");

const cols = rosterColumns(["First Name", "Last Name", "E-mail Address", "Serving Team"]);
ok(cols.first === 0 && cols.last === 1 && cols.email === 2 && cols.team === 3, "finds columns whatever the spreadsheet calls them");
const r = rosterRows(parseCsv("First Name,Last Name,Ministry\nPat,Lee,Kids\nSam,,Band"));
ok(r.rows.length === 2 && r.rows[0].name === "Pat Lee" && r.rows[0].team === "Kids" && r.rows[1].name === "Sam", "first and last names are joined");
ok(/Team column/.test(rosterRows(parseCsv("Name,Email\nA,a@b.co")).error), "a file without a team column says so plainly");
ok(/Email or Name/.test(rosterRows(parseCsv("Team\nKids")).error), "a file without a person column says so plainly");

ok(PEOPLE_COLUMNS.slice(0, 4).join() === "first_name,last_name,email,phone", "people export starts with the columns church software imports expect");
ok(fileName("people", "Pinewood Church!", new Date("2026-10-23T12:00:00Z")) === "pinewood-church-people-2026-10-23.csv", "file names are tidy");
process.exit(fail ? 1 : 0);
