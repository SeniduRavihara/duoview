import { normalizeUrl, record, step } from './history.js';
import { visiblePreviewRect, saveScreenshot } from './screenshot.js';
import { rebuildDividers } from './dividers.js';
const $ = (selector, root = document) => root.querySelector(selector);
const presets = [
  ['Desktop HD',1280,720],['Desktop Full HD',1920,1080],['Laptop',1440,900],
  ['iPhone 16 Pro',402,874],['iPhone 16',393,852],['iPhone SE',375,667],
  ['Pixel 9',412,915],['Galaxy S24',360,780],['iPad',768,1024],['Custom',0,0]
];
let panes = [], tabId, saveTimer, toastTimer, capturing = false, lastCapture = 0;
function toast(message) { $('#toast').textContent = message; $('#toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').hidden = true, 6500); }
async function request(message) { return chrome.runtime.sendMessage({...message, tabId}); }
async function screenshot(p) {
  if (capturing) return;
  if (Date.now()-lastCapture < 700) return toast('Please wait a moment before another screenshot.');
  if (p && !p.history.entries.length) return toast('Open a website in this preview first.');
  capturing = true;
  const buttons = document.querySelectorAll('[data-action=screenshot],#capture-workspace');
  buttons.forEach(button=>button.disabled=true);
  try {
    document.activeElement?.blur();
    $('#toast').hidden = true;
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    if (document.visibilityState !== 'visible') throw new Error('Keep DuoView selected while taking a screenshot.');
    const rect = p ? visiblePreviewRect(p.frame,$('.stage',p.el)) : {left:0,top:0,width:innerWidth,height:innerHeight};
    const viewport = {width:innerWidth,height:innerHeight};
    const response = await request({type:'SCREENSHOT'});
    if (!response?.ok) throw new Error(response?.error || 'Screenshot failed.');
    if (innerWidth !== viewport.width || innerHeight !== viewport.height) throw new Error('Window resized during capture. Please try again.');
    const label = p ? `${p.preset}-${p.width}x${p.height}` : 'workspace';
    const timestamp = new Date().toISOString().replace(/[:.]/g,'-');
    await saveScreenshot(response.dataUrl,rect,viewport,`DuoView-${label.replace(/[^a-z0-9-]/gi,'-')}-${timestamp}.png`);
    toast('PNG saved to your browser downloads.');
  } catch(error) {toast(error.message);}
  finally {capturing=false;lastCapture=Date.now();buttons.forEach(button=>button.disabled=false);}
}
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    chrome.storage.local.set({layoutVersion:2, panes: panes.map(p => ({id:p.id, width:p.width, height:p.height, preset:p.preset, scale:p.scale, panelWidth:p.panelWidth, url:p.history.entries[p.history.index] || ''}))}).catch(() => toast('Your workspace could not be saved.'));
  }, 150);
}
function fit(p) {
  const stage = $('.stage',p.el);
  if (!p.panelWidth && p.width <= 600) {
    // Reserve real platform scrollbar width plus padding and breathing room.
    // A phone's CSS viewport stays unchanged; only its surrounding pane grows.
    const gutter = stage.offsetWidth - stage.clientWidth;
    const paneWidth = Math.max(440, p.width + 30 + gutter);
    p.el.style.flex = `0 0 ${paneWidth}px`;
    p.el.style.minWidth = `${paneWidth}px`;
  }
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
  p.el.style.flex = p.width <= 600 ? `0 0 ${Math.max(440,p.width+30)}px` : `1 0 ${Math.max(960,p.width*.75)+14}px`;
  p.el.style.minWidth = p.width <= 600 ? `${Math.max(440,p.width+30)}px` : `${Math.max(960,p.width*.75)+14}px`;
  if (p.panelWidth) {p.el.style.flex=`1 1 ${p.panelWidth}px`;p.el.style.minWidth='320px';}
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
    status(p,'Not loading? Try compatibility mode or Open in tab.');
  },15000);
  if (!p.started) {
    // Never insert an extension-origin blank document with both permissions.
    p.frame.remove();
    p.frame.src = url;
    p.frame.setAttribute('sandbox', p.previewSandbox);
    $('.screen',p.el).prepend(p.frame);
    p.started = true;
    return;
  }
  try {
    const result = await request({type:'NAVIGATE',paneId:p.id,url,reload:mode === 'reload'});
    if (!result?.ok) p.frame.src = url;
  } catch { p.frame.src = url; }
}
function addPane(config = {}) {
  const p = {id:crypto.randomUUID(),width:402,height:874,preset:'iPhone 16 Pro',scale:'width',...config,history:{entries:[],index:-1},busy:false};
  p.el = $('#pane-template').content.firstElementChild.cloneNode(true); p.el.dataset.paneId = p.id;
  p.frame = $('iframe',p.el); p.frame.name = `duoview-${p.id}`;
  p.previewSandbox = p.frame.getAttribute('sandbox');
  p.frame.sandbox.remove('allow-same-origin');
  for (const [name] of presets) $('.preset',p.el).add(new Option(name,name));
  $('.navigation',p.el).addEventListener('submit',event => { event.preventDefault(); $('.pane-url',p.el).blur(); navigate(p,$('.pane-url',p.el).value); });
  p.el.addEventListener('click', async event => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    const current = p.history.entries[p.history.index];
    if (action === 'screenshot') { await screenshot(p); }
    else if (action === 'back' || action === 'forward') {
      const url = step(p.history,action === 'back' ? -1 : 1);
      if (url) await navigate(p,url,'traverse');
    } else if (action === 'reload' && current) await navigate(p,current,'reload');
    else if (action === 'open' && current) {
      const result = await request({type:'OPEN_TAB',url:current}); if (!result?.ok) toast(result?.error || 'Could not open tab.');
    } else if (action === 'remove') {
      if (panes.length === 1) return toast('Keep at least one viewport open.');
      clearTimeout(p.timer); cancelAnimationFrame(p.resizeFrame); p.observer.disconnect(); p.el.remove(); panes = panes.filter(item => item !== p); updateCount(); save();
    } else if (action === 'rotate') {
      p.panelWidth=null; [p.width,p.height] = [p.height,p.width]; p.preset = 'Custom'; refresh(p); save();
    }
  });
  $('.preset',p.el).addEventListener('change',event => {
    p.panelWidth=null; p.preset = event.target.value; const preset = presets.find(item => item[0] === p.preset);
    if (preset[1]) [p.width,p.height] = preset.slice(1); refresh(p); save();
  });
  for (const dimension of ['width','height']) $('.'+dimension,p.el).addEventListener('change',event => {
    const value = Number(event.target.value);
    if (!Number.isInteger(value) || value < 240 || value > 3840) { toast('Viewport dimensions must be between 240 and 3840 pixels.'); refresh(p); return; }
    p.panelWidth=null; p[dimension] = value; p.preset = 'Custom'; refresh(p); save();
  });
  $('.scale',p.el).addEventListener('change',event => {p.scale=event.target.value;fit(p);save();});
  panes.push(p); $('#panes').append(p.el);
  p.observer = new ResizeObserver(() => {
    cancelAnimationFrame(p.resizeFrame);
    p.resizeFrame = requestAnimationFrame(() => { if (p.el.isConnected) fit(p); });
  }); p.observer.observe($('.stage',p.el));
  refresh(p); updateCount(); if (config.url) navigate(p,config.url);
  return p;
}
function updateCount() { rebuildDividers(panes,refresh,save); $('#view-count').textContent = `${panes.length} viewport${panes.length===1?'':'s'}`; $('#add').disabled = panes.length >= 6; }
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
    status(p,'Could not load. Try compatibility mode or Open in tab.');
  }
});
$('#global-form').addEventListener('submit',event => {
  event.preventDefault();
  let url; try {url=normalizeUrl($('#global-url').value);} catch(error){return toast(error.message);}
  $('#global-url').value=url; panes.forEach(p => navigate(p,url));
});
$('#add').addEventListener('click',() => {if(panes.length<6) { addPane({url:panes[0]?.history.entries[panes[0]?.history.index] || ''}); save(); }});
$('#capture-workspace').addEventListener('click',()=>screenshot());
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
