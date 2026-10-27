# DuoView

A local Chrome extension for comparing desktop and mobile layouts side by side, with **separate Back, Forward, Reload, and address bars for every viewport**. No account, subscription, server, or build step is needed.

## Install in Chrome (one time)

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode** in the top-right corner.
3. Click **Load unpacked** and select `/home/senu/PROJECTS/duoview/extension` (the folder containing `manifest.json`).
4. Open Chrome's Extensions menu (puzzle-piece icon), then pin **DuoView**.
5. Visit your website, for example `http://localhost:3000`, and click the DuoView icon.

Chrome requires this manual installation step for an unpacked extension. No terminal commands or package installation are needed to use it. After changing source files, click Reload on the extension card and reopen DuoView.

## Updating to 1.1.0

In `chrome://extensions`, click the Reload icon on the DuoView card, then close the old DuoView tab and click the extension icon again. The existing installation folder is unchanged. No reinstall is needed.

Version 1.1.0 replaces the large introductory header and three-row cards with a compact toolbar and two control rows. Mobile previews stay at native width; taller screens scroll vertically instead of shrinking. Wider viewports use available width, with a 75% minimum to protect readability; smaller windows can scroll the workspace horizontally. The old saved Fit preference migrates to Auto width once, keeping device sizes and URLs. Choose Fit whole explicitly when you want a small overview. The global 100% button restores native scale in every view.

The readability regression test checks 1920×900, 1440×900 and 1366×768 browser windows, including migration of existing saved preferences. At 1920×900, desktop renders at 1280 CSS pixels and mobile at 402 CSS pixels; preview content starts at 141 pixels from the top.

## Features

- Desktop and mobile previews together; up to six independent viewports.
- Per-view Back / Forward / Reload, address bar, and Open in tab.
- Top address bar opens one URL across every view.
- Desktop, laptop, iPhone, Pixel, Galaxy and iPad size presets.
- Custom widths/heights from 240 to 3840 CSS pixels through the gear menu; rotate width and height.
- Readable Auto width by default: phones stay at 100%, desktop views stay at 75% or larger. Manual scales from 50% to 200%, plus an optional Fit whole overview.
- Last URLs, devices and scales saved automatically on this computer.
- Optional, tab-scoped compatibility mode for sites blocking embedding.
- Keyboard-accessible controls and an in-app quick guide.

## Navigation behavior

Each viewport records its own URL history, including regular links, redirects, SPA route changes and hash navigation. Back/Forward load the selected URL inside that viewport; the other viewports stay where they are. Reload does not add a history entry. New navigation after Back discards that viewport's forward entries. History is capped at 100 URLs per viewport and starts fresh when reopening the workspace; the last URL and device settings persist.

Back/Forward are URL replay, not full browser session restoration: unsaved form values, POST submissions, scroll position and in-memory app state are not restored. SPA `replaceState` changes are recorded as URL changes because Chrome's webNavigation event does not distinguish them from `pushState`. The browser's own Back button operates on the workspace's joint frame history; use the buttons inside each viewport for independent navigation.

## Compatibility and limitations

This is a responsive CSS viewport tool, not a phone emulator. It does not change user-agent, simulate touch hardware or emulate Safari. A site uses its real CSS viewport width even when its preview is visually scaled down.

Some websites forbid embedding with X-Frame-Options or Content-Security-Policy. **Compatibility mode** removes those response headers for subframe documents in this DuoView tab only. Chrome's header rules remove the whole CSP header, including directives other than frame-ancestors. Use this option only for trusted sites you are testing. It is disabled by default, resets when the workspace reloads, and the temporary rules are removed when the tab closes or leaves DuoView. Ordinary tabs retain their original headers.

Authentication providers, third-party cookie policies, frame-busting scripts, HTTPS-to-HTTP mixed content and other browser restrictions may still prevent a site or login flow from working. Use **Open in tab ↗** when necessary. Views share browser storage/cookies when Chrome's partitioning rules permit it; they are not separate logged-in users. Links requesting a new tab can open a normal tab. The frame sandbox prevents websites from navigating the entire workspace.

Only HTTP(S) URLs are supported, including localhost. Chrome internal pages, extension pages and local files cannot be previewed.

## Privacy and permissions

No analytics, remote scripts, API keys, telemetry, or external dependencies are included in the extension. Only the websites you preview make network requests. Saved URLs and viewport preferences stay in `chrome.storage.local`.

- **HTTP/HTTPS host access**: run navigation commands inside previews and optionally change embedding response headers. Chrome may display a broad site-access warning; actual navigation handling is restricted to registered DuoView tabs.
- **activeTab**: start from the page where the extension icon was clicked.
- **webNavigation**: detect preview URL changes, including SPA/hash navigation.
- **scripting**: identify preview frames and navigate/reload a specific frame.
- **storage**: local settings and temporary workspace/frame mappings.
- **declarativeNetRequestWithHostAccess**: optional, tab-scoped compatibility rules.

Remove DuoView through `chrome://extensions` to remove its stored settings. There is no remote account to delete.

## Development and tests

Requires Node 20+ for development only. The extension itself has no build step.

```sh
npm test
npm install
npx playwright install chromium
npm run test:browser
npm run test:readability
npm run package
```

The browser test starts an ephemeral localhost fixture and launches an isolated Chromium profile with the extension installed. It checks actual iframe dimensions, independent Back/Forward, SPA/hash changes, redirects, reload, custom dimensions, rotation, adding/removing views, saved state, X-Frame-Options/CSP compatibility, and isolation from ordinary tabs. The test profile is deleted afterwards. A screenshot is saved in `artifacts/workspace.png`.

For an existing browser installation, set `CHROMIUM_PATH` to its executable. `PLAYWRIGHT_MODULE` optionally points to an installed Playwright ES module.

## Project layout

- `extension/` — load this directory into Chrome.
- `extension/background.js` — workspace lifecycle, frame navigation and temporary header rules.
- `extension/studio.*` — workspace interface and viewport management.
- `extension/history.js` — URL validation and independent history model.
- `tests/` — unit and browser integration tests.
- `scripts/package.py` — creates a distributable ZIP, without development files.

Built against the official Chrome [webNavigation](https://developer.chrome.com/docs/extensions/reference/api/webNavigation), [scripting](https://developer.chrome.com/docs/extensions/reference/api/scripting), and [declarativeNetRequest](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest) APIs.
