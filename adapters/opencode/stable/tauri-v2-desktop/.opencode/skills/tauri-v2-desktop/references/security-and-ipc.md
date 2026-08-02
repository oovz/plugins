# Security, capabilities, and IPC

Use this reference for application commands, core/plugin permissions, remote content, managed state, events, and channels.

## Distinguish the two command models

Application commands registered with `tauri::Builder::invoke_handler` are callable by application windows and webviews by default. Capability files chiefly control frontend access to Tauri core and plugin commands. Do not write a capability entry and then claim it restricts an ordinary application command.

To enroll custom commands in the capability ACL, declare them in `build.rs` with `tauri_build::AppManifest::commands`, generate permissions, and grant only those permissions to the intended windows/webviews. Confirm the current manifest/permission syntax in the [capabilities documentation](https://v2.tauri.app/security/capabilities/).

Regardless of the ACL model, Rust must authorize the action. A permitted caller can still supply malicious arguments.

## Commands and argument serialization

Keep command contracts small and typed:

```rust
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExportRequest {
    project_id: String,
    destination: std::path::PathBuf,
}

#[tauri::command]
async fn export_project(
    request: ExportRequest,
    state: tauri::State<'_, AppState>,
) -> Result<ExportResult, CommandError> {
    validate_export(&request, &state)?;
    perform_export(request, &state).await
}
```

Top-level argument casing follows `#[tauri::command(rename_all = "...")]`; nested structures follow Serde attributes. Do not confuse the two. Register a command defined in another module by its defining path:

```rust
.invoke_handler(tauri::generate_handler![commands::export_project])
```

Tauri generates helper macros beside the command, which is why a re-exported or incorrectly qualified name can fail. Keep a single `invoke_handler` call because later calls replace earlier handlers.

Return stable serializable errors. Avoid leaking filesystem paths, tokens, SQL, stack traces, or internal topology to the frontend.

## Validate at the trust boundary

For every command and native event input, consider:

- length, numeric bounds, enum membership, and malformed Unicode;
- canonicalized paths and allowed roots, including symlink and traversal behavior;
- URL schemes, hosts, ports, redirect destinations, and credentials;
- current user/session authorization and ownership of referenced objects;
- replay, concurrency, duplicate submission, and cancellation;
- command arguments used by a shell or sidecar.

Never concatenate untrusted text into a shell command. Prefer a fixed executable and separately supplied, validated arguments. Use plugin scopes and capability validators as defense in depth, not as the only business authorization.

## Capabilities and remote content

Capability files under `src-tauri/capabilities/` are discovered automatically unless `app.security.capabilities` explicitly selects a subset. Use exact platform names: `linux`, `macOS`, and `windows`.

Bind capabilities to explicit window/webview labels when feasible. Grant narrow plugin operations (`readFile`, not blanket filesystem access) and narrow path/URL scopes. Validate generated schemas after dependency updates because permission identifiers and configuration schemas can change.

Avoid remote content in privileged webviews. If a remote origin must call native APIs:

- pin HTTPS origins as narrowly as possible;
- account for redirects and navigations;
- expose only the minimum commands and plugin permissions;
- use a dedicated low-privilege webview where practical;
- never place secrets in injected scripts, query strings, or events.

Review [content security policy](https://v2.tauri.app/security/csp/) and [capabilities](https://v2.tauri.app/security/capabilities/) together.

## State, events, and channels

Managed state must be thread-safe for the access pattern. Prefer immutable configuration or a type whose synchronization is internal. With async code, do not retain a `std::sync::MutexGuard` across `.await`; copy the necessary value, release the guard, then await, or use an async mutex deliberately.

Use:

- commands for a bounded request and response;
- events for small, lossy notifications where a response is not required;
- channels for ordered progress, streams, or larger data flows.

Listeners need cleanup when a component unmounts or a window closes. Scope event names and targets; do not broadcast secrets. Apply limits and backpressure to untrusted or high-volume streams.

Official sources: [calling Rust](https://v2.tauri.app/develop/calling-rust/), [capabilities](https://v2.tauri.app/security/capabilities/), [state](https://v2.tauri.app/develop/state-management/), [events](https://v2.tauri.app/develop/calling-frontend/), and [channels](https://v2.tauri.app/develop/calling-frontend/#channels).
