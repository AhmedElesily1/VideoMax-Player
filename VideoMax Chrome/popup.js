const api = (typeof browser !== 'undefined' && browser.runtime) ? browser : chrome;

const i18n = {
  en: {
    tab_settings: "Settings", tab_features: "Features", tab_playlist: "Playlist", tab_exclude: "Exclude",
    lang_title: "Language", lang_desc: "Extension interface language",
    quality_title: "Default Quality", quality_desc: "Preferred resolution",
    data_title: "Data Saver", data_desc: "Cap quality on slow networks", lowest: "Lowest",
    speed_title: "Default Speed", speed_desc: "Starting playback speed",
    orientation_title: "Default Orientation", orientation_desc: "Screen lock on mobile (fullscreen)",
    orient_auto: "Auto (match video)", orient_landscape: "Landscape", orient_portrait: "Portrait",
    ar_title: "Default Aspect Ratio", ar_desc: "Starting fit mode for the video",
    open_playlist: "Open Full Playlist Player", clear_playlist: "Clear Saved Playlist",
    playlist_empty: "No videos saved yet. Use the ＋ Save button under any video.",
    pc_shortcuts: "PC Shortcuts", s_play: "Play / Pause", s_full: "Fullscreen", s_mute: "Mute", s_seek: "Seek ±10s", s_vol: "Volume", s_speed: "Playback Speed", s_subs: "Subtitles", s_shot: "Screenshot",
    mobile_gestures: "Mobile Touch Gestures", g_seek: "Double tap sides", g_bright: "Swipe Left Edge", g_vol: "Swipe Right Edge", g_zoom: "Pinch / Spread",
    status_active: "VideoMax is Active here", status_disabled: "VideoMax is Disabled here",
    exclude_desc: "Disable VideoMax completely on specific websites.",
    toggle_current: "Disable on current site", toggle_enable: "Enable on current site",
    blacklisted_sites: "Excluded Sites:", no_sites: "No excluded sites."
  },
  ar: {
    tab_settings: "الإعدادات", tab_features: "المميزات", tab_playlist: "قائمة التشغيل", tab_exclude: "استثناء",
    lang_title: "اللغة", lang_desc: "لغة واجهة الإضافة",
    quality_title: "الجودة الافتراضية", quality_desc: "دقة الفيديو المفضلة",
    data_title: "توفير البيانات", data_desc: "تقليل الجودة في الشبكات البطيئة", lowest: "أقل جودة",
    speed_title: "السرعة الافتراضية", speed_desc: "سرعة التشغيل عند البدء",
    orientation_title: "اتجاه الشاشة الافتراضي", orientation_desc: "قفل الاتجاه على الموبايل (ملء الشاشة)",
    orient_auto: "تلقائي (حسب الفيديو)", orient_landscape: "أفقي", orient_portrait: "عمودي",
    ar_title: "نسبة العرض الافتراضية", ar_desc: "وضع العرض عند بدء الفيديو",
    open_playlist: "فتح المشغل الكامل لقائمة التشغيل", clear_playlist: "مسح قائمة التشغيل المحفوظة",
    playlist_empty: "لا توجد فيديوهات محفوظة بعد. استخدم زرار ＋ حفظ تحت أي فيديو.",
    pc_shortcuts: "اختصارات الكمبيوتر", s_play: "تشغيل / إيقاف", s_full: "ملء الشاشة", s_mute: "كتم الصوت", s_seek: "تقديم/تأخير 10ث", s_vol: "مستوى الصوت", s_speed: "سرعة التشغيل", s_subs: "الترجمة", s_shot: "لقطة شاشة",
    mobile_gestures: "إيماءات اللمس (للهاتف)", g_seek: "نقر مزدوج للجانبين", g_bright: "سحب الحافة اليسرى", g_vol: "سحب الحافة اليمنى", g_zoom: "تصغير / تكبير",
    status_active: "الإضافة تعمل هنا", status_disabled: "الإضافة معطلة هنا",
    exclude_desc: "تعطيل إضافة VideoMax بالكامل على مواقع معينة.",
    toggle_current: "تعطيل في هذا الموقع", toggle_enable: "تفعيل في هذا الموقع",
    blacklisted_sites: "المواقع المستثناة:", no_sites: "لا توجد مواقع مستثناة."
  }
};

let currentDomain = '';
let isBlacklisted = false;
let blacklist = [];

function applyLang(lang) {
  document.body.style.direction = lang === 'ar' ? 'rtl' : 'ltr';
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (i18n[lang][key]) el.textContent = i18n[lang][key];
  });
  updateExcludeUI(lang);
}

function updateExcludeUI(lang) {
  const box = document.getElementById('statusBox');
  const txt = document.getElementById('statusText');
  const btn = document.getElementById('toggleCurrentSiteBtn');
  
  if (isBlacklisted) {
    box.classList.add('disabled');
    txt.textContent = i18n[lang].status_disabled;
    btn.textContent = i18n[lang].toggle_enable;
    btn.className = 'btn';
  } else {
    box.classList.remove('disabled');
    txt.textContent = i18n[lang].status_active;
    btn.textContent = i18n[lang].toggle_current;
    btn.className = 'btn btn-secondary';
  }
  renderBlacklist(lang);
}

