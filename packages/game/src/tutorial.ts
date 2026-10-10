/**
 * 新手教程的剧本（车票之旅）。
 *
 * 教程在浏览器里直接跑规则引擎，不连服务器。开局是摆好的一局「已经打了几回合」的两人局：
 * 你铺了蒙特利尔—纽约、手里有一张蒙特利尔—亚特兰大的目的地票；咕噜一号在西边铺了两条线，火车只剩 5 节。
 * 牌库顶部和目的地票堆顶部都按剧本摆好（抽牌从牌库末尾拿、抽票从票堆开头拿），所以剧情一定这样发生：
 * 你抽牌、铺橙色线路、铺灰色线路、抽目的地票只留一张，咕噜一号火车剩 2 节触发最后一轮，
 * 你最后一回合用火车头铺完罗利—亚特兰大，两张票都连通、拿到最长铁路，赢下这局。
 * 剧本走完开一局新的练习局（从开局选票开始），对手交给人机。
 *
 * 每一步写三件事：咕噜嘎说什么（say / note）、高亮哪个元素（anchor，对应网页里的 data-tutorial="…"）、
 * 等玩家做什么（do 步骤的 expect）。铺路是「先点线路、再点『铺路』」，选目的地票是「先点掉不要的、再点『确定』」，
 * 所以 do 步骤可以带 then：界面上的选择（selection）变了，高亮就挪到下一个要点的地方。
 */
import { createGame, legalActions } from "./engine.js";
import { CARD_COUNTS, ROUTES, ROUTE_SCORES, TICKETS, type CardColor, type TrainColor } from "./map.js";
import type { ClaimedRoute, GameCommand, GameState } from "./types.js";

/** 咕噜嘎的表情。 */
export type TutorialFace = "base" | "happy" | "surprised" | "think";

interface StepBase {
  readonly id: string;
  /** 侧栏「新手教程」进度里这一课叫什么；没有就不单独列。 */
  readonly lesson?: string;
  /** 主句（24px），一句话说清这一步。 */
  readonly say: string;
  /** 补充说明（12px）。 */
  readonly note?: string;
  /** 触屏设备上换成这句说明。 */
  readonly noteTouch?: string;
  /**
   * 高亮哪个元素：网页里 data-tutorial 的值。
   * 固定的有 map、players、draw、deck、draw-tickets、my-hand、my-tickets、claim-confirm、ticket-confirm、last-round、hint；
   * 带参数的：route:<线路 id>、faceup:<下标>、ticket:<下标>（选票框里第几张）、final:<玩家>（结算框里那一行）。
   */
  readonly anchor?: string;
  readonly face?: TutorialFace;
}

/** 「先选再确定」的后续高亮：界面上的选择变成 selection 时，高亮换成 anchor。 */
export interface TutorialFollowUp {
  /** 网页 GameBoard 报出来的当前选择，例如 claim:r93、keep:0,2。 */
  readonly selection: string;
  readonly anchor: string;
}

export type TutorialStep =
  /** 讲解：玩家点「下一步」继续。finale 是最后一步（接练习局或结束）。 */
  | (StepBase & { readonly kind: "info"; readonly finale?: boolean })
  /** 等玩家做这一步；做别的会被拦下。 */
  | (StepBase & { readonly kind: "do"; readonly expect: GameCommand; readonly then?: readonly TutorialFollowUp[] })
  /** 对手按剧本自动走这几步，牌桌不压暗。 */
  | (StepBase & { readonly kind: "watch"; readonly moves: readonly GameCommand[] });

export const TUTORIAL_SELF = "p1";
export const TUTORIAL_RIVALS = [{ id: "p2", name: "咕噜一号" }] as const;
const RIVAL = TUTORIAL_RIVALS[0].id;

/** 这一步之前不弹结算框（剧本里先讲完最后一回合，再看结算框）。 */
export const TUTORIAL_FINAL_STEP = "final-score";

const faceUp = (index: number): GameCommand => ({ type: "DRAW_CARD", source: { kind: "faceUp", index } });
const deck: GameCommand = { type: "DRAW_CARD", source: { kind: "deck" } };
const claim = (routeId: string, color: TrainColor): GameCommand => ({ type: "CLAIM_ROUTE", routeId, color });

