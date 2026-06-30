import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { AppLauncher } from "@capacitor/app-launcher";

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
// which makes "open this product" links look broken. On native we use the
// Capacitor Browser plugin (an in-app Safari view with a Done button); on the web
// we fall back to a normal new tab. Use this for ordinary web pages you want to
// keep the user inside the app for (product pages, help articles, etc.).
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

// Open a link that should hand off to the native Instagram app when possible.
// The in-app Safari view used by openExternalUrl (SFSafariViewController) never
// launches another app, so Instagram links always showed the web version. Here
// we use AppLauncher (UIApplication.open), which honours Instagram's universal
// links (ig.me / instagram.com) and opens the installed app; if the app is not
// installed iOS opens the link in the system browser instead. If anything fails
// we fall back to the in-app browser so the link still works.
export async function openInstagram(url: string): Promise<void> {
  if (isNativePlatform()) {
    try {
      const { completed } = await AppLauncher.openUrl({ url });
      if (completed) return;
    } catch {
      // Fall through to the in-app browser below.
    }
  }
  await openExternalUrl(url);
}
