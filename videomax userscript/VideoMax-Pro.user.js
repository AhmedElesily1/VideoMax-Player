// ==UserScript==
// @name         VideoMax Pro — Video Enhancer
// @name:ar      فيديو ماكس برو — محسّن الفيديو
// @namespace    https://videomax.app/
// @version      14.6.0
// @description  Enhance any web video: aspect-ratio, zoom, speed, brightness, volume boost, subtitles, filters, PiP, gestures, HLS quality & more.
// @description:ar حسّن أي فيديو على الويب: نسبة الأبعاد، التكبير، السرعة، السطوع، تعزيز الصوت، الترجمات، الفلاتر، PiP، الإيماءات، جودة HLS وأكثر.
// @author       VideoMax
// @license      MIT
// @match        *://*/*
// @exclude      *://*.googlevideo.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        GM_download
// @grant        GM_xmlhttpRequest
// @grant        GM_openInTab
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// @connect      *
// @run-at       document-start
// @all-frames   true
// @require      https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js
// @homepageURL  https://videomax.app/
// @supportURL   https://videomax.app/
// @downloadURL  https://videomax.app/VideoMax-Pro.user.js
// @updateURL    https://videomax.app/VideoMax-Pro.user.js
// ==/UserScript==


/* ============================================================================
 * VideoMax Pro — Userscript bootstrap & GM→chrome shim
 * Makes the (unchanged) extension code run under Tampermonkey/Violentmonkey/
 * Greasemonkey and Android userscript browsers (Soul, Via, Aloha, Lemur, …).
 * ==========================================================================*/
