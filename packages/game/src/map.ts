/** 车票之旅（Ticket to Ride）标准美国版地图数据。 */

export const TRAIN_COLORS = ["purple", "blue", "orange", "white", "green", "yellow", "black", "red"] as const;
export type TrainColor = (typeof TRAIN_COLORS)[number];
/** 路线颜色：8 种车票色 + 灰色（任意单一颜色都可铺设）。 */
export type RouteColor = TrainColor | "gray";
/** 火车头是万能牌，只在车票里出现，不是路线颜色。 */
export const LOCOMOTIVE = "locomotive" as const;
export type CardColor = TrainColor | typeof LOCOMOTIVE;

export const TRAIN_COLOR_NAMES: Record<TrainColor, string> = {
  purple: "紫", blue: "蓝", orange: "橙", white: "白",
  green: "绿", yellow: "黄", black: "黑", red: "红",
};

export interface CityDef {
  readonly id: string; readonly nameZh: string; readonly nameEn: string;
  readonly x: number; readonly y: number;
}

export const CITIES: readonly CityDef[] = [
  { id: "atlanta", nameZh: "亚特兰大", nameEn: "Atlanta", x: 0.780552, y: 0.366869 },
  { id: "boston", nameZh: "波士顿", nameEn: "Boston", x: 0.945173, y: 0.793558 },
  { id: "calgary", nameZh: "卡尔加里", nameEn: "Calgary", x: 0.234724, y: 0.871470 },
  { id: "charleston", nameZh: "查尔斯顿", nameEn: "Charleston", x: 0.871931, y: 0.356411 },
  { id: "chicago", nameZh: "芝加哥", nameEn: "Chicago", x: 0.683942, y: 0.596423 },
  { id: "dallas", nameZh: "达拉斯", nameEn: "Dallas", x: 0.554548, y: 0.220979 },
  { id: "denver", nameZh: "丹佛", nameEn: "Denver", x: 0.390276, y: 0.451056 },
  { id: "duluth", nameZh: "德卢斯", nameEn: "Duluth", x: 0.563616, y: 0.685840 },
  { id: "el-paso", nameZh: "埃尔帕索", nameEn: "El Paso", x: 0.377720, y: 0.185421 },
  { id: "helena", nameZh: "海伦娜", nameEn: "Helena", x: 0.332729, y: 0.677473 },
  { id: "houston", nameZh: "休斯顿", nameEn: "Houston", x: 0.595354, y: 0.162937 },
  { id: "kansas-city", nameZh: "堪萨斯城", nameEn: "Kansas City", x: 0.554897, y: 0.477201 },
  { id: "las-vegas", nameZh: "拉斯维加斯", nameEn: "Las Vegas", x: 0.207520, y: 0.335495 },
  { id: "little-rock", nameZh: "小石城", nameEn: "Little Rock", x: 0.623256, y: 0.344384 },
  { id: "los-angeles", nameZh: "洛杉矶", nameEn: "Los Angeles", x: 0.144740, y: 0.250261 },
  { id: "miami", nameZh: "迈阿密", nameEn: "Miami", x: 0.903669, y: 0.125288 },
  { id: "montreal", nameZh: "蒙特利尔", nameEn: "Montreal", x: 0.875418, y: 0.877745 },
  { id: "nashville", nameZh: "纳什维尔", nameEn: "Nashville", x: 0.731027, y: 0.418636 },
  { id: "new-orleans", nameZh: "新奥尔良", nameEn: "New Orleans", x: 0.686035, y: 0.180192 },
  { id: "new-york", nameZh: "纽约", nameEn: "New York", x: 0.893903, y: 0.683748 },
  { id: "oklahoma-city", nameZh: "俄克拉荷马城", nameEn: "Oklahoma City", x: 0.535365, y: 0.350136 },
  { id: "omaha", nameZh: "奥马哈", nameEn: "Omaha", x: 0.534668, y: 0.551454 },
  { id: "phoenix", nameZh: "菲尼克斯", nameEn: "Phoenix", x: 0.261579, y: 0.240326 },
  { id: "pittsburgh", nameZh: "匹兹堡", nameEn: "Pittsburgh", x: 0.811593, y: 0.617862 },
  { id: "portland", nameZh: "波特兰", nameEn: "Portland", x: 0.082310, y: 0.690546 },
  { id: "raleigh", nameZh: "罗利", nameEn: "Raleigh", x: 0.844727, y: 0.452102 },
  { id: "saint-louis", nameZh: "圣路易斯", nameEn: "Saint Louis", x: 0.638253, y: 0.474587 },
  { id: "salt-lake-city", nameZh: "盐湖城", nameEn: "Salt Lake City", x: 0.262626, y: 0.496549 },
  { id: "san-francisco", nameZh: "旧金山", nameEn: "San Francisco", x: 0.068359, y: 0.402426 },
  { id: "santa-fe", nameZh: "圣塔菲", nameEn: "Santa Fe", x: 0.382952, y: 0.318239 },
  { id: "sault-st-marie", nameZh: "苏圣玛丽", nameEn: "Sault St. Marie", x: 0.688477, y: 0.782577 },
  { id: "seattle", nameZh: "西雅图", nameEn: "Seattle", x: 0.103585, y: 0.766890 },
  { id: "toronto", nameZh: "多伦多", nameEn: "Toronto", x: 0.795201, y: 0.751726 },
  { id: "vancouver", nameZh: "温哥华", nameEn: "Vancouver", x: 0.108119, y: 0.845848 },
  { id: "washington", nameZh: "华盛顿", nameEn: "Washington", x: 0.901576, y: 0.550931 },
  { id: "winnipeg", nameZh: "温尼伯", nameEn: "Winnipeg", x: 0.453404, y: 0.855260 },
];

