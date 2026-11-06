// Smoke test the unmodified production modules and real animation/render loop.
const { chromium } = require('playwright-core');
const assert = require('node:assert/strict');
const fs = require('node:fs');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try {
  const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>localStorage.setItem('lingshan-prefs',JSON.stringify({quality:'high',muted:true,volume:0,cinematics:true})));
  await page.goto('http://127.0.0.1:5175',{waitUntil:'domcontentloaded',timeout:90000});
  await page.waitForFunction(()=>window.__trial?.getState().drawCalls>0,null,{polling:200,timeout:30000});
  await page.click('#start');
  await page.keyboard.down('KeyW');
  await page.waitForFunction(()=>window.__trial.getState().walked>1.5,null,{polling:200,timeout:20000});
  await page.keyboard.up('KeyW');
  await page.waitForFunction(()=>window.__trial.getState().gameTime>1,null,{polling:200});
  const state=await page.evaluate(()=>window.__trial.getState());
  assert.equal(state.stage,'tutorial');assert(state.drawCalls>0);assert(state.triangles>0);assert.deepEqual(errors,[]);
  fs.mkdirSync('evidence',{recursive:true});await page.screenshot({path:'evidence/qa-production-preview.png'});
  const expansionStages=[];
  for(const chapter of ['moonwood','emberpass','stoneking']){
   await page.keyboard.press('Escape');await page.click('#pause-return');await page.click('#chapters-btn');await page.click(`[data-chapter="${chapter}"]`);
   await page.waitForFunction(kind=>{const s=window.__trial.getState();return s.stage===kind&&s.gameTime>.4&&s.drawCalls>0;},chapter,{polling:200,timeout:30000});
   const start=await page.evaluate(()=>window.__trial.getState());await page.keyboard.down('KeyW');
   await page.waitForFunction(z=>window.__trial.getState().player.z<z-.5,start.player.z,{polling:200,timeout:20000});await page.keyboard.up('KeyW');
   const current=await page.evaluate(()=>window.__trial.getState());assert(current.triangles>0);assert.equal(current.mode,'play');assert.deepEqual(errors,[]);
   expansionStages.push({stage:chapter,drawCalls:current.drawCalls,triangles:current.triangles,moved:start.player.z-current.player.z});
  }
  fs.writeFileSync('qa-preview-report.json',JSON.stringify({complete:true,method:'Unmodified modules, real requestAnimationFrame and rendering, real keyboard movement in tutorial and three added stages, isolated headless Chrome; software rendering does not measure phone GPU performance.',state,expansionStages,errors},null,2));
  console.log(JSON.stringify({complete:true,stage:state.stage,quality:state.quality,walked:state.walked,drawCalls:state.drawCalls,triangles:state.triangles,expansionStages,errors}));
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
