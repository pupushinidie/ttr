import { useState } from "react";

/** 规则说明：用自己的话写，不照搬原版规则书。 */
function GameRules() {
  const [open, setOpen] = useState(false);

  return (
    <section className={open ? "game-rules open" : "game-rules"}>
      <button
        className="game-rules-toggle"
        type="button"
        aria-expanded={open}
        aria-controls="game-rules-panel"
        onClick={() => setOpen((current) => !current)}
      >
        <span aria-hidden="true">✦</span> 游戏规则
        <i aria-hidden="true">{open ? "收起 ▴" : "展开 ▾"}</i>
      </button>

      {open && (
        <div className="game-rules-panel" id="game-rules-panel">
          <div className="game-rules-block">
            <h3>目标</h3>
            <p>
              把彩色车票铺成铁路，连起地图上两座城市，完成你的<b>目的地票</b>。
              铺路得线路分，完成目的地票得票面分，没完成则扣票面分。
              铺出全场最长连续铁路的人再得 +10 分，最后总分最高者获胜。
            </p>
          </div>

          <div className="game-rules-block">
            <h3>轮到你时</h3>
            <p>三个动作选一个：</p>
            <ul>
              <li><b>抽车票</b>：从牌库或明牌区抽 2 张。第一张就拿明牌里的火车头，只能拿这 1 张；第二张不能拿明牌火车头（牌库里摸到的不算）。</li>
              <li><b>铺路</b>：打出与线路颜色相同、数量与线路长度相等的车票，占下这条线路（火车头是万能牌）。</li>
              <li><b>抽目的地票</b>：抽 3 张，至少保留 1 张。</li>
            </ul>
          </div>

          <div className="game-rules-block">
            <h3>铺路与计分</h3>
            <ul>
              <li>线路长度 1–6，分别得 1 / 2 / 4 / 7 / 10 / 15 分。</li>
              <li><b>灰线路</b>可用任意单一颜色铺；彩色线路只能用对应颜色 + 火车头。</li>
              <li><b>双线路</b>在 2–3 人局里只能用其中一边，4–5 人局两边都能用。</li>
              <li>每人 45 辆火车，铺路会消耗对应数量的火车。</li>
            </ul>
          </div>

          <div className="game-rules-block">
            <h3>终局</h3>
            <ul>
              <li>谁的火车剩 2 辆或更少，触发终局：其他玩家各再走最后一回合。</li>
              <li>结算：线路分 + 完成目的地票分 − 未完成票面分 + 最长铁路 +10。</li>
            </ul>
          </div>

          <div className="game-rules-block">
            <h3>其他</h3>
            <ul>
              <li>开局每人从 3 张目的地票里至少留 2 张，大家同时选。</li>
              <li>每回合限时 90 秒，超时自动替你从牌库抽牌（选票时替你全部保留）。掉线后用原昵称和房间码可以回到自己的座位。</li>
              <li>明牌区出现 3 张火车头时，5 张明牌全部弃掉重翻。</li>
              <li>牌库和票堆的顺序在服务器上，谁也看不到接下来会翻出什么。</li>
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}

export default GameRules;