export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  {
    kind: "info", id: "goal", lesson: "目标", anchor: "map",
    say: "在地图上铺火车连接城市，分最高的人赢。",
    note: "这局已经打了几回合，为了快点讲完，每人只剩几节火车。咕噜嘎带你打完它。",
  },
  {
    kind: "info", id: "ticket", lesson: "目的地票", anchor: "my-tickets",
    say: "这是你的目的地票：连通两座城市，终局加分。",
    note: "蒙特利尔—亚特兰大连通了 +9，没连通倒扣 9。票的内容只有你自己看得到，终局才公开。",
  },
  {
    kind: "info", id: "plan", anchor: "route:r97",
    say: "你已经铺了蒙特利尔—纽约，接着往南铺。",
    note: "要经过华盛顿、罗利到亚特兰大。鼠标停在目的地票上，地图会标出两座城市。",
    noteTouch: "要经过华盛顿、罗利到亚特兰大。地图可以左右滑动。",
  },
  {
    kind: "info", id: "turn", lesson: "每回合三选一", anchor: "draw",
    say: "每回合三选一：抽车票、铺线路、抽目的地票。",
    note: "车票就是火车卡：8 种颜色，加上万能的火车头。抽车票一回合抽 2 张。",
  },
  {
    kind: "do", id: "take-faceup", lesson: "抽车票", anchor: "faceup:0",
    expect: faceUp(0),
    say: "点明牌里的蓝色车票，拿到手里。",
    note: "5 张明牌大家都看得到，拿走一张马上补一张。你手里已经有 1 张蓝。",
  },
  {
    kind: "info", id: "loco-locked", anchor: "faceup:0", face: "think",
    say: "第二张不能拿明牌里的火车头。",
    note: "第一张就拿明牌火车头的话，这回合只能拿这 1 张。牌库里摸到的火车头不受限制。",
  },
  {
    kind: "do", id: "draw-deck", anchor: "deck",
    expect: deck,
    say: "第二张从牌库摸：看不到是什么，碰碰运气。",
    note: "摸到了 1 张白色。",
  },
  {
    kind: "watch", id: "rival-draw",
    say: "轮到咕噜一号，它从牌库摸了 2 张。",
    note: "别人从牌库摸到什么颜色你看不到，你摸的别人也看不到。",
    moves: [deck, deck],
  },
  {
    kind: "do", id: "claim-orange", lesson: "铺线路", anchor: "route:r93",
    expect: claim("r93", "orange"),
    then: [{ selection: "claim:r93", anchor: "claim-confirm" }],
    say: "点纽约—华盛顿的橙色线路，再点「铺路」。",
    note: "交出和线路一样长、一样颜色的车票：2 节就交 2 张橙色。",
  },
  {
    kind: "info", id: "route-score", lesson: "路段分", anchor: "players", face: "happy",
    say: "铺下 2 节得 2 分，线路越长越划算。",
    note: "1 到 6 节分别得 1、2、4、7、10、15 分，铺下就加到分数里。",
  },
  {
    kind: "info", id: "double", lesson: "双线路", anchor: "route:r94", face: "think",
    say: "旁边的黑色是双线路的另一边，现在不能铺了。",
    note: "2–3 人局双线路只能用一边；4–5 人局两边可以各由一人铺。",
  },
  {
    kind: "watch", id: "rival-claim",
    say: "咕噜一号铺了俄克拉何马城—达拉斯。",
    note: "它的火车从 5 节变成 3 节，火车用完游戏就快结束了。",
    moves: [claim("r45", "green")],
  },
  {
    kind: "do", id: "claim-gray", lesson: "灰色线路", anchor: "route:r91",
    expect: claim("r91", "blue"),
    then: [{ selection: "claim:r91", anchor: "claim-confirm" }],
    say: "点华盛顿—罗利的灰色线路，再点「铺路」。",
    note: "灰色线路用任意一种颜色都行，但同一条只能用一种颜色。这次交 2 张蓝。",
  },
  {
    kind: "watch", id: "rival-draw2",
    say: "咕噜一号又摸了 2 张。",
    moves: [deck, deck],
  },
  {
    kind: "do", id: "draw-tickets", lesson: "抽目的地票", anchor: "draw-tickets",
    expect: { type: "DRAW_TICKETS" },
    say: "这回合抽目的地票：点「抽 3 张目的地票」。",
    note: "一次抽 3 张，至少留 1 张。",
  },
  {
    kind: "do", id: "keep-one", anchor: "ticket:1",
    expect: { type: "KEEP_TICKETS", keep: [0] },
    then: [
      { selection: "keep:0,2", anchor: "ticket:2" },
      { selection: "keep:0", anchor: "ticket-confirm" },
    ],
    say: "只留纽约—亚特兰大：点掉另外两张，再确定。",
    note: "它正好在你要铺的路上；另外两张太远，连不上终局要倒扣。",
  },
  {
    kind: "watch", id: "rival-last",
    say: "咕噜一号铺了达拉斯—休斯顿，火车只剩 2 节。",
    moves: [claim("r48", "purple")],
  },
  {
    kind: "info", id: "last-round", lesson: "最后一轮", anchor: "last-round", face: "surprised",
    say: "有人火车剩 2 节或更少，进入最后一轮！",
    note: "其他人各再走最后一回合，然后结算。所以要留意别人还剩几节火车。",
  },
  {
    kind: "do", id: "claim-loco", lesson: "火车头", anchor: "route:r87",
    expect: claim("r87", "white"),
    then: [{ selection: "claim:r87", anchor: "claim-confirm" }],
    say: "最后一回合：铺罗利—亚特兰大，再点「铺路」。",
    note: "你只有 1 张白，火车头顶替另一张。铺完两张目的地票就都连通了。",
  },
  {
    kind: "info", id: TUTORIAL_FINAL_STEP, lesson: "终局计分", anchor: `final:${TUTORIAL_SELF}`, face: "happy",
    say: "终局：路段分 + 连通的票 − 没连通的票。",
    note: "你两张票都连通，+15。咕噜一号有一张没连上，倒扣 4 分。",
  },
  {
    kind: "info", id: "longest", lesson: "最长铁路", anchor: `final:${TUTORIAL_SELF}`, face: "happy",
    say: "最长的连续铁路再加 10 分，你赢了！",
    note: "你从蒙特利尔一路连到亚特兰大共 9 节，比咕噜一号长。",
  },
  {
    kind: "info", id: "finale", finale: true, face: "happy",
    say: "你已经会玩了！和咕噜一号从头打一局吧。",
    note: "正式开局每人发 3 张目的地票、至少留 2 张。拿不准就点「提示」；真实对局连续两次超时会转成人机托管。",
  },
];

