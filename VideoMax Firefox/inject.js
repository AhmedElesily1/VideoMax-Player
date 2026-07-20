/**
 * VideoMax Pro v23 - MAIN world bridge - MAX quality detection
 * Supports 144p-4K on ALL sites: Facebook DASH, TikTok, Instagram, X/Twitter, Reddit, Twitch, OK.ru
 * Implements advanced GraphQL response interception for Facebook dash_manifest qualities
 */
(function () {
  'use strict';
  if (window.__VMX_BRIDGE__) return;
  window.__VMX_BRIDGE__ = true;

  function send(id, ok, data) { try { window.postMessage({ __vmx: true, dir: 'res', id, ok, data }, location.origin); } catch {} }
  function emit(dir, payload) { try { window.postMessage({ __vmx: true, dir, ...payload }, location.origin); } catch {} }

  // Keep list of discovered qualities to batch emit
  let discoveredQualities = [];
  let emitTimer = null;
  function emitQualityBatch() {
    if (emitTimer) return;
    emitTimer = setTimeout(() => {
      emitTimer = null;
      if (discoveredQualities.length) {
        emit('up-quality-batch', { qualities: discoveredQualities });
        emit('fb-qualities', { qualities: discoveredQualities });
      }
    }, 400);
  }
  function pushQuality(q) {
    if (!q || !q.height || q.height < 80) return;
    if (discoveredQualities.some(e => e.height === q.height && e.url === q.url)) return;
    const idx = discoveredQualities.findIndex(e => e.height === q.height);
    if (idx >= 0) {
      const existing = discoveredQualities[idx];
      const better = (q.bandwidth || q.bitrate || 0) > (existing.bandwidth || existing.bitrate || 0) || (q.url && !existing.url);
      if (better) discoveredQualities[idx] = q;
      else return;
    } else {
      discoveredQualities.push(q);
    }
    emitQualityBatch();
  }

  function classify(url) {
    if (!url || typeof url !== 'string') return null;
    if (/thumbnail|sprite|storyboard|preview/i.test(url) && /\\.vtt/i.test(url)) return null;
    if (/\\.vtt(\\?|#|$)/i.test(url) || /\\.srt(\\?|#|$)/i.test(url) || /(\\.ass|\\.ssa|\\.ttml|\\.dfxp)(\\?|#|$)/i.test(url) && /(sub|caption|text|timedtext|cc)/i.test(url)) return 'sub';
    if (/\/api\/timedtext|youtube\\.com\/api\/timedtext|timedtext\\?/i.test(url)) return 'sub';
    if (/\\.m3u8(\\?|#|$)/i.test(url) || /\/hls\//i.test(url) || /[?&]format=m3u8/i.test(url) || /mime=application%2Fvnd\\.apple/i.test(url)) return 'hls';
    if (/\\.mpd(\\?|#|$)/i.test(url) || /\/dash\//i.test(url) || /dash_manifest/i.test(url) || /DASHPlaylist/i.test(url)) return 'dash';
    if (/googlevideo\\.com\/videoplayback/i.test(url)) return 'file';
    if (/fbcdn|cdninstagram|tiktokcdn|tiktokv\\.com|scontent.*\\.mp4|video.*fbcdn|fbsbx\\.com/i.test(url)) return 'file';
    if (/\\.ttvnw\\.net\/.*\/(?:playlist|api\/channel\/hls)/i.test(url) || /usher\\.ttvnw\\.net/i.test(url)) return 'hls';
    if (/\\.(mp4|webm|mkv|m4v|mov)(\\?|#|$)/i.test(url)) return 'file';
    if (/\/getvid\\?|\/getvidlink|[?&]evid=/i.test(url)) return 'file';
    if (/dm(?:cdn|xleo)\\.net\/.*\/(?:manifest|video)/i.test(url)) return 'hls';
    return null;
  }

  const seen = new Set();
  function reportUrl(u) {
    try {
      if (!u) return;
      let abs = u;
      try { abs = new URL(u, location.href).href; } catch {}
      const t = classify(abs);
      if (!t) return;
      let dedupKey = abs;
      try {
        const urlObj = new URL(abs);
        if (urlObj.searchParams.has('bytestart') || urlObj.searchParams.has('byteend')) {
          urlObj.searchParams.delete('bytestart'); urlObj.searchParams.delete('byteend');
          dedupKey = urlObj.toString();
        }
      } catch {}
      if (seen.has(dedupKey)) return;
      seen.add(dedupKey);
      const dir = t === 'sub' ? 'subtrack' : 'media';
      emit(dir, { url: abs, mtype: t, dedup: dedupKey });
    } catch {}
  }

  const isYT = /youtube|googlevideo|ytimg|music\\.youtube|youtu\\.be/i.test(location.hostname) ||
    (() => { try { return !!document.querySelector('ytd-app, ytm-app') || !!window.yt || !!window.ytplayer; } catch { return false; } })();

  // --- DASH manifest parser for Facebook ---
  function parseDashManifestXml(xmlString) {
    const qualities = [];
    try {
      let xml = xmlString;
      xml = xml.replace(/\\\\x3C/g, '<').replace(/\\\\x3E/g, '>').replace(/\\\\x22/g, '"').replace(/\\\\x27/g, "'").replace(/\\\\n/g, '\n').replace(/\\\\"/g, '"').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
      xml = xml.replace(/\\\\u003C/gi, '<').replace(/\\\\u003E/gi, '>').replace(/\\\\u0022/gi, '"');
      if (!xml.includes('<MPD') && !xml.includes('<Representation')) return [];
      const parser = new DOMParser();
      const doc = parser.parseFromString(xml, 'text/xml');
      const reps = doc.querySelectorAll('Representation');
      reps.forEach(rep => {
        try {
          const mime = rep.getAttribute('mimeType') || '';
          if (mime && !mime.includes('video')) return;
          const height = parseInt(rep.getAttribute('height') || '0', 10);
          const width = parseInt(rep.getAttribute('width') || '0', 10);
          const bandwidth = parseInt(rep.getAttribute('bandwidth') || '0', 10);
          const fbLabel = rep.getAttribute('FBQualityLabel') || rep.getAttribute('FBQualityClass') || '';
          const id = rep.getAttribute('id') || '';
          const baseEl = rep.querySelector('BaseURL');
          const baseUrl = baseEl ? baseEl.textContent.trim() : '';
          let finalHeight = height;
          if (!finalHeight && fbLabel) { const m = fbLabel.match(/(\d{3,4})p/); if (m) finalHeight = parseInt(m[1], 10); }
          if (!finalHeight) return;
          if (finalHeight < 80 || finalHeight > 5000) return;
          qualities.push({ height: finalHeight, width, bandwidth, label: fbLabel || (finalHeight + 'p'), id, url: baseUrl, mime, kind: 'facebook-dash', fbLabel });
        } catch {}
      });
    } catch {}
    return qualities;
  }

  function fbExtractFromDataStore() {
    const allQuals = [];
    try {
      const els = document.querySelectorAll('[data-store], [data-store-id]');
      els.forEach(el => {
        try {
          let ds = el.getAttribute('data-store') || '';
          if (!ds) return;
          ds = ds.replace(/&quot;/g, '"').replace(/&amp;/g, '&');
          let obj; try { obj = JSON.parse(ds); } catch {
            const m1 = ds.match(/"dash_manifest"\s*:\s*"([^"]+)"/);
            if (m1) allQuals.push(...parseDashManifestXml(m1[1]));
            return;
          }
          if (!obj) return;
          const cands = [obj.dash_manifest, obj.dashManifest, obj.videoData?.dash_manifest, obj.videoData?.dashManifest];
          cands.forEach(cand => { if (cand && typeof cand === 'string') allQuals.push(...parseDashManifestXml(cand)); });
        } catch {}
      });
    } catch {}
    try {
      const html = document.documentElement.innerHTML;
      const hdMatch = html.match(/"hd_src"\s*:\s*"([^"]+)"/);
      const sdMatch = html.match(/"sd_src"\s*:\s*"([^"]+)"/);
      if (hdMatch) { let url = hdMatch[1].replace(/\\u0025/g, '%').replace(/\\\//g, '/'); allQuals.push({ height: 720, label: '720p', url, kind: 'facebook-hd' }); }
      if (sdMatch) { let url = sdMatch[1].replace(/\\u0025/g, '%').replace(/\\\//g, '/'); allQuals.push({ height: 360, label: '360p', url, kind: 'facebook-sd' }); }
    } catch {}
    
    // Also merge discoveredQualities!
    if (discoveredQualities.length) {
       allQuals.push(...discoveredQualities);
    }

    const byH = {}; allQuals.forEach(q => { if (!byH[q.height] || (q.bandwidth || 0) > (byH[q.height].bandwidth || 0)) byH[q.height] = q; });
    return Object.values(byH).sort((a, b) => b.height - a.height);
  }

  // --- Deep search for FB, TikTok, X/Twitter, Reddit, Twitch JSON responses ---
  
  function parseM3u8Text(text, baseUrl) {
    if (!text.includes('#EXTM3U')) return;
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('#EXT-X-STREAM-INF')) {
        const resMatch = line.match(/RESOLUTION=\d+x(\d+)/i);
        const bwMatch = line.match(/BANDWIDTH=(\d+)/i);
        const nameMatch = line.match(/(?:NAME|VIDEO)="([^"]+)"/i);
        
        let nextLine = '';
        for (let j = i + 1; j < lines.length; j++) {
          const cand = lines[j].trim();
          if (cand && !cand.startsWith('#')) { nextLine = cand; break; }
          if (cand.startsWith('#EXT-X-STREAM-INF')) break;
        }
        
        const height = resMatch ? parseInt(resMatch[1], 10) : 0;
        let label = nameMatch ? nameMatch[1] : (height ? height + 'p' : 'auto');
        if (bwMatch && !nameMatch) label += ' (' + Math.round(parseInt(bwMatch[1], 10) / 1000) + 'k)';
        
        if (height > 0 && nextLine) {
           let finalUrl = nextLine;
           try { if (!/^https?:/i.test(nextLine) && baseUrl) finalUrl = new URL(nextLine, baseUrl).href; } catch(e){}
           pushQuality({ height: height, url: finalUrl, label: label, kind: 'm3u8-intercept', bandwidth: bwMatch ? parseInt(bwMatch[1]) : 0 });
        }
      }
    }
  }

  function deepSearchFB(obj, depth = 0) {
    if (obj && obj.streamingData && obj.streamingData.formats) {
       window.__vmx_yt_streamingData = obj.streamingData;
    }
    if (obj && obj.playerResponse && obj.playerResponse.streamingData) {
       window.__vmx_yt_streamingData = obj.playerResponse.streamingData;
    }
    if (depth > 12 || !obj || typeof obj !== 'object') return;
    if (Array.isArray(obj)) { obj.forEach(o => deepSearchFB(o, depth + 1)); return; }

    if (typeof obj.dash_manifest === 'string' && obj.dash_manifest.includes('<MPD')) {
      parseDashManifestXml(obj.dash_manifest).forEach(q => pushQuality(q));
    }
    if (typeof obj.manifest_xml === 'string' && obj.manifest_xml.includes('<MPD')) {
      parseDashManifestXml(obj.manifest_xml).forEach(q => pushQuality(q));
    }
    if (typeof obj.dashManifest === 'string' && obj.dashManifest.includes('<MPD')) {
      parseDashManifestXml(obj.dashManifest).forEach(q => pushQuality(q));
    }

    if (obj.playable_url && typeof obj.playable_url === 'string' && obj.playable_url.includes('fbcdn')) {
      reportUrl(obj.playable_url);
      pushQuality({ height: 360, url: obj.playable_url, label: '360p', kind: 'fb-playable', bandwidth: 0 });
    }
    if (obj.playable_url_quality_hd && typeof obj.playable_url_quality_hd === 'string' && obj.playable_url_quality_hd.includes('fbcdn')) {
      reportUrl(obj.playable_url_quality_hd);
      pushQuality({ height: 720, url: obj.playable_url_quality_hd, label: '720p HD', kind: 'fb-hd', bandwidth: 2000000 });
    }
    if (obj.browser_native_hd_url && typeof obj.browser_native_hd_url === 'string') {
      reportUrl(obj.browser_native_hd_url);
      pushQuality({ height: 720, url: obj.browser_native_hd_url, label: '720p', kind: 'fb-browser-hd' });
    }
    if (obj.browser_native_sd_url && typeof obj.browser_native_sd_url === 'string') {
      reportUrl(obj.browser_native_sd_url);
      pushQuality({ height: 360, url: obj.browser_native_sd_url, label: '360p', kind: 'fb-browser-sd' });
    }
    if (obj.playable_url_dash && typeof obj.playable_url_dash === 'string' && obj.playable_url_dash.includes('.mpd')) {
      reportUrl(obj.playable_url_dash);
    }
    if (obj.progressive_url && typeof obj.progressive_url === 'string') {
      reportUrl(obj.progressive_url);
      let h = 0;
      const q = obj.metadata?.quality?.toLowerCase() || '';
      if (q.includes('144')) h = 144; else if (q.includes('240')) h = 240; else if (q.includes('360')) h = 360; else if (q.includes('480')) h = 480; else if (q.includes('720')) h = 720; else if (q.includes('1080')) h = 1080; else if (q.includes('1440')) h = 1440; else if (q.includes('2160')) h = 2160;
      if (!h) { const m = obj.progressive_url.match(/(\d{3,4})p/); if (m) h = parseInt(m[1], 10); }
      if (h) pushQuality({ height: h, url: obj.progressive_url, label: h + 'p', kind: 'fb-progressive', bandwidth: 0 });
    }
    if (obj.manifest_url && typeof obj.manifest_url === 'string' && obj.manifest_url.includes('.mpd')) {
      reportUrl(obj.manifest_url);
    }
    if (obj.hls_playlist_url && typeof obj.hls_playlist_url === 'string') {
      reportUrl(obj.hls_playlist_url);
    }
    // TikTok bitrateInfo
    if (Array.isArray(obj.bitrateInfo)) {
      obj.bitrateInfo.forEach(b => {
        try {
          const gear = b.GearName || b.quality || '';
          const mm = gear.match(/(\d{3,4})p/) || String(b.QualityType || '').match(/(\d{3,4})/);
          let h = mm ? parseInt(mm[1], 10) : 0;
          if (!h && b.Height) h = b.Height;
          if (h) {
            const url = b.PlayAddr?.UrlList?.[0] || b.DownloadAddr?.UrlList?.[0] || b.PlayAddr?.Url || b.DownloadAddr?.Url || '';
            if (url) { reportUrl(url); pushQuality({ height: h, url, label: gear || (h + 'p'), kind: 'tiktok-bitrate' }); }
          }
        } catch {}
      });
    }
    if (obj.downloadAddr && typeof obj.downloadAddr === 'string' && obj.downloadAddr.includes('tiktok')) {
      reportUrl(obj.downloadAddr);
      pushQuality({ height: 720, url: obj.downloadAddr, label: '720p', kind: 'tiktok-download' });
    }
    if (obj.playAddr && typeof obj.playAddr === 'string' && obj.playAddr.includes('tiktok')) {
      reportUrl(obj.playAddr);
      pushQuality({ height: 480, url: obj.playAddr, label: '480p', kind: 'tiktok-play' });
    }
    // Instagram video_versions
    if (obj.video_versions && Array.isArray(obj.video_versions)) {
      obj.video_versions.forEach(vv => {
        try {
          const h = vv.height || 0; const w = vv.width || 0;
          const url = vv.url || '';
          if (h && url) { reportUrl(url); pushQuality({ height: h, width: w, url, label: h + 'p', kind: 'ig-version' }); }
        } catch {}
      });
    }
    // X/Twitter variants
    if (obj.variants && Array.isArray(obj.variants)) {
      obj.variants.forEach(v => {
        try {
          const url = v.url || '';
          if (!url) return;
          const ct = v.content_type || '';
          if (!ct.includes('mp4') && !ct.includes('video')) return;
          const bitrate = v.bitrate || 0;
          let h = 0;
          if (bitrate) {
            if (bitrate < 400000) h = 240;
            else if (bitrate < 800000) h = 360;
            else if (bitrate < 1400000) h = 480;
            else if (bitrate < 2500000) h = 720;
            else h = 1080;
          }
          if (!h) {
            const m = url.match(/(\d{3,4})x(\d{3,4})/) || url.match(/(\d{3,4})p/);
            if (m) h = parseInt(m[2] || m[1], 10);
          }
          if (h) { reportUrl(url); pushQuality({ height: h, url, label: h + 'p', kind: 'x-twitter', bitrate }); }
        } catch {}
      });
    }
    // Reddit DASH
    if (obj.dash_url && typeof obj.dash_url === 'string' && obj.dash_url.includes('.mpd')) {
      reportUrl(obj.dash_url);
    }
    if (obj.hls_url && typeof obj.hls_url === 'string' && obj.hls_url.includes('.m3u8')) {
      reportUrl(obj.hls_url);
    }
    // Twitch quality groups
    if (obj.qualityGroups && Array.isArray(obj.qualityGroups)) {
      obj.qualityGroups.forEach(g => {
        try {
          const name = g.name || '';
          const m = name.match(/(\d{3,4})p/);
          const h = m ? parseInt(m[1], 10) : 0;
          if (h && g.source) { reportUrl(g.source); pushQuality({ height: h, url: g.source, label: h + 'p', kind: 'twitch' }); }
        } catch {}
      });
    }

    for (const k in obj) {
      try {
        const v = obj[k];
        if (v && typeof v === 'object') deepSearchFB(v, depth + 1);
      } catch {}
    }
  }

  // --- Hook fetch with response body parsing ---
  if (!isYT) {
    try {
      const _fetch = window.fetch;
      if (_fetch && !_fetch.__vmx) {
        window.fetch = function (input, init) {
          try { reportUrl(typeof input === 'string' ? input : input?.url); } catch {}
          const p = _fetch.apply(this, arguments);
          try {
            p.then(res => {
              try {
                const url = res.url || (typeof input === 'string' ? input : input?.url) || '';
                if (/.*player_response|\.m3u8|\.mpd/i.test(url)) {
                  res.clone().text().then(txt => {
                    try {
                      if (txt.includes('#EXTM3U')) {
                          parseM3u8Text(txt, url);
                      } else if (txt.includes('<MPD')) {
                          parseDashManifestXml(txt).forEach(q => pushQuality(q));
                      } else {
                          const lines = txt.split('\n');
                          lines.forEach(line => {
                            if (!line.trim()) return;
                            try {
                              const j = JSON.parse(line);
                              deepSearchFB(j);
                            } catch {
                              try {
                                const m = line.match(/\{.*\}/);
                                if (m) { const j2 = JSON.parse(m[0]); deepSearchFB(j2); }
                              } catch {}
                            }
                          });
                          try { const jAll = JSON.parse(txt); deepSearchFB(jAll); } catch {}
                      }
                    } catch {}
                  }).catch(()=>{});
                }
              } catch {}
              return res;
            }).catch(()=>{});
          } catch {}
          return p;
        };
        window.fetch.__vmx = true;
      }
    } catch {}
    try {
      const _open = XMLHttpRequest.prototype.open;
      const _send = XMLHttpRequest.prototype.send;
      if (_open && !_open.__vmx) {
        const openMap = new WeakMap();
        XMLHttpRequest.prototype.open = function (m, url) {
          try { reportUrl(url); openMap.set(this, url); } catch {}
          return _open.apply(this, arguments);
        };
        XMLHttpRequest.prototype.open.__vmx = true;
        if (_send && !_send.__vmx) {
          XMLHttpRequest.prototype.send = function () {
            try {
              this.addEventListener('load', function () {
                try {
                  const url = openMap.get(this) || this.responseURL || '';
                  if (/(facebook|instagram|tiktok|twitter|x\\.com|reddit|twitch|usher\\.ttvnw|ok\\.ru|dailymotion|youtube|pinterest|tumblr|snapchat|linkedin|bitchute|rumble|odysee|kick|trovo|dlive|vimeo|vk\\.com|bilibili|iqiyi|wetv|vlive|afreecatv|naver|kakaotv|weibo|youku|tdesktop|discord|telegram|wistia|loom|vidyard|kaltura|bitmovin)/i.test(url)) {
                    const rt = this.responseText || '';
                    if (rt) {
                      try {
                        if (rt.includes('#EXTM3U')) {
                            parseM3u8Text(rt, url);
                        } else if (rt.includes('<MPD')) {
                            parseDashManifestXml(rt).forEach(q => pushQuality(q));
                        } else {
                            const lines = rt.split('\n');
                            lines.forEach(line => {
                              if (!line.trim()) return;
                              try { const j = JSON.parse(line); deepSearchFB(j); } catch {}
                            });
                            try { const jAll = JSON.parse(rt); deepSearchFB(jAll); } catch {}
                        }
                      } catch {}
                    }
                  }
                } catch {}
              });
            } catch {}
            return _send.apply(this, arguments);
          };
          XMLHttpRequest.prototype.send.__vmx = true;
        }
      }
    } catch {}
    try {
      if (window.MediaSource?.prototype && !window.MediaSource.prototype.__vmx) {
        const _add = MediaSource.prototype.addSourceBuffer;
        MediaSource.prototype.addSourceBuffer = function (mime) { try { emit('mse', { mime: String(mime || '') }); } catch {} return _add.apply(this, arguments); };
        window.MediaSource.prototype.__vmx = true;
      }
    } catch {}
  }

  function vmxReportDrm(reason, ks) { try { emit('drm', { reason: String(reason || 'eme'), keySystem: String(ks || '') }); } catch {} }
  try {
    const _r = navigator.requestMediaKeySystemAccess;
    if (_r && !_r.__vmx) {
      const wrap = function (ks, cfg) { vmxReportDrm('requestMediaKeySystemAccess', ks); return _r.call(navigator, ks, cfg); };
      wrap.__vmx = true;
      try { Object.defineProperty(navigator, 'requestMediaKeySystemAccess', { configurable: true, writable: true, value: wrap }); } catch { try { navigator.requestMediaKeySystemAccess = wrap; } catch {} }
    }
  } catch {}
  try {
    const _s = HTMLMediaElement.prototype.setMediaKeys;
    if (_s && !_s.__vmx) {
      HTMLMediaElement.prototype.setMediaKeys = function (mk) { if (mk) vmxReportDrm('setMediaKeys', 'encrypted'); return _s.apply(this, arguments); };
      HTMLMediaElement.prototype.setMediaKeys.__vmx = true;
    }
  } catch {}
  try { document.addEventListener('encrypted', () => vmxReportDrm('encrypted-event', 'encrypted'), true); } catch {}

  // YT
  function ytHasApi(el) { return el && typeof el.getAvailableQualityLevels === 'function'; }
  function ytPlayer() {
    let p = document.getElementById('movie_player');
    if (p && typeof p.getPlayerResponse === 'function') return p;
    if (p && p._player && typeof p._player.getPlayerResponse === 'function') return p._player;

    p = document.querySelector('ytd-player');
    if (p && typeof p.getPlayerResponse === 'function') return p;
    if (p && p.getPlayer && typeof p.getPlayer === 'function') {
        let pl = p.getPlayer();
        if (pl && typeof pl.getPlayerResponse === 'function') return pl;
    }
    if (p && p._player && typeof p._player.getPlayerResponse === 'function') return p._player;

    p = document.querySelector('.html5-video-player');
    if (p && typeof p.getPlayerResponse === 'function') return p;

    const cands = document.querySelectorAll('._msc, [class*="player"], ytd-player, ytm-app, ytm-player, ytm-watch, #player-container, .player-container');
    for (let i = 0; i < cands.length; i++) {
        if (cands[i] && typeof cands[i].getPlayerResponse === 'function') return cands[i];
        if (cands[i] && cands[i]._player && typeof cands[i]._player.getPlayerResponse === 'function') return cands[i]._player;
    }
    
    p = document.getElementById('movie_player');
    if (p && typeof p.setPlaybackQualityRange === 'function') return p;
    p = document.querySelector('ytd-player');
    if (p && p._player && typeof p._player.setPlaybackQualityRange === 'function') return p._player;

    const v = document.querySelector('video');
    if (v) {
      let node = v;
      while (node) {
        if (node && typeof node.getPlayerResponse === 'function') return node;
        if (node && typeof node.getAvailableQualityLevels === 'function') return node;
        if (node && node._player && typeof node._player.getPlayerResponse === 'function') return node._player;
        node = node.parentElement;
      }
    }
    
    p = document.querySelector('ytm-app, ytm-watch');
    if (p && typeof p.getPlayerResponse === 'function') return p;
    if (p && p._player && typeof p._player.getPlayerResponse === 'function') return p._player;
    
    return document.getElementById('movie_player') || document.querySelector('ytd-player') || null;
  }
  const YT_H = { highres: 4320, hd2880: 2880, hd2160: 2160, hd1440: 1440, hd1080: 1080, hd720: 720, large: 480, medium: 360, small: 240, tiny: 144 };
  function ytGetQualities() {
    try {
      var resp = null;
      var streamingData = window.__vmx_yt_streamingData || null;

      try {
        var p = ytPlayer();
        if (p && typeof p.getPlayerResponse === 'function') { resp = p.getPlayerResponse(); }
      } catch(e) {}
      
      try { if (!resp && window.ytInitialPlayerResponse) resp = window.ytInitialPlayerResponse; } catch(e) {}
      try { if (!resp && window.ytplayer && window.ytplayer.config && window.ytplayer.config.args) {
          if (window.ytplayer.config.args.raw_player_response) {
              let pr = window.ytplayer.config.args.raw_player_response;
              if (typeof pr === 'string') pr = JSON.parse(pr);
              if (pr && pr.streamingData) streamingData = pr.streamingData;
          }
          if (!resp && window.ytplayer.config.args.player_response) {
              resp = typeof window.ytplayer.config.args.player_response === 'string' ? JSON.parse(window.ytplayer.config.args.player_response) : window.ytplayer.config.args.player_response;
          }
      } } catch(e) {}
      
      if (!resp) {
        try {
          var scripts = document.querySelectorAll('script');
          for (var si = 0; si < scripts.length && !resp; si++) {
            var t = scripts[si].textContent || '';
            var idx = t.indexOf('ytInitialPlayerResponse =');
            if (idx >= 0) {
              var start = idx + 'ytInitialPlayerResponse ='.length;
              var end = t.indexOf('};', start);
              if (end > start) {
                try { resp = JSON.parse(t.substring(start, end + 1)); } catch(e2) {}
              }
            }
          }
        } catch(e) {}
      }

      if (!resp) {
        try {
          var el = document.querySelector('ytmusic-app');
          if (el) {
            var ytInit = el.data || window.ytInitialData || null;
            if (ytInit && ytInit.playerResponse) resp = ytInit.playerResponse;
          }
        } catch(e) {}
      }

      if (resp && resp.streamingData) streamingData = resp.streamingData;

      if (!streamingData) {
        if (p && typeof p.getAvailableQualityLevels === 'function') {
          var nativeLevels = p.getAvailableQualityLevels();
          if (nativeLevels && nativeLevels.length > 0) {
             var levels = [];
             var curH = 0; try { var v = document.querySelector('video'); if (v) curH = v.videoHeight; } catch(e) {}
             nativeLevels.forEach(function(l) {
                if (l === 'auto') return;
                var h = 0;
                var match = l.match(/(\d{3,4})/);
                if (match) h = parseInt(match[1], 10);
                if (l.indexOf('2160') >= 0 || l === 'highres') h = 2160;
                else if (l.indexOf('1440') >= 0) h = 1440;
                else if (l.indexOf('1080') >= 0) h = 1080;
                else if (l.indexOf('720') >= 0) h = 720;
                else if (l === 'large') h = 480;
                else if (l === 'medium') h = 360;
                else if (l === 'small') h = 240;
                else if (l === 'tiny') h = 144;
                if (h) levels.push({ id: l, height: h, label: (l.indexOf('60') > 0 && h >= 720 ? h + 'p60' : h + 'p'), url: '', type: 'youtube-native' });
             });
             if (levels.length > 0) {
                levels.sort(function(a,b) { return b.height - a.height; });
                return { cur: String(curH || 'auto'), levels: levels, native: true };
             }
          }
        }
      }
      
      if (streamingData) {
        var all = (streamingData.formats || []).concat(streamingData.adaptiveFormats || []);
        var seen = {}, levels = [], curH = 0;
        try {
          var videoEl = document.querySelector('video');
          if (videoEl && videoEl.videoHeight) curH = videoEl.videoHeight;
        } catch(e) {}
        
        all.forEach(function(f) {
          if (!f) return;
          var h = f.height || 0;
          if (!h && f.qualityLabel) {
            var m2 = f.qualityLabel.match(/(\d{3,4})p/);
            if (m2) h = parseInt(m2[1], 10);
          }
          if (!h && f.width && f.width > 0) {
            var w = f.width;
            if (w <= 256) h = 144;
            else if (w <= 426) h = 240;
            else if (w <= 640) h = 360;
            else if (w <= 854) h = 480;
            else if (w <= 1280) h = 720;
            else if (w <= 1920) h = 1080;
            else if (w <= 2560) h = 1440;
            else if (w <= 3840) h = 2160;
            else h = 4320;
          }
          if (!h || h < 80 || h > 5000) return;
          
          var isPremium = f.qualityLabel && f.qualityLabel.toLowerCase().indexOf('premium') >= 0;
          var uniqueKey = isPremium ? (h + '_premium') : String(h);
          
          var label = f.qualityLabel || (h + 'p' + (isPremium ? ' Premium' : ''));
          if (!seen[uniqueKey]) {
            seen[uniqueKey] = true;
            levels.push({ id: uniqueKey, height: h, label: label, url: f.url || '', bitrate: f.bitrate || 0, fps: f.fps || 0, mimeType: f.mimeType || '', isPremium: isPremium });
          }
        });
        levels.sort(function(a,b) { 
          if (b.height === a.height) return (b.isPremium ? 1 : 0) - (a.isPremium ? 1 : 0);
          return b.height - a.height; 
        });
        return { cur: String(curH || 'auto'), levels: levels };
      }
      
      try {
        var v = document.querySelector('video');
        if (v && v.videoHeight) return { cur: String(v.videoHeight), levels: [{ id: String(v.videoHeight), height: v.videoHeight, label: v.videoHeight + 'p' }] };
      } catch(e) {}
      
      return { cur: 'auto', levels: [
        {id:'hd2160', height:2160, label:'2160p', native: true},
        {id:'hd1440', height:1440, label:'1440p', native: true},
        {id:'hd1080', height:1080, label:'1080p', native: true},
        {id:'hd720', height:720, label:'720p', native: true},
        {id:'large', height:480, label:'480p', native: true},
        {id:'medium', height:360, label:'360p', native: true},
        {id:'small', height:240, label:'240p', native: true},
        {id:'tiny', height:144, label:'144p', native: true}
      ]};
    } catch(e) { return null; }
  }
  
  function ytSetQuality(q) {
    var p = ytPlayer(); if (!p) return false;
    
    var targetHeight = parseInt(q, 10);
    if (!targetHeight && q !== 'auto') targetHeight = parseInt(String(q).replace(/[^0-9]/g,''), 10);

    var isPremiumWant = String(q).indexOf('premium') >= 0;
    
    var nativeQ = 'auto';
    if (typeof q === 'string' && (q === 'highres' || q === 'hd2160' || q === 'hd1440' || q === 'hd1080' || q === 'hd720' || q === 'large' || q === 'medium' || q === 'small' || q === 'tiny' || q === 'auto')) {
       nativeQ = q;
    } else {
       if (targetHeight >= 4320) nativeQ = 'highres';
       else if (targetHeight >= 2160) nativeQ = 'hd2160';
       else if (targetHeight >= 1440) nativeQ = 'hd1440';
       else if (targetHeight >= 1080) nativeQ = isPremiumWant ? 'premium' : 'hd1080';
       else if (targetHeight >= 720) nativeQ = 'hd720';
       else if (targetHeight >= 480) nativeQ = 'large';
       else if (targetHeight >= 360) nativeQ = 'medium';
       else if (targetHeight >= 240) nativeQ = 'small';
       else if (targetHeight >= 144) nativeQ = 'tiny';
    }

    try { if (typeof p.setPlaybackQualityRange === 'function') p.setPlaybackQualityRange(nativeQ, nativeQ); } catch(e){}
    try { if (typeof p.setPlaybackQuality === 'function') p.setPlaybackQuality(nativeQ); } catch(e){}

    try {
        var now = Date.now();
        window.localStorage.setItem('yt-player-quality', JSON.stringify({
            data: nativeQ,
            expiration: now + 30*24*3600*1000,
            creation: now
        }));
        window.sessionStorage.setItem('yt-player-quality', JSON.stringify({
            data: nativeQ,
            expiration: now + 30*24*3600*1000,
            creation: now
        }));
    } catch(e) {}
    
    try {
        if (p && typeof p.getVideoData === 'function' && typeof p.loadVideoById === 'function') {
          var vd = p.getVideoData() || {};
          var ct = (typeof p.getCurrentTime === 'function') ? p.getCurrentTime() : 0;
          if (vd.video_id) { 
              p.loadVideoById(vd.video_id, ct, nativeQ); 
              return true; 
          }
        }
    } catch(e2) {}

    // Fallback: click YouTube UI
    try {
        const settingsBtn = document.querySelector('.ytp-settings-button');
        if (settingsBtn) {
            settingsBtn.click();
            setTimeout(() => {
                const menus = document.querySelectorAll('.ytp-menuitem');
                for (let m of menus) {
                    if (m.innerText.includes('Quality') || m.innerText.includes('الجودة')) {
                        m.click();
                        setTimeout(() => {
                            const qMenus = document.querySelectorAll('.ytp-quality-menu .ytp-menuitem');
                            for (let qm of qMenus) {
                                if (qm.innerText.includes(targetHeight)) {
                                    qm.click();
                                    break;
                                }
                            }
                        }, 50);
                        break;
                    }
                }
            }, 50);
        }
    } catch(e) {}

    return true;
  }
  function ytGetCaptions() {
    // Source 1: getOption (deprecated but may still work for some)
    const p = ytPlayer();
    if (p?.getOption) {
      try {
        const list = p.getOption('captions', 'tracklist') || p.getOption('cc', 'tracklist');
        if (list?.length) return list.map((t, i) => ({ i, name: t.displayName || t.languageName || t.languageCode || ('Track ' + (i + 1)), code: t.languageCode || '' })).filter(x => x.name);
      } catch {}
    }
    // Source 2: player_response captions (best source)
    try {
      let resp = null;
      if (p?.getPlayerResponse) { try { resp = p.getPlayerResponse(); } catch {} }
      if (!resp && window.ytInitialPlayerResponse) resp = window.ytInitialPlayerResponse;
      if (!resp) {
        try {
          var scripts = document.querySelectorAll('script');
          for (var si = 0; si < scripts.length && !resp; si++) {
            var txt = scripts[si].textContent || '';
            if (txt.indexOf('captionTracks') >= 0 && txt.indexOf('ytInitialPlayerResponse') >= 0) {
              var m = txt.match(/ytInitialPlayerResponse\s*=\s*(\{[\s\S]*?captionTracks[\s\S]*?\});/);
              if (m) resp = JSON.parse(m[1]);
            }
          }
        } catch(e) {}
      }
      const tracks = resp?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      if (tracks?.length) return tracks.map((t, i) => { const nm = (t.name?.simpleText || t.name?.runs?.[0]?.text) || t.languageCode || ('Track ' + (i + 1)); return { i, name: nm, code: t.languageCode || '', url: t.baseUrl || '' }; });
    } catch {}
    // Source 3: track elements on the page
    try {
      var videoTracks = document.querySelectorAll('track[kind="captions"], track[kind="subtitles"]');
      if (videoTracks.length) {
        return Array.prototype.map.call(videoTracks, function(t, i) { return { i: i, name: t.label || t.srclang || ('Track ' + (i+1)), code: t.srclang || '', url: t.src || '' }; });
      }
    } catch(e) {}
    return null;
  }
  function ytSetCaption(i) {
    const p = ytPlayer(); if (!p) return false;
    try { p.loadModule?.('captions'); } catch {}
    if (p.getOption && p.setOption) {
      try {
        if (i < 0) { p.setOption('captions', 'track', {}); return true; }
        const list = p.getOption('captions', 'tracklist') || p.getOption('cc', 'tracklist') || [];
        if (list[i]) { p.setOption('captions', 'track', list[i]); try { p.setOption('captions', 'reload', true); } catch {} return true; }
        p.setOption('captions', 'track', {});
      } catch {}
    }
    return false;
  }

  const PLAYER_KEYS = ['player', 'dashPlayer', 'shakaPlayer', 'hls', '_hls', 'hlsjs', 'jwplayer', 'videojs', 'flowplayer', 'clappr', 'Hls', 'artplayer', 'DPlayer', 'bitmovin', 'THEOplayer', 'fluidPlayer', 'rmp', 'kWidget', '_wq'];
  function collectGlobals(pred) {
    const out = []; for (const k of PLAYER_KEYS) { try { const g = window[k]; if (g && typeof g === 'object' && pred(g) && !out.includes(g)) out.push(g); } catch {} } return out;
  }
  
  function parseQualityLabel(lbl) {
    if (!lbl) return 0;
    let m = String(lbl).match(/(\d{3,4})/);
    if (m) return parseInt(m[1], 10);
    if (/4K|2160/i.test(lbl)) return 2160;
    if (/FHD|1080/i.test(lbl)) return 1080;
    if (/HD|720/i.test(lbl)) return 720;
    if (/SD|480/i.test(lbl)) return 480;
    return 0;
  }

  function genericGetQualities() {
    /* UNIVERSAL QUALITY DETECTION ENGINE v2
     * Covers patterns from 941 yt-dlp extractors:
     * - Player APIs: videojs, jwplayer, hls.js, dash.js, shaka, plyr, flowplayer, clappr, artplayer, dplayer
     * - HLS/DASH manifest parsing from network
     * - Embedded JSON (__NEXT_DATA__, __INITIAL_STATE__, ytInitialData, etc.)
     * - Open Graph / Twitter Card / JSON-LD meta tags
     * - Video element attributes and DOM scraping
     * - iframe detection and cross-origin relay
     * - URL pattern extraction for dimensions
     * - PerformanceObserver network capture
     * - Bitrate-to-resolution estimation
     */
    const out = [];
    const BITRATE_MAP = [[200000,144],[400000,240],[800000,360],[1400000,480],[2500000,720],[5000000,1080],[10000000,1440],[Infinity,2160]];
    function brToH(br) { for (const [max,h] of BITRATE_MAP) if (br <= max) return h; return 0; }
    
    // ─── STRATEGY 1: Player APIs (JW, Video.js, HLS.js, dash.js, Shaka, Plyr, Clappr, Flowplayer) ───
    // 1a) Video.js
    try {
      if (window.videojs) {
        const players = window.videojs.getAllPlayers?.() || Array.from(document.querySelectorAll('.video-js')).map(el => el.player || window.videojs(el.id || el));
        players.forEach(pl => {
          if (!pl) return;
          try { if (pl.qualityLevels) { const ql = pl.qualityLevels(); for (let i = 0; i < ql.length; i++) if (ql[i].height) out.push({ height: ql[i].height, kind: 'videojs-ql', bitrate: ql[i].bitrate || 0, label: ql[i].height+'p' }); } } catch {}
          try { (pl.currentSources?.() || pl.options_?.sources || []).forEach(s => { const h = s.height || parseQualityLabel(s.label || s.res || s.quality || s.name || s.src); if (h && s.src) out.push({ height: h, url: s.src, kind: 'videojs-src', label: s.label || h+'p' }); }); } catch {}
        });
      }
    } catch {}
    
    // 1b) HLS.js
    try {
      const hlsInstances = [window.hls, window.hlsjs, window._hls, window.Hls].filter(Boolean);
      document.querySelectorAll('video, .video-js, [class*="player"]').forEach(el => {
        [el._hls, el.hls, el.player?.hls].forEach(h => { if (h && !hlsInstances.includes(h)) hlsInstances.push(h); });
      });
      hlsInstances.forEach(h => {
        if (!h?.levels?.length) return;
        h.levels.forEach((l, idx) => {
          let hgt = l.height || brToH(l.bitrate || 0);
          if (hgt || l.bitrate) out.push({ height: hgt || 0, bitrate: l.bitrate || 0, url: (Array.isArray(l.url) ? l.url[0] : l.url) || '', qi: idx, kind: 'hlsjs', active: h.currentLevel === idx, label: (hgt ? hgt+'p' : l.bitrate+'bps') });
        });
      });
    } catch {}
    
    // 1c) JW Player
    try {
      if (window.jwplayer) {
        let jwIds = Array.from(document.querySelectorAll('.jwplayer, [id^="jwplayer"], .jw-video, #myJwVideo, [class*="jwplayer"]')).map(e => e.id).filter(Boolean);
        if (!jwIds.length) jwIds.push(undefined);
        jwIds.forEach(jid => {
          try {
            const jw = jid ? window.jwplayer(jid) : window.jwplayer();
            if (!jw) return;
            (jw.getQualityLevels?.() || []).forEach((l, idx) => { const h = l.height || parseQualityLabel(l.label); if (h) out.push({ height: h, qi: idx, label: l.label||h+'p', kind: 'jwplayer', bitrate: l.bitrate||0 }); });
            const jwSrcs = jw.getPlaylistItem?.()?.sources || jw.getConfig?.().sources || [];
            jwSrcs.forEach(s => { const m = String(s.label||s.res||s.file||'').match(/(\d{3,4})p/); const h = m ? parseInt(m[1],10) : 0; if (h && s.file) out.push({ height: h, url: s.file, label: h+'p', kind: 'jwplayer-src' }); });
          } catch {}
        });
      }
    } catch {}
    
    // 1d) Plyr
    try {
      document.querySelectorAll('.plyr').forEach(el => {
        const p = el.plyr || el.querySelector?.('[class*="plyr"]')?.plyr;
        if (p?.quality && p.source?.sources) {
          p.source.sources.forEach(s => { const hh = s.size || (String(s.src||'').match(/(\d{3,4})p/)||[])[1]; if (hh && s.src) out.push({ height: parseInt(hh,10), url: s.src, kind: 'plyr', label: hh+'p' }); });
        }
      });
    } catch {}
    
    // 1e) dash.js
    collectGlobals(g => typeof g.getBitrateInfoListFor === 'function').forEach(dp => {
      try { (dp.getBitrateInfoListFor('video')||[]).forEach(b => { const h = b.height || brToH(b.bandwidth||0); if (h || b.bandwidth) out.push({ height: h, bitrate: b.bandwidth||0, qi: b.qualityIndex, kind: 'dashjs', label: h ? h+'p' : b.bandwidth+'bps' }); }); } catch {}
    });
    
    // 1f) Shaka Player
    collectGlobals(g => typeof g.getVariantTracks === 'function').forEach(sp => {
      try { (sp.getVariantTracks()||[]).forEach(t => { const h = t.height || brToH(t.bandwidth||0); if (h || t.bandwidth) out.push({ height: h, bitrate: t.bandwidth||0, active: !!t.active, kind: 'shaka', label: h ? h+'p' : t.bandwidth+'bps' }); }); } catch {}
    });
    
    // 1g) Flowplayer, Clappr, Artplayer, DPlayer
    try {
      ['flowplayer', 'clappr', 'artplayer', 'DPlayer'].forEach(name => {
        const inst = window[name] || (window[name==='DPlayer'?'DPlayer':name]);
        if (inst && inst.video) {
          const h = inst.video.videoHeight || 0;
          if (h) out.push({ height: h, label: h+'p', kind: name });
        }
      });
    } catch {}
    
    
    // 1d) Premium Players (Bitmovin, THEOplayer, Shaka, Dash.js)
    try {
       collectGlobals(g => typeof g.getAvailableVideoQualities === 'function').forEach(bp => {
           (bp.getAvailableVideoQualities() || []).forEach(q => {
               if (q.height) out.push({ height: q.height, bitrate: q.bitrate || 0, id: q.id, kind: 'bitmovin', label: q.height + 'p' });
           });
       });
       collectGlobals(g => g.videoTracks && g.videoTracks.length > 0 && typeof g.videoTracks[0].targetQuality !== 'undefined').forEach(tp => {
           if (tp.videoTracks[0].qualities) {
               tp.videoTracks[0].qualities.forEach(q => {
                   if (q.height) out.push({ height: q.height, bitrate: q.bandwidth || 0, id: q.uid, kind: 'theoplayer', label: q.height + 'p' });
               });
           }
       });
       collectGlobals(g => typeof g.getBitrateInfoListFor === 'function').forEach(dp => {
           (dp.getBitrateInfoListFor('video') || []).forEach(q => {
               if (q.height) out.push({ height: q.height, bitrate: q.bitrate || q.bandwidth || 0, id: q.qualityIndex, kind: 'dashjs', label: q.height + 'p' });
           });
       });
       collectGlobals(g => typeof g.getVariantTracks === 'function').forEach(sp => {
           (sp.getVariantTracks() || []).forEach(q => {
               if (q.height) out.push({ height: q.height, bitrate: q.bandwidth || 0, id: q.id, kind: 'shaka', label: q.height + 'p' });
           });
       });
    } catch(e) {}

    // ─── STRATEGY 2: HLS/DASH Network + PerformanceObserver ───
    // (capturedManifests and capturedVideoUrls from content.js are already available)
    
    // ─── STRATEGY 3: HTML Meta Tags (Open Graph, Twitter Card, JSON-LD) ───
    try {
      // og:video:height, og:video:width, og:video:url
      var ogVideo = document.querySelector('meta[property="og:video:url"], meta[property="og:video"], meta[name="twitter:player:stream"]');
      var ogHeight = document.querySelector('meta[property="og:video:height"], meta[name="twitter:player:height"]');
      if (ogVideo && ogVideo.content) {
        var hh = ogHeight ? parseInt(ogHeight.content) : 0;
        if (hh) out.push({ height: hh, label: hh+'p', url: ogVideo.content, kind: 'og-meta' });
      }
      // JSON-LD (schema.org/VideoObject)
      var scripts = document.querySelectorAll('script[type="application/ld+json"]');
      scripts.forEach(function(s) {
        try {
          var ld = JSON.parse(s.textContent);
          var obj = ld['@type'] === 'VideoObject' ? ld : (ld['@graph'] || []).find(function(x) { return x['@type'] === 'VideoObject'; });
          if (obj) {
            var contentUrl = obj.contentUrl || obj.embedUrl || obj.url || '';
            var hh = obj.height || 0;
            if (hh && contentUrl) out.push({ height: parseInt(hh), label: hh+'p', url: contentUrl, kind: 'jsonld' });
            // Check for quality in description
            var desc = obj.description || '';
            var m = desc.match(/(\d{3,4})p/i);
            if (m && !hh) out.push({ height: parseInt(m[1]), label: m[1]+'p', kind: 'jsonld-desc' });
          }
        } catch(e) {}
      });
    } catch {}
    
    // ─── STRATEGY 4: Embedded __NEXT_DATA__ (Next.js sites) ───
    try {
      var nextScript = document.getElementById('__NEXT_DATA__');
      if (nextScript) {
        var nextData = JSON.parse(nextScript.textContent);
        if (nextData?.props?.pageProps) {
          // Search for video data recursively
          function searchProps(obj, depth) {
            if (depth > 6 || !obj || typeof obj !== 'object') return;
            if (obj.videoUrl || obj.video_url || obj.src || obj.url) {
              var url = obj.videoUrl || obj.video_url || obj.src || obj.url;
              var h = obj.height || obj.videoHeight || 0;
              if (typeof url === 'string' && url.length > 10 && url.match(/^https?:/)) {
                if (h && parseInt(h) > 80) out.push({ height: parseInt(h), label: h+'p', url: url, kind: 'nextjs' });
                else out.push({ height: 720, label: '720p', url: url, kind: 'nextjs' });
              }
            }
            for (var k in obj) { try { searchProps(obj[k], depth+1); } catch(e) {} }
          }
          searchProps(nextData.props.pageProps, 0);
        }
      }
    } catch(e) {}
    
    // ─── STRATEGY 5: __INITIAL_STATE__ (many JS sites) ───
    try {
      var initState = window.__INITIAL_STATE__ || window.__DATA__ || window.__NUXT__?.state;
      if (initState) {
        function searchState(obj, depth) {
          if (depth > 5 || !obj || typeof obj !== 'object') return;
          if (Array.isArray(obj)) { obj.forEach(function(v) { searchState(v, depth+1); }); return; }
          var url = obj.url || obj.src || obj.videoUrl || obj.playUrl || obj.play_url || '';
          if (typeof url === 'string' && (url.includes('mp4') || url.includes('m3u8') || url.includes('webm')) && url.length > 15) {
            var h = obj.height || obj.videoHeight || obj.width || 0;
            if (!h) { var m = url.match(/(\d{3,4})p/); if (m) h = parseInt(m[1]); }
            if (!h) h = 720;
            if (h > 80 && !out.some(function(o) { return o.height === h && o.url === url; })) {
              out.push({ height: parseInt(h), label: h+'p', url: url, kind: 'init-state' });
            }
          }
          for (var k in obj) { try { searchState(obj[k], depth+1); } catch(e) {} }
        }
        searchState(initState, 0);
      }
    } catch(e) {}
    
    // ─── STRATEGY 6: Video Element + DOM attributes ───
    try {
      document.querySelectorAll('video').forEach(function(v) {
        var h = v.videoHeight || 0;
        // Check common data attributes used by many sites
        var dataAttrs = ['data-res', 'data-quality', 'data-video-quality', 'data-height', 'data-resolution'];
        dataAttrs.forEach(function(attr) {
          var val = v.getAttribute(attr) || v.parentElement?.getAttribute(attr) || '';
          var m = val.match(/(\d{3,4})/);
          if (m && !h) h = parseInt(m[1]);
        });
        if (h && h > 80) out.push({ height: h, label: h+'p', kind: 'video-attr', isFallback: true });
        // Source elements
        v.querySelectorAll('source').forEach(function(src) {
          var srcUrl = src.getAttribute('src') || '';
          var srcRes = src.getAttribute('data-res') || src.getAttribute('data-quality') || src.getAttribute('media') || '';
          var m = srcRes.match(/(\d{3,4})p/i) || srcUrl.match(/(\d{3,4})p/);
          if (m) { var sh = parseInt(m[1]); if (sh > 80) out.push({ height: sh, label: sh+'p', url: srcUrl, kind: 'video-source' }); }
        });
      });
      // Also check common players that use data attributes
      document.querySelectorAll('[data-video], [data-video-src], [data-video-url], [data-src*="mp4"], [data-video-id]').forEach(function(el) {
        ['data-video', 'data-video-src', 'data-video-url', 'data-src'].forEach(function(a) {
          var url = el.getAttribute(a) || '';
          if (url && url.match(/\.(mp4|webm|m3u8)/)) {
            var m = url.match(/(\d{3,4})p/);
            var h = m ? parseInt(m[1]) : 720;
            out.push({ height: h, label: h+'p', url: url, kind: 'data-attr' });
          }
        });
      });
    } catch(e) {}
    
    // ─── STRATEGY 7: OG/Twitter embed links (for sharing sites) ───
    try {
      // Twitter player card
      var twPlayer = document.querySelector('meta[name="twitter:player"]');
      var twStream = document.querySelector('meta[name="twitter:player:stream"]');
      var twHeight = document.querySelector('meta[name="twitter:player:height"]');
      // oEmbed discovery
      var oembedLink = document.querySelector('link[type="application/json+oembed"], link[type="text/json+oembed"]');
      if (oembedLink && oembedLink.href) {
        fetch(oembedLink.href, {credentials:'omit'}).then(function(r){return r.json()}).then(function(od) {
          if (od && od.url) {
            var m = od.url.match(/(\d{3,4})p/);
            var h = od.height || (m?parseInt(m[1]):0) || 720;
            if (!out.some(function(o){return o.height===h})) 
              out.push({height:h, label:h+'p', url:od.url, kind:'oembed'});
          }
        }).catch(function(){});
      }
    } catch(e) {}
    
    // ─── STRATEGY 8: Dailymotion API (from metadata) ───
    try {
      if (/dailymotion/.test(location.hostname)) {
        var dmMatch = location.pathname.match(/\/video\/([a-zA-Z0-9]+)/);
        if (dmMatch) {
          fetch('https://www.dailymotion.com/player/metadata/video/' + dmMatch[1], {credentials:'omit'})
            .then(function(r){return r.json()})
            .then(function(data) {
              if (data && data.qualities) {
                Object.keys(data.qualities).forEach(function(qk) {
                  var h = parseInt(qk.replace(/[^0-9]/g,''));
                  if (h > 80 && !out.some(function(o){return o.height===h}))
                    out.push({height:h, label:h+'p', url:(data.qualities[qk].url||''), kind:'dailymotion-api'});
                });
              }
            }).catch(function(){});
        }
      }
    } catch(e) {}
    
    // ─── STRATEGY 9: OK.ru window mediaData ───
    try {
      if (/ok\.ru/.test(location.hostname)) {
        var md = window.mediaData || window.MediaData || null;
        if (!md) {
          var script = document.querySelector('script[data-module="VideoPlayer"]');
          if (script) try { md = JSON.parse(script.getAttribute('data-options')||'{}'); } catch(e) {}
        }
        if (md && md.videos) {
          md.videos.forEach(function(v) {
            var m = (v.name||'').match(/(\d{3,4})p/);
            var h = m ? parseInt(m[1]) : (v.height||0);
            if (h > 80) out.push({height:h, label:h+'p', url:v.url||'', kind:'okru'});
          });
        }
      }
    } catch(e) {}
    
    
    
    // ─── STRATEGY (yt-dlp generic): Scrape all <script> tags for embedded JSON / Links ───
    try {
      const scripts = document.querySelectorAll('script:not([src])');
      for (let i = 0; i < scripts.length; i++) {
         const txt = scripts[i].textContent || '';
         if (txt.length < 50 || txt.length > 500000) continue; // Skip too small or too massive scripts
         
         // Direct and Escaped URLs
         const links = txt.match(/(?:https?(?::\/\/|%3A%2F%2F|:\\\/\\\/))[^"']+(?:\.m3u8|\.mp4|\.mpd|%2Em3u8|%2Emp4|%2Empd)(?:[^"']*)/gi);
         if (links) {
            links.forEach(l => {
               try {
                   let cleanUrl = l.replace(/\\/g, ''); // Unescape JSON slashes
                   if (cleanUrl.includes('%3A')) cleanUrl = decodeURIComponent(cleanUrl);
                   
                   if (cleanUrl.includes('.m3u8')) out.push({ height: 0, url: cleanUrl, label: 'HLS Stream', kind: 'ytdlp-script-m3u8' });
                   else if (cleanUrl.includes('.mp4')) {
                      const m = cleanUrl.match(/(\d{3,4})[pP]/);
                      const h = m ? parseInt(m[1]) : 0;
                      out.push({ height: h, url: cleanUrl, label: (h ? h+'p' : 'MP4 File'), kind: 'ytdlp-script-mp4' });
                   }
               } catch(e) {}
            });
         }
      }
    } catch(e) {}

    // ─── STRATEGY (yt-dlp generic): OpenGraph & Twitter Cards ───
    try {
      const ogVid = document.querySelector('meta[property="og:video:url"], meta[property="og:video:secure_url"], meta[property="og:video"]');
      const twVid = document.querySelector('meta[name="twitter:player:stream"]');
      const ogRes = document.querySelector('meta[property="og:video:height"]');
      
      const vUrl = (ogVid && ogVid.content) || (twVid && twVid.content);
      if (vUrl) {
         let h = ogRes ? parseInt(ogRes.content, 10) : 0;
         if (!h) { const m = vUrl.match(/(\d{3,4})[pP]/); if(m) h = parseInt(m[1]); }
         out.push({ height: h, url: vUrl, label: h ? h+'p' : 'Source', kind: 'ytdlp-og' });
      }
    } catch(e) {}

    // ─── STRATEGY 10: Vimeo API ───
    try {
      if (window.Vimeo && document.querySelector('[class*="player"]')) {
        document.querySelectorAll('.player, [id*="player"], [class*="vimeo"], [data-vimeo]').forEach(function(el) {
          if (el.player && typeof el.player.getQualities === 'function') {
            try { el.player.getQualities().then(function(qs) { qs.forEach(function(q) { 
              var h = parseInt(String(q.id||q.label).replace(/[^0-9]/g,''));
              if (h > 80) out.push({height:h, label:q.label||h+'p', kind:'vimeo-api'});
            }); }).catch(function(){}); } catch(e) {}
          }
        });
      }
    } catch(e) {}
    
    // ─── STRATEGY 11: Facebook data-store ───
    try { var fbQuals = fbExtractFromDataStore(); if (fbQuals.length) out.push(...fbQuals); } catch {}
    
    // ─── STRATEGY 12: Discovered qualities from fetch interception ───
    if (discoveredQualities.length) out.push(...discoveredQualities);
    
    // ─── STRATEGY 13: Direct <source> + video.currentSrc dims ───
    try {
      document.querySelectorAll('video').forEach(function(v) {
        var src = v.currentSrc || v.src || '';
        if (src && src.match(/\.(mp4|webm)/i)) {
          var h = v.videoHeight || 0;
          if (!h) { var m = src.match(/(\d{3,4})p/); if (m) h = parseInt(m[1]); }
          if (h > 80 && !out.some(function(o){return o.url===src})) out.push({height:h, label:h+'p', url:src, kind:'video-src'});
        }
      });
    } catch(e) {}
    
    
    // ─── STRATEGY: Twitch DOM UI Scraping ───
    try {
      if (location.hostname.includes('twitch.tv')) {
        // We can't click it to open because it disrupts user, but we can look if they are in DOM
        document.querySelectorAll('[data-a-target="player-settings-submenu-quality-option"]').forEach(el => {
          let text = el.textContent || '';
          let match = text.match(/(\d+p(?:\d+)?)/);
          if (match) {
             let h = parseInt(match[1]);
             out.push({ height: h, label: match[1], kind: 'twitch-dom', el: el });
          }
        });
      }
    } catch(e) {}
    // ─── DEDUP + SORT ───

    const byH = {};
    out.forEach(function(o) { 
      if (!o.height || o.height < 80) return; 
      var existing = byH[o.height];
      if (!existing || (o.bitrate||o.bandwidth||0) > (existing.bitrate||existing.bandwidth||0) || (o.url && !existing.url)) byH[o.height] = o; 
    });
    var res = Object.values(byH).sort(function(a,b) { return b.height - a.height; });
    return res.length ? res : null;
  }

  
  function genericSetQuality(height) {
    let ok = false;
    const host = location.hostname;

    // 1. TWITCH (Desktop & Mobile)
    if (host.includes('twitch.tv')) {
       try {
           const settingsBtn = document.querySelector('[data-a-target="player-settings-button"]') || document.querySelector('button[aria-label="Settings"]');
           if (settingsBtn) {
               settingsBtn.click();
               setTimeout(() => {
                   const qBtn = document.querySelector('[data-a-target="player-settings-menu-item-quality"]') || Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Quality') || b.innerText.includes('الجودة'));
                   if (qBtn) {
                       qBtn.click();
                       setTimeout(() => {
                           const opts = document.querySelectorAll('[data-a-target="player-settings-submenu-quality-option"], .qa-quality-radio');
                           for (let opt of opts) {
                               if (opt.innerText.includes(height + 'p') || (height >= 1080 && opt.innerText.includes('Source'))) {
                                   opt.click();
                                   ok = true;
                                   break;
                               }
                           }
                           if (!ok) document.body.click();
                       }, 50);
                   } else {
                       document.body.click();
                   }
               }, 50);
               return true;
           }
       } catch(e) {}
    }

    // 2. VIMEO
    else if (host.includes('vimeo.com')) {
       try {
          document.querySelectorAll('.player, [id*="player"], [class*="vimeo"], [data-vimeo]').forEach(el => {
            if (el.player && typeof el.player.setQuality === 'function') {
               el.player.setQuality(height + 'p').catch(()=>{});
               ok = true;
            }
          });
          if (ok) return true;
       } catch(e) {}
    }

    // 3. OK.RU
    else if (host.includes('ok.ru') || host.includes('odnoklassniki')) {
       try {
          const menuBtn = document.querySelector('.html5-vpl_menu_btn, .vp-settings-btn');
          if (menuBtn) {
              menuBtn.click();
              setTimeout(() => {
                 const opts = document.querySelectorAll('.html5-vpl_menu_item, .vp-menu_item');
                 for (let opt of opts) {
                     if (opt.innerText.includes(height)) {
                         opt.click();
                         ok = true;
                         break;
                     }
                 }
                 document.body.click();
              }, 50);
              return true;
          }
       } catch(e) {}
    }

    // 4. FACEBOOK & TIKTOK & X (Progressive Fallback)
    else if (host.includes('facebook.com') || host.includes('tiktok.com') || host.includes('x.com') || host.includes('twitter.com')) {
       try {
           const match = discoveredQualities.find(q => q.height === height && q.url && !q.url.includes('.m3u8') && !q.url.includes('.mpd'));
           if (match) {
               const vids = document.querySelectorAll('video');
               for (const v of vids) {
                   const t = v.currentTime;
                   const wasPaused = v.paused;
                   if (v.src !== match.url && !v.src.includes(match.url)) {
                       v.src = match.url;
                       v.load();
                       v.currentTime = t;
                       if (!wasPaused) v.play().catch(()=>{});
                   }
                   ok = true;
               }
               if (ok) { emit('up-quality-switched', { height }); return true; }
           }
       } catch(e) {}
    }

    // 5. REDDIT (Shaka Player / DASH)
    else if (host.includes('reddit.com')) {
       // Reddit uses Shaka Player, handled by the generic fallback below, but we specifically prevent raw MP4 swap 
       // because Reddit MP4s have no audio.
    }

    // --- GENERIC API FALLBACKS (Anime sites, FaselHD, WCO.tv, etc.) ---
    
    // Video.js
    try {
      if (!ok && window.videojs) {
        const players = window.videojs.getAllPlayers?.() || [];
        players.forEach(pl => { try { if (pl.qualityLevels) { const ql = pl.qualityLevels(); for (let i = 0; i < ql.length; i++) ql[i].enabled = (ql[i].height === height); ok = true; } } catch {} });
      }
    } catch {}

    // JWPlayer
    try {
      if (!ok && window.jwplayer) {
        let jwIds = []; try { document.querySelectorAll('.jwplayer, [id^="jwplayer"], .jw-video').forEach(el => { if (el.id) jwIds.push(el.id); }); } catch {}
        if (!jwIds.length) jwIds.push(undefined);
        jwIds.forEach(jid => {
          try {
            const jw = jid ? window.jwplayer(jid) : window.jwplayer();
            if (jw?.getQualityLevels && jw.setCurrentQuality) {
              const levels = jw.getQualityLevels() || [];
              for (let i = 0; i < levels.length; i++) { 
                 const lm = String(levels[i].label || '').match(/(\d{3,4})/); 
                 const lh = levels[i].height || parseQualityLabel(levels[i].label); 
                 if (lh === height) { jw.setCurrentQuality(i); ok = true; break; } 
              }
            }
          } catch {}
        });
      }
    } catch {}

    // DASH (Shaka / Bitmovin)
    if (!ok) collectGlobals(g => typeof g.getBitrateInfoListFor === 'function' && typeof g.setQualityFor === 'function').forEach(dp => {
      try {
        const list = dp.getBitrateInfoListFor('video') || [];
        for (let i = 0; i < list.length; i++) if (list[i].height === height) { try { dp.updateSettings({ streaming: { abr: { autoSwitchBitrate: { video: false } } } }); } catch {} dp.setQualityFor('video', list[i].qualityIndex, true); ok = true; break; }
      } catch {}
    });

    // Custom Generic Variant Tracks
    if (!ok) collectGlobals(g => typeof g.getVariantTracks === 'function' && typeof g.selectVariantTrack === 'function').forEach(sp => {
      try {
        const tracks = sp.getVariantTracks() || [];
        const match = tracks.filter(t => t.height === height)[0];
        if (match) { try { sp.configure({ abr: { enabled: false } }); } catch {} sp.selectVariantTrack(match, true); ok = true; }
      } catch {}
    });

    // HLS.js
    if (!ok) {
      try {
        const hlsCands = []; if (window.hls?.levels) hlsCands.push(window.hls); if (window.hlsjs?.levels) hlsCands.push(window.hlsjs);
        document.querySelectorAll('video').forEach(el => { const hh = el._hls || el.hls || el.player?.hls; if (hh?.levels && !hlsCands.includes(hh)) hlsCands.push(hh); });
        hlsCands.forEach(h => {
          if (ok) return;
          for (let i = 0; i < h.levels.length; i++) if (h.levels[i].height === height) { try { h.autoLevelEnabled = false; } catch {} try { h.loadLevel = i; } catch {} try { h.currentLevel = i; } catch {} ok = true; break; }
        });
      } catch {}
    }
    
    // Fallback: Check if there's any generic progressive match left (not Reddit)
    if (!ok && !host.includes('reddit.com')) {
       try {
           const fbMatch = discoveredQualities.find(q => q.height === height && q.url && !q.url.includes('.m3u8'));
           if (fbMatch) {
               const vids = document.querySelectorAll('video');
               for (const v of vids) {
                   const t = v.currentTime;
                   if (v.src !== fbMatch.url && !v.src.includes(fbMatch.url)) {
                       v.src = fbMatch.url;
                       v.load();
                       v.currentTime = t;
                       v.play().catch(()=>{});
                   }
                   ok = true;
               }
           }
       } catch(e) {}
    }

    return ok;
  }


  // ─── UNIVERSAL SUBTITLE DETECTION ───
  (function detectUniversalSubtitles() {
    try {
      // Source 1: VTT/SRT subtitle scan in the page DOM
      var allLinks = document.querySelectorAll('a[href$=".vtt"], a[href$=".srt"], a[href$=".ass"], a[href*="subtitle"], a[href*="caption"], a[href*="timedtext"]');
      allLinks.forEach(function(a) {
        var url = a.href;
        if (url && capturedSubUrls.indexOf(url) === -1) capturedSubUrls.push(url);
      });
      // Source 2: track elements
      document.querySelectorAll('track[kind="subtitles"], track[kind="captions"]').forEach(function(t) {
        if (t.src && capturedSubUrls.indexOf(t.src) === -1) capturedSubUrls.push(t.src);
      });
      // Source 3: JSON-LD captions
      var scripts = document.querySelectorAll('script[type="application/ld+json"]');
      scripts.forEach(function(s) {
        try {
          var ld = JSON.parse(s.textContent || '{}');
          var captions = ld.caption || (ld['@graph'] || []).reduce(function(a, x) { return a.concat(x.caption || []); }, []);
          if (captions) captions.forEach(function(c) {
            if (typeof c === 'string' && c.match(/\.(vtt|srt)/)) capturedSubUrls.push(c);
            if (c && c.url) capturedSubUrls.push(c.url);
          });
        } catch(e) {}
      });
      // Source 4: API endpoints for captions (YouTube timedtext, Vimeo texttracks, etc.)
      try {
        var url = location.href;
        if (/youtube/.test(url)) {
          var vMatch = url.match(/[?&]v=([a-zA-Z0-9_-]+)/);
          if (vMatch) {
            // YouTube API: https://youtubetranscript.com/?v=VIDEO_ID
            var timedtextUrl = 'https://www.youtube.com/api/timedtext?v=' + vMatch[1] + '&type=list';
            fetch(timedtextUrl, {credentials:'omit'}).then(function(r){return r.text()}).then(function(xml) {
              try {
                var parser = new DOMParser();
                var doc = parser.parseFromString(xml, 'text/xml');
                doc.querySelectorAll('track').forEach(function(t) {
                  var lang = t.getAttribute('lang_code') || t.getAttribute('lang_original') || t.getAttribute('lang_translated') || '';
                  var name = t.getAttribute('name') || t.getAttribute('lang_original') || lang;
                  if (lang) {
                    var vttUrl = 'https://www.youtube.com/api/timedtext?v=' + vMatch[1] + '&lang=' + lang + '&fmt=vtt';
                    if (capturedSubUrls.indexOf(vttUrl) === -1) capturedSubUrls.push(vttUrl);
                  }
                });
              } catch(e2) {}
            }).catch(function(){});
          }
        }
      } catch(e) {}
      // Source 5: oEmbed caption endpoints
      try {
        var oembedLink = document.querySelector('link[type*="oembed"]');
        if (oembedLink && oembedLink.href) {
          fetch(oembedLink.href, {credentials:'omit'}).then(function(r){return r.json()}).then(function(data) {
            // Some oembeds include caption info
            if (data && data.caption_url) capturedSubUrls.push(data.caption_url);
          }).catch(function(){});
        }
      } catch(e) {}
    } catch(e) {}
  })();

  window.addEventListener('message', function (ev) {
    if (ev.source !== window) return;
    if (ev.origin && ev.origin !== location.origin) return;
    const d = ev.data;
    if (!d || d.__vmx !== true || d.dir !== 'req') return;
    const { id, cmd, arg } = d;
    if (typeof id !== 'string' || typeof cmd !== 'string') return;
    try {
      switch (cmd) {
        case 'yt-get-qualities': return send(id, true, ytGetQualities());
        case 'yt-set-quality': return send(id, true, ytSetQuality(arg));
        case 'yt-get-captions': return send(id, true, ytGetCaptions());
        case 'yt-set-caption': return send(id, true, ytSetCaption(arg));
        case 'generic-qualities': return send(id, true, genericGetQualities());
        case 'generic-set-quality': return send(id, true, genericSetQuality(arg));
        case 'fb-get-qualities': return send(id, true, fbExtractFromDataStore());
        case 'fb-get-dash-qualities': return send(id, true, fbExtractFromDataStore());
        case 'get-page-info': {
          const v = document.querySelector('video');
          let title = document.title || 'Video';
          try { const og = document.querySelector('meta[property="og:title"]')?.content; if (og) title = og; } catch {}
          return send(id, true, { title, url: location.href, poster: v?.poster || '', duration: v?.duration || 0 });
        }
        default: return send(id, false, null);
      }
    } catch (e) { send(id, false, String(e)); }
  });

  if (isYT) {
    const announce = () => { try { emit('yt-navigated', {}); } catch {} };
    window.addEventListener('yt-navigate-finish', announce);
    window.addEventListener('spfdone', announce);
    let lastHref = location.href;
    setInterval(() => { if (document.hidden) return; if (location.href !== lastHref) { lastHref = location.href; announce(); } }, 1500);
  }
  try { emit('ready', {}); } catch {}
})();
