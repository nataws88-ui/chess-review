# ♟️ 체스 복기왕

**내가 둔 실수를, 내 문제로 다시 푼다.**

내 경기(PGN)를 스톡피시가 분석해 실수를 찾아내고, 그 장면을 **판에서 직접 두어 답하는 문제**로
만들어 줍니다. 틀린 문제는 안키식 간격 반복(1→3→7→14→30→60일)으로 다시 나옵니다.

엔진은 앱 안에 들어 있어 **인터넷 없이** 동작합니다. AI·서버·계정·광고 없음.

---

## 기존 「체스 퀴즈」와의 관계

기존 시스템(`/root/chess`, 폰 로컬 서버 + 파이썬)은 **그대로 둡니다.** 계속 쓸 수 있습니다.
이 앱은 그것을 앱으로 다시 만든 것이고, 하던 진도는 그대로 옮겨올 수 있습니다.

| |기존 (체스 퀴즈)|이 앱 (체스 복기왕)|
|---|---|---|
|실행|Termux + 파이썬 + 로컬 서버|앱 하나 (Termux 불필요)|
|엔진|폰의 스톡피시 바이너리|앱에 내장(arm64)|
|AI 코치|🧠 클로드 코치 있음|**없음 — 엔진 전용**|
|분석|PC/Termux에서 build.sh|앱 안에서 바로|
|경기 추가|공유 → Termux 스크립트|공유받기 + 체스닷컴 자동 가져오기|
|그래픽|PNG 비트맵(강제 다크모드 우회용)|**벡터 SVG + 애니메이션**|
|추가 기능|—|엔진 대국·실력 통계·약점 리포트|

### 하던 진도 옮기기

```bash
python3 tools/export_from_old.py          # 경기 + 분석 + 훈련 진도(SRS) 를 한 파일로
# → 폰 브라우저에서 http://127.0.0.1:8123/앱이전.html 열고 [진도 보내기]
# → /sdcard/체스퀴즈/복기왕-이전.json 생성
```
앱에서 **설정 → 데이터 → 📥 가져오기** 로 그 파일을 고르면 끝입니다.
경기 ID 규칙이 같아서 **문제별 복습 간격까지 그대로** 이어집니다.

---

## 기능

- **경기 가져오기** — 체스닷컴 아이디로 자동 / PGN 붙여넣기 / 다른 앱에서 공유 / 파일
- **엔진 분석** — 수마다 최선수·승률을 계산, 실수(승률 -12%p↑)를 자동 검출
- **🧩 문제** — 판에서 직접 기물을 움직여 답하기, 정답 후 번호 붙은 화살표로 수순 표시
  - 🟢 최선 수순 / 🔴 실전에서 당한 응징 / 🟠 **내가 둔 틀린 수의 결과**(엔진이 즉석 계산)
  - 원인 규명: 무엇이 걸리는지, 상대가 어떻게 응징하는지, 승률이 몇 %p 떨어지는지
- **🎬 복기** — 수마다 품질 배지·승률 막대·최선 수순 화살표, 평가 그래프와 양방향 연동
- **📊 리포트** — 정확도·추정 레이팅·평균 손실(CPL)·구간별 정확도·수 품질 분포
- **🎯 훈련** — 전 경기 문제를 모아 간격 반복, 틀리면 곧 다시 출제, 하던 자리 이어하기
- **⚔️ 엔진 대국** — 6단계 난이도, 무르기·힌트·승률바, 둔 대국을 그대로 분석해 문제로
- **📈 통계** — 정확도 추이, 실수 원인 분류(기물 방치/전술/메이트/판단), 오프닝별 성적,
  자꾸 틀리는 문제 Top 5

---

## 구조

```
www/                    앱 본체 (의존성 0, 전부 오프라인)
  index.html            껍데기
  js/
    engine.js           UCI 클라이언트 (네이티브 스톡피시와 대화)
    analyze.js          PGN 엔진 분석      ← 기존 analyze.py 이식
    quizgen.js          문제·복기 데이터   ← 기존 make_quiz.py 이식
    board.js            SVG 체스판(벡터 기물·화살표·애니메이션)
    games.js            가져오기/저장 파이프라인
    store.js            IndexedDB + SRS
    ui.js               라우터·토스트·소리(합성)·네이티브 다리
    views/              화면 8개
    lib/chess.js        chess.js 1.4.0 (BSD)
  assets/pieces.svg     기물 스프라이트 (Cburnett)
android/                WebView 래퍼 + 엔진 프로세스 브리지 (자바 3파일)
tools/                  엔진 내려받기, 기존 시스템 이전 도구
store/                  아이콘·피처그래픽·등록문구·개인정보처리방침
test/                   헤드리스 테스트 (실제 엔진으로 종단 검증)
```

### 왜 이렇게 만들었나

- **엔진을 `.so` 이름으로 넣는 이유** — 안드로이드 10부터 앱 데이터 폴더의 파일은 실행할 수
  없습니다. 설치 때 풀리는 네이티브 라이브러리 폴더만 예외라서, 스톡피시 바이너리를
  `libstockfish.so` 로 넣고 그 경로를 실행합니다 (`useLegacyPackaging = true` 필수).
- **웹 자산을 `https://appassets.androidplatform.net` 으로 제공하는 이유** — `file://` 에서는
  ES 모듈·fetch 가 막힙니다. `WebViewAssetLoader` 로 정상 오리진처럼 제공합니다.
- **강제 다크모드 차단** — 기존 HTML판은 폰 브라우저의 강제 다크모드가 SVG 색까지 반전시켜
  기물을 전부 PNG로 우회해야 했습니다. 앱에서는 `setAlgorithmicDarkeningAllowed(false)` 로
  껐기 때문에 벡터·그라데이션·애니메이션을 마음껏 씁니다.

---

## 개발

```bash
bash test/all.sh           # 전체 검사 (아래 5가지를 한 번에)
  node test/smoke.mjs      #   모듈 적재 — 문법·import
  bash test/javacheck.sh   #   안드로이드 자바 타입 검사 (API 스텁 컴파일)
  node test/run.mjs        #   실제 스톡피시로 종단 (분석→문제→기존 데이터 이전)
  node test/views.mjs      #   모든 화면 렌더 + 문제 풀이 동작 시뮬레이션
  node test/preview.mjs    #   판 렌더 결과를 PNG 로 (test/preview/)

./serve.sh                 # 브라우저 미리보기 (엔진 빼고 화면 확인)
bash tools/fetch_engine.sh # 엔진 바이너리 준비 (로컬 빌드용)
bash tools/publish.sh      # GitHub 올리기 + 서명키 + Pages + 빌드 (gh auth login 후)
```

> 안드로이드 SDK는 x86_64 전용이라 이 폰(arm64)에서는 APK를 만들 수 없습니다.
> 그래서 빌드는 GitHub Actions에서 하고, 대신 위 검사들로 설치 전에 최대한 잡습니다.

빌드는 GitHub Actions에서 합니다 → [PLAYSTORE.md](PLAYSTORE.md)

---

## 라이선스

이 앱은 **GPLv3** 입니다. 스톡피시(GPLv3)를 그대로 담아 배포하기 때문입니다.

- [Stockfish](https://github.com/official-stockfish/Stockfish) 17.1 — GPLv3
- [chess.js](https://github.com/jhlywa/chess.js) 1.4.0 — BSD 2-Clause
- 기물 이미지 — Colin M.L. Burnett, GFDL/BSD/GPL
