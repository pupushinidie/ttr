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
  type GameCommand,
  type GameEvent,
  type GameState,
  type LobbyRoomSnapshot,
  type Player,
  type RouteDef,
  type TrainColor,
} from "@ttr/game";
import { cardArt } from "./art.js";
import GameRules from "./GameRules.js";
import { socket } from "./socket.js";

interface GameBoardProps {
  readonly room: LobbyRoomSnapshot;
  readonly busy: boolean;
  readonly error: string;
  readonly notice: string;
  readonly brand: ReactNode;
  readonly connection: ReactNode;
  readonly chat: ReactNode;
  readonly onCommand: (command: GameCommand) => void;
  readonly onRematch: (accept: boolean) => void;
  readonly onDissolve: () => void;
}

/** 8 种车票颜色的界面实色（灰线路、牌背、高亮等）。 */
const COLOR_HEX: Record<TrainColor, string> = {
  purple: "#8a63d2",
  blue: "#3b6fd4",
  orange: "#e8833a",
  white: "#e8e4da",
  green: "#3f9e5a",
  yellow: "#e0b23c",
  black: "#3a3a40",
  red: "#c8453c",
};

const SEAT_COLORS = ["#e8833a", "#3fb6c9", "#d65db1", "#9ccf4a", "#8a63d2"];
const CARD_COLOR_LABEL: Record<CardColor, string> = { ...TRAIN_COLOR_NAMES, locomotive: "火车头" };

// ---- 地图几何：城市归一化坐标 → SVG 视口坐标 ----
const MAP_W = 100;
const MAP_H = 74;
const cityPos: Record<string, { x: number; y: number }> = Object.fromEntries(
  CITIES.map((city) => [city.id, { x: city.x * MAP_W, y: (1 - city.y) * MAP_H }]),
);

