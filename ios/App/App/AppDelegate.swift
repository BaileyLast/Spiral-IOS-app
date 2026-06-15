import UIKit
import Capacitor
import WebKit

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Override point for customization after application launch.
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}

// MARK: - Story Share bridge
//
// The web client (StoryComposer.tsx -> onShare) hands a finished Story off to
// native by calling:
//   window.webkit.messageHandlers.spiralStoryShare.postMessage({
//     backgroundImage, stickerImage, contentURL
//   })
// where backgroundImage/stickerImage are data URLs and contentURL is the shop
// link. This view controller (set as the Main storyboard's class) registers that
// exact handler on the Capacitor WebView and forwards the payload to the
// Instagram Stories sharing API.
//
// NOTE: This lives in AppDelegate.swift on purpose so it is compiled without
// needing to register a new file in the Xcode project. It can be extracted into
// its own StoryShareViewController.swift later from inside Xcode if preferred.
final class StoryShareViewController: CAPBridgeViewController, WKScriptMessageHandler {

    private let handlerName = "spiralStoryShare"

    // Instagram requires a source app id (your Facebook App ID) to accept a
    // Stories share. Set it once in Info.plist under the key
    // "IGSourceApplicationID". Until a real Facebook App ID is set, sharing still
    // opens Instagram but the payload may be ignored.
    private var instagramSourceAppId: String {
        let id = Bundle.main.object(forInfoDictionaryKey: "IGSourceApplicationID") as? String
        if let id = id, !id.isEmpty { return id }
        return Bundle.main.bundleIdentifier ?? "app.joinspiral.customer"
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        if let webView = self.webView {
            webView.configuration.userContentController.add(self, name: handlerName)
        }
    }

    func userContentController(_ userContentController: WKUserContentController,
                              didReceive message: WKScriptMessage) {
        guard message.name == handlerName,
              let body = message.body as? [String: Any] else { return }

        let background = decodeImageData(body["backgroundImage"])
        let sticker = decodeImageData(body["stickerImage"])
        let contentURL = body["contentURL"] as? String

        shareToInstagramStories(background: background,
                                sticker: sticker,
                                contentURL: contentURL)
    }

    // Accepts a data URL ("data:image/...;base64,XXXX") or a bare base64 string.
    private func decodeImageData(_ value: Any?) -> Data? {
        guard let str = value as? String, !str.isEmpty else { return nil }
        let base64: String
        if let commaIndex = str.firstIndex(of: ",") {
            base64 = String(str[str.index(after: commaIndex)...])
        } else {
            base64 = str
        }
        return Data(base64Encoded: base64)
    }

    private func shareToInstagramStories(background: Data?, sticker: Data?, contentURL: String?) {
        guard let url = URL(string: "instagram-stories://share?source_application=\(instagramSourceAppId)"),
              UIApplication.shared.canOpenURL(url) else {
            // Instagram not installed or the URL scheme is unavailable.
            return
        }

        var item: [String: Any] = [:]
        if let background = background {
            item["com.instagram.sharedSticker.backgroundImage"] = background
        }
        if let sticker = sticker {
            item["com.instagram.sharedSticker.stickerImage"] = sticker
        }
        if let contentURL = contentURL, !contentURL.isEmpty {
            item["com.instagram.sharedSticker.contentURL"] = contentURL
        }

        guard !item.isEmpty else { return }

        let expiry = Date().addingTimeInterval(60 * 5)
        UIPasteboard.general.setItems([item], options: [.expirationDate: expiry])
        UIApplication.shared.open(url, options: [:], completionHandler: nil)
    }
}
