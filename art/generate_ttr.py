"""车票之旅（Ticket to Ride）的 PixelLab 美术：8 种颜色车票卡 + 火车头万能牌 + 首页主图。

结果直接写进 apps/web/public/art/（Vite 当静态资源在 /art/ 下服务）。
每种图先出两个候选（-c1 / -c2），人工挑好后复制成正式文件名。
"""
from __future__ import annotations

import pathlib
import sys

import pixellab

WEB_PUBLIC = pixellab.ART.parent / "apps" / "web" / "public" / "art"

# 颜色: (车厢颜色提示词, 中文)
CARD_COLORS = {
    "purple": "purple", "blue": "blue", "orange": "orange", "white": "white",
    "green": "green", "yellow": "yellow", "black": "black", "red": "red",
}

CARD_W, CARD_H = 120, 168


def train_card(color: str, seed: int) -> None:
    prompt = (
        f"a single vintage railway boxcar in {color}, side view facing left, "
        "drawn on a cream parchment card with a thin dark outline border, "
        "the boxcar centered and large, flat pixel art, crisp, no text"
    )
    pixellab.generate_image(f"card-{color}-c{seed % 10}", {
        "description": prompt,
        "image_size": {"width": CARD_W, "height": CARD_H},
        "no_background": False,
        "outline": "lineless",
        "seed": seed,
    }, WEB_PUBLIC / "cards")


def locomotive(seed: int) -> None:
    prompt = (
        "a single vintage steam locomotive engine in rainbow gradient colors, side view facing left, "
        "drawn on a cream parchment card with a thin dark outline border, "
        "the locomotive centered and large, flat pixel art, crisp, no text"
    )
    pixellab.generate_image(f"card-locomotive-c{seed % 10}", {
        "description": prompt,
        "image_size": {"width": CARD_W, "height": CARD_H},
        "no_background": False,
        "outline": "lineless",
        "seed": seed,
    }, WEB_PUBLIC / "cards")


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


if __name__ == "__main__":
    argv = sys.argv[1:] or ["cards", "locomotive", "hero"]
    if "cards" in argv:
        for color in CARD_COLORS:
            for seed in (501, 502):
                train_card(color, seed)
            print(color, "done; spent", round(pixellab.spent_usd(), 4), flush=True)
    if "locomotive" in argv:
        for seed in (601, 602):
            locomotive(seed)
        print("locomotive done; spent", round(pixellab.spent_usd(), 4), flush=True)
    if "hero" in argv:
        for seed in (701, 702):
            hero(seed)
        print("hero done; spent", round(pixellab.spent_usd(), 4), flush=True)
