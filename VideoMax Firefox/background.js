/**
 * VideoMax Pro v23 - Background Service Worker
 * NO DOWNLOAD CODE - Playback + Playlist only
 * Works on Chrome, Firefox, Edge, Android Firefox
 */
'use strict';
const VERSION = '23.0.0';
const api = (typeof browser !== 'undefined' && browser.runtime) ? browser : chrome;

api.runtime.onInstalled.addListener((details) => {
  try {
    if (details.reason === 'install') {
      api.storage.local.set({ vm_installed: Date.now(), vm_version: VERSION });
    } else if (details.reason === 'update') {
      api.storage.local.set({ vm_version: VERSION, vm_updated: Date.now() });
    }
  } catch (e) {}
});

function setBadge(tabId, text, color = '#e50914') {
  try {
    const action = api.action || api.browserAction;
    if (!action) return;
    action.setBadgeText({ text: text || '', tabId });
    if (action.setBadgeBackgroundColor) action.setBadgeBackgroundColor({ color, tabId });
  } catch (e) {}
}

api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.type) return false;
  switch (msg.type) {
    case 'vm_video_detected':
    case 'up_video_detected': {
      const tabId = sender.tab?.id;
      if (tabId != null) setBadge(tabId, msg.count ? String(msg.count) : '▶');
      sendResponse({ ok: true });
      return false;
    }
    case 'vm_get_playlist':
    case 'up_get_playlist': {
      api.storage.local.get(['up_playlist'], (r) => {
        sendResponse({ ok: true, playlist: r.up_playlist || [] });
      });
      return true;
    }
    case 'vm_save_playlist':
    case 'up_save_playlist': {
      const list = Array.isArray(msg.playlist) ? msg.playlist : [];
      api.storage.local.set({ up_playlist: list }, () => {
        sendResponse({ ok: true });
      });
      return true;
    }
    case 'vm_open_playlist_player':
    case 'up_open_playlist_player': {
      const url = api.runtime.getURL('playlist-player.html');
      api.tabs.create({ url, active: true }).then(() => sendResponse({ ok: true })).catch(e => sendResponse({ ok: false, error: String(e) }));
      return true;
    }
    case 'vm_open_playlist_at':
    case 'up_open_playlist_at': {
      try {
        const targetUrl = msg.pageUrl;
        if (!targetUrl || !/^https?:/.test(targetUrl)) { sendResponse({ ok: false }); return false; }
        const sep = targetUrl.includes('?') ? '&' : '?';
        const finalUrl = targetUrl + sep + 'up_autoplay=1&up_playlist_index=' + (msg.index || 0);
        api.tabs.create({ url: finalUrl, active: true }).then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
        return true;
      } catch (e) { sendResponse({ ok: false }); return false; }
    }
    case 'vm_ping':
    case 'up_ping': {
      sendResponse({ ok: true, version: VERSION });
      return false;
    }
    case 'vm_load_hls':
    case 'up_hls_loader': {
      const tabId = sender.tab?.id;
      if (tabId == null) { sendResponse({ ok: false }); return false; }
      if (!api.scripting?.executeScript) { sendResponse({ ok: false, error: 'scripting unavailable' }); return false; }
      const target = { tabId };
      if (typeof sender.frameId === 'number') target.frameIds = [sender.frameId];
      try {
        const p = api.scripting.executeScript({ target, files: ['hls.min.js'], world: 'ISOLATED' });
        if (p?.then) {
          p.then(() => sendResponse({ ok: true })).catch(e => sendResponse({ ok: false, error: String(e) }));
          return true;
        }
      } catch (e) { sendResponse({ ok: false, error: String(e) }); return false; }
      sendResponse({ ok: true });
      return false;
    }
    case 'vm_load_inject': {
      const tabId = sender.tab?.id;
      if (tabId == null) { sendResponse({ ok: false }); return false; }
      if (!api.scripting?.executeScript) { sendResponse({ ok: false, error: 'scripting unavailable' }); return false; }
      const target = { tabId };
      if (typeof sender.frameId === 'number') target.frameIds = [sender.frameId];
      try {
        const p = api.scripting.executeScript({ target, files: ['inject.js'], world: 'MAIN' });
        if (p?.then) {
          p.then(() => sendResponse({ ok: true })).catch(e => sendResponse({ ok: false, error: String(e) }));
          return true;
        }
      } catch (e) { sendResponse({ ok: false, error: String(e) }); return false; }
      sendResponse({ ok: true });
      return false;
    }
    case 'vm_quality_data': {
      // Relay quality data to all frames in the same tab
      const tabId = sender.tab?.id;
      if (tabId != null) {
        api.tabs.sendMessage(tabId, { type: 'vm_quality_relay', quals: msg.quals }).catch(()=>{});
      }
      sendResponse({ ok: true });
      return false;
    }
    case 'vm_context_info': {
      sendResponse({ ok: true, host: sender.tab?.url ? new URL(sender.tab.url).hostname : '', ctx: {}, prefs: {} });
      return false;
    }
    case 'vm_apply_defaults':
    case 'vm_defaults_changed':
    case 'up_defaults_changed': {
      // Relay to ALL frames in ALL tabs
      api.tabs.query({}, tabs => {
        tabs.forEach(tab => {
          try { api.tabs.sendMessage(tab.id, { type: 'vm_apply_defaults', defaults: msg.defaults || msg }).catch(()=>{}); } catch {}
        });
      });
      sendResponse({ ok: true });
      return false;
    }
    default: return false;
  }
});

if (api.tabs?.onUpdated) {
  api.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === 'loading' && changeInfo.url) setBadge(tabId, '');
  });
}
