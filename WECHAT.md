# 微信小游戏版本

本项目使用原生微信小游戏工程，保留网页版本的八个章节、三场 Boss、教学、过场与重试。微信版用同一套战斗与场景代码，界面通过 Canvas 纹理叠加，操作、存档、音频和前后台切换接入 `wx` API。

## 当前交付状态

- 已生成独立小游戏工程 `wechat-build/`，主入口是 `game.js`，固定横屏。
- 已验证本地构建、运行时/音频单元测试，以及浏览器承载的微信 API 模拟环境中的实际渲染和触摸流程。
- **还未在微信开发者工具或微信客户端验证，也未上传、提审或发布。** 没有真实 AppID 时，构建使用 `touristappid` 占位；这不是已注册账号或可发布身份。
- 设备必须提供 WebGL2；不支持的设备会显示明确提示。

## 找到 AppID

电脑打开 [微信公众平台](https://mp.weixin.qq.com/)，登录小游戏对应账号，进入「开发管理 / 开发」→「开发设置」→「开发者 ID」，复制 `wx` 开头的 AppID。普通个人微信号本身没有小游戏 AppID，未注册需先按平台流程注册。

只需把 AppID 配置到本机，不要把 AppSecret、代码上传私钥或登录凭据写入仓库或聊天。

## 构建与导入

需要 Node.js 20 或更新版本：

```sh
npm ci
npm run wechat:config -- wx开头的真实AppID
npm run build:wechat
```

`wechat.project.local.json` 保存本机 AppID，已被 Git 忽略。也可仅在构建进程中设置环境变量 `WECHAT_APPID`。构建产物 `wechat-build/` 已包含完整音频和引擎，不需要业务服务器或远程素材域名。

安装并登录[微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)，导入 `wechat-build/`，确认项目类型为「小游戏」、AppID 与目标账号相符。构建时已经生成 `project.config.json`；不要直接导入网页 `dist/`。

使用开发者工具编译、预览并由开发者或体验成员扫码，在微信客户端验证：

1. 菜单、八关选择、教学全部触屏动作。
2. 同时移动与攻击、镜头拖动、手指滑出后抬起、切后台再返回。
3. 两段新增路线、三 Boss、破甲、失败重试、关卡之间切换。
4. BGM/音效、静音与音量持久化、跳过过场、暂停无残留声音。
5. 刘海安全区、胶囊避让、不同分辨率与设备性能；默认均衡画质，低端设备可选择流畅。

## 上传和正式发布

真实 AppID、开发者权限和微信客户端验证就绪后，可使用开发者工具「上传」提交开发版本。随后由账号后台完成提审，按后台提示补齐该账号所需资料；审核通过后再发布。**上传成功、审核通过、正式发布是三个不同状态。**

如使用官方 `miniprogram-ci` 自动上传，需要管理员在后台取得代码上传密钥并配置 IP 白名单。私钥应留在仓库外的本地路径，不能公开。当前项目不包含真实上传凭据，也不会在构建时自动上传或提审。

## 源码与验证

- `wechat-src/runtime.js`：轻量元素状态、触控捕获、生命周期、尺寸和存档适配。
- `wechat-src/hud.js`：同一 WebGL 画布上的原生触屏界面。
- `wechat-src/audio.js`：微信 BGM 与音效播放器。
- `wechat-src/audio/`：由本项目原创合成配乐和音效离线导出的 MP3。
- `scripts/build-wechat.mjs`：固定依赖、独立打包与真实 AppID 配置。

```sh
node --test qa-wechat-runtime.mjs qa-wechat-audio.mjs
# 先在另一个终端启动测试资源服务
python3 -m http.server 5175 --bind 127.0.0.1 --directory wechat-build
node qa-wechat.cjs
```

浏览器测试默认使用 macOS 的 Google Chrome；其他系统通过 `CHROME_PATH` 指定本机 Chromium 可执行文件。它使用真实编译包与 WebGL，但是 `wx` 由测试宿主实现，**不能替代微信真机验收或代表手机帧率**。

音频文件已包含在源码中。需要重新导出时，先安装 `ffmpeg`，再运行 `npm run audio:wechat`；会从 `dist/audio.js` 的原始合成代码重新生成，不下载外部录音。

## 官方参考

- [微信小游戏示例工程](https://github.com/wechat-miniprogram/minigame-demo)
- [微信小游戏 API 定义：Canvas、触摸、存储、音频](https://github.com/wechat-miniprogram/minigame-api-typings)
- [微信代码预览与上传工具](https://github.com/wechat-miniprogram/miniprogram-ci-dist)
- [Three.js WebGLRenderer 要求](https://threejs.org/docs/pages/WebGLRenderer.html)

原创代码和程序音频采用 MIT 许可；Three.js 保留其 MIT 许可。微信版本使用系统字体，不包含网页字体文件。