function players(selfName: string) {
  return [{ id: TUTORIAL_SELF, name: selfName }, ...TUTORIAL_RIVALS.map((rival) => ({ ...rival }))];
}

function owned(routeId: string, playerId: string, color: TrainColor): ClaimedRoute {
  const route = ROUTES.find((candidate) => candidate.id === routeId)!;
  return { routeId, playerId, color, trainCount: route.length, points: ROUTE_SCORES[route.length]! };
}

/** 牌库末尾按剧本摆（抽牌从末尾拿）：补明牌的红、你摸到的白、咕噜一号摸的黑黄、紫绿。 */
const SCRIPT_DECK_TOP: readonly CardColor[] = ["green", "purple", "yellow", "black", "white", "red"];
/** 目的地票堆开头按剧本摆（抽票从开头拿）。 */
const SCRIPT_TICKETS = ["t3", "t23", "t12"];

/**
 * 教程开局：两人局，轮到你。你：蒙特利尔—纽约（4 分）、火车 9 节、手牌 橙橙蓝火车头、目的地票 蒙特利尔—亚特兰大。
 * 咕噜一号：卡尔加里—海伦娜—盐湖城（11 分）、火车 5 节、目的地票 卡尔加里—盐湖城（已连通）和丹佛—埃尔帕索。
 */