export interface RouteDef {
  readonly id: string; readonly a: string; readonly b: string; readonly length: number;
  readonly color: RouteColor;
  readonly doubleGroup: string | null;
  readonly parallel: number;
}

export const ROUTES: readonly RouteDef[] = [
  { id: "r0", a: "vancouver", b: "calgary", length: 3, color: "gray", doubleGroup: null, parallel: 0 },
  { id: "r1", a: "vancouver", b: "seattle", length: 1, color: "gray", doubleGroup: "pair-seattle-vancouver", parallel: 0 },
  { id: "r2", a: "vancouver", b: "seattle", length: 1, color: "gray", doubleGroup: "pair-seattle-vancouver", parallel: 1 },
  { id: "r3", a: "seattle", b: "calgary", length: 4, color: "gray", doubleGroup: null, parallel: 0 },
  { id: "r4", a: "seattle", b: "helena", length: 6, color: "yellow", doubleGroup: null, parallel: 0 },
  { id: "r5", a: "seattle", b: "portland", length: 1, color: "gray", doubleGroup: "pair-portland-seattle", parallel: 0 },
  { id: "r6", a: "seattle", b: "portland", length: 1, color: "gray", doubleGroup: "pair-portland-seattle", parallel: 1 },
  { id: "r7", a: "portland", b: "salt-lake-city", length: 6, color: "blue", doubleGroup: null, parallel: 0 },
  { id: "r8", a: "portland", b: "san-francisco", length: 5, color: "green", doubleGroup: "pair-portland-san-francisco", parallel: 0 },
  { id: "r9", a: "portland", b: "san-francisco", length: 5, color: "purple", doubleGroup: "pair-portland-san-francisco", parallel: 1 },
  { id: "r10", a: "san-francisco", b: "salt-lake-city", length: 5, color: "orange", doubleGroup: "pair-salt-lake-city-san-francisco", parallel: 0 },
  { id: "r11", a: "san-francisco", b: "salt-lake-city", length: 5, color: "white", doubleGroup: "pair-salt-lake-city-san-francisco", parallel: 1 },
  { id: "r12", a: "san-francisco", b: "los-angeles", length: 3, color: "yellow", doubleGroup: "pair-los-angeles-san-francisco", parallel: 0 },
  { id: "r13", a: "san-francisco", b: "los-angeles", length: 3, color: "purple", doubleGroup: "pair-los-angeles-san-francisco", parallel: 1 },
  { id: "r14", a: "los-angeles", b: "las-vegas", length: 2, color: "gray", doubleGroup: null, parallel: 0 },
  { id: "r15", a: "los-angeles", b: "phoenix", length: 3, color: "gray", doubleGroup: null, parallel: 0 },
  { id: "r16", a: "los-angeles", b: "el-paso", length: 6, color: "black", doubleGroup: null, parallel: 0 },
  { id: "r17", a: "calgary", b: "winnipeg", length: 6, color: "white", doubleGroup: null, parallel: 0 },
  { id: "r18", a: "calgary", b: "helena", length: 4, color: "gray", doubleGroup: null, parallel: 0 },
  { id: "r19", a: "helena", b: "winnipeg", length: 4, color: "blue", doubleGroup: null, parallel: 0 },
  { id: "r20", a: "helena", b: "salt-lake-city", length: 3, color: "purple", doubleGroup: null, parallel: 0 },
  { id: "r21", a: "helena", b: "denver", length: 4, color: "green", doubleGroup: null, parallel: 0 },
  { id: "r22", a: "helena", b: "duluth", length: 6, color: "orange", doubleGroup: null, parallel: 0 },
  { id: "r23", a: "helena", b: "omaha", length: 5, color: "red", doubleGroup: null, parallel: 0 },
  { id: "r24", a: "salt-lake-city", b: "denver", length: 3, color: "red", doubleGroup: "pair-denver-salt-lake-city", parallel: 0 },
  { id: "r25", a: "salt-lake-city", b: "denver", length: 3, color: "yellow", doubleGroup: "pair-denver-salt-lake-city", parallel: 1 },
  { id: "r26", a: "las-vegas", b: "salt-lake-city", length: 3, color: "orange", doubleGroup: null, parallel: 0 },
  { id: "r27", a: "phoenix", b: "denver", length: 5, color: "white", doubleGroup: null, parallel: 0 },
  { id: "r28", a: "phoenix", b: "santa-fe", length: 3, color: "gray", doubleGroup: null, parallel: 0 },
  { id: "r29", a: "phoenix", b: "el-paso", length: 3, color: "gray", doubleGroup: null, parallel: 0 },
  { id: "r30", a: "winnipeg", b: "sault-st-marie", length: 6, color: "gray", doubleGroup: null, parallel: 0 },
  { id: "r31", a: "winnipeg", b: "duluth", length: 4, color: "black", doubleGroup: null, parallel: 0 },
  { id: "r32", a: "duluth", b: "sault-st-marie", length: 3, color: "gray", doubleGroup: null, parallel: 0 },
  { id: "r33", a: "duluth", b: "toronto", length: 6, color: "purple", doubleGroup: null, parallel: 0 },
  { id: "r34", a: "duluth", b: "chicago", length: 3, color: "red", doubleGroup: null, parallel: 0 },
  { id: "r35", a: "duluth", b: "omaha", length: 2, color: "gray", doubleGroup: "pair-duluth-omaha", parallel: 0 },
  { id: "r36", a: "duluth", b: "omaha", length: 2, color: "gray", doubleGroup: "pair-duluth-omaha", parallel: 1 },
  { id: "r37", a: "omaha", b: "chicago", length: 4, color: "blue", doubleGroup: null, parallel: 0 },
  { id: "r38", a: "omaha", b: "kansas-city", length: 1, color: "gray", doubleGroup: "pair-kansas-city-omaha", parallel: 0 },
  { id: "r39", a: "omaha", b: "kansas-city", length: 1, color: "gray", doubleGroup: "pair-kansas-city-omaha", parallel: 1 },
  { id: "r40", a: "kansas-city", b: "saint-louis", length: 2, color: "blue", doubleGroup: "pair-kansas-city-saint-louis", parallel: 0 },
  { id: "r41", a: "kansas-city", b: "saint-louis", length: 2, color: "purple", doubleGroup: "pair-kansas-city-saint-louis", parallel: 1 },
  { id: "r42", a: "kansas-city", b: "oklahoma-city", length: 2, color: "gray", doubleGroup: "pair-kansas-city-oklahoma-city", parallel: 0 },
  { id: "r43", a: "kansas-city", b: "oklahoma-city", length: 2, color: "gray", doubleGroup: "pair-kansas-city-oklahoma-city", parallel: 1 },
  { id: "r44", a: "oklahoma-city", b: "little-rock", length: 2, color: "gray", doubleGroup: null, parallel: 0 },
  { id: "r45", a: "oklahoma-city", b: "dallas", length: 2, color: "gray", doubleGroup: "pair-dallas-oklahoma-city", parallel: 0 },
  { id: "r46", a: "oklahoma-city", b: "dallas", length: 2, color: "gray", doubleGroup: "pair-dallas-oklahoma-city", parallel: 1 },
  { id: "r47", a: "dallas", b: "little-rock", length: 2, color: "gray", doubleGroup: null, parallel: 0 },
  { id: "r48", a: "dallas", b: "houston", length: 1, color: "gray", doubleGroup: "pair-dallas-houston", parallel: 0 },
  { id: "r49", a: "dallas", b: "houston", length: 1, color: "gray", doubleGroup: "pair-dallas-houston", parallel: 1 },
  { id: "r50", a: "houston", b: "new-orleans", length: 2, color: "gray", doubleGroup: null, parallel: 0 },
  { id: "r51", a: "el-paso", b: "houston", length: 6, color: "green", doubleGroup: null, parallel: 0 },
  { id: "r52", a: "el-paso", b: "dallas", length: 4, color: "red", doubleGroup: null, parallel: 0 },
  { id: "r53", a: "el-paso", b: "oklahoma-city", length: 5, color: "yellow", doubleGroup: null, parallel: 0 },
  { id: "r54", a: "el-paso", b: "santa-fe", length: 2, color: "gray", doubleGroup: null, parallel: 0 },
  { id: "r55", a: "santa-fe", b: "oklahoma-city", length: 3, color: "blue", doubleGroup: null, parallel: 0 },
  { id: "r56", a: "oklahoma-city", b: "denver", length: 4, color: "red", doubleGroup: null, parallel: 0 },
  { id: "r57", a: "santa-fe", b: "denver", length: 2, color: "gray", doubleGroup: null, parallel: 0 },
  { id: "r58", a: "denver", b: "kansas-city", length: 4, color: "black", doubleGroup: "pair-denver-kansas-city", parallel: 0 },
  { id: "r59", a: "denver", b: "kansas-city", length: 4, color: "orange", doubleGroup: "pair-denver-kansas-city", parallel: 1 },
  { id: "r60", a: "denver", b: "omaha", length: 4, color: "purple", doubleGroup: null, parallel: 0 },
  { id: "r61", a: "new-orleans", b: "miami", length: 6, color: "red", doubleGroup: null, parallel: 0 },
  { id: "r62", a: "new-orleans", b: "atlanta", length: 4, color: "orange", doubleGroup: "pair-atlanta-new-orleans", parallel: 0 },
  { id: "r63", a: "new-orleans", b: "atlanta", length: 4, color: "yellow", doubleGroup: "pair-atlanta-new-orleans", parallel: 1 },
  { id: "r64", a: "new-orleans", b: "little-rock", length: 3, color: "green", doubleGroup: null, parallel: 0 },
  { id: "r65", a: "little-rock", b: "nashville", length: 3, color: "white", doubleGroup: null, parallel: 0 },
  { id: "r66", a: "little-rock", b: "saint-louis", length: 2, color: "gray", doubleGroup: null, parallel: 0 },
  { id: "r67", a: "saint-louis", b: "nashville", length: 2, color: "gray", doubleGroup: null, parallel: 0 },
  { id: "r68", a: "saint-louis", b: "pittsburgh", length: 5, color: "green", doubleGroup: null, parallel: 0 },
  { id: "r69", a: "saint-louis", b: "chicago", length: 2, color: "green", doubleGroup: "pair-chicago-saint-louis", parallel: 0 },
  { id: "r70", a: "saint-louis", b: "chicago", length: 2, color: "white", doubleGroup: "pair-chicago-saint-louis", parallel: 1 },
  { id: "r71", a: "chicago", b: "pittsburgh", length: 3, color: "black", doubleGroup: "pair-chicago-pittsburgh", parallel: 0 },
  { id: "r72", a: "chicago", b: "pittsburgh", length: 3, color: "orange", doubleGroup: "pair-chicago-pittsburgh", parallel: 1 },
  { id: "r73", a: "chicago", b: "toronto", length: 4, color: "white", doubleGroup: null, parallel: 0 },
  { id: "r74", a: "sault-st-marie", b: "montreal", length: 5, color: "black", doubleGroup: null, parallel: 0 },
  { id: "r75", a: "toronto", b: "montreal", length: 3, color: "gray", doubleGroup: null, parallel: 0 },
  { id: "r76", a: "sault-st-marie", b: "toronto", length: 2, color: "gray", doubleGroup: null, parallel: 0 },
  { id: "r77", a: "toronto", b: "pittsburgh", length: 2, color: "gray", doubleGroup: null, parallel: 0 },
  { id: "r78", a: "pittsburgh", b: "new-york", length: 2, color: "white", doubleGroup: "pair-new-york-pittsburgh", parallel: 0 },
  { id: "r79", a: "pittsburgh", b: "new-york", length: 2, color: "green", doubleGroup: "pair-new-york-pittsburgh", parallel: 1 },
  { id: "r80", a: "pittsburgh", b: "washington", length: 2, color: "gray", doubleGroup: null, parallel: 0 },
  { id: "r81", a: "pittsburgh", b: "raleigh", length: 2, color: "gray", doubleGroup: null, parallel: 0 },
  { id: "r82", a: "nashville", b: "raleigh", length: 3, color: "black", doubleGroup: null, parallel: 0 },
  { id: "r83", a: "nashville", b: "atlanta", length: 1, color: "gray", doubleGroup: null, parallel: 0 },
  { id: "r84", a: "nashville", b: "pittsburgh", length: 4, color: "yellow", doubleGroup: null, parallel: 0 },
  { id: "r85", a: "atlanta", b: "miami", length: 5, color: "blue", doubleGroup: null, parallel: 0 },
  { id: "r86", a: "atlanta", b: "charleston", length: 2, color: "gray", doubleGroup: null, parallel: 0 },
  { id: "r87", a: "atlanta", b: "raleigh", length: 2, color: "gray", doubleGroup: "pair-atlanta-raleigh", parallel: 0 },
  { id: "r88", a: "atlanta", b: "raleigh", length: 2, color: "gray", doubleGroup: "pair-atlanta-raleigh", parallel: 1 },
  { id: "r89", a: "charleston", b: "miami", length: 4, color: "purple", doubleGroup: null, parallel: 0 },
  { id: "r90", a: "raleigh", b: "charleston", length: 2, color: "gray", doubleGroup: null, parallel: 0 },
  { id: "r91", a: "raleigh", b: "washington", length: 2, color: "gray", doubleGroup: "pair-raleigh-washington", parallel: 0 },
  { id: "r92", a: "raleigh", b: "washington", length: 2, color: "gray", doubleGroup: "pair-raleigh-washington", parallel: 1 },
  { id: "r93", a: "washington", b: "new-york", length: 2, color: "orange", doubleGroup: "pair-new-york-washington", parallel: 0 },
  { id: "r94", a: "washington", b: "new-york", length: 2, color: "black", doubleGroup: "pair-new-york-washington", parallel: 1 },
  { id: "r95", a: "new-york", b: "boston", length: 2, color: "yellow", doubleGroup: "pair-boston-new-york", parallel: 0 },
  { id: "r96", a: "new-york", b: "boston", length: 2, color: "red", doubleGroup: "pair-boston-new-york", parallel: 1 },
  { id: "r97", a: "new-york", b: "montreal", length: 3, color: "blue", doubleGroup: null, parallel: 0 },
  { id: "r98", a: "boston", b: "montreal", length: 2, color: "gray", doubleGroup: "pair-boston-montreal", parallel: 0 },
  { id: "r99", a: "boston", b: "montreal", length: 2, color: "gray", doubleGroup: "pair-boston-montreal", parallel: 1 },
];

