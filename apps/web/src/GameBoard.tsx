import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  CITIES,
  LOCOMOTIVE,
  ROUTES,
  ROUTE_SCORES,
  TICKETS,
  TRAIN_COLORS,
  TRAIN_COLOR_NAMES,
  type CardColor,
  type ClaimedRoute,
  type GameCommand,
  type GameEvent,
  type GameState,
  type LobbyRoomSnapshot,
  type Player,
  type RouteDef,
  type TrainColor,
} from "@ttr/game";
import { CARD_COLOR_LABEL, COLOR_HEX, CardFace } from "./Card.js";
import GameRules from "./GameRules.js";
import { GameRoomMenu, SpectateBar } from "./RoomExtras.js";
import { socket } from "./socket.js";

interface GameBoardProps {
  readonly room: LobbyRoomSnapshot;
  readonly busy: boolean;
  readonly error: string;
  readonly notice: string;
  readonly brand: ReactNode;
  readonly connection: ReactNode;
  /** 顶栏的白天 / 夜间切换按钮。 */
  readonly themeToggle: ReactNode;
  readonly chat: ReactNode;
  readonly onCommand: (command: GameCommand) => void;
  readonly onRematch: (accept: boolean) => void;
  readonly onDissolve: () => void;
  /** 观战时从这位玩家的座位看。 */
  readonly watchId: string;
  readonly onWatch: (playerId: string) => void;
  /** 观战的人离开。 */
  readonly onLeave: () => void;
}

/** 座位色：避开 8 种线路色，铺好的线路一眼能和没铺的分开。 */
const SEAT_COLORS = ["#ff8fd0", "#3fe0d0", "#c6f04a", "#ffb24a", "#a8b4ff"];
const GRAY_ROUTE = "#9d968a";

// ---- 地图几何：城市归一化坐标（y 向上）→ SVG 视口坐标 ----
const MAP_W = 100;
const MAP_H = 74;
const toSvg = (x: number, y: number) => ({ x: x * MAP_W, y: (1 - y) * MAP_H });
const cityPos: Record<string, { x: number; y: number }> = Object.fromEntries(
  CITIES.map((city) => [city.id, toSvg(city.x, city.y)]),
);
const points = (list: readonly (readonly [number, number])[]) =>
  list.map(([x, y]) => { const p = toSvg(x, y); return `${p.x.toFixed(2)},${p.y.toFixed(2)}`; }).join(" ");

/** 示意的陆地轮廓（含加拿大南部和墨西哥北部），只是底图装饰，和真实地理大致对得上。 */
const LAND = points([
  [0, 1], [0, 0.93], [0.06, 0.9], [0.075, 0.82], [0.06, 0.74], [0.045, 0.64], [0.035, 0.52], [0.03, 0.42],
  [0.06, 0.33], [0.1, 0.26], [0.13, 0.2], [0.15, 0.13], [0.17, 0.06], [0.2, 0], [0.5, 0], [0.53, 0.05],
  [0.56, 0.1], [0.6, 0.125], [0.65, 0.135], [0.7, 0.13], [0.73, 0.15], [0.78, 0.17], [0.83, 0.16],
  [0.86, 0.1], [0.885, 0.05], [0.915, 0.06], [0.93, 0.13], [0.915, 0.23], [0.895, 0.32], [0.91, 0.4],
  [0.935, 0.47], [0.94, 0.55], [0.93, 0.62], [0.955, 0.68], [0.975, 0.75], [0.99, 0.8], [1, 0.84], [1, 1],
]);
const LAKES = [
  [[0.575, 0.7], [0.61, 0.745], [0.65, 0.775], [0.68, 0.78], [0.67, 0.755], [0.63, 0.725], [0.595, 0.7]],
  [[0.665, 0.62], [0.675, 0.7], [0.69, 0.735], [0.7, 0.7], [0.695, 0.64], [0.68, 0.615]],
  [[0.72, 0.7], [0.735, 0.75], [0.755, 0.755], [0.76, 0.72], [0.745, 0.69]],
  [[0.755, 0.655], [0.79, 0.675], [0.815, 0.69], [0.81, 0.675], [0.78, 0.655]],
  [[0.79, 0.735], [0.835, 0.745], [0.84, 0.73], [0.8, 0.722]],
].map((lake) => points(lake as [number, number][]));
const BORDERS = [
  [[0.065, 0.815], [0.6, 0.815], [0.64, 0.78], [0.72, 0.72], [0.79, 0.72], [0.83, 0.8], [0.9, 0.82], [0.96, 0.86]],
  [[0.15, 0.15], [0.3, 0.14], [0.37, 0.15], [0.42, 0.13], [0.47, 0.08], [0.52, 0.035]],
].map((line) => points(line as [number, number][]));

