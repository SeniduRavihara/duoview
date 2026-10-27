import { normalizeUrl, record, step } from './history.js';
const $ = (selector, root = document) => root.querySelector(selector);
const presets = [
  ['Desktop HD',1280,720],['Desktop Full HD',1920,1080],['Laptop',1440,900],
  ['iPhone 16 Pro',402,874],['iPhone 16',393,852],['iPhone SE',375,667],
  ['Pixel 9',412,915],['Galaxy S24',360,780],['iPad',768,1024],['Custom',0,0]
];
let panes = [], tabId, saveTimer, toastTimer;
function toast(message) { $('#toast').textContent = message; $('#toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').hidden = true, 6500); }
async function request(message) { return chrome.runtime.sendMessage({...message, tabId}); }
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    chrome.storage.local.set({layoutVersion:2, panes: panes.map(p => ({id:p.id, width:p.width, height:p.height, preset:p.preset, scale:p.scale, url:p.history.entries[p.history.index] || ''}))}).catch(() => toast('Your workspace could not be saved.'));
  }, 150);
}
function fit(p) {
  const stage = $('.stage',p.el);
  const scale = p.scale === 'fit'
    ? Math.max(.05, Math.min(1, (stage.clientWidth-12)/p.width, (stage.clientHeight-12)/p.height))
    : p.scale === 'width'
      ? (p.width <= 600 ? 1 : Math.max(.75, Math.min(1, (stage.clientWidth-12)/p.width)))
      : Number(p.scale);
  const screen = $('.screen',p.el);
  screen.style.width = `${p.width*scale}px`; screen.style.height = `${p.height*scale}px`;
  p.frame.style.width = `${p.width}px`; p.frame.style.height = `${p.height}px`; p.frame.style.transform = `scale(${scale})`;
  $('.zoom-label',p.el).textContent = `${p.width} × ${p.height} · ${Math.round(scale*100)}%`;
}
function refresh(p) {
  // Phones keep their native width; wider previews use the remaining canvas.
  p.el.style.flex = p.width <= 600 ? `0 0 ${Math.max(420,p.width+14)}px` : `1 0 ${Math.max(960,p.width*.75)+14}px`;
  p.el.style.minWidth = p.width <= 600 ? `${Math.max(420,p.width+14)}px` : `${Math.max(960,p.width*.75)+14}px`;
  const current = p.history.entries[p.history.index] || '';
  $('[data-action=back]',p.el).disabled = p.history.index <= 0 || p.busy;
  $('[data-action=forward]',p.el).disabled = p.history.index >= p.history.entries.length-1 || p.busy;
  $('[data-action=reload]',p.el).disabled = !current || p.busy;
  $('[data-action=open]',p.el).disabled = !current;
  if (document.activeElement !== $('.pane-url',p.el)) $('.pane-url',p.el).value = current;
  $('h2',p.el).textContent = p.preset === 'Custom' ? 'Custom viewport' : p.preset;
  $('.dimensions',p.el).textContent = `${p.width} × ${p.height} px`;
  $('.width',p.el).value = p.width; $('.height',p.el).value = p.height;
  $('.preset',p.el).value = p.preset; $('.scale',p.el).value = p.scale;
  $('.empty',p.el).hidden = !!current;
  p.frame.title = `${p.preset} website preview`;
  fit(p);
}
function status(p, message) { $('.status',p.el).textContent = message; }
async function navigate(p, input, mode = 'new') {
  let url;
  try { url = normalizeUrl(input); } catch(error) { toast(error.message); return; }
  if (mode === 'new') record(p.history,url);
  p.pending = true; p.busy = true;
  $('.pane-url',p.el).value = url;
  status(p,'Loading…'); refresh(p); save();
  clearTimeout(p.timer);
  p.timer = setTimeout(() => {
    p.busy = false; p.pending = false; refresh(p);
    status(p,'Not loading? Try compatibility mode or ↗ Open in tab.');
  },15000);
  try {
    const result = await request({type:'NAVIGATE',paneId:p.id,url,reload:mode === 'reload'});
    if (!result?.ok) p.frame.src = url;
  } catch { p.frame.src = url; }
}
function addPane(config = {}) {
  const p = {id:crypto.randomUUID(),width:402,height:874,preset:'iPhone 16 Pro',scale:'width',...config,history:{entries:[],index:-1},busy:false};
  p.el = $('#pane-template').content.firstElementChild.cloneNode(true); p.el.dataset.paneId = p.id;
  p.frame = $('iframe',p.el); p.frame.name = `duoview-${p.id}`;
  for (const [name] of presets) $('.preset',p.el).add(new Option(name,name));
  $('.navigation',p.el).addEventListener('submit',event => { event.preventDefault(); $('.pane-url',p.el).blur(); navigate(p,$('.pane-url',p.el).value); });
  p.el.addEventListener('click', async event => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    const current = p.history.entries[p.history.index];
    if (action === 'back' || action === 'forward') {
      const url = step(p.history,action === 'back' ? -1 : 1);
      if (url) await navigate(p,url,'traverse');
    } else if (action === 'reload' && current) await navigate(p,current,'reload');
    else if (action === 'open' && current) {
      const result = await request({type:'OPEN_TAB',url:current}); if (!result?.ok) toast(result?.error || 'Could not open tab.');
    } else if (action === 'remove') {
      if (panes.length === 1) return toast('Keep at least one viewport open.');
      clearTimeout(p.timer); p.observer.disconnect(); p.el.remove(); panes = panes.filter(item => item !== p); updateCount(); save();
    } else if (action === 'rotate') {
      [p.width,p.height] = [p.height,p.width]; p.preset = 'Custom'; refresh(p); save();
    }
  });
  $('.preset',p.el).addEventListener('change',event => {
    p.preset = event.target.value; const preset = presets.find(item => item[0] === p.preset);
    if (preset[1]) [p.width,p.height] = preset.slice(1); refresh(p); save();
  });
  for (const dimension of ['width','height']) $('.'+dimension,p.el).addEventListener('change',event => {
    const value = Number(event.target.value);
    if (!Number.isInteger(value) || value < 240 || value > 3840) { toast('Viewport dimensions must be between 240 and 3840 pixels.'); refresh(p); return; }
    p[dimension] = value; p.preset = 'Custom'; refresh(p); save();
  });
  $('.scale',p.el).addEventListener('change',event => {p.scale=event.target.value;fit(p);save();});
  panes.push(p); $('#panes').append(p.el);
  p.observer = new ResizeObserver(() => fit(p)); p.observer.observe($('.stage',p.el));
  refresh(p); updateCount(); if (config.url) navigate(p,config.url);
  return p;
}
function updateCount() { $('#view-count').textContent = `${panes.length} viewport${panes.length===1?'':'s'}`; $('#add').disabled = panes.length >= 6; }
chrome.runtime.onMessage.addListener(message => {
  if (message.type !== 'FRAME_EVENT' || message.tabId !== tabId) return;
  const p = panes.find(item => item.id === message.paneId); if (!p) return;
  if (message.kind === 'commit' || message.kind === 'history') {
    try { normalizeUrl(message.url); } catch { return; }
    record(p.history,message.url,p.pending || message.replace);
    p.pending = false; p.busy = false; refresh(p); save();
    status(p,message.kind === 'history' ? 'Ready · navigation saved' : 'Page loaded');
  }
  if (message.kind === 'complete' || message.kind === 'history') {
    clearTimeout(p.timer); p.busy = false; refresh(p); status(p,'Ready · independent navigation');
  }
  if (message.kind === 'error' && message.error !== 'net::ERR_ABORTED') {
    clearTimeout(p.timer); p.busy = false; p.pending = false; refresh(p);
    status(p,'Could not load. Try compatibility mode or ↗ Open in tab.');
  }
});
$('#global-form').addEventListener('submit',event => {
  event.preventDefault();
  let url; try {url=normalizeUrl($('#global-url').value);} catch(error){return toast(error.message);}
  $('#global-url').value=url; panes.forEach(p => navigate(p,url));
});
$('#add').addEventListener('click',() => {if(panes.length<6) { addPane({url:panes[0]?.history.entries[panes[0]?.history.index] || ''}); save(); }});
$('#actual').addEventListener('click',() => {panes.forEach(p => {p.scale='1';refresh(p);});save();});
$('#fit').addEventListener('click',() => {panes.forEach(p => {p.scale='fit';refresh(p);});save();});
$('#compatibility').addEventListener('change',async event => {
  const enabled = event.target.checked;
  const result = await request({type:'COMPATIBILITY',enabled});
  if (!result?.ok) {event.target.checked=!enabled;return toast(result?.error || 'Could not change compatibility mode.');}
  toast(enabled ? 'Compatibility enabled: preview response security headers are removed in this tab.' : 'Compatibility off: website security headers are respected.');
  panes.forEach(p => {const url=p.history.entries[p.history.index]; if(url) navigate(p,url,'reload');});
});
$('#help').addEventListener('click',() => $('#guide').showModal());
$('#close-guide').addEventListener('click',() => $('#guide').close());
$('#guide').addEventListener('click',event => {if(event.target === $('#guide')) {const r=event.target.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom) event.target.close();}});
async function init() {
  tabId = (await chrome.tabs.getCurrent()).id;
  const result = await request({type:'INIT'}); if (!result?.ok) throw new Error(result?.error || 'Initialization failed.');
  const stored = await chrome.storage.local.get(['panes','layoutVersion']);
  let incoming = new URLSearchParams(location.search).get('url');
  if (incoming) {try{incoming=normalizeUrl(incoming);}catch{incoming=null;}}
  const configs = Array.isArray(stored.panes) && stored.panes.length ? stored.panes.slice(0,6) : [
    {preset:'Desktop HD',width:1280,height:720},{preset:'iPhone 16 Pro',width:402,height:874}
  ];
  for (const config of configs) {
    // Upgrade the old unreadable Fit default once, while retaining devices and URLs.
    const scale = stored.layoutVersion !== 2 && config.scale === 'fit' ? 'width' : (config.scale || 'width');
    addPane({...config,scale,...incoming ? {url:incoming} : {}});
  }
  save();
  $('#global-url').value = incoming || configs[0]?.url || '';
}
init().catch(error => toast(`DuoView could not start: ${error.message}`));
