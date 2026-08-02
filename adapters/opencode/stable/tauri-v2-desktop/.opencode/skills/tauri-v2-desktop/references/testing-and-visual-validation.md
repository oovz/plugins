# Testing and visual validation

Use this reference for native behavior, platform conditionals, packaging, updater behavior, windows, menus, tray icons, sidecars, deep links, or visible UI.

## Establish the supported matrix

Inspect the project rather than inventing support:

- Read the release workflow, Tauri configuration, Rust targets, bundle settings, and documented support policy.
- Record each shipped operating system, architecture, installer/package, minimum OS, Linux runtime baseline, and relevant webview.
- Record the runner's actual host and target. `rustc -vV` reports the Rust host; the build `--target` is the target.
- Select the smallest matrix that covers the affected behavior. Security, updater, plugin, platform-conditional, native-window, packaging, and visual changes normally require every affected shipped OS/architecture.
- A successful cross-build proves compilation and perhaps packaging only. It does not prove that the binary, webview, plugin, sidecar, installer, or updater works on the target architecture.

Common desktop targets are starting points, not a promise to support them:

| Platform | Common build targets | Native considerations |
|---|---|---|
| Windows | `x86_64-pc-windows-msvc`, `aarch64-pc-windows-msvc`; `i686-pc-windows-msvc` only if shipped | Test WebView2, filesystem paths, native plugins, sidecars, MSI/NSIS, signing, protocol activation, and updater behavior on the target architecture. |
| macOS | `aarch64-apple-darwin`, `x86_64-apple-darwin`, or Tauri CLI `universal-apple-darwin` | The universal value is a Tauri CLI pseudo-target combining the two real Rust targets. Verify both slices and exercise both CPU families. Label Rosetta as emulated coverage, not native Intel coverage. |
| Linux | Usually `x86_64-unknown-linux-gnu` and `aarch64-unknown-linux-gnu`; `armv7-unknown-linux-gnueabihf` only if declared | Test the package on its architecture and oldest supported glibc/WebKitGTK baseline. ARM AppImages require an ARM machine or explicitly labeled emulation. Put specialized ARMv7 native/QEMU coverage in scheduled/release jobs unless the change directly affects it. |

Do not add an architecture merely because it appears in the table. Optimize by declared shipping targets and risk, not the Cartesian product of every dimension.

## Test in layers

### 1. Fast logic checks

On every relevant change, install from the lockfile and run the repository's frontend format/lint/type/unit/build checks plus Rust checks such as:

```bash
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
```

Use the repository-supported feature combinations. Run `--all-features` only when all features are designed to coexist; split mutually exclusive or OS-specific features into appropriate target jobs.

Use `@tauri-apps/api/mocks` for frontend IPC logic when appropriate and call `clearMocks()` after tests. Tauri's mock runtime does not execute native webview libraries or the real platform integration. Never present a mock test as proof of native permissions, Rust/backend behavior, webview behavior, or packaging.

### 2. Native application tests

Build and launch the actual Tauri binary on each affected shipping OS. Exercise real IPC, capabilities, filesystem paths, windows, menus, tray, dialogs, deep links, notifications, plugins, sidecars, and lifecycle behavior relevant to the change.

Prefer WebdriverIO with `@wdio/tauri-service` for new automated end-to-end suites. Its embedded provider supports Windows, Linux, and macOS. Direct use of `tauri-driver` supports Windows and Linux only because macOS has no native WKWebView driver.

The embedded provider uses test-support Tauri plugins and setup hooks. Compile/initialize them only in the dedicated test build or behind an explicit test-only feature/configuration, and verify they are absent or disabled in production release artifacts. Do not ship a WebDriver control surface in the normal application.

- **Windows:** build on Windows with the MSVC toolchain. A Windows x64 host can build ARM64 when the required Visual Studio components are installed, but execute and install the result on the target architecture before calling it native ARM64 coverage. With direct `tauri-driver`, keep EdgeDriver compatible with installed Edge/WebView2. Exercise each installer type only when shipped.
- **macOS:** use the WebdriverIO embedded provider for automated UI tests. Cover platform menus, tray, file dialogs, deep links, signing/notarization staging, and both CPU families when shipped.
- **Linux:** install the project's WebKitGTK and package prerequisites. Use `xvfb-run` for headless native UI tests when needed. Cover X11 and Wayland only if both are in the support contract.

Browser mode with mocked `invoke()` is useful renderer-only coverage, not a native Tauri end-to-end test.

### 3. Architecture and artifact smoke tests

Every marketed OS/architecture pair must eventually be installed and launched on its native architecture. A virtual machine using the same CPU instruction set is virtualized runtime evidence; CPU emulation is emulated evidence and never counts as native coverage. If only emulation is available, report its result and keep native-target coverage explicitly unverified unless the release policy knowingly accepts that residual risk. Test the packaged artifact, not only `tauri dev` or an unpackaged executable.

For each shipped artifact:

- verify the expected bundle and updater files and architecture;
- install, first-launch, quit, relaunch, upgrade from the supported previous version, and uninstall;
- test paths containing spaces and non-ASCII characters;
- verify resources, icons, scopes, protocol handlers, native plugins, matching sidecars, stored state, signatures, and updater metadata;
- retain logs and failure artifacts.

For every `bundle.externalBin`, require the correctly named `name-$TARGET_TRIPLE` input (`.exe` on Windows) before building. Use the explicit build target, not the host tuple, for cross-build names. In the installed artifact, launch the bundled sidecar and verify its architecture, Unix execute bit, arguments, stdin/stdout/stderr, exit and termination behavior, permission denial, and upgrade replacement.

Native specifics:

