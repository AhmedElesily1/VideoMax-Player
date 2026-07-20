/**
 * VideoMax Pro v23 - Launcher bar
 * Play + Save (Playlist) - No download
 * Uses VideoMax player's __VMX_EXTERNAL_COMMAND__ interface
 */
(function () {
  'use strict';
  if (window.__VMX_LAUNCHER_V23__) return;
  window.__VMX_LAUNCHER_V23__ = true;

  const api = (typeof browser !== 'undefined' && browser.runtime) ? browser : chrome;
  const DRM_HOST_RE = /(^|\.)(netflix\.com|disneyplus\.com|hotstar\.com|primevideo\.com|amazon\.[a-z.]+|max\.com|hbomax\.com|hulu\.com|tv\.apple\.com|peacocktv\.com|paramountplus\.com|crunchyroll\.com|shahid\.net|shahid\.mbc\.net|watchit\.com|starzplay\.com|osnplus\.com)$/i;
  const pageDrm = DRM_HOST_RE.test(location.hostname) || /disneyplus|primevideo|hbomax|peacocktv|paramountplus/i.test(location.hostname);

  let records = new Map();
  let dismissedVideos = new WeakSet();
  let isBlacklisted = false;
  let layoutQueued = false;
  let currentLang = 'en';

  const T = {
    en: { play: 'Play', save: 'Save', saved: 'Saved ✓', detecting: 'Detecting quality…', qualities: 'qualities', drm: 'DRM • Play only' },
    ar: { play: 'تشغيل', save: 'حفظ', saved: 'تم الحفظ ✓', detecting: 'جاري كشف الجودة…', qualities: 'جودات', drm: 'DRM • تشغيل فقط' }
  };
  function tr(k) { return (T[currentLang] || T.en)[k] || T.en[k] || k; }

  function loadLanguage() {
    try {
      const st = api?.storage?.local;
      if (!st) return;
      st.get(['vm_defaults'], (r) => {
        currentLang = (r?.vm_defaults?.lang === 'ar') ? 'ar' : 'en';
        updateLangUI();
      });
    } catch {}
  }
  function updateLangUI() {
    records.forEach(rec => {
      try {
        rec.bar.style.direction = currentLang === 'ar' ? 'rtl' : 'ltr';
        const p = rec.play?.querySelector('span:last-child'); if (p) p.textContent = tr('play');
        const s = rec.save?.querySelector('span:last-child'); if (s) s.textContent = tr('save');
        if (pageDrm && rec.quality) rec.quality.textContent = tr('drm');
      } catch {}
    });
  }

  function qualitySummary(video, extra) {
    if (extra && extra.qualities && extra.qualities.length) {
      const heights = extra.qualities.map(q => q.height).filter(Boolean).sort((a, b) => b - a);
      if (heights.length) {
        const hasLow = heights.some(h => h <= 360);
        const lowTag = hasLow ? ' • 144p🌱' : '';
        return (heights[0] >= 2160 ? '4K' : heights[0] + 'p') + (heights.length > 1 ? ' • ' + heights.length + 'q' : '') + lowTag;
      }
    }
    return video.videoHeight ? video.videoHeight + 'p' : tr('detecting');
  }

  function command(video, name, payload) {
    try { if (typeof window.__VMX_EXTERNAL_COMMAND__ === 'function') return window.__VMX_EXTERNAL_COMMAND__(video, name, payload || {}); } catch {}
    return false;
  }

  function saveToPlaylist(video) {
    try {
      const title = document.title || 'Video';
      const pageUrl = location.href;
      let poster = video.poster || '';
      let thumbData = '';
      try {
        if (!poster && video.videoWidth) {
          const c = document.createElement('canvas');
          c.width = 160; c.height = 90;
          const ctx = c.getContext('2d');
          ctx.drawImage(video, 0, 0, 160, 90);
          thumbData = c.toDataURL('image/jpeg', 0.6);
        }
      } catch {}
      const curSrc = video.currentSrc || video.src || '';
      const duration = video.duration || 0;
      const id = 'vmx_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
      const payload = { id, title, pageUrl, videoUrl: curSrc, poster: poster || thumbData, duration, host: location.hostname, addedAt: Date.now() };

      if (!api?.storage?.local) return;
      api.storage.local.get(['up_playlist'], (r) => {
        let list = r.up_playlist || [];
        const exists = list.findIndex(i => i.pageUrl === pageUrl);
        if (exists >= 0) {
          const ex = list.splice(exists, 1)[0];
          if (payload.poster && !ex.poster) ex.poster = payload.poster;
          list.unshift(ex);
        } else {
          list.unshift(payload);
        }
        if (list.length > 300) list = list.slice(0, 300);
        api.storage.local.set({ up_playlist: list }, () => {
          try {
            records.forEach(rec => {
              if (rec.video === video && rec.save) {
                const txt = rec.save.querySelector('span:last-child');
                if (txt) txt.textContent = tr('saved');
                rec.save.classList.add('saved');
                setTimeout(() => { if (txt) txt.textContent = tr('save'); rec.save.classList.remove('saved'); }, 2200);
              }
            });
            try { window.postMessage({ __vmx: true, dir: 'playlist-updated', playlist: list }, location.origin); } catch {}
          } catch {}
        });
      });
    } catch {}
  }

  function buildRecord(video) {
    const hostEl = document.createElement('div');
    hostEl.setAttribute('data-videomax-launcher', '23');
    hostEl.style.cssText = 'position:fixed;left:0;top:0;width:auto;height:50px;z-index:2147483647 !important;pointer-events:none;display:none;';
    const root = hostEl.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = [
      ':host{all:initial}',
      '*{box-sizing:border-box}',
      '.bar{height:46px;display:flex;align-items:center;gap:8px;padding:6px 9px;border:1px solid rgba(255,255,255,.12);border-radius:0 0 14px 14px;background:linear-gradient(180deg,rgba(20,20,28,.98),rgba(8,8,12,.98));box-shadow:0 10px 28px rgba(0,0,0,.45),0 0 0 1px rgba(255,255,255,.04) inset;backdrop-filter:blur(14px);font:700 13px/1.1 system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#fff;direction:ltr;pointer-events:auto;white-space:nowrap;max-width:min(96vw,660px);overflow:hidden;transition:transform .2s,opacity .2s}',
      '.bar:hover{transform:translateY(1px);box-shadow:0 12px 32px rgba(0,0,0,.5)}',
      'button{height:36px;border:0;border-radius:10px;padding:0 15px;display:inline-flex;align-items:center;gap:7px;color:#fff;font:800 13px system-ui,sans-serif;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent;transition:all .15s;background:linear-gradient(135deg,#e50914,#b20710);box-shadow:0 3px 12px rgba(229,9,20,.35)}',
      'button:hover{filter:brightness(1.1);transform:translateY(-1px);box-shadow:0 5px 16px rgba(229,9,20,.45)}button:active{transform:scale(.97)}',
      '.save{background:linear-gradient(135deg,#23232d,#1a1a24)!important;border:1px solid rgba(255,255,255,.14)!important;box-shadow:none!important;color:rgba(255,255,255,.9)!important}',
      '.save:hover{background:rgba(255,255,255,.1)!important;color:#fff!important}',
      '.save.saved{background:linear-gradient(135deg,#16a34a,#15803d)!important;color:#fff!important;border-color:rgba(34,197,94,.3)!important}',
      '.dismiss{background:rgba(255,255,255,.08)!important;color:rgba(255,255,255,.6)!important;width:32px!important;min-width:32px!important;padding:0!important;border-radius:50%!important;font-size:18px!important;box-shadow:none!important}.dismiss:hover{background:#b42318!important;color:#fff!important}',
      '.icon{font-size:15px;line-height:1}',
      '.quality{direction:ltr;max-width:200px;overflow:hidden;text-overflow:ellipsis;color:rgba(255,255,255,.72);font:700 11px system-ui;padding:0 8px;background:rgba(255,255,255,.06);border-radius:8px;height:28px;display:inline-flex;align-items:center;border:1px solid rgba(255,255,255,.06)}',
      '.quality.low{background:rgba(255,204,0,.08);border-color:rgba(255,204,0,.15);color:#ffcc66}',
      '.brand{color:#e50914;font:900 11px system-ui;letter-spacing:.3px;padding:0 6px;direction:ltr;display:flex;align-items:center;gap:4px}',
      '.brand::before{content:"";width:6px;height:6px;border-radius:50%;background:#e50914;box-shadow:0 0 8px #e50914;display:inline-block}',
      '@media(max-width:560px){.bar{gap:5px;padding:5px 7px}.brand{display:none}button{padding:0 12px;height:34px}.quality{max-width:120px;font-size:10px}}'
    ].join('');
    const bar = document.createElement('div');
    bar.className = 'bar';
    const play = document.createElement('button');
    play.className = 'play';
    play.type = 'button';
    const playIcon = document.createElement('span'); playIcon.className = 'icon'; playIcon.textContent = '▶';
    const playLabel = document.createElement('span'); playLabel.textContent = tr('play');
    play.append(playIcon, playLabel);

    const saveBtn = document.createElement('button');
    saveBtn.className = 'save';
    saveBtn.type = 'button';
    const saveIcon = document.createElement('span'); saveIcon.className = 'icon'; saveIcon.textContent = '＋';
    const saveLabel = document.createElement('span'); saveLabel.textContent = tr('save');
    saveBtn.append(saveIcon, saveLabel);

    const dismiss = document.createElement('button');
    dismiss.className = 'dismiss';
    dismiss.type = 'button';
    dismiss.title = 'Dismiss';
    dismiss.textContent = '×';

    const quality = document.createElement('span'); quality.className = 'quality'; quality.textContent = qualitySummary(video);
    const brand = document.createElement('span'); brand.className = 'brand'; brand.textContent = 'VideoMax';

    bar.append(play, saveBtn, dismiss, quality, brand);
    root.append(style, bar);
    (document.documentElement || document.body).appendChild(hostEl);

    const record = { video, host: hostEl, root, bar, play, save: saveBtn, dismiss, quality, lastQualities: [] };

    // Play button -> uses VideoMax's player via __VMX_EXTERNAL_COMMAND__
    play.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      const ok = command(video, 'play-fullscreen', { qualities: record.lastQualities });
      if (!ok) {
        setTimeout(() => { command(video, 'play-fullscreen', { qualities: record.lastQualities }); }, 100);
      }
    });

    saveBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); saveToPlaylist(video); });

    dismiss.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      try { dismissedVideos.add(video); } catch {}
      try { command(video, 'dismiss', {}); } catch {}
      try { record.resizeObserver?.disconnect(); } catch {}
      try { hostEl.remove(); } catch {}
      records.delete(video);
    });

    ['loadedmetadata', 'loadeddata', 'durationchange', 'emptied'].forEach(n => {
      video.addEventListener(n, () => { scheduleLayout(); updateQualityForRecord(record); }, { passive: true });
    });
    video.addEventListener('encrypted', () => { if (pageDrm) applyDrm(); }, true);

    try {
      if (window.ResizeObserver) {
        record.resizeObserver = new ResizeObserver(scheduleLayout);
        record.resizeObserver.observe(video);
      }
    } catch {}

    records.set(video, record);
    setTimeout(() => updateQualityForRecord(record), 800);
    return record;
  }

  function applyDrm() {
    records.forEach(rec => {
      rec.quality.textContent = tr('drm');
      rec.quality.classList.add('low');
      rec.bar.classList.add('drm');
    });
  }

  async function updateQualityForRecord(record) {
    try {
      const h = record.video.videoHeight;
      if (h) record.quality.textContent = h + 'p' + (h <= 360 ? ' 🌱' : '');
    } catch {}
  }

  function validVideo(video) {
    if (!(video instanceof HTMLVideoElement) || !video.isConnected || dismissedVideos.has(video)) return false;
    const r = video.getBoundingClientRect();
    const isOkRu = /ok\.ru|odnoklassniki/.test(location.hostname);
    if (isOkRu) return true;
    const minW = 50;
    const minH = 30;
    return (r.width >= minW && r.height >= minH) || video.videoWidth >= 50 || video.videoHeight >= 50 || !!video.src || !!video.currentSrc || video.readyState >= 1;
  }

  function buildIframeRecord(iframe) {
    // Record for iframe-based videos (OK.ru, etc.)
    const hostEl = document.createElement('div');
    hostEl.setAttribute('data-videomax-launcher', '23-iframe');
    hostEl.style.cssText = 'position:fixed;left:0;top:0;width:auto;height:50px;z-index:2147483647 !important;pointer-events:none;display:none;';
    const root = hostEl.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = ':host{all:initial}*{box-sizing:border-box}.bar{height:46px;display:flex;align-items:center;gap:8px;padding:6px 9px;border:1px solid rgba(255,255,255,.12);border-radius:0 0 14px 14px;background:linear-gradient(180deg,rgba(20,20,28,.98),rgba(8,8,12,.98));box-shadow:0 10px 28px rgba(0,0,0,.45);backdrop-filter:blur(14px);font:700 13px/1.1 system-ui;color:#fff;direction:ltr;pointer-events:auto;white-space:nowrap;max-width:min(96vw,660px);overflow:hidden}button{height:36px;border:0;border-radius:10px;padding:0 15px;display:inline-flex;align-items:center;gap:7px;color:#fff;font:800 13px system-ui;cursor:pointer;background:linear-gradient(135deg,#e50914,#b20710);box-shadow:0 3px 12px rgba(229,9,20,.35)}button:hover{filter:brightness(1.1);transform:translateY(-1px)}.save{background:#23232d!important;border:1px solid rgba(255,255,255,.14)!important}.dismiss{background:rgba(255,255,255,.08)!important;width:32px!important;min-width:32px!important;padding:0!important;border-radius:50%!important;font-size:18px!important}.icon{font-size:15px}.quality{max-width:200px;overflow:hidden;text-overflow:ellipsis;color:rgba(255,255,255,.72);font:700 11px system-ui;padding:0 8px;background:rgba(255,255,255,.06);border-radius:8px;height:28px;display:inline-flex;align-items:center}.brand{color:#e50914;font:900 11px system-ui;padding:0 6px}';
    const bar = document.createElement('div'); bar.className = 'bar';
    const play = document.createElement('button'); play.className = 'play'; play.type = 'button';
    const playIcon = document.createElement('span'); playIcon.className = 'icon'; playIcon.textContent = '▶';
    const playLabel = document.createElement('span'); playLabel.textContent = tr('play');
    play.append(playIcon, playLabel);
    const dismiss = document.createElement('button'); dismiss.className = 'dismiss'; dismiss.type = 'button'; dismiss.textContent = '×';
    const quality = document.createElement('span'); quality.className = 'quality'; quality.textContent = 'detecting...';
    const brand = document.createElement('span'); brand.className = 'brand'; brand.textContent = 'VideoMax';
    bar.append(play, dismiss, quality, brand);
    root.append(style, bar);
    (document.documentElement || document.body).appendChild(hostEl);
    const record = { video: iframe, host: hostEl, root, bar, play, save: null, dismiss, quality, isIframe: true };
    play.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      try { (iframe.requestFullscreen || iframe.webkitRequestFullscreen).call(iframe); } catch {}
      try { iframe.contentWindow && iframe.contentWindow.postMessage({ __vmx: true, dir: 'play-request' }, '*'); } catch {}
    });
    dismiss.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      try { hostEl.remove(); } catch {}
      records.delete(iframe);
    });
    records.set(iframe, record);
    return record;
  }

  function scan(root) {
    if (isBlacklisted) return;
    root = root || document;
    try {
      root.querySelectorAll('video').forEach(v => { if (!records.has(v) && validVideo(v)) buildRecord(v); });
      if (/ok\.ru|odnoklassniki/.test(location.hostname)) {
        root.querySelectorAll('object, embed').forEach(el => {
          if (!records.has(el) && el.getBoundingClientRect().width >= 200) {
             buildIframeRecord(el); // Treat object/embed like iframe to show overlay
          }
        });
        root.querySelectorAll('.html5-vpl, #vp-video, .vp_video, .video, [class*="video"], #player, .player').forEach(el => {
          const v = el.querySelector ? el.querySelector('video') : null;
          if (v && !records.has(v) && validVideo(v)) buildRecord(v);
          if (!v && el.getBoundingClientRect && el.getBoundingClientRect().width >= 200) {
            try {
              const obs = new MutationObserver(() => {
                const vv = el.querySelector('video');
                if (vv && !records.has(vv) && validVideo(vv)) buildRecord(vv);
              });
              obs.observe(el, { childList: true, subtree: true });
            } catch {}
          }
        });
      }
      root.querySelectorAll('iframe').forEach(function(f) {
        if (!records.has(f) && f.getBoundingClientRect) {
          var r = f.getBoundingClientRect();
          if (r.width >= 120 && r.height >= 80) {
            // Build iframe-based record for ANY iframe
            if (!records.has(f)) buildIframeRecord(f);
          }
        }
      });

            root.querySelectorAll('shreddit-player, shreddit-player-2, video-card, content-video-player, [class*="player"]').forEach(node => { if (node.shadowRoot) scan(node.shadowRoot); });
    } catch {}
    scheduleLayout();
  }

  function layoutAll() {
    layoutQueued = false;
    const fullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement);
    const vw = window.innerWidth || 0, vh = window.innerHeight || 0;
    records.forEach((rec, video) => {
      if (!video.isConnected) {
        try { rec.resizeObserver?.disconnect(); } catch {}
        try { rec.host.remove(); } catch {}
        records.delete(video);
        return;
      }
      let r;
      try { r = video.getBoundingClientRect(); } catch { r = null; }
      const isOkRu = /ok\\.ru|odnoklassniki/.test(location.hostname);
      const minVisibleW = isOkRu ? 10 : 50;
      const minVisibleH = isOkRu ? 10 : 30;
      const visible = !fullscreen && r && r.width >= minVisibleW && r.height >= minVisibleH && r.bottom > 0 && r.right > 0 && r.top < vh && r.left < vw;
      if (!visible) { rec.host.style.display = 'none'; return; }
      let top = r.bottom + 6;
      try { if (top + 50 > vh) top = Math.max(r.top + 2, vh - 52); } catch {}
      rec.host.style.display = 'block';
      rec.host.style.left = Math.max(4, Math.min(r.left, vw - 180)) + 'px';
      rec.host.style.top = top + 'px';
      rec.host.style.maxWidth = Math.max(180, Math.min(r.width, vw - 8)) + 'px';
    });
  }

  function scheduleLayout() {
    if (layoutQueued) return;
    layoutQueued = true;
    requestAnimationFrame(layoutAll);
  }

  window.__VMX_LAUNCHER_LAYOUT__ = scheduleLayout;

  window.addEventListener('scroll', scheduleLayout, { passive: true, capture: true });
  window.addEventListener('resize', scheduleLayout, { passive: true });
  document.addEventListener('fullscreenchange', () => {
    scheduleLayout();
    if (!document.fullscreenElement) {
      setTimeout(() => { scan(document); layoutAll(); }, 300);
    }
  }, true);
  document.addEventListener('webkitfullscreenchange', scheduleLayout, true);

  window.addEventListener('message', (ev) => {
    const d = ev.data;
    if (!d || d.__vmx !== true) return;
    
    // Accept play-request from parent window (iframe relay)
    if (d.dir === 'play-request' && window.top !== window) {
      records.forEach((rec, video) => {
        if (!rec.isIframe && video instanceof HTMLVideoElement) {
          command(video, 'play-fullscreen', { qualities: rec.lastQualities });
        }
      });
      return;
    }

    if (ev.source !== window) return;

    if (d.dir === 'up-quality-info') {
      records.forEach(rec => {
        if (d.quality) {
          rec.quality.textContent = d.quality;
          if (d.quality.includes('144') || d.quality.includes('240') || d.quality.includes('360')) rec.quality.classList.add('low');
          else rec.quality.classList.remove('low');
        }
      });
    }

    if (d.dir === 'up-quality-batch' || d.dir === 'fb-qualities') {
      records.forEach(rec => {
        if (d.qualities && d.qualities.length > 0) {
          const heights = d.qualities.map(q => q.height || 0).filter(Boolean).sort((a,b) => b-a);
          if (heights.length) {
            const txt = heights[0] + 'p' + (heights.length > 1 ? ' • ' + heights.length + 'q' : '');
            rec.quality.textContent = txt;
            if (heights.some(h => h <= 360)) rec.quality.classList.add('low');
            else rec.quality.classList.remove('low');
          }
        }
      });
    }
  });

  const observer = new MutationObserver(muts => {
    let need = false;
    muts.forEach(m => { if (m.addedNodes?.length) need = true; });
    if (need) setTimeout(() => scan(document), 80); else scheduleLayout();
  });
  try { observer.observe(document.documentElement, { childList: true, subtree: true }); } catch {}

  loadLanguage();
  try {
    api?.storage?.local?.get(['vm_blacklist'], (r) => {
      if ((r?.vm_blacklist || []).some(b => location.hostname.includes(b))) {
        isBlacklisted = true;
        records.forEach(rec => { try { rec.host.remove(); } catch(e){} });
        records.clear();
      }
    });
  } catch(e) {}
  try {
    if (api?.runtime?.onMessage) {
      api.runtime.onMessage.addListener(msg => {
        if (msg?.type === 'vm_defaults_changed' && msg.defaults) {
          currentLang = msg.defaults.lang === 'ar' ? 'ar' : 'en';
          updateLangUI();
        }
        return false;
      });
    }
  } catch {}

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => scan(document));
  else scan(document);
  [500, 1500, 3500, 7000].forEach(d => setTimeout(() => scan(document), d));
  const SCAN_INTERVAL = /ok\\.ru|odnoklassniki/.test(location.hostname) ? 1000 : 2500;
  setInterval(() => { if (!document.hidden) { scan(document); layoutAll(); } }, SCAN_INTERVAL);
})();
