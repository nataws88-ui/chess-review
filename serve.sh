#!/usr/bin/env bash
# 브라우저 미리보기 (엔진은 앱에서만 동작 — 화면·저장·복기 확인용)
cd "$(dirname "$0")/www"
PORT="${1:-8126}"
echo "▶ http://127.0.0.1:$PORT  (Ctrl+C 로 종료)"
if command -v python3 >/dev/null; then
  exec python3 -m http.server "$PORT" --bind 127.0.0.1
else
  exec node -e '
    const http=require("http"),fs=require("fs"),p=require("path");
    const T={".html":"text/html",".js":"text/javascript",".css":"text/css",".svg":"image/svg+xml",".json":"application/json"};
    http.createServer((q,s)=>{let f=p.join(process.cwd(),decodeURIComponent(q.url.split("?")[0]));
    if(f.endsWith("/"))f+="index.html";
    fs.readFile(f,(e,d)=>{if(e){s.writeHead(404);return s.end("404")}
    s.writeHead(200,{"Content-Type":T[p.extname(f)]||"application/octet-stream"});s.end(d)})})
    .listen(process.argv[1],"127.0.0.1");' "$PORT"
fi
