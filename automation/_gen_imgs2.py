# -*- coding: utf-8 -*-
"""축구협회 혁신위 글 이미지 2장 fal.ai(flux-pro)로 생성 → webp. 실존인물 얼굴 없음."""
import os, sys, urllib.request, io
sys.path.insert(0, r"C:/Users/use/클로드 코드/TheLastDay-troy")
import fal_lib
from PIL import Image

OUT = r"C:/Users/use/sportskingdom24/src/assets/posts"
os.makedirs(OUT, exist_ok=True)

JOBS = [
    ("kfa-innovation-committee-2026.webp",
     "Cinematic conceptual photo of Korean football reform, a modern press-conference stage with empty podium and microphones under dramatic lighting, a football on a table in the foreground, serious institutional mood, blurred national-team red tones in background, no people faces, no text, no words, no letters, no logos"),
    ("kfa-innovation-committee-meeting.webp",
     "Cinematic wide shot of an empty modern conference room with a long table, chairs, and a single football placed at the center, soft window light, reform and governance mood, documentary aesthetic, no people, no text, no words, no letters, no logos"),
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
