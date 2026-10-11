# 车票之旅（Ticket to Ride）

2–5 人的铁路连线桌游，网页联机版。规则按标准美国版地图实现；名字、美术和规则说明文字都是自己的。

线上地址：<https://gulugagame.com/ttr/>

## 本地运行

```bash
npm install
npm run dev          # 服务端 :3007，网页 :5180
npm test             # 规则引擎、人机、教程剧本、服务器（房间 / 观战 / 人机托管）
npm run typecheck
```

一个人测试：直接在等候房间点「加人机」；或者 `node scripts/test-bot.mjs host 2 1` 让陪玩脚本建一个 2 人房、拉一个机器人进来并打印房间码，你在网页里用房间码加入凑满 2 人后自动开局。机器人轮到自己时随机挑一个合法行动（调 `legalActions`）。`BOT_DELAY_MS` 调思考时间，`BOT_IDLE=1` 只挂着不动。

## 规则要点

- 每人 45 辆火车、起手 4 张车票卡、起始目的地票抽 3 留至少 2（所有人同时选，超时全部保留）；退回的票放到票堆底部。
- 110 张车票卡（8 色各 12 张 + 14 张火车头万能牌），5 张明牌（明牌区 ≥3 张火车头就整排重洗），每回合抽 2 张；第一张就拿明牌火车头只能拿这 1 张，第二张不能拿明牌火车头。别人从牌库摸到的颜色不会发给你。
- 铺路：花费与路段等长的同色卡（灰色路段可用任意单色 + 火车头凑），双轨路段 2–3 人局只能占一侧。
- 游戏中抽目的地票：抽 3 留至少 1，未完成的票在终局倒扣分值。
- 路段计分 1=1 / 2=2 / 3=4 / 4=7 / 5=10 / 6=15；有人火车 ≤2 辆时触发终局，其余玩家各再行动一轮。
- 最长连续铁路 +10 分；总分 = 路段分 + 完成票分 − 未完成票分 + 最长铁路奖励。
- 超时（全站约定，覆盖规格书的写法）：每回合 90 秒，超时自动替你抽牌（选票时全部保留）；**连续超时 2 次转成人机托管**，自己动一下或点「取消托管」交还。离线的人轮到时先等 3 秒，再由人机代打（不算超时）；用原昵称和房间码回来就交还座位。

## 人机和托管

- 房主在等候房间的空座位点「加人机」，人机叫咕噜一号～四号，带「人机」标签，「移出」请走。一个人加满人机就能开局。只有「普通」一种难度。
- 策略在 `packages/game/src/bot.ts`：`botAdvice(视角, 座位) → { command, reason }`，`botCommand` 只取命令。输入必须是 `redactGameForViewer` 之后的视角（单测断言换掉别人的牌 / 票 / 牌库顺序选择不变）。做法：把没连通的目的地票用最省的线路连成一张网（偏向长线路），按「还剩几回合」挑票，能铺规划里的线路就铺，否则抽缺的颜色，票都连通且时间够就再抽票，最后一轮挑当下分最多的一步。
- 强度（`npx tsx ~/projects/qa-reports/tools/bots/sim-ttr.ts 300`，2–5 人各 300 局）：对随机全胜；对「每张票各走最短路、只留 2 张、牌够就铺」的基线胜率 76/66/64/61%（公平 50/33/25/20）；每步平均 0.09ms。
- 服务器：开局选票是大家同时选，机器人座位各自按顺序选，真人倒计时照走；出牌阶段按当前玩家。`BOT_DELAY_SCALE=0` 让人机立刻行动（测试用），`TURN_MS` 覆盖回合时长。测试 `apps/server/test/bots.test.ts`。

## 新手教程

- 首页和等候房间有「新手教程」入口（地址带 `?tutorial` 直接打开）。教程不连服务器，在浏览器里跑规则引擎：剧本 `packages/game/src/tutorial.ts`（22 步，两人局后半段，牌库顶和目的地票堆按剧本摆好），教练层 `apps/web/src/tutorial/`（全站共用，从花砖物语复制；`Coach.tsx` 加了横向滚动到目标），本游戏的部分 `TutorialMode.tsx`、`tutorialGame.ts`（提示的说法、小贴士）。
- 学完接一局和咕噜一号的练习局（从开局选票开始），可以点「提示」（键盘 H）。一个人加人机开的房间里也有「提示」，有别的真人时没有。
- 走查：`node ~/projects/qa-reports/tools/tut-ttr.mjs <输出目录> flow|waiting|room [1440|1920|1024|390] [night|day]`（先 `npm run dev`、`npm run build:game`）。

## 目录

| 路径 | 内容 |
|---|---|
| `packages/game/src/engine.ts` | 规则引擎：`apply(state, playerId, command, rng) → { state, events }`，纯函数；抽卡（暗牌/明牌/火车头）、抽目的地票、铺路、终局判定、最长连续路径 DFS、按玩家视角隐藏信息 |
| `packages/game/src/types.ts` | 状态、行动、事件的类型 |
| `packages/game/src/map.ts` | 美国地图数据：36 座城市、100 条路段（22 组双轨）、30 张目的地票、路段计分表 |
| `apps/web/src/Card.tsx` | 车票牌面：CSS 画底色 + PixelLab 车厢小图（每种颜色一种车厢） |
| `apps/server` | Socket.IO 房间、断线用原昵称回到座位、90 秒回合计时（超时自动行动）、语音信令、每局的种子和动作序列写进 `logs/games.jsonl` |
| `apps/web/src/GameBoard.tsx` | 对局界面：SVG 美国地图（线路画成一节节车厢、陆地/五大湖示意底图、点选路段、灰色路段选颜色）、明牌区、手牌、目的地票（小地图 + 是否已连通）、动作记录、结算弹窗（公开所有人的票） |
| `art/` | PixelLab 美术流水线（见下） |

