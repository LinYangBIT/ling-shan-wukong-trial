// Runs the exact Mini Game bundle against a browser-backed wx host.
// This validates the no-DOM adapter, rendering and input; it is NOT WeChat-device QA.
const {chromium}=require('playwright-core');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=__dirname,report={method:'Exact compiled Mini Game bundle, browser-backed wx canvas/touch/storage/audio host. No original DOM UI. Not a WeChat device or DevTools test.',checks:[],errors:[],complete:false};
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required']});
 try{
  const page=await browser.newPage({viewport:{width:844,height:390},deviceScaleFactor:1});
  page.on('pageerror',error=>report.errors.push(error.message));
  await page.goto('http://127.0.0.1:5175/');
  await page.evaluate(()=>{
   const hostWindow=window,hostDocument=document,storage=new Map(),events={};
   storage.set('lingshan-prefs',JSON.stringify({quality:'low',volume:.8,muted:false,cinematics:false}));
   hostDocument.body.innerHTML='';hostDocument.body.style.cssText='margin:0;overflow:hidden;background:#142820';
   let count=0;const audioEvents=[],modals=[];
   const mock={
    createCanvas(){const c=hostDocument.createElement('canvas');c.width=844;c.height=390;if(count++===0){c.id='game-canvas';c.style.cssText='width:844px;height:390px;display:block';hostDocument.body.append(c);}return c;},
    createImage:()=>new Image(),
    getSystemInfoSync:()=>({windowWidth:844,windowHeight:390,screenWidth:844,screenHeight:390,pixelRatio:1,platform:'devtools',safeArea:{left:20,top:0,right:824,bottom:390,width:804,height:390}}),
    getWindowInfo:()=>mock.getSystemInfoSync(),getDeviceInfo:()=>({platform:'devtools'}),
    getMenuButtonBoundingClientRect:()=>({left:735,top:8,right:822,bottom:40,width:87,height:32}),
    getStorageSync:key=>storage.get(key)||'',setStorageSync:(key,value)=>storage.set(key,value),removeStorageSync:key=>storage.delete(key),clearStorageSync:()=>storage.clear(),
    onTouchStart:fn=>events.touchstart=fn,onTouchMove:fn=>events.touchmove=fn,onTouchEnd:fn=>events.touchend=fn,onTouchCancel:fn=>events.touchcancel=fn,
    onHide:fn=>events.hide=fn,onShow:fn=>events.show=fn,onWindowResize:fn=>events.resize=fn,
    createInnerAudioContext(){
     const audio=new Audio();audioEvents.push({type:'create'});audio.preload='auto';const listeners={};
     const api={set src(v){audio.src=new URL(v,location.href).href;audioEvents.push({type:'src',value:v});},get src(){return audio.src;},set loop(v){audio.loop=v;},set autoplay(v){audio.autoplay=v;},set volume(v){audio.volume=v;},get paused(){return audio.paused;},
      play(){audioEvents.push({type:'play',src:audio.src});audio.play().catch(error=>listeners.error?.({errMsg:error.message}));},pause(){audio.pause();audioEvents.push({type:'pause'});},stop(){audio.pause();audio.currentTime=0;},destroy(){audio.pause();audio.removeAttribute('src');audio.load();},
      onPlay(fn){audio.onplaying=fn;},onError(fn){listeners.error=fn;audio.onerror=()=>fn({errMsg:'decode failed'});},onEnded(fn){audio.onended=fn;},offEnded(){audio.onended=null;},offError(){listeners.error=null;audio.onerror=null;}};
     return api;
    },showModal:data=>modals.push(data),setKeepScreenOn(){},setInnerAudioOption(){},onAudioInterruptionBegin(){},onAudioInterruptionEnd(){}
   };
   const G={wx:mock,performance:hostWindow.performance,requestAnimationFrame:hostWindow.requestAnimationFrame.bind(hostWindow),cancelAnimationFrame:hostWindow.cancelAnimationFrame.bind(hostWindow),setTimeout:hostWindow.setTimeout.bind(hostWindow),clearTimeout:hostWindow.clearTimeout.bind(hostWindow),setInterval:hostWindow.setInterval.bind(hostWindow),clearInterval:hostWindow.clearInterval.bind(hostWindow)};
   hostWindow.__host={G,events,storage,audioEvents,modals};
   const active=new Map();
   for(const [type,name] of [['pointerdown','touchstart'],['pointermove','touchmove'],['pointerup','touchend'],['pointercancel','touchcancel']])hostDocument.addEventListener(type,event=>{
    const touch={identifier:event.pointerId,clientX:event.clientX,clientY:event.clientY,pageX:event.clientX,pageY:event.clientY};
    if(name==='touchstart'||name==='touchmove')active.set(event.pointerId,touch);else active.delete(event.pointerId);
    if(name==='touchmove'&&!event.buttons)return;
    events[name]?.({changedTouches:[touch],touches:[...active.values()],timeStamp:performance.now()});
   });
  });
  const code=fs.readFileSync(path.join(root,'wechat-build/game.js'),'utf8');
  await page.evaluate(code=>{const G=window.__host.G;new Function('wx','GameGlobal','globalThis','with(GameGlobal){'+code+'}')(G.wx,G,G);},code);
  await page.waitForFunction(()=>window.__host.G.__lingShanWechat?.hud.getLayout().controls.some(x=>x.id==='start'),{timeout:30000});
  const state=()=>page.evaluate(()=>window.__host.G.__trial.getState());
  const tick=seconds=>page.waitForFunction(({time,seconds})=>window.__host.G.__trial.getState().gameTime>=time+seconds,{time:0,seconds});
  async function click(selector){
   await page.waitForFunction(selector=>{const R=window.__host.G.__lingShanWechat.runtime,e=R.document.querySelector(selector),b=e?.getBoundingClientRect();return b?.width>0&&R.hitTest(b.x+b.width/2,b.y+b.height/2)===e;},selector,{timeout:15000});
   const b=await page.evaluate(selector=>window.__host.G.__lingShanWechat.runtime.document.querySelector(selector).getBoundingClientRect(),selector);
   await page.mouse.click(b.x+b.width/2,b.y+b.height/2);
  }
  const check=(name,detail={})=>{report.checks.push({name,...detail});console.log(JSON.stringify({name,...detail}));};
  fs.mkdirSync(path.join(root,'evidence'),{recursive:true});
  await page.screenshot({path:path.join(root,'evidence/wechat-menu.png')});
  assert.equal((await state()).mode,'menu');check('exact Mini Game bundle boots with Canvas menu and no DOM UI');
  await click('#chapters-btn');await page.waitForFunction(()=>window.__host.G.__lingShanWechat.runtime.document.querySelectorAll('[data-chapter]').length===8);
  await page.screenshot({path:path.join(root,'evidence/wechat-chapters.png')});
  await click('[data-chapter="moonwood"]');await tick(.1);assert.equal((await state()).stage,'moonwood');check('all 8 chapter choices generated; touch enters moonwood');
  const start=await state();
  const stick=await page.evaluate(()=>window.__host.G.__lingShanWechat.runtime.document.getElementById('joystick').getBoundingClientRect());
  await page.mouse.move(stick.x+stick.width/2,stick.y+stick.height/2);await page.mouse.down();await page.mouse.move(stick.x+stick.width/2,stick.y+stick.height*.15);
  await page.waitForFunction(z=>window.__host.G.__trial.getState().player.z<z-2,start.player.z,{timeout:20000});await page.mouse.up();
  const moved=await state();assert(moved.player.z<start.player.z-2);check('native touch mapping moves hero through joystick',{distance:start.player.z-moved.player.z});
  await click('#route-map');assert.equal((await state()).paused,true);await click('#map-close');assert.equal((await state()).paused,false);check('route map pauses and resumes');
  await page.waitForFunction(()=>{const R=window.__host.G.__lingShanWechat.runtime,j=R.document.getElementById('joystick'),b=j.getBoundingClientRect();return b.width>0&&R.hitTest(b.x+b.width/2,b.y+b.height/2)===j;});
  const multiStart=await state();
  await page.evaluate(()=>{
   const H=window.__host,D=H.G.__lingShanWechat.runtime.document,j=D.getElementById('joystick').getBoundingClientRect(),a=D.getElementById('attack').getBoundingClientRect();
   const left={identifier:77,clientX:j.x+j.width/2,clientY:j.y+j.height/2},right={identifier:88,clientX:a.x+a.width/2,clientY:a.y+a.height/2};
   H.events.touchstart({changedTouches:[left],touches:[left]});left.clientY=j.y+j.height*.12;H.events.touchmove({changedTouches:[left],touches:[left]});
   H.events.touchstart({changedTouches:[right],touches:[left,right]});H.multi={left,right};
  });
  await page.waitForFunction(time=>{const s=window.__host.G.__trial.getState();return s.gameTime>time+.2;},multiStart.gameTime);
  // Attacking intentionally reduces movement speed from 4.1 to 0.65 m/s.
  assert((await state()).player.z<multiStart.player.z-.05);assert((await state()).attackProgress>=0);
  await page.evaluate(()=>{const H=window.__host;H.events.touchend({changedTouches:[H.multi.right],touches:[H.multi.left]});H.events.hide();});assert.equal((await state()).paused,true);
  check('two native touches can move and attack; background cancels held joystick');
  const pausedTime=(await state()).gameTime;await page.waitForTimeout(300);assert.equal((await state()).gameTime,pausedTime);await page.evaluate(()=>window.__host.events.show());await click('#resume');check('hide/show clears input and keeps paused until resume');
  // A paused attack resumes its remaining animation/lunge; wait for it to end
  // before checking whether the cancelled joystick still causes movement.
  await page.waitForFunction(()=>window.__host.G.__trial.getState().attackProgress<0);
  const z=(await state()).player.z;await page.waitForTimeout(250);assert(Math.abs((await state()).player.z-z)<.01);check('no stuck movement after app background');
  await page.screenshot({path:path.join(root,'evidence/wechat-moonwood.png')});
  await click('#pause-btn');await click('#pause-settings');await click('#quality-select');await click('#volume-slider');await click('#settings-done');
  const prefs=await page.evaluate(()=>JSON.parse(window.__host.storage.get('lingshan-prefs')));assert.equal(prefs.quality,'high');assert.equal(prefs.volume,.5);check('Canvas settings update saved native storage',{quality:prefs.quality,volume:prefs.volume});
  await click('#pause-btn');await click('#pause-return');
  for(const chapter of ['emberpass','stoneking']){await click('#chapters-btn');await click(`[data-chapter="${chapter}"]`);await tick(.1);assert.equal((await state()).stage,chapter);await page.screenshot({path:path.join(root,`evidence/wechat-${chapter}.png`)});if(chapter==='stoneking'){await click('#heavy');await page.waitForFunction(()=>window.__host.G.__trial.getState().heavy);check('native heavy button runs original combat handler');}await click('#pause-btn');await click('#pause-return');}
  check('new route and third Boss render via the same Mini Game canvas');
  await click('#cinema-btn');await click('[data-cinema="intro"]');await page.waitForFunction(()=>window.__host.G.__trial.getState().mode==='cinematic');await click('.cinematic-skip');assert.equal((await state()).mode,'menu');check('native cinematic preview and touch skip return safely');
  const result=await page.evaluate(()=>({modals:window.__host.modals,audio:window.__host.audioEvents.filter(e=>e.type==='play').length,controls:window.__host.G.__lingShanWechat.hud.getLayout().controls}));
  assert.deepEqual(result.modals,[]);assert(result.audio>0);assert.deepEqual(report.errors,[]);check('no startup errors; original audio requested through wx audio',{audioStarts:result.audio});
  report.complete=true;fs.writeFileSync(path.join(root,'qa-wechat-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({complete:true,checks:report.checks.length,errors:report.errors}));
 }finally{await browser.close();}
})().catch(error=>{report.failure=error.stack;fs.writeFileSync(path.join(root,'qa-wechat-report.json'),JSON.stringify(report,null,2));console.error(error);process.exitCode=1;});
