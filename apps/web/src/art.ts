import type { CardColor } from "@ttr/game";

/**
 * 像素美术的地址。图片放在 public/art 下（PixelLab 生成，art/generate_ttr.py 导出）。
 * 图片地址固定；换图后不会被浏览器缓存挡住，靠服务器给这些文件加 Cache-Control: no-cache。
 */
const ROOT = `${import.meta.env.BASE_URL}art/`;

/** 车票卡贴图：8 种颜色 + 火车头万能牌。 */
export const cardArt: Record<CardColor, string> = {
  purple: `${ROOT}cards/purple.png`,
  blue: `${ROOT}cards/blue.png`,
  orange: `${ROOT}cards/orange.png`,
  white: `${ROOT}cards/white.png`,
  green: `${ROOT}cards/green.png`,
  yellow: `${ROOT}cards/yellow.png`,
  black: `${ROOT}cards/black.png`,
  red: `${ROOT}cards/red.png`,
  locomotive: `${ROOT}cards/locomotive.png`,
};

/** 界面小图。 */
export const iconArt = {
  hero: `${ROOT}ui/hero.png`,
};
