import type { CapacitorConfig } from "@capacitor/cli";
import { KeyboardResize } from "@capacitor/keyboard";

const config: CapacitorConfig = {
  appId: "app.joinspiral.customer",
  appName: "Spiral",
  webDir: "dist/public",
  ios: {
    contentInset: "never",
    limitsNavigationsToAppBoundDomains: false,
  },
  plugins: {
    // Resize the WebView when the iOS keyboard opens so the page can scroll the
    // focused field (e.g. the Login / Sign Up submit button) into view instead
    // of leaving it hidden behind the keyboard.
    Keyboard: {
      resize: KeyboardResize.Native,
    },
  },
};

export default config;
