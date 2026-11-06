import * as THREE from './vendor/three.module.js';
import { createWorld } from './world.js';
import { GameAudio } from './audio.js';
import { CinematicDirector } from './cinematics.js';
import { createJourneyWorld } from './journey-world.js';
import { createSpiritBoss } from './spirit-boss.js';
import { createCampaignProps } from './campaign-props.js';
import { createExpansionWorld } from './expansion-world.js';
import { createStoneBoss } from './stone-boss.js';
import { readCheckpoint, writeCheckpoint, removeCheckpoint } from './progress.js';

const $=id=>document.getElementById(id), clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
const audio=new GameAudio();
let prefs={quality:matchMedia('(any-pointer:coarse)').matches?'medium':'high',volume:.8,musicVolume:1,sfxVolume:1,difficulty:'normal',muted:false,cinematics:true},record={wins:0,best:null,campaignWins:0,campaignBest:null,journeyWins:0,journeyBest:null};
try{prefs={...prefs,...JSON.parse(localStorage.getItem('lingshan-prefs')||'{}')};record={...record,...JSON.parse(localStorage.getItem('lingshan-record')||'{}')};}catch{}
if(!prefs.volumeCustomized&&(!prefs.audioMixVersion||prefs.audioMixVersion<2)&&prefs.volume===.5)prefs.volume=.8;
prefs.audioMixVersion=2;
if(!['high','medium','low'].includes(prefs.quality))prefs.quality='medium';
if(!['normal','hard'].includes(prefs.difficulty))prefs.difficulty='normal';
for(const key of ['volume','musicVolume','sfxVolume'])prefs[key]=Number.isFinite(prefs[key])?clamp(prefs[key],0,1):key==='volume'?.8:1;
function save(){try{localStorage.setItem('lingshan-prefs',JSON.stringify(prefs));localStorage.setItem('lingshan-record',JSON.stringify(record));}catch{}}
save();
let renderer;
try{renderer=new THREE.WebGLRenderer({canvas:$('scene'),antialias:true,powerPreference:'high-performance'});}catch(e){$('boot-message').textContent='设备未能启动 WebGL 3D，请使用支持硬件加速的浏览器。';throw e;}
renderer.setSize(innerWidth,innerHeight);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
const scene=new THREE.Scene();scene.background=new THREE.Color('#2c3a31');scene.fog=new THREE.FogExp2('#2c3a31',.027);
const camera=new THREE.PerspectiveCamera(48,innerWidth/innerHeight,.1,150);camera.position.set(8,4.2,14);
scene.add(new THREE.HemisphereLight('#b9cbbc','#14201b',2));
const sun=new THREE.DirectionalLight('#ffdaa2',3.8);sun.position.set(-12,20,-12);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-24,right:24,top:24,bottom:-24,near:.5,far:70});sun.shadow.bias=-.0003;sun.shadow.normalBias=.04;scene.add(sun);
const fill=new THREE.DirectionalLight('#b4d3c6',1.7);fill.position.set(9,7,13);scene.add(fill);
const rim=new THREE.PointLight('#eec27e',12,20,2);rim.position.set(2,5,1);scene.add(rim);
// Soft sky reflections give the bronze and jade materials a readable surface.
const envCanvas=document.createElement('canvas');envCanvas.width=512;envCanvas.height=256;const ec=envCanvas.getContext('2d');const eg=ec.createLinearGradient(0,0,0,256);eg.addColorStop(0,'#bbc6b8');eg.addColorStop(.46,'#697e6e');eg.addColorStop(.52,'#36463a');eg.addColorStop(1,'#111b15');ec.fillStyle=eg;ec.fillRect(0,0,512,256);const glow=ec.createRadialGradient(160,80,0,160,80,95);glow.addColorStop(0,'#f7deaa');glow.addColorStop(1,'rgba(247,222,170,0)');ec.fillStyle=glow;ec.fillRect(0,0,512,256);const envTexture=new THREE.CanvasTexture(envCanvas);envTexture.mapping=THREE.EquirectangularReflectionMapping;envTexture.colorSpace=THREE.SRGBColorSpace;scene.environment=envTexture;scene.environmentIntensity=.45;
const existingObjects=new Set(scene.children);
const world=createWorld(scene),{hero}=world,guardian=world.boss;
const courtyardObjects=scene.children.filter(o=>!existingObjects.has(o)&&o!==hero&&o!==guardian);
const journey=createJourneyWorld(THREE,scene),spirit=createSpiritBoss(THREE,scene),props=createCampaignProps(THREE,scene);
const expansion=createExpansionWorld(THREE,scene),stone=createStoneBoss(THREE,scene);
let boss=guardian;
let stage='menu',tutorialStep=0,tutorialHits=0,walked=0,waypoint=0,checkpoint='tutorial',checkpointTime=0,nextStage=null,practiceRun=false;
const lastWalkPosition=new THREE.Vector3();
const stageNames={tutorial:'序 · 山溪习武',journey:'壹 · 云溪山径',guardian:'贰 · 雾隐古刹',ascent:'叁 · 登云天阶',spirit:'肆 · 青岚之巅',moonwood:'伍 · 月下竹海',emberpass:'陆 · 赤霞栈道',stoneking:'终 · 熔岩石猿'};
const stageDescriptions={tutorial:'六式教学 · 移动、棍击、闪避与法术',journey:'听瀑桥 → 桃花望云亭 → 古刹',guardian:'近战妖将 · 横扫与裂地重击',ascent:'战后补给 · 云海天阶',spirit:'远程灵鹿 · 风刃与直线冲锋',moonwood:'月光竹林 · 寻齐三枚灵符开启月门',emberpass:'赤霞山谷 · 看清预警，绕行或闪避落石',stoneking:'熔岩石猿 · 三次重棍破甲，趁虚反击'};
let journeyStorage;try{journeyStorage=localStorage;}catch{}
let savedJourney=readCheckpoint(journeyStorage);
const canSprint=(kind=stage)=>['journey','ascent','moonwood','emberpass'].includes(kind);
const bossNames={guardian:'白鬃 · 守山妖将',spirit:'青岚 · 云海灵鹿',stoneking:'赤魇 · 熔岩石猿'};
const isBossStage=(kind=stage)=>['guardian','spirit','stoneking'].includes(kind);
const isExpansionRoute=(kind=stage)=>kind==='moonwood'||kind==='emberpass';
const lessons=[['行 · 循石而上','WASD / 左侧摇杆移动，沿石径前行 6 米。'],['击 · 拨云三式','靠近路上的木桩，J / 棍击命中 3 次。'],['势 · 重棍破阵','K / 重棍击中木桩，消耗棍势打出重击。'],['避 · 进退自如','空格 / 闪避；移动时闪避可选择方向。'],['术 · 定住风声','靠近木桩，按 1 / 定身，留出反击时机。'],['酿 · 饮酒调息','教学模拟受伤。按 R / 饮酒，等待生命恢复。']];
const stops=[{z:108,name:'听瀑桥',note:'桥左飞瀑入碧潭 · 拖动右侧空白处观景。'},{z:51,name:'桃花望云亭',note:'花影尽头，山门就在云雾深处。'},{z:22.5,name:'雾隐古刹',note:'前方守山妖将；入场时补满状态。'}];
scene.add(sun.target);
const ring=new THREE.Mesh(new THREE.RingGeometry(.6,.64,64),new THREE.MeshBasicMaterial({color:0xd7bd7a,transparent:true,opacity:.65,depthWrite:false,side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.y=.028;scene.add(ring);
const danger=new THREE.Mesh(new THREE.RingGeometry(3.9,4,96),new THREE.MeshBasicMaterial({color:0xdf7c53,transparent:true,opacity:0,side:THREE.DoubleSide,depthWrite:false}));danger.rotation.x=-Math.PI/2;danger.position.y=.035;scene.add(danger);
const spellRing=new THREE.Mesh(new THREE.TorusGeometry(1.8,.015,6,80),new THREE.MeshBasicMaterial({color:0xffd47e,transparent:true,opacity:0}));scene.add(spellRing);
const sparks=[];const sparkGeo=new THREE.SphereGeometry(.035,5,4);const sparkMat=new THREE.MeshBasicMaterial({color:0xffd799});
for(let i=0;i<45;i++){const mesh=new THREE.Mesh(sparkGeo,sparkMat);mesh.visible=false;scene.add(mesh);sparks.push({mesh,v:new THREE.Vector3(),life:0});}
// A ribbon sampled from the actual staff follows each swing, instead of a fixed circle.
const trailHistory=[],trailPositions=new Float32Array(12*18),trailColors=new Float32Array(12*18);
const trailGeometry=new THREE.BufferGeometry();trailGeometry.setAttribute('position',new THREE.BufferAttribute(trailPositions,3).setUsage(THREE.DynamicDrawUsage));trailGeometry.setAttribute('color',new THREE.BufferAttribute(trailColors,3).setUsage(THREE.DynamicDrawUsage));trailGeometry.setDrawRange(0,0);
const slash=new THREE.Mesh(trailGeometry,new THREE.MeshBasicMaterial({vertexColors:true,transparent:true,opacity:.58,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,toneMapped:false}));slash.frustumCulled=false;scene.add(slash);
const shockwave=new THREE.Mesh(new THREE.RingGeometry(.85,1,64),new THREE.MeshBasicMaterial({color:0xeac384,transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide}));shockwave.rotation.x=-Math.PI/2;scene.add(shockwave);
const damagePops=Array.from({length:8},()=>{const el=document.createElement('span');el.className='damage-number';$('hud').append(el);return {el,life:0,pos:new THREE.Vector3(),heavy:false};});
let impactPause=0,heroHit=0,bossHit=0,casting=0,impactKick=0,waveLife=0,bossWindupDuration=1,bossRecoverDuration=1.6,bossMoving=false,perfectEvaded=false;
const smooth=x=>{x=clamp(x,0,1);return x*x*(3-2*x);};
function clearMotion(){impactPause=heroHit=bossHit=casting=impactKick=waveLife=0;hitFlash=shake=0;bossState='idle';bossTimer=2;bossMoving=false;perfectEvaded=false;hero.position.y=0;boss.position.y=0;trailHistory.length=0;trailGeometry.setDrawRange(0,0);shockwave.material.opacity=0;for(const p of damagePops){p.life=0;p.el.style.opacity='0';}}
function damageNumber(amount,heavy){const p=damagePops.find(p=>p.life<=0)||damagePops[0];p.life=.8;p.heavy=heavy;p.pos.copy(boss.position).add(new THREE.Vector3((Math.random()-.5)*.5,2.75,0));p.el.textContent=Math.round(amount);p.el.classList.toggle('heavy-hit',heavy);}
function groundWave(position,heavy=true){shockwave.position.copy(position);shockwave.position.y=.11;waveLife=heavy?.55:.35;shockwave.material.color.set(heavy?0xeac384:0xc48e6b);}
let mode='menu',paused=false,elapsed=0,elapsedReal=0,gameTime=0,attack=null,dodge=0,dodgeDirection=new THREE.Vector3(),healTimer=0,healDone=false,locked=true,combo=0,lastAttack=-10,attackQueued=false,queuedHeavy=false,queuedDodge=0,sprintToggle=false,sprinting=false,cameraYaw=0,cameraPitch=.38,shake=0,toastUntil=0,hitFlash=0,damageTaken=0,hitCount=0,moving=false,portraitDismissed=false;
let battleDifficulty=prefs.difficulty,cinematicContext=null,cinematicSuspended=false;
let health=100,stamina=100,mana=100,bossHP=800,bossMax=800,gourds=3,focus=0,spellCD=0,frozen=0,invincible=0,bossState='idle',bossTimer=2,bossAttackType='sweep',bossDamageDone=false,phase=1,phaseAnnounced=false,bossAttackDuration=1.9;
const keys=new Set(),stickInput={x:0,y:0},clock=new THREE.Clock();let pointerCamera=null,stickPointer=null,dragStart={x:0,y:0};
const lookTarget=new THREE.Vector3(),desiredCam=new THREE.Vector3(),forward=new THREE.Vector3(),right=new THREE.Vector3(),move=new THREE.Vector3(),temp=new THREE.Vector3();
function setQuality(){const q=prefs.quality;renderer.setPixelRatio(Math.min(devicePixelRatio,q==='high'?2:q==='medium'?1.35:1));renderer.shadowMap.enabled=q!=='low';sun.shadow.mapSize.set(q==='high'?2048:1024,q==='high'?2048:1024);if(sun.shadow.map){sun.shadow.map.dispose();sun.shadow.map=null;}world.setQuality(q);world.woods.visible=stage==='guardian';world.particles.visible=stage==='guardian'&&q!=='low';}
setQuality();audio.setVolume(prefs.volume);audio.setMusicVolume?.(prefs.musicVolume);audio.setSfxVolume?.(prefs.sfxVolume);audio.setMuted(prefs.muted);
function toast(text,duration=2){$('toast').textContent=text;toastUntil=gameTime+duration;}
function formatTime(t){return `${String(Math.floor(t/60)).padStart(2,'0')}:${String(Math.floor(t%60)).padStart(2,'0')}`;}
function resetInput(){keys.clear();stickInput.x=stickInput.y=0;stickPointer=null;pointerCamera=null;$('stick').style.transform='';attackQueued=false;queuedHeavy=false;queuedDodge=0;sprintToggle=false;sprinting=false;}
function face(object,target,dt=1){const angle=Math.atan2(target.x-object.position.x,target.z-object.position.z);object.rotation.y+=Math.atan2(Math.sin(angle-object.rotation.y),Math.cos(angle-object.rotation.y))*Math.min(1,dt*12);}
function keepInArena(pos,r=16.4){const len=Math.hypot(pos.x,pos.z);if(len>r){pos.x*=r/len;pos.z*=r/len;}}
function burst(position,power=1){for(let i=0;i<Math.min(22,Math.ceil(12*power));i++){const s=sparks.find(x=>x.life<=0);if(!s)break;s.life=.3+Math.random()*.5;s.mesh.visible=true;s.mesh.position.copy(position);s.v.set((Math.random()-.5)*6,Math.random()*5+1,(Math.random()-.5)*6);}}
function targetAvailable(){return stage==='tutorial'&&tutorialStep>0||isBossStage();}
function setEnvironment(kind){
 audio.setScene?.(kind);
 const courtyard=kind==='guardian',moon=kind==='moonwood',fire=kind==='emberpass'||kind==='stoneking';
 for(const o of courtyardObjects)o.visible=courtyard;
 sun.intensity=courtyard?3.8:moon?1.35:fire?2.2:2.7;sun.color.set(moon?'#b9d8ff':fire?'#ffb371':'#ffdaa2');
 fill.intensity=moon?1.05:courtyard?1.7:.9;fill.color.set(moon?'#aaa8f1':fire?'#cc917c':'#b4d3c6');
 const hemisphere=scene.children.find(o=>o.isHemisphereLight);hemisphere.intensity=courtyard?2:moon?1.3:1.55;hemisphere.color.set(moon?'#a6c3ed':fire?'#d9ac8c':'#b9cbbc');
 renderer.toneMappingExposure=courtyard?1.15:1.02;
 world.particles.visible=courtyard&&prefs.quality!=='low';guardian.visible=courtyard;
 journey.setVisible(kind==='tutorial'||kind==='journey'||kind==='menu');props.summit.visible=kind==='ascent'||kind==='spirit';
 props.dummy.visible=kind==='tutorial';spirit.setVisible(kind==='spirit');stone.setVisible(kind==='stoneking');expansion.setStage(kind);
 scene.background.set(moon?'#13283e':fire?'#573c43':courtyard?'#788f82':kind==='spirit'||kind==='ascent'?'#bfd4df':'#bcd8d5');
 scene.fog=new THREE.Fog(scene.background,moon?25:courtyard?28:48,moon?170:courtyard?110:240);
 camera.far=320;camera.updateProjectionMatrix();document.body.dataset.stage=kind;
}
function updateContinue(){
 const button=$('continue-run');if(!button)return;
 if($('start-label'))$('start-label').textContent=savedJourney?'重新修行':'踏 入 灵 山';
 $('start').title=savedJourney?'从教学重新开始，会替换当前行记':'开始山海行记';
 button.classList.toggle('hidden',!savedJourney);
 if(savedJourney)$('continue-detail').textContent=`${stageNames[savedJourney.stage]}${savedJourney.practice?' · 练习':''}`;
}
function rememberChapter(kind=stage,time=checkpointTime){
 const value={version:1,stage:kind,time,difficulty:battleDifficulty,practice:practiceRun,hits:hitCount,damage:damageTaken};
 if(writeCheckpoint(journeyStorage,value))savedJourney=value;
 updateContinue();
}
function continueJourney(){
 const saved=savedJourney;if(!saved)return;
 selectChapter(saved.stage,saved.difficulty);
 practiceRun=saved.practice;battleDifficulty=saved.difficulty;gameTime=checkpointTime=saved.time;hitCount=saved.hits;damageTaken=saved.damage;
 rememberChapter();updateHUD();toast('行记已续 · 从本章入口出发，状态已补满',4);
}
function freshVitals(){health=stamina=mana=100;gourds=3;focus=0;spellCD=frozen=invincible=0;attack=null;dodge=healTimer=0;casting=0;phase=1;phaseAnnounced=false;combo=0;lastAttack=-10;healDone=false;moving=false;attackQueued=false;}
function showPlay(){mode='play';paused=false;$('menu').classList.add('hidden');$('modal').classList.add('hidden');$('result').classList.add('hidden');$('hud').classList.remove('hidden');$('pause-btn').classList.remove('hidden');document.body.classList.add('playing');}
function setLocked(value){locked=value;$('lock').classList.toggle('active',locked);}
function begin(){
 cinema.cancel();cinematicContext=null;cinematicSuspended=false;resetInput();spirit.reset();stone.reset();practiceRun=false;nextStage=null;
 stage='tutorial';checkpoint='tutorial';checkpointTime=0;tutorialStep=tutorialHits=walked=waypoint=0;
 boss=props.dummy;clearMotion();freshVitals();gameTime=0;damageTaken=hitCount=0;battleDifficulty=prefs.difficulty;
 hero.position.copy(journey.samplePath(0));lastWalkPosition.copy(hero.position);
 boss.position.copy(journey.samplePath(.095));boss.rotation.y=0;hero.rotation.set(0,Math.PI,0);
 cameraYaw=0;cameraPitch=.28;camera.position.copy(hero.position).add(new THREE.Vector3(0,4.2,8));camera.lookAt(hero.position.clone().add(new THREE.Vector3(0,1.65,0)));
 bossHP=bossMax=9999;setLocked(false);setEnvironment(stage);showPlay();audio.start();
 rememberChapter();toast('山溪习武 · 完成六式，再入灵山',4);updateHUD();
 if(matchMedia('(pointer:coarse)').matches&&!document.fullscreenElement)fullscreen();
}
function completeLesson(){
 tutorialStep++;audio.play('heal');
 if(tutorialStep===1){setLocked(true);toast('前方木桩 · 靠近后连击三次',3);}
 if(tutorialStep===5){health=52;toast('模拟受伤 · 饮酒后稍候，恢复体力',4);}
 if(tutorialStep>=lessons.length){
  stage='journey';checkpoint='journey';checkpointTime=gameTime;freshVitals();setLocked(false);cameraYaw=0;cameraPitch=.28;setEnvironment(stage);props.dummy.visible=false;
  rememberChapter();toast('六式已成 · 沿青石山径前往听瀑桥',5);
 }
 updateHUD();
}
function startEncounter(kind,{retry=false}={}){
 if(!isBossStage(kind))throw new Error('Unknown encounter: '+kind);
 cinema.cancel();cinematicContext=null;cinematicSuspended=false;resetInput();stage=kind;nextStage=null;checkpoint=kind;
 if(!retry)checkpointTime=gameTime;else gameTime=checkpointTime;
 boss=kind==='stoneking'?stone.root:kind==='spirit'?spirit.root:guardian;spirit.reset();stone.reset();clearMotion();freshVitals();setEnvironment(kind);showPlay();
 bossMax=({guardian:800,spirit:960,stoneking:1120}[kind])*(battleDifficulty==='hard'?1.375:1);bossHP=bossMax;
 hero.position.set(0,0,10);hero.rotation.set(0,Math.PI,0);boss.position.set(0,0,-5);boss.rotation.set(0,0,0);
 bossState='idle';bossTimer=2;cameraYaw=0;cameraPitch=.38;setLocked(true);camera.position.set(0,4.8,17);camera.lookAt(0,1.65,7);
 rememberChapter();audio.start();toast(kind==='stoneking'?'熔岩石猿 · 三次重棍破甲，小心震地与落陨':kind==='spirit'?'青岚灵鹿 · 横向闪避风刃，冲锋后近身反击':'白鬃守山 · 观察红圈，闪避后反击',5);updateHUD();
 if(kind==='guardian'&&prefs.cinematics)startCinematic('intro');
}
function beginAscent(){
 stage='ascent';nextStage=null;checkpoint='ascent';checkpointTime=gameTime;cinema.cancel();resetInput();clearMotion();freshVitals();spirit.clearEffects();setEnvironment(stage);showPlay();setLocked(false);
 hero.position.set(props.ascentX(52),0,52);hero.rotation.set(0,Math.PI,0);cameraYaw=0;cameraPitch=.3;camera.position.copy(hero.position).add(new THREE.Vector3(0,4.6,8));
 rememberChapter();toast('山门已开 · 已补满生命、法力与葫芦，登阶见灵鹿',5);updateHUD();
}
function beginExpansion(kind,{retry=false}={}){
 if(!isExpansionRoute(kind))throw new Error('Unknown route: '+kind);
 cinema.cancel();cinematicContext=null;cinematicSuspended=false;resetInput();stage=kind;checkpoint=kind;nextStage=null;
 if(retry)gameTime=checkpointTime;else checkpointTime=gameTime;
 spirit.clearEffects();stone.clearEffects();boss=guardian;clearMotion();freshVitals();expansion.reset(kind);setEnvironment(kind);showPlay();setLocked(false);
 hero.position.copy(expansion.samplePath(kind,0));hero.rotation.set(0,Math.PI,0);cameraYaw=0;cameraPitch=.28;
 camera.position.copy(hero.position).add(new THREE.Vector3(0,4.2,8));camera.lookAt(hero.position.clone().add(new THREE.Vector3(0,1.65,0)));
 rememberChapter();audio.start();toast(kind==='moonwood'?'月下竹海 · 靠近三道灵符光柱，开启月门':'赤霞栈道 · 金圈亮起先离开，落石后再前行',5);updateHUD();
}
function chapterSelect(){
 openModal('关卡选择',`<p>可从任意一关开始练习。完整通关记录只从「山溪习武」出发时计入。</p><div class="chapter-grid">${Object.entries(stageNames).map(([id,name])=>`<button class="chapter-card" data-chapter="${id}"><b>${name}${isExpansionRoute(id)||id==='stoneking'?'<em>新</em>':''}</b><small>${stageDescriptions[id]}</small></button>`).join('')}</div>`,'山 海 行 记');
 for(const button of document.querySelectorAll('[data-chapter]'))button.onclick=()=>selectChapter(button.dataset.chapter);
}
function selectChapter(kind,difficulty=prefs.difficulty){
 if(!Object.hasOwn(stageNames,kind))return;if(kind==='tutorial'){begin();return;}
 practiceRun=true;nextStage=null;battleDifficulty=difficulty;gameTime=damageTaken=hitCount=0;
 if(isBossStage(kind))startEncounter(kind);else if(isExpansionRoute(kind))beginExpansion(kind);else if(kind==='ascent')beginAscent();else{
  begin();practiceRun=true;tutorialStep=6;stage='journey';checkpoint='journey';waypoint=0;boss=guardian;setEnvironment(stage);freshVitals();setLocked(false);hero.position.copy(journey.samplePath(.12));rememberChapter();updateHUD();toast('云溪山径 · 沿路标前往听瀑桥',4);
 }
}
function retryCheckpoint(){
 if(mode==='cleared'){const next=nextStage;if(next==='ascent')beginAscent();else if(isExpansionRoute(next))beginExpansion(next);return;}
 if(mode==='won'){if(practiceRun)selectChapter(checkpoint);else begin();return;}
 if(isBossStage(checkpoint))startEncounter(checkpoint,{retry:true});else if(isExpansionRoute(checkpoint))beginExpansion(checkpoint,{retry:true});else begin();
}
function routeMap(){
 const current=Object.keys(stageNames).indexOf(stage);
 openModal('入山行记',`<p>听瀑穿花，越过山门与青岚；寻灵符开月门，穿赤霞，战石猿。</p><ol class="route-list">${Object.entries(stageNames).map(([id,name],i)=>`<li class="${i<current?'complete':id===stage?'current':''}"><b>${i<current?'✓':i+1}</b><div>${name}<small>${stageDescriptions[id]}</small></div></li>`).join('')}</ol><button class="start-button" id="map-close">继续前行</button>`,'山 川 一 卷');$('map-close').onclick=closeModal;
}
function updateJourney(dt){
 if(mode!=='play')return;
 if(isExpansionRoute()){const before=expansion.getState().collected||0;const result=expansion.step(dt,{hero,hurtHero})||expansion.getState();if(mode!=='play')return;if((result.collected||0)>before){audio.play('spell');toast(`灵符归位 · ${result.collected} / 3`,2);}if(result.complete){if(stage==='moonwood')beginExpansion('emberpass');else startEncounter('stoneking');}return;}
 if(stage==='tutorial'){
  walked+=Math.hypot(hero.position.x-lastWalkPosition.x,hero.position.z-lastWalkPosition.z);lastWalkPosition.copy(hero.position);
  if(tutorialStep===0&&walked>=6)completeLesson();
  if(tutorialStep===5&&healDone&&health>=95)completeLesson();
 }else if(stage==='journey'){
  const stop=stops[waypoint];if(stop&&hero.position.z<=stop.z){waypoint++;toast(stop.name+' · '+stop.note,4);if(waypoint===stops.length)startEncounter('guardian');}
 }else if(stage==='ascent'&&hero.position.z<=18.5)startEncounter('spirit');
}
function constrainHero(){
 if(stage==='tutorial'||stage==='journey'){journey.clampPosition(hero.position);if(stage==='tutorial'){hero.position.z=Math.max(139,hero.position.z);journey.clampPosition(hero.position);}}
 else if(stage==='ascent'){hero.position.z=clamp(hero.position.z,17,55);hero.position.x=clamp(hero.position.x,props.ascentX(hero.position.z)-2.7,props.ascentX(hero.position.z)+2.7);}
 else if(isExpansionRoute())expansion.clampPosition(stage,hero.position);
 else keepInArena(hero.position);
}
function returnMenu(){updateContinue();stage='menu';nextStage=null;boss=guardian;spirit.reset();stone.reset();setEnvironment('menu');cinema.cancel();cinematicContext=null;cinematicSuspended=false;restoreCinematicLight();clearMotion();mode='menu';paused=false;attack=null;dodge=healTimer=frozen=0;danger.material.opacity=0;spellRing.material.opacity=0;resetInput();$('result').classList.add('hidden');$('hud').classList.add('hidden');$('modal').classList.add('hidden');$('pause-btn').classList.add('hidden');$('menu').classList.remove('hidden');document.body.classList.remove('playing');hero.position.copy(journey.samplePath(.12));hero.rotation.y=.4;camera.position.copy(hero.position).add(new THREE.Vector3(7,4.5,10));camera.lookAt(hero.position.clone().add(new THREE.Vector3(-3,1,-9)));props.dummy.visible=false;audio.resume();}
function finish(win){
 if(mode!=='play')return;
 spirit.clearEffects();stone.clearEffects();
 const route=isExpansionRoute();if(route)expansion.clearEffects();
 hero.position.y=0;impactPause=0;frozen=0;danger.material.opacity=spellRing.material.opacity=0;attack=null;dodge=healTimer=0;resetInput();setLocked(false);
 $('pause-btn').classList.add('hidden');$('combat-tip').textContent='';
 if(win&&stage!=='stoneking'){
  mode='cleared';nextStage=stage==='guardian'?'ascent':'moonwood';rememberChapter(nextStage,gameTime);
  $('hud').classList.add('hidden');$('result').classList.remove('hidden');
  $('result-kicker').textContent=stage==='guardian'?'山 门 已 开':'青 岚 已 平';$('result-title').textContent=stage==='guardian'?'再上青岚':'月门初启';
  $('result-text').textContent=stage==='guardian'?'守山妖将已败。穿过云海天阶，迎战青岚灵鹿。':'灵鹿让开前路。月下竹海藏着三枚灵符，寻齐后开启通往赤霞的月门。';
  $('result-stats').innerHTML=`<div>${formatTime(gameTime)}<small>行山用时</small></div><div>${stage==='guardian'?'1':'2'} / 3<small>已过 Boss</small></div>`;
  $('retry').textContent=stage==='guardian'?'补给 · 继续登顶':'补给 · 进入月下竹海';audio.play('victory');return;
 }
 mode=win?'won':'lost';
 if(win){removeCheckpoint(journeyStorage);savedJourney=null;updateContinue();}
 $('result-kicker').textContent=win?(practiceRun?'此 关 已 破':'三 劫 尽 消'):'修 行 未 尽';$('result-title').textContent=win?(practiceRun?'试炼告捷':'山海已成'):'再入轮回';
 if(win&&!practiceRun){record.journeyWins=(record.journeyWins||0)+1;record.journeyBest=record.journeyBest==null?gameTime:Math.min(record.journeyBest,gameTime);save();}
 const progress=route?Math.round((expansion.getState().progress||0)*100):Math.round((1-bossHP/bossMax)*100);
 $('result-stats').innerHTML=`<div>${formatTime(gameTime)}<small>本次用时</small></div><div>${hitCount}<small>有效棍击</small></div><div>${win?(practiceRun?'练习':record.journeyWins):progress+'%'}<small>${win?(practiceRun?'不计全程记录':'三劫通关'):'本关进度'}</small></div>`;
 $('retry').textContent=win?(practiceRun?'再练此关':'重启山海行记'):route?'重试当前关卡':'从当前 Boss 重试';
 $('result-text').textContent=win?(practiceRun?'此关练习完成。可返回山门选择其他关卡。':'听瀑、寻符、踏赤霞，三劫已过。山海在前，心自澄明。'):route?'从本关入口重新出发，补满生命与葫芦。留意灵符光柱和地面的落石预警。':'可从当前 Boss 重新挑战，生命、法力与葫芦会补满。';
 audio.play(win?'victory':'death');if(prefs.cinematics&&stage==='guardian')startCinematic('defeat');else showResult(win);
}
function swing(heavy=false){
 if(mode!=='play'||paused)return;
 if(attack){if(attack.progress>.12){attackQueued=true;queuedHeavy=heavy;}return;}
 if(dodge>0||healTimer>0)return;
 const cost=heavy?27:12;if(stamina<cost){toast('气力不足 · 稍息片刻');return;}
 stamina-=cost;combo=gameTime-lastAttack>1.45?0:(combo+1)%3;lastAttack=gameTime;
 const spend=heavy?Math.floor(focus):0;if(heavy)focus=0;
 attack={progress:0,duration:heavy?1.16:[.56,.62,.78][combo],hitAt:heavy?.60:[.42,.46,.57][combo],heavy,combo,damage:heavy?58+spend*34:24+combo*7,hit:false,sounded:false,travel:0,landed:false};
 if(targetAvailable()&&(locked||hero.position.distanceTo(boss.position)<4.2))face(hero,boss.position);
 attack.direction=new THREE.Vector3(Math.sin(hero.rotation.y),0,Math.cos(hero.rotation.y));
}
function evade(){
 if(mode!=='play'||paused||dodge>0||stamina<22)return;
 if(attack&&attack.progress<.16){queuedDodge=.2;return;}
 stamina-=22;attack=null;attackQueued=false;queuedHeavy=false;queuedDodge=0;healTimer=0;dodge=.48;invincible=.43;perfectEvaded=false;
 getMovement();if(move.lengthSq()>.01)dodgeDirection.copy(move).normalize();else if(targetAvailable())dodgeDirection.copy(hero.position).sub(boss.position).setY(0).normalize();else dodgeDirection.set(Math.sin(hero.rotation.y),0,Math.cos(hero.rotation.y));
 if(stage==='tutorial'&&tutorialStep===3)completeLesson();
 audio.play('dodge');burst(hero.position.clone().add(new THREE.Vector3(0,.15,0)),.5);
}
function spell(){if(mode!=='play'||paused||spellCD>0||dodge>0)return;if(!targetAvailable()){toast('山路间暂无施术目标');return;}if(mana<35){toast('法力不足');return;}if(hero.position.distanceTo(boss.position)>13){toast('目标过远');return;}mana-=35;spellCD=15;frozen=3.1;if(stage==='tutorial'&&tutorialStep===4)completeLesson();casting=.55;audio.play('spell');toast('定身术 · 趁势出棍',2);burst(boss.position.clone().add(new THREE.Vector3(0,2,0)),1.7);}
function heal(){if(mode!=='play'||paused||attack||dodge>0||healTimer>0)return;if(gourds<=0){toast('葫芦已空');return;}if(health>=100){toast('生命充盈');return;}gourds--;healTimer=1.25;healDone=false;toast('饮酒调息…',1.3);}
function toggleLock(){if(mode!=='play')return;if(!targetAvailable()){setLocked(false);toast('自由行走 · 沿石径前行');return;}locked=!locked;$('lock').classList.toggle('active',locked);toast(locked?'已锁定'+(stage==='tutorial'?'习武木桩':bossNames[stage]):'已解除锁定 · 拖动屏幕调整视角',1.5);}
function hurtHero(amount){
 if(mode!=='play')return;
 if(invincible>0){if(dodge>0&&!perfectEvaded){perfectEvaded=true;focus=Math.min(3,focus+.2);audio.play('perfectDodge');toast('毫厘不伤 · 棍势增长',1.3);}return;}
 amount*=battleDifficulty==='hard'?1.3:1;health=Math.max(0,health-amount);damageTaken+=amount;invincible=.62;heroHit=1;impactPause=.055;hitFlash=.65;shake=.28;impactKick=.35;
 audio.play('hitLight');healTimer=0;casting=0;toast(isExpansionRoute()||stage==='stoneking'?'离开地面预警，保留闪避气力':'看清起手，在命中前闪避',1.7);burst(hero.position.clone().add(new THREE.Vector3(0,1,0)));
 if(health<=0)finish(false);
}
function hurtBoss(amount,heavy=false){
 if(mode!=='play'||!targetAvailable())return;
 if(stage==='tutorial'){focus=Math.min(3,focus+.5);bossHit=1;audio.play(heavy?'hitHeavy':'hitLight');burst(boss.position.clone().add(new THREE.Vector3(0,1.5,0)));if(tutorialStep===1&&!attack?.heavy){tutorialHits++;if(tutorialHits>=3)completeLesson();}else if(tutorialStep===2&&attack?.heavy)completeLesson();return;}
 if(stage==='stoneking'){const result=stone.resolveHit(amount,{heavy:!!attack?.heavy});amount=result.damage;if(result.tip)toast(result.tip,2);}
 bossHP=Math.max(0,bossHP-amount);hitCount++;focus=Math.min(3,focus+.28);bossHit=1;impactPause=heavy?.085:.045;shake=heavy?.34:.16;impactKick=heavy?.75:.25;
 audio.play(heavy?'hitHeavy':'hitLight');damageNumber(amount,heavy);burst(boss.position.clone().add(new THREE.Vector3(0,1.8,0)),heavy?1.8:1);
 if(frozen<=0){temp.copy(boss.position).sub(hero.position).setY(0).normalize();boss.position.addScaledVector(temp,heavy?.38:.09);keepInArena(boss.position,15.8);}
 if(bossHP<=0)finish(true);
}
function getMovement(){const x=(keys.has('KeyD')?1:0)-(keys.has('KeyA')?1:0)+stickInput.x;const y=(keys.has('KeyS')?1:0)-(keys.has('KeyW')?1:0)+stickInput.y;camera.getWorldDirection(forward);forward.y=0;forward.normalize();right.crossVectors(forward,THREE.Object3D.DEFAULT_UP).normalize();move.copy(forward).multiplyScalar(-y).addScaledVector(right,x);if(move.length()>1)move.normalize();return move;}
function updateBattle(dt){
 if(impactPause>0){impactPause=Math.max(0,impactPause-dt);return;}
 gameTime+=dt;spellCD=Math.max(0,spellCD-dt);invincible=Math.max(0,invincible-dt);frozen=Math.max(0,frozen-dt);casting=Math.max(0,casting-dt);heroHit=Math.max(0,heroHit-dt*3.4);bossHit=Math.max(0,bossHit-dt*4);
 stamina=Math.min(100,stamina+dt*(attack||dodge>0?5:19));mana=Math.min(100,mana+dt*1.15);hitFlash=Math.max(0,hitFlash-dt*2);shake=Math.max(0,shake-dt);if(gameTime>toastUntil)$('toast').textContent='';
 getMovement();moving=move.lengthSq()>.02;
 sprinting=canSprint()&&moving&&!attack&&dodge<=0&&!healTimer&&(sprintToggle||keys.has('ShiftLeft')||keys.has('ShiftRight'));
 if(queuedDodge>0){queuedDodge=Math.max(0,queuedDodge-dt);if(!attack||attack.progress>=.16)evade();}
 if(dodge>0){const step=Math.min(dt,dodge);dodge=Math.max(0,dodge-dt);const speed=9.6*(.65+.55*Math.sin((1-dodge/.48)*Math.PI));hero.position.addScaledVector(dodgeDirection,step*speed);hero.position.y=Math.sin((1-dodge/.48)*Math.PI)*.13;}
 else{hero.position.y=0;if(moving&&!healTimer){hero.position.addScaledVector(move,dt*(attack?.65:sprinting?6.4:4.1));if(!locked&&!attack)face(hero,hero.position.clone().add(move),dt);}if(locked&&targetAvailable()&&!attack)face(hero,boss.position,dt);}
 if(healTimer>0){healTimer=Math.max(0,healTimer-dt);if(healTimer<.45&&!healDone){health=Math.min(100,health+48);healDone=true;audio.play('heal');toast('饮酒回春 +48',1.2);}}
 if(attack){
  const a=attack;a.progress=Math.min(1,a.progress+dt/a.duration);
  const travel=smooth((a.progress-.19)/.4)*(a.heavy?1.45:[.7,.9,1.1][a.combo]);
  const gap=hero.position.distanceTo(boss.position);const step=travel-a.travel;
  if(!targetAvailable())hero.position.addScaledVector(a.direction,step);else if(gap>1.65)hero.position.addScaledVector(a.direction,Math.min(step,gap-1.65));a.travel=travel;
  if(a.heavy)hero.position.y=Math.sin(clamp((a.progress-.2)/.45,0,1)*Math.PI)*.55;
  if(!a.sounded&&a.progress>(a.heavy?.32:.22)){a.sounded=true;audio.play(a.heavy?'heavy':'swing'+a.combo);}
  if(a.progress>=a.hitAt&&!a.hit){a.hit=true;const range=a.heavy?4.2:3.6;temp.copy(boss.position).sub(hero.position);const facing=Math.sin(hero.rotation.y)*temp.x+Math.cos(hero.rotation.y)*temp.z;if(targetAvailable()&&temp.length()<range&&facing>0)hurtBoss(a.damage,a.heavy||a.combo===2);}
  if((a.heavy||a.combo===2)&&a.progress>.66&&!a.landed){a.landed=true;groundWave(hero.position);audio.play('land');burst(hero.position.clone().add(new THREE.Vector3(0,.12,0)),1.4);}
  if(a.progress>=1&&mode==='play'){attack=null;hero.position.y=0;if(attackQueued){const heavy=queuedHeavy;attackQueued=false;queuedHeavy=false;swing(heavy);}}
 }
 constrainHero();
 if(stage==='tutorial'||stage==='journey'||stage==='ascent'||isExpansionRoute()){danger.material.opacity=0;spellRing.position.copy(boss.position).add(new THREE.Vector3(0,1.5,0));spellRing.material.opacity=stage==='tutorial'&&frozen>0?.55:0;$('combat-tip').textContent='';updateJourney(dt);updateHUD();return;}
 const dist=hero.position.distanceTo(boss.position);if(dist<1.35){temp.copy(hero.position).sub(boss.position).setY(0);if(temp.lengthSq()===0)temp.z=1;hero.position.addScaledVector(temp.normalize(),(1.35-dist)*.5);}
 if(mode==='play'&&phase===1&&bossHP>0&&bossHP<bossMax*.5){phase=2;if(!phaseAnnounced){phaseAnnounced=true;if(prefs.cinematics&&stage==='guardian'){startCinematic('phase2');updateHUD();return;}toast(stage==='stoneking'?'石心怒燃 · 陨石连落，重棍破甲':stage==='spirit'?'青岚风起 · 五道风刃，注意横向闪避':'妖将震怒 · 小心连续突袭',3);}}
 bossMoving=false;
 if((stage==='spirit'||stage==='stoneking')&&mode==='play'){const state=(stage==='stoneking'?stone:spirit).updateAI(dt,{hero,phase,frozen,hurtHero,face,keepInArena});bossState=state.state;bossTimer=state.timer;bossAttackType=state.attackType;bossMoving=state.moving;$('combat-tip').textContent=stage==='stoneking'&&state.state==='idle'&&!state.broken?'':state.tip||'';}
 if(stage==='guardian'&&frozen<=0&&mode==='play'){
  bossTimer-=dt;face(boss,hero.position,dt*.8);
  if(bossState==='idle'){
   if(dist>3.3){bossMoving=true;temp.copy(hero.position).sub(boss.position).setY(0);boss.position.addScaledVector(temp.normalize(),dt*(phase===2?2.3:1.8));}
   if(bossTimer<=0&&dist<7){bossAttackType=Math.random()<.42?'slam':'sweep';bossState='windup';bossTimer=(bossAttackType==='slam'?1.3:1)*(phase===2?.82:1);bossWindupDuration=bossTimer;bossDamageDone=false;}
  }else if(bossState==='windup'){
   if(bossTimer<=0){bossState='strike';bossTimer=.45;bossAttackDuration=.45;audio.play('bossSwing');}
  }else if(bossState==='strike'){
   if(bossAttackType==='sweep'&&dist>2.4){temp.copy(hero.position).sub(boss.position).setY(0);boss.position.addScaledVector(temp.normalize(),dt*8);}
   if(!bossDamageDone&&bossTimer<.27){bossDamageDone=true;if(dist<(bossAttackType==='slam'?4.3:3.9))hurtHero(bossAttackType==='slam'?29:21);if(bossAttackType==='slam'){audio.play('bossSlam');groundWave(boss.position,false);burst(boss.position.clone().add(new THREE.Vector3(0,.3,1)),2);shake=.22;}}
   if(bossTimer<=0){bossState='recover';bossTimer=phase===2?1.05:1.6;bossRecoverDuration=bossTimer;}
  }else if(bossState==='recover'&&bossTimer<=0){bossState='idle';bossTimer=phase===2?.65:1.25;}
  keepInArena(boss.position,15.8);
 }
 danger.position.x=boss.position.x;danger.position.z=boss.position.z;danger.material.opacity=stage==='guardian'&&bossState==='windup'&&frozen<=0?.15+Math.sin(elapsedReal*13)*.12:0;danger.scale.setScalar(bossAttackType==='slam'?1.08:.94);
 if(stage==='guardian')$('combat-tip').textContent=frozen>0?'定 身':bossState==='windup'?(bossAttackType==='slam'?'裂地重击 · 闪避':'横扫起势 · 闪避'):'';
 spellRing.position.copy(boss.position).add(new THREE.Vector3(0,2.1,0));spellRing.rotation.y=elapsedReal;spellRing.rotation.x=Math.sin(elapsedReal*.8)*.5;spellRing.material.opacity=frozen>0?.65:0;
 updateHUD();
}
function updateHUD(){updateCampaignHUD();const sprint=$('sprint');if(sprint){sprint.classList.toggle('active',sprintToggle||sprinting);sprint.setAttribute('aria-pressed',String(sprintToggle));}$('stance').textContent=attack?(attack.heavy?'蓄势 · 崩山':['一式 · 拨云','二式 · 挑月','三式 · 破阵'][attack.combo]):'劈棍式';$('health-fill').style.width=health+'%';$('stamina-fill').style.width=stamina+'%';$('mana-fill').style.width=mana+'%';$('boss-fill').style.width=bossHP/bossMax*100+'%';$('gourd-count').textContent='葫芦 · '+gourds;$('focus-points').textContent=[0,1,2].map(i=>focus>=i+1?'●':'○').join(' ');$('battle-time').textContent=formatTime(gameTime);$('boss-phase').textContent=stage==='stoneking'?(stone.getState().broken?'破甲 · 趁虚出棍':`岩甲 ${stone.getState().armor} / 3 · 重棍破甲`):stage==='spirit'?(phase===2?'第二相 · 千岚齐发':'第一相 · 风刃逐影'):(phase===2?'第二相 · 震怒':'第一相 · 山门守望');$('spell-cooldown').style.display=spellCD>0?'grid':'none';$('spell-cooldown').textContent=Math.ceil(spellCD);$('damage-overlay').style.opacity=hitFlash;$('heavy').style.borderColor=focus>=1?'#f2cf86':'#d3c49a65';}
function updateCampaignHUD(){
 const battle=isBossStage();$('boss-hud').classList.toggle('hidden',!battle);$('boss-name').textContent=bossNames[stage]||'';
 $('area-name').textContent=stageNames[stage]||'灵山';
 $('route-progress').textContent=({tutorial:'习武',journey:'行山',guardian:'山门',ascent:'登云',spirit:'青岚',moonwood:'寻符',emberpass:'赤霞',stoneking:'石猿'}[stage]||'行记')+(practiceRun?' · 练习':'');
 $('journey-card').classList.toggle('hidden',battle);
 if(stage==='tutorial'){$('journey-title').textContent=lessons[tutorialStep]?.[0]||'六式已成';$('journey-detail').textContent=lessons[tutorialStep]?.[1]||'';$('journey-count').textContent=`${Math.min(6,tutorialStep+1)} / 6`;$('journey-meter').style.width=(tutorialStep/6*100)+'%';$('objective-text').textContent=tutorialStep===0?`前行 ${Math.min(6,Math.floor(walked))} / 6 米`:tutorialStep===1?`木桩命中 ${tutorialHits} / 3`:'完成当前教学动作';}
 else if(stage==='journey'){const next=stops[Math.min(waypoint,stops.length-1)];$('journey-title').textContent=next.name;$('journey-detail').textContent=next.note;$('journey-count').textContent=`${waypoint+1} / 3`;$('journey-meter').style.width=clamp((160-hero.position.z)/138,0,1)*100+'%';$('objective-text').textContent=`沿石径前行 · 约 ${Math.max(0,Math.ceil(hero.position.z-next.z))} 米`;}
 else if(stage==='ascent'){$('journey-title').textContent='登云天阶';$('journey-detail').textContent='循云中石阶前行，青岚灵鹿守候山巅。';$('journey-count').textContent='叁';$('journey-meter').style.width=clamp((52-hero.position.z)/34,0,1)*100+'%';$('objective-text').textContent='穿过云海 · 前往青岚之巅';}
 else if(isExpansionRoute()){
  const progress=expansion.getState(),target=progress.target,distance=target?Math.ceil(Math.hypot(hero.position.x-target.x,hero.position.z-target.z)):0;
  $('journey-title').textContent=stage==='moonwood'?'月下寻符':'穿越赤霞';$('journey-detail').textContent=stage==='moonwood'?'走近灵符光柱自动收集，寻齐三枚后前往月门。':'金圈亮起后离开落点；也可等待落石结束再通过。';
  $('journey-count').textContent=stage==='moonwood'?`${progress.collected||0} / 3`:'陆';$('journey-meter').style.width=clamp(progress.progress||0,0,1)*100+'%';
  $('objective-text').textContent=target?`${target.z>hero.position.z+2?'回望':'前往'}${target.name||'出口'} · ${distance} 米`:'前往出口';$('combat-tip').textContent=progress.hazardActive?'落石将至 · 离开金色圆圈':'';
 }else $('objective-text').textContent=stage==='stoneking'?'K 重棍三次破甲 · 躲开地面预警':stage==='spirit'?'横闪风刃 · 趁冲锋后硬直近身':'击败守山妖将 · 留力闪避';
 $('lock').classList.toggle('unavailable',!targetAvailable());
}
function updateCamera(dt){if(mode==='menu'){const p=journey.samplePath(.12);camera.position.lerp(temp.set(p.x+7+Math.sin(elapsedReal*.07)*.5,4.5,p.z+10),1-Math.exp(-dt*2));camera.lookAt(p.x-3,1,p.z-9);return;}lookTarget.copy(hero.position).add(new THREE.Vector3(0,1.65,0));if(locked){const a=Math.atan2(hero.position.x-boss.position.x,hero.position.z-boss.position.z);cameraYaw+=Math.atan2(Math.sin(a-cameraYaw),Math.cos(a-cameraYaw))*Math.min(1,dt*3.2);lookTarget.lerp(boss.position.clone().add(new THREE.Vector3(0,1.5,0)),.18);}const distance=7.5;desiredCam.set(hero.position.x+Math.sin(cameraYaw)*distance,hero.position.y+2.1+Math.sin(cameraPitch)*6,hero.position.z+Math.cos(cameraYaw)*distance);if(isBossStage())keepInArena(desiredCam,20);camera.position.lerp(desiredCam,1-Math.exp(-dt*5));if(shake>0){camera.position.x+=(Math.random()-.5)*shake*.3;camera.position.y+=(Math.random()-.5)*shake*.3;}camera.lookAt(lookTarget);}
function updateEffects(dt,cinematic=false){
 impactKick=Math.max(0,impactKick-dt*3);const targetFov=48+impactKick*2.8+(sprinting?4:0);if(!cinematic&&Math.abs(camera.fov-targetFov)>.01){camera.fov=THREE.MathUtils.damp(camera.fov,targetFov,7,dt);camera.updateProjectionMatrix();}
 for(const s of sparks){if(s.life>0){s.life-=dt;s.mesh.visible=s.life>0;s.mesh.position.addScaledVector(s.v,dt);s.v.y-=9*dt;s.mesh.scale.setScalar(Math.min(1,s.life*4));}}
 ring.visible=locked&&mode==='play';ring.position.x=boss.position.x;ring.position.z=boss.position.z;ring.scale.setScalar(1.6+Math.sin(elapsedReal*3)*.04);
 const marker=$('locked-marker');marker.classList.toggle('hidden',!(locked&&mode==='play'));if(locked&&mode==='play'){temp.copy(boss.position);temp.y=2.5;temp.project(camera);marker.style.left=(temp.x*.5+.5)*innerWidth+'px';marker.style.top=(-temp.y*.5+.5)*innerHeight+'px';if(temp.z>1)marker.classList.add('hidden');}
 if(waveLife>0){waveLife=Math.max(0,waveLife-dt);shockwave.scale.setScalar(1+(1-waveLife/.55)*4);shockwave.material.opacity=waveLife*.55;}else shockwave.material.opacity=0;
 for(const p of damagePops){if(p.life>0){p.life=Math.max(0,p.life-dt);p.pos.y+=dt*.9;temp.copy(p.pos).project(camera);p.el.style.left=(temp.x*.5+.5)*innerWidth+'px';p.el.style.top=(-temp.y*.5+.5)*innerHeight+'px';p.el.style.opacity=temp.z>1?'0':Math.min(1,p.life*3);p.el.style.transform=`translate(-50%,-50%) scale(${1+(p.heavy?.32:.16)*p.life})`;}}
 for(const p of trailHistory)p.life-=dt;while(trailHistory.length&&trailHistory[0].life<=0)trailHistory.shift();
 if(attack&&attack.progress>.19&&attack.progress<.76&&impactPause<=0){hero.updateWorldMatrix(true,true);const staff=world.heroRig.staff;trailHistory.push({tip:staff.localToWorld(new THREE.Vector3(0,1.37,0)),base:staff.localToWorld(new THREE.Vector3(0,.45,0)),life:.15});if(trailHistory.length>12)trailHistory.shift();}
 let offset=0;for(let i=1;i<trailHistory.length;i++){const a=trailHistory[i-1],b=trailHistory[i];for(const [point,fade] of [[a.tip,a.life],[a.base,a.life],[b.tip,b.life],[a.base,a.life],[b.base,b.life],[b.tip,b.life]]){trailPositions.set(point.toArray(),offset);const strength=Math.max(0,fade/.15);trailColors.set([strength,strength*.72,strength*.35],offset);offset+=3;}}
 trailGeometry.setDrawRange(0,offset/3);trailGeometry.attributes.position.needsUpdate=true;trailGeometry.attributes.color.needsUpdate=true;
}
function animationState(){return {moving:mode==='play'&&moving,moveSpeed:move.length()*(sprinting?1.5:1),attacking:attack?attack.progress:-1,combo:attack?.combo??combo,heavy:!!attack?.heavy,dodging:dodge>0,dodgeProgress:1-dodge/.48,bossAttacking:bossState==='windup'?.4*(1-bossTimer/bossWindupDuration):bossState==='strike'?.4+.36*(1-bossTimer/.45):bossState==='recover'?.76+.24*(1-bossTimer/bossRecoverDuration):-1,bossAttackType,bossMoving,heroHit,bossHit,healing:healTimer>0,healProgress:1-healTimer/1.25,casting:casting>0?1-casting/.55:-1,bossFrozen:frozen>0,heroDead:mode==='lost',bossDead:mode==='won'||mode==='cleared'};}

function frame(){
 requestAnimationFrame(frame);const rawDt=Math.min(clock.getDelta(),.25),dt=Math.min(rawDt,.04);elapsedReal+=rawDt;
 if(!paused){
  if(mode==='cinematic'){
   elapsed+=rawDt;cinema.update(rawDt);
   if(cinema.active){world.animate(elapsed,Math.min(rawDt,.1),cinematicAnimationState());updateEffects(dt,true);if(cinema.type==='phase2'){rim.position.copy(boss.position).add(new THREE.Vector3(0,3,1));rim.intensity=12+Math.sin(cinema.progress*Math.PI)*25;}}
  }else{
   const freezePose=impactPause>0;if(!freezePose)elapsed+=dt;if(mode==='play')updateBattle(dt);
   // A phase transition can start inside the battle step. Never overwrite its first camera shot.
   if(mode==='cinematic'){world.animate(elapsed,dt,cinematicAnimationState());updateEffects(dt,true);}
   else{updateCamera(dt);if(!freezePose)world.animate(elapsed,dt,animationState());updateEffects(dt);}
  }
 }
 if(!paused){journey.update(dt,elapsedReal);props.update(elapsedReal);expansion.update(dt,elapsedReal);if(stage==='spirit'||stage==='stoneking')(stage==='stoneking'?stone:spirit).animate(dt,elapsed,{moving:bossMoving,hit:bossHit,frozen:frozen>0,phase,dead:mode==='won'||mode==='cleared'});}
 sun.position.set(hero.position.x-12,22,hero.position.z-12);sun.target.position.set(hero.position.x,0,hero.position.z);
 renderer.render(scene,camera);globalThis.__lingShanPlatform?.afterRender(renderer);
}

function restoreCinematicLight(){rim.intensity=12;rim.position.set(2,5,1);}
function cinematicAnimationState(){const type=cinema.type;return {cinematic:type,cinematicProgress:cinema.progress,moving:false,moveSpeed:0,attacking:-1,dodging:false,bossAttacking:-1,bossMoving:false,bossFrozen:false,heroHit:0,bossHit:0,casting:-1,heroDead:type==='defeat',bossDead:type==='victory'};}
function startCinematic(type,{preview=false}={}){
 cinema.cancel();cinematicContext={type,preview};cinematicSuspended=false;mode='cinematic';paused=false;resetInput();
 impactPause=0;attack=null;attackQueued=false;dodge=healTimer=casting=0;hero.position.y=0;moving=bossMoving=false;
 danger.material.opacity=0;spellRing.material.opacity=0;trailHistory.length=0;trailGeometry.setDrawRange(0,0);waveLife=0;shockwave.material.opacity=0;for(const p of damagePops){p.life=0;p.el.style.opacity='0';}
 $('menu').classList.add('hidden');$('hud').classList.add('hidden');$('modal').classList.add('hidden');$('result').classList.add('hidden');$('pause-btn').classList.add('hidden');$('toast').textContent='';$('combat-tip').textContent='';document.body.classList.add('playing');
 if(type==='phase2'){bossState='recover';bossTimer=1.25;bossRecoverDuration=1.25;bossDamageDone=true;}
 if(preview){hero.position.set(0,0,type==='victory'?1:7);boss.position.set(0,0,-5);hero.rotation.set(0,Math.PI,0);boss.rotation.set(0,0,0);}
 const alreadyAudible=audio.context?.state==='running'&&!audio.paused,context=cinematicContext;const unlocked=audio.start();cinema.start(type,{preview});
 if(!alreadyAudible)unlocked.then(ready=>{if(ready&&cinematicContext===context&&cinema.active&&cinema.shotIndex===0&&cinema.progress<.2)audio.play({intro:'cinematicStart',phase2:'cinematicPhase',victory:'cinematicVictory',defeat:'cinematicDefeat'}[type]);});
}
function endCinematic({type,preview}){
 cinematicContext=null;cinematicSuspended=false;paused=false;resetInput();restoreCinematicLight();clock.getDelta();
 if(preview){returnMenu();return;}
 if(type==='victory'||type==='defeat'){showResult(type==='victory');return;}
 mode='play';hero.position.y=0;impactPause=0;$('hud').classList.remove('hidden');$('pause-btn').classList.remove('hidden');
 if(type==='phase2'){bossState='recover';bossTimer=1.25;bossRecoverDuration=1.25;heroHit=bossHit=0;toast('妖将震怒 · 小心连续突袭',3);}else toast('靠近妖将 · 棍击积攒棍势，闪避躲开红色攻势',4);
 updateHUD();audio.resume();
}
function showResult(win){mode=win?'won':'lost';paused=false;cinematicContext=null;$('hud').classList.add('hidden');$('result').classList.remove('hidden');$('pause-btn').classList.add('hidden');}
function cinematicCue(event){if(event.name==='phase-impact'){groundWave(boss.position,false);burst(boss.position.clone().add(new THREE.Vector3(0,.3,0)),2);}}
function watchCinematic(type){boss=guardian;setEnvironment('guardian');startCinematic(type,{preview:true});}
function cinemaGallery(){
 openModal('过场鉴赏',`<p>重看山门间的片刻。鉴赏不会改变试炼记录，可随时跳过。</p><div class="cinema-gallery"><button data-cinema="intro"><b>壹 · 雾隐古刹</b><small>入场 · 10 秒</small><span>踏入山门，初见守山妖将。</span></button><button data-cinema="phase2"><b>贰 · 妖将震怒</b><small>转折 · 5 秒</small><span>尘起风变，一战未休。</span></button><button data-cinema="victory"><b>叁 · 劫尽尘消</b><small>胜利 · 7 秒</small><span>收棍回望，前路仍在山外。</span></button><button data-cinema="defeat"><b>肆 · 再入轮回</b><small>失败 · 4 秒</small><span>此行未尽，待君再来。</span></button></div>`,'山 门 影 录');
 for(const button of document.querySelectorAll('[data-cinema]'))button.onclick=()=>watchCinematic(button.dataset.cinema);
}
const cinema=new CinematicDirector({camera,hero,boss:guardian,audio,onComplete:endCinematic,onCue:cinematicCue});

function openModal(title,content,kicker='修 行 手 札'){if(mode==='play'){paused=true;resetInput();audio.pause();}$('modal-title').textContent=title;$('modal-kicker').textContent=kicker;$('modal-content').innerHTML=content;$('modal').classList.remove('hidden');}
function closeModal(){$('modal').classList.add('hidden');if(mode==='play'){paused=false;audio.resume();}}
function guide(){openModal('修行指南',`<div class="guide-grid"><div class="guide-item"><strong>行 · 移动与视角</strong><p>左侧摇杆移动，右侧空白区域拖动视角。桌面使用 WASD，Q 切换目标锁定。赶路时按住 Shift 疾行；触屏点「疾行」切换，不消耗战斗气力。</p></div><div class="guide-item"><strong>击 · 连招与棍势</strong><p>J 或「棍击」三段连打，可提前衔接下一棍；连招中按 K 可接重棍。命中积攒棍势，K「重棍」消耗棍势造成更高伤害。</p></div><div class="guide-item"><strong>避 · 洞察起手</strong><p>红圈亮起代表妖将蓄势。空格或「闪避」短暂无敌，留意气力消耗。</p></div><div class="guide-item"><strong>术 · 定身与调息</strong><p>1「定身」冻结目标 3 秒。R「饮酒」回复生命，每战三口，受击会打断。</p></div></div><p>山溪先完成六式，沿路标穿过瀑布与花林，再挑战守山妖将。击败后登上云海天阶迎战青岚灵鹿：横向闪避风刃，冲锋后近身反击。灵鹿之后还有月竹寻符、赤霞落石与熔岩石猿。石猿岩甲须用三次 K 重棍击破。M 查看路线；任意关卡失败可重试当前关，主菜单可直接选择关卡练习。每章入口自动保存，刷新后点「继续行记」从章节入口恢复；仅存于当前浏览器。</p><button class="start-button" id="guide-close">记住了，出发</button>`);$('guide-close').onclick=closeModal;}
function settings(){
 const slider=(id,label,value)=>`<div class="setting-row"><label for="${id}-slider">${label} <output id="${id}-value">${Math.round(value*100)}%</output></label><input id="${id}-slider" type="range" min="0" max="1" step=".05" value="${value}"></div>`;
 openModal('声画设置',`<div class="setting-row"><label for="quality-select">画面品质<small>按设备性能选择清晰度与阴影</small></label><select id="quality-select"><option value="high">精致 · 高清阴影</option><option value="medium">均衡 · 推荐手机</option><option value="low">流畅 · 轻量渲染</option></select></div><div class="setting-row"><label for="difficulty-select">试炼难度<small>下一次开始生效；续玩保留原难度</small></label><select id="difficulty-select"><option value="normal">行者 · 标准</option><option value="hard">大圣 · 挑战</option></select></div><div class="setting-row"><label for="cinema-select">剧情过场<small>入场与阶段转换，可随时跳过</small></label><select id="cinema-select"><option value="on">开启</option><option value="off">关闭</option></select></div>${slider('volume','总音量',prefs.volume)}${slider('music-volume','背景音乐',prefs.musicVolume)}${slider('sfx-volume','动作音效',prefs.sfxVolume)}<div class="setting-row"><label for="music-file">本地音乐<small>导入自己拥有使用权的音乐，仅在本机播放</small></label><input id="music-file" type="file" accept="audio/*"></div><p id="music-status">原创五声配乐随山径、月竹与战斗变化；首次操作后自动播放。</p><button id="settings-done" class="text-button">保存并返回</button>`,'声 色 山 林');
 $('cinema-select').value=prefs.cinematics?'on':'off';$('cinema-select').onchange=e=>{prefs.cinematics=e.target.value==='on';save();};
 $('quality-select').value=prefs.quality;$('difficulty-select').value=prefs.difficulty;
 $('quality-select').onchange=e=>{prefs.quality=e.target.value;setQuality();save();};$('difficulty-select').onchange=e=>{prefs.difficulty=e.target.value;save();};
 for(const [id,key,apply] of [['volume','volume',v=>audio.setVolume(v)],['music-volume','musicVolume',v=>audio.setMusicVolume?.(v)],['sfx-volume','sfxVolume',v=>audio.setSfxVolume?.(v)]]){
  $(id+'-slider').oninput=e=>{prefs[key]=+e.target.value;prefs.volumeCustomized=true;$(id+'-value').textContent=Math.round(prefs[key]*100)+'%';apply(prefs[key]);save();};
 }
 $('music-file').onchange=async e=>{const file=e.target.files?.[0];if(!file)return;$('music-status').textContent='正在读取音乐…';try{await audio.loadFile(file);if($('music-status'))$('music-status').textContent='已导入：'+file.name;}catch(err){if($('music-status'))$('music-status').textContent=err.message||'此音乐格式暂不支持';}};
 $('settings-done').onclick=closeModal;
}
function credits(){openModal('创作与参考',`<p>《灵山 · 悟空试炼》是以西游神话为题材的非官方原创网页原型。包含六式教学、山间探索、寻符解门、落石栈道和三场 Boss 试炼，不代表《黑神话：悟空》官方产品，也不包含原版模型、录音或完整剧情。</p><div class="credits-list"><a href="https://www.playstation.com/en-us/games/black-myth-wukong/" target="_blank" rel="noopener">《黑神话：悟空》官方视觉参考 ↗</a><small>森林、古寺与战斗氛围参考；官方图片未作为游戏素材打包。</small><a href="https://github.com/pmndrs/ecctrl" target="_blank" rel="noopener">Ecctrl · 手机控制器参考 ↗</a><a href="https://github.com/hh-hang/three-player-controller" target="_blank" rel="noopener">Three Player Controller · 第三人称镜头参考 ↗</a><a href="https://github.com/swift502/Sketchbook" target="_blank" rel="noopener">Sketchbook · 角色场景参考 ↗</a><a href="https://threejs.org/" target="_blank" rel="noopener">Three.js · MIT 许可渲染引擎 ↗</a></div><p>本作战斗代码、程序化角色与场景、合成配乐为新制作。参考项目未直接拷贝代码。三劫全程最佳：${record.journeyBest==null?'尚无记录':formatTime(record.journeyBest)} · 全程通关 ${record.journeyWins||0} 次（旧版双劫记录 ${record.campaignWins||0} 次）</p>`,'灵 感 所 至');}
function pauseMenu(){if(mode!=='play')return;if(paused){closeModal();return;}openModal('且歇片刻',`<p>山风未停，等你再战。</p><button class="start-button" id="resume">继续试炼 <svg><use href="#i-arrow"/></svg></button><button class="text-button" id="pause-settings">声画设置</button><button class="text-button" id="pause-guide">修行指南</button><button class="text-button" id="pause-return">返回山门</button>`,'山 门 小 憩');$('resume').onclick=closeModal;$('pause-settings').onclick=settings;$('pause-guide').onclick=guide;$('pause-return').onclick=returnMenu;}
async function fullscreen(){try{if(!document.fullscreenElement){const f=document.documentElement.requestFullscreen||document.documentElement.webkitRequestFullscreen;if(f)await f.call(document.documentElement);else if(mode==='play')toast('当前浏览器不支持全屏，请横屏使用');if(screen.orientation?.lock)await screen.orientation.lock('landscape').catch(()=>{});}else await document.exitFullscreen();}catch{if(mode==='play')toast('请横屏游玩；可通过浏览器菜单进入全屏');}}
$('start').onclick=begin;if($('continue-run'))$('continue-run').onclick=continueJourney;
if($('sprint'))$('sprint').addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();if(mode==='play'&&!paused&&canSprint()){sprintToggle=!sprintToggle;updateHUD();}});
$('chapters-btn').onclick=chapterSelect;$('retry').onclick=retryCheckpoint;$('route-map').onclick=routeMap;$('return-menu').onclick=returnMenu;$('guide-btn').onclick=guide;$('settings-btn').onclick=settings;$('credits-btn').onclick=credits;$('cinema-btn').onclick=cinemaGallery;$('fullscreen').onclick=fullscreen;$('pause-btn').onclick=pauseMenu;$('sound-btn').onclick=()=>{prefs.muted=!prefs.muted;audio.setMuted(prefs.muted);if(!paused)audio.start();$('sound-btn').style.opacity=prefs.muted?.35:.85;$('sound-btn').setAttribute('aria-label',prefs.muted?'开启音乐':'关闭音乐');save();};document.querySelector('.wordmark').onclick=e=>{e.preventDefault();if(mode==='play')pauseMenu();};document.querySelector('.modal-close').onclick=closeModal;
for(const [id,fn] of [['attack',()=>swing()],['heavy',()=>swing(true)],['dodge',evade],['spell',spell],['heal',heal],['lock',toggleLock]]){$(id).addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();fn();});}
addEventListener('keydown',e=>{if(mode==='cinematic'){if(['Escape','Space','Enter'].includes(e.code)){e.preventDefault();if(!e.repeat)cinema.skip();}return;}if(['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName))return;if(['Space','ArrowUp','ArrowDown'].includes(e.code))e.preventDefault();if(e.code==='Escape'){if(!$('modal').classList.contains('hidden'))closeModal();else pauseMenu();return;}if(e.repeat)return;keys.add(e.code);if(mode!=='play'||paused)return;const actions={KeyJ:()=>swing(),KeyK:()=>swing(true),Space:evade,Digit1:spell,KeyR:heal,KeyQ:toggleLock,KeyM:routeMap};actions[e.code]?.();});addEventListener('keyup',e=>keys.delete(e.code));function suspendView(){resetInput();if(mode==='cinematic'){paused=true;cinematicSuspended=true;audio.pause();}else if(mode==='play'&&!paused)pauseMenu();}
function resumeView(){clock.getDelta();if(mode==='cinematic'&&cinematicSuspended&&!document.hidden){paused=false;cinematicSuspended=false;audio.resume();}else if(!paused&&!document.hidden)audio.resume();}
addEventListener('blur',suspendView);addEventListener('focus',resumeView);document.addEventListener('visibilitychange',()=>{if(document.hidden){suspendView();audio.pause();}else resumeView();});
const joystick=$('joystick');function stickMove(e){const rect=joystick.getBoundingClientRect();const max=rect.width*.32;const x=e.clientX-(rect.left+rect.width/2),y=e.clientY-(rect.top+rect.height/2);const l=Math.hypot(x,y),s=l>max?max/l:1;stickInput.x=x*s/max;stickInput.y=y*s/max;$('stick').style.transform=`translate(${x*s}px,${y*s}px)`;}
joystick.addEventListener('pointerdown',e=>{e.preventDefault();if(stickPointer!==null)return;stickPointer=e.pointerId;joystick.setPointerCapture(e.pointerId);stickMove(e);});joystick.addEventListener('pointermove',e=>{if(e.pointerId===stickPointer)stickMove(e);});function endStick(e){if(e.pointerId!==stickPointer)return;stickPointer=null;stickInput.x=stickInput.y=0;$('stick').style.transform='';}joystick.addEventListener('pointerup',endStick);joystick.addEventListener('pointercancel',endStick);joystick.addEventListener('lostpointercapture',endStick);
const cameraPad=$('camera-pad');cameraPad.addEventListener('pointerdown',e=>{e.preventDefault();pointerCamera=e.pointerId;dragStart={x:e.clientX,y:e.clientY};cameraPad.setPointerCapture(e.pointerId);});cameraPad.addEventListener('pointermove',e=>{if(e.pointerId!==pointerCamera||paused)return;const dx=e.clientX-dragStart.x,dy=e.clientY-dragStart.y;if(Math.abs(dx)>1&&locked){locked=false;$('lock').classList.remove('active');}cameraYaw-=dx*.006;cameraPitch=clamp(cameraPitch+dy*.004,-.05,.8);dragStart={x:e.clientX,y:e.clientY};});const endCamera=()=>pointerCamera=null;cameraPad.addEventListener('pointerup',endCamera);cameraPad.addEventListener('pointercancel',endCamera);cameraPad.addEventListener('lostpointercapture',endCamera);
function resize(){camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);const portrait=innerHeight>innerWidth&&matchMedia('(any-pointer:coarse)').matches;$('rotate').classList.toggle('hidden',!portrait||portraitDismissed);}addEventListener('resize',resize);$('portrait-continue').onclick=()=>{portraitDismissed=true;resize();};$('scene').addEventListener('webglcontextlost',e=>{e.preventDefault();if(mode==='play'&&!paused)pauseMenu();$('boot-message').textContent='图形环境暂时中断，请刷新页面恢复。';$('boot').classList.remove('hidden');});
function unlockSound(){
 if(paused||document.hidden)return;
 Promise.resolve(audio.start()).then(ready=>{if(ready){removeEventListener('pointerdown',unlockSound);removeEventListener('keydown',unlockSound);}}).catch(()=>{});
}
addEventListener('pointerdown',unlockSound,{passive:true});addEventListener('keydown',unlockSound);
$('sound-btn').style.opacity=prefs.muted?.35:.85;$('sound-btn').setAttribute('aria-label',prefs.muted?'开启声音':'静音');
returnMenu();resize();frame();unlockSound();setTimeout(()=>{$('boot').classList.add('hidden');$('menu').classList.remove('hidden');},300);
window.__trial={getState:()=>({mode,paused,stage,tutorialStep,tutorialHits,walked,waypoint,checkpoint,nextStage,practiceRun,journeyWins:record.journeyWins||0,expansion:expansion.getState(),armor:stone.getState(),campaignWins:record.campaignWins||0,health,stamina,mana,bossHP,bossMax,gourds,focus,spellCD,frozen,bossState,phase,locked,gameTime,player:{x:hero.position.x,z:hero.position.z},boss:{x:boss.position.x,z:boss.position.z},drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,quality:prefs.quality,volume:prefs.volume,musicVolume:prefs.musicVolume,sfxVolume:prefs.sfxVolume,sprinting,sprintToggle,savedChapter:savedJourney?.stage||null,combo:attack?.combo??combo,attackProgress:attack?.progress??-1,heavy:!!attack?.heavy,impactPause,heroHit,bossHit,cinematic:cinema.active?{type:cinema.type,progress:cinema.progress,shotIndex:cinema.shotIndex,preview:cinematicContext?.preview}:null})};
