import { describe, expect, it } from "vitest";
import { applyCommand, createGame, defaultConfig, legalActions, redactGameForViewer } from "./engine.js";
import { CARD_COUNTS, LOCOMOTIVE, ROUTES, ROUTE_SCORES, TICKETS, TRAIN_COLORS, type CardColor } from "./map.js";
import type { GameCommand, GameState } from "./types.js";

const PLAYERS = [
  { id: "p0", name: "甲" },
  { id: "p1", name: "乙" },
  { id: "p2", name: "丙" },
] as const;

function startGame(): GameState {
  const state = createGame([...PLAYERS], 12345);
  // 开局选票：每人留下全部 3 张。
  let current = state;
  for (const player of PLAYERS) {
    current = applyCommand(current, player.id, { type: "KEEP_TICKETS", keep: [0, 1, 2] });
  }
  return current;
}

function turnOf(state: GameState): string {
  return state.players[state.currentPlayer]!.id;
}

describe("createGame", () => {
  it("发齐牌、票、明牌区", () => {
    const state = createGame([...PLAYERS], 1);
    expect(state.phase).toBe("tickets");
    expect(state.players).toHaveLength(3);
    const totalCards = Object.values(CARD_COUNTS).reduce((a, b) => a + b, 0);
    expect(state.deck.length + state.discard.length + state.faceUp.length).toBe(totalCards - 3 * defaultConfig(0).startHandSize);
    expect(state.faceUp).toHaveLength(defaultConfig(0).faceUpCount);
    for (const player of state.players) {
      expect(player.trainCards).toHaveLength(4);
      expect(player.pendingTickets).toHaveLength(3);
      expect(player.trainsLeft).toBe(45);
    }
    expect(state.ticketDeck.length + state.players.reduce((a, p) => a + p.pendingTickets.length, 0)).toBe(TICKETS.length);
  });

  it("明牌区火车头不超过 2 张", () => {
    for (let seed = 0; seed < 200; seed += 1) {
      const state = createGame([...PLAYERS], seed);
      const locos = state.faceUp.filter((card) => card === LOCOMOTIVE).length;
      expect(locos).toBeLessThan(defaultConfig(0).maxFaceUpLocomotives);
    }
  });
});

describe("选票阶段", () => {
  it("必须保留至少 2 张", () => {
    const state = createGame([...PLAYERS], 1);
    expect(() => applyCommand(state, "p0", { type: "KEEP_TICKETS", keep: [0] })).toThrow(/至少/);
  });

  it("选完后进入出牌阶段，先手已定", () => {
    const state = startGame();
    expect(state.phase).toBe("playing");
    expect(state.turn).toBe(1);
    expect(state.currentPlayer).toBe(state.startPlayer);
  });
});

describe("抽车票", () => {
  it("第一次抽明牌（非火车头）后还要抽第二张，回合不结束", () => {
    const state = startGame();
    const playerId = turnOf(state);
    // 找到一张非火车头的明牌。
    const index = state.faceUp.findIndex((card) => card !== LOCOMOTIVE);
    expect(index).toBeGreaterThanOrEqual(0);
    const next = applyCommand(state, playerId, { type: "DRAW_CARD", source: { kind: "faceUp", index } });
    expect(next.phase).toBe("playing");
    expect(next.players[state.currentPlayer]!.trainCards).toHaveLength(5);
    expect(next.pending).toEqual({ type: "secondDraw" });
    expect(next.currentPlayer).toBe(state.currentPlayer); // 还是同一玩家
  });

  it("第二次抽牌后回合结束", () => {
    const state = startGame();
    const playerId = turnOf(state);
    const index = state.faceUp.findIndex((card) => card !== LOCOMOTIVE);
    const first = applyCommand(state, playerId, { type: "DRAW_CARD", source: { kind: "faceUp", index } });
    const second = applyCommand(first, playerId, { type: "DRAW_CARD", source: { kind: "deck" } });
    expect(second.currentPlayer).not.toBe(first.currentPlayer);
    expect(second.pending).toBeUndefined();
  });

  it("抽明牌火车头直接结束回合", () => {
    const state = startGame();
    const playerId = turnOf(state);
    const index = state.faceUp.findIndex((card) => card === LOCOMOTIVE);
    if (index < 0) return; // 这局明牌没有火车头，跳过
    const next = applyCommand(state, playerId, { type: "DRAW_CARD", source: { kind: "faceUp", index } });
    expect(next.currentPlayer).not.toBe(state.currentPlayer);
    expect(next.pending).toBeUndefined();
  });
});

