/**
 * ╔══════════════════════════════════════════════════════════════════════════════════╗
 * ║  VideoMax Pro — Ultimate Video Enhancement Engine v20.5.1 (Netflix control layout 1:1 · PC+Mobile)        ║
 * ║  Obsidian-Glass UI · PC + Android · Reliable · Fast · Maximum detection        ║
 * ╚══════════════════════════════════════════════════════════════════════════════════╝
 *
 * v20.5.1 HIGHLIGHTS:
 *   • Netflix 1:1 control row: Play · ±10s · Vol · Time …… Speed · CC · ⋮ · FS
 *   • Secondary tools (zoom/mirror/pip/loop/AB) live in ⋮ menu only
 *   • Top bar: title + AR/Rotate + close (cinematic, uncluttered)
 * v20.5.0 notes: Netflix cinematic CSS redesign
 * v20.4 notes: player adapters, CNL, oEmbed, yt-dlp
 * v20.3 notes: system-feel brightness/volume, single-tap never play/pause
 * v20.2 notes:
 *   • Smart Host Brain + context-aware quality + multi-browser polyfill
 * v11-era notes:
 *   • YouTube black screen FIXED again — managed-player AR engine is transform-only
 *     (object-fit + transform), never repositions the native <video>.
 *   • Powerful dual aspect-ratio engine: Engine A (managed sites) + Engine B (others).
 *   • Maximum video detection: open Shadow-DOM piercing + lazy/SPA observers.
 *   • Quality: 144p→8K, preferred-quality applied from popup default (incl. 144/240).
 *   • Subtitles: 10+ detection strategies across all sites.
 *   • Downloads: native browser engine + Save-As + external manager + external player.
 *   • Android-style brightness/volume swipe (1:1 finger-to-control mapping).
 *   • Small white "speed" badge, up-center (point 10).
 *   • Popup: manual "Save Settings" + "Apply to current tab" live push.
 *
 * BUGFIXES:
 *   [BUG] `S` (storage alias) and `fmt` were used but never defined → defined now.
 *   [BUG] CSS vars --vm-red / --vm-gray referenced but undefined → aliased now.
 */

(function () {
  'use strict';

  /* ══════════════════════════════════════════════════
   *  GUARD — one instance per frame
   * ══════════════════════════════════════════════════ */
  const VERSION = '21.0.4';
  const VMX_BUILD = '21.0.4';

  // Skip ad/tracker iframes & tiny frames (perf)
  try {
    if (window.top !== window) {
      var __iw = window.innerWidth || 0, __ih = window.innerHeight || 0;
      var __tiny = Math.min(__iw, __ih) > 0 && Math.min(__iw, __ih) < 100;
      var __ad = /doubleclick|googlesyndication|adservice|adnxs|rubicon|scorecardresearch|outbrain|taboola/i.test(location.hostname);
      if (__tiny || __ad) return;
    }
  } catch (e) {}

  if (window.__VIDEOMAX_PRO__) return;
  window.__VIDEOMAX_PRO__ = VERSION;

  /* ══════════════════════════════════════════════════
   *  CONSTANTS
   * ══════════════════════════════════════════════════ */

  /* ── Cross-browser API (Chrome / Firefox / Waterfox / Kiwi) ── */
  const extAPI = (function () {
    try {
      if (typeof browser !== 'undefined' && browser.runtime) return browser;
    } catch (e) {}
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime) return chrome;
    } catch (e) {}
    return null;
  })();
  function extSend(msg, cb) {
    try {
      if (!extAPI || !extAPI.runtime || !extAPI.runtime.sendMessage) {
        if (cb) cb(null); return;
      }
      var settled = false;
      function done(res) { if (!settled) { settled = true; if (cb) cb(res); } }
      var ret;
      // Firefox's `browser` namespace is Promise-only; Chrome accepts callbacks.
      if (typeof browser !== 'undefined' && extAPI === browser) {
        ret = extAPI.runtime.sendMessage(msg);
      } else {
        ret = extAPI.runtime.sendMessage(msg, function (res) {
          var err = extAPI.runtime && extAPI.runtime.lastError;
          done(err ? null : res);
        });
      }
      if (ret && typeof ret.then === 'function') {
        ret.then(done).catch(function () { done(null); });
      }
    } catch (e) { if (cb) cb(null); }
  }

  // Device detection
  const IS_TOUCH = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  // NOTE: on many Android browsers that run extensions (Kiwi/Edge/Yandex),
  // screen.width/height report PHYSICAL device pixels (e.g. 1080), so the old
  // "< 800" test wrongly returned false on real phones → the whole mobile
  // floating-host system never activated. Also test the User-Agent and the CSS
  // viewport so modern high-DPI phones are correctly detected.
  // A page can serve the MOBILE layout even on a big-screen/desktop browser —
  // either by opening m.twitch.tv / m.youtube.com directly, OR (very common when
  // testing) by overriding the User-Agent to Android on a desktop: YouTube then
  // serves the MOBILE DOM on www.youtube.com WITHOUT redirecting, and the device
  // has no touch. So we must detect "mobile" from THREE independent signals and
  // NOT require a touch device:
  //   1) hostname is a known mobile host (m.*),
  //   2) the UA string looks mobile (covers desktop UA-override testing),
  //   3) the actual MOBILE PLAYER DOM is present (ytm-app / playerContainerMWeb).
  const IS_MOBILE_SITE = /^m\./i.test(location.hostname) ||
    /(^|\.)(m\.youtube\.com|m\.twitch\.tv|m\.facebook\.com|touch\.facebook\.com|mbasic\.facebook\.com)$/i.test(location.hostname);
  const IS_MOBILE_UA = /Mobi|Android|iPhone|iPad|iPod|Silk|Kindle|Opera Mini|IEMobile|Mobile|webOS|BlackBerry|Kiwi|Yandex|SamsungBrowser/i.test(navigator.userAgent);
  const IS_FIREFOX = /Firefox\//i.test(navigator.userAgent) || !!(typeof InstallTrigger !== 'undefined');
  const IS_ANDROID = /Android/i.test(navigator.userAgent) || ((IS_TOUCH || IS_MOBILE_UA) && /Linux/i.test(navigator.platform || ''));
  function hasMobilePlayerDOM() {
    try {
      return !!document.querySelector(
        'ytm-app, ytm-mobile-topbar-renderer, ytm-watch, ' +           // YouTube mobile
        '[class*="playerContainerMWeb"], ' +                            // Twitch mobile
        '[data-sigil="mobile-video"], [id^="mobile_"]'                  // Facebook mobile
      );
    } catch (e) { return false; }
  }
  const IS_MOBILE = IS_MOBILE_SITE || IS_MOBILE_UA ||
    (IS_TOUCH && Math.min(screen.width, screen.height) < 900) ||
    hasMobilePlayerDOM();

  /* ═══════════════════════════════════════════════════════════════
   *  DEBUG BADGE  (temporary — remove for store build)
   *  Shows a small always-on-top readout so we can SEE what's happening on the
   *  phone with one screenshot instead of guessing. Enable/disable with the
   *  flag below. When VMX_DEBUG is false this compiles to no-ops.
   * ═══════════════════════════════════════════════════════════════ */
  var VMX_DEBUG = false;
  var _dbgEl = null, _dbgLines = {};

  /* ═══════════════════════════════════════════════════════════════
   *  DIAGNOSTIC LOG SYSTEM  (always-on ring buffer, exportable)
   *  Records timestamped events into a bounded in-memory buffer with rich
   *  environment info. The user can EXPORT it as a .txt file (from the 3-dots
   *  menu → "Export diagnostics", or Ctrl+Alt+D) and send it to us so we can see
   *  exactly what happened on any site (PC or Android) and improve the extension.
   *  Cheap: just pushes strings; capped at 600 entries. No network, no tracking.
   * ═══════════════════════════════════════════════════════════════ */
  var VMX_LOG = (function () {
    var buf = [];
    var MAX = 600;
    var t0 = Date.now();
    function push(cat, msg) {
      try {
        var t = ((Date.now() - t0) / 1000).toFixed(2);
        buf.push('[' + t + 's] ' + (cat || '·') + ' | ' + msg);
        if (buf.length > MAX) buf.shift();
      } catch (e) {}
    }
    function env() {
      var L = [];
      try {
        L.push('VideoMax Pro diagnostics — build ' + (VMX_BUILD || '?'));
        L.push('when: ' + new Date().toISOString());
        L.push('url: ' + location.href);
        L.push('host: ' + location.hostname);
        L.push('userAgent: ' + navigator.userAgent);
        L.push('platform: ' + (navigator.platform || '?') + '  lang: ' + (navigator.language || '?'));
        L.push('screen: ' + screen.width + 'x' + screen.height + '  window: ' + window.innerWidth + 'x' + window.innerHeight + '  dpr: ' + (window.devicePixelRatio || 1));
        L.push('touch: ' + (('ontouchstart' in window) || navigator.maxTouchPoints > 0) + '  maxTouchPoints: ' + (navigator.maxTouchPoints || 0));
        try {
          L.push('flags: IS_MOBILE=' + IS_MOBILE + ' IS_MOBILE_SITE=' + IS_MOBILE_SITE + ' IS_MOBILE_UA=' + IS_MOBILE_UA +
                 ' domMobile=' + hasMobilePlayerDOM());
          L.push('site: YT=' + IS_YOUTUBE + ' Twitch=' + IS_TWITCH + ' FB=' + IS_FACEBOOK + ' Reddit=' + IS_REDDIT +
                 ' TikTok=' + IS_TIKTOK + ' IG=' + IS_INSTAGRAM + ' DM=' + IS_DAILYMOTION + ' okru=' + IS_OKRU +
                 ' bili=' + IS_BILIBILI + ' Kick=' + IS_KICK + ' VK=' + IS_VK + ' DRM=' + IS_DRM_SITE);
          try {
            L.push('ctx: saveData=' + HostBrain.ctx.saveData + ' slowNet=' + HostBrain.ctx.slowNet +
                   ' lowBattery=' + HostBrain.ctx.lowBattery + ' reducedMotion=' + HostBrain.ctx.reducedMotion +
                   ' qCap=' + HostBrain.preferredQualityCap());
            L.push('fp: ' + HostBrain.domFingerprint());
            L.push('hostPrefs: ' + JSON.stringify(HostBrain.loadHostPrefs()));
          } catch (e) {}
          L.push('browser: ff=' + IS_FIREFOX + ' android=' + IS_ANDROID);
        } catch (e) { L.push('flags: (not ready) ' + e); }
        try {
          var vids = document.querySelectorAll('video');
          L.push('videos on page: ' + vids.length);
          Array.prototype.slice.call(vids, 0, 6).forEach(function (v, i) {
            var r = v.getBoundingClientRect();
            var inShadow = false; try { inShadow = v.getRootNode() instanceof ShadowRoot; } catch (e) {}
            L.push('  video[' + i + ']: ' + Math.round(r.width) + 'x' + Math.round(r.height) +
                   ' vw=' + v.videoWidth + 'x' + v.videoHeight + ' paused=' + v.paused +
                   ' src=' + String(v.currentSrc || v.src || '').slice(0, 60) + ' shadow=' + inShadow +
                   ' parent=' + (v.parentElement ? v.parentElement.tagName + '.' + (String(v.parentElement.className).slice(0, 30)) : '?'));
          });
        } catch (e) { L.push('videos: err ' + e); }
        L.push('fullscreenEl: ' + (document.fullscreenElement ? (document.fullscreenElement.tagName + '.' + String(document.fullscreenElement.className).slice(0,30)) : 'none'));
        try { L.push('siteProfile: ' + JSON.stringify(SiteProfiles.get())); } catch (e) {}
      } catch (e) { L.push('env error: ' + e); }
      return L.join('\n');
    }
    function build() {
      return env() + '\n\n───── EVENT LOG (' + buf.length + ') ─────\n' + buf.join('\n') + '\n';
    }
    function exportTxt() {
      try {
        var text = build();
        var blob = new Blob([text], { type: 'text/plain' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'videomax-diagnostics-' + location.hostname + '-' + Date.now() + '.txt';
        (document.body || document.documentElement).appendChild(a);
        a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
        return true;
      } catch (e) { return false; }
    }
    return { push: push, build: build, exportTxt: exportTxt };
  })();

  function vmxDebug(key, msg) {
    // Always record to the exportable diagnostic buffer…
    try { VMX_LOG.push(key, msg); } catch (e) {}
    // …and only render the on-screen red badge when VMX_DEBUG is on.
    if (!VMX_DEBUG) return;
    try {
      if (window.top !== window) return;  // only show in the top frame
      if (!_dbgEl) {
        _dbgEl = document.createElement('div');
        _dbgEl.style.cssText = 'position:fixed;top:0;left:0;z-index:2147483647;max-width:60vw;' +
          'background:rgba(200,0,0,.92);color:#fff;font:11px/1.35 monospace;padding:4px 6px;' +
          'pointer-events:none;white-space:pre;border-bottom-right-radius:6px';
        (document.documentElement || document.body).appendChild(_dbgEl);
      }
      _dbgLines[key] = msg;
      var out = 'VMX v' + (VMX_BUILD || '?') + ' mob=' + (IS_MOBILE ? 1 : 0) +
                ' site=' + (IS_MOBILE_SITE ? 1 : 0) + ' ua=' + (IS_MOBILE_UA ? 1 : 0) +
                ' dom=' + (hasMobilePlayerDOM() ? 1 : 0) + '\n';
      Object.keys(_dbgLines).forEach(function (k) { out += k + ': ' + _dbgLines[k] + '\n'; });
      _dbgEl.textContent = out;
    } catch (e) {}
  }
  // VMX_BUILD defined at top

  // Site detection
  const HOSTNAME = location.hostname;
  const IS_YOUTUBE  = /youtube\.com|youtu\.be|youtube-nocookie\.com|music\.youtube\.com/.test(HOSTNAME)
    || /piped\.|invidious\.|yewtu\.be|vid\.puffyan|inv\./i.test(HOSTNAME);
  const IS_NETFLIX  = /netflix\.com/.test(HOSTNAME);
  const IS_TWITCH   = /twitch\.tv/.test(HOSTNAME);
  const IS_FACEBOOK = /facebook\.com|fb\.watch|fb\.com/.test(HOSTNAME);
  const IS_VIMEO    = /vimeo\.com|player\.vimeo\.com/.test(HOSTNAME);
  const IS_TWITTER  = /(^|\.)(x\.com|twitter\.com|mobile\.twitter\.com)$/.test(HOSTNAME) || /twitter\.com|x\.com/.test(HOSTNAME);
  const IS_REDDIT   = /reddit\.com|redd\.it|old\.reddit\.com/.test(HOSTNAME);
  const IS_TIKTOK   = /tiktok\.com/.test(HOSTNAME);
  const IS_INSTAGRAM= /instagram\.com/.test(HOSTNAME);
  const IS_DAILYMOTION = /dailymotion\.com|dai\.ly/.test(HOSTNAME);
  const IS_OKRU    = /(^|\.)ok\.ru$|odnoklassniki\.ru/.test(HOSTNAME);
  const IS_BILIBILI= /bilibili\.(com|tv)/.test(HOSTNAME);
  const IS_RUMBLE  = /rumble\.com/.test(HOSTNAME);
  const IS_ODYSEE  = /odysee\.com/.test(HOSTNAME);
  const IS_ANIME3RB = /anime3rb\.com/.test(HOSTNAME);
  const IS_FASELHD = /faselhd|fasel\.hd/.test(HOSTNAME);
  const IS_MEGA = /mega\.nz|mega\.io/.test(HOSTNAME);
  const IS_KICK    = /(^|\.)kick\.com$/.test(HOSTNAME);
  const IS_VK      = /(^|\.)vk\.com$|(^|\.)vkvideo\.ru$|(^|\.)vk\.ru$/.test(HOSTNAME);
  const IS_STREAMABLE = /streamable\.com/.test(HOSTNAME);
  const IS_ARCHIVE = /archive\.org|archive\.is/.test(HOSTNAME);
  const IS_PEERTUBE = /\/videos\/watch\//.test(location.pathname) || /peertube/i.test(HOSTNAME)
    || !!document.querySelector && false; // refined at runtime by smart detector
  const IS_COURSERA = /coursera\.org/.test(HOSTNAME);
  const IS_UDACITY = /udacity\.com/.test(HOSTNAME);
  const IS_JW_HEAVY = IS_OKRU || IS_STREAMABLE; // often JW Player

  // DRM / encrypted-streaming platforms. Their video is delivered ENCRYPTED via
  // EME (Widevine/FairPlay/PlayReady); it can never be saved and enhancement is
  // limited. We detect them only to show an honest notice instead of failing
  // silently — we never attempt to bypass DRM (illegal + store-banning).
  const IS_DRM_SITE = /(^|\.)(netflix\.com|disneyplus\.com|hotstar\.com|primevideo\.com|amazon\.[a-z.]+|max\.com|hbomax\.com|hulu\.com|tv\.apple\.com|peacocktv\.com|paramountplus\.com|crunchyroll\.com|shahid\.net|shahid\.mbc\.net|watchit\.com|starzplay\.com|osnplus\.com)$/i.test(HOSTNAME)
    || /disneyplus|primevideo|hbomax|peacocktv|paramountplus/i.test(HOSTNAME);

  // v21 windowed mode is intentionally minimal: a separate launcher bar below
  // each video owns Play + Download. The full VideoMax HUD exists only after the
  // user enters fullscreen from that bar.
  const USE_EXTERNAL_LAUNCHER = true;

  // Host lists are only a fast first pass. The MAIN-world bridge also reports
  // actual EME use (requestMediaKeySystemAccess / setMediaKeys / encrypted event).
  let VMX_DYNAMIC_DRM = IS_DRM_SITE;
  const vmxDrmListeners = [];
  function isDrmProtected() { return IS_DRM_SITE || VMX_DYNAMIC_DRM; }
  function markDynamicDrm(reason) {
    if (VMX_DYNAMIC_DRM) return;
    VMX_DYNAMIC_DRM = true;
    VMX_LOG.push('drm', String(reason || 'EME detected'));
    vmxDrmListeners.slice().forEach(function (fn) { try { fn(true); } catch (e) {} });
  }
  window.addEventListener('message', function (ev) {
    try {
      if (ev.source !== window) return;
      var data = ev.data;
      if (!data || data.__vmx !== true || data.dir !== 'drm') return;
      markDynamicDrm(data.reason || data.keySystem || 'encrypted media');
    } catch (e) {}
  });

  // Speed options
  const SPEED_OPTIONS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4];

  // Aspect ratio modes
  const AR_MODES = [
    { key: 'default',  label: 'Default' },
    { key: 'fill',     label: 'Fill' },
    { key: 'stretch',  label: 'Stretch' },
    { key: 'fit',      label: 'Fit' },
    { key: 'zoom14',   label: '1.4×' },
    { key: 'zoom16',   label: '1.6×' },
    { key: 'zoom20',   label: '2.0×' },
    { key: 'r43',      label: '4:3' },
    { key: 'r169',     label: '16:9' },
    { key: 'r235',     label: '2.35:1' },
  ];

  // YouTube quality labels
  const YT_QUALITY_MAP = {
    'highres': '4320p (8K)',
    'hd2160':  '2160p (4K)',
    'hd1440':  '1440p',
    'hd1080':  '1080p',
    'hd720':   '720p',
    'large':   '480p',
    'medium':  '360p',
    'small':   '240p',
    'tiny':    '144p',
    'auto':    'Auto',
  };

  // Default filter values
  const FILTER_DEFAULTS = {
    contrast: 100,
    brightness: 100,
    saturate: 100,
    hueRotate: 0,
    blur: 0,
    grayscale: 0,
    sepia: 0,
  };

  // Gesture constants
  const SEEK_PIXELS_PER_SEC = 28;
  const HOLD_PIXELS_PER_STEP = 25;

  // Tracking
  const processedVideos = new WeakSet();
  const attachFailureCounts = new WeakMap();
  /* ═══ NETWORK INTERCEPTOR — Capture m3u8/mpd manifests for quality detection ═══ */
  var capturedManifests = [];
  var capturedQualities = [];
  var capturedSubUrls = [];   // subtitle/caption URLs sniffed from network
  var capturedMseMimes = [];  // MSE codec strings (video.src = blob:)
  var vmxSubListeners = [];    // per-player callbacks notified of new sub URLs



  // Safe network monitoring via PerformanceObserver (no XHR/fetch override!)
  try {
    var _perfObs = new PerformanceObserver(function (list) {
      list.getEntries().forEach(function (entry) {
        var url = entry.name || '';
        if (/\.m3u8(\?|$)/i.test(url) && !capturedManifests.find(function(m){return m.url===url})) {
          capturedManifests.push({ type: 'hls', url: url });
        }
        if (/\.mpd(\?|$)/i.test(url) && !capturedManifests.find(function(m){return m.url===url})) {
          capturedManifests.push({ type: 'dash', url: url });
        }
        if (/\.(mp4|webm|mkv|m4v)(\?|$)/i.test(url)) {
          addCapturedUrl(url, 'network');
        }
      });
    });
    _perfObs.observe({ entryTypes: ['resource'] });
  } catch (e) {}

  // Also capture direct video/audio URLs from network requests
  var capturedVideoUrls = [];

  /* ═══ IN-FRAME MEDIA RE-SCAN ═══
   *  Detection is done by the PerformanceObserver above, which runs in EVERY
   *  frame (content.js is injected with all_frames:true), so it already sees
   *  cross-origin iframe players (anime3rb), Twitch and Facebook streams —
   *  no background/webRequest permission needed. This just re-reads the
   *  Performance buffer for any media entries added since we last looked. */
  function pullBackgroundMedia(cb) {
    try {
      var entries = performance.getEntriesByType ? performance.getEntriesByType('resource') : [];
      for (var i = 0; i < entries.length; i++) {
        var url = entries[i].name || '';
        if (/\.m3u8(\?|$)/i.test(url) && !capturedManifests.find(function (x) { return x.url === url; })) {
          capturedManifests.push({ type: 'hls', url: url });
        } else if (/\.mpd(\?|$)/i.test(url) && !capturedManifests.find(function (x) { return x.url === url; })) {
          capturedManifests.push({ type: 'dash', url: url });
        } else if (/\.(mp4|webm|mkv|m4v|mov)(\?|$)/i.test(url)) {
          addCapturedUrl(url, 'network');
        }
      }
    } catch (e) { /* ignore */ }
    if (cb) cb();
  }
  // Re-scan a few times after load (streams appear after playback starts).
  [400, 1500, 3500, 7000, 12000].forEach(function (d) { setTimeout(function () { pullBackgroundMedia(); }, d); });

  /* ═══════════════════════════════════════════════════════════════
   *  CROSS-FRAME QUALITY RELAY  (anime3rb / vid3rb and similar)
   *
   *  Problem: on anime3rb the <video> plays inside a CROSS-ORIGIN iframe
   *  (video.vid3rb.com), but the reliable per-quality labels+links
   *  (480p/720p/1080p → anime3rb.com/download/… which 302-redirects to the
   *  matching …/{q}.mp4) live on the PARENT page. Neither frame can DOM-read
   *  the other, but they CAN postMessage each other. So:
   *    • The PARENT scrapes its own DOM for quality labels+links and, whenever
   *      a child iframe asks (or on an interval), posts them down to all iframes.
   *    • The CHILD (the player frame) stores what it receives and exposes it to
   *      buildQualityOptions() as `relayedQualities`.
   *  This is generic (works for any label-in-parent / player-in-iframe site).
   * ═══════════════════════════════════════════════════════════════ */
  var relayedQualities = [];         // [{label,height,url,openUrl}] received from parent
  var _relayListeners = [];          // per-player callbacks fired when relay data arrives

  function scrapeQualityLinksFromDoc(doc) {
    var VALID_H = { 144:1,240:1,360:1,480:1,540:1,576:1,720:1,1080:1,1440:1,2160:1,4320:1 };
    var found = {};
    try {
      var all = doc.querySelectorAll('a[href*="/download/"],a[href*=".mp4"],a[href*=".m3u8"],a[href*=".webm"],a[download],[class*="quality" i],[class*="resolution" i],[data-quality],[data-res],button[class*="quality" i],li[class*="quality" i],option');
      for (var i = 0; i < all.length; i++) {
        var el = all[i];
        if (el.childElementCount > 3) continue;
        var t = (el.textContent || '').trim();
        if (!t || t.length > 80) continue;
        var mm = t.match(/\[(\d{3,4})\s*p(?:\s*HEVC)?\]/i) || t.match(/(\d{3,4})\s*p\b/i);
        if (!mm) continue;
        var h = parseInt(mm[1], 10);
        if (!VALID_H[h]) continue;
        // Find the closest download/media link (own or nearby ancestor/sibling).
        var link = null;
        var scope = el.closest('div,li,section,article') || el.parentElement || el;
        var hops = 0;
        while (scope && hops < 4 && !link) {
          link = scope.querySelector('a[href*="/download/"], a[href*=".mp4"], a[href*=".m3u8"], a[href*=".webm"], a[download]');
          scope = scope.parentElement; hops++;
        }
        if (!link) continue;
        var href = link.getAttribute('href') || '';
        try { href = new URL(href, doc.baseURI || location.href).href; } catch (e) {}
        if (!href) continue;
        var isMedia = /\.(mp4|webm|m3u8|mkv|m4v)(\?|$)/i.test(href);
        // Prefer non-HEVC when both exist for the same height.
        var isHevc = /HEVC/i.test(t);
        if (!found[h] || (found[h].hevc && !isHevc)) {
          found[h] = { label: h + 'p', height: h, url: href, isMedia: isMedia, hevc: isHevc };
        }
      }
    } catch (e) {}
    return Object.keys(found).map(function (k) { return found[k]; })
      .sort(function (a, b) { return b.height - a.height; });
  }

  function broadcastQualitiesToChildren() {
    try {
      var quals = scrapeQualityLinksFromDoc(document);
      if (!quals.length) return;
      var frames = document.querySelectorAll('iframe');
      frames.forEach(function (f) {
        try { f.contentWindow && f.contentWindow.postMessage({ __vmxq: true, dir: 'quality-relay', quals: quals }, location.origin); } catch (e) {}
      });
    } catch (e) {}
  }

  // Listen for relay messages (child receives from parent; parent receives requests).
  window.addEventListener('message', function (ev) {
    var d = ev.data;
    if (!d || d.__vmxq !== true) return;
    if (d.dir === 'quality-relay' && Array.isArray(d.quals)) {
      // We are a child iframe (or same doc) receiving the parent's quality list.
      relayedQualities = d.quals;
      _relayListeners.forEach(function (fn) { try { fn(); } catch (e) {} });
    } else if (d.dir === 'sub-relay' && Array.isArray(d.subs)) {
      // Subtitle tracks relayed from parent (for cross-origin iframe players)
      if (d.subs.length && capturedSubUrls.length === 0) {
        d.subs.forEach(function(s) {
          if (s.url && capturedSubUrls.indexOf(s.url) === -1) {
            capturedSubUrls.push(s.url);
            vmxSubListeners.forEach(function (fn) { try { fn(s.url); } catch (e) {} });
          }
        });
        if (isHudVisible) { try { buildSubtitleOptions(); } catch(e) {} }
      }
    } else if (d.dir === 'quality-req') {
      // A child asked us (parent) for qualities — scrape and reply.
      broadcastQualitiesToChildren();
    }
  });

  // If we're inside an iframe with a real player, ask the parent for qualities.
  var _inFrame = false;
  try { _inFrame = (window.top !== window); } catch (e) { _inFrame = true; }
  if (_inFrame) {
    var _askParent = function () {
      try { window.parent && window.parent.postMessage({ __vmxq: true, dir: 'quality-req' }, location.origin); } catch (e) {}
    };
    [600, 1800, 4000, 8000].forEach(function (d) { setTimeout(_askParent, d); });
  } else {
    // Top document: broadcast periodically so late-loading iframes get the data.
    [1000, 3000, 6000, 10000].forEach(function (d) { setTimeout(broadcastQualitiesToChildren, d); });
  }

  (function () {
    // Network monitoring handled by global PerformanceObserver

    // Network capture handled by PerformanceObserver above (no fetch override!)

    // Monitor video src via MutationObserver (safe, no prototype override)
    // The old video.src override could break websites
  })();

  function addCapturedUrl(url, source) {
    if (!url || url.length < 20) return;
    if (/(?:_AUDIO_|\/audio\/|[?&]mime=audio|dash_ln_heaac|\baudio\b.*\.mp4|bytestart=)/i.test(url)) return;
    var exists = capturedVideoUrls.find(function (v) { return v.url === url; });
    if (!exists) {
      var h = 0;
      var resMatch = url.match(/(\d{3,4})[pP]\b/) || url.match(/CMAF_(\d{3,4})\b/i);
      if (resMatch) {
          h = parseInt(resMatch[1], 10);
      } else {
        var mm = url.match(/[\/_\-](\d{3,4})[\/_\-\.]/);
        if (mm) {
          var val = parseInt(mm[1], 10);
          if (val === 144 || val === 240 || val === 360 || val === 480 || val === 540 || val === 720 || val === 1080 || val === 1440 || val === 2160) {
            h = val;
          }
        }
      }
      var label = h ? h + 'p' : '';
      if (!h) return;
      var format = fmtMatch ? fmtMatch[1].toUpperCase() : 'Video';

      capturedVideoUrls.push({
        url: url,
        label: label,
        format: format,
        source: source,
        time: Date.now()
      });
      // LEARN the media-URL shape for this site (faster future detection).
      try { if (typeof SiteProfiles !== 'undefined') SiteProfiles.addMediaHint(url); } catch (e) {}
    }
  }

  // Parse HLS master manifest to extract quality levels
  function parseHLSManifest(url, callback) {
    try {
      fetch(url, { credentials: (function(){try{return new URL(url,location.href).origin===location.origin?'include':'omit'}catch(e){return 'omit'}})() }).then(function (r) { return r.text(); }).then(function (text) {
        var lines = text.split('\n');
        var qualities = [];
        for (var i = 0; i < lines.length; i++) {
          var line = lines[i].trim();
          if (line.indexOf('#EXT-X-STREAM-INF') === 0) {
            var resMatch = line.match(/RESOLUTION=(\d+)x(\d+)/i);
            var bwMatch = line.match(/BANDWIDTH=(\d+)/i);
            var nameMatch = line.match(/(?:NAME|VIDEO)="([^"]+)"/i); // Twitch uses VIDEO="720p60"
            // Find the next NON-COMMENT line = the variant playlist URL.
            var nextLine = '';
            for (var j = i + 1; j < lines.length; j++) {
              var cand = lines[j].trim();
              if (cand && cand.charAt(0) !== '#') { nextLine = cand; break; }
              if (cand.indexOf('#EXT-X-STREAM-INF') === 0) break;
            }
            var height = resMatch ? parseInt(resMatch[2]) : 0;
            var label = nameMatch ? nameMatch[1] : (height ? height + 'p' : 'auto');
            if (bwMatch && !nameMatch) label += ' (' + Math.round(parseInt(bwMatch[1]) / 1000) + 'k)';
            if (nextLine) {
              var streamUrl = nextLine;
              if (!/^https?:/i.test(nextLine)) {
                if (nextLine.charAt(0) === '/') { try { streamUrl = new URL(nextLine, url).href; } catch (e) {} }
                else { var base = url.substring(0, url.lastIndexOf('/') + 1); streamUrl = base + nextLine; }
              }
              qualities.push({ label: label, height: height, url: streamUrl, type: 'hls-manifest' });
            }
          }
        }
        // Sort by height descending
        qualities.sort(function (a, b) { return b.height - a.height; });
        callback(qualities);
      }).catch(function () { callback([]); });
    } catch (e) { callback([]); }
  }


  // Parse a DASH .mpd → quality list [{label,height,url}] (best-effort).
  function parseDashManifest(url, callback) {
    try {
      fetch(url, { credentials: (function(){try{return new URL(url,location.href).origin===location.origin?'include':'omit'}catch(e){return 'omit'}})() }).then(function (r) { return r.text(); }).then(function (text) {
        var quals = [];
        try {
          var xml = new DOMParser().parseFromString(text, 'text/xml');
          var reps = xml.querySelectorAll('Representation');
          reps.forEach(function (rep) {
            var h = parseInt(rep.getAttribute('height') || '0', 10);
            var bw = parseInt(rep.getAttribute('bandwidth') || '0', 10);
            var mime = (rep.getAttribute('mimeType') || rep.parentNode.getAttribute('mimeType') || '');
            if (h && /video/i.test(mime || 'video')) {
              quals.push({ label: h + 'p' + (bw ? ' (' + Math.round(bw / 1000) + 'k)' : ''), height: h, url: url, type: 'dash-manifest' });
            }
          });
        } catch (e) {}
        // de-dupe by height
        var seen = {}; quals = quals.filter(function (q) { if (seen[q.height]) return false; seen[q.height] = 1; return true; });
        quals.sort(function (a, b) { return b.height - a.height; });
        callback(quals);
      }).catch(function () { callback([]); });
    } catch (e) { callback([]); }
  }

  const instanceMap = new WeakMap();
  let totalVideoCount = 0;

  // Private bridge used by launcher.js. Both scripts run in the extension's
  // isolated world, so page JavaScript cannot invoke this function.
  try {
    Object.defineProperty(window, '__VMX_EXTERNAL_COMMAND__', {
      configurable: true,
      value: function (video, command, payload) {
        if (!(video instanceof HTMLVideoElement) || !video.isConnected) return false;
        var inst = instanceMap.get(video);
        if (!inst) {
          // A previous automatic attach may have failed and left the video
          // marked/guarded. A real launcher click is authoritative: clear those
          // stale guards and rebuild the selected player immediately.
          try { processedVideos.delete(video); } catch (e) {}
          try { attachFailureCounts.delete(video); } catch (e) {}
          if (IS_YOUTUBE || IS_TWITCH || IS_FACEBOOK || IS_KICK) _vmxLiveInstances = 0;
          try { tryAttach(video); } catch (e) {}
          inst = instanceMap.get(video);
        }
        if (!inst) return false;
        try {
          if (command === 'play-fullscreen' && inst.playFullscreen) {
            inst.playFullscreen(payload && Array.isArray(payload.sources) ? payload.sources : []);
            return true;
          }
          if (command === 'adopt-fullscreen' && inst.adoptFullscreen) {
            inst.adoptFullscreen(payload && Array.isArray(payload.sources) ? payload.sources : []);
            return true;
          }
          if (command === 'update-sources' && inst.updateSources) {
            inst.updateSources(payload && Array.isArray(payload.sources) ? payload.sources : []);
            return true;
          }
          if (command === 'download' && inst.openDownload) {
            inst.openDownload(payload && Array.isArray(payload.sources) ? payload.sources : []);
            return true;
          }
          if (command === 'dismiss') {
            try { dismissedVideos.add(video); } catch (e) {}
            try { if (inst.restore) inst.restore(); else if (inst.destroy) inst.destroy(); } catch (e) {}
            return true;
          }
          if (command === 'drm') {
            markDynamicDrm(payload && payload.reason);
            return true;
          }
        } catch (e) {}
        return false;
      }
    });
  } catch (e) {}

  // Count of LIVE overlay instances on single-player sites (YouTube/Twitch/FB),
  // used to prevent duplicate overlays from preview/hidden <video>s.
  let _vmxLiveInstances = 0;
  // Videos the user permanently dismissed with ✕. Kept module-level so the
  // YouTube/Twitch polls & the MutationObserver do NOT re-attach them a moment
  // later (that caused the "button comes back after ✕" bug).
  const dismissedVideos = new WeakSet();

  /* ══════════════════════════════════════════════════
   *  LIVE DEFAULTS — popup "Save / Apply" pushes here
   * ══════════════════════════════════════════════════ */
  const vmApplyDefaultsFns = [];          // per-instance apply callbacks
  let vmPendingDefaults = null;           // last defaults pushed before a player existed
  const vmAdvancedDownloadFallbacks = new Map();

  function vmBroadcastDefaults(d) {
    if (!d) return;
    vmPendingDefaults = d;
    let applied = 0;
    vmApplyDefaultsFns.forEach(function (fn) {
      try { fn(d); applied++; } catch (e) {}
    });
    return applied;
  }

  try {
    var _rt = extAPI && extAPI.runtime;
    if (_rt && _rt.onMessage) {
      _rt.onMessage.addListener(function (msg, sender, sendResponse) {
        if (!msg || !msg.type) return false;
        if (msg.type === 'vm_apply_defaults') {
          const n = vmBroadcastDefaults(msg.defaults);
          sendResponse({ ok: true, applied: n });
          return false;
        }
        if (msg.type === 'up_defaults_changed' || msg.type === 'vm_defaults_changed') {
          const n2 = vmBroadcastDefaults(msg.defaults || msg);
          sendResponse({ ok: true, applied: n2 });
          return false;
        }
        if (msg.type === 'vm_quality_scrape') {
          try {
            var quals = scrapeQualityLinksFromDoc(document);
            if (quals && quals.length) {
              extSend({ type: 'vm_quality_data', quals: quals });
            }
          } catch (e) {}
          sendResponse({ ok: true });
          return false;
        }
        if (msg.type === 'vm_quality_relay' && Array.isArray(msg.quals)) {
          try {
            relayedQualities = msg.quals;
            _relayListeners.forEach(function (fn) { try { fn(); } catch (e) {} });
          } catch (e) {}
          sendResponse({ ok: true });
          return false;
        }
        if (msg.type === 'VD_DOWNLOAD_COMPLETE' && msg.taskId) {
          var fallback = vmAdvancedDownloadFallbacks.get(msg.taskId);
          vmAdvancedDownloadFallbacks.delete(msg.taskId);
          if (!msg.success && typeof fallback === 'function') {
            try { fallback(msg.error || 'advanced downloader failed'); } catch (e) {}
          }
          return false;
        }
        if (msg.type === 'vm_context_info') {
          try {
            HostBrain.refresh();
            sendResponse({
              ok: true,
              ctx: HostBrain.ctx,
              host: HostBrain.host,
              prefs: HostBrain.loadHostPrefs(),
              fp: HostBrain.domFingerprint()
            });
          } catch (e) { sendResponse({ ok: false }); }
          return false;
        }
        return false;
      });
    }
  } catch (e) {}

  /* ══════════════════════════════════════════════════
   *  STORAGE
   * ══════════════════════════════════════════════════ */
  const storageAPI = (() => {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        return chrome.storage.local;
      }
      if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
        return browser.storage.local;
      }
    } catch (e) { /* ignore */ }
    return null;
  })();

  const Store = {
    _cache: Object.create(null),
    _ready: null,

    get(key, defaultVal) {
      return key in this._cache ? this._cache[key] : defaultVal;
    },

    set(key, value) {
      this._cache[key] = value;
      if (!storageAPI) return;
      try {
        const data = {};
        data['vm8_' + key] = JSON.stringify(value);
        var p = storageAPI.set(data);
        if (p && p.catch) p.catch(function () {});
      } catch (e) { /* ignore */ }
    },

    init() {
      if (!storageAPI) {
        this._ready = Promise.resolve();
        return this._ready;
      }
      var self = this;
      // Prefer promise form; fall back to callback (older Firefox)
      this._ready = new Promise(function (resolve) {
        try {
          var maybe = storageAPI.get(null);
          if (maybe && typeof maybe.then === 'function') {
            maybe.then(function (items) {
              self._ingest(items); resolve();
            }).catch(function () { resolve(); });
          } else {
            storageAPI.get(null, function (items) {
              self._ingest(items); resolve();
            });
          }
        } catch (e) { resolve(); }
      });
      return this._ready;
    },

    _ingest(items) {
      if (!items) return;
      for (const [key, val] of Object.entries(items)) {
        if (key.startsWith('vm8_')) {
          try { this._cache[key.slice(4)] = JSON.parse(val); } catch (e) {}
        }
      }
    },

    whenReady(fn) {
      (this._ready || Promise.resolve()).then(function () {
        try { fn(); } catch (e) {}
      });
    }
  };
  Store.init();

  /* ── Aliases (fix legacy references) ── */
  const S = Store;                       // [BUGFIX] `S` was used but never defined

  /* ═══════════════════════════════════════════════════════════════
   *  SITE PROFILE ENGINE  (smart, self-learning, remembers per site)
   *
   *  The extension LEARNS what works on each hostname and CACHES it, so the
   *  next visit applies the known-good strategy instantly instead of
   *  re-discovering it. Profiles persist across sessions via Store
   *  (chrome.storage / GM_setValue). A profile records:
   *    • container selector that successfully wrapped the player
   *    • whether the floating-host was needed
   *    • the media/manifest URL shapes seen (for faster quality/download)
   *    • the last confirmed video CSS selector
   *    • a "health" score + version so we can self-heal / re-learn if the site
   *      changes and the cached strategy stops working.
   *  This is the "solve once, remember forever" behaviour.
   * ═══════════════════════════════════════════════════════════════ */
  const SiteProfiles = (function () {
    var PKEY = 'siteprofiles_v1';
    var PROFILE_SCHEMA = 4;              // v4: fingerprint + host prefs + strategies
    var all = null;                     // { host: {profile} }
    var host = location.hostname.replace(/^www\./, '');
    var dirty = false;
    var saveTimer = null;

    function load() {
      if (all) return all;
      all = S.get(PKEY, null) || {};
      // Drop profiles from an older schema (site DOMs / our logic changed).
      try {
        Object.keys(all).forEach(function (h) {
          if (!all[h] || all[h].v !== PROFILE_SCHEMA) delete all[h];
        });
      } catch (e) {}
      return all;
    }

    function current() {
      load();
      if (!all[host]) {
        all[host] = { v: PROFILE_SCHEMA, host: host, created: Date.now(),
          containerSel: '', floating: null, videoSel: '', mediaHints: [],
          uses: 0, wins: 0, fails: 0, lastSeen: 0,
          fingerprint: '', strategies: [], prefs: null, engine: '' };
    }
      all[host].lastSeen = Date.now();
      all[host].uses = (all[host].uses || 0) + 1;
      return all[host];
    }

    function scheduleSave() {
      dirty = true;
      if (saveTimer) return;
      saveTimer = setTimeout(function () {
        saveTimer = null;
        if (!dirty) return; dirty = false;
        try {
          // Prune: keep the 200 most-recent hosts to bound storage.
          var keys = Object.keys(all);
          if (keys.length > 200) {
            keys.sort(function (a, b) { return (all[a].lastSeen || 0) - (all[b].lastSeen || 0); });
            keys.slice(0, keys.length - 200).forEach(function (k) { delete all[k]; });
          }
          S.set(PKEY, all);
        } catch (e) {}
      }, 1200);
    }

    // Build a stable, reusable CSS selector for an element (id → unique class → path).
    function selectorFor(el) {
      if (!el || el.nodeType !== 1) return '';
      try {
        if (el.id && /^[A-Za-z][\w-]*$/.test(el.id)) return '#' + el.id;
        var parts = [], node = el, depth = 0;
        while (node && node.nodeType === 1 && depth < 4 && node !== document.body) {
          var seg = node.tagName.toLowerCase();
          // Prefer a stable-looking class (skip hashed/utility churn).
          var cls = (node.className && typeof node.className === 'string')
            ? node.className.trim().split(/\s+/).filter(function (c) {
                return c && c.length >= 3 && c.length <= 30 && !/^(vm-|ng-|css-|sc-)/.test(c);
              })[0] : '';
          if (cls) seg += '.' + cls;
          parts.unshift(seg);
          if (node.id) { parts[0] = '#' + node.id; break; }
          node = node.parentElement; depth++;
        }
        return parts.join(' > ');
      } catch (e) { return ''; }
    }

    return {
      get: current,
      // Record a successful attach so future visits are instant.
      recordWin: function (info) {
        try {
          var p = current();
          if (info.container) { var sel = selectorFor(info.container); if (sel) p.containerSel = sel; }
          if (info.video)     { var vsel = selectorFor(info.video); if (vsel) p.videoSel = vsel; }
          if (typeof info.floating === 'boolean') p.floating = info.floating;
          p.wins = (p.wins || 0) + 1;
          scheduleSave();
        } catch (e) {}
      },
      recordFail: function () { try { var p = current(); p.fails = (p.fails || 0) + 1; scheduleSave(); } catch (e) {} },
      // Remember a media/manifest URL shape (host + extension) for faster future detection.
      addMediaHint: function (url) {
        try {
          var p = current();
          var u = new URL(url, location.href);
          var hint = u.hostname + '|' + (u.pathname.match(/\.[a-z0-9]{2,5}($|\?)/i) || ['?'])[0];
          if (p.mediaHints.indexOf(hint) === -1) { p.mediaHints.push(hint); if (p.mediaHints.length > 12) p.mediaHints.shift(); scheduleSave(); }
        } catch (e) {}
      },
      // Try the cached container first (fast path). Returns element or null.
      cachedContainer: function () {
        try { var p = current(); if (p.containerSel) return document.querySelector(p.containerSel); } catch (e) {}
        return null;
      },
      cachedFloating: function () { try { return current().floating; } catch (e) { return null; } },
      // Confidence: has this profile reliably worked before?
      isTrusted: function () { try { var p = current(); return (p.wins || 0) >= 2 && (p.wins) > (p.fails || 0); } catch (e) { return false; } },

      /* ── SELF-REPAIR MEMORY ──
       * Remembers which remedy fixed which symptom on this site, so next time the
       * same symptom appears we apply the known-good remedy FIRST (instant fix)
       * instead of trying every remedy again. Structure:
       *   p.fixes = { "<symptom>": { remedy:"<name>", wins:N, fails:N, ts } } */
      getFix: function (symptom) {
        try { var p = current(); return (p.fixes && p.fixes[symptom]) || null; } catch (e) { return null; }
      },
      // A remembered remedy is trusted once it has fixed the symptom at least once
      // and hasn't been failing more than it succeeds.
      trustedFix: function (symptom) {
        try {
          var f = this.getFix(symptom);
          return (f && f.remedy && (f.wins || 0) >= 1 && (f.wins) >= (f.fails || 0)) ? f.remedy : null;
        } catch (e) { return null; }
      },
      recordFixResult: function (symptom, remedy, ok) {
        try {
          var p = current();
          p.fixes = p.fixes || {};
          var f = p.fixes[symptom] || (p.fixes[symptom] = { remedy: remedy, wins: 0, fails: 0, ts: 0 });
          if (ok) {
            if (f.remedy !== remedy) { f.remedy = remedy; f.fails = 0; }
            f.wins = (f.wins || 0) + 1;
          } else {
            f.fails = (f.fails || 0) + 1;
            if (f.remedy === remedy && f.fails >= 3) { f.remedy = ''; f.wins = 0; }
          }
          f.ts = Date.now();
          scheduleSave();
        } catch (e) {}
      },
      setFingerprint: function (fp) {
        try {
          var p = current();
          if (p.fingerprint && p.fingerprint !== fp) {
            // Site DOM changed → drop brittle selectors so we re-learn
            p.containerSel = '';
            p.videoSel = '';
            p.wins = Math.max(0, (p.wins || 0) - 1);
          }
          p.fingerprint = fp || '';
          scheduleSave();
        } catch (e) {}
      },
      getFingerprint: function () {
        try { return current().fingerprint || ''; } catch (e) { return ''; }
      },
      setEngine: function (name) {
        try { current().engine = name || ''; scheduleSave(); } catch (e) {}
      },
      rememberStrategy: function (name) {
        try {
          var p = current();
          p.strategies = p.strategies || [];
          if (p.strategies.indexOf(name) === -1) {
            p.strategies.unshift(name);
            if (p.strategies.length > 8) p.strategies.pop();
            scheduleSave();
          }
        } catch (e) {}
      },
      getStrategies: function () {
        try { return (current().strategies || []).slice(); } catch (e) { return []; }
      },
      setPrefs: function (prefs) {
        try {
          var p = current();
          p.prefs = Object.assign({}, p.prefs || {}, prefs || {}, { ts: Date.now() });
          scheduleSave();
        } catch (e) {}
      },
      getPrefs: function () {
        try { return current().prefs || null; } catch (e) { return null; }
      }
    };
  })();

  /* ═══════════════════════════════════════════════════════════════
   *  HOST BRAIN + CONTEXT ENGINE  (v20.2 intelligence layer)
   *  - Per-host playback prefs (AR/speed/quality/brightness)
   *  - DOM fingerprinting → invalidate stale selectors
   *  - Multi-level selector fallback chain
   *  - Context: saveData / battery / network → smarter defaults
   * ═══════════════════════════════════════════════════════════════ */
  const HostBrain = (function () {
    var host = location.hostname.replace(/^www\./, '');
    var ctx = {
      saveData: false,
      lowBattery: false,
      slowNet: false,
      reducedMotion: false,
      ready: false
    };

    function readContextSync() {
      try {
        if (navigator.connection) {
          ctx.saveData = !!navigator.connection.saveData;
          var et = String(navigator.connection.effectiveType || '');
          ctx.slowNet = /2g|slow-2g/i.test(et) || (navigator.connection.downlink != null && navigator.connection.downlink < 0.8);
        }
      } catch (e) {}
      try {
        if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          ctx.reducedMotion = true;
        }
      } catch (e) {}
      return ctx;
    }

    function refreshAsync() {
      readContextSync();
      try {
        if (navigator.getBattery) {
          navigator.getBattery().then(function (b) {
            ctx.lowBattery = !!(b && b.level < 0.15 && !b.charging);
            ctx.ready = true;
          }).catch(function () { ctx.ready = true; });
        } else {
          ctx.ready = true;
        }
      } catch (e) { ctx.ready = true; }
      return ctx;
    }

    function preferredQualityCap() {
      // Return max height suggestion, or null for unrestricted
      readContextSync();
      try {
        // Popup can disable data-saver smart cap
        var d = null;
        try {
          if (typeof chrome !== 'undefined' && chrome.storage) { /* async not available here */ }
        } catch (e) {}
        // Sync cache: content script may have loaded vm_defaults into a known place
        if (typeof window.__vmxDefaults === 'object' && window.__vmxDefaults) d = window.__vmxDefaults;
        if (d && d.dataSaver === false) return null;
      } catch (e) {}
      if (ctx.saveData || ctx.slowNet) return 480;
      if (ctx.lowBattery) return 720;
      return null;
    }

    function shouldUseFloating() {
      // Prefer floating on mobile managed players + shadow video
      if (IS_MOBILE && (IS_YOUTUBE || IS_TWITCH || IS_FACEBOOK || IS_KICK)) return true;
      return null; // unknown → let caller decide
    }

    function domFingerprint() {
      var bits = [];
      try {
        bits.push(IS_YOUTUBE ? 'yt' : IS_TWITCH ? 'tw' : IS_FACEBOOK ? 'fb' : IS_KICK ? 'kick' : IS_VK ? 'vk' : 'x');
        bits.push(IS_MOBILE ? 'm' : 'd');
        bits.push(document.querySelector('ytd-app') ? 'ytd' : '');
        bits.push(document.querySelector('ytm-app') ? 'ytm' : '');
        bits.push(document.getElementById('movie_player') ? 'mp' : '');
        bits.push(document.querySelector('video.html5-main-video') ? 'hmv' : '');
        bits.push(document.querySelector('[class*="playerContainerMWeb"]') ? 'tweb' : '');
        bits.push(document.querySelector('shreddit-player, shreddit-player-2') ? 'shred' : '');
        bits.push(document.querySelector('.jwplayer, .video-js, .plyr') ? 'lib' : '');
        bits.push(String((document.querySelectorAll('video') || []).length));
        // structural hint: first video parent class token
        var v = document.querySelector('video');
        if (v && v.parentElement) {
          var cn = (v.parentElement.className && typeof v.parentElement.className === 'string')
            ? v.parentElement.className.trim().split(/\s+/).slice(0, 2).join('.') : v.parentElement.tagName;
          bits.push(cn.slice(0, 40));
        }
      } catch (e) {}
      return bits.filter(Boolean).join('|');
    }

    function syncFingerprint() {
      try {
        var fp = domFingerprint();
        SiteProfiles.setFingerprint(fp);
        return fp;
      } catch (e) { return ''; }
    }

    /* Multi-level container resolver — ordered strategies */
    function resolveContainer(video) {
      var strategies = [];
      // 1) trusted profile cache
      strategies.push(function cached() {
        try {
          if (SiteProfiles.isTrusted()) {
            var pc = SiteProfiles.cachedContainer();
            if (pc && pc.contains && pc.contains(video) && pc !== document.body) return pc;
          }
        } catch (e) {}
        return null;
      });
      // 2) site-specific known selectors
      strategies.push(function siteKnown() {
        try {
          if (IS_YOUTUBE) {
            if (IS_MOBILE) {
              return video.closest('.html5-video-container')
                || video.closest('.html5-video-player')
                || document.getElementById('movie_player');
            }
            return document.getElementById('movie_player')
              || video.closest('.html5-video-player')
              || video.closest('#player-container-id, #player');
          }
          if (IS_TWITCH) {
            return video.closest('.video-player__container, [data-a-target="video-player"], .persistent-player')
              || video.closest('[class*="playerContainerMWeb"], [class*="video-player"]');
          }
          if (IS_FACEBOOK) {
            return video.closest('[data-pagelet="VideoPlayer"], [data-video-id], [data-sigil*="inlineVideo"]');
          }
          if (IS_KICK) {
            return video.closest('[class*="video-player"], [class*="player-container"], #video-player, .aspect-video');
          }
          if (IS_VK) {
            return video.closest('.videoplayer_media, .VideoPage__video, [class*="VideoPlayer"], .vkuiInternalVideo');
          }
          if (IS_REDDIT) {
            var rh = null;
            try {
              var node = video;
              for (var i = 0; i < 6 && node; i++) {
                var root = node.getRootNode && node.getRootNode();
                if (root && root.host) { rh = root.host; node = root.host; } else break;
              }
            } catch (e) {}
            return (rh && (rh.closest('shreddit-player, [slot="post-media-container"]') || rh))
              || video.closest('shreddit-player, shreddit-player-2, .reddit-video-player-root');
          }
          if (IS_VIMEO) return video.closest('.player_container, .player-container, .vp-video-wrapper');
          if (IS_TWITTER) return video.closest('[data-testid="videoComponent"], [data-testid="videoPlayer"]');
          if (IS_TIKTOK) return video.closest('[class*="DivVideoWrapper"], [data-e2e="video-player"], [class*="xgplayer"]');
          if (IS_INSTAGRAM) return video.closest('article, [role="presentation"]');
          if (IS_BILIBILI) return video.closest('#bilibili-player, .bpx-player-container, .player-wrap');
          if (IS_RUMBLE) return video.closest('.rumbles-vplayer, [class*="videoPlayer"], rumble-player');
          if (IS_STREAMABLE) return video.closest('#player, .player, .video-container');
          if (IS_DAILYMOTION) return video.closest('[class*="player"], .dmp_Player, #player');
          if (IS_DRM_SITE) {
            return video.closest('[class*="player" i], [class*="Player" i], [id*="player" i], .video-js');
          }
        } catch (e) {}
        return null;
      });
      // 3) smart generic detector
      strategies.push(function smart() {
        try { return typeof smartFindContainer === 'function' ? smartFindContainer(video) : null; } catch (e) { return null; }
      });
      // 4) size-matched ancestor climb
      strategies.push(function sizeClimb() {
        try {
          var vr = video.getBoundingClientRect();
          var vArea = (vr.width || 0) * (vr.height || 0);
          if (vArea < 400) return null;
          var node = video.parentElement, best = null, bestArea = Infinity, hops = 0;
          var pageArea = (window.innerWidth || 1) * (window.innerHeight || 1);
          while (node && node !== document.body && hops < 7) {
            var r = node.getBoundingClientRect();
            var a = (r.width || 0) * (r.height || 0);
            if (a >= vArea * 0.9 && a <= pageArea * 1.05 && a < bestArea) {
              best = node; bestArea = a;
            }
            node = node.parentElement; hops++;
          }
          return best;
        } catch (e) { return null; }
      });
      // 5) parent fallback
      strategies.push(function parent() { return video.parentElement || null; });

      // Prefer strategies remembered as working for this host
      var remembered = [];
      try { remembered = SiteProfiles.getStrategies() || []; } catch (e) {}
      var ordered = strategies.slice();
      if (remembered.length) {
        ordered.sort(function (a, b) {
          var ia = remembered.indexOf(a.name); if (ia < 0) ia = 99;
          var ib = remembered.indexOf(b.name); if (ib < 0) ib = 99;
          return ia - ib;
        });
      }

      for (var i = 0; i < ordered.length; i++) {
        try {
          var el = ordered[i]();
          if (el && el !== document.body && el !== document.documentElement) {
            try { SiteProfiles.rememberStrategy(ordered[i].name); } catch (e) {}
            return { el: el, strategy: ordered[i].name };
          }
        } catch (e) {}
      }
      return { el: video.parentElement, strategy: 'parent' };
    }

    function saveHostPrefs(partial) {
      try {
        SiteProfiles.setPrefs(partial);
        // also mirror under a flat key for quick popup inspection
        var all = S.get('host_prefs_v2', {}) || {};
        all[host] = Object.assign({}, all[host] || {}, partial || {}, { ts: Date.now() });
        // prune
        var keys = Object.keys(all);
        if (keys.length > 150) {
          keys.sort(function (a, b) { return (all[a].ts || 0) - (all[b].ts || 0); });
          keys.slice(0, keys.length - 150).forEach(function (k) { delete all[k]; });
        }
        S.set('host_prefs_v2', all);
      } catch (e) {}
    }

    function loadHostPrefs() {
      try {
        var p = SiteProfiles.getPrefs();
        if (p) return p;
        var all = S.get('host_prefs_v2', {}) || {};
        return all[host] || null;
      } catch (e) { return null; }
    }

    function pickSmartQuality(availableHeights, preferred) {
      // availableHeights: sorted desc numbers; preferred: string from popup
      var cap = preferredQualityCap();
      var list = (availableHeights || []).slice().filter(function (h) { return h > 0; }).sort(function (a, b) { return b - a; });
      if (!list.length) return preferred || 'auto';
      var target = null;
      if (preferred && preferred !== 'auto' && preferred !== 'lowest') {
        target = parseInt(preferred, 10) || null;
      }
      if (preferred === 'lowest') target = list[list.length - 1];
      if (cap != null) {
        // clamp target to cap when on save-data / slow net
        if (target == null || target > cap) target = cap;
      }
      if (target == null) return 'auto';
      // nearest available <= target, else nearest above
      var best = null;
      for (var i = 0; i < list.length; i++) {
        if (list[i] <= target) { best = list[i]; break; }
      }
      if (best == null) best = list[list.length - 1];
      return String(best);
    }

    function animationBudgetMs() {
      readContextSync();
      if (ctx.reducedMotion || ctx.lowBattery) return 0;
      if (ctx.slowNet || ctx.saveData) return 120;
      return 220;
    }

    refreshAsync();
    // re-check connection changes
    try {
      if (navigator.connection && navigator.connection.addEventListener) {
        navigator.connection.addEventListener('change', function () { readContextSync(); });
      }
    } catch (e) {}

    return {
      ctx: ctx,
      refresh: refreshAsync,
      preferredQualityCap: preferredQualityCap,
      shouldUseFloating: shouldUseFloating,
      domFingerprint: domFingerprint,
      syncFingerprint: syncFingerprint,
      resolveContainer: resolveContainer,
      saveHostPrefs: saveHostPrefs,
      loadHostPrefs: loadHostPrefs,
      pickSmartQuality: pickSmartQuality,
      animationBudgetMs: animationBudgetMs,
      host: host
    };
  })();

  function fmt(seconds) { return formatTime(seconds); } // [BUGFIX] `fmt` was used but never defined

  /* ══════════════════════════════════════════════════
   *  MAIN-WORLD BRIDGE CLIENT
   *  Content scripts run isolated and can't call page-defined player APIs
   *  (YouTube movie_player.*, video.js, JW Player, page hls.js). We inject
   *  inject.js into the page world and round-trip via postMessage.
   * ══════════════════════════════════════════════════ */
  const VMXBridge = (function () {
    let injected = false, ready = false;
    let seq = 0;
    const pending = Object.create(null);

    function ensureInjected() {
      if (injected) return;
      injected = true;
      try {
        var api = (typeof chrome !== 'undefined' && chrome.runtime) ? chrome : 
                  (typeof browser !== 'undefined' && browser.runtime) ? browser : null;
        if (api && api.runtime && api.runtime.sendMessage) {
            api.runtime.sendMessage({ type: 'vm_load_inject' }, function(res) {
               if (!res || !res.ok) {
                   // Fallback for older browsers
                   var url = api.runtime.getURL('inject.js');
                   if (!url) return;
                   var s = document.createElement('script');
                   var policy = null;
                   if (window.trustedTypes && window.trustedTypes.createPolicy) {
                       try {
                           policy = window.trustedTypes.createPolicy("vmx-inject-policy", {
                               createScriptURL: function(u) { return u; },
                               createScript: function(t) { return t; },
                               createHTML: function(h) { return h; }
                           });
                       } catch (e) {}
                   }
                   s.src = policy ? policy.createScriptURL(url) : url;
                   s.onload = function () { s.remove(); };
                   (document.head || document.documentElement).appendChild(s);
               }
            });
        }
      } catch (e) {}
    }

    window.addEventListener('message', function (ev) {
      if (ev.source !== window) return;
      const d = ev.data;
      if (!d || !d.__vmx) return;
      if (d.dir === 'ready') { ready = true; return; }
      if (d.dir === 'yt-navigated') {
        // YouTube SPA navigation — re-scan for the new video after a short delay.
        try { setTimeout(function () { if (typeof scanForVideos === 'function') scanForVideos(); }, 700); } catch (e) {}
        return;
      }
      if (d.dir === 'up-quality-batch' || d.dir === 'fb-qualities') {
        if (d.qualities && d.qualities.length) {
            d.qualities.forEach(function(q) {
               var exists = capturedQualities.find(function(c) { return c.height === q.height && c.url === q.url; });
               if (!exists) capturedQualities.push({ height: q.height, label: q.label || q.height+'p', url: q.url, kind: q.kind });
            });
            capturedQualities.sort(function(a,b) { return b.height - a.height; });
            try { if (isHudVisible && typeof buildQualityOptions === 'function') buildQualityOptions(); } catch(e){}
        }
        return;
      }
      if (d.dir === 'media' && d.url) {
        // Media URL sniffed by the main-world network hook.
        try {
          if (d.mtype === 'hls' && !capturedManifests.find(function (x) { return x.url === d.url; })) {
            capturedManifests.push({ type: 'hls', url: d.url });
          } else if (d.mtype === 'dash' && !capturedManifests.find(function (x) { return x.url === d.url; })) {
            capturedManifests.push({ type: 'dash', url: d.url });
          } else if (d.mtype === 'file') {
            addCapturedUrl(d.url, 'network-mw');
          }
        } catch (e) {}
        return;
      }
      if (d.dir === 'subtrack' && d.url) {
        // Subtitle/caption URL sniffed from the network.
        try {
          if (capturedSubUrls.indexOf(d.url) === -1) {
            capturedSubUrls.push(d.url);
            vmxSubListeners.forEach(function (fn) { try { fn(d.url); } catch (e) {} });
          }
        } catch (e) {}
        return;
      }
      if (d.dir === 'mse') {
        // Site is using Media Source Extensions (blob: video).
        try { if (d.mime && capturedMseMimes.indexOf(d.mime) === -1) { capturedMseMimes.push(d.mime); } } catch (e) {}
        return;
      }
      if (d.dir === 'res' && pending[d.id]) {
        const cb = pending[d.id];
        delete pending[d.id];
        cb(d.ok ? d.data : null);
      }
    });

    // Send a command to the page world; calls cb(result) or cb(null) on timeout.
    function call(cmd, arg, cb, timeoutMs) {
      ensureInjected();
      const id = 'vmx' + (++seq);
      pending[id] = cb || function () {};
      try { window.postMessage({ __vmx: true, dir: 'req', id: id, cmd: cmd, arg: arg }, location.origin); }
      catch (e) { delete pending[id]; if (cb) cb(null); return; }
      setTimeout(function () {
        if (pending[id]) { delete pending[id]; if (cb) cb(null); }
      }, timeoutMs || 1500);
    }

    return { ensureInjected: ensureInjected, call: call, isReady: function () { return ready; } };
  })();

  /* ══════════════════════════════════════════════════
   *  UTILITY FUNCTIONS
   * ══════════════════════════════════════════════════ */
  function clamp(val, min, max) {
    return Math.min(max, Math.max(min, val));
  }

  function round1(val) {
    return Math.round(val * 10) / 10;
  }

  function formatTime(seconds) {
    if (!isFinite(seconds) || seconds < 0) return '0:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) {
      return h + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    }
    return m + ':' + String(s).padStart(2, '0');
  }

  /* ── oEmbed (no API keys) ── */
  var _oembedCache = Object.create(null);
  function oembedEndpointFor(pageUrl) {
    try {
      var u = new URL(pageUrl || location.href);
      var h = u.hostname.replace(/^www\./, '');
      if (/youtube\.com|youtu\.be|youtube-nocookie\.com/i.test(h))
        return 'https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent(u.href);
      if (/vimeo\.com/i.test(h))
        return 'https://vimeo.com/api/oembed.json?url=' + encodeURIComponent(u.href);
      if (/dailymotion\.com|dai\.ly/i.test(h))
        return 'https://www.dailymotion.com/services/oembed?format=json&url=' + encodeURIComponent(u.href);
      if (/tiktok\.com/i.test(h))
        return 'https://www.tiktok.com/oembed?url=' + encodeURIComponent(u.href);
      if (/(^|\.)x\.com$|twitter\.com/i.test(h))
        return 'https://publish.twitter.com/oembed?url=' + encodeURIComponent(u.href);
    } catch (e) {}
    return null;
  }
  function fetchOEmbed(cb) {
    var key = location.href.split('#')[0];
    if (_oembedCache[key]) { if (cb) cb(_oembedCache[key]); return; }
    var ep = oembedEndpointFor(key);
    if (!ep) { if (cb) cb(null); return; }
    fetch(ep, { credentials: 'omit', mode: 'cors' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (data && (data.title || data.author_name)) {
          _oembedCache[key] = data;
          if (cb) cb(data);
        } else if (cb) cb(null);
      })
      .catch(function () { if (cb) cb(null); });
  }
  function safeDownloadBasename(title) {
    var t = String(title || document.title || 'videomax').trim();
    t = t.replace(/\s*[-|–—]\s*YouTube\s*$/i, '').replace(/\s*[-|–—]\s*Vimeo\s*$/i, '');
    t = t.replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 80);
    return t || ('videomax-' + Date.now());
  }
  function bindMediaSessionLight(video) {
    if (!navigator.mediaSession || !video) return function () {};
    function setMeta() {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: (document.title || 'Video').slice(0, 120),
          artist: location.hostname,
          album: 'VideoMax Pro'
        });
      } catch (e) {}
    }
    function setPos() {
      try {
        if (!navigator.mediaSession.setPositionState) return;
        if (!isFinite(video.duration) || video.duration <= 0) return;
        navigator.mediaSession.setPositionState({
          duration: video.duration,
          playbackRate: video.playbackRate || 1,
          position: Math.min(video.currentTime || 0, video.duration)
        });
      } catch (e) {}
    }
    setMeta();
    try {
      navigator.mediaSession.setActionHandler('play', function () { video.play().catch(function () {}); });
      navigator.mediaSession.setActionHandler('pause', function () { video.pause(); });
      navigator.mediaSession.setActionHandler('seekbackward', function (d) {
        video.currentTime = Math.max(0, video.currentTime - ((d && d.seekOffset) || 10)); setPos();
      });
      navigator.mediaSession.setActionHandler('seekforward', function (d) {
        video.currentTime = Math.min(video.duration || 1e9, video.currentTime + ((d && d.seekOffset) || 10)); setPos();
      });
      navigator.mediaSession.setActionHandler('seekto', function (d) {
        if (d && typeof d.seekTime === 'number') video.currentTime = d.seekTime; setPos();
      });
    } catch (e) {}
    var onPlay = function () { try { navigator.mediaSession.playbackState = 'playing'; } catch (e) {} setPos(); };
    var onPause = function () { try { navigator.mediaSession.playbackState = 'paused'; } catch (e) {} setPos(); };
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('seeked', setPos);
    video.addEventListener('loadedmetadata', function () { setMeta(); setPos(); });
    return function () {
      try {
        ['play', 'pause', 'seekbackward', 'seekforward', 'seekto'].forEach(function (a) {
          try { navigator.mediaSession.setActionHandler(a, null); } catch (e) {}
        });
      } catch (e) {}
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('seeked', setPos);
    };
  }


  function stripHtmlTags(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/<[^>]*>/g, '').replace(/\{[^}]*\}/g, '').trim();
  }

  function throttle(fn, delay) {
    let lastCall = 0;
    return function (...args) {
      const now = performance.now();
      if (now - lastCall >= delay) {
        lastCall = now;
        fn.apply(this, args);
      }
    };
  }

  function haptic(ms) { if (IS_MOBILE && navigator.vibrate) try { navigator.vibrate(ms || 12); } catch(e) {} }

  function debounce(fn, delay) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  function pinchDistance(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy);
  }

  /* ══════════════════════════════════════════════════
   *  SVG ICON FACTORY
   *  All icons built with DOM API — zero innerHTML
   * ══════════════════════════════════════════════════ */
  const SVG_NS = 'http://www.w3.org/2000/svg';

  function createSvgIcon(pathDefs, isFilled, size) {
    size = size || 18;
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', isFilled ? 'currentColor' : 'none');
    if (!isFilled) {
      svg.setAttribute('stroke', 'currentColor');
      svg.setAttribute('stroke-width', '2');
      svg.setAttribute('stroke-linecap', 'round');
      svg.setAttribute('stroke-linejoin', 'round');
    }
    svg.style.cssText = 'width:' + size + 'px;height:' + size + 'px;flex-shrink:0;display:block;pointer-events:none';

    for (const def of pathDefs) {
      const el = document.createElementNS(SVG_NS, def.tag);
      for (const [attr, val] of Object.entries(def.attrs)) {
        el.setAttribute(attr, val);
      }
      svg.appendChild(el);
    }
    return svg;
  }

  // Icon library — each returns a fresh SVG element
  const Icons = {
    play()    { return createSvgIcon([{tag:'polygon',attrs:{points:'6,3 20,12 6,21'}}], true); },
    pause()   { return createSvgIcon([{tag:'rect',attrs:{x:'6',y:'4',width:'4',height:'16'}},{tag:'rect',attrs:{x:'14',y:'4',width:'4',height:'16'}}], true); },
    rewind()  { return createSvgIcon([{tag:'path',attrs:{d:'M11 17l-9-5 9-5v10z'}},{tag:'path',attrs:{d:'M20 17l-9-5 9-5v10z'}}], false); },
    forward() { return createSvgIcon([{tag:'path',attrs:{d:'M13 7l9 5-9 5V7z'}},{tag:'path',attrs:{d:'M4 7l9 5-9 5V7z'}}], false); },
    volumeHigh() { return createSvgIcon([{tag:'polygon',attrs:{points:'11,5 6,9 2,9 2,15 6,15 11,19'}},{tag:'path',attrs:{d:'M15.54 8.46a5 5 0 010 7.07'}},{tag:'path',attrs:{d:'M19.07 4.93a10 10 0 010 14.14'}}], false); },
    volumeMute() { return createSvgIcon([{tag:'polygon',attrs:{points:'11,5 6,9 2,9 2,15 6,15 11,19'}},{tag:'line',attrs:{x1:'23',y1:'9',x2:'17',y2:'15'}},{tag:'line',attrs:{x1:'17',y1:'9',x2:'23',y2:'15'}}], false); },
    volumeLow()  { return createSvgIcon([{tag:'polygon',attrs:{points:'11,5 6,9 2,9 2,15 6,15 11,19'}},{tag:'path',attrs:{d:'M15.54 8.46a5 5 0 010 7.07'}}], false); },
    fullscreenEnter() { return createSvgIcon([{tag:'path',attrs:{d:'M8 3H5a2 2 0 00-2 2v3'}},{tag:'path',attrs:{d:'M16 3h3a2 2 0 012 2v3'}},{tag:'path',attrs:{d:'M21 16v3a2 2 0 01-2 2h-3'}},{tag:'path',attrs:{d:'M3 16v3a2 2 0 002 2h3'}}], false); },
    fullscreenExit()  { return createSvgIcon([{tag:'path',attrs:{d:'M8 3v3a2 2 0 01-2 2H3'}},{tag:'path',attrs:{d:'M21 8h-3a2 2 0 01-2-2V3'}},{tag:'path',attrs:{d:'M3 16h3a2 2 0 012 2v3'}},{tag:'path',attrs:{d:'M16 21v-3a2 2 0 012-2h3'}}], false); },
    pip()     { return createSvgIcon([{tag:'rect',attrs:{x:'2',y:'3',width:'20',height:'14',rx:'2'}},{tag:'rect',attrs:{x:'12',y:'11',width:'9',height:'6',rx:'1',fill:'currentColor',stroke:'none'}}], false); },
    loop()    { return createSvgIcon([{tag:'path',attrs:{d:'M17 2l4 4-4 4'}},{tag:'path',attrs:{d:'M3 11V9a4 4 0 014-4h14'}},{tag:'path',attrs:{d:'M7 22l-4-4 4-4'}},{tag:'path',attrs:{d:'M21 13v2a4 4 0 01-4 4H3'}}], false); },
    subtitles() { return createSvgIcon([{tag:'rect',attrs:{x:'2',y:'6',width:'20',height:'13',rx:'2'}},{tag:'path',attrs:{d:'M7 12h2m2 0h4'}}], false); },
    rotate()  { return createSvgIcon([{tag:'path',attrs:{d:'M21 2v6h-6'}},{tag:'path',attrs:{d:'M21 13a9 9 0 11-3-7.7L21 8'}}], false); },
    close()   { return createSvgIcon([{tag:'line',attrs:{x1:'18',y1:'6',x2:'6',y2:'18'}},{tag:'line',attrs:{x1:'6',y1:'6',x2:'18',y2:'18'}}], false); },
    more()    { return createSvgIcon([{tag:'circle',attrs:{cx:'12',cy:'12',r:'3'}},{tag:'path',attrs:{d:'M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z'}}], false); },
    equalizer(){ return createSvgIcon([{tag:'path',attrs:{d:'M4 21V14M4 10V3M12 21V12M12 8V3M20 21V16M20 12V3M2 14h4M10 8h4M18 16h4'}}], false); },
    camera()  { return createSvgIcon([{tag:'path',attrs:{d:'M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z'}},{tag:'circle',attrs:{cx:'12',cy:'13',r:'4'}}], false); },
    quality() { return createSvgIcon([{tag:'rect',attrs:{x:'2',y:'3',width:'20',height:'14',rx:'2'}},{tag:'path',attrs:{d:'M8 21h8m-4-4v4'}}], false); },
    upload()  { return createSvgIcon([{tag:'path',attrs:{d:'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4'}},{tag:'polyline',attrs:{points:'17 8 12 3 7 8'}},{tag:'line',attrs:{x1:'12',y1:'3',x2:'12',y2:'15'}}], false); },
    reset()   { return createSvgIcon([{tag:'path',attrs:{d:'M3 12a9 9 0 109-9 9.75 9.75 0 00-6.74 2.74L3 8'}},{tag:'path',attrs:{d:'M3 3v5h5'}}], false); },
    logo()    { return createSvgIcon([{tag:'polygon',attrs:{points:'6,3 20,12 6,21'}}], true); },
    filter()  { return createSvgIcon([{tag:'circle',attrs:{cx:'12',cy:'12',r:'9'}},{tag:'path',attrs:{d:'M3 12h18'}}], false); },
    abloop()  { return createSvgIcon([{tag:'path',attrs:{d:'M3 12h2l3-6 4 12 3-6h6'}}], false); },
    boost()   { return createSvgIcon([{tag:'path',attrs:{d:'M12 2v20M8 6v12M4 9v6M16 6v12M20 9v6'}}], false); },
    stats()   { return createSvgIcon([{tag:'path',attrs:{d:'M18 20V10M12 20V4M6 20v-6'}}], false); },
    download(){ return createSvgIcon([{tag:'path',attrs:{d:'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4'}},{tag:'polyline',attrs:{points:'7 10 12 15 17 10'}},{tag:'line',attrs:{x1:'12',y1:'15',x2:'12',y2:'3'}}], false); },
    zoomIn()  { return createSvgIcon([{tag:'circle',attrs:{cx:'11',cy:'11',r:'8'}},{tag:'line',attrs:{x1:'21',y1:'21',x2:'16.65',y2:'16.65'}},{tag:'line',attrs:{x1:'11',y1:'8',x2:'11',y2:'14'}},{tag:'line',attrs:{x1:'8',y1:'11',x2:'14',y2:'11'}}], false); },
    zoomOut() { return createSvgIcon([{tag:'circle',attrs:{cx:'11',cy:'11',r:'8'}},{tag:'line',attrs:{x1:'21',y1:'21',x2:'16.65',y2:'16.65'}},{tag:'line',attrs:{x1:'8',y1:'11',x2:'14',y2:'11'}}], false); },
    mirror()  { return createSvgIcon([{tag:'path',attrs:{d:'M12 3v18'}},{tag:'path',attrs:{d:'M16 7l4 5-4 5'}},{tag:'path',attrs:{d:'M8 7L4 12l4 5'}}], false); },
    info()    { return createSvgIcon([{tag:'circle',attrs:{cx:'12',cy:'12',r:'10'}},{tag:'line',attrs:{x1:'12',y1:'8',x2:'12',y2:'12'}},{tag:'line',attrs:{x1:'12',y1:'16',x2:'12.01',y2:'16'}}], false); },
    cinema()  { return createSvgIcon([{tag:'rect',attrs:{x:'2',y:'4',width:'20',height:'16',rx:'2'}},{tag:'path',attrs:{d:'M7 4v16M17 4v16M2 9h5M2 15h5M17 9h5M17 15h5'}}], false); },
    fsE()     { return createSvgIcon([{tag:'path',attrs:{d:'M8 3H5a2 2 0 00-2 2v3'}},{tag:'path',attrs:{d:'M16 3h3a2 2 0 012 2v3'}},{tag:'path',attrs:{d:'M21 16v3a2 2 0 01-2 2h-3'}},{tag:'path',attrs:{d:'M3 16v3a2 2 0 002 2h3'}}], false); },
    rot()     { return createSvgIcon([{tag:'path',attrs:{d:'M21 2v6h-6'}},{tag:'path',attrs:{d:'M21 13a9 9 0 11-3-7.7L21 8'}}], false); },
  };

  function getIcon(name) {
    return Icons[name] ? Icons[name]() : document.createTextNode('');
  }

  function setButtonIcon(button, iconName) {
    button.textContent = '';
    button.appendChild(getIcon(iconName));
  }


  /* ══════════════════════════════════════════════════
   *  CSS STYLES — Netflix-inspired cinematic dark UI
   *
   *  Design principles:
   *  - Dark, immersive, minimal
   *  - Red accent (#e50914)
   *  - Smooth fade transitions
   *  - Transparent backgrounds, no heavy borders
   *  - Controls auto-hide gracefully
   * ══════════════════════════════════════════════════ */
  const PLAYER_CSS = `
/* ═══════════════════════════════════════════════════════
   VIDEOMAX PRO v20.5 — NETFLIX CINEMATIC PLAYER
   Desktop + Mobile · Red accent · Auto-hide chrome
   ═══════════════════════════════════════════════════════ */
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:host{
  --nf-red:#e50914;
  --nf-red-h:#f40612;
  --nf-red-g:rgba(229,9,20,.45);
  --nf-bg:rgba(0,0,0,.92);
  --nf-bg2:rgba(20,20,20,.96);
  --nf-w:#fff;
  --nf-w2:rgba(255,255,255,.75);
  --nf-w3:rgba(255,255,255,.5);
  --nf-bd:rgba(255,255,255,.12);
  --nf-r:4px;
  --nf-ease:cubic-bezier(.4,0,.2,1);
  --vm-red:var(--nf-red);
  --vm-gray:var(--nf-w2);
  font-family:Netflix Sans,Helvetica Neue,Segoe UI,Roboto,system-ui,sans-serif;
  font-size:14px;color:var(--nf-w);line-height:1.4;
  -webkit-font-smoothing:antialiased;
  direction:ltr!important;unicode-bidi:isolate;
}

/* ENTRY PILL */
.vm-entry-wrap{transition:opacity .35s var(--nf-ease)}
.vm-entry-wrap.vm-idle{opacity:.32}
.vm-entry-wrap.vm-idle:hover,.vm-entry-wrap.vm-idle:focus-within{opacity:1}
.vm-entry-btn{
  background:var(--nf-red);color:#fff;border:none;border-radius:var(--nf-r);
  padding:8px 14px;font-size:13px;font-weight:700;letter-spacing:.3px;
  cursor:pointer;pointer-events:auto;display:flex;align-items:center;gap:8px;
  box-shadow:0 2px 12px var(--nf-red-g);transition:background .15s,transform .15s;
  -webkit-tap-highlight-color:transparent;touch-action:manipulation;opacity:.96;
}
.vm-entry-btn:hover{background:var(--nf-red-h);transform:scale(1.03)}
.vm-entry-btn:active{transform:scale(.97)}
.vm-dismiss-btn,.vm-reset-btn{
  position:absolute;width:22px;height:22px;border-radius:50%;
  background:rgba(0,0,0,.75);border:1px solid var(--nf-bd);color:var(--nf-w2);
  display:flex;align-items:center;justify-content:center;cursor:pointer;
  font-size:11px;font-weight:700;pointer-events:auto;transition:all .15s;
}
.vm-dismiss-btn{top:-8px;right:-8px}
.vm-reset-btn{top:-8px;left:-8px}
.vm-dismiss-btn:hover{background:var(--nf-red);color:#fff;border-color:var(--nf-red)}
.vm-reset-btn:hover{background:#46d369;color:#fff;border-color:#46d369}

/* OVERLAYS */
.vm-brightness-overlay{position:absolute;inset:0;background:#000;pointer-events:none;opacity:0;z-index:5;transition:opacity .03s linear}
.vm-brightness-boost{position:absolute;inset:0;background:#fff;pointer-events:none;opacity:0;z-index:6;mix-blend-mode:screen;transition:opacity .03s linear}
.vm-subtitle-display{position:absolute;bottom:88px;left:50%;transform:translateX(-50%);max-width:86%;text-align:center;pointer-events:none;z-index:40;transition:bottom .25s var(--nf-ease)}
.vm-subtitle-display span{
  display:inline-block;background:rgba(0,0,0,.78);color:#fff;
  font-size:clamp(15px,2.2vw,26px);font-weight:600;padding:6px 16px;border-radius:2px;line-height:1.4;
  text-shadow:0 1px 3px rgba(0,0,0,.9);
}
.vm-subtitle-display.vm-hidden{display:none}
.vm-overlay{position:absolute;inset:0;pointer-events:none;user-select:none;-webkit-user-select:none;overflow:hidden}

/* HUD — Netflix fade */
.vm-hud{
  position:absolute;inset:0;pointer-events:auto;
  display:flex;flex-direction:column;
  opacity:0;visibility:hidden;transition:opacity .2s var(--nf-ease),visibility .2s;
}
.vm-hud.vm-active{opacity:1;visibility:visible}
.vm-hud.vm-controls-hidden .vm-top-bar,
.vm-hud.vm-controls-hidden .vm-bottom-bar{
  opacity:0;pointer-events:none;transform:translateY(6px);transition:opacity .35s,transform .35s;
}
.vm-hud.vm-controls-hidden{cursor:none}
.vm-hud.vm-controls-hidden .vm-touch-zones{cursor:none}
.vm-hud.vm-controls-hidden .vm-subtitle-display{bottom:24px}
.vm-touch-zones{touch-action:none;-webkit-user-select:none;user-select:none;flex:1;display:flex;position:relative;min-height:0;overflow:hidden}
.vm-touch-zone{flex:1;pointer-events:auto;cursor:pointer;-webkit-tap-highlight-color:transparent}

/* TOP BAR — gradient like Netflix */
.vm-top-bar{
  display:flex;align-items:center;gap:8px;padding:16px 20px 48px;flex-shrink:0;
  background:linear-gradient(180deg,rgba(0,0,0,.85) 0%,rgba(0,0,0,.35) 55%,transparent 100%);
  transition:opacity .3s,transform .3s;transform:translateY(0);
}
.vm-logo-text{
  display:flex;align-items:center;gap:6px;font-size:15px;font-weight:800;
  color:var(--nf-red);flex-shrink:0;letter-spacing:.5px;
}
.vm-video-title{
  color:var(--nf-w);font-size:15px;font-weight:600;overflow:hidden;text-overflow:ellipsis;
  white-space:nowrap;flex:1;text-align:left;padding:0 12px;text-shadow:0 1px 4px rgba(0,0,0,.8);
}
.vm-top-actions{display:flex;align-items:center;gap:4px;flex-shrink:1;min-width:0;overflow:hidden}

/* BOTTOM BAR */
.vm-bottom-bar{
  background:linear-gradient(0deg,rgba(0,0,0,.9) 0%,rgba(0,0,0,.45) 55%,transparent 100%);
  padding:48px 16px 14px;display:flex;flex-direction:column;gap:4px;
  pointer-events:auto;flex-shrink:0;transition:opacity .3s,transform .3s;transform:translateY(0);
}

/* SEEK — Netflix thin red line */
.vm-seek-container{width:100%;padding:12px 4px 6px;cursor:pointer;position:relative}
.vm-seek-track{
  width:100%;height:3px;border-radius:2px;position:relative;
  background:rgba(255,255,255,.25);transition:height .12s var(--nf-ease);
}
.vm-seek-container:hover .vm-seek-track,
.vm-seek-container.vm-dragging .vm-seek-track{height:6px}
.vm-seek-buffered{position:absolute;top:0;left:0;height:100%;background:rgba(255,255,255,.35);border-radius:2px;pointer-events:none}
.vm-seek-progress{
  height:100%;border-radius:2px;position:relative;pointer-events:none;will-change:width;
  background:var(--nf-red);
}
.vm-seek-thumb{
  position:absolute;top:50%;right:0;
  transform:translate(50%,-50%) scale(0);
  width:14px;height:14px;background:var(--nf-red);border-radius:50%;
  box-shadow:0 0 0 2px #fff;transition:transform .12s var(--nf-ease);
}
.vm-seek-container:hover .vm-seek-thumb,
.vm-seek-container.vm-dragging .vm-seek-thumb{transform:translate(50%,-50%) scale(1)}
.vm-seek-tooltip{
  position:absolute;bottom:calc(100% + 10px);transform:translateX(-50%);
  background:rgba(0,0,0,.9);color:#fff;font-size:12px;font-weight:600;
  padding:4px 10px;border-radius:2px;pointer-events:none;white-space:nowrap;
  opacity:0;transition:opacity .1s;z-index:50;
}
.vm-seek-container:hover .vm-seek-tooltip{opacity:1}
.vm-ab-marker{position:absolute;top:-3px;width:3px;height:calc(100% + 6px);border-radius:1px;z-index:3;pointer-events:none}
.vm-ab-marker.vm-marker-a{background:var(--nf-red)}
.vm-ab-marker.vm-marker-b{background:#f5c518}
.vm-ab-range-highlight{position:absolute;top:0;height:100%;background:rgba(229,9,20,.28);pointer-events:none;z-index:1}

/* CONTROLS ROW */
.vm-controls-row{display:flex;align-items:center;justify-content:space-between;gap:4px;flex-wrap:nowrap;width:100%;padding:0 2px}
.vm-control-group{display:flex;align-items:center;gap:2px;min-width:0;flex-wrap:nowrap}
.vm-control-group.vm-left-controls{flex:1 1 auto;overflow:hidden}
.vm-control-group.vm-right-controls{flex:0 0 auto;justify-content:flex-end}
.vm-control-btn.vm-essential{flex-shrink:0!important}
.vm-collapsed{display:none!important}
.vm-hide-chrome{display:none!important}
/* Netflix bottom: give play a little breathing room from neighbors */
.vm-left-controls .vm-play-pause{margin-right:2px}
.vm-right-controls{gap:2px}
.vm-controls-row{align-items:center}

.vm-control-btn{
  background:transparent;border:none;color:var(--nf-w);
  border-radius:50%;width:42px;height:42px;flex-shrink:0;
  display:flex;align-items:center;justify-content:center;
  cursor:pointer;pointer-events:auto;position:relative;
  transition:transform .12s,color .12s,background .12s;
  -webkit-tap-highlight-color:transparent;
}
.vm-control-btn:hover{color:#fff;transform:scale(1.12);background:rgba(255,255,255,.08)}
.vm-control-btn:active{transform:scale(.92)}
.vm-control-btn.vm-active-state{color:var(--nf-red)}
.vm-control-btn.vm-active-state::after{
  content:'';position:absolute;bottom:5px;left:50%;transform:translateX(-50%);
  width:4px;height:4px;border-radius:50%;background:var(--nf-red);
}
.vm-control-btn svg{width:22px;height:22px}
/* Netflix big play */
.vm-play-pause{
  background:transparent!important;border:none!important;box-shadow:none!important;
  width:48px!important;height:48px!important;
}
.vm-play-pause svg{width:30px!important;height:30px!important}
.vm-play-pause:hover{transform:scale(1.15)!important;background:rgba(255,255,255,.1)!important}
.vm-control-btn-lg{width:44px;height:44px}
.vm-control-btn-lg svg{width:24px;height:24px}
.vm-pill-btn{
  border-radius:2px;width:auto;padding:0 12px;height:32px;
  font-size:12px;font-weight:700;min-width:40px;max-width:90px;
  letter-spacing:.2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
  background:rgba(255,255,255,.12);border:none;color:#fff;
  transition:background .15s;
}
.vm-pill-btn:hover{background:rgba(255,255,255,.22)}
.vm-time-display{
  color:var(--nf-w);font-size:13px;font-weight:500;
  font-variant-numeric:tabular-nums;white-space:nowrap;
  padding:0 8px;flex-shrink:1;overflow:hidden;text-overflow:ellipsis;min-width:0;
  text-shadow:0 1px 2px rgba(0,0,0,.8);
}

/* Volume */
.vm-volume-group{display:flex;align-items:center;gap:2px}
.vm-volume-slider{
  -webkit-appearance:none;appearance:none;width:0;height:4px;
  border-radius:2px;background:rgba(255,255,255,.3);outline:none;
  cursor:pointer;transition:width .2s var(--nf-ease),opacity .15s,margin .2s;opacity:0;margin:0;
}
.vm-volume-group:hover .vm-volume-slider,
.vm-volume-slider:focus,.vm-volume-slider:active,.vm-volume-slider:hover{width:80px;opacity:1;margin:0 6px}
.vm-volume-slider::-webkit-slider-thumb{-webkit-appearance:none;width:14px;height:14px;border-radius:50%;background:#fff;cursor:pointer}
.vm-volume-slider::-moz-range-thumb{width:14px;height:14px;border-radius:50%;background:#fff;cursor:pointer;border:none}

/* TOAST / BADGES */
.vm-toast{
  position:absolute;bottom:90px;left:50%;
  transform:translateX(-50%) translateY(8px);
  background:rgba(20,20,20,.92);color:#fff;font-size:15px;font-weight:600;
  padding:10px 22px;border-radius:4px;pointer-events:none;
  opacity:0;transition:all .2s var(--nf-ease);white-space:nowrap;z-index:60;
  border:1px solid var(--nf-bd);
}
.vm-toast.vm-visible{opacity:1;transform:translateX(-50%) translateY(0)}
.vm-hold-badge{
  position:absolute;top:18px;left:50%;transform:translateX(-50%) translateY(-6px) scale(.96);
  font-size:18px;font-weight:800;pointer-events:none;opacity:0;visibility:hidden;z-index:62;
  color:#fff;display:inline-flex;align-items:center;gap:8px;
  padding:8px 18px;border-radius:4px;background:rgba(0,0,0,.72);border:1px solid var(--nf-bd);
  transition:opacity .15s,transform .15s,visibility .15s;
}
.vm-hold-badge::before{content:"»";font-size:16px;color:var(--nf-red);font-weight:900}
.vm-hold-badge.vm-visible{opacity:1;visibility:visible;transform:translateX(-50%) translateY(0) scale(1)}
.vm-hold-badge small{font-size:11px;font-weight:600;color:var(--nf-w2);letter-spacing:1px;text-transform:uppercase}
.vm-info-badge{
  position:absolute;left:50%;transform:translateX(-50%);
  background:rgba(0,0,0,.8);color:#fff;font-size:12px;font-weight:600;
  padding:6px 16px;border-radius:4px;pointer-events:none;opacity:0;transition:opacity .2s;z-index:55;
}
.vm-info-badge.vm-visible{opacity:1}
.vm-badge-ar{top:52px}.vm-badge-rot{top:84px}.vm-badge-zoom{top:18px}

/* SIDE BARS + GESTURE CENTER */
.vm-side-bar{
  position:absolute;top:50%;transform:translateY(-50%);
  width:6px;height:min(42%,200px);border-radius:3px;
  background:rgba(255,255,255,.15);pointer-events:none;
  opacity:0;visibility:hidden;transition:opacity .12s,visibility .12s;
}
.vm-side-bar.vm-left{left:20px}.vm-side-bar.vm-right{right:20px}
.vm-side-bar.vm-visible{opacity:1;visibility:visible}
.vm-side-bar-fill{position:absolute;bottom:0;left:0;width:100%;border-radius:3px;transition:none;will-change:height}
.vm-side-bar.vm-left .vm-side-bar-fill{background:linear-gradient(to top,#f5c518,#e50914)}
.vm-side-bar.vm-right .vm-side-bar-fill{background:linear-gradient(to top,#46d369,#1db954)}
.vm-side-bar-icon{position:absolute;top:-32px;left:50%;transform:translateX(-50%);font-size:18px}
.vm-side-bar-value{position:absolute;bottom:-32px;left:50%;transform:translateX(-50%);font-size:14px;font-weight:700;color:#fff;white-space:nowrap;text-shadow:0 1px 4px #000}
.vm-gesture-center{
  position:absolute;left:50%;top:42%;transform:translate(-50%,-50%) scale(.94);
  min-width:120px;padding:16px 24px;border-radius:8px;text-align:center;
  background:rgba(0,0,0,.72);color:#fff;pointer-events:none;z-index:70;
  opacity:0;visibility:hidden;transition:opacity .12s,transform .12s,visibility .12s;
  border:1px solid var(--nf-bd);
}
.vm-gesture-center.vm-visible{opacity:1;visibility:visible;transform:translate(-50%,-50%) scale(1)}
.vm-gesture-center .vm-gc-icon{font-size:28px;line-height:1;margin-bottom:6px}
.vm-gesture-center .vm-gc-val{font-size:22px;font-weight:800;font-variant-numeric:tabular-nums}
.vm-gesture-center .vm-gc-bar{width:110px;height:3px;border-radius:2px;background:rgba(255,255,255,.2);margin:10px auto 0;overflow:hidden}
.vm-gesture-center .vm-gc-fill{height:100%;background:var(--nf-red);width:0%}

/* SCRUB / EFFECTS */
.vm-scrub-overlay{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;opacity:0;transition:opacity .12s;z-index:58}
.vm-scrub-overlay.vm-visible{opacity:1}
.vm-scrub-inner{background:rgba(0,0,0,.78);border-radius:8px;padding:18px 36px;display:flex;flex-direction:column;align-items:center;gap:6px;border:1px solid var(--nf-bd)}
.vm-scrub-time{font-size:34px;font-weight:800;font-variant-numeric:tabular-nums}
.vm-scrub-delta{font-size:14px;font-weight:700;color:var(--nf-red)}
.vm-scrub-bar{width:150px;height:3px;background:rgba(255,255,255,.2);border-radius:2px;overflow:hidden}
.vm-scrub-fill{height:100%;background:var(--nf-red);border-radius:2px}
.vm-ripple{position:absolute;border-radius:50%;background:radial-gradient(circle,rgba(229,9,20,.2),transparent 70%);transform:translate(-50%,-50%) scale(0);pointer-events:none;z-index:20;animation:vmR .5s ease-out forwards;width:100px;height:100px}
@keyframes vmR{to{transform:translate(-50%,-50%) scale(3.2);opacity:0}}
.vm-doubletap-indicator{position:absolute;top:0;bottom:0;width:30%;display:flex;align-items:center;justify-content:center;pointer-events:none;opacity:0;transition:opacity .1s;z-index:25}
.vm-doubletap-indicator.vm-left-side{left:0}.vm-doubletap-indicator.vm-right-side{right:0}
.vm-doubletap-indicator .vm-dt-text{color:#fff;font-size:15px;font-weight:700;text-shadow:0 2px 8px #000}
.vm-doubletap-indicator.vm-visible{opacity:1}

.vm-skip-ad-btn{position:absolute;bottom:88px;right:16px;background:var(--nf-red);color:#fff;border:none;border-radius:2px;padding:10px 18px;font-size:13px;font-weight:700;cursor:pointer;pointer-events:auto;z-index:65;display:none}
.vm-skip-ad-btn.vm-visible{display:block}
.vm-pip-badge,.vm-ab-badge{
  position:absolute;top:14px;font-size:11px;font-weight:700;padding:5px 12px;border-radius:2px;
  pointer-events:none;display:none;z-index:55;background:rgba(0,0,0,.8);color:var(--nf-red);border:1px solid var(--nf-bd);
}
.vm-pip-badge{right:14px}.vm-ab-badge{left:14px}
.vm-pip-badge.vm-visible,.vm-ab-badge.vm-visible{display:block}

/* PANELS — Netflix style sheets */
.vm-panel{
  position:absolute;padding:6px 0 10px;z-index:10050;min-width:260px;max-width:min(360px,94vw);
  max-height:min(72vh,560px);overflow-y:auto;overflow-x:hidden;
  -webkit-overflow-scrolling:touch;overscroll-behavior:contain;
  background:rgba(16,16,16,.96);border:1px solid rgba(255,255,255,.1);border-radius:16px;
  box-shadow:0 16px 48px rgba(0,0,0,.8);
  opacity:0;transform:translateY(10px) scale(.98);pointer-events:none;
  transition:opacity .2s,transform .2s;touch-action:pan-y;
}
.vm-panel.vm-visible{opacity:1;transform:translateY(0) scale(1);pointer-events:auto}
.vm-panel.vm-sheet{
  position:fixed!important;left:50%!important;right:auto!important;top:auto!important;
  bottom:max(12px,env(safe-area-inset-bottom))!important;
  transform:translateX(-50%) translateY(20px) scale(.98);
  width:min(400px,calc(100vw - 16px));max-width:calc(100vw - 16px);min-width:0;
  max-height:min(78vh,640px);border-radius:16px 16px 12px 12px;padding:2px 0 12px;
  z-index:2147483000!important;
}
.vm-panel.vm-sheet.vm-visible{transform:translateX(-50%) translateY(0) scale(1)}
.vm-panel.vm-sheet{display:flex;flex-direction:column}
.vm-panel.vm-sheet .vm-panel-scroll{flex:1 1 auto;overflow-y:auto;-webkit-overflow-scrolling:touch;min-height:0;padding-bottom:8px}
.vm-panel-back{display:flex;align-items:center;gap:8px;padding:12px 16px;cursor:pointer;color:#fff;font-weight:700;font-size:14px;border-bottom:1px solid rgba(255,255,255,.1);flex-shrink:0}
.vm-panel-back:hover,.vm-panel-back:active{background:rgba(255,255,255,.08)}
.vm-panel-back::before{content:'‹';font-size:22px;line-height:1;margin-right:4px}
.vm-eq-row{display:flex;align-items:center;gap:8px;padding:8px 16px}
.vm-eq-label{font-size:11px;font-weight:700;color:rgba(255,255,255,.55);min-width:42px}
.vm-eq-slider{-webkit-appearance:none;appearance:none;flex:1;height:3px;border-radius:2px;background:rgba(255,255,255,.2);outline:none}
.vm-eq-slider::-webkit-slider-thumb{-webkit-appearance:none;width:14px;height:14px;border-radius:50%;background:#e50914;cursor:pointer}
.vm-eq-val{font-size:11px;font-weight:700;min-width:36px;text-align:right;color:#fff}
.vm-eq-note{padding:8px 16px 4px;font-size:11px;color:rgba(255,255,255,.45);line-height:1.4}

.vm-download-panel{
  position:fixed!important;left:50%!important;top:50%!important;bottom:auto!important;
  transform:translate(-50%,-50%) scale(.98)!important;z-index:2147483001!important;
  width:min(380px,calc(100vw - 20px));max-height:min(80vh,560px);
  border-radius:14px!important;padding:8px 0 12px!important;
}
.vm-download-panel.vm-visible{transform:translate(-50%,-50%) scale(1)!important;opacity:1;pointer-events:auto}
.vm-dl-grid{display:flex;flex-direction:column;gap:4px;padding:6px 10px}
.vm-dl-btn{
  display:flex;align-items:center;gap:12px;padding:13px 14px;border-radius:10px;
  background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08);
  color:#fff;font-size:14px;font-weight:600;cursor:pointer;text-align:left;
  min-height:48px;-webkit-tap-highlight-color:transparent;
}
.vm-dl-btn:hover,.vm-dl-btn:active{background:rgba(229,9,20,.18);border-color:rgba(229,9,20,.35)}
.vm-dl-btn small{display:block;font-size:11px;font-weight:500;color:rgba(255,255,255,.5);margin-top:2px}
.vm-dl-ico{font-size:18px;width:26px;text-align:center;flex-shrink:0}
.vm-panel.vm-sheet::before{
  content:'';display:block;width:36px;height:4px;border-radius:99px;
  background:rgba(255,255,255,.25);margin:8px auto 6px;
}
.vm-panel-label{padding:10px 16px 4px;color:var(--nf-w3);font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;display:flex;align-items:center;gap:6px}
.vm-panel-item{
  padding:11px 16px;color:var(--nf-w);font-size:13px;cursor:pointer;
  display:flex;align-items:center;gap:10px;min-height:40px;
  transition:all .12s;white-space:nowrap;margin:2px 8px;border-radius:8px;
  -webkit-tap-highlight-color:transparent;border:1px solid transparent;
}
.vm-panel-item:hover,.vm-panel-item:active{background:rgba(255,255,255,.06);border-color:rgba(255,255,255,.08)}
.vm-panel-item:active{transform:scale(.98)}
.vm-panel-item svg{width:16px;height:16px;flex-shrink:0;opacity:.7}
.vm-panel-separator{height:1px;background:linear-gradient(to right,transparent,var(--nf-bd),transparent);margin:4px 14px}
.vm-panel-item.vm-has-submenu::after{content:"›";margin-left:auto;opacity:.3;font-size:16px;transition:transform .15s}
.vm-panel-item.vm-has-submenu:hover::after{transform:translateX(3px);opacity:.7}

/* SETTINGS GRID — MX Player / Arc-style flat icon grid, Netflix red/black theme.
   One glance, no scrolling text rows, no grouped sections: just tap the icon. */
.vm-panel-grid{
  display:grid;grid-template-columns:repeat(4,1fr);gap:2px;
  padding:14px 8px 16px;min-width:0;width:min(336px,94vw);
  backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);
}
.vm-panel-grid.vm-sheet{width:min(360px,calc(100vw - 16px))}
.vm-panel-grid .vm-panel-label,
.vm-panel-grid .vm-panel-separator{display:none}
.vm-panel-grid .vm-panel-item{
  flex-direction:column;justify-content:center;align-items:center;
  gap:7px;margin:0;padding:12px 4px;min-height:78px;border-radius:14px;
  white-space:normal;text-align:center;font-size:11px;font-weight:600;
  line-height:1.25;color:var(--nf-w2);
}
.vm-panel-grid .vm-panel-item svg{width:22px;height:22px;opacity:.92;color:#fff}
.vm-panel-grid .vm-panel-item:hover,
.vm-panel-grid .vm-panel-item:active{
  background:rgba(229,9,20,.14);border-color:rgba(229,9,20,.3);color:#fff;
}
.vm-panel-grid .vm-panel-item.vm-has-submenu::after{display:none}
.vm-panel-grid .vm-panel-item.vm-active-state{color:var(--nf-red)}
.vm-panel-grid .vm-panel-item.vm-active-state svg{color:var(--nf-red)}
@media (max-width:420px){
  .vm-panel-grid{grid-template-columns:repeat(4,1fr);gap:0}
  .vm-panel-grid .vm-panel-item{min-height:72px;padding:10px 2px;font-size:10.5px}
}
.vm-sub-panel{min-width:200px;z-index:1000}
.vm-sub-panel.vm-sheet{z-index:1001}
.vm-panel-backdrop{
  position:absolute;inset:0;background:rgba(0,0,0,.5);z-index:998;
  opacity:0;pointer-events:none;transition:opacity .18s;border:none;padding:0;
}
.vm-panel-backdrop.vm-visible{opacity:1;pointer-events:auto}
/* Quality panel - redesigned card style */
.vm-quality-item{
  padding:10px 16px;color:var(--nf-w);font-size:13px;cursor:pointer;
  display:flex;align-items:center;gap:8px;margin:3px 6px;border-radius:8px;min-height:36px;
  transition:all .12s;border:1px solid transparent;position:relative;
}
.vm-quality-item:hover{background:rgba(255,255,255,.06);border-color:rgba(255,255,255,.08)}
.vm-quality-item.vm-selected{color:var(--nf-red);font-weight:700;background:rgba(229,9,20,.1);border-color:rgba(229,9,20,.2)}
.vm-quality-item .vm-qlabel{flex:1;display:flex;align-items:center;gap:6px}
.vm-quality-item .vm-qbadge{font-size:9px;font-weight:700;padding:2px 7px;border-radius:99px;background:rgba(255,255,255,.08);color:rgba(255,255,255,.6);white-space:nowrap}
.vm-quality-item .vm-qbadge.auto-badge{background:rgba(229,9,20,.15);color:#e50914}
.vm-quality-item .vm-qbadge.low-badge{background:rgba(255,204,0,.12);color:#ffcc00}
.vm-quality-item .vm-qbadge.high-badge{background:rgba(34,197,94,.12);color:#4ade80}
.vm-quality-item .vm-qcheck{margin-left:auto;font-size:11px;color:var(--nf-red);opacity:0;transition:opacity .12s}
.vm-quality-item.vm-selected .vm-qcheck{opacity:1}
.vm-quality-item small{color:rgba(255,255,255,.45);font-size:11px}

.vm-subtitle-item{
  padding:10px 16px;color:var(--nf-w);font-size:13px;cursor:pointer;
  display:flex;align-items:center;gap:8px;margin:3px 6px;border-radius:8px;min-height:36px;
  transition:all .12s;border:1px solid transparent;
}
.vm-subtitle-item:hover{background:rgba(255,255,255,.06);border-color:rgba(255,255,255,.08)}
.vm-subtitle-item.vm-selected{color:var(--nf-red);font-weight:700;background:rgba(229,9,20,.1);border-color:rgba(229,9,20,.2)}
.vm-subtitle-upload{padding:12px 18px;display:flex;align-items:center;gap:8px;cursor:pointer;color:var(--nf-red);font-size:13px;font-weight:600;border-top:1px solid var(--nf-bd);margin-top:4px}

/* Filters */
.vm-filter-panel{min-width:280px;z-index:1000;padding:12px 0}
.vm-filter-row{display:flex;align-items:center;gap:8px;padding:8px 18px}
.vm-filter-label{font-size:12px;font-weight:600;color:var(--nf-w2);min-width:70px}
.vm-filter-slider{-webkit-appearance:none;appearance:none;flex:1;height:3px;border-radius:2px;background:rgba(255,255,255,.2);outline:none;cursor:pointer}
.vm-filter-slider::-webkit-slider-thumb{-webkit-appearance:none;width:14px;height:14px;border-radius:50%;background:var(--nf-red);cursor:pointer}
.vm-filter-value{font-size:11px;font-weight:700;color:var(--nf-w);min-width:32px;text-align:right}
.vm-filter-reset-btn{
  margin:10px 14px 4px;padding:10px 16px;background:rgba(255,255,255,.08);border:none;border-radius:2px;
  color:var(--nf-w2);font-size:12px;font-weight:700;cursor:pointer;text-align:center;
}
.vm-filter-reset-btn:hover{background:rgba(229,9,20,.2);color:var(--nf-red)}
.vm-stats-panel{min-width:270px;z-index:1000;padding:14px 18px;font-size:12px}
.vm-stats-row{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--nf-bd)}
.vm-stats-row:last-child{border-bottom:none}
.vm-stats-key{color:var(--nf-w3)}.vm-stats-val{color:var(--nf-w);font-weight:700;font-variant-numeric:tabular-nums}

.vm-loading{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);pointer-events:none;opacity:0;transition:opacity .15s;z-index:59}
.vm-loading.vm-visible{opacity:1}
.vm-spinner{width:52px;height:52px;border:3px solid rgba(255,255,255,.12);border-top-color:var(--nf-red);border-radius:50%;animation:vmSpin .7s linear infinite}
@keyframes vmSpin{to{transform:rotate(360deg)}}
.vm-keyboard-hint{
  position:absolute;bottom:86px;left:50%;transform:translateX(-50%);
  background:rgba(0,0,0,.85);color:var(--nf-w3);font-size:11px;
  padding:8px 18px;border-radius:4px;pointer-events:none;opacity:0;transition:opacity .25s;white-space:nowrap;z-index:55;
}
.vm-keyboard-hint.vm-visible{opacity:1}
.vm-panel::-webkit-scrollbar{width:4px}
.vm-panel::-webkit-scrollbar-thumb{background:rgba(255,255,255,.15);border-radius:2px}

/* Compact player */
.vm-compact .vm-control-btn{width:38px;height:38px}
.vm-compact .vm-control-btn svg{width:20px;height:20px}
.vm-compact .vm-control-btn-lg{width:42px;height:42px}
.vm-compact .vm-pill-btn{height:28px;padding:0 10px;font-size:11px;max-width:72px}
.vm-compact .vm-top-bar,.vm-compact .vm-bottom-bar{padding-left:10px;padding-right:10px}
.vm-xcompact .vm-control-btn{width:34px;height:34px}
.vm-xcompact .vm-control-btn svg{width:18px;height:18px}
.vm-xcompact .vm-control-btn-lg{width:38px;height:38px}
.vm-xcompact .vm-time-display{font-size:11px;padding:0 4px}
.vm-xcompact .vm-logo-text{display:none}

/* ═══ MOBILE / TOUCH — Netflix mobile player ═══ */
@media(max-width:700px),(pointer:coarse){
  .vm-control-btn{width:44px;height:44px;min-width:44px}
  .vm-control-btn-lg{width:48px;height:48px;min-width:48px}
  .vm-control-btn svg{width:22px;height:22px}
  .vm-control-btn-lg svg{width:26px;height:26px}
  .vm-play-pause{width:52px!important;height:52px!important}
  .vm-play-pause svg{width:32px!important;height:32px!important}
  .vm-pill-btn{height:32px;padding:0 10px;font-size:12px;min-width:36px;max-width:78px}
  .vm-top-bar{padding:10px 10px 28px}
  .vm-bottom-bar{padding:28px 10px 12px}
  .vm-video-title{font-size:13px;padding:0 6px}
  .vm-time-display{font-size:12px}
  .vm-toast{font-size:14px;padding:10px 18px;border-radius:6px}
  .vm-hide-mobile{display:none!important}
  .vm-seek-track{height:4px!important}
  .vm-seek-container:hover .vm-seek-track,.vm-seek-container.vm-dragging .vm-seek-track{height:7px!important}
  .vm-seek-thumb{width:16px!important;height:16px!important}
  .vm-seek-container{padding:14px 2px 8px!important}
  .vm-side-bar{width:8px!important;height:min(48%,220px)!important}
  .vm-side-bar-value{font-size:15px!important}
  .vm-panel-item{min-height:50px;font-size:15px;padding:14px 16px}
  .vm-panel.vm-sheet{bottom:max(10px,env(safe-area-inset-bottom))!important}
  .vm-subtitle-display{bottom:100px}
  .vm-hold-badge{font-size:16px;padding:8px 16px}
}
@media(max-height:450px) and (orientation:landscape){
  .vm-top-bar{padding:6px 10px 16px!important}
  .vm-bottom-bar{padding:16px 10px 8px!important}
  .vm-control-btn{width:36px;height:36px;min-width:36px}
  .vm-control-btn-lg{width:40px;height:40px}
  .vm-play-pause{width:44px!important;height:44px!important}
}
@media(max-width:420px),(max-height:380px){
  .vm-controls-row{gap:1px!important;padding:0!important}
  .vm-control-group{gap:0!important}
  .vm-control-btn{width:34px!important;height:34px!important;min-width:34px!important}
  .vm-control-btn svg{width:18px!important;height:18px!important}
  .vm-play-pause{width:40px!important;height:40px!important;min-width:40px!important}
  .vm-play-pause svg{width:24px!important;height:24px!important}
  .vm-pill-btn{height:28px!important;padding:0 7px!important;font-size:11px!important;max-width:60px!important}
  .vm-time-display{font-size:11px!important;padding:0 3px!important}
  .vm-bottom-bar{padding-left:6px!important;padding-right:6px!important}
}
`;

  /* ══════════════════════════════════════════════════
   *  DOM BUILDER HELPERS
   * ══════════════════════════════════════════════════ */
  function createElement(tag, className, textContent) {
    const el = document.createElement(tag || 'div');
    if (className) el.className = className;
    if (textContent) el.textContent = textContent;
    return el;
  }

  function createButton(className, title, iconName, extraText) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = className;
    if (title) { btn.title = title; btn.setAttribute('aria-label', title); }
    if (iconName) btn.appendChild(getIcon(iconName));
    if (extraText) btn.appendChild(document.createTextNode(' ' + extraText));
    return btn;
  }

  function createPillButton(className, title, text) {
    const btn = document.createElement('button');
    btn.className = className;
    btn.title = title;
    btn.textContent = text;
    return btn;
  }

  function createPanelItem(iconName, labelText, hasSubmenu) {
    const item = createElement('div', 'vm-panel-item' + (hasSubmenu ? ' vm-has-submenu' : ''));
    item.appendChild(getIcon(iconName));
    item.appendChild(document.createTextNode(' ' + labelText));
    return item;
  }


  /* ══════════════════════════════════════════════════
   *  HLS.JS LOADER
   * ══════════════════════════════════════════════════ */
  let hlsLibReady = typeof Hls !== 'undefined';
  let hlsLoadPromise = null;

  function loadHlsLibrary(callback) {
    if (typeof Hls !== 'undefined') { hlsLibReady = true; callback(); return; }
    if (!hlsLoadPromise) {
      hlsLoadPromise = new Promise(function (resolve) {
        try {
          if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
            resolve(false); return;
          }
          extSend({ type: 'vm_load_hls' }, function (res) {
            if (!res || !res.ok) { resolve(false); return; }
            var tries = 0;
            var t = setInterval(function () {
              tries++;
              if (typeof Hls !== 'undefined') { clearInterval(t); hlsLibReady = true; resolve(true); }
              else if (tries > 40) { clearInterval(t); resolve(false); }
            }, 50);
          });
        } catch (e) { resolve(false); }
      });
    }
    hlsLoadPromise.then(function (ok) { if (ok && typeof Hls !== 'undefined') callback(); });
  }


  /* ══════════════════════════════════════════════════
   *  AUDIO BOOST (Web Audio API)
   * ══════════════════════════════════════════════════ */
  const audioBoostMap = new WeakMap();

  // Create the Web Audio boost graph LAZILY and SAFELY.
  // WARNING: createMediaElementSource() reroutes the element's audio through
  // Web Audio and outputs SILENCE for cross-origin media without CORS
  // (spec-mandated). That silently muted videos on many sites. So we only build
  // the graph when the user actually asks for >100% boost, and if it ends up
  // muting, we tear it down and fall back to element volume.
  const EQ_BANDS = [
    { f: 60, type: 'lowshelf', label: '60' },
    { f: 230, type: 'peaking', label: '230' },
    { f: 910, type: 'peaking', label: '910' },
    { f: 3600, type: 'peaking', label: '3.6k' },
    { f: 14000, type: 'highshelf', label: '14k' }
  ];

  function getOrCreateAudioBoost(videoElement) {
    if (audioBoostMap.has(videoElement)) {
      return audioBoostMap.get(videoElement);
    }
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      const audioCtx = new Ctx();
      const source = audioCtx.createMediaElementSource(videoElement);
      const filters = [];
      var prev = source;
      for (var bi = 0; bi < EQ_BANDS.length; bi++) {
        var bf = audioCtx.createBiquadFilter();
        bf.type = EQ_BANDS[bi].type;
        bf.frequency.value = EQ_BANDS[bi].f;
        bf.Q.value = 1.0;
        bf.gain.value = 0;
        prev.connect(bf);
        prev = bf;
        filters.push(bf);
      }
      const gainNode = audioCtx.createGain();
      prev.connect(gainNode);
      // Smart Audio: dynamics compressor to prevent distortion at high volume
      var compressor = audioCtx.createDynamicsCompressor();
      try {
        compressor.threshold.setValueAtTime(-24, audioCtx.currentTime);
        compressor.knee.setValueAtTime(30, audioCtx.currentTime);
        compressor.ratio.setValueAtTime(12, audioCtx.currentTime);
        compressor.attack.setValueAtTime(0.003, audioCtx.currentTime);
        compressor.release.setValueAtTime(0.25, audioCtx.currentTime);
      } catch(e) {}
      gainNode.connect(compressor);
      compressor.connect(audioCtx.destination);
      if (audioCtx.state === 'suspended') { try { audioCtx.resume(); } catch (e) {} }
      const boostData = {
        ctx: audioCtx, gain: gainNode, source: source, filters: filters,
        eqGains: EQ_BANDS.map(function () { return 0; }),
        level: 1, broken: false
      };
      audioBoostMap.set(videoElement, boostData);
      return boostData;
    } catch (e) {
      return null;
    }
  }

  function setEqBand(videoElement, index, db) {
    var boost = getOrCreateAudioBoost(videoElement);
    if (!boost || boost.broken || !boost.filters || !boost.filters[index]) return false;
    try {
      if (boost.ctx.state === 'suspended') boost.ctx.resume();
      var v = Math.max(-12, Math.min(12, db));
      boost.filters[index].gain.value = v;
      if (boost.eqGains) boost.eqGains[index] = v;
      return true;
    } catch (e) { return false; }
  }

  function resetEq(videoElement) {
    var boost = audioBoostMap.get(videoElement);
    if (!boost || !boost.filters) return;
    for (var i = 0; i < boost.filters.length; i++) {
      try { boost.filters[i].gain.value = 0; } catch (e) {}
      if (boost.eqGains) boost.eqGains[i] = 0;
    }
  }

  // Set volume in the SAFEST way: element volume for 0–100%, Web Audio gain only
  // for >100% boost. Returns true if boost graph is active.
  function setVideoVolume(videoElement, level, stateRef) {
    // Browser extensions CANNOT change OS/system volume — only the media element.
    // We map 0..1 to element.volume (system-like 0–100% of player audio) and
    // >1 to Web Audio gain boost so it *feels* like turning the phone up past 100%.
    level = clamp(level, 0, 6);
    try { videoElement.muted = false; } catch (e) {}
    if (level <= 1) {
      try { videoElement.volume = clamp(level, 0, 1); } catch (e) {}
      try { videoElement.muted = (level < 0.001); } catch (e) {}
      var existing = audioBoostMap.get(videoElement);
      if (existing && !existing.broken) {
        try { existing.gain.gain.value = 1; } catch (e) {}
      }
      return false;
    }
    // Boost path (>100%): max element volume + gain node
    try { videoElement.volume = 1; videoElement.muted = false; } catch (e) {}
    var boost = getOrCreateAudioBoost(videoElement);
    if (boost && !boost.broken) {
      try {
        if (boost.ctx && boost.ctx.state === 'suspended') boost.ctx.resume();
      } catch (e) {}
      try { boost.gain.gain.value = level; } catch (e) {}
      return true;
    }
    // Fallback if WebAudio unavailable: at least stay at 100%
    try { videoElement.volume = 1; } catch (e) {}
    return false;
  }


  // If `el` lives inside a shadow root, return the outermost shadow HOST element
  // (which lives in the light DOM), else null. Lets us anchor overlays in the
  // regular DOM even when the <video> is buried in a web-component's shadow tree
  // (e.g. Reddit's <shreddit-player>).
  function shadowHostOf(el) {
    var host = null, node = el;
    try {
      for (var i = 0; i < 8 && node; i++) {
        var root = node.getRootNode && node.getRootNode();
        if (root && root.host) { host = root.host; node = root.host; }
        else break;
      }
    } catch (e) {}
    return host;
  }

  /* ═══════════════════════════════════════════════════════════════
   *  UNIVERSAL SMART CONTAINER DETECTOR
   *  Finds the true player wrapper on ANY website with zero site-specific
   *  knowledge. Strategy:
   *   1) Climb ancestors looking for a "player-like" element (class/id/attribute
   *      contains player|video|media|jw|plyr|vjs|shaka|artplayer + it wraps the
   *      video and is roughly the video's size).
   *   2) If none, pick the smallest ancestor whose box closely matches the
   *      video's rendered box (so overlay/controls cover the whole player, not a
   *      tiny wrapper or the whole page).
   *  Returns an element or null (caller keeps its fallback).
   * ═══════════════════════════════════════════════════════════════ */
  function smartFindContainer(video) {
    try {
      var vr = video.getBoundingClientRect();
      var vArea = (vr.width || 0) * (vr.height || 0);
      if (vArea < 400) return null;                 // video too small/not laid out yet
      var PLAYER_RE = /(player|video-?player|media-?player|videowrapper|video-?container|jwplayer|plyr|vjs|video-js|shaka|artplayer|dplayer|xgplayer|flowplayer|clappr)/i;
      var node = video.parentElement, hops = 0;
      var byHint = null, bySize = null, bySizeArea = Infinity;
      var vw = window.innerWidth || 1920, vh = window.innerHeight || 1080, pageArea = vw * vh;
      while (node && node !== document.body && node !== document.documentElement && hops < 8) {
        var r = node.getBoundingClientRect();
        var a = (r.width || 0) * (r.height || 0);
        var wrapsVideo = a >= vArea * 0.85 && a <= pageArea * 1.05;
        // 1) player-like identity?
        if (!byHint && wrapsVideo) {
          var idc = ((node.className && typeof node.className === 'string' ? node.className : '') + ' ' +
                     (node.id || '') + ' ' + (node.getAttribute && (node.getAttribute('data-testid') || '') || ''));
          if (PLAYER_RE.test(idc)) byHint = node;
        }
        // 2) smallest ancestor that closely matches the video's box.
        if (wrapsVideo && a <= vArea * 2.2 && a < bySizeArea) { bySize = node; bySizeArea = a; }
        node = node.parentElement; hops++;
      }
      return byHint || bySize || null;
    } catch (e) { return null; }
  }

  /* ═══════════════════════════════════════════════════════════════
   *  ATTACH PLAYER — Core function, called once per video element
   * ═══════════════════════════════════════════════════════════════ */
  function attachPlayer(video) {
    // Declared FIRST (before any function that reads it, e.g. syncFloatingHost /
    // startFloatSync which are called during setup): `let` is NOT hoisted, so a
    // later declaration left this in the Temporal Dead Zone → startFloatSync
    // threw a swallowed ReferenceError and the float-sync loop never ran (the
    // "button never appears" bug on mobile YT/Twitch).
    let isDestroyed = false;
    let _selfRepairTimer = null;   // self-repair health-check interval
    // Guards
    if (processedVideos.has(video)) return;
    if (dismissedVideos.has(video)) return;   // user pressed ✕ — stay gone
    if (!video.isConnected) return;
    if (video.clientWidth < 60 && video.clientHeight < 60 && !video.videoWidth) {
      vmxDebug('attach', 'SKIP tiny cw=' + video.clientWidth + ' ch=' + video.clientHeight + ' vw=' + video.videoWidth);
      return;
    }

    // SINGLE-PLAYER SITES: YouTube/Twitch/Facebook have exactly ONE real player,
    // but they also spawn tiny/hidden preview <video>s (sidebar hovers, ad
    // pre-buffers). Attaching to those creates duplicate overlays that fight the
    // main one (the "NO BOX / destroy / wrong aspect" mess). So on these sites we
    // keep only ONE live instance — the largest player — and skip the rest.
    var _singlePlayerSite = IS_YOUTUBE || IS_TWITCH || IS_FACEBOOK || IS_KICK;
    if (_singlePlayerSite) {
      // Must live inside the real player chrome (not a bare grid-thumbnail video).
      var _inRealPlayer = video.closest(
        '.html5-video-player, #movie_player, ytd-player, ytm-player, ' +      // YouTube
        '[class*="video-player"], [class*="playerContainerMWeb"], [data-a-target="video-player"], ' + // Twitch
        '[data-pagelet="VideoPlayer"], [data-video-id]'                       // Facebook
      );
      var _bigEnough = (video.clientWidth >= 240 && video.clientHeight >= 135) || video.videoWidth >= 320;
      if (!_inRealPlayer && !_bigEnough) {
        vmxDebug('attach', 'SKIP preview cw=' + video.clientWidth + ' ch=' + video.clientHeight);
        return;
      }
      // If we already have a live instance on this site, don't add a second.
      if (typeof _vmxLiveInstances !== 'undefined' && _vmxLiveInstances > 0) {
        vmxDebug('attach', 'SKIP dup (already have main player)');
        return;
      }
    }

    processedVideos.add(video);
    totalVideoCount++;
    if (_singlePlayerSite) _vmxLiveInstances++;
    vmxDebug('attach', 'OK #' + totalVideoCount + ' cw=' + video.clientWidth + ' ch=' + video.clientHeight);

    // ─── Snapshot the ORIGINAL video state so the ✕ button can fully restore
    //     the native player (undo every style/property the extension touches). ───
    var _vmOrig = {
      styleAttr: video.getAttribute('style'),        // exact inline style string (or null)
      playbackRate: video.playbackRate,
      volume: video.volume,
      muted: video.muted,
      loop: video.loop,
      transform: video.style ? (video.style.getPropertyValue('transform') || '') : '',
      transformOrigin: video.style ? (video.style.getPropertyValue('transform-origin') || '') : ''
    };

    // Notify background script
    try {
      extSend({ type: 'vm_video_detected', count: totalVideoCount });
    } catch (e) { /* ignore */ }

    /* ─── Find the best container element ─── */
    let container = video.parentElement;

    // FAST PATH: if we've successfully handled this exact site before, reuse the
    // learned container selector immediately (instant, no re-discovery). Verified
    // to still wrap the current video; falls through to detection if the site
    // changed (self-healing).
    var _profileContainer = null;
    try {
      if (SiteProfiles.isTrusted()) {
        var pc = SiteProfiles.cachedContainer();
        if (pc && pc.contains && pc.contains(video) && pc !== document.body) {
          _profileContainer = pc;
        }
      }
    } catch (e) {}

    if (IS_YOUTUBE) {
      if (IS_MOBILE) {
        // MOBILE (m.youtube): attach to .html5-video-container (data-layer=0,
        // already position:relative) so we DON'T force position on #movie_player
        // — doing that changes the containing block of the negatively-positioned
        // <video> and black-screens it. (Floating host is used here anyway.)
        container = video.closest('.html5-video-container')
          || video.closest('.html5-video-player')
          || document.getElementById('movie_player')
          || video.parentElement
          || container;
      } else {
        // DESKTOP: attach to #movie_player (the OUTER player box). Its children
        // are layered: .html5-video-container (data-layer=0, the VIDEO) sits at
        // the BOTTOM, and YouTube's controls (.ytp-chrome-*) are layers ABOVE it.
        // So injecting into html5-video-container paints our button UNDER the
        // controls → invisible (the v13 desktop regression). #movie_player is
        // above all layers, which is what v10–12 used and why it worked.
        container = document.getElementById('movie_player')
          || video.closest('.html5-video-player')
          || video.closest('#movie_player, #player-container-id, .player-container, #player')
          || video.parentElement
          || container;
      }
      // (overflow is managed by applyAspectRatio: visible in default mode,
      //  hidden for AR modes so zoom/fill don't spill across the page)
    } else if (IS_NETFLIX) {
      container = video.closest('.VideoContainer, .nfp-container, .watch-video, .watch-video--player-view') || container;
    } else if (IS_DRM_SITE) {
      // Disney+/Prime/Max/Hulu/Apple TV+/Crunchyroll/Shahid/OSN+… — enhancement
      // (aspect/zoom/speed/filters) still works on the EME <video>; only download
      // is blocked. Find the player box for correct button placement, else fall
      // back to the nearest positioned ancestor.
      container = video.closest(
        '[class*="player" i], [class*="Player" i], [id*="player" i], ' +
        '[data-testid*="player" i], [class*="video" i], [class*="Video" i], ' +
        '.btm-media-client-element, .dv-player-fullscreen, .webPlayerContainer, ' +
        '.atvwebplayersdk-overlays-container, #shahid-player, .video-js'
      ) || video.parentElement || container;
    } else if (IS_TWITCH) {
      // Desktop selectors + mobile (m.twitch.tv) wrappers. Mobile Twitch has NO
      // .video-player__container — the video sits in .video-ref--* inside
      // .playerContainerMWeb--* / .video-player__default-player, so the old
      // selector matched nothing and the button never appeared.
      container = video.closest('.video-player__container, .video-player__overlay, [data-a-target="video-player"], .persistent-player')
        || video.closest('[class*="playerContainerMWeb"], [class*="video-player__default-player"], [class*="video-player"], [class*="player-container"]')
        || video.closest('[class*="video-ref"], [class*="player-wrapper"]')
        || video.closest('[class*="persistent-player"], [class*="channel-root"]')
        || video.parentElement
        || container;
    } else if (IS_FACEBOOK) {
      // Desktop + mobile (m.facebook.com). Mobile lacks data-pagelet; fall back
      // to the nearest positioned wrapper around the <video>.
      container = video.closest('[data-pagelet="VideoPlayer"], [data-video-id], [data-sigil*="inlineVideo"], div[class][style*="aspect"]')
        || video.parentElement
        || container;
    } else if (IS_VIMEO) {
      container = video.closest('.player_container, .player-container') || container;
    } else if (IS_TWITTER) {
      container = video.closest('[data-testid="videoComponent"], [data-testid="videoPlayer"]') || container;
    } else if (IS_REDDIT) {
      // Reddit's <shreddit-player> puts the <video> inside a SHADOW ROOT.
      // closest() can't escape the shadow boundary, so first try the shadow
      // HOST (light-DOM element) and use a floating overlay over it; only then
      // fall back to in-shadow ancestors.
      var _rh = shadowHostOf(video);
      container = (_rh && _rh.closest && (_rh.closest('shreddit-player, [slot="post-media-container"], [data-testid="post-container"]') || _rh))
        || video.closest('shreddit-player, shreddit-player-2, [data-testid="shreddit-player"], .reddit-video-player-root, [class*="media"]')
        || (_rh || video.parentElement)
        || container;
    } else if (IS_TIKTOK) {
      container = video.closest('[class*="DivVideoWrapper"], [class*="DivContainer"], [class*="video-card"], [data-e2e="video-player"], [class*="xgplayer"]')
        || video.parentElement || container;
    } else if (IS_INSTAGRAM) {
      container = video.closest('article, [role="presentation"], [class*="x5yr21d"]') || video.parentElement || container;
    } else if (IS_DAILYMOTION) {
      container = video.closest('[class*="player"], .dmp_Player, #player, [data-testid="player"]') || video.parentElement || container;
    } else if (IS_OKRU) {
      container = video.closest('[class*="vid-card_cnt"], [class*="video-card"], [data-module*="Video"], .vp_video_wrapper, #movie_box, [class*="player"], ' +
        '[class*="VideoPlayer"], [id*="player"], video-player, [class*="media-layer"], [class*="media-text"]')
        || video.parentElement || container;
    } else if (IS_BILIBILI) {
      container = video.closest('#bilibili-player, .bpx-player-container, [class*="player-container"], .player-wrap')
        || video.parentElement || container;
    } else if (IS_RUMBLE) {
      container = video.closest('.rumbles-vplayer, [class*="videoPlayer"], .media-container, rumble-player')
        || video.parentElement || container;
    } else if (IS_ODYSEE) {
      container = video.closest('.vjs-tech, .video-js, [class*="fileRenderVideo"], .content__viewer')
        || video.parentElement || container;
    } else if (IS_KICK) {
      container = video.closest('[class*="video-player"], [class*="player-container"], #video-player, .aspect-video, [class*="stream-player"]')
        || video.parentElement || container;
    } else if (IS_VK) {
      container = video.closest('.videoplayer_media, .VideoPage__video, [class*="VideoPlayer"], .vkuiInternalVideo, #video_player')
        || video.parentElement || container;
    } else if (IS_STREAMABLE) {
      container = video.closest('#player, .player, .video-container, .media-container')
        || video.parentElement || container;
    } else {
      // ─── UNIVERSAL SMART CONTAINER DETECTOR (works on ANY site) ───
      // No site-specific rule matched → intelligently find the real player box.
      // 1) Try common player-wrapper hints by class/id/attribute.
      // 2) Otherwise score ancestors and pick the smallest one that fully wraps
      //    the video AND looks like a player (its box ≈ video's box).
      var _smart = smartFindContainer(video);
      if (_smart) container = _smart;
    }

    // Prefer the learned container from a trusted site profile (instant path).
    if (_profileContainer) container = _profileContainer;

    // HostBrain multi-level fallback if container is still weak/generic
    try {
      var _hb = HostBrain.resolveContainer(video);
      if (_hb && _hb.el) {
        var weak = !container || container === video.parentElement || container === document.body;
        if (weak || (_profileContainer && !_profileContainer.contains(video))) {
          container = _hb.el;
        }
        try { SiteProfiles.setEngine(_hb.strategy); } catch (e) {}
      }
      HostBrain.syncFingerprint();
    } catch (e) {}

    // Fallback — never use document.body as container
    if (!container || container === document.body || container === document.documentElement) {
      container = video.parentElement;
    }

    // SMART CONTAINER SIZING (generic/embed players e.g. animeav1 Mega/MP4Upload):
    // If the chosen container is much smaller than the video's own box (common
    // before playback starts, or when the parent is a zero-size wrapper), walk up
    // to the nearest ancestor that actually matches the video's rendered size, so
    // our overlay/controls cover the whole player instead of a tiny corner.
    // NOTE: compute the managed-layout flag INLINE here — the `USES_MANAGED_LAYOUT`
    // const is declared later in this function, so referencing it now would throw
    // a Temporal-Dead-Zone ReferenceError and kill attachPlayer on every site.
    var _isManaged = IS_YOUTUBE || IS_NETFLIX || IS_TWITCH || IS_FACEBOOK || IS_VIMEO ||
                     IS_TWITTER || IS_REDDIT || IS_TIKTOK || IS_INSTAGRAM || IS_DAILYMOTION || IS_DRM_SITE;
    if (!_isManaged) {
      try {
        var vr0 = video.getBoundingClientRect();
        var cr0 = container.getBoundingClientRect ? container.getBoundingClientRect() : { width: 0, height: 0 };
        var vArea = (vr0.width || 0) * (vr0.height || 0);
        var cArea = (cr0.width || 0) * (cr0.height || 0);
        // Container is missing/■tiny relative to the video → climb to a better box.
        if (vArea > 0 && (cArea < vArea * 0.6)) {
          var node = video.parentElement, best = container, bestArea = cArea, hops = 0;
          while (node && node !== document.body && hops < 6) {
            var r = node.getBoundingClientRect();
            var a = (r.width || 0) * (r.height || 0);
            // Prefer the smallest ancestor that comfortably contains the video.
            if (a >= vArea * 0.9 && (bestArea < vArea * 0.9 || a < bestArea)) { best = node; bestArea = a; }
            node = node.parentElement; hops++;
          }
          container = best || container;
        }
      } catch (e) {}
    }

    // Ensure container has positioning context.
    // CRITICAL for YouTube (esp. m.youtube): the <video> is absolutely
    // positioned with a NEGATIVE top relative to .html5-video-container. If we
    // change the `position` of that container (or any ancestor between it and the
    // video) we alter the video's containing block and it jumps off-screen →
    // BLACK SCREEN (audio keeps playing). The YT container is already relative,
    // so only force position when it's genuinely static AND not a YouTube box.
    // Will this instance use the top-level FLOATING host? (mobile YT/Twitch/FB)
    // If so, our overlay is position:fixed on <html> and does NOT live inside
    // the player, so we must NOT touch the container's position at all.
    var _wfShadow = false;
    try { _wfShadow = !!(video.getRootNode && video.getRootNode() instanceof ShadowRoot); } catch (e) {}
    const _willFloat = (IS_MOBILE && (IS_YOUTUBE || IS_TWITCH || IS_FACEBOOK || IS_KICK || IS_VK)) || _wfShadow;
    const containerStyle = getComputedStyle(container);
    if (containerStyle.position === 'static') {
      if (IS_YOUTUBE || _willFloat) {
        // Never mutate a managed/floating player box. Forcing position:relative
        // on it changes the containing block of the site's absolutely-positioned
        // <video> → the frame shifts (video slides to the bottom with a black
        // band on top on mobile Twitch; black screen on mobile YouTube). The
        // floating host doesn't need the container restyled anyway.
      } else {
        container.style.setProperty('position', 'relative', 'important');
      }
    }

    /* ─── Create Shadow DOM host ─── */
    // FLOATING-HOST MODE (mobile YouTube / Twitch and other managed players):
    // Injecting our overlay INSIDE the site's player subtree fails on these
    // sites — their own gesture/stacking layers sit above ours (our button turns
    // "transparent" and taps fall through to the site) and their mobile layout
    // collapses the <video> to a black screen when we add children. The proven
    // fix (Enhancer-for-YouTube / Ultrawidify / VSC) is a TOP-LEVEL overlay
    // appended to <html>, position-synced to the video via getBoundingClientRect
    // on every animation frame. We never touch the player, so no black screen,
    // and being the last child of <html> at max z-index makes the button always
    // land taps. Desktop (which already works in-container) is left unchanged.
    const IS_MOBILE_YT = IS_YOUTUBE && IS_MOBILE;
    // A <video> inside a SHADOW ROOT (e.g. Reddit's <shreddit-player>) can't be
    // overlaid reliably in-container (our host would land inside the shadow tree
    // or misalign). The floating host (position:fixed on <html>, synced to the
    // video's viewport rect) works across shadow boundaries — so use it there.
    var _videoInShadow = false;
    try { _videoInShadow = !!(video.getRootNode && video.getRootNode() instanceof ShadowRoot); } catch (e) {}
    const useFloatingHost = (IS_MOBILE && (IS_YOUTUBE || IS_TWITCH || IS_FACEBOOK || IS_KICK || IS_VK)) || _videoInShadow || (HostBrain.shouldUseFloating() === true && IS_MOBILE);
    let floatSyncRAF = null;
    let floatSyncActive = false;
    let lastFloatRect = null;

    const hostElement = document.createElement('div');
    const shadowRoot = hostElement.attachShadow({ mode: 'closed' });

    // Position-sync loop for the floating host. Only writes to the DOM when the
    // player box actually MOVED (>1px) → no needless reflow / battery drain.
    // The host is NEVER fully hidden while the player exists (so the entry
    // button stays reachable); it's only re-anchored when the player briefly
    // reports a zero rect during SPA navigations.
    var _syncTick = 0;
    function syncFloatingHost() {
      if (isDestroyed) { floatSyncActive = false; vmxDebug('sync', 'STOPPED (destroyed)'); return; }
      // PERF: when the tab is hidden, stop the per-frame work but keep the loop
      // alive at a slow tick so we resume instantly when the tab is shown again.
      if (document.hidden) {
        if (floatSyncActive) floatSyncRAF = setTimeout(syncFloatingHost, 500);
        return;
      }
      try {
        if ((++_syncTick % 30) === 1) vmxDebug('beat', 'sync running t=' + _syncTick);
        // Anchor to the ACTUAL <video> rect whenever it is on-screen and sanely
        // sized — that is where the picture really is. Only fall back to the
        // container box when the video's own rect is unusable (0-size, or the
        // mobile-YouTube case where the <video> sits at a negative top outside
        // the viewport). Previously we always preferred the container, but on
        // Twitch the container (ScAspectRatio) is bigger/offset from the video,
        // so the overlay covered half the page and the button was mis-placed.
        var vr  = video.getBoundingClientRect();
        var box = (container && container.getBoundingClientRect) ? container.getBoundingClientRect() : null;
        var videoUsable = vr && vr.width >= 40 && vr.height >= 40 &&
                          vr.bottom > 0 && vr.right > 0 &&
                          vr.top < (window.innerHeight || 9999) &&
                          vr.left < (window.innerWidth || 9999);
        var r = videoUsable ? vr : ((box && box.width > 20 && box.height > 20) ? box : vr);
        if (r && r.width >= 20 && r.height >= 20) {
          var changed = !lastFloatRect ||
            Math.abs(lastFloatRect.top - r.top) > 1 ||
            Math.abs(lastFloatRect.left - r.left) > 1 ||
            Math.abs(lastFloatRect.width - r.width) > 1 ||
            Math.abs(lastFloatRect.height - r.height) > 1;
          if (changed) {
            if (hostElement.style.display === 'none') hostElement.style.display = 'block';
            hostElement.style.top    = r.top + 'px';
            hostElement.style.left   = r.left + 'px';
            hostElement.style.width  = r.width + 'px';
            hostElement.style.height = r.height + 'px';
            lastFloatRect = { top: r.top, left: r.left, width: r.width, height: r.height };
            vmxDebug('sync', (videoUsable ? 'VID ' : 'BOX ') + Math.round(r.left) + ',' + Math.round(r.top) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
          }
        } else {
          vmxDebug('sync', 'NO BOX (fallback corner)');
          // FALLBACK (base44 idea): the player box isn't measurable yet (0×0 or
          // detached). Instead of leaving the button invisible, park a small
          // reachable host in the top-left corner so the user can still open the
          // HUD. It snaps onto the player as soon as the box has real size.
          if (hostElement.style.display === 'none') hostElement.style.display = 'block';
          hostElement.style.top    = '8px';
          hostElement.style.left   = '8px';
          hostElement.style.width  = '160px';
          hostElement.style.height = '48px';
          lastFloatRect = null;
        }
      } catch (e) {}
      if (floatSyncActive) floatSyncRAF = requestAnimationFrame(syncFloatingHost);
    }

    function startFloatSync() {
      if (isDestroyed || !useFloatingHost) return;
      if (floatSyncRAF) cancelAnimationFrame(floatSyncRAF);
      floatSyncActive = true;
      floatSyncRAF = requestAnimationFrame(syncFloatingHost);
    }

    function stopFloatSync() {
      floatSyncActive = false;
      // floatSyncRAF can be a RAF id OR a setTimeout id (hidden-tab path) — clear both.
      if (floatSyncRAF) { try { cancelAnimationFrame(floatSyncRAF); } catch (e) {} try { clearTimeout(floatSyncRAF); } catch (e) {} floatSyncRAF = null; }
    }

    vmxDebug('host', useFloatingHost ? ('FLOATING container=' + (container && container.className || container && container.id || container && container.tagName)) : ('in-container ' + (container && (container.className || container.id || container.tagName)) + ' pos=' + getComputedStyle(container).position));
    if (useFloatingHost) {
      // Start VISIBLE (display:block) so the button is reachable immediately —
      // the first sync frame anchors it over the player.
      hostElement.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;pointer-events:none;z-index:2147483647;display:block;';
      (document.documentElement || document.body).appendChild(hostElement);
      startFloatSync();
      // Cheap extra re-anchors on scroll / resize / orientation change.
      var _throttledFloatSync = throttle(function () { lastFloatRect = null; startFloatSync(); }, 120);
      window.addEventListener('scroll', _throttledFloatSync, { passive: true });
      window.addEventListener('resize', _throttledFloatSync, { passive: true });
      try { if (screen.orientation) screen.orientation.addEventListener('change', _throttledFloatSync); } catch (e) {}
    } else {
      // In-container host (desktop + non-managed sites). pointer-events:none so
      // the site keeps working; only our buttons/HUD capture taps.
      hostElement.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:2147483647;';
      container.appendChild(hostElement);
    }

    // Inject styles
    const styleSheet = document.createElement('style');
    styleSheet.textContent = PLAYER_CSS;
    shadowRoot.appendChild(styleSheet);

    // Subtitle file input (hidden, lives in main DOM)
    const subtitleFileInput = document.createElement('input');
    subtitleFileInput.type = 'file';
    subtitleFileInput.accept = '.srt,.vtt,.ass,.ssa,.vtt.txt';
    subtitleFileInput.style.cssText = 'position:absolute;left:-9999px;opacity:0;pointer-events:none';
    document.body.appendChild(subtitleFileInput);

    /* ═══════════════════════════════════════════════════
     *  BUILD THE PLAYER UI
     * ═══════════════════════════════════════════════════ */
    const overlay = createElement('div', 'vm-overlay');

    // Brightness layers (system-feel): dim = black overlay, boost = white screen-blend
    // Never CSS-filter the <video> on managed players (YT/Twitch black-screen class).
    const brightnessOverlay = createElement('div', 'vm-brightness-overlay');
    const brightnessBoost = createElement('div', 'vm-brightness-boost');
    overlay.appendChild(brightnessOverlay);
    overlay.appendChild(brightnessBoost);

    // Subtitle display
    const subtitleContainer = createElement('div', 'vm-subtitle-display vm-hidden');
    const subtitleText = document.createElement('span');
    subtitleContainer.appendChild(subtitleText);
    overlay.appendChild(subtitleContainer);

    // Entry button wrapper
    const entryWrapper = createElement('div', 'vm-entry-wrap');
    entryWrapper.style.cssText = 'position:absolute;top:12px;right:12px;display:flex;align-items:center;pointer-events:auto;z-index:10';

    const entryButton = document.createElement('button');
    entryButton.className = 'vm-entry-btn';
    const entryLogo = getIcon('logo');
    entryLogo.style.cssText = 'width:14px;height:14px';
    entryButton.appendChild(entryLogo);
    entryButton.appendChild(document.createTextNode(' VideoMax'));

    const dismissButton = document.createElement('button');
    dismissButton.className = 'vm-dismiss-btn';
    dismissButton.textContent = '✕';

    // Reset (↻) — restores the native player to its ORIGINAL state (undo every
    // change the extension made) but KEEPS the extension active and the VideoMax
    // button visible, so you can start over. (✕ = exit completely.)
    const resetButton = document.createElement('button');
    resetButton.className = 'vm-reset-btn';
    resetButton.textContent = '↻';
    resetButton.title = 'Reset to original (keep VideoMax)';

    entryWrapper.appendChild(entryButton);
    entryWrapper.appendChild(dismissButton);
    entryWrapper.appendChild(resetButton);
    // v21 launcher.js renders the only windowed controls below the video.
    // Keep this legacy pill in the DOM for internal compatibility, but never
    // expose it in normal windowed mode.
    if (USE_EXTERNAL_LAUNCHER) entryWrapper.style.display = 'none';
    overlay.appendChild(entryWrapper);

    /* ─── HUD ─── */
    const hud = createElement('div', 'vm-hud');

    // Top bar
    const topBar = createElement('div', 'vm-top-bar');
    const logoText = createElement('div', 'vm-logo-text');
    const logoIcon = getIcon('logo');
    logoIcon.style.cssText = 'width:15px;height:15px;color:var(--vm-red)';
    logoText.appendChild(logoIcon);
    logoText.appendChild(document.createTextNode(' VideoMax'));

    const videoTitle = createElement('div', 'vm-video-title');
    const topActions = createElement('div', 'vm-top-actions');

    // Top action buttons
    const arButton = createPillButton('vm-control-btn vm-pill-btn', 'Aspect Ratio (A)', 'Default');
    const rotateButton = createPillButton('vm-control-btn vm-pill-btn', IS_MOBILE ? 'Rotate' : 'Rotate (R)', '↻ 0°');
    const zoomInButton = createButton('vm-control-btn', 'Zoom In (+)', 'zoomIn');
    const zoomOutButton = createButton('vm-control-btn', 'Zoom Out (−)', 'zoomOut');
    const mirrorButton = createButton('vm-control-btn', 'Mirror (H)', 'mirror');
    const pipButtonTop = createButton('vm-control-btn', 'PiP (P)', 'pip');
    const moreButton = createButton('vm-control-btn', 'More Options', 'more');
    const closeButton = createButton('vm-control-btn', 'Close (Esc)', 'close');

    // Netflix top chrome: title left, AR/Rotate + close right.
    // Zoom / Mirror / PiP / More live in the bottom bar or ⋮ menu (uncluttered).
    zoomInButton.classList.add('vm-hide-chrome');   // kept for keyboard/handlers
    zoomOutButton.classList.add('vm-hide-chrome');
    mirrorButton.classList.add('vm-hide-chrome');
    pipButtonTop.classList.add('vm-hide-chrome');
    moreButton.classList.add('vm-hide-chrome'); // more is on bottom row (Netflix-like)
    [arButton, rotateButton, closeButton].forEach(function(btn) { topActions.appendChild(btn); });
    // Keep hidden buttons in DOM (outside topActions) so existing listeners still work
    ;[zoomInButton, zoomOutButton, mirrorButton, pipButtonTop, moreButton].forEach(function (btn) {
      btn.style.display = 'none';
      topBar.appendChild(btn);
    });
    [logoText, videoTitle, topActions].forEach(el => topBar.appendChild(el));
    hud.appendChild(topBar);

    // Touch zones
    const touchZones = createElement('div', 'vm-touch-zones');
    const zoneLeft = createElement('div', 'vm-touch-zone');
    const zoneCenter = createElement('div', 'vm-touch-zone');
    const zoneRight = createElement('div', 'vm-touch-zone');
    const dtIndicatorLeft = createElement('div', 'vm-doubletap-indicator vm-left-side');
    const dtIndicatorRight = createElement('div', 'vm-doubletap-indicator vm-right-side');
    const dtTextLeft = createElement('div', 'vm-dt-text', '⏪ 10s');
    const dtTextRight = createElement('div', 'vm-dt-text', '⏩ 10s');
    dtIndicatorLeft.appendChild(dtTextLeft);
    dtIndicatorRight.appendChild(dtTextRight);
    [zoneLeft, zoneCenter, zoneRight, dtIndicatorLeft, dtIndicatorRight]
      .forEach(el => touchZones.appendChild(el));
    hud.appendChild(touchZones);

    // Toast
    const toastElement = createElement('div', 'vm-toast');
    hud.appendChild(toastElement);

    // Hold speed badge
    const holdBadge = createElement('div', 'vm-hold-badge');
    const holdSpeedText = document.createTextNode('');
    const holdSubText = document.createElement('small');
    holdBadge.appendChild(holdSpeedText);
    holdBadge.appendChild(holdSubText);
    hud.appendChild(holdBadge);

    // Info badges
    const badgeAR = createElement('div', 'vm-info-badge vm-badge-ar');
    const badgeRot = createElement('div', 'vm-info-badge vm-badge-rot');
    const badgeZoom = createElement('div', 'vm-info-badge vm-badge-zoom');
    [badgeAR, badgeRot, badgeZoom].forEach(b => hud.appendChild(b));

    // Side bars for brightness / volume gestures
    function createSideBar(sideClass, iconChar) {
      const bar = createElement('div', 'vm-side-bar ' + sideClass);
      const iconEl = createElement('div', 'vm-side-bar-icon', iconChar);
      const fill = createElement('div', 'vm-side-bar-fill');
      const value = createElement('div', 'vm-side-bar-value');
      bar.appendChild(iconEl);
      bar.appendChild(fill);
      bar.appendChild(value);
      return { bar, fill, value };
    }
    const sideBarLeft = createSideBar('vm-left', '☀️');
    const sideBarRight = createSideBar('vm-right', '🔊');
    hud.appendChild(sideBarLeft.bar);
    hud.appendChild(sideBarRight.bar);
    // Center gesture readout (MX Player / VLC style)
    const gestureCenter = createElement('div', 'vm-gesture-center');
    const gestureCenterIcon = createElement('div', 'vm-gc-icon', '☀️');
    const gestureCenterVal = createElement('div', 'vm-gc-val', '50%');
    const gestureCenterBar = createElement('div', 'vm-gc-bar');
    const gestureCenterFill = createElement('div', 'vm-gc-fill');
    gestureCenterBar.appendChild(gestureCenterFill);
    gestureCenter.appendChild(gestureCenterIcon);
    gestureCenter.appendChild(gestureCenterVal);
    gestureCenter.appendChild(gestureCenterBar);
    hud.appendChild(gestureCenter);
    var gestureCenterTimer = null;
    function showGestureCenter(icon, label, ratio01) {
      gestureCenterIcon.textContent = icon;
      gestureCenterVal.textContent = label;
      gestureCenterFill.style.width = (clamp(ratio01, 0, 1) * 100) + '%';
      gestureCenter.classList.add('vm-visible');
      clearTimeout(gestureCenterTimer);
      // keep visible while swiping; caller may refresh often
      gestureCenterTimer = setTimeout(function () {
        gestureCenter.classList.remove('vm-visible');
      }, 900);
    }
    function hideGestureCenterSoon() {
      clearTimeout(gestureCenterTimer);
      gestureCenterTimer = setTimeout(function () {
        gestureCenter.classList.remove('vm-visible');
      }, 450);
    }

    // Scrub overlay
    const scrubOverlay = createElement('div', 'vm-scrub-overlay');
    const scrubInner = createElement('div', 'vm-scrub-inner');
    const scrubTime = createElement('div', 'vm-scrub-time', '0:00');
    const scrubDelta = createElement('div', 'vm-scrub-delta', '+0s');
    const scrubBarEl = createElement('div', 'vm-scrub-bar');
    const scrubFill = createElement('div', 'vm-scrub-fill');
    scrubFill.style.width = '0%';
    scrubBarEl.appendChild(scrubFill);
    [scrubTime, scrubDelta, scrubBarEl].forEach(el => scrubInner.appendChild(el));
    scrubOverlay.appendChild(scrubInner);
    hud.appendChild(scrubOverlay);

    // PiP badge, skip ad, AB badge
    const pipBadge = createElement('div', 'vm-pip-badge', '📺 PiP');
    const skipAdButton = document.createElement('button');
    skipAdButton.className = 'vm-skip-ad-btn';
    skipAdButton.textContent = '⏭ Skip Ad';
    const abLoopBadge = createElement('div', 'vm-ab-badge', '🔁 A-B Loop');
    hud.appendChild(pipBadge);
    hud.appendChild(skipAdButton);
    hud.appendChild(abLoopBadge);

    // Keyboard hint (desktop only)
    let keyboardHint = null;
    if (!IS_MOBILE) {
      keyboardHint = createElement('div', 'vm-keyboard-hint',
        'Space Play · ←→ ±10s · ↑↓ Vol · F Fullscreen · S Speed · C Subs · A Aspect · ` Hold 2×');
      hud.appendChild(keyboardHint);
    }

    /* ─── Context Menu ─── */
    const contextMenu = createElement('div', 'vm-panel');
    function addMenuLabel(text) {
      const lbl = createElement('div', 'vm-panel-label', text);
      contextMenu.appendChild(lbl);
    }
    function addMenuSeparator() {
      contextMenu.appendChild(createElement('div', 'vm-panel-separator'));
    }

    // Quick actions FIRST: Play/Pause then Fullscreen (fast access on all sites)
    const menuPlayPause = createPanelItem('play', 'Play / Pause');
    const menuFullscreenTop = createPanelItem('fsE', 'Fullscreen');
    [menuPlayPause, menuFullscreenTop].forEach(item => contextMenu.appendChild(item));
    addMenuSeparator();

    addMenuLabel('Playback');
    const menuScreenshot = createPanelItem('camera', 'Screenshot (T)');
    const menuCopyUrl = createPanelItem('upload', 'Copy Video URL');
    const menuLoop = createPanelItem('loop', 'Loop (L)');
    const menuABLoop = createPanelItem('abloop', 'A-B Loop (B)');
    const menuQuality = createPanelItem('quality', 'Quality', true);
    const menuSubtitles = createPanelItem('subtitles', 'Subtitles', true);
    [menuScreenshot, menuCopyUrl, menuLoop, menuABLoop, menuQuality, menuSubtitles]
      .forEach(item => contextMenu.appendChild(item));

    addMenuSeparator();
    addMenuLabel('Enhance');
    const menuFilters = createPanelItem('filter', 'Video filters (picture)', true);
    const menuAudioBoost = createPanelItem('boost', 'Audio equalizer');
    const menuStats = createPanelItem('stats', 'Video Stats');
    [menuFilters, menuAudioBoost, menuStats].forEach(item => contextMenu.appendChild(item));

    addMenuSeparator();
    addMenuLabel('Video');
    const menuInfo = createPanelItem('info', 'Video Info');
    const menuReset = createPanelItem('reset', 'Reset All');
    var menuRotateMenu = createPanelItem('rot', 'Rotate');
    var menuMirrorMenu = createPanelItem('mirror', 'Mirror');
    var menuDiag = createPanelItem('info', 'Export diagnostics (.txt)');
    [menuRotateMenu, menuMirrorMenu, menuInfo, menuReset, menuDiag].forEach(item => contextMenu.appendChild(item));

    // MX-Player / Arc-style icon grid: one flat, uncluttered grid instead of
    // grouped list rows. Group labels/separators stay in the DOM (harmless,
    // hidden via CSS) so nothing else in the file needs to change.
    contextMenu.classList.add('vm-panel-grid');

    function updateDrmUi() {
      // No download button to hide
    }
    function _vmDrmListener() {
      try { closeAllPanels(); } catch (e) {}
      showToast('🔒 DRM detected', 3500);
    }
    vmxDrmListeners.push(_vmDrmListener);
    updateDrmUi();

    // Dim backdrop behind mobile sheets (3-dots menu)
    const panelBackdrop = document.createElement('button');
    panelBackdrop.type = 'button';
    panelBackdrop.className = 'vm-panel-backdrop';
    panelBackdrop.setAttribute('aria-label', 'Close menu');
    panelBackdrop.addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation(); closeAllPanels();
    });
    hud.appendChild(panelBackdrop);
    hud.appendChild(contextMenu);

    /* Quality panel */
    const qualityPanel = createElement('div', 'vm-panel vm-sub-panel');
    const qualityLabel = createElement('div', 'vm-panel-label', 'Video Quality');
    qualityPanel.appendChild(qualityLabel);
    const qualityList = createElement('div');
    qualityPanel.appendChild(qualityList);
    hud.appendChild(qualityPanel);

    /* Subtitle panel */
    const subtitlePanel = createElement('div', 'vm-panel vm-sub-panel');
    const subtitleLabel = createElement('div', 'vm-panel-label', 'Subtitles');
    subtitlePanel.appendChild(subtitleLabel);
    const subtitleList = createElement('div');
    subtitlePanel.appendChild(subtitleList);
    const subtitleUploadBtn = createElement('div', 'vm-subtitle-upload');
    subtitleUploadBtn.appendChild(getIcon('upload'));
    subtitleUploadBtn.appendChild(document.createTextNode(' Load .srt / .vtt / .ass'));
    subtitlePanel.appendChild(subtitleUploadBtn);
    hud.appendChild(subtitlePanel);

    /* Filter panel */
    const filterPanel = createElement('div', 'vm-panel vm-filter-panel');
    const filterLabel = createElement('div', 'vm-panel-label', 'Video Filters');
    filterPanel.appendChild(filterLabel);

    const filterControls = {};
    const FILTER_CONFIG = [
      { key: 'contrast',   label: 'Contrast',  min: 50,  max: 200, step: 1,   unit: '%' },
      { key: 'brightness', label: 'Brightness', min: 50,  max: 200, step: 1,   unit: '%' },
      { key: 'saturate',   label: 'Saturate',   min: 0,   max: 300, step: 1,   unit: '%' },
      { key: 'hueRotate',  label: 'Hue',        min: 0,   max: 360, step: 1,   unit: '°' },
      { key: 'blur',       label: 'Blur',       min: 0,   max: 10,  step: 0.5, unit: 'px' },
      { key: 'grayscale',  label: 'Grayscale',  min: 0,   max: 100, step: 1,   unit: '%' },
      { key: 'sepia',      label: 'Sepia',      min: 0,   max: 100, step: 1,   unit: '%' },
    ];

    for (const cfg of FILTER_CONFIG) {
      const row = createElement('div', 'vm-filter-row');
      const label = createElement('div', 'vm-filter-label', cfg.label);
      const slider = document.createElement('input');
      slider.type = 'range';
      slider.min = String(cfg.min);
      slider.max = String(cfg.max);
      slider.step = String(cfg.step);
      slider.value = String(FILTER_DEFAULTS[cfg.key]);
      slider.className = 'vm-filter-slider';
      const valueDisplay = createElement('div', 'vm-filter-value', FILTER_DEFAULTS[cfg.key] + cfg.unit);
      row.appendChild(label);
      row.appendChild(slider);
      row.appendChild(valueDisplay);
      filterPanel.appendChild(row);
      filterControls[cfg.key] = { slider, valueDisplay, config: cfg };
    }

    const filterResetButton = createElement('div', 'vm-filter-reset-btn', '↺ Reset Filters');
    filterPanel.appendChild(filterResetButton);
    hud.appendChild(filterPanel);

    /* Stats panel */
    const statsPanel = createElement('div', 'vm-panel vm-stats-panel');
    const statsLabel = createElement('div', 'vm-panel-label', 'Video Statistics');
    statsPanel.appendChild(statsLabel);
    const statsContent = createElement('div');
    statsPanel.appendChild(statsContent);
    hud.appendChild(statsPanel);

    /* ─── Bottom Bar ─── */
    const bottomBar = createElement('div', 'vm-bottom-bar');

    // Seek bar
    const seekContainer = createElement('div', 'vm-seek-container');
    seekContainer.setAttribute('role', 'slider');
    seekContainer.setAttribute('aria-label', 'Video progress');

    const seekTrack = createElement('div', 'vm-seek-track');
    const seekBuffered = createElement('div', 'vm-seek-buffered');
    seekBuffered.style.width = '0%';
    const seekProgress = createElement('div', 'vm-seek-progress');
    seekProgress.style.width = '0%';
    const seekThumb = createElement('div', 'vm-seek-thumb');
    const abRangeHighlight = createElement('div', 'vm-ab-range-highlight');
    abRangeHighlight.style.display = 'none';

    seekProgress.appendChild(seekThumb);
    seekTrack.appendChild(seekBuffered);
    seekTrack.appendChild(seekProgress);
    seekTrack.appendChild(abRangeHighlight);

    const seekTooltip = createElement('div', 'vm-seek-tooltip', '0:00');
    seekContainer.appendChild(seekTrack);
    seekContainer.appendChild(seekTooltip);

    // Controls row
    const controlsRow = createElement('div', 'vm-controls-row');
    const leftControls = createElement('div', 'vm-control-group vm-left-controls');
    const rightControls = createElement('div', 'vm-control-group vm-right-controls');

    const rewindButton = createButton('vm-control-btn vm-control-btn-lg', '−10s (←)', 'rewind');
    const playPauseButton = createButton('vm-control-btn vm-control-btn-lg vm-play-pause', 'Play/Pause (Space)', 'play');
    const forwardButton = createButton('vm-control-btn vm-control-btn-lg', '+10s (→)', 'forward');
    const muteButton = createButton('vm-control-btn', 'Mute (M)', 'volumeHigh');
    const timeDisplay = createElement('span', 'vm-time-display', '0:00 / 0:00');

    // Netflix 1:1 bottom row:
    // [Play] [−10] [+10] [Mute+Vol] [Time] ………… [Speed] [CC] [⋮] [Fullscreen]
    // Loop / A-B stay available via ⋮ menu (not cluttering the chrome).
    playPauseButton.classList.add('vm-essential');
    playPauseButton.title = 'Play/Pause (Space)';
    playPauseButton.setAttribute('aria-label', 'Play/Pause');
    rewindButton.title = 'Back 10s';
    forwardButton.title = 'Forward 10s';

    leftControls.appendChild(playPauseButton);
    leftControls.appendChild(rewindButton);
    leftControls.appendChild(forwardButton);
    leftControls.appendChild(muteButton);

    // Volume slider (desktop hover-expand; on touch devices still usable if shown)
    let volumeSlider = null;
    {
      const volumeGroup = createElement('div', 'vm-volume-group');
      volumeSlider = document.createElement('input');
      volumeSlider.type = 'range';
      volumeSlider.min = '0';
      volumeSlider.max = '3';
      volumeSlider.step = '0.02';
      volumeSlider.value = '1';
      volumeSlider.className = 'vm-volume-slider';
      volumeSlider.setAttribute('aria-label', 'Volume & Boost');
      // On coarse pointers, keep a short always-visible strip so mute isn't lonely
      if (IS_MOBILE || IS_TOUCH) {
        volumeSlider.style.width = '56px';
        volumeSlider.style.opacity = '1';
        volumeSlider.style.margin = '0 4px';
      }
      volumeGroup.appendChild(volumeSlider);
      leftControls.appendChild(volumeGroup);
    }

    leftControls.appendChild(timeDisplay);

    const speedButton = createPillButton('vm-control-btn vm-pill-btn', 'Speed (S)', '1×');
    const loopButton = createButton('vm-control-btn', 'Loop (L)', 'loop');
    const abLoopButton = createButton('vm-control-btn', 'A-B Loop (B)', 'abloop');
    const subtitleButton = createButton('vm-control-btn', 'Subtitles (C)', 'subtitles');
    const eqButton = createButton('vm-control-btn', 'Equalizer / Filters', 'equalizer');
    const mirrorChromeBtn = createButton('vm-control-btn', 'Mirror (H)', 'mirror');
    const pipChromeBtn = createButton('vm-control-btn', 'PiP (P)', 'pip');
    const shotButton = createButton('vm-control-btn', 'Screenshot (T)', 'camera');
    const moreButtonBottom = moreButton;
    moreButtonBottom.style.display = '';
    moreButtonBottom.classList.remove('vm-hide-chrome');
    moreButtonBottom.title = 'Settings';
    moreButtonBottom.setAttribute('aria-label', 'Settings');
    try { setButtonIcon(moreButtonBottom, 'more'); } catch (e) {}
    const fullscreenButton = createButton('vm-control-btn vm-essential', 'Fullscreen (F)', 'fullscreenEnter');

    var eqPanel = createElement('div', 'vm-panel vm-eq-panel');
    eqPanel.appendChild(createElement('div', 'vm-panel-label', 'Audio equalizer'));
    eqPanel.appendChild(createElement('div', 'vm-eq-note',
      'Web Audio EQ for THIS video only. Extensions cannot change Android system volume/brightness.'));
    var eqControls = {};
    EQ_BANDS.forEach(function (band, idx) {
      var row = createElement('div', 'vm-eq-row');
      var lab = createElement('div', 'vm-eq-label', band.label);
      var sl = document.createElement('input');
      sl.type = 'range'; sl.min = '-12'; sl.max = '12'; sl.step = '0.5'; sl.value = '0';
      sl.className = 'vm-eq-slider';
      var val = createElement('div', 'vm-eq-val', '0 dB');
      sl.addEventListener('input', function (ev) {
        ev.stopPropagation();
        var db = parseFloat(ev.target.value) || 0;
        setEqBand(video, idx, db);
        val.textContent = (db > 0 ? '+' : '') + db + ' dB';
      });
      sl.addEventListener('click', function (ev) { ev.stopPropagation(); });
      row.appendChild(lab); row.appendChild(sl); row.appendChild(val);
      eqPanel.appendChild(row);
      eqControls[idx] = { slider: sl, value: val };
    });
    var eqReset = createElement('div', 'vm-filter-reset-btn', '↺ Reset EQ');
    eqReset.addEventListener('click', function (e) {
      e.stopPropagation();
      resetEq(video);
      Object.keys(eqControls).forEach(function (k) {
        eqControls[k].slider.value = '0';
        eqControls[k].value.textContent = '0 dB';
      });
      showToast('EQ reset');
    });
    eqPanel.appendChild(eqReset);
    hud.appendChild(eqPanel);

    eqButton.addEventListener('click', function (e) {
      stopEvent(e);
      _panelIgnoreUntil = Date.now() + 400;
      getOrCreateAudioBoost(video);
      openSubPanel(contextMenu, eqButton, eqPanel, 'Equalizer');
      clearTimeout(autoHideTimeout); hud.classList.remove('vm-controls-hidden');
    });
    mirrorChromeBtn.addEventListener('click', function (e) {
      stopEvent(e);
      isMirrored = !isMirrored;
      mirrorChromeBtn.classList.toggle('vm-active-state', isMirrored);
      try { mirrorButton.classList.toggle('vm-active-state', isMirrored); } catch (err) {}
      _arLastSig = ''; applyAspectRatio(true);
      showToast(isMirrored ? '🪞 Mirrored' : '🪞 Normal');
    });
    pipChromeBtn.addEventListener('click', function (e) { stopEvent(e); togglePiP(); });
    shotButton.addEventListener('click', function (e) { stopEvent(e); takeScreenshot(); });

    loopButton.style.display = 'none';
    bottomBar.appendChild(loopButton);

    // Clean, uncluttered bottom row (Netflix 1:1): Speed · CC · PiP · Settings gear · Fullscreen.
    // EQ / A-B loop / Mirror / Screenshot stay one tap away inside the settings
    // gear grid (⚙); PiP gets its own permanent icon next to the gear.
    [speedButton, subtitleButton, pipChromeBtn, moreButtonBottom, fullscreenButton]
      .forEach(function(btn) { rightControls.appendChild(btn); });
    [leftControls, rightControls].forEach(g => controlsRow.appendChild(g));
    [seekContainer, controlsRow].forEach(el => bottomBar.appendChild(el));
    hud.appendChild(bottomBar);

    // [P9] Loading indicator
    var loadingEl = createElement('div', 'vm-loading');
    var loadSpinner = createElement('div', 'vm-spinner');
    loadingEl.appendChild(loadSpinner);
    hud.appendChild(loadingEl);

    video.addEventListener('waiting', function () { loadingEl.classList.add('vm-visible'); });
    video.addEventListener('canplay', function () { loadingEl.classList.remove('vm-visible'); });
    video.addEventListener('playing', function () { loadingEl.classList.remove('vm-visible'); });

    // Finalize DOM
    overlay.appendChild(hud);
    shadowRoot.appendChild(overlay);

    /* ═══════════════════════════════════════════════════
     *  RESPONSIVE CONTROLS — dynamically size & hide buttons so essential
     *  controls (play, fullscreen) always fit, on any player width (fixes
     *  missing buttons on Android / narrow embeds like Facebook).
     *  Priority: lower number = hidden first when space is tight.
     * ═══════════════════════════════════════════════════ */
    function setPri(btn, p) { if (btn) btn.dataset.vmPri = p; }
    setPri(pipChromeBtn, 5); setPri(rotateButton, 6); setPri(arButton, 7); setPri(speedButton, 8); setPri(subtitleButton, 9);
    const collapsible = [pipChromeBtn, rotateButton, arButton, speedButton, subtitleButton].filter(Boolean);

    function applyCompactScale() {
      // Shrink control sizing on small players via a class on the hud.
      const w = (container.getBoundingClientRect().width) || window.innerWidth;
      hud.classList.toggle('vm-compact', w < 560);
      hud.classList.toggle('vm-xcompact', w < 400);
    }

    function reflowControls() {
      if (isDestroyed || !isHudVisible) return;
      applyCompactScale();
      collapsible.forEach(function (b) { if (b) b.classList.remove('vm-collapsed'); });
      requestAnimationFrame(function () {
        try {
          var byPri = collapsible.slice().sort(function (a, b) {
            return (parseInt(a.dataset.vmPri || 9) - parseInt(b.dataset.vmPri || 9));
          });
          var guard = 0;
          function overflowing(row) { return row && row.scrollWidth > row.clientWidth + 4; }
          while ((overflowing(rightControls) || overflowing(controlsRow) || overflowing(topActions)) && guard < byPri.length) {
            var b = byPri[guard++];
            if (b && !b.classList.contains('vm-hide-mobile')) b.classList.add('vm-collapsed');
          }
        } catch (e) {}
      });
    }


    /* ═══════════════════════════════════════════════════
     *  STATE VARIABLES
     * ═══════════════════════════════════════════════════ */
    let brightnessLevel = 1.0; // Range: 0.1 (very dark) to 2.0 (very bright)

    // Apply brightness: below 1.0 = dark overlay, above 1.0 = CSS filter brightness
    // Apply brightness using CSS filter (works for BOTH dimming AND brightening)
    // brightnessLevel: 0.0 (near black) → 1.0 (normal) → 2.0 (boosted, system-like)
    // IMPORTANT: browser extensions CANNOT change OS/system brightness.
    // We simulate the same *feel* over the player: black dim + white screen-blend boost.
    function applyBrightness() {
      try {
        var bVal = brightnessLevel || 1;
        // MONOTONIC brightness - always increases as value goes up
        var bpct = Math.round(Math.max(10, Math.min(300, bVal * 100)));
        var cpct = Math.round(Math.max(50, Math.min(200, 80 + bVal * 25)));
        try { video.style.filter = 'brightness(' + bpct + '%) contrast(' + cpct + '%)'; } catch(e) {}
        if (bVal <= 1) {
          if (brightnessOverlay) brightnessOverlay.style.opacity = ((1 - bVal) * 0.88).toFixed(3);
          if (brightnessBoost) brightnessBoost.style.opacity = '0';
        } else {
          if (brightnessOverlay) brightnessOverlay.style.opacity = '0';
          if (brightnessBoost) brightnessBoost.style.opacity = Math.min(0.4, (bVal - 1) * 0.25).toFixed(3);
        }
      } catch (e) {}
    }
    let zoomLevel = 1.0;
    let rotationDeg = 0;
    let screenRotIndex = 0;
    let aspectRatioIndex = 0;  // [CRIT-1] Starts at 0 = Default = no style changes
    let _arRetryCount = 0;     // guards the AR layout-retry loop
    let speedIndex = 3; // 1× in SPEED_OPTIONS
    let isLooping = false;
    // Timers scheduled by applyDefaults() to (re)apply the saved default
    // quality shortly after load. If the user manually picks a quality in
    // that window, applyQualityLevel() cancels these — otherwise the retry
    // silently snaps playback back to the default a second or two later,
    // which looks like the video "loops between the original and the chosen
    // quality".
    var _autoQualityTimers = [];
    let isFullscreen = false;
    let fullscreenElement = null;
    let lastVolume = 1.0;
    let isUserMuted = false;   // our own mute state (covers Web-Audio boost path)
    let hlsInstance = null;
    let isSeekDragging = false;
    let isHoldActive = false;
    let holdBaseSpeed = 2.0;
    let holdTimeout = null;
    let holdStartX = 0;
    let speedBeforeHold = 1; // Stores the EXACT speed before hold activated
    let autoHideTimeout = null;
    let customSubtitleCues = [];
    let isCustomSubActive = false;
    let subtitleIntervalId = null;
    let isDismissed = false;
    let savedVideoSibling = null;
    let activeSubtitleIndex = -1;
    let isMirrored = false;
    let abPointA = null;
    let abPointB = null;
    let isABLoopActive = false;
    let abCheckIntervalId = null;
    let audioBoostLevel = 1;
    let videoFilters = { ...FILTER_DEFAULTS };
    let progressRAF = null;
    let isHudVisible = false;
    let _quettaSources = []; // parsed HLS/DASH/progressive ladders from v2.5 engine

    const badgeTimers = {};


    /* ═══════════════════════════════════════════════════
     *  HELPER FUNCTIONS
     * ═══════════════════════════════════════════════════ */
    function updateHoldBadge(speedText, subLabel) {
      holdSpeedText.textContent = speedText;
      holdSubText.textContent = subLabel;
    }

    function showBadge(key, element, duration) {
      duration = duration || 1200;
      clearTimeout(badgeTimers[key]);
      element.classList.add('vm-visible');
      badgeTimers[key] = setTimeout(() => element.classList.remove('vm-visible'), duration);
    }

    let toastTimer = null;
    function showToast(message, duration) {
      duration = duration || 800;
      // Download panels can be opened from the minimal windowed launcher while
      // the fullscreen HUD is hidden. Use the page-level toast in that state so
      // actions never appear to do nothing.
      if (!isHudVisible) {
        try { vmxToastGlobal(message); } catch (e) {}
        return;
      }
      toastElement.textContent = message;
      toastElement.classList.add('vm-visible');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toastElement.classList.remove('vm-visible'), duration);
    }

    function getDefaultOrientation() {
      try {
        var d = window.__vmxDefaults || {};
        var o = d.orientation || 'auto';
        return (o === 'portrait' || o === 'auto' || o === 'landscape') ? o : 'landscape';
      } catch (e) { return 'auto'; }
    }
    function lockDefaultOrientation() {
      if (!IS_MOBILE || !screen.orientation || !screen.orientation.lock) return;
      try {
        var pref = getDefaultOrientation();
        var target = 'landscape';
        if (pref === 'portrait') target = 'portrait';
        else if (pref === 'auto') {
          var vw2 = video.videoWidth || 0, vh2 = video.videoHeight || 0;
          target = (vw2 > 0 && vh2 > 0 && vh2 > vw2) ? 'portrait' : 'landscape';
        }
        screen.orientation.lock(target).catch(function () {});
      } catch (e) {}
    }

    let sideBarTimer = null;
    function showSideBar(side, value, label) {
      const bar = side === 'left' ? sideBarLeft : sideBarRight;
      bar.fill.style.height = clamp(value, 0, 1) * 100 + '%';
      if (label) bar.value.textContent = label;
      bar.bar.classList.add('vm-visible');
      clearTimeout(sideBarTimer);
      sideBarTimer = setTimeout(() => {
        sideBarLeft.bar.classList.remove('vm-visible');
        sideBarRight.bar.classList.remove('vm-visible');
      }, 1200);
    }

    let scrubTimer = null;
    function showScrubPreview(currentTime, deltaSeconds) {
      scrubOverlay.classList.add('vm-visible');
      scrubTime.textContent = formatTime(currentTime);
      scrubDelta.textContent = (deltaSeconds >= 0 ? '+' : '-') + Math.abs(Math.round(deltaSeconds)) + 's';
      scrubDelta.style.color = deltaSeconds >= 0 ? 'var(--vm-red)' : '#f5a623';
      scrubFill.style.width = (video.duration ? clamp(currentTime / video.duration, 0, 1) * 100 : 0) + '%';
      clearTimeout(scrubTimer);
      scrubTimer = setTimeout(() => scrubOverlay.classList.remove('vm-visible'), 600);
    }

    function createRippleEffect(x, y) {
      const ripple = createElement('div', 'vm-ripple');
      ripple.style.left = x + 'px';
      ripple.style.top = y + 'px';
      touchZones.appendChild(ripple);
      setTimeout(() => ripple.remove(), 550);
    }

    const dtTimers = {};
    function flashDoubleTapIndicator(side) {
      const indicator = side === 'left' ? dtIndicatorLeft : dtIndicatorRight;
      indicator.classList.add('vm-visible');
      clearTimeout(dtTimers[side]);
      dtTimers[side] = setTimeout(() => indicator.classList.remove('vm-visible'), 450);
    }

    function resetAutoHide() {
      // NEVER show controls during hold speed / active vertical gesture
      if (isHoldActive || isLongPress || (typeof isSwipeActive !== 'undefined' && isSwipeActive && swipeAxis && swipeAxis !== 'horizontal')) return;
      hud.classList.remove('vm-controls-hidden');
      clearTimeout(autoHideTimeout);
      // MX/VLC behaviour: auto-hide after 3s whenever controls are visible
      // (playing OR paused — user can tap again to show)
      autoHideTimeout = setTimeout(function () {
        if (isHoldActive || isLongPress) return;
        if (contextMenu && contextMenu.classList.contains('vm-visible')) return;
        if (qualityPanel && qualityPanel.classList.contains('vm-visible')) return;
        if (subtitlePanel && subtitlePanel.classList.contains('vm-visible')) return;
        if (filterPanel && filterPanel.classList.contains('vm-visible')) return;
        if (statsPanel && statsPanel.classList.contains('vm-visible')) return;
        hud.classList.add('vm-controls-hidden');
      }, 3000);
    }

    function toggleControlsVisibility() {
      // ONLY show/hide chrome — never touch video.paused / video.play()
      if (hud.classList.contains('vm-controls-hidden')) {
        resetAutoHide();
      } else {
        clearTimeout(autoHideTimeout);
        hud.classList.add('vm-controls-hidden');
        closeAllPanels();
      }
    }

    // While HUD is open, kill native video/site click-to-toggle (Android YT especially)
    function onVideoNativeClickBlock(e) {
      if (!isHudVisible) return;
      try { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); } catch (err) {}
    }
    try {
      video.addEventListener('click', onVideoNativeClickBlock, true);
      video.addEventListener('mouseup', onVideoNativeClickBlock, true);
      video.addEventListener('pointerup', onVideoNativeClickBlock, true);
    } catch (e) {}

    function enterHoldMode() {
      clearTimeout(autoHideTimeout);
      autoHideTimeout = null;
      hud.classList.add('vm-controls-hidden');
    }

    function exitHoldMode() {
      hud.classList.remove('vm-controls-hidden');
      resetAutoHide();
    }


    /* ═══════════════════════════════════════════════════
     *  ASPECT RATIO ENGINE
     *
     *  [CRIT-1] Default mode = DO NOTHING to video styles
     *  [AR-2]   Fill/Stretch wait for real videoWidth > 0
     *  [AR-3]   Recalculates on loadeddata + resize
     * ═══════════════════════════════════════════════════ */
    function getContainerDimensions() {
      // CRITICAL: never measure <video> for AR — transform feedback loops on m.youtube.
      try {
        if (useFloatingHost && hostElement) {
          var hr = hostElement.getBoundingClientRect();
          if (hr.width >= 40 && hr.height >= 40) return { width: hr.width, height: hr.height };
        }
        var cr = container && container.getBoundingClientRect ? container.getBoundingClientRect() : null;
        var cw = (cr && cr.width) || (container && container.offsetWidth) || 0;
        var ch = (cr && cr.height) || (container && container.offsetHeight) || 0;
        if (cw >= 40 && ch >= 40) return { width: cw, height: ch };
        return { width: window.innerWidth || 360, height: window.innerHeight || 640 };
      } catch (e) {
        return { width: window.innerWidth || 360, height: window.innerHeight || 640 };
      }
    }

    function getNativeTransformPrefix() {
      try {
        // Mobile YouTube often positions the video with an inline transform.
        // Overwriting it is the main reason AR modes break on m.youtube.com.
        // Preserve the captured native transform, then append our AR scale.
        if (IS_YOUTUBE && IS_MOBILE && _vmOrig && _vmOrig.transform && _vmOrig.transform !== 'none') {
          return _vmOrig.transform;
        }
      } catch (e) {}
      return '';
    }
    function buildCssTransform(extraTransform) {
      extraTransform = extraTransform || '';
      const parts = [];
      var nativePrefix = getNativeTransformPrefix();
      if (nativePrefix) parts.push(nativePrefix);
      if (extraTransform) parts.push(extraTransform);
      if (zoomLevel !== 1) parts.push('scale(' + zoomLevel + ')');
      if (!IS_MOBILE && rotationDeg !== 0) parts.push('rotate(' + rotationDeg + 'deg)');
      if (isMirrored) parts.push('scaleX(-1)');
      return parts.length > 0 ? parts.join(' ') : '';
    }

    function applyCssFilters() {
      // When filters change, re-apply brightness too
      applyBrightness();
    }

    const debouncedApplyAR = debounce(applyAspectRatio, 60);

    // Managed players continuously re-size their own <video> with inline px
    // styles. Repositioning them absolutely fights that logic and causes black
    // screens. For these we use a NON-INTRUSIVE engine: object-fit + transform
    // only — never touching position/width/height/top/left.
    const USES_MANAGED_LAYOUT = IS_YOUTUBE || IS_NETFLIX || IS_TWITCH || IS_FACEBOOK || IS_VIMEO || IS_TWITTER || IS_REDDIT || IS_TIKTOK || IS_INSTAGRAM || IS_DAILYMOTION || IS_DRM_SITE || IS_KICK || IS_VK || IS_BILIBILI;

    const AR_ALL_PROPS = ['width','height','top','left','right','bottom',
      'object-fit','object-position','max-width','max-height','min-width','min-height',
      'position','margin','transform','transform-origin','scale'];

    function clearArProps() { AR_ALL_PROPS.forEach(function (p) { video.style.removeProperty(p); }); }

    let _arWriting = false;
    let _arLastSig = '';
    let _arStableTimer = null;
    function applyAspectRatio(force) {
      if (isDestroyed) return;
      const mode = AR_MODES[aspectRatioIndex].key;
      const { width: cw, height: ch } = getContainerDimensions();
      if (!cw || !ch) return;

      const vw = video.videoWidth || 0;
      const vh = video.videoHeight || 0;
      var sig = mode + '|' + Math.round(cw) + 'x' + Math.round(ch) + '|' + vw + 'x' + vh + '|' +
        Math.round((zoomLevel||1)*100) + '|' + (rotationDeg||0) + '|' + (isMirrored?1:0);
      if (!force && sig === _arLastSig && mode !== 'default') return;
      _arLastSig = sig;

      _arWriting = true;
      clearTimeout(_arStableTimer);
      _arStableTimer = setTimeout(function () { _arWriting = false; }, IS_MOBILE ? 200 : 90);

      const vs = video.style;

      // ─── DEFAULT MODE: leave the site's own layout completely alone ───
      if (mode === 'default') {
        // CRITICAL: on MANAGED players (YouTube/Netflix/…) only remove the
        // properties WE set — NEVER touch the site's own inline
        // width/height/top/left/position. Those size & position the <video>;
        // removing them collapses it to 0×0 → black screen (the YT bug).
        // On standard sites (Engine B set width/height itself) it's safe to
        // fully clear so the video returns to its natural layout.
        if (USES_MANAGED_LAYOUT) {
          vs.removeProperty('object-fit');
          vs.removeProperty('object-position');
        } else {
          clearArProps();
        }
        var defaultTransform = buildCssTransform();
        if (defaultTransform) {
          vs.setProperty('transform', defaultTransform, 'important');
          vs.setProperty('transform-origin', 'center center', 'important');
        } else {
          if (IS_YOUTUBE && IS_MOBILE && _vmOrig && _vmOrig.transform) {
            vs.setProperty('transform', _vmOrig.transform, 'important');
            if (_vmOrig.transformOrigin) vs.setProperty('transform-origin', _vmOrig.transformOrigin, 'important');
          } else {
            vs.removeProperty('transform');
            vs.removeProperty('transform-origin');
            vs.removeProperty('scale');
          }
        }
        if (mode === 'default') { try { vs.removeProperty('scale'); } catch (e) {} }
        applyCssFilters();
        return;
      }

      // Ratio modes need real dimensions; object-fit modes can apply immediately.
      const needsDims = (mode === 'r43' || mode === 'r169' || mode === 'r235');
      if (needsDims && (!vw || !vh)) return;

      const videoRatio = (vw && vh) ? vw / vh : (16 / 9);
      const containerRatio = cw / ch;

      /* ════════════════════════════════════════════════════════════
       *  ENGINE A — Managed players (YouTube/Netflix/Twitch/…)
       *
       *  Proven Ultrawidify/UltraWideo approach: force the <video> to FILL the
       *  player box (absolute inset:0, width/height:100%), then use object-fit
       *  + a uniform/non-uniform transform scale for crop/stretch. Because we
       *  control width/height directly, this works BOTH windowed and fullscreen
       *  (the old measured-translate method only worked in fullscreen).
       * ════════════════════════════════════════════════════════════ */
      if (USES_MANAGED_LAYOUT) {
        // TRANSFORM-ONLY for managed players, but mobile YouTube needs object-fit
        // hints; otherwise the native player can letterbox inside its own layer
        // while our transform only scales the already-letterboxed frame.
        if (IS_YOUTUBE) {
          if (IS_MOBILE) {
            // Mobile YT: already handled in the transform section below, but proactive object-fit
            vs.setProperty('object-fit', 'cover', 'important');
            vs.setProperty('object-position', 'center center', 'important');
            vs.setProperty('width', '100%', 'important');
            vs.setProperty('height', '100%', 'important');
          } else {
            var _ytFit = (mode === 'fit') ? 'contain' : (mode === 'stretch') ? 'fill' : 'cover';
            vs.setProperty('object-fit', _ytFit, 'important');
            vs.setProperty('object-position', 'center center', 'important');
          }
        } else {
          vs.removeProperty('object-fit');
          vs.removeProperty('object-position');
        }
        var vRatio = (vw > 16 && vh > 16) ? (vw / vh) : (16 / 9);
        var cRatio = cw / Math.max(ch, 1);
        if (!isFinite(cRatio) || cRatio < 0.15 || cRatio > 6) cRatio = 16 / 9;
        let sx = 1, sy = 1;
        switch (mode) {
          case 'autofill':
          case 'fit':
            sx = sy = 1; break;
          case 'fill': {
            var sFill = (vRatio > cRatio) ? (vRatio / cRatio) : (cRatio / vRatio);
            sFill = Math.min(Math.max(sFill || 1, 1), 3.2);
            sx = sy = Math.round(sFill * 1000) / 1000; break;
          }
          case 'stretch': {
            if (cRatio > vRatio) { sx = Math.round((cRatio / vRatio) * 1000) / 1000; sy = 1; }
            else { sy = Math.round((vRatio / cRatio) * 1000) / 1000; sx = 1; }
            sx = Math.min(sx, 3.5); sy = Math.min(sy, 3.5); break;
          }
          case 'zoom14': sx = sy = 1.4; break;
          case 'zoom16': sx = sy = 1.6; break;
          case 'zoom20': sx = sy = 2.0; break;
          case 'r43':
          case 'r169':
          case 'r235': {
            var targetRatio = mode === 'r43' ? (4/3) : mode === 'r169' ? (16/9) : 2.35;
            if (targetRatio > vRatio) sx = targetRatio / vRatio; else sy = vRatio / targetRatio;
            sx = Math.round(Math.min(sx, 3.5) * 1000) / 1000;
            sy = Math.round(Math.min(sy, 3.5) * 1000) / 1000; break;
          }
        }
        var hasArScale = (Math.abs(sx - 1) > 0.002 || Math.abs(sy - 1) > 0.002);
        if (IS_YOUTUBE) {
          // YouTube AR - SIMPLE approach to avoid breaking layout
          if (IS_MOBILE) {
            // MOBILE FIX: Simple object-fit only, no transforms that break button placement
            vs.setProperty('position', 'absolute', 'important');
            vs.setProperty('top', '0', 'important');
            vs.setProperty('left', '0', 'important');
            vs.setProperty('width', '100%', 'important');
            vs.setProperty('height', '100%', 'important');
            vs.setProperty('min-width', '100%', 'important');
            vs.setProperty('min-height', '100%', 'important');
            vs.setProperty('max-width', '100%', 'important');
            vs.setProperty('max-height', '100%', 'important');
            
            // Simple object-fit only - no transforms that can cause overflow
            if (mode === 'default' || mode === 'fit') {
              vs.setProperty('object-fit', 'contain', 'important');
              vs.removeProperty('transform');
            } else if (mode === 'stretch') {
              vs.setProperty('object-fit', 'fill', 'important');
              vs.removeProperty('transform');
            } else {
              vs.setProperty('object-fit', 'cover', 'important');
              vs.removeProperty('transform');
            }
          } else {
            // Desktop YouTube: use CSS scale (stacks on top of YT's own transform)
            if (hasArScale) vs.setProperty('scale', Math.min(sx, 2.0).toFixed(3) + ' ' + Math.min(sy, 2.0).toFixed(3), 'important');
            else vs.removeProperty('scale');
          }
          vs.setProperty('transform-origin', 'center center', 'important');
          applyCssFilters();
          return;
        }
        var extraScale = hasArScale ? ('scale(' + sx.toFixed(3) + ',' + sy.toFixed(3) + ')') : '';
        var tfm = buildCssTransform(extraScale);
        if (tfm) {
          vs.setProperty('transform', tfm, 'important');
          vs.setProperty('transform-origin', 'center center', 'important');
        } else {
          vs.removeProperty('transform');
          vs.removeProperty('transform-origin');
          vs.removeProperty('scale');
        }
        applyCssFilters();
        return;
      }

      /* ════════════════════════════════════════════════════════════
       *  ENGINE B — Standard sites: precise absolute positioning
       * ════════════════════════════════════════════════════════════ */
      if (!vw || !vh) {
        // Without dims we can still do object-fit fallbacks
        clearArProps();
        var fb = mode === 'fit' ? 'contain' : mode === 'stretch' ? 'fill' : mode === 'fill' ? 'cover' : 'contain';
        vs.setProperty('position', 'absolute', 'important');
        vs.setProperty('top', '0', 'important');
        vs.setProperty('left', '0', 'important');
        vs.setProperty('width', '100%', 'important');
        vs.setProperty('height', '100%', 'important');
        vs.setProperty('object-fit', fb, 'important');
        var tfb = buildCssTransform();
        if (tfb) vs.setProperty('transform', tfb, 'important');
        applyCssFilters();
        return;
      }

      clearArProps();

      function setAbsoluteFull() {
        vs.setProperty('position', 'absolute', 'important');
        vs.setProperty('top', '0', 'important');
        vs.setProperty('left', '0', 'important');
        vs.setProperty('width', '100%', 'important');
        vs.setProperty('height', '100%', 'important');
        vs.setProperty('max-width', 'none', 'important');
        vs.setProperty('max-height', 'none', 'important');
        vs.setProperty('transform-origin', 'center center', 'important');
      }

      switch (mode) {
        case 'fit':
          setAbsoluteFull();
          vs.setProperty('object-fit', 'contain', 'important');
          break;

        case 'fill':
          setAbsoluteFull();
          vs.setProperty('object-fit', 'cover', 'important');
          break;

        case 'stretch':
          setAbsoluteFull();
          vs.setProperty('object-fit', 'fill', 'important');
          break;

        case 'zoom14':
        case 'zoom16':
        case 'zoom20': {
          const zoomFactor = mode === 'zoom14' ? 1.4 : mode === 'zoom16' ? 1.6 : 2.0;
          setAbsoluteFull();
          vs.setProperty('object-fit', 'cover', 'important');
          vs.setProperty('transform', buildCssTransform('scale(' + zoomFactor + ')'), 'important');
          applyCssFilters();
          return;
        }

        case 'r43':
        case 'r169':
        case 'r235': {
          const targetRatio = mode === 'r43' ? (4/3) : mode === 'r169' ? (16/9) : 2.35;
          let tw, th;
          if (containerRatio > targetRatio) { th = ch; tw = ch * targetRatio; }
          else { tw = cw; th = cw / targetRatio; }
          vs.setProperty('position', 'absolute', 'important');
          vs.setProperty('top', ((ch - th) / 2) + 'px', 'important');
          vs.setProperty('left', ((cw - tw) / 2) + 'px', 'important');
          vs.setProperty('width', tw + 'px', 'important');
          vs.setProperty('height', th + 'px', 'important');
          vs.setProperty('object-fit', 'fill', 'important');
          vs.setProperty('max-width', 'none', 'important');
          vs.setProperty('max-height', 'none', 'important');
          vs.setProperty('transform-origin', 'center center', 'important');
          break;
        }
      }

      const transform = buildCssTransform();
      if (transform) vs.setProperty('transform', transform, 'important');
      applyCssFilters();
    }

    // [AR-3] Listen to both metadata AND data events
    video.addEventListener('loadedmetadata', applyAspectRatio);
    video.addEventListener('loadeddata', applyAspectRatio);

    // [PERF-2] ResizeObserver on BOTH container and the video box.
    // Managed-player AR is computed from the video's rendered box, so we must
    // recompute when the site resizes the <video> too (theatre mode, FS, etc.).
    const debouncedReflow = debounce(reflowControls, 120);
    const debouncedApplyAR2 = debounce(function () { applyAspectRatio(false); }, IS_MOBILE ? 220 : 90);
    const resizeObserver = new ResizeObserver(function () { debouncedApplyAR2(); debouncedReflow(); });
    try {
      if (useFloatingHost && hostElement) resizeObserver.observe(hostElement);
      else if (container) resizeObserver.observe(container);
    } catch (e) {}
    if (!USES_MANAGED_LAYOUT && !useFloatingHost) {
      try { resizeObserver.observe(video); } catch (e) {}
    }

    // Managed players (YouTube/Netflix/…) constantly rewrite the <video>'s
    // inline style, which wipes our AR transform. Watch the style attribute and
    // re-apply when a non-default AR mode is active. `_arWriting` (set inside
    // applyAspectRatio) guards against reacting to our own writes.
    let _arGuardTimer = null;
    const styleGuardObserver = new MutationObserver(function () {
      if (_arWriting || isDestroyed) return;
      try {
        if (aspectRatioIndex > 0) {
          if (IS_YOUTUBE) {
            var curS = video.style.getPropertyValue('scale') || '';
            if (curS && curS !== 'none' && curS !== '1') return;
          } else {
            var curT = video.style.getPropertyValue('transform') || '';
            if (curT.indexOf('scale') !== -1) return;
          }
        }
      } catch (e) {}
      // Only act when a transform is actually needed (non-default state).
      if (aspectRatioIndex === 0 && zoomLevel === 1 && rotationDeg === 0 && !isMirrored) return;
      // Only re-apply if our transform got wiped (cheap string check, no reflow).
      if (IS_YOUTUBE && video.style && video.style.getPropertyValue('scale')) return;
      if (!IS_YOUTUBE && video.style && video.style.transform && video.style.transform.indexOf('scale') !== -1) return;
      if (_arGuardTimer) return;
      _arGuardTimer = setTimeout(function () {
        _arGuardTimer = null;
        if (!isDestroyed) applyAspectRatio();
      }, 100);
    });
    try { styleGuardObserver.observe(video, { attributes: true, attributeFilter: ['style'] }); } catch (e) {}

    // Refresh the subtitle menu when a new caption URL is sniffed while open.
    function _vmSubListener() { if (isHudVisible) { try { buildSubtitleOptions(); } catch (e) {} } }
    vmxSubListeners.push(_vmSubListener);

    // Refresh the quality menu when cross-frame relay data arrives (anime3rb).
    function _vmRelayListener() { if (isHudVisible) { try { buildQualityOptions(); } catch (e) {} } }
    _relayListeners.push(_vmRelayListener);

    // Initial apply (safe for default mode — does nothing)
    applyAspectRatio();


    /* ═══════════════════════════════════════════════════
     *  FULLSCREEN
     * ═══════════════════════════════════════════════════ */
    function enterFullscreen() {
      if (isFullscreen) return;

      // ─── UNIVERSAL NATIVE FULLSCREEN (works on EVERY site) ───
      // We NEVER move the <video> into a custom element — detaching it from the
      // site's player breaks playback and, in default mode, left the video its
      // small natural size in a corner with black around it (the exact bug a
      // user reported: "lleva el video a una esquina, el resto queda en negro").
      // Instead we request native fullscreen on the element that ALREADY
      // contains BOTH the video and our overlay host, then inject CSS that forces
      // the video to fill the fullscreen box. onFullscreenChange handles the
      // fill + floating-host relocation for us.
      //
      // Pick the smallest ancestor that contains BOTH the video and the host, so
      // our controls are visible in fullscreen. Fall back sensibly.
      var fsTarget = null;
      try {
        if (!useFloatingHost && hostElement && hostElement.parentNode &&
            hostElement.parentNode.contains && hostElement.parentNode.contains(video)) {
          fsTarget = hostElement.parentNode;         // host is a sibling of video
        }
      } catch (e) {}
      fsTarget = fsTarget || container || (video.parentElement) || video;

      var reqFS = fsTarget.requestFullscreen || fsTarget.webkitRequestFullscreen ||
                  fsTarget.webkitRequestFullScreen || fsTarget.mozRequestFullScreen ||
                  fsTarget.msRequestFullscreen;
      try {
        var p = reqFS ? reqFS.call(fsTarget) : null;
        if (p && p.catch) p.catch(function () {
          // Some sites reject FS on a div — fall back to the <video> itself.
          try { (video.requestFullscreen || video.webkitRequestFullscreen || video.webkitEnterFullscreen).call(video); } catch (e2) {}
        });
      } catch (e) {
        try { (video.requestFullscreen || video.webkitRequestFullscreen || video.webkitEnterFullscreen).call(video); } catch (e2) {}
      }
      _fsTarget = fsTarget;
      isFullscreen = true;
      setButtonIcon(fullscreenButton, 'fullscreenExit');
      showToast('⛶ Fullscreen');

      lockDefaultOrientation();
      // Apply the fill CSS + AR after the browser lays out fullscreen.
      [30, 120, 300].forEach(function (d) { setTimeout(function () { if (!isDestroyed) { applyFullscreenFill(); applyAspectRatio(); } }, d); });
    }

    // Force the <video> to fill the native fullscreen element (default mode) —
    // this is what stops "video in a corner, rest black" on generic sites. Uses
    // a scoped stylesheet keyed to :fullscreen so it only applies while in FS and
    // never permanently touches the site's layout.
    var _fsStyleEl = null, _fsTarget = null;
    var _fsHostOrig = null;
    function applyFullscreenFill() {
      try {
        var activeFS = document.fullscreenElement || document.webkitFullscreenElement;
        if (!activeFS) return;
        // CRITICAL: NEVER force-position the <video> on managed players
        // (YouTube/Netflix/Twitch/…). They size & position their own fullscreen
        // video (YouTube uses inline negative-top); forcing position:absolute/
        // inset:0 on it collapses/offsets the frame → BLACK SCREEN. Those sites
        // fill the screen correctly on their own, so we apply NO fill CSS there.
        if (USES_MANAGED_LAYOUT) { clearFullscreenFill(); return; }
        if (!_fsStyleEl) {
          _fsStyleEl = document.createElement('style');
          _fsStyleEl.id = 'vm-fs-fill';
          (document.head || document.documentElement).appendChild(_fsStyleEl);
        }
        // Only fill in DEFAULT aspect mode; AR/zoom modes manage the video via
        // transforms in applyAspectRatio (we must not fight them here).
        var fillObjectFit = (aspectRatioIndex === 0) ? 'contain' : '';
        // Scope tightly: only a <video> that is a DIRECT child of the fullscreen
        // element (the generic "raw video/wrapper went fullscreen" case). This
        // avoids touching complex site players that nest/position their video.
        _fsStyleEl.textContent =
          ':fullscreen > video, :-webkit-full-screen > video {' +
            'position:absolute !important; inset:0 !important;' +
            'width:100% !important; height:100% !important;' +
            'max-width:100% !important; max-height:100% !important;' +
            'margin:auto !important;' + (fillObjectFit ? ('object-fit:' + fillObjectFit + ' !important;') : '') +
          '}' +
          ':fullscreen, :-webkit-full-screen { background:#000 !important; }';
      } catch (e) {}
    }
    function clearFullscreenFill() {
      try { if (_fsStyleEl) { _fsStyleEl.remove(); _fsStyleEl = null; } } catch (e) {}
    }

    function exitFullscreen() {
      if (!isFullscreen) return;
      isFullscreen = false;

      const exitFn = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen || document.msExitFullscreen;
      try { if (exitFn) { var pr = exitFn.call(document); if (pr && pr.catch) pr.catch(function(){}); } } catch (e) {}

      if (IS_MOBILE && screen.orientation && screen.orientation.unlock) {
        try { screen.orientation.unlock(); } catch (e) {}
      }

      clearFullscreenFill();
      _fsTarget = null;

      setButtonIcon(fullscreenButton, 'fullscreenEnter');
      applyAspectRatio();
      closeHUD();
    }

    function onFullscreenChange() {
      const activeFS = document.fullscreenElement || document.webkitFullscreenElement;
      vmxDebug('fs', 'change activeFS=' + (activeFS ? (activeFS.tagName + '.' + String(activeFS.className||'').slice(0,24)) : 'none') +
               ' floating=' + useFloatingHost + ' hostConnected=' + hostElement.isConnected);

      function restoreFsHostIfNeeded() {
        try {
          if (_fsHostOrig && _fsHostOrig.parent) {
            if (_fsHostOrig.next && _fsHostOrig.next.parentNode === _fsHostOrig.parent) _fsHostOrig.parent.insertBefore(hostElement, _fsHostOrig.next);
            else _fsHostOrig.parent.appendChild(hostElement);
            hostElement.style.cssText = _fsHostOrig.cssText || '';
          }
        } catch (e) {}
        _fsHostOrig = null;
      }
      function moveHostIntoFullscreen(target, cssText) {
        try {
          if (!target) return;
          if (!_fsHostOrig) _fsHostOrig = { parent: hostElement.parentNode, next: hostElement.nextSibling, cssText: hostElement.style.cssText };
          if (hostElement.parentNode !== target) target.appendChild(hostElement);
          hostElement.style.cssText = cssText || 'position:absolute;inset:0;pointer-events:none;z-index:2147483647;display:block;';
        } catch (e) {}
      }

      // FLOATING-HOST fullscreen fix (mobile YouTube/Twitch/Facebook):
      // In native fullscreen the browser paints ONLY the fullscreen element and
      // its descendants. Our floating host lives under <html>, so it vanishes
      // (no overlay, no gestures, no controls). Re-parent the host INTO the
      // fullscreen element while FS is active, and move it back to <html> after.
      if (useFloatingHost) {
        try {
          if (activeFS) {
            // Where to place our overlay so it RENDERS inside the FS element:
            //  • If the FS element is a custom element with a shadow root, a plain
            //    light-DOM child won't render (no <slot>), so inject into its
            //    OPEN shadowRoot. If the shadow root is closed, fall back to the
            //    deepest open shadow root on the path, else the element itself.
            var target = activeFS;
            try {
              if (activeFS.shadowRoot) target = activeFS.shadowRoot;           // open shadow → render here
              else {
                // Try the video's own root (works when video shares FS element's tree).
                var vroot = video.getRootNode && video.getRootNode();
                if (vroot && vroot.nodeType === 11 && vroot.host && activeFS.contains(vroot.host)) target = vroot;
              }
            } catch (e) {}
            if (hostElement.parentNode !== target) { try { moveHostIntoFullscreen(target); } catch (e) { try { moveHostIntoFullscreen(activeFS); } catch (e2) {} } }
            vmxDebug('fs', 'host moved into FS target=' + (target.host ? '#shadow' : (target.tagName || target.nodeName)));
            // Inside the FS element, fill it directly (no getBoundingClientRect sync).
            stopFloatSync();
            hostElement.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:2147483647;display:block;';
            lastFloatRect = null;
          } else {
            // Back to windowed: return to <html> and resume position syncing.
            if (hostElement.parentNode !== (document.documentElement || document.body)) {
              (document.documentElement || document.body).appendChild(hostElement);
            }
            hostElement.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;pointer-events:none;z-index:2147483647;display:block;';
            lastFloatRect = null;
            startFloatSync();
          }
        } catch (e) {}
      }
      // Non-floating fallback: some sites (notably Facebook) fullscreen a wrapper
      // that does NOT contain our Shadow DOM host. Native fullscreen only paints
      // descendants of the fullscreen element, so controls vanish even though the
      // player opened. Temporarily adopt the host into the fullscreen element and
      // restore it on exit.
      if (!useFloatingHost) {
        try {
          if (activeFS) {
            if (!activeFS.contains(hostElement)) moveHostIntoFullscreen(activeFS);
          } else {
            restoreFsHostIfNeeded();
          }
        } catch (e) {}
      } else if (!activeFS) {
        restoreFsHostIfNeeded();
      }

      // UNIVERSAL fill: whenever we're in native fullscreen, force the video to
      // fill the FS box (fixes "video in a corner, rest black" on generic sites);
      // remove the fill CSS when leaving fullscreen.
      if (activeFS) applyFullscreenFill(); else clearFullscreenFill();

      // If fullscreen ended by the user (Esc / system back), sync our state.
      if (!activeFS && isFullscreen) exitFullscreen();

      // Player box size changes drastically on FS toggle — recompute fill + AR a
      // few times (the browser/site lays out the video asynchronously).
      [60, 200, 500].forEach(function (d) { setTimeout(function () {
        if (isDestroyed) return;
        if (document.fullscreenElement || document.webkitFullscreenElement) applyFullscreenFill();
        applyAspectRatio();
      }, d); });
    }
    ['fullscreenchange', 'webkitfullscreenchange'].forEach(evt => {
      document.addEventListener(evt, onFullscreenChange);
    });


    /* ═══════════════════════════════════════════════════
     *  ROTATION
     * ═══════════════════════════════════════════════════ */
    const SCREEN_ORIENTATIONS = ['natural', 'landscape', 'portrait', 'landscape-secondary', 'portrait-secondary'];
    const SCREEN_ORI_LABELS = ['Natural', 'Landscape', 'Portrait', 'Land↩', 'Port↩'];

    function handleRotation() {
      if (IS_MOBILE) {
        screenRotIndex = (screenRotIndex + 1) % SCREEN_ORIENTATIONS.length;
        if (screen.orientation && screen.orientation.lock) {
          screen.orientation.lock(SCREEN_ORIENTATIONS[screenRotIndex]).catch(() => {});
        }
        const label = SCREEN_ORI_LABELS[screenRotIndex];
        rotateButton.textContent = '↻ ' + label;
        showToast('📱 ' + label);
      } else {
        rotationDeg = (rotationDeg + 90) % 360;
        rotateButton.textContent = '↻ ' + rotationDeg + '°';
        applyAspectRatio();
        showToast('↻ ' + rotationDeg + '°');
      }
      savePreferences();
    }

    rotateButton.addEventListener('click', function (e) {
      e.stopPropagation();
      handleRotation();
      resetAutoHide();
    });

    mirrorButton.addEventListener('click', function (e) {
      e.stopPropagation();
      isMirrored = !isMirrored;
      mirrorButton.classList.toggle('vm-active-state', isMirrored);
      applyAspectRatio();
      showToast(isMirrored ? '🪞 Mirrored' : '🪞 Normal');
      resetAutoHide();
    });


    /* ═══════════════════════════════════════════════════
     *  QUALITY SELECTOR
     *
     *  [CRIT-3] Fixed YouTube quality API
     *  [QUAL-1] getAvailableQualityLevels() returns string IDs
     *  [QUAL-2] setPlaybackQualityRange() takes string IDs
     * ═══════════════════════════════════════════════════ */
    /* ═══════════════════════════════════════════════════
     *  APPLY PREFERRED QUALITY (from popup default)
     *  target: 'auto' | 'lowest' | '2160' | '1440' | '1080'
     *          | '720' | '480' | '360' | '240' | '144'
     * ═══════════════════════════════════════════════════ */
    var _lastQualityTarget = null;
    var _lastDetectedQualities = [];   // filled by buildQualityOptions (for downloads)
    var _ytQualityCache = null;       // {cur, levels:[{id,height}]} from bridge
    var _ytQualityFetching = false;
    var _ytQualityRetries = 0;
    var _bgMediaPulledForBuild = false;
    var _genericQualityCache = null;  // [{height}] from page-world players
    var _genericQualityFetching = false;
    var _genericQualityRetries = 0;
    var _ytCaptionCache = null;       // [{i,name,code}] from bridge
    var _ytCaptionFetching = false;
    var _ytCaptionRetries = 0;
    function applyPreferredQuality(target) {
      if (!target) return;
      _lastQualityTarget = target;
      var wantAuto   = (target === 'auto');
      var wantLowest = (target === 'lowest');
      var targetH    = parseInt(target, 10); // NaN for auto/lowest

      // Choose the best level for targetH with the user's preferred behaviour:
      //   1) exact match
      //   2) else the NEXT HIGHER quality (e.g. want 360 → pick 480)
      //   3) else the highest available below target
      // levels: [{height, apply()}]; returns the chosen level or 'auto'/null.
      function pickAndApply(levels) {
        if (!levels || !levels.length) return false;
        var sorted = levels.slice().filter(function (l) { return l.height > 0; })
                           .sort(function (a, b) { return a.height - b.height; });
        if (!sorted.length) return false;
        if (wantAuto) return 'auto';
        var chosen;
        if (wantLowest) {
          chosen = sorted[0];
        } else {
          // exact
          for (var i = 0; i < sorted.length; i++) { if (sorted[i].height === targetH) { chosen = sorted[i]; break; } }
          // next higher
          if (!chosen) { for (var j = 0; j < sorted.length; j++) { if (sorted[j].height > targetH) { chosen = sorted[j]; break; } } }
          // else highest below target
          if (!chosen) chosen = sorted[sorted.length - 1];
        }
        try { chosen.apply(); return chosen; } catch (e) { return false; }
      }

      // ── HLS.js (our own instance) ──
      if (hlsInstance && hlsInstance.levels && hlsInstance.levels.length) {
        if (wantAuto) { hlsInstance.currentLevel = -1; showToast('🎬 Auto quality'); return; }
        var hlsLevels = hlsInstance.levels.map(function (lv, i) {
          return { height: lv.height || 0, apply: function () { hlsInstance.currentLevel = i; } };
        });
        var r = pickAndApply(hlsLevels);
        if (r && r !== 'auto') { showToast('🎬 ' + r.height + 'p'); return; }
      }

      // ── YouTube (via MAIN-world bridge — works desktop AND mobile) ──
      if (IS_YOUTUBE) {
        VMXBridge.call('yt-get-qualities', null, function (info) {
          if (!info || !info.levels || !info.levels.length) return;
          if (wantAuto) { VMXBridge.call('yt-set-quality', 'auto', function(){}); showToast('🎬 Auto quality'); return; }
          var lv = info.levels.filter(function (l) { return l.height > 0; })
                              .sort(function (a, b) { return a.height - b.height; });
          if (!lv.length) return;
          var pick;
          if (wantLowest) pick = lv[0];
          else {
            for (var i = 0; i < lv.length; i++) if (lv[i].height === targetH) { pick = lv[i]; break; }
            if (!pick) for (var j = 0; j < lv.length; j++) if (lv[j].height > targetH) { pick = lv[j]; break; }
            if (!pick) pick = lv[lv.length - 1];
          }
          VMXBridge.call('yt-set-quality', pick.id, function(){});
          showToast('🎬 ' + pick.height + 'p');
        });
        return; // bridge is async; don't fall through for YouTube
      }

      // ── Captured HLS manifest qualities ──
      if (capturedQualities && capturedQualities.length && !wantAuto) {
        var capLevels = capturedQualities.map(function (q) {
          return { height: q.height || 0, url: q.url, apply: function () {
            if (!this.url) return;
            var t = video.currentTime;
            if (isHlsUrl(this.url)) { tryAttachHls(this.url); }
            else { video.src = this.url; video.load(); }
            video.addEventListener('loadedmetadata', function () { video.currentTime = t; video.play().catch(function(){}); }, { once: true });
          } };
        });
        var rc = pickAndApply(capLevels);
        if (rc && rc !== 'auto') { showToast('🎬 ' + rc.height + 'p'); return; }
      }

      // ── <source> elements ──
      try {
        var srcs = Array.from(video.querySelectorAll('source'));
        if (srcs.length <= 1 && video.parentElement) srcs = Array.from(video.parentElement.querySelectorAll('source'));
        if (srcs.length > 1 && !wantAuto) {
          var srcLevels = srcs.map(function (s) {
            var u = s.src || s.getAttribute('data-src') || '';
            var m = (s.getAttribute('label') || s.getAttribute('data-res') || u).match(/(\d{3,4})/);
            return { height: m ? parseInt(m[1]) : 0, url: u, apply: function () {
              if (!this.url) return;
              var t = video.currentTime;
              video.src = this.url; video.load();
              video.addEventListener('loadedmetadata', function () { video.currentTime = t; video.play().catch(function(){}); }, { once: true });
            } };
          });
          var rs = pickAndApply(srcLevels);
          if (rs && rs !== 'auto') { showToast('🎬 ' + rs.height + 'p'); return; }
        }
      } catch (e) {}
      // Silent if nothing matched — quality stays as-is / Auto.
    }

    function buildQualityOptions() {
      qualityList.textContent = '';
      var qualityLevels = [];

      // Pull any streams the background sniffer caught (Twitch/FB/iframes),
      // then re-render if it found something new and we still have no levels.
      if (!_bgMediaPulledForBuild) {
        _bgMediaPulledForBuild = true;
        pullBackgroundMedia(function () {
          _bgMediaPulledForBuild = false;
          if (isHudVisible && capturedManifests.length && !capturedQualities.length) buildQualityOptions();
        });
      }

      // ─── STRATEGY 1: HLS.js levels (most reliable for HLS streams) ───
      if (hlsInstance && hlsInstance.levels && hlsInstance.levels.length > 1) {
        var curLvl = hlsInstance.currentLevel;
        qualityLevels = hlsInstance.levels.map(function (lv, i) {
          return {
            label: (lv.height || '?') + 'p' + (lv.bitrate ? ' (' + Math.round(lv.bitrate / 1000) + 'k)' : ''),
            id: i, type: 'hls', isActive: i === curLvl
          };
        });
        qualityLevels.unshift({ label: 'Auto', id: -1, type: 'hls', isActive: curLvl === -1 });
      }

      // ─── STRATEGY 1a: Cross-frame relay (anime3rb: labels in parent page) ───
      // The parent page scraped its quality labels+links and postMessaged them
      // down to us (the player iframe). Prefer these when the local player only
      // exposes the single current quality.
      if (qualityLevels.length <= 1 && relayedQualities && relayedQualities.length > 1) {
        qualityLevels = relayedQualities.map(function (q, i) {
          return {
            label: q.label, id: i,
            // /download/ pages 302-redirect to the direct .mp4 — treat as a
            // swappable source (video.src accepts the redirect); non-media just opens.
            type: 'source', srcUrl: q.url,
            isActive: false
          };
        });
      }

      // ─── STRATEGY 1b: Captured progressive .mp4 URLs with quality labels ───
      // Sites like anime3rb serve one direct .mp4 per quality (480p.mp4,
      // 720p.mp4, 1080p.mp4). Our network sniffer captures these with a height
      // label — promote them, grouped and sorted by resolution.
      if (qualityLevels.length <= 1 && capturedVideoUrls.length) {
        var byH = {};
        capturedVideoUrls.forEach(function (v) {
          // derive height: from label ("720p") or a NNNp token in the URL
          var h = 0;
          if (v.label) { var lm = v.label.match(/(\d{3,4})/); if (lm) h = parseInt(lm[1], 10); }
          if (!h) { var um = (v.url || '').match(/(\d{3,4})p\b/i); if (um) h = parseInt(um[1], 10); }
          if (!h) return;
          // keep the most recent URL per height (tokens can expire)
          if (!byH[h] || (v.time || 0) > (byH[h].time || 0)) byH[h] = v;
        });
        var hs = Object.keys(byH).map(Number).sort(function (a, b) { return b - a; });
        if (hs.length > 1) {
          qualityLevels = hs.map(function (h, i) {
            var v = byH[h];
            return { label: h + 'p', id: i, type: 'source', srcUrl: v.url,
                     isActive: v.url === (video.currentSrc || video.src) };
          });
        }
      }

      // ─── STRATEGY 2: Captured network manifests (m3u8/mpd intercepted) ───
      if (qualityLevels.length <= 1 && capturedQualities.length > 0) {
        qualityLevels = capturedQualities.map(function (q, i) {
          return { label: q.label, id: i, type: 'manifest-hls', srcUrl: q.url, isActive: false };
        });
      }
      // Try to parse any captured manifest we haven't parsed yet (HLS or DASH)
      if (qualityLevels.length <= 1 && capturedManifests.length > 0) {
        for (var mi = 0; mi < capturedManifests.length; mi++) {
          if (!capturedManifests[mi]._parsed) {
            capturedManifests[mi]._parsed = true;
            var _parser = (capturedManifests[mi].type === 'dash') ? parseDashManifest : parseHLSManifest;
            _parser(capturedManifests[mi].url, function (quals) {
              if (quals.length > 0) { capturedQualities = quals; if (isHudVisible) buildQualityOptions(); }
            });
            break;
          }
        }
      }

      // ─── STRATEGY 3a: Dailymotion metadata API
      if (/dailymotion/.test(location.hostname) && qualityLevels.length < 2) {
        var dmMatch = location.pathname.match(/\/video\/([a-zA-Z0-9]+)/);
        if (dmMatch && dmMatch[1]) {
          var dmId = dmMatch[1];
          (function(dmid) {
            fetch('https://www.dailymotion.com/player/metadata/video/' + dmid, { credentials: 'omit' })
              .then(function(r) { return r.json(); })
              .then(function(data) {
                if (data && data.qualities) {
                  qualityLevels = Object.keys(data.qualities)
                    .map(function(qk) {
                      var h = parseInt(qk.replace(/[^0-9]/g,''));
                      return h > 80 && h < 5000 ? { label: h+'p', height: h, type: 'dailymotion', id: qk } : null;
                    }).filter(Boolean)
                    .concat(qualityLevels)
                    .sort(function(a,b) { return (b.height||0) - (a.height||0); });
                  // Deduplicate
                  var seen = {}; qualityLevels = qualityLevels.filter(function(q) { if (seen[q.height]) return false; seen[q.height]=true; return true; });
                  qualityList.textContent = '';
                  // Re-render (inline forEach)
                  if (!qualityLevels.length) {
                    var ei = document.createElement('div'); ei.className='vm-quality-item'; ei.textContent='⚡ Auto';
                    qualityList.appendChild(ei);
                  } else {
                    qualityLevels.forEach(function(lv) {
                      var h = lv.height; var isAuto = false;
                      var item = document.createElement('div'); item.className = 'vm-quality-item' + (lv.isActive ? ' vm-selected' : '');
                      var ls = document.createElement('span'); ls.className = 'vm-qlabel'; ls.textContent = lv.label || (h ? h+'p' : 'Auto');
                      if (h > 0) {
                        var b = document.createElement('span'); b.className = 'vm-qbadge';
                        if (h <= 240) { b.className += ' low-badge'; b.textContent = '🌱 Data Saver'; }
                        else if (h <= 360) { b.className += ' low-badge'; b.textContent = 'Low'; }
                        else if (h >= 2160) { b.className += ' high-badge'; b.textContent = '4K'; }
                        else if (h >= 1440) { b.className += ' high-badge'; b.textContent = 'HD'; }
                        if (b.textContent) ls.appendChild(b);
                      }
                      item.appendChild(ls);
                      var ck = document.createElement('span'); ck.className='vm-qcheck'; ck.textContent='✓';
                      if (lv.isActive) item.appendChild(ck);
                      item.addEventListener('click', function() { if (typeof applyQualityLevel === 'function') applyQualityLevel(lv); });
                      qualityList.appendChild(item);
                    });
                  }
                }
              }).catch(function(){});
          })(dmMatch[1]);
        }
      }

      // --- STRATEGY 3: YouTube via MAIN-world bridge (desktop + mobile) ───
      // The page-world API isn't reachable synchronously here, so we fetch it
      // asynchronously and re-render the list when it arrives. Cache the result
      // so the synchronous render below can use it on subsequent calls.
      if (IS_YOUTUBE) {
        if (_ytQualityCache && _ytQualityCache.levels && _ytQualityCache.levels.length > 1) {
          qualityLevels = _ytQualityCache.levels.map(function (l) {
            var finalLabel = l.label || YT_QUALITY_MAP[l.id] || (l.height ? l.height + 'p' : l.id);
            if (l.native && YT_QUALITY_MAP[l.id]) finalLabel = YT_QUALITY_MAP[l.id];
            return { label: finalLabel, id: l.id,
                     type: 'youtube', isActive: l.id === _ytQualityCache.cur };
          });
          qualityLevels.unshift({ label: 'Auto', id: 'auto', type: 'youtube', isActive: _ytQualityCache.cur === 'auto' || !_ytQualityCache.cur });
        } else {
          // Kick off async fetch; re-render when it returns. YouTube exposes
          // quality levels only after playback starts, so retry a few times.
          if (!_ytQualityFetching) {
            _ytQualityFetching = true;
            VMXBridge.call('yt-get-qualities', null, function (info) {
              _ytQualityFetching = false;
              if (info && info.levels && info.levels.length > 1) {
                _ytQualityCache = info;
                if (isHudVisible) buildQualityOptions();
              } else if (_ytQualityRetries < 12) {
                _ytQualityRetries++;
                setTimeout(function () { if (isHudVisible) buildQualityOptions(); }, 800);
              }
            });
          }
        }
      }

      // ─── STRATEGY 3b: Page-world players (video.js / JW / hls.js) via bridge ───
      if (qualityLevels.length <= 1 && !IS_YOUTUBE) {
        if (_genericQualityCache && _genericQualityCache.length > 1) {
          var seenH = {};
          var gq = _genericQualityCache.filter(function (l) {
            if (!l.height || seenH[l.height]) return false; seenH[l.height] = 1; return true;
          }).sort(function (a, b) { return b.height - a.height; });
          if (gq.length > 1) {
            qualityLevels = gq.map(function (l, i) {
              var isManifest = l.url && (l.url.includes('.m3u8') || l.url.includes('.mpd'));
              var isDirect = l.url && !isManifest && (l.kind === 'fb-progressive' || l.kind === 'fb-hd' || l.kind === 'fb-playable' || l.kind === 'tiktok-bitrate' || l.kind === 'video-src');
              return { 
                label: (l.label && /\d/.test(l.label)) ? l.label : (l.height + 'p'),
                id: i, 
                type: isManifest ? 'manifest-hls' : (isDirect ? 'source' : 'bridge-generic'), 
                height: l.height, 
                kind: l.kind, 
                srcUrl: l.url,
                isActive: false 
              };
            });
          }
        } else if (!_genericQualityFetching) {
          _genericQualityFetching = true;
          VMXBridge.call('generic-qualities', null, function (list) {
            _genericQualityFetching = false;
            if (list && list.length > 1) {
              _genericQualityCache = list; if (isHudVisible) buildQualityOptions();
            } else if (_genericQualityRetries < 15) {
              // Player-world quality lists (JWPlayer on wco.tv, video.js, hls.js)
              // are populated asynchronously AFTER playback starts. Retry a few
              // times before giving up, exactly like the YouTube bridge does.
              _genericQualityRetries++;
              setTimeout(function () { if (isHudVisible) buildQualityOptions(); }, 900);
            }
          });
        }
      }

      // ─── STRATEGY 3c: Facebook inline DASH manifest (FBQualityLabel + BaseURL) ───
      // Verified from real FB traffic: the page embeds an ESCAPED DASH manifest
      // containing <Representation mimeType="video/mp4" FBQualityLabel="720p"
      // ...><BaseURL>https://…fbcdn.net/….mp4</BaseURL>. Each BaseURL is a
      // directly-playable progressive .mp4 for that exact quality.
      if (qualityLevels.length <= 1 && IS_FACEBOOK) {
        try {
          // Un-escape the JSON-embedded markup so we can regex the XML.
          var raw = document.documentElement.innerHTML;
          var html = raw.replace(/\\u003C/gi, '<').replace(/\\u003E/gi, '>')
                        .replace(/\\\//g, '/').replace(/\\"/g, '"').replace(/\\u0026/gi, '&');
          var fbQ = [];
          var reRep = /<Representation\b([^>]*?)>[\s\S]*?<BaseURL>\s*([^<\s]+)\s*<\/BaseURL>/gi;
          var mm;
          while ((mm = reRep.exec(html))) {
            var attrs = mm[1], base = mm[2];
            if (!/video\/mp4/i.test(attrs)) continue;          // video reps only
            var lab = attrs.match(/FBQualityLabel="([^"]+)"/i);
            var hgt = attrs.match(/\bheight="(\d{2,4})"/i);
            var h = hgt ? parseInt(hgt[1], 10) : (lab ? parseInt(lab[1], 10) : 0);
            var label = lab ? lab[1] : (h ? h + 'p' : '');
            if (!label || !base) continue;
            fbQ.push({ label: label, height: h || parseInt(label, 10) || 0, url: base });
          }
          // Fallback: progressive URLs FB embeds under several key names across
          // its web + mobile + GraphQL responses. Try them all (HD then SD).
          function deesc(u){ return u.replace(/\\\//g,'/').replace(/\\u0026/gi,'&').replace(/\\u0025/gi,'%').replace(/\\u003D/gi,'=').replace(/\\/g,''); }
          if (fbQ.length < 2) {
            var hdKeys = ['playable_url_quality_hd','browser_native_hd_url','hd_src_no_ratelimit','hd_src','progressive_url'];
            var sdKeys = ['playable_url','browser_native_sd_url','sd_src_no_ratelimit','sd_src'];
            hdKeys.forEach(function (k) {
              if (fbQ.some(function(q){return q.label==='HD';})) return;
              var m = raw.match(new RegExp('"' + k + '"\\s*:\\s*"([^"]+\\.mp4[^"]*)"', 'i'));
              if (m) fbQ.push({ label: 'HD', height: 720, url: deesc(m[1]) });
            });
            sdKeys.forEach(function (k) {
              if (fbQ.some(function(q){return q.label==='SD';})) return;
              var m = raw.match(new RegExp('"' + k + '"\\s*:\\s*"([^"]+\\.mp4[^"]*)"', 'i'));
              if (m) fbQ.push({ label: 'SD', height: 360, url: deesc(m[1]) });
            });
          }
          // MOBILE FALLBACK (m.facebook.com): the page does NOT embed the DASH
          // manifest in HTML. Instead every progressive .mp4 we sniff carries an
          // `efg` param = base64 JSON with a "vencode_tag" like
          // "xpv_progressive.FACEBOOK..C3.640.sve_sd" — the number (640/360/…)
          // is the resolution key. Decode it from all captured fbcdn URLs so we
          // can at least LIST + swap to each captured quality.
          if (fbQ.length < 2 && capturedVideoUrls.length) {
            capturedVideoUrls.forEach(function (v) {
              var u = v.url || '';
              if (!/fbcdn|facebook/i.test(u)) return;
              var efg = u.match(/[?&]efg=([^&]+)/);
              var h = 0, lab = '';
              if (efg) {
                try {
                  var dec = decodeURIComponent(efg[1]);
                  var pad = dec + '==='.slice((dec.length + 3) % 4);
                  var json = JSON.parse(atob(pad.replace(/-/g,'+').replace(/_/g,'/')));
                  var tag = json.vencode_tag || '';
                  var tm = tag.match(/\.C\d+\.(\d{3,4})\./);
                  if (tm) h = parseInt(tm[1], 10);
                } catch (e) {}
              }
              if (!h) { var bt = u.match(/[?&]bitrate=(\d+)/); }         // bitrate as tiebreaker only
              if (h) fbQ.push({ label: h + 'p', height: h, url: u });
            });
          }
          var seenFb = {};
          fbQ = fbQ.filter(function (q) {
            var k = q.height || q.label;
            if (!q.url || seenFb[k]) return false; seenFb[k] = 1; return true;
          }).sort(function (a, b) { return (b.height || 0) - (a.height || 0); });
          if (fbQ.length > 1) {
            qualityLevels = fbQ.map(function (q, i) {
              return { label: q.label, id: i, type: 'source', srcUrl: q.url, isActive: false };
            });
          }
        } catch (e) {}
      }

      // ─── STRATEGY 4: <source> elements (video + parent + grandparent) ───
      if (qualityLevels.length <= 1) {
        var sources = [];
        try {
          sources = Array.from(video.querySelectorAll('source'));
          if (sources.length <= 1 && video.parentElement)
            sources = Array.from(video.parentElement.querySelectorAll('source'));
          if (sources.length <= 1 && video.parentElement && video.parentElement.parentElement)
            sources = Array.from(video.parentElement.parentElement.querySelectorAll('source'));
        } catch (e) {}

        if (sources.length > 1) {
          qualityLevels = sources.map(function (s, i) {
            var lbl = s.getAttribute('label') || s.getAttribute('data-quality') ||
              s.getAttribute('data-res') || s.getAttribute('size') || s.getAttribute('title') || '';
            if (!lbl) {
              var url = s.src || s.getAttribute('data-src') || '';
              var rm = url.match(/(\d{3,4})[pP]/);
              lbl = rm ? rm[1] + 'p' : 'Source ' + (i + 1);
            }
            return {
              label: lbl, id: i, type: 'source',
              srcUrl: s.src || s.getAttribute('data-src') || '',
              isActive: (s.src || '') === video.currentSrc
            };
          });
        }
      }

      // ─── STRATEGY 5: Third-party player APIs (Plyr, VideoJS, JWPlayer) ───
      if (qualityLevels.length <= 1) {
        try {
          // Plyr
          var plyrEl = video.closest('.plyr');
          var plyrInst = plyrEl ? (plyrEl.__plyr || window.player || window.plyr) : null;
          if (plyrInst && plyrInst.quality && Array.isArray(plyrInst.quality.options) && plyrInst.quality.options.length > 1) {
            var pCur = plyrInst.quality.value || plyrInst.quality;
            qualityLevels = plyrInst.quality.options.map(function (q) {
              return { label: q + 'p', id: q, type: 'plyr', isActive: q === pCur };
            });
          }
          // VideoJS
          if (qualityLevels.length <= 1 && video.player && typeof video.player.qualityLevels === 'function') {
            var vjsLvls = video.player.qualityLevels();
            if (vjsLvls && vjsLvls.length > 1) {
              qualityLevels = [];
              for (var vi = 0; vi < vjsLvls.length; vi++) {
                qualityLevels.push({
                  label: (vjsLvls[vi].height || '?') + 'p', id: vi,
                  type: 'videojs', isActive: vjsLvls[vi].enabled
                });
              }
            }
          }
          // JWPlayer
          if (qualityLevels.length <= 1 && window.jwplayer) {
            var jwp = window.jwplayer();
            if (jwp && typeof jwp.getQualityLevels === 'function') {
              var jwLvls = jwp.getQualityLevels() || [];
              var jwCur = typeof jwp.getCurrentQuality === 'function' ? jwp.getCurrentQuality() : -1;
              if (jwLvls.length > 1) {
                qualityLevels = jwLvls.map(function (lv, i) {
                  return { label: lv.label || (lv.height || '?') + 'p', id: i, type: 'jwplayer', isActive: i === jwCur };
                });
              }
            }
          }
        } catch (e) {}
      }

      // ─── STRATEGY 6: DOM quality buttons (anime sites, custom players) ───
      if (qualityLevels.length <= 1) {
        try {
          var selectors = [
            '[data-quality]', '[data-res]', '[data-resolution]',
            '.quality-selector button', '.quality-selector a', '.quality-selector li',
            '.quality-menu button', '.quality-menu a', '.quality-menu li',
            '.setting-quality a', '.setting-quality button',
            '.quality-list li', '.quality-list a',
            'button[class*="quality"]', 'a[class*="quality"]',
            '.jw-quality-item', '.vjs-quality-item',
            '.resolution-item', '.res-item',
            'select[class*="quality"] option', 'select[class*="res"] option',
          ];
          var qEls = document.querySelectorAll(selectors.join(','));
          if (qEls.length > 1) {
            qualityLevels = Array.from(qEls).map(function (el, i) {
              var txt = (el.textContent || el.value || '').trim();
              return {
                label: txt || 'Q' + (i + 1), id: i, type: 'dom-quality', element: el,
                isActive: el.classList.contains('active') || el.classList.contains('selected') ||
                  el.classList.contains('current') || el.getAttribute('aria-checked') === 'true' || el.selected
              };
            }).filter(function (q) { return q.label.length > 0 && q.label.length < 40; });
          }
        } catch (e) {}
      }

      // ─── STRATEGY 7: Check if site has quality in URL params ───
      if (qualityLevels.length <= 1) {
        try {
          var curSrc = video.currentSrc || video.src || '';
          // Many sites encode quality in URL: ...&quality=720p or ...&q=1080
          var urlObj = new URL(curSrc, location.href);
          var qParam = urlObj.searchParams.get('quality') || urlObj.searchParams.get('q') || 
                       urlObj.searchParams.get('res') || urlObj.searchParams.get('r') || '';
          if (qParam) {
            // Try common quality values
            var commonQ = ['2160', '1440', '1080', '720', '480', '360', '240'];
            var foundQualities = [];
            for (var ci = 0; ci < commonQ.length; ci++) {
              var testUrl = new URL(curSrc, location.href);
              var paramName = urlObj.searchParams.has('quality') ? 'quality' : 
                              urlObj.searchParams.has('q') ? 'q' : 
                              urlObj.searchParams.has('res') ? 'res' : 'r';
              testUrl.searchParams.set(paramName, commonQ[ci]);
              foundQualities.push({
                label: commonQ[ci] + 'p',
                id: ci,
                type: 'source',
                srcUrl: testUrl.href,
                isActive: qParam === commonQ[ci] || qParam === commonQ[ci] + 'p'
              });
            }
            if (foundQualities.length > 1) qualityLevels = foundQualities;
          }
        } catch (e) {}
      }

      // ─── STRATEGY 8: Use captured network video URLs ───
      if (qualityLevels.length <= 1 && capturedVideoUrls.length > 1) {
        // Group by resolution
        var byRes = {};
        capturedVideoUrls.forEach(function (v) {
          var key = v.label || v.format || 'unknown';
          if (!byRes[key]) byRes[key] = v;
        });
        var keys = Object.keys(byRes);
        if (keys.length > 1) {
          qualityLevels = keys.map(function (k, i) {
            var v = byRes[k];
            return {
              label: (v.label || v.format) + (v.label && v.format ? ' · ' + v.format : ''),
              id: i, type: 'source', srcUrl: v.url,
              isActive: v.url === (video.currentSrc || video.src)
            };
          });
        }
      }

      // ─── STRATEGY 9: videoTracks API ───
      if (qualityLevels.length <= 1 && video.videoTracks && video.videoTracks.length > 1) {
        qualityLevels = Array.from(video.videoTracks).map(function (t, i) {
          return { label: t.label || 'Track ' + (i + 1), id: i, type: 'videotrack', isActive: t.selected };
        });
      }

      // ─── STRATEGY 10: Scan page source for video URLs with quality info ───
      if (qualityLevels.length <= 1) {
        try {
          var pageText = document.documentElement.innerHTML;
          // Find URLs with resolution patterns
          var vidPattern = /https?:\/\/[^"'\s<>]+(?:360|480|720|1080|1440|2160)[pP]?[^"'\s<>]*\.(?:mp4|webm|m3u8)/gi;
          var qualMatch;
          var pageQuals = [];
          while ((qualMatch = vidPattern.exec(pageText)) !== null && pageQuals.length < 10) {
            var qUrl = qualMatch[0];
            var qRes = qUrl.match(/(360|480|720|1080|1440|2160)/);
            if (qRes && !pageQuals.find(function (q) { return q.srcUrl === qUrl; })) {
              pageQuals.push({
                label: qRes[1] + 'p',
                id: pageQuals.length,
                type: 'source',
                srcUrl: qUrl,
                isActive: qUrl === (video.currentSrc || video.src)
              });
            }
          }
          if (pageQuals.length > 1) qualityLevels = pageQuals;
        } catch (e) {}
      }

      // ─── STRATEGY 11: Quality labels paired with nearby links (anime3rb…) ───
      // Innovative proximity pairing: many sites (anime3rb) list a quality LABEL
      // ("جودة عالية [1080p]", "720p") in one element and its download/stream
      // URL in a SEPARATE nearby element. We collect all quality labels and all
      // candidate media/download links, then pair each label with the closest
      // link by DOM traversal distance.
      if (qualityLevels.length <= 1) {
        try {
          // Gather docs to scan: this document + same-origin parent (embed case)
          var docs = [document];
          try { if (window.top !== window && window.top.document) docs.push(window.top.document); } catch (e) {}

          var VALID_H = { 144:1,240:1,360:1,480:1,540:1,720:1,1080:1,1440:1,2160:1,4320:1 };
          var pairs = {}; // height -> url

          docs.forEach(function (doc) {
            // 1) Candidate links: /download/ endpoints or direct media URLs.
            var linkEls = Array.prototype.slice.call(
              doc.querySelectorAll('a[href*="/download/"], a[href*=".mp4"], a[href*=".m3u8"], a[href*=".webm"], a[download], [data-src*=".mp4"], [data-url*="/download/"]')
            );
            // 2) All elements whose OWN text carries a quality label.
            var all = doc.querySelectorAll('a,button,label,span,div,li,option,[data-quality],[data-res]');
            var labels = [];
            for (var i = 0; i < all.length; i++) {
              var el = all[i];
              // own text only (avoid huge containers) — use direct text length guard
              var t = (el.getAttribute && (el.getAttribute('data-quality') || el.getAttribute('data-res'))) ||
                      (el.childElementCount <= 3 ? (el.textContent || '') : (el.getAttribute('aria-label') || el.title || ''));
              t = (t || '').trim();
              if (!t || t.length > 80) continue;
              var mm = t.match(/(\d{3,4})\s*[pP]\b/) || t.match(/\[(\d{3,4})\s*p\]/i);
              if (!mm) continue;
              var hh = parseInt(mm[1], 10);
              if (!VALID_H[hh]) continue;
              labels.push({ h: hh, el: el });
            }
            if (!labels.length) return;

            function resolveHref(a) {
              var u = a.getAttribute('href') || a.getAttribute('data-src') || a.getAttribute('data-url') || '';
              if (!u) return '';
              try { return new URL(u, doc.baseURI || location.href).href; } catch (e) { return u; }
            }
            // DOM distance between two nodes (index difference in a flat walk).
            function domIndex(node, list) { return Array.prototype.indexOf.call(list, node); }
            var flat = doc.querySelectorAll('*');

            labels.forEach(function (lab) {
              // If the label itself is/contains a link, use it directly.
              var direct = (lab.el.matches && lab.el.matches('a[href]')) ? lab.el : (lab.el.querySelector && lab.el.querySelector('a[href*="/download/"],a[href*=".mp4"],a[href*=".m3u8"],a[href]'));
              var chosen = direct || null;
              if (!chosen && linkEls.length) {
                // Pair with the nearest link by flat DOM index distance.
                var li = domIndex(lab.el, flat);
                var best = null, bestD = Infinity;
                linkEls.forEach(function (a) {
                  var d = Math.abs(domIndex(a, flat) - li);
                  if (d < bestD) { bestD = d; best = a; }
                });
                // Only accept if reasonably close (same card/section).
                if (best && bestD < 40) chosen = best;
              }
              if (chosen) {
                var href = resolveHref(chosen);
                if (href && !pairs[lab.h]) pairs[lab.h] = href;
              }
            });
          });

          var hs = Object.keys(pairs).map(Number).sort(function (a, b) { return b - a; });
          if (hs.length > 1) {
            qualityLevels = hs.map(function (h, i) {
              var url = pairs[h];
              // /download/ pages need opening; direct media can be swapped as source.
              var isMedia = /\.(mp4|webm|m3u8|mkv|m4v)(\?|$)/i.test(url);
              return {
                label: h + 'p', id: i,
                type: isMedia ? 'source' : 'open-url',
                srcUrl: url,
                isActive: false
              };
            });
          }
        } catch (e) {}
      }

      // ─── QUETTA v2.5 PARSED LADDER ───
      // The background engine resolves HLS master variants and DASH
      // representations (including separate audio metadata) before persisting.
      if (qualityLevels.length <= 1 && _quettaSources && _quettaSources.length) {
        try {
          var qParsed = [];
          _quettaSources.forEach(function (qItem) {
            if (!qItem) return;
            if (qItem.noDL === 'drm' || qItem.drm === true) { markDynamicDrm('protected manifest'); return; }
            var qExt = String(qItem.ext || '').toLowerCase();
            (qItem.resolutions || []).forEach(function (qLevel, qIndex) {
              if (!qLevel || !qLevel.url) return;
              var qHeight = parseInt(qLevel.height || qLevel.quality || 0, 10) || 0;
              qParsed.push({
                label: (qHeight ? qHeight + 'p' : (qLevel.quality || 'Source')) + ' · ' + String(qLevel.format || qItem.outputFormat || qExt || 'video').toUpperCase(),
                height: qHeight,
                id: qIndex,
                type: (qExt === 'mpd' || qExt === 'dash') ? 'quetta-download' : 'source',
                srcUrl: qLevel.url,
                qItem: qItem,
                qLevel: qLevel,
                isActive: qLevel.url === (video.currentSrc || video.src)
              });
            });
          });
          if (qParsed.length) {
            qParsed.sort(function (a, b) { return (b.height || 0) - (a.height || 0); });
            qualityLevels = qParsed;
          }
        } catch (e) {}
      }

      // ─── NO QUALITIES FOUND — show current info ───
      if (qualityLevels.length <= 1 && !(qualityLevels[0] && qualityLevels[0].qItem)) {
        var vw = video.videoWidth, vh = video.videoHeight;
        var infoEl = createElement('div', 'vm-quality-item');
        infoEl.style.opacity = '0.5';
        if (vw && vh) {
          var mx = Math.max(vw, vh);
          var ql = mx >= 2160 ? '4K' : mx >= 1440 ? '1440p' : mx >= 1080 ? '1080p' : mx >= 720 ? '720p' : mx >= 480 ? '480p' : 'SD';
          infoEl.textContent = ql + ' · ' + vw + '×' + vh;
          if (IS_YOUTUBE) infoEl.textContent += ' (use YT ⚙ for quality)';
          else if (isDrmProtected()) infoEl.textContent += ' — set quality in the site player (DRM stream)';
        } else if (isDrmProtected()) {
          infoEl.textContent = 'DRM stream — change quality in the site\'s own player settings';
        } else {
          infoEl.textContent = 'Quality managed by site';
        // Add yt-dlp hint (skip on DRM sites — it can't fetch DRM streams either)
        if (!isDrmProtected()) {
          var ytdlpHint = createElement('div', 'vm-quality-item');
          ytdlpHint.style.cssText = 'font-size:11px;color:var(--vm-red);cursor:pointer';
          ytdlpHint.textContent = '💡 Use yt-dlp for all qualities';
          ytdlpHint.addEventListener('click', function () {
            var cmd = 'yt-dlp -F "' + location.href + '"';
            navigator.clipboard.writeText(cmd).then(function () {
              showToast('📋 yt-dlp command copied! Run in terminal');
            }).catch(function () { prompt('Copy:', cmd); });
            qualityPanel.classList.remove('vm-visible');
          });
          qualityList.appendChild(ytdlpHint);
        }
        }
        qualityList.appendChild(infoEl);
        return;
      }

      // Expose detected levels (with any direct srcUrls) to the download panel.
      try { _lastDetectedQualities = qualityLevels.slice(); } catch (e) {}

      // Apply a detected quality level (shared by clicks + the MAX button).
      function applyQualityLevel(lv) {
        // A manual pick always wins over the deferred "apply saved default
        // quality" retries — otherwise one of those retries can fire a
        // second later and silently revert this choice back to the default.
        try { _autoQualityTimers.forEach(clearTimeout); _autoQualityTimers.length = 0; } catch (e) {}
        if (lv.type === 'hls' && hlsInstance) {
          hlsInstance.currentLevel = lv.id;
        } else if (lv.type === 'youtube') {
          VMXBridge.call('yt-set-quality', lv.id, function(){});
          _ytQualityCache = null; // force refresh
        } else if (lv.type === 'bridge-generic') {
          VMXBridge.call('generic-set-quality', lv.height, function(){});
          _genericQualityCache = null; // force refresh
        } else if (lv.type === 'dom-quality' && lv.element) {
          try { lv.element.click(); } catch(e){}
        } else if (lv.type === 'dailymotion') {
          let worked = false;
          try { var p = video.closest('.player'); if (p && p.player && typeof p.player.setQuality === 'function') { p.player.setQuality(lv.height); worked = true; } } catch(e){}
          if (!worked) { VMXBridge.call('generic-set-quality', lv.height, function(){}); }
        } else if (lv.type === 'plyr') {
          try { var plyrEl = video.closest('.plyr'); var pi = plyrEl ? (plyrEl.__plyr || window.player || window.plyr) : null; if (pi) pi.quality = lv.id; } catch (e) {}
        } else if (lv.type === 'jwplayer' || lv.type === 'videojs') {
          VMXBridge.call('generic-set-quality', lv.height || parseInt(lv.label), function(){});
          _genericQualityCache = null;
        } else if (lv.type === 'source' || lv.type === 'manifest-hls') {
          if (lv.srcUrl) {
            var t = video.currentTime;
            if (/\.m3u8(\?|#|$)/i.test(lv.srcUrl) || lv.type === 'manifest-hls') {
              tryAttachHls(lv.srcUrl);
              video.addEventListener('loadedmetadata', function () {
                try { video.currentTime = t; } catch (e) {} video.play().catch(function(){});
              }, { once: true });
            } else {
              if (video.src !== lv.srcUrl && !video.src.includes(lv.srcUrl)) {
                var wasLooping = video.loop;
                if (wasLooping) video.loop = false;
                video.src = lv.srcUrl; video.load();
                video.addEventListener('loadedmetadata', function () {
                  video.currentTime = t;
                  if (wasLooping) video.loop = true;
                  video.play().catch(function(){});
                }, { once: true });
              }
            }
          }
        } else if (lv.type === 'open-url') {
          try { window.open(lv.srcUrl, '_blank', 'noopener'); } catch (e) {}
        } else if (lv.type === 'quetta-download') {
          startQuettaDownload(lv.qItem, lv.qLevel, document.title || 'VideoMax video');
        } else if (lv.type === 'dom-quality' && lv.element) {
          try { lv.element.click(); } catch (e) {}
        } else if (lv.type === 'videotrack') {
          Array.from(video.videoTracks).forEach(function (t, i) { t.selected = (i === lv.id); });
        }
        showToast('🎬 ' + lv.label);
        closeAllPanels();
        setTimeout(buildQualityOptions, 600);
      }

      // ─── SMART "⚡ MAX" — one-tap highest quality ───
      // Picks the level with the greatest resolution/height (ignoring "Auto").
      // Works across every detection type, so it's a universal "give me the best".
      (function addMaxButton() {
        var real = qualityLevels.filter(function (l) {
          return l && String(l.label).toLowerCase().indexOf('auto') === -1;
        });
        if (real.length < 2) return;
        function heightOf(l) {
          if (typeof l.height === 'number' && l.height) return l.height;
          var m = String(l.label || '').match(/(\d{3,4})/);
          return m ? parseInt(m[1], 10) : 0;
        }
        var best = real.slice().sort(function (a, b) { return heightOf(b) - heightOf(a); })[0];
        if (!best) return;
        var maxItem = createElement('div', 'vm-quality-item vm-quality-max');
        maxItem.textContent = '⚡ MAX — ' + (best.label || 'Best');
        maxItem.style.cssText = 'font-weight:800;color:#22c55e';
        maxItem.addEventListener('click', function () { applyQualityLevel(best); });
        qualityList.appendChild(maxItem);
      })();

      try {
        var validLevels = qualityLevels.filter(function(l){ return l.id !== 'auto' && l.id !== -1; });
        if (validLevels.length > 0) {
           var heights = validLevels.map(function(l) { return l.height || parseInt(String(l.label).replace(/[^0-9]/g,'')) || 0; }).filter(Boolean).sort(function(a,b){return b-a;});
           if (heights.length) {
              var qText = heights[0] + 'p' + (heights.length > 1 ? ' • ' + heights.length + 'q' : '');
              window.postMessage({ __vmx: true, dir: 'up-quality-info', quality: qText }, '*');
           }
        }
      } catch(e) {}

      // ─── RENDER QUALITY OPTIONS ─── improved card UI
      qualityLevels.forEach(function (lv) {
        var height = lv.height || (lv.label ? parseInt(String(lv.label).replace(/[^0-9]/g,'')) : 0);
        var isAuto = lv.label === 'Auto' || lv.type === 'auto' || lv.id === -1;
        var item = createElement('div', 'vm-quality-item' + (lv.isActive ? ' vm-selected' : ''));
        
        var labelSpan = document.createElement('span');
        labelSpan.className = 'vm-qlabel';
        labelSpan.textContent = isAuto ? ('⚡ ' + lv.label) : (lv.label || (height ? height + 'p' : 'Auto'));
        if (!isAuto && height > 0) {
          var badge = document.createElement('span');
          badge.className = 'vm-qbadge';
          if (height <= 240) { badge.className += ' low-badge'; badge.textContent = '🌱 Data Saver'; }
          else if (height <= 360) { badge.className += ' low-badge'; badge.textContent = 'Low'; }
          else if (height >= 2160) { badge.className += ' high-badge'; badge.textContent = '4K'; }
          else if (height >= 1440) { badge.className += ' high-badge'; badge.textContent = 'HD'; }
          if (badge.textContent) labelSpan.appendChild(badge);
        }
        item.appendChild(labelSpan);
        
        if (!isAuto && (lv.bitrate || lv.bandwidth)) {
          var small = document.createElement('small');
          small.textContent = Math.round((lv.bitrate || lv.bandwidth || 0) / 1000) + 'k';
          item.appendChild(small);
        }
        
        var check = document.createElement('span');
        check.className = 'vm-qcheck';
        check.textContent = '✓';
        if (lv.isActive) item.appendChild(check);
        
        item.addEventListener('click', function () { applyQualityLevel(lv); });
        qualityList.appendChild(item);
      });
    }

        /* ═══════════════════════════════════════════════════
     *  SUBTITLE SYSTEM
     * ═══════════════════════════════════════════════════ */
    function clearSubtitleInterval() {
      if (subtitleIntervalId) {
        clearInterval(subtitleIntervalId);
        subtitleIntervalId = null;
      }
    }

    function buildSubtitleOptions() {
      subtitleList.textContent = '';

      // Off option
      var offItem = createElement('div', 'vm-subtitle-item' + (activeSubtitleIndex === -1 ? ' vm-selected' : ''), 'Off');
      offItem.addEventListener('click', function () {
        disableSubtitles();
        subtitlePanel.classList.remove('vm-visible');
      });
      subtitleList.appendChild(offItem);

      // ─── MEGA SUBTITLE DETECTION ───

      // Strategy 1: <track> elements everywhere on the page
      try {
        var allTrackEls = document.querySelectorAll('track[src], track[data-src], [kind="subtitles"], [kind="captions"]');
        allTrackEls.forEach(function (trackEl) {
          var src = trackEl.getAttribute('src') || trackEl.getAttribute('data-src');
          if (src) {
            // Check if already attached to our video
            var exists = false;
            for (var i = 0; i < video.textTracks.length; i++) {
              var t = video.querySelectorAll('track')[i];
              if (t && t.getAttribute('src') === src) { exists = true; break; }
            }
            if (!exists) {
              var newTrack = document.createElement('track');
              newTrack.src = src;
              newTrack.kind = trackEl.kind || 'subtitles';
              newTrack.label = trackEl.label || trackEl.getAttribute('srclang') || 'Sub';
              newTrack.srclang = trackEl.srclang || '';
              video.appendChild(newTrack);
            }
          }
        });
      } catch (e) {}

      // Strategy 2: Check for .vtt/.srt URLs in page source
      try {
        var subtitlePattern = /https?:\/\/[^"'\s<>]+\.(?:vtt|srt|ass|ssa)(?:\?[^"'\s<>]*)?/gi;
        var pageText = document.documentElement.innerHTML;
        var subMatch;
        var foundSubs = [];
        while ((subMatch = subtitlePattern.exec(pageText)) !== null && foundSubs.length < 10) {
          var subUrl = subMatch[0];
          if (!foundSubs.includes(subUrl)) {
            foundSubs.push(subUrl);
            // Add as track element
            var exists = false;
            video.querySelectorAll('track').forEach(function (t) {
              if (t.src === subUrl) exists = true;
            });
            if (!exists) {
              var t = document.createElement('track');
              t.src = subUrl;
              t.kind = 'subtitles';
              t.label = subUrl.match(/[_\-.]([a-z]{2,3})[_\-.\/]/i) ? RegExp.$1.toUpperCase() : 'Sub ' + (foundSubs.length);
              video.appendChild(t);
            }
          }
        }
      } catch (e) {}

      // Strategy 3: Check JSON-LD and data attributes for subtitle URLs
      try {
        document.querySelectorAll('script[type="application/ld+json"]').forEach(function (s) {
          try {
            var d = JSON.parse(s.textContent);
            var items = Array.isArray(d) ? d : [d];
            items.forEach(function (item) {
              if (item.caption) {
                var caps = Array.isArray(item.caption) ? item.caption : [item.caption];
                caps.forEach(function (cap) {
                  var capUrl = typeof cap === 'string' ? cap : (cap.url || cap.contentUrl || '');
                  if (capUrl && /\.(?:vtt|srt)/i.test(capUrl)) {
                    var t = document.createElement('track');
                    t.src = capUrl;
                    t.kind = 'subtitles';
                    t.label = (typeof cap === 'object' && cap.name) || 'Sub';
                    video.appendChild(t);
                  }
                });
              }
            });
          } catch (e) {}
        });
      } catch (e) {}

      // Strategy 4: Enable ALL disabled text tracks
      var tracks = Array.from(video.textTracks);
      tracks.forEach(function (t) {
        if (t.mode === 'disabled') t.mode = 'hidden';
      });
      tracks.forEach(function (track, index) {
        const label = track.label || track.language || ('Track ' + (index + 1));
        const item = createElement('div', 'vm-subtitle-item' + (activeSubtitleIndex === index ? ' vm-selected' : ''), label);
        item.addEventListener('click', function () {
          activateNativeSubtitle(index);
          subtitlePanel.classList.remove('vm-visible');
        });
        subtitleList.appendChild(item);
      });

      // YouTube CC tracks — fetched via the MAIN-world bridge (desktop+mobile).
      if (IS_YOUTUBE) {
        if (_ytCaptionCache && _ytCaptionCache.length) {
          _ytCaptionCache.forEach(function (cap) {
            var label = cap.name || ('YT CC');
            var item = createElement('div', 'vm-subtitle-item', '🎬 ' + label);
            item.addEventListener('click', function () {
              VMXBridge.call('yt-set-caption', cap.i, function(){});
              activeSubtitleIndex = 900 + cap.i;
              subtitleButton.classList.add('vm-active-state');
              showToast('💬 ' + label);
              subtitlePanel.classList.remove('vm-visible');
              buildSubtitleOptions();
            });
            subtitleList.appendChild(item);
          });
        } else if (!_ytCaptionFetching) {
          _ytCaptionFetching = true;
          VMXBridge.call('yt-get-captions', null, function (list) {
            _ytCaptionFetching = false;
            if (list && list.length) { _ytCaptionCache = list; if (isHudVisible) buildSubtitleOptions(); }
            else if (_ytCaptionRetries < 12) { _ytCaptionRetries++; setTimeout(function () { if (isHudVisible) buildSubtitleOptions(); }, 800); }
          });
        }
      }

      // ─── Captured subtitle/caption URLs (sniffed from the network) ───
      // Works on ANY site that fetches .vtt/.srt/timedtext (anime3rb, Twitch,
      // etc.) even inside cross-origin iframes — we fetch, parse and render them.
      if (capturedSubUrls.length > 0) {
        capturedSubUrls.forEach(function (url, idx) {
          var short = url.split('/').pop().split('?')[0].slice(0, 28) || ('Sub ' + (idx + 1));
          var langM = url.match(/[?&](?:lang|hl|tlang)=([a-z\-]{2,5})/i) || url.match(/[_.\-]([a-z]{2,3})\.(?:vtt|srt)/i);
          var label = (langM ? langM[1].toUpperCase() + ' · ' : '') + short;
          var item = createElement('div', 'vm-subtitle-item', '🌐 ' + label);
          item.addEventListener('click', function () {
            showToast('⏳ Loading subtitle…');
            loadRemoteSubtitle(url, function (ok) {
              if (ok) { activateCustomSubtitles(); }
              else showToast('⚠ Could not load subtitle');
            });
            subtitlePanel.classList.remove('vm-visible');
          });
          subtitleList.appendChild(item);
        });
      }

      // Custom uploaded subtitles
      if (customSubtitleCues.length > 0) {
        const customItem = createElement('div', 'vm-subtitle-item' + (activeSubtitleIndex === 999 ? ' vm-selected' : ''), '📄 Custom');
        customItem.addEventListener('click', function () {
          activateCustomSubtitles();
          subtitlePanel.classList.remove('vm-visible');
        });
        subtitleList.appendChild(customItem);
      }
    }

    // Fetch a remote subtitle URL, parse VTT/SRT/timedtext-XML into cues.
    function loadRemoteSubtitle(url, cb) {
      try {
        fetch(url, { credentials: (function(){try{return new URL(url,location.href).origin===location.origin?'include':'omit'}catch(e){return 'omit'}})() }).then(function (r) { return r.text(); }).then(function (text) {
          var cues = [];
          if (/\[Script Info\]|\[V4\+? Styles\]|^Dialogue:/im.test(text)) {
            cues = parseAssText(text);                 // ASS/SSA (anime subs)
          } else if (/^\s*</.test(text) && /<(text|p|tt)\b/i.test(text)) {
            cues = parseTimedTextXml(text);           // YouTube timedtext / TTML
          } else if (/-->/.test(text) && /WEBVTT/i.test(text)) {
            cues = parseVttText(text);
          } else if (/-->/.test(text)) {
            cues = parseSrtText(text);
          } else {
            cues = parseVttText(text);
          }
          if (cues && cues.length) { customSubtitleCues = cues; cb && cb(true); }
          else cb && cb(false);
        }).catch(function () { cb && cb(false); });
      } catch (e) { cb && cb(false); }
    }

    // Parse ASS/SSA subtitles (SubStation Alpha — common on anime sites).
    // Reads the [Events] section's "Dialogue:" lines: Start, End, Text (last field).
    function parseAssText(text) {
      var cues = [];
      try {
        var lines = text.split(/\r?\n/);
        var fmt = null, inEvents = false;
        function toSec(t) {
          // ASS time = H:MM:SS.cs
          var m = String(t).trim().match(/(\d+):(\d{2}):(\d{2})[.,](\d{1,3})/);
          if (!m) return null;
          return (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) + parseFloat('0.' + m[4]);
        }
        for (var i = 0; i < lines.length; i++) {
          var ln = lines[i];
          if (/^\[Events\]/i.test(ln)) { inEvents = true; continue; }
          if (/^\[/.test(ln)) { inEvents = false; }
          if (!inEvents) continue;
          if (/^Format:/i.test(ln)) {
            fmt = ln.replace(/^Format:\s*/i, '').split(',').map(function (s) { return s.trim().toLowerCase(); });
            continue;
          }
          if (/^Dialogue:/i.test(ln)) {
            var body = ln.replace(/^Dialogue:\s*/i, '');
            var iStart = fmt ? fmt.indexOf('start') : 1;
            var iEnd = fmt ? fmt.indexOf('end') : 2;
            var iText = fmt ? fmt.indexOf('text') : 9;
            // Text is the LAST field and may contain commas → split with a limit.
            var parts = body.split(',');
            var maxIdx = Math.max(iStart, iEnd, iText);
            var head = parts.slice(0, maxIdx);
            var txt = parts.slice(maxIdx).join(',');
            var s = toSec(head[iStart] || parts[1]);
            var e = toSec(head[iEnd] || parts[2]);
            if (s == null || e == null) continue;
            // Strip ASS override tags {\...} and convert \N to newline.
            txt = txt.replace(/\{[^}]*\}/g, '').replace(/\\N/gi, '\n').trim();
            if (txt) cues.push({ start: s, end: e, text: txt });
          }
        }
      } catch (e) {}
      return cues;
    }

    // Parse YouTube timedtext (<text start dur>) or TTML (<p begin end>) XML.
    function parseTimedTextXml(text) {
      var cues = [];
      try {
        var xml = new DOMParser().parseFromString(text, 'text/xml');
        var nodes = xml.getElementsByTagName('text');
        if (nodes.length) {
          for (var i = 0; i < nodes.length; i++) {
            var n = nodes[i];
            var start = parseFloat(n.getAttribute('start') || '0');
            var dur = parseFloat(n.getAttribute('dur') || '0');
            var txt = (n.textContent || '').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/<[^>]+>/g, '').trim();
            if (txt) cues.push({ start: start, end: start + (dur || 2), text: txt });
          }
          return cues;
        }
        // TTML <p begin="..." end="...">
        var ps = xml.getElementsByTagName('p');
        function ttmlTime(s) {
          if (!s) return 0;
          if (/^\d+(\.\d+)?s$/.test(s)) return parseFloat(s);
          var m = s.split(':'); if (m.length === 3) return (+m[0]) * 3600 + (+m[1]) * 60 + parseFloat(m[2]);
          return parseFloat(s) || 0;
        }
        for (var j = 0; j < ps.length; j++) {
          var p = ps[j];
          var st = ttmlTime(p.getAttribute('begin')); var en = ttmlTime(p.getAttribute('end'));
          var tt = (p.textContent || '').trim();
          if (tt) cues.push({ start: st, end: en || st + 2, text: tt });
        }
      } catch (e) {}
      return cues;
    }

    function disableSubtitles() {
      activeSubtitleIndex = -1;
      isCustomSubActive = false;
      clearSubtitleInterval();
      subtitleContainer.classList.add('vm-hidden');
      subtitleText.textContent = '';
      Array.from(video.textTracks).forEach(function (track) {
        track.mode = 'hidden';
      });
      subtitleButton.classList.remove('vm-active-state');
      showToast('Subtitles Off');
      buildSubtitleOptions();
    }

    function activateNativeSubtitle(index) {
      activeSubtitleIndex = index;
      isCustomSubActive = false;
      clearSubtitleInterval();

      Array.from(video.textTracks).forEach(function (track, i) {
        track.mode = (i === index) ? 'showing' : 'hidden';
      });

      const track = video.textTracks[index];
      if (!track) return;

      subtitleIntervalId = setInterval(function () {
        const activeCue = track.activeCues && track.activeCues[0];
        if (activeCue) {
          const rawText = typeof activeCue.text === 'string' ? activeCue.text : '';
          subtitleText.textContent = stripHtmlTags(rawText);
          subtitleContainer.classList.remove('vm-hidden');
        } else {
          subtitleText.textContent = '';
          subtitleContainer.classList.add('vm-hidden');
        }
      }, 100);

      subtitleButton.classList.add('vm-active-state');
      showToast('💬 ' + (track.label || track.language || 'Subtitles'));
      buildSubtitleOptions();
    }

    function activateCustomSubtitles() {
      activeSubtitleIndex = 999;
      isCustomSubActive = true;
      Array.from(video.textTracks).forEach(function (track) {
        track.mode = 'hidden';
      });
      clearSubtitleInterval();

      subtitleIntervalId = setInterval(function () {
        const currentTime = video.currentTime;
        // Binary search O(log n) instead of linear O(n)
        var cue = (function(cues, t) {
          var lo = 0, hi = cues.length - 1;
          while (lo <= hi) {
            var m = (lo + hi) >> 1;
            if (t < cues[m].start) hi = m - 1;
            else if (t > cues[m].end) lo = m + 1;
            else return cues[m];
          }
          return null;
        })(customSubtitleCues, currentTime);
        if (cue) {
          subtitleText.textContent = cue.text;
          subtitleContainer.classList.remove('vm-hidden');
        } else {
          subtitleText.textContent = '';
          subtitleContainer.classList.add('vm-hidden');
        }
      }, 80);

      subtitleButton.classList.add('vm-active-state');
      showToast('📄 Custom Subtitles');
      buildSubtitleOptions();
    }

    function parseSrtText(text) {
      const cues = [];
      const blocks = text.trim().replace(/\r\n/g, '\n').replace(/\r/g, '\n').split(/\n{2,}/);
      const timePattern = /(\d{1,2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{3})/;

      for (const block of blocks) {
        const lines = block.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const match = lines[i].match(timePattern);
          if (match) {
            const startSec = (+match[1]) * 3600 + (+match[2]) * 60 + (+match[3]) + (+match[4]) / 1000;
            const endSec = (+match[5]) * 3600 + (+match[6]) * 60 + (+match[7]) + (+match[8]) / 1000;
            const cueText = stripHtmlTags(lines.slice(i + 1).join('\n'));
            if (cueText) {
              cues.push({ start: startSec, end: endSec, text: cueText });
            }
            break;
          }
        }
      }
      return cues;
    }

    function parseVttText(text) {
      const stripped = text
        .replace(/^WEBVTT[^\n]*\n?/, '')
        .replace(/NOTE[\s\S]*?\n\n/g, '');
      const normalized = stripped.split('\n').map(function (line) {
        if (line.includes('-->')) {
          return line.replace(/(\d{1,2}:\d{2}:\d{2})\.(\d{3})/g, '$1,$2');
        }
        return line;
      }).join('\n');
      return parseSrtText(normalized);
    }

    subtitleFileInput.addEventListener('change', function (e) {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) {
        showToast('⚠ File too large (max 5MB)');
        return;
      }
      const reader = new FileReader();
      reader.onload = function (ev) {
        const text = ev.target.result;
        var _fn = file.name.toLowerCase();
        if (_fn.endsWith('.ass') || _fn.endsWith('.ssa') || /\[Script Info\]|^Dialogue:/im.test(text)) {
          customSubtitleCues = parseAssText(text);
        } else if (_fn.endsWith('.vtt') || /WEBVTT/i.test(text)) {
          customSubtitleCues = parseVttText(text);
        } else {
          customSubtitleCues = parseSrtText(text);
        }
        if (customSubtitleCues.length === 0) {
          showToast('⚠ No subtitle cues found');
          return;
        }
        showToast('📄 Loaded ' + customSubtitleCues.length + ' cues');
        buildSubtitleOptions();
        activateCustomSubtitles();
      };
      reader.readAsText(file, 'utf-8');
      subtitleFileInput.value = '';
    });

    subtitleUploadBtn.addEventListener('click', function () {
      subtitleFileInput.click();
      subtitlePanel.classList.remove('vm-visible');
    });

    function toggleSubtitles() {
      buildSubtitleOptions();
      if (activeSubtitleIndex !== -1) {
        disableSubtitles();
        return;
      }

      // Check native text tracks (including disabled ones — enable them first)
      const allTracks = Array.from(video.textTracks);
      // On YouTube, tracks start as 'disabled' — we need to set mode to 'hidden' first to make them available
      allTracks.forEach(function (t) {
        if (t.mode === 'disabled') t.mode = 'hidden';
      });

      // Rebuild after enabling
      setTimeout(function () {
        buildSubtitleOptions();
        const captionTracks = Array.from(video.textTracks).filter(function (t) {
          return t.kind === 'subtitles' || t.kind === 'captions';
        });
        if (captionTracks.length > 0) {
          activateNativeSubtitle(Array.from(video.textTracks).indexOf(captionTracks[0]));
          return;
        }
        if (video.textTracks.length > 0) {
          activateNativeSubtitle(0);
          return;
        }
        if (customSubtitleCues.length > 0) {
          activateCustomSubtitles();
          return;
        }

        // Try YouTube's CC button as fallback
        if (IS_YOUTUBE) {
          const ytCCBtn = document.querySelector('.ytp-subtitles-button');
          if (ytCCBtn) {
            ytCCBtn.click();
            showToast('💬 YouTube CC toggled');
            subtitleButton.classList.add('vm-active-state');
            return;
          }
        }

        showToast('No subtitles — upload .srt/.vtt');
        setTimeout(function () { subtitleFileInput.click(); }, 300);
      }, 100);
    }

    // Enhanced subtitle detection — multiple strategies
    function scanSubtitles() {
      // 1. Enable any disabled tracks so they become visible
      try {
        Array.from(video.textTracks).forEach(function (t) {
          if (t.mode === 'disabled') t.mode = 'hidden';
        });
      } catch (e) {}
      buildSubtitleOptions();
    }

    video.addEventListener('loadedmetadata', function () {
      scanSubtitles();
      setTimeout(scanSubtitles, 500);
      setTimeout(scanSubtitles, 1500);
      setTimeout(scanSubtitles, 3000);
      setTimeout(scanSubtitles, 6000);
    });
    video.addEventListener('loadeddata', scanSubtitles);
    video.addEventListener('canplay', scanSubtitles);

    try {
      video.textTracks.addEventListener('addtrack', function () {
        scanSubtitles();
        setTimeout(scanSubtitles, 500);
      });
      video.textTracks.addEventListener('removetrack', scanSubtitles);
      video.textTracks.addEventListener('change', scanSubtitles);
    } catch (e) {}

    // Scan page for ALL video sources (for download panel)
    function scanPageVideoSources() {
      try {
        // Collect from all video elements on page
        document.querySelectorAll('video').forEach(function (v) {
          if (v.src) addCapturedUrl(v.src, 'video-tag');
          if (v.currentSrc) addCapturedUrl(v.currentSrc, 'video-tag');
          v.querySelectorAll('source').forEach(function (s) {
            if (s.src) addCapturedUrl(s.src, 'source-tag');
          });
        });
        // Check og:video meta tags
        document.querySelectorAll('meta[property="og:video"], meta[property="og:video:url"], meta[name="twitter:player:stream"]').forEach(function (m) {
          var content = m.getAttribute('content');
          if (content) addCapturedUrl(content, 'meta');
        });
        // Check JSON-LD structured data
        document.querySelectorAll('script[type="application/ld+json"]').forEach(function (s) {
          try {
            var data = JSON.parse(s.textContent);
            if (data.contentUrl) addCapturedUrl(data.contentUrl, 'json-ld');
            if (data.embedUrl) addCapturedUrl(data.embedUrl, 'json-ld');
            if (data.url && /\.(mp4|webm)/i.test(data.url)) addCapturedUrl(data.url, 'json-ld');
          } catch (e) {}
        });
        // Check data attributes
        document.querySelectorAll('[data-video-src], [data-src], [data-url]').forEach(function (el) {
          var src = el.getAttribute('data-video-src') || el.getAttribute('data-src') || el.getAttribute('data-url') || '';
          if (src && /\.(mp4|webm|m3u8)/i.test(src)) addCapturedUrl(src, 'data-attr');
        });
      } catch (e) {}
    }
    // Run page scan a few times
    scanPageVideoSources();
    setTimeout(scanPageVideoSources, 2000);
    setTimeout(scanPageVideoSources, 5000);
    setTimeout(scanPageVideoSources, 10000);

    // Periodic rescan for lazily-loaded tracks (YouTube, Netflix, etc.)
    var subtitleScanCount = 0;
    var subtitleScanInterval = setInterval(function () {
      subtitleScanCount++;
      scanSubtitles();
      if (subtitleScanCount > 15) clearInterval(subtitleScanInterval);
    }, 3000);

    // YouTube-specific: detect when YT adds caption tracks dynamically
    if (IS_YOUTUBE) {
      var ytSubObserver = new MutationObserver(function () {
        if (video.textTracks.length > 0) scanSubtitles();
      });
      ytSubObserver.observe(video, { attributes: true, childList: true, subtree: true });
      // Also observe the player container for track elements
      try {
        var ytContainer = document.getElementById('movie_player');
        if (ytContainer) {
          ytSubObserver.observe(ytContainer, { childList: true, subtree: true });
        }
      } catch (e) {}
    }


    /* ═══════════════════════════════════════════════════
     *  A-B LOOP
     * ═══════════════════════════════════════════════════ */
    function toggleABLoop() {
      if (!isABLoopActive && abPointA === null) {
        // Set point A
        abPointA = video.currentTime;
        abLoopButton.classList.add('vm-active-state');
        showToast('🅰️ A: ' + formatTime(abPointA));
        updateABMarkers();
      } else if (!isABLoopActive && abPointA !== null && abPointB === null) {
        // Set point B
        abPointB = video.currentTime;
        if (abPointB <= abPointA) {
          showToast('⚠ B must be after A');
          abPointB = null;
          return;
        }
        isABLoopActive = true;
        abLoopBadge.classList.add('vm-visible');
        showToast('🅱️ B: ' + formatTime(abPointB));
        updateABMarkers();
        startABLoopCheck();
      } else {
        // Clear AB loop
        abPointA = null;
        abPointB = null;
        isABLoopActive = false;
        abLoopButton.classList.remove('vm-active-state');
        abLoopBadge.classList.remove('vm-visible');
        stopABLoopCheck();
        updateABMarkers();
        showToast('A-B Loop Cleared');
      }
    }

    function startABLoopCheck() {
      stopABLoopCheck();
      abCheckIntervalId = setInterval(function () {
        if (isABLoopActive && abPointA !== null && abPointB !== null) {
          if (video.currentTime >= abPointB) {
            video.currentTime = abPointA;
          }
        }
      }, 50);
    }

    function stopABLoopCheck() {
      if (abCheckIntervalId) {
        clearInterval(abCheckIntervalId);
        abCheckIntervalId = null;
      }
    }

    function updateABMarkers() {
      // Remove old markers
      seekTrack.querySelectorAll('.vm-ab-marker').forEach(function (el) { el.remove(); });
      abRangeHighlight.style.display = 'none';

      if (abPointA !== null && video.duration) {
        const markerA = createElement('div', 'vm-ab-marker vm-marker-a');
        markerA.style.left = (abPointA / video.duration * 100) + '%';
        seekTrack.appendChild(markerA);
      }
      if (abPointB !== null && video.duration) {
        const markerB = createElement('div', 'vm-ab-marker vm-marker-b');
        markerB.style.left = (abPointB / video.duration * 100) + '%';
        seekTrack.appendChild(markerB);
      }
      if (abPointA !== null && abPointB !== null && video.duration) {
        abRangeHighlight.style.display = 'block';
        abRangeHighlight.style.left = (abPointA / video.duration * 100) + '%';
        abRangeHighlight.style.width = ((abPointB - abPointA) / video.duration * 100) + '%';
      }
    }

    abLoopButton.addEventListener('click', function (e) {
      e.stopPropagation();
      toggleABLoop();
      resetAutoHide();
    });


    /* ═══════════════════════════════════════════════════
     *  VIDEO FILTERS
     * ═══════════════════════════════════════════════════ */
    for (const cfg of FILTER_CONFIG) {
      const ctrl = filterControls[cfg.key];
      ctrl.slider.addEventListener('input', function (e) {
        e.stopPropagation();
        const val = parseFloat(e.target.value);
        videoFilters[cfg.key] = val;
        ctrl.valueDisplay.textContent = val + cfg.unit;
        applyCssFilters();
      });
      ctrl.slider.addEventListener('click', function (e) { e.stopPropagation(); });
    }

    filterResetButton.addEventListener('click', function (e) {
      e.stopPropagation();
      videoFilters = { ...FILTER_DEFAULTS };
      for (const cfg of FILTER_CONFIG) {
        const ctrl = filterControls[cfg.key];
        ctrl.slider.value = String(FILTER_DEFAULTS[cfg.key]);
        ctrl.valueDisplay.textContent = FILTER_DEFAULTS[cfg.key] + cfg.unit;
      }
      applyCssFilters();
      showToast('🎨 Filters Reset');
    });


    /* ═══════════════════════════════════════════════════
     *  VIDEO STATS
     * ═══════════════════════════════════════════════════ */
    function buildStatsDisplay() {
      statsContent.textContent = '';
      const statsData = [
        ['Resolution', (video.videoWidth || '?') + '×' + (video.videoHeight || '?')],
        ['Duration', formatTime(video.duration)],
        ['Speed', video.playbackRate + '×'],
        ['Volume', Math.round(video.volume * 100) + '%' + (video.muted ? ' (Muted)' : '')],
        ['Buffered', video.buffered.length ? formatTime(video.buffered.end(video.buffered.length - 1)) : 'N/A'],
        ['Aspect', AR_MODES[aspectRatioIndex].label],
        ['Zoom', Math.round(zoomLevel * 100) + '%'],
        ['HLS', hlsInstance ? 'Active' : 'No'],
        ['Boost', audioBoostLevel + '×'],
      ];

      // Try to get playback quality stats
      try {
        const quality = video.getVideoPlaybackQuality();
        if (quality) {
          statsData.push(['Dropped Frames', String(quality.droppedVideoFrames)]);
          statsData.push(['Total Frames', String(quality.totalVideoFrames)]);
        }
      } catch (e) { /* not available */ }

      for (const [key, value] of statsData) {
        const row = createElement('div', 'vm-stats-row');
        const keyEl = createElement('div', 'vm-stats-key', key);
        const valEl = createElement('div', 'vm-stats-val', String(value));
        row.appendChild(keyEl);
        row.appendChild(valEl);
        statsContent.appendChild(row);
      }
    }


    /* ═══════════════════════════════════════════════════
     *  CONTEXT MENU & PANEL MANAGEMENT
     * ═══════════════════════════════════════════════════ */
    function closeAllPanels() {
      [contextMenu, qualityPanel, subtitlePanel, filterPanel, statsPanel].forEach(function (p) {
        if (!p) return;
        p.classList.remove('vm-visible', 'vm-sheet');
      });
      try {
        var eqp = shadowRoot.querySelector('.vm-eq-panel');
        if (eqp) eqp.classList.remove('vm-visible', 'vm-sheet');
      } catch (e) {}
      try { shadowRoot.querySelectorAll('.vm-download-panel').forEach(function (p) { p.remove(); }); } catch (e) {}
      if (typeof panelBackdrop !== 'undefined' && panelBackdrop) panelBackdrop.classList.remove('vm-visible');
    }

    function anyPanelOpen() {
      return !!(contextMenu.classList.contains('vm-visible') ||
        qualityPanel.classList.contains('vm-visible') ||
        subtitlePanel.classList.contains('vm-visible') ||
        filterPanel.classList.contains('vm-visible') ||
        statsPanel.classList.contains('vm-visible') ||
        shadowRoot.querySelector('.vm-eq-panel.vm-visible') ||
        shadowRoot.querySelector('.vm-download-panel'));
    }

    function ensurePanelBack(panel, titleText) {
      var existing = panel.querySelector('.vm-panel-back');
      if (existing) {
        var lab = existing.querySelector('.vm-panel-back-title');
        if (lab) lab.textContent = titleText || 'Back';
        return existing;
      }
      var back = document.createElement('div');
      back.className = 'vm-panel-back';
      var title = document.createElement('span');
      title.className = 'vm-panel-back-title';
      title.textContent = titleText || 'Back';
      back.appendChild(title);
      back.addEventListener('click', function (e) {
        e.preventDefault(); e.stopPropagation();
        try { _panelIgnoreUntil = Date.now() + 350; } catch (err) {}
        panel.classList.remove('vm-visible', 'vm-sheet');
        if (!contextMenu.classList.contains('vm-visible')) openContextMenu(0, 0);
        else if (panelBackdrop) panelBackdrop.classList.add('vm-visible');
      });
      panel.insertBefore(back, panel.firstChild);
      return back;
    }

    function wrapPanelScroll(panel) {
      var scroll = panel.querySelector('.vm-panel-scroll');
      if (scroll) return scroll;
      scroll = document.createElement('div');
      scroll.className = 'vm-panel-scroll';
      var kids = Array.prototype.slice.call(panel.childNodes);
      kids.forEach(function (ch) {
        if (ch.classList && ch.classList.contains('vm-panel-back')) return;
        scroll.appendChild(ch);
      });
      panel.appendChild(scroll);
      return scroll;
    }

    function openContextMenu(x, y, anchorRight) {
      buildSubtitleOptions();
      buildQualityOptions();
      const hudRect = hud.getBoundingClientRect();
      var useSheet = IS_MOBILE || IS_TOUCH || hudRect.width < 520 || hudRect.height < 420;
      qualityPanel.classList.remove('vm-visible', 'vm-sheet');
      subtitlePanel.classList.remove('vm-visible', 'vm-sheet');
      filterPanel.classList.remove('vm-visible', 'vm-sheet');
      statsPanel.classList.remove('vm-visible', 'vm-sheet');
      if (useSheet) {
        contextMenu.classList.add('vm-sheet');
        contextMenu.style.left = contextMenu.style.top = contextMenu.style.right = contextMenu.style.bottom = '';
        if (panelBackdrop) panelBackdrop.classList.add('vm-visible');
      } else {
        contextMenu.classList.remove('vm-sheet');
        // Measure the ACTUAL panel size (it's not display:none, just opacity:0),
        // instead of a stale hardcoded width — the grid is wider than the old list.
        var realRect = contextMenu.getBoundingClientRect();
        var menuW = Math.min(realRect.width || 336, hudRect.width - 16);
        var menuH = Math.min(realRect.height || (hudRect.height * 0.75), hudRect.height - 16);
        // Grows LEFT from the gear button's right edge by default (anchorRight),
        // which keeps it clear of the right-side screen edge where ⚙ usually sits.
        let cx = anchorRight ? (x - hudRect.left) - menuW : x - hudRect.left;
        let cy = y - hudRect.top;
        if (cx + menuW > hudRect.width) cx = hudRect.width - menuW - 8;
        if (cx < 8) cx = 8;
        if (cy + menuH > hudRect.height) cy = Math.max(8, hudRect.height - menuH - 8);
        contextMenu.style.left = Math.max(8, cx) + 'px';
        contextMenu.style.top = Math.max(8, cy) + 'px';
        contextMenu.style.bottom = 'auto';
        if (panelBackdrop) panelBackdrop.classList.remove('vm-visible');
      }
      contextMenu.classList.add('vm-visible');
      clearTimeout(autoHideTimeout);
      hud.classList.remove('vm-controls-hidden');
    }

    function openSubPanel(parentPanel, triggerItem, targetPanel, titleText) {
      try { _panelIgnoreUntil = Date.now() + 450; } catch (e) {}
      if (targetPanel.classList.contains('vm-visible')) {
        targetPanel.classList.remove('vm-visible', 'vm-sheet');
        if (parentPanel && !parentPanel.classList.contains('vm-visible')) {
          parentPanel.classList.add('vm-visible');
          if (IS_MOBILE || IS_TOUCH) parentPanel.classList.add('vm-sheet');
        }
        return;
      }
      [qualityPanel, subtitlePanel, filterPanel, statsPanel].forEach(function (p) {
        if (p && p !== targetPanel) p.classList.remove('vm-visible', 'vm-sheet');
      });
      try {
        var eqp = shadowRoot.querySelector('.vm-eq-panel');
        if (eqp && eqp !== targetPanel) eqp.classList.remove('vm-visible', 'vm-sheet');
      } catch (e) {}

      var useSheet = IS_MOBILE || IS_TOUCH || (hud.getBoundingClientRect().width < 520);
      ensurePanelBack(targetPanel, titleText || 'Back');
      wrapPanelScroll(targetPanel);

      if (useSheet) {
        if (parentPanel) parentPanel.classList.remove('vm-visible');
        targetPanel.classList.add('vm-sheet');
        targetPanel.style.left = targetPanel.style.top = targetPanel.style.right = targetPanel.style.bottom = '';
        targetPanel.classList.add('vm-visible');
        if (panelBackdrop) panelBackdrop.classList.add('vm-visible');
      } else {
        targetPanel.classList.remove('vm-sheet');
        const parentRect = parentPanel.getBoundingClientRect();
        const hudRect = hud.getBoundingClientRect();
        let lx = parentRect.right - hudRect.left + 4;
        let ly = (triggerItem.getBoundingClientRect ? triggerItem.getBoundingClientRect().top : parentRect.top) - hudRect.top;
        var realRect = targetPanel.getBoundingClientRect();
        var panelW = Math.min(realRect.width || 280, hudRect.width - 16);
        var panelH = Math.min(realRect.height || (hudRect.height * 0.82), hudRect.height - 16, 520);
        if (lx + panelW > hudRect.width) lx = Math.max(8, parentRect.left - hudRect.left - panelW - 4);
        if (ly + panelH > hudRect.height) ly = Math.max(8, hudRect.height - panelH - 8);
        if (ly < 8) ly = 8;
        if (lx < 8) lx = 8;
        targetPanel.style.left = lx + 'px';
        targetPanel.style.top = ly + 'px';
        targetPanel.classList.add('vm-visible');
      }
      clearTimeout(autoHideTimeout);
      hud.classList.remove('vm-controls-hidden');
    }

    // More button
    moreButton.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (contextMenu.classList.contains('vm-visible')) { closeAllPanels(); return; }
      _panelIgnoreUntil = Date.now() + 400;
      const rect = moreButton.getBoundingClientRect();
      openContextMenu(rect.right, rect.bottom + 6, true);
      clearTimeout(autoHideTimeout);
      hud.classList.remove('vm-controls-hidden');
    });

    var _panelIgnoreUntil = 0;
    shadowRoot.addEventListener('click', function (e) {
      if (Date.now() < _panelIgnoreUntil) return;
      var t = e.target;
      if (moreButton.contains(t)) return;
      try { if (eqButton && eqButton.contains(t)) return; } catch (err) {}
      if (t.closest && t.closest('.vm-panel, .vm-download-panel, .vm-eq-panel, .vm-panel-back, .vm-dl-btn, .vm-eq-slider, .vm-filter-slider')) return;
      if (panelBackdrop && (t === panelBackdrop || panelBackdrop.contains(t))) { closeAllPanels(); return; }
      if (anyPanelOpen()) closeAllPanels();
    });
    try {
      panelBackdrop.addEventListener('pointerdown', function (e) {
        e.preventDefault(); e.stopPropagation();
        closeAllPanels();
      });
    } catch (e) {}

    // Menu item click handlers
    menuQuality.addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      try { _panelIgnoreUntil = Date.now() + 400; } catch (err) {}
      buildQualityOptions();
      openSubPanel(contextMenu, menuQuality, qualityPanel, 'Quality');
    });
    menuSubtitles.addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      try { _panelIgnoreUntil = Date.now() + 400; } catch (err) {}
      buildSubtitleOptions();
      openSubPanel(contextMenu, menuSubtitles, subtitlePanel, 'Subtitles');
    });
    menuFilters.addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      try { _panelIgnoreUntil = Date.now() + 400; } catch (err) {}
      openSubPanel(contextMenu, menuFilters, filterPanel, 'Video filters');
    });
    menuStats.addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      try { _panelIgnoreUntil = Date.now() + 400; } catch (err) {}
      buildStatsDisplay();
      openSubPanel(contextMenu, menuStats, statsPanel, 'Stats');
    });

    menuPlayPause.addEventListener('click', function () {
      if (video.paused) { video.play().catch(function(){}); showToast('▶'); }
      else { video.pause(); showToast('⏸'); }
      closeAllPanels();
    });
    menuFullscreenTop.addEventListener('click', function () {
      closeAllPanels();
      isFullscreen ? exitFullscreen() : enterFullscreen();
    });
    menuScreenshot.addEventListener('click', function () { takeScreenshot(); closeAllPanels(); });
    menuCopyUrl.addEventListener('click', function () {
      var raw = video.currentSrc || video.src || '';
      var isBlob = /^blob:/i.test(raw);
      // blob: URLs are temporary references created in-memory by THIS tab
      // (used by YouTube/Netflix/etc. via MediaSource) — they can't be opened,
      // shared, or played anywhere else, so copy the real page link instead.
      var url = isBlob ? location.href : (raw || location.href);
      if (navigator.clipboard) navigator.clipboard.writeText(url).catch(function(){});
      showToast(isBlob ? '📋 Page link copied (blob: link only works in this tab)' : '📋 URL Copied');
      closeAllPanels();
    });
    menuLoop.addEventListener('click', function () {
      isLooping = !isLooping;
      video.loop = isLooping;
      loopButton.classList.toggle('vm-active-state', isLooping);
      showToast(isLooping ? '🔁 Loop On' : '↩ Loop Off');
      closeAllPanels();
    });
    menuABLoop.addEventListener('click', function () { toggleABLoop(); closeAllPanels(); });
    // ─── Gather EVERY downloadable/playable source we know about ───
    // Multi-method (like the best downloaders): (1) direct <video>.src / <source>,
    // (2) network-sniffed progressive files, (3) captured HLS/DASH manifests,
    // (4) the fully-detected quality ladder from buildQualityOptions, (5) a
    // page-source regex sweep. Blob/MSE players (Facebook, YouTube, Twitch…)
    // have a blob: src that can't be saved — but our sniffer already captured
    // the real files/streams, so we surface those instead of failing.
    function collectAllDownloadSources() {
      var direct = [];      // directly-saveable/playable media URLs (mp4/webm/…)
      var seen = Object.create(null);
      function add(u) {
        if (!u || typeof u !== 'string') return;
        if (/^blob:/i.test(u)) return;
        if (u.length < 12) return;
        try { if (typeof sanitizeMediaUrl === 'function') u = sanitizeMediaUrl(u); } catch (e) {}
        if (seen[u]) return; seen[u] = 1;
        if (typeof isProbablyPlayableMediaUrl === 'function') {
          if (!isProbablyPlayableMediaUrl(u)) return;
        } else if (!/\.(mp4|webm|mkv|m3u8|m4v|mpd)(\?|#|$)/i.test(u) && !/videoplayback|googlevideo|fbcdn/i.test(u)) {
          return;
        }
        direct.push(u);
      }

      // Refresh the network buffer so late requests are included.
      try { pullBackgroundMedia(); } catch (e) {}
      try {
        var ents = performance.getEntriesByType ? performance.getEntriesByType('resource') : [];
        for (var ei = 0; ei < ents.length; ei++) {
          var eu = ents[ei].name || '';
          if (isProbablyPlayableMediaUrl(eu)) add(eu);
        }
      } catch (e) {}

      // (1) Direct element sources (skip blob).
      add(video.currentSrc); add(video.src);
      try { video.querySelectorAll('source').forEach(function (s) { add(s.src || s.getAttribute('data-src')); }); } catch (e) {}
      try { if (video.parentElement) video.parentElement.querySelectorAll('source').forEach(function (s) { add(s.src || s.getAttribute('data-src')); }); } catch (e) {}

      // (2) Network-sniffed progressive video files (mp4/webm/…), newest first.
      var netFiles = (capturedVideoUrls || []).slice().sort(function (a, b) { return (b.time || 0) - (a.time || 0); });
      netFiles.forEach(function (v) { add(v.url); });

      // (4) The detected quality ladder (FB DASH, source-per-quality sites, etc.).
      try {
        if (typeof buildQualityOptions === 'function') buildQualityOptions();
        (_lastDetectedQualities || []).forEach(function (lv) {
          if (lv && lv.srcUrl) add(lv.srcUrl);
        });
      } catch (e) {}

      // (5) Quetta-derived detector: parsed master playlists, DASH
      // representations, separate audio tracks and site-specific extractors.
      try {
        (_quettaSources || []).forEach(function (item) {
          if (!item) return;
          if (item.noDL === 'drm' || item.drm === true) markDynamicDrm('detector reported protected stream');
          add(item.url);
          (item.resolutions || []).forEach(function (level) {
            if (!level) return;
            add(level.url);
            // Preserve the audio URL for the advanced DASH merger, but do not
            // expose it as a standalone video source.
          });
        });
      } catch (e) {}

      // (6) Page-source sweep for direct media URLs with a resolution hint.
      try {
        var html = document.documentElement.innerHTML;
        var re = /https?:\\?\/\\?\/[^"'\s<>\\]+?\.(?:mp4|webm|mkv|m4v|mov)(?:\?[^"'\s<>\\]*)?/gi, mm, n = 0;
        while ((mm = re.exec(html)) && n < 25) { add(mm[0].replace(/\\\//g, '/')); n++; }
      } catch (e) {}

      // Manifests (HLS/DASH) are handled separately by the panel.
      var manifests = (capturedManifests || []).slice();
      return { direct: direct, manifests: manifests, quetta: (_quettaSources || []).slice() };
    }

    // Download removed — use yt-dlp externally if needed

    // Ask the background service worker to use Chrome's native download engine.
    // Returns true if the message was dispatched.
    function sanitizeMediaUrl(u) {
      // Video Downloader Professional idea: strip partial range params (esp. Vimeo)
      try {
        if (!u || (u.indexOf('range=') < 0 && u.indexOf('bytes=') < 0)) return u;
        var url = new URL(u, location.href);
        ['range', 'bytes', 'rn', 'sq'].forEach(function (k) {
          if (url.searchParams.has(k)) url.searchParams.delete(k);
        });
        var out = url.toString().replace(/([?&])range=[^&]*/gi, '$1').replace(/[?&]$/, '');
        return out.replace('?&', '?').replace(/\?$/, '');
      } catch (e) { return u; }
    }

    function isProbablyPlayableMediaUrl(u) {
      if (!u || typeof u !== 'string') return false;
      try { u = sanitizeMediaUrl(u); } catch (e) {}
      if (/^blob:/i.test(u)) return false;
      if (!/^https?:\/\//i.test(u)) return false;
      if (/\.(html?|php|aspx?|json|xml|txt|css|js)(\?|$)/i.test(u) && !/\.(mp4|webm|m3u8|mpd|mkv|m4v|mov|m4a|ts|m4s|flv|mpg|mpeg|aac)(\?|$)/i.test(u)) return false;
      if (/(login|signin|account|captcha|\/error|\/404\b)/i.test(u) && !/\.(mp4|webm|m3u8)/i.test(u)) return false;
      if (/\.(mp4|webm|mkv|m4v|mov|m3u8|mpd|m4a|ts|m4s|flv|mpg|mpeg|aac)(\?|#|$)/i.test(u)) return true;
      if (/googlevideo\.com\/videoplayback/i.test(u)) return true;
      if (/fbcdn\.net|scontent.*\.fbcdn|video.*\.fbcdn/i.test(u)) return true;
      if (/cdninstagram\.com|scontent.*\.cdninstagram/i.test(u)) return true;
      if (/tiktokcdn|musical\.ly|byteoversea|v\d+-webapp.*tiktok/i.test(u)) return true;
      if (/v\.redd\.it|hls\.reddit/i.test(u)) return true;
      if (/vimeocdn\.com/i.test(u) && /\/(video|sep)\//i.test(u)) return true;
      if (/akamaized\.net|cloudfront\.net|fastly|cdn\.jwplayer|jwpcdn|cloudflarestream/i.test(u)) return true;
      if (/twimg\.com\/.*video|video\.twimg|pscp\.tv/i.test(u)) return true;
      if (/playlist\.live-video\.net|ttvnw\.net|usher\.ttvnw/i.test(u)) return true;
      if (/\/playlist\/|\/manifest|format=m3u8|mime=video|mime_type=video/i.test(u)) return true;
      if (/\/getvid|\/get_video|\/videoplayback|\/medias\//i.test(u)) return true;
      return false;
    }

    function classifyMediaUrl(u) {
      if (!u) return '';
      try { u = sanitizeMediaUrl(u); } catch (e) {}
      if (/\.m3u8(\?|#|$)/i.test(u) || /format=m3u8|x-mpegURL|mpegurl/i.test(u)) return 'm3u8';
      if (/\.mpd(\?|#|$)/i.test(u) || /dash\+xml/i.test(u)) return 'mpd';
      if (/\.webm(\?|#|$)/i.test(u)) return 'webm';
      if (/\.(mp4|m4v|mov|m4s)(\?|#|$)/i.test(u) || /videoplayback|mime=video%2Fmp4/i.test(u)) return 'mp4';
      if (/\.mkv(\?|#|$)/i.test(u)) return 'mkv';
      if (/\.(m4a|aac|mp3)(\?|#|$)|mime=audio/i.test(u)) return 'm4a';
      if (/\.ts(\?|#|$)/i.test(u)) return 'ts';
      if (/\.flv(\?|#|$)/i.test(u)) return 'flv';
      return 'mp4';
    }

    function probeMediaUrl(url, timeoutMs) {
      timeoutMs = timeoutMs || 7000;
      var cred = (function(){try{return new URL(url,location.href).origin===location.origin?'include':'omit'}catch(e){return 'omit'}})();
      var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      var to = setTimeout(function () { try { ctrl && ctrl.abort(); } catch (e) {} }, timeoutMs);
      return fetch(url, {
        method: 'GET',
        headers: { 'Range': 'bytes=0-1023' },
        mode: 'cors',
        credentials: cred,
        signal: ctrl ? ctrl.signal : undefined
      }).then(function (r) {
        var ct = (r.headers.get('content-type') || '').toLowerCase();
        var cl = parseInt(r.headers.get('content-length') || '0', 10) || 0;
        var cr = r.headers.get('content-range') || '';
        var ar = (r.headers.get('accept-ranges') || '').toLowerCase();
        var m = /\/(\d+)\s*$/.exec(cr);
        if (m) cl = parseInt(m[1], 10) || cl;
        var supportsByteRanges = (r.status === 206) || ar === 'bytes' || !!cr;
        if (!(r.ok || r.status === 206)) throw new Error('HTTP ' + r.status);
        if (ct && /text\/html|application\/json|text\/plain/.test(ct) && !/mpegurl|mp4|video|audio|octet-stream/.test(ct)) {
          throw new Error('not-media:' + ct);
        }
        return r.arrayBuffer().then(function (ab) {
          clearTimeout(to);
          var magic = sniffMediaMagic(ab);
          if (magic === 'text') throw new Error('not-media:magic');
          if (cl > 0 && cl < 2048 && magic !== 'm3u8') throw new Error('too-small');
          return {
            ok: true,
            contentType: ct,
            length: cl,
            supportsByteRanges: supportsByteRanges,
            magic: magic,
            ext: classifyMediaUrl(url)
          };
        });
      }).catch(function (e) {
        clearTimeout(to);
        return { ok: false, error: String(e && e.message || e) };
      });
    }

    function sniffMediaMagic(arrBuf) {
      try {
        var u8 = new Uint8Array(arrBuf.slice(0, 16));
        if (u8[4] === 0x66 && u8[5] === 0x74 && u8[6] === 0x79 && u8[7] === 0x70) return 'mp4';
        if (u8[0] === 0x1a && u8[1] === 0x45 && u8[2] === 0xdf && u8[3] === 0xa3) return 'webm';
        if (u8[0] === 0x49 && u8[1] === 0x44 && u8[2] === 0x33) return 'audio';
        var head = '';
        for (var i = 0; i < Math.min(8, u8.length); i++) head += String.fromCharCode(u8[i]);
        if (head.indexOf('#EXTM3U') === 0) return 'm3u8';
        var t = head.toLowerCase();
        if (t.indexOf('<!doc') === 0 || t.indexOf('<html') !== -1 || t.indexOf('{') === 0) return 'text';
      } catch (e) {}
      return '';
    }

    function downloadViaNative(url, filename, saveAs) {
      try { url = sanitizeMediaUrl(url); } catch (e) {}
      if (!isProbablyPlayableMediaUrl(url)) {
        showToast('⚠ Not a direct video URL — blocked fake download', 3500);
        return false;
      }
      var kind = classifyMediaUrl(url);
      if (kind === 'm3u8') {
        showToast('🎞 HLS playlist — starting stream merge / use yt-dlp', 3500);
        try {
          var th = (_lastQualityTarget && /^\d+$/.test(String(_lastQualityTarget))) ? parseInt(_lastQualityTarget, 10) : 0;
          var bn = String(filename || 'videomax').replace(/\.[a-z0-9]{2,5}$/i, '');
          startHlsDownload(url, th, bn);
        } catch (e) {}
        return true;
      }
      if (kind === 'mpd') {
        showToast('📡 DASH manifest — copy yt-dlp command', 3500);
        try { copyText(ytDlpCommand(url, 'best'), '📋 yt-dlp (DASH) copied'); } catch (e) {
          try { copyText(ytDlpCommand(url), '📋 yt-dlp copied'); } catch (e2) {}
        }
        return true;
      }
      try {
        var ext = kind || 'mp4';
        if (filename && !new RegExp('\\.' + ext + '$', 'i').test(filename)) {
          filename = String(filename).replace(/\.[a-z0-9]{2,5}$/i, '') + '.' + ext;
        }
      } catch (e) {}
      showToast('⬇ Probing media…');
      probeMediaUrl(url, 7000).then(function (info) {
        if (!info || !info.ok) {
          showToast('⚠ Probe failed — not starting fake download', 4000);
          return;
        }
        if (info.length && info.length < 4096 && info.ext !== 'm3u8') {
          showToast('⚠ File too small to be video', 3500);
          return;
        }
        try {
          if (info.ext && filename) filename = String(filename).replace(/\.[a-z0-9]{2,5}$/i, '') + '.' + info.ext;
        } catch (e) {}
        try {
          if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
            chrome.runtime.sendMessage({
              type: 'vm_download', url: url, filename: filename, saveAs: !!saveAs,
              referer: location.href, pageOrigin: location.origin
            }, function (res) {
              var err = chrome.runtime && chrome.runtime.lastError;
              if (err || !res || !res.ok) downloadViaFetchBlob(url, filename);
              else showToast(saveAs ? '💾 Choose where to save…' : '✅ Download started');
            });
            return;
          }
        } catch (e) {}
        downloadViaFetchBlob(url, filename);
      });
      return true;
    }

    function downloadViaFetchBlob(url, filename) {
      if (!isProbablyPlayableMediaUrl(url)) {
        showToast('⚠ Blocked fake download (HTML/TXT link)', 3500);
        return;
      }
      showToast('⬇ Verifying media…');
      var cred = (function(){try{return new URL(url,location.href).origin===location.origin?'include':'omit'}catch(e){return 'omit'}})();
      fetch(url, { mode: 'cors', credentials: cred, headers: { 'Range': 'bytes=0-4095' } })
        .then(function (response) {
          if (!(response.ok || response.status === 206)) throw new Error('HTTP ' + response.status);
          var ct = (response.headers.get('content-type') || '').toLowerCase();
          if (ct && /text\/|html|json|javascript/.test(ct) && !/mpegurl|mp4|video|audio|octet-stream/.test(ct)) {
            throw new Error('not-media:' + ct);
          }
          return response.arrayBuffer().then(function (ab) {
            var magic = sniffMediaMagic(ab);
            if (magic === 'text') throw new Error('not-media:magic');
            if (!magic && !(ct && /video|mpegurl|mp4|webm|octet-stream|audio/.test(ct))) {
              throw new Error('not-media:unknown');
            }
            return fetch(url, { mode: 'cors', credentials: cred }).then(function (r2) {
              if (!r2.ok) throw new Error('HTTP ' + r2.status);
              var ct2 = (r2.headers.get('content-type') || ct || '').toLowerCase();
              if (/text\/html|application\/json/.test(ct2)) throw new Error('not-media:' + ct2);
              return r2.blob().then(function (blob) { return { blob: blob, ct: ct2 }; });
            });
          });
        })
        .then(function (r) {
          var blob = r.blob;
          if (blob.size > 0 && blob.size < 2048) throw new Error('too-small');
          var fn = fixFilenameExt(filename, blob.type || r.ct);
          if (/\.(txt|html?|json)$/i.test(fn)) fn = fn.replace(/\.(txt|html?|json)$/i, '.mp4');
          const blobUrl = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = blobUrl; a.download = fn;
          document.body.appendChild(a); a.click(); document.body.removeChild(a);
          setTimeout(function () { URL.revokeObjectURL(blobUrl); }, 5000);
          showToast('✅ Download started!');
        })
        .catch(function (e) {
          if (e && /not-media|too-small/.test(String(e.message || e))) {
            showToast('⚠ Not a real video file — use yt-dlp / manager', 4500);
            return;
          }
          showToast('⚠ Cannot verify media (CORS). Use yt-dlp or manager.', 4500);
        });
    }

    // Ensure a filename ends with an extension matching its MIME type (never .txt).
    function fixFilenameExt(filename, mime) {
      mime = (mime || '').toLowerCase();
      var ext = /mp4/.test(mime) ? 'mp4' : /webm/.test(mime) ? 'webm' :
                /matroska|mkv/.test(mime) ? 'mkv' : /quicktime|mov/.test(mime) ? 'mov' :
                /mpegurl|mpeg-url/.test(mime) ? 'm3u8' : /audio\/mp4|m4a/.test(mime) ? 'm4a' :
                /audio\/mpeg|mp3/.test(mime) ? 'mp3' : '';
      if (!ext) {
        // never keep .txt/.html
        if (/\.(txt|html?|json)$/i.test(filename)) return filename.replace(/\.(txt|html?|json)$/i, '.mp4');
        return filename;
      }
      return filename.replace(/\.[a-z0-9]{2,5}$/i, '') + '.' + ext;
    }

    function downloadViaLink(url, filename) {
      // Never force-download unverified URLs as files (fake html/txt risk)
      if (!isProbablyPlayableMediaUrl(url)) {
        showToast('⚠ Refusing unverified link download', 3000);
        return;
      }
      // Prefer opening only true media extensions
      if (!/\.(mp4|webm|mkv|m4v|mov|m3u8)(\?|#|$)/i.test(url)) {
        copyText(url, '📋 Link copied (not a direct file)');
        return;
      }
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.target = '_blank';
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      showToast('⬇ Download started');
    }

    /* ═══════════════════════════════════════════════════
     *  HLS STREAM DOWNLOADER (m3u8 → .ts merge, AES-128 aware)
     *  Technique mirrors popular downloaders: fetch playlist, pull every
     *  segment in parallel, decrypt AES-128-CBC via Web Crypto, concat,
     *  then hand a single Blob to chrome.downloads.
     * ═══════════════════════════════════════════════════ */
    function absUrl(u, base) {
      try { return new URL(u, base).href; } catch (e) { return u; }
    }

    function fetchText(u) {
      return fetch(u, { credentials: (function(){try{return new URL(u,location.href).origin===location.origin?'include':'omit'}catch(e){return 'omit'}})() }).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.text();
      });
    }

    // Parse a media playlist → { segments:[{url,...}], key, iv, base }
    function parseMediaPlaylist(text, base) {
      var lines = text.split(/\r?\n/);
      var segs = [], key = null, keyUrl = null, iv = null, seq = 0;
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim();
        if (line.indexOf('#EXT-X-MEDIA-SEQUENCE:') === 0) {
          seq = parseInt(line.split(':')[1], 10) || 0;
        } else if (line.indexOf('#EXT-X-KEY:') === 0) {
          var m = line.match(/METHOD=([^,]+)/i);
          var u = line.match(/URI="([^"]+)"/i);
          var ivm = line.match(/IV=0x([0-9A-Fa-f]+)/i);
          if (m && /AES-128/i.test(m[1]) && u) { keyUrl = absUrl(u[1], base); }
          else if (m && /NONE/i.test(m[1])) { keyUrl = null; }
          if (ivm) { iv = hexToBytes(ivm[1]); }
        } else if (line && line.charAt(0) !== '#') {
          segs.push({ url: absUrl(line, base), seq: seq + segs.length });
        }
      }
      return { segments: segs, keyUrl: keyUrl, iv: iv };
    }

    function hexToBytes(hex) {
      var out = new Uint8Array(hex.length / 2);
      for (var i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
      return out;
    }

    // Resolve a master playlist to the media playlist matching a target height.
    function resolveMediaPlaylist(masterUrl, targetHeight) {
      return fetchText(masterUrl).then(function (text) {
        if (text.indexOf('#EXT-X-STREAM-INF') === -1) {
          return { url: masterUrl, text: text }; // already a media playlist
        }
        var lines = text.split(/\r?\n/), variants = [];
        for (var i = 0; i < lines.length; i++) {
          if (lines[i].indexOf('#EXT-X-STREAM-INF') === 0) {
            var res = lines[i].match(/RESOLUTION=\d+x(\d+)/i);
            var bw = lines[i].match(/BANDWIDTH=(\d+)/i);
            var next = (lines[i + 1] || '').trim();
            if (next && next.charAt(0) !== '#') {
              variants.push({ h: res ? parseInt(res[1], 10) : 0, bw: bw ? parseInt(bw[1], 10) : 0, url: absUrl(next, masterUrl) });
            }
          }
        }
        if (!variants.length) return { url: masterUrl, text: text };
        variants.sort(function (a, b) { return a.h - b.h; });
        var chosen = null;
        if (targetHeight) {
          for (var j = 0; j < variants.length; j++) if (variants[j].h === targetHeight) { chosen = variants[j]; break; }
          if (!chosen) for (var k = 0; k < variants.length; k++) if (variants[k].h > targetHeight) { chosen = variants[k]; break; }
        }
        if (!chosen) chosen = variants[variants.length - 1]; // highest
        return fetchText(chosen.url).then(function (mt) { return { url: chosen.url, text: mt }; });
      });
    }

    function fetchSegment(url, retries) {
      retries = retries == null ? 3 : retries;
      return fetch(url, { credentials: (function(){try{return new URL(url,location.href).origin===location.origin?'include':'omit'}catch(e){return 'omit'}})() }).then(function (r) {
        if (!r.ok) throw new Error('seg HTTP ' + r.status);
        return r.arrayBuffer();
      }).catch(function (e) {
        if (retries > 0) return fetchSegment(url, retries - 1);
        throw e;
      });
    }

    // Download all segments with a sliding window (parallelism), AES-128 decrypt.
    function downloadHls(masterUrl, targetHeight, onProgress) {
      var cryptoKey = null, ivBase = null;
      return resolveMediaPlaylist(masterUrl, targetHeight).then(function (media) {
        var pl = parseMediaPlaylist(media.text, media.url);
        if (!pl.segments.length) throw new Error('No segments found');
        var total = pl.segments.length;
        var buffers = new Array(total);
        var done = 0;

        var keyReady = Promise.resolve();
        if (pl.keyUrl) {
          keyReady = fetch(pl.keyUrl, { credentials: (function(){try{return new URL(pl.keyUrl,location.href).origin===location.origin?'include':'omit'}catch(e){return 'omit'}})() })
            .then(function (r) { return r.arrayBuffer(); })
            .then(function (kb) {
              return crypto.subtle.importKey('raw', kb, { name: 'AES-CBC' }, false, ['decrypt']);
            })
            .then(function (k) { cryptoKey = k; ivBase = pl.iv; });
        }

        return keyReady.then(function () {
          var CONCURRENCY = 6;
          var idx = 0;
          function worker() {
            if (idx >= total) return Promise.resolve();
            var my = idx++;
            var seg = pl.segments[my];
            return fetchSegment(seg.url).then(function (buf) {
              if (cryptoKey) {
                var iv = ivBase;
                if (!iv) { // default IV = segment sequence number, 16 bytes big-endian
                  iv = new Uint8Array(16);
                  var s = seg.seq;
                  for (var b = 15; b >= 0; b--) { iv[b] = s & 0xff; s = Math.floor(s / 256); }
                }
                return crypto.subtle.decrypt({ name: 'AES-CBC', iv: iv }, cryptoKey, buf)
                  .then(function (dec) { buffers[my] = new Uint8Array(dec); done++; if (onProgress) onProgress(done, total); return worker(); });
              }
              buffers[my] = new Uint8Array(buf); done++; if (onProgress) onProgress(done, total); return worker();
            });
          }
          var workers = [];
          for (var w = 0; w < CONCURRENCY; w++) workers.push(worker());
          return Promise.all(workers).then(function () {
            var size = 0; buffers.forEach(function (b) { size += b ? b.length : 0; });
            var merged = new Uint8Array(size), off = 0;
            buffers.forEach(function (b) { if (b) { merged.set(b, off); off += b.length; } });
            return new Blob([merged], { type: 'video/mp2t' });
          });
        });
      });
    }

    // Run an HLS download with a live progress UI.
    function startHlsDownload(masterUrl, targetHeight, niceName) {
      var prog = createElement('div', 'vm-toast vm-visible');
      prog.style.cssText += ';bottom:auto;top:14px;';
      prog.textContent = '⬇ Preparing stream…';
      overlay.appendChild(prog);
      downloadHls(masterUrl, targetHeight, function (d, t) {
        prog.textContent = '⬇ ' + Math.round(d / t * 100) + '%  (' + d + '/' + t + ' segments)';
      }).then(function (blob) {
        var blobUrl = URL.createObjectURL(blob);
        var fn = (niceName || 'videomax-' + Date.now()) + '.ts';
        var a = document.createElement('a');
        a.href = blobUrl; a.download = fn;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(blobUrl); }, 8000);
        prog.textContent = '✅ Saved ' + fn + ' (play in VLC/MX)';
        setTimeout(function () { prog.remove(); }, 4000);
      }).catch(function (e) {
        prog.textContent = '⚠ Stream download failed — copying URL for yt-dlp';
        try { navigator.clipboard.writeText('yt-dlp "' + masterUrl + '"'); } catch (e2) {}
        setTimeout(function () { prog.remove(); }, 4000);
      });
    }

    /* ─── External managers / players ─── */
    function ytDlpCommand(u, mode) {
      u = u || location.href;
      mode = mode || 'best';
      if (mode === 'list') return 'yt-dlp -F "' + u + '"';
      if (mode === 'audio') return 'yt-dlp -f ba -x --audio-format mp3 "' + u + '"';
      if (mode === 'worst') return 'yt-dlp -f "wo*+ba/w" "' + u + '"';
      return 'yt-dlp -f "bv*+ba/b" --merge-output-format mp4 "' + u + '"';
    }

    function copyText(t, okMsg) {
      navigator.clipboard.writeText(t).then(function () { showToast(okMsg || '📋 Copied'); })
        .catch(function () { try { prompt('Copy:', t); } catch (e) {} });
    }

    // Build an Android intent URL for a specific download-manager package.
    function androidIntent(url, pkg, scheme, title) {
      var i = 'intent:' + url + '#Intent;action=android.intent.action.VIEW;';
      if (scheme) i += 'scheme=' + scheme + ';';
      if (pkg) i += 'package=' + pkg + ';';
      i += 'S.title=' + encodeURIComponent(title || 'video') + ';end';
      return i;
    }

    function sendToExternalManager(url, title) {
      if (IS_MOBILE) {
        // Try 1DM first (most common), then generic VIEW intent.
        try { window.location.href = androidIntent(url, 'idm.internet.download.manager.plus', '1dmdownload', title); return; } catch (e) {}
      }
      // Desktop: JDownloader local API, else copy URL.
      tryJDownloader(url, function (ok) {
        if (!ok) copyText(url, '📋 URL copied — paste into IDM / JDownloader / FDM');
      });
    }

    // JDownloader plain Click'n'Load — https://jdownloader.org/knowledge/wiki/glossary/cnl2
    function tryJDownloader(url, cb) {
      var base = 'http://127.0.0.1:9666';
      var urls = Array.isArray(url) ? url.join('\r\n') : String(url || '');
      if (!urls) { if (cb) cb(false); return; }
      var body = 'urls=' + encodeURIComponent(urls) +
        '&source=' + encodeURIComponent(location.href) +
        '&passwords=';
      var finish = function (ok) {
        if (ok) showToast('📥 Sent to JDownloader');
        if (cb) cb(!!ok);
      };
      Promise.resolve()
        .then(function () {
          return fetch(base + '/flash/', { method: 'GET', mode: 'no-cors', cache: 'no-store' }).catch(function () {});
        })
        .then(function () {
          return fetch(base + '/flash/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body,
            mode: 'no-cors',
            cache: 'no-store'
          });
        })
        .then(function () { finish(true); })
        .catch(function () {
          try {
            var iframe = document.createElement('iframe');
            iframe.name = 'vmx_jd_cnl';
            iframe.style.cssText = 'display:none;width:0;height:0;border:0';
            document.body.appendChild(iframe);
            var form = document.createElement('form');
            form.method = 'POST'; form.action = base + '/flash/add'; form.target = 'vmx_jd_cnl';
            function add(n, v) {
              var i = document.createElement('input');
              i.type = 'hidden'; i.name = n; i.value = v; form.appendChild(i);
            }
            add('urls', urls); add('source', location.href);
            document.body.appendChild(form); form.submit();
            setTimeout(function () { try { form.remove(); iframe.remove(); } catch (e) {} }, 2000);
            finish(true);
          } catch (e) { finish(false); }
        });
    }

    function playInExternalPlayer(url) {
      if (!isProbablyPlayableMediaUrl(url)) {
        showToast('⚠ No direct playable URL — use yt-dlp', 4000);
        try { copyText(ytDlpCommand(IS_YOUTUBE ? location.href : (url || location.href), 'best'), '📋 yt-dlp copied'); }
        catch (e) { try { copyText(ytDlpCommand(IS_YOUTUBE ? location.href : (url || location.href)), '📋 yt-dlp copied'); } catch (e2) {} }
        return;
      }
      if (IS_MOBILE) {
        try {
          window.location.href = 'intent:' + encodeURI(url) +
            '#Intent;type=video/*;scheme=https;action=android.intent.action.VIEW;end';
          return;
        } catch (e) {}
      }
      copyText(url, '📋 Direct media URL copied');
      try { window.open('vlc://' + url, '_blank'); } catch (e) {}
      if (/\.(mp4|webm|mkv|m3u8|m4v)(\?|#|$)/i.test(url)) {
        setTimeout(function () { try { window.open(url, '_blank'); } catch (e) {} }, 250);
      }
    }

    function quettaLevelLabel(item, level) {
      var h = level && (level.height || level.quality);
      var text = h ? String(h).replace(/p$/i, '') + 'p' : '';
      var fmtName = String((level && level.format) || item.outputFormat || item.ext || 'video').toUpperCase();
      if (!text) text = fmtName;
      var rate = (level && level.bitrateDisplay) || '';
      return text + (fmtName ? ' · ' + fmtName : '') + (rate ? ' · ' + rate : '');
    }

    function downloadNotice(message, duration) {
      if (isHudVisible) showToast(message, duration || 3000);
      else vmxToastGlobal(message);
    }

    function startQuettaDownload(item, level, fallbackName) {
      if (isDrmProtected() || !item || item.noDL === 'drm' || item.drm === true) {
        markDynamicDrm('protected source selected');
        updateDrmUi();
        showToast('🔒 DRM-protected stream — download blocked', 4000);
        return;
      }
      level = level || null;
      var sourceExt = String(item.ext || '').toLowerCase();
      var isDash = sourceExt === 'mpd' || sourceExt === 'dash';
      var selectedUrl = (level && level.url) || item.selectedUrl || item.url || '';
      var downloadUrl = isDash ? (item.url || selectedUrl) : selectedUrl;
      if (!downloadUrl) { showToast('⚠ No downloadable source'); return; }
      var outputFormat = String((level && level.format) || item.outputFormat || (sourceExt === 'webm' ? 'webm' : 'mp4')).toLowerCase();
      if (['m3u8', 'mpd', 'dash', 'hls'].indexOf(outputFormat) !== -1) outputFormat = 'mp4';
      var cleanTitle = String(item.title || item.name || fallbackName || document.title || 'VideoMax video')
        .replace(/[\\/:*?"<>|]+/g, '_').slice(0, 160);
      if (IS_YOUTUBE && /googlevideo\.com\/videoplayback/i.test(downloadUrl) && /^https?:/i.test(downloadUrl)) {
        var ytFilename = cleanTitle + '.' + outputFormat;
        downloadNotice('⬇️ Starting YouTube download…');
        extSend({ type: 'vm_download', url: downloadUrl, filename: ytFilename, saveAs: false }, function (res) {
          if (res && res.ok) downloadNotice('✅ YouTube download started');
          else downloadViaLink(downloadUrl, ytFilename);
        });
        return;
      }
      var taskId = String(item.id || ('vmx-' + Date.now())) + '-' + Date.now().toString(36);
      var audioUrl = (level && level.audioUrl) || item.audioUrl || '';
      // Progressive files with muxed audio do not need the heavy remux engine;
      // start Chrome's native download immediately so the user always sees it.
      var isHls = sourceExt === 'm3u8' || sourceExt === 'hls' || /\.m3u8(?:[?#]|$)/i.test(downloadUrl);
      if (!isDash && !isHls && !audioUrl && /^https?:/i.test(downloadUrl)) {
        var directFilename = cleanTitle + '.' + outputFormat;
        downloadNotice('⬇️ Starting direct download…');
        extSend({ type: 'vm_download', url: downloadUrl, filename: directFilename, saveAs: false }, function (res) {
          if (res && res.ok) downloadNotice('✅ Download started in browser downloads');
          else downloadViaFetchBlob(downloadUrl, directFilename);
        });
        return;
      }

      var payload = {
        msg: 'VD_START_DOWNLOAD',
        taskId: taskId,
        url: downloadUrl,
        title: cleanTitle,
        ext: sourceExt || ((String(downloadUrl).match(/\.([a-z0-9]{2,5})(?:[?#]|$)/i) || [])[1] || 'mp4').toLowerCase(),
        outputFormat: outputFormat,
        origin: item.origin || location.href,
        referer: item.referer || location.origin + '/',
        pageOrigin: item.pageOrigin || location.origin,
        pageHref: item.pageHref || item.origin || location.href,
        faviconUrl: item.faviconUrl,
        mimeType: (level && level.mimeType) || item.mimeType || '',
        cover: item.cover || '',
        duration: item.duration || 0,
        sizeBytes: (level && (level.size || level.estimateSize)) || item.sizeBytes || item.len || item.size || 0,
        isLive: item.isLive === true,
        representationId: level && level.representationId,
        separateAudio: !!audioUrl,
        audioUrl: audioUrl || undefined,
        audioCodec: (level && level.audioCodec) || item.audioCodec,
        supportsByteRanges: item.supportsByteRanges,
        createdAt: Date.now()
      };
      var fallbackStarted = false;
      function advancedFallback(reason) {
        if (fallbackStarted) return;
        fallbackStarted = true;
        downloadNotice('⚠ Advanced engine failed: ' + String(reason || 'unknown').slice(0, 80), 4500);
        if (isHls) {
          startHlsDownload(downloadUrl, level && level.height || 0, cleanTitle);
        } else if (isDash || audioUrl) {
          copyText(ytDlpCommand(item.pageHref || item.origin || location.href, 'best'), '📋 yt-dlp fallback command copied');
        } else {
          extSend({ type: 'vm_download', url: downloadUrl, filename: cleanTitle + '.' + outputFormat, saveAs: false });
        }
      }
      vmAdvancedDownloadFallbacks.set(taskId, advancedFallback);
      downloadNotice('⬇️ Advanced download/remux started — keep the browser open', 3500);
      extSend(payload, function (res) {
        if (res && (res.started || res.success)) return;
        vmAdvancedDownloadFallbacks.delete(taskId);
        advancedFallback((res && res.error) || 'engine unavailable');
      });
    }

    function fetchYouTubeDirectStreams(callback) {
      try {
        if (!IS_YOUTUBE || !VMXBridge || !VMXBridge.call) { callback([]); return; }
        VMXBridge.call('yt-get-streams', null, function (info) {
          var out = [];
          try {
            var list = info && info.streams || [];
            list.forEach(function (x) {
              if (!x || !x.url || !/^https?:/i.test(x.url)) return;
              out.push({
                id: 'yt-' + (x.itag || x.quality || out.length),
                url: x.url,
                selectedUrl: x.url,
                ext: /webm/i.test(x.mimeType || '') ? 'webm' : 'mp4',
                outputFormat: /webm/i.test(x.mimeType || '') ? 'webm' : 'mp4',
                title: document.title || 'YouTube video',
                origin: location.href,
                pageOrigin: location.origin,
                pageHref: location.href,
                referer: location.origin + '/',
                canAdd: true,
                canSave: true,
                resolutions: [{ height: x.height || 0, quality: x.quality || (x.height ? x.height + 'p' : 'stream'), url: x.url, format: /webm/i.test(x.mimeType || '') ? 'WEBM' : 'MP4', mimeType: x.mimeType || '' }]
              });
            });
          } catch (e) {}
          callback(out);
        });
      } catch (e) { callback([]); }
    }

    function showDownloadPanel(url, allUrls, quettaItems) {
      // Remove any existing download panel
      const existing = shadowRoot.querySelector('.vm-download-panel');
      if (existing) existing.remove();

      var baseName = (typeof safeDownloadBasename === 'function')
        ? safeDownloadBasename((typeof _oembedTitle !== 'undefined' && _oembedTitle) || document.title || ('videomax-' + Date.now()))
        : String(document.title || 'videomax').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 80) || ('videomax-' + Date.now());
      var filename = baseName + '.mp4';

      const panel = createElement('div', 'vm-panel vm-download-panel vm-visible');
      panel.style.cssText = 'pointer-events:auto;';

      const label = createElement('div', 'vm-panel-label', 'Save & open');
      panel.appendChild(label);

      var hasDirect = !!(url && !/^blob:/i.test(url) && /^https?:/i.test(url));
      var grid = createElement('div', 'vm-dl-grid');
      panel.appendChild(grid);
      function addDlBtn(ico, title, sub, fn) {
        var b = createElement('div', 'vm-dl-btn');
        var ic = createElement('div', 'vm-dl-ico', ico);
        var tx = createElement('div');
        var t1 = document.createElement('div'); t1.textContent = title;
        tx.appendChild(t1);
        if (sub) { var t2 = document.createElement('small'); t2.textContent = sub; tx.appendChild(t2); }
        b.appendChild(ic); b.appendChild(tx);
        b.addEventListener('click', function (e) { e.stopPropagation(); try { panel.remove(); } catch (err) {} fn(); });
        grid.appendChild(b);
      }

      // Parsed source/quality ladders from the integrated v2.5 detector. Each
      // choice is sent to the resumable OPFS + LibAV engine (HLS/DASH included).
      var qItems = Array.isArray(quettaItems) ? quettaItems.filter(Boolean) : [];
      if (qItems.some(function (item) { return item.noDL === 'drm' || item.drm === true; })) {
        markDynamicDrm('detector reported DRM');
        updateDrmUi();
        panel.remove();
        showToast('🔒 DRM detected — download controls removed', 4000);
        return;
      }
      if (qItems.length) {
        grid.appendChild(createElement('div', 'vm-panel-label', 'Detected qualities · Advanced engine'));
        var qSeen = Object.create(null);
        qItems.forEach(function (item) {
          var levels = (item.resolutions && item.resolutions.length) ? item.resolutions : [null];
          levels.forEach(function (level) {
            var qUrl = (level && level.url) || item.url || '';
            var qKey = qUrl + '|' + (level && level.representationId || '');
            if (!qUrl || qSeen[qKey]) return;
            qSeen[qKey] = 1;
            var sub = quettaLevelLabel(item, level);
            var size = level && (level.size || level.estimateSize) || item.sizeBytes || item.len || 0;
            if (size > 0) sub += ' · ' + (size / 1048576).toFixed(size > 104857600 ? 0 : 1) + ' MB';
            addDlBtn('⚡', 'Download ' + (level && (level.height || level.quality) ? String(level.height || level.quality).replace(/p$/i, '') + 'p' : 'best'), sub,
              function () { startQuettaDownload(item, level, baseName); });
          });
        });
        grid.appendChild(createElement('div', 'vm-panel-separator'));
      }

      if (IS_YOUTUBE) {
        var ytLoading = createElement('div', 'vm-panel-label', 'YouTube direct streams: checking…');
        grid.appendChild(ytLoading);
        fetchYouTubeDirectStreams(function (ytItems) {
          try {
            if (!panel.isConnected) return;
            ytLoading.textContent = ytItems && ytItems.length ? 'YouTube direct streams' : 'YouTube direct streams unavailable';
            if (!ytItems || !ytItems.length) return;
            var seenYt = Object.create(null);
            ytItems.forEach(function (item) {
              var level = item.resolutions && item.resolutions[0] || null;
              var key = item.url;
              if (!key || seenYt[key]) return;
              seenYt[key] = 1;
              addDlBtn('▶', 'Download ' + (level && level.quality || 'YouTube stream'), 'Direct GoogleVideo URL', function () {
                startQuettaDownload(item, level, baseName);
              });
            });
            grid.appendChild(createElement('div', 'vm-panel-separator'));
          } catch (e) {}
        });
      }

      if (hasDirect) {
        addDlBtn('⬇️', 'Download', 'Save with browser', function () {
          var k = classifyMediaUrl(url);
          if (k !== 'm3u8' && k !== 'mpd') {
            downloadNotice('⬇️ Starting download…');
            extSend({ type: 'vm_download', url: url, filename: filename, saveAs: false }, function (res) {
              if (res && res.ok) downloadNotice('✅ Download started');
              else downloadViaFetchBlob(url, filename);
            });
          } else if (!downloadViaNative(url, filename, false)) downloadViaFetchBlob(url, filename);
        });
        addDlBtn('💾', 'Save As…', 'Choose folder', function () {
          var k = classifyMediaUrl(url);
          if (k !== 'm3u8' && k !== 'mpd') {
            extSend({ type: 'vm_download', url: url, filename: filename, saveAs: true }, function (res) {
              if (!(res && res.ok)) downloadViaLink(url, filename);
            });
          } else if (!downloadViaNative(url, filename, true)) downloadViaLink(url, filename);
        });
      }
      var hlsManifest = null;
      if (typeof isHlsUrl === 'function' && isHlsUrl(url)) hlsManifest = url;
      else { var hm = (capturedManifests || []).filter(function (m) { return m.type === 'hls'; })[0]; if (hm) hlsManifest = hm.url; }
      if (hlsManifest) {
        addDlBtn('🎞', 'HLS stream', 'Merge segments', function () {
          var th = (_lastQualityTarget && /^\d+$/.test(String(_lastQualityTarget))) ? parseInt(_lastQualityTarget, 10) : 0;
          startHlsDownload(hlsManifest, th, (typeof baseName !== 'undefined' && baseName) || ('videomax-' + Date.now()));
        });
      }
      addDlBtn('📦', 'Download manager', IS_MOBILE ? '1DM / IDM / ADM' : 'JDownloader / IDM', function () {
        var batch = [];
        if (url && !/^blob:/i.test(url)) batch.push(url);
        try { (allUrls || []).forEach(function (u) { if (u && batch.indexOf(u) === -1) batch.push(u); }); } catch (e) {}
        if (batch.length > 1 && !IS_MOBILE) {
          tryJDownloader(batch.slice(0, 12), function (ok) { if (!ok) sendToExternalManager(url, filename); });
        } else sendToExternalManager(url, filename);
      });
      addDlBtn('▶️', 'External player', 'VLC / MX', function () { playInExternalPlayer(url); });
      addDlBtn('🧰', 'yt-dlp best', 'Copy terminal command', function () {
        var _cmd = (ytDlpCommand.length >= 1) ? ytDlpCommand(IS_YOUTUBE ? location.href : url, 'best') : ytDlpCommand(IS_YOUTUBE ? location.href : url);
        copyText(_cmd, '📋 yt-dlp copied');
      });
      if (url) addDlBtn('📋', 'Copy link', '', function () { copyText(url, '📋 Copied'); });
      if (capturedVideoUrls && capturedVideoUrls.length) {
        panel.appendChild(createElement('div', 'vm-panel-label', 'Detected'));
        capturedVideoUrls.slice().sort(function (a,b){return (b.time||0)-(a.time||0);}).slice(0,5).forEach(function (vid) {
          addDlBtn('🎬', vid.label || vid.format || 'File', '', function () {
            var bn = (typeof baseName !== 'undefined' && baseName) || 'video';
            var _fn = bn + '-' + (vid.label || 'f') + '.' + (vid.format || 'mp4').toLowerCase();
            if (!downloadViaNative(vid.url, _fn, false)) downloadViaFetchBlob(vid.url, _fn);
          });
        });
      }

      
      // Cancel
      panel.appendChild(createElement('div', 'vm-panel-separator'));
      const cancelBtn = createElement('div', 'vm-panel-item');
      cancelBtn.textContent = 'Close';
      cancelBtn.className = 'vm-dl-btn';
      cancelBtn.style.cssText = 'justify-content:center;margin:8px 10px;color:rgba(255,255,255,.75)';
      cancelBtn.addEventListener('click', function () { panel.remove(); });
      panel.appendChild(cancelBtn);

      // Append to overlay (always visible, even when HUD is hidden)
      overlay.appendChild(panel);
      panel.style.pointerEvents = 'auto';

      // Close on click outside
      function onOutsideClick(e) {
        if (!panel.contains(e.target)) {
          panel.remove();
          shadowRoot.removeEventListener('click', onOutsideClick);
        }
      }
      setTimeout(function () {
        shadowRoot.addEventListener('click', onOutsideClick);
      }, 100);
    }
    menuInfo.addEventListener('click', function () {
      const info = [
        video.videoWidth + '×' + video.videoHeight,
        formatTime(video.duration),
        video.playbackRate + '×'
      ].filter(Boolean).join(' · ');
      showToast(info, 3000);
      closeAllPanels();
    });
    menuReset.addEventListener('click', function () { resetEverything(); closeAllPanels(); });
    menuDiag.addEventListener('click', function () {
      closeAllPanels();
      var ok = VMX_LOG.exportTxt();
      showToast(ok ? '📄 Diagnostics saved to downloads — send me the .txt' : '⚠ Export failed');
    });
    // Cinema Mode removed (unreliable stacking-context dimmer across sites).
    // Kept as a permanent null so the couple of defensive cleanup checks
    // elsewhere in this file remain harmless no-ops.
    var cinemaOverlay = null;
    menuRotateMenu.addEventListener('click', function () {
      closeAllPanels();
      handleRotation();
    });
    menuMirrorMenu.addEventListener('click', function () {
      closeAllPanels();
      isMirrored = !isMirrored;
      mirrorButton.classList.toggle('vm-active-state', isMirrored);
      applyAspectRatio();
      showToast(isMirrored ? '🪞 Mirrored' : '🪞 Normal');
    });
    menuAudioBoost.addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      try { _panelIgnoreUntil = Date.now() + 400; } catch (err) {}
      getOrCreateAudioBoost(video);
      openSubPanel(contextMenu, menuAudioBoost, eqPanel, 'Equalizer');
    });


    /* ═══════════════════════════════════════════════════
     *  PiP / SCREENSHOT
     * ═══════════════════════════════════════════════════ */
    function togglePiP() {
      if (document.pictureInPictureElement === video) {
        document.exitPictureInPicture().catch(function(){});
        pipBadge.classList.remove('vm-visible');
        showToast('Exit PiP');
      } else if (document.pictureInPictureEnabled) {
        video.requestPictureInPicture()
          .then(function () { pipBadge.classList.add('vm-visible'); showToast('📺 PiP'); })
          .catch(function () { showToast('PiP unavailable'); });
      } else {
        showToast('PiP not supported');
      }
    }
    video.addEventListener('leavepictureinpicture', function () {
      pipBadge.classList.remove('vm-visible');
    });

    function takeScreenshot() {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 1280;
        canvas.height = video.videoHeight || 720;
        const ctx2d = canvas.getContext('2d');
        ctx2d.drawImage(video, 0, 0);
        canvas.toBlob(function (blob) {
          if (!blob) return;
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'videomax-' + Date.now() + '.png';
          a.click();
          setTimeout(function () { URL.revokeObjectURL(url); }, 3000);
        }, 'image/png');
        showToast('📸 Screenshot Saved');
      } catch (e) {
        showToast('Screenshot failed (CORS)');
      }
    }


    /* ═══════════════════════════════════════════════════
     *  RESET ALL
     * ═══════════════════════════════════════════════════ */
    function resetEverything() {
      zoomLevel = 1;
      aspectRatioIndex = 0;
      rotationDeg = 0;
      screenRotIndex = 0;
      brightnessLevel = 1;
      speedIndex = 3;
      isMirrored = false;
      audioBoostLevel = 1;
      videoFilters = { ...FILTER_DEFAULTS };

      video.playbackRate = 1;
      video.muted = false;
      video.volume = 1;
      isLooping = false;
      video.loop = false;

      abPointA = null;
      abPointB = null;
      isABLoopActive = false;
      stopABLoopCheck();

      brightnessLevel = 1;
      applyBrightness();
      speedButton.textContent = '1×';
      arButton.textContent = 'Default';
      rotateButton.textContent = '↻ 0°';

      loopButton.classList.remove('vm-active-state');
      subtitleButton.classList.remove('vm-active-state');
      abLoopButton.classList.remove('vm-active-state');
      abLoopBadge.classList.remove('vm-visible');
      mirrorButton.classList.remove('vm-active-state');

      if (volumeSlider) volumeSlider.value = 1;

      const boost = audioBoostMap.get(video);
      if (boost) boost.gain.gain.value = 1;

      for (const cfg of FILTER_CONFIG) {
        const ctrl = filterControls[cfg.key];
        ctrl.slider.value = String(FILTER_DEFAULTS[cfg.key]);
        ctrl.valueDisplay.textContent = FILTER_DEFAULTS[cfg.key] + cfg.unit;
      }

      disableSubtitles();
      updateABMarkers();
      applyAspectRatio();
      showToast('↺ Reset');
      savePreferences();
    }


    /* ═══════════════════════════════════════════════════
     *  HUD OPEN / CLOSE
     * ═══════════════════════════════════════════════════ */
    // Apply a defaults object (from popup storage OR a live "Apply" push).
    // `force` = true bypasses the "only on first/default state" guards so the
    // popup "Apply to current tab" button always takes effect immediately.
    function applyDefaults(d, force) {
      if (!d) return;
      try {
        try { window.__vmxDefaults = Object.assign({}, window.__vmxDefaults || {}, d); } catch (e) {}
        // ─── Aspect ratio ───
        if (d.ar !== undefined && (force || (d.ar > 0 && aspectRatioIndex === 0))) {
          aspectRatioIndex = clamp(parseInt(d.ar) || 0, 0, AR_MODES.length - 1);
          arButton.textContent = AR_MODES[aspectRatioIndex].label;
          applyAspectRatio();
        }
        // ─── Playback speed ───
        if (d.speed !== undefined && (force || d.speed !== 3)) {
          speedIndex = clamp(parseInt(d.speed) || 3, 0, SPEED_OPTIONS.length - 1);
          video.playbackRate = SPEED_OPTIONS[speedIndex];
          speedButton.textContent = SPEED_OPTIONS[speedIndex] + '×';
        }
        // ─── Preferred video quality ───
        if (d.quality !== undefined && d.quality !== 'auto') {
          var qWant = d.quality;
          try {
            // Context-aware: on save-data/slow net, never force 4K
            var cap = HostBrain.preferredQualityCap();
            if (cap && /^\d+$/.test(String(qWant)) && parseInt(qWant, 10) > cap) {
              qWant = String(cap);
            }
          } catch (e) {}
          _autoQualityTimers.push(setTimeout(function () { applyPreferredQuality(qWant); }, force ? 0 : 800));
          _autoQualityTimers.push(setTimeout(function () { applyPreferredQuality(qWant); }, force ? 1200 : 2500));
          try { HostBrain.saveHostPrefs({ quality: qWant }); } catch (e) {}
        } else if (force && d.quality === 'auto') {
          // Even auto may pick a capped ladder when saveData is on
          try {
            var cap2 = HostBrain.preferredQualityCap();
            if (cap2) applyPreferredQuality(String(cap2));
            else applyPreferredQuality('auto');
          } catch (e) { applyPreferredQuality('auto'); }
        }
        // ─── Auto subtitles ───
        if (d.subs) {
          setTimeout(function () { if (activeSubtitleIndex === -1) toggleSubtitles(); }, force ? 0 : 1000);
        }
        if (force) showToast('✓ Settings applied');
      } catch (e) {}
    }

    // Preload popup defaults early; orientation defaults to landscape if storage is not ready yet.
    try {
      var _apiDefaults = (typeof chrome !== 'undefined' && chrome.storage) ? chrome.storage.local : null;
      if (!_apiDefaults && typeof browser !== 'undefined' && browser.storage) _apiDefaults = browser.storage.local;
      if (_apiDefaults) _apiDefaults.get(['vm_defaults'], function (r) { try { window.__vmxDefaults = (r && r.vm_defaults) || {}; } catch (e) {} });
    } catch (e) {}

    // Register this instance so popup Save/Apply can push live updates
    function _vmApplyFn(d) { applyDefaults(d, true); }
    vmApplyDefaultsFns.push(_vmApplyFn);

    // Load popup defaults on first open
    var _defaultsLoaded = false;
    function loadPopupDefaults() {
      if (_defaultsLoaded) return;
      _defaultsLoaded = true;
      // If the popup pushed defaults before this player existed, honour them now
      if (vmPendingDefaults) { applyDefaults(vmPendingDefaults, false); }
      try {
        var api = null;
        try { api = (typeof chrome !== 'undefined' && chrome && chrome.storage) ? chrome.storage.local : null; } catch(e) {}
        if (!api) { try { api = (typeof browser !== 'undefined' && browser && browser.storage) ? browser.storage.local : null; } catch(e) {} }
        if (!api) return;
        api.get(['vm_defaults'], function (r) {
          try { window.__vmxDefaults = (r && r.vm_defaults) || {}; } catch (e) {}
          applyDefaults(r && r.vm_defaults, false);
        });
      } catch (e) {}
    }

    function openHUD() {
      hud.classList.add('vm-active');
      isHudVisible = true;
      loadPopupDefaults();
      entryWrapper.style.display = 'none';
      // While HUD is open, capture all pointer events over the player so the
      // site cannot steal taps (fixes single-tap = play/pause on YT/Twitch).
      try { hostElement.style.pointerEvents = 'auto'; } catch (e) {}
      try { overlay.style.pointerEvents = 'auto'; } catch (e) {}
      try { applyBrightness(); } catch (e) {}
      updateProgress();
      updatePlayPauseIcon();
      updateMuteIcon();
      resetAutoHide();
      buildSubtitleOptions();
      buildQualityOptions();
      startProgressLoop();
      reflowControls();
      setTimeout(reflowControls, 60);

      // YouTube/page players expose full quality+caption lists only after
      // playback starts — refresh the menus a few times while the HUD is open.
      [800, 2000, 4000].forEach(function (d) {
        setTimeout(function () {
          if (!isHudVisible) return;
          _ytQualityFetching = false; _ytCaptionFetching = false; _genericQualityFetching = false;
          _ytQualityCache = null; _ytCaptionCache = null; _genericQualityCache = null;
          buildQualityOptions();
          buildSubtitleOptions();
        }, d);
      });

      if (keyboardHint) {
        keyboardHint.classList.add('vm-visible');
        clearTimeout(badgeTimers.kb);
        badgeTimers.kb = setTimeout(function () {
          keyboardHint.classList.remove('vm-visible');
        }, 4000);
      }
    }

    function closeHUD() {
      hud.classList.remove('vm-active');
      isHudVisible = false;
      if (!isDismissed && !USE_EXTERNAL_LAUNCHER) { entryWrapper.style.display = ''; if (typeof scheduleEntryIdle === 'function') scheduleEntryIdle(); }
      else if (USE_EXTERNAL_LAUNCHER) entryWrapper.style.display = 'none';
      closeAllPanels();
      hud.classList.remove('vm-controls-hidden');
      stopProgressLoop();
      // Release capture so site controls work when VideoMax HUD is closed
      try {
        if (useFloatingHost) hostElement.style.pointerEvents = 'none';
        else hostElement.style.pointerEvents = 'none';
        overlay.style.pointerEvents = 'none';
        // entry pill still needs clicks
        entryWrapper.style.pointerEvents = 'auto';
      } catch (e) {}
    }


    /* ═══════════════════════════════════════════════════
     *  PROGRESS BAR (RAF-based, only when HUD visible)
     * ═══════════════════════════════════════════════════ */
    function updateProgress() {
      if (!video.duration) return;
      const percent = (video.currentTime / video.duration) * 100;
      seekProgress.style.width = percent + '%';
      timeDisplay.textContent = formatTime(video.currentTime) + ' / ' + formatTime(video.duration);
      if (video.buffered.length > 0) {
        const bufferedEnd = video.buffered.end(video.buffered.length - 1);
        seekBuffered.style.width = (bufferedEnd / video.duration * 100) + '%';
      }
    }

    function progressAnimationLoop() {
      if (isDestroyed || !isHudVisible) return;
      if (!video.paused) updateProgress();
      progressRAF = requestAnimationFrame(progressAnimationLoop);
    }

    function startProgressLoop() {
      video.addEventListener('timeupdate', updateProgress);
      if (progressRAF) return;
      progressRAF = requestAnimationFrame(progressAnimationLoop);
    }

    function stopProgressLoop() {
      try { video.removeEventListener('timeupdate', updateProgress); } catch (e) {}
      if (progressRAF) {
        cancelAnimationFrame(progressRAF);
        progressRAF = null;
      }
    }

    function updatePlayPauseIcon() {
      setButtonIcon(playPauseButton, video.paused ? 'play' : 'pause');
    }

    function updateMuteIcon() {
      const isMuted = isUserMuted || video.muted || video.volume === 0;
      if (isMuted) {
        setButtonIcon(muteButton, 'volumeMute');
      } else if (video.volume < 0.4 && audioBoostLevel <= 1) {
        setButtonIcon(muteButton, 'volumeLow');
      } else {
        setButtonIcon(muteButton, 'volumeHigh');
      }
      muteButton.classList.toggle('vm-active-state', isMuted);
    }

    function updateVolumeSlider() {
      if (volumeSlider) {
        volumeSlider.value = (isUserMuted || video.muted) ? 0 : (audioBoostLevel > 1 ? audioBoostLevel : video.volume);
      }
    }


    /* ═══════════════════════════════════════════════════
     *  SEEK BAR INTERACTION
     * ═══════════════════════════════════════════════════ */
    function getSeekRatio(clientX) {
      const rect = seekTrack.getBoundingClientRect();
      return clamp((clientX - rect.left) / rect.width, 0, 1);
    }

    function seekToPosition(clientX) {
      if (!video.duration) return;
      video.currentTime = getSeekRatio(clientX) * video.duration;
      updateProgress();
    }

    function updateSeekTooltip(clientX) {
      if (!video.duration) return;
      const ratio = getSeekRatio(clientX);
      seekTooltip.textContent = formatTime(ratio * video.duration);
      seekTooltip.style.left = (ratio * 100) + '%';
    }

    seekContainer.addEventListener('mousedown', function (e) {
      e.stopPropagation();
      isSeekDragging = true;
      seekContainer.classList.add('vm-dragging');
      seekToPosition(e.clientX);
      resetAutoHide();
    });
    seekContainer.addEventListener('mousemove', function (e) {
      e.stopPropagation();
      if (isSeekDragging) seekToPosition(e.clientX);
      else updateSeekTooltip(e.clientX);
    });
    seekContainer.addEventListener('mouseup', function (e) {
      e.stopPropagation();
      isSeekDragging = false;
      seekContainer.classList.remove('vm-dragging');
    });
    seekContainer.addEventListener('click', function (e) { e.stopPropagation(); });

    // Touch support for seek bar
    seekContainer.addEventListener('touchstart', function (e) {
      e.stopPropagation();
      isSeekDragging = true;
      seekToPosition(e.touches[0].clientX);
    }, { passive: true });
    seekContainer.addEventListener('touchmove', function (e) {
      e.stopPropagation();
      if (isSeekDragging) seekToPosition(e.touches[0].clientX);
    }, { passive: true });
    seekContainer.addEventListener('touchend', function (e) {
      e.stopPropagation();
      isSeekDragging = false;
      seekContainer.classList.remove('vm-dragging');
    }, { passive: true });

    // Global mouse events for seek dragging (named so destroyPlayer can remove them)
    function onDocMouseMove(e) {
      if (isSeekDragging) seekToPosition(e.clientX);
    }
    function onDocMouseUp() {
      isSeekDragging = false;
      seekContainer.classList.remove('vm-dragging');
    }
    document.addEventListener('mousemove', onDocMouseMove);
    document.addEventListener('mouseup', onDocMouseUp);


    /* ═══════════════════════════════════════════════════
     *  BUTTON EVENT HANDLERS
     * ═══════════════════════════════════════════════════ */
    function stopEvent(e) { e.stopPropagation(); }

    // Auto-fade the entry pill after a few seconds so it stays unobtrusive.
    let entryIdleTimer = null;
    function scheduleEntryIdle() {
      clearTimeout(entryIdleTimer);
      entryWrapper.classList.remove('vm-idle');
      entryIdleTimer = setTimeout(function () {
        if (!isHudVisible && !isDismissed) entryWrapper.classList.add('vm-idle');
      }, 4000);
    }
    scheduleEntryIdle();
    entryWrapper.addEventListener('mouseenter', function () {
      clearTimeout(entryIdleTimer); entryWrapper.classList.remove('vm-idle');
    });
    entryWrapper.addEventListener('mouseleave', scheduleEntryIdle);

    // ─── SMART BUTTON VISIBILITY ───
    // Re-reveal the entry pill whenever the user is actually interacting with the
    // player (mouse moves over it, or play/pause), then fade again — so it's
    // always there the moment you want it, but never in the way. Cheap: a
    // throttled pointer listener on the player box + native media events.
    function revealEntry() {
      if (USE_EXTERNAL_LAUNCHER) return;
      if (isHudVisible || isDismissed) return;
      entryWrapper.classList.remove('vm-idle');
      if (entryWrapper.style.display === 'none') entryWrapper.style.display = '';
      scheduleEntryIdle();
    }
    var _revealThrottle = 0;
    function onPlayerActivity() {
      var now = Date.now();
      if (now - _revealThrottle < 600) return;   // throttle
      _revealThrottle = now;
      revealEntry();
    }
    try {
      var _activityTarget = (useFloatingHost ? (container || video) : (container || video));
      if (_activityTarget && _activityTarget.addEventListener) {
        _activityTarget.addEventListener('pointermove', onPlayerActivity, { passive: true });
        _activityTarget.addEventListener('pointerenter', onPlayerActivity, { passive: true });
      }
      video.addEventListener('play', revealEntry);
      video.addEventListener('pause', revealEntry);
    } catch (e) {}

    entryButton.addEventListener('click', function (e) { stopEvent(e); openHUD(); });
    closeButton.addEventListener('click', function (e) {
      stopEvent(e);
      if (isFullscreen) exitFullscreen();
      else closeHUD();
    });
    dismissButton.addEventListener('click', function (e) {
      stopEvent(e);
      isDismissed = true;
      // Remember this video so the YouTube/Twitch polls & MutationObserver never
      // re-attach it a second later (the "button comes back after ✕" bug).
      try { dismissedVideos.add(video); } catch (err) {}
      // Full undo + EXIT: return the native player to its original state and
      // remove the overlay entirely (VideoMax button disappears). Reload to
      // re-enable the extension.
      showToast('↩ Restored original player — reload to re-enable');
      setTimeout(function () { try { restoreNativePlayer(); } catch (err) {} }, 30);
    });

    resetButton.addEventListener('click', function (e) {
      stopEvent(e);
      // Full undo but KEEP the extension: revert every change to the original
      // player, close the HUD, and leave the VideoMax button in place so the
      // user can start fresh.
      try { if (isHudVisible) closeHUD(); } catch (err) {}
      try { resetVideoToOriginal(); } catch (err) {}
      showToast('↻ Reset to original');
    });

    playPauseButton.addEventListener('click', function (e) {
      stopEvent(e);
      haptic();
      try {
        if (video.paused) {
          var p = video.play();
          if (p && p.catch) p.catch(function () {});
          showToast('▶');
        } else {
          video.pause();
          showToast('⏸');
        }
      } catch (err) {}
      // Re-sync the icon after the site settles (YT/Twitch fire their own
      // play/pause during ads/buffering which can momentarily desync the icon).
      updatePlayPauseIcon();
      setTimeout(updatePlayPauseIcon, 150);
      resetAutoHide();
    });

    rewindButton.addEventListener('click', function (e) {
      stopEvent(e);
      haptic();
      video.currentTime = Math.max(0, video.currentTime - 10);
      showToast('⏪ −10s');
      resetAutoHide();
    });

    forwardButton.addEventListener('click', function (e) {
      stopEvent(e);
      haptic();
      video.currentTime = Math.min(video.duration || 0, video.currentTime + 10);
      showToast('⏩ +10s');
      resetAutoHide();
    });

    muteButton.addEventListener('click', function (e) {
      stopEvent(e);
      var boost = audioBoostMap.get(video);
      var boostActive = boost && !boost.broken && audioBoostLevel > 1;
      if (isUserMuted) {
        // UNMUTE — restore element volume AND the Web-Audio gain (if boosting).
        isUserMuted = false;
        video.muted = false;
        if (boostActive) {
          try { boost.gain.gain.value = audioBoostLevel; } catch (err) {}
          video.volume = 1;
        } else {
          video.volume = lastVolume || 1;
        }
        showToast('🔊');
      } else {
        // MUTE — silence BOTH the element AND the Web-Audio gain node. Muting
        // only video.muted leaves the boost graph audible ("muted but has sound").
        isUserMuted = true;
        lastVolume = (audioBoostLevel > 1) ? 1 : video.volume;
        video.muted = true;
        if (boost && !boost.broken) { try { boost.gain.gain.value = 0; } catch (err) {} }
        showToast('🔇');
      }
      updateMuteIcon();
      updateVolumeSlider();
      resetAutoHide();
    });

    speedButton.addEventListener('click', function (e) {
      stopEvent(e);
      haptic();
      speedIndex = (speedIndex + 1) % SPEED_OPTIONS.length;
      video.playbackRate = SPEED_OPTIONS[speedIndex];
      speedButton.textContent = SPEED_OPTIONS[speedIndex] + '×';
      showToast('⚡ ' + SPEED_OPTIONS[speedIndex] + '×');
      // Save speed per domain
      S.set('speed_' + location.hostname, speedIndex);
      resetAutoHide();
    });

    loopButton.addEventListener('click', function (e) {
      stopEvent(e);
      isLooping = !isLooping;
      video.loop = isLooping;
      loopButton.classList.toggle('vm-active-state', isLooping);
      showToast(isLooping ? '🔁 Loop On' : '↩ Loop Off');
    });

    subtitleButton.addEventListener('click', function (e) {
      stopEvent(e);
      _panelIgnoreUntil = Date.now() + 400;
      buildSubtitleOptions();
      openSubPanel(contextMenu, subtitleButton, subtitlePanel, 'Subtitles');
      clearTimeout(autoHideTimeout); hud.classList.remove('vm-controls-hidden');
    });
    pipButtonTop.addEventListener('click', function (e) { stopEvent(e); togglePiP(); });
    fullscreenButton.addEventListener('click', function (e) { stopEvent(e); isFullscreen ? exitFullscreen() : enterFullscreen(); });

    zoomInButton.addEventListener('click', function (e) {
      stopEvent(e);
      zoomLevel = Math.min(4, round1(zoomLevel + 0.1));
      applyAspectRatio();
      badgeZoom.textContent = Math.round(zoomLevel * 100) + '%';
      showBadge('zoom', badgeZoom);
      resetAutoHide();
    });
    zoomOutButton.addEventListener('click', function (e) {
      stopEvent(e);
      zoomLevel = Math.max(0.3, round1(zoomLevel - 0.1));
      applyAspectRatio();
      badgeZoom.textContent = Math.round(zoomLevel * 100) + '%';
      showBadge('zoom', badgeZoom);
      resetAutoHide();
    });
    arButton.addEventListener('click', function (e) {
      stopEvent(e);
      aspectRatioIndex = (aspectRatioIndex + 1) % AR_MODES.length;
      arButton.textContent = AR_MODES[aspectRatioIndex].label;
      _arLastSig = '';
      applyAspectRatio(true);
      badgeAR.textContent = AR_MODES[aspectRatioIndex].label;
      showBadge('ar', badgeAR, 1200);
      savePreferences();
      resetAutoHide();
    });

    if (volumeSlider) {
      volumeSlider.addEventListener('input', function (e) {
        stopEvent(e);
        const val = parseFloat(e.target.value); // 0..3 (1 = 100%)
        isUserMuted = (val === 0);   // dragging the slider clears/sets our mute
        // Safe volume: element volume for 0-100%, Web Audio only for >100% boost
        var boosting = setVideoVolume(video, val, null);
        audioBoostLevel = boosting ? val : 1;
        showSideBar('right', Math.min(val / 3, 1), Math.round(val * 100) + '%');
        updateMuteIcon();
        updateVolumeSlider();
        resetAutoHide();
      });
      volumeSlider.addEventListener('click', stopEvent);
      volumeSlider.addEventListener('mousedown', stopEvent);
      volumeSlider.addEventListener('pointerdown', stopEvent);
    }

    // Skip ad button
    skipAdButton.addEventListener('click', function (e) {
      stopEvent(e);
      const adSkipBtn = document.querySelector('.ytp-skip-ad-button, [class*="skip-ad"]');
      if (adSkipBtn) adSkipBtn.click();
      else if (video.duration) video.currentTime = video.duration - 0.1;
    });
    const adCheckInterval = setInterval(function () {
      if (document.hidden || isDestroyed) return;   // PERF: idle when hidden
      const isAd = !!document.querySelector('.ytp-ad-player-overlay, .ad-showing');
      skipAdButton.classList.toggle('vm-visible', isAd && isHudVisible);
    }, 3000);


    /* ═══════════════════════════════════════════════════
     *  PREFERENCES (Save / Load)
     * ═══════════════════════════════════════════════════ */
    function getPreferenceKey() {
      return 'vmPref_' + (video.currentSrc || video.src || location.hostname).slice(0, 70);
    }

    function savePreferences() {
      var payload = {
        arIdx: aspectRatioIndex,
        rot: rotationDeg,
        rotScreen: screenRotIndex,
        zoom: zoomLevel,
        bright: brightnessLevel,
        spdIdx: speedIndex,
        filters: videoFilters,
        mirror: isMirrored,
        boost: audioBoostLevel,
      };
      Store.set(getPreferenceKey(), payload);
      // Smart: also remember per-host defaults for next video on this site
      try {
        HostBrain.saveHostPrefs({
          arIdx: aspectRatioIndex,
          spdIdx: speedIndex,
          bright: brightnessLevel,
          zoom: zoomLevel,
          quality: (typeof _lastQualityTarget !== 'undefined' ? _lastQualityTarget : undefined)
        });
      } catch (e) {}
    }

    let preferencesLoaded = false;
    function loadPreferences() {
      if (preferencesLoaded) return;
      preferencesLoaded = true;
      const saved = Store.get(getPreferenceKey(), null);
      if (!saved) return;

      if (saved.arIdx !== undefined) {
        aspectRatioIndex = clamp(saved.arIdx, 0, AR_MODES.length - 1);
        arButton.textContent = AR_MODES[aspectRatioIndex].label;
      }
      if (saved.rot !== undefined && !IS_MOBILE) {
        rotationDeg = saved.rot;
        rotateButton.textContent = '↻ ' + rotationDeg + '°';
      }
      if (saved.zoom !== undefined) {
        zoomLevel = clamp(saved.zoom, 0.3, 4);
      }
      if (saved.bright !== undefined) {
        brightnessLevel = clamp(saved.bright, 0.1, 2.0);
        applyBrightness();
      }
      if (saved.spdIdx !== undefined) {
        speedIndex = clamp(saved.spdIdx, 0, SPEED_OPTIONS.length - 1);
      }
      // Per-domain speed override
      var domainSpeed = S.get('speed_' + location.hostname, null);
      if (domainSpeed !== null) speedIndex = clamp(domainSpeed, 0, SPEED_OPTIONS.length - 1);

      // HostBrain learned prefs (fill gaps only)
      try {
        var hp = HostBrain.loadHostPrefs();
        if (hp) {
          if (saved.arIdx === undefined && hp.arIdx != null) {
            aspectRatioIndex = clamp(hp.arIdx, 0, AR_MODES.length - 1);
            arButton.textContent = AR_MODES[aspectRatioIndex].label;
          }
          if (domainSpeed === null && hp.spdIdx != null) {
            speedIndex = clamp(hp.spdIdx, 0, SPEED_OPTIONS.length - 1);
          }
          if (saved.bright === undefined && hp.bright != null) {
            brightnessLevel = clamp(hp.bright, 0.05, 2.0);
            applyBrightness();
          }
          if (saved.zoom === undefined && hp.zoom != null) {
            zoomLevel = clamp(hp.zoom, 0.3, 4);
          }
        }
      } catch (e) {}

      video.playbackRate = SPEED_OPTIONS[speedIndex];
      speedButton.textContent = SPEED_OPTIONS[speedIndex] + '×';
      if (saved.filters) {
        videoFilters = { ...FILTER_DEFAULTS, ...saved.filters };
        for (const cfg of FILTER_CONFIG) {
          const ctrl = filterControls[cfg.key];
          ctrl.slider.value = String(videoFilters[cfg.key]);
          ctrl.valueDisplay.textContent = videoFilters[cfg.key] + cfg.unit;
        }
      }
      if (saved.mirror) {
        isMirrored = true;
        mirrorButton.classList.add('vm-active-state');
      }
      if (saved.boost && saved.boost > 1) {
        audioBoostLevel = saved.boost;
        const boost = getOrCreateAudioBoost(video);
        if (boost) boost.gain.gain.value = audioBoostLevel;
      }

      applyAspectRatio();
    }


    /* ═══════════════════════════════════════════════════
     *  VIDEO EVENT LISTENERS
     * ═══════════════════════════════════════════════════ */
    // timeupdate is attached only while HUD progress loop is active (perf)
    video.addEventListener('play', function () {
      updatePlayPauseIcon();
      resetAutoHide();
      if (isHudVisible) startProgressLoop();
    });
    video.addEventListener('pause', function () {
      updatePlayPauseIcon();
      hud.classList.remove('vm-controls-hidden');
      // [P14] Save playback position for resume
      if (video.currentTime > 5 && video.duration && video.currentTime < video.duration - 5) {
        S.set('resume_' + getPreferenceKey(), { time: video.currentTime, date: Date.now() });
      }
    });
    video.addEventListener('volumechange', function () {
      updateMuteIcon();
      updateVolumeSlider();
    });
    video.addEventListener('ended', function () {
      if (isLooping) {
        video.currentTime = 0;
        video.play();
      }
      updatePlayPauseIcon();
    });
    video.addEventListener('durationchange', function () {
      updateProgress();
      updateABMarkers();
    });
    // [FIX] Speed pill syncs with external playback rate changes
    // Sync speed pill with external rate changes — BUT NOT during hold mode
    video.addEventListener('ratechange', function () {
      if (isHoldActive) return; // Don't corrupt speedIndex during hold!
      const currentRate = round1(video.playbackRate);
      speedButton.textContent = currentRate + '×';
      const matchIndex = SPEED_OPTIONS.indexOf(currentRate);
      if (matchIndex >= 0) speedIndex = matchIndex;
    });
    video.addEventListener('loadedmetadata', function () {
      // New media → invalidate page-world caches so they refetch for this video.
      _ytQualityCache = null; _ytCaptionCache = null; _genericQualityCache = null;
      _ytQualityFetching = false; _ytCaptionFetching = false; _genericQualityFetching = false;
      loadPreferences();
      applyAspectRatio();
      updateProgress();
      buildQualityOptions();
      // Re-apply preferred default quality for the freshly-loaded video.
      try {
        var _api = (typeof chrome !== 'undefined' && chrome.storage) ? chrome.storage.local : null;
        if (_api) _api.get(['vm_defaults'], function (r) {
          var q = r && r.vm_defaults && r.vm_defaults.quality;
          if (q && q !== 'auto') { 
              if (video.dataset.vmPrefSrc === video.currentSrc) return;
              video.dataset.vmPrefSrc = video.currentSrc;
              setTimeout(function(){ applyPreferredQuality(q); }, 1200); 
           }
        });
      } catch (e) {}
      // [P14] Resume playback
      var resumeData = S.get('resume_' + getPreferenceKey(), null);
      if (resumeData && resumeData.time > 5 && (Date.now() - resumeData.date) < 7 * 24 * 3600 * 1000) {
        video.currentTime = resumeData.time;
        showToast('▶ Resumed at ' + fmt(resumeData.time));
      }
    });
    video.addEventListener('loadeddata', function () {
      applyAspectRatio();
      buildQualityOptions();
    });

    // Title sync (+ oEmbed when available)
    var _oembedTitle = '';
    function syncPageTitle() {
      const title = _oembedTitle || document.title || '';
      videoTitle.textContent = title.length > 45 ? title.slice(0, 45) + '…' : title;
    }
    syncPageTitle();
    try {
      fetchOEmbed(function (data) {
        if (data && data.title) { _oembedTitle = data.title; syncPageTitle(); }
      });
    } catch (e) {}
    const titleObserver = new MutationObserver(syncPageTitle);
    const titleElement = document.querySelector('title');
    if (titleElement) {
      titleObserver.observe(titleElement, { childList: true, characterData: true, subtree: true });
    }


    /* ═══════════════════════════════════════════════════
     *  KEYBOARD SHORTCUTS (PC)
     *
     *  [CRIT-2] Works WITHOUT needing to open HUD first!
     *  Pressing any shortcut key auto-opens the HUD.
     * ═══════════════════════════════════════════════════ */
    let lastKeyTime = 0;

    function handleKeyDown(e) {
      // Don't intercept when user is typing in input fields
      var tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable) {
        return;
      }

      var key = e.key;

      // Backtick / hold speed — ALWAYS works even when HUD is closed
      if ((key === '`' || key === 'Dead' || e.code === 'Backquote') && !e.repeat) {
        e.stopImmediatePropagation();
        e.preventDefault();
        if (!isHudVisible) {
          openHUD();
          hud.classList.add('vm-controls-hidden');
        }
        if (!holdTimeout) {
          holdTimeout = setTimeout(function () {
            speedBeforeHold = video.playbackRate;
            isHoldActive = true;
            holdBaseSpeed = 2;
            video.playbackRate = 2;
            updateHoldBadge('2.0×', 'HOLD');
            holdBadge.classList.add('vm-visible');
            clearTimeout(autoHideTimeout);
            hud.classList.add('vm-controls-hidden');
          }, 250);
        }
        return;
      }

      // Escape: always works (exit fullscreen even with HUD closed)
      if (key === 'Escape') {
        if (isFullscreen) { e.stopImmediatePropagation(); e.preventDefault(); exitFullscreen(); }
        else if (isHudVisible) { e.stopImmediatePropagation(); e.preventDefault(); closeHUD(); }
        return;
      }

      // ALL OTHER shortcuts: only work when HUD is OPEN
      // This prevents stealing YouTube/site shortcuts
      if (!isHudVisible) return;

      var handledKeys = [
        ' ', 'k', 'K',
        'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
        'f', 'F', 'm', 'M', 's', 'S', 'a', 'A', 'r', 'R',
        'l', 'L', 'p', 'P', 'c', 'C', 't', 'T',
        '=', '+', '-', '_',
        'Escape', 'Home', 'End',
        'b', 'B', ',', '.', 'j', 'J', 'i', 'I', 'h', 'H'
      ];

      var isNumber = key >= '0' && key <= '9' && !e.ctrlKey && !e.altKey && !e.metaKey;
      if (!handledKeys.includes(key) && !isNumber) return;

      // Prevent duplicate rapid key events
      var now = Date.now();
      if (now - lastKeyTime < 10) return;
      lastKeyTime = now;

      e.stopImmediatePropagation();
      e.preventDefault();

      resetAutoHide();

      // Backtick handled above in early return

      // Handle keys
      switch (key) {
        case ' ': case 'k': case 'K':
          if (video.paused) { video.play(); showToast('▶'); }
          else { video.pause(); showToast('⏸'); }
          break;

        case 'ArrowLeft': case 'j': case 'J': {
          const seekAmt = e.ctrlKey ? 60 : e.shiftKey ? 5 : 10;
          video.currentTime = Math.max(0, video.currentTime - seekAmt);
          showScrubPreview(video.currentTime, -seekAmt);
          break;
        }
        case 'ArrowRight': {
          const seekAmt2 = e.ctrlKey ? 60 : e.shiftKey ? 5 : 10;
          if (video.duration) {
            video.currentTime = Math.min(video.duration, video.currentTime + seekAmt2);
          } else {
            video.currentTime += seekAmt2;
          }
          showScrubPreview(video.currentTime, seekAmt2);
          break;
        }
                // Smart Brightness: Ctrl+Shift+Up = brighter, Ctrl+Shift+Down = dimmer
        if (e.ctrlKey && e.shiftKey && (key === 'ArrowUp' || key === 'ArrowDown')) {
          var bDelta = key === 'ArrowUp' ? 0.15 : -0.15;
          brightnessLevel = clamp(parseFloat((brightnessLevel + bDelta).toFixed(2)), 0.02, 2.0);
          try { if (typeof applyBrightness === 'function') applyBrightness(); } catch(e) {}
          showToast('🔆 ' + Math.round(brightnessLevel * 100) + '%');
          resetAutoHide();
          break;
        }
        
        case 'ArrowUp': {
          // Above 100% engages Web Audio boost (safe path); below stays element volume.
          isUserMuted = false;
          var curUp = (audioBoostLevel > 1) ? audioBoostLevel : video.volume;
          var nextUp = clamp(round1(curUp + (curUp >= 1 ? 0.25 : 0.1)), 0, 3);
          var boostedUp = setVideoVolume(video, nextUp, null);
          audioBoostLevel = boostedUp ? nextUp : 1;
          showSideBar('right', Math.min(nextUp / 3, 1), (nextUp > 1 ? '🔊+ ' : '🔊 ') + Math.round(nextUp * 100) + '%');
          updateMuteIcon();
          updateVolumeSlider();
          break;
        }
        case 'ArrowDown': {
          var curDn = (audioBoostLevel > 1) ? audioBoostLevel : video.volume;
          var nextDn = clamp(round1(curDn - (curDn > 1 ? 0.25 : 0.1)), 0, 3);
          isUserMuted = (nextDn === 0);
          var boostedDn = setVideoVolume(video, nextDn, null);
          audioBoostLevel = boostedDn ? nextDn : 1;
          showSideBar('right', Math.min(nextDn / 3, 1), (nextDn > 1 ? '🔊+ ' : '🔊 ') + Math.round(nextDn * 100) + '%');
          updateMuteIcon();
          updateVolumeSlider();
          break;
        }

        case 'f': case 'F': haptic(); isFullscreen ? exitFullscreen() : enterFullscreen(); break;
        case 'm': case 'M': muteButton.click(); break;
        case 's': case 'S': speedButton.click(); break;
        case 'a': case 'A': arButton.click(); break;
        case 'r': case 'R': rotateButton.click(); break;
        case 'l': case 'L': loopButton.click(); break;
        case 'p': case 'P': togglePiP(); break;
        case 'c': case 'C': toggleSubtitles(); break;
        case 't': case 'T': takeScreenshot(); break;
        case 'b': case 'B': toggleABLoop(); break;
        case 'i': case 'I': buildStatsDisplay(); statsPanel.classList.toggle('vm-visible'); break;
        case 'h': case 'H': mirrorButton.click(); break;

        case ',':
          video.pause();
          video.currentTime = Math.max(0, video.currentTime - (1/30));
          showToast('← Frame');
          updateProgress();
          break;
        case '.':
          video.pause();
          video.currentTime = Math.min(video.duration || Infinity, video.currentTime + (1/30));
          showToast('Frame →');
          updateProgress();
          break;

        case '=': case '+': zoomInButton.click(); break;
        case '-': case '_': zoomOutButton.click(); break;
        // Escape handled above
        case 'Home': video.currentTime = 0; showToast('↩ Start'); break;
        case 'End':
          if (video.duration) video.currentTime = video.duration - 1;
          showToast('↪ End');
          break;

        default:
          if (isNumber) {
            const percent = parseInt(key) / 10;
            if (video.duration) {
              video.currentTime = video.duration * percent;
              showToast((percent * 100) + '%');
            }
          }
      }
    }

    function handleKeyUp(e) {
      if (e.key === '`' || e.key === 'Dead' || e.code === 'Backquote') {
        clearTimeout(holdTimeout);
        holdTimeout = null;
        if (isHoldActive) {
          isHoldActive = false;
          video.playbackRate = speedBeforeHold; // Restore EXACT saved speed
          holdBadge.classList.remove('vm-visible');
          showToast(round1(speedBeforeHold) + '× Restored');
          exitHoldMode();
        }
      }
    }

    // Safety: restore speed if window loses focus during hold
    function onWindowBlur() {
      if (isHoldActive) {
        isHoldActive = false;
        clearTimeout(holdTimeout);
        holdTimeout = null;
        video.playbackRate = speedBeforeHold;
        holdBadge.classList.remove('vm-visible');
        exitHoldMode();
      }
    }
    window.addEventListener('blur', onWindowBlur);

    // [CRIT-2] Register keyboard listeners (PC only)
    if (!IS_MOBILE) {
      window.addEventListener('keydown', handleKeyDown, { capture: true });
      window.addEventListener('keyup', handleKeyUp, { capture: true });
      video.addEventListener('keydown', handleKeyDown, { capture: true });
      video.addEventListener('keyup', handleKeyUp, { capture: true });
    }


    /* ═══════════════════════════════════════════════════
     *  TOUCH GESTURES — MX Player / VLC behaviour
     *
     *  Single tap anywhere on video surface → show/hide controls
     *    (+ auto-hide after 3 seconds)
     *  Double tap CENTER → play / pause
     *  Double tap LEFT / RIGHT → seek ∓10s
     *  Vertical swipe LEFT half  → brightness (system-like, overlay dim)
     *  Vertical swipe RIGHT half → volume (+ boost above 100%)
     *  Horizontal swipe → seek scrub
     *  Long-press → 2× hold speed (drag to adjust)
     *  Pinch → zoom
     * ═══════════════════════════════════════════════════ */
    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartTime = 0;
    let isSwipeActive = false;
    let swipeAxis = null;          // 'horizontal' | 'volume' | 'brightness'
    let swipeStartY = 0;
    let swipeStartValue = 0;
    let lastDoubleTap = { time: 0, zone: '' };
    let pendingTapTimer = null;
    let pendingTap = null;         // { zone, x, y, t }
    let pinchStartDist = 0;
    let pinchStartZoom = 1;
    let isPinching = false;
    let isLongPress = false;
    let longPressTimeout = null;
    // Lock which half started a vertical gesture so finger drift doesn't flip mode
    let verticalLock = null;       // 'left' | 'right' | null
    // MX/VLC: brightness range 0..1 maps to overlay (0=black, 1=full). We keep
    // brightnessLevel 0.05..1.0 for dimming and allow >1 only on non-managed.
    const BRIGHT_MIN = 0.02;
    const BRIGHT_MAX = 1.0;        // "normal" picture
    const BRIGHT_MAX_BOOST = 2.0;  // system-like boost via screen-blend layer
    const VOL_MAX = 1.0;           // base; boost handled separately up to 3×
    const SEEK_PX = IS_MOBILE ? 12 : 16;   // px per second (MX-like sensitivity)
    const AXIS_LOCK_PX = 10;
    const TAP_MOVE_MAX = 16;
    const TAP_TIME_MAX = 320;
    const DBL_MS = 280;

    function detectTouchZone(clientX) {
      const rect = touchZones.getBoundingClientRect();
      const relativeX = clientX - rect.left;
      const width = rect.width || 1;
      // Equal thirds like MX/VLC: left seek | center | right seek
      if (relativeX < width * 0.33) return 'left';
      if (relativeX > width * 0.67) return 'right';
      return 'center';
    }

    function verticalHalf(clientX) {
      const rect = touchZones.getBoundingClientRect();
      return (clientX - rect.left) < (rect.width || 1) * 0.5 ? 'left' : 'right';
    }

    function gestureZoneHeight() {
      var h = touchZones.getBoundingClientRect().height;
      // Use a slightly shorter effective height so full-swipe feels complete
      // without needing edge-to-edge travel (matches MX feel).
      return Math.max(160, (h || window.innerHeight || 400) * 0.85);
    }

    function applyBrightnessSwipe(level) {
      // Smart Brightness Pro with gamma + overlay
      brightnessLevel = clamp(level, 0.02, 2.0);
      applyBrightness();
      var pct = Math.round(brightnessLevel * 100);
      pct = clamp(pct, 0, 200);
      var icon = pct >= 120 ? '☀️' : pct >= 55 ? '🔆' : pct >= 20 ? '🔅' : '🌙';
      var smartLabel = brightnessLevel <= 1 ? 'Smart 💡' : 'Smart Boost ☀️';
      showSideBar('left', clamp(pct / 200, 0, 1), icon + ' ' + pct + '%');
      showGestureCenter(icon, pct + '% ' + smartLabel, clamp(pct / 200, 0, 1));
    }

    function managedBrightMax() {
      // With screen-blend boost we can go above 1 on ALL sites safely
      return 2.0;
    }

    function applyVolumeSwipe(level) {
      // System-feel: 0–100% element volume; above 100% WebAudio boost (feels louder)
      var rawVol = clamp(level, 0, 3);
      isUserMuted = (rawVol < 0.001);
      var boosting = setVideoVolume(video, rawVol, null);
      audioBoostLevel = boosting ? rawVol : (rawVol > 1 ? 1 : rawVol);
      // Keep element authoritative for ≤100%
      if (rawVol <= 1) audioBoostLevel = 1;
      if (volumeSlider) volumeSlider.value = String(Math.min(rawVol, 3));
      var vPct = Math.round(rawVol * 100);
      var vIcon = rawVol > 1.01 ? '🔊+' : rawVol > 0.55 ? '🔊' : rawVol > 0.01 ? '🔉' : '🔇';
      showSideBar('right', Math.min(rawVol, 1), vIcon + ' ' + vPct + '%');
      showGestureCenter(vIcon, vPct + '%', Math.min(rawVol / 1.5, 1));
      updateMuteIcon();
    }

    function doPlayPauseToggle(rippleX, rippleY) {
      try {
        if (video.paused) {
          var p = video.play();
          if (p && p.catch) p.catch(function () {});
          showToast('▶');
        } else {
          video.pause();
          showToast('⏸');
        }
      } catch (err) {}
      updatePlayPauseIcon();
      if (typeof rippleX === 'number') createRippleEffect(rippleX, rippleY);
      haptic(12);
      resetAutoHide();
    }

    // CRITICAL: non-passive so we can preventDefault and stop the underlying site
    // (YouTube/Twitch) from treating our single-tap as play/pause.
    function blockSiteGesture(e) {
      try { e.preventDefault(); } catch (err) {}
      try { e.stopPropagation(); } catch (err) {}
      try { e.stopImmediatePropagation(); } catch (err) {}
    }

    touchZones.addEventListener('touchstart', function (e) {
      blockSiteGesture(e);
      // Don't force-show controls on every touchstart (feels jumpy); only on tap end.

      if (e.touches.length === 2) {
        isPinching = true;
        pinchStartDist = pinchDistance(e.touches);
        pinchStartZoom = zoomLevel;
        clearTimeout(longPressTimeout);
        clearTimeout(pendingTapTimer);
        pendingTap = null;
        return;
      }

      const touch = e.touches[0];
      touchStartX = touch.clientX;
      touchStartY = touch.clientY;
      touchStartTime = Date.now();

      if (isLongPress) {
        isLongPress = false;
        video.playbackRate = speedBeforeHold;
        holdBadge.classList.remove('vm-visible');
        exitHoldMode();
      }

      isSwipeActive = false;
      swipeAxis = null;
      verticalLock = null;
      isLongPress = false;
      holdStartX = touch.clientX;

      clearTimeout(longPressTimeout);
      longPressTimeout = setTimeout(function () {
        // Long-press only if we never started a swipe
        if (isSwipeActive || isPinching) return;
        speedBeforeHold = video.playbackRate;
        isLongPress = true;
        holdBaseSpeed = 2;
        video.playbackRate = 2;
        updateHoldBadge('2.0×', 'HOLD · drag ←→');
        holdBadge.classList.add('vm-visible');
        clearTimeout(autoHideTimeout);
        hud.classList.add('vm-controls-hidden');
        haptic(18);
      }, 450);
    }, { passive: false, capture: true });

    touchZones.addEventListener('touchmove', function (e) {
      blockSiteGesture(e);

      if (isPinching && e.touches.length === 2) {
        clearTimeout(longPressTimeout);
        const newDist = pinchDistance(e.touches);
        if (pinchStartDist > 0) {
          zoomLevel = clamp(parseFloat((pinchStartZoom * (newDist / pinchStartDist)).toFixed(2)), 0.3, 4);
          applyAspectRatio();
          badgeZoom.textContent = Math.round(zoomLevel * 100) + '%';
          showBadge('zoom', badgeZoom);
          showGestureCenter('🔍', Math.round(zoomLevel * 100) + '%', clamp((zoomLevel - 0.3) / 3.7, 0, 1));
        }
        return;
      }

      const touch = e.touches[0];
      const dx = touch.clientX - touchStartX;
      const dy = touch.clientY - touchStartY;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      // Long press speed control via horizontal drag
      if (isLongPress) {
        clearTimeout(longPressTimeout);
        const drift = touch.clientX - holdStartX;
        const steps = Math.round(drift / HOLD_PIXELS_PER_STEP);
        const newSpeed = clamp(parseFloat((holdBaseSpeed + steps * 0.1).toFixed(1)), 0.25, 6);
        video.playbackRate = newSpeed;
        updateHoldBadge(newSpeed.toFixed(1) + '×', drift >= 0 ? '→ faster' : '← slower');
        return;
      }

      // Cancel long press on movement
      if (absDx > AXIS_LOCK_PX || absDy > AXIS_LOCK_PX) {
        clearTimeout(longPressTimeout);
        longPressTimeout = null;
        // Cancel pending single-tap once we clearly moved
        clearTimeout(pendingTapTimer);
        pendingTap = null;
      }

      // Axis lock — MX/VLC: first clear direction wins
      if (!isSwipeActive) {
        if (absDx > AXIS_LOCK_PX && absDx > absDy * 1.25) {
          isSwipeActive = true;
          swipeAxis = 'horizontal';
          // Hide controls while scrubbing
          clearTimeout(autoHideTimeout);
          hud.classList.add('vm-controls-hidden');
        } else if (absDy > AXIS_LOCK_PX && absDy >= absDx * 0.9) {
          isSwipeActive = true;
          verticalLock = verticalHalf(touchStartX);
          swipeAxis = (verticalLock === 'right') ? 'volume' : 'brightness';
          swipeStartY = touch.clientY; // re-anchor at lock moment
          if (swipeAxis === 'volume') {
            swipeStartValue = (isUserMuted || video.muted) ? 0
              : (audioBoostLevel > 1 ? audioBoostLevel : video.volume);
          } else {
            swipeStartValue = brightnessLevel;
          }
          clearTimeout(autoHideTimeout);
          hud.classList.add('vm-controls-hidden');
          haptic(8);
        }
      }

      if (!isSwipeActive) return;

      if (swipeAxis === 'horizontal') {
        var seekDelta = dx / SEEK_PX;
        var target = clamp(video.currentTime + seekDelta, 0, video.duration || 0);
        showScrubPreview(target, seekDelta);
      } else if (swipeAxis === 'volume') {
        // System-like: one full swipe height ≈ 0→100%. Continue up for boost to ~300%.
        var zoneH = gestureZoneHeight();
        var deltaUp = (swipeStartY - touch.clientY) / zoneH;
        var rawVol;
        if (swipeStartValue <= 1.0) {
          rawVol = swipeStartValue + deltaUp; // 1:1 within 0–100%
          if (rawVol > 1.0) rawVol = 1.0 + (rawVol - 1.0) * 2.0; // overshoot → boost
        } else {
          rawVol = swipeStartValue + deltaUp * 2.0;
        }
        applyVolumeSwipe(rawVol);
      } else if (swipeAxis === 'brightness') {
        var zoneHb = gestureZoneHeight();
        var deltaUpB = (swipeStartY - touch.clientY) / zoneHb;
        // Full swipe ≈ 0% → 200% (system-like range with boost headroom)
        var span = 2.0 - BRIGHT_MIN; // ~1.98
        var next = swipeStartValue + deltaUpB * span;
        applyBrightnessSwipe(next);
      }
    }, { passive: false, capture: true });

    touchZones.addEventListener('touchend', function (e) {
      blockSiteGesture(e);
      clearTimeout(longPressTimeout);
      longPressTimeout = null;

      if (isPinching) {
        isPinching = false;
        hideGestureCenterSoon();
        savePreferences();
        resetAutoHide();
        return;
      }

      if (isLongPress) {
        isLongPress = false;
        video.playbackRate = speedBeforeHold;
        holdBadge.classList.remove('vm-visible');
        showToast(round1(speedBeforeHold) + '× Restored');
        exitHoldMode();
        savePreferences();
        return;
      }

      if (isSwipeActive && swipeAxis === 'horizontal') {
        const touch = e.changedTouches[0];
        const dx = touch.clientX - touchStartX;
        video.currentTime = clamp(
          video.currentTime + dx / SEEK_PX,
          0, video.duration || 0
        );
        updateProgress();
        scrubOverlay.classList.remove('vm-visible');
        isSwipeActive = false;
        swipeAxis = null;
        savePreferences();
        resetAutoHide();
        return;
      }

      if (isSwipeActive) {
        isSwipeActive = false;
        swipeAxis = null;
        verticalLock = null;
        hideGestureCenterSoon();
        savePreferences();
        resetAutoHide();
        return;
      }

      // ── Tap detection ──
      const touch = e.changedTouches[0];
      const tapDuration = Date.now() - touchStartTime;
      const movement = Math.abs(touch.clientX - touchStartX) + Math.abs(touch.clientY - touchStartY);
      if (movement > TAP_MOVE_MAX || tapDuration > TAP_TIME_MAX) return;

      const zone = detectTouchZone(touch.clientX);
      const zonesRect = touchZones.getBoundingClientRect();
      const rippleX = touch.clientX - zonesRect.left;
      const rippleY = touch.clientY - zonesRect.top;
      const now = Date.now();

      // Double-tap?
      if (now - lastDoubleTap.time < DBL_MS && lastDoubleTap.zone === zone) {
        // Confirm double-tap — cancel any pending single-tap
        clearTimeout(pendingTapTimer);
        pendingTap = null;
        lastDoubleTap = { time: 0, zone: '' };

        if (zone === 'center') {
          // Double-tap CENTER = play/pause (MX/VLC)
          doPlayPauseToggle(rippleX, rippleY);
        } else if (zone === 'left') {
          video.currentTime = Math.max(0, video.currentTime - 10);
          createRippleEffect(rippleX, rippleY);
          flashDoubleTapIndicator('left');
          showToast('⏪ −10s');
          haptic(10);
          updateProgress();
          resetAutoHide();
        } else if (zone === 'right') {
          video.currentTime = Math.min(video.duration || 0, video.currentTime + 10);
          createRippleEffect(rippleX, rippleY);
          flashDoubleTapIndicator('right');
          showToast('⏩ +10s');
          haptic(10);
          updateProgress();
          resetAutoHide();
        }
        return;
      }

      // First tap of a potential double-tap: wait briefly before single-tap action
      lastDoubleTap = { time: now, zone: zone };
      clearTimeout(pendingTapTimer);
      pendingTap = { zone: zone, x: rippleX, y: rippleY, t: now };
      pendingTapTimer = setTimeout(function () {
        // Single tap ONLY toggles controls — NEVER play/pause (MX/VLC)
        if (!pendingTap || pendingTap.t !== now) return;
        pendingTap = null;
        lastDoubleTap = { time: 0, zone: '' };
        if (anyPanelOpen()) { closeAllPanels(); haptic(6); return; }
        toggleControlsVisibility();
        haptic(6);
      }, DBL_MS);
    }, { passive: false, capture: true });

    // Swallow click/mouseup that browsers synthesize after touch — this is what
    // made YouTube/Twitch treat a single tap as play/pause.
    // IMPORTANT: only on touch devices. This used to run unconditionally and,
    // being registered before the desktop click handler and the custom
    // right-click menu below (same target + same capture phase), its
    // stopImmediatePropagation() silently killed EVERY desktop click —
    // including clicking anywhere on the video to close an open menu.
    if (IS_MOBILE || IS_TOUCH) {
      ['click', 'mousedown', 'mouseup', 'dblclick', 'contextmenu'].forEach(function (evt) {
        touchZones.addEventListener(evt, function (e) {
          blockSiteGesture(e);
        }, true);
      });
    }

    touchZones.addEventListener('touchcancel', function (e) {
      blockSiteGesture(e);
      clearTimeout(longPressTimeout);
      longPressTimeout = null;
      clearTimeout(pendingTapTimer);
      pendingTap = null;
      if (isLongPress) {
        isLongPress = false;
        video.playbackRate = speedBeforeHold;
        holdBadge.classList.remove('vm-visible');
        exitHoldMode();
      }
      isPinching = false;
      isSwipeActive = false;
      swipeAxis = null;
      verticalLock = null;
      scrubOverlay.classList.remove('vm-visible');
      hideGestureCenterSoon();
    }, { passive: false, capture: true });

    // Scroll to zoom (desktop)
    if (!IS_MOBILE) {
      touchZones.addEventListener('wheel', function (e) {
        if (!isHudVisible) return;
        e.preventDefault();
        e.stopPropagation();
        if (e.deltaY < 0) {
          zoomLevel = Math.min(4, round1(zoomLevel + 0.1));
        } else {
          zoomLevel = Math.max(0.3, round1(zoomLevel - 0.1));
        }
        applyAspectRatio();
        showBadge('zoom', badgeZoom);
        badgeZoom.textContent = Math.round(zoomLevel * 100) + '%';
      }, { passive: false });
    }

    // Right-click context menu (desktop)
    touchZones.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (!IS_MOBILE) openContextMenu(e.clientX, e.clientY);
    });

    // Auto-hide on mouse move (desktop)
    hud.addEventListener('mousemove', throttle(function () {
      if (isHudVisible) resetAutoHide();
    }, 200));

    // Desktop: single click = toggle controls only; double = play/pause
    if (!IS_MOBILE) {
      var lastClickTs = 0;
      touchZones.addEventListener('click', function (e) {
        if (e.target && e.target.closest && e.target.closest('.vm-control-btn,.vm-panel,.vm-seek-container,.vm-pill-btn,.vm-top-bar,.vm-bottom-bar')) return;
        blockSiteGesture(e);
        if (anyPanelOpen()) { closeAllPanels(); lastClickTs = 0; return; }
        var now = Date.now();
        if (now - lastClickTs < 280) {
          lastClickTs = 0;
          doPlayPauseToggle(e.offsetX, e.offsetY);
        } else {
          lastClickTs = now;
          setTimeout(function () {
            if (lastClickTs && Date.now() - lastClickTs >= 270) {
              lastClickTs = 0;
              toggleControlsVisibility(); // never play/pause on single click
            }
          }, 280);
        }
      }, true);
    }


    /* ═══════════════════════════════════════════════════
     *  HLS STREAMING
     * ═══════════════════════════════════════════════════ */
    function isHlsUrl(url) {
      if (!url) return false;
      return /\.m3u8(\?|$)/i.test(url) || /\/hls\//.test(url) || /format=m3u8/i.test(url);
    }

    function tryAttachHls(src) {
      if (!isHlsUrl(src)) return;
      if (video.dataset.vmHls === src) return;

      loadHlsLibrary(function () {
        if (typeof Hls === 'undefined' || !Hls.isSupported()) return;

        video.dataset.vmHls = src;
        if (hlsInstance) {
          hlsInstance.destroy();
          hlsInstance = null;
        }

        hlsInstance = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
          backBufferLength: 90,
          maxBufferLength: 30,
          maxMaxBufferLength: 60,
          fragLoadingMaxRetry: 6,
          manifestLoadingMaxRetry: 4,
          levelLoadingMaxRetry: 4,
        });

        hlsInstance.loadSource(src);
        hlsInstance.attachMedia(video);

        hlsInstance.on(Hls.Events.MANIFEST_PARSED, function () {
          showToast('📡 HLS Stream');
          video.play().catch(function(){});
          buildQualityOptions();
        });

        hlsInstance.on(Hls.Events.ERROR, function (_, data) {
          if (data.fatal) {
            if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
              hlsInstance.startLoad();
            } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
              hlsInstance.recoverMediaError();
            } else {
              hlsInstance.destroy();
              hlsInstance = null;
              showToast('HLS Error');
            }
          }
        });

        hlsInstance.on(Hls.Events.LEVEL_SWITCHED, function () {
          if (isHudVisible) buildQualityOptions();
        });
      });
    }

    // Try HLS on current source
    if (video.currentSrc) tryAttachHls(video.currentSrc);
    video.addEventListener('loadedmetadata', function () {
      tryAttachHls(video.currentSrc);
    });
    const hlsSrcObserver = new MutationObserver(function () {
      tryAttachHls(video.currentSrc || video.src || '');
    });
    hlsSrcObserver.observe(video, { attributes: true, attributeFilter: ['src'] });


    /* ═══════════════════════════════════════════════════
     *  CLEANUP (Prevents memory leaks)
     *  [PERF-3] Observes container, not entire document
     * ═══════════════════════════════════════════════════ */
    // Twitch/YouTube re-parent their <video> during player init and ad breaks,
    // which briefly makes video.isConnected false. Destroying on the first
    // disconnect kills our overlay instantly (the "button never appears" bug).
    // So we DEBOUNCE: only destroy if the video is STILL detached ~1.5s later.
    let _cleanupTimer = null;
    const cleanupObserver = new MutationObserver(function () {
      if (video.isConnected) { if (_cleanupTimer) { clearTimeout(_cleanupTimer); _cleanupTimer = null; } return; }
      if (_cleanupTimer) return;
      _cleanupTimer = setTimeout(function () {
        _cleanupTimer = null;
        if (!video.isConnected) { vmxDebug('life', 'destroy (video gone)'); destroyPlayer(); }
      }, 1500);
    });
    // Observe the whole document subtree (not just container): on Twitch the
    // container itself can be replaced, so watching only it would miss the move.
    cleanupObserver.observe(document.documentElement, { childList: true, subtree: true });

    function destroyPlayer() {
      if (isDestroyed) return;
      isDestroyed = true;

      cleanupObserver.disconnect();
      stopProgressLoop();

      try {
        document.removeEventListener('mousemove', onDocMouseMove);
        document.removeEventListener('mouseup', onDocMouseUp);
      } catch (e) {}
      try {
        video.removeEventListener('click', onVideoNativeClickBlock, true);
        video.removeEventListener('mouseup', onVideoNativeClickBlock, true);
        video.removeEventListener('pointerup', onVideoNativeClickBlock, true);
      } catch (e) {}
      try { if (typeof _msUnbindLight === 'function') _msUnbindLight(); } catch (e) {}

      if (!IS_MOBILE) {
        window.removeEventListener('keydown', handleKeyDown, { capture: true });
        window.removeEventListener('keyup', handleKeyUp, { capture: true });
        video.removeEventListener('keydown', handleKeyDown, { capture: true });
        video.removeEventListener('keyup', handleKeyUp, { capture: true });
      }

      window.removeEventListener('blur', onWindowBlur);
      ['fullscreenchange', 'webkitfullscreenchange'].forEach(function (evt) {
        document.removeEventListener(evt, onFullscreenChange);
      });

      if (hlsInstance) { hlsInstance.destroy(); hlsInstance = null; }
      hlsSrcObserver.disconnect();
      resizeObserver.disconnect();
      try { styleGuardObserver.disconnect(); } catch (e) {}
      clearInterval(adCheckInterval);
      clearInterval(subtitleScanInterval);
      clearSubtitleInterval();
      if (typeof ytSubObserver !== 'undefined' && ytSubObserver) try { ytSubObserver.disconnect(); } catch(e) {}
      stopABLoopCheck();
      titleObserver.disconnect();
      clearTimeout(entryIdleTimer);
      stopFloatSync();
      if (useFloatingHost) {
        try { window.removeEventListener('scroll', _throttledFloatSync); } catch (e) {}
        try { window.removeEventListener('resize', _throttledFloatSync); } catch (e) {}
        try { if (screen.orientation) screen.orientation.removeEventListener('change', _throttledFloatSync); } catch (e) {}
      }
      // Unregister this instance's live-defaults callback (prevents leak on SPA nav)
      try {
        var _idx = vmApplyDefaultsFns.indexOf(_vmApplyFn);
        if (_idx !== -1) vmApplyDefaultsFns.splice(_idx, 1);
      } catch (e) {}
      try {
        var _sidx = vmxSubListeners.indexOf(_vmSubListener);
        if (_sidx !== -1) vmxSubListeners.splice(_sidx, 1);
      } catch (e) {}
      try {
        var _ridx = _relayListeners.indexOf(_vmRelayListener);
        if (_ridx !== -1) _relayListeners.splice(_ridx, 1);
      } catch (e) {}
      try {
        var _didx = vmxDrmListeners.indexOf(_vmDrmListener);
        if (_didx !== -1) vmxDrmListeners.splice(_didx, 1);
      } catch (e) {}
      try { subtitleFileInput.remove(); } catch (e) { /* ignore */ }
      if (cinemaOverlay) { try { cinemaOverlay.remove(); } catch (e) {} cinemaOverlay = null; }
      try { clearFullscreenFill(); } catch (e) {}
      try { if (_selfRepairTimer) clearInterval(_selfRepairTimer); } catch (e) {}
      if (hostElement.isConnected) hostElement.remove();

      processedVideos.delete(video);
      instanceMap.delete(video);
      totalVideoCount = Math.max(0, totalVideoCount - 1);
      if (_singlePlayerSite) _vmxLiveInstances = Math.max(0, _vmxLiveInstances - 1);
    }

    // FULL RESTORE — undo EVERYTHING the extension changed and return the native
    // player to its original state. Used by the ✕ (dismiss) button.
    // Undo EVERY visual/audio change the extension made and return the native
    // player to its captured original state — WITHOUT removing the overlay.
    // Shared by the ↻ reset button (keeps VideoMax) and ✕ dismiss (then exits).
    function resetVideoToOriginal() {
      try {
        // Reset our internal state (zoom/AR/speed/filters/etc.) if available.
        try { if (typeof resetEverything === 'function') resetEverything(); } catch (e) {}

        // 1) Tear down Web Audio boost graph (if any) so audio routes normally.
        try {
          var boost = audioBoostMap.get(video);
          if (boost) {
            try { boost.source && boost.source.disconnect(); } catch (e) {}
            try { boost.gain && boost.gain.disconnect(); } catch (e) {}
            try { boost.ctx && boost.ctx.close && boost.ctx.close(); } catch (e) {}
            audioBoostMap.delete(video);
          }
        } catch (e) {}

        // 2) Restore the video's playback props to the captured originals.
        try { video.playbackRate = _vmOrig.playbackRate; } catch (e) {}
        try { video.volume = _vmOrig.volume; } catch (e) {}
        try { video.muted = _vmOrig.muted; } catch (e) {}
        try { video.loop = _vmOrig.loop; } catch (e) {}

        // 3) Restore the EXACT original inline style string (removes every
        //    transform / filter / object-fit / position / width / height we set).
        try {
          if (_vmOrig.styleAttr === null) video.removeAttribute('style');
          else video.setAttribute('style', _vmOrig.styleAttr);
        } catch (e) {}

        // 4) Remove any CSS we injected into the page (site patches).
        try { var sp = document.getElementById('vm-site-patch'); if (sp) sp.remove(); } catch (e) {}

        // 5) Remove cinema-mode dimmer + container tweaks if present.
        try { if (cinemaOverlay) { cinemaOverlay.remove(); cinemaOverlay = null; } } catch (e) {}
        try { if (container && container.style) { container.style.removeProperty('z-index'); } } catch (e) {}

        // 6) Exit our fullscreen if active.
        try { if (isFullscreen) exitFullscreen(); } catch (e) {}
      } catch (e) {}
    }

    function restoreNativePlayer() {
      resetVideoToOriginal();
      // Finally destroy the overlay/observers/listeners and drop the instance
      // so the video can be re-attached later (e.g. after a reload).
      destroyPlayer();
    }

    var _msUnbindLight = null;
    try { _msUnbindLight = bindMediaSessionLight(video); } catch (e) {}

    instanceMap.set(video, {
      host: hostElement,
      shadow: shadowRoot,
      applyAR: applyAspectRatio,
      destroy: destroyPlayer,
      restore: restoreNativePlayer,
      playFullscreen: function (sources) {
        if (isDestroyed) return;
        if (Array.isArray(sources) && sources.length) _quettaSources = sources.filter(Boolean);
        // Start playback and request fullscreen synchronously inside the same
        // trusted launcher click (important on Android browsers).
        try { if (video.paused) { var p = video.play(); if (p && p.catch) p.catch(function () {}); } } catch (e) {}
        openHUD();
        enterFullscreen();
      },
      adoptFullscreen: function (sources) {
        if (isDestroyed) return;
        if (Array.isArray(sources) && sources.length) _quettaSources = sources.filter(Boolean);
        try { if (video.paused) { var p = video.play(); if (p && p.catch) p.catch(function () {}); } } catch (e) {}
        openHUD();
        isFullscreen = true;
        _fsTarget = document.fullscreenElement || document.webkitFullscreenElement || container || video;
        setButtonIcon(fullscreenButton, 'fullscreenExit');
        lockDefaultOrientation();
        [40, 140, 320].forEach(function (delay) {
          setTimeout(function () {
            if (!isDestroyed) { applyFullscreenFill(); applyAspectRatio(); reflowControls(); }
          }, delay);
        });
      },
      updateSources: function (sources) {
        _quettaSources = Array.isArray(sources) ? sources.filter(Boolean) : [];
        if (_quettaSources.some(function (item) { return item && (item.noDL === 'drm' || item.drm === true); })) {
          markDynamicDrm('detector reported DRM');
          updateDrmUi();
          return;
        }
        if (isHudVisible) {
          try { buildQualityOptions(); } catch (e) {}
        }
      },
      openDownload: function (sources) {
        if (isDestroyed || isDrmProtected()) {
          updateDrmUi();
          showToast('🔒 DRM-protected video — download unavailable', 3500);
          return;
        }
        _quettaSources = Array.isArray(sources) ? sources.filter(Boolean) : [];
        try {
          _quettaSources.forEach(function (item) {
            if (item.noDL === 'drm' || item.drm === true) markDynamicDrm('detector reported DRM');
            if (item.url) {
              if (/m3u8/i.test(item.ext || item.url)) capturedManifests.push({ type: 'hls', url: item.url });
              else if (/mpd|dash/i.test(item.ext || item.url)) capturedManifests.push({ type: 'dash', url: item.url });
              else addCapturedUrl(item.url, 'quetta');
            }
            (item.resolutions || []).forEach(function (level) {
              if (level && level.url) addCapturedUrl(level.url, 'quetta-quality');
            });
          });
        } catch (e) {}
        if (isDrmProtected()) { updateDrmUi(); return; }
        showToast('⚠️ Download function removed — use yt-dlp externally');
      },
      isDrm: isDrmProtected
    });
    try { attachFailureCounts.delete(video); } catch (e) {}

    // LEARN: remember what worked on this site so the next visit is instant.
    try { SiteProfiles.recordWin({ container: container, video: video, floating: useFloatingHost }); } catch (e) {}

    /* ═══════════════════════════════════════════════════════════════
     *  SELF-REPAIR ENGINE  (learns how to fix itself per site)
     *
     *  Periodically checks the player's HEALTH. If it detects a known failure
     *  SYMPTOM, it tries REMEDIES one by one, verifies whether the symptom
     *  cleared, and REMEMBERS (per hostname) which remedy worked — so next time
     *  the same symptom appears it applies that remedy first (instant self-fix).
     *  Symptoms covered are the real failures we've seen: black/collapsed video,
     *  overlay host detached, host mis-positioned, invisible/zero-size button.
     *  It is conservative: only acts when a symptom is clearly present, backs off
     *  after repeated tries, and never touches a healthy player.
     * ═══════════════════════════════════════════════════════════════ */
    (function selfRepairEngine() {
      var attemptsBySymptom = Object.create(null);   // symptom -> tries this session
      var lastActionAt = 0;

      // ── Symptom detectors (return true when the problem is present) ──
      function rect(el) { try { return el.getBoundingClientRect(); } catch (e) { return null; } }
      function isPlaying() { try { return !video.paused && video.currentTime > 0 && video.readyState >= 2; } catch (e) { return false; } }

      function symptomBlackVideo() {
        // Video is "playing" (has frames/time) but its box collapsed or is off
        // screen → the classic black-screen. videoWidth>0 means frames decode.
        try {
          if (!isPlaying() || !video.videoWidth) return false;
          var r = rect(video); if (!r) return false;
          var vw = window.innerWidth || 0, vh = window.innerHeight || 0;
          var collapsed = (r.width < 8 || r.height < 8);
          var offscreen = (r.bottom <= 0 || r.right <= 0 || r.top >= vh || r.left >= vw);
          return collapsed || offscreen;
        } catch (e) { return false; }
      }
      function symptomHostDetached() {
        try { return !hostElement.isConnected; } catch (e) { return false; }
      }
      function symptomHostMisplaced() {
        // Floating host should overlap the video; if it's far off, controls are lost.
        try {
          if (!useFloatingHost) return false;
          var hr = rect(hostElement), vr = rect(video);
          if (!hr || !vr || vr.width < 20) return false;
          var noOverlap = (hr.right < vr.left || hr.left > vr.right || hr.bottom < vr.top || hr.top > vr.bottom);
          var zero = (hr.width < 4 || hr.height < 4);
          return noOverlap || zero;
        } catch (e) { return false; }
      }
      function symptomButtonDead() {
        // Entry button exists but has zero rendered size (can't be tapped).
        try {
          if (isHudVisible || isDismissed) return false;
          if (!entryWrapper || entryWrapper.style.display === 'none') return false;
          var br = rect(entryButton); if (!br) return false;
          return (br.width < 4 || br.height < 4);
        } catch (e) { return false; }
      }

      // ── Remedies (return true if applied; verification happens after) ──
      var remedies = {
        // Clear any style we forced on the video and re-run our layout engine.
        reflowAR: function () { try { clearFullscreenFill(); } catch (e) {} try { applyAspectRatio(); } catch (e) {} return true; },
        // Strip our transforms/filters entirely (undo anything that broke layout).
        clearVideoStyles: function () {
          try {
            ['transform','transform-origin','scale','object-fit','object-position','position','top','left','width','height','max-width','max-height']
              .forEach(function (p) { if (video.style && video.style.getPropertyValue(p)) video.style.removeProperty(p); });
          } catch (e) {}
          try { applyAspectRatio(); } catch (e) {} return true;
        },
        // Remove any fullscreen fill stylesheet (fixes managed-player black screen).
        dropFsFill: function () { try { clearFullscreenFill(); } catch (e) {} return true; },
        // Rebuild a detached host and re-sync it.
        reattachHost: function () {
          try {
            if (!hostElement.isConnected) {
              if (useFloatingHost) { (document.documentElement || document.body).appendChild(hostElement); startFloatSync(); }
              else if (container && container.appendChild) { container.appendChild(hostElement); }
            }
          } catch (e) {} return true;
        },
        // Restart the floating-host position sync loop.
        resyncFloat: function () { try { lastFloatRect = null; startFloatSync(); } catch (e) {} return true; },
        // Nuclear option: fully rebuild the instance from scratch.
        rebuild: function () {
          try {
            var v = video;
            processedVideos.delete(v); instanceMap.delete(v);
            if (_singlePlayerSite) _vmxLiveInstances = Math.max(0, _vmxLiveInstances - 1);
            destroyPlayer();
            setTimeout(function () { try { if (v.isConnected) attachPlayer(v); } catch (e) {} }, 120);
          } catch (e) {} return true;
        }
      };

      // Ordered remedy candidates to TRY (cheap→drastic) per symptom.
      var playbook = {
        blackVideo:    ['dropFsFill', 'clearVideoStyles', 'reflowAR', 'rebuild'],
        hostDetached:  ['reattachHost', 'rebuild'],
        hostMisplaced: ['resyncFloat', 'reattachHost', 'rebuild'],
        buttonDead:    ['resyncFloat', 'reflowAR', 'rebuild']
      };

      function detect() {
        if (symptomBlackVideo())    return 'blackVideo';
        if (symptomHostDetached())  return 'hostDetached';
        if (symptomHostMisplaced()) return 'hostMisplaced';
        if (symptomButtonDead())    return 'buttonDead';
        return null;
      }

      function stillBroken(symptom) {
        switch (symptom) {
          case 'blackVideo':    return symptomBlackVideo();
          case 'hostDetached':  return symptomHostDetached();
          case 'hostMisplaced': return symptomHostMisplaced();
          case 'buttonDead':    return symptomButtonDead();
        }
        return false;
      }

      function tryRemedy(symptom, remedyName, isRemembered) {
        var fn = remedies[remedyName];
        if (!fn) return;
        lastActionAt = Date.now();
        vmxDebug('repair', symptom + ' → ' + remedyName + (isRemembered ? ' (remembered)' : ''));
        try { fn(); } catch (e) {}
        // Verify shortly after (layout needs a beat to settle).
        setTimeout(function () {
          if (isDestroyed) return;
          var ok = !stillBroken(symptom);
          try { SiteProfiles.recordFixResult(symptom, remedyName, ok); } catch (e) {}
          vmxDebug('repair', symptom + ' ' + (ok ? 'FIXED by ' : 'still broken after ') + remedyName);
        }, 450);
      }

      var healthTimer = setInterval(function () {
        if (isDestroyed) { clearInterval(healthTimer); return; }
        if (document.hidden) return;                 // PERF: idle when hidden
        if (Date.now() - lastActionAt < 1200) return; // let a remedy settle first
        var symptom = detect();
        if (!symptom) return;

        attemptsBySymptom[symptom] = (attemptsBySymptom[symptom] || 0);
        if (attemptsBySymptom[symptom] >= 5) return;  // back off — avoid loops

        // 1) If we've learned a remedy that fixed this symptom here before, use it.
        var remembered = null;
        try { remembered = SiteProfiles.trustedFix(symptom); } catch (e) {}
        var order = playbook[symptom] || [];
        var candidate;
        if (remembered && remedies[remembered]) {
          candidate = remembered;
        } else {
          // 2) Otherwise explore the playbook in order (cheap → drastic).
          candidate = order[attemptsBySymptom[symptom]] || order[order.length - 1];
        }
        attemptsBySymptom[symptom]++;
        tryRemedy(symptom, candidate, candidate === remembered);
      }, 1500);

      // Expose so destroyPlayer's cleanup can stop it (it clears on isDestroyed too).
      _selfRepairTimer = healthTimer;
    })();

  } // ──── END attachPlayer ────


  /* ═══════════════════════════════════════════════════════════════
   *  SITE-SPECIFIC CSS PATCHES
   *
   *  [CRIT-5] We NO LONGER hide YouTube's native controls
   *  The old code set .ytp-chrome-bottom opacity to 0.01 which
   *  broke YouTube's interface. Now we only adjust overflow.
   * ═══════════════════════════════════════════════════════════════ */
  function injectSitePatchCSS() {
    if (document.getElementById('vm-site-patch')) return;
    const style = document.createElement('style');
    style.id = 'vm-site-patch';

    let css = '';
    if (IS_YOUTUBE && !IS_MOBILE) {
      // DESKTOP ONLY: our overlay sits inside the player at inset:0 so it needs
      // a positioning context. On MOBILE we use the floating host (overlay is
      // top-level, position:fixed) so we must NOT touch #movie_player / player
      // containers — forcing position on them changes the containing block of
      // the negatively-positioned <video> → the mobile black-screen bug.
      css += '#movie_player { position: relative !important; }';
    }
    // NOTE: we deliberately DO NOT inject any position CSS for mobile Twitch.
    // Forcing position:relative on playerContainerMWeb / video-player__default-player
    // changes the containing block of Twitch's absolutely-positioned <video>,
    // pushing the frame to the bottom with a black band on top. The floating
    // host is independent (position:fixed on <html>) and needs no such patch.
    // This was the real reason the video only worked AFTER pressing ✕ (which
    // removed this very stylesheet) and re-attaching.
    // Note: overflow for managed players is controlled per-mode by
    // applyAspectRatio (visible in default, hidden for AR modes).

    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
  }


  /* ═══════════════════════════════════════════════════════════════
   *  VIDEO SCANNER — Discovers and attaches to videos
   * ═══════════════════════════════════════════════════════════════ */
  let ytPollInterval = null;

  function startYouTubePoll() {
    if (ytPollInterval) clearInterval(ytPollInterval);
    let attempts = 0;
    ytPollInterval = setInterval(function () {
      // Desktop selectors + mobile (m.youtube.com) + generic fallback.
      var vids = document.querySelectorAll(
        '#movie_player video, video.html5-main-video, .html5-video-player video, ' +
        '#player-container-id video, ytm-player video, .player-container video, video'
      );
      vids.forEach(function (v) {
        if ((v.readyState >= 1 || v.currentSrc || v.videoWidth > 0) && !processedVideos.has(v) &&
            (v.clientWidth > 40 || v.clientHeight > 40 || v.videoWidth > 0)) {
          attachPlayer(v);
        }
      });
      attempts++;
      if (attempts > 200) {
        clearInterval(ytPollInterval);
        ytPollInterval = null;
      }
    }, 500);
  }

  if (IS_YOUTUBE) {
    // Desktop + mobile (m.youtube.com) SPA navigation events.
    ['yt-navigate-finish', 'yt-page-data-updated', 'yt-navigate-start',
     'state-navigatefinish', 'state-navigatestart', 'pageshow'].forEach(function (eventName) {
      window.addEventListener(eventName, function () {
        setTimeout(function () { injectSitePatchCSS(); startYouTubePoll(); }, 400);
      });
    });
    // Mobile YT can swap videos without a navigation event — keep a slow poll.
    startYouTubePoll();
    setInterval(function () {
      if (!document.querySelector('video')) return;
      var hasUnprocessed = false;
      document.querySelectorAll('video').forEach(function (v) { if (!processedVideos.has(v)) hasUnprocessed = true; });
      if (hasUnprocessed) startYouTubePoll();
    }, 2000);
  }

  // Twitch (incl. m.twitch.tv) is a SPA that rarely fires standard nav events,
  // so poll for the <video> until we attach to it.
  if (IS_TWITCH) {
    injectSitePatchCSS();
    var twitchPollCount = 0;
    var twitchPoll = setInterval(function () {
      document.querySelectorAll('video').forEach(function (v) {
        if ((v.readyState >= 1 || v.currentSrc || v.videoWidth > 0) && !processedVideos.has(v) &&
            (v.clientWidth > 40 || v.clientHeight > 40 || v.videoWidth > 0)) {
          attachPlayer(v);
        }
      });
      twitchPollCount++;
      if (twitchPollCount > 90) clearInterval(twitchPoll);
    }, 1000);
  }

  // Collect <video> elements anywhere — including inside open Shadow DOM trees.
  function collectAllVideos(root, out, depth) {
    out = out || [];
    depth = depth || 0;
    if (depth > 8) return out;
    try {
      (root.querySelectorAll ? root.querySelectorAll('video') : []).forEach(function (v) {
        if (out.indexOf(v) === -1) out.push(v);
      });
      // Only pierce likely player hosts (avoid querySelectorAll('*'))
      var hosts = root.querySelectorAll
        ? root.querySelectorAll('shreddit-player, shreddit-player-2, ytd-player, ytm-player, video-js, .video-js, .plyr, .jwplayer, [class*="player"]')
        : [];
      for (var i = 0; i < hosts.length; i++) {
        if (hosts[i].shadowRoot) collectAllVideos(hosts[i].shadowRoot, out, depth + 1);
      }
    } catch (e) {}
    return out;
  }

  function tryAttach(v) {
    if (!v || processedVideos.has(v) || !v.isConnected) return;
    // Accept slightly smaller players; some sites start tiny then grow.
    if (v.clientWidth > 40 || v.clientHeight > 40 || v.videoWidth > 0 || v.readyState >= 1) {
      // SAFETY NET: never let an error attaching ONE video stop us from handling
      // others (or crash the scanner). If attach throws, mark the video as
      // processed so we don't retry-loop, and record a fail for self-learning.
      try {
        attachPlayer(v);
      } catch (err) {
        var failures = (attachFailureCounts.get(v) || 0) + 1;
        attachFailureCounts.set(v, failures);
        try { processedVideos.delete(v); } catch (e) {}
        if (IS_YOUTUBE || IS_TWITCH || IS_FACEBOOK || IS_KICK) _vmxLiveInstances = Math.max(0, _vmxLiveInstances - 1);
        // Retry transient SPA/layout failures twice; only then back off until a
        // real launcher click explicitly resets the guard.
        if (failures >= 3) { try { processedVideos.add(v); } catch (e) {} }
        else setTimeout(function () { if (v.isConnected && !instanceMap.get(v)) tryAttach(v); }, 180 * failures);
        try { if (typeof SiteProfiles !== 'undefined') SiteProfiles.recordFail(); } catch (e) {}
        try { vmxDebug('attach', 'ERROR #' + failures + ' ' + (err && err.message ? err.message : err)); } catch (e) {}
      }
    }
  }

  function scanForVideos() {
    if (isBlacklistedSite) return;
    injectSitePatchCSS();
    if (IS_YOUTUBE) {
      startYouTubePoll();
      // still scan for any embedded/secondary players too
    }
    var _vids = collectAllVideos(document, [], 0);
    vmxDebug('scan', 'videos on page=' + _vids.length + ' processed=' + totalVideoCount);
    _vids.forEach(tryAttach);
  }

  // Watch for dynamically added videos (covers SPA + lazy-load).
  // Lightweight: direct <video> lookups only (shadow-DOM piercing happens in
  // the throttled scanForVideos passes to keep this hot path fast).
  let mutScanQueued = false;
  new MutationObserver(function (mutations) {
    let sawShadowHost = false;
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.tagName === 'VIDEO') {
          tryAttach(node);
        } else if (node.querySelectorAll) {
          node.querySelectorAll('video').forEach(tryAttach);
          if (node.shadowRoot) sawShadowHost = true;
        }
      }
    }
    // If a shadow host appeared, do one deep scan (debounced) to pierce it.
    if (sawShadowHost && !mutScanQueued) {
      mutScanQueued = true;
      setTimeout(function () { mutScanQueued = false; collectAllVideos(document, [], 0).forEach(tryAttach); }, 400);
    }
  }).observe(document.documentElement, { childList: true, subtree: true });

  // Inject the main-world bridge early so YouTube/video.js/JW APIs are reachable.
  try { VMXBridge.ensureInjected(); } catch (e) {}

  
  try {
    var _api = (typeof chrome !== 'undefined' && chrome.storage) ? chrome.storage.local : null;
    if (_api) {
      _api.get(['vm_blacklist'], function (r) {
        if ((r && r.vm_blacklist || []).some(function(b) { return location.hostname.includes(b); })) {
          isBlacklistedSite = true;
          processedVideos.forEach(function(v) {
             var inst = instanceMap.get(v);
             if (inst && typeof inst.destroy === 'function') inst.destroy();
          });
        }
      });
    }
  } catch(e) {}

  // Initial scan — wait for storage so host prefs apply on first video
  function bootScanner() {
    try { HostBrain.syncFingerprint(); } catch (e) {}
    injectSitePatchCSS();
    if (document.querySelector('video')) {
      scanForVideos();
    } else {
      // Cheap observer until first video (saves work on text pages)
      var _bootMo = new MutationObserver(function () {
        if (document.querySelector('video')) {
          try { _bootMo.disconnect(); } catch (e) {}
          scanForVideos();
        }
      });
      try { _bootMo.observe(document.documentElement, { childList: true, subtree: true }); } catch (e) {}
      setTimeout(function () { try { _bootMo.disconnect(); } catch (e) {} scanForVideos(); }, 10000);
    }
    // Delayed rescans for SPA / lazy players (fewer on saveData)
    var delays = (HostBrain.ctx.saveData || HostBrain.ctx.slowNet) ? [1200, 4000] : [600, 1800, 4000, 8000];
    delays.forEach(function (delay) { setTimeout(scanForVideos, delay); });
  }

  Store.whenReady(function () {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', bootScanner);
    } else {
      bootScanner();
    }
  });

  // SPA navigation support — Navigation API when available, else history wrap
  function onSpaNavigate() {
    setTimeout(function () {
      try { HostBrain.syncFingerprint(); } catch (e) {}
      scanForVideos();
    }, 700);
  }
  try {
    if (window.navigation && typeof navigation.addEventListener === 'function') {
      navigation.addEventListener('navigate', function (ev) {
        if (ev && ev.navigationType && ev.navigationType === 'replace' && !ev.canIntercept) return;
        onSpaNavigate();
      });
    }
  } catch (e) {}
  const originalPushState = history.pushState.bind(history);
  const originalReplaceState = history.replaceState.bind(history);
  history.pushState = function () {
    originalPushState.apply(history, arguments);
    onSpaNavigate();
  };
  history.replaceState = function () {
    originalReplaceState.apply(history, arguments);
    onSpaNavigate();
  };
  window.addEventListener('popstate', onSpaNavigate);

  /* ═══════════════════════════════════════════════════════════════
   *  DIAGNOSTICS EXPORT HOTKEY  (Ctrl+Alt+D — works anywhere, any site)
   *  Lets the user export a full diagnostic .txt to send us. Only the top frame
   *  handles it so we get one clean file. Also exposed on window for power users.
   * ═══════════════════════════════════════════════════════════════ */
  try {
    if (window.top === window) {
      window.addEventListener('keydown', function (e) {
        if ((e.ctrlKey || e.metaKey) && e.altKey && (e.key === 'd' || e.key === 'D' || e.code === 'KeyD')) {
          e.preventDefault();
          var ok = VMX_LOG.exportTxt();
          try { vmxToastGlobal(ok ? '📄 Diagnostics exported — check downloads' : '⚠ Export failed'); } catch (er) {}
        }
      }, true);
      // Power-user hook: run `__vmxDiag()` in the console to download the log.
      try { window.__vmxDiag = function () { return VMX_LOG.exportTxt(); }; } catch (e) {}
    }
  } catch (e) {}

  // Minimal standalone toast (module scope) — the per-player showToast lives
  // inside attachPlayer, so we need a tiny one for global events like export.
  function vmxToastGlobal(msg) {
    try {
      var t = document.createElement('div');
      t.textContent = msg;
      t.style.cssText = 'position:fixed;left:50%;bottom:40px;transform:translateX(-50%);' +
        'z-index:2147483647;background:rgba(20,20,28,.96);color:#fff;font:14px/1.4 system-ui,sans-serif;' +
        'padding:10px 18px;border-radius:12px;box-shadow:0 6px 24px rgba(0,0,0,.5);pointer-events:none;max-width:80vw;text-align:center';
      (document.body || document.documentElement).appendChild(t);
      setTimeout(function () { t.style.transition = 'opacity .4s'; t.style.opacity = '0'; }, 2600);
      setTimeout(function () { try { t.remove(); } catch (e) {} }, 3200);
    } catch (e) {}
  }

  /* ═══════════════════════════════════════════════════════════════
   *  SELF-HEALING WATCHDOG (works on ANY site)
   *  Sites frequently re-render their player, which can (a) detach our overlay
   *  host from the DOM, or (b) swap in a new <video> we haven't seen. A light
   *  low-frequency check repairs both automatically so the extension keeps
   *  working without a reload — the "smart, self-repairing" behaviour.
   *  Cheap: one querySelectorAll every 2.5s, only acts when something's wrong.
   * ═══════════════════════════════════════════════════════════════ */
  (function selfHealWatchdog() {
    var misses = 0;
    setInterval(function () {
      try {
        // PERF: skip all work while the tab is hidden (saves CPU/battery).
        if (document.hidden) return;
        var vids = document.querySelectorAll('video');
        if (!vids.length) return;
        var repaired = false;
        vids.forEach(function (v) {
          // Skip user-dismissed videos and truly tiny/off ones.
          if (dismissedVideos && dismissedVideos.has && dismissedVideos.has(v)) return;
          var inst = instanceMap.get(v);
          if (inst) {
            // Attached before — verify its overlay host is still connected.
            // (Floating hosts live under <html>; in-container hosts under the player.)
            if (inst.host && !inst.host.isConnected) {
              // Host was ripped out by a site re-render → rebuild cleanly.
              try { processedVideos.delete(v); } catch (e) {}
              try { instanceMap.delete(v); } catch (e) {}
              tryAttach(v);
              repaired = true;
            }
          } else if (!processedVideos.has(v)) {
            // A new/replaced <video> appeared without a mutation we caught.
            if (v.clientWidth > 40 || v.clientHeight > 40 || v.videoWidth > 0 || v.readyState >= 1) {
              tryAttach(v);
              repaired = true;
            }
          }
        });
        misses = repaired ? 0 : (misses + 1);
      } catch (e) {}
    }, 2500);
  })();

})();
