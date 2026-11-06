// Focused integration QA: production inputs/logic, browser-only deterministic
// frame time and suppressed rendering. No production test mutators are added.
const {chromium}=require('playwright-core');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const report={checks:[],errors:[],method:'Isolated Chromium with actual key/pointer input and browser-only deterministic dt; WebGL render calls suppressed for flow checks. Bookmark fixtures are explicitly marked. Touch sizes are emulated, not device tests. Real AudioContext state is checked separately; no listening-quality claim.'};
const check=(name,detail={})=>{report.checks.push({name,detail});console.log(JSON.stringify({check:name,...detail}));};
const injected=`
window.__qaOptState=()=>({...window.__trial.getState(),battleDifficulty,checkpointTime,hitCount,damageTaken,attackQueued,queuedHeavy,queuedDodge,dodge,keys:[...keys],audio:audio.getState?.()});
window.__qaOptTick=seconds=>{for(let left=seconds;left>1e-8;left-=.02){window.__qaFrameDt=Math.min(.02,left);frame();}delete window.__qaFrameDt;return window.__qaOptState();};
`;
let browser;
(async()=>{
 browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 async function makePage({width=1100,height=680,touch=false,audio=false,checkpoint=null}={}){
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,hasTouch:touch,isMobile:touch});
  const page=await context.newPage();page.on('pageerror',error=>report.errors.push(error.message));page.on('console',message=>{if(message.type()==='error')report.errors.push(message.text());});
  await page.addInitScript(({audio,checkpoint})=>{
   window.requestAnimationFrame=()=>0;
   if(!audio){window.AudioContext=undefined;window.webkitAudioContext=undefined;}
   if(!sessionStorage.getItem('qa-optimization-seeded')){
    localStorage.clear();localStorage.setItem('lingshan-prefs',JSON.stringify({quality:'low',cinematics:false,volume:.8,muted:!audio}));
    if(checkpoint!==null)localStorage.setItem('lingshan-checkpoint',checkpoint);
    sessionStorage.setItem('qa-optimization-seeded','1');
   }
  },{audio,checkpoint});
  await page.route('**/main.js',async route=>{const response=await route.fetch();let body=await response.text();const anchor='const rawDt=Math.min(clock.getDelta(),.25)';assert(body.includes(anchor),'deterministic frame anchor');body=body.replace(anchor,'const rawDt=Math.min(window.__qaFrameDt??clock.getDelta(),.25)').replace('renderer.render(scene,camera);','');await route.fulfill({response,body:body+injected});});
  const ready=async()=>{await page.waitForFunction(()=>window.__qaOptState,null,{polling:100,timeout:30000});await page.locator('#boot').waitFor({state:'hidden'});};
  await page.goto('http://127.0.0.1:5175',{waitUntil:'domcontentloaded'});await ready();
  const state=()=>page.evaluate(()=>window.__qaOptState());
  const tick=seconds=>page.evaluate(seconds=>window.__qaOptTick(seconds),seconds);
  const menu=async()=>{const s=await state();if(s.mode==='menu')return;if(s.mode==='play'){if(!s.paused)await page.keyboard.press('Escape');await page.click('#pause-return');}else await page.click('#return-menu');};
  const select=async chapter=>{await menu();await page.click('#chapters-btn');await page.click('[data-chapter="'+chapter+'"]');assert.equal((await state()).stage,chapter);};
  const reload=async()=>{await page.reload({waitUntil:'domcontentloaded'});await ready();};
  return{page,context,state,tick,menu,select,reload};
 }
 const api=await makePage();const {page,state,tick}=api;
 assert.equal(await page.locator('#continue-run').isVisible(),false);
 await api.select('journey');assert.equal(await page.locator('#joystick').isVisible(),false);
 let start=await state();await page.keyboard.down('KeyW');let end=await tick(1);await page.keyboard.up('KeyW');const walk=start.player.z-end.player.z;
 await api.select('journey');start=await state();await page.keyboard.down('ShiftLeft');await page.keyboard.down('KeyW');end=await tick(1);const run=start.player.z-end.player.z;
 // The curved path and smoothing camera slightly reduce world-Z travel.
 assert(walk>4&&walk<4.2,'walk distance '+walk);assert(run>6.25&&run<6.5&&run/walk>1.5,'sprint distance '+run);assert.equal(end.sprinting,true);assert.equal(end.stamina,100);
 check('real Shift+W covers over 50% more route distance than W without stamina cost',{walk,run});
 await page.keyboard.press('Escape');let s=await state();assert(s.paused);assert(!s.sprinting&&!s.sprintToggle);assert.deepEqual(s.keys,[]);const stopped={...s.player};await tick(1);assert.deepEqual((await state()).player,stopped);
 await page.keyboard.up('KeyW');await page.keyboard.up('ShiftLeft');await page.keyboard.press('Escape');await tick(.2);assert.deepEqual((await state()).player,stopped);
 check('pause clears held sprint and movement and resume does not drift');
 await api.select('guardian');await page.keyboard.press('KeyJ');await tick(.12);await page.keyboard.press('KeyK');s=await state();assert(s.attackQueued&&s.queuedHeavy);s=await tick(.5);assert(s.heavy&&s.attackProgress>=0);check('real J then buffered K starts a heavy attack after light recovery');
 await api.select('guardian');await page.keyboard.press('KeyJ');await page.keyboard.press('Space');s=await state();assert(s.queuedDodge>0);assert.equal(s.dodge,0);s=await tick(.14);assert(s.dodge>0&&s.attackProgress<0);assert.equal(s.queuedDodge,0);check('early Space buffers and executes dodge at cancellable attack frame');
 await api.select('guardian');await page.keyboard.down('ShiftLeft');await page.keyboard.down('KeyW');s=await tick(.3);await page.keyboard.up('ShiftLeft');await page.keyboard.up('KeyW');assert(!s.sprinting);check('combat keeps normal movement despite Shift');
 await api.menu();await page.click('#settings-btn');await page.selectOption('#difficulty-select','hard');await page.click('#settings-done');await api.select('stoneking');s=await state();assert.equal(s.bossMax,1540);const practiceSave=await page.evaluate(()=>JSON.parse(localStorage.getItem('lingshan-checkpoint')));assert.equal(practiceSave.stage,'stoneking');assert.equal(practiceSave.practice,true);assert.equal(practiceSave.difficulty,'hard');
 await api.menu();await page.click('#settings-btn');await page.selectOption('#difficulty-select','normal');await page.click('#settings-done');await api.reload();assert(await page.locator('#continue-run').isVisible());await page.click('#continue-run');s=await state();assert.equal(s.stage,'stoneking');assert.equal(s.battleDifficulty,'hard');assert.equal(s.practiceRun,true);assert.equal(s.bossMax,1540);assert.equal(s.health,100);
 check('reload Continue restores practice chapter and original difficulty over new defaults',{stage:s.stage,bossMax:s.bossMax,difficulty:s.battleDifficulty});
 await api.context.close();
 const fullSaved={version:1,stage:'spirit',time:124.5,difficulty:'hard',practice:false,hits:25,damage:68};
 const continued=await makePage({checkpoint:JSON.stringify(fullSaved)});await continued.page.click('#continue-run');s=await continued.state();assert.equal(s.stage,'spirit');assert.equal(s.practiceRun,false);assert.equal(s.battleDifficulty,'hard');assert.equal(s.gameTime,124.5);assert.equal(s.hitCount,25);assert.equal(s.damageTaken,68);assert.equal(s.bossMax,1320);check('controlled full-run bookmark restores counters and full-run eligibility',fullSaved);await continued.context.close();
 const corrupt=await makePage({checkpoint:'{"version":1,broken'});assert.equal(await corrupt.page.locator('#continue-run').isVisible(),false);await corrupt.page.click('#start');s=await corrupt.state();assert.equal(s.stage,'tutorial');assert.equal(s.mode,'play');check('corrupt stored checkpoint safely falls back to new game');await corrupt.context.close();
 for(const [width,height] of [[1200,800],[844,390]]){
  const touch=await makePage({width,height,touch:true});await touch.select('moonwood');
  assert(await touch.page.locator('#joystick').isVisible());assert(await touch.page.locator('#sprint').isVisible());
  const layout=await touch.page.evaluate(()=>{const rect=id=>{const e=document.getElementById(id),r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,visible:getComputedStyle(e).display!=='none'};};return{width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,card:rect('journey-card'),joystick:rect('joystick'),sprint:rect('sprint'),attack:rect('attack'),heavy:rect('heavy'),dodge:rect('dodge')};});
  const overlap=(a,b)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
  assert.equal(layout.scrollWidth,layout.width);assert.equal(layout.scrollHeight,layout.height);
  for(const name of ['joystick','sprint','attack','heavy','dodge'])assert(!overlap(layout.card,layout[name]),'card overlaps '+name+' at '+width+'x'+height);
  await touch.page.locator('#sprint').tap();assert((await touch.state()).sprintToggle);await touch.page.locator('#pause-btn').tap();s=await touch.state();assert(s.paused&&!s.sprintToggle&&!s.sprinting);check('touch controls fit and sprint resets on pause at '+width+'x'+height,layout);await touch.context.close();
 }
 const sound=await makePage({audio:true});await sound.page.click('#start');await sound.page.waitForFunction(()=>window.__qaOptState().audio.context==='running'&&!window.__qaOptState().audio.paused,null,{timeout:10000});s=await sound.state();assert.equal(s.audio.musicLoops,1);assert.equal(s.audio.muted,false);check('actual AudioContext runs one score after Start pointer gesture',{context:s.audio.context,loops:s.audio.musicLoops});
 await sound.page.keyboard.press('Escape');await sound.page.waitForFunction(()=>window.__qaOptState().audio.context==='suspended');assert.equal((await sound.state()).audio.musicLoops,0);await sound.page.click('#pause-settings');
 await sound.page.locator('#music-volume-slider').press('Home');await sound.page.locator('#music-volume-slider').press('ArrowRight');await sound.page.locator('#sfx-volume-slider').press('Home');for(let i=0;i<9;i++)await sound.page.locator('#sfx-volume-slider').press('ArrowRight');
 s=await sound.state();assert.equal(s.musicVolume,.05);assert.equal(s.sfxVolume,.45);assert.equal(s.audio.musicVolume,.05);assert.equal(s.audio.sfxVolume,.45);assert.equal(s.audio.paused,true);await sound.page.click('#settings-done');await sound.page.waitForFunction(()=>window.__qaOptState().audio.context==='running');assert.equal((await sound.state()).audio.musicLoops,1);
 await sound.reload();s=await sound.state();assert.equal(s.musicVolume,.05);assert.equal(s.sfxVolume,.45);assert.equal(s.volume,.8);await sound.page.click('#continue-run');await sound.page.waitForFunction(()=>window.__qaOptState().audio.context==='running');assert.equal((await sound.state()).audio.musicLoops,1);check('actual audio pause/resume and independent channel preferences survive reload',{musicVolume:s.musicVolume,sfxVolume:s.sfxVolume});await sound.context.close();
 assert.deepEqual(report.errors,[]);report.complete=true;await browser.close();fs.writeFileSync(path.join(__dirname,'qa-optimization-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({complete:true,checks:report.checks.length,errors:report.errors}));
})().catch(async error=>{report.failure=String(error);report.stack=error.stack;console.error(error);await browser?.close().catch(()=>{});fs.writeFileSync(path.join(__dirname,'qa-optimization-report.json'),JSON.stringify(report,null,2));process.exit(1);});
