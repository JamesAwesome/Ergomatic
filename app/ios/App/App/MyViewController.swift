import Capacitor
import UIKit

/// Wave E PR1.75b: the vendor recipe for a local Capacitor plugin
/// (capacitorjs.com/docs/ios/custom-code) -- a `CAPBridgeViewController`
/// subclass that registers the instance in `capacitorDidLoad()`. Reached
/// because `Base.lproj/Main.storyboard`'s only view controller now names this
/// class instead of `CAPBridgeViewController` itself.
///
/// `capacitorDidLoad()` is the documented seam: it is `open` and its own doc
/// comment says "This is called before the webview has been added to the view
/// hierarchy" (CAPBridgeViewController.swift:158-165), and it runs AFTER the
/// bridge is constructed (`:48-53`), so `bridge` is non-nil here and
/// `registerPluginInstance` can export the plugin's JS shim before the page
/// loads (CapacitorBridge.swift:348-365 ends in `JSExport.exportJS`).
class MyViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(WebAuthPlugin())
    }
}
