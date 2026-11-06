import {writeFile} from 'node:fs/promises';
const appid=process.argv[2];
if(!/^wx[a-f0-9]{16}$/i.test(appid||''))throw new Error('用法：npm run wechat:config -- wx开头的真实AppID');
await writeFile(new URL('../wechat.project.local.json',import.meta.url),JSON.stringify({appid},null,2)+'\n');
console.log('已保存本机 AppID。运行 npm run build:wechat 后导入 wechat-build。此文件不会进入 Git。');
