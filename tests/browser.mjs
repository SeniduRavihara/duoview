import {createServer} from 'node:http';
import {mkdtemp,rm,mkdir,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(import.meta.dirname,'..');
const html = url => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>DuoView test</title><style>body{margin:0;background:#f5f5ef;color:#18392e;font:16px system-ui}header{padding:24px 6%;border-bottom:1px solid #cdd8cc;display:flex;justify-content:space-between}main{padding:6%;max-width:1000px}h1{font-size:58px;letter-spacing:-3px;line-height:1.06;max-width:650px}p{line-height:1.7;color:#537064}a,button{display:inline-block;background:#224d3d;color:white;padding:12px 18px;border:0;border-radius:8px;text-decoration:none;margin:4px}small{letter-spacing:3px}.cards{display:flex;gap:20px;margin-top:45px}.card{border:1px solid #c7d4c8;background:#e6ece0;padding:25px;flex:1;border-radius:12px} @media(max-width:600px){header{font-size:12px}h1{font-size:42px;letter-spacing:-2px}.cards{flex-direction:column}main{padding:8%}nav{display:none}}</style></head><body><header><b>FIELDWORK / STUDIO</b><nav>Work &nbsp; About &nbsp; Contact</nav></header><main><small>MADE FOR EVERY SCREEN</small><h1>Good ideas deserve<br>room to grow.</h1><p>A small digital studio making thoughtful things for the web.<br>Explore the same story from a different perspective.</p><a id="next" href="/second">Explore our work ↗</a><button id="spa" onclick="history.pushState({},'', '/app');document.querySelector('#path').textContent=location.pathname">App route</button><button id="hash" onclick="location.hash='details'">Hash</button><p id="path">${url}</p><div class="cards"><div class="card"><small>01 / DESIGN</small><h2>Considered details.</h2><p>Built with a little care and a clear point of view.</p></div><div class="card"><small>02 / DEVELOPMENT</small><h2>Every screen matters.</h2><p>From the smallest phone to your biggest idea.</p></div></div></main></body></html>`;
const server=createServer((req,res)=>{
 if(req.url==='/redirect'){res.writeHead(302,{location:'/destination'});res.end();return;}
 if(req.url==='/blocked')res.setHeader('X-Frame-Options','DENY');
 if(req.url==='/csp')res.setHeader('Content-Security-Policy',"frame-ancestors 'none'; script-src 'unsafe-inline'");
 res.setHeader('Content-Type','text/html');res.end(html(req.url));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
const profile=await mkdtemp(path.join(tmpdir(),'duoview-test-'));
let context;
try {
 context=await chromium.launchPersistentContext(profile,{channel:'chromium',executablePath:process.env.CHROMIUM_PATH || undefined,headless:true,viewport:{width:1600,height:1100},args:[`--disable-extensions-except=${root}/extension`,`--load-extension=${root}/extension`,'--no-sandbox']});
 const worker=context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
 const id=new URL(worker.url()).host;
 const page=await context.newPage();const errors=[];const sandboxWarnings=[];page.on('console',m=>{if(m.text().includes('can escape its sandboxing'))sandboxWarnings.push(m.text());});page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE ERROR',e.message)});
 await page.goto(`chrome-extension://${id}/studio.html?url=${encodeURIComponent(base+'/first')}`);
 const pane=i=>page.locator('.pane').nth(i);
 const frame=i=>pane(i).locator('iframe').contentFrame();
 const address=i=>pane(i).locator('.pane-url');
 async function tap(i,selector){
  const element=frame(i).locator(selector);await element.scrollIntoViewIfNeeded();
  const inner=await element.evaluate(el=>{const r=el.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};});
  const outer=await pane(i).locator('iframe').boundingBox();
  const width=await frame(i).locator('body').evaluate(()=>innerWidth);
  const scale=outer.width/width;
  await page.mouse.click(outer.x+inner.x*scale,outer.y+inner.y*scale);
 }

 async function waitUrl(i,url){await page.waitForFunction(({i,url})=>document.querySelectorAll('.pane-url')[i]?.value===url,{i,url});}
 async function go(i,url){await address(i).fill(url);await address(i).press('Enter');await waitUrl(i,url);await frame(i).locator('#path').waitFor();}
 async function ready(i){await pane(i).getByRole('button',{name:'Reload',exact:true}).waitFor();await page.waitForFunction(i=>!document.querySelectorAll('[data-action=reload]')[i].disabled,i);}
 await frame(0).locator('#next').waitFor();await frame(1).locator('#next').waitFor();await ready(0);await ready(1);
 assert.equal(await frame(0).locator('body').evaluate(()=>innerWidth),1280);
 assert.equal(await frame(1).locator('body').evaluate(()=>innerWidth),402);
 await tap(0,'#next');await waitUrl(0,base+'/second');
 await tap(1,'#spa');await waitUrl(1,base+'/app');
 await pane(0).getByRole('button',{name:'Back',exact:true}).click();await waitUrl(0,base+'/first');
 assert.equal(await address(1).inputValue(),base+'/app');
 await ready(0);await pane(0).getByRole('button',{name:'Forward',exact:true}).click();await waitUrl(0,base+'/second');
 assert.equal(await address(1).inputValue(),base+'/app');
 console.log('PASS: independent Back/Forward across full page and SPA navigation');
 await tap(1,'#hash');await waitUrl(1,base+'/app#details');
 await pane(1).getByRole('button',{name:'Back',exact:true}).click();await waitUrl(1,base+'/app');await ready(1);
 await address(0).fill(base+'/redirect');await address(0).press('Enter');await waitUrl(0,base+'/destination');
 await ready(0);await pane(0).getByRole('button',{name:'Back',exact:true}).click();await waitUrl(0,base+'/second');
 console.log('PASS: hash navigation and redirects');
 await ready(0);await pane(0).getByRole('button',{name:'Reload',exact:true}).click();await ready(0);
 await pane(0).getByRole('button',{name:'Back',exact:true}).click();await waitUrl(0,base+'/first');
 console.log('PASS: reload does not duplicate history');
 await pane(1).locator('.settings summary').click();await pane(1).locator('.width').fill('420');await pane(1).locator('.width').press('Tab');
 assert.equal(await frame(1).locator('body').evaluate(()=>innerWidth),420);
 await pane(1).locator('.settings summary').click();await pane(1).getByRole('button',{name:'Rotate viewport'}).click();
 assert.equal(await frame(1).locator('body').evaluate(()=>innerWidth),874);
 await pane(1).locator('.preset').selectOption('iPhone 16 Pro');
 await page.getByRole('button',{name:'Add viewport'}).click();assert.equal(await page.locator('.pane').count(),3);
 await pane(2).getByRole('button',{name:'Remove viewport'}).click();assert.equal(await page.locator('.pane').count(),2);
 console.log('PASS: real viewport sizes, custom dimensions, rotation, add/remove');
 await go(0,base+'/first');await ready(0);
 await address(0).fill(base+'/blocked');await address(0).press('Enter');
 await page.waitForTimeout(1200);
 assert.equal(await frame(0).locator('#path').count(),0);
 await page.locator('#compatibility').check();await frame(0).locator('#path').waitFor();
 await go(0,base+'/csp');
 console.log('PASS: compatibility unlocks X-Frame-Options and CSP frame-ancestors');
 const normal=await context.newPage();await normal.goto(base+'/first');
 await normal.evaluate(url=>{const f=document.createElement('iframe');f.src=url;document.body.append(f);},base+'/blocked');
 await normal.waitForTimeout(600);assert.equal(await normal.locator('iframe').contentFrame().locator('#path').count(),0);await normal.close();
 console.log('PASS: compatibility does not affect ordinary tabs');
 await page.locator('#compatibility').uncheck();
 await go(0,base+'/first');await go(1,base+'/second');await ready(0);await ready(1);
 await page.waitForTimeout(300);
 await page.goto(`chrome-extension://${id}/studio.html`);
 await frame(0).locator('#path').waitFor();await frame(1).locator('#path').waitFor();
 assert.equal(await address(0).inputValue(),base+'/first');assert.equal(await address(1).inputValue(),base+'/second');
 assert.equal(await page.locator('#compatibility').isChecked(),false);
 console.log('PASS: saved URLs and settings restore; compatibility resets');
 await page.locator('#global-url').fill(base+'/first');await page.locator('#global-url').press('Enter');await ready(0);await ready(1);
 await page.waitForTimeout(300);
 await mkdir(path.join(root,'artifacts'),{recursive:true});
 await page.locator('#global-url').blur();
 for(const size of [{width:1920,height:900},{width:1440,height:900}]){
  await page.setViewportSize(size);await page.waitForTimeout(150);
  await page.screenshot({path:path.join(root,'artifacts',`workspace-${size.width}.png`)});
 }
 await page.screenshot({path:path.join(root,'artifacts','workspace.png')});
 await page.setViewportSize({width:1920,height:900});await page.bringToFront();await page.waitForTimeout(200);
 async function capture(button,filename) {
  const waiting=page.waitForEvent('download',{timeout:10000});
  await button.click();const download=await waiting;
  const file=path.join(root,'artifacts',filename);await download.saveAs(file);
  assert.match(download.suggestedFilename(),/^DuoView-.*\.png$/);
  const bytes=await readFile(file);
  const pixels=await page.evaluate(async data=>{
   const bitmap=await createImageBitmap(await (await fetch('data:image/png;base64,'+data)).blob());
   const c=document.createElement('canvas');c.width=bitmap.width;c.height=bitmap.height;
   const ctx=c.getContext('2d');ctx.drawImage(bitmap,0,0);
   const result={width:c.width,height:c.height,pixel:[...ctx.getImageData(Math.floor(c.width/2),20,1,1).data]};bitmap.close();return result;
  },bytes.toString('base64'));
  await page.waitForTimeout(750);return pixels;
 }
 const mobile=await capture(pane(1).getByRole('button',{name:'Screenshot preview'}),'mobile-capture.png');
 assert.equal(mobile.width,402);assert.ok(mobile.height>600 && mobile.height<874);
 assert.deepEqual(mobile.pixel,[245,245,239,255],'Capture contains website pixels, not workspace controls');
 const desktop=await capture(pane(0).getByRole('button',{name:'Screenshot preview'}),'desktop-capture.png');
 assert.equal(desktop.width,1280);assert.equal(desktop.height,720);
 const whole=await capture(page.getByRole('button',{name:'Screenshot workspace'}),'workspace-capture.png');
 assert.equal(whole.width,1920);assert.equal(whole.height,900);
 console.log('PASS: downloaded mobile, desktop and workspace PNGs with correct dimensions and website pixels');
 const divider=page.getByRole('separator').first();
 const beforeWidths=await Promise.all([0,1].map(i=>frame(i).locator('body').evaluate(()=>innerWidth)));
 const unchangedUrl=await address(1).inputValue();
 await frame(1).locator('body').evaluate(()=>window.dragMarker='preserved');
 const boundary=await divider.boundingBox();
 await page.mouse.move(boundary.x+boundary.width/2,boundary.y+150);await page.mouse.down();
 await page.mouse.move(boundary.x-220,boundary.y+150,{steps:12});
 await page.waitForTimeout(100);
 const during=await frame(1).locator('body').evaluate(()=>innerWidth);
 assert.ok(during>beforeWidths[1]+150,'Viewport must resize while dragging, before release');
 assert.equal(await frame(1).locator('nav').evaluate(el=>getComputedStyle(el).display),'block','Responsive CSS must cross its mobile breakpoint');
 await page.mouse.up();
 assert.equal(await frame(1).locator('body').evaluate(()=>window.dragMarker),'preserved','Dragging must not reload the website');
 assert.equal(await address(1).inputValue(),unchangedUrl);
 assert.equal(await page.locator('body').evaluate(el=>el.classList.contains('resizing-viewports')),false);
 await divider.focus();await page.keyboard.press('ArrowLeft');
 await page.waitForTimeout(100);
 const afterKey=await frame(1).locator('body').evaluate(()=>innerWidth);
 assert.equal(afterKey,during+10);
 await page.waitForTimeout(250);
 await page.reload();await frame(1).locator('#path').waitFor();
 assert.equal(await frame(1).locator('body').evaluate(()=>innerWidth),afterKey);
 assert.equal(await page.getByRole('separator').count(),1);
 console.log('PASS: live divider resizing changes CSS breakpoints without reload, keyboard adjustment and persistence');
 assert.deepEqual(sandboxWarnings,[], 'No same-origin blank-frame sandbox warnings');assert.deepEqual(errors,[]);console.log('PASS: no workspace JavaScript errors');
 await page.locator('#compatibility').check();
 const testTabId=await page.evaluate(async()=>(await chrome.tabs.getCurrent()).id);
 assert.ok((await worker.evaluate(()=>chrome.declarativeNetRequest.getSessionRules())).some(r=>r.condition.tabIds.includes(testTabId)));
 await page.close();
 await new Promise(resolve=>setTimeout(resolve,300));
 assert.equal((await worker.evaluate(()=>chrome.declarativeNetRequest.getSessionRules())).some(r=>r.condition.tabIds.includes(testTabId)),false);
 console.log('PASS: compatibility rules removed when workspace closes');
} finally {
 if(context)await context.close();server.close();await rm(profile,{recursive:true,force:true});
}
