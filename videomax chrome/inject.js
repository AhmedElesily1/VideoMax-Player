/* VideoMax Pro — MAIN-world bridge.
 * Content scripts run in an ISOLATED world and cannot call page-defined
 * player APIs (YouTube's movie_player.getAvailableQualityLevels(), video.js,
 * JW Player, Plyr, hls.js instances on window, etc.). This file is injected
 * into the PAGE world so it CAN, and talks to the content script via
 * window.postMessage with the namespace "__VMX__".
 */
(function () {
  'use strict';
  if (window.__VMX_BRIDGE__) return;
  window.__VMX_BRIDGE__ = true;

  var NS = '__VMX__';

  function send(id, ok, data) {
    try { window.postMessage({ __vmx: true, dir: 'res', id: id, ok: ok, data: data }, '*'); } catch (e) {}
  }

  /* ═══════════════════════════════════════════════════════════════
   *  MAIN-WORLD NETWORK SNIFFER
   *  The content script (isolated world) cannot see fetch/XHR made by the
   *  page. Here in the page world we lightly wrap fetch & XMLHttpRequest to
   *  capture media manifest/stream URLs (m3u8/mpd/mp4…) and forward them to
   *  the content script. This replaces the webRequest permission entirely —
   *  no extra permissions, works on Twitch / Facebook / cross-origin iframes.
   * ═══════════════════════════════════════════════════════════════ */
  function vmxClassify(u) {
    if (!u || typeof u !== 'string') return null;
    // Thumbnail preview VTT tracks are NOT subtitles — ignore them.
    if (/thumbnail|sprite|storyboard|preview/i.test(u) && /\.vtt/i.test(u)) return null;
    // Subtitles / captions first (some end in query strings)
    if (/\.vtt(\?|#|$)/i.test(u) || /\.srt(\?|#|$)/i.test(u) || /\.(ass|ssa|ttml|dfxp|xml)(\?|#|$)/i.test(u) && /(sub|caption|text|timedtext|cc)/i.test(u)) return 'sub';
    if (/\/api\/timedtext|youtube\.com\/api\/timedtext|timedtext\?/i.test(u)) return 'sub';
    if (/\.m3u8(\?|#|$)/i.test(u) || /\/hls\//i.test(u) || /[?&]format=m3u8/i.test(u) || /mime=application%2Fvnd\.apple/i.test(u)) return 'hls';
    // Twitch master/variant playlists are extensionless: *.ttvnw.net/v1/playlist/…
    if (/\.ttvnw\.net\/.*\/(?:playlist|api\/channel\/hls)/i.test(u) || /usher\.ttvnw\.net/i.test(u)) return 'hls';
    if (/\.mpd(\?|#|$)/i.test(u) || /\/dash\//i.test(u) || /dash_manifest/i.test(u) || /DASHPlaylist/i.test(u)) return 'dash';
    if (/\.(mp4|webm|mkv|m4v|mov)(\?|#|$)/i.test(u)) return 'file';
    if (/googlevideo\.com\/videoplayback/i.test(u)) return 'file';
    // Extensionless progressive video endpoints (wco.tv / wcostream getvid, etc.)
    if (/\/getvid\?|\/getvidlink|[?&]evid=/i.test(u)) return 'file';
    // Reddit CMAF media (v.redd.it/<id>/CMAF_<h>.mp4 handled by .mp4 above)
    return null;
  }
  var vmxSeen = Object.create(null);
  function vmxReport(u) {
    try {
      if (!u) return;
      var abs = u; try { abs = new URL(u, location.href).href; } catch (e) {}
      var t = vmxClassify(abs);
      if (!t) return;
      if (vmxSeen[abs]) return; vmxSeen[abs] = 1;
      var dir = (t === 'sub') ? 'subtrack' : 'media';
      window.postMessage({ __vmx: true, dir: dir, url: abs, mtype: t }, '*');
    } catch (e) {}
  }

  /* IMPORTANT: On YouTube/Google we DO NOT touch fetch/XHR/MediaSource.
   * YouTube's player is extremely sensitive to prototype patching and will show
   * a BLACK SCREEN if its media pipeline is wrapped. On YT we rely solely on the
   * player-API bridge (getAvailableQualityLevels / captions) below, which is
   * safe. The network sniffer is only for OTHER sites. */
  var isYouTube = false;
  try {
    if (/youtube|googlevideo|ytimg/i.test(location.hostname)) isYouTube = true;
    else if (window.top && window.top !== window) {
      try { if (/youtube|googlevideo|ytimg/i.test(window.top.location.hostname)) isYouTube = true; } catch (e) {}
    }
  } catch (e) {}
  try { if (window.yt || window.ytplayer || document.querySelector('ytd-app, ytm-app')) isYouTube = true; } catch (e) {}
  var VMX_SKIP_NET_HOOKS = isYouTube;

  if (!VMX_SKIP_NET_HOOKS) {
    try {
      var _fetch = window.fetch;
      if (_fetch && !_fetch.__vmx) {
        window.fetch = function (input, init) {
          try { vmxReport(typeof input === 'string' ? input : (input && input.url)); } catch (e) {}
          return _fetch.apply(this, arguments);
        };
        window.fetch.__vmx = true;
        // Mask as native so sites' anti-tamper checks don't flag us.
        try { window.fetch.toString = function () { return 'function fetch() { [native code] }'; }; } catch (e) {}
      }
    } catch (e) {}

    try {
      var _open = XMLHttpRequest.prototype.open;
      if (_open && !_open.__vmx) {
        XMLHttpRequest.prototype.open = function (method, url) {
          try { vmxReport(url); } catch (e) {}
          return _open.apply(this, arguments);
        };
        XMLHttpRequest.prototype.open.__vmx = true;
        try { XMLHttpRequest.prototype.open.toString = function () { return 'function open() { [native code] }'; }; } catch (e) {}
      }
    } catch (e) {}

    /* ═══ MSE DETECTION (non-YouTube only) ═══
     * Flags sites using Media Source Extensions (blob: video). We only READ the
     * mime string and pass the call straight through — but even a pass-through
     * wrapper is risky on YT, hence it is skipped there. */
    try {
      if (window.MediaSource && MediaSource.prototype && !MediaSource.prototype.__vmx) {
        var _addSB = MediaSource.prototype.addSourceBuffer;
        MediaSource.prototype.addSourceBuffer = function (mime) {
          try { window.postMessage({ __vmx: true, dir: 'mse', mime: String(mime || '') }, '*'); } catch (e) {}
          return _addSB.apply(this, arguments);
        };
        MediaSource.prototype.__vmx = true;
      }
    } catch (e) {}
  }

  // ── Find a YouTube player element (desktop OR mobile) ──
  // Desktop: #movie_player / .html5-video-player
  // Mobile (m.youtube.com): the player object carries class "_msc" and the
  // YT API methods (getAvailableQualityLevels, etc.) live on that element.
  function ytHasApi(el) {
    return el && typeof el.getAvailableQualityLevels === 'function';
  }
  function ytPlayer() {
    // Desktop
    var p = document.getElementById('movie_player');
    if (ytHasApi(p)) return p;
    // Mobile m.youtube.com — the player object carries class "_msc"
    var msc = document.getElementsByClassName('_msc');
    for (var m = 0; m < msc.length; m++) { if (ytHasApi(msc[m])) return msc[m]; }
    // Generic desktop/mobile player wrappers
    p = document.querySelector('.html5-video-player') || document.querySelector('#player-container .html5-video-player');
    if (ytHasApi(p)) return p;
    // Last resort: scan wide for any element exposing the YT API.
    var cands = document.querySelectorAll('._msc, .html5-video-player, [class*="player"], ytd-player, ytm-app');
    for (var i = 0; i < cands.length; i++) { if (ytHasApi(cands[i])) return cands[i]; }
    // Walk up from the <video> element.
    var v = document.querySelector('video');
    var node = v;
    while (node) { if (ytHasApi(node)) return node; node = node.parentElement; }
    return null;
  }

  var YT_H = { highres:4320, hd2880:2880, hd2160:2160, hd1440:1440, hd1080:1080, hd720:720, large:480, medium:360, small:240, tiny:144 };

  function ytGetQualities() {
    var p = ytPlayer();
    if (!p || typeof p.getAvailableQualityLevels !== 'function') return null;
    var levels = p.getAvailableQualityLevels() || [];
    var cur = '';
    try { cur = (typeof p.getPlaybackQuality === 'function') ? p.getPlaybackQuality() : ''; } catch (e) {}
    return {
      cur: cur,
      levels: levels.map(function (q) { return { id: q, height: YT_H[q] || 0 }; })
    };
  }

  function ytSetQuality(q) {
    var p = ytPlayer();
    if (!p) return false;
    // Desktop path (works directly).
    try { if (typeof p.setPlaybackQualityRange === 'function') p.setPlaybackQualityRange(q, q); } catch (e) {}
    try { if (typeof p.setPlaybackQuality === 'function') p.setPlaybackQuality(q); } catch (e) {}

    // Mobile path: YouTube ignores setPlaybackQuality on m.youtube.com. The
    // reliable trick (from android-youtube-player) is to write the desired
    // quality into localStorage["yt-player-quality"], then reload the video
    // in place so the player re-reads it.
    var isMobile = !document.getElementById('movie_player');
    if (isMobile && q && q !== 'auto') {
      try {
        var now = Date.now();
        localStorage.setItem('yt-player-quality', JSON.stringify({
          data: q, creation: now, expiration: now + 30 * 24 * 3600 * 1000
        }));
      } catch (e) {}
      // Reload current video at same time so the new quality applies.
      try {
        if (typeof p.getVideoData === 'function' && typeof p.loadVideoById === 'function') {
          var vd = p.getVideoData() || {};
          var t = (typeof p.getCurrentTime === 'function') ? p.getCurrentTime() : 0;
          if (vd.video_id) p.loadVideoById(vd.video_id, t, q);
        }
      } catch (e) {}
    } else if (isMobile && q === 'auto') {
      try { localStorage.removeItem('yt-player-quality'); } catch (e) {}
    }
    return true;
  }

  function ytGetCaptions() {
    var p = ytPlayer();
    // 1) Official captions module (works once CC module is loaded)
    if (p && typeof p.getOption === 'function') {
      try {
        var list = p.getOption('captions', 'tracklist') || p.getOption('cc', 'tracklist');
        if (list && list.length) {
          return list.map(function (t, i) {
            return { i: i, name: t.displayName || t.languageName || t.languageCode || ('Track ' + (i + 1)), code: t.languageCode || '' };
          }).filter(function (x) { return x.name; });
        }
      } catch (e) {}
    }
    // 2) Fallback: read captionTracks from the player response / ytInitialPlayerResponse
    try {
      var resp = null;
      if (p && typeof p.getPlayerResponse === 'function') { try { resp = p.getPlayerResponse(); } catch (e) {} }
      if (!resp && window.ytInitialPlayerResponse) resp = window.ytInitialPlayerResponse;
      var tracks = resp && resp.captions && resp.captions.playerCaptionsTracklistRenderer &&
                   resp.captions.playerCaptionsTracklistRenderer.captionTracks;
      if (tracks && tracks.length) {
        return tracks.map(function (t, i) {
          var nm = (t.name && (t.name.simpleText || (t.name.runs && t.name.runs[0] && t.name.runs[0].text))) || t.languageCode || ('Track ' + (i + 1));
          return { i: i, name: nm, code: t.languageCode || '', url: t.baseUrl || '' };
        });
      }
    } catch (e) {}
    return null;
  }

  function ytSetCaption(i) {
    var p = ytPlayer();
    if (!p) return false;
    // Ensure the captions module is loaded first (needed for getOption/setOption).
    try { if (typeof p.loadModule === 'function') p.loadModule('captions'); } catch (e) {}
    if (typeof p.getOption === 'function' && typeof p.setOption === 'function') {
      try {
        if (i < 0) { p.setOption('captions', 'track', {}); return true; }
        var list = p.getOption('captions', 'tracklist') || p.getOption('cc', 'tracklist') || [];
        if (list && list[i]) {
          p.setOption('captions', 'track', list[i]);
          try { p.setOption('captions', 'reload', true); } catch (e) {}
          return true;
        }
        // If tracklist not ready yet, at least toggle CC on with default track.
        p.setOption('captions', 'track', {});
      } catch (e) {}
    }
    // Fallback: click the native CC button (desktop) to toggle captions on.
    try {
      var btn = document.querySelector('.ytp-subtitles-button, button.ytp-subtitles-button');
      if (btn) { btn.click(); return true; }
    } catch (e) {}
    return false;
  }

  // ── Generic non-YouTube player detection (page world) ──
  function genericGetQualities() {
    var out = [];
    // video.js — quality-levels plugin
    try {
      if (window.videojs && document.querySelector('.video-js')) {
        var players = (window.videojs.getAllPlayers && window.videojs.getAllPlayers()) || [];
        players.forEach(function (pl) {
          try {
            if (pl && pl.qualityLevels) {
              var ql = pl.qualityLevels();
              for (var i = 0; i < ql.length; i++) if (ql[i].height) out.push({ height: ql[i].height, kind: 'videojs-ql' });
            }
          } catch (e) {}
          // video.js — sources array (vid3rb/anime3rb style: {src,label/res/type})
          try {
            var srcs = [];
            if (pl.currentSources) srcs = pl.currentSources() || [];
            if ((!srcs || !srcs.length) && pl.options_ && pl.options_.sources) srcs = pl.options_.sources;
            (srcs || []).forEach(function (s) {
              var lab = s.label || s.res || s.quality || s.name || '';
              var m = String(lab).match(/(\d{3,4})/) || String(s.src || '').match(/(\d{3,4})p\b/i);
              var h = m ? parseInt(m[1], 10) : 0;
              if (h && s.src) out.push({ height: h, url: s.src, kind: 'videojs-src' });
            });
          } catch (e) {}
        });
      }
    } catch (e) {}
    // hls.js instance commonly on window.hls
    try {
      var h = window.hls || (window.Hls && window._hls);
      if (h && h.levels) h.levels.forEach(function (l) { if (l.height) out.push({ height: l.height, kind: 'hlsjs' }); });
    } catch (e) {}
    // JW Player (wco.tv / wcostream: labels "576p HD","720p HD","1080p HD",
    // each source.file is an extensionless /getvid?evid=… progressive mp4).
    try {
      if (window.jwplayer) {
        // Enumerate every JW instance on the page (there can be more than one).
        var jwIds = [];
        try {
          document.querySelectorAll('.jwplayer, [id^="jwplayer"], .jw-video, #myJwVideo').forEach(function (el) {
            if (el.id) jwIds.push(el.id);
          });
        } catch (e) {}
        if (!jwIds.length) jwIds.push(undefined); // default instance
        jwIds.forEach(function (jid) {
          try {
            var jw = jid ? window.jwplayer(jid) : window.jwplayer();
            if (!jw) return;
            // 1) getQualityLevels — carries label + (sometimes) height
            if (jw.getQualityLevels) {
              (jw.getQualityLevels() || []).forEach(function (l, idx) {
                var m = String(l.label || '').match(/(\d{3,4})/);
                out.push({ height: l.height || (m ? +m[1] : 0), qi: idx,
                           label: l.label || '', kind: 'jwplayer' });
              });
            }
            // 2) getPlaylistItem().sources — carries the direct file URL per quality
            try {
              var item = jw.getPlaylistItem && jw.getPlaylistItem();
              var srcs = (item && item.sources) || (jw.getConfig && jw.getConfig().sources) || [];
              srcs.forEach(function (s) {
                var lab = s.label || s.res || '';
                var m = String(lab).match(/(\d{3,4})/) || String(s.file || '').match(/(\d{3,4})p\b/i);
                var h = m ? parseInt(m[1], 10) : 0;
                if ((h || lab) && s.file) out.push({ height: h, url: s.file, label: lab, kind: 'jwplayer-src' });
              });
            } catch (e) {}
          } catch (e) {}
        });
      }
    } catch (e) {}
    // Plyr (stores quality options + source URLs)
    try {
      var plyrEls = document.querySelectorAll('.plyr');
      plyrEls.forEach(function (el) {
        var p = el.plyr || (el.__component && el.__component);
        if (p && p.quality && p.source && p.source.sources) {
          p.source.sources.forEach(function (s) {
            var h = s.size || (String(s.src||'').match(/(\d{3,4})p\b/i)||[])[1];
            if (h && s.src) out.push({ height: parseInt(h,10), url: s.src, kind: 'plyr' });
          });
        }
      });
    } catch (e) {}
    // De-dupe by height, prefer entries that carry a direct URL.
    var byH = {};
    out.forEach(function (o) { if (!byH[o.height] || (o.url && !byH[o.height].url)) byH[o.height] = o; });
    var res = Object.keys(byH).map(function (k) { return byH[k]; });
    return res.length ? res : null;
  }

  function genericSetQuality(height) {
    var ok = false;
    // video.js — quality-levels plugin
    try {
      if (window.videojs) {
        var players = (window.videojs.getAllPlayers && window.videojs.getAllPlayers()) || [];
        players.forEach(function (pl) {
          try {
            if (pl && pl.qualityLevels) {
              var ql = pl.qualityLevels();
              for (var i = 0; i < ql.length; i++) ql[i].enabled = (ql[i].height === height);
              ok = true;
            }
          } catch (e) {}
          // video.js — swap source array entry matching the height
          try {
            var srcs = (pl.currentSources && pl.currentSources()) || (pl.options_ && pl.options_.sources) || [];
            for (var k = 0; k < srcs.length; k++) {
              var s = srcs[k];
              var lab = s.label || s.res || s.quality || s.src || '';
              var m = String(lab).match(/(\d{3,4})/);
              if (m && parseInt(m[1], 10) === height && s.src) {
                var t = pl.currentTime ? pl.currentTime() : 0;
                var paused = pl.paused ? pl.paused() : false;
                pl.src({ src: s.src, type: s.type || 'video/mp4' });
                pl.one && pl.one('loadedmetadata', function () { try { pl.currentTime(t); if (!paused) pl.play(); } catch (e) {} });
                ok = true;
              }
            }
          } catch (e) {}
        });
      }
    } catch (e) {}
    // JW Player — match by height on the quality levels list (wco.tv/wcostream).
    try {
      if (window.jwplayer && !ok) {
        var jwIds = [];
        try {
          document.querySelectorAll('.jwplayer, [id^="jwplayer"], .jw-video, #myJwVideo').forEach(function (el) {
            if (el.id) jwIds.push(el.id);
          });
        } catch (e) {}
        if (!jwIds.length) jwIds.push(undefined);
        jwIds.forEach(function (jid) {
          try {
            var jw = jid ? window.jwplayer(jid) : window.jwplayer();
            if (jw && jw.getQualityLevels && jw.setCurrentQuality) {
              var levels = jw.getQualityLevels() || [];
              for (var i = 0; i < levels.length; i++) {
                var lm = String(levels[i].label || '').match(/(\d{3,4})/);
                var lh = levels[i].height || (lm ? parseInt(lm[1], 10) : 0);
                if (lh === height) { jw.setCurrentQuality(i); ok = true; break; }
              }
            }
          } catch (e) {}
        });
      }
    } catch (e) {}
    return ok;
  }

  window.addEventListener('message', function (ev) {
    if (ev.source !== window) return;              // only same-window messages
    var d = ev.data;
    if (!d || d.__vmx !== true || d.dir !== 'req') return;
    var id = d.id, cmd = d.cmd, arg = d.arg;
    if (typeof id !== 'string' || typeof cmd !== 'string') return;
    try {
      switch (cmd) {
        case 'yt-get-qualities': return send(id, true, ytGetQualities());
        case 'yt-set-quality':   return send(id, true, ytSetQuality(arg));
        case 'yt-get-captions':  return send(id, true, ytGetCaptions());
        case 'yt-set-caption':   return send(id, true, ytSetCaption(arg));
        case 'generic-qualities':return send(id, true, genericGetQualities());
        case 'generic-set-quality': return send(id, true, genericSetQuality(arg));
        default: return send(id, false, null);
      }
    } catch (e) { send(id, false, String(e)); }
  });

  // YouTube SPA navigation → tell the content script to re-scan/re-attach.
  if (isYouTube) {
    var _vmxAnnounceNav = function () { try { window.postMessage({ __vmx: true, dir: 'yt-navigated' }, '*'); } catch (e) {} };
    window.addEventListener('yt-navigate-finish', _vmxAnnounceNav);
    window.addEventListener('spfdone', _vmxAnnounceNav);
    var _vmxLastHref = location.href;
    setInterval(function () { if (location.href !== _vmxLastHref) { _vmxLastHref = location.href; _vmxAnnounceNav(); } }, 1000);
  }

  // Announce readiness
  try { window.postMessage({ __vmx: true, dir: 'ready' }, '*'); } catch (e) {}
})();
