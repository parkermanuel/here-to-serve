// What the iPhone/Android app adds on top of the website (the same code runs in both).
// Plugins are reached through Capacitor's bridge by name, so the website bundle doesn't carry their web code.
import { Capacitor, registerPlugin } from "@capacitor/core";

export const NATIVE = Capacitor.isNativePlatform();
export const PLATFORM = Capacitor.getPlatform(); // "ios" | "android" | "web"

const Scanner = registerPlugin("CapacitorBarcodeScanner");
const Push = registerPlugin("PushNotifications");
const App = registerPlugin("App");

// Scan the class QR code with the camera. Returns the class code, or null if cancelled or not a class code.
export async function scanClassCode() {
  if (!NATIVE) return null;
  // hint 0 = QR code (CapacitorBarcodeScannerTypeHint.QR_CODE)
  const r = await Scanner.scanBarcode({ hint: 0, scanInstructions: "Point your camera at the code on the screen", scanButton: false });
  return classCodeFrom(r?.ScanResult);
}
export function classCodeFrom(text) {
  const m = String(text || "").match(/#\/j\/([A-Za-z0-9]{6,40})/) || String(text || "").match(/^([a-f0-9]{12})$/);
  return m ? m[1] : null;
}

// Staff phones: ask once, then hand the token to the server. onOpen(route) runs when a notification is tapped.
export async function enablePush(register, onOpen) {
  // iPhone only for now: Android push needs a Firebase project first (see SETUP.md)
  if (!NATIVE || PLATFORM !== "ios") return false;
  let perm = await Push.checkPermissions();
  if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") perm = await Push.requestPermissions();
  if (perm.receive !== "granted") return false;
  await Push.addListener("registration", (t) => register(t.value, PLATFORM).catch(() => {}));
  await Push.addListener("pushNotificationActionPerformed", (a) => { const r = a?.notification?.data?.route; if (r) onOpen(r); });
  await Push.register();
  return true;
}

// Links to heretoserve.app (a class code, a staff sign-in link) open inside the app
export async function onAppLink(handler) {
  if (!NATIVE) return;
  await App.addListener("appUrlOpen", (e) => { try { handler(new URL(e.url)); } catch {} });
}
