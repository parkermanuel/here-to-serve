// Browser check of the member phone flow in demo mode (this device only, no database).
// Needs Playwright: npm i -D playwright, then: node build.mjs && node test/flow.e2e.mjs
import { createServer } from "http";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
const { chromium } = await import(process.env.PW_PATH || "playwright");

const root = new URL("../dist/", import.meta.url).pathname;
const srv = createServer((req, res) => {
  const p = join(root, decodeURIComponent(req.url.split("?")[0]).replace(/^\/$/, "/index.html"));
  if (!existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "Content-Type": p.endsWith(".html") ? "text/html" : p.endsWith(".png") ? "image/png" : "application/octet-stream" }); res.end(readFileSync(p));
}).listen(0);
const base = `http://localhost:${srv.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error" && !/fonts\.g|supabase|Failed to load resource/.test(m.text())) errors.push(m.text()); });
let fail = 0; const ok = (c, m) => { console.log(c ? "ok -" : "FAIL -", m); if (!c) fail++; };
const shot = async (n) => { if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${n}.png` }); };

await page.goto(base + "/#/demo");
await page.waitForSelector("text=Let's find where you fit.");
ok(await page.isVisible("text=Pinewood Church") && await page.isVisible("text=18 or older"), "welcome shows the church and the 18+ line");
await shot("01-welcome");
await page.click("button.cta");
await page.click("button.cta");
ok(await page.isVisible("text=Add your name"), "name is required");
await page.fill("#f-name", "Daniel Brooks"); await page.fill("#f-email", "d@b.com");
await page.click("button.cta");
await page.click("button[data-k=married]:text-is('Married')");
ok(await page.isVisible("#f-spouse"), "married people can name a spouse in the same class");
await page.fill("#f-spouse", "Hannah Brooks"); await page.click("button.chip:text-is('2')"); await page.click("button.cta");
await page.click("text=Not sure"); await page.click("button[data-k=bapt]:text('Not yet')"); await page.click("button[data-k=group]:text('No')"); await shot("02-faith"); await page.click("button.cta");
await page.click("text=A friend invited me"); await page.click("button[data-k=served]:text('No')"); await page.click("button.cta");
await page.click("text=Teaching"); await page.click("button.cta");
await page.click("text=Kids"); await page.click("button.cta");
await page.click("text=Sundays"); await page.click("text=Weekly"); await page.click("button.cta");
await page.fill("#f-prayer", "Wisdom for a new job"); await page.click("button.cta");
ok(await page.isVisible("text=Part 1 is done"), "break screen after Part 1");
await page.click("button.cta");
for (let i = 0; i < 33; i++) { await page.waitForSelector(`text=Part 2 · ${i + 1} of 33`); await page.click(i % 2 ? "button.opt >> nth=1" : "button.opt >> nth=0"); }
await page.waitForSelector("text=Here's how God has gifted you.");
ok((await page.locator(".gift").count()) === 3 && (await page.locator(".team").count()) === 2, "results: 3 gifts and 2 teams");
ok(await page.isVisible("text=A pastor will reach out to talk about following Jesus") && await page.isVisible("text=Talk with a pastor about baptism"), "results list the faith and baptism next steps");
await shot("03-results");
await page.reload();
await page.waitForSelector("text=Here's how God has gifted you.");
ok(true, "reloading the page comes back to the results (saved on the device)");
await page.click("button.cta");
ok(await page.isVisible("text=Are you ready to join the serve team at Pinewood Church?"), "the decision uses the church's own words (join the serve team)");
await page.click("text=I'm ready to join the serve team");
ok(await page.isVisible("text=One step first"), "someone not yet baptized is told baptism comes first");
await page.click("text=I answered that wrong");
await page.click("button[data-k=faith]:text('Yes')"); await page.click("button[data-k=bapt]:text('Yes')");
for (let i = 0; i < 7; i++) { await page.click("button.cta"); await page.waitForTimeout(150); }
await page.waitForSelector("text=Here's how God has gifted you.");
ok(true, "changing the faith answers skips back past the finished gifts questions");
await page.click("button.cta");
await page.click("text=I'm ready to join the serve team");
ok(await page.getAttribute(".cta", "aria-disabled") === "true", "Submit is locked until every commitment is checked");
await page.click("text=Read what we believe");
ok(await page.isVisible("text=for every believer"), "beliefs pop-up opens with the communion line");
await shot("04-beliefs");
await page.click("[aria-label=Close]");
for (const b of await page.locator("button.crow").all()) await b.click();
await shot("05-commit");
await page.click("button.cta");
await page.waitForSelector("text=Submitted!");
ok(await page.isVisible("text=A pastor will confirm your next step"), "Submitted screen");
ok(await page.isVisible("text=Your top gifts") && await page.isVisible("text=Commitments you made") && await page.isVisible("text=Send yourself a copy"), "their own copy: gifts, teams, commitments and next steps");
ok((await page.inputValue("#cp-email")) === "d@b.com", "the copy goes to the email they gave");
await shot("06-sent");
await page.goto(base + "/#/privacy"); await page.waitForSelector("text=Planning Center");
ok(await page.isVisible("h1:text('Privacy')"), "privacy page");
await page.goto(base + "/#/terms"); await page.waitForSelector("h1:text('Terms')");
ok(true, "terms page");
await page.goto(base + "/#/"); await page.waitForSelector("text=Staff sign in");
ok(true, "staff sign-in page");
ok(errors.length === 0, "no script errors" + (errors.length ? ": " + errors.join(" | ") : ""));
await browser.close(); srv.close();
process.exit(fail ? 1 : 0);
