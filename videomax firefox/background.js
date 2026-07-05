/**
 * VideoMax Pro — Background Service Worker (MV3)
 * Lifecycle, badge updates, native downloads, and message routing.
 *
 * Note: stream/quality detection is done inside content.js (a PerformanceObserver
 * that runs in every frame), so this worker needs NO webRequest/tabs permissions.
 */

'use strict';

const VM_VERSION = '11.0.0';

/* ─── Lifecycle ─── */
chrome.runtime.onInstalled.addListener((details) => {
  try {
    if (details.reason === 'install') {
      chrome.storage.local.set({ vm_installed: Date.now(), vm_version: VM_VERSION });
    } else if (details.reason === 'update') {
      chrome.storage.local.set({ vm_version: VM_VERSION, vm_updated: Date.now() });
    }
  } catch (e) { /* ignore */ }
});

/* ─── Message router ─── */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.type) return false;

  switch (msg.type) {
    /* Badge: number of detected videos on a tab */
    case 'vm_video_detected': {
      const tabId = sender.tab && sender.tab.id;
      if (tabId != null) {
        try {
          const txt = msg.count ? String(msg.count) : '1';
          chrome.action.setBadgeText({ text: txt, tabId });
          chrome.action.setBadgeBackgroundColor({ color: '#e94560', tabId });
          if (chrome.action.setBadgeTextColor) chrome.action.setBadgeTextColor({ color: '#ffffff', tabId });
        } catch (e) { /* ignore */ }
      }
      sendResponse({ ok: true });
      return false;
    }

    /* Native browser download via chrome.downloads */
    case 'vm_download': {
      try {
        const opts = { url: msg.url };
        if (msg.filename) opts.filename = String(msg.filename).replace(/[\\/:*?"<>|]+/g, '_').slice(0, 200);
        if (msg.saveAs != null) opts.saveAs = !!msg.saveAs;
        chrome.downloads.download(opts, (downloadId) => {
          const err = chrome.runtime.lastError;
          sendResponse({ ok: !err && downloadId != null, id: downloadId, error: err && err.message });
        });
      } catch (e) {
        sendResponse({ ok: false, error: String(e) });
      }
      return true; // async response
    }

    /* Open a URL in a new tab (external player / stream) */
    case 'vm_open_tab': {
      try {
        chrome.tabs.create({ url: msg.url, active: msg.active !== false });
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ ok: false, error: String(e) });
      }
      return false;
    }

    default:
      return false;
  }
});

/* ─── Clear the badge when a tab starts loading a new page ─── */
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading' && changeInfo.url) {
    try { chrome.action.setBadgeText({ text: '', tabId }); } catch (e) { /* ignore */ }
  }
});
