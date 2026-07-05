# 🎬 VideoMax Pro — Video Enhancer

**Turn any web video into a fully controllable player.** VideoMax Pro adds a
powerful overlay to videos on **any website**, on both **desktop and Android**.
Change aspect ratio, zoom, playback speed, brightness, boost volume beyond 100%,
load subtitles, apply filters, detect quality, download, and control everything
with keyboard shortcuts (PC) or touch gestures (mobile).

> **Works on any browser that supports extensions or userscripts** — Chrome,
> Edge, Brave, Opera, Firefox (PC + Android), Kiwi, and more. Available as a
> **Chrome/Edge extension**, a **Firefox extension**, and a single-file
> **Userscript** (Tampermonkey / Violentmonkey / Greasyfork + Android userscript
> browsers like Soul, Via, Aloha, Lemur). ⚠️ *The userscript version is still
> **experimental**.*

### 🦊 Firefox Add-on (official)
Install directly from Mozilla Add-ons:
**https://addons.mozilla.org/en-US/firefox/addon/videomax-advanced-video-player/**

---

## ✨ Features

- **Aspect ratio control** — Default, Fit, Fill, Stretch, Zoom (1.4×/1.6×/2×),
  4:3, 16:9, 2.35:1 — great for removing black bars.
- **Zoom & pan** — smooth zoom (0.3×–4×), plus pinch-to-zoom on mobile.
- **Playback speed** — quick cycle + **hold for 2× speed** (keyboard \` / long-press on touch).
- **Volume boost** — up to **300%** via Web Audio (louder than the site allows), plus normal mute/volume.
- **Brightness control** — dim or brighten the video (CSS-filter based).
- **Video filters** — contrast, saturation, hue, blur, grayscale, sepia.
- **Rotation & mirror** — rotate the video (PC) or lock screen orientation (mobile), horizontal flip.
- **Subtitles** — auto-detect network subtitle tracks (`.vtt/.srt/timedtext/TTML`), load your own `.srt/.vtt` file, plus native caption support where available.
- **Quality detection on ALL sites** — detects available resolutions from HLS/DASH streams and common web players, so you can pick a quality manually on virtually any site.
- **Picture-in-Picture (PiP)** — pop the video out into a floating window.
- **Download** — direct video download, HLS stream download (m3u8 → merge, AES-128), or hand off to external managers (1DM/IDM/ADM intents, JDownloader), external players, or a `yt-dlp` copy command.
- **A–B loop, full loop, frame stepping, screenshot, stats overlay.**
- **Gestures (mobile)** — double-tap seek, swipe for brightness/volume, pinch-zoom, long-press 2×.
- **↻ Reset** — instantly revert every change back to the original player (keeps VideoMax active).
- **✕ Dismiss** — fully restore the native player and remove the overlay (reload to re-enable).
- **Privacy-friendly** — no tracking, no analytics; minimal permissions (`storage`, `activeTab`, `downloads`).

---

## ⌨️ PC (Keyboard) Shortcuts

> Focus the page/video first. Shortcuts are ignored while typing in inputs.

| Key | Action |
|-----|--------|
| `Space` / `K` | Play / Pause |
| `←` / `J` | Seek −10s (`Shift+←` = −5s, `Ctrl+←` = −60s) |
| `→` | Seek +10s (`Shift+→` = +5s, `Ctrl+→` = +60s) |
| `↑` / `↓` | Volume up / down (goes past 100% into boost) |
| `M` | Mute / unmute |
| `F` | Fullscreen toggle |
| `S` | Cycle playback speed |
| `` ` `` (backtick, hold) | Hold for 2× speed — release to restore |
| `A` | Cycle aspect ratio |
| `R` | Rotate video 90° |
| `H` | Mirror (horizontal flip) |
| `+` / `=` | Zoom in |
| `-` / `_` | Zoom out |
| `,` | Previous frame (step back) |
| `.` | Next frame (step forward) |
| `C` | Toggle subtitles/captions |
| `P` | Picture-in-Picture |
| `L` | Toggle loop |
| `B` | Set A–B loop point |
| `T` | Take screenshot |
| `I` | Toggle stats overlay |
| `0`–`9` | Jump to 0%–90% of the video |
| `Home` | Jump to start |
| `End` | Jump to end |
| `Esc` | Close panels / exit fullscreen |

---

## 📱 Android (Touch) Gestures

| Gesture | Action |
|---------|--------|
| **Single tap (center)** | Show / hide controls |
| **Double tap — left side** | Seek −10s |
| **Double tap — right side** | Seek +10s |
| **Double tap — center** | Play / Pause |
| **Swipe up/down — left side** | Brightness up / down |
| **Swipe up/down — right side** | Volume up / down (into 300% boost) |
| **Pinch (two fingers)** | Zoom in / out |
| **Long-press (hold)** | 2× speed while held — release to restore |
| **Tap the ↻ button** | Reset everything to original (keep VideoMax) |
| **Tap the ✕ button** | Restore native player & remove overlay |

> Rotate button on mobile locks screen orientation instead of rotating the frame.

---

## 📦 Installation

### Chrome / Edge / Brave / Kiwi (PC + Android)
1. Download **`VideoMax-Pro-v14-Chrome.zip`** and unzip it.
2. Go to `chrome://extensions` → enable **Developer mode**.
3. Click **Load unpacked** → select the unzipped folder.
4. *(Android: Kiwi/Edge → Extensions → load the folder/zip.)*

### Firefox (PC + Android) — official
Install directly from Mozilla Add-ons (recommended):
**https://addons.mozilla.org/en-US/firefox/addon/videomax-advanced-video-player/**

Or load it manually:
1. Download **`VideoMax-Pro-v14-Firefox.zip`**.
2. **PC test:** `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on** → pick `manifest.json`.

### Userscript (Tampermonkey / Violentmonkey / Greasyfork) — ⚠️ experimental
1. Install **Tampermonkey** or **Violentmonkey** (PC or Android browsers: Soul, Via, Aloha, Lemur, Kiwi, Firefox+add-on…).
2. Open **`VideoMax-Pro.user.js`** — the manager shows an install page → **Install**.
3. Done — it runs on every site automatically. Settings persist via `GM_setValue`.

> Note: the userscript build is still **experimental** — the extension versions
> are the most stable.

---

## 🔧 How it works (technical)

- Injects a **Shadow-DOM overlay** into each real player (isolated styles, no site conflicts).
- On mobile sites with their own custom players it uses a **top-level floating overlay** synced to the video via `getBoundingClientRect()` — so it never disturbs the site's own player (no black screen, button always clickable).
- A **MAIN-world bridge** (page-context script) reaches player APIs the content script can't, and sniffs media/subtitle URLs via `fetch`/XHR — replacing the need for `webRequest`.
- **Quality**: parses HLS (`#EXT-X-STREAM-INF`) & DASH manifests and reads common web-player quality APIs to list available resolutions.
- **Volume boost** uses a Web Audio gain node only above 100% (avoids the cross-origin muting caused by `createMediaElementSource`).

---

## 🔒 Privacy

VideoMax Pro does **not** collect, store, or transmit any personal data. It has
no analytics and no remote servers. All settings stay on your device
(`chrome.storage` / `GM_setValue`). Permissions are minimal: `storage`,
`activeTab`, `downloads`, and host access to run on the pages you visit.

---

## 💚 Support the developer

If VideoMax Pro is useful to you and you'd like to support it financially, please
reach out by email — any support is greatly appreciated and helps keep the
project free and updated. 🙏

📧 **ahmedelesily99@gmail.com**

---

## 📄 License

MIT © VideoMax
