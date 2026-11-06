// New-chapter integration regression. Interception only; production assets are unchanged.
const {chromium}=require('playwright-core');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const report={checks:[],errors:[],screenshots:[],method:'Production frame and input handlers with deterministic browser-only dt. Moonwood tokens and route progression use actual WASD inputs guided by exposed waypoint coordinates. Combat fixtures, route-gate positioning, death and victory boundaries are controlled-state integration checks, not a full manual playthrough. AudioContext is disabled in the isolated headless browser. Screenshots use actual high-quality WebGL rendering without image alteration.'};
const check=(name,detail={})=>{report.checks.push({name,detail});console.log(JSON.stringify({check:name,...detail}));};
const approx=(actual,expected,label)=>assert(Math.abs(actual-expected)<1e-6,`${label}: expected ${expected}, received ${actual}`);
const initialRecord={wins:4,best:32,campaignWins:3,campaignBest:120,journeyWins:2,journeyBest:240};
const injected=`
window.__qaExpansionSnapshot=()=>{
 const objects=[];scene.traverse(o=>objects.push(o));
 const direction=camera.getWorldDirection(new THREE.Vector3()).setY(0).normalize();
 return {...window.__trial.getState(),record:{...record},checkpointTime,nextStage,heroY:hero.position.y,attackQueued,dodge,
  camera:camera.position.toArray(),cameraForward:{x:direction.x,z:direction.z},
  finite:objects.every(o=>[...o.position.toArray(),...o.quaternion.toArray(),...o.scale.toArray()].every(Number.isFinite))&&[...camera.position.toArray(),...camera.quaternion.toArray(),camera.fov].every(Number.isFinite),
  title:$('result-title').textContent,objective:$('objective-text').textContent,
  resultVisible:!$('result').classList.contains('hidden'),bossHudVisible:!$('boss-hud').classList.contains('hidden'),
  targetAvailable:targetAvailable(),guardianVisible:guardian.visible,spiritVisible:spirit.root.visible,stoneVisible:stone.root.visible,
  effects:scene.children.filter(o=>/effect|hazard|telegraph|wind/i.test(o.name)).map(o=>({name:o.name,visible:o.visible,children:o.children.length}))};
};
window.__qaExpansionTick=seconds=>{for(let left=seconds;left>1e-8;left-=.02){window.__qaFrameDt=Math.min(.02,left);frame();}delete window.__qaFrameDt;return window.__qaExpansionSnapshot();};
let qaExpansionQuality=null;
window.__qaExpansionRender=()=>{if(qaExpansionQuality===null)qaExpansionQuality=prefs.quality;prefs.quality='high';setQuality();renderer.render(scene,camera);};
window.__qaExpansionRestoreQuality=()=>{if(qaExpansionQuality!==null){prefs.quality=qaExpansionQuality;qaExpansionQuality=null;setQuality();}};
window.__qaExpansionSeed=(kind,value)=>{
 if(kind==='lose'){invincible=0;hurtHero(99999);}
 else if(kind==='win'){if(mode==='play'){bossHP=1;hurtBoss(10,true);}}
 else if(kind==='encounter')startEncounter(value);
 else if(kind==='expansion')beginExpansion(value);
 else if(kind==='menu')returnMenu();
 else if(kind==='phase')bossHP=bossMax*.49;
 else if(kind==='immortal')invincible=9999;
 else if(kind==='mortal'){invincible=0;health=100;impactPause=0;}
 else if(kind==='path'){hero.position.copy(expansion.samplePath(value.kind,value.progress));cameraYaw=0;camera.position.copy(hero.position).add(new THREE.Vector3(0,4.5,7.5));updateCamera(1);}
 else if(kind==='place'){hero.position.set(...value.hero);boss.position.set(...value.boss);cameraYaw=0;camera.position.copy(hero.position).add(new THREE.Vector3(0,4.5,7.5));updateCamera(1);}
 else if(kind==='melee'){stamina=100;focus=0;frozen=8;attack=null;attackQueued=false;dodge=healTimer=0;combo=0;lastAttack=-10;}
 else if(kind==='thaw'){frozen=0;invincible=9999;}
 return window.__qaExpansionSnapshot();
};
`;
let browser;
(async()=>{
 browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const evidence=path.join(__dirname,'evidence');fs.mkdirSync(evidence,{recursive:true});
 async function makePage(mobile=false){
  const context=await browser.newContext({viewport:mobile?{width:844,height:390}:{width:1100,height:680},deviceScaleFactor:1,isMobile:mobile,hasTouch:mobile});
  const page=await context.newPage();
  page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
  await page.addInitScript(record=>{window.requestAnimationFrame=()=>0;window.AudioContext=undefined;window.webkitAudioContext=undefined;localStorage.clear();localStorage.setItem('lingshan-prefs',JSON.stringify({quality:'low',cinematics:false,volume:0,muted:true}));localStorage.setItem('lingshan-record',JSON.stringify(record));},initialRecord);
  await page.route('**/main.js',async route=>{const response=await route.fetch();let body=await response.text();const anchor='const rawDt=Math.min(clock.getDelta(),.25)';assert(body.includes(anchor),'production frame instrumentation anchor');body=body.replace(anchor,'const rawDt=Math.min(window.__qaFrameDt??clock.getDelta(),.25)').replace('renderer.render(scene,camera);','');await route.fulfill({response,body:body+injected});});
  await page.goto('http://127.0.0.1:5175',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__qaExpansionSnapshot,null,{polling:100,timeout:30000});await page.waitForTimeout(450);
  const state=()=>page.evaluate(()=>window.__qaExpansionSnapshot());
  const tick=seconds=>page.evaluate(seconds=>window.__qaExpansionTick(seconds),seconds);
  const seed=(kind,value)=>page.evaluate(([kind,value])=>window.__qaExpansionSeed(kind,value),[kind,value]);
  return {page,context,state,tick,seed};
 }
 async function capture(page,name){await page.evaluate(()=>window.__qaExpansionRender());try{await page.screenshot({path:path.join(evidence,name)});report.screenshots.push('evidence/'+name);}finally{await page.evaluate(()=>window.__qaExpansionRestoreQuality());}}
 async function selectChapter(api,chapter){await api.seed('menu');await api.page.click('#chapters-btn');assert(await api.page.locator('[data-chapter="'+chapter+'"]').isVisible(),chapter+' is available in chapter picker');await api.page.click('[data-chapter="'+chapter+'"]');const s=await api.state();assert.equal(s.stage,chapter);assert.equal(s.mode,'play');assert.equal(s.practiceRun,true);assert.equal(s.checkpoint,chapter);assert(s.finite);return s;}
 async function navigate(api,stage,{onState=()=>{},limit=400}={}){
  // Follow the route's public target using real keyboard state, without moving the player through test hooks.
  let held=new Set();
  try{for(let i=0;i<limit;i++){
   let s=await api.state();if(s.stage!==stage)return s;assert(s.finite,'finite route scene');
   const target=s.expansion.target;assert(target&&Number.isFinite(target.x)&&Number.isFinite(target.z),'route supplies a finite target');
   // Rockfall waypoints hand over after passing three metres beyond the marked crossing.
   const targetZ=stage==='emberpass'&&target.name.startsWith('落石关')?target.z-3.5:target.z;
   const dx=target.x-s.player.x,dz=targetZ-s.player.z,forward=s.cameraForward;
   const ahead=dx*forward.x+dz*forward.z,side=dx*(-forward.z)+dz*forward.x;
   const next=new Set();if(Math.abs(ahead)>.22)next.add(ahead>0?'KeyW':'KeyS');if(Math.abs(side)>.35)next.add(side>0?'KeyD':'KeyA');
   for(const key of held)if(!next.has(key))await api.page.keyboard.up(key);
   for(const key of next)if(!held.has(key))await api.page.keyboard.down(key);
   held=next;s=await api.tick(.15);await onState(s);
  }throw Error('Real-keyboard navigation did not finish '+stage+' within '+limit+' steps');}
  finally{for(const key of held)await api.page.keyboard.up(key);}
 }
 const api=await makePage();const {page,state,tick,seed}=api;
 for(const chapter of ['emberpass','stoneking']){const direct=await selectChapter(api,chapter);assert.equal(direct.health,100);assert.deepEqual(direct.record,initialRecord);if(chapter==='stoneking'){assert.equal(direct.bossMax,1120);assert.equal(direct.armor.armor,3);}check('chapter picker directly opens '+chapter,{stage:direct.stage,practice:direct.practiceRun});}
 let s=await selectChapter(api,'moonwood');assert.equal(s.expansion.collected,0);assert.equal(s.expansion.total,3);assert(!s.targetAvailable&&!s.bossHudVisible&&!s.guardianVisible&&!s.spiritVisible&&!s.stoneVisible);check('chapter picker starts moonwood practice',{stage:s.stage,practice:s.practiceRun,total:s.expansion.total});
 await tick(.1);await capture(page,'qa-moonwood-desktop.png');
 await seed('path',{kind:'moonwood',progress:1});s=await tick(.2);assert.equal(s.stage,'moonwood');assert.equal(s.expansion.collected,0);assert.equal(s.expansion.complete,false);check('controlled moonwood exit requires all three tokens');
 await selectChapter(api,'moonwood');
 let reachedFirst=false;
 try{await navigate(api,'moonwood',{onState:async snapshot=>{if(snapshot.stage==='moonwood'&&snapshot.expansion.collected>=1){reachedFirst=true;throw Error('QA_FIRST_TOKEN_REACHED');}}});}catch(error){if(error.message!=='QA_FIRST_TOKEN_REACHED')throw error;}
 assert(reachedFirst);s=await state();assert(s.expansion.collected>=1);const beforeDeathTime=s.checkpointTime;await seed('lose');assert.equal((await state()).mode,'lost');await page.click('#retry');s=await state();assert.equal(s.stage,'moonwood');assert.equal(s.expansion.collected,0);assert.equal(s.health,100);assert.equal(s.gameTime,beforeDeathTime);assert(s.practiceRun);check('moonwood route death retries route and resets tokens');
 const beforePause=s.gameTime;await page.keyboard.press('Escape');const pausedExpansion=(await state()).expansion;await tick(2);s=await state();assert(s.paused);assert.equal(s.gameTime,beforePause);assert.deepEqual(s.expansion,pausedExpansion);await page.keyboard.press('Escape');check('pause freezes moonwood objective progression');
 const tokenCounts=new Set([0]);s=await navigate(api,'moonwood',{onState:async snapshot=>{if(snapshot.stage==='moonwood')tokenCounts.add(snapshot.expansion.collected);}});assert.equal(s.stage,'emberpass');assert(s.practiceRun);assert(tokenCounts.has(1)&&tokenCounts.has(2)&&tokenCounts.has(3));check('real WASD collects three moonwood tokens and opens emberpass',{observedTokenCounts:[...tokenCounts],next:s.stage});
 await tick(.1);await capture(page,'qa-emberpass-desktop.png');
 await seed('mortal');await seed('path',{kind:'emberpass',progress:(90-71)/72});const preRock=await state();s=await tick(2.4);assert(s.health<preRock.health,'standing in a marked rockfall zone deals actual hazard damage');assert(s.health>0);check('controlled center-lane fixture receives actual falling-rock damage',{damage:preRock.health-s.health});
 await seed('lose');assert.equal((await state()).mode,'lost');await page.click('#retry');s=await state();assert.equal(s.stage,'emberpass');assert.equal(s.health,100);assert(s.practiceRun);check('emberpass death retries current route');
 await seed('immortal');s=await navigate(api,'emberpass');assert.equal(s.stage,'stoneking');assert(s.practiceRun);assert(s.stoneVisible&&!s.spiritVisible&&!s.guardianVisible);assert.equal(s.armor.armor,3);check('real WASD traverses emberpass into stoneking',{bossMax:s.bossMax,armor:s.armor.armor});
 await tick(.1);await capture(page,'qa-stoneking-desktop.png');
 await seed('place',{hero:[0,0,-2.4],boss:[0,0,-5]});await seed('melee');
 const lightDamage=[];
 for(const expected of [24*.35,31*.35,38*.35]){const before=await state();await page.keyboard.press('KeyJ');s=await tick(.9);lightDamage.push(before.bossHP-s.bossHP);approx(lightDamage.at(-1),expected,'armored light-combo damage');assert.equal(s.armor.armor,3,'third light hit must not be treated as a heavy armor breaker');}
 check('actual three-hit J combo respects armor and never breaks it',{damage:lightDamage,armor:s.armor.armor});
 const heavyDamage=[];
 for(let i=0;i<3;i++){await seed('melee');const before=await state();await page.keyboard.press('KeyK');s=await tick(1.4);heavyDamage.push(before.bossHP-s.bossHP);approx(heavyDamage.at(-1),i===2?58*1.25:58,'heavy damage through armor');assert.equal(s.armor.armor,2-i);}
 assert(s.armor.broken);assert(s.armor.vulnerableRemaining>0);check('actual K attacks remove three armor layers and expose boss',{damage:heavyDamage,armor:s.armor.armor,broken:s.armor.broken});
 await seed('melee');const exposedHP=(await state()).bossHP;await page.keyboard.press('KeyJ');s=await tick(.8);approx(exposedHP-s.bossHP,24*1.25,'exposed light damage');const vulnerability=s.armor.vulnerableRemaining;await tick(1);s=await state();approx(s.armor.vulnerableRemaining,vulnerability,'immobilize pauses vulnerability timer');check('actual J gets exposed bonus and freeze pauses armor recovery',{damage:exposedHP-s.bossHP,vulnerability});
 await seed('thaw');s=await tick(7.3);assert.equal(s.armor.armor,3);assert.equal(s.armor.broken,false);check('stoneking armor restores after vulnerability interval');
 await seed('phase');s=await tick(.1);assert.equal(s.phase,2);assert.equal(s.mode,'play');const stoneCheckpoint=s.checkpointTime;await seed('lose');assert.equal((await state()).mode,'lost');await page.click('#retry');s=await state();assert.equal(s.stage,'stoneking');assert.equal(s.health,100);assert.equal(s.armor.armor,3);assert.equal(s.phase,1);assert.equal(s.gameTime,stoneCheckpoint);assert(s.practiceRun);check('stoneking second phase and current-boss retry restore armor');
 await seed('win');s=await state();assert.equal(s.mode,'won');assert.equal(s.journeyWins,initialRecord.journeyWins);assert.deepEqual(s.record,initialRecord);check('practice final victory preserves every saved record');
 await seed('menu');s=await state();assert(!s.stoneVisible);assert.equal(s.armor.pendingHazards,0);assert.equal(s.armor.queuedMeteors,0);check('return menu clears stoneking hazards');
 // A controlled late-campaign fixture isolates completion accounting without replaying legacy chapters.
 await page.click('#start');s=await state();assert.equal(s.practiceRun,false);await seed('encounter','spirit');await seed('win');s=await state();assert.equal(s.mode,'cleared');assert.equal(s.nextStage,'moonwood');assert.equal(s.journeyWins,initialRecord.journeyWins);await page.click('#retry');s=await state();assert.equal(s.stage,'moonwood');assert.equal(s.practiceRun,false);await seed('expansion','emberpass');assert.equal((await state()).practiceRun,false);await seed('encounter','stoneking');await tick(1);await seed('win');s=await state();assert.equal(s.mode,'won');assert.equal(s.journeyWins,initialRecord.journeyWins+1);assert.equal(s.record.wins,initialRecord.wins);assert.equal(s.record.campaignWins,initialRecord.campaignWins);const completedRecord=s.record;await seed('win');await tick(.2);assert.deepEqual((await state()).record,completedRecord);check('controlled full-run boundary increments only new journey record once',{journeyWins:s.journeyWins,legacyCampaignWins:s.record.campaignWins});
 await api.context.close();
 const mobile=await makePage(true);await mobile.page.click('#chapters-btn');const choices=await mobile.page.locator('[data-chapter]').count();assert(choices>=3);await mobile.page.locator('[data-chapter="moonwood"]').tap();s=await mobile.tick(.1);assert.equal(s.stage,'moonwood');await capture(mobile.page,'qa-expansion-mobile.png');const layout=await mobile.page.evaluate(()=>{const r=id=>{const b=document.getElementById(id).getBoundingClientRect();return{x:b.x,y:b.y,width:b.width,height:b.height};};return{width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,card:r('journey-card'),joystick:r('joystick'),attack:r('attack')};});assert.equal(layout.scrollWidth,layout.width);assert.equal(layout.scrollHeight,layout.height);const overlap=(a,b)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;assert(!overlap(layout.card,layout.joystick)&&!overlap(layout.card,layout.attack));check('mobile chapter selection and objective card fit 844x390',{choices,width:layout.width,height:layout.height});await mobile.context.close();
 assert.deepEqual(report.errors,[]);report.complete=true;await browser.close();fs.writeFileSync(path.join(__dirname,'qa-expansion-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({complete:true,checks:report.checks.length,screenshots:report.screenshots.length,errors:report.errors}));
})().catch(async error=>{report.failure=String(error);report.stack=error.stack;console.error(error);await browser?.close().catch(()=>{});fs.writeFileSync(path.join(__dirname,'qa-expansion-report.json'),JSON.stringify(report,null,2));process.exit(1);});
