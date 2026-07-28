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
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", exact: "8.4.2"),
        .package(name: "AparajitaCapacitorSecureStorage", path: "../../../node_modules/.pnpm/@aparajita+capacitor-secure-storage@8.0.0/node_modules/@aparajita/capacitor-secure-storage"),
        .package(name: "CapacitorCommunityKeepAwake", path: "../../../node_modules/.pnpm/@capacitor-community+keep-awake@8.0.1_@capacitor+core@8.4.2/node_modules/@capacitor-community/keep-awake"),
        .package(name: "CapgoCapacitorSocialLogin", path: "../../../node_modules/.pnpm/@capgo+capacitor-social-login@8.3.39_@capacitor+core@8.4.2/node_modules/@capgo/capacitor-social-login")
    ],
    targets: [
        .target(
            name: "CapApp-SPM",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm"),
                .product(name: "AparajitaCapacitorSecureStorage", package: "AparajitaCapacitorSecureStorage"),
                .product(name: "CapacitorCommunityKeepAwake", package: "CapacitorCommunityKeepAwake"),
                .product(name: "CapgoCapacitorSocialLogin", package: "CapgoCapacitorSocialLogin")
            ]
        )
    ]
)