/** 城市名默认写在点的上方；挤在一起的几个换个方向。 */
const LABEL_SIDE: Record<string, "above" | "below" | "left" | "right"> = {
  "kansas-city": "below",
  "saint-louis": "above",
  "oklahoma-city": "below",
  "little-rock": "below",
  houston: "below",
  "new-orleans": "below",
  atlanta: "below",
  charleston: "right",
  nashville: "above",
  raleigh: "right",
  washington: "right",
  pittsburgh: "below",
  "new-york": "right",
  boston: "above",
  toronto: "above",
  chicago: "below",
  "sault-st-marie": "above",
  seattle: "left",
  portland: "left",
  vancouver: "above",
  "san-francisco": "below",
  "los-angeles": "below",
  "el-paso": "below",
  dallas: "right",
  miami: "below",
  omaha: "above",
};

const CITY_R = 0.95;
const CAR_W = 1.1;
const CAR_GAP = 0.34;
const DOUBLE_OFFSET = 0.72;

interface RouteGeom {
  readonly route: RouteDef;
  readonly angle: number;
  readonly cars: readonly { readonly cx: number; readonly cy: number }[];
  readonly carLen: number;
  readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number;
}

/** 每条线路画成 N 节车厢（N = 长度），两头留出城市点的位置；双线路两条平行错开。 */
const GEOM: readonly RouteGeom[] = ROUTES.map((route) => {
  const a = cityPos[route.a]!;
  const b = cityPos[route.b]!;
  const dx = b.x - a.x, dy = b.y - a.y;
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length, uy = dy / length;
  const offset = route.doubleGroup ? (route.parallel === 0 ? -DOUBLE_OFFSET : DOUBLE_OFFSET) : 0;
  const ox = -uy * offset, oy = ux * offset;
  const trim = CITY_R + 0.3;
  const usable = length - 2 * trim;
  const carLen = (usable - CAR_GAP * (route.length - 1)) / route.length;
  const sx = a.x + ox + ux * trim, sy = a.y + oy + uy * trim;
  const cars = Array.from({ length: route.length }, (_, index) => {
    const along = carLen / 2 + index * (carLen + CAR_GAP);
    return { cx: sx + ux * along, cy: sy + uy * along };
  });
  return {
    route,
    angle: (Math.atan2(dy, dx) * 180) / Math.PI,
    cars,
    carLen,
    x1: sx, y1: sy, x2: sx + ux * usable, y2: sy + uy * usable,
  };
});

function useCountdown(room: LobbyRoomSnapshot): number | null {
  const [now, setNow] = useState(Date.now());
  const [anchor, setAnchor] = useState({ at: Date.now(), ms: room.turnRemainingMs });
  useEffect(() => setAnchor({ at: Date.now(), ms: room.turnRemainingMs }), [room]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, []);
  if (anchor.ms === undefined) return null;
  return Math.max(0, Math.ceil((anchor.ms - (now - anchor.at)) / 1000));
}

function cityName(id: string): string {
  return CITIES.find((city) => city.id === id)?.nameZh ?? id;
}

function ticketOf(ticketId: string) {
  return TICKETS.find((entry) => entry.id === ticketId);
}

/** 某玩家铺的线路是否已经把两座城市连起来。 */
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

function describeEvent(event: GameEvent, name: (id: string) => string): string | null {
  switch (event.type) {
    case "TicketsKept":
      return `${name(event.player)} 保留 ${event.kept} 张目的地票${event.discarded > 0 ? `，退回 ${event.discarded} 张` : ""}`;
    case "CardDrawn":
      if (event.source === "faceUp") return `${name(event.player)} 拿了明牌里的 1 张${event.color ? CARD_COLOR_LABEL[event.color] : ""}车票`;
      return event.color
        ? `${name(event.player)} 从牌库摸到 1 张${CARD_COLOR_LABEL[event.color]}车票`
        : `${name(event.player)} 从牌库摸了 1 张车票`;
    case "TicketsTaken":
      return `${name(event.player)} 抽了 ${event.count} 张目的地票`;
    case "RouteClaimed": {
      const route = ROUTES.find((entry) => entry.id === event.routeId);
      const where = route ? `${cityName(route.a)}–${cityName(route.b)}` : event.routeId;
      return `${name(event.player)} 铺了 ${where}（+${event.points} 分，剩 ${event.trainsLeft} 辆火车）`;
    }
    case "LastRoundStarted":
      return `${name(event.player)} 的火车只剩 2 辆或更少，其他人各走最后一回合！`;
    case "GameStarted":
      return `大家选好了目的地票，${name(event.startPlayer)} 先手`;
    case "GameEnded":
      return "游戏结束";
    case "TurnTimedOut":
      return `${name(event.player)} 超时，自动行动`;
    default:
      return null;
  }
}

