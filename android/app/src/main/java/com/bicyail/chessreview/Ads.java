package com.bicyail.chessreview;

import android.util.DisplayMetrics;
import android.view.View;
import android.widget.FrameLayout;

import com.google.android.gms.ads.AdError;
import com.google.android.gms.ads.AdListener;
import com.google.android.gms.ads.AdRequest;
import com.google.android.gms.ads.AdSize;
import com.google.android.gms.ads.AdView;
import com.google.android.gms.ads.FullScreenContentCallback;
import com.google.android.gms.ads.LoadAdError;
import com.google.android.gms.ads.MobileAds;
import com.google.android.gms.ads.RequestConfiguration;
import com.google.android.gms.ads.interstitial.InterstitialAd;
import com.google.android.gms.ads.interstitial.InterstitialAdLoadCallback;
import com.google.android.ump.ConsentInformation;
import com.google.android.ump.ConsentRequestParameters;
import com.google.android.ump.UserMessagingPlatform;

/**
 * 광고(AdMob) 담당.
 *
 * 배치 원칙 — 체스판을 가리지 않는다.
 *   · 배너: 경기 목록·가져오기·통계·설정 화면에만. 판이 뜨는 화면(/game, /train, /spar)에서는 내린다.
 *   · 전면광고: "분석 완료", "훈련 완료"처럼 사용자가 이미 멈춘 순간에만. 최소 3분 간격.
 *
 * 유럽(EEA/영국) 사용자에게는 광고 SDK를 켜기 전에 UMP 동의 양식을 먼저 띄운다.
 * 동의 상태 확인이 실패해도 앱은 그대로 동작하고, 광고만 안 나온다.
 */
class Ads {

    /** 테스트 기기(=개발자 폰) 목록 — 이 기기에서는 언제나 테스트 광고만 나온다 */
    private static final java.util.List<String> TEST_DEVICES =
            java.util.Arrays.asList("E70158778E5BCDDDC027E07A58727BAD");   // 갤럭시 폴드(개발용)

    /** 전면광고 최소 간격 */
    private static final long GAP_MS = 3 * 60 * 1000L;
    /** 앱을 켠 직후에는 띄우지 않는다 */
    private static final long GRACE_MS = 60 * 1000L;

    private final MainActivity a;
    private final FrameLayout holder;
    private final long startedAt = System.currentTimeMillis();

    private AdView banner;
    private InterstitialAd full;
    private boolean sdkReady;
    private boolean wantBanner;
    private boolean bannerLoaded;
    private boolean loadingFull;
    private boolean keyboardUp;
    private int bannerTries;
    private long lastFullAt;

    Ads(MainActivity a, FrameLayout holder) {
        this.a = a;
        this.holder = holder;
        holder.setVisibility(View.GONE);
    }

    // ---------------- 시작: 동의 확인 → SDK 초기화 ----------------

    void start() {
        try {
            ConsentInformation ci = UserMessagingPlatform.getConsentInformation(a);
            ConsentRequestParameters params = new ConsentRequestParameters.Builder().build();
            ci.requestConsentInfoUpdate(a, params,
                    () -> UserMessagingPlatform.loadAndShowConsentFormIfRequired(a, err -> initSdk()),
                    err -> initSdk());
            // 동의가 필요 없는 지역(한국 등)이면 곧바로 켠다
            if (ci.canRequestAds()) initSdk();
        } catch (Throwable t) {
            initSdk();
        }
    }

    private void initSdk() {
        if (sdkReady) return;
        sdkReady = true;
        try {
            // 전체이용가 앱이므로 광고도 전체이용가(G)로 제한한다.
            MobileAds.setRequestConfiguration(new RequestConfiguration.Builder()
                    .setMaxAdContentRating(RequestConfiguration.MAX_AD_CONTENT_RATING_G)
                    // 개발자 본인 기기는 테스트 기기로 고정한다.
                    // 내 폰에서 실제 광고를 받으면 실수로 한 번만 눌러도 "무효 트래픽"이 되어
                    // 계정이 정지될 수 있다. 테스트 기기에서는 노출·클릭이 집계되지 않는다.
                    // (기기 ID는 logcat 의 "Use RequestConfiguration.Builder().setTestDeviceIds..." 줄에서 확인)
                    .setTestDeviceIds(TEST_DEVICES)
                    .build());
            MobileAds.initialize(a, status -> {});
            ensureBanner();
            preloadFull();
        } catch (Throwable t) {
            sdkReady = false;
        }
    }

    // ---------------- 배너 ----------------

    /** 화면(라우트)이 바뀔 때 웹앱이 부른다. */
    void showBanner(final boolean show) {
        a.runOnUiThread(() -> {
            wantBanner = show;
            ensureBanner();
            apply();
        });
    }

    /** 키보드가 올라오면 배너를 내린다(입력칸을 가리지 않도록). */
    void setKeyboardUp(boolean up) {
        if (keyboardUp == up) return;
        keyboardUp = up;
        apply();
    }

