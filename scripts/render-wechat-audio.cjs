// Render our original procedural score/effects; never downloads third-party audio.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process');
const {chromium}=require('playwright-core');
const root=path.resolve(__dirname,'..'),out=path.join(root,'wechat-src/audio');
const names=['bgm','swing0','swing1','swing2','heavy','hitLight','hitHeavy','land','dodge','perfectDodge','bossSwing','bossSlam','spell','heal','victory','death','cinematicStart','cinematicReveal','cinematicPhase','cinematicVictory','cinematicDefeat'];
(async()=>{
 fs.mkdirSync(out,{recursive:true});const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'lingshan-audio-'));
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 try{
  const page=await browser.newPage();
  await page.addScriptTag({content:fs.readFileSync(path.join(root,'dist/audio.js'),'utf8').replace('export class GameAudio','window.GameAudio=class GameAudio')});
  const stats=[];
  for(const name of names){
   const result=await page.evaluate(async name=>{
    const rate=32000,seconds=name==='bgm'?40:5,ctx=new OfflineAudioContext(2,seconds*rate,rate);
    const Constructor=window.AudioContext;window.AudioContext=function(){return ctx;};
    const audio=new GameAudio();audio._createContext();window.AudioContext=Constructor;
    audio.master.gain.value=1;audio.paused=false;let currentTime=0;
    audio.context=new Proxy(ctx,{get(target,key){if(key==='state')return 'running';if(key==='currentTime')return currentTime;const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});
    if(name==='bgm'){audio._nextBeat=.08;for(let i=0;i<96;i++){currentTime=i*.4;audio._schedule();}}
    else audio.play(name);
    const rendered=await ctx.startRendering(),start=name==='bgm'?Math.round(12.88*rate):0;
    let length=name==='bgm'?Math.round(12.8*rate):rendered.length;
    if(name!=='bgm'){
     while(length>rate*.12&&Math.max(Math.abs(rendered.getChannelData(0)[length-1]),Math.abs(rendered.getChannelData(1)[length-1]))<.00003)length--;
     length=Math.min(rendered.length,length+Math.round(rate*.05));
    }
    const bytes=new Uint8Array(44+length*4),view=new DataView(bytes.buffer);
    const word=(at,s)=>{for(let i=0;i<s.length;i++)bytes[at+i]=s.charCodeAt(i);};
    word(0,'RIFF');view.setUint32(4,36+length*4,true);word(8,'WAVE');word(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,2,true);view.setUint32(24,rate,true);view.setUint32(28,rate*4,true);view.setUint16(32,4,true);view.setUint16(34,16,true);word(36,'data');view.setUint32(40,length*4,true);
    let peak=0,squares=0;
    for(let i=0;i<length;i++)for(let ch=0;ch<2;ch++){const sample=rendered.getChannelData(ch)[start+i];peak=Math.max(peak,Math.abs(sample));squares+=sample*sample;view.setInt16(44+(i*2+ch)*2,Math.round(Math.max(-1,Math.min(1,sample))*32767),true);}
    let text='';for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));
    return{base64:btoa(text),duration:length/rate,peak,rms:Math.sqrt(squares/(length*2))};
   },name);
   if(result.peak<.001)throw new Error('Silent render: '+name);
   const wav=path.join(temporary,name+'.wav');fs.writeFileSync(wav,Buffer.from(result.base64,'base64'));
   const run=spawnSync(process.env.FFMPEG_PATH||'ffmpeg',['-hide_banner','-loglevel','error','-y','-i',wav,'-codec:a','libmp3lame','-b:a',name==='bgm'?'96k':'64k',path.join(out,name+'.mp3')],{encoding:'utf8'});
   if(run.status!==0)throw new Error(run.stderr||'ffmpeg failed');
   stats.push({name,duration:result.duration,peak:result.peak,rms:result.rms});
  }
  fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify({source:'dist/audio.js — original procedural composition and effects',license:'MIT',assets:stats},null,2)+'\n');
  console.log(JSON.stringify({complete:true,assets:stats.length,bytes:names.reduce((n,name)=>n+fs.statSync(path.join(out,name+'.mp3')).size,0)}));
 }finally{await browser.close();fs.rmSync(temporary,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
