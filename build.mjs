// Builds the site into dist/: index.html (+ 404.html for GitHub Pages) with the Supabase config baked in.
// The same dist/ is what the iOS and Android apps load (Capacitor), so there's one codebase.
import { build } from "esbuild";
import { createHash } from "crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync, cpSync } from "fs";

const cfgPath = process.env.HTS_CONFIG || "config.json";
const cfg = existsSync(cfgPath) ? JSON.parse(readFileSync(cfgPath, "utf8")) : {};
cfg.supabaseUrl ||= process.env.SUPABASE_URL || "";
cfg.supabaseAnonKey ||= process.env.SUPABASE_ANON_KEY || "";
cfg.siteUrl ||= process.env.SITE_URL || "";

const out = await build({ entryPoints: ["src/app.js"], bundle: true, format: "iife", minify: true, write: false, target: "es2020", legalComments: "none" });
const js = out.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
const css = readFileSync("src/styles.css", "utf8");
const pub = { supabaseUrl: cfg.supabaseUrl, supabaseAnonKey: cfg.supabaseAnonKey, siteUrl: cfg.siteUrl, pcoClientId: cfg.pcoClientId || "" };
const cfgScript = `window.HTS_CONFIG=${JSON.stringify(pub)};`;
const sha = (t) => "'sha256-" + createHash("sha256").update(t).digest("base64") + "'";
let sbHost = ""; try { sbHost = new URL(cfg.supabaseUrl).host; } catch {}
// Only our own two scripts may run; data only goes to our database. Church logos can come from any https site.
const csp = [
  "default-src 'self'", `script-src ${sha(cfgScript)} ${sha(js)}`, "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com", "img-src 'self' data: https:",
  `connect-src 'self'${sbHost ? ` https://${sbHost} wss://${sbHost}` : ""}`, "object-src 'none'", "base-uri 'none'", "form-action 'none'",
].join("; ");
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="referrer" content="no-referrer">
<title>Here To Serve</title>
<meta name="description" content="Membership class, gifts and next steps for your church.">
<meta name="theme-color" content="#F6F4EE">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Here To Serve">
<meta property="og:title" content="Here To Serve">
<meta property="og:description" content="Membership class, spiritual gifts and next steps for your church, all from a phone.">
<meta property="og:url" content="https://heretoserve.app/">
<meta property="og:image" content="https://heretoserve.app/share.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="https://heretoserve.app/share.png">
<link rel="icon" href="icon.png" type="image/png"><link rel="apple-touch-icon" href="icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap">
<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}body{margin:0}img{max-width:100%}[hidden]{display:none!important}${css}</style>
</head><body>
<header id="top"></header>
<main id="app"></main>
<footer id="foot"></footer>
<script>${cfgScript}</script>
<script>${js}</script>
</body></html>`;
mkdirSync("dist", { recursive: true });
writeFileSync("dist/index.html", html);
writeFileSync("dist/404.html", html);
if (existsSync("public")) cpSync("public", "dist", { recursive: true });
// Universal links: heretoserve.app links (class codes, staff sign-in) open in the iPhone app once the Apple Team ID is set
if (cfg.appleTeamId) {
  mkdirSync("dist/.well-known", { recursive: true });
  writeFileSync("dist/.well-known/apple-app-site-association", JSON.stringify({ applinks: { details: [{ appIDs: [`${cfg.appleTeamId}.app.heretoserve`], components: [{ "/": "/*" }] }] } }));
}
// Retired 24 Oct 2026: no CNAME, so this copy never claims heretoserve.app (the live app is the Lovable project).
console.log(`built dist/index.html ${(html.length / 1024).toFixed(0)}KB, live=${!!(cfg.supabaseUrl && cfg.supabaseAnonKey)}`);
