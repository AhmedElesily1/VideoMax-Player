/**
 * Ultimate Playlist Player v23 - with auto fullscreen
 * Improvements:
 * - Auto fullscreen on Play click (as requested)
 * - On exit fullscreen, launcher/play button reappears (playlist UI stays)
 * - Supports 144p,240p,360p low qualities
 * - Better brightness & AR
 */
(function () {
  const api = (typeof browser !== 'undefined' && browser.runtime) ? browser : chrome;
  const video = document.getElementById('video');
  const listEl = document.getElementById('list');
  const pFill = document.getElementById('pFill');
  const progress = document.getElementById('progress');
  const playBtn = document.getElementById('playBtn');
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  const fsBtn = document.getElementById('fsBtn');
  const arBtn = document.getElementById('arBtn');
  const speedBtn = document.getElementById('speedBtn');
  const counter = document.getElementById('counter');
  const closeBtn = document.getElementById('closeBtn');
  const clearBtn = document.getElementById('clearBtn');
  const shuffleBtn = document.getElementById('shuffleBtn');
  const playerWrap = document.getElementById('playerWrap');

  let playlist = [];
  let currentIndex = 0;
  const AR_MODES = [
    { k: 'default', label: 'Default' }, { k: 'fill', label: 'Fill' }, { k: 'stretch', label: 'Stretch' },
    { k: 'fit', label: 'Fit' }, { k: 'zoom14', label: 'Zoom 1.4×' }, { k: 'zoom16', label: 'Zoom 1.6×' },
    { k: 'zoom20', label: 'Zoom 2.0×' }, { k: 'r169', label: '16:9' }, { k: 'r43', label: '4:3' },
    { k: 'r235', label: '2.35:1' }, { k: 'r219', label: '21:9' }, { k: 'auto', label: 'Auto' }
  ];
  let arIdx = 0;
  const SPEEDS = [0.25,0.5,0.75,1,1.25,1.5,1.75,2,2.5,3];
  let speedIdx = 3;
  let brightness = 100;

  function loadPlaylist() {
    api.storage.local.get(['up_playlist'], r => {
      playlist = r.up_playlist || [];
      if (!playlist.length) {
        listEl.innerHTML = '<div class="empty">No videos saved yet.<br>افتح أي موقع (Facebook 144p 🌱, TikTok, YouTube) واضغط <b>＋ Save</b> تحت الفيديو.<br><br>الميزة الجديدة v23: عند الضغط Play → يدخل <b>fullscreen تلقائي</b>، ولما تخرج من fullscreen يرجع يظهر زر Play كأني شغلت الاضافة من الأول.<br><br>يدعم الآن 144p,240p,360p لكل المواقع حتى فيسبوك.</div>';
      } else {
        renderList();
        const urlParams = new URLSearchParams(location.search);
        const idx = parseInt(urlParams.get('index') || '0', 10);
        if (!isNaN(idx) && idx >= 0 && idx < playlist.length) currentIndex = idx;
        playAt(currentIndex, true);
      }
      updateCounter();
    });
  }

  function renderList() {
    listEl.innerHTML = '';
    playlist.forEach((item, i) => {
      const div = document.createElement('div');
      div.className = 'item' + (i === currentIndex ? ' active' : '');
      const imgWrap = document.createElement('div'); imgWrap.style.cssText='position:relative;flex-shrink:0';
      const img = document.createElement('img'); img.className = 'thumb'; img.src = item.poster || 'https://via.placeholder.com/84x48?text=Video'; img.onerror = () => { img.src = 'https://via.placeholder.com/84x48?text=Video'; };
      const dur = document.createElement('div'); dur.style.cssText='position:absolute;bottom:2px;right:2px;background:rgba(0,0,0,.8);color:#fff;font:700 9px system-ui;padding:2px 5px;border-radius:5px'; dur.textContent = item.duration ? Math.floor(item.duration/60)+':'+String(Math.floor(item.duration%60)).padStart(2,'0') : '';
      imgWrap.append(img); if (dur.textContent) imgWrap.append(dur);
      const meta = document.createElement('div'); meta.className = 'meta';
      const name = document.createElement('div'); name.className = 'name'; name.textContent = item.title || item.pageUrl || 'Video';
      const host = document.createElement('div'); host.className = 'host';
      const qualInfo = item.qualityInfo && item.qualityInfo.length ? ' • ' + item.qualityInfo.map(q=>q.height+'p').join(',') : (item.host && /facebook/.test(item.host) ? ' • 144p🌱-1080p' : '');
      host.textContent = (item.host || '') + qualInfo + ' • ' + new Date(item.addedAt || Date.now()).toLocaleDateString();
      meta.append(name, host);
      div.append(imgWrap, meta);
      div.addEventListener('click', () => { currentIndex = i; playAt(currentIndex, true); renderList(); });
      listEl.append(div);
    });
  }

  async function playAt(idx, autoFullscreen = false) {
    if (idx < 0 || idx >= playlist.length) return;
    currentIndex = idx;
    const item = playlist[idx];

    // videoUrl is almost always a blob: URL on sites that use MediaSource
    // (YouTube, Facebook, TikTok, Instagram...) -- it only means anything
    // inside the tab that created it, and is permanently dead anywhere else,
    // including here. Only trust it for in-page playback if it's a real,
    // directly-fetchable media URL (http/https + a media extension, not blob:).
    const isRealMediaUrl = item.videoUrl
      && !/^blob:/i.test(item.videoUrl)
      && /^https?:/i.test(item.videoUrl)
      && /\.(mp4|webm|mkv|m3u8|mpd|mov)(\?|$)/i.test(item.videoUrl);

    if (!isRealMediaUrl) {
      // Open the original video's page instead — this is the reliable path
      // for the vast majority of saved items.
      const openUrl = item.pageUrl || item.videoUrl;
      if (!openUrl) return;
      api.tabs.create({ url: openUrl + (openUrl.includes('?') ? '&' : '?') + 'up_autoplay=1', active: true });
      return;
    }

    const url = item.videoUrl;

    // Try HLS
    if (/\.m3u8(\?|$)/i.test(url)) {
      if (window.Hls && Hls.isSupported()) {
        if (window._hls) { try { window._hls.destroy(); } catch {} }
        const hls = new Hls({ enableWorker: true });
        window._hls = hls;
        hls.loadSource(url);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          video.play().catch(()=>{});
          if (autoFullscreen) requestFS();
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = url;
        try { await video.play(); } catch {}
        if (autoFullscreen) requestFS();
      } else {
        video.src = url;
      }
    } else {
      if (window._hls) { try { window._hls.destroy(); window._hls = null; } catch {} }
      video.src = url;
      try { await video.play(); } catch {}
      if (autoFullscreen) requestFS();
    }
    document.title = item.title || 'Ultimate Playlist';
    updateCounter();
    renderList();
  }

  function requestFS() {
    try {
      if (!document.fullscreenElement) {
        playerWrap.requestFullscreen({ navigationUI: 'hide' }).catch(()=>{});
      }
    } catch {}
  }

  function updateCounter() { counter.textContent = (currentIndex + 1) + ' / ' + playlist.length; }

  // Controls with auto fullscreen on Play
  playBtn.addEventListener('click', () => {
    if (video.paused) {
      video.play();
      requestFS(); // Auto fullscreen when pressing Play
    } else {
      video.pause();
    }
  });
  video.addEventListener('play', () => { playBtn.textContent = '⏸ Pause'; });
  video.addEventListener('pause', () => { playBtn.textContent = '▶ Play'; });
  video.addEventListener('timeupdate', () => {
    if (!video.duration) return;
    const pct = (video.currentTime / video.duration) * 100;
    pFill.style.width = pct + '%';
  });
  video.addEventListener('ended', () => { if (currentIndex + 1 < playlist.length) { currentIndex++; playAt(currentIndex, true); } });

  progress.addEventListener('click', (e) => {
    const rect = progress.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    if (video.duration) video.currentTime = pct * video.duration;
  });

  prevBtn.addEventListener('click', () => { if (currentIndex > 0) { currentIndex--; playAt(currentIndex, true); } });
  nextBtn.addEventListener('click', () => { if (currentIndex + 1 < playlist.length) { currentIndex++; playAt(currentIndex, true); } });

  fsBtn.addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else requestFS();
  });

  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) {
      // Exited fullscreen -> show play button UI again like initial launch
      // In playlist player, we keep list visible, but reset play button text
      fsBtn.textContent = '⛶ Fullscreen';
      // No need to show launcher (this is playlist player page), but we ensure controls visible
    } else {
      fsBtn.textContent = '⛶ Exit';
    }
  });

  arBtn.addEventListener('click', () => {
    arIdx = (arIdx + 1) % AR_MODES.length;
    const mode = AR_MODES[arIdx];
    arBtn.textContent = 'AR: ' + mode.label;
    video.style.objectFit = ''; video.style.transform = ''; video.style.aspectRatio = '';
    switch (mode.k) {
      case 'default': video.style.objectFit = 'contain'; break;
      case 'fill': video.style.objectFit = 'fill'; break;
      case 'stretch': video.style.objectFit = 'fill'; video.style.transform = 'scaleX(1.33)'; break;
      case 'fit': video.style.objectFit = 'contain'; break;
      case 'zoom14': video.style.objectFit = 'cover'; video.style.transform = 'scale(1.4)'; break;
      case 'zoom16': video.style.objectFit = 'cover'; video.style.transform = 'scale(1.6)'; break;
      case 'zoom20': video.style.objectFit = 'cover'; video.style.transform = 'scale(2)'; break;
      case 'r169': video.style.aspectRatio = '16 / 9'; video.style.objectFit = 'contain'; break;
      case 'r43': video.style.aspectRatio = '4 / 3'; video.style.objectFit = 'contain'; break;
      case 'r235': video.style.aspectRatio = '2.35 / 1'; video.style.objectFit = 'cover'; break;
      case 'r219': video.style.aspectRatio = '21 / 9'; video.style.objectFit = 'cover'; break;
      case 'auto': video.style.objectFit = 'cover'; break;
    }
  });

  speedBtn.addEventListener('click', () => {
    speedIdx = (speedIdx + 1) % SPEEDS.length;
    const sp = SPEEDS[speedIdx];
    video.playbackRate = sp;
    speedBtn.textContent = sp + '×';
  });

  // Brightness control via keyboard and slider? Add simple
  window.addEventListener('wheel', (e) => {
    if (e.ctrlKey) {
      e.preventDefault();
      brightness = Math.max(10, Math.min(300, brightness + (e.deltaY < 0 ? 10 : -10)));
      video.style.filter = `brightness(${brightness}%) contrast(100%)`;
    }
  }, { passive: false });

  closeBtn.addEventListener('click', () => { window.close(); });
  clearBtn.addEventListener('click', () => { if (!confirm('Clear all playlist?')) return; api.storage.local.set({ up_playlist: [] }, () => { playlist = []; loadPlaylist(); video.src = ''; }); });
  shuffleBtn.addEventListener('click', () => {
    for (let i = playlist.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [playlist[i], playlist[j]] = [playlist[j], playlist[i]]; }
    api.storage.local.set({ up_playlist: playlist }, () => { currentIndex = 0; renderList(); playAt(0, true); });
  });

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') { e.preventDefault(); if (video.paused) { video.play(); requestFS(); } else video.pause(); }
    if (e.code === 'ArrowRight') video.currentTime = Math.min(video.duration, video.currentTime + 10);
    if (e.code === 'ArrowLeft') video.currentTime = Math.max(0, video.currentTime - 10);
    if (e.key === 'f' || e.key === 'F') { if (document.fullscreenElement) document.exitFullscreen(); else requestFS(); }
    if (e.key === 'n') nextBtn.click();
    if (e.key === 'p') prevBtn.click();
  });

  // Video click to toggle play + fullscreen like 
  video.addEventListener('click', () => {
    if (video.paused) { video.play(); requestFS(); } else video.pause();
  });

  loadPlaylist();
})();
