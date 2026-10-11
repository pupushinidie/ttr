import { useEffect, useRef } from "react";
import { LOCOMOTIVE, ROUTES, TICKETS, type CardColor, type ClaimedRoute, type GameState } from "@ttr/game";
import { sfx, synth } from "./gm-sound.js";

/**
 * 车票之旅的动作音效：对比前后两次对局状态，按 game.events（这一步动作产生的事件）出声。
 * 自己的动作响亮，别人的减半（gm-sound 的 mine 参数）；观战时都算别人的。
 * 第一次拿到状态（进房间、重连、观战刚进来、新开一局）不出声；一下跳了好几步只响最后一步。
 *
 *   抽牌库的车厢卡   draw            拿明牌         flip（火车头再加一声短汽笛）
 *   明牌三张火车头重发 shuffle        抽目的地票     draw ×3
 *   留下目的地票     card（留几张拍几下）
 *   铺线路          一节一节的车厢落轨（招牌）+ 汽笛（招牌，长线路更长）+ 5 节以上 score
 *   自己连通一张目的地票 sparkle      最后一轮开始   道口铃（招牌）
 *   选票结束开打     roundStart       超时代走       timeout（自己）
 *   终局           reveal → 最长路线是你 sparkle → gameOver 赢 / 输
 *   轮到你         yourTurn         你交出回合     turnPassed
 */

/** 开发时记下响了哪些声音（自测脚本读 window.__sfxLog）。 */
function cue(name: string, play: () => void, delayMs = 0) {
  const run = () => {
    if (import.meta.env.DEV) (window as unknown as { __sfxLog?: string[] }).__sfxLog?.push(name);
    play();
  };
  if (delayMs > 0) window.setTimeout(run, delayMs);
  else run();
}

/** 点选（线路、目的地票、颜色）的确认音；非法位置用 deny。 */
export const pick = {
  select: (on = true) => cue(on ? "select" : "unselect", () => sfx.select(on)),
  deny: () => cue("deny", () => sfx.deny()),
};

/** 一节车厢落到轨道上：木头「笃」+ 一点金属的「叮」。 */
function railCar(at: number, v: number) {
  const p = synth.jitter(0.08);
  synth.noise({ at, duration: 0.045, volume: 0.3 * v, filter: "lowpass", freq: 1200 });
  synth.tone(240 * p, { at, duration: 0.08, volume: 0.16 * v, type: "triangle" });
  synth.tone(1900 * p, { at: at + 0.01, duration: 0.05, volume: 0.04 * v });
}

/** 蒸汽火车的汽笛：三个音叠成的和弦先往上滑一点，再带着气声拉长。 */
function whistle(at: number, v: number, long: boolean) {
  const duration = long ? 0.9 : 0.5;
  for (const f of [440, 554, 659]) {
    synth.tone(f * 0.94, { at, duration: 0.08, volume: 0.05 * v, type: "triangle", glideTo: f });
    synth.tone(f, { at: at + 0.07, duration, volume: 0.07 * v, type: "triangle" });
  }
  synth.noise({ at, duration: duration + 0.1, volume: 0.07 * v, freq: 2200, q: 1.2 });
}

/** 道口铃：两个音交替叮当，最后一轮开始时响。 */
function crossingBell() {
  for (let i = 0; i < 6; i += 1) {
    const f = i % 2 === 0 ? 1175 : 988;
    synth.tone(f, { at: i * 0.16, duration: 0.22, volume: 0.13, type: "triangle" });
    synth.tone(f * 2.76, { at: i * 0.16, duration: 0.08, volume: 0.03 });
  }
}

