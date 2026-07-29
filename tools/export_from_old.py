#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""기존 "체스 퀴즈"(폰 로컬 서버 방식) → 「체스 복기왕」 앱 이전 도구

하는 일
  1) /root/chess/games/*.pgn + *.analysis.json 을 앱 백업 형식(JSON) 하나로 묶는다
  2) 브라우저에만 있는 훈련 진도(localStorage cq_srs_v1)를 받아오기 위해
     기존 서버 폴더에 '앱이전.html' 을 넣고, 잠깐 수신 서버를 띄운다
  3) /sdcard/체스퀴즈/복기왕-이전.json 으로 저장 → 앱에서 설정 → 가져오기

기존 시스템은 전혀 건드리지 않는다(파일 추가만, 삭제·수정 없음).
의존성 없음 — 표준 라이브러리만 사용.

사용:  python3 export_from_old.py [--src /root/chess] [--out 경로] [--no-srs]
"""

import argparse
import json
import os
import re
import sys
import time

HDR = re.compile(r'^\[(\w+)\s+"(.*)"\]\s*$')

# 기존 로컬 서버(server.py)가 서빙하는 폴더
SERVED_DIR = '/sdcard/체스퀴즈'


def read_headers(text):
    out = {}
    for line in text.splitlines():
        if not line.startswith('['):
            if line.strip() and not line.startswith('['):
                break
            continue
        m = HDR.match(line)
        if m:
            out[m.group(1)] = m.group(2)
    return out


def result_ko_term(h):
    return h.get('Termination', '')


def collect_games(src):
    games_dir = os.path.join(src, 'games')
    if not os.path.isdir(games_dir):
        sys.exit(f'게임 폴더가 없습니다: {games_dir}')
    out = []
    for fn in sorted(os.listdir(games_dir)):
        if not fn.endswith('.pgn'):
            continue
        stem = fn[:-4]
        path = os.path.join(games_dir, fn)
        try:
            with open(path, encoding='utf-8') as f:
                pgn = f.read()
        except Exception as e:
            print(f'  ⚠️ 못 읽음: {fn} ({e})')
            continue
        h = read_headers(pgn)
        report = None
        an = os.path.join(games_dir, stem + '.analysis.json')
        if os.path.exists(an):
            try:
                with open(an, encoding='utf-8') as f:
                    report = json.load(f)
            except Exception as e:
                print(f'  ⚠️ 분석 파일 손상: {stem} ({e})')
        meta = {
            'white': h.get('White', '?'),
            'black': h.get('Black', '?'),
            'welo': h.get('WhiteElo', ''),
            'belo': h.get('BlackElo', ''),
            'date': h.get('Date', '').replace('.', '-'),
            'result': h.get('Result', '*'),
            'termination': result_ko_term(h),
            'timeControl': h.get('TimeControl', ''),
            'link': h.get('Link', ''),
        }
        # id 는 반드시 기존 파일명(stem) — 훈련 진도(SRS) 키가 여기에 맞춰져 있다
        out.append({'id': stem, 'pgn': pgn, 'meta': meta, 'report': report, 'source': 'legacy'})
        mark = '📊' if report else '  '
        print(f'  {mark} {stem}')
    return out


PAGE = '''<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>앱으로 이전</title>
<style>
body{background:#15141b;color:#eceaf2;font-family:system-ui,'Noto Sans KR',sans-serif;
padding:22px 16px;max-width:520px;margin:0 auto;line-height:1.6}
h1{font-size:1.25rem;margin-bottom:6px}
.box{background:#201f2a;border:1px solid #373544;border-radius:14px;padding:15px;margin:14px 0}
button{width:100%;padding:15px;border-radius:12px;border:0;background:#7fa650;color:#0d1408;
font-weight:800;font-size:1.02rem}
button.sec{background:#2b2937;color:#eceaf2;margin-top:9px;font-size:.92rem;padding:12px}
button[disabled]{opacity:.5}
pre{white-space:pre-wrap;word-break:break-all;font-size:.74rem;color:#a29fb0;max-height:200px;overflow:auto;margin:0}
.ok{color:#8fe3ab;font-weight:700}.no{color:#ff9a9a;font-weight:700}
.step{color:#a29fb0;font-size:.9rem;margin-top:14px;padding-left:12px;border-left:3px solid #7fa650}
</style></head><body>
<h1>♟️ 기존 진도를 앱으로 이전</h1>
<p style="color:#a29fb0">기존 <b>체스 퀴즈</b>의 경기·분석과 이 브라우저에 저장된
<b>복습 진도(안키 카드)</b>를 하나로 묶어 새 앱 「체스 복기왕」으로 옮깁니다.
기존 데이터는 그대로 둡니다.</p>
<div class="box" id="info">읽는 중…</div>
<button id="go" onclick="makeFile()">완성 파일 만들기</button>
<button class="sec" onclick="dlSrs()">진도만 따로 저장</button>
<div class="box"><pre id="log">준비됨.</pre></div>
<div class="step">저장한 뒤 앱에서<br><b>설정 → 데이터 → 📥 가져오기</b> → 방금 받은 파일 선택</div>
<script>
var KEY='cq_srs_v1', srs={};
try{srs=JSON.parse(localStorage.getItem(KEY)||'{}')}catch(e){}
var n=Object.keys(srs).length;
document.getElementById('info').innerHTML = n
  ? '이 브라우저에서 복습 진도 <b>'+n+'장</b>을 찾았습니다.'
  : '<span class="no">저장된 진도가 없습니다.</span> 훈련을 한 번도 안 했거나, 다른 브라우저에서 훈련했을 수 있습니다. (경기·분석은 그래도 옮겨집니다)';
function log(s,c){var e=document.getElementById('log');e.innerHTML+='\\n'+(c?'<span class="'+c+'">'+s+'</span>':s);}
function save(obj,name){
  var b=new Blob([JSON.stringify(obj)],{type:'application/json'});
  var a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=name;
  document.body.appendChild(a);a.click();a.remove();
}
function makeFile(){
  var btn=document.getElementById('go');btn.disabled=true;
  log('경기 데이터를 읽는 중…');
  fetch('복기왕-이전.json',{cache:'no-store'})
    .then(function(r){ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
    .then(function(d){
      d.srs = srs;
      save(d,'복기왕-이전-완성.json');
      log('✅ 경기 '+d.games.length+'판 + 진도 '+n+'장 → 다운로드 폴더에 저장했습니다','ok');
      log('   파일 이름: 복기왕-이전-완성.json');
      btn.disabled=false;
    })
    .catch(function(e){
      log('❌ 경기 데이터를 못 읽었습니다 ('+e.message+')','no');
      log('   export_from_old.py 를 먼저 실행했는지 확인하세요.');
      log('   대신 [진도만 따로 저장] 을 눌러도 됩니다.');
      btn.disabled=false;
    });
}
function dlSrs(){
  save({app:'chess-review',v:1,games:[],srs:srs},'복기왕-진도.json');
  log('💾 진도 '+n+'장만 저장했습니다 (앱에서 경기 파일과 각각 가져오면 됩니다)','ok');
}
</script></body></html>'''


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', default='/root/chess', help='기존 체스 퀴즈 폴더')
    ap.add_argument('--out', default=None, help='내보낼 JSON 경로')
    ap.add_argument('--no-page', action='store_true', help='이전 페이지 설치 생략')
    args = ap.parse_args()

    src = args.src
    print(f'📂 기존 시스템: {src}')
    games = collect_games(src)
    if not games:
        sys.exit('내보낼 경기가 없습니다')
    analyzed = sum(1 for g in games if g['report'])
    print(f'\n✅ 경기 {len(games)}판 (분석 데이터 있음 {analyzed}판)')

    data = {
        'app': 'chess-review', 'v': 1, 'from': 'legacy',
        'exportedAt': time.strftime('%Y-%m-%dT%H:%M:%S'),
        'games': games, 'srs': {},
    }

    # 기존 로컬 서버가 서빙하는 폴더에 두면, 이전 페이지가 이 파일을 직접 읽어
    # 브라우저의 훈련 진도와 합쳐 '완성 파일' 하나를 만들어 준다.
    out = args.out
    if not out:
        out = os.path.join(SERVED_DIR, '복기왕-이전.json') if os.path.isdir(SERVED_DIR) \
            else os.path.join(os.path.expanduser('~'), '복기왕-이전.json')
    os.makedirs(os.path.dirname(out) or '.', exist_ok=True)
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False)
    print(f'\n💾 경기 파일 저장: {out}  ({os.path.getsize(out) / 1024:.0f}KB)')

    # 이전 페이지 — 경기 파일과 같은 폴더에 둬야 서로 읽을 수 있다
    if not args.no_page:
        page_dir = os.path.dirname(out) or '.'
        page_path = os.path.join(page_dir, '앱이전.html')
        with open(page_path, 'w', encoding='utf-8') as f:
            f.write(PAGE)
        print(f'📄 이전 페이지 설치: {page_path}')

    print('\n다음 단계 ─ 폰에서:')
    if os.path.dirname(out) == SERVED_DIR.rstrip('/'):
        print('  1) 브라우저로 열기 →  http://127.0.0.1:8123/앱이전.html')
        print('     (기존 체스 퀴즈 서버가 켜져 있어야 합니다)')
        print('  2) [완성 파일 만들기] 누르기 → 경기 + 훈련 진도가 한 파일로 저장됨')
        print('  3) 앱에서 설정 → 데이터 → [📥 가져오기] → 그 파일 선택')
    else:
        print('  앱에서 설정 → 데이터 → [📥 가져오기] → 이 파일 선택')
        print('  (훈련 진도까지 옮기려면 기존 서버 폴더에서 실행하세요)')


if __name__ == '__main__':
    main()
