// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "BECAApple",
    platforms: [.iOS(.v15), .macOS(.v12)],
    products: [.library(name: "BECAApple", targets: ["BECAApple"])],
    targets: [
        .target(
            name: "BECAApple",
            path: "BECAApple",
            exclude: ["Info.plist", "Web", "Assets.xcassets", "PrivacyInfo.xcprivacy"],
            sources: ["BECAAppleApp.swift", "AppleSession.swift", "LocalWebServer.swift", "MIDIStream.swift"]
        )
    ],
    // Match the established Xcode project's language mode.
    swiftLanguageModes: [.v5]
)