function renderBlacklist(lang) {
  const listEl = document.getElementById('domainList');
  listEl.innerHTML = '';
  if (blacklist.length === 0) {
    listEl.innerHTML = `<div style="color:var(--text-dim);font-size:12px;text-align:center;padding:10px;">${i18n[lang].no_sites}</div>`;
    return;
  }
  blacklist.forEach(domain => {
    const dEl = document.createElement('div');
    dEl.className = 'domain-item';
    dEl.innerHTML = `<span>${domain}</span> <span class="remove-domain" data-domain="${domain}">×</span>`;
    listEl.appendChild(dEl);
  });
  document.querySelectorAll('.remove-domain').forEach(el => {
    el.addEventListener('click', (e) => {
      const d = e.target.getAttribute('data-domain');
      blacklist = blacklist.filter(x => x !== d);
      api.storage.local.set({ vm_blacklist: blacklist }, () => {
        if (currentDomain.includes(d)) isBlacklisted = false;
        updateExcludeUI(document.getElementById('langSelect').value);
      });
    });
  });
}

function renderPlaylistPopup(lang) {
  const listEl = document.getElementById('playlistList');
  if (!listEl) return;
  api.storage.local.get(['up_playlist'], (r) => {
    const list = r.up_playlist || [];
    listEl.innerHTML = '';
    if (!list.length) {
      listEl.innerHTML = `<div class="playlist-empty">${i18n[lang].playlist_empty}</div>`;
      return;
    }
    list.forEach((item, i) => {
      const row = document.createElement('div');
      row.className = 'playlist-item';
      const img = document.createElement('img');
      img.src = item.poster || '';
      img.onerror = () => { img.style.visibility = 'hidden'; };
      const meta = document.createElement('div');
      meta.className = 'pl-meta';
      const name = document.createElement('div');
      name.className = 'pl-name';
      name.textContent = item.title || item.pageUrl || 'Video';
      const host = document.createElement('div');
      host.className = 'pl-host';
      host.textContent = item.host || '';
      meta.append(name, host);
      const remove = document.createElement('span');
      remove.className = 'pl-remove';
      remove.textContent = '×';
      remove.addEventListener('click', (e) => {
        e.stopPropagation();
        const updated = list.filter((_, idx) => idx !== i);
        api.storage.local.set({ up_playlist: updated }, () => renderPlaylistPopup(lang));
      });
      row.append(img, meta, remove);
      row.addEventListener('click', () => {
        // Open the ORIGINAL video page — item.videoUrl is typically a
        // blob: URL that only means something inside the tab that saved
        // it, so it can never be reopened here.
        if (item.pageUrl) {
          api.runtime.sendMessage({ type: 'vm_open_playlist_at', pageUrl: item.pageUrl, index: i });
        }
      });
      listEl.appendChild(row);
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const langSelect = document.getElementById('langSelect');
  const qualitySelect = document.getElementById('qualitySelect');
  const dataToggle = document.getElementById('dataToggle');
  const speedSelect = document.getElementById('speedSelect');
  const orientationSelect = document.getElementById('orientationSelect');
  const arSelect = document.getElementById('arSelect');
  const tabs = document.querySelectorAll('.tab');
  const panels = document.querySelectorAll('.panel');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      panels.forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(tab.getAttribute('data-target')).classList.add('active');
      if (tab.getAttribute('data-target') === 'playlist') renderPlaylistPopup(langSelect.value);
    });
  });

  api.tabs.query({active: true, currentWindow: true}, function(tabs) {
    if (tabs[0] && tabs[0].url && tabs[0].url.startsWith('http')) {
      currentDomain = new URL(tabs[0].url).hostname.replace(/^www\./, '');
    }
    
    api.storage.local.get(['vm_defaults', 'vm_blacklist'], r => {
      const d = r.vm_defaults || { lang: 'en', quality: 'auto', dataSaver: true, speed: 3, orientation: 'auto', ar: 0 };
      blacklist = r.vm_blacklist || [];
      if (currentDomain && blacklist.some(b => currentDomain.includes(b))) isBlacklisted = true;
      
      langSelect.value = d.lang || 'en';
      qualitySelect.value = d.quality || 'auto';
      dataToggle.checked = d.dataSaver !== false;
      speedSelect.value = (d.speed !== undefined ? d.speed : 3);
      orientationSelect.value = d.orientation || 'auto';
      arSelect.value = (d.ar !== undefined ? d.ar : 0);
      
      applyLang(langSelect.value);
    });
  });

  function save() {
    const d = {
      lang: langSelect.value, quality: qualitySelect.value,
      dataSaver: dataToggle.checked,
      speed: parseInt(speedSelect.value, 10),
      orientation: orientationSelect.value,
      ar: parseInt(arSelect.value, 10)
    };
    api.storage.local.set({ vm_defaults: d }, () => {
      api.runtime.sendMessage({ type: 'vm_defaults_changed', defaults: d });
    });
    applyLang(langSelect.value);
  }

  langSelect.addEventListener('change', save);
  qualitySelect.addEventListener('change', save);
  dataToggle.addEventListener('change', save);
  speedSelect.addEventListener('change', save);
  orientationSelect.addEventListener('change', save);
  arSelect.addEventListener('change', save);

  document.getElementById('openFullPlaylistBtn').addEventListener('click', () => {
    api.runtime.sendMessage({ type: 'vm_open_playlist_player' });
  });

  document.getElementById('clearPlaylistBtn').addEventListener('click', () => {
    if (!confirm('Clear all saved playlist videos?')) return;
    api.storage.local.set({ up_playlist: [] }, () => renderPlaylistPopup(langSelect.value));
  });

  document.getElementById('toggleCurrentSiteBtn').addEventListener('click', () => {
    if (!currentDomain) return;
    if (isBlacklisted) {
      blacklist = blacklist.filter(d => !currentDomain.includes(d));
      isBlacklisted = false;
    } else {
      blacklist.push(currentDomain);
      isBlacklisted = true;
    }
    api.storage.local.set({ vm_blacklist: blacklist }, () => {
      updateExcludeUI(langSelect.value);
      api.tabs.query({active: true, currentWindow: true}, function(tabs) {
        if (tabs[0]) api.tabs.reload(tabs[0].id);
      });
    });
  });
});