describe("铺路", () => {
  it("灰线路长度 1 得分 1，扣对应火车数", () => {
    const state = startGame();
    const playerId = turnOf(state);
    const route = ROUTES.find((candidate) => candidate.length === 1 && candidate.color === "gray")!;
    const color = TRAIN_COLORS.find((candidate) => {
      const count = state.players[state.currentPlayer]!.trainCards.filter((card) => card === candidate).length;
      return count >= 1;
    })!;
    const next = applyCommand(state, playerId, { type: "CLAIM_ROUTE", routeId: route.id, color });
    expect(next.players[state.currentPlayer]!.score).toBe(1);
    expect(next.players[state.currentPlayer]!.trainsLeft).toBe(44);
    expect(next.claimedRoutes).toHaveLength(1);
  });

  it("灰线路可用任意单色", () => {
    const state = startGame();
    const playerId = turnOf(state);
    const gray = ROUTES.find((candidate) => candidate.color === "gray" && candidate.length === 1)!;
    const color = TRAIN_COLORS.find((candidate) => {
      const count = state.players[state.currentPlayer]!.trainCards.filter((card) => card === candidate).length;
      return count >= 1;
    })!;
    const next = applyCommand(state, playerId, { type: "CLAIM_ROUTE", routeId: gray.id, color });
    expect(next.claimedRoutes).toHaveLength(1);
  });

  it("颜色不对会报错", () => {
    const state = startGame();
    const playerId = turnOf(state);
    const route = ROUTES.find((candidate) => candidate.color !== "gray" && candidate.length === 2)!;
    const wrongColor = TRAIN_COLORS.find((candidate) => candidate !== route.color)!;
    expect(() => applyCommand(state, playerId, { type: "CLAIM_ROUTE", routeId: route.id, color: wrongColor }))
      .toThrow(/颜色不对/);
  });

  it("车票不够会报错", () => {
    const state = startGame();
    const playerId = turnOf(state);
    const route = ROUTES.find((candidate) => candidate.color !== "gray" && candidate.length === 6)!;
    expect(() => applyCommand(state, playerId, { type: "CLAIM_ROUTE", routeId: route.id, color: route.color as never }))
      .toThrow(/车票不够/);
  });

  it("火车不够会报错", () => {
    const state = startGame();
    const idx = state.currentPlayer;
    const player = state.players[idx]!;
    player.trainsLeft = 2;
    player.trainCards = ["blue", "blue", "blue", "blue"];
    const route = ROUTES.find((candidate) => candidate.color === "blue" && candidate.length === 3)!;
    expect(() => applyCommand(state, player.id, { type: "CLAIM_ROUTE", routeId: route.id, color: "blue" }))
      .toThrow(/火车不够/);
  });
});

describe("目的地票", () => {
  it("游戏中抽 3 张至少留 1 张", () => {
    const state = startGame();
    const playerId = turnOf(state);
    const drawn = applyCommand(state, playerId, { type: "DRAW_TICKETS" });
    expect(drawn.pending?.type).toBe("ticketChoice");
    expect((drawn.pending as { drawn: string[] }).drawn).toHaveLength(3);
    // 选票期间不能抽牌。
    expect(() => applyCommand(drawn, playerId, { type: "DRAW_CARD", source: { kind: "deck" } })).toThrow(/先完成/);
    const kept = applyCommand(drawn, playerId, { type: "KEEP_TICKETS", keep: [0] });
    expect(kept.currentPlayer).not.toBe(drawn.currentPlayer);
    expect(kept.players[drawn.currentPlayer]!.tickets).toHaveLength(4); // 3 开局 + 1
  });

  it("至少留 1 张，全弃会报错", () => {
    const state = startGame();
    const playerId = turnOf(state);
    const drawn = applyCommand(state, playerId, { type: "DRAW_TICKETS" });
    expect(() => applyCommand(drawn, playerId, { type: "KEEP_TICKETS", keep: [] })).toThrow(/至少/);
  });
});

