#!/usr/bin/env bash
# 체스 복기왕 — GitHub 올리기 + 서명키 등록 + Pages 켜기 + 빌드 시작
#
# 준비: gh auth login  (한 번만. 브라우저 인증)
# 실행: bash tools/publish.sh [저장소이름]
#
# 하는 일
#   1) public 저장소 생성 + push        (스톡피시 GPLv3 → 소스 공개 의무)
#   2) 서명키를 Actions 비밀값으로 등록  (키 파일 자체는 절대 올라가지 않음)
#   3) GitHub Pages 켜기                (개인정보처리방침 URL 확보 — Play 필수)
#   4) 빌드 실행 → AAB/APK
set -e
BASE="$(cd "$(dirname "$0")/.." && pwd -P)"
cd "$BASE"
REPO="${1:-chess-review}"

say() { printf '\n\033[1m%s\033[0m\n' "$1"; }

# ---------- 0. 준비 확인 ----------
command -v gh >/dev/null || { echo "❌ gh(GitHub CLI)가 없습니다"; exit 1; }
if ! gh auth status >/dev/null 2>&1; then
  cat <<'MSG'
❌ GitHub 로그인이 안 되어 있습니다.

  먼저 이것부터 하세요 (한 번만):

      gh auth login

  → GitHub.com → HTTPS → 브라우저로 인증 → 코드 입력
  끝나면 이 스크립트를 다시 실행하세요.
MSG
  exit 1
fi
[ -f keystore/upload.jks.base64 ] || { echo "❌ keystore/upload.jks.base64 가 없습니다"; exit 1; }
[ -f keystore/PASSWORD.txt ] || { echo "❌ keystore/PASSWORD.txt 가 없습니다"; exit 1; }

USER=$(gh api user --jq .login)
say "GitHub 계정: $USER"

# ---------- 1. 저장소 ----------
if gh repo view "$USER/$REPO" >/dev/null 2>&1; then
  say "1) 저장소가 이미 있습니다 → push 만 합니다"
  git remote get-url origin >/dev/null 2>&1 || git remote add origin "https://github.com/$USER/$REPO.git"
  git push -u origin main
else
  say "1) public 저장소 생성 + push"
  gh repo create "$REPO" --public --source=. --push \
    --description "내 체스 실수를 문제로 다시 푸는 복기 앱 (스톡피시 내장, 오프라인)"
fi

# ---------- 2. 서명키 ----------
say "2) 서명키를 Actions 비밀값으로 등록"
gh secret set KEYSTORE_BASE64   --repo "$USER/$REPO" < keystore/upload.jks.base64
gh secret set KEYSTORE_PASSWORD --repo "$USER/$REPO" < keystore/PASSWORD.txt
gh secret set KEY_PASSWORD      --repo "$USER/$REPO" < keystore/PASSWORD.txt
printf 'upload' | gh secret set KEY_ALIAS --repo "$USER/$REPO"
gh secret list --repo "$USER/$REPO" | sed 's/^/   /'

# ---------- 3. Pages ----------
say "3) GitHub Pages 켜기 (개인정보처리방침 URL)"
if gh api "repos/$USER/$REPO/pages" >/dev/null 2>&1; then
  echo "   이미 켜져 있습니다"
else
  gh api -X POST "repos/$USER/$REPO/pages" \
    -f 'source[branch]=main' -f 'source[path]=/' >/dev/null 2>&1 \
    && echo "   켰습니다" \
    || echo "   ⚠️ 자동으로 못 켰습니다 → 저장소 Settings → Pages 에서 main / (root) 선택"
fi
POLICY="https://$USER.github.io/$REPO/store/privacy-policy.html"

# ---------- 4. 빌드 ----------
say "4) 빌드 시작 (스톡피시 내려받기 + AAB/APK)"
gh workflow run "Build Android" --repo "$USER/$REPO" || {
  echo "   ⚠️ 자동 실행 실패 → Actions 탭에서 [Build Android] → Run workflow"
}
sleep 6
gh run list --repo "$USER/$REPO" --limit 1 | sed 's/^/   /' || true

cat <<MSG

────────────────────────────────────────────
✅ 여기까지 끝났습니다.

  저장소      https://github.com/$USER/$REPO
  빌드 진행   https://github.com/$USER/$REPO/actions
  방침 URL    $POLICY
               (Pages 반영에 1~2분 걸립니다. Play Console 에 넣을 주소)

  다음:
   ① 빌드가 끝나면 Actions → 해당 실행 → Artifacts → apk-test 내려받아 폰에 설치
   ② 앱 → 설정 → 앱 정보 → [엔진 상태 확인] 이 "Stockfish 17.1" 을 띄우는지 확인
   ③ 설정 → 데이터 → 가져오기 → /sdcard/체스퀴즈/복기왕-이전.json
   ④ 실제 화면 스크린샷 2장 이상 촬영
   ⑤ Play Console 등록 (PLAYSTORE.md 참고, aab-play-upload 사용)
────────────────────────────────────────────
MSG
