import Capacitor
import Foundation

@objc(ErgomaticConsolePlugin)
public final class ErgomaticConsolePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ErgomaticConsolePlugin"
    public let jsName = "Console"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "log", returnType: CAPPluginReturnNone)
    ]

    private let isDevEnvironment: () -> Bool
    private let sink: (String) -> Void
    private let levels = Set(["debug", "error", "info", "log", "trace", "warn"])

    public override convenience init() {
        self.init(
            isDevEnvironment: {
                #if DEBUG
                return true
                #else
                let debugValue = Bundle.main.object(
                    forInfoDictionaryKey: "CAPACITOR_DEBUG"
                ) as? String
                return debugValue == "true"
                #endif
            },
            sink: { Swift.print($0) }
        )
    }

    @_spi(Testing) public init(
        isDevEnvironment: @escaping () -> Bool,
        sink: @escaping (String) -> Void
    ) {
        self.isDevEnvironment = isDevEnvironment
        self.sink = sink
        super.init()
    }

    @objc public func log(_ call: CAPPluginCall) {
        guard isDevEnvironment() else { return }
        let requestedLevel = call.getString("level") ?? "log"
        let level = levels.contains(requestedLevel) ? requestedLevel : "log"
        let message = call.getString("message") ?? ""
        sink("⚡️  [\(level)] - \(message)")
    }
}
