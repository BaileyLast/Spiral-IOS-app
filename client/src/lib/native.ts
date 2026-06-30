import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";

// True when running inside the native iOS shell (Capacitor), false on the web.
export function isNativePlatform(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

// Open an external URL so it works everywhere. In the native iOS WebView a plain
// window.open(url, "_blank") silently does nothing (no new window to open into),
// which makes "open Instagram / open this product" links look broken. On native
// we use the Capacitor Browser plugin (an in-app Safari view with a Done button,
// which also hands off to the Instagram app for ig.me / instagram.com links); on
// the web we fall back to a normal new tab.
export async function openExternalUrl(url: string): Promise<void> {
  if (isNativePlatform()) {
    try {
      await Browser.open({ url });
      return;
    } catch {
      // Fall through to the web behaviour if the plugin is unavailable.
    }
  }
  window.open(url, "_blank", "noopener,noreferrer");
}
