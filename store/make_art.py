#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""스토어 아트 생성 — icon-512.png / feature-1024x500.png
필요: rsvg-convert, 나눔폰트
사용: python3 store/make_art.py
"""
import os
import re
import subprocess

BASE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(BASE)
SPRITE = os.path.join(ROOT, 'www', 'assets', 'pieces.svg')

# 피처 그래픽에 보여줄 국면 (칸 → 기물)
POSITION = {
    'g8': 'bk', 'g7': 'bp', 'h7': 'bp', 'd7': 'bq', 'h5': 'br',
    'e3': 'wn', 'b1': 'wk', 'c4': 'wq', 'f2': 'wp', 'g2': 'wp',
}
CELL = 48
BOARD_X, BOARD_Y = 620, 58


def sprite_defs():
    with open(SPRITE, encoding='utf-8') as f:
        txt = f.read()
    return re.sub(r'^<svg[^>]*>|</svg>$', '', txt.strip(), flags=re.M)


def sq_xy(sq):
    col = ord(sq[0]) - ord('a')
    row = 8 - int(sq[1])
    return col * CELL, row * CELL


def pieces_svg():
    out = []
    for sq, code in POSITION.items():
        x, y = sq_xy(sq)
        out.append(f'<use href="#p{code}" x="0" y="0" width="{CELL}" height="{CELL}" '
                   f'transform="translate({x},{y})"/>')
    return '\n        '.join(out)


def board_squares():
    out = []
    for r in range(8):
        for c in range(8):
            if (r + c) % 2:
                out.append(f'<rect x="{c*CELL}" y="{r*CELL}" width="{CELL}" height="{CELL}"/>')
    return '\n          '.join(out)


FEATURE = '''<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500" viewBox="0 0 1024 500">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#1E2836"/><stop offset="0.5" stop-color="#151B24"/>
      <stop offset="1" stop-color="#0E1116"/>
    </linearGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#FFE9A6"/><stop offset="0.5" stop-color="#F2C14E"/>
      <stop offset="1" stop-color="#CF9421"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.78" cy="0.4" r="0.55">
      <stop offset="0" stop-color="#4ADE80" stop-opacity="0.18"/>
      <stop offset="1" stop-color="#4ADE80" stop-opacity="0"/>
    </radialGradient>
    <filter id="sh"><feDropShadow dx="0" dy="6" stdDeviation="9" flood-color="#000" flood-opacity="0.5"/></filter>
    <filter id="psh"><feDropShadow dx="0" dy="1.5" stdDeviation="1.5" flood-color="#000" flood-opacity="0.45"/></filter>
    __SPRITE__
  </defs>

  <rect width="1024" height="500" fill="url(#bg)"/>
  <rect width="1024" height="500" fill="url(#glow)"/>

  <g transform="translate(__BX__,__BY__)" filter="url(#sh)">
    <rect x="-7" y="-7" width="398" height="398" rx="14" fill="#0a0d12"/>
    <rect width="384" height="384" fill="#EEEED2"/>
    <g fill="#7FA650">
          __SQUARES__
    </g>
    <rect x="192" y="240" width="48" height="48" fill="#EF5B5B" fill-opacity="0.55"/>
    <rect x="240" y="144" width="48" height="48" fill="#48D17A" fill-opacity="0.55"/>
    <g filter="url(#psh)">
        __PIECES__
    </g>
    <g stroke="#2FBF5F" stroke-width="12" stroke-linecap="round" opacity="0.95">
      <line x1="216" y1="264" x2="256" y2="190"/>
    </g>
    <path d="M264 168 L281 197 L249 199 Z" fill="#2FBF5F"/>
    <circle cx="236" cy="227" r="19" fill="#15181D" stroke="#2FBF5F" stroke-width="3"/>
    <text x="236" y="234" text-anchor="middle" font-family="NanumSquare, sans-serif"
          font-size="22" font-weight="bold" fill="#fff">1</text>
  </g>

  <g transform="translate(72,120)">
    <g transform="translate(0,-56) scale(0.42)">
      <path d="M0 190 L0 20 L58 82 L112 -8 L166 82 L224 20 L224 190 Z" fill="url(#gold)"/>
      <rect x="-14" y="196" width="252" height="42" rx="6" fill="#F0D9B5"/>
      <path d="M-14 196 h63 v42 h-63 z M112 196 h63 v42 h-63 z" fill="#7FA650"/>
    </g>
    <text x="122" y="6" font-family="NanumSquareRound, NanumSquare, sans-serif"
          font-size="60" font-weight="bold" fill="#F2F5FA">체스 복기왕</text>
    <text x="0" y="84" font-family="NanumSquare, sans-serif" font-size="30" fill="#B9C4D4">내가 둔 실수를, 내 문제로 다시 푼다</text>
    <g font-family="NanumSquare, sans-serif" font-size="21" font-weight="bold">
      <rect x="0" y="124" width="200" height="46" rx="23" fill="#1E2A38" stroke="#31445C"/>
      <text x="100" y="154" text-anchor="middle" fill="#8FD8FF">스톡피시 17.1 내장</text>
      <rect x="214" y="124" width="152" height="46" rx="23" fill="#1E3323" stroke="#2F5C3F"/>
      <text x="290" y="154" text-anchor="middle" fill="#8FE3AB">완전 오프라인</text>
      <rect x="0" y="184" width="200" height="46" rx="23" fill="#332B16" stroke="#5C4C22"/>
      <text x="100" y="214" text-anchor="middle" fill="#F3D98D">간격 반복 학습</text>
      <rect x="214" y="184" width="152" height="46" rx="23" fill="#2A1F33" stroke="#4B3A5C"/>
      <text x="290" y="214" text-anchor="middle" fill="#D5B8F0">광고 없음</text>
    </g>
  </g>
</svg>
'''


def main():
    svg = (FEATURE
           .replace('__SPRITE__', sprite_defs())
           .replace('__SQUARES__', board_squares())
           .replace('__PIECES__', pieces_svg())
           .replace('__BX__', str(BOARD_X)).replace('__BY__', str(BOARD_Y)))
    fp = os.path.join(BASE, 'feature.svg')
    with open(fp, 'w', encoding='utf-8') as f:
        f.write(svg)

    jobs = [
        ('icon.svg', 'icon-512.png', 512, 512),
        ('feature.svg', 'feature-1024x500.png', 1024, 500),
    ]
    for src, dst, w, hh in jobs:
        subprocess.run(['rsvg-convert', '-w', str(w), '-h', str(hh),
                        os.path.join(BASE, src), '-o', os.path.join(BASE, dst)], check=True)
        size = os.path.getsize(os.path.join(BASE, dst)) / 1024
        print(f'✅ {dst}  ({w}x{hh}, {size:.0f}KB)')


if __name__ == '__main__':
    main()
