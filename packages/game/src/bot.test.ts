import { describe, expect, it } from "vitest";
import { botAdvice, botCommand } from "./bot.js";
import { applyCommand, createGame, legalActions, redactGameForViewer, timeoutTurn } from "./engine.js";
import { ROUTES, ROUTE_SCORES, TICKETS, type CardColor } from "./map.js";
import type { ClaimedRoute, GameState } from "./types.js";

const route = (id: string) => ROUTES.find((candidate) => candidate.id === id)!;
const claimed = (routeId: string, playerId: string): ClaimedRoute => {
  const def = route(routeId);
  return { routeId, playerId, color: def.color === "gray" ? "red" : def.color, trainCount: def.length, points: ROUTE_SCORES[def.length]! };
};

/** 四人局出牌阶段，p0 先手；可以改任意字段造精确局面。 */
function scene(edit: (state: GameState) => void): GameState {
  const state = createGame(["p0", "p1", "p2", "p3"].map((id) => ({ id, name: id })), 7);
  state.phase = "playing";
  state.turn = 5;
  state.currentPlayer = 0;
  for (const player of state.players) {
    player.pendingTickets = [];
    player.tickets = [];
    player.trainCards = [];
  }
  edit(state);
  return state;
}

const decide = (state: GameState, id = "p0") => botAdvice(redactGameForViewer(state, id), id)!;

describe("人机决策", () => {
  it("一铺就能连通目的地票时先铺这条", () => {
    const state = scene((s) => {
      s.players[0]!.tickets = ["t3"]; // 纽约—亚特兰大
      s.claimedRoutes = [claimed("r93", "p0"), claimed("r91", "p0")]; // 纽约—华盛顿—罗利
      s.players[0]!.trainCards = ["red", "red", "blue"];
    });
    const advice = decide(state);
    expect(advice.command).toMatchObject({ type: "CLAIM_ROUTE", color: "red" });
    expect(["r87", "r88"]).toContain((advice.command as { routeId: string }).routeId);
    expect(advice.reason).toContain("连通");
  });

  it("明牌里有缺的颜色就拿明牌", () => {
    const state = scene((s) => {
      s.players[0]!.tickets = ["t3"];
      s.players[0]!.trainCards = ["blue", "purple"];
      s.faceUp = ["red", "orange", "black", "white", "green"]; // 纽约出发的线路是橙/黑或白/绿
    });
    const advice = decide(state);
    expect(advice.command).toMatchObject({ type: "DRAW_CARD", source: { kind: "faceUp" } });
    expect((advice.command as { source: { index: number } }).source.index).not.toBe(0);
    expect(advice.reason).toContain("还差");
  });

  it("明牌里没有缺的颜色、有火车头时拿火车头", () => {
    const state = scene((s) => {
      s.players[0]!.tickets = ["t3"];
      s.players[0]!.trainCards = ["blue", "purple"];
      s.faceUp = ["red", "red", "locomotive", "red", "red"];
    });
    expect(decide(state).command).toEqual({ type: "DRAW_CARD", source: { kind: "faceUp", index: 2 } });
  });

  it("第二张不拿明牌火车头", () => {
    const state = scene((s) => {
      s.players[0]!.tickets = ["t3"];
      s.players[0]!.trainCards = ["blue", "purple"];
      s.faceUp = ["red", "red", "locomotive", "red", "red"];
      s.pending = { type: "secondDraw" };
    });
    expect(decide(state).command).toEqual({ type: "DRAW_CARD", source: { kind: "deck" } });
  });

  it("票都连通了、时间还多就再抽目的地票", () => {
    const state = scene((s) => {
      s.players[0]!.tickets = ["t3"];
      s.claimedRoutes = [claimed("r93", "p0"), claimed("r91", "p0"), claimed("r87", "p0")];
      s.players[0]!.trainsLeft = 39;
      s.players[0]!.trainCards = ["red"];
    });
    expect(decide(state).command).toEqual({ type: "DRAW_TICKETS" });
  });

  it("最后一轮挑分最多的线路", () => {
    const state = scene((s) => {
      s.finalRound = true;
      s.finalTurnsRemaining = 2;
      s.players[0]!.trainsLeft = 10;
      s.players[0]!.trainCards = ["green", "green", "green", "green", "green", "green", "red", "red"];
    });
    const advice = decide(state);
    expect(advice.command.type).toBe("CLAIM_ROUTE");
    const best = Math.max(...legalActions(state, "p0").filter((a) => a.type === "CLAIM_ROUTE").map((a) => ROUTE_SCORES[route((a as { routeId: string }).routeId).length]!));
    expect(ROUTE_SCORES[route((advice.command as { routeId: string }).routeId).length]).toBe(best);
  });

  it("开局选票留下顺路的两张", () => {
    const state = createGame(["p0", "p1"].map((id) => ({ id, name: id })), 3);
    state.players[0]!.pendingTickets = ["t3", "t22", "t29"]; // 纽约—亚特兰大、蒙特利尔—亚特兰大、西雅图—洛杉矶
    const advice = decide(state);
    expect(advice.command.type).toBe("KEEP_TICKETS");
    const keep = (advice.command as { keep: number[] }).keep;
    expect(keep).toEqual(expect.arrayContaining([0, 1]));
  });

  it("快结束时抽到的票只留已经连通的", () => {
    const state = scene((s) => {
      s.claimedRoutes = [claimed("r93", "p0"), claimed("r91", "p0"), claimed("r87", "p0")];
      s.players[0]!.trainsLeft = 8;
      s.players[1]!.trainsLeft = 6;
      s.pending = { type: "ticketChoice", drawn: ["t23", "t0", "t3"] };
    });
    expect(decide(state).command).toEqual({ type: "KEEP_TICKETS", keep: [2] });
  });

  it("2–3 人局不去铺另一侧已经被占的双轨", () => {
    const state = createGame(["p0", "p1", "p2"].map((id) => ({ id, name: id })), 9);
    state.phase = "playing";
    state.currentPlayer = 0;
    for (const player of state.players) {
      player.pendingTickets = [];
      player.tickets = [];
    }
    state.players[0]!.tickets = ["t3"];
    state.players[0]!.trainCards = ["black", "black", "orange", "orange", "red", "red", "red", "red"];
    state.claimedRoutes = [claimed("r93", "p1")]; // 纽约—华盛顿橙色被占，黑色那侧也不能用
    for (let i = 0; i < 6; i += 1) {
      const advice = decide(state);
      if (advice.command.type === "CLAIM_ROUTE") expect(advice.command.routeId).not.toBe("r94");
      state.players[0]!.trainCards.push("black");
    }
  });
});

