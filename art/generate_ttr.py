"""车票之旅（Ticket to Ride）的 PixelLab 美术：首页主图 + 牌面上的透明底车厢小图。

主图直接写进 apps/web/public/art/ui/（Vite 当静态资源在 /art/ 下服务）；车厢小图先出到 art/out/sprites/，
每种两个候选，挑好后复制成 apps/web/public/art/cards/sprite-<颜色>.png。牌面底色由前端 CSS 画。
用法：python generate_ttr.py [hero] [sprites]
"""
from __future__ import annotations

import pathlib
import sys

import pixellab

WEB_PUBLIC = pixellab.ART.parent / "apps" / "web" / "public" / "art"

def hero(seed: int) -> None:
    prompt = (
        "a vintage board game map of the United States with colorful train routes connecting cities, "
        "small plastic train pieces in many colors sitting on the routes, "
        "top-down view on a warm wooden table, cozy warm light, pixel art"
    )
    pixellab.generate_image(f"hero-c{seed % 10}", {
        "description": prompt,
        "image_size": {"width": 400, "height": 224},
        "no_background": False,
        "outline": "lineless",
        "seed": seed,
    }, WEB_PUBLIC / "ui")


# 透明底的车厢小图，叠在 CSS 画的彩色牌面上（牌面颜色由前端控制，白色/黑色也看得清）。
# 每种颜色一种车厢造型，只看形状也能分出来。
SPRITES = {
    "purple": "a purple wooden boxcar freight wagon with a sliding door",
    "blue": "a blue cylindrical tank car wagon",
    "orange": "an orange freight wagon with slatted wooden sides",
    "white": "a white vintage railroad passenger coach, a train carriage on steel train wheels and bogies, a row of small windows, rounded roof, coupler hooks at both ends",
    "green": "a green caboose wagon with a small cupola on the roof",
    "yellow": "a yellow railroad refrigerator boxcar, a freight train wagon on steel train wheels and bogies, coupler hooks at both ends",
    "black": "a black open hopper wagon loaded with coal",
    "red": "a red open gondola wagon loaded with logs",
    "locomotive": "a black and red steam locomotive with a tall smokestack and gold trim",
}


def sprite(color: str, seed: int) -> None:
    if (pixellab.ART / "out" / "sprites" / f"sprite-{color}-s{seed}.png").exists():
        return  # 已经生成过（中途失败重跑时跳过）
    pixellab.generate_image(f"sprite-{color}-s{seed}", {
        "description": f"{SPRITES[color]}, side view facing left, retro 16-bit pixel art, bold dark outline, centered",
        "image_size": {"width": 64, "height": 64},
        "no_background": True,
        "seed": seed,
    }, pixellab.ART / "out" / "sprites")


if __name__ == "__main__":
    argv = sys.argv[1:] or ["hero"]
    if "sprites" in argv:
        for color in SPRITES:
            for seed in (901, 902):
                sprite(color, seed)
            print(color, "sprite done; spent", round(pixellab.spent_usd(), 4), flush=True)
    if "hero" in argv:
        for seed in (701, 702):
            hero(seed)
        print("hero done; spent", round(pixellab.spent_usd(), 4), flush=True)
