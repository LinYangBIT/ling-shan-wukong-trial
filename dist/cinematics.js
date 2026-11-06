import * as THREE from './vendor/three.module.js';

const clamp=(value,min=0,max=1)=>Math.min(max,Math.max(min,value));
const smooth=value=>{const t=clamp(value);return t*t*(3-2*t);};
const sine=value=>(1-Math.cos(Math.PI*clamp(value)))/2;
const TITLES={intro:'山门初见',phase2:'妖将震怒',victory:'劫尽尘消',defeat:'修行未尽'};

/** A deterministic, real-time camera sequence. The game owns poses and simulation. */
export class CinematicDirector {
  constructor({camera,hero,boss,audio,onComplete,onCue}={}) {
    if(!camera||!hero||!boss)throw new TypeError('CinematicDirector requires camera, hero and boss.');
    this.camera=camera;this.hero=hero;this.boss=boss;this.audio=audio;
    this.onComplete=onComplete;this.onCue=onCue;
    this._active=false;this._type=null;this._elapsed=0;this._duration=0;
    this._shotIndex=-1;this._preview=false;this._run=0;this._shots=[];
    this._look=new THREE.Vector3();this._position=new THREE.Vector3();
    this._previousFocus=null;this._lastProgress=-1;
    this._createOverlay();
  }

  get active(){return this._active;}
  get type(){return this._type;}
  get progress(){return this._duration>0?clamp(this._elapsed/this._duration):0;}
  get shotIndex(){return this._shotIndex;}
  get duration(){return this._duration;}
  get state(){return Object.freeze({active:this.active,type:this.type,progress:this.progress,shotIndex:this.shotIndex,shot:this._shots[this._shotIndex]?.name??null,duration:this.duration,elapsed:this._elapsed,preview:this._preview});}

