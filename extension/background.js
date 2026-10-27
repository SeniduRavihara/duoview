import { normalizeUrl } from './history.js';
const studio = chrome.runtime.getURL('studio.html');
const key = id => `workspace:${id}`;
const isStudio = url => url?.split('?')[0] === studio;
async function workspace(tabId) { return (await chrome.storage.session.get(key(tabId)))[key(tabId)]; }
async function setCompatibility(tabId, enabled) {
  const id = tabId + 1;
  await chrome.declarativeNetRequest.updateSessionRules({removeRuleIds: [id], addRules: enabled ? [{
    id, priority: 1,
    action: {type: 'modifyHeaders', responseHeaders: [
      {header: 'x-frame-options', operation: 'remove'},
      {header: 'content-security-policy', operation: 'remove'},
      {header: 'content-security-policy-report-only', operation: 'remove'}
    ]},
    condition: {tabIds: [tabId], resourceTypes: ['sub_frame'], urlFilter: '|http'}
  }] : []});
}
chrome.action.onClicked.addListener(tab => {
  const url = /^https?:\/\//.test(tab.url || '') ? `?url=${encodeURIComponent(tab.url)}` : '';
  chrome.tabs.create({url: studio + url});
});
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (!isStudio(sender.url)) return;
  (async () => {
    const tabId = message.tabId;
    if (!Number.isInteger(tabId) || tabId < 0) throw new Error('Workspace is unavailable.');
    // Only our own studio.html can send these messages (validated above).
    await chrome.tabs.get(tabId);
    if (message.type === 'INIT') {
      await setCompatibility(tabId, false);
      await chrome.storage.session.set({[key(tabId)]: {frames: {}}});
      return {ok: true};
    }
    const state = await workspace(tabId);
    if (!state) throw new Error('Reload the DuoView workspace.');
    if (message.type === 'COMPATIBILITY') {
      await setCompatibility(tabId, !!message.enabled);
    } else if (message.type === 'NAVIGATE') {
      const frameId = state.frames[message.paneId];
      if (!frameId) return {ok: false};
      const url = normalizeUrl(message.url);
      await chrome.scripting.executeScript({target: {tabId, frameIds: [frameId]}, func: (target, reload) => {
        if (reload) location.reload(); else location.replace(target);
      }, args: [url, !!message.reload]});
    } else if (message.type === 'OPEN_TAB') {
      await chrome.tabs.create({url: normalizeUrl(message.url)});
    }
    return {ok: true};
  })().then(respond).catch(error => respond({ok: false, error: error.message}));
  return true;
});
async function notify(details, kind) {
  if (details.frameId === 0) return;
  const state = await workspace(details.tabId);
  if (!state) return;
  let paneId = Object.keys(state.frames).find(id => state.frames[id] === details.frameId);
  if (!paneId) {
    const frame = await chrome.webNavigation.getFrame({tabId: details.tabId, frameId: details.frameId});
    if (!frame || frame.parentFrameId !== 0) return;
    try {
      const result = await chrome.scripting.executeScript({target: {tabId: details.tabId, frameIds: [details.frameId]}, func: () => window.name});
      const name = result[0]?.result;
      if (!/^duoview-[\w-]+$/.test(name)) return;
      paneId = name.slice(8);
      state.frames[paneId] = details.frameId;
      await chrome.storage.session.set({[key(details.tabId)]: state});
    } catch { return; }
  }
  await chrome.runtime.sendMessage({type: 'FRAME_EVENT', tabId: details.tabId, paneId,
    url: details.url, kind, error: details.error,
    replace: details.transitionType === 'reload' || details.transitionQualifiers?.includes('client_redirect')}).catch(() => {});
}
// Serialize mapping updates: desktop and mobile often commit at exactly the same time.
let queue = Promise.resolve();
function observe(event, kind) { event.addListener(details => { queue = queue.then(() => notify(details, kind)).catch(() => {}); }); }
observe(chrome.webNavigation.onCommitted, 'commit');
observe(chrome.webNavigation.onHistoryStateUpdated, 'history');
observe(chrome.webNavigation.onReferenceFragmentUpdated, 'history');
observe(chrome.webNavigation.onCompleted, 'complete');
observe(chrome.webNavigation.onErrorOccurred, 'error');
async function cleanup(tabId) {
  if (!await workspace(tabId)) return;
  await setCompatibility(tabId, false);
  await chrome.storage.session.remove(key(tabId));
}
chrome.tabs.onRemoved.addListener(id => { cleanup(id).catch(() => {}); });
chrome.tabs.onUpdated.addListener((id, change) => {
  if (change.url && !isStudio(change.url)) cleanup(id).catch(() => {});
});
