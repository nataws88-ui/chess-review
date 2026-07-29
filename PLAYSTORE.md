# 구글 플레이 출시 절차 — 체스 복기왕

앱 이름: **체스 복기왕** · 패키지: `com.bicyail.chessreview` · 버전 1.0.0 (versionCode 1)

> ⚠️ **서명 키는 「임계 CRITICAL」(/root/critical)과 같은 키를 씁니다** (`keystore/upload.jks`, 별칭 `upload`).
> 이 파일과 비밀번호를 잃으면 **두 앱 모두 영구히 업데이트 불가**입니다.
> 구글 드라이브 등에 반드시 따로 백업하세요. (git에는 올라가지 않습니다)

---

## 0. 지금 상태

| 항목 | 상태 |
|---|---|
| 앱 코드 | ✅ 완성 · 전체 검사 통과 (`bash test/all.sh`) |
| 안드로이드 래퍼·엔진 브리지 | ✅ 완성 (자바 타입 검사 통과) |
| 엔진 바이너리 | ✅ `android/app/src/main/jniLibs/arm64-v8a/libstockfish.so` (77MB, git 제외) |
| 빌드 파이프라인 (GitHub Actions) | ✅ 완성 (YAML 검증 완료) |
| 아이콘·피처그래픽 | ✅ `store/icon-512.png`, `store/feature-1024x500.png` |
| 등록 문구·개인정보처리방침 | ✅ `store/listing-ko.md`, `store/privacy-policy.html` |
| git 저장소 | ✅ 커밋 완료 (`main` 브랜치, 아직 push 안 함) |
| 기존 진도 이전 파일 | ✅ `/sdcard/체스퀴즈/복기왕-이전.json` (11판) |
| GitHub 저장소 | ✅ https://github.com/nataws88-ui/chess-review (public) |
| 서명키 비밀값 | ✅ Actions secrets 4개 등록 완료 |
| 개인정보처리방침 URL | ✅ https://nataws88-ui.github.io/chess-review/store/privacy-policy.html |
| 스크린샷 | ⬜ 설치 후 실제 화면 촬영 (2장 이상) — **여기서부터 사람이 해야 함** |
| 개발자 계정 | ⬜ (「임계 CRITICAL」과 공유) |

---

## 1. GitHub에 올리기 — 명령 하나

```bash
gh auth login                     # 한 번만. 브라우저 인증
bash tools/publish.sh             # 저장소 생성+push, 서명키 등록, Pages, 빌드 시작
```

`publish.sh` 가 하는 일:
1. **public** 저장소 생성 + push (스톡피시 GPLv3 → 소스 공개 의무)
2. 서명키를 Actions 비밀값 4개로 등록 (키 파일 자체는 절대 올라가지 않음)
3. GitHub Pages 켜기 → 개인정보처리방침 URL 확보 (Play 필수 항목)
4. 빌드 실행

<details><summary>수동으로 하려면</summary>

```bash
gh repo create chess-review --public --source=. --push
gh secret set KEYSTORE_BASE64   < keystore/upload.jks.base64
gh secret set KEYSTORE_PASSWORD < keystore/PASSWORD.txt
printf upload | gh secret set KEY_ALIAS
gh secret set KEY_PASSWORD      < keystore/PASSWORD.txt
```
</details>

## 2. 빌드

GitHub → **Actions → Build Android → Run workflow**

- 워크플로가 스톡피시 arm64 바이너리(81MB)를 자동으로 내려받아 앱에 심습니다
- 결과물: `aab-play-upload` (Play 업로드용), `apk-test` (폰에 직접 설치해 테스트)
- 예상 용량: APK 약 80~85MB

### 먼저 APK로 실제 동작 확인 (중요)

`apk-test` 를 내려받아 폰에 설치한 뒤 반드시 확인할 것:

1. 앱 실행 → 설정 → 앱 정보 → **[엔진 상태 확인]** 이 "엔진 정상: Stockfish 17.1" 을 띄우는가
   - 실패하면 엔진 실행이 막힌 것 → `useLegacyPackaging` 설정 확인
2. 경기 가져오기 → 체스닷컴 아이디(`bicyail`) → 최근 경기 → 분석 완료되는가
3. 체스닷컴 앱에서 PGN 공유 → 목록에 "체스 복기왕" 이 뜨는가
4. 문제 풀기 → 화살표·승률이 나오는가
5. 설정 → 가져오기 → `복기왕-이전.json` 으로 기존 진도가 넘어오는가

## 3. Play Console 등록

1. [play.google.com/console](https://play.google.com/console) → **앱 만들기**
   - 이름: 체스 복기왕 / 한국어 / 앱 / 무료
2. **앱 설정** 체크리스트
   - 개인정보처리방침 URL: `store/privacy-policy.html` 을 GitHub Pages로 공개한 주소
     (저장소 Settings → Pages → main 브랜치 → `/store` 폴더 지정)
   - 광고 포함: **아니요**
   - 데이터 보안: `store/listing-ko.md` 의 표대로 (수집·공유 모두 아니요)
   - 콘텐츠 등급 설문 → 전체이용가
   - 타겟층: 13세 이상
3. **스토어 등록정보**
   - 문구는 `store/listing-ko.md` 복사
   - 아이콘 `store/icon-512.png`, 그래픽 `store/feature-1024x500.png`
   - 스크린샷 2장 이상 (실제 화면 촬영)
4. **비공개 테스트(closed testing)** 트랙에 AAB 업로드

## 4. 프로덕션 승격 (개인 계정 필수 조건)

2023년 11월 이후에 만든 개인 개발자 계정은, 프로덕션 출시 권한을 얻으려면
**테스터 12명 이상이 연속 14일간 비공개 테스트에 참여**해야 합니다.

- 이 조건은 **계정 단위로 한 번** 통과하면 됩니다.
  → 「임계 CRITICAL」로 이미 진행 중이라면, 그게 끝나는 시점에 이 앱도 바로 프로덕션 신청 가능
- 아직이라면 두 앱을 **같은 테스터 그룹**으로 동시에 돌리는 게 가장 빠릅니다
  (테스터에게 앱 2개를 함께 안내)
- 최종 기준은 Play Console 안내를 따르세요 (구글 정책은 바뀔 수 있습니다)

## 5. 업데이트할 때

```
android/app/build.gradle 에서
  versionCode 1  → 2   (숫자는 반드시 증가)
  versionName "1.0.0" → "1.0.1"
```
그 뒤 `git tag v1.0.1 && git push --tags` 하면 빌드가 자동으로 돕니다.

---

## 문제가 생기면

| 증상 | 원인 / 해결 |
|---|---|
| 앱은 켜지는데 "엔진 파일을 찾을 수 없습니다" | jniLibs에 `libstockfish.so` 가 안 들어감 → CI 로그의 "스톡피시 엔진 내려받기" 단계 확인 |
| "Permission denied" 로 엔진 실행 실패 | `packaging { jniLibs { useLegacyPackaging = true } }` 가 빠졌는지 확인 (없으면 .so가 파일로 안 풀림) |
| 화면이 하얗게만 뜸 | WebView 자산 경로 문제 → `adb logcat | grep chromium` 으로 404 확인 |
| Play 업로드 시 "서명 키가 다름" | CRITICAL과 같은 키인지 확인 (`keytool -list -v -keystore keystore/upload.jks`) |
| AAB가 너무 크다는 경고 | 엔진 NNUE 데이터 때문. 200MB 한도 안이라 문제없음 |