export interface TicketDef { readonly id: string; readonly a: string; readonly b: string; readonly points: number; }

export const TICKETS: readonly TicketDef[] = [
  { id: "t0", a: "los-angeles", b: "new-york", points: 21 },
  { id: "t1", a: "duluth", b: "houston", points: 8 },
  { id: "t2", a: "sault-st-marie", b: "nashville", points: 8 },
  { id: "t3", a: "new-york", b: "atlanta", points: 6 },
  { id: "t4", a: "portland", b: "nashville", points: 17 },
  { id: "t5", a: "vancouver", b: "montreal", points: 20 },
  { id: "t6", a: "duluth", b: "el-paso", points: 10 },
  { id: "t7", a: "toronto", b: "miami", points: 10 },
  { id: "t8", a: "portland", b: "phoenix", points: 11 },
  { id: "t9", a: "dallas", b: "new-york", points: 11 },
  { id: "t10", a: "calgary", b: "salt-lake-city", points: 7 },
  { id: "t11", a: "calgary", b: "phoenix", points: 13 },
  { id: "t12", a: "los-angeles", b: "miami", points: 20 },
  { id: "t13", a: "winnipeg", b: "little-rock", points: 11 },
  { id: "t14", a: "san-francisco", b: "atlanta", points: 17 },
  { id: "t15", a: "kansas-city", b: "houston", points: 5 },
  { id: "t16", a: "los-angeles", b: "chicago", points: 16 },
  { id: "t17", a: "denver", b: "pittsburgh", points: 11 },
  { id: "t18", a: "chicago", b: "santa-fe", points: 9 },
  { id: "t19", a: "vancouver", b: "santa-fe", points: 13 },
  { id: "t20", a: "boston", b: "miami", points: 12 },
  { id: "t21", a: "chicago", b: "new-orleans", points: 7 },
  { id: "t22", a: "montreal", b: "atlanta", points: 9 },
  { id: "t23", a: "seattle", b: "new-york", points: 22 },
  { id: "t24", a: "denver", b: "el-paso", points: 4 },
  { id: "t25", a: "helena", b: "los-angeles", points: 8 },
  { id: "t26", a: "winnipeg", b: "houston", points: 12 },
  { id: "t27", a: "montreal", b: "new-orleans", points: 13 },
  { id: "t28", a: "sault-st-marie", b: "oklahoma-city", points: 9 },
  { id: "t29", a: "seattle", b: "los-angeles", points: 9 },
];

export const ROUTE_SCORES: Record<number, number> = { 1: 1, 2: 2, 3: 4, 4: 7, 5: 10, 6: 15 };

export const CARD_COUNTS: Record<CardColor, number> = {
  purple: 12, blue: 12, orange: 12, white: 12, green: 12, yellow: 12, black: 12, red: 12,
  locomotive: 14,
};

export const LONGEST_PATH_BONUS = 10;
