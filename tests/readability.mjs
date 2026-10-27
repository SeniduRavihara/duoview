import {mkdtemp,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root=path.resolve(import.meta.dirname,'..');
const profile=await mkdtemp(path.join(tmpdir(),'duoview-readability-'));
const context=await chromium.launchPersistentContext(profile,{channel:'chromium',executablePath:process.env.CHROMIUM_PATH || undefined,headless:true,viewport:{width:1920,height:900},args:[`--disable-extensions-except=${root}/extension`,`--load-extension=${root}/extension`,'--no-sandbox']});
try {
 const worker=context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));const url=`chrome-extension://${new URL(worker.url()).host}/studio.html`;
 // Existing users already have the old Fit preference saved.
 await worker.evaluate(()=>chrome.storage.local.set({panes:[{preset:'Desktop HD',width:1280,height:720,scale:'fit'},{preset:'iPhone 16 Pro',width:402,height:874,scale:'fit'}]}));
 await page.goto(url);await page.locator('.pane').nth(1).waitFor();
 // Reserve a classic scrollbar gutter even on headless systems using overlay scrollbars.
 await page.addStyleTag({content:'.stage { scrollbar-gutter: stable; } .stage::-webkit-scrollbar { width: 18px; height: 18px; }'});
 await mkdir(path.join(root,'artifacts'),{recursive:true});
 for(const size of [{width:1920,height:900},{width:1440,height:900},{width:1366,height:768}]){
  await page.setViewportSize(size);await page.waitForTimeout(200);
  const measurements=await page.locator('iframe').evaluateAll(frames=>frames.map(f=>{const r=f.getBoundingClientRect();return {width:r.width,height:r.height,top:r.top,scale:r.width/parseFloat(f.style.width)};}));
  console.log(JSON.stringify({size,measurements}));
  await page.screenshot({path:path.join(root,`artifacts/readability-${size.width}.png`)});
  const overflow=await page.locator('.stage').nth(1).evaluate(el=>({available:el.clientWidth,content:el.scrollWidth}));
  console.log('Mobile outer scroll area',overflow);
  assert.ok(overflow.content<=overflow.available,'Mobile stage must not overflow horizontally with a classic vertical scrollbar');
  assert.ok(measurements[1].width>=390,'Mobile preview must remain near native width, not thumbnail size');
  assert.ok(measurements[0].width>=950,'Desktop preview must retain readable text');
  assert.ok(measurements.every(r=>r.top<=150),'Preview must begin within 150px of the top');
 }
 assert.deepEqual(errors,[], 'Resizing must not cause ResizeObserver loop errors');
 console.log('PASS: readable default previews at all three sizes, including migration from saved Fit');
}finally{await context.close();await rm(profile,{recursive:true,force:true});}
