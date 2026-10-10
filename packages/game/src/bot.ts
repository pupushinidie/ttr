/**
 * 人机（「普通」难度）：像一个认真玩、会算账的普通玩家。
 *
 * 输入必须是 redactGameForViewer(game, 自己) 之后的视角：看得到自己的手牌和目的地票、明牌、
 * 地图上谁铺了哪条线、别人的手牌数 / 火车数，看不到别人的牌和票、牌库顺序。
 *
 * 思路：
 * - 规划：把手上没完成的目的地票的两端，用最少的火车连成一张网（自己铺过的线路不花火车，
 *   别人占了的线路走不通）。按几种顺序各连一遍取最省的，火车不够就放弃分值最低的票。
 * - 选票：估计「还剩几回合」（看对手剩的火车）和「连完要几回合」，算每种保留方案的期望分。
 * - 行动：规划里有线路能铺就铺（最怕被抢的、最长的先铺）；铺不起就抽规划缺的颜色
 *   （明牌有就拿明牌，没有就拿明牌火车头或摸牌库）；票都完成了、时间还够就再抽目的地票，
 *   时间不够就攒牌铺长线路拿路段分。最后一轮只挑分最多的那一步。
 */
import { legalActions } from "./engine.js";
import {
  CITIES,
  LOCOMOTIVE,
  ROUTES,
  ROUTE_SCORES,
  TICKETS,
  TRAIN_COLORS,
  TRAIN_COLOR_NAMES,
  type CardColor,
  type RouteDef,
  type TicketDef,
  type TrainColor,
} from "./map.js";
import type { GameCommand, GameState, Player } from "./types.js";

export interface BotAdvice {
  readonly command: GameCommand;
  /** 给玩家看的一句理由（教程的「提示」按钮用）。 */
  readonly reason: string;
}

const ROUTE_BY_ID = new Map(ROUTES.map((route) => [route.id, route]));
const TICKET_BY_ID = new Map(TICKETS.map((ticket) => [ticket.id, ticket]));
const CITY_NAME = new Map(CITIES.map((city) => [city.id, city.nameZh]));
const SIBLING = new Map<string, string>();
for (const route of ROUTES) {
  if (!route.doubleGroup) continue;
  const other = ROUTES.find((candidate) => candidate.id !== route.id && candidate.doubleGroup === route.doubleGroup);
  if (other) SIBLING.set(route.id, other.id);
}
/** 规划时每条线路的代价 = 火车数 + K_ROUTE（多铺一条就多花一回合）− K_POINTS × 路段分（长线路更划算）。 */
const K_POINTS = 0.15;
const K_ROUTE = 1;
/** 估计剩余回合：对手平均每回合放下几节火车。 */
const TURN_RATE = 1.6;
/** 估计凑牌速度：每回合平均摸到几张有用的牌。 */
const DRAW_EFF = 1.3;
/** 「来得及」的概率曲线有多平（回合富余 / 这个数 进 logistic）。 */
const SLACK_SCALE = 3.5;
/** 票都连通后，估计还剩至少这么多回合才再抽目的地票。 */
const DRAW_MIN_AVAIL = 13;
/** 规划里每节火车顺带的路段分（让选票时略偏向多铺）。 */
const TRAIN_BONUS = 0.15;
const ADJ = new Map<string, RouteDef[]>();
for (const route of ROUTES) {
  for (const city of [route.a, route.b]) {
    const list = ADJ.get(city) ?? [];
    list.push(route);
    ADJ.set(city, list);
  }
}

export function routeLabel(route: RouteDef): string {
  return `${CITY_NAME.get(route.a) ?? route.a}—${CITY_NAME.get(route.b) ?? route.b}`;
}

function ticketLabel(ticket: TicketDef): string {
  return `${CITY_NAME.get(ticket.a) ?? ticket.a}—${CITY_NAME.get(ticket.b) ?? ticket.b}`;
}

function colorName(color: CardColor): string {
  return color === LOCOMOTIVE ? "火车头" : TRAIN_COLOR_NAMES[color];
}