(function () {
  'use strict';

  // Some managers sandbox the page; prefer unsafeWindow when available so our
  // MAIN-world bridge and page-API access work like a real content script.
  var W = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;

  // Guard: run the whole extension only once per window.
  try { if (W.__VMX_USERSCRIPT_LOADED__) return; W.__VMX_USERSCRIPT_LOADED__ = true; } catch (e) {}

  var hasGM = {
    get: (typeof GM_getValue === 'function'),
    set: (typeof GM_setValue === 'function'),
    del: (typeof GM_deleteValue === 'function'),
    list:(typeof GM_listValues === 'function'),
    dl:  (typeof GM_download === 'function'),
    xhr: (typeof GM_xmlhttpRequest === 'function'),
    tab: (typeof GM_openInTab === 'function')
  };

  // localStorage fallback for managers without GM_getValue.
  function lsGet(k, d) { try { var v = localStorage.getItem('__vmx__' + k); return v === null ? d : v; } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem('__vmx__' + k, v); } catch (e) {} }
  function lsList() { var out = []; try { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k && k.indexOf('__vmx__') === 0) out.push(k.slice(7)); } } catch (e) {} return out; }
  function lsDel(k) { try { localStorage.removeItem('__vmx__' + k); } catch (e) {} }

  function gget(k, d) { try { return hasGM.get ? GM_getValue(k, d) : lsGet(k, d); } catch (e) { return d; } }
  function gset(k, v) { try { hasGM.set ? GM_setValue(k, v) : lsSet(k, v); } catch (e) {} }
  function gdel(k)    { try { hasGM.del ? GM_deleteValue(k) : lsDel(k); } catch (e) {} }
  function glist()    { try { return hasGM.list ? GM_listValues() : lsList(); } catch (e) { return []; } }

  // chrome.storage.local shim (Promise-based, matching MV3 usage in the code).
  var storageLocal = {
    get: function (keys, cb) {
      var out = {};
      try {
        var all = glist();
        if (keys == null) {
          all.forEach(function (k) { try { out[k] = JSON.parse(gget(k)); } catch (e) { out[k] = gget(k); } });
        } else if (typeof keys === 'string') {
          var raw = gget(keys); if (raw !== undefined) { try { out[keys] = JSON.parse(raw); } catch (e) { out[keys] = raw; } }
        } else if (Array.isArray(keys)) {
          keys.forEach(function (k) { var raw = gget(k); if (raw !== undefined) { try { out[k] = JSON.parse(raw); } catch (e) { out[k] = raw; } } });
        } else if (typeof keys === 'object') {
          Object.keys(keys).forEach(function (k) { var raw = gget(k); out[k] = (raw === undefined) ? keys[k] : (function () { try { return JSON.parse(raw); } catch (e) { return raw; } })(); });
        }
      } catch (e) {}
      if (typeof cb === 'function') { try { cb(out); } catch (e) {} return; }
      return Promise.resolve(out);
    },
    set: function (obj, cb) {
      try { Object.keys(obj || {}).forEach(function (k) { gset(k, JSON.stringify(obj[k])); }); } catch (e) {}
      if (typeof cb === 'function') { try { cb(); } catch (e) {} return; }
      return Promise.resolve();
    },
    remove: function (keys, cb) {
      try { (Array.isArray(keys) ? keys : [keys]).forEach(function (k) { gdel(k); }); } catch (e) {}
      if (typeof cb === 'function') { try { cb(); } catch (e) {} return; }
      return Promise.resolve();
    }
  };

  // Native download: prefer GM_download, else a blob/anchor click.
  function doDownload(msg, sendResponse) {
    var url = msg.url, name = (msg.filename ? String(msg.filename).replace(/[\\/:*?"<>|]+/g, '_').slice(0, 200) : 'video');
    if (hasGM.dl) {
      try {
        GM_download({ url: url, name: name, saveAs: !!msg.saveAs,
          onload: function () { sendResponse && sendResponse({ ok: true }); },
          onerror: function (e) { anchorFallback(); },
          ontimeout: function () { anchorFallback(); } });
        return;
      } catch (e) { /* fall through */ }
    }
    anchorFallback();
    function anchorFallback() {
      try {
        var a = document.createElement('a');
        a.href = url; a.download = name; a.rel = 'noopener';
        (document.body || document.documentElement).appendChild(a);
        a.click(); a.remove();
        sendResponse && sendResponse({ ok: true });
      } catch (e2) {
        try { W.open(url, '_blank'); sendResponse && sendResponse({ ok: true }); }
        catch (e3) { sendResponse && sendResponse({ ok: false, error: String(e3) }); }
      }
    }
  }

  // Minimal chrome.* surface used by the extension code.
  var chromeShim = {
    runtime: {
      // No real background page → getURL returns null so the bridge inlines inject.
      getURL: function () { return null; },
      lastError: null,
      sendMessage: function (msg, cb) {
        try {
          if (msg && msg.type === 'vm_download') { doDownload(msg, cb); return; }
          if (msg && msg.type === 'vm_open_tab') {
            try { hasGM.tab ? GM_openInTab(msg.url, { active: msg.active !== false }) : W.open(msg.url, '_blank'); } catch (e) {}
            if (cb) cb({ ok: true }); return;
          }
        } catch (e) {}
        // vm_video_detected (badge) and anything else: no-op ack.
        if (typeof cb === 'function') { try { cb({ ok: true }); } catch (e) {} }
        return Promise.resolve({ ok: true });
      },
      onMessage: { addListener: function () {} }  // popup messaging not used in userscript
    },
    storage: { local: storageLocal },
    downloads: { download: function (opts, cb) { doDownload(opts, function (r) { if (cb) cb(r && r.ok ? 1 : undefined); }); } },
    tabs: { create: function (o) { try { hasGM.tab ? GM_openInTab(o.url, { active: o.active !== false }) : W.open(o.url, '_blank'); } catch (e) {} } }
  };

  // Expose the shim as `chrome` for the extension code (only if the real one
  // isn't already a full extension context — userscripts have no chrome.runtime.id).
  try {
    if (typeof W.chrome === 'undefined' || !W.chrome.runtime || !W.chrome.runtime.id) {
      W.chrome = W.chrome || {};
      W.chrome.runtime = W.chrome.runtime || chromeShim.runtime;
      W.chrome.storage = W.chrome.storage || chromeShim.storage;
      W.chrome.downloads = W.chrome.downloads || chromeShim.downloads;
      W.chrome.tabs = W.chrome.tabs || chromeShim.tabs;
    }
  } catch (e) {}
  // Also define a local `chrome` for this closure (covers strict sandboxes).
  var chrome = W.chrome;

  // Make the @require'd Hls library visible to the extension code regardless of
  // which world it landed in.
  try { if (typeof W.Hls === 'undefined' && typeof Hls !== 'undefined') W.Hls = Hls; } catch (e) {}
  try { if (typeof Hls === 'undefined' && W.Hls) window.Hls = W.Hls; } catch (e) {}

  /* ── The MAIN-world bridge code (formerly inject.js), inlined as a string.
   *    The extension injects this into the page via a <script> tag so it runs
   *    in the real page world (needed for YouTube movie_player, video.js, JW…). */
  var VMX_INJECT_SOURCE = "/* VideoMax Pro \u2014 MAIN-world bridge.\n * Content scripts run in an ISOLATED world and cannot call page-defined\n * player APIs (YouTube's movie_player.getAvailableQualityLevels(), video.js,\n * JW Player, Plyr, hls.js instances on window, etc.). This file is injected\n * into the PAGE world so it CAN, and talks to the content script via\n * window.postMessage with the namespace \"__VMX__\".\n */\n(function () {\n  'use strict';\n  if (window.__VMX_BRIDGE__) return;\n  window.__VMX_BRIDGE__ = true;\n\n  var NS = '__VMX__';\n\n  function send(id, ok, data) {\n    try { window.postMessage({ __vmx: true, dir: 'res', id: id, ok: ok, data: data }, '*'); } catch (e) {}\n  }\n\n  /* \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n   *  MAIN-WORLD NETWORK SNIFFER\n   *  The content script (isolated world) cannot see fetch/XHR made by the\n   *  page. Here in the page world we lightly wrap fetch & XMLHttpRequest to\n   *  capture media manifest/stream URLs (m3u8/mpd/mp4\u2026) and forward them to\n   *  the content script. This replaces the webRequest permission entirely \u2014\n   *  no extra permissions, works on Twitch / Facebook / cross-origin iframes.\n   * \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */\n  function vmxClassify(u) {\n    if (!u || typeof u !== 'string') return null;\n    // Thumbnail preview VTT tracks are NOT subtitles \u2014 ignore them.\n    if (/thumbnail|sprite|storyboard|preview/i.test(u) && /\\.vtt/i.test(u)) return null;\n    // Subtitles / captions first (some end in query strings)\n    if (/\\.vtt(\\?|#|$)/i.test(u) || /\\.srt(\\?|#|$)/i.test(u) || /\\.(ass|ssa|ttml|dfxp|xml)(\\?|#|$)/i.test(u) && /(sub|caption|text|timedtext|cc)/i.test(u)) return 'sub';\n    if (/\\/api\\/timedtext|youtube\\.com\\/api\\/timedtext|timedtext\\?/i.test(u)) return 'sub';\n    if (/\\.m3u8(\\?|#|$)/i.test(u) || /\\/hls\\//i.test(u) || /[?&]format=m3u8/i.test(u) || /mime=application%2Fvnd\\.apple/i.test(u)) return 'hls';\n    // Twitch master/variant playlists are extensionless: *.ttvnw.net/v1/playlist/\u2026\n    if (/\\.ttvnw\\.net\\/.*\\/(?:playlist|api\\/channel\\/hls)/i.test(u) || /usher\\.ttvnw\\.net/i.test(u)) return 'hls';\n    if (/\\.mpd(\\?|#|$)/i.test(u) || /\\/dash\\//i.test(u) || /dash_manifest/i.test(u) || /DASHPlaylist/i.test(u)) return 'dash';\n    if (/\\.(mp4|webm|mkv|m4v|mov)(\\?|#|$)/i.test(u)) return 'file';\n    if (/googlevideo\\.com\\/videoplayback/i.test(u)) return 'file';\n    // Extensionless progressive video endpoints (wco.tv / wcostream getvid, etc.)\n    if (/\\/getvid\\?|\\/getvidlink|[?&]evid=/i.test(u)) return 'file';\n    // Reddit CMAF media (v.redd.it/<id>/CMAF_<h>.mp4 handled by .mp4 above)\n    return null;\n  }\n  var vmxSeen = Object.create(null);\n  function vmxReport(u) {\n    try {\n      if (!u) return;\n      var abs = u; try { abs = new URL(u, location.href).href; } catch (e) {}\n      var t = vmxClassify(abs);\n      if (!t) return;\n      if (vmxSeen[abs]) return; vmxSeen[abs] = 1;\n      var dir = (t === 'sub') ? 'subtrack' : 'media';\n      window.postMessage({ __vmx: true, dir: dir, url: abs, mtype: t }, '*');\n    } catch (e) {}\n  }\n\n  /* IMPORTANT: On YouTube/Google we DO NOT touch fetch/XHR/MediaSource.\n   * YouTube's player is extremely sensitive to prototype patching and will show\n   * a BLACK SCREEN if its media pipeline is wrapped. On YT we rely solely on the\n   * player-API bridge (getAvailableQualityLevels / captions) below, which is\n   * safe. The network sniffer is only for OTHER sites. */\n  var isYouTube = false;\n  try {\n    if (/youtube|googlevideo|ytimg/i.test(location.hostname)) isYouTube = true;\n    else if (window.top && window.top !== window) {\n      try { if (/youtube|googlevideo|ytimg/i.test(window.top.location.hostname)) isYouTube = true; } catch (e) {}\n    }\n  } catch (e) {}\n  try { if (window.yt || window.ytplayer || document.querySelector('ytd-app, ytm-app')) isYouTube = true; } catch (e) {}\n  var VMX_SKIP_NET_HOOKS = isYouTube;\n\n  if (!VMX_SKIP_NET_HOOKS) {\n    try {\n      var _fetch = window.fetch;\n      if (_fetch && !_fetch.__vmx) {\n        window.fetch = function (input, init) {\n          try { vmxReport(typeof input === 'string' ? input : (input && input.url)); } catch (e) {}\n          return _fetch.apply(this, arguments);\n        };\n        window.fetch.__vmx = true;\n        // Mask as native so sites' anti-tamper checks don't flag us.\n        try { window.fetch.toString = function () { return 'function fetch() { [native code] }'; }; } catch (e) {}\n      }\n    } catch (e) {}\n\n    try {\n      var _open = XMLHttpRequest.prototype.open;\n      if (_open && !_open.__vmx) {\n        XMLHttpRequest.prototype.open = function (method, url) {\n          try { vmxReport(url); } catch (e) {}\n          return _open.apply(this, arguments);\n        };\n        XMLHttpRequest.prototype.open.__vmx = true;\n        try { XMLHttpRequest.prototype.open.toString = function () { return 'function open() { [native code] }'; }; } catch (e) {}\n      }\n    } catch (e) {}\n\n    /* \u2550\u2550\u2550 MSE DETECTION (non-YouTube only) \u2550\u2550\u2550\n     * Flags sites using Media Source Extensions (blob: video). We only READ the\n     * mime string and pass the call straight through \u2014 but even a pass-through\n     * wrapper is risky on YT, hence it is skipped there. */\n    try {\n      if (window.MediaSource && MediaSource.prototype && !MediaSource.prototype.__vmx) {\n        var _addSB = MediaSource.prototype.addSourceBuffer;\n        MediaSource.prototype.addSourceBuffer = function (mime) {\n          try { window.postMessage({ __vmx: true, dir: 'mse', mime: String(mime || '') }, '*'); } catch (e) {}\n          return _addSB.apply(this, arguments);\n        };\n        MediaSource.prototype.__vmx = true;\n      }\n    } catch (e) {}\n  }\n\n  // \u2500\u2500 Find a YouTube player element (desktop OR mobile) \u2500\u2500\n  // Desktop: #movie_player / .html5-video-player\n  // Mobile (m.youtube.com): the player object carries class \"_msc\" and the\n  // YT API methods (getAvailableQualityLevels, etc.) live on that element.\n  function ytHasApi(el) {\n    return el && typeof el.getAvailableQualityLevels === 'function';\n  }\n  function ytPlayer() {\n    // Desktop\n    var p = document.getElementById('movie_player');\n    if (ytHasApi(p)) return p;\n    // Mobile m.youtube.com \u2014 the player object carries class \"_msc\"\n    var msc = document.getElementsByClassName('_msc');\n    for (var m = 0; m < msc.length; m++) { if (ytHasApi(msc[m])) return msc[m]; }\n    // Generic desktop/mobile player wrappers\n    p = document.querySelector('.html5-video-player') || document.querySelector('#player-container .html5-video-player');\n    if (ytHasApi(p)) return p;\n    // Last resort: scan wide for any element exposing the YT API.\n    var cands = document.querySelectorAll('._msc, .html5-video-player, [class*=\"player\"], ytd-player, ytm-app');\n    for (var i = 0; i < cands.length; i++) { if (ytHasApi(cands[i])) return cands[i]; }\n    // Walk up from the <video> element.\n    var v = document.querySelector('video');\n    var node = v;\n    while (node) { if (ytHasApi(node)) return node; node = node.parentElement; }\n    return null;\n  }\n\n  var YT_H = { highres:4320, hd2880:2880, hd2160:2160, hd1440:1440, hd1080:1080, hd720:720, large:480, medium:360, small:240, tiny:144 };\n\n  function ytGetQualities() {\n    var p = ytPlayer();\n    if (!p || typeof p.getAvailableQualityLevels !== 'function') return null;\n    var levels = p.getAvailableQualityLevels() || [];\n    var cur = '';\n    try { cur = (typeof p.getPlaybackQuality === 'function') ? p.getPlaybackQuality() : ''; } catch (e) {}\n    return {\n      cur: cur,\n      levels: levels.map(function (q) { return { id: q, height: YT_H[q] || 0 }; })\n    };\n  }\n\n  function ytSetQuality(q) {\n    var p = ytPlayer();\n    if (!p) return false;\n    // Desktop path (works directly).\n    try { if (typeof p.setPlaybackQualityRange === 'function') p.setPlaybackQualityRange(q, q); } catch (e) {}\n    try { if (typeof p.setPlaybackQuality === 'function') p.setPlaybackQuality(q); } catch (e) {}\n\n    // Mobile path: YouTube ignores setPlaybackQuality on m.youtube.com. The\n    // reliable trick (from android-youtube-player) is to write the desired\n    // quality into localStorage[\"yt-player-quality\"], then reload the video\n    // in place so the player re-reads it.\n    var isMobile = !document.getElementById('movie_player');\n    if (isMobile && q && q !== 'auto') {\n      try {\n        var now = Date.now();\n        localStorage.setItem('yt-player-quality', JSON.stringify({\n          data: q, creation: now, expiration: now + 30 * 24 * 3600 * 1000\n        }));\n      } catch (e) {}\n      // Reload current video at same time so the new quality applies.\n      try {\n        if (typeof p.getVideoData === 'function' && typeof p.loadVideoById === 'function') {\n          var vd = p.getVideoData() || {};\n          var t = (typeof p.getCurrentTime === 'function') ? p.getCurrentTime() : 0;\n          if (vd.video_id) p.loadVideoById(vd.video_id, t, q);\n        }\n      } catch (e) {}\n    } else if (isMobile && q === 'auto') {\n      try { localStorage.removeItem('yt-player-quality'); } catch (e) {}\n    }\n    return true;\n  }\n\n  function ytGetCaptions() {\n    var p = ytPlayer();\n    // 1) Official captions module (works once CC module is loaded)\n    if (p && typeof p.getOption === 'function') {\n      try {\n        var list = p.getOption('captions', 'tracklist') || p.getOption('cc', 'tracklist');\n        if (list && list.length) {\n          return list.map(function (t, i) {\n            return { i: i, name: t.displayName || t.languageName || t.languageCode || ('Track ' + (i + 1)), code: t.languageCode || '' };\n          }).filter(function (x) { return x.name; });\n        }\n      } catch (e) {}\n    }\n    // 2) Fallback: read captionTracks from the player response / ytInitialPlayerResponse\n    try {\n      var resp = null;\n      if (p && typeof p.getPlayerResponse === 'function') { try { resp = p.getPlayerResponse(); } catch (e) {} }\n      if (!resp && window.ytInitialPlayerResponse) resp = window.ytInitialPlayerResponse;\n      var tracks = resp && resp.captions && resp.captions.playerCaptionsTracklistRenderer &&\n                   resp.captions.playerCaptionsTracklistRenderer.captionTracks;\n      if (tracks && tracks.length) {\n        return tracks.map(function (t, i) {\n          var nm = (t.name && (t.name.simpleText || (t.name.runs && t.name.runs[0] && t.name.runs[0].text))) || t.languageCode || ('Track ' + (i + 1));\n          return { i: i, name: nm, code: t.languageCode || '', url: t.baseUrl || '' };\n        });\n      }\n    } catch (e) {}\n    return null;\n  }\n\n  function ytSetCaption(i) {\n    var p = ytPlayer();\n    if (!p) return false;\n    // Ensure the captions module is loaded first (needed for getOption/setOption).\n    try { if (typeof p.loadModule === 'function') p.loadModule('captions'); } catch (e) {}\n    if (typeof p.getOption === 'function' && typeof p.setOption === 'function') {\n      try {\n        if (i < 0) { p.setOption('captions', 'track', {}); return true; }\n        var list = p.getOption('captions', 'tracklist') || p.getOption('cc', 'tracklist') || [];\n        if (list && list[i]) {\n          p.setOption('captions', 'track', list[i]);\n          try { p.setOption('captions', 'reload', true); } catch (e) {}\n          return true;\n        }\n        // If tracklist not ready yet, at least toggle CC on with default track.\n        p.setOption('captions', 'track', {});\n      } catch (e) {}\n    }\n    // Fallback: click the native CC button (desktop) to toggle captions on.\n    try {\n      var btn = document.querySelector('.ytp-subtitles-button, button.ytp-subtitles-button');\n      if (btn) { btn.click(); return true; }\n    } catch (e) {}\n    return false;\n  }\n\n  // \u2500\u2500 Generic non-YouTube player detection (page world) \u2500\u2500\n  function genericGetQualities() {\n    var out = [];\n    // video.js \u2014 quality-levels plugin\n    try {\n      if (window.videojs && document.querySelector('.video-js')) {\n        var players = (window.videojs.getAllPlayers && window.videojs.getAllPlayers()) || [];\n        players.forEach(function (pl) {\n          try {\n            if (pl && pl.qualityLevels) {\n              var ql = pl.qualityLevels();\n              for (var i = 0; i < ql.length; i++) if (ql[i].height) out.push({ height: ql[i].height, kind: 'videojs-ql' });\n            }\n          } catch (e) {}\n          // video.js \u2014 sources array (vid3rb/anime3rb style: {src,label/res/type})\n          try {\n            var srcs = [];\n            if (pl.currentSources) srcs = pl.currentSources() || [];\n            if ((!srcs || !srcs.length) && pl.options_ && pl.options_.sources) srcs = pl.options_.sources;\n            (srcs || []).forEach(function (s) {\n              var lab = s.label || s.res || s.quality || s.name || '';\n              var m = String(lab).match(/(\\d{3,4})/) || String(s.src || '').match(/(\\d{3,4})p\\b/i);\n              var h = m ? parseInt(m[1], 10) : 0;\n              if (h && s.src) out.push({ height: h, url: s.src, kind: 'videojs-src' });\n            });\n          } catch (e) {}\n        });\n      }\n    } catch (e) {}\n    // hls.js instance commonly on window.hls\n    try {\n      var h = window.hls || (window.Hls && window._hls);\n      if (h && h.levels) h.levels.forEach(function (l) { if (l.height) out.push({ height: l.height, kind: 'hlsjs' }); });\n    } catch (e) {}\n    // JW Player (wco.tv / wcostream: labels \"576p HD\",\"720p HD\",\"1080p HD\",\n    // each source.file is an extensionless /getvid?evid=\u2026 progressive mp4).\n    try {\n      if (window.jwplayer) {\n        // Enumerate every JW instance on the page (there can be more than one).\n        var jwIds = [];\n        try {\n          document.querySelectorAll('.jwplayer, [id^=\"jwplayer\"], .jw-video, #myJwVideo').forEach(function (el) {\n            if (el.id) jwIds.push(el.id);\n          });\n        } catch (e) {}\n        if (!jwIds.length) jwIds.push(undefined); // default instance\n        jwIds.forEach(function (jid) {\n          try {\n            var jw = jid ? window.jwplayer(jid) : window.jwplayer();\n            if (!jw) return;\n            // 1) getQualityLevels \u2014 carries label + (sometimes) height\n            if (jw.getQualityLevels) {\n              (jw.getQualityLevels() || []).forEach(function (l, idx) {\n                var m = String(l.label || '').match(/(\\d{3,4})/);\n                out.push({ height: l.height || (m ? +m[1] : 0), qi: idx,\n                           label: l.label || '', kind: 'jwplayer' });\n              });\n            }\n            // 2) getPlaylistItem().sources \u2014 carries the direct file URL per quality\n            try {\n              var item = jw.getPlaylistItem && jw.getPlaylistItem();\n              var srcs = (item && item.sources) || (jw.getConfig && jw.getConfig().sources) || [];\n              srcs.forEach(function (s) {\n                var lab = s.label || s.res || '';\n                var m = String(lab).match(/(\\d{3,4})/) || String(s.file || '').match(/(\\d{3,4})p\\b/i);\n                var h = m ? parseInt(m[1], 10) : 0;\n                if ((h || lab) && s.file) out.push({ height: h, url: s.file, label: lab, kind: 'jwplayer-src' });\n              });\n            } catch (e) {}\n          } catch (e) {}\n        });\n      }\n    } catch (e) {}\n    // Plyr (stores quality options + source URLs)\n    try {\n      var plyrEls = document.querySelectorAll('.plyr');\n      plyrEls.forEach(function (el) {\n        var p = el.plyr || (el.__component && el.__component);\n        if (p && p.quality && p.source && p.source.sources) {\n          p.source.sources.forEach(function (s) {\n            var h = s.size || (String(s.src||'').match(/(\\d{3,4})p\\b/i)||[])[1];\n            if (h && s.src) out.push({ height: parseInt(h,10), url: s.src, kind: 'plyr' });\n          });\n        }\n      });\n    } catch (e) {}\n    // De-dupe by height, prefer entries that carry a direct URL.\n    var byH = {};\n    out.forEach(function (o) { if (!byH[o.height] || (o.url && !byH[o.height].url)) byH[o.height] = o; });\n    var res = Object.keys(byH).map(function (k) { return byH[k]; });\n    return res.length ? res : null;\n  }\n\n  function genericSetQuality(height) {\n    var ok = false;\n    // video.js \u2014 quality-levels plugin\n    try {\n      if (window.videojs) {\n        var players = (window.videojs.getAllPlayers && window.videojs.getAllPlayers()) || [];\n        players.forEach(function (pl) {\n          try {\n            if (pl && pl.qualityLevels) {\n              var ql = pl.qualityLevels();\n              for (var i = 0; i < ql.length; i++) ql[i].enabled = (ql[i].height === height);\n              ok = true;\n            }\n          } catch (e) {}\n          // video.js \u2014 swap source array entry matching the height\n          try {\n            var srcs = (pl.currentSources && pl.currentSources()) || (pl.options_ && pl.options_.sources) || [];\n            for (var k = 0; k < srcs.length; k++) {\n              var s = srcs[k];\n              var lab = s.label || s.res || s.quality || s.src || '';\n              var m = String(lab).match(/(\\d{3,4})/);\n              if (m && parseInt(m[1], 10) === height && s.src) {\n                var t = pl.currentTime ? pl.currentTime() : 0;\n                var paused = pl.paused ? pl.paused() : false;\n                pl.src({ src: s.src, type: s.type || 'video/mp4' });\n                pl.one && pl.one('loadedmetadata', function () { try { pl.currentTime(t); if (!paused) pl.play(); } catch (e) {} });\n                ok = true;\n              }\n            }\n          } catch (e) {}\n        });\n      }\n    } catch (e) {}\n    // JW Player \u2014 match by height on the quality levels list (wco.tv/wcostream).\n    try {\n      if (window.jwplayer && !ok) {\n        var jwIds = [];\n        try {\n          document.querySelectorAll('.jwplayer, [id^=\"jwplayer\"], .jw-video, #myJwVideo').forEach(function (el) {\n            if (el.id) jwIds.push(el.id);\n          });\n        } catch (e) {}\n        if (!jwIds.length) jwIds.push(undefined);\n        jwIds.forEach(function (jid) {\n          try {\n            var jw = jid ? window.jwplayer(jid) : window.jwplayer();\n            if (jw && jw.getQualityLevels && jw.setCurrentQuality) {\n              var levels = jw.getQualityLevels() || [];\n              for (var i = 0; i < levels.length; i++) {\n                var lm = String(levels[i].label || '').match(/(\\d{3,4})/);\n                var lh = levels[i].height || (lm ? parseInt(lm[1], 10) : 0);\n                if (lh === height) { jw.setCurrentQuality(i); ok = true; break; }\n              }\n            }\n          } catch (e) {}\n        });\n      }\n    } catch (e) {}\n    return ok;\n  }\n\n  window.addEventListener('message', function (ev) {\n    if (ev.source !== window) return;              // only same-window messages\n    var d = ev.data;\n    if (!d || d.__vmx !== true || d.dir !== 'req') return;\n    var id = d.id, cmd = d.cmd, arg = d.arg;\n    if (typeof id !== 'string' || typeof cmd !== 'string') return;\n    try {\n      switch (cmd) {\n        case 'yt-get-qualities': return send(id, true, ytGetQualities());\n        case 'yt-set-quality':   return send(id, true, ytSetQuality(arg));\n        case 'yt-get-captions':  return send(id, true, ytGetCaptions());\n        case 'yt-set-caption':   return send(id, true, ytSetCaption(arg));\n        case 'generic-qualities':return send(id, true, genericGetQualities());\n        case 'generic-set-quality': return send(id, true, genericSetQuality(arg));\n        default: return send(id, false, null);\n      }\n    } catch (e) { send(id, false, String(e)); }\n  });\n\n  // YouTube SPA navigation \u2192 tell the content script to re-scan/re-attach.\n  if (isYouTube) {\n    var _vmxAnnounceNav = function () { try { window.postMessage({ __vmx: true, dir: 'yt-navigated' }, '*'); } catch (e) {} };\n    window.addEventListener('yt-navigate-finish', _vmxAnnounceNav);\n    window.addEventListener('spfdone', _vmxAnnounceNav);\n    var _vmxLastHref = location.href;\n    setInterval(function () { if (location.href !== _vmxLastHref) { _vmxLastHref = location.href; _vmxAnnounceNav(); } }, 1000);\n  }\n\n  // Announce readiness\n  try { window.postMessage({ __vmx: true, dir: 'ready' }, '*'); } catch (e) {}\n})();\n";

  // Inject the page-world bridge immediately (document-start).
  function vmxInjectBridge() {
    try {
      var s = document.createElement('script');
      s.textContent = VMX_INJECT_SOURCE;
      (document.head || document.documentElement).appendChild(s);
      s.remove();
    } catch (e) {}
  }
  vmxInjectBridge();

  /* ── Support (contact) menu (userscript has no popup) ──
   * Adds a "💚 Support the developer" entry to the Tampermonkey/Violentmonkey
   * menu that opens an email to the developer. */
  var VMX_SUPPORT_EMAIL = 'ahmedelesily99@gmail.com';
  try {
    if (typeof GM_registerMenuCommand === 'function' && window.top === window) {
      var openTab = function (u) { try { (typeof GM_openInTab === 'function') ? GM_openInTab(u, { active: true }) : W.open(u, '_blank'); } catch (e) {} };
      GM_registerMenuCommand('💚 Support the developer (email)', function () {
        openTab('mailto:' + VMX_SUPPORT_EMAIL + '?subject=VideoMax%20Pro%20Support');
      });
    }
  } catch (e) {}

  /* ===================== BEGIN EXTENSION content.js ===================== */
/**
 * ╔══════════════════════════════════════════════════════════════════════════════════╗
 * ║  VideoMax Pro — Ultimate Video Enhancement Engine v11.0 (Chrome Edition)        ║
 * ║  Obsidian-Glass UI · PC + Android · Reliable · Fast · Maximum detection        ║
 * ╚══════════════════════════════════════════════════════════════════════════════════╝
 *
 * v11.0 HIGHLIGHTS:
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
  if (window.__VIDEOMAX_V8__) return;
  window.__VIDEOMAX_V8__ = true;

  /* ══════════════════════════════════════════════════
   *  CONSTANTS
   * ══════════════════════════════════════════════════ */
  const VERSION = '8.0.0';

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
  const IS_MOBILE_UA = /Mobi|Android|iPhone|iPad|iPod|Silk|Kindle|Opera Mini|IEMobile/i.test(navigator.userAgent);
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
  function vmxDebug(key, msg) {
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
  var VMX_BUILD = '14.6';

  // Site detection
  const HOSTNAME = location.hostname;
  const IS_YOUTUBE  = /youtube\.com|youtu\.be/.test(HOSTNAME);
  const IS_NETFLIX  = /netflix\.com/.test(HOSTNAME);
  const IS_TWITCH   = /twitch\.tv/.test(HOSTNAME);
  const IS_FACEBOOK = /facebook\.com|fb\.watch/.test(HOSTNAME);
  const IS_VIMEO    = /vimeo\.com/.test(HOSTNAME);
  const IS_TWITTER  = /(^|\.)(x\.com|twitter\.com)$/.test(HOSTNAME) || /twitter\.com|x\.com/.test(HOSTNAME);
  const IS_REDDIT   = /reddit\.com|redd\.it/.test(HOSTNAME);

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
      var all = doc.querySelectorAll('a,button,label,span,div,li,option');
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
        try { f.contentWindow && f.contentWindow.postMessage({ __vmxq: true, dir: 'quality-relay', quals: quals }, '*'); } catch (e) {}
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
      try { window.parent && window.parent.postMessage({ __vmxq: true, dir: 'quality-req' }, '*'); } catch (e) {}
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
    // Don't add duplicates or tiny tracking pixels
    if (!url || url.length < 20) return;
    // Skip audio-only tracks (Reddit CMAF_AUDIO_128.mp4, DASH audio reps, etc.)
    if (/(?:_AUDIO_|\/audio\/|[?&]mime=audio|dash_ln_heaac|\baudio\b.*\.mp4)/i.test(url)) return;
    var exists = capturedVideoUrls.find(function (v) { return v.url === url; });
    if (!exists) {
      // Try to extract resolution from URL.
      // Order: explicit "720p", Reddit "CMAF_720", generic "_720." separators.
      var resMatch = url.match(/(\d{3,4})[pP]\b/) ||
                     url.match(/CMAF_(\d{3,4})\b/i) ||
                     url.match(/[\/_\-](\d{3,4})[\/_\-\.]/);
      var label = resMatch ? resMatch[1] + 'p' : '';

      // Try to extract format
      var fmtMatch = url.match(/\.(mp4|webm|mkv|m4v|avi|mov)/i);
      var format = fmtMatch ? fmtMatch[1].toUpperCase() : 'Video';

      capturedVideoUrls.push({
        url: url,
        label: label,
        format: format,
        source: source,
        time: Date.now()
      });
    }
  }

  // Parse HLS master manifest to extract quality levels
  function parseHLSManifest(url, callback) {
    try {
      fetch(url, { credentials: 'include' }).then(function (r) { return r.text(); }).then(function (text) {
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
      fetch(url, { credentials: 'include' }).then(function (r) { return r.text(); }).then(function (text) {
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
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
      chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
        if (!msg || !msg.type) return false;
        if (msg.type === 'vm_apply_defaults') {
          const n = vmBroadcastDefaults(msg.defaults);
          sendResponse({ ok: true, applied: n });
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

    get(key, defaultVal) {
      return key in this._cache ? this._cache[key] : defaultVal;
    },

    set(key, value) {
      this._cache[key] = value;
      if (!storageAPI) return;
      try {
        const data = {};
        data['vm8_' + key] = JSON.stringify(value);
        storageAPI.set(data).catch(() => {});
      } catch (e) { /* ignore */ }
    },

    init() {
      if (!storageAPI) return;
      storageAPI.get(null).then(items => {
        if (!items) return;
        for (const [key, val] of Object.entries(items)) {
          if (key.startsWith('vm8_')) {
            try {
              this._cache[key.slice(4)] = JSON.parse(val);
            } catch (e) { /* ignore */ }
          }
        }
      }).catch(() => {});
    }
  };
  Store.init();

  /* ── Aliases (fix legacy references) ── */
  const S = Store;                       // [BUGFIX] `S` was used but never defined
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
        const url = (chrome.runtime && chrome.runtime.getURL) ? chrome.runtime.getURL('inject.js') : null;
        if (!url) return;
        const s = document.createElement('script');
        s.src = url;
        s.onload = function () { s.remove(); };
        (document.head || document.documentElement).appendChild(s);
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
      try { window.postMessage({ __vmx: true, dir: 'req', id: id, cmd: cmd, arg: arg }, '*'); }
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
    more()    { return createSvgIcon([{tag:'circle',attrs:{cx:'5',cy:'12',r:'1.5',fill:'currentColor'}},{tag:'circle',attrs:{cx:'12',cy:'12',r:'1.5',fill:'currentColor'}},{tag:'circle',attrs:{cx:'19',cy:'12',r:'1.5',fill:'currentColor'}}], false); },
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
   VIDEOMAX PRO v10 — "OBSIDIAN GLASS" DESIGN SYSTEM
   Ultra-modern · Glassmorphism · Responsive PC+Android
   ═══════════════════════════════════════════════════════ */
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:host{
  /* Core palette */
  --c:#ff1a1a;                       /* Vibrant red accent */
  --cg:rgba(255,26,26,.35);          /* Accent glow */
  --cs:rgba(255,26,26,.12);          /* Accent soft bg */
  --b1:#030305;                      /* Deepest black */
  --b2:rgba(10,10,16,.97);          /* Panel bg (opaque — no backdrop-filter) */
  --b3:rgba(16,16,24,.96);          /* Surface bg (opaque) */
  --w:#f0f0f5;                       /* Primary text */
  --w2:#a0a0b0;                      /* Secondary text */
  --w3:#606070;                      /* Muted text */
  --bd:rgba(255,255,255,.06);        /* Border subtle */
  --bd2:rgba(255,255,255,.1);       /* Border visible */
  --g1:rgba(255,255,255,.03);       /* Glass layer 1 */
  --g2:rgba(255,255,255,.06);       /* Glass layer 2 */
  --r:14px;                          /* Border radius */
  --r2:22px;                         /* Pill radius */
  --vm-red:#ff1a1a;                  /* [BUGFIX] legacy alias used in JS */
  --vm-gray:#a0a0b0;                 /* [BUGFIX] legacy alias used in JS */
  --t:cubic-bezier(.22,1,.36,1);    /* Smooth ease */
  --t2:cubic-bezier(.34,1.56,.64,1);/* Bounce ease */
  font-family:-apple-system,BlinkMacSystemFont,'SF Pro','Segoe UI',system-ui,sans-serif;
  font-size:13px;color:var(--w);line-height:1.45;
  -webkit-font-smoothing:antialiased;
  direction:ltr!important;unicode-bidi:isolate;
}

/* ═══ ENTRY BUTTON ═══ */
.vm-entry-btn{
  background:linear-gradient(135deg,var(--c),#cc0000);
  color:#fff;border:none;border-radius:var(--r2);
  padding:8px 16px;font-size:12.5px;font-weight:800;
  cursor:pointer;pointer-events:auto;
  display:flex;align-items:center;gap:7px;z-index:10;white-space:nowrap;
  box-shadow:0 4px 20px var(--cg),0 1px 2px rgba(0,0,0,.45);
  transition:transform .25s var(--t2),box-shadow .25s,opacity .35s;letter-spacing:.3px;
  -webkit-tap-highlight-color:transparent;opacity:.92;
  touch-action:manipulation;
}
.vm-entry-btn:hover{transform:translateY(-2px) scale(1.04);box-shadow:0 8px 32px var(--cg);opacity:1}
.vm-entry-btn:active{transform:scale(.93)}
/* Auto-fade the entry pill so it never blocks native controls; full opacity on hover */
.vm-entry-wrap{transition:opacity .4s var(--t)}
.vm-entry-wrap.vm-idle{opacity:.28}
.vm-entry-wrap.vm-idle:hover{opacity:1}
.vm-dismiss-btn{
  position:absolute;top:-7px;right:-7px;width:20px;height:20px;
  border-radius:50%;background:var(--b2);
  border:.5px solid var(--bd2);color:var(--w2);
  display:flex;align-items:center;justify-content:center;
  cursor:pointer;font-size:10px;font-weight:800;pointer-events:auto;
  transition:all .2s;
}
.vm-dismiss-btn:hover{background:var(--c);color:#fff;border-color:var(--c)}
.vm-reset-btn{
  position:absolute;top:-7px;left:-7px;width:20px;height:20px;
  border-radius:50%;background:var(--b2);
  border:.5px solid var(--bd2);color:var(--w2);
  display:flex;align-items:center;justify-content:center;
  cursor:pointer;font-size:11px;font-weight:800;pointer-events:auto;
  transition:all .2s;line-height:1;
}
.vm-reset-btn:hover{background:#22c55e;color:#fff;border-color:#22c55e;transform:rotate(-90deg)}

/* ═══ OVERLAYS ═══ */
.vm-brightness-overlay{position:absolute;inset:0;background:#000;pointer-events:none;opacity:0;z-index:5;transition:opacity .04s}
.vm-subtitle-display{position:absolute;bottom:76px;left:50%;transform:translateX(-50%);max-width:88%;text-align:center;pointer-events:none;z-index:40;transition:bottom .3s var(--t)}
.vm-subtitle-display span{
  display:inline-block;background:rgba(0,0,0,.74);color:#fff;
  font-size:clamp(15px,2.4vw,24px);font-weight:700;padding:8px 20px;border-radius:12px;line-height:1.45;
  
  border:.5px solid rgba(255,255,255,.1);letter-spacing:.2px;
  text-shadow:0 2px 8px rgba(0,0,0,.7);
  box-shadow:0 6px 24px rgba(0,0,0,.4);
}
.vm-subtitle-display.vm-hidden{display:none}
.vm-overlay{position:absolute;inset:0;pointer-events:none;user-select:none;-webkit-user-select:none;overflow:hidden}

/* ═══ HUD ═══ */
.vm-hud{
  position:absolute;inset:0;pointer-events:auto;
  display:flex;flex-direction:column;
  opacity:0;visibility:hidden;transition:opacity .25s var(--t),visibility .25s;
}
.vm-hud.vm-active{opacity:1;visibility:visible}
.vm-hud.vm-controls-hidden .vm-top-bar,.vm-hud.vm-controls-hidden .vm-bottom-bar{
  opacity:0;pointer-events:none;transition:opacity .4s var(--t)
}
.vm-hud.vm-controls-hidden{cursor:none}
.vm-hud.vm-controls-hidden .vm-touch-zones{cursor:none}
.vm-hud.vm-controls-hidden .vm-subtitle-display{bottom:10px}

/* ═══ TOP BAR ═══ */
.vm-top-bar{
  display:flex;align-items:center;gap:6px;padding:12px 16px 40px;flex-shrink:0;
  background:linear-gradient(180deg,rgba(0,0,0,.82) 0%,rgba(0,0,0,.25) 55%,transparent 100%);
  transition:opacity .4s var(--t);
}
.vm-logo-text{
  display:flex;align-items:center;gap:5px;font-size:14px;font-weight:800;
  color:var(--c);flex-shrink:0;letter-spacing:.5px;
  filter:drop-shadow(0 0 12px var(--cg));
}
.vm-video-title{color:var(--w3);font-size:11px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;text-align:center;padding:0 8px}
.vm-top-actions{display:flex;align-items:center;gap:2px;flex-shrink:1;min-width:0;overflow:hidden}

/* ═══ ZONES ═══ */
.vm-touch-zones{flex:1;display:flex;position:relative;min-height:0;overflow:hidden}
.vm-touch-zone{flex:1;pointer-events:auto;cursor:pointer;-webkit-tap-highlight-color:transparent}

/* ═══ BOTTOM BAR ═══ */
.vm-bottom-bar{
  background:linear-gradient(0deg,rgba(0,0,0,.85) 0%,rgba(0,0,0,.3) 50%,transparent 100%);
  padding:40px 16px 14px;display:flex;flex-direction:column;gap:6px;
  pointer-events:auto;flex-shrink:0;transition:opacity .4s var(--t);
}

/* ═══ SEEK BAR ═══ */
.vm-seek-container{width:100%;padding:10px 0 4px;cursor:pointer;position:relative}
.vm-seek-track{
  width:100%;height:3px;border-radius:3px;position:relative;
  background:rgba(255,255,255,.1);transition:height .12s var(--t);
}
.vm-seek-container:hover .vm-seek-track,.vm-seek-container.vm-dragging .vm-seek-track{height:5px}
.vm-seek-buffered{position:absolute;top:0;left:0;height:100%;background:rgba(255,255,255,.08);border-radius:3px;pointer-events:none}
.vm-seek-progress{
  height:100%;border-radius:3px;position:relative;pointer-events:none;will-change:width;
  background:linear-gradient(90deg,var(--c),#ff5252);
  box-shadow:0 0 12px var(--cg);
}
.vm-seek-thumb{
  position:absolute;top:50%;right:0;
  transform:translate(50%,-50%) scale(0);
  width:15px;height:15px;background:#fff;border-radius:50%;
  box-shadow:0 0 0 3px var(--c),0 0 16px var(--cg);
  transition:transform .15s var(--t2);
}
.vm-seek-container:hover .vm-seek-thumb,.vm-seek-container.vm-dragging .vm-seek-thumb{transform:translate(50%,-50%) scale(1)}
.vm-seek-tooltip{
  position:absolute;bottom:calc(100% + 12px);transform:translateX(-50%);
  background:var(--b2);color:#fff;font-size:12px;font-weight:700;
  padding:5px 14px;border-radius:10px;pointer-events:none;white-space:nowrap;
  opacity:0;transition:opacity .12s;z-index:50;
  border:.5px solid var(--bd2);
}
.vm-seek-container:hover .vm-seek-tooltip{opacity:1}

/* AB markers */
.vm-ab-marker{position:absolute;top:-3px;width:3px;height:calc(100% + 6px);border-radius:2px;z-index:3;pointer-events:none}
.vm-ab-marker.vm-marker-a{background:var(--c);box-shadow:0 0 8px var(--cg)}
.vm-ab-marker.vm-marker-b{background:#f59e0b;box-shadow:0 0 8px rgba(245,158,11,.4)}
.vm-ab-range-highlight{position:absolute;top:0;height:100%;background:var(--cs);pointer-events:none;z-index:1;border-radius:3px}

/* ═══ CONTROLS ═══ */
.vm-controls-row{display:flex;align-items:center;justify-content:space-between;gap:2px;flex-wrap:nowrap;overflow:visible;width:100%}
.vm-control-group{display:flex;align-items:center;gap:0;min-width:0;flex-wrap:nowrap}
.vm-control-group.vm-left-controls{flex:0 1 auto;overflow:hidden}
.vm-control-group.vm-right-controls{flex:0 0 auto;justify-content:flex-end}
/* Essential buttons (play/fullscreen) never shrink away */
.vm-control-btn.vm-essential{flex-shrink:0!important}
/* Responsive collapse — buttons hidden when the player is too narrow */
.vm-collapsed{display:none!important}
/* Compact sizing on small players (Android / narrow embeds) */
.vm-compact .vm-control-btn{width:36px;height:36px}
.vm-compact .vm-control-btn svg{width:18px;height:18px}
.vm-compact .vm-control-btn-lg{width:42px;height:42px}
.vm-compact .vm-pill-btn{height:28px;padding:0 9px;font-size:11px;max-width:70px}
.vm-compact .vm-top-bar,.vm-compact .vm-bottom-bar{padding-left:8px;padding-right:8px}
.vm-xcompact .vm-control-btn{width:32px;height:32px}
.vm-xcompact .vm-control-btn svg{width:17px;height:17px}
.vm-xcompact .vm-control-btn-lg{width:38px;height:38px}
.vm-xcompact .vm-time-display{font-size:10px;padding:0 3px}
.vm-xcompact .vm-logo-text{display:none}
.vm-control-btn{
  background:transparent;border:none;color:var(--w);
  border-radius:50%;width:40px;height:40px;flex-shrink:0;
  display:flex;align-items:center;justify-content:center;
  cursor:pointer;pointer-events:auto;position:relative;
  transition:all .15s var(--t);-webkit-tap-highlight-color:transparent;
}
.vm-control-btn:hover{background:var(--g2);transform:scale(1.14)}
.vm-control-btn:active{transform:scale(.84)}
.vm-control-btn.vm-active-state{color:var(--c);filter:drop-shadow(0 0 8px var(--cg))}
.vm-control-btn.vm-active-state::after{content:'';position:absolute;bottom:4px;left:50%;transform:translateX(-50%);width:4px;height:4px;border-radius:50%;background:var(--c);box-shadow:0 0 6px var(--cg)}
.vm-control-btn svg{width:20px;height:20px;transition:transform .15s var(--t2)}
/* Big, prominent play/pause button (point 8) */
.vm-play-pause{
  background:linear-gradient(135deg,rgba(255,26,26,.16),rgba(255,26,26,.06))!important;
  border:.5px solid rgba(255,26,26,.28)!important;
  box-shadow:0 2px 16px rgba(255,26,26,.18),0 0 0 .5px rgba(255,255,255,.04) inset;
}
.vm-play-pause:hover{background:linear-gradient(135deg,var(--c),#cc0000)!important;border-color:var(--c)!important;color:#fff!important;transform:scale(1.16);box-shadow:0 6px 26px var(--cg)}
.vm-play-pause svg{width:26px;height:26px}
.vm-pill-btn{
  border-radius:var(--r2);width:auto;padding:0 12px;
  font-size:11px;font-weight:700;min-width:36px;height:30px;
  letter-spacing:.3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:85px;
  background:var(--g1);border:.5px solid var(--bd);
  
  transition:all .2s var(--t);
}
.vm-pill-btn:hover{background:var(--cs);border-color:rgba(255,26,26,.25)}
.vm-control-btn-lg{width:46px;height:46px}
.vm-control-btn-lg svg{width:24px;height:24px}
.vm-time-display{
  color:var(--w2);font-size:12px;font-weight:600;
  font-variant-numeric:tabular-nums;white-space:nowrap;
  padding:0 6px;flex-shrink:1;overflow:hidden;text-overflow:ellipsis;min-width:0;
}

/* Volume */
.vm-volume-group{display:flex;align-items:center;gap:3px}
.vm-volume-slider{
  -webkit-appearance:none;appearance:none;width:0;height:4px;
  border-radius:3px;background:rgba(255,255,255,.22);outline:none;
  cursor:pointer;transition:width .25s var(--t),opacity .2s,margin .25s;opacity:0;margin:0;
}
/* Expand and stay interactive on hover OR focus/active */
.vm-volume-group:hover .vm-volume-slider,
.vm-volume-slider:focus,.vm-volume-slider:active,.vm-volume-slider:hover{width:74px;opacity:1;margin:0 4px}
.vm-volume-slider::-webkit-slider-thumb{-webkit-appearance:none;width:13px;height:13px;border-radius:50%;background:#fff;cursor:pointer;box-shadow:0 0 0 2px var(--c),0 0 8px var(--cg)}
.vm-volume-slider::-moz-range-thumb{width:13px;height:13px;border-radius:50%;background:#fff;cursor:pointer;border:none;box-shadow:0 0 0 2px var(--c)}

/* ═══ TOAST ═══ */
.vm-toast{
  position:absolute;bottom:76px;left:50%;
  transform:translateX(-50%) translateY(10px) scale(.95);
  background:var(--b2);color:#fff;font-size:14px;font-weight:700;
  padding:11px 26px;border-radius:var(--r);pointer-events:none;
  opacity:0;transition:all .25s var(--t2);
  white-space:nowrap;z-index:60;letter-spacing:.3px;
  border:.5px solid var(--bd2);
  
  box-shadow:0 12px 40px rgba(0,0,0,.6),0 0 0 .5px rgba(255,255,255,.05) inset;
}
.vm-toast.vm-visible{opacity:1;transform:translateX(-50%) translateY(0) scale(1)}

/* ═══ HOLD / SPEED BADGE — readable white pill, up-center (point 10) ═══ */
.vm-hold-badge{
  position:absolute;top:16px;left:50%;transform:translateX(-50%) translateY(-8px) scale(.96);
  font-size:18px;font-weight:900;pointer-events:none;
  opacity:0;visibility:hidden;
  z-index:62;text-align:center;line-height:1.05;white-space:nowrap;
  color:#fff;letter-spacing:.4px;
  display:inline-flex;align-items:center;gap:9px;
  padding:9px 20px;border-radius:99px;
  background:rgba(0,0,0,.6);
  border:.5px solid rgba(255,255,255,.16);
  
  box-shadow:0 6px 24px rgba(0,0,0,.5),0 0 18px var(--cg);
  transition:opacity .18s var(--t),transform .18s var(--t2),visibility .18s;
}
.vm-hold-badge::before{content:"»";font-size:18px;color:var(--c);font-weight:900;filter:drop-shadow(0 0 6px var(--cg))}
.vm-hold-badge.vm-visible{opacity:1;visibility:visible;transform:translateX(-50%) translateY(0) scale(1)}
.vm-hold-badge small{font-size:10.5px;font-weight:700;color:var(--w2);text-shadow:none;letter-spacing:1.2px;text-transform:uppercase}

/* ═══ INFO BADGES ═══ */
.vm-info-badge{
  position:absolute;left:50%;transform:translateX(-50%);
  background:var(--b2);color:#fff;font-size:11px;font-weight:700;
  padding:7px 20px;border-radius:var(--r2);pointer-events:none;
  opacity:0;transition:opacity .25s;z-index:55;white-space:nowrap;
  border:.5px solid var(--bd2);
  
}
.vm-info-badge.vm-visible{opacity:1}
.vm-badge-ar{top:50px}.vm-badge-rot{top:82px}.vm-badge-zoom{top:16px}

/* ═══ SIDE BARS ═══ */
.vm-side-bar{
  position:absolute;top:50%;transform:translateY(-50%);
  width:5px;height:160px;border-radius:5px;
  background:rgba(255,255,255,.06);pointer-events:none;
  opacity:0;visibility:hidden;transition:opacity .2s,visibility .2s;
}
.vm-side-bar.vm-left{left:14px}.vm-side-bar.vm-right{right:14px}
.vm-side-bar.vm-visible{opacity:1;visibility:visible}
.vm-side-bar-fill{position:absolute;bottom:0;left:0;width:100%;border-radius:5px;transition:height .06s}
.vm-side-bar.vm-left .vm-side-bar-fill{background:linear-gradient(to top,#f59e0b,#fcd34d);box-shadow:0 0 10px rgba(245,158,11,.35)}
.vm-side-bar.vm-right .vm-side-bar-fill{background:linear-gradient(to top,#22c55e,#86efac);box-shadow:0 0 10px rgba(34,197,94,.35)}
.vm-side-bar-icon{position:absolute;top:-28px;left:50%;transform:translateX(-50%);font-size:15px;filter:drop-shadow(0 1px 3px rgba(0,0,0,.5))}
.vm-side-bar-value{position:absolute;bottom:-30px;left:50%;transform:translateX(-50%);font-size:13px;font-weight:800;color:#fff;white-space:nowrap;text-shadow:0 2px 6px rgba(0,0,0,.8)}

/* ═══ SCRUB PREVIEW ═══ */
.vm-scrub-overlay{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;opacity:0;transition:opacity .15s;z-index:58}
.vm-scrub-overlay.vm-visible{opacity:1}
.vm-scrub-inner{
  background:var(--b2);border-radius:20px;padding:20px 40px;
  display:flex;flex-direction:column;align-items:center;gap:6px;
  border:.5px solid var(--bd2);
  
  box-shadow:0 20px 60px rgba(0,0,0,.7);
}
.vm-scrub-time{font-size:36px;font-weight:900;font-variant-numeric:tabular-nums;letter-spacing:1px}
.vm-scrub-delta{font-size:14px;font-weight:700;color:var(--c)}
.vm-scrub-bar{width:160px;height:3px;background:rgba(255,255,255,.1);border-radius:3px;overflow:hidden}
.vm-scrub-fill{height:100%;background:linear-gradient(90deg,var(--c),#ff5252);border-radius:3px}

/* ═══ EFFECTS ═══ */
.vm-ripple{position:absolute;border-radius:50%;background:radial-gradient(circle,rgba(255,26,26,.15),transparent 70%);transform:translate(-50%,-50%) scale(0);pointer-events:none;z-index:20;animation:vmR .55s ease-out forwards;width:100px;height:100px}
@keyframes vmR{to{transform:translate(-50%,-50%) scale(3.5);opacity:0}}
.vm-doubletap-indicator{position:absolute;top:0;bottom:0;width:30%;display:flex;align-items:center;justify-content:center;pointer-events:none;opacity:0;transition:opacity .12s;z-index:25}
.vm-doubletap-indicator.vm-left-side{left:0}
.vm-doubletap-indicator.vm-right-side{right:0}
.vm-doubletap-indicator .vm-dt-text{color:#fff;font-size:15px;font-weight:800;text-align:center;text-shadow:0 2px 10px rgba(0,0,0,.6)}
.vm-doubletap-indicator.vm-visible{opacity:1}

/* ═══ BADGES ═══ */
.vm-skip-ad-btn{position:absolute;bottom:76px;right:16px;background:linear-gradient(135deg,var(--c),#cc0000);color:#fff;border:none;border-radius:var(--r);padding:10px 20px;font-size:12px;font-weight:700;cursor:pointer;pointer-events:auto;z-index:65;display:none;box-shadow:0 4px 20px var(--cg);letter-spacing:.3px}
.vm-skip-ad-btn.vm-visible{display:block}
.vm-pip-badge,.vm-ab-badge{
  position:absolute;top:12px;font-size:10px;font-weight:700;
  padding:5px 14px;border-radius:var(--r2);pointer-events:none;display:none;z-index:55;
  background:var(--b2);color:var(--c);border:.5px solid var(--bd2);
  
}
.vm-pip-badge{right:12px}.vm-ab-badge{left:12px}
.vm-pip-badge.vm-visible,.vm-ab-badge.vm-visible{display:block}

/* ═══ PANELS (ULTRA-GLASS) ═══ */
.vm-panel{
  position:absolute;padding:8px 0;z-index:999;min-width:220px;
  max-height:72vh;overflow-y:auto;
  background:var(--b2);border:.5px solid var(--bd2);border-radius:var(--r);
  
  box-shadow:0 20px 60px rgba(0,0,0,.7),0 0 0 .5px rgba(255,255,255,.04) inset;
  opacity:0;transform:translateY(8px) scale(.97);
  pointer-events:none;transition:all .22s var(--t);
}
.vm-panel.vm-visible{opacity:1;transform:translateY(0) scale(1);pointer-events:auto}
.vm-panel-label{padding:10px 18px 4px;color:var(--w3);font-size:9px;font-weight:800;letter-spacing:1.8px;text-transform:uppercase}
.vm-panel-item{
  padding:11px 18px;color:var(--w);font-size:12.5px;cursor:pointer;
  display:flex;align-items:center;gap:12px;
  transition:all .12s;white-space:nowrap;border-radius:0;
  margin:0 6px;border-radius:8px;
}
.vm-panel-item:hover{background:var(--cs);color:#fff}
.vm-panel-item svg{width:16px;height:16px;flex-shrink:0;opacity:.55;transition:opacity .12s}
.vm-panel-item:hover svg{opacity:1}
.vm-panel-separator{height:.5px;background:var(--bd);margin:6px 14px}
.vm-panel-item.vm-has-submenu::after{content:"›";margin-left:auto;opacity:.25;font-size:18px;font-weight:300}

.vm-sub-panel{min-width:185px;z-index:1000}
.vm-quality-item,.vm-subtitle-item{
  padding:10px 18px;color:var(--w);font-size:12.5px;cursor:pointer;
  transition:all .1s;display:flex;align-items:center;gap:8px;
  margin:0 6px;border-radius:8px;
}
.vm-quality-item:hover,.vm-subtitle-item:hover{background:var(--cs)}
.vm-quality-item.vm-selected,.vm-subtitle-item.vm-selected{color:var(--c);font-weight:700}
.vm-subtitle-upload{padding:10px 18px;display:flex;align-items:center;gap:8px;cursor:pointer;color:var(--c);font-size:12px;font-weight:600;border-top:.5px solid var(--bd);margin-top:4px}
.vm-subtitle-upload:hover{background:var(--cs)}

/* Filters */
.vm-filter-panel{min-width:270px;z-index:1000;padding:12px 0}
.vm-filter-row{display:flex;align-items:center;gap:8px;padding:6px 18px}
.vm-filter-label{font-size:11px;font-weight:600;color:var(--w2);min-width:66px}
.vm-filter-slider{
  -webkit-appearance:none;appearance:none;flex:1;height:3px;border-radius:3px;
  background:rgba(255,255,255,.08);outline:none;cursor:pointer;
}
.vm-filter-slider::-webkit-slider-thumb{-webkit-appearance:none;width:15px;height:15px;border-radius:50%;background:var(--c);cursor:pointer;box-shadow:0 0 0 2px rgba(255,26,26,.3),0 0 10px var(--cg)}
.vm-filter-value{font-size:10px;font-weight:700;color:var(--w);min-width:30px;text-align:right}
.vm-filter-reset-btn{
  margin:10px 14px 4px;padding:9px 16px;
  background:var(--g1);border:.5px solid var(--bd);border-radius:10px;
  color:var(--w2);font-size:11px;font-weight:700;cursor:pointer;text-align:center;
  transition:all .15s;
}
.vm-filter-reset-btn:hover{background:var(--cs);color:var(--c);border-color:rgba(255,26,26,.25)}

/* Stats */
.vm-stats-panel{min-width:265px;z-index:1000;padding:14px 18px;font-size:11px}
.vm-stats-row{display:flex;justify-content:space-between;padding:5px 0;border-bottom:.5px solid var(--bd)}
.vm-stats-row:last-child{border-bottom:none}
.vm-stats-key{color:var(--w3);font-weight:500}
.vm-stats-val{color:var(--w);font-weight:700;font-variant-numeric:tabular-nums}

/* Loading */
.vm-loading{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);pointer-events:none;opacity:0;transition:opacity .2s;z-index:59}
.vm-loading.vm-visible{opacity:1}
.vm-spinner{width:48px;height:48px;border:3px solid rgba(255,255,255,.06);border-top-color:var(--c);border-radius:50%;animation:vmSpin .65s linear infinite}
@keyframes vmSpin{to{transform:rotate(360deg)}}
.vm-panel-item svg{width:15px;height:15px;flex-shrink:0;opacity:.65}

/* KB hint */
.vm-keyboard-hint{
  position:absolute;bottom:72px;left:50%;transform:translateX(-50%);
  background:var(--b2);color:var(--w3);font-size:10px;
  padding:7px 20px;border-radius:var(--r2);pointer-events:none;
  opacity:0;transition:opacity .3s;white-space:nowrap;z-index:55;
  border:.5px solid var(--bd);
}
.vm-keyboard-hint.vm-visible{opacity:1}

/* Scrollbar */
.vm-panel::-webkit-scrollbar{width:3px}
.vm-panel::-webkit-scrollbar-thumb{background:rgba(255,255,255,.08);border-radius:3px}

/* ═══ MOBILE ═══ */
@media(max-width:600px),(pointer:coarse){
  .vm-control-btn{width:40px;height:40px;min-width:40px}
  .vm-control-btn-lg{width:44px;height:44px;min-width:44px}
  .vm-control-btn svg{width:20px;height:20px}
  .vm-control-btn-lg svg{width:24px;height:24px}
  .vm-pill-btn{height:28px;padding:0 8px;font-size:11px;min-width:32px;max-width:70px}
  .vm-top-bar{padding:6px 6px 14px}
  .vm-bottom-bar{padding:14px 6px 8px}
  .vm-toast{font-size:14px;padding:10px 22px;border-radius:16px}
  .vm-controls-row,.vm-control-group{gap:0}
  .vm-time-display{font-size:11px;padding:0 3px}
  .vm-hide-mobile{display:none!important}
  .vm-seek-track{height:5px!important}
  .vm-seek-container:hover .vm-seek-track,.vm-seek-container.vm-dragging .vm-seek-track{height:7px!important}
  .vm-seek-thumb{width:17px!important;height:17px!important}
  .vm-seek-container{padding:12px 0 6px!important}
  .vm-side-bar{width:7px!important;height:180px!important;border-radius:7px!important}
  .vm-side-bar-value{font-size:15px!important}
  .vm-scrub-inner{padding:16px 30px;border-radius:16px}
  .vm-scrub-time{font-size:30px}
  .vm-hold-badge{font-size:17px;padding:8px 18px}
}
@media(max-height:450px) and (orientation:landscape){
  .vm-top-bar{padding:4px 8px 8px!important}
  .vm-bottom-bar{padding:8px 8px 4px!important}
  .vm-control-btn{width:34px;height:34px;min-width:34px}
  .vm-control-btn-lg{width:38px;height:38px}
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
    btn.className = className;
    if (title) btn.title = title;
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

  function loadHlsLibrary(callback) {
    // hls.min.js is now loaded as a content script (same isolated world), so
    // `Hls` is usually already defined here. Poll briefly in case content.js
    // ran before the library finished evaluating.
    if (typeof Hls !== 'undefined') { hlsLibReady = true; callback(); return; }

    let tries = 0;
    const poll = setInterval(function () {
      tries++;
      if (typeof Hls !== 'undefined') {
        clearInterval(poll); hlsLibReady = true; callback();
      } else if (tries > 50) { // ~5s; library unavailable in this frame
        clearInterval(poll);
      }
    }, 100);
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
  function getOrCreateAudioBoost(videoElement) {
    if (audioBoostMap.has(videoElement)) {
      return audioBoostMap.get(videoElement);
    }
    // Never build the graph just to set gain=1 (no boost needed → avoid mute risk)
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      const audioCtx = new Ctx();
      const source = audioCtx.createMediaElementSource(videoElement);
      const gainNode = audioCtx.createGain();
      source.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      if (audioCtx.state === 'suspended') { try { audioCtx.resume(); } catch (e) {} }
      const boostData = { ctx: audioCtx, gain: gainNode, source: source, level: 1, broken: false };
      audioBoostMap.set(videoElement, boostData);
      return boostData;
    } catch (e) {
      return null;
    }
  }

  // Set volume in the SAFEST way: element volume for 0–100%, Web Audio gain only
  // for >100% boost. Returns true if boost graph is active.
  function setVideoVolume(videoElement, level, stateRef) {
    // level: 0..N (1 = 100%). stateRef is the per-instance object holding audioBoostLevel setter.
    if (level <= 1) {
      // Plain element volume — cannot mute cross-origin, always works.
      videoElement.volume = clamp(level, 0, 1);
      videoElement.muted = (level === 0);
      // If a boost graph exists, neutralise it (gain=1) but keep element volume authoritative.
      var existing = audioBoostMap.get(videoElement);
      if (existing && !existing.broken) { try { existing.gain.gain.value = 1; } catch (e) {} }
      return false;
    }
    // Boost path (>100%)
    videoElement.volume = 1;
    videoElement.muted = false;
    var boost = getOrCreateAudioBoost(videoElement);
    if (boost && !boost.broken) {
      try { boost.gain.gain.value = level; } catch (e) {}
      return true;
    }
    return false;
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
    var _singlePlayerSite = IS_YOUTUBE || IS_TWITCH || IS_FACEBOOK;
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
      loop: video.loop
    };

    // Notify background script
    try {
      if (chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({
          type: 'vm_video_detected',
          count: totalVideoCount
        }).catch(() => {});
      }
    } catch (e) { /* ignore */ }

    /* ─── Find the best container element ─── */
    let container = video.parentElement;

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
      container = video.closest('.VideoContainer, .nfp-container') || container;
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
      container = video.closest('shreddit-player, shreddit-player-2, [data-testid="shreddit-player"], .reddit-video-player-root') || container;
    }

    // Fallback — never use document.body as container
    if (!container || container === document.body || container === document.documentElement) {
      container = video.parentElement;
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
    const _willFloat = IS_MOBILE && (IS_YOUTUBE || IS_TWITCH || IS_FACEBOOK);
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
    const useFloatingHost = IS_MOBILE && (IS_YOUTUBE || IS_TWITCH || IS_FACEBOOK);
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
      if (floatSyncRAF) { cancelAnimationFrame(floatSyncRAF); floatSyncRAF = null; }
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
    subtitleFileInput.accept = '.srt,.vtt';
    subtitleFileInput.style.cssText = 'position:absolute;left:-9999px;opacity:0;pointer-events:none';
    document.body.appendChild(subtitleFileInput);

    /* ═══════════════════════════════════════════════════
     *  BUILD THE PLAYER UI
     * ═══════════════════════════════════════════════════ */
    const overlay = createElement('div', 'vm-overlay');

    // Brightness overlay
    const brightnessOverlay = createElement('div', 'vm-brightness-overlay');
    overlay.appendChild(brightnessOverlay);

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

    // Mobile: only show AR, Rotate, More, Close in top bar
    // Desktop: show all buttons
    if (IS_MOBILE) {
      zoomInButton.classList.add('vm-hide-mobile');
      zoomOutButton.classList.add('vm-hide-mobile');
      mirrorButton.classList.add('vm-hide-mobile');
      pipButtonTop.classList.add('vm-hide-mobile');
    }
    [arButton, rotateButton, zoomInButton, zoomOutButton, mirrorButton, pipButtonTop, moreButton, closeButton]
      .forEach(function(btn) { topActions.appendChild(btn); });
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
        'Space = Play/Pause · ← → = Seek · ↑ ↓ = Volume · F = Fullscreen · A = Aspect · S = Speed · M = Mute');
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
    const menuFilters = createPanelItem('filter', 'Video Filters', true);
    const menuAudioBoost = createPanelItem('boost', 'Audio Boost');
    const menuStats = createPanelItem('stats', 'Video Stats');
    [menuFilters, menuAudioBoost, menuStats].forEach(item => contextMenu.appendChild(item));

    addMenuSeparator();
    addMenuLabel('Video');
    const menuPiP = createPanelItem('pip', 'Picture-in-Picture');
    const menuDownload = createPanelItem('download', 'Download');
    const menuInfo = createPanelItem('info', 'Video Info');
    const menuReset = createPanelItem('reset', 'Reset All');
    var menuCinema = createPanelItem('cinema', 'Cinema Mode');
    var menuFullscreen = createPanelItem('fsE', 'Fullscreen');
    var menuRotateMenu = createPanelItem('rot', 'Rotate');
    var menuMirrorMenu = createPanelItem('mirror', 'Mirror');
    [menuFullscreen, menuRotateMenu, menuMirrorMenu, menuCinema, menuPiP, menuDownload, menuInfo, menuReset].forEach(item => contextMenu.appendChild(item));
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
    subtitleUploadBtn.appendChild(document.createTextNode(' Load .srt / .vtt'));
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

    [rewindButton, playPauseButton, forwardButton, muteButton].forEach(btn => leftControls.appendChild(btn));

    // Volume slider (desktop only)
    let volumeSlider = null;
    if (!IS_MOBILE) {
      const volumeGroup = createElement('div', 'vm-volume-group');
      volumeSlider = document.createElement('input');
      volumeSlider.type = 'range';
      volumeSlider.min = '0';
      volumeSlider.max = '3';       // 0-100% real volume, 100-300% via audio boost
      volumeSlider.step = '0.02';
      volumeSlider.value = '1';
      volumeSlider.className = 'vm-volume-slider';
      volumeSlider.setAttribute('aria-label', 'Volume & Boost');
      volumeGroup.appendChild(volumeSlider);
      leftControls.appendChild(volumeGroup);
    }

    leftControls.appendChild(timeDisplay);

    const speedButton = createPillButton('vm-control-btn vm-pill-btn', 'Speed (S)', '1×');
    const loopButton = createButton('vm-control-btn', 'Loop (L)', 'loop');
    const abLoopButton = createButton('vm-control-btn', 'A-B Loop (B)', 'abloop');
    const subtitleButton = createButton('vm-control-btn', 'Subtitles (C)', 'subtitles');
    const fullscreenButton = createButton('vm-control-btn vm-essential', 'Fullscreen (F)', 'fullscreenEnter');
    playPauseButton.classList.add('vm-essential');

    // Mobile: Speed, CC, Fullscreen (hide Loop, AB)
    // Desktop: all buttons
    if (IS_MOBILE) {
      loopButton.classList.add('vm-hide-mobile');
      abLoopButton.classList.add('vm-hide-mobile');
    }
    [speedButton, subtitleButton, loopButton, abLoopButton, fullscreenButton]
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
    // Assign collapse priority (top-bar + bottom-bar non-essential buttons)
    function setPri(btn, p) { if (btn) btn.dataset.vmPri = p; }
    setPri(rotateButton, 1); setPri(mirrorButton, 1);
    setPri(zoomInButton, 2); setPri(zoomOutButton, 2);
    setPri(pipButtonTop, 3);
    setPri(loopButton, 1); setPri(abLoopButton, 1);
    setPri(subtitleButton, 4); setPri(speedButton, 5);
    // arButton, moreButton, closeButton, playPause, rewind, forward, fullscreen = keep

    const collapsible = [rotateButton, mirrorButton, zoomInButton, zoomOutButton,
      pipButtonTop, loopButton, abLoopButton].filter(Boolean);

    function applyCompactScale() {
      // Shrink control sizing on small players via a class on the hud.
      const w = (container.getBoundingClientRect().width) || window.innerWidth;
      hud.classList.toggle('vm-compact', w < 560);
      hud.classList.toggle('vm-xcompact', w < 400);
    }

    function reflowControls() {
      if (isDestroyed || !isHudVisible) return;
      applyCompactScale();
      // Reveal all collapsible buttons, then hide any that cause overflow.
      collapsible.forEach(function (b) { b.classList.remove('vm-collapsed'); });
      // Top bar overflow (actions must fit next to title)
      requestAnimationFrame(function () {
        try {
          // Sort by priority ascending (hide lowest priority first)
          var byPri = collapsible.slice().sort(function (a, b) {
            return (parseInt(a.dataset.vmPri || 9) - parseInt(b.dataset.vmPri || 9));
          });
          var guard = 0;
          function overflowing(row) { return row.scrollWidth > row.clientWidth + 2; }
          while ((overflowing(topActions) || overflowing(controlsRow)) && guard < byPri.length) {
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
    function applyBrightness() {
      // Always use CSS filter — the overlay approach can't brighten above original
      brightnessOverlay.style.opacity = 0; // Disable overlay, CSS filter handles everything
      
      var parts = [];
      // Add brightness (0.1 = very dark, 1.0 = normal, 2.0 = very bright)
      if (brightnessLevel !== 1.0) {
        parts.push('brightness(' + brightnessLevel.toFixed(2) + ')');
      }
      // Merge with user's Video Filters
      if (videoFilters.contrast !== 100) parts.push('contrast(' + videoFilters.contrast + '%)');
      if (videoFilters.brightness !== 100) parts.push('brightness(' + (videoFilters.brightness / 100).toFixed(2) + ')');
      if (videoFilters.saturate !== 100) parts.push('saturate(' + videoFilters.saturate + '%)');
      if (videoFilters.hueRotate !== 0) parts.push('hue-rotate(' + videoFilters.hueRotate + 'deg)');
      if (videoFilters.blur > 0) parts.push('blur(' + videoFilters.blur + 'px)');
      if (videoFilters.grayscale > 0) parts.push('grayscale(' + videoFilters.grayscale + '%)');
      if (videoFilters.sepia > 0) parts.push('sepia(' + videoFilters.sepia + '%)');
      
      video.style.setProperty('filter', parts.length ? parts.join(' ') : 'none', 'important');
    }
    let zoomLevel = 1.0;
    let rotationDeg = 0;
    let screenRotIndex = 0;
    let aspectRatioIndex = 0;  // [CRIT-1] Starts at 0 = Default = no style changes
    let _arRetryCount = 0;     // guards the AR layout-retry loop
    let speedIndex = 3; // 1× in SPEED_OPTIONS
    let isLooping = false;
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
      toastElement.textContent = message;
      toastElement.classList.add('vm-visible');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toastElement.classList.remove('vm-visible'), duration);
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
      // NEVER show controls during hold speed mode
      if (isHoldActive || isLongPress) return;
      hud.classList.remove('vm-controls-hidden');
      clearTimeout(autoHideTimeout);
      if (!IS_MOBILE && !video.paused) {
        autoHideTimeout = setTimeout(function () {
          hud.classList.add('vm-controls-hidden');
        }, 3000);
      }
    }

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
      const rect = container.getBoundingClientRect();
      return {
        width: rect.width || container.offsetWidth || window.innerWidth,
        height: rect.height || container.offsetHeight || window.innerHeight
      };
    }

    function buildCssTransform(extraTransform) {
      extraTransform = extraTransform || '';
      const parts = [];
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
    const USES_MANAGED_LAYOUT = IS_YOUTUBE || IS_NETFLIX || IS_TWITCH || IS_FACEBOOK || IS_VIMEO || IS_TWITTER || IS_REDDIT;

    const AR_ALL_PROPS = ['width','height','top','left','right','bottom',
      'object-fit','object-position','max-width','max-height','min-width','min-height',
      'position','margin','transform','transform-origin'];

    function clearArProps() { AR_ALL_PROPS.forEach(function (p) { video.style.removeProperty(p); }); }

    let _arWriting = false;
    function applyAspectRatio() {
      if (isDestroyed) return;
      _arWriting = true;
      // Clear the write-guard after this frame so the styleGuardObserver ignores
      // our own style writes but still catches the site's later overwrites.
      requestAnimationFrame(function () { _arWriting = false; });

      const mode = AR_MODES[aspectRatioIndex].key;
      const { width: cw, height: ch } = getContainerDimensions();
      if (!cw || !ch) return;

      const vw = video.videoWidth || 0;
      const vh = video.videoHeight || 0;
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
          vs.removeProperty('transform');
          vs.removeProperty('transform-origin');
        }
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
        // TRANSFORM-ONLY engine — never touch position/width/height/overflow of
        // the site's <video>. Managed players (YouTube/Netflix/Twitch) break
        // (black screen) if we reposition or resize their video element, so we
        // ONLY apply a CSS transform (scale), which is purely visual and cannot
        // hide the video or disturb the site's compositing. We clear ONLY our
        // own object-fit (never the site's inline width/height/top/left).
        vs.removeProperty('object-fit');
        vs.removeProperty('object-position');

        const vRatio = (vw && vh) ? (vw / vh) : (cw / ch);
        const cRatio = cw / ch;
        let sx = 1, sy = 1;

        switch (mode) {
          case 'fit':
            // shrink so the whole frame fits (rarely needed; usually identity)
            break;
          case 'fill': {
            // scale up uniformly until the frame covers the box (crop bars)
            var s = (vRatio > cRatio) ? (vRatio / cRatio) : (cRatio / vRatio);
            sx = sy = s;
            break;
          }
          case 'stretch': {
            // distort to fill: stretch the shorter dimension to match the box
            if (cRatio > vRatio) sx = cRatio / vRatio; else sy = vRatio / cRatio;
            break;
          }
          case 'zoom14': sx = sy = 1.4; break;
          case 'zoom16': sx = sy = 1.6; break;
          case 'zoom20': sx = sy = 2.0; break;
          case 'r43':
          case 'r169':
          case 'r235': {
            var targetRatio = mode === 'r43' ? (4/3) : mode === 'r169' ? (16/9) : 2.35;
            if (targetRatio > vRatio) sx = targetRatio / vRatio; else sy = vRatio / targetRatio;
            break;
          }
        }

        var extraScale = (sx !== 1 || sy !== 1) ? ('scale(' + sx.toFixed(4) + ',' + sy.toFixed(4) + ')') : '';
        var tfm = buildCssTransform(extraScale);
        if (tfm) {
          vs.setProperty('transform', tfm, 'important');
          vs.setProperty('transform-origin', 'center center', 'important');
        } else {
          vs.removeProperty('transform');
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
    const resizeObserver = new ResizeObserver(function () { debouncedApplyAR(); debouncedReflow(); });
    resizeObserver.observe(container);
    try { resizeObserver.observe(video); } catch (e) {}

    // Managed players (YouTube/Netflix/…) constantly rewrite the <video>'s
    // inline style, which wipes our AR transform. Watch the style attribute and
    // re-apply when a non-default AR mode is active. `_arWriting` (set inside
    // applyAspectRatio) guards against reacting to our own writes.
    let _arGuardTimer = null;
    const styleGuardObserver = new MutationObserver(function () {
      if (_arWriting || isDestroyed) return;
      // Only act when a transform is actually needed (non-default state).
      if (aspectRatioIndex === 0 && zoomLevel === 1 && rotationDeg === 0 && !isMirrored) return;
      // Only re-apply if our transform got wiped (cheap string check, no reflow).
      if (video.style && video.style.transform && video.style.transform.indexOf('scale') !== -1) return;
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

      // On managed players (YouTube/Netflix/…) NEVER move the <video> into a
      // custom element — that detaches it from the site's player and causes a
      // black screen. Use NATIVE fullscreen on the site's own container instead.
      if (USES_MANAGED_LAYOUT) {
        var target = container || video;
        var reqFS = target.requestFullscreen || target.webkitRequestFullscreen || video.requestFullscreen || video.webkitRequestFullscreen;
        try { (reqFS.call ? reqFS.call(target) : reqFS.call(video)).catch(function(){}); } catch (e) {
          try { (video.requestFullscreen || video.webkitRequestFullscreen).call(video); } catch (e2) {}
        }
        isFullscreen = true;
        setButtonIcon(fullscreenButton, 'fullscreenExit');
        setTimeout(function () { if (!isDestroyed) applyAspectRatio(); }, 120);
        showToast('⛶ Fullscreen');
        return;
      }

      savedVideoSibling = video.nextSibling;

      // Floating-host players (mobile YT/Twitch/FB) use native fullscreen too —
      // never move the <video> into a custom element (that black-screens them).
      if (useFloatingHost) {
        var fsTarget = container || video;
        var reqF = fsTarget.requestFullscreen || fsTarget.webkitRequestFullscreen || video.requestFullscreen || video.webkitRequestFullscreen;
        try { (reqF.call ? reqF.call(fsTarget) : reqF.call(video)); } catch (e) {
          try { (video.requestFullscreen || video.webkitRequestFullscreen).call(video); } catch (e2) {}
        }
        isFullscreen = true;
        setButtonIcon(fullscreenButton, 'fullscreenExit');
        setTimeout(function () { if (!isDestroyed) applyAspectRatio(); }, 120);
        showToast('⛶ Fullscreen');
        return;
      }

      fullscreenElement = document.createElement('div');
      fullscreenElement.style.cssText = 'position:fixed;inset:0;background:#000;z-index:2147483640;overflow:hidden';

      const inner = document.createElement('div');
      inner.style.cssText = 'position:absolute;inset:0;overflow:hidden';

      document.body.appendChild(fullscreenElement);
      fullscreenElement.appendChild(inner);
      inner.appendChild(video);
      fullscreenElement.appendChild(hostElement);
      hostElement.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:10';

      const requestFS = fullscreenElement.requestFullscreen || fullscreenElement.webkitRequestFullscreen;
      if (requestFS) requestFS.call(fullscreenElement).catch(() => {});

      isFullscreen = true;
      setButtonIcon(fullscreenButton, 'fullscreenExit');
      applyAspectRatio();
      showToast('⛶ Fullscreen');

      if (IS_MOBILE && screen.orientation && screen.orientation.lock) {
        const vw2 = video.videoWidth || 0;
        const vh2 = video.videoHeight || 0;
        if (vw2 > 0 && vh2 > 0) {
          screen.orientation.lock(vh2 > vw2 ? 'portrait' : 'landscape').catch(() => {});
        }
      }
    }

    function exitFullscreen() {
      if (!isFullscreen) return;
      isFullscreen = false;

      const exitFn = document.exitFullscreen || document.webkitExitFullscreen;
      if (exitFn) exitFn.call(document).catch(() => {});

      if (IS_MOBILE && screen.orientation && screen.orientation.unlock) {
        screen.orientation.unlock();
      }

      if (fullscreenElement) {
        try {
          if (savedVideoSibling && savedVideoSibling.parentNode === container) {
            container.insertBefore(video, savedVideoSibling);
          } else {
            container.appendChild(video);
          }
        } catch (e) {
          container.appendChild(video);
        }

        container.appendChild(hostElement);
        hostElement.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:2147483647;';
        fullscreenElement.remove();
        fullscreenElement = null;
        savedVideoSibling = null;
      }

      setButtonIcon(fullscreenButton, 'fullscreenEnter');
      applyAspectRatio();
      closeHUD();
    }

    function onFullscreenChange() {
      const activeFS = document.fullscreenElement || document.webkitFullscreenElement;

      // FLOATING-HOST fullscreen fix (mobile YouTube/Twitch/Facebook):
      // In native fullscreen the browser paints ONLY the fullscreen element and
      // its descendants. Our floating host lives under <html>, so it vanishes
      // (no overlay, no gestures, no controls). Re-parent the host INTO the
      // fullscreen element while FS is active, and move it back to <html> after.
      if (useFloatingHost) {
        try {
          if (activeFS) {
            if (hostElement.parentNode !== activeFS) activeFS.appendChild(hostElement);
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

      if (!activeFS && isFullscreen) exitFullscreen();
      // Player box size changes drastically on FS toggle — recompute AR a few times
      // (the browser/site lays out the video asynchronously after the event).
      if (aspectRatioIndex !== 0) {
        [60, 200, 500].forEach(function (d) { setTimeout(function () { if (!isDestroyed) applyAspectRatio(); }, d); });
      }
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

      // ─── STRATEGY 3: YouTube via MAIN-world bridge (desktop + mobile) ───
      // The page-world API isn't reachable synchronously here, so we fetch it
      // asynchronously and re-render the list when it arrives. Cache the result
      // so the synchronous render below can use it on subsequent calls.
      if (IS_YOUTUBE) {
        if (_ytQualityCache && _ytQualityCache.levels && _ytQualityCache.levels.length > 1) {
          qualityLevels = _ytQualityCache.levels.map(function (l) {
            return { label: (YT_QUALITY_MAP[l.id] || (l.height ? l.height + 'p' : l.id)), id: l.id,
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
              return { label: (l.label && /\d/.test(l.label)) ? l.label : (l.height + 'p'),
                       id: i, type: 'bridge-generic', height: l.height, kind: l.kind, isActive: false };
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
          // Fallback: progressive playable_url / playable_url_quality_hd
          if (fbQ.length < 2) {
            var reHd = /"playable_url_quality_hd"\s*:\s*"([^"]+)"/i;
            var reSd = /"playable_url"\s*:\s*"([^"]+)"/i;
            var hd = raw.match(reHd), sd = raw.match(reSd);
            function deesc(u){ return u.replace(/\\\//g,'/').replace(/\\u0026/gi,'&').replace(/\\u0025/gi,'%').replace(/\\/g,''); }
            if (hd) fbQ.push({ label: 'HD', height: 720, url: deesc(hd[1]) });
            if (sd) fbQ.push({ label: 'SD', height: 360, url: deesc(sd[1]) });
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

      // ─── NO QUALITIES FOUND — show current info ───
      if (qualityLevels.length <= 1) {
        var vw = video.videoWidth, vh = video.videoHeight;
        var infoEl = createElement('div', 'vm-quality-item');
        infoEl.style.opacity = '0.5';
        if (vw && vh) {
          var mx = Math.max(vw, vh);
          var ql = mx >= 2160 ? '4K' : mx >= 1440 ? '1440p' : mx >= 1080 ? '1080p' : mx >= 720 ? '720p' : mx >= 480 ? '480p' : 'SD';
          infoEl.textContent = ql + ' · ' + vw + '×' + vh;
          if (IS_YOUTUBE) infoEl.textContent += ' (use YT ⚙ for quality)';
        } else {
          infoEl.textContent = 'Quality managed by site';
        // Add yt-dlp hint
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
        qualityList.appendChild(infoEl);
        return;
      }

      // ─── RENDER QUALITY OPTIONS ───
      qualityLevels.forEach(function (lv) {
        var item = createElement('div', 'vm-quality-item' + (lv.isActive ? ' vm-selected' : ''));
        item.textContent = (lv.isActive ? '✓ ' : '') + lv.label;
        item.addEventListener('click', function () {
          if (lv.type === 'hls' && hlsInstance) {
            hlsInstance.currentLevel = lv.id;
          } else if (lv.type === 'youtube') {
            VMXBridge.call('yt-set-quality', lv.id, function(){});
            _ytQualityCache = null; // force refresh
          } else if (lv.type === 'source' || lv.type === 'manifest-hls') {
            if (lv.srcUrl) {
              var t = video.currentTime;
              // HLS variant playlists need hls.js in Chrome (no native HLS).
              if (/\.m3u8(\?|#|$)/i.test(lv.srcUrl) || lv.type === 'manifest-hls') {
                tryAttachHls(lv.srcUrl);
                video.addEventListener('loadedmetadata', function () {
                  try { video.currentTime = t; } catch (e) {} video.play().catch(function(){});
                }, { once: true });
              } else {
                video.src = lv.srcUrl; video.load();
                video.addEventListener('loadedmetadata', function () {
                  video.currentTime = t; video.play().catch(function(){});
                }, { once: true });
              }
            }
          } else if (lv.type === 'bridge-generic') {
            VMXBridge.call('generic-set-quality', lv.height, function(){});
            _genericQualityCache = null;
          } else if (lv.type === 'plyr') {
            try { var p = video.closest('.plyr'); var pi = p ? (p.__plyr || window.player) : null; if (pi) pi.quality = lv.id; } catch (e) {}
          } else if (lv.type === 'videojs') {
            try { var vl = video.player.qualityLevels(); for (var i = 0; i < vl.length; i++) vl[i].enabled = (i === lv.id); } catch (e) {}
          } else if (lv.type === 'jwplayer') {
            try { window.jwplayer().setCurrentQuality(lv.id); } catch (e) {}
          } else if (lv.type === 'open-url') {
            // Quality is a separate download/page URL (e.g. anime3rb) — open it.
            try { window.open(lv.srcUrl, '_blank', 'noopener'); } catch (e) {}
          } else if (lv.type === 'dom-quality' && lv.element) {
            try { lv.element.click(); } catch (e) {}
          } else if (lv.type === 'videotrack') {
            Array.from(video.videoTracks).forEach(function (t, i) { t.selected = (i === lv.id); });
          }
          showToast('🎬 ' + lv.label);
          qualityPanel.classList.remove('vm-visible');
          setTimeout(buildQualityOptions, 600);
        });
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
        fetch(url, { credentials: 'include' }).then(function (r) { return r.text(); }).then(function (text) {
          var cues = [];
          if (/^\s*</.test(text) && /<(text|p|tt)\b/i.test(text)) {
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
        if (file.name.toLowerCase().endsWith('.vtt')) {
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
      contextMenu.classList.remove('vm-visible');
      qualityPanel.classList.remove('vm-visible');
      subtitlePanel.classList.remove('vm-visible');
      filterPanel.classList.remove('vm-visible');
      statsPanel.classList.remove('vm-visible');
    }

    function openContextMenu(x, y) {
      buildSubtitleOptions();
      buildQualityOptions();
      const hudRect = hud.getBoundingClientRect();
      let cx = x - hudRect.left;
      let cy = y - hudRect.top;
      if (cx + 220 > hudRect.width) cx = hudRect.width - 225;
      if (cy + 350 > hudRect.height) cy = hudRect.height - 355;
      if (cx < 4) cx = 4;
      if (cy < 4) cy = 4;
      contextMenu.style.left = cx + 'px';
      contextMenu.style.top = cy + 'px';
      contextMenu.classList.add('vm-visible');
      qualityPanel.classList.remove('vm-visible');
      subtitlePanel.classList.remove('vm-visible');
      filterPanel.classList.remove('vm-visible');
      statsPanel.classList.remove('vm-visible');
    }

    function openSubPanel(parentPanel, triggerItem, targetPanel) {
      const parentRect = parentPanel.getBoundingClientRect();
      const hudRect = hud.getBoundingClientRect();
      let lx = parentRect.right - hudRect.left + 4;
      let ly = triggerItem.getBoundingClientRect().top - hudRect.top;
      if (lx + 200 > hudRect.width) lx = parentRect.left - hudRect.left - 200;
      if (ly + 200 > hudRect.height) ly = hudRect.height - 205;
      if (ly < 4) ly = 4;
      targetPanel.style.left = lx + 'px';
      targetPanel.style.top = ly + 'px';
      targetPanel.classList.add('vm-visible');
    }

    // More button
    moreButton.addEventListener('click', function (e) {
      e.stopPropagation();
      if (contextMenu.classList.contains('vm-visible')) {
        closeAllPanels();
        return;
      }
      const rect = moreButton.getBoundingClientRect();
      openContextMenu(rect.left, rect.bottom + 6);
    });

    // Click outside panels to close them
    shadowRoot.addEventListener('click', function (e) {
      if (!contextMenu.contains(e.target) && !moreButton.contains(e.target)) {
        contextMenu.classList.remove('vm-visible');
      }
      if (!qualityPanel.contains(e.target)) qualityPanel.classList.remove('vm-visible');
      if (!subtitlePanel.contains(e.target)) subtitlePanel.classList.remove('vm-visible');
      if (!filterPanel.contains(e.target)) filterPanel.classList.remove('vm-visible');
      if (!statsPanel.contains(e.target)) statsPanel.classList.remove('vm-visible');
    });

    // Menu item click handlers
    menuQuality.addEventListener('click', function (e) {
      e.stopPropagation();
      buildQualityOptions();
      openSubPanel(contextMenu, menuQuality, qualityPanel);
    });
    menuSubtitles.addEventListener('click', function (e) {
      e.stopPropagation();
      buildSubtitleOptions();
      openSubPanel(contextMenu, menuSubtitles, subtitlePanel);
    });
    menuFilters.addEventListener('click', function (e) {
      e.stopPropagation();
      openSubPanel(contextMenu, menuFilters, filterPanel);
    });
    menuStats.addEventListener('click', function (e) {
      e.stopPropagation();
      buildStatsDisplay();
      openSubPanel(contextMenu, menuStats, statsPanel);
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
      const url = video.currentSrc || video.src || location.href;
      if (navigator.clipboard) navigator.clipboard.writeText(url).catch(function(){});
      showToast('📋 URL Copied');
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
    menuPiP.addEventListener('click', function () { togglePiP(); closeAllPanels(); });
    menuDownload.addEventListener('click', function () {
      closeAllPanels();
      // Collect ALL possible video sources
      const src = video.currentSrc || video.src || '';
      const allSources = [];
      if (src) allSources.push(src);
      // Also check <source> children
      video.querySelectorAll('source').forEach(function (s) {
        const u = s.src || s.getAttribute('data-src') || '';
        if (u && !allSources.includes(u)) allSources.push(u);
      });
      // Check parent for sources too
      if (video.parentElement) {
        video.parentElement.querySelectorAll('source').forEach(function (s) {
          const u = s.src || s.getAttribute('data-src') || '';
          if (u && !allSources.includes(u)) allSources.push(u);
        });
      }
      if (allSources.length === 0) {
        showToast('⚠ No video source found');
        return;
      }
      showDownloadPanel(allSources[0], allSources);
    });

    // Ask the background service worker to use Chrome's native download engine.
    // Returns true if the message was dispatched.
    function downloadViaNative(url, filename, saveAs) {
      try {
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
          chrome.runtime.sendMessage({ type: 'vm_download', url: url, filename: filename, saveAs: !!saveAs }, function (res) {
            var err = chrome.runtime && chrome.runtime.lastError;
            if (err || !res || !res.ok) {
              // Native failed (e.g. blob/cross-origin restriction) → fallback chain
              downloadViaFetchBlob(url, filename);
            } else {
              showToast(saveAs ? '💾 Choose where to save…' : '✅ Download started');
            }
          });
          return true;
        }
      } catch (e) {}
      return false;
    }

    function downloadViaFetchBlob(url, filename) {
      showToast('⬇ Downloading…');
      fetch(url, { mode: 'cors' })
        .then(function (response) {
          if (!response.ok) throw new Error('Network response was not ok');
          return response.blob();
        })
        .then(function (blob) {
          const blobUrl = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = blobUrl;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(function () { URL.revokeObjectURL(blobUrl); }, 5000);
          showToast('✅ Download started!');
        })
        .catch(function () {
          // Fetch failed (CORS) — fall back to direct link
          downloadViaLink(url, filename);
        });
    }

    function downloadViaLink(url, filename) {
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
      return fetch(u, { credentials: 'include' }).then(function (r) {
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
      return fetch(url, { credentials: 'include' }).then(function (r) {
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
          keyReady = fetch(pl.keyUrl, { credentials: 'include' })
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
    function ytDlpCommand(u) { return 'yt-dlp -f "bv*+ba/b" "' + u + '"'; }

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

    // JDownloader exposes a local "click'n'load" endpoint on 127.0.0.1:9666.
    function tryJDownloader(url, cb) {
      var endpoint = 'http://127.0.0.1:9666/flash/add';
      var body = 'urls=' + encodeURIComponent(url);
      fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body, mode: 'no-cors' })
        .then(function () { showToast('📥 Sent to JDownloader'); cb && cb(true); })
        .catch(function () { cb && cb(false); });
    }

    function playInExternalPlayer(url) {
      if (IS_MOBILE) {
        try { window.location.href = 'intent:' + url + '#Intent;type=video/*;action=android.intent.action.VIEW;end'; return; }
        catch (e) {}
      }
      // Desktop: VLC protocol handler, then plain URL fallback.
      copyText(url, '📋 URL copied — opening external player');
      try { window.open('vlc://' + url, '_blank'); } catch (e) {}
      setTimeout(function () { try { window.open(url, '_blank'); } catch (e) {} }, 250);
    }

    function showDownloadPanel(url, allUrls) {
      // Remove any existing download panel
      const existing = shadowRoot.querySelector('.vm-download-panel');
      if (existing) existing.remove();

      const filename = 'videomax-' + Date.now() + '.mp4';

      // Create panel INSIDE overlay (not hud) so it's always visible
      const panel = createElement('div', 'vm-panel vm-download-panel vm-visible');
      panel.style.cssText = 'position:fixed;bottom:50%;left:50%;transform:translate(-50%,50%);z-index:2147483647;min-width:300px;max-width:90vw';

      const label = createElement('div', 'vm-panel-label', 'Download Video');
      panel.appendChild(label);

      // Show video URL preview
      const urlPreview = createElement('div', 'vm-panel-item');
      urlPreview.style.cssText = 'font-size:10px;color:var(--vm-gray);word-break:break-all;cursor:default;padding:4px 16px';
      urlPreview.textContent = url.length > 80 ? url.slice(0, 80) + '…' : url;
      panel.appendChild(urlPreview);
      panel.appendChild(createElement('div', 'vm-panel-separator'));

      // Option 1: Native browser download (Chrome downloads engine)
      const opt1 = createElement('div', 'vm-panel-item');
      opt1.textContent = '📥 Download (Browser)';
      opt1.addEventListener('click', function () {
        panel.remove();
        if (!downloadViaNative(url, filename, false)) downloadViaFetchBlob(url, filename);
      });
      panel.appendChild(opt1);

      // Option 2: Save As… (native picker)
      const opt2 = createElement('div', 'vm-panel-item');
      opt2.textContent = '💾 Save As… (choose folder)';
      opt2.addEventListener('click', function () {
        panel.remove();
        if (!downloadViaNative(url, filename, true)) downloadViaLink(url, filename);
      });
      panel.appendChild(opt2);

      // Option HLS: if a streaming manifest is detected, offer the powerful
      // segment-merging downloader (m3u8 → single .ts, AES-128 aware).
      var hlsManifest = null;
      if (isHlsUrl(url)) hlsManifest = url;
      else { var hm = (capturedManifests || []).filter(function (m) { return m.type === 'hls'; })[0]; if (hm) hlsManifest = hm.url; }
      if (hlsManifest) {
        const optHls = createElement('div', 'vm-panel-item');
        optHls.textContent = '🎞 Download Stream (HLS → merge)';
        optHls.style.color = 'var(--c)';
        optHls.addEventListener('click', function () {
          panel.remove();
          var th = 0; // honour preferred default height if numeric
          if (_lastQualityTarget && /^\d+$/.test(_lastQualityTarget)) th = parseInt(_lastQualityTarget, 10);
          startHlsDownload(hlsManifest, th, 'videomax-' + Date.now());
        });
        panel.appendChild(optHls);
      }

      // Option 2b: External download manager (1DM/IDM/ADM intent · JDownloader API)
      const optDM = createElement('div', 'vm-panel-item');
      optDM.textContent = '⬇ Send to Download Manager';
      optDM.addEventListener('click', function () {
        panel.remove();
        sendToExternalManager(url, filename);
      });
      panel.appendChild(optDM);

      // Option 2c: Play in external video player
      const optPlay = createElement('div', 'vm-panel-item');
      optPlay.textContent = '▶ Play in External Player (VLC/MX)';
      optPlay.addEventListener('click', function () {
        panel.remove();
        playInExternalPlayer(url);
      });
      panel.appendChild(optPlay);

      // Option 2d: yt-dlp command (works for YouTube + any site, all qualities)
      const optYtdlp = createElement('div', 'vm-panel-item');
      optYtdlp.textContent = '🧰 Copy yt-dlp command';
      optYtdlp.addEventListener('click', function () {
        panel.remove();
        copyText(ytDlpCommand(IS_YOUTUBE ? location.href : url), '📋 yt-dlp command copied — run in terminal');
      });
      panel.appendChild(optYtdlp);

      // Option 3: Open in new tab
      const opt3 = createElement('div', 'vm-panel-item');
      opt3.textContent = '🔗 Open in New Tab';
      opt3.addEventListener('click', function () {
        window.open(url, '_blank');
        showToast('🔗 Opened');
        panel.remove();
      });
      panel.appendChild(opt3);

      // Option 4: Copy URL
      const opt4 = createElement('div', 'vm-panel-item');
      opt4.textContent = '📋 Copy Video URL';
      opt4.addEventListener('click', function () {
        navigator.clipboard.writeText(url).then(function () {
          showToast('📋 Copied!');
        }).catch(function () {
          // Fallback
          const input = document.createElement('textarea');
          input.value = url;
          document.body.appendChild(input);
          input.select();
          document.execCommand('copy');
          document.body.removeChild(input);
          showToast('📋 Copied!');
        });
        panel.remove();
      });
      panel.appendChild(opt4);

      // Mobile-specific app targets (direct Android intents for each manager)
      if (IS_MOBILE) {
        panel.appendChild(createElement('div', 'vm-panel-separator'));
        panel.appendChild(createElement('div', 'vm-panel-label', 'Open With Android App'));

        var apps = [
          { t: '📲 MX / VLC / nPlayer', go: function () { window.location.href = 'intent:' + url + '#Intent;type=video/*;action=android.intent.action.VIEW;end'; } },
          { t: '⬇ 1DM',  go: function () { window.location.href = androidIntent(url, 'idm.internet.download.manager.plus', '1dmdownload', filename); } },
          { t: '⬇ IDM (idm.internet.download.manager)', go: function () { window.location.href = androidIntent(url, 'idm.internet.download.manager', 'idmdownload', filename); } },
          { t: '⬇ ADM (Advanced Download Manager)', go: function () { window.location.href = androidIntent(url, 'com.dv.adm', null, filename); } }
        ];
        apps.forEach(function (a) {
          var it = createElement('div', 'vm-panel-item');
          it.textContent = a.t;
          it.addEventListener('click', function () { panel.remove(); try { a.go(); } catch (e) { copyText(url); } });
          panel.appendChild(it);
        });
      }

      // Show ALL captured video URLs from network
      if (capturedVideoUrls.length > 0) {
        panel.appendChild(createElement('div', 'vm-panel-separator'));
        var netLabel = createElement('div', 'vm-panel-label', 'Detected Videos (' + capturedVideoUrls.length + ')');
        panel.appendChild(netLabel);

        // Sort by most recent first, limit to 15
        var sorted = capturedVideoUrls.slice().sort(function (a, b) { return b.time - a.time; }).slice(0, 15);
        sorted.forEach(function (vid) {
          var vItem = createElement('div', 'vm-panel-item');
          var labelParts = [];
          if (vid.label) labelParts.push(vid.label);
          labelParts.push(vid.format);
          // Shorten URL for display
          var shortUrl = vid.url.length > 50 ? '...' + vid.url.slice(-40) : vid.url;
          vItem.textContent = '🎬 ' + labelParts.join(' · ') + ' — ' + shortUrl;
          vItem.style.fontSize = '11px';
          vItem.addEventListener('click', function () {
            panel.remove();
            var _fn='video-'+(vid.label||'download')+'.'+(vid.format||'mp4').toLowerCase(); if(!downloadViaNative(vid.url,_fn,false)) downloadViaFetchBlob(vid.url,_fn);
          });
          panel.appendChild(vItem);
        });
      }

      // Show captured streaming manifests
      if (capturedManifests.length > 0) {
        panel.appendChild(createElement('div', 'vm-panel-separator'));
        var mLabel = createElement('div', 'vm-panel-label', 'Streams (' + capturedManifests.length + ')');
        panel.appendChild(mLabel);
        capturedManifests.slice(0, 5).forEach(function (m) {
          var mItem = createElement('div', 'vm-panel-item');
          var dlable = (m.type === 'hls');
          mItem.textContent = (m.type === 'hls' ? '🎞 HLS' : '📡 DASH') + (dlable ? ' (download)' : ' (copy)') + ' — ' + (m.url.length > 42 ? '...' + m.url.slice(-34) : m.url);
          mItem.style.fontSize = '11px';
          mItem.addEventListener('click', function () {
            panel.remove();
            if (dlable) {
              var th = (_lastQualityTarget && /^\d+$/.test(_lastQualityTarget)) ? parseInt(_lastQualityTarget, 10) : 0;
              startHlsDownload(m.url, th, 'videomax-' + Date.now());
            } else {
              copyText(m.url, '📋 DASH URL copied — use yt-dlp/ffmpeg');
            }
          });
          panel.appendChild(mItem);
        });
      }

      // If multiple sources available, show them
      if (allUrls && allUrls.length > 1) {
        panel.appendChild(createElement('div', 'vm-panel-separator'));
        const srcLabel = createElement('div', 'vm-panel-label', 'All Sources (' + allUrls.length + ')');
        panel.appendChild(srcLabel);
        allUrls.forEach(function (u, i) {
          const srcItem = createElement('div', 'vm-panel-item');
          const resMatch = u.match(/(\d{3,4})[pP]/) || [];
          srcItem.textContent = '🎬 ' + (resMatch[1] ? resMatch[1] + 'p' : 'Source ' + (i + 1));
          srcItem.addEventListener('click', function () {
            panel.remove();
            var _fn2='videomax-'+(resMatch[1]||i)+'-'+Date.now()+'.mp4'; if(!downloadViaNative(u,_fn2,false)) downloadViaFetchBlob(u,_fn2);
          });
          panel.appendChild(srcItem);
        });
      }

      // Cancel
      panel.appendChild(createElement('div', 'vm-panel-separator'));
      const cancelBtn = createElement('div', 'vm-panel-item');
      cancelBtn.textContent = '✕ Close';
      cancelBtn.style.cssText = 'color:var(--vm-gray);text-align:center;justify-content:center';
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
    // [P13] Cinema Mode - dims the entire page except the video
    var cinemaOverlay = null;
    menuFullscreen.addEventListener('click', function () {
      closeAllPanels();
      if (isFullscreen) exitFullscreen();
      else enterFullscreen();
    });
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
    menuCinema.addEventListener('click', function () {
      closeAllPanels();
      if (cinemaOverlay) {
        cinemaOverlay.remove();
        cinemaOverlay = null;
        showToast('Cinema Mode Off');
        return;
      }
      cinemaOverlay = document.createElement('div');
      cinemaOverlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:2147483600;pointer-events:none;transition:opacity 0.4s';
      cinemaOverlay.id = 'vm-cinema-overlay';
      document.body.appendChild(cinemaOverlay);
      // Make the video container visible above cinema overlay
      container.style.setProperty('position', 'relative', 'important');
      container.style.setProperty('z-index', '2147483601', 'important');
      showToast('🎬 Cinema Mode');
    });
    menuAudioBoost.addEventListener('click', function () {
      audioBoostLevel = audioBoostLevel >= 6 ? 1 : audioBoostLevel + 0.5;
      const boost = getOrCreateAudioBoost(video);
      if (boost) boost.gain.gain.value = audioBoostLevel;
      showToast('🔊 Boost: ' + audioBoostLevel + '×');
      closeAllPanels();
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
          setTimeout(function () { applyPreferredQuality(d.quality); }, force ? 0 : 800);
          // retry once for late-initialising players
          setTimeout(function () { applyPreferredQuality(d.quality); }, force ? 1200 : 2500);
        } else if (force && d.quality === 'auto') {
          applyPreferredQuality('auto');
        }
        // ─── Auto subtitles ───
        if (d.subs) {
          setTimeout(function () { if (activeSubtitleIndex === -1) toggleSubtitles(); }, force ? 0 : 1000);
        }
        // ─── Cinema mode ───
        if (d.cinema) {
          setTimeout(function () {
            if (!cinemaOverlay) {
              cinemaOverlay = document.createElement('div');
              cinemaOverlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:2147483600;pointer-events:none;transition:opacity .4s';
              document.body.appendChild(cinemaOverlay);
              container.style.setProperty('position', 'relative', 'important');
              container.style.setProperty('z-index', '2147483601', 'important');
            }
          }, force ? 0 : 500);
        } else if (force && cinemaOverlay) {
          cinemaOverlay.remove(); cinemaOverlay = null;
        }
        if (force) showToast('✓ Settings applied');
      } catch (e) {}
    }

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
          applyDefaults(r && r.vm_defaults, false);
        });
      } catch (e) {}
    }

    function openHUD() {
      hud.classList.add('vm-active');
      isHudVisible = true;
      loadPopupDefaults();
      entryWrapper.style.display = 'none';
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
      if (!isDismissed) { entryWrapper.style.display = ''; if (typeof scheduleEntryIdle === 'function') scheduleEntryIdle(); }
      closeAllPanels();
      hud.classList.remove('vm-controls-hidden');
      stopProgressLoop();
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
      if (progressRAF) return;
      progressRAF = requestAnimationFrame(progressAnimationLoop);
    }

    function stopProgressLoop() {
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

    // Global mouse events for seek dragging
    document.addEventListener('mousemove', function (e) {
      if (isSeekDragging) seekToPosition(e.clientX);
    });
    document.addEventListener('mouseup', function () {
      isSeekDragging = false;
      seekContainer.classList.remove('vm-dragging');
    });


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

    entryButton.addEventListener('click', function (e) { stopEvent(e); openHUD(); });
    closeButton.addEventListener('click', function (e) { stopEvent(e); closeHUD(); });
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

    subtitleButton.addEventListener('click', function (e) { stopEvent(e); toggleSubtitles(); });
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
      applyAspectRatio();
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
      Store.set(getPreferenceKey(), {
        arIdx: aspectRatioIndex,
        rot: rotationDeg,
        rotScreen: screenRotIndex,
        zoom: zoomLevel,
        bright: brightnessLevel,
        spdIdx: speedIndex,
        filters: videoFilters,
        mirror: isMirrored,
        boost: audioBoostLevel,
      });
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
    video.addEventListener('timeupdate', updateProgress);
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
          if (q && q !== 'auto') { setTimeout(function(){ applyPreferredQuality(q); }, 1200); }
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

    // Title sync
    function syncPageTitle() {
      const title = document.title || '';
      videoTitle.textContent = title.length > 45 ? title.slice(0, 45) + '…' : title;
    }
    syncPageTitle();
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
     *  TOUCH GESTURES (Mobile / Android)
     *
     *  [AND-1] Wider center zone on mobile (28% edges)
     *  [AND-2] 450ms long-press threshold
     * ═══════════════════════════════════════════════════ */
    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartTime = 0;
    let isSwipeActive = false;
    let swipeAxis = null;
    let swipeStartY = 0;
    let swipeStartValue = 0;
    let lastDoubleTap = { time: 0, zone: '' };
    let centerTapTimer = null;
    let pinchStartDist = 0;
    let pinchStartZoom = 1;
    let isPinching = false;
    let isLongPress = false;
    let longPressTimeout = null;

    // [AND-1] Zone detection with wider center on mobile
    function detectTouchZone(clientX) {
      const rect = touchZones.getBoundingClientRect();
      const relativeX = clientX - rect.left;
      const width = rect.width;
      const edgePercent = IS_MOBILE ? 0.28 : 0.32;
      if (relativeX < width * edgePercent) return 'left';
      if (relativeX > width * (1 - edgePercent)) return 'right';
      return 'center';
    }

    touchZones.addEventListener('touchstart', function (e) {
      e.stopPropagation();
      if (!isHoldActive) resetAutoHide();

      // Pinch to zoom
      if (e.touches.length === 2) {
        isPinching = true;
        pinchStartDist = pinchDistance(e.touches);
        pinchStartZoom = zoomLevel;
        clearTimeout(longPressTimeout);
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
      isLongPress = false;
      holdStartX = touch.clientX;

      clearTimeout(longPressTimeout);
      longPressTimeout = setTimeout(function () {
        speedBeforeHold = video.playbackRate;
        isLongPress = true;
        holdBaseSpeed = 2;
        video.playbackRate = 2;
        updateHoldBadge('2.0×', 'HOLD · drag ←→');
        holdBadge.classList.add('vm-visible');
        // Force hide ALL controls during hold
        clearTimeout(autoHideTimeout);
        hud.classList.add('vm-controls-hidden');
      }, 450);
    }, { passive: true });

    touchZones.addEventListener('touchmove', function (e) {
      e.stopPropagation();
      if (!isHoldActive && !isLongPress) resetAutoHide();

      // Pinch zoom
      if (isPinching && e.touches.length === 2) {
        const newDist = pinchDistance(e.touches);
        zoomLevel = clamp(parseFloat((pinchStartZoom * (newDist / pinchStartDist)).toFixed(2)), 0.3, 4);
        applyAspectRatio();
        badgeZoom.textContent = Math.round(zoomLevel * 100) + '%';
        showBadge('zoom', badgeZoom);
        return;
      }

      const touch = e.touches[0];
      const dx = touch.clientX - touchStartX;
      const dy = touch.clientY - touchStartY;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      // Long press speed control
      if (isLongPress) {
        clearTimeout(longPressTimeout);
        const drift = touch.clientX - holdStartX;
        const steps = Math.round(drift / HOLD_PIXELS_PER_STEP);
        const newSpeed = clamp(parseFloat((holdBaseSpeed + steps * 0.1).toFixed(1)), 0.25, 6);
        video.playbackRate = newSpeed;
        updateHoldBadge(newSpeed.toFixed(1) + '×', drift >= 0 ? '→ faster' : '← slower');
        return;
      }

      // Cancel long press on significant movement
      if (absDx > 10 || absDy > 10) {
        clearTimeout(longPressTimeout);
        longPressTimeout = null;
      }

      // Detect swipe axis — Android-style: low threshold, instant response
      if (!isSwipeActive) {
        // Horizontal (seek) needs a clearly horizontal motion
        if (absDx > 12 && absDx > absDy * 1.4) {
          isSwipeActive = true;
          swipeAxis = 'horizontal';
        } else if (absDy > 8 && absDy >= absDx) {
          // Vertical → brightness (left half) or volume (right half)
          isSwipeActive = true;
          const zone = detectTouchZone(touch.clientX);
          swipeAxis = zone === 'right' ? 'volume' : 'brightness';
          // Re-anchor at the point gesture is recognised for 1:1 feel
          swipeStartY = touch.clientY;
          if (swipeAxis === 'volume') {
            swipeStartValue = video.muted ? 0 : (audioBoostLevel > 1 ? audioBoostLevel : video.volume);
          } else {
            swipeStartValue = brightnessLevel;
          }
          haptic(8); // subtle tick like Android when control engages
        }
      }

      // Handle active swipe
      if (isSwipeActive) {
        if (swipeAxis === 'horizontal') {
          showScrubPreview(
            clamp(video.currentTime + dx / SEEK_PIXELS_PER_SEC, 0, video.duration || 0),
            dx / SEEK_PIXELS_PER_SEC
          );
        } else if (swipeAxis === 'volume') {
          // ANDROID-LIKE: full-height swipe of the zone = 0%→100%.
          // Travel beyond 100% (continuing up) maps into 100–600% boost.
          var zoneH = touchZones.getBoundingClientRect().height || window.innerHeight;
          var deltaUp = (swipeStartY - touch.clientY) / zoneH; // +1 = swiped a full screen up
          var rawVol;
          if (swipeStartValue <= 1.0) {
            rawVol = swipeStartValue + deltaUp;           // 1:1 within 0–100%
            if (rawVol > 1.0) rawVol = 1.0 + (rawVol - 1.0) * 5; // overshoot → boost
          } else {
            rawVol = swipeStartValue + deltaUp * 5;       // already boosted
          }
          rawVol = clamp(rawVol, 0, 6.0);
          isUserMuted = (rawVol === 0);
          // Safe volume path (element volume ≤100%, Web Audio only for boost)
          var boosting = setVideoVolume(video, rawVol, null);
          audioBoostLevel = boosting ? rawVol : 1;
          if (volumeSlider) volumeSlider.value = Math.min(rawVol, 3);
          var vPct = Math.round(rawVol * 100);
          var vIcon = rawVol > 1 ? '🔊+' : rawVol > 0.5 ? '🔊' : rawVol > 0 ? '🔉' : '🔇';
          // Side bar normalised: 0–100% fills the bar; boost shown in label
          showSideBar('right', Math.min(rawVol, 1), vIcon + ' ' + vPct + '%');
          updateMuteIcon();
        } else if (swipeAxis === 'brightness') {
          // ANDROID-LIKE: full-height swipe = dark(10%) ↔ bright(200%), 1:1 feel
          var zoneH2 = touchZones.getBoundingClientRect().height || window.innerHeight;
          var deltaUpB = (swipeStartY - touch.clientY) / zoneH2;
          // Map a full swipe (1.0) to the whole 0.1–2.0 range (~1.9 span)
          brightnessLevel = clamp(swipeStartValue + deltaUpB * 1.9, 0.1, 2.0);
          applyBrightness();
          var bPct = Math.round(brightnessLevel * 100);
          var bIcon = brightnessLevel > 1.05 ? '☀️' : brightnessLevel < 0.5 ? '🌙' : '🔅';
          // Side bar: normalise 0.1–2.0 → 0–1
          showSideBar('left', (brightnessLevel - 0.1) / 1.9, bIcon + ' ' + bPct + '%');
        }
      }
    }, { passive: true });

    touchZones.addEventListener('touchend', function (e) {
      e.stopPropagation();
      clearTimeout(longPressTimeout);
      longPressTimeout = null;

      // End pinch
      if (isPinching) {
        isPinching = false;
        savePreferences();
        return;
      }

      // End long press — restore saved speed
      if (isLongPress) {
        isLongPress = false;
        video.playbackRate = speedBeforeHold;
        holdBadge.classList.remove('vm-visible');
        showToast(round1(speedBeforeHold) + '× Restored');
        exitHoldMode();
        savePreferences();
        return;
      }

      // End horizontal swipe (seek)
      if (isSwipeActive && swipeAxis === 'horizontal') {
        const touch = e.changedTouches[0];
        const dx = touch.clientX - touchStartX;
        video.currentTime = clamp(
          video.currentTime + dx / SEEK_PIXELS_PER_SEC,
          0, video.duration || 0
        );
        updateProgress();
        scrubOverlay.classList.remove('vm-visible');
        isSwipeActive = false;
        return;
      }

      // End other swipes
      if (isSwipeActive) {
        isSwipeActive = false;
        savePreferences();
        return;
      }

      // Tap detection
      const touch = e.changedTouches[0];
      const tapDuration = Date.now() - touchStartTime;
      const movement = Math.abs(touch.clientX - touchStartX) + Math.abs(touch.clientY - touchStartY);
      if (movement > 18 || tapDuration > 400) return;

      const zone = detectTouchZone(touch.clientX);
      const zonesRect = touchZones.getBoundingClientRect();
      const rippleX = touch.clientX - zonesRect.left;
      const rippleY = touch.clientY - zonesRect.top;
      const now = Date.now();

      if (zone === 'center') {
        // Double-tap center = play/pause
        if (now - lastDoubleTap.time < 300 && lastDoubleTap.zone === 'center') {
          lastDoubleTap = { time: 0, zone: '' };
          if (video.paused) { video.play(); showToast('▶'); }
          else { video.pause(); showToast('⏸'); }
          createRippleEffect(rippleX, rippleY);
          // Cancel the pending single-tap toggle
          clearTimeout(centerTapTimer);
          centerTapTimer = null;
        } else {
          lastDoubleTap = { time: now, zone: 'center' };
          // Single tap center = IMMEDIATE toggle (no delay for user)
          // But wait just 300ms to check for double-tap first
          clearTimeout(centerTapTimer);
          centerTapTimer = setTimeout(function () {
            if (lastDoubleTap.zone === 'center' && lastDoubleTap.time === now) {
              lastDoubleTap = { time: 0, zone: '' };
              // Toggle controls immediately
              if (hud.classList.contains('vm-controls-hidden')) {
                hud.classList.remove('vm-controls-hidden');
                clearTimeout(autoHideTimeout);
                // NO auto-hide — user taps again to hide
              } else {
                clearTimeout(autoHideTimeout);
                hud.classList.add('vm-controls-hidden');
              }
            }
            centerTapTimer = null;
          }, 300);
        }
        return;
      }

      // Double-tap left/right = seek ±10s
      if (now - lastDoubleTap.time < 350 && lastDoubleTap.zone === zone) {
        lastDoubleTap = { time: 0, zone: '' };
        if (zone === 'left') {
          video.currentTime = Math.max(0, video.currentTime - 10);
          createRippleEffect(rippleX, rippleY);
          flashDoubleTapIndicator('left');
          showToast('⏪ −10s');
        } else if (zone === 'right') {
          video.currentTime = Math.min(video.duration || 0, video.currentTime + 10);
          createRippleEffect(rippleX, rippleY);
          flashDoubleTapIndicator('right');
          showToast('⏩ +10s');
        }
      } else {
        lastDoubleTap = { time: now, zone: zone };
      }
    }, { passive: true });

    touchZones.addEventListener('touchcancel', function (e) {
      e.stopPropagation();
      clearTimeout(longPressTimeout);
      longPressTimeout = null;
      if (isLongPress) {
        isLongPress = false;
        video.playbackRate = speedBeforeHold;
        holdBadge.classList.remove('vm-visible');
        exitHoldMode();
      }
      isPinching = false;
      isSwipeActive = false;
      scrubOverlay.classList.remove('vm-visible');
    }, { passive: true });

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
          enableWorker: false,
          lowLatencyMode: true,
          backBufferLength: 90,
          maxBufferSize: 60 * 1000 * 1000,
          fragLoadingMaxRetry: 5,
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
      try { subtitleFileInput.remove(); } catch (e) { /* ignore */ }
      if (cinemaOverlay) { try { cinemaOverlay.remove(); } catch (e) {} cinemaOverlay = null; }
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

    instanceMap.set(video, { host: hostElement, shadow: shadowRoot, applyAR: applyAspectRatio, destroy: destroyPlayer, restore: restoreNativePlayer });

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
    if (depth > 12) return out;          // safety guard
    try {
      // Direct videos in this root
      (root.querySelectorAll ? root.querySelectorAll('video') : []).forEach(function (v) {
        if (out.indexOf(v) === -1) out.push(v);
      });
      // Pierce open shadow roots
      var hosts = root.querySelectorAll ? root.querySelectorAll('*') : [];
      for (var i = 0; i < hosts.length; i++) {
        var sr = hosts[i].shadowRoot;
        if (sr) collectAllVideos(sr, out, depth + 1);
      }
    } catch (e) {}
    return out;
  }

  function tryAttach(v) {
    if (!v || processedVideos.has(v) || !v.isConnected) return;
    // Accept slightly smaller players; some sites start tiny then grow.
    if (v.clientWidth > 40 || v.clientHeight > 40 || v.videoWidth > 0 || v.readyState >= 1) {
      attachPlayer(v);
    }
  }

  function scanForVideos() {
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

  // Initial scan
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scanForVideos);
  } else {
    scanForVideos();
  }

  // Delayed scans for lazy-loaded videos
  [500, 1500, 3000, 6000].forEach(function (delay) {
    setTimeout(scanForVideos, delay);
  });

  // SPA navigation support
  const originalPushState = history.pushState.bind(history);
  const originalReplaceState = history.replaceState.bind(history);

  history.pushState = function () {
    originalPushState.apply(history, arguments);
    setTimeout(scanForVideos, 700);
  };
  history.replaceState = function () {
    originalReplaceState.apply(history, arguments);
    setTimeout(scanForVideos, 700);
  };
  window.addEventListener('popstate', function () {
    setTimeout(scanForVideos, 700);
  });

})();

  /* ====================== END EXTENSION content.js ====================== */

})();
