import Capacitor
import Darwin
import UIKit
import WebKit
import XCTest
@_spi(Testing) import App

private func pluginCall(_ options: [String: Any]) -> CAPPluginCall {
    return CAPPluginCall(
        callbackId: "-1",
        methodName: "log",
        options: options,
        success: { _, _ in XCTFail("return-none Console call resolved") },
        error: { _ in XCTFail("return-none Console call rejected") }
    )
}

@objc(SyntheticCredentialPlugin)
private final class SyntheticCredentialPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "SyntheticCredentialPlugin"
    let jsName = "SyntheticCredential"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "emit", returnType: CAPPluginReturnPromise)
    ]

    @objc func emit(_ call: CAPPluginCall) {
        call.resolve(["idToken": "ERGOMATIC_SYNTHETIC_APPLE_CREDENTIAL_F3"])
    }
}

final class ErgomaticConsolePluginUnitTests: XCTestCase {
    func testUsesSixVendorLevelsAndDefaultsUnknownLevelToLog() {
        var lines: [String] = []
        let plugin = ErgomaticConsolePlugin(
            isDevEnvironment: { true },
            sink: { lines.append($0) }
        )

        for level in ["debug", "error", "info", "log", "trace", "warn"] {
            plugin.log(pluginCall(["level": level, "message": "message"]))
        }
        plugin.log(pluginCall(["level": "credential", "message": "message"]))

        XCTAssertEqual(lines, [
            "⚡️  [debug] - message",
            "⚡️  [error] - message",
            "⚡️  [info] - message",
            "⚡️  [log] - message",
            "⚡️  [trace] - message",
            "⚡️  [warn] - message",
            "⚡️  [log] - message",
        ])
    }

    func testMissingAndNonStringMessagesMapToEmpty() {
        var lines: [String] = []
        let plugin = ErgomaticConsolePlugin(
            isDevEnvironment: { true },
            sink: { lines.append($0) }
        )

        plugin.log(pluginCall(["level": "warn"]))
        plugin.log(pluginCall(["level": "warn", "message": 42]))

        XCTAssertEqual(lines, ["⚡️  [warn] - ", "⚡️  [warn] - "])
    }

    func testNonDevEnvironmentEmitsNothing() {
        var lines: [String] = []
        let plugin = ErgomaticConsolePlugin(
            isDevEnvironment: { false },
            sink: { lines.append($0) }
        )

        plugin.log(pluginCall(["level": "warn", "message": "hidden"]))

        XCTAssertTrue(lines.isEmpty)
    }
}

@MainActor
final class ErgomaticConsoleBridgeTests: XCTestCase {
    private let diagnostic = "ERGOMATIC_NON_CREDENTIAL_DIAGNOSTIC"
    private let credential = "ERGOMATIC_SYNTHETIC_APPLE_CREDENTIAL_F3"

    func testAppHostedConsoleAndCredentialResultCrossTheCompiledBridge() async throws {
        let storyboard = UIStoryboard(name: "Main", bundle: Bundle.main)
        let controller = try XCTUnwrap(
            storyboard.instantiateInitialViewController() as? CAPBridgeViewController
        )
        controller.loadViewIfNeeded()
        let bridge = try XCTUnwrap(controller.bridge)
        let webView = try XCTUnwrap(bridge.webView)
        #if !DEBUG
        bridge.registerPluginInstance(
            ErgomaticConsolePlugin(
                isDevEnvironment: { false },
                sink: { Swift.print($0) }
            )
        )
        #endif
        bridge.registerPluginInstance(SyntheticCredentialPlugin())
        webView.reload()

        try await waitForBridge(in: webView)
        let capture = StdoutCapture()
        capture.start()
        do {
            _ = try await webView.callAsyncJavaScript(
                """
                console.warn('\(diagnostic)');
                await window.Capacitor.Plugins.SyntheticCredential.emit();
                return true;
                """,
                arguments: [:],
                in: nil,
                contentWorld: .page
            )
        } catch {
            _ = capture.stop()
            throw error
        }
        try await Task.sleep(nanoseconds: 250_000_000)
        let output = capture.stop()

        #if DEBUG
        XCTAssertEqual(output.components(separatedBy: diagnostic).count - 1, 1)
        XCTAssertTrue(output.contains("⚡️  [warn] - \(diagnostic)"))
        #else
        XCTAssertFalse(output.contains(diagnostic))
        #endif
        XCTAssertFalse(output.contains(credential))
    }

    private func waitForBridge(in webView: WKWebView) async throws {
        for _ in 0..<100 {
            if let ready = try? await webView.evaluateJavaScript("""
                typeof window.Capacitor?.Plugins?.Console?.log === 'function' &&
                typeof window.Capacitor?.Plugins?.SyntheticCredential?.emit === 'function'
                """) as? Bool, ready {
                return
            }
            try await Task.sleep(nanoseconds: 50_000_000)
        }
        XCTFail("compiled app bridge did not become ready")
        throw NSError(domain: "ErgomaticConsoleBridgeTests", code: 1)
    }
}

private final class StdoutCapture {
    private let pipe = Pipe()
    private var saved: Int32 = -1

    func start() {
        fflush(stdout)
        saved = dup(STDOUT_FILENO)
        XCTAssertGreaterThanOrEqual(saved, 0)
        XCTAssertGreaterThanOrEqual(
            dup2(pipe.fileHandleForWriting.fileDescriptor, STDOUT_FILENO),
            0
        )
    }

    func stop() -> String {
        fflush(stdout)
        XCTAssertGreaterThanOrEqual(dup2(saved, STDOUT_FILENO), 0)
        close(saved)
        pipe.fileHandleForWriting.closeFile()
        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        return String(decoding: data, as: UTF8.self)
    }
}