  _createOverlay(){
    const el=document.createElement('section');el.id='cinematic-overlay';el.className='cinematic-overlay';
    el.hidden=true;el.setAttribute('role','region');el.setAttribute('aria-label','过场动画');
    el.innerHTML=`<div class="cinematic-shade" aria-hidden="true"></div>
      <div class="cinematic-bar cinematic-bar-top" aria-hidden="true"></div>
      <div class="cinematic-bar cinematic-bar-bottom" aria-hidden="true"></div>
      <div class="cinematic-fade" aria-hidden="true"></div>
      <div class="cinematic-chapter"><span class="cinematic-chapter-mark" aria-hidden="true">◇</span><span class="cinematic-chapter-text"></span></div>
      <div class="cinematic-title" aria-hidden="true"><span class="cinematic-title-kicker"></span><span class="cinematic-title-main"></span><span class="cinematic-title-rule"></span></div>
      <p class="cinematic-caption" role="status" aria-live="polite" aria-atomic="true"></p>
      <div class="cinematic-actions"><button type="button" class="cinematic-skip" aria-label="跳过过场动画"><span>跳过</span><span class="cinematic-skip-icon" aria-hidden="true">›</span><kbd aria-hidden="true">SPACE</kbd></button><div class="cinematic-progress" role="progressbar" aria-label="过场播放进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span></span></div></div>`;
    document.body.append(el);this.element=el;
    this._chapter=el.querySelector('.cinematic-chapter-text');this._caption=el.querySelector('.cinematic-caption');
    this._title=el.querySelector('.cinematic-title');this._titleMain=el.querySelector('.cinematic-title-main');this._titleKicker=el.querySelector('.cinematic-title-kicker');
    this._fade=el.querySelector('.cinematic-fade');this._progress=el.querySelector('.cinematic-progress');this._progressFill=this._progress.firstElementChild;
    this._skip=el.querySelector('.cinematic-skip');
    this._skip.addEventListener('pointerdown',event=>event.stopPropagation());
    this._skip.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();this.skip();});
    // Native Enter/Space button activation remains available; the game may also skip on Escape/Space.
  }

  start(type,{preview=false}={}){
    type=type==='phase'?'phase2':type;
    if(!Object.hasOwn(TITLES,type))throw new RangeError(`Unknown cinematic: ${type}`);
    if(this._active)this.cancel();else this.audio?.stopCinematic?.();
    this._run++;this._type=type;this._preview=!!preview;this._phaseImpactFired=false;
    this._elapsed=0;this._shotIndex=-1;this._lastProgress=-1;
    this._shots=this._buildShots(type);this._duration=this._shots.reduce((sum,shot)=>sum+shot.duration,0);
    let time=0;for(const shot of this._shots){shot.start=time;time+=shot.duration;shot.end=time;}
    this._previousFocus=document.activeElement;this._active=true;
    this.element.hidden=false;this.element.dataset.type=type;this.element.dataset.preview=String(this._preview);
    this._chapter.textContent=`${preview?'影卷重温 · ':''}${type==='intro'?'第一回 · ':''}${TITLES[type]}`;
    document.body.classList.add('cinematic');
    this._skip.focus({preventScroll:true});
    const run=this._run;this._enterShot(0);
    if(this._active&&this._run===run)this._render();
    return this;
  }

  update(dt){
    if(!this._active||!Number.isFinite(dt)||dt<=0)return;
    const run=this._run;this._elapsed=Math.min(this._duration,this._elapsed+dt);
    let index=this._shotIndex;
    while(index<this._shots.length-1&&this._elapsed>=this._shots[index].end){
      this._enterShot(++index);
      if(!this._active||this._run!==run)return;
    }
    if(this._type==='phase2'&&!this._phaseImpactFired&&this.progress>=.5){
      this._phaseImpactFired=true;
      this.onCue?.({name:'phase-impact',type:this._type,progress:.5,shotIndex:this._shotIndex,preview:this._preview});
      if(!this._active||this._run!==run)return;
    }
    this._render();
    if(this._elapsed>=this._duration)this._finish(false);
  }

  skip(){if(this._active){this._elapsed=this._duration;this._finish(true);}return this;}

  cancel(){
    if(!this._active)return this;
    this._active=false;this._run++;this.audio?.stopCinematic?.();this._hide();return this;
  }

  _finish(skipped){
    if(!this._active)return;
    const result={type:this._type,skipped:!!skipped,preview:this._preview};
    if(skipped)this.audio?.stopCinematic?.();
    this._active=false;this._run++;this._hide();
    this.onComplete?.(result);
  }

  _hide(){
    const restoreFocus=this.element.contains(document.activeElement);
    this.element.hidden=true;this._fade.style.opacity='0';
    document.body.classList.remove('cinematic');
    if(restoreFocus&&this._previousFocus?.isConnected&&this._previousFocus.getClientRects().length)this._previousFocus.focus?.({preventScroll:true});
    this._previousFocus=null;
  }

  _enterShot(index){
    this._shotIndex=index;const shot=this._shots[index];
    this.element.dataset.shot=String(index);this._caption.textContent=shot.subtitle||'';
    this._titleMain.textContent=shot.title||'';this._titleKicker.textContent=shot.kicker||'';
    if(shot.cue){
      this.audio?.play?.(shot.cue);
      this.onCue?.({name:shot.cue,type:this._type,cue:shot.cue,shotIndex:index,preview:this._preview});
    }
  }

  _render(){
    const shot=this._shots[this._shotIndex],local=this._elapsed-shot.start;
    const t=clamp(local/shot.duration),e=smooth(t);
    if(shot.orbit){
      const o=shot.orbit,angle=o.angle[0]+(o.angle[1]-o.angle[0])*sine(t),radius=THREE.MathUtils.lerp(o.radius[0],o.radius[1],e);
      this._position.set(o.center.x+Math.sin(angle)*radius,THREE.MathUtils.lerp(shot.from.y,shot.to.y,e),o.center.z+Math.cos(angle)*radius);
    }else this._position.lerpVectors(shot.from,shot.to,e);
    this._clampCamera(this._position);this.camera.position.copy(this._position);
    this._look.lerpVectors(shot.lookFrom,shot.lookTo,sine(t));this.camera.lookAt(this._look);
    const fov=THREE.MathUtils.lerp(shot.fov[0],shot.fov[1],e);
    if(Math.abs(this.camera.fov-fov)>.001){this.camera.fov=fov;this.camera.updateProjectionMatrix();}
    const subtitleIn=smooth((local-.16)/.26),subtitleOut=smooth((shot.duration-local-.08)/.25);
    this._caption.style.opacity=String(Math.min(subtitleIn,subtitleOut));
    const titleIn=smooth((local-.38)/.55),titleOut=smooth((shot.duration-local-.12)/.4);
    this._title.style.opacity=shot.title?String(Math.min(titleIn,titleOut)):'0';
    this._title.style.transform=`translateY(${(1-titleIn)*8}px)`;
    // Only entry/exit reach opaque black. Each exact cut has a 120ms soft dip.
    let fade=Math.max(clamp(1-this._elapsed/.28),clamp(1-(this._duration-this._elapsed)/.28));
    for(let i=1;i<this._shots.length;i++)fade=Math.max(fade,.56*clamp(1-Math.abs(this._elapsed-this._shots[i].start)/.06));
    this._fade.style.opacity=String(fade);
    this._progressFill.style.transform=`scaleX(${this.progress})`;
    const percent=Math.floor(this.progress*100);if(percent!==this._lastProgress){this._progress.setAttribute('aria-valuenow',String(percent));this._lastProgress=percent;}
  }

  _clampCamera(position){
    const radius=Math.hypot(position.x,position.z);if(radius>19.8){position.x*=19.8/radius;position.z*=19.8/radius;}
    position.y=clamp(position.y,.65,11);return position;
  }

  _buildShots(type){
    const hero=this.hero.position.clone(),boss=this.boss.position.clone();
    const away=hero.clone().sub(boss).setY(0);if(away.lengthSq()<.001)away.set(0,0,1);away.normalize();
    const side=new THREE.Vector3(away.z,0,-away.x);
    const point=(anchor,lateral,height,depth)=>anchor.clone().addScaledVector(side,lateral).addScaledVector(away,depth).setY(anchor.y+height);
    const target=(anchor,height)=>anchor.clone().add(new THREE.Vector3(0,height,0));
    const center=hero.clone().lerp(boss,.5);
    const shot=(name,duration,from,to,lookFrom,lookTo,fov,extra={})=>({name,duration,from:this._clampCamera(from),to:this._clampCamera(to),lookFrom,lookTo,fov,...extra});
    if(type==='intro')return [
      shot('temple-wide',2.65,new THREE.Vector3(12.5,6.8,12),new THREE.Vector3(9.3,5.3,10.4),new THREE.Vector3(0,2.9,-13),new THREE.Vector3(0,2.5,-10),[49,46],{subtitle:'山门寂寂，风过千年。',title:'灵山',kicker:'第一回 · 山门试炼',cue:'cinematicStart'}),
      shot('pilgrim-close',2.35,point(hero,2.7,1.75,-3.2),point(hero,1.95,1.95,-2.8),target(hero,1.48),target(hero,1.65),[43,39],{subtitle:'行者不问归路，只问前尘。'}),
      shot('guardian-reveal',2.55,point(boss,-3.9,1.65,5),point(boss,-2.35,2.4,4.2),target(boss,2.1),target(boss,2.7),[44,39],{subtitle:'一棍破关，方知山外有山。',title:'守山妖将',kicker:'山门守望',cue:'cinematicReveal'}),
      shot('battle-approach',2.45,point(hero,2.8,3.15,5.7),point(hero,.15,4.32,7.45),target(center,1.7),hero.clone().lerp(boss,.18).add(new THREE.Vector3(0,1.62,0)),[44,48],{subtitle:'来，接这一劫。'})
    ];
    if(type==='phase2'){
      const angle=Math.atan2(away.x,away.z);
      return [
        shot('guardian-face',1.55,point(boss,-.85,3.15,3.5),point(boss,-.55,3.05,2.95),target(boss,2.95),target(boss,2.98),[42,39],{subtitle:'封尘未散，怒意已醒。',cue:'cinematicPhase'}),
        shot('gathering-storm',1.95,point(boss,1.2,3.7,5.5),point(boss,4,3.2,3.2),target(boss,2.7),target(boss,2.9),[44,47],{subtitle:'这山门，还容不得你过！',title:'震怒',kicker:'第二相',orbit:{center:boss,angle:[angle+.2,angle+1.12],radius:[5.8,5.5]}}),
        shot('second-phase-wide',1.5,point(center,-7.2,5.3,7.7),point(center,-5.7,4.4,6.8),target(center,1.8),target(center,1.7),[48,48],{subtitle:'风声骤紧。看清来势，再出一棍。'})
      ];
    }
    if(type==='victory')return [
      shot('guardian-fallen',2.1,point(boss,-3.2,2.1,4.8),point(boss,-2.55,1.7,4.05),target(boss,1.25),target(boss,1.12),[45,42],{subtitle:'尘土落定，山林复静。',cue:'cinematicVictory'}),
      shot('pilgrim-after-battle',2.3,point(hero,2.8,2.15,-3.6),point(hero,3.5,2.45,-4.3),target(hero,1.4),target(hero,1.5),[42,45],{subtitle:'一身风霜，一路向前。'}),
      shot('temple-pullback',2.6,point(hero,2.2,3.3,5.4),point(hero,6.7,6.1,9.8),target(center,1.8),new THREE.Vector3(0,2.4,-12),[46,52],{subtitle:'此间一劫，已过。',title:'劫尽 · 尘消',kicker:'山门试炼 · 成'})
    ];
    return [
      shot('pilgrim-fallen',1.9,point(hero,2.5,1.8,3.6),point(hero,2,1.5,3.1),target(hero,.75),target(hero,.65),[45,43],{subtitle:'一时失手，非是终途。',cue:'cinematicDefeat'}),
      shot('the-road-remains',2.1,point(hero,4.6,3.3,6),point(hero,6.3,4.9,8),target(hero,.8),target(center,1.2),[45,49],{subtitle:'息念，起身，再赴山门。',title:'修行未尽',kicker:'前路仍在'})
    ];
  }
}