type Status = "mine" | "open" | "blocked";

interface Ctx {
  readonly state: GameState;
  readonly me: Player;
  readonly status: Map<string, Status>;
  readonly hand: Record<CardColor, number>;
  /** 自己铺的线路连成的城市网（连通判断用）。 */
  readonly mineAdj: Map<string, string[]>;
}

function countHand(cards: readonly CardColor[]): Record<CardColor, number> {
  const hand = { locomotive: 0 } as Record<CardColor, number>;
  for (const color of TRAIN_COLORS) hand[color] = 0;
  for (const card of cards) hand[card] += 1;
  return hand;
}

function makeCtx(state: GameState, me: Player): Ctx {
  const owner = new Map(state.claimedRoutes.map((entry) => [entry.routeId, entry.playerId]));
  const small = state.players.length <= 3;
  const status = new Map<string, Status>();
  const mineAdj = new Map<string, string[]>();
  for (const route of ROUTES) {
    const who = owner.get(route.id);
    if (who !== undefined) {
      status.set(route.id, who === me.id ? "mine" : "blocked");
      if (who === me.id) {
        mineAdj.set(route.a, [...(mineAdj.get(route.a) ?? []), route.b]);
        mineAdj.set(route.b, [...(mineAdj.get(route.b) ?? []), route.a]);
      }
      continue;
    }
    const sibling = SIBLING.get(route.id);
    if (small && sibling && owner.has(sibling)) {
      status.set(route.id, "blocked");
      continue;
    }
    status.set(route.id, "open");
  }
  return { state, me, status, hand: countHand(me.trainCards), mineAdj };
}