    private void ensureBanner() {
        if (banner != null || !sdkReady) return;
        try {
            banner = new AdView(a);
            banner.setAdUnitId(a.getString(R.string.admob_banner));
            banner.setAdSize(adaptiveSize());
            banner.setAdListener(new AdListener() {
                @Override public void onAdLoaded() {
                    bannerLoaded = true;
                    bannerTries = 0;
                    apply();
                }
                @Override public void onAdFailedToLoad(LoadAdError e) {
                    // 아직 광고가 없거나 오프라인 → 자리를 비워두지 않고 잠시 뒤 다시 시도.
                    // (실패한 배너는 스스로 갱신하지 않으므로 우리가 재요청해야 한다)
                    bannerLoaded = false;
                    apply();
                    if (++bannerTries <= 3) {
                        holder.postDelayed(() -> {
                            try { banner.loadAd(new AdRequest.Builder().build()); } catch (Throwable ignored) {}
                        }, 60_000L * bannerTries);
                    }
                }
            });
            holder.addView(banner, new FrameLayout.LayoutParams(
                    FrameLayout.LayoutParams.MATCH_PARENT,
                    FrameLayout.LayoutParams.WRAP_CONTENT));
            banner.loadAd(new AdRequest.Builder().build());
        } catch (Throwable t) {
            banner = null;
        }
    }

    /** 기기 너비에 맞춘 앵커드 적응형 배너 (기기별로 높이가 다르다) */
    private AdSize adaptiveSize() {
        DisplayMetrics dm = a.getResources().getDisplayMetrics();
        int widthDp = (int) (dm.widthPixels / dm.density);
        if (widthDp < 320) widthDp = 320;
        return AdSize.getCurrentOrientationAnchoredAdaptiveBannerAdSize(a, widthDp);
    }

    /**
     * 배너 표시 상태를 실제 뷰와 웹앱(CSS 변수)에 반영한다.
     * 광고가 실제로 실린 뒤에만 자리를 잡는다 — 안 실렸을 때 빈 띠가 남으면
     * 탭바가 떠 보이고 그 사이로 화면 내용이 비친다(오프라인에서 항상 그런 상태가 된다).
     */
    private void apply() {
        boolean vis = wantBanner && !keyboardUp && banner != null && bannerLoaded;
        holder.setVisibility(vis ? View.VISIBLE : View.GONE);
        a.setAdHeight(vis ? bannerHeightPx() : 0);
    }

    private int bannerHeightPx() {
        try {
            AdSize s = banner.getAdSize();
            int h = s == null ? 0 : s.getHeightInPixels(a);
            return h > 0 ? h : 0;
        } catch (Throwable t) {
            return 0;
        }
    }

    // ---------------- 전면광고 ----------------

    private void preloadFull() {
        if (!sdkReady || full != null || loadingFull) return;
        loadingFull = true;
        try {
            InterstitialAd.load(a, a.getString(R.string.admob_interstitial),
                    new AdRequest.Builder().build(),
                    new InterstitialAdLoadCallback() {
                        @Override public void onAdLoaded(InterstitialAd ad) {
                            loadingFull = false;
                            full = ad;
                        }
                        @Override public void onAdFailedToLoad(LoadAdError e) {
                            loadingFull = false;
                            full = null;
                        }
                    });
        } catch (Throwable t) {
            loadingFull = false;
        }
    }

    /**
     * 사용자가 한 작업을 끝낸 순간에 웹앱이 부른다.
     * 간격·준비 상태가 안 맞으면 조용히 넘어가고 다음 광고를 미리 받아둔다.
     */
    void maybeShowFull() {
        a.runOnUiThread(() -> {
            long now = System.currentTimeMillis();
            if (!sdkReady || now - startedAt < GRACE_MS || now - lastFullAt < GAP_MS) {
                preloadFull();
                return;
            }
            final InterstitialAd ad = full;
            if (ad == null) {
                preloadFull();
                return;
            }
            full = null;
            lastFullAt = now;
            ad.setFullScreenContentCallback(new FullScreenContentCallback() {
                @Override public void onAdDismissedFullScreenContent() { preloadFull(); }
                @Override public void onAdFailedToShowFullScreenContent(AdError e) { preloadFull(); }
            });
            try {
                ad.show(a);
            } catch (Throwable t) {
                preloadFull();
            }
        });
    }

    // ---------------- 광고 개인정보 옵션 (유럽 필수) ----------------

    boolean privacyOptionsRequired() {
        try {
            return UserMessagingPlatform.getConsentInformation(a)
                    .getPrivacyOptionsRequirementStatus()
                    == ConsentInformation.PrivacyOptionsRequirementStatus.REQUIRED;
        } catch (Throwable t) {
            return false;
        }
    }

    void showPrivacyOptions() {
        a.runOnUiThread(() -> {
            try {
                UserMessagingPlatform.showPrivacyOptionsForm(a, err -> {
                    if (err != null) a.toast("광고 설정을 열 수 없습니다");
                });
            } catch (Throwable t) {
                a.toast("광고 설정을 열 수 없습니다");
            }
        });
    }

    // ---------------- 생애주기 ----------------

    void onPause()   { if (banner != null) banner.pause(); }
    void onResume()  { if (banner != null) banner.resume(); }
    void onDestroy() { if (banner != null) { banner.destroy(); banner = null; } }
}
