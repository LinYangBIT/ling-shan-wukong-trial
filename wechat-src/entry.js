import html from '../dist/index.html';
import * as THREE from '../dist/vendor/three.module.js';
import {installRuntime} from './runtime.js';
import {createHud} from './hud.js';

const nativeWx=wx;
const runtime=installRuntime(nativeWx,html);
function fail(message,error){
 console.error('[灵山启动失败]',error?.message||message);
 nativeWx.showModal?.({title:'暂时无法启动',content:message,showCancel:false});
 const ctx=runtime.canvas.getContext('2d');
 if(ctx){ctx.fillStyle='#132b28';ctx.fillRect(0,0,runtime.canvas.width,runtime.canvas.height);ctx.fillStyle='#f0dfb6';ctx.font='20px sans-serif';ctx.fillText('灵山 · 悟空试炼',24,56);ctx.font='15px sans-serif';ctx.fillText(message,24,94);}
}
try{
 const gl=runtime.canvas.getContext('webgl2',{antialias:true,powerPreference:'high-performance'});
 if(!gl||typeof gl.texImage3D!=='function')throw new Error('WEBGL2_UNSUPPORTED');
 const hud=createHud({THREE,runtime,wx:nativeWx});
 globalThis.__lingShanPlatform={afterRender:renderer=>hud.render(renderer)};
 // CommonJS require is intentional: environment installation must finish before main executes.
 require('../dist/main.js');
 globalThis.__lingShanWechat={runtime,hud,version:'1.0.0'};
}catch(error){
 fail(error.message==='WEBGL2_UNSUPPORTED'?'当前设备未提供 WebGL2，请更新微信或换用支持的设备。':'游戏启动失败，请退出后重试。',error);
}
