/**
 * 车票之旅和教程有关的部分（共用的 tutorial/ 文件夹之外，每款游戏自己写的）：
 * 游戏 id、「提示」怎么说、「第一次遇到」小贴士什么时候出。
 */
import { botAdvice, ROUTES, type GameState } from "@ttr/game";

const DOUBLE_ROUTES = new Set(ROUTES.filter((route) => route.doubleGroup).map((route) => route.id));

/** 本机记录（gm-tutorial-<id>、gm-tips-<id>）用的游戏 id。 */
export const GAME_ID = "ttr";

export interface Hint {
  readonly say: string;
  readonly note?: string;
  /** 高亮哪个元素（data-tutorial）；null 不指。 */
  readonly anchor: string | null;
}

/** 「提示」：让人机从你的位置算一步（界面拿到的本来就是你能看到的那份），配一句原因。 */
export function hintFor(game: GameState, playerId: string): Hint {
  if (game.phase === "finished") return { say: "这局已经结束了。", anchor: null };
  if (game.phase === "playing") {
    const current = game.players[game.currentPlayer]!;
    if (current.id !== playerId) return { say: `等 ${current.name} 走完再问我。`, anchor: null };
  }
  const advice = botAdvice(game, playerId);
  if (!advice) return { say: game.phase === "tickets" ? "你选好了，等对手选完。" : "现在没有能走的。", anchor: null };
  const [head, ...rest] = advice.reason.split("：");
  const reason = rest.join("：");
  const command = advice.command;
  let anchor: string | null = null;
  let say = `我会${head!.replace(/。$/, "")}。`;
  if (command.type === "CLAIM_ROUTE") anchor = `route:${command.routeId}`;
  else if (command.type === "DRAW_TICKETS") anchor = "draw-tickets";
  else if (command.type === "KEEP_TICKETS") {
    anchor = "ticket-confirm";
    if (command.keep.length === 1) say = `我会只留第 ${command.keep[0]! + 1} 张。`;
    else say = `我会留第 ${command.keep.map((index) => index + 1).join("、")} 张。`;
  } else anchor = command.source.kind === "deck" ? "deck" : `faceup:${command.source.index}`;
  return { say, ...(reason ? { note: reason } : {}), anchor };
}

/** 「第一次遇到」小贴士的内容。 */
export const TIPS = {
  "faceup-loco": { title: "拿了明牌火车头", text: "第一张就拿明牌里的火车头，这回合只能拿这 1 张；第二张也不能拿明牌火车头。" },
  claimed: { title: "铺路得分", text: "1 到 6 节的线路分别得 1、2、4、7、10、15 分，越长越划算。" },
  "tickets-drawn": { title: "抽了目的地票", text: "至少留 1 张。终局没连通的票要倒扣分值，火车不多时别贪。" },
  "double-locked": { title: "双线路只能用一边", text: "2–3 人局里双线路的一边有人铺了，另一边就不能再铺。" },
  "last-round": { title: "最后一轮", text: "有人火车剩 2 节或更少：其他人各再走最后一回合，然后结算。" },
} as const;

/** 这一步该出哪些小贴士（按优先顺序；只出第一条没看过的）。 */
export function detectTips(game: GameState, selfId: string): string[] {
  const ids: string[] = [];
  for (const event of game.events) {
    if (event.type === "LastRoundStarted") ids.push("last-round");
    if (event.type === "CardDrawn" && event.player === selfId && event.source === "faceUp" && event.color === "locomotive") ids.push("faceup-loco");
    if (event.type === "TicketsTaken" && event.player === selfId) ids.push("tickets-drawn");
    if (event.type === "RouteClaimed" && event.player === selfId) ids.push("claimed");
    if (event.type === "RouteClaimed" && game.players.length <= 3 && DOUBLE_ROUTES.has(event.routeId)) ids.push("double-locked");
  }
  return ids;
}
