// Controlled-state integration QA. Production assets are unchanged by this runner.
const { chromium } = require('playwright-core');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const report = { checks: [], errors: [], method: 'Production frame() and event handlers, browser-only deterministic time, rendering suppressed except evidence captures. Tutorial and both routes use actual keyboard inputs. Boss victory/defeat/phase and selected combat arrangements use explicitly marked controlled-state hooks; this is not a full manual playthrough. The isolated flow-test browser disables AudioContext because headless macOS audio output is unavailable; audio is outside this regression scope.' };
const check = (name, detail = {}) => { report.checks.push({ name, detail }); console.log(JSON.stringify({ name, detail })); };
const injected = `
window.__qaSnapshot=()=>{
 const objects=[];scene.traverse(o=>objects.push(o));
 return {...window.__trial.getState(),checkpointTime,record:{...record},dodge,healTimer,healDone,heroY:hero.position.y,attackQueued,camera:camera.position.toArray(),cameraFinite:[...camera.position.toArray(),...camera.quaternion.toArray(),camera.fov].every(Number.isFinite),objectsFinite:objects.every(o=>[...o.position.toArray(),...o.scale.toArray(),...o.quaternion.toArray()].every(Number.isFinite)),heroVisible:hero.visible,guardianVisible:guardian.visible,dummyVisible:props.dummy.visible,spiritVisible:spirit.root.visible,summitVisible:props.summit.visible,tip:$('combat-tip').textContent,toast:$('toast').textContent,title:$('result-title').textContent,lesson:$('journey-title').textContent,objective:$('objective-text').textContent,resultVisible:!$('result').classList.contains('hidden'),bossHudVisible:!$('boss-hud').classList.contains('hidden'),cinematics:prefs.cinematics,targetAvailable:targetAvailable(),spiritKeys:Object.keys(spirit)};
};
window.__qaTick=(seconds)=>{for(let left=seconds;left>1e-8;left-=.02){window.__qaFrameDt=Math.min(.02,left);frame();}delete window.__qaFrameDt;return window.__qaSnapshot();};
let qaRenderQuality=null;
window.__qaRender=()=>{if(qaRenderQuality===null)qaRenderQuality=prefs.quality;prefs.quality='high';setQuality();renderer.render(scene,camera);return window.__qaSnapshot();};
window.__qaRestoreRenderQuality=()=>{if(qaRenderQuality!==null){prefs.quality=qaRenderQuality;qaRenderQuality=null;setQuality();}};
window.__qaSeed=(kind,value)=>{
 if(kind==='win'){if(stage!=='guardian'&&stage!=='spirit')throw Error('Not a boss encounter');hurtBoss(bossHP+1,true);}
 else if(kind==='lose'){invincible=0;hurtHero(9999);}
 else if(kind==='phase')bossHP=bossMax*.49;
 else if(kind==='immortal')invincible=9999;
 else if(kind==='encounter')startEncounter(value);
 else if(kind==='cinematics'){prefs.cinematics=!!value;save();}
 else if(kind==='place'){hero.position.set(...value.hero);boss.position.set(...value.boss);cameraYaw=0;camera.position.copy(hero.position).add(new THREE.Vector3(0,4.5,7.5));updateCamera(1);}
 else if(kind==='spellReady'){mana=100;spellCD=0;dodge=0;}
 else if(kind==='meleeReady'){stamina=100;focus=1;frozen=8;attack=null;attackQueued=false;dodge=healTimer=0;combo=0;lastAttack=-10;}
 else if(kind==='menu')returnMenu();
 return window.__qaSnapshot();
};
window.__qaEffects=()=>{const list=[];scene.traverse(o=>{if(o.name&&(/wind|blade|projectile|spirit|青岚|风刃|冲锋/i.test(o.name)))list.push({name:o.name,visible:o.visible,position:o.position.toArray(),children:o.children.map(c=>({name:c.name,visible:c.visible,position:c.position.toArray()}))});});return list;};
`;
let browser;
(async () => {
 browser = await chromium.launch({ executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:true, args:['--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
 const evidenceDir=path.join(__dirname,'evidence');fs.mkdirSync(evidenceDir,{recursive:true});
 async function capture(page,name){
  // Restore rendering settings after the compositor capture; resetting pixel ratio earlier clears the canvas.
  await page.evaluate(()=>window.__qaRender());
  try{await page.screenshot({path:path.join(evidenceDir,name)});report.screenshots??=[];report.screenshots.push('evidence/'+name);}
  finally{await page.evaluate(()=>window.__qaRestoreRenderQuality());}
 }
 async function makePage(mobile=false,cinematics=false){
  const context=await browser.newContext({viewport:mobile?{width:844,height:390}:{width:1100,height:680},deviceScaleFactor:1,isMobile:mobile,hasTouch:mobile});
  const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
  await page.addInitScript(cinematics=>{window.requestAnimationFrame=()=>0;window.AudioContext=undefined;window.webkitAudioContext=undefined;localStorage.clear();localStorage.setItem('lingshan-prefs',JSON.stringify({quality:'low',muted:true,volume:0,cinematics}));localStorage.setItem('lingshan-record',JSON.stringify({wins:4,best:32,campaignWins:0,campaignBest:null}));},cinematics);
  await page.route('**/main.js',async route=>{const response=await route.fetch();let body=await response.text();const anchor='const rawDt=Math.min(clock.getDelta(),.25)';assert(body.includes(anchor),'frame instrumentation anchor');body=body.replace(anchor,'const rawDt=Math.min(window.__qaFrameDt??clock.getDelta(),.25)').replace('renderer.render(scene,camera);','');await route.fulfill({response,body:body+injected});});
  await page.goto('http://127.0.0.1:5175',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__qaSnapshot,null,{polling:100,timeout:30000});await page.waitForTimeout(450);return {page,context};
 }
 const {page,context}=await makePage();
 const state=()=>page.evaluate(()=>window.__qaSnapshot()),tick=seconds=>page.evaluate(seconds=>window.__qaTick(seconds),seconds),seed=(kind,value)=>page.evaluate(([kind,value])=>window.__qaSeed(kind,value),[kind,value]),press=key=>page.keyboard.press(key);
 const finite=s=>{assert(s.cameraFinite&&s.objectsFinite,'finite camera and scene transforms');};
 await page.click('#start');let s=await state();assert.equal(s.stage,'tutorial');assert.equal(s.mode,'play');assert.equal(s.tutorialStep,0);assert(!s.guardianVisible&&!s.spiritVisible&&s.dummyVisible);assert(!s.bossHudVisible);finite(s);check('start enters safe tutorial',{stage:s.stage,player:s.player,boss:s.boss,cinematics:s.cinematics});
 await capture(page,'qa-mountain-desktop.png');
 await page.keyboard.down('KeyW');for(let i=0;i<25&&(await state()).tutorialStep===0;i++)await tick(.2);await page.keyboard.up('KeyW');s=await state();assert.equal(s.tutorialStep,1);assert(s.walked>=6);check('lesson 1: actual keyboard movement',{walked:s.walked,player:s.player});
 await page.keyboard.down('KeyW');for(let i=0;i<50;i++){s=await state();if(Math.hypot(s.player.x-s.boss.x,s.player.z-s.boss.z)<2.7)break;await tick(.1);}await page.keyboard.up('KeyW');for(let i=0;i<3;i++){await press('KeyJ');await tick(1);}s=await state();assert.equal(s.tutorialStep,2);assert.equal(s.tutorialHits,3);check('lesson 2: three actual light hits',{hits:s.tutorialHits,focus:s.focus,player:s.player});
 await press('KeyK');await tick(1.3);s=await state();assert.equal(s.tutorialStep,3);check('lesson 3: heavy hit',{step:s.tutorialStep});
 await press('Space');await tick(.6);s=await state();assert.equal(s.tutorialStep,4);check('lesson 4: dodge',{step:s.tutorialStep,player:s.player});
 await press('Digit1');s=await state();assert.equal(s.tutorialStep,5);assert.equal(s.health,52);assert(s.frozen>0);check('lesson 5: immobilize dummy',{health:s.health,frozen:s.frozen});
 await press('KeyR');await tick(1.4);s=await state();assert.equal(s.stage,'journey');assert.equal(s.tutorialStep,6);assert.equal(s.health,100);assert.equal(s.gourds,3);assert(!s.locked&&!s.targetAvailable&&!s.dummyVisible);check('lesson 6: heal completes and replenishes journey',{stage:s.stage,health:s.health,gourds:s.gourds});
 const journeyTime=s.gameTime;await press('Escape');await tick(2);s=await state();assert(s.paused);assert.equal(s.gameTime,journeyTime);await press('Escape');s=await tick(.1);assert(!s.paused&&s.gameTime>journeyTime);check('pause freezes tutorial/journey simulation',{time:journeyTime,resumed:s.gameTime});
 const manaBefore=s.mana;await press('Digit1');await press('KeyQ');s=await state();assert.equal(s.mana,manaBefore);assert(!s.locked);check('no invisible targets during travel',{locked:s.locked,mana:s.mana});
 await press('KeyM');assert((await state()).paused);assert(await page.locator('.route-list .current').count()===1);await page.click('#map-close');assert(!(await state()).paused);check('route map opens, marks stage, resumes');
 await page.keyboard.down('KeyW');const route=[];let waterfallCaptured=false;for(let i=0;i<240;i++){s=await tick(.25);finite(s);if(!waterfallCaptured&&s.stage==='journey'&&s.player.z<=114){await capture(page,'qa-waterfall-route.png');await page.keyboard.up('KeyW');await page.mouse.move(850,190);await page.mouse.down();await page.mouse.move(620,190,{steps:8});await page.mouse.up();await tick(.7);await capture(page,'qa-waterfall-view.png');await page.mouse.move(620,190);await page.mouse.down();await page.mouse.move(850,190,{steps:8});await page.mouse.up();await tick(.7);await page.keyboard.down('KeyW');waterfallCaptured=true;}if(!route.some(p=>p.waypoint===s.waypoint))route.push({waypoint:s.waypoint,player:s.player,camera:s.camera});if(s.stage==='guardian')break;}await page.keyboard.up('KeyW');s=await state();assert.equal(s.stage,'guardian','actual forward travel reaches original boss');assert.equal(s.waypoint,3);assert.equal(s.bossHP,800);assert(s.guardianVisible&&!s.spiritVisible);check('actual keyboard route reaches three landmarks and guardian',{route,stage:s.stage,health:s.health,checkpoint:s.checkpoint});
 const guardianCheckpoint=s.checkpointTime;await tick(1);await seed('lose');s=await state();assert.equal(s.mode,'lost');await page.click('#retry');s=await state();assert.equal(s.stage,'guardian');assert.equal(s.mode,'play');assert.equal(s.health,100);assert.equal(s.gameTime,guardianCheckpoint);check('controlled guardian defeat retries current boss',{time:s.gameTime,checkpointTime:guardianCheckpoint,health:s.health});
 await seed('win');s=await state();assert.equal(s.mode,'cleared');assert.equal(s.campaignWins,0);assert.equal(s.record.wins,4);assert.equal(s.title,'再上青岚');check('controlled guardian kill opens ascent without recording full victory',{mode:s.mode,campaignWins:s.campaignWins,legacyWins:s.record.wins});
 await page.click('#retry');s=await state();assert.equal(s.stage,'ascent');assert.equal(s.health,100);assert.equal(s.gourds,3);assert(s.summitVisible&&!s.guardianVisible&&!s.spiritVisible);assert(s.player.z>50);check('continue starts replenished cloud ascent',{stage:s.stage,player:s.player});
 await page.keyboard.down('KeyW');for(let i=0;i<80;i++){s=await tick(.2);finite(s);if(s.stage==='spirit')break;}await page.keyboard.up('KeyW');s=await state();assert.equal(s.stage,'spirit');assert.equal(s.bossHP,960);assert(s.spiritVisible&&!s.guardianVisible);check('actual keyboard ascent reaches distinct spirit boss',{stage:s.stage,bossMax:s.bossMax,player:s.player});
 await capture(page,'qa-summit-spirit.png');
 await seed('place',{hero:[0,0,4],boss:[0,0,-5]});await seed('immortal');await seed('spellReady');await press('Digit1');const frozenBefore=await state();s=await tick(.8);assert(s.frozen>0);assert.deepEqual(s.boss,frozenBefore.boss);assert.equal(s.bossState,frozenBefore.bossState);check('controlled range: immobilize freezes spirit movement',{frozen:s.frozen,boss:s.boss,state:s.bossState});
 // Only positions/resources are arranged here; damage must come from production keyboard attacks.
 await seed('place',{hero:[0,0,-2.5],boss:[0,0,-5]});await seed('meleeReady');
 const beforeMelee=await state();await press('KeyJ');s=await tick(.8);
 const lightDamage=beforeMelee.bossHP-s.bossHP;assert.equal(lightDamage,24);assert.equal(s.attackProgress,-1);
 const beforeHeavy=s;await press('KeyK');s=await tick(1.35);
 const heavyDamage=beforeHeavy.bossHP-s.bossHP;assert.equal(heavyDamage,92);assert(heavyDamage>lightDamage);assert.equal(s.attackProgress,-1);assert.equal(s.heroY,0);finite(s);
 check('controlled close range: actual KeyJ and KeyK damage spirit',{lightDamage,heavyDamage,beforeHP:beforeMelee.bossHP,afterHP:s.bossHP,focus:s.focus});
 await tick(8);await seed('immortal');const types=new Set(),states=new Set();for(let i=0;i<240;i++){s=await tick(.1);states.add(s.bossState);types.add(s.tip);finite(s);}check('spirit AI runs through telegraphs and attacks',{states:[...states],tips:[...types],health:s.health,effects:await page.evaluate(()=>window.__qaEffects())});assert(states.size>=3,'spirit AI should cycle states');
 await seed('phase');s=await tick(.1);assert.equal(s.phase,2);assert.equal(s.mode,'play');check('controlled spirit half health starts second phase without guardian CG',{phase:s.phase,mode:s.mode});
 const spiritCheckpoint=s.checkpointTime;await seed('lose');s=await state();assert.equal(s.mode,'lost');await page.click('#retry');s=await state();assert.equal(s.stage,'spirit');assert.equal(s.mode,'play');assert.equal(s.health,100);assert.equal(s.bossHP,960);assert.equal(s.gameTime,spiritCheckpoint);assert.equal(s.phase,1);check('controlled spirit defeat retries spirit only',{stage:s.stage,health:s.health,bossHP:s.bossHP,time:s.gameTime});
 await seed('win');s=await state();assert.equal(s.mode,'cleared');assert.equal(s.nextStage,'moonwood');assert.equal(s.journeyWins,0);assert.equal(s.campaignWins,0);assert.equal(s.record.wins,4);assert(s.resultVisible);await tick(1);assert.equal((await state()).journeyWins,0);check('controlled spirit kill opens moonwood without final victory',{mode:s.mode,nextStage:s.nextStage,journeyWins:s.journeyWins,campaignWins:s.campaignWins,legacyWins:s.record.wins});
 await page.click('#return-menu');s=await state();assert.equal(s.mode,'menu');assert.equal(s.stage,'menu');assert(!s.spiritVisible&&!s.guardianVisible);check('return clears boss scene',{effects:await page.evaluate(()=>window.__qaEffects())});
 await seed('cinematics',true);await seed('encounter','guardian');s=await state();assert.equal(s.mode,'cinematic');assert.equal(s.cinematic.type,'intro');const time=s.gameTime;await tick(1);assert.equal((await state()).gameTime,time);await press('Space');assert.equal((await state()).mode,'play');await seed('phase');s=await tick(.1);assert.equal(s.mode,'cinematic');assert.equal(s.cinematic.type,'phase2');await press('Escape');assert.equal((await state()).mode,'play');check('controlled guardian setup: enabled intro and phase CG freeze time and skip safely');
 await seed('lose');s=await state();assert.equal(s.cinematic.type,'defeat');await tick(4.1);assert.equal((await state()).mode,'lost');check('enabled guardian defeat CG returns checkpoint result');
 await seed('encounter','spirit');s=await state();assert.equal(s.mode,'play');await seed('win');s=await state();assert.equal(s.mode,'cleared');assert.equal(s.nextStage,'moonwood');assert.equal(s.journeyWins,0);assert.equal(s.campaignWins,0);assert.equal(s.cinematic,null);check('controlled spirit setup: clear opens moonwood without guardian CG',{mode:s.mode,nextStage:s.nextStage,journeyWins:s.journeyWins,cinematic:s.cinematic});await context.close();
 const mobile=await makePage(true);await mobile.page.locator('#start').tap();await capture(mobile.page,'qa-mobile-landscape.png');const layout=await mobile.page.evaluate(()=>{const rect=id=>{const e=document.getElementById(id),r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,visible:!e.classList.contains('hidden')};};return {width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,card:rect('journey-card'),joystick:rect('joystick'),attack:rect('attack'),map:rect('route-map')};});assert.equal(layout.scrollWidth,layout.width);assert.equal(layout.scrollHeight,layout.height);const overlap=(a,b)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;assert(!overlap(layout.card,layout.joystick));assert(!overlap(layout.card,layout.attack));check('mobile 844x390 tutorial card avoids movement and attack controls',layout);await mobile.context.close();
 assert.deepEqual(report.errors,[]);report.complete=true;await browser.close();fs.writeFileSync(path.join(__dirname,'qa-journey-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({complete:true,checks:report.checks.length,errors:report.errors}));
})().catch(async error=>{report.failure=String(error);report.stack=error.stack;console.error(error);await browser?.close().catch(()=>{});fs.writeFileSync(path.join(__dirname,'qa-journey-report.json'),JSON.stringify(report,null,2));process.exit(1);});
