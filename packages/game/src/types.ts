import type { CardColor, TrainColor } from "./map.js";

export interface Config {
  readonly minPlayers: number;
  readonly maxPlayers: number;
  /** 每人的火车数。 */
  readonly trainsPerPlayer: number;
  /** 开局发几张车票。 */
  readonly startHandSize: number;
  /** 开局发几张目的地票。 */
  readonly startTicketsDrawn: number;
  /** 开局选目的地票至少要留几张。 */
  readonly startTicketsKeepMin: number;
  /** 明牌区几张。 */
  readonly faceUpCount: number;
  /** 明牌区火车头达到几张就重发。 */
  readonly maxFaceUpLocomotives: number;
  /** 游戏中一次抽几张目的地票。 */
  readonly drawTicketsPerAction: number;
  /** 游戏中抽目的地票至少要留几张。 */
  readonly ticketsKeepMin: number;
  /** 火车剩几张触发终局（≤ 这个数）。 */
  readonly trainsEndThreshold: number;
  /** 回合计时；超时自动替当前玩家选一个合法动作。 */
  readonly turnTimeoutSec: number;
}

export interface Player {
  readonly id: string;
  readonly name: string;
  score: number;
  /** 手里的车票（含火车头）。 */
  trainCards: CardColor[];
  /** 手里的目的地票（票 id）。 */
  tickets: string[];
  /** 开局抽到的、待选的目的地票（选完清空）。 */
  pendingTickets: string[];
  /** 还剩几辆火车没放。 */
  trainsLeft: number;
  /** 客户端视角：别人看得到的手牌数。 */
  handCount?: number;
  ticketCount?: number;
}

/** 一条已铺设的线路。 */
export interface ClaimedRoute {
  readonly routeId: string;
  readonly playerId: string;
  /** 铺设时用的颜色（灰线路填玩家选的颜色）。 */
  readonly color: TrainColor;
  readonly trainCount: number;
  readonly points: number;
}

export type DrawSource = { readonly kind: "deck" } | { readonly kind: "faceUp"; readonly index: number };

export type GameCommand =
  | { readonly type: "KEEP_TICKETS"; readonly keep: number[] }
  | { readonly type: "DRAW_CARD"; readonly source: DrawSource }
  | { readonly type: "DRAW_TICKETS" }
  | { readonly type: "CLAIM_ROUTE"; readonly routeId: string; readonly color: TrainColor };

export interface FinalScore {
  readonly player: string;
  readonly score: number;
  readonly routePoints: number;
  readonly ticketPoints: number;
  readonly completedTickets: number;
  readonly longestPath: number;
  readonly longestBonus: number;
}

export interface FinalResult {
  readonly scores: FinalScore[];
  readonly winners: string[];
  /** 全场最长连续线路的长度（并列都算）。 */
  readonly longestPath: number;
}

/** 每个动作产生的事件，前端按顺序逐条播放。 */
export type GameEvent =
  | { readonly type: "TicketsKept"; readonly player: string; readonly kept: number; readonly discarded: number }
  /** 别人从牌库摸的牌对你隐藏：color 被去掉。 */
  | { readonly type: "CardDrawn"; readonly player: string; readonly source: "deck" | "faceUp"; readonly color?: CardColor }
  | { readonly type: "TicketsTaken"; readonly player: string; readonly count: number }
  | { readonly type: "RouteClaimed"; readonly player: string; readonly routeId: string; readonly color: TrainColor; readonly points: number; readonly trainsLeft: number }
  | { readonly type: "LastRoundStarted"; readonly player: string }
  | { readonly type: "GameStarted"; readonly startPlayer: string }
  | { readonly type: "GameEnded"; readonly result: FinalResult }
  | { readonly type: "TurnTimedOut"; readonly player: string };

export interface GameState {
  readonly config: Config;
  /** tickets：开局选目的地票；playing：出牌阶段；finished：结束。 */
  phase: "tickets" | "playing" | "finished";
  players: Player[];
  /** 当前玩家在 players 里的下标（选票阶段大家同时选，这里是先手）。 */
  currentPlayer: number;
  /** 第几个回合；选票阶段为 0，进入出牌阶段后每个完整回合 +1。 */
  turn: number;
  /** 开局随机定的先手。 */
  startPlayer: number;
  claimedRoutes: ClaimedRoute[];
  /** 面朝下的车票牌库（服务端）。 */
  deck: CardColor[];
  /** 明牌区（公开）。 */
  faceUp: CardColor[];
  /** 用掉的 / 重发弃掉的车票（服务端）。 */
  discard: CardColor[];
  /** 目的地票牌库（服务端）。 */
  ticketDeck: string[];
  /** 旧字段：退回的目的地票现在放回 ticketDeck 底部，这里一直是空的。 */
  ticketDiscard: string[];
  /** 当前玩家需要补完的半个动作。 */
  pending?: { readonly type: "secondDraw" } | { readonly type: "ticketChoice"; readonly drawn: string[] };
  finalRound: boolean;
  finalTurnsRemaining: number;
  events: GameEvent[];
  finalResult?: FinalResult;
  /** 每个动作 +1；前端据此判断是不是新事件。 */
  version: number;
  /** 以下只在服务端：随机数状态、动作序列。 */
  seed?: number;
  rngState?: number;
  log?: { player: string; command: GameCommand | { type: "TIMEOUT" } }[];
  /** 仅客户端视角存在：车票牌库 + 弃牌堆的剩余数、目的地票剩余数。 */
  remainingCards?: number;
  remainingTickets?: number;
}
