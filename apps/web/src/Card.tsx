import { TRAIN_COLOR_NAMES, type CardColor, type TrainColor } from "@ttr/game";
import { spriteArt } from "./art.js";

/** 8 种车票颜色的界面实色（地图线路、牌面、选色按钮共用）。 */
export const COLOR_HEX: Record<TrainColor, string> = {
  purple: "#8a63d2",
  blue: "#3b6fd4",
  orange: "#e8833a",
  white: "#e8e4da",
  green: "#3f9e5a",
  yellow: "#e0b23c",
  black: "#3a3a40",
  red: "#c8453c",
};

export const CARD_COLOR_LABEL: Record<CardColor, string> = { ...TRAIN_COLOR_NAMES, locomotive: "火车头" };

/** 牌角的字：颜色名，火车头写「万」（万能牌）。 */
const CORNER: Record<CardColor, string> = { ...TRAIN_COLOR_NAMES, locomotive: "万" };

/** 一张车票牌面：底色由 CSS 按颜色画，上面叠一节透明底的像素车厢。 */
export function CardFace({ color }: { color: CardColor }) {
  return (
    <span className={`ttr-cardface ttr-cardface-${color}`}>
      <img src={spriteArt[color]} alt="" draggable={false} />
      <em>{CORNER[color]}</em>
    </span>
  );
}
