import { createRng, type Rng } from "./rng.js";
import {
  CARD_COUNTS,
  LOCOMOTIVE,
  LONGEST_PATH_BONUS,
  ROUTES,
  ROUTE_SCORES,
  TICKETS,
  TRAIN_COLORS,
  type CardColor,
  type RouteDef,
  type TrainColor,
} from "./map.js";
import type {
  ClaimedRoute,
  Config,
  DrawSource,
  FinalResult,
  FinalScore,
  GameCommand,
  GameEvent,
  GameState,
  Player,
} from "./types.js";

/** 规格书「配置项汇总」里的默认值。 */
export function defaultConfig(_playerCount: number, overrides: Partial<Config> = {}): Config {
  return {
    minPlayers: 2,
    maxPlayers: 5,
    trainsPerPlayer: 45,
    startHandSize: 4,
    startTicketsDrawn: 3,
    startTicketsKeepMin: 2,
    faceUpCount: 5,
    maxFaceUpLocomotives: 3,
    drawTicketsPerAction: 3,
    ticketsKeepMin: 1,
    trainsEndThreshold: 2,
    turnTimeoutSec: 90,
    ...overrides,
  };
}

export interface NewPlayer {
  readonly id: string;
  readonly name: string;
}

type KeepTicketsCommand = Extract<GameCommand, { readonly type: "KEEP_TICKETS" }>;
type DrawCardCommand = Extract<GameCommand, { readonly type: "DRAW_CARD" }>;
type DrawTicketsCommand = Extract<GameCommand, { readonly type: "DRAW_TICKETS" }>;
type ClaimRouteCommand = Extract<GameCommand, { readonly type: "CLAIM_ROUTE" }>;

function currentPlayerId(state: GameState): string {
  return state.players[state.currentPlayer]!.id;
}

function currentPlayer(state: GameState): Player {
  return state.players[state.currentPlayer]!;
}

/* ---------- 牌库维护 ---------- */

/** 面朝下的牌库空了就把弃牌堆洗回去。 */
function refill(state: GameState, rng: Rng): void {
  if (state.deck.length === 0 && state.discard.length > 0) {
    state.deck = rng.shuffle(state.discard);
    state.discard = [];
  }
}

/** 从牌库补牌到明牌区（尽量补满 faceUpCount 张）。 */
function replenishFaceUp(state: GameState, rng: Rng): void {
  while (state.faceUp.length < state.config.faceUpCount) {
    refill(state, rng);
    if (state.deck.length === 0) break;
    state.faceUp.push(state.deck.pop()!);
  }
}

/** 明牌区火车头太多（≥ maxFaceUpLocomotives）时整组重发。 */
function normalizeFaceUp(state: GameState, rng: Rng): void {
  let guard = 0;
  while (
    state.faceUp.filter((card) => card === LOCOMOTIVE).length >= state.config.maxFaceUpLocomotives
    && guard < 8
  ) {
    guard += 1;
    state.discard.push(...state.faceUp);
    state.faceUp = [];
    replenishFaceUp(state, rng);
  }
}

/** 开局/整组重发时把明牌区发满并修正火车头数量。 */
function dealFaceUp(state: GameState, rng: Rng): void {
  state.faceUp = [];
  replenishFaceUp(state, rng);
  normalizeFaceUp(state, rng);
}

/* ---------- 图的连通与最长线路 ---------- */

function buildGraph(claimed: readonly ClaimedRoute[]): Map<string, Map<string, number>> {
  const graph = new Map<string, Map<string, number>>();
  const add = (a: string, b: string, w: number) => {
    let row = graph.get(a);
    if (!row) {
      row = new Map();
      graph.set(a, row);
    }
    row.set(b, Math.max(row.get(b) ?? 0, w));
  };
  for (const entry of claimed) {
    const route = ROUTES.find((candidate) => candidate.id === entry.routeId)!;
    add(route.a, route.b, route.length);
    add(route.b, route.a, route.length);
  }
  return graph;
}

