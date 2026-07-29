#!/usr/bin/env bash
# 전체 검사 — 폰에서 그대로 돌아간다 (안드로이드 SDK·브라우저 없이)
#
#   1) 모듈 적재      문법·import 오류
#   2) 자바 타입검사   안드로이드 래퍼 (스텁 컴파일)
#   3) 엔진 종단      실제 스톡피시로 분석→문제 생성→기존 데이터 이전
#   4) 화면 실행      모든 화면 렌더 + 문제 풀이 동작 시뮬레이션
#   5) 판 그림        렌더 결과를 PNG 로 (눈으로 확인용)
set -e
cd "$(dirname "$0")/.."
FAIL=0
run() {
  printf '\n\033[1m── %s ──\033[0m\n' "$1"
  shift
  "$@" || FAIL=1
}

run "1) 모듈 적재"    node test/smoke.mjs
run "2) 자바 타입검사" bash test/javacheck.sh
run "3) 엔진 종단"     node test/run.mjs
run "4) 화면 실행"     node test/views.mjs
run "5) 판 그림"       node test/preview.mjs

printf '\n%s\n' "══════════════════════════════════════════════"
if [ "$FAIL" = 0 ]; then
  echo "✅ 전부 통과"
else
  echo "❌ 실패한 단계가 있습니다 (위 로그 확인)"
  exit 1
fi