## 美术流水线（`art/`）

PixelLab API，密钥只在 `~/.config/pixellab/api_key`，不进仓库。每次调用记进 `art/ledger.jsonl`，`BUDGET_USD` 设上限。生成的原图和中间文件在被 gitignore 的 `art/out/`。

- `generate_ttr.py`：首页主图（两个候选出到 `art/out/candidates/ui/`，挑好后复制成 `ui/hero.png`）；`python generate_ttr.py sprites` 出牌面上的透明底车厢小图（每种两个候选，放在 `art/out/sprites/`，挑好后复制成 `apps/web/public/art/cards/sprite-{color}.png`）。PixelLab 免费档同一时间只能跑 1 个生成。
- `pixellab.py`：PixelLab API 客户端（`/create-image-pixflux`），调用即记进 ledger。

## 画面：白天版和夜间版

只有像素风一种画面（原始版本已删掉），配色分夜间（深色，默认）和白天（白底）两种。顶栏「切换白天版 / 切换夜间版」随时切换，只影响自己看到的画面，记在浏览器的 `gm-pixel-theme` 里；gulugagame.com 上的大厅和各个游戏同源，共用这一个选择。

- 夜间配色就是 `app-pixel.css`（首页和等候房间）和 `ttr.css`（牌桌）本身。白天版不单独写：`apps/web/day-theme.ts`（Vite 插件）在构建时把这些样式里和颜色有关的声明照抄一份，选择器前加 `:root[data-theme="day"]`，按 `apps/web/day-palette.ts` 的调色表换成白天的颜色。改夜间样式时白天版自动跟着变，只有新出现的深色需要在调色表里补一行。
- 机械换色不合适的地方在 `apps/web/src/theme-day.css` 里手写。
- `index.html` 里一小段脚本在样式生效前就给 `<html>` 加上 `data-theme="day"`，打开页面不会先闪一下深色；切换逻辑和按钮在 `src/theme.tsx`。

## 部署

服务器上 `~/ttr`，pm2 进程 `ttr`（端口 3007），网页在 `/var/www/ttr`，Caddy `handle_path /ttr/*`。本机运行 `~/projects/deploy.sh ttr`（服务器拉 GitHub 上的 main）。

## 服务器上的启动方式

pm2 按仓库根目录的 `ecosystem.config.cjs` 直接启动一个 `node --import tsx` 进程跑服务端（不经过 `npm start`）。端口和密钥存在 pm2 里，不进仓库；`deploy.sh` 照旧 `pm2 restart`。改了 `ecosystem.config.cjs` 之后，要在服务器上带着原来的环境变量 `pm2 delete` 再 `pm2 start ecosystem.config.cjs` 一次。

## 背景音乐

进了房间（等候房间、对局、观战）和新手教程里循环放 `apps/web/public/bgm/ttr.mp3`，首页和房间列表不放。曲子是他用 Suno 做的，原文件在桌面 `bgm v1/车票之旅.mp3`（2026-10-11 接入）。播放器是 `apps/web/src/bgm.tsx`（大厅和各游戏是同一份文件，改了要同步到所有仓库）：一个页面只有一个播放器，从等候房间进牌桌不会从头放；循环处交叉淡化；切到别的标签页时暂停。顶栏的 ♪ 按钮能开关、调音量，设置全站共用（localStorage `gm-music`、`gm-music-volume`，默认开、音量 60）。浏览器要求先点过页面才能出声，从首页点进房间正好满足。

换曲子：把新文件放进 `apps/web/public/bgm/`，用 `~/miniconda3/envs/quant/bin/python -I ~/projects/qa-reports/tools/bgm-analyze.py <文件>` 量出 gain / start / end，改 `App.tsx` 里的 `BGM`。本地检查：`URL=http://localhost:<网页端口>/ node ~/projects/qa-reports/tools/bgm-check.mjs`（进房间、开局、离开、开关、顶栏是否被挤成两行）。

**动作音效**（2026-10-11）：都在 `apps/web/src/game-sfx.ts`，用共用的 `gm-sound.tsx` 即时合成，按每一步的 `game.events` 出声；自己的动作响亮，别人的减半，观战都算别人的；刚进房间 / 重连不出声。抽牌库 draw、拿明牌 flip（拿到火车头再加一声短汽笛）、明牌三张火车头重发 shuffle、抽目的地票 draw、留票 card；铺线路是招牌声：几节车厢一节节落轨 + 蒸汽汽笛（4 节以上拉长，5 节以上再加得分音）；自己连通一张目的地票 sparkle；最后一轮开始响道口铃；终局 reveal → 最长路线是你 sparkle → 赢 / 输。点线路选中、点票保留 / 退回响 select，轮到你时点铺不起的线路响 deny；轮到你、最后 5 秒、超时都有提示音。自测：`node ~/projects/qa-reports/tools/ttr-sfx.mjs`，教程：`URL=http://localhost:5180/ node ~/projects/qa-reports/tools/sfx-tut.mjs`。