interface RouteGeom {
  readonly route: RouteDef;
  readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number;
}
const GEOM: readonly RouteGeom[] = ROUTES.map((route) => {
  const a = cityPos[route.a]!;
  const b = cityPos[route.b]!;
  let x1 = a.x, y1 = a.y, x2 = b.x, y2 = b.y;
  if (route.doubleGroup) {
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    const off = route.parallel === 0 ? -1.3 : 1.3;
    x1 += nx * off; y1 += ny * off; x2 += nx * off; y2 += ny * off;
  }
  return { route, x1, y1, x2, y2 };
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

function ticketText(ticketId: string): string {
  const ticket = TICKETS.find((entry) => entry.id === ticketId);
  return ticket ? `${cityName(ticket.a)} ↔ ${cityName(ticket.b)}（${ticket.points} 分）` : ticketId;
}

function describeEvent(event: GameEvent, name: (id: string) => string): string | null {
  switch (event.type) {
    case "TicketsKept":
      return `${name(event.player)} 保留 ${event.kept} 张目的地票${event.discarded > 0 ? `，弃掉 ${event.discarded} 张` : ""}`;
    case "CardDrawn": {
      const from = event.source === "deck" ? "牌库" : "明牌区";
      return `${name(event.player)} 从${from}抽了 1 张${CARD_COLOR_LABEL[event.color]}车票`;
    }
    case "TicketsTaken":
      return `${name(event.player)} 抽了 ${event.count} 张目的地票`;
    case "RouteClaimed": {
      const route = ROUTES.find((entry) => entry.id === event.routeId);
      const where = route ? `${cityName(route.a)}–${cityName(route.b)}` : event.routeId;
      return `${name(event.player)} 铺了 ${where}（${event.points} 分，剩 ${event.trainsLeft} 辆火车）`;
    }
    case "LastRoundStarted":
      return `${name(event.player)} 的火车只剩 2 辆或更少，进入最后一轮！`;
    case "GameStarted":
      return `对局开始，${name(event.startPlayer)} 先手`;
    case "GameEnded":
      return "游戏结束";
    case "TurnTimedOut":
      return `${name(event.player)} 超时，自动行动`;
    default:
      return null;
  }
}

function GameBoard({ room, busy, error, notice, brand, connection, chat, onCommand, onRematch, onDissolve }: GameBoardProps) {
  const game = room.game!;
  const member = room.members.find((candidate) => candidate.id === socket.id);
  const myId = member?.playerId ?? "";
  const isHost = member?.isHost ?? false;
  const me = game.players.find((player) => player.id === myId);
  const current = game.players[game.currentPlayer];
  const myTurn = game.phase !== "finished" && current?.id === myId;
  const secondsLeft = useCountdown(room);

  const seatColor = (playerId: string) => SEAT_COLORS[Math.max(0, game.players.findIndex((player) => player.id === playerId)) % SEAT_COLORS.length]!;
  const nameOf = (playerId: string) => (playerId === myId ? "你" : game.players.find((player) => player.id === playerId)?.name ?? "?");
  const connected = (playerId: string) => room.members.find((candidate) => candidate.playerId === playerId)?.connected ?? false;

  const [claim, setClaim] = useState<{ routeId: string; color: TrainColor | null } | null>(null);
  useEffect(() => setClaim(null), [game.version]);

  const [log, setLog] = useState<{ key: string; text: string }[]>([]);
  const loggedVersion = useRef(game.version);
  useEffect(() => {
    if (game.version === loggedVersion.current) return;
    loggedVersion.current = game.version;
    const lines = game.events
      .map((event, index) => ({ key: `${game.version}-${index}`, text: describeEvent(event, nameOf) }))
      .filter((line): line is { key: string; text: string } => line.text !== null);
    setLog((previous) => [...lines.reverse(), ...previous].slice(0, 40));
  }, [game.version]);

  const canAct = myTurn && !busy && !claim;
  const pendingTicketChoice = game.pending?.type === "ticketChoice";
  const pendingSecondDraw = game.pending?.type === "secondDraw";

  const ownerOf = (routeId: string) => game.claimedRoutes.find((entry) => entry.routeId === routeId);

  const affordColorForGray = (route: RouteDef): TrainColor | null => {
    const locos = me ? me.trainCards.filter((card) => card === LOCOMOTIVE).length : 0;
    for (const color of TRAIN_COLORS) {
      const count = me ? me.trainCards.filter((card) => card === color).length : 0;
      if (count + locos >= route.length) return color;
    }
    return null;
  };

  const affordable = (route: RouteDef): boolean => {
    if (ownerOf(route.id)) return false;
    if (!me || me.trainsLeft < route.length) return false;
    if (game.players.length <= 3 && route.doubleGroup) {
      const sibling = ROUTES.find((entry) => entry.id !== route.id && entry.doubleGroup === route.doubleGroup);
      if (sibling && ownerOf(sibling.id)) return false;
    }
    if (route.color === "gray") return affordColorForGray(route) !== null;
    const locos = me.trainCards.filter((card) => card === LOCOMOTIVE).length;
    const count = me.trainCards.filter((card) => card === route.color).length;
    return count + locos >= route.length;
  };

  function clickRoute(route: RouteDef) {
    if (!canAct) return;
    if (route.color === "gray") {
      setClaim({ routeId: route.id, color: affordColorForGray(route) });
    } else {
      setClaim({ routeId: route.id, color: route.color });
    }
  }

  function confirmClaim() {
    if (!claim || !claim.color) return;
    onCommand({ type: "CLAIM_ROUTE", routeId: claim.routeId, color: claim.color });
  }

  function drawDeck() {
    if (!myTurn || busy) return;
    onCommand({ type: "DRAW_CARD", source: { kind: "deck" } });
  }
  function drawFaceUp(index: number) {
    if (!myTurn || busy) return;
    onCommand({ type: "DRAW_CARD", source: { kind: "faceUp", index } });
  }
  function drawTickets() {
    if (!myTurn || busy) return;
    onCommand({ type: "DRAW_TICKETS" });
  }

  const claimRoute = claim ? ROUTES.find((entry) => entry.id === claim.routeId)! : null;

  let prompt = "";
  if (game.phase === "finished") prompt = "游戏结束";
  else if (pendingTicketChoice) prompt = "请保留至少一张目的地票";
  else if (pendingSecondDraw) prompt = "再抽一张牌（或点牌库/明牌）";
  else if (claim) prompt = `确认铺设 ${cityName(claimRoute!.a)}–${cityName(claimRoute!.b)}？`;
  else if (!myTurn) prompt = `等待 ${current?.name ?? ""} 行动`;
  else prompt = "轮到你了：抽牌、抽目的地票，或点地图铺路";

  return (
    <div className="ttr-screen">
      <header className="ttr-topbar">
        {brand}
        <div className="ttr-turn">
          <span>回合 {game.turn}</span>
          {game.phase !== "finished" && current && (
            <span className={myTurn ? "ttr-turn-who mine" : "ttr-turn-who"}>
              <i style={{ background: seatColor(current.id) }} />
              {myTurn ? "轮到你" : `轮到 ${current.name}`}
              {secondsLeft !== null && <b className={secondsLeft <= 10 ? "ttr-timer low" : "ttr-timer"}>{secondsLeft}s</b>}
            </span>
          )}
        </div>
        <div className="ttr-topbar-right">
          <GameRules />
          {isHost && <button className="quiet-button danger" type="button" onClick={onDissolve}>解散</button>}
          {connection}
        </div>
      </header>

      <div className="ttr-layout">
        <section className="ttr-map-area">
          <MapView
            game={game}
            myTurn={canAct}
            seatColor={seatColor}
            affordable={affordable}
            selectedRouteId={claim?.routeId ?? null}
            onRouteClick={clickRoute}
          />
          <div className="ttr-prompt">
            <span>{prompt}</span>
            {claim && (
              <span className="ttr-prompt-buttons">
                {claimRoute?.color === "gray" && (
                  <span className="ttr-color-pick" role="group" aria-label="选择灰线路颜色">
                    {TRAIN_COLORS.map((color) => {
                      const locos = me?.trainCards.filter((card) => card === LOCOMOTIVE).length ?? 0;
                      const count = me?.trainCards.filter((card) => card === color).length ?? 0;
                      const ok = count + locos >= (claimRoute?.length ?? 0);
                      return (
                        <button
                          key={color}
                          type="button"
                          className={claim.color === color ? "ttr-swatch picked" : "ttr-swatch"}
                          style={{ background: COLOR_HEX[color] }}
                          disabled={!ok}
                          onClick={() => setClaim({ routeId: claim.routeId, color })}
                          aria-label={TRAIN_COLOR_NAMES[color]}
                        />
                      );
                    })}
                  </span>
                )}
                <button className="primary-button" type="button" disabled={!claim.color} onClick={confirmClaim}>
                  铺路 {claimRoute ? `${claimRoute.length} 张 · +${ROUTE_SCORES[claimRoute.length]} 分` : ""}
                </button>
                <button className="quiet-button" type="button" onClick={() => setClaim(null)}>取消</button>
              </span>
            )}
          </div>
          {(error || notice) && <p className={error ? "ttr-feedback error" : "ttr-feedback"} role={error ? "alert" : "status"}>{error || notice}</p>}
        </section>

        <aside className="ttr-side">
          <Players game={game} myId={myId} seatColor={seatColor} connected={connected} />
          <section className="ttr-panel ttr-faceup">
            <h3>明牌区 <small>{game.remainingCards !== undefined ? `牌库剩 ${game.remainingCards} 张` : ""}</small></h3>
            <div className="ttr-faceup-row">
              <button className="ttr-deck" type="button" disabled={!myTurn || busy} onClick={drawDeck} title="从牌库抽一张">
                <span>抽牌</span>
              </button>
              {game.faceUp.map((card, index) => (
                <button
                  key={index}
                  className="ttr-card"
                  type="button"
                  disabled={!myTurn || busy}
                  onClick={() => drawFaceUp(index)}
                  title={`${CARD_COLOR_LABEL[card]}车票${card === LOCOMOTIVE ? "（抽了直接结束回合）" : ""}`}
                >
                  <img src={cardArt[card]} alt={CARD_COLOR_LABEL[card]} draggable={false} />
                </button>
              ))}
            </div>
            <div className="ttr-faceup-actions">
              <button className="ttr-secondary-button" type="button" disabled={!myTurn || busy || (game.remainingTickets ?? 0) === 0} onClick={drawTickets}>
                抽 3 张目的地票
              </button>
            </div>
          </section>
          {me && <MyHand player={me} />}
          {me && <MyTickets player={me} />}
          <section className="ttr-panel ttr-log">
            <h3>动作记录</h3>
            {log.length === 0 ? <p className="ttr-muted">还没有动作。</p> : <ul>{log.map((line) => <li key={line.key}>{line.text}</li>)}</ul>}
          </section>
          <div className="ttr-chat">{chat}</div>
        </aside>
      </div>

      {myTurn && game.phase === "tickets" && me && (
        <TicketModal
          title="开局目的地票"
          hint={`至少保留 ${game.config.startTicketsKeepMin} 张`}
          drawn={me.pendingTickets}
          minKeep={game.config.startTicketsKeepMin}
          onConfirm={(keep) => onCommand({ type: "KEEP_TICKETS", keep })}
        />
      )}
      {myTurn && pendingTicketChoice && (
        <TicketModal
          title="抽到的目的地票"
          hint={`至少保留 ${game.config.ticketsKeepMin} 张`}
          drawn={(game.pending as { drawn: string[] }).drawn}
          minKeep={game.config.ticketsKeepMin}
          onConfirm={(keep) => onCommand({ type: "KEEP_TICKETS", keep })}
        />
      )}
      {game.phase === "finished" && <FinalDialog game={game} room={room} myId={myId} nameOf={nameOf} onRematch={onRematch} />}
    </div>
  );
}

// ---------- 地图 ----------

function MapView({
  game, myTurn, seatColor, affordable, selectedRouteId, onRouteClick,
}: {
  game: GameState;
  myTurn: boolean;
  seatColor: (id: string) => string;
  affordable: (route: RouteDef) => boolean;
  selectedRouteId: string | null;
  onRouteClick: (route: RouteDef) => void;
}) {
  const ownerMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const entry of game.claimedRoutes) map.set(entry.routeId, entry.playerId);
    return map;
  }, [game.claimedRoutes]);

  return (
    <div className="ttr-map">
      <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label="美国铁路地图">
        <rect width={MAP_W} height={MAP_H} className="ttr-map-bg" />
        {GEOM.map(({ route, x1, y1, x2, y2 }) => {
          const owner = ownerMap.get(route.id);
          const isSelected = selectedRouteId === route.id;
          const canClaim = myTurn && affordable(route);
          const stroke = owner ? seatColor(owner) : route.color === "gray" ? "#b9b0a2" : COLOR_HEX[route.color];
          const width = owner ? 3.6 : isSelected ? 3.4 : 2.4;
          const title = `${cityName(route.a)}–${cityName(route.b)} · ${route.length} 节 · ${ROUTE_SCORES[route.length]} 分${route.color === "gray" ? "（灰）" : `（${TRAIN_COLOR_NAMES[route.color as TrainColor]}）`}`;
          return (
            <g key={route.id}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={stroke} strokeWidth={width} strokeLinecap="round" opacity={owner || !canClaim ? 1 : 0.55} />
              {owner && <title>{`${title} · 已铺`}</title>}
              {!owner && canClaim && <line x1={x1} y1={y1} x2={x2} y2={y2} className="ttr-route-hit" strokeWidth={7} onClick={() => onRouteClick(route)}><title>{title}（点击铺路）</title></line>}
              {!owner && !canClaim && <line x1={x1} y1={y1} x2={x2} y2={y2} className="ttr-route-hit" strokeWidth={7}><title>{title}</title></line>}
            </g>
          );
        })}
        {CITIES.map((city) => (
          <g key={city.id} className="ttr-city">
            <circle cx={cityPos[city.id]!.x} cy={cityPos[city.id]!.y} r={1.5} />
            <text x={cityPos[city.id]!.x} y={cityPos[city.id]!.y - 2.4} className="ttr-city-label">{city.nameZh}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

// ---------- 目的地票选择 ----------

function TicketModal({ title, hint, drawn, minKeep, onConfirm }: { title: string; hint: string; drawn: string[]; minKeep: number; onConfirm: (keep: number[]) => void }) {
  const [selected, setSelected] = useState<number[]>(drawn.map((_, index) => index));
  useEffect(() => setSelected(drawn.map((_, index) => index)), [drawn]);
  const toggle = (index: number) => {
    setSelected((current) => current.includes(index) ? current.filter((entry) => entry !== index) : [...current, index]);
  };
  const canConfirm = selected.length >= minKeep;
  return (
    <div className="gm-modal-backdrop" role="presentation">
      <section className="gm-panel ttr-ticket-modal" role="dialog" aria-modal="true" aria-labelledby="ttr-ticket-title">
        <h2 id="ttr-ticket-title">{title}</h2>
        <p className="ttr-muted">{hint} · 点卡片切换保留 / 弃掉</p>
        <div className="ttr-ticket-list">
          {drawn.map((ticketId, index) => {
            const kept = selected.includes(index);
            return (
              <button key={`${ticketId}-${index}`} type="button" className={kept ? "ttr-ticket kept" : "ttr-ticket dropped"} onClick={() => toggle(index)}>
                <span className="ttr-ticket-route">{ticketText(ticketId)}</span>
                <span className="ttr-ticket-state">{kept ? "保留" : "弃掉"}</span>
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

function MyHand({ player }: { player: Player }) {
  const groups = useMemo(() => {
    const counts = new Map<CardColor, number>();
    for (const card of player.trainCards) counts.set(card, (counts.get(card) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [player.trainCards]);
  return (
    <section className="ttr-panel ttr-hand">
      <h3>我的手牌 <small>{player.trainCards.length} 张</small></h3>
      {groups.length === 0 ? <p className="ttr-muted">还没有车票。</p> : (
        <div className="ttr-hand-row">
          {groups.map(([color, count]) => (
            <span className="ttr-hand-card" key={color} title={`${CARD_COLOR_LABEL[color]} × ${count}`}>
              <img src={cardArt[color]} alt={CARD_COLOR_LABEL[color]} draggable={false} />
              <b>{count}</b>
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

function MyTickets({ player }: { player: Player }) {
  return (
    <section className="ttr-panel ttr-my-tickets">
      <h3>我的目的地票 <small>{player.tickets.length} 张</small></h3>
      {player.tickets.length === 0 ? <p className="ttr-muted">还没有目的地票。</p> : (
        <ul>
          {player.tickets.map((ticketId) => <li key={ticketId}>{ticketText(ticketId)}</li>)}
        </ul>
      )}
    </section>
  );
}

// ---------- 玩家列表 ----------

function Players({ game, myId, seatColor, connected }: { game: GameState; myId: string; seatColor: (id: string) => string; connected: (id: string) => boolean }) {
  const standings = [...game.players].sort((a, b) => b.score - a.score);
  return (
    <section className="ttr-panel ttr-players">
      <h3>玩家 <small>按分数</small></h3>
      {standings.map((player) => {
        const active = game.phase !== "finished" && game.currentPlayer === game.players.findIndex((p) => p.id === player.id);
        return (
          <div className={["ttr-player", active ? "active" : "", player.id === myId ? "me" : "", !connected(player.id) ? "offline" : ""].join(" ")} key={player.id}>
            <i className="ttr-seat" style={{ background: seatColor(player.id) }} />
            <strong>{player.name}{player.id === myId && <small>你</small>}</strong>
            {!connected(player.id) && <small>离线</small>}
            <span className="ttr-trains" title="剩余火车">🚂 {player.trainsLeft}</span>
            <span className="ttr-score">{player.score}</span>
          </div>
        );
      })}
    </section>
  );
}

// ---------- 终局 ----------

function FinalDialog({ game, room, myId, nameOf, onRematch }: { game: GameState; room: LobbyRoomSnapshot; myId: string; nameOf: (id: string) => string; onRematch: (accept: boolean) => void }) {
  const result = game.finalResult!;
  const accepted = room.rematch?.acceptedIds.includes(socket.id ?? "") ?? false;
  const standings = [...game.players].sort((a, b) => (result.scores.find((s) => s.player === b.id)?.score ?? b.score) - (result.scores.find((s) => s.player === a.id)?.score ?? a.score));
  return (
    <div className="gm-modal-backdrop" role="presentation">
      <section className="gm-panel ttr-result ttr-final" role="dialog" aria-modal="true" aria-labelledby="ttr-final-title">
        <h2 id="ttr-final-title">游戏结束</h2>
        <ol className="ttr-standings">
          {standings.map((player) => {
            const score = result.scores.find((s) => s.player === player.id);
            const winner = result.winners.includes(player.id);
            return (
              <li key={player.id} className={winner ? "winner" : ""}>
                {winner ? "🏆 " : ""}{player.name}{player.id === myId ? "（你）" : ""}
                {score && (
                  <span className="ttr-score-detail" title={`线路 +${score.routePoints} · 目的地票 ${score.ticketPoints >= 0 ? "+" : ""}${score.ticketPoints} · 最长铁路 +${score.longestBonus}`}>
                    {score.score}<small>（完成 {score.completedTickets} 张票 · 铁路 {score.longestPath}）</small>
                  </span>
                )}
              </li>
            );
          })}
        </ol>
        {room.rematch && (
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
