#!/usr/bin/env bash
# 실제 AdMob ID 적용 — 폰에서 그대로 실행
#
#   bash tools/set_admob.sh <앱ID> <배너ID> <전면광고ID>
#
# 예)
#   bash tools/set_admob.sh \
#      ca-app-pub-3133219650005703~1234567890 \
#      ca-app-pub-3133219650005703/1111111111 \
#      ca-app-pub-3133219650005703/2222222222
#
# 앱 ID 는 물결표(~), 광고 단위는 슬래시(/) 입니다. 이걸 헷갈리면 앱이 켜지자마자 죽습니다.
# 그래서 이 스크립트가 형식을 먼저 검사합니다.
set -e
cd "$(dirname "$0")/.."
XML=android/app/src/main/res/values/admob.xml

APP_ID="${1:-}"; BANNER="${2:-}"; FULL="${3:-}"

die() { printf '\n❌ %s\n' "$1" >&2; exit 1; }

if [ -z "$APP_ID" ] || [ -z "$BANNER" ] || [ -z "$FULL" ]; then
  sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'
  die "인수 3개가 필요합니다 (앱ID, 배너ID, 전면광고ID)"
fi

echo "$APP_ID" | grep -Eq '^ca-app-pub-[0-9]{16}~[0-9]{10}$' \
  || die "앱 ID 형식이 아닙니다: $APP_ID
   → ca-app-pub-<숫자16>~<숫자10>  (물결표 ~)"
echo "$BANNER" | grep -Eq '^ca-app-pub-[0-9]{16}/[0-9]{10}$' \
  || die "배너 광고 단위 ID 형식이 아닙니다: $BANNER
   → ca-app-pub-<숫자16>/<숫자10>  (슬래시 /)"
echo "$FULL" | grep -Eq '^ca-app-pub-[0-9]{16}/[0-9]{10}$' \
  || die "전면광고 단위 ID 형식이 아닙니다: $FULL
   → ca-app-pub-<숫자16>/<숫자10>  (슬래시 /)"
[ "$BANNER" != "$FULL" ] || die "배너와 전면광고에 같은 ID를 넣었습니다 (광고 단위를 2개 만들어야 합니다)"

# 앱 ID와 광고 단위의 게시자 번호가 다르면 대개 복사 실수다
PUB_A=$(echo "$APP_ID" | sed 's/^ca-app-pub-\([0-9]*\)~.*/\1/')
PUB_B=$(echo "$BANNER" | sed 's|^ca-app-pub-\([0-9]*\)/.*|\1|')
[ "$PUB_A" = "$PUB_B" ] || echo "⚠️  앱 ID와 배너 ID의 게시자 번호가 다릅니다 ($PUB_A vs $PUB_B). 정말 맞나요?"

python3 - "$XML" "$APP_ID" "$BANNER" "$FULL" <<'PY'
import re, sys
path, app_id, banner, full = sys.argv[1:5]
s = open(path, encoding='utf-8').read()
def put(name, value, text):
    new, n = re.subn(r'(<string name="%s"[^>]*>)[^<]*(</string>)' % name,
                     lambda m: m.group(1) + value + m.group(2), text)
    if n != 1:
        sys.exit('admob.xml 에서 %s 를 찾지 못했습니다' % name)
    return new
s = put('admob_app_id', app_id, s)
s = put('admob_banner', banner, s)
s = put('admob_interstitial', full, s)
s = re.sub(r'(<bool name="admob_is_test">)[^<]*(</bool>)', r'\1false\2', s)
open(path, 'w', encoding='utf-8').write(s)
PY

echo
echo "✅ 적용했습니다:"
grep -E '^\s*<(string|bool) name="admob' "$XML" | sed 's/^ *//;s/^/   /'
echo
echo "다음 순서:"
echo "   git add -A && git commit -m '실제 AdMob ID 적용' && git push"
echo "   gh workflow run \"Build Android\" && gh run watch"
echo
echo "🚫 이제부터 내 앱의 광고를 직접 누르면 안 됩니다 (무효 트래픽 = 계정 정지)."
