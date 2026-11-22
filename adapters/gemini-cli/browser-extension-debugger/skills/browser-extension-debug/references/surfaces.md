# Chromium extension surfaces and diagnostics

Use these paths in Chrome. In Edge, use `edge://extensions` and confirm the corresponding tool or UI can reach the surface.

| Context | How to reproduce | Where to inspect |
|---|---|---|
| Side panel | Use the toolbar action when configured or perform the product gesture that calls `chrome.sidePanel.open`. Keep the intended tab active. | Inspect the panel target and verify its extension ID. Check `side_panel.default_path`, action configuration, and whether the requested panel is enabled for the tab. |
| Action popup | Click the extension’s toolbar icon or use `trigger_extension_action`. | Inspect the popup target and verify its extension ID. Check `action.default_popup` in the generated manifest. |
| Options page | Open it through the product or Chrome’s extension menu when the opening route matters. | Inspect the resulting tab or embedded options page. |
| Content script | Navigate or refresh a representative webpage that matches the manifest. | Inspect the tab with the extension’s execution context selected in DevTools. Check matches, host access, frame selection, and the observed page effect. |
| MV3 service worker | Perform the product action, message, or event that wakes the worker. | Inspect its console via **Inspect views** in `chrome://extensions` or select the worker by ID if the browser tool exposes it. |

An installed extension page opened at `chrome-extension://<id>/...` can exercise extension APIs. Record it as a direct extension-page check. A web preview exercises the UI in a normal web origin. To verify the toolbar opening path, popup lifecycle, or side-panel tab association, exercise that interaction and observe the actual browser-managed surface. If the browser tool cannot inspect the surface, use the dedicated Chrome UI when available and report any interaction you could not observe.

For messaging failures, follow the same message through the sender, receiver, and resulting UI or state. Check relevant console errors, worker logs, and network activity in the context that owns them. Refresh the target webpage after an extension reload when the content script’s old context is invalidated.

## Check service worker restart

For behavior that depends on worker initialization or persisted state, record a successful baseline and establish the state needed for the reproduction. In Chrome DevTools for an extension page, use **Application → Service Workers → Stop** and confirm the worker stopped. Close any debugger attached to the worker because inspection can keep it alive. Trigger the normal wake-up event and verify that the worker responds and restores the expected state without reloading the extension. Record whether you observed termination and recovery. [Chrome’s extension debugging guide](https://developer.chrome.com/docs/extensions/get-started/tutorial/debug#check-the-service-worker-status)
