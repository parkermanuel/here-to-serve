// Apple Push Notification service: a signed token (ES256) and one HTTPS call per phone.
// Needs an APNs key (.p8) from the Apple Developer account. See SETUP.md, "Phone app".

const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64urlText = (s) => b64url(new TextEncoder().encode(s));

export async function apnsToken({ keyP8, keyId, teamId, nowSec = Math.floor(Date.now() / 1000), subtle = crypto.subtle }) {
  const pem = String(keyP8).replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await subtle.importKey("pkcs8", der, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const head = b64urlText(JSON.stringify({ alg: "ES256", kid: keyId }));
  const body = b64urlText(JSON.stringify({ iss: teamId, iat: nowSec }));
  const sig = await subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(`${head}.${body}`));
  return `${head}.${body}.${b64url(sig)}`; // WebCrypto already returns the raw r||s form JWT needs
}

// Returns "ok", "gone" (token no longer valid: delete it) or "error"
export async function sendApns({ fetch: f = fetch, token, deviceToken, topic, production, title, body, data = {} }) {
  const host = production ? "https://api.push.apple.com" : "https://api.sandbox.push.apple.com";
  const res = await f(`${host}/3/device/${deviceToken}`, {
    method: "POST",
    headers: { authorization: `bearer ${token}`, "apns-topic": topic, "apns-push-type": "alert", "apns-priority": "10", "content-type": "application/json" },
    body: JSON.stringify({ aps: { alert: { title, body }, sound: "default" }, ...data }),
  });
  if (res.status === 200) return "ok";
  if (res.status === 410 || res.status === 400) return "gone";
  return "error";
}

// What the phone says. Names are kept off the lock screen; staff open the app to see who.
export function message(kind, churchName) {
  if (kind === "submitted") return { title: churchName || "Here To Serve", body: "Someone just finished membership class. Tap to see their next steps." };
  return { title: churchName || "Here To Serve", body: "A next step is overdue. Tap to see it." };
}