function GameBoard({ room, busy, error, notice, brand, connection, themeToggle, chat, onCommand, onRematch, onDissolve, watchId, onWatch, onLeave }: GameBoardProps) {
  const game = room.game!;
  const member = room.members.find((candidate) => candidate.id === socket.id);
  // 观战的人没有座位：牌桌按 watchId 那位玩家的座位摆（me 就是他），但什么都不能点，也不叫「你」。
  const spectating = !member;
  const myId = member?.playerId ?? watchId;
  const selfId = spectating ? "" : myId;
  const isHost = member?.isHost ?? false;
  const me = game.players.find((player) => player.id === myId);
  const current = game.players[game.currentPlayer];
  const choosingStart = game.phase === "tickets";
  const myTurn = !spectating && game.phase === "playing" && current?.id === myId;
  // 观战没开「看手牌」时，被看的那位玩家的手牌和目的地票只看得到张数。
  const handHidden = spectating && !room.access.spectatorsSeeAll;
  const secondsLeft = useCountdown(room);
  // 「对局已开始」这类提示只留到第一步动作，之后不再一直挂在棋盘上
  const firstVersion = useRef(game.version);
  const shownNotice = game.version === firstVersion.current ? notice : "";

  const seatColor = (playerId: string) => SEAT_COLORS[Math.max(0, game.players.findIndex((player) => player.id === playerId)) % SEAT_COLORS.length]!;
  const nameOf = (playerId: string) => (playerId === selfId ? "你" : game.players.find((player) => player.id === playerId)?.name ?? "?");
  const connected = (playerId: string) => room.members.find((candidate) => candidate.playerId === playerId)?.connected ?? false;

  const [claim, setClaim] = useState<{ routeId: string; color: TrainColor | null } | null>(null);
  useEffect(() => setClaim(null), [game.version]);
  /** 鼠标停在某张目的地票上时，地图上标出它的两座城市。 */
  const [highlight, setHighlight] = useState<{ a: string; b: string } | null>(null);

  const [log, setLog] = useState<{ key: string; text: string }[]>([]);
  const loggedVersion = useRef(game.version);
  useEffect(() => {
    if (game.version === loggedVersion.current) return;
    loggedVersion.current = game.version;
    const lines = game.events
      .map((event, index) => ({ key: `${game.version}-${index}`, text: describeEvent(event, nameOf) }))
      .filter((line): line is { key: string; text: string } => line.text !== null);
    // 最新的一步排在最上面；同一步里的几条按发生顺序
    setLog((previous) => [...lines, ...previous].slice(0, 40));
  }, [game.version]);

  const pendingTicketChoice = game.pending?.type === "ticketChoice";
  const pendingSecondDraw = game.pending?.type === "secondDraw";
  // 抽了第一张牌、或正在挑目的地票时，不能再去铺路
  const canClaimNow = myTurn && !busy && !game.pending;

  const ownerOf = (routeId: string) => game.claimedRoutes.find((entry) => entry.routeId === routeId);
  const countOf = (color: CardColor) => me?.trainCards.filter((card) => card === color).length ?? 0;

  /** 双线路在 2–3 人局里，另一边被铺了就不能再用。 */
  const blocked = (route: RouteDef): boolean => {
    if (game.players.length > 3 || !route.doubleGroup) return false;
    const sibling = ROUTES.find((entry) => entry.id !== route.id && entry.doubleGroup === route.doubleGroup);
    return Boolean(sibling && ownerOf(sibling.id));
  };

  const affordColorForGray = (route: RouteDef): TrainColor | null => {
    // 先挑张数最多的颜色，火车头留到最后补
    const best = [...TRAIN_COLORS].sort((a, b) => countOf(b) - countOf(a))[0]!;
    return countOf(best) + countOf(LOCOMOTIVE) >= route.length ? best : null;
  };

  const affordable = (route: RouteDef): boolean => {
    if (ownerOf(route.id) || blocked(route)) return false;
    if (!me || me.trainsLeft < route.length) return false;
    if (route.color === "gray") return affordColorForGray(route) !== null;
    return countOf(route.color) + countOf(LOCOMOTIVE) >= route.length;
  };

  function clickRoute(route: RouteDef) {
    if (!canClaimNow) return;
    setClaim({ routeId: route.id, color: route.color === "gray" ? affordColorForGray(route) : route.color });
  }

  function confirmClaim() {
    if (!claim || !claim.color) return;
    onCommand({ type: "CLAIM_ROUTE", routeId: claim.routeId, color: claim.color });
  }

  const drawDeck = () => { if (myTurn && !busy) onCommand({ type: "DRAW_CARD", source: { kind: "deck" } }); };
  const drawFaceUp = (index: number) => { if (myTurn && !busy) onCommand({ type: "DRAW_CARD", source: { kind: "faceUp", index } }); };
  const drawTickets = () => { if (myTurn && !busy) onCommand({ type: "DRAW_TICKETS" }); };

  const claimRoute = claim ? ROUTES.find((entry) => entry.id === claim.routeId)! : null;
  const claimCost = claimRoute && claim?.color
    ? (() => {
      const useColor = Math.min(claimRoute.length, countOf(claim.color));
      return { useColor, useLoco: claimRoute.length - useColor };
    })()
    : null;

  let prompt: string;
  if (game.phase === "finished") prompt = "游戏结束";
  else if (choosingStart) prompt = spectating ? "开局：大家在同时挑目的地票" : me && me.pendingTickets.length > 0 ? "开局：从 3 张目的地票里至少留 2 张（大家同时选）" : "你选好了，等其他玩家选完目的地票…";
  else if (myTurn && pendingTicketChoice) prompt = "选目的地票：至少保留 1 张";
  else if (myTurn && pendingSecondDraw) prompt = "再抽一张：点牌库或明牌（明牌火车头这次不能拿）";
  else if (claim && claimRoute) prompt = `铺 ${cityName(claimRoute.a)}–${cityName(claimRoute.b)}（${claimRoute.length} 节，+${ROUTE_SCORES[claimRoute.length]} 分）`;
  else if (myTurn) prompt = "轮到你了：抽 2 张车票、抽目的地票，或在地图上点一条亮起的线路铺路";
  else prompt = `等待 ${current?.name ?? ""} 行动…`;

  return (
    <div className="ttr-screen">
      <header className="ttr-topbar">
        {brand}
        <div className="ttr-turn">
          {choosingStart ? <span>开局选票</span> : <span>第 {game.turn} 回合</span>}
          {game.finalRound && game.phase !== "finished" && <span className="ttr-last-round">最后一轮</span>}
          {game.phase === "playing" && current && (
            <span className={myTurn ? "ttr-turn-who mine" : "ttr-turn-who"}>
              <i style={{ background: seatColor(current.id) }} />
              {myTurn ? "轮到你" : `轮到 ${current.name}`}
            </span>
          )}
          {game.phase !== "finished" && secondsLeft !== null && <b className={secondsLeft <= 10 ? "ttr-timer low" : "ttr-timer"}>{secondsLeft}s</b>}
        </div>
        <div className="ttr-topbar-right">
          {themeToggle}
          <GameRules />
          <GameRoomMenu room={room} />
          {isHost && <button className="quiet-button danger" type="button" onClick={onDissolve}>解散</button>}
          {connection}
        </div>
      </header>

      <div className="ttr-layout">
        <section className="ttr-map-area">
          <div className={myTurn ? "ttr-prompt mine" : "ttr-prompt"} role="status">
            <span className="ttr-prompt-text">{prompt}</span>
            {claim && claimRoute && (
              <span className="ttr-prompt-buttons">
                {claimRoute.color === "gray" && (
                  <span className="ttr-color-pick" role="group" aria-label="选择用哪种颜色铺灰线路">
                    {TRAIN_COLORS.map((color) => {
                      const ok = countOf(color) > 0 && countOf(color) + countOf(LOCOMOTIVE) >= claimRoute.length;
                      if (!ok) return null;
                      return (
                        <button
                          key={color}
                          type="button"
                          className={claim.color === color ? "ttr-swatch picked" : "ttr-swatch"}
                          style={{ background: COLOR_HEX[color] }}
                          onClick={() => setClaim({ routeId: claim.routeId, color })}
                          title={`用${TRAIN_COLOR_NAMES[color]}色（手里 ${countOf(color)} 张）`}
                          aria-label={TRAIN_COLOR_NAMES[color]}
                        />
                      );
                    })}
                  </span>
                )}
                {claimCost && claim.color && (
                  <span className="ttr-cost">
                    花 {claimCost.useColor > 0 ? `${claimCost.useColor} 张${TRAIN_COLOR_NAMES[claim.color]}` : ""}
                    {claimCost.useColor > 0 && claimCost.useLoco > 0 ? " + " : ""}
                    {claimCost.useLoco > 0 ? `${claimCost.useLoco} 张火车头` : ""}
                  </span>
                )}
                <button className="primary-button" type="button" disabled={!claim.color || busy} onClick={confirmClaim}>铺路</button>
                <button className="quiet-button" type="button" onClick={() => setClaim(null)}>取消</button>
              </span>
            )}
          </div>
          {(error || shownNotice) && <p className={error ? "ttr-feedback error" : "ttr-feedback"} role={error ? "alert" : "status"}>{error || shownNotice}</p>}
          <MapView
            game={game}
            acting={canClaimNow}
            seatColor={seatColor}
            claimable={(route) => canClaimNow && affordable(route)}
            blocked={blocked}
            selectedRouteId={claim?.routeId ?? null}
            highlight={highlight}
            onRouteClick={clickRoute}
          />
          <p className="ttr-map-hint">
            轮到你时，铺不起的线路会变暗，点亮着的线路就能铺；灰色线路任意一种颜色都能铺{game.players.length <= 3 ? "；2–3 人局双线路只能用一边" : ""}。
            <span className="ttr-swipe-hint">地图可以左右滑动。</span>
          </p>
        </section>

        <aside className="ttr-side">
          {spectating && <SpectateBar room={room} watchId={myId} onWatch={onWatch} onLeave={onLeave} />}
          <Players game={game} myId={selfId} seatColor={seatColor} connected={connected} />
          <section className="ttr-panel ttr-faceup">
            <h3>抽车票 <small>{game.remainingCards !== undefined ? `牌库剩 ${game.remainingCards} 张` : ""}</small></h3>
            <div className="ttr-faceup-row">
              <button className="ttr-deck" type="button" disabled={!myTurn || busy || pendingTicketChoice || (game.remainingCards ?? 1) === 0} onClick={drawDeck} title="从牌库摸一张（看不到是什么）">
                <span>牌库</span>
              </button>
              {game.faceUp.map((card, index) => {
                const locoLocked = card === LOCOMOTIVE && pendingSecondDraw;
                return (
                  <button
                    key={index}
                    className="ttr-card"
                    type="button"
                    disabled={!myTurn || busy || pendingTicketChoice || locoLocked}
                    onClick={() => drawFaceUp(index)}
                    title={locoLocked ? "第二张不能拿明牌火车头" : `${CARD_COLOR_LABEL[card]}${card === LOCOMOTIVE ? "（万能牌；拿了就只能拿这 1 张）" : ""}`}
                  >
                    <CardFace color={card} />
                  </button>
                );
              })}
            </div>
            <button
              className="ttr-secondary-button"
              type="button"
              disabled={!myTurn || busy || Boolean(game.pending) || (game.remainingTickets ?? 0) === 0}
              onClick={drawTickets}
            >
              抽 3 张目的地票{game.remainingTickets !== undefined ? `（票堆剩 ${game.remainingTickets}）` : ""}
            </button>
          </section>
          {me && <MyHand player={me} owner={spectating ? me.name : null} hidden={handHidden} />}
          {me && <MyTickets game={game} player={me} onHover={setHighlight} owner={spectating ? me.name : null} hidden={handHidden && game.phase !== "finished"} />}
          <section className="ttr-panel ttr-log">
            <h3>动作记录</h3>
            {log.length === 0 ? <p className="ttr-muted">还没有动作。</p> : <ul>{log.map((line) => <li key={line.key}>{line.text}</li>)}</ul>}
          </section>
          <div className="ttr-chat">{chat}</div>
        </aside>
      </div>

      {!spectating && choosingStart && me && me.pendingTickets.length > 0 && (
        <TicketModal
          title="开局目的地票"
          hint={`至少保留 ${game.config.startTicketsKeepMin} 张，其他玩家也在同时选`}
          drawn={me.pendingTickets}
          minKeep={game.config.startTicketsKeepMin}
          busy={busy}
          onConfirm={(keep) => onCommand({ type: "KEEP_TICKETS", keep })}
        />
      )}
      {myTurn && pendingTicketChoice && game.pending?.type === "ticketChoice" && (
        <TicketModal
          title="抽到的目的地票"
          hint={`至少保留 ${game.config.ticketsKeepMin} 张；没完成的票终局要倒扣分`}
          drawn={game.pending.drawn}
          minKeep={game.config.ticketsKeepMin}
          busy={busy}
          onConfirm={(keep) => onCommand({ type: "KEEP_TICKETS", keep })}
        />
      )}
      {game.phase === "finished" && <FinalDialog game={game} room={room} myId={selfId} seatColor={seatColor} spectating={spectating} onRematch={onRematch} onLeave={onLeave} />}
    </div>
  );
}

