# -*- coding: utf-8 -*-
"""이강인 아틀레티코 글 이미지 2장 fal.ai(flux-pro)로 생성 → webp. 실존인물 얼굴 없음."""
import os, sys, urllib.request, io
sys.path.insert(0, r"C:/Users/use/클로드 코드/TheLastDay-troy")
import fal_lib
from PIL import Image

OUT = r"C:/Users/use/sportskingdom24/src/assets/posts"
os.makedirs(OUT, exist_ok=True)

JOBS = [
    ("lee-kang-in-atletico-madrid.webp",
     "Cinematic wide shot of a packed football stadium at night bathed in red and white team colors, dramatic floodlights, an empty pitch glowing green, atmospheric fog, epic sports magazine cover mood, no people faces, no text, no words, no letters, no logos, no jersey numbers"),
    ("lee-kang-in-atletico-tactics.webp",
     "Top-down cinematic view of a green football pitch with a chalkboard tactics diagram overlay, white X and O marks and arrows showing a 4-4-2 formation and pressing movement, moody stadium lighting, analyst aesthetic, no people, no text, no words, no letters, no logos"),
]

for fname, prompt in JOBS:
    r = fal_lib.run("fal-ai/flux-pro/v1.1",
                    {"prompt": prompt, "image_size": "landscape_16_9", "num_images": 1,
                     "safety_tolerance": "5"}, poll=3, maxwait=180)
    raw = urllib.request.urlopen(r["images"][0]["url"], timeout=120).read()
    img = Image.open(io.BytesIO(raw)).convert("RGB")
    p = os.path.join(OUT, fname)
    img.save(p, "WEBP", quality=88, method=6)
    print("saved", p, img.size)
