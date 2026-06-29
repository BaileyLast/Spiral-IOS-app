import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.joinspiral.customer",
  appName: "Spiral",
  webDir: "dist/public",
  ios: {
    contentInset: "never",
    limitsNavigationsToAppBoundDomains: false,
  },
};

export default config;