function linked(claimed: readonly ClaimedRoute[], playerId: string, a: string, b: string): boolean {
  const neighbours = new Map<string, string[]>();
  for (const entry of claimed) {
    if (entry.playerId !== playerId) continue;
    const route = ROUTES.find((candidate) => candidate.id === entry.routeId);
    if (!route) continue;
    neighbours.set(route.a, [...(neighbours.get(route.a) ?? []), route.b]);
    neighbours.set(route.b, [...(neighbours.get(route.b) ?? []), route.a]);
  }
  const seen = new Set([a]);
  const queue = [a];
  while (queue.length > 0) {
    const city = queue.shift()!;
    if (city === b) return true;
    for (const next of neighbours.get(city) ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return false;
}

function doneTickets(game: GameState, playerId: string): number {
  const player = game.players.find((entry) => entry.id === playerId);
  if (!player) return 0;
  return player.tickets.filter((id) => {
    const ticket = TICKETS.find((entry) => entry.id === id);
    return ticket ? linked(game.claimedRoutes, playerId, ticket.a, ticket.b) : false;
  }).length;
}

/** 明牌区是不是整组重发了：拿走的那张以外，原来的明牌应该都还在。 */
function faceUpReshuffled(before: readonly CardColor[], after: readonly CardColor[], taken: CardColor | null): boolean {
  const left = [...after];
  let skipped = taken === null;
  for (const card of before) {
    if (!skipped && card === taken) {
      skipped = true;
      continue;
    }
    const at = left.indexOf(card);
    if (at < 0) return true;
    left.splice(at, 1);
  }
  return false;
}

/**
 * myId：自己的玩家 id（观战传空字符串，所有动作都按别人的放）。
 */
export function useGameSfx(game: GameState, myId: string) {
  const previous = useRef<GameState | null>(null);
  useEffect(() => {
    const prev = previous.current;
    previous.current = game;
    if (!prev || prev === game || game.version === prev.version) return;
    // 新开一局（再来一局、练习局重开）：只响一声开局。
    if (game.version < prev.version || (prev.phase === "finished" && game.phase !== "finished")) {
      cue("gameStart", () => sfx.gameStart());
      return;
    }
    const jumped = game.version - prev.version > 3;
    const isMe = (id: string) => myId !== "" && id === myId;
    let at = 0;
    let timedOutMe = false;

    for (const event of game.events) {
      const mine = isMe("player" in event ? event.player : "");
      switch (event.type) {
        case "TurnTimedOut":
          if (mine) {
            timedOutMe = true;
            cue("timeout", () => sfx.timeout(), at);
            at += 350;
          }
          break;
        case "TicketsKept":
          if (jumped) break;
          cue("card", () => sfx.card(mine, Math.max(1, event.kept)), at);
          at += 120;
          break;
        case "CardDrawn":
          if (jumped) break;
          if (event.source === "deck") cue("draw", () => sfx.draw(mine, 1), at);
          else {
            cue("flip", () => sfx.flip(mine), at);
            if (event.color === LOCOMOTIVE) cue("loco", () => whistle(0, synth.level(mine) * 0.6, false), at + 140);
            if (faceUpReshuffled(prev.faceUp, game.faceUp, event.color ?? null)) cue("shuffle", () => sfx.shuffle(), at + 380);
          }
          at += 120;
          break;
        case "TicketsTaken":
          if (jumped) break;
          cue("draw", () => sfx.draw(mine, event.count), at);
          at += 200;
          break;
        case "RouteClaimed": {
          const route = ROUTES.find((entry) => entry.id === event.routeId);
          const length = route?.length ?? 1;
          const v = synth.level(mine);
          cue(`route:${length}`, () => {
            for (let i = 0; i < length; i += 1) railCar(i * 0.085, v);
          }, at);
          at += length * 85 + 60;
          cue("whistle", () => whistle(0, v, length >= 4), at);
          at += length >= 4 ? 500 : 300;
          if (length >= 5) {
            cue("score", () => sfx.score(mine, true), at);
            at += 300;
          }
          if (mine && doneTickets(game, myId) > doneTickets(prev, myId)) {
            cue("sparkle", () => sfx.sparkle(true), at);
            at += 400;
          }
          break;
        }
        case "LastRoundStarted":
          cue("bell", () => crossingBell(), at + 200);
          at += 1100;
          break;
        case "GameStarted":
          cue("roundStart", () => sfx.roundStart(), at + 200);
          at += 450;
          break;
        case "GameEnded": {
          const result = event.result;
          cue("reveal", () => sfx.reveal(true), at + 300);
          at += 700;
          const myScore = result.scores.find((entry) => entry.player === myId);
          if (myScore && myScore.longestBonus > 0) {
            cue("sparkle", () => sfx.sparkle(true), at);
            at += 500;
          }
          const won = myId !== "" && result.winners.includes(myId);
          cue(won ? "win" : "lose", () => sfx.gameOver(won), at);
          break;
        }
      }
    }

    // 回合交接：轮到你 / 你交出了回合。
    if (game.phase !== "playing") return;
    const nowId = game.players[game.currentPlayer]?.id ?? "";
    const turnMoved = prev.phase !== "playing" || prev.currentPlayer !== game.currentPlayer;
    if (!turnMoved) return;
    if (isMe(nowId)) cue("yourTurn", () => sfx.yourTurn(), Math.max(450, at + 150));
    else if (prev.phase === "playing" && isMe(prev.players[prev.currentPlayer]?.id ?? "") && !timedOutMe) cue("turnPassed", () => sfx.turnPassed(), Math.max(400, at + 100));
  }, [game, myId]);
}
