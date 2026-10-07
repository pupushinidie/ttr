# 车票之旅（Ticket to Ride）

2–5 人的铁路连线桌游，网页联机版。规则按标准美国版地图实现；名字、美术和规则说明文字都是自己的。

线上地址：<https://gulugagame.com/ttr/>

## 本地运行

```bash
npm install
npm run dev          # 服务端 :3007，网页 :5180
npm test             # 规则引擎（18 个用例 + 30 局随机模拟）
npm run typecheck
```

一个人测试：`node scripts/test-bot.mjs host 2 1` 会让机器人建一个 2 人房、拉一个机器人进来并打印房间码，你在网页里用房间码加入凑满 2 人后自动开局。机器人轮到自己时随机挑一个合法行动（调 `legalActions`）。`BOT_DELAY_MS` 调思考时间，`BOT_IDLE=1` 只挂着不动。

## 规则要点

- 每人 45 辆火车、起手 4 张车票卡、起始目的地票抽 3 留至少 2。
- 110 张车票卡（8 色各 12 张 + 14 张火车头万能牌），5 张明牌（明牌区 ≥3 张火车头就整排重洗），暗牌抽 1 张 / 明牌抽 1 张（抽到火车头算一次抽牌，结束回合）。
- 铺路：花费与路段等长的同色卡（灰色路段可用任意单色 + 火车头凑），双轨路段 2–3 人局只能占一侧。
- 游戏中抽目的地票：抽 3 留至少 1，未完成的票在终局倒扣分值。
- 路段计分 1=1 / 2=2 / 3=4 / 4=7 / 5=10 / 6=15；有人火车 ≤2 辆时触发终局，其余玩家各再行动一轮。
- 最长连续铁路 +10 分；总分 = 路段分 + 完成票分 − 未完成票分 + 最长铁路奖励。

## 目录

| 路径 | 内容 |
|---|---|
| `packages/game/src/engine.ts` | 规则引擎：`apply(state, playerId, command, rng) → { state, events }`，纯函数；抽卡（暗牌/明牌/火车头）、抽目的地票、铺路、终局判定、最长连续路径 DFS、按玩家视角隐藏信息 |
| `packages/game/src/types.ts` | 状态、行动、事件的类型 |
| `packages/game/src/map.ts` | 美国地图数据：36 座城市、100 条路段（22 组双轨）、30 张目的地票、路段计分表 |
| `apps/server` | Socket.IO 房间、断线用原昵称回到座位、90 秒回合计时（超时自动行动）、语音信令、每局的种子和动作序列写进 `logs/games.jsonl` |
| `apps/web/src/GameBoard.tsx` | 对局界面：SVG 美国地图（点选路段、灰色路段选颜色）、明牌区、手牌、目的地票、动作记录、结算弹窗 |
| `art/` | PixelLab 美术流水线（见下） |

## 美术流水线（`art/`）

PixelLab API，密钥只在 `~/.config/pixellab/api_key`，不进仓库。每次调用记进 `art/ledger.jsonl`，`BUDGET_USD` 设上限。生成的原图和中间文件在被 gitignore 的 `art/out/`。

- `generate_ttr.py`：8 种颜色车票卡 + 火车头万能牌 + 首页主图，每种出两个候选 `-c1`/`-c2`，直接导出到 `apps/web/public/art/`；挑好后复制成正式文件名（`cards/{color}.png`、`cards/locomotive.png`、`ui/hero.png`）。
- `pixellab.py`：PixelLab API 客户端（`/create-image-pixflux`），调用即记进 ledger。

## 部署

服务器上 `~/ttr`，pm2 进程 `ttr`（端口 3007），网页在 `/var/www/ttr`，Caddy `handle_path /ttr/*`。本机运行 `~/projects/deploy.sh ttr`（服务器拉 GitHub 上的 main）。

## 服务器上的启动方式

pm2 按仓库根目录的 `ecosystem.config.cjs` 直接启动一个 `node --import tsx` 进程跑服务端（不经过 `npm start`）。端口和密钥存在 pm2 里，不进仓库；`deploy.sh` 照旧 `pm2 restart`。改了 `ecosystem.config.cjs` 之后，要在服务器上带着原来的环境变量 `pm2 delete` 再 `pm2 start ecosystem.config.cjs` 一次。
