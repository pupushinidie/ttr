import type { CardColor } from "@ttr/game";

/**
 * 像素美术的地址。图片放在 public/art 下（PixelLab 生成，art/generate_ttr.py 导出）。
 * 图片地址固定；换图后不会被浏览器缓存挡住，靠服务器给这些文件加 Cache-Control: no-cache。
 */
const ROOT = `${import.meta.env.BASE_URL}art/`;

/** 车票牌面上的车厢小图（透明底）：8 种颜色各一种车厢 + 火车头。牌面底色由 CSS 画。 */
export const spriteArt: Record<CardColor, string> = {
  purple: `${ROOT}cards/sprite-purple.png`,
  blue: `${ROOT}cards/sprite-blue.png`,
  orange: `${ROOT}cards/sprite-orange.png`,
  white: `${ROOT}cards/sprite-white.png`,
  green: `${ROOT}cards/sprite-green.png`,
  yellow: `${ROOT}cards/sprite-yellow.png`,
  black: `${ROOT}cards/sprite-black.png`,
  red: `${ROOT}cards/sprite-red.png`,
  locomotive: `${ROOT}cards/sprite-locomotive.png`,
};

/** 界面小图。 */
export const iconArt = {
  hero: `${ROOT}ui/hero.png`,
};
