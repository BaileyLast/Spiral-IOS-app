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

// Turn a normal Instagram https link into Instagram's custom app URL scheme
// (instagram://...). Opening an https link with UIApplication.open just launches
// Safari (iOS does NOT reliably route a programmatically-opened universal link
// into the installed app), so to actually open the Instagram APP we must hand it
// an instagram:// URL. Returns null when we don't recognise the link.
//   instagram.com/<handle>      -> instagram://user?username=<handle>
//   ig.me/m/<handle> (DM link)  -> instagram://user?username=<handle>
// There is no reliable public scheme for a direct DM compose, so we open the
// profile instead — it's one tap from Message, matching the on-screen steps.
function instagramAppSchemeUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    const parts = u.pathname.split("/").filter(Boolean);
    if (host === "ig.me" && parts[0] === "m" && parts[1]) {
      return `instagram://user?username=${encodeURIComponent(parts[1])}`;
    }
    if (host === "instagram.com" && parts[0]) {
      return `instagram://user?username=${encodeURIComponent(parts[0])}`;
    }
    return null;
  } catch {
    return null;
  }
}

// Open a link that should hand off to the native Instagram app when possible.
// On native we FIRST try Instagram's custom instagram:// scheme (the only thing
// that opens the actual app); the `instagram` scheme is whitelisted in
// Info.plist's LSApplicationQueriesSchemes. If the app isn't installed (open
// returns completed:false or throws) we fall back to opening the original https
// link in the in-app browser so the flow never dead-ends.
export async function openInstagram(url: string): Promise<void> {
  if (isNativePlatform()) {
    const schemeUrl = instagramAppSchemeUrl(url);
    if (schemeUrl) {
      try {
        const { completed } = await AppLauncher.openUrl({ url: schemeUrl });
        if (completed) return;
      } catch {
        // App not installed / scheme blocked — fall back to the web link below.
      }
    }
  }
  await openExternalUrl(url);
}
