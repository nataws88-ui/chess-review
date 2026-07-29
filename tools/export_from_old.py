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
import http.server
import json
import os
import re
import shutil
import socketserver
import sys
import threading
import time

HDR = re.compile(r'^\[(\w+)\s+"(.*)"\]\s*$')
PORT = 8125


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
button{width:100%;padding:14px;border-radius:12px;border:0;background:#7fa650;color:#0d1408;
font-weight:800;font-size:1rem}
button.sec{background:#2b2937;color:#eceaf2;margin-top:8px}
pre{white-space:pre-wrap;word-break:break-all;font-size:.72rem;color:#a29fb0;max-height:180px;overflow:auto}
.ok{color:#8fe3ab;font-weight:700}.no{color:#ff9a9a;font-weight:700}
</style></head><body>
<h1>♟️ 훈련 진도를 앱으로 이전</h1>
<p style="color:#a29fb0">이 페이지는 <b>기존 체스 퀴즈</b>에 저장된 복습 진도(안키 카드)를 읽어
새 앱 「체스 복기왕」으로 옮깁니다. 기존 데이터는 지우지 않습니다.</p>
<div class="box" id="info">읽는 중…</div>
<button onclick="send()">진도 보내기 (이전 도구로)</button>
<button class="sec" onclick="dl()">파일로 저장 (수동 이전용)</button>
<div class="box"><pre id="log"></pre></div>
<script>
var KEY='cq_srs_v1', data={};
try{data=JSON.parse(localStorage.getItem(KEY)||'{}')}catch(e){}
var n=Object.keys(data).length;
document.getElementById('info').innerHTML = n
  ? '복습 카드 <b>'+n+'장</b>의 진도를 찾았습니다.'
  : '<span class="no">저장된 진도가 없습니다.</span> (훈련을 한 번도 안 했거나 다른 주소에서 열었을 수 있습니다)';
function log(s,c){var e=document.getElementById('log');e.innerHTML+=(c?'<span class="'+c+'">'+s+'</span>':s)+'\\n';}
function send(){
  log('보내는 중…');
  fetch('http://127.0.0.1:__PORT__/srs',{method:'POST',body:JSON.stringify(data)})
    .then(function(r){return r.text()})
    .then(function(t){log('✅ 보냈습니다: '+t,'ok');})
    .catch(function(e){log('❌ 실패: '+e+' — 이전 도구(export_from_old.py)가 실행 중인지 확인하세요','no');});
}
function dl(){
  var b=new Blob([JSON.stringify({app:'chess-review',v:1,games:[],srs:data})],{type:'application/json'});
  var a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='복기왕-진도.json';
  document.body.appendChild(a);a.click();a.remove();
  log('💾 다운로드 폴더에 저장했습니다 (앱에서 설정 → 가져오기)','ok');
}
</script></body></html>'''


class SrsHandler(http.server.BaseHTTPRequestHandler):
    received = None

    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', '*')

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_POST(self):
        n = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(n).decode('utf-8', 'replace')
        try:
            SrsHandler.received = json.loads(body)
            msg = f'{len(SrsHandler.received)}장 수신'
        except Exception as e:
            msg = f'파싱 실패: {e}'
        self.send_response(200)
        self._cors()
        self.send_header('Content-Type', 'text/plain; charset=utf-8')
        self.end_headers()
        self.wfile.write(msg.encode('utf-8'))

    def log_message(self, *a):
        pass


def wait_for_srs(seconds):
    with socketserver.TCPServer(('127.0.0.1', PORT), SrsHandler) as srv:
        srv.timeout = 1
        t0 = time.time()
        while time.time() - t0 < seconds:
            srv.handle_request()
            if SrsHandler.received is not None:
                return SrsHandler.received
            left = int(seconds - (time.time() - t0))
            print(f'\r  진도 수신 대기… {left}초  ', end='', flush=True)
    print()
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', default='/root/chess', help='기존 체스 퀴즈 폴더')
    ap.add_argument('--out', default=None, help='내보낼 JSON 경로')
    ap.add_argument('--no-srs', action='store_true', help='훈련 진도 수집 생략')
    ap.add_argument('--wait', type=int, default=180, help='진도 수신 대기 초')
    args = ap.parse_args()

    src = args.src
    print(f'📂 기존 시스템: {src}')
    games = collect_games(src)
    if not games:
        sys.exit('내보낼 경기가 없습니다')
    analyzed = sum(1 for g in games if g['report'])
    print(f'\n✅ 경기 {len(games)}판 (분석 데이터 있음 {analyzed}판)')

    # 이전 페이지는 항상 설치해 둔다 (기존 시스템에 파일 하나 추가할 뿐, 아무것도 건드리지 않음)
    srs = {}
    html_dir = os.path.join(src, 'html')
    page_path = os.path.join(html_dir, '앱이전.html')
    page_ok = os.path.isdir(html_dir)
    if page_ok:
        with open(page_path, 'w', encoding='utf-8') as f:
            f.write(PAGE.replace('__PORT__', str(PORT)))
        sd = '/sdcard/체스퀴즈'
        if os.path.isdir(sd):
            try:
                shutil.copy(page_path, sd)
            except Exception:
                pass
        print(f'\n📄 이전 페이지 설치: {page_path}')
        print('   폰에서 열기 →  http://127.0.0.1:8123/앱이전.html')
    else:
        print(f'⚠️ {html_dir} 가 없어 이전 페이지를 넣지 못했습니다')

    if not args.no_srs and page_ok:
        print('   위 주소를 열고 [진도 보내기] 를 누르세요.\n')
        got = wait_for_srs(args.wait)
        if got:
            srs = got
            print(f'\n✅ 훈련 진도 {len(srs)}장 수신')
        else:
            print('\n⏭  진도 없이 계속합니다 (페이지의 [파일로 저장] 으로 나중에 따로 옮겨도 됩니다)')

    data = {
        'app': 'chess-review', 'v': 1, 'from': 'legacy',
        'exportedAt': time.strftime('%Y-%m-%dT%H:%M:%S'),
        'games': games, 'srs': srs,
    }

    out = args.out
    if not out:
        out = '/sdcard/체스퀴즈/복기왕-이전.json' if os.path.isdir('/sdcard/체스퀴즈') \
            else os.path.join(os.path.expanduser('~'), '복기왕-이전.json')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False)
    size = os.path.getsize(out) / 1024
    print(f'\n💾 저장 완료: {out}  ({size:.0f}KB)')
    print('\n다음 단계 ─ 앱에서:')
    print('  설정 → 데이터 → [📥 가져오기] → 이 파일 선택')


if __name__ == '__main__':
    main()
