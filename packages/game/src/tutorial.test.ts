import { describe, expect, it } from "vitest";
import { botCommand } from "./bot.js";
import { apply, legalActions, redactGameForViewer, timeoutTurn } from "./engine.js";
import { CARD_COUNTS, TICKETS } from "./map.js";
import { createRng } from "./rng.js";
import {
  anchorVisible,
  createPracticeGame,
  createTutorialGame,
  sameCommand,
  TUTORIAL_FINAL_STEP,
  TUTORIAL_SELF,
  TUTORIAL_STEPS,
} from "./tutorial.js";
import type { GameState } from "./types.js";

const RIVAL = "p2";
const actor = (game: GameState) => game.players[game.currentPlayer]!.id;
const seat = (game: GameState, id: string) => game.players.find((player) => player.id === id)!;
const stepIndex = (id: string) => TUTORIAL_STEPS.findIndex((step) => step.id === id);

/** 按剧本走到第 upTo 步之前（不含），返回那时的局面。 */
function playScript(upTo = TUTORIAL_STEPS.length): GameState {
  const rng = createRng(1);
  let game = createTutorialGame("小蒲");
  for (const step of TUTORIAL_STEPS.slice(0, upTo)) {
    if (step.kind === "do") game = apply(game, TUTORIAL_SELF, step.expect, rng).state;
    if (step.kind === "watch") for (const move of step.moves) game = apply(game, actor(game), move, rng).state;
  }
  return game;
}

/** 110 张车票：牌库 + 弃牌堆 + 明牌 + 手牌。30 张目的地票：票堆 + 手里 + 待选。 */
function conserved(game: GameState): void {
  const total = Object.values(CARD_COUNTS).reduce((a, b) => a + b, 0);
  expect(game.deck.length + game.discard.length + game.faceUp.length + game.players.reduce((sum, player) => sum + player.trainCards.length, 0)).toBe(total);
  const drawn = game.pending?.type === "ticketChoice" ? game.pending.drawn : [];
  const tickets = [...game.ticketDeck, ...drawn, ...game.players.flatMap((player) => [...player.tickets, ...player.pendingTickets])];
  expect(new Set(tickets).size).toBe(TICKETS.length);
  expect(tickets).toHaveLength(TICKETS.length);
}