- MSI must be produced on Windows. Test MSI and NSIS separately if both ship. Validate Authenticode, WebView2 mode/minimum version, per-user/per-machine behavior, updater `installMode`, upgrade, and uninstall. For Windows ARM64, inspect the architecture of the installed application payload; an NSIS bootstrap executable can itself be x86 and run under Windows emulation.
- Build/sign/notarize macOS releases on macOS. Test normal quarantine/Gatekeeper behavior. For universal apps, inspect both slices of the app and nested native code, then execute on both supported CPU families.
- Build Linux packages on a compatible baseline. Test each shipped AppImage/DEB/RPM on suitable systems. `linuxdeploy` cannot cross-compile an ARM AppImage; use an ARM runner/device or explicitly labeled emulator.

Updater tests must use a signed HTTPS staging fixture or a local endpoint enabled only by explicit test configuration, never the production release channel. Tauri requires TLS in production; do not commit or ship `dangerousInsecureTransportProtocol: true` merely to support a loopback fixture. Include no-update, valid previous-to-candidate, relaunch, target/architecture selection, malformed response, unavailable artifact, invalid signature, and endpoint fallback cases. Assert that malformed, unavailable, or wrong-signature candidates do not install. Never expose signing or updater private keys to untrusted pull-request jobs.

## CI cadence optimized for risk

- **Every pull request:** one fast logic job. For a low-risk frontend-only change, use one representative native smoke (or an already-cheap primary matrix). Add every affected primary OS and architecture when native APIs, platform UI, rendering, security, or platform conditionals change.
- **Merge branch:** run the primary native matrix for the operating systems the product ships, even when individual low-risk pull requests use a reduced smoke set.
- **Nightly or scheduled:** declared secondary architectures, long native end-to-end suites, compatibility OS/webview variants, accessibility, and broader visual checks.
- **Release candidate/tag:** every shipped OS × architecture artifact; installer, signature, updater, clean-install, upgrade, relaunch, and uninstall paths. Use protected signing jobs and `fail-fast: false` so all cells report.
- **Packaging/updater/sidecar/security/platform changes:** promote every affected cell to the current change's required gate rather than waiting for the normal cadence.

Use native runners where practical. Emulation is useful but must be labeled. Key caches by OS, architecture/target, toolchain, and lockfiles; do not mix incompatible Rust `target/` directories. Pin Linux release builders to the oldest supported baseline rather than a moving `latest` image.

## Visual QA capability gate

Before asking for, capturing, or reviewing screenshots, determine whether the active agent and its available tools can receive and inspect image pixels. Do not infer image capability merely because a tool can create a screenshot.

- **Image inspection available:** capture from the actual Tauri app on each affected native target and inspect the original or high-detail image.
- **Capture available but image inspection unavailable:** retain screenshots as artifacts and use DOM snapshots, accessibility trees, geometry/layout metrics, console logs, and automated assertions for the current pass. Delegate visual inspection to an image-capable agent/person when available.
- **No inspection route:** report visual inspection as unverified. Do not claim a screenshot passed.

Do not ask the user to send screenshots unless the current agent can inspect them or a named image-capable reviewer will. Remove secrets and personal data from images before handoff. Never use generated images as evidence of actual application rendering.

## Visual matrix and evidence

Use risk-based combinations from affected targets, not an exhaustive product:

- WebView2 on Windows, WKWebView on macOS, and WebKitGTK on Linux;
- every distributed architecture where rendering or native assets can differ;
- Windows 100% and a supported fractional scale; macOS Retina/non-Retina when relevant; supported Linux HiDPI/fractional scale;
- light, dark, and supported high/increased-contrast modes;
- default and longest translations, plus RTL when supported;
- minimum, normal, maximized, fullscreen, and mixed-DPI/multi-monitor states when relevant;
- loading, empty, populated, validation-error, offline/error, native dialog, tray/menu, permission, and updater states.

Record OS version, architecture, webview version, display scale, theme, locale, window dimensions/state, and app commit with every screenshot. Stabilize data, time, random IDs, animations, caret blinking, network responses, and window dimensions before comparison. Maintain separate baselines when OS/webview/scale rendering differs; never use one OS's pixels as the universal oracle.

Use a full-desktop or appropriate system-UI capture for tray icons, native menus, permission prompts, and operating-system dialogs. A webview-window screenshot cannot validate UI outside the application window.

Prefer structural assertions for dimensions, overflow, visibility, focus, and semantics. Use image diffs for appearance with documented tolerances and narrowly justified masks. Review a changed baseline before accepting it.

Screenshots prove visible appearance at a moment in time. They do not prove keyboard operation, hit targets, focus order, semantic roles, accessible names, screen-reader output, hover behavior, or successful interaction. Pair images with input-driven tests, accessibility-tree/platform accessibility inspection, DOM/layout assertions, and application logs.

## Completion evidence

Report:

- host OS/architecture and every build/test target;
- commands or suites and results;
- binaries, installers, updater paths, and sidecars exercised;
- native, virtualized, emulated, cross-built, mocked, and untested coverage separately;
- screenshots actually inspected, including OS, architecture, webview, theme, and scale;
- targets skipped, why, and the residual risk.

Official sources: [Tauri tests](https://v2.tauri.app/develop/tests/), [mock APIs](https://v2.tauri.app/develop/tests/mocking/), [WebDriver](https://v2.tauri.app/develop/tests/webdriver/), [WebDriver CI](https://v2.tauri.app/develop/tests/webdriver/ci/), [GitHub pipelines](https://v2.tauri.app/distribute/pipelines/github/), [Windows installer](https://v2.tauri.app/distribute/windows-installer/), [AppImage](https://v2.tauri.app/distribute/appimage/), and [updater](https://v2.tauri.app/plugin/updater/).
