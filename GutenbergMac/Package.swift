// swift-tools-version: 6.0

import PackageDescription

let package = Package(
    name: "GutenbergMac",
    platforms: [
        .macOS(.v13)
    ],
    products: [
        .executable(name: "GutenbergMac", targets: ["GutenbergMac"])
    ],
    targets: [
        .executableTarget(
            name: "GutenbergMac",
            path: "Sources/GutenbergMac"
        ),
        .testTarget(
            name: "GutenbergMacTests",
            dependencies: ["GutenbergMac"],
            path: "Tests/GutenbergMacTests"
        )
    ]
)