describe("新手教程剧本", () => {
  it("开局摆法：车票和目的地票都守恒，轮到你，牌库顶按剧本摆", () => {
    const game = createTutorialGame("小蒲");
    conserved(game);
    expect(actor(game)).toBe(TUTORIAL_SELF);
    expect(game.phase).toBe("playing");
    expect(game.deck.slice(-2)).toEqual(["white", "red"]);
    expect(game.ticketDeck.slice(0, 3)).toEqual(["t3", "t23", "t12"]);
  });

  it("从头走到尾：每一步要你做的都合法、轮到的是对的人，高亮的东西在界面上看得见", () => {
    let game = createTutorialGame("小蒲");
    const rng = createRng(1);
    for (const step of TUTORIAL_STEPS) {
      if (step.anchor) expect(anchorVisible(game, step.anchor, TUTORIAL_SELF), `「${step.id}」高亮的 ${step.anchor} 看不见`).toBe(true);
      if (step.kind === "do") {
        expect(actor(game), `「${step.id}」不是轮到你`).toBe(TUTORIAL_SELF);
        // 选票这种命令 legalActions 只给「全留」的种子，直接用 apply 检查合法
        expect(() => apply(game, TUTORIAL_SELF, step.expect, createRng(9)), `「${step.id}」不合法`).not.toThrow();
        if (step.expect.type === "CLAIM_ROUTE") expect(legalActions(game, TUTORIAL_SELF).some((action) => sameCommand(action, step.expect)), `「${step.id}」铺不起`).toBe(true);
        for (const follow of step.then ?? []) expect(anchorVisible(game, follow.anchor, TUTORIAL_SELF), `「${step.id}」后续高亮 ${follow.anchor} 看不见`).toBe(true);
        game = apply(game, TUTORIAL_SELF, step.expect, rng).state;
      }
      if (step.kind === "watch") {
        for (const move of step.moves) {
          expect(actor(game), `「${step.id}」里轮到了你`).not.toBe(TUTORIAL_SELF);
          game = apply(game, actor(game), move, rng).state;
        }
      }
      conserved(game);
    }
    expect(game.phase).toBe("finished");
  });

  it("关键的几幕一定发生：摸到白色、双线路另一边被锁、只留一张票、咕噜一号触发最后一轮、两张票连通、最长铁路归你", () => {
    const afterDraw = playScript(stepIndex("draw-deck") + 1);
    expect([...seat(afterDraw, TUTORIAL_SELF).trainCards].sort()).toEqual(["blue", "blue", "locomotive", "orange", "orange", "white"]);
    expect(afterDraw.faceUp[0]).toBe("locomotive");

    const beforeLoco = playScript(stepIndex("loco-locked"));
    expect(beforeLoco.pending?.type).toBe("secondDraw");
    expect(beforeLoco.faceUp[0]).toBe("locomotive");

    const afterOrange = playScript(stepIndex("claim-orange") + 1);
    expect(legalActions(afterOrange, RIVAL).some((action) => action.type === "CLAIM_ROUTE" && action.routeId === "r94")).toBe(false);
    expect(seat(afterOrange, TUTORIAL_SELF).score).toBe(6);

    const choosing = playScript(stepIndex("keep-one"));
    expect(choosing.pending).toEqual({ type: "ticketChoice", drawn: ["t3", "t23", "t12"] });

    const lastRound = playScript(stepIndex("last-round"));
    expect(lastRound.finalRound).toBe(true);
    expect(seat(lastRound, RIVAL).trainsLeft).toBe(2);
    expect(actor(lastRound)).toBe(TUTORIAL_SELF);

    const end = playScript(stepIndex(TUTORIAL_FINAL_STEP));
    expect(end.phase).toBe("finished");
    // 你：路段 4+2+2+2=10，票 9+6=15，最长 9 节 +10 = 35；咕噜一号：路段 7+4+2+1=14，票 7−4=3 = 17
    expect(end.finalResult!.scores).toEqual([
      { player: TUTORIAL_SELF, score: 35, routePoints: 10, ticketPoints: 15, completedTickets: 2, longestPath: 9, longestBonus: 10 },
      { player: RIVAL, score: 17, routePoints: 14, ticketPoints: 3, completedTickets: 1, longestPath: 7, longestBonus: 0 },
    ]);
    expect(end.finalResult!.winners).toEqual([TUTORIAL_SELF]);
  });

  it("剧本本身：步骤 id 不重复，最后一步是唯一的收尾，说明文字不空、不太长，结算框那一步在游戏结束之后", () => {
    const ids = TUTORIAL_STEPS.map((step) => step.id);
    expect(new Set(ids).size).toBe(ids.length);
    const finales = TUTORIAL_STEPS.filter((step) => step.kind === "info" && step.finale);
    expect(finales).toHaveLength(1);
    expect(TUTORIAL_STEPS.at(-1)).toBe(finales[0]);
    for (const step of TUTORIAL_STEPS) {
      expect(step.say.trim().length).toBeGreaterThan(0);
      expect(step.say.length, step.id).toBeLessThanOrEqual(24);
      // 补充最多两句
      for (const note of [step.note, step.noteTouch]) expect((note ?? "").split("。").filter((part) => part.trim()).length, step.id).toBeLessThanOrEqual(2);
    }
    expect(stepIndex(TUTORIAL_FINAL_STEP)).toBeGreaterThan(stepIndex("claim-loco"));
  });

  it("剧本走完开练习局：两家都交给人机，200 局都能正常打完", () => {
    const stuck: string[] = [];
    for (let seed = 1; seed <= 200; seed += 1) {
      const rng = createRng(seed);
      let game = createPracticeGame("小蒲", seed);
      let moves = 0;
      while (game.phase !== "finished" && moves < 1000) {
        const id = game.phase === "tickets" ? game.players.find((player) => player.pendingTickets.length > 0)!.id : actor(game);
        const command = botCommand(redactGameForViewer(game, id), id);
        game = command ? apply(game, id, command, rng).state : timeoutTurn(game);
        moves += 1;
      }
      if (game.phase !== "finished" || !game.finalResult) stuck.push(`第 ${seed} 局（${moves} 步）`);
    }
    expect(stuck).toEqual([]);
  }, 60_000);
});
