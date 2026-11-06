import {build} from 'esbuild';
import {mkdir,readFile,writeFile,cp,readdir,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(root,'wechat-build');
await mkdir(output,{recursive:true});
let local={};
try{local=JSON.parse(await readFile(path.join(root,'wechat.project.local.json'),'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
const appid=process.env.WECHAT_APPID||local.appid||'touristappid';
if(appid!=='touristappid'&&!/^wx[a-f0-9]{16}$/i.test(appid))throw new Error('AppID 必须是 wx 开头的 18 位标识。');
await build({
 absWorkingDir:root,entryPoints:['wechat-src/entry.js'],outfile:path.join(output,'game.js'),
 bundle:true,platform:'neutral',format:'iife',target:'es2020',minify:true,legalComments:'eof',
 loader:{'.html':'text'},plugins:[{name:'wechat-audio',setup(api){
  api.onResolve({filter:/^\.\/audio\.js$/},args=>args.importer===path.join(root,'dist/main.js')?{path:path.join(root,'wechat-src/audio.js')}:undefined);
 }}]
});
const config={description:'灵山 · 悟空试炼：八章山海，三场试炼',compileType:'game',appid,projectname:'ling-shan-wukong',
 setting:{es6:false,minified:true,enhance:false,compileHotReLoad:false},packOptions:{ignore:[{type:'file',value:'package.json'}]}};
await writeFile(path.join(output,'project.config.json'),JSON.stringify(config,null,2)+'\n');
await writeFile(path.join(output,'game.json'),JSON.stringify({deviceOrientation:'landscape',showStatusBar:false},null,2)+'\n');
await writeFile(path.join(output,'package.json'),JSON.stringify({type:'commonjs',private:true},null,2)+'\n');
await cp(path.join(root,'wechat-src/audio'),path.join(output,'audio'),{recursive:true});
await cp(path.join(root,'dist/vendor/LICENSE.txt'),path.join(output,'THREE-LICENSE.txt'));
await cp(path.join(root,'LICENSE'),path.join(output,'LICENSE'));
async function size(dir){let n=0;for(const f of await readdir(dir)){const p=path.join(dir,f),s=await stat(p);n+=s.isDirectory()?await size(p):s.size;}return n;}
const bytes=await size(output);
await writeFile(path.join(root,'wechat-build-report.json'),JSON.stringify({built:true,hasAppId:appid!=='touristappid',bytes,webgl:'WebGL2 required',runtimeVerified:false,uploaded:false,published:false},null,2)+'\n');
console.log(`微信小游戏已构建：wechat-build/ (${(bytes/1024/1024).toFixed(2)} MiB)。${appid==='touristappid'?'尚未配置真实 AppID。':'已读取本机 AppID。'}这不代表已上传或上线。`);
