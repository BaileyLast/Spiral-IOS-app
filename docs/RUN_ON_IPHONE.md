# Running Spiral on a real iPhone

This repl is the Spiral website. We wrapped it in a small native iOS shell
(using Capacitor) so you can install it on a real iPhone and test the whole
flow, including the Instagram Story share with the shop-link sticker.

You cannot build an iPhone app on Replit (Apple's build tools only run on a Mac).
So the steps below are done on a Mac with Xcode.

## What you need

- A Mac with **Xcode** installed (free from the Mac App Store).
- An **Apple ID** (a free one works for testing on your own phone).
- An **iPhone** and a USB cable.
- **Instagram** installed on that iPhone, logged in.

## One-time setup on the Mac

1. Get this project onto your Mac (download it from Replit, or `git clone` it).
2. Open the **Terminal** app and go into the project folder, for example:
   ```
   cd ~/Downloads/spiral-customer
   ```
3. Install the website dependencies:
   ```
   npm install
   ```
4. Install CocoaPods (one time only, if you do not already have it):
   ```
   sudo gem install cocoapods
   ```
5. Build the website and copy it into the iPhone project:
   ```
   npm run build
   npx cap sync ios
   ```

> The app talks to the Spiral backend at `https://api.joinspiral.app`. That
> address is the built-in default, so a plain `npm run build` on your Mac will
> point the app at the live backend — you do not need to set anything for
> sign-in to work. If you ever need to point at a different backend (e.g. a
> staging server), set `VITE_API_BASE_URL` before `npm run build`.

## Open it in Xcode

```
npx cap open ios
```

This opens **App.xcworkspace** in Xcode. (Always open the `.xcworkspace`, not the
`.xcodeproj`.)

## Sign the app with your Apple ID

1. In Xcode's left sidebar, click the blue **App** project at the top.
2. Select the **App** target, then the **Signing & Capabilities** tab.
3. Check **Automatically manage signing**.
4. For **Team**, choose **Add an Account...** and sign in with your Apple ID,
   then pick your name as the team.
5. If Xcode complains the bundle identifier is taken, change **Bundle
   Identifier** to something unique, for example `app.joinspiral.customer.yourname`.

## Run on your iPhone

1. Plug your iPhone into the Mac. If asked on the phone, tap **Trust**.
2. At the top of Xcode, where it says the device, pick your iPhone (not a
   simulator — the camera and Instagram share need a real device).
3. Press the **Play** (▶) button.
4. The first time, the app will not open yet. On the iPhone go to
   **Settings → General → VPN & Device Management**, tap your Apple ID, and tap
   **Trust**. Then tap the Spiral app icon to open it.

## Testing the Story share

1. In the app, go through to an order and open the Story composer.
2. Allow camera access when asked.
3. Tap share. The app hands your photo to **Instagram Stories** and Instagram
   opens with your photo as the background and the shop link attached.

### Important note about the shop link sticker

Instagram only attaches the tappable **link sticker** from a third-party app
like Spiral for accounts that are eligible for link stickers in Stories. If your
test account is not eligible, the photo will still post but the tappable link may
not appear. Test with an eligible account to see the full flow.

Also, for Instagram to accept the share reliably, set your real Facebook App ID
(registered for Instagram Stories sharing) in `ios/App/App/Info.plist` under the
key **IGSourceApplicationID**. It is empty by default; while empty, the app falls
back to the bundle id, which lets Instagram open but may cause the payload to be
ignored. A registered id is what makes the share reliable.

## After changing the website

Any time you change the website code, rebuild and re-sync before running again:

```
npm run build
npx cap sync ios
```

Then press Play in Xcode again.
