# Neko 功能站

一只猫娘住进了 Cloudflare Workers，顺便帮你干点活。

以"聊天窗口"形式聚合各种实用小工具：粘贴链接解析、以图搜源、漫画翻译、智能抠图……前端纯 HTML/CSS/JS 无构建，后端 Hono，单 Worker 部署即用。

线上地址：https://tools.nekodayo.top

## 现有功能

| 功能 | 说明 |
|---|---|
| 链接解析 | 粘贴分享链接，解析出视频/图片/封面并支持预览和下载，支持 B站、抖音、小红书、微博、X 等 21 个平台 |
| 以图搜源 | 上传图片搜索出处（SauceNAO / TraceMoe / AnimeTrace / 百度识图），多引擎结果合并展示 |
| 漫画翻译 | 上传图片，识别并翻译图内文字 |
| 智能抠图 | 上传图片去除背景（remove.bg） |
| 随机 Roll | 随机数字、二选一、多选一、判断句、概率，帮选择困难做决定 |
| 疯狂星期四 | 随机返回一条疯四文案 |
| 发病语录 | 输入名字，生成一段"发病"文案 |

## 体验特性

- **聊天式交互**：所有功能以猫娘对话形式呈现，文案随机不重样，问候语按时段变化；支持粘贴/拖拽上传截图
- **聊天记录**：每个功能的对话历史会记住，关掉窗口再打开还在
- **快捷键**：回车发送 / Shift+回车换行、按 ESC 关窗口、粘贴链接自动解析
- **智能滚动**：往上翻看历史时新消息不会把你拽到底部，右下角有"回到底部"按钮
- **图片放大镜**：点聊天里的任意图片全屏放大，双击或滚轮缩放，可拖动
- **下载体验**：视频/封面/图集一键下载，多张图自动打包 ZIP，文件名带平台和标题
- **界面动效**：窗口弹出回弹、卡片依次入场，系统开启"减弱动态效果"时自动关闭
- **移动端**：功能窗口自动全屏、深色模式适配
- **侧栏卡片**：一言、今日人品、实时天气、摸鱼日历（节假日倒计时、调休识别）
- **防滥用**：消耗外部额度的接口限每 IP 每分钟 60 次，普通浏览不受影响

> 猫是要哄的。她偶尔会回应超出你输入的东西——深夜、节日、或者你多陪她玩一会儿的时候。网站上藏着一些小秘密，找到的都会记进她的收集册。

## 技术架构

```
Cloudflare Workers
├── src/                      后端（Hono + TypeScript）
│   ├── index.ts              入口：路由注册 + KV 限流 + 静态资源缓存策略
│   ├── types.ts              分类与功能类型定义
│   └── features/             每个功能一个目录（route.ts + data.ts）
│       ├── parser/           链接解析（21 平台，媒体走同源代理绕防盗链）
│       ├── image-search/      以图搜源（engines.ts 为各引擎实现）
│       ├── manga-translator/ 漫画翻译
│       ├── remove-bg/        智能抠图（多密钥轮询）
│       └── ...
└── web/                      前端（原生，无构建）
    ├── index.html            骨架 + 核心系统（聊天/搜索/模块加载）
    ├── style.css             全部样式与动画
    ├── texts.js              文案池集中管理
    ├── features/             功能模块，点开时才按需加载
    └── images/               自托管图片资源
```

后端与前端通过 `/api/features` 元数据端点解耦：前端拿到功能清单后动态渲染，功能代码只在用户点开时才注入。

## 本地运行

需要 Node.js（本地运行不需要 Cloudflare 账号）。

```powershell
npm install
npx.cmd wrangler dev
```

默认地址 `http://127.0.0.1:8787`。

局域网调试（手机访问）：

```powershell
$env:XDG_CONFIG_HOME="<项目路径>\.wrangler-tmp"; npx.cmd wrangler dev --ip 0.0.0.0 --port 8787
```

> 设置 `XDG_CONFIG_HOME` 是让 wrangler 日志写在项目目录内，避免 IDE 终端权限问题。
> 停止服务请按 `x` 或 Ctrl+C，直接关终端可能留下 workerd 进程占用 8787 端口（`netstat -ano | findstr :8787` 定位后 `taskkill /F /PID <pid>` 清理）。

## 密钥配置

本地放在根目录 `.dev.vars`（已被 git 忽略），每行 `名字=值`；线上用 `npx.cmd wrangler secret put <名字>`。

| 密钥 | 用于 | 必需吗 |
|---|---|---|
| `BAIDU_APP_ID` / `BAIDU_APP_KEY` | 漫画翻译（每月免费 1 万字符） | 用漫画翻译才需要 |
| `REMOVE_BG_KEY` | 智能抠图（免费 50 张/月，可逗号分隔多个轮换） | 用抠图才需要 |
| `SAUCENAO_KEY` | 以图搜源 SauceNAO 引擎（无 key 走网页解析） | 可选 |
| `YOUDAO_APP_KEY` / `YOUDAO_APP_SECRET` | 备用翻译通道 | 可选 |

未配置密钥的功能直接返回错误提示，不影响其他功能。

## 部署

在 `wrangler.toml` 中把 `REPLACE_WITH_KV_ID` 换成你自己的 KV 命名空间 ID（`npx.cmd wrangler kv namespace create KV` 创建），R2 桶名按需修改，然后：

```powershell
npx.cmd wrangler deploy
```

## 开发约定

- **新增功能**：后端在 `src/features/` 建目录写 `route.ts`（导出 `Feature` 对象），在 `src/features/index.ts` 注册、`src/types.ts` 挂分类；前端在 `web/features/` 建同名 js，注册 `window.__features.<id> = { renderer, run }`。功能模块按需加载，首屏不下载全部代码。
- 大段文案数据单独放 `data.ts`，不混在路由逻辑里。
- 跨域/防盗链媒体统一走 `/api/parse/proxy?url=...` 代理（带对应平台 Referer）；新增平台记得把域名加进 `MEDIA_HOST_ALLOWLIST`。
- 解析结果在 KV 缓存 1 小时，调试注意旧缓存。
- 改完 TS 跑 `npx.cmd tsc --noEmit`。
- 前端动画只用 transform/opacity、时长 <300ms、保留 `prefers-reduced-motion` 回退。
- 聊天文案走随机文案池（`PROMPTS` / `LOADING_LINES`），保持猫娘语气。

## 参考项目

部分功能参考了以下原仓库的实现思路：

- 链接解析：nonebot-plugin-parser-lite（本项目是其网页版还原）
- 以图搜源：imgS-plugin
- 随机 Roll：nonebot-plugin-sayoroll
- 今日人品：nonebot-plugin-jrrp3 / nonebot-plugin-neko-draw

部分平台（知乎、贴吧、小黑盒）因需要复杂签名或设备指纹，未实现。

## License

仅供学习交流使用。