// ---------- 地图 ----------

function MapBase() {
  return (
    <>
      <rect width={MAP_W} height={MAP_H} className="ttr-map-sea" />
      <polygon points={LAND} className="ttr-map-land" />
      {LAKES.map((lake, index) => <polygon key={index} points={lake} className="ttr-map-sea" />)}
      {BORDERS.map((line, index) => <polyline key={index} points={line} className="ttr-map-border" />)}
    </>
  );
}

function MapView({
  game, acting, seatColor, claimable, blocked, selectedRouteId, highlight, onRouteClick,
}: {
  game: GameState;
  acting: boolean;
  seatColor: (id: string) => string;
  claimable: (route: RouteDef) => boolean;
  blocked: (route: RouteDef) => boolean;
  selectedRouteId: string | null;
  highlight: { a: string; b: string } | null;
  onRouteClick: (route: RouteDef) => void;
}) {
  const ownerMap = useMemo(() => new Map(game.claimedRoutes.map((entry) => [entry.routeId, entry.playerId])), [game.claimedRoutes]);
  const ha = highlight ? cityPos[highlight.a] : undefined;
  const hb = highlight ? cityPos[highlight.b] : undefined;

  return (
    <div className={acting ? "ttr-map acting" : "ttr-map"}>
      <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label="美国铁路地图">
        <MapBase />
        {GEOM.map(({ route, angle, cars, carLen, x1, y1, x2, y2 }) => {
          const owner = ownerMap.get(route.id);
          const canClaim = !owner && claimable(route);
          const state = owner ? "owned" : selectedRouteId === route.id ? "selected" : canClaim ? "claimable" : blocked(route) ? "blocked" : "open";
          const fill = owner ? seatColor(owner) : route.color === "gray" ? GRAY_ROUTE : COLOR_HEX[route.color];
          const colorName = route.color === "gray" ? "灰色，任意一种颜色" : `${TRAIN_COLOR_NAMES[route.color as TrainColor]}色`;
          const title = `${cityName(route.a)}–${cityName(route.b)} · ${route.length} 节（${colorName}）· ${ROUTE_SCORES[route.length]} 分`
            + (owner ? ` · 已被${game.players.find((player) => player.id === owner)?.name ?? ""}铺下` : state === "blocked" ? " · 另一边已有人铺，不能再用" : canClaim ? " · 点击铺路" : "");
          return (
            <g key={route.id} className={`ttr-route ${state}`}>
              {cars.map((car, index) => (
                <g key={index} transform={`translate(${car.cx.toFixed(2)} ${car.cy.toFixed(2)}) rotate(${angle.toFixed(1)})`}>
                  <rect className="ttr-car" x={-carLen / 2} y={-CAR_W / 2} width={carLen} height={CAR_W} rx={0.2} fill={fill} />
                  {owner && <rect className="ttr-car-shine" x={-carLen / 2 + 0.35} y={-CAR_W / 2 + 0.22} width={Math.max(0, carLen - 0.7)} height={0.24} />}
                </g>
              ))}
              <line
                className="ttr-route-hit"
                x1={x1} y1={y1} x2={x2} y2={y2}
                onClick={canClaim ? () => onRouteClick(route) : undefined}
              >
                <title>{title}</title>
              </line>
            </g>
          );
        })}
        {ha && hb && <line className="ttr-ticket-line" x1={ha.x} y1={ha.y} x2={hb.x} y2={hb.y} />}
        {CITIES.map((city) => {
          const pos = cityPos[city.id]!;
          const lit = highlight?.a === city.id || highlight?.b === city.id;
          const side = LABEL_SIDE[city.id] ?? "above";
          const label: { x: number; y: number; anchor: "middle" | "start" | "end" } = side === "above" ? { x: pos.x, y: pos.y - 1.55, anchor: "middle" }
            : side === "below" ? { x: pos.x, y: pos.y + 2.75, anchor: "middle" }
            : side === "left" ? { x: pos.x - 1.6, y: pos.y + 0.55, anchor: "end" }
            : { x: pos.x + 1.6, y: pos.y + 0.55, anchor: "start" };
          return (
            <g key={city.id} className={lit ? "ttr-city lit" : "ttr-city"}>
              {lit && <circle className="ttr-city-ring" cx={pos.x} cy={pos.y} r={2} />}
              <circle cx={pos.x} cy={pos.y} r={CITY_R} />
              <text x={label.x} y={label.y} textAnchor={label.anchor} className="ttr-city-label">{city.nameZh}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** 目的地票上的小地图：标出两座城市和它们之间的直线。 */
function TicketMap({ a, b }: { a: string; b: string }) {
  const pa = cityPos[a]!;
  const pb = cityPos[b]!;
  return (
    <svg className="ttr-ticket-map" viewBox={`0 0 ${MAP_W} ${MAP_H}`} aria-hidden="true">
      <MapBase />
      {CITIES.map((city) => <circle key={city.id} cx={cityPos[city.id]!.x} cy={cityPos[city.id]!.y} r={1} className="ttr-ticket-dot" />)}
      <line x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y} className="ttr-ticket-map-line" />
      <circle cx={pa.x} cy={pa.y} r={3} className="ttr-ticket-end" />
      <circle cx={pb.x} cy={pb.y} r={3} className="ttr-ticket-end" />
    </svg>
  );
}

// ---------- 目的地票选择 ----------

function TicketModal({ title, hint, drawn, minKeep, busy, onConfirm }: { title: string; hint: string; drawn: string[]; minKeep: number; busy: boolean; onConfirm: (keep: number[]) => void }) {
  const [selected, setSelected] = useState<number[]>(drawn.map((_, index) => index));
  useEffect(() => setSelected(drawn.map((_, index) => index)), [drawn.join(",")]);
  const toggle = (index: number) => {
    setSelected((current) => current.includes(index) ? current.filter((entry) => entry !== index) : [...current, index]);
  };
  const canConfirm = selected.length >= minKeep && !busy;
  return (
    <div className="gm-modal-backdrop" role="presentation">
      <section className="gm-panel ttr-ticket-modal" role="dialog" aria-modal="true" aria-labelledby="ttr-ticket-title">
        <h2 id="ttr-ticket-title">{title}</h2>
        <p className="ttr-muted">{hint} · 点票切换保留 / 退回</p>
        <div className="ttr-ticket-list">
          {drawn.map((ticketId, index) => {
            const ticket = ticketOf(ticketId);
            const kept = selected.includes(index);
            return (
              <button key={`${ticketId}-${index}`} type="button" className={kept ? "ttr-ticket kept" : "ttr-ticket dropped"} onClick={() => toggle(index)} aria-pressed={kept}>
                {ticket && <TicketMap a={ticket.a} b={ticket.b} />}
                <span className="ttr-ticket-route">
                  {ticket ? <>{cityName(ticket.a)} ↔ {cityName(ticket.b)}</> : ticketId}
                  <b>{ticket?.points ?? 0} 分</b>
                </span>
                <span className="ttr-ticket-state">{kept ? "保留" : "退回"}</span>
              </button>
            );
          })}
        </div>
        <div className="gm-panel-actions">
          <button className="primary-button" type="button" disabled={!canConfirm} onClick={() => onConfirm(selected)}>
            确定（保留 {selected.length} 张）
          </button>
        </div>
      </section>
    </div>
  );
}

// ---------- 我的手牌 / 我的目的地票 ----------

const HAND_ORDER: readonly CardColor[] = [...TRAIN_COLORS, LOCOMOTIVE];

/** owner：观战时是被看的那位玩家的名字（自己看时为 null）；hidden：观战看不到手牌，只显示张数。 */
function MyHand({ player, owner, hidden }: { player: Player; owner: string | null; hidden: boolean }) {
  const groups = HAND_ORDER
    .map((color) => [color, player.trainCards.filter((card) => card === color).length] as const)
    .filter(([, count]) => count > 0);
  return (
    <section className="ttr-panel ttr-hand">
      <h3>{owner ? `${owner}的手牌` : "我的手牌"} <small>{player.handCount ?? player.trainCards.length} 张 · 火车 {player.trainsLeft} 辆</small></h3>
      {hidden ? <p className="ttr-muted">观战看不到手牌。</p> : groups.length === 0 ? <p className="ttr-muted">还没有车票。</p> : (
        <div className="ttr-hand-row">
          {groups.map(([color, count]) => (
            <span className="ttr-hand-card" key={color} title={`${CARD_COLOR_LABEL[color]} × ${count}`}>
              <CardFace color={color} />
              <b>{count}</b>
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

function MyTickets({ game, player, onHover, owner, hidden }: {
  game: GameState;
  player: Player;
  onHover: (pair: { a: string; b: string } | null) => void;
  /** 观战时是被看的那位玩家的名字。 */
  owner: string | null;
  /** 观战看不到目的地票，只显示张数。 */
  hidden: boolean;
}) {
  const done = player.tickets.filter((id) => { const t = ticketOf(id); return t && linked(game.claimedRoutes, player.id, t.a, t.b); }).length;
  return (
    <section className="ttr-panel ttr-my-tickets">
      <h3>{owner ? `${owner}的目的地票` : "我的目的地票"} <small>{hidden ? `${player.ticketCount ?? 0} 张` : player.tickets.length > 0 ? `已连通 ${done} / ${player.tickets.length}` : ""}</small></h3>
      {hidden ? <p className="ttr-muted">观战看不到目的地票，终局才公开。</p> : player.tickets.length === 0 ? <p className="ttr-muted">还没有目的地票。</p> : (
        <ul onMouseLeave={() => onHover(null)}>
          {player.tickets.map((ticketId) => {
            const ticket = ticketOf(ticketId);
            if (!ticket) return null;
            const ok = linked(game.claimedRoutes, player.id, ticket.a, ticket.b);
            return (
              <li key={ticketId} className={ok ? "done" : ""} onMouseEnter={() => onHover({ a: ticket.a, b: ticket.b })}>
                <span>{cityName(ticket.a)} ↔ {cityName(ticket.b)}</span>
                <b>{ticket.points}</b>
                <i>{ok ? "✓ 已连通" : "未连通"}</i>
              </li>
            );
          })}
        </ul>
      )}
      {player.tickets.length > 0 && <p className="ttr-muted ttr-tip">鼠标停在票上，地图会标出两座城市。</p>}
    </section>
  );
}

// ---------- 玩家列表 ----------

function Players({ game, myId, seatColor, connected }: { game: GameState; myId: string; seatColor: (id: string) => string; connected: (id: string) => boolean }) {
  return (
    <section className="ttr-panel ttr-players">
      <h3>玩家 <small>{game.phase === "finished" ? "最终得分" : "分数为已铺线路分"}</small></h3>
      {game.players.map((player, index) => {
        const active = game.phase === "playing" && game.currentPlayer === index;
        const choosing = game.phase === "tickets" && (player.ticketCount ?? player.tickets.length) === 0;
        return (
          <div className={["ttr-player", active ? "active" : "", !connected(player.id) ? "offline" : ""].join(" ")} key={player.id}>
            <i className="ttr-seat" style={{ background: seatColor(player.id) }} />
            <div className="ttr-player-main">
              <strong>
                {player.name}
                {player.id === myId && <small className="ttr-you">你</small>}
                {!connected(player.id) && <small className="ttr-offline">离线</small>}
              </strong>
              <span className="ttr-player-stats">
                {game.phase === "tickets"
                  ? (choosing ? "正在选目的地票…" : "已选好目的地票")
                  : `火车 ${player.trainsLeft} · 手牌 ${player.handCount ?? player.trainCards.length} · 目的地票 ${player.ticketCount ?? player.tickets.length}`}
              </span>
            </div>
            <span className="ttr-score">{player.score}</span>
          </div>
        );
      })}
    </section>
  );
}

// ---------- 终局 ----------

function FinalDialog({ game, room, myId, seatColor, spectating, onRematch, onLeave }: {
  game: GameState;
  room: LobbyRoomSnapshot;
  myId: string;
  seatColor: (id: string) => string;
  spectating: boolean;
  onRematch: (accept: boolean) => void;
  onLeave: () => void;
}) {
  const result = game.finalResult!;
  const accepted = room.rematch?.acceptedIds.includes(socket.id ?? "") ?? false;
  const rows = [...result.scores].sort((a, b) => b.score - a.score);
  return (
    <div className="gm-modal-backdrop" role="presentation">
      <section className="gm-panel ttr-final" role="dialog" aria-modal="true" aria-labelledby="ttr-final-title">
        <h2 id="ttr-final-title">游戏结束</h2>
        <ol className="ttr-standings">
          {rows.map((score) => {
            const player = game.players.find((entry) => entry.id === score.player)!;
            const winner = result.winners.includes(score.player);
            return (
              <li key={score.player} className={winner ? "winner" : ""}>
                <div className="ttr-standing-head">
                  <i className="ttr-seat" style={{ background: seatColor(score.player) }} />
                  <strong>{winner ? "🏆 " : ""}{player.name}{score.player === myId ? "（你）" : ""}</strong>
                  <span className="ttr-standing-total">{score.score} 分</span>
                </div>
                <div className="ttr-standing-detail">
                  线路 +{score.routePoints} · 目的地票 {score.ticketPoints >= 0 ? "+" : ""}{score.ticketPoints}
                  {score.longestBonus > 0 ? ` · 最长铁路 +${score.longestBonus}` : ""}
                  <small>（最长连续铁路 {score.longestPath} 节）</small>
                </div>
                {player.tickets.length > 0 && (
                  <ul className="ttr-standing-tickets">
                    {player.tickets.map((ticketId) => {
                      const ticket = ticketOf(ticketId);
                      if (!ticket) return null;
                      const ok = linked(game.claimedRoutes, player.id, ticket.a, ticket.b);
                      return (
                        <li key={ticketId} className={ok ? "done" : "failed"}>
                          {ok ? "✓" : "✗"} {cityName(ticket.a)}–{cityName(ticket.b)} {ok ? "+" : "−"}{ticket.points}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ol>
        {spectating ? (
          <div className="ttr-rematch">
            <span>{room.rematch ? `等玩家决定要不要再来一局（${room.rematch.acceptedIds.length}/${room.members.length} 人同意）` : "对局结束"}</span>
            <div className="gm-panel-actions">
              <button className="quiet-button" type="button" onClick={onLeave}>离开观战</button>
            </div>
          </div>
        ) : room.rematch && (
          <div className="ttr-rematch">
            <span>再来一局？还剩 {Math.ceil(room.rematch.remainingMs / 1000)} 秒（{room.rematch.acceptedIds.length}/{room.members.length} 人同意）</span>
            <div className="gm-panel-actions">
              <button className="quiet-button" type="button" onClick={() => onRematch(false)}>离开</button>
              <button className="primary-button" type="button" disabled={accepted} onClick={() => onRematch(true)}>{accepted ? "等待其他人" : "再来一局"}</button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

export default GameBoard;