describe("终局", () => {
  it("火车剩 ≤2 触发终局，其他玩家各补一回合", () => {
    const state = startGame();
    const idx = state.currentPlayer;
    const player = state.players[idx]!;
    player.trainsLeft = 3;
    player.trainCards = ["blue", "blue", "blue", "blue"];
    const route = ROUTES.find((candidate) => candidate.color === "blue" && candidate.length === 2)!;
    const next = applyCommand(state, player.id, { type: "CLAIM_ROUTE", routeId: route.id, color: "blue" });
    expect(next.players[idx]!.trainsLeft).toBe(1);
    expect(next.finalRound).toBe(true);
    expect(next.finalTurnsRemaining).toBe(PLAYERS.length - 1);
    expect(next.events.some((event) => event.type === "LastRoundStarted")).toBe(true);
  });
});

describe("超时自动行动", () => {
  it("能替当前玩家走完一个回合", async () => {
    const { timeoutTurn } = await import("./engine.js");
    const state = startGame();
    const before = turnOf(state);
    const next = timeoutTurn(state);
    expect(next.turn >= state.turn).toBe(true);
    // 超时后回合应该已经交给下一位（或游戏结束）。
    if (next.phase !== "finished") {
      expect(turnOf(next)).not.toBe(before);
    }
    expect(next.events[0]?.type).toBe("TurnTimedOut");
  });
});

describe("redactGameForViewer", () => {
  it("隐藏别人的手牌和目的地票，保留自己的", () => {
    const state = startGame();
    const viewer = state.players[0]!.id;
    const redacted = redactGameForViewer(state, viewer);
    for (const player of redacted.players) {
      if (player.id === viewer) {
        expect(player.trainCards.length).toBeGreaterThan(0);
        expect(player.tickets.length).toBeGreaterThan(0);
      } else {
        expect(player.trainCards).toHaveLength(0);
        expect(player.tickets).toHaveLength(0);
        expect(player.handCount).toBe(state.players.find((p) => p.id === player.id)!.trainCards.length);
      }
    }
    expect(redacted.deck).toHaveLength(0);
    expect(redacted.remainingCards).toBe(state.deck.length + state.discard.length);
  });
});

describe("随机模拟：整局能正常跑完", () => {
  it("每局最终都能进入 finished 且分数非负", () => {
    for (let seed = 0; seed < 30; seed += 1) {
      const state = createGame([...PLAYERS], seed * 97 + 1);
      let current = state;
      let guard = 0;
      // 开局选票：每人都保留前 2 张。
      while (current.phase === "tickets" && guard < 20) {
        const playerId = turnOf(current);
        const drawn = current.players[current.currentPlayer]!.pendingTickets.length;
        current = applyCommand(current, playerId, { type: "KEEP_TICKETS", keep: Array.from({ length: drawn }, (_, i) => i).slice(0, 2) });
        guard += 1;
      }
      expect(current.phase).toBe("playing");

      guard = 0;
      while (current.phase !== "finished" && guard < 2000) {
        guard += 1;
        const playerId = turnOf(current);
        const actions = legalActions(current, playerId);
        expect(actions.length).toBeGreaterThan(0);
        // 优先铺路（尽快结束），其次抽牌。
        const command: GameCommand = actions.find((action) => action.type === "CLAIM_ROUTE")
          ?? actions[0]!;
        try {
          current = applyCommand(current, playerId, command);
        } catch (error) {
          // 若模拟选了不合法动作，退回到抽牌。
          current = applyCommand(current, playerId, actions.find((action) => action.type === "DRAW_CARD")!);
          void error;
        }
      }
      expect(current.phase).toBe("finished");
      expect(current.finalResult).toBeDefined();
      for (const score of current.finalResult!.scores) {
        expect(score.score).toBeGreaterThanOrEqual(0);
      }
    }
  }, 30_000);
});