/** 把别人手牌、目的地票和牌库顺序换掉，人机的选择不该变（它只看自己能看到的）。 */
function scramble(state: GameState, viewer: string, salt: number): GameState {
  const copy = structuredClone(state);
  let x = salt;
  const next = () => (x = (x * 1103515245 + 12345) % 2147483648);
  const colors: CardColor[] = ["red", "blue", "green", "locomotive", "black", "white"];
  for (const player of copy.players) {
    if (player.id === viewer) continue;
    player.trainCards = player.trainCards.map(() => colors[next() % colors.length]!);
    player.tickets = player.tickets.map(() => TICKETS[next() % TICKETS.length]!.id);
    player.pendingTickets = player.pendingTickets.map(() => TICKETS[next() % TICKETS.length]!.id);
  }
  copy.deck = [...copy.deck].reverse();
  copy.ticketDeck = [...copy.ticketDeck].reverse();
  copy.seed = salt;
  copy.rngState = salt;
  if (copy.pending?.type === "ticketChoice" && copy.players[copy.currentPlayer]!.id !== viewer) {
    copy.pending = { type: "ticketChoice", drawn: copy.pending.drawn.map(() => "t0") };
  }
  return copy;
}

function playOut(players: number, seed: number, check?: (state: GameState, id: string) => void): GameState {
  let state = createGame(Array.from({ length: players }, (_, i) => ({ id: `p${i}`, name: `p${i}` })), seed);
  let steps = 0;
  while (state.phase !== "finished") {
    steps += 1;
    if (steps > 3000) throw new Error(`第 ${seed} 局超过 3000 步`);
    const ids = state.phase === "tickets"
      ? state.players.filter((player) => player.pendingTickets.length > 0).map((player) => player.id)
      : [state.players[state.currentPlayer]!.id];
    const id = ids[0]!;
    check?.(state, id);
    const advice = botAdvice(redactGameForViewer(state, id), id);
    if (!advice) {
      expect(legalActions(state, id)).toEqual([]);
      state = timeoutTurn(state);
      continue;
    }
    expect(advice.reason.length).toBeGreaterThan(4);
    state = applyCommand(state, id, advice.command);
  }
  return state;
}

describe("人机只用自己能看到的信息", () => {
  it("别人的牌、票、牌库顺序换掉，人机的选择不变", () => {
    let checks = 0;
    for (const seed of [11, 12]) {
      playOut(3, seed, (state, id) => {
        if (state.version % 3 !== 0) return;
        const a = botCommand(redactGameForViewer(state, id), id);
        const b = botCommand(redactGameForViewer(scramble(state, id, state.version + 17), id), id);
        expect(b).toEqual(a);
        checks += 1;
      });
    }
    expect(checks).toBeGreaterThan(30);
  });

  it("喂给人机的视角里看不到别人的手牌和票", () => {
    const state = createGame([{ id: "p0", name: "a" }, { id: "p1", name: "b" }], 5);
    const view = redactGameForViewer(state, "p0");
    expect(view.players[1]!.trainCards).toEqual([]);
    expect(view.players[1]!.pendingTickets).toEqual([]);
    expect(view.deck).toEqual([]);
    expect(view.ticketDeck).toEqual([]);
    expect(botCommand(view, "p0")?.type).toBe("KEEP_TICKETS");
  });
});

describe("人机自对弈", () => {
  for (const players of [2, 3, 4, 5]) {
    it(`${players} 人局 25 局打到终局，每一步都合法`, () => {
      let completed = 0;
      let kept = 0;
      for (let i = 0; i < 25; i += 1) {
        const end = playOut(players, 500 * players + i);
        for (const score of end.finalResult!.scores) completed += score.completedTickets;
        kept += end.players.reduce((sum, player) => sum + player.tickets.length, 0);
      }
      // 会算账：大部分留下的目的地票都能连通
      expect(completed / kept).toBeGreaterThan(0.75);
    });
  }
});
