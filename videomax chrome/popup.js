/* VideoMax Pro — popup logic (external file; MV3 CSP forbids inline scripts) */
(function () {
  'use strict';

  // Resolve a storage API across Chrome/Firefox
  var storage = null;
  try { if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) storage = chrome.storage.local; } catch (e) {}
  if (!storage) { try { if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) storage = browser.storage.local; } catch (e) {} }

  var tabsApi = null;
  try { if (typeof chrome !== 'undefined' && chrome.tabs) tabsApi = chrome.tabs; } catch (e) {}
  if (!tabsApi) { try { if (typeof browser !== 'undefined' && browser.tabs) tabsApi = browser.tabs; } catch (e) {} }

  function $(id) { return document.getElementById(id); }

  function getVal(id, asInt) {
    var el = $(id);
    if (!el) return undefined;
    if (el.type === 'checkbox') return el.checked;
    return asInt ? parseInt(el.value, 10) : el.value;
  }
  function setVal(id, v) {
    var el = $(id);
    if (!el || v === undefined || v === null) return;
    if (el.type === 'checkbox') el.checked = !!v;
    else el.value = String(v);
  }

  function collectDefaults() {
    return {
      ar: getVal('defAR', true),
      speed: getVal('defSpeed', true),
      quality: getVal('defQuality', false),
      resume: getVal('defResume'),
      subs: getVal('defSubs'),
      cinema: getVal('defCinema')
    };
  }

  // ── Load persisted settings into the form ──
  function loadSettings() {
    if (!storage) return;
    try {
      storage.get(['vm_defaults'], function (r) {
        var d = (r && r.vm_defaults) || {};
        setVal('defAR', d.ar);
        setVal('defSpeed', d.speed);
        setVal('defQuality', d.quality);
        setVal('defResume', d.resume);
        setVal('defSubs', d.subs);
        setVal('defCinema', d.cinema);
      });
    } catch (e) {}
  }

  // ── Persist to storage ──
  function saveDefaults(buttonFeedback, done) {
    var d = collectDefaults();
    if (!storage) {
      flashSaveStatus(false);
      if (buttonFeedback) flashSaveButton(false);
      if (done) done(false);
      return;
    }
    try {
      storage.set({ vm_defaults: d }, function () {
        var ok = !(chrome && chrome.runtime && chrome.runtime.lastError);
        flashSaveStatus(ok);
        if (buttonFeedback) flashSaveButton(ok);
        if (done) done(ok);
      });
    } catch (e) {
      flashSaveStatus(false);
      if (buttonFeedback) flashSaveButton(false);
      if (done) done(false);
    }
  }

  function flashSaveStatus(ok) {
    var st = $('saveStatus');
    if (!st) return;
    st.textContent = ok ? '✓ Saved' : '⚠ Error';
    st.style.color = ok ? '#22c55e' : '#ff5252';
    setTimeout(function () { st.textContent = ''; }, 1600);
  }

  function flashSaveButton(ok) {
    var btn = $('saveBtn'), lbl = $('saveBtnLabel');
    if (!btn || !lbl) return;
    btn.classList.add('saved');
    var prev = lbl.getAttribute('data-base') || 'Save Settings';
    lbl.textContent = ok ? '✓ Saved!' : '⚠ Could not save';
    setTimeout(function () { btn.classList.remove('saved'); lbl.textContent = prev; }, 1700);
  }

  // ── Live-push to the active tab's content script ──
  function pushToActiveTab(cb) {
    if (!tabsApi || !tabsApi.query) { if (cb) cb(false); return; }
    try {
      tabsApi.query({ active: true, currentWindow: true }, function (tabs) {
        if (!tabs || !tabs[0]) { if (cb) cb(false); return; }
        var payload = { type: 'vm_apply_defaults', defaults: collectDefaults() };
        try {
          tabsApi.sendMessage(tabs[0].id, payload, function () {
            var err = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError);
            if (cb) cb(!err);
          });
        } catch (e) { if (cb) cb(false); }
      });
    } catch (e) { if (cb) cb(false); }
  }

  // ── Wire everything up after DOM is ready ──
  function init() {
    loadSettings();

    // Auto-save on any change
    var inputs = document.querySelectorAll('select, input');
    for (var i = 0; i < inputs.length; i++) {
      inputs[i].addEventListener('change', function () { saveDefaults(false); });
    }

    var saveBtn = $('saveBtn');
    var lbl = $('saveBtnLabel');
    if (lbl) lbl.setAttribute('data-base', lbl.textContent);
    if (saveBtn) {
      saveBtn.addEventListener('click', function () {
        saveDefaults(true, function () { pushToActiveTab(); });
      });
    }

    var applyBtn = $('applyBtn');
    if (applyBtn) {
      applyBtn.addEventListener('click', function () {
        saveDefaults(false);
        var span = applyBtn.querySelector('span');
        var base = span ? (span.getAttribute('data-base') || span.textContent) : '';
        if (span) span.setAttribute('data-base', base);
        pushToActiveTab(function (ok) {
          applyBtn.classList.add('done');
          if (span) span.textContent = ok ? '✓ Applied!' : 'No video on this page';
          setTimeout(function () {
            applyBtn.classList.remove('done');
            if (span) span.textContent = base;
          }, 1800);
        });
      });
    }
  }

  // ── Support section: copy InstaPay / Vodafone Cash values ──
  function initSupport() {
    var btns = document.querySelectorAll('.copy-btn');
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener('click', function () {
        var id = this.getAttribute('data-copy');
        var el = document.getElementById(id);
        var txt = el ? (el.textContent || '') : '';
        var self = this;
        var orig = self.textContent;
        function done() {
          self.textContent = 'Copied ✓';
          self.classList.add('copied');
          setTimeout(function () { self.textContent = orig; self.classList.remove('copied'); }, 1500);
        }
        try {
          navigator.clipboard.writeText(txt).then(done, function () {
            try { var t = document.createElement('textarea'); t.value = txt; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); done(); } catch (e) {}
          });
        } catch (e) {
          try { var t2 = document.createElement('textarea'); t2.value = txt; document.body.appendChild(t2); t2.select(); document.execCommand('copy'); t2.remove(); done(); } catch (e2) {}
        }
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { init(); initSupport(); });
  } else {
    init(); initSupport();
  }
})();
