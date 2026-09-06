// swift-tools-version: 5.9
import PackageDescription

// DO NOT MODIFY THIS FILE - managed by Capacitor CLI commands
let package = Package(
    name: "CapApp-SPM",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "CapApp-SPM",
            targets: ["CapApp-SPM"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", exact: "8.5.0"),
        .package(name: "AparajitaCapacitorSecureStorage", path: "../../../node_modules/.pnpm/@aparajita+capacitor-secure-storage@8.0.0/node_modules/@aparajita/capacitor-secure-storage"),
        .package(name: "CapacitorCommunityBluetoothLe", path: "../../../node_modules/.pnpm/@capacitor-community+bluetooth-le@8.3.0_@capacitor+core@8.5.0/node_modules/@capacitor-community/bluetooth-le"),
        .package(name: "CapacitorCommunityKeepAwake", path: "../../../node_modules/.pnpm/@capacitor-community+keep-awake@8.0.1_@capacitor+core@8.5.0/node_modules/@capacitor-community/keep-awake"),
        .package(name: "CapacitorApp", path: "../../../node_modules/.pnpm/@capacitor+app@8.1.1_@capacitor+core@8.5.0/node_modules/@capacitor/app"),
        .package(name: "CapacitorBrowser", path: "../../../node_modules/.pnpm/@capacitor+browser@8.0.4_@capacitor+core@8.5.0/node_modules/@capacitor/browser"),
        .package(name: "CapacitorHaptics", path: "../../../node_modules/.pnpm/@capacitor+haptics@8.0.2_@capacitor+core@8.5.0/node_modules/@capacitor/haptics"),
        .package(name: "CapgoCapacitorNfc", path: "../../../node_modules/.pnpm/@capgo+capacitor-nfc@8.2.5_patch_hash=30afcb82af2e9a060332756cf52cc9117090b29447437f022_ca688ebc34bc3d16daff8ca5ab5944e5/node_modules/@capgo/capacitor-nfc"),
        .package(name: "CapgoCapacitorSocialLogin", path: "../../../node_modules/.pnpm/@capgo+capacitor-social-login@8.4.4_@capacitor+core@8.5.0/node_modules/@capgo/capacitor-social-login")
    ],
    targets: [
        .target(
            name: "CapApp-SPM",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm"),
                .product(name: "AparajitaCapacitorSecureStorage", package: "AparajitaCapacitorSecureStorage"),
                .product(name: "CapacitorCommunityBluetoothLe", package: "CapacitorCommunityBluetoothLe"),
                .product(name: "CapacitorCommunityKeepAwake", package: "CapacitorCommunityKeepAwake"),
                .product(name: "CapacitorApp", package: "CapacitorApp"),
                .product(name: "CapacitorBrowser", package: "CapacitorBrowser"),
                .product(name: "CapacitorHaptics", package: "CapacitorHaptics"),
                .product(name: "CapgoCapacitorNfc", package: "CapgoCapacitorNfc"),
                .product(name: "CapgoCapacitorSocialLogin", package: "CapgoCapacitorSocialLogin")
            ]
        )
    ]
)
