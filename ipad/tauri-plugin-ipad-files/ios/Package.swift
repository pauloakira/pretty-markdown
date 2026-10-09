// swift-tools-version:5.3

import PackageDescription

let package = Package(
  name: "tauri-plugin-ipad-files",
  platforms: [
    .iOS(.v14)
  ],
  products: [
    .library(
      name: "tauri-plugin-ipad-files",
      type: .static,
      targets: ["tauri-plugin-ipad-files"])
  ],
  dependencies: [
    .package(name: "Tauri", path: "../.tauri/tauri-api")
  ],
  targets: [
    .target(
      name: "tauri-plugin-ipad-files",
      dependencies: [
        .byName(name: "Tauri")
      ],
      path: "Sources")
  ]
)