export function createTutorialGame(selfName: string, seed = 20261010): GameState {
  const game = createGame(players(selfName), seed);
  const [self, rival] = game.players as [GameState["players"][number], GameState["players"][number]];
  game.phase = "playing";
  game.turn = 9;
  game.currentPlayer = 0;
  game.startPlayer = 0;

  self.score = 4;
  self.trainsLeft = 9;
  self.trainCards = ["orange", "orange", "blue", "locomotive"];
  self.tickets = ["t22"];
  self.pendingTickets = [];
  rival.score = 11;
  rival.trainsLeft = 5;
  rival.trainCards = ["green", "green", "purple", "black"];
  rival.tickets = ["t10", "t24"];
  rival.pendingTickets = [];
  game.claimedRoutes = [owned("r97", TUTORIAL_SELF, "blue"), owned("r18", RIVAL, "black"), owned("r20", RIVAL, "purple")];
  game.faceUp = ["blue", "locomotive", "white", "green", "yellow"];

  // 车票守恒：铺过的线路用掉的牌进弃牌堆，剩下的进牌库，牌库末尾按剧本摆
  game.discard = ["blue", "blue", "blue", "black", "black", "black", "black", "purple", "purple", "purple"];
  const left = new Map<CardColor, number>(Object.entries(CARD_COUNTS) as [CardColor, number][]);
  for (const card of [...self.trainCards, ...rival.trainCards, ...game.faceUp, ...game.discard, ...SCRIPT_DECK_TOP]) left.set(card, left.get(card)! - 1);
  game.deck = [...[...left].flatMap(([color, count]) => new Array<CardColor>(count).fill(color)), ...SCRIPT_DECK_TOP];

  const used = new Set([...self.tickets, ...rival.tickets, ...SCRIPT_TICKETS]);
  game.ticketDeck = [...SCRIPT_TICKETS, ...TICKETS.map((ticket) => ticket.id).filter((id) => !used.has(id))];
  game.events = [];
  return game;
}

/** 练习局：新开一局两人局，从开局选票开始，随机先手。 */
export function createPracticeGame(selfName: string, seed: number): GameState {
  return createGame(players(selfName), seed);
}

/** 两条命令是不是同一步（不看字段顺序；选票不看保留的先后）。 */
export function sameCommand(a: GameCommand, b: GameCommand): boolean {
  if (a.type !== b.type) return false;
  switch (a.type) {
    case "KEEP_TICKETS": {
      const other = b as typeof a;
      return [...a.keep].sort().join(",") === [...other.keep].sort().join(",");
    }
    case "DRAW_CARD": {
      const other = b as typeof a;
      return a.source.kind === other.source.kind
        && (a.source.kind === "deck" || (other.source.kind === "faceUp" && a.source.index === other.source.index));
    }
    case "DRAW_TICKETS":
      return true;
    case "CLAIM_ROUTE": {
      const other = b as typeof a;
      return a.routeId === other.routeId && a.color === other.color;
    }
  }
}

/**
 * 这个锚点在这个局面里，界面上应该看得见吗（给剧本单测用，对应 GameBoard 的显示条件）。
 * viewer 是看界面的人（教程里就是你）。
 */
export function anchorVisible(state: GameState, anchor: string, viewer: string): boolean {
  const me = state.players.find((player) => player.id === viewer);
  const myTurn = state.phase === "playing" && state.players[state.currentPlayer]?.id === viewer;
  const choosing = (state.phase === "tickets" && (me?.pendingTickets.length ?? 0) > 0) || (myTurn && state.pending?.type === "ticketChoice");
  const [kind, arg] = anchor.split(":") as [string, string | undefined];
  switch (kind) {
    case "map":
    case "players":
    case "draw":
    case "my-hand":
    case "my-tickets":
      return true;
    case "deck":
      return state.deck.length + state.discard.length > 0;
    case "draw-tickets":
      return myTurn && !state.pending && state.ticketDeck.length > 0;
    case "faceup":
      return arg !== undefined && state.faceUp[Number(arg)] !== undefined;
    case "route":
      return ROUTES.some((route) => route.id === arg);
    case "claim-confirm":
      // 铺路按钮：轮到你、没有半个动作、这条线路铺得起时才会出现（看 do 步骤的 expect）
      return myTurn && !state.pending && legalActions(state, viewer).some((action) => action.type === "CLAIM_ROUTE");
    case "ticket": {
      const drawn = state.phase === "tickets" ? me?.pendingTickets ?? [] : state.pending?.type === "ticketChoice" ? state.pending.drawn : [];
      return choosing && arg !== undefined && drawn[Number(arg)] !== undefined;
    }
    case "ticket-confirm":
      return choosing;
    case "last-round":
      return state.finalRound && state.phase !== "finished";
    case "final":
      return state.phase === "finished" && state.players.some((player) => player.id === arg);
    case "hint":
      return myTurn;
    default:
      return false;
  }
}