function connectedMine(ctx: Ctx, a: string, b: string): boolean {
  if (a === b) return true;
  const seen = new Set([a]);
  const queue = [a];
  while (queue.length > 0) {
    const node = queue.pop()!;
    for (const next of ctx.mineAdj.get(node) ?? []) {
      if (next === b) return true;
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return false;
}

/** 用手牌铺这条线路还差几张（灰线路按最多的那种颜色算）。 */
function shortfall(ctx: Ctx, route: RouteDef): number {
  const locos = ctx.hand.locomotive;
  if (route.color !== "gray") return Math.max(0, route.length - ctx.hand[route.color] - locos);
  let best = 0;
  for (const color of TRAIN_COLORS) best = Math.max(best, ctx.hand[color]);
  return Math.max(0, route.length - best - locos);
}

/** 两座城之间最省火车的走法：自己的线路和规划里已有的不花火车，别人占了的走不通。 */
function shortestPath(ctx: Ctx, from: string, to: string, plan: Set<string>, banned?: string): RouteDef[] | null {
  const dist = new Map<string, number>([[from, 0]]);
  const via = new Map<string, RouteDef>();
  const done = new Set<string>();
  for (;;) {
    let node: string | undefined;
    let best = Infinity;
    for (const [city, d] of dist) {
      if (!done.has(city) && d < best) {
        best = d;
        node = city;
      }
    }
    if (node === undefined) return null;
    if (node === to) break;
    done.add(node);
    for (const route of ADJ.get(node) ?? []) {
      if (route.id === banned) continue;
      const status = ctx.status.get(route.id)!;
      if (status === "blocked") continue;
      const cost = status === "mine" || plan.has(route.id) ? 0 : route.length + K_ROUTE - K_POINTS * ROUTE_SCORES[route.length]! + 0.001 * shortfall(ctx, route);
      const next = route.a === node ? route.b : route.a;
      const d = best + cost;
      if (d < (dist.get(next) ?? Infinity)) {
        dist.set(next, d);
        via.set(next, route);
      }
    }
  }
  const path: RouteDef[] = [];
  let city = to;
  while (city !== from) {
    const route = via.get(city)!;
    path.push(route);
    city = route.a === city ? route.b : route.a;
  }
  return path;
}

interface Plan {
  /** 还要铺的线路。 */
  readonly routes: RouteDef[];
  readonly trains: number;
  /** 已经连通的票。 */
  readonly done: TicketDef[];
  /** 规划里能连通的票。 */
  readonly feasible: TicketDef[];
  /** 连不通（被堵死或火车不够）的票。 */
  readonly lost: TicketDef[];
}

function planOnce(ctx: Ctx, order: readonly TicketDef[], banned?: string): { set: Set<string>; feasible: TicketDef[]; lost: TicketDef[] } {
  const set = new Set<string>();
  const feasible: TicketDef[] = [];
  const lost: TicketDef[] = [];
  for (const ticket of order) {
    const path = shortestPath(ctx, ticket.a, ticket.b, set, banned);
    if (!path) {
      lost.push(ticket);
      continue;
    }
    feasible.push(ticket);
    for (const route of path) if (ctx.status.get(route.id) === "open") set.add(route.id);
  }
  return { set, feasible, lost };
}

function trainsOf(set: Set<string>): number {
  let total = 0;
  for (const id of set) total += ROUTE_BY_ID.get(id)!.length;
  return total;
}

/** 把这些目的地票连起来的规划（火车不够时放弃分值最低的票）。 */
function planTickets(ctx: Ctx, tickets: readonly TicketDef[], banned?: string): Plan {
  const done = tickets.filter((ticket) => connectedMine(ctx, ticket.a, ticket.b));
  let todo = tickets.filter((ticket) => !done.includes(ticket));
  const dropped: TicketDef[] = [];
  for (;;) {
    const orders = [
      [...todo].sort((x, y) => y.points - x.points),
      [...todo].sort((x, y) => x.points - y.points),
      todo,
    ];
    let best: { set: Set<string>; feasible: TicketDef[]; lost: TicketDef[]; trains: number } | null = null;
    for (const order of orders) {
      const result = planOnce(ctx, order, banned);
      const trains = trainsOf(result.set);
      const points = result.feasible.reduce((sum, ticket) => sum + ticket.points, 0);
      const bestPoints = best ? best.feasible.reduce((sum, ticket) => sum + ticket.points, 0) : -1;
      if (!best || points > bestPoints || (points === bestPoints && trains < best.trains)) best = { ...result, trains };
    }
    if (best!.trains <= ctx.me.trainsLeft || best!.feasible.length === 0) {
      const routes = [...best!.set].map((id) => ROUTE_BY_ID.get(id)!);
      return { routes, trains: best!.trains, done, feasible: best!.feasible, lost: [...best!.lost, ...dropped] };
    }
    // 火车不够：放弃规划里分值最低的那张
    const cheapest = [...best!.feasible].sort((x, y) => x.points - y.points)[0]!;
    dropped.push(cheapest);
    todo = todo.filter((ticket) => ticket !== cheapest);
  }
}

/** 规划里每种颜色要几张；灰线路分给手上富余最多的颜色。 */
function colorNeeds(ctx: Ctx, routes: readonly RouteDef[]): { need: Record<TrainColor, number>; gray: Map<string, TrainColor> } {
  const need = {} as Record<TrainColor, number>;
  for (const color of TRAIN_COLORS) need[color] = 0;
  for (const route of routes) if (route.color !== "gray") need[route.color] += route.length;
  const gray = new Map<string, TrainColor>();
  for (const route of [...routes].filter((candidate) => candidate.color === "gray").sort((x, y) => y.length - x.length)) {
    let pick: TrainColor = TRAIN_COLORS[0];
    let best = -Infinity;
    for (const color of TRAIN_COLORS) {
      const surplus = ctx.hand[color] - need[color];
      const score = surplus * 10 + ctx.hand[color];
      if (score > best) {
        best = score;
        pick = color;
      }
    }
    need[pick] += route.length;
    gray.set(route.id, pick);
  }
  return { need, gray };
}

function deficits(ctx: Ctx, need: Record<TrainColor, number>): Record<TrainColor, number> {
  const out = {} as Record<TrainColor, number>;
  for (const color of TRAIN_COLORS) out[color] = Math.max(0, need[color] - ctx.hand[color]);
  return out;
}

function totalDeficit(ctx: Ctx, need: Record<TrainColor, number>): number {
  const def = deficits(ctx, need);
  return Math.max(0, TRAIN_COLORS.reduce((sum, color) => sum + def[color], 0) - ctx.hand.locomotive);
}

/** 铺这条线路用什么颜色（null = 铺不起）。灰线路挑对规划里别的线路影响最小、少用火车头的颜色。 */
function claimColor(ctx: Ctx, route: RouteDef, otherNeed?: Record<TrainColor, number>): TrainColor | null {
  if (ctx.me.trainsLeft < route.length || ctx.status.get(route.id) !== "open") return null;
  const locos = ctx.hand.locomotive;
  const colors = route.color === "gray" ? TRAIN_COLORS : [route.color];
  let pick: TrainColor | null = null;
  let best = -Infinity;
  for (const color of colors) {
    const have = ctx.hand[color];
    if (have + locos < route.length) continue;
    const useLoco = Math.max(0, route.length - have);
    const useColor = route.length - useLoco;
    const hurt = otherNeed ? Math.max(0, Math.min(useColor, otherNeed[color] - (have - useColor) - 0)) : 0;
    const score = -useLoco * 3 - hurt * 2 + (have - useColor) * -0.1;
    if (score > best) {
      best = score;
      pick = color;
    }
  }
  return pick;
}

/** 还剩大约几回合（轮到自己的次数）：看对手里火车最少的那位。 */
function turnsAvailable(ctx: Ctx): number {
  if (ctx.state.finalRound) return 1;
  const others = ctx.state.players.filter((player) => player.id !== ctx.me.id);
  const minTrains = Math.min(ctx.me.trainsLeft, ...others.map((player) => player.trainsLeft));
  return Math.max(1, (minTrains - 2) / TURN_RATE + 1);
}

/** 连完这个规划大约要几回合。 */
function turnsNeeded(ctx: Ctx, plan: Plan): number {
  if (plan.routes.length === 0) return 0;
  const { need } = colorNeeds(ctx, plan.routes);
  return Math.ceil(totalDeficit(ctx, need) / DRAW_EFF) + plan.routes.length;
}

/** 一组目的地票的期望分：已连通的拿满分；要连的按「来得及的概率」算（来不及倒扣）。 */
function ticketsValue(ctx: Ctx, tickets: readonly TicketDef[]): number {
  const plan = planTickets(ctx, tickets);
  const slack = turnsAvailable(ctx) - turnsNeeded(ctx, plan);
  const p = 1 / (1 + Math.exp(-slack / SLACK_SCALE));
  const pending = plan.feasible.reduce((sum, ticket) => sum + ticket.points, 0);
  return plan.done.reduce((sum, ticket) => sum + ticket.points, 0)
    + pending * (2 * p - 1)
    - plan.lost.reduce((sum, ticket) => sum + ticket.points, 0)
    + plan.trains * TRAIN_BONUS;
}

function subsets(count: number, min: number): number[][] {
  const out: number[][] = [];
  for (let mask = 1; mask < 1 << count; mask += 1) {
    const keep: number[] = [];
    for (let i = 0; i < count; i += 1) if (mask & (1 << i)) keep.push(i);
    if (keep.length >= min) out.push(keep);
  }
  return out;
}

function chooseTickets(ctx: Ctx, drawn: readonly string[], min: number): BotAdvice {
  const current = ctx.me.tickets.map((id) => TICKET_BY_ID.get(id)!).filter(Boolean);
  const offered = drawn.map((id) => TICKET_BY_ID.get(id)!);
  let bestKeep: number[] = [];
  let bestValue = -Infinity;
  for (const keep of subsets(offered.length, Math.min(min, offered.length))) {
    const value = ticketsValue(ctx, [...current, ...keep.map((index) => offered[index]!)]);
    if (value > bestValue + 1e-9) {
      bestValue = value;
      bestKeep = keep;
    }
  }
  const kept = bestKeep.map((index) => offered[index]!);
  const names = kept.map(ticketLabel).join("、");
  const plan = planTickets(ctx, [...current, ...kept]);
  const freebies = kept.filter((ticket) => connectedMine(ctx, ticket.a, ticket.b));
  let reason: string;
  if (kept.length === offered.length) reason = `全部保留：这几张顺路，连起来大约要 ${plan.trains} 节火车，来得及。`;
  else if (freebies.length > 0) reason = `保留 ${names}：你已经铺通了，白拿分。`;
  else reason = `保留 ${names}：和其余的比最顺路，分值也划算；退回的那几张太远，连不完会倒扣分。`;
  return { command: { type: "KEEP_TICKETS", keep: bestKeep }, reason };
}

/** 这条线路一铺下去能连通哪些票。 */
function completesTickets(ctx: Ctx, route: RouteDef, pending: readonly TicketDef[]): TicketDef[] {
  const extra = new Map(ctx.mineAdj);
  extra.set(route.a, [...(extra.get(route.a) ?? []), route.b]);
  extra.set(route.b, [...(extra.get(route.b) ?? []), route.a]);
  const temp: Ctx = { ...ctx, mineAdj: extra };
  return pending.filter((ticket) => connectedMine(temp, ticket.a, ticket.b));
}

function claimAdvice(route: RouteDef, color: TrainColor, reason: string): BotAdvice {
  return { command: { type: "CLAIM_ROUTE", routeId: route.id, color }, reason };
}

/** 出牌阶段（不在半个动作中间）的一步。 */
function playTurn(ctx: Ctx): BotAdvice | null {
  const { state, me } = ctx;
  const tickets = me.tickets.map((id) => TICKET_BY_ID.get(id)!).filter(Boolean);
  const plan = planTickets(ctx, tickets);
  const pendingTickets = plan.feasible;
  const available = turnsAvailable(ctx);
  const lastTurn = state.finalRound;
  const endgame = lastTurn || available <= 4;

  // 最后一轮 / 快结束了：挑当下分最多的那条线路（连通目的地票按「不扣反加」算两倍）
  if (endgame) {
    let best: { route: RouteDef; color: TrainColor; value: number; done: TicketDef[] } | null = null;
    for (const route of ROUTES) {
      const color = claimColor(ctx, route);
      if (!color) continue;
      const done = completesTickets(ctx, route, pendingTickets);
      const inPlan = plan.routes.includes(route);
      const value = ROUTE_SCORES[route.length]! + done.reduce((sum, ticket) => sum + 2 * ticket.points, 0) + (inPlan && !lastTurn ? 3 : 0);
      if (!best || value > best.value) best = { route, color, value, done };
    }
    if (best && (lastTurn || best.done.length > 0 || plan.routes.includes(best.route) || best.route.length >= 3 || available <= 2)) {
      const why = best.done.length > 0
        ? `铺${routeLabel(best.route)}：连通目的地票 ${best.done.map(ticketLabel).join("、")}，从倒扣变成加分。`
        : `铺${routeLabel(best.route)}：快结束了，抓紧把火车换成分（+${ROUTE_SCORES[best.route.length]} 分）。`;
      return claimAdvice(best.route, best.color, why);
    }
  }

  // 规划里能铺的线路：最怕被抢的、最长的先铺
  const needs = colorNeeds(ctx, plan.routes);
  let bestClaim: { route: RouteDef; color: TrainColor; priority: number; done: TicketDef[] } | null = null;
  for (const route of plan.routes) {
    const otherNeed = { ...needs.need };
    const assigned = route.color === "gray" ? needs.gray.get(route.id)! : route.color;
    otherNeed[assigned] -= route.length;
    const color = claimColor(ctx, route, otherNeed);
    if (!color) continue;
    const alt = planTickets(ctx, tickets, route.id);
    const lostPoints = alt.lost.reduce((sum, ticket) => sum + ticket.points, 0) - plan.lost.reduce((sum, ticket) => sum + ticket.points, 0);
    const detour = Math.max(0, alt.trains - plan.trains);
    const done = completesTickets(ctx, route, pendingTickets);
    const priority = lostPoints * 2 + detour * 1.5 + route.length + done.length * 5;
    if (!bestClaim || priority > bestClaim.priority) bestClaim = { route, color, priority, done };
  }
  if (bestClaim) {
    const { route, color, done } = bestClaim;
    const why = done.length > 0
      ? `铺${routeLabel(route)}：这一段铺完就连通了 ${done.map(ticketLabel).join("、")}。`
      : `铺${routeLabel(route)}：它在你的目的地票路线上，牌够了就先占住，免得被别人抢走（+${ROUTE_SCORES[route.length]} 分）。`;
    return claimAdvice(route, color, why);
  }

  // 手牌攒多了：用规划用不上的牌铺一条长线路
  if (me.trainCards.length >= 10 && plan.routes.length > 0) {
    let best: { route: RouteDef; color: TrainColor } | null = null;
    for (const route of ROUTES) {
      if (route.length < 4 || route.length > me.trainsLeft - plan.trains) continue;
      const color = claimColor(ctx, route, needs.need);
      if (!color) continue;
      const useColor = Math.min(route.length, ctx.hand[color]);
      if (ctx.hand[color] - useColor < needs.need[color] && needs.need[color] > 0) continue;
      if (route.length > ctx.hand[color]) continue; // 不为这种线路花火车头
      if (!best || route.length > best.route.length) best = { route, color };
    }
    if (best) return claimAdvice(best.route, best.color, `铺${routeLabel(best.route)}：手牌攒多了，用目的地票用不上的颜色换 ${ROUTE_SCORES[best.route.length]} 分。`);
  }

  // 票都连通了（或连不通了）：时间够就再抽目的地票
  const noPlan = plan.routes.length === 0;
  if (noPlan && !endgame && me.trainsLeft >= 12 && available >= DRAW_MIN_AVAIL && (state.remainingTickets ?? 0) > 0) {
    return { command: { type: "DRAW_TICKETS" }, reason: `抽目的地票：手上的票都连通了，火车还剩 ${me.trainsLeft} 节，再接几张多拿分。` };
  }

  // 没有规划：攒牌铺长线路拿路段分（最好接在自己的线路上，争最长铁路）
  if (noPlan) {
    let target: { route: RouteDef; score: number } | null = null;
    const myCities = new Set(ctx.mineAdj.keys());
    for (const route of ROUTES) {
      if (ctx.status.get(route.id) !== "open" || route.length > me.trainsLeft) continue;
      const lack = shortfall(ctx, route);
      const touching = myCities.has(route.a) || myCities.has(route.b);
      const score = ROUTE_SCORES[route.length]! + (touching ? route.length * 0.6 : 0) - lack * 2.2;
      if (!target || score > target.score) target = { route, score };
    }
    if (target) {
      const color = claimColor(ctx, target.route);
      if (color && (target.route.length >= 4 || endgame || target.route.length >= me.trainsLeft - 2)) {
        return claimAdvice(target.route, color, `铺${routeLabel(target.route)}：目的地票都处理完了，铺长线路最划算（+${ROUTE_SCORES[target.route.length]} 分）。`);
      }
      return drawFor(ctx, [target.route], false);
    }
  }
  return drawFor(ctx, plan.routes, false);
}

/** 抽一张车票：明牌里有缺的颜色就拿明牌，否则拿明牌火车头（只在第一张）或摸牌库。 */
function drawFor(ctx: Ctx, routes: readonly RouteDef[], second: boolean): BotAdvice | null {
  const { state } = ctx;
  const { need } = colorNeeds(ctx, routes);
  const def = deficits(ctx, need);
  const total = totalDeficit(ctx, need);
  const deckLeft = (state.remainingCards ?? 0) > 0;
  let bestIndex = -1;
  let bestDef = 0;
  state.faceUp.forEach((card, index) => {
    if (card === LOCOMOTIVE) return;
    if (def[card] > bestDef) {
      bestDef = def[card];
      bestIndex = index;
    }
  });
  if (bestIndex >= 0 && total > 0) {
    const card = state.faceUp[bestIndex]!;
    return { command: { type: "DRAW_CARD", source: { kind: "faceUp", index: bestIndex } }, reason: `拿明牌里的${colorName(card)}色：你要铺的线路还差 ${def[card as TrainColor]} 张${colorName(card)}。` };
  }
  const locoIndex = state.faceUp.indexOf(LOCOMOTIVE);
  if (!second && locoIndex >= 0 && total >= 2) {
    return { command: { type: "DRAW_CARD", source: { kind: "faceUp", index: locoIndex } }, reason: "拿明牌火车头：明牌里没有你缺的颜色，火车头是万能牌，虽然这回合只能拿这 1 张也值。" };
  }
  if (deckLeft) {
    return { command: { type: "DRAW_CARD", source: { kind: "deck" } }, reason: total > 0 ? "从牌库摸一张：明牌里没有你缺的颜色，碰碰运气。" : "从牌库摸一张：先攒牌，后面铺长线路用。" };
  }
  // 牌库空了：明牌里随便拿一张能拿的
  const fallback = state.faceUp.findIndex((card) => !(second && card === LOCOMOTIVE));
  if (fallback >= 0) {
    return { command: { type: "DRAW_CARD", source: { kind: "faceUp", index: fallback } }, reason: "牌库空了，只能从明牌里拿。" };
  }
  return null;
}

/** 把视角里的剩余张数还原成「有牌」，好借用 legalActions 判断能做什么。 */
function viewLegal(view: GameState, playerId: string): GameCommand[] {
  const shim: GameState = {
    ...view,
    deck: new Array<CardColor>(view.remainingCards ?? 0).fill("red"),
    discard: [],
    ticketDeck: new Array<string>(view.remainingTickets ?? 0).fill("t0"),
  };
  return legalActions(shim, playerId);
}

/** 人机这一步做什么、为什么。view 必须是 redactGameForViewer(game, playerId)。没有能做的就返回 null。 */
export function botAdvice(view: GameState, playerId: string): BotAdvice | null {
  if (view.phase === "finished") return null;
  const me = view.players.find((player) => player.id === playerId);
  if (!me) return null;
  const ctx = makeCtx(view, me);
  if (view.phase === "tickets") {
    if (me.pendingTickets.length === 0) return null;
    return chooseTickets(ctx, me.pendingTickets, view.config.startTicketsKeepMin);
  }
  if (view.players[view.currentPlayer]!.id !== playerId) return null;
  const legal = viewLegal(view, playerId);
  if (legal.length === 0) return null;

  let advice: BotAdvice | null;
  if (view.pending?.type === "ticketChoice") {
    advice = chooseTickets(ctx, view.pending.drawn, view.config.ticketsKeepMin);
  } else if (view.pending?.type === "secondDraw") {
    const tickets = me.tickets.map((id) => TICKET_BY_ID.get(id)!).filter(Boolean);
    const plan = planTickets(ctx, tickets);
    advice = drawFor(ctx, plan.routes, true);
  } else {
    advice = playTurn(ctx);
  }
  if (advice && isLegal(advice.command, legal)) return advice;
  const first = legal[0]!;
  return { command: first, reason: "先做一个能做的动作。" };
}

function isLegal(command: GameCommand, legal: readonly GameCommand[]): boolean {
  switch (command.type) {
    case "KEEP_TICKETS":
      return legal.some((action) => action.type === "KEEP_TICKETS");
    case "DRAW_TICKETS":
      return legal.some((action) => action.type === "DRAW_TICKETS");
    case "DRAW_CARD":
      return legal.some((action) => action.type === "DRAW_CARD");
    case "CLAIM_ROUTE":
      return legal.some((action) => action.type === "CLAIM_ROUTE" && action.routeId === command.routeId && action.color === command.color);
  }
}

/** 人机的下一步。view 必须是 redactGameForViewer(game, playerId)。 */
export function botCommand(view: GameState, playerId: string): GameCommand | null {
  return botAdvice(view, playerId)?.command ?? null;
}