function connected(graph: Map<string, Map<string, number>>, a: string, b: string): boolean {
  if (a === b) return true;
  const seen = new Set<string>([a]);
  const queue = [a];
  while (queue.length > 0) {
    const node = queue.shift()!;
    for (const next of graph.get(node)?.keys() ?? []) {
      if (next === b) return true;
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return false;
}

/** 某玩家铺设线路的最长连续路径（总长度）。 */
function longestPath(claimed: readonly ClaimedRoute[]): number {
  const graph = buildGraph(claimed);
  let best = 0;
  const visit = (node: string, visited: Set<string>, total: number) => {
    if (total > best) best = total;
    for (const [next, weight] of graph.get(node) ?? []) {
      if (visited.has(next)) continue;
      visited.add(next);
      visit(next, visited, total + weight);
      visited.delete(next);
    }
  };
  for (const start of graph.keys()) {
    const visited = new Set<string>([start]);
    visit(start, visited, 0);
  }
  return best;
}

/* ---------- 铺路与结算 ---------- */

function siblingRoute(route: RouteDef): RouteDef | undefined {
  if (!route.doubleGroup) return undefined;
  return ROUTES.find((candidate) => candidate.id !== route.id && candidate.doubleGroup === route.doubleGroup);
}

function claimError(state: GameState, player: Player, route: RouteDef, color: TrainColor): string | null {
  if (state.claimedRoutes.some((entry) => entry.routeId === route.id)) return "这条线路已经有人铺了。";
  if (state.players.length <= 3 && route.doubleGroup) {
    const sibling = siblingRoute(route);
    if (sibling && state.claimedRoutes.some((entry) => entry.routeId === sibling.id)) {
      return "2–3 人局里双线路只能用一边。";
    }
  }
  if (player.trainsLeft < route.length) return "火车不够铺这条线路。";
  if (route.color !== "gray" && color !== route.color) return "这条线路的颜色不对。";
  const colorCount = player.trainCards.filter((card) => card === color).length;
  const locos = player.trainCards.filter((card) => card === LOCOMOTIVE).length;
  if (colorCount + locos < route.length) return "车票不够铺这条线路。";
  return null;
}

/** 从玩家手里花掉 count 张指定颜色的车票，丢进弃牌堆。 */
function spend(state: GameState, player: Player, color: CardColor, count: number): void {
  let remaining = count;
  for (let i = player.trainCards.length - 1; i >= 0 && remaining > 0; i -= 1) {
    if (player.trainCards[i] === color) {
      const [card] = player.trainCards.splice(i, 1);
      state.discard.push(card!);
      remaining -= 1;
    }
  }
}

function endTurn(state: GameState, events: GameEvent[]): void {
  const player = currentPlayer(state);
  if (!state.finalRound && player.trainsLeft <= state.config.trainsEndThreshold) {
    state.finalRound = true;
    state.finalTurnsRemaining = state.players.length - 1;
    events.push({ type: "LastRoundStarted", player: player.id });
    state.currentPlayer = (state.currentPlayer + 1) % state.players.length;
    state.turn += 1;
    return;
  }
  if (state.finalRound) {
    state.finalTurnsRemaining -= 1;
    if (state.finalTurnsRemaining <= 0) {
      finishGame(state, events);
      return;
    }
  }
  state.currentPlayer = (state.currentPlayer + 1) % state.players.length;
  state.turn += 1;
}

/** 一张目的地票是否完成：玩家铺的线路把两端连起来了。 */
function ticketCompleted(claimed: readonly ClaimedRoute[], ticket: { a: string; b: string }): boolean {
  const graph = buildGraph(claimed);
  return connected(graph, ticket.a, ticket.b);
}

function finishGame(state: GameState, events: GameEvent[]): void {
  const perPlayer: Record<string, ClaimedRoute[]> = {};
  for (const player of state.players) perPlayer[player.id] = [];
  for (const entry of state.claimedRoutes) perPlayer[entry.playerId]?.push(entry);

  const longestByPlayer = new Map<string, number>();
  let longest = 0;
  for (const player of state.players) {
    const length = longestPath(perPlayer[player.id]!);
    longestByPlayer.set(player.id, length);
    if (length > longest) longest = length;
  }

  const scores: FinalScore[] = state.players.map((player) => {
    const claimed = perPlayer[player.id]!;
    const routePoints = claimed.reduce((sum, entry) => sum + entry.points, 0);
    const tickets = player.tickets
      .map((id) => TICKETS.find((ticket) => ticket.id === id)!)
      .filter(Boolean);
    const completed = tickets.filter((ticket) => ticketCompleted(claimed, ticket));
    const completedPoints = completed.reduce((sum, ticket) => sum + ticket.points, 0);
    const incompletePoints = tickets
      .filter((ticket) => !ticketCompleted(claimed, ticket))
      .reduce((sum, ticket) => sum + ticket.points, 0);
    const ticketPoints = completedPoints - incompletePoints;
    const path = longestByPlayer.get(player.id)!;
    const longestBonus = path > 0 && path === longest ? LONGEST_PATH_BONUS : 0;
    const score = routePoints + ticketPoints + longestBonus;
    player.score = score;
    return {
      player: player.id,
      score,
      routePoints,
      ticketPoints,
      completedTickets: completed.length,
      longestPath: path,
      longestBonus,
    };
  });

  const maxScore = Math.max(...scores.map((entry) => entry.score));
  const result: FinalResult = {
    scores,
    winners: scores.filter((entry) => entry.score === maxScore).map((entry) => entry.player),
    longestPath: longest,
  };
  state.phase = "finished";
  state.finalResult = result;
  events.push({ type: "GameEnded", result });
}

/* ---------- 各行动 ---------- */

function applyKeepTickets(state: GameState, playerId: string, command: KeepTicketsCommand, events: GameEvent[]): void {
  let drawn: string[];
  let minKeep: number;
  let isSetup: boolean;
  const player = state.players.find((candidate) => candidate.id === playerId)!;
  if (state.phase === "tickets") {
    if (player.pendingTickets.length === 0) throw new Error("你已经选好了，等其他玩家选完。");
    drawn = player.pendingTickets;
    minKeep = state.config.startTicketsKeepMin;
    isSetup = true;
  } else if (state.phase === "playing" && state.pending?.type === "ticketChoice") {
    drawn = state.pending.drawn;
    minKeep = state.config.ticketsKeepMin;
    isSetup = false;
  } else {
    throw new Error("现在没有待选的目的地票。");
  }

  if (!Array.isArray(command.keep)) throw new Error("至少要保留一张目的地票。");
  const kept = [...new Set(command.keep)].sort((a, b) => a - b);
  if (kept.length < minKeep) throw new Error(`至少要保留 ${minKeep} 张目的地票。`);
  if (kept.some((index) => index < 0 || index >= drawn.length)) throw new Error("保留选择无效。");

  const keptSet = new Set(kept);
  const discarded = drawn.filter((_, index) => !keptSet.has(index));
  for (const index of kept) player.tickets.push(drawn[index]!);
  // 退回的票放到票堆底部（抽票从开头拿）
  state.ticketDeck.push(...discarded);
  events.push({ type: "TicketsKept", player: playerId, kept: kept.length, discarded: discarded.length });

  if (isSetup) {
    player.pendingTickets = [];
    if (state.players.every((candidate) => candidate.pendingTickets.length === 0)) {
      state.phase = "playing";
      state.currentPlayer = state.startPlayer;
      state.turn = 1;
      events.push({ type: "GameStarted", startPlayer: state.players[state.startPlayer]!.id });
    }
  } else {
    delete state.pending;
    endTurn(state, events);
  }
}

function applyDrawCard(
  state: GameState,
  playerId: string,
  command: DrawCardCommand,
  rng: Rng,
  events: GameEvent[],
): void {
  if (state.phase !== "playing") throw new Error("现在不是出牌阶段。");
  if (state.pending && state.pending.type !== "secondDraw") throw new Error("请先完成当前的选择。");

  const player = currentPlayer(state);
  let color: CardColor;
  let source: "deck" | "faceUp";
  if (command.source.kind === "deck") {
    refill(state, rng);
    if (state.deck.length === 0) throw new Error("牌库已经空了。");
    color = state.deck.pop()!;
    source = "deck";
  } else {
    const index = command.source.index;
    if (index < 0 || index >= state.faceUp.length) throw new Error("没有这张明牌。");
    if (state.pending && state.faceUp[index] === LOCOMOTIVE) throw new Error("第二张不能拿明牌里的火车头。");
    color = state.faceUp[index]!;
    state.faceUp.splice(index, 1);
    replenishFaceUp(state, rng);
    normalizeFaceUp(state, rng);
    source = "faceUp";
  }
  player.trainCards.push(color);
  events.push({ type: "CardDrawn", player: playerId, source, color });

  const tookFaceUpLoco = source === "faceUp" && color === LOCOMOTIVE;
  if (!state.pending) {
    if (tookFaceUpLoco) endTurn(state, events);
    else state.pending = { type: "secondDraw" };
  } else {
    delete state.pending;
    endTurn(state, events);
  }
}

function applyDrawTickets(state: GameState, playerId: string, command: DrawTicketsCommand, events: GameEvent[]): void {
  void command;
  if (state.phase !== "playing") throw new Error("现在不是出牌阶段。");
  if (state.pending) throw new Error("请先完成当前的选择。");
  const count = Math.min(state.config.drawTicketsPerAction, state.ticketDeck.length);
  if (count === 0) throw new Error("票堆已经空了，不能再抽目的地票。");
  const drawn = state.ticketDeck.splice(0, count);
  state.pending = { type: "ticketChoice", drawn };
  events.push({ type: "TicketsTaken", player: playerId, count });
}

function applyClaimRoute(state: GameState, playerId: string, command: ClaimRouteCommand, events: GameEvent[]): void {
  if (state.phase !== "playing") throw new Error("现在不是出牌阶段。");
  if (state.pending) throw new Error("请先完成当前的选择。");
  const player = currentPlayer(state);
  const route = ROUTES.find((candidate) => candidate.id === command.routeId);
  if (!route) throw new Error("找不到这条线路。");
  const error = claimError(state, player, route, command.color);
  if (error) throw new Error(error);

  const need = route.length;
  const colorCount = player.trainCards.filter((card) => card === command.color).length;
  const useColor = Math.min(need, colorCount);
  const useLoco = need - useColor;
  spend(state, player, command.color, useColor);
  spend(state, player, LOCOMOTIVE, useLoco);

  const points = ROUTE_SCORES[route.length]!;
  player.score += points;
  player.trainsLeft -= route.length;
  state.claimedRoutes.push({
    routeId: route.id,
    playerId,
    color: command.color,
    trainCount: route.length,
    points,
  });
  events.push({ type: "RouteClaimed", player: playerId, routeId: route.id, color: command.color, points, trainsLeft: player.trainsLeft });
  endTurn(state, events);
}

/* ---------- 主入口 ---------- */

/** 规则引擎主入口：校验并执行一个行动，返回新状态和事件。不修改传入的 state。 */
export function apply(state: GameState, playerId: string, command: GameCommand, rng: Rng): { state: GameState; events: GameEvent[] } {
  if (state.phase === "finished") throw new Error("对局已经结束。");
  if (state.phase === "tickets") {
    // 开局选票所有人同时进行，不分先后
    if (command.type !== "KEEP_TICKETS") throw new Error("请先完成开局选票。");
    if (!state.players.some((player) => player.id === playerId)) throw new Error("你不在这局对局里。");
  } else if (currentPlayerId(state) !== playerId) {
    throw new Error("还没轮到你。");
  }

  const next = structuredClone(state);
  const events: GameEvent[] = [];
  switch (command.type) {
    case "KEEP_TICKETS":
      applyKeepTickets(next, playerId, command, events);
      break;
    case "DRAW_CARD":
      applyDrawCard(next, playerId, command, rng, events);
      break;
    case "DRAW_TICKETS":
      applyDrawTickets(next, playerId, command, events);
      break;
    case "CLAIM_ROUTE":
      applyClaimRoute(next, playerId, command, events);
      break;
    default:
      throw new Error("未知的行动。");
  }
  next.version += 1;
  next.events = events;
  return { state: next, events };
}

/** 服务端用：用对局里保存的随机数状态执行行动，并记进动作序列。 */
export function applyCommand(state: GameState, playerId: string, command: GameCommand): GameState {
  return runCommand(state, playerId, command).state;
}

function runCommand(state: GameState, playerId: string, command: GameCommand): { state: GameState; events: GameEvent[] } {
  const rng = createRng(state.rngState ?? state.seed ?? 0);
  const { state: next, events } = apply(state, playerId, command, rng);
  next.rngState = rng.state;
  next.log = [...(state.log ?? []), { player: playerId, command }];
  return { state: next, events };
}

/** 没有任何可做的行动（牌和票都抽光、也铺不了路）时，超时直接结束这个回合。 */
function passTurn(state: GameState, playerId: string): { state: GameState; events: GameEvent[] } {
  const next = structuredClone(state);
  const events: GameEvent[] = [];
  delete next.pending;
  endTurn(next, events);
  next.version += 1;
  next.events = events;
  next.log = [...(state.log ?? []), { player: playerId, command: { type: "TIMEOUT" } }];
  return { state: next, events };
}

/** 当前玩家所有合法行动的种子（用于前端高亮与超时自动行动）。 */
export function legalActions(state: GameState, playerId: string): GameCommand[] {
  if (state.phase === "finished") return [];
  if (state.phase === "tickets") {
    const chooser = state.players.find((candidate) => candidate.id === playerId);
    return chooser && chooser.pendingTickets.length > 0
      ? [{ type: "KEEP_TICKETS", keep: chooser.pendingTickets.map((_, index) => index) }]
      : [];
  }
  if (currentPlayerId(state) !== playerId) return [];
  const player = currentPlayer(state);

  if (state.pending?.type === "ticketChoice") {
    return [{ type: "KEEP_TICKETS", keep: state.pending.drawn.map((_, index) => index) }];
  }
  if (state.pending?.type === "secondDraw") {
    const source = drawSource(state);
    return source ? [{ type: "DRAW_CARD", source }] : [];
  }

  const actions: GameCommand[] = [];
  const source = drawSource(state);
  if (source) actions.push({ type: "DRAW_CARD", source });
  if (state.ticketDeck.length > 0) actions.push({ type: "DRAW_TICKETS" });
  for (const route of ROUTES) {
    if (state.claimedRoutes.some((entry) => entry.routeId === route.id)) continue;
    if (player.trainsLeft < route.length) continue;
    if (state.players.length <= 3 && route.doubleGroup) {
      const sibling = siblingRoute(route);
      if (sibling && state.claimedRoutes.some((entry) => entry.routeId === sibling.id)) continue;
    }
    const colors = route.color === "gray" ? TRAIN_COLORS : [route.color as TrainColor];
    for (const color of colors) {
      const colorCount = player.trainCards.filter((card) => card === color).length;
      const locos = player.trainCards.filter((card) => card === LOCOMOTIVE).length;
      if (colorCount + locos >= route.length) actions.push({ type: "CLAIM_ROUTE", routeId: route.id, color });
    }
  }
  return actions;
}

function drawSource(state: GameState): DrawSource | null {
  if (state.deck.length > 0 || state.discard.length > 0) return { kind: "deck" };
  const index = state.faceUp.findIndex((card) => !(state.pending && card === LOCOMOTIVE));
  return index >= 0 ? { kind: "faceUp", index } : null;
}

/** 超时/断线时自动替当前玩家选一个合法动作：优先抽牌，其次抽目的地票，最后铺一条能铺的线路。 */
function autoAction(state: GameState, playerId: string): GameCommand | null {
  // 抽牌 / 抽票优先，铺路最后（铺路要消耗资源，不替玩家做主）。
  return legalActions(state, playerId)[0] ?? null;
}

/** 回合超时（含断线玩家）：把当前玩家这一整个回合自动走完。 */
export function timeoutTurn(state: GameState): GameState {
  if (state.phase === "finished") return state;
  if (state.phase === "tickets") {
    // 开局选票超时：还没选的人全部保留
    let current = state;
    const timedOut: GameEvent[] = [];
    const allEvents: GameEvent[] = [];
    for (const player of state.players) {
      const command = autoAction(current, player.id);
      if (!command) continue;
      const { state: next, events } = runCommand(current, player.id, command);
      timedOut.push({ type: "TurnTimedOut", player: player.id });
      allEvents.push(...events);
      current = next;
    }
    current.events = [...timedOut, ...allEvents];
    return current;
  }
  const timedOutId = currentPlayerId(state);
  let current = state;
  const allEvents: GameEvent[] = [];
  for (let i = 0; i < 8; i += 1) {
    if (current.phase === "finished" || currentPlayerId(current) !== timedOutId) break;
    const beforePhase = current.phase;
    const command = autoAction(current, timedOutId);
    const { state: next, events } = command ? runCommand(current, timedOutId, command) : passTurn(current, timedOutId);
    allEvents.push(...events);
    current = next;
    // 跨阶段（选票→出牌 / 出牌→结束）后不再替同一玩家继续自动行动。
    if (beforePhase !== next.phase) break;
  }
  current.events = [{ type: "TurnTimedOut", player: timedOutId }, ...allEvents];
  return current;
}

/**
 * 发给客户端的视角：目的地票、手牌、牌库顺序、随机数状态都是私密的。
 * 保留：明牌区、已铺设线路、各自能看到的自己的手牌/目的地票、别人能看到的手牌数。
 */
export function redactGameForViewer(state: GameState, viewerId: string): GameState {
  const isCurrent = currentPlayerId(state) === viewerId;
  const finished = state.phase === "finished";
  const players = state.players.map((player) => {
    const mine = player.id === viewerId;
    return {
      ...player,
      handCount: player.trainCards.length,
      ticketCount: player.tickets.length,
      trainCards: mine ? player.trainCards : [],
      // 目的地票终局才公开
      tickets: mine || finished ? player.tickets : [],
      pendingTickets: mine ? player.pendingTickets : [],
    };
  });
  // 别人从牌库摸到什么颜色不告诉你
  const events = state.events.map((event) => (
    event.type === "CardDrawn" && event.source === "deck" && event.player !== viewerId
      ? { type: event.type, player: event.player, source: event.source }
      : event
  ));

  const {
    deck, discard, ticketDeck, ticketDiscard,
    seed: _seed, rngState: _rngState, log: _log,
    ...rest
  } = state;

  return {
    ...rest,
    players,
    events,
    deck: [],
    discard: [],
    ticketDeck: [],
    ticketDiscard: [],
    remainingCards: deck.length + discard.length,
    remainingTickets: ticketDeck.length,
    ...(rest.pending?.type === "ticketChoice"
      ? { pending: { type: "ticketChoice", drawn: isCurrent ? rest.pending.drawn : [] } }
      : {}),
  };
}

/**
 * 开局：洗车票牌库、发 4 张手牌、翻开 5 张明牌、洗目的地票并给每人发 3 张待选，
 * 随机定先手。发完进入「选票」阶段，选完才进入出牌阶段。
 */
export function createGame(
  players: readonly NewPlayer[],
  seed = Math.floor(Math.random() * 2 ** 32),
  overrides: Partial<Config> = {},
): GameState {
  const config = defaultConfig(players.length, overrides);
  if (players.length < config.minPlayers || players.length > config.maxPlayers) {
    throw new Error(`需要 ${config.minPlayers}–${config.maxPlayers} 位玩家才能开始。`);
  }
  const rng = createRng(seed);

  const deck = rng.shuffle(
    Object.entries(CARD_COUNTS).flatMap(([color, count]) =>
      new Array<CardColor>(count).fill(color as CardColor),
    ),
  );

  const playerStates: Player[] = players.map((player) => ({
    id: player.id,
    name: player.name,
    score: 0,
    trainCards: deck.splice(0, config.startHandSize),
    tickets: [],
    pendingTickets: [],
    trainsLeft: config.trainsPerPlayer,
  }));

  const ticketDeck = rng.shuffle(TICKETS.map((ticket) => ticket.id));
  for (const player of playerStates) {
    player.pendingTickets = ticketDeck.splice(0, config.startTicketsDrawn);
  }

  const startPlayer = rng.int(players.length);
  const state: GameState = {
    config,
    phase: "tickets",
    players: playerStates,
    currentPlayer: startPlayer,
    turn: 0,
    startPlayer,
    claimedRoutes: [],
    deck,
    faceUp: [],
    discard: [],
    ticketDeck,
    ticketDiscard: [],
    finalRound: false,
    finalTurnsRemaining: 0,
    events: [],
    version: 0,
  };
  dealFaceUp(state, rng);
  state.rngState = rng.state;
  return state;
}
