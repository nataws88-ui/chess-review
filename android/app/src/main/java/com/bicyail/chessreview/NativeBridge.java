package com.bicyail.chessreview;

import android.view.HapticFeedbackConstants;
import android.webkit.JavascriptInterface;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * 웹앱(window.Native)에서 부를 수 있는 네이티브 기능들.
 * 여기 있는 메서드 이름은 JS가 문자열로 부르므로 난독화 금지(proguard-rules.pro).
 */
public class NativeBridge {

    private final MainActivity a;

    NativeBridge(MainActivity a) { this.a = a; }

    // ---------------- 엔진 ----------------

    /** @return "ok" 또는 "err:사유" */
    @JavascriptInterface
    public String engineStart() {
        if (!a.engine.available()) return "err:엔진 파일을 찾을 수 없습니다 (" + a.engine.path() + ")";
        String e = a.engine.start();
        return e == null ? "ok" : "err:" + e;
    }

    @JavascriptInterface
    public void engineSend(String cmd) { a.engine.send(cmd); }

    @JavascriptInterface
    public void engineStop() { a.engine.stop(); }

    @JavascriptInterface
    public boolean engineRunning() { return a.engine.isRunning(); }

    @JavascriptInterface
    public String enginePath() { return a.engine.path(); }

    @JavascriptInterface
    public int cpuCount() { return Runtime.getRuntime().availableProcessors(); }

    // ---------------- 네트워크 (Chess.com 가져오기) ----------------
    // WebView에서 직접 fetch하면 CORS에 걸릴 수 있어 네이티브로 받아 넘긴다.

    @JavascriptInterface
    public void httpGet(final String url, final String reqId) {
        new Thread(() -> {
            int status = 0;
            String body = "";
            HttpURLConnection c = null;
            try {
                if (!url.startsWith("https://")) throw new IllegalArgumentException("https만 허용");
                c = (HttpURLConnection) new URL(url).openConnection();
                c.setRequestMethod("GET");
                c.setConnectTimeout(15000);
                c.setReadTimeout(30000);
                c.setRequestProperty("User-Agent", "ChessReview/1.0 (Android app; personal chess review)");
                c.setRequestProperty("Accept", "application/json, text/plain, */*");
                status = c.getResponseCode();
                InputStream is = (status >= 200 && status < 400) ? c.getInputStream() : c.getErrorStream();
                if (is != null) {
                    StringBuilder sb = new StringBuilder();
                    try (BufferedReader r = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8))) {
                        char[] buf = new char[8192];
                        int n, total = 0;
                        while ((n = r.read(buf)) > 0) {
                            sb.append(buf, 0, n);
                            total += n;
                            if (total > 20 * 1024 * 1024) break;
                        }
                    }
                    body = sb.toString();
                }
            } catch (Exception e) {
                status = -1;
                body = String.valueOf(e.getMessage());
            } finally {
                if (c != null) c.disconnect();
            }
            a.js("window.__httpDone && window.__httpDone(" + MainActivity.q(reqId) + ","
                    + status + "," + MainActivity.q(body) + ")");
        }, "http").start();
    }

    // ---------------- 파일 ----------------

    @JavascriptInterface
    public void pickFile(String reqId) { a.runOnUiThread(() -> a.pickFile(reqId)); }

    @JavascriptInterface
    public void saveFile(String name, String content) { a.runOnUiThread(() -> a.saveFile(name, content)); }

    @JavascriptInterface
    public String takePendingShare() {
        String s = a.pendingShare;
        a.pendingShare = null;
        return s;
    }

    // ---------------- 광고 ----------------

    /** 화면이 바뀔 때마다 부른다. 체스판이 뜨는 화면에서는 false → 배너를 내린다. */
    @JavascriptInterface
    public void adBanner(boolean show) {
        if (a.ads != null) a.ads.showBanner(show);
    }

    /** 분석 완료·훈련 완료처럼 사용자가 이미 멈춘 순간에만 부른다(간격 제한은 네이티브가 판단). */
    @JavascriptInterface
    public void adInterstitial(String reason) {
        if (a.ads != null) a.ads.maybeShowFull();
    }

    /** 유럽(EEA/영국) 사용자에게만 필요한 "광고 개인정보 옵션" 버튼을 보일지 */
    @JavascriptInterface
    public boolean adPrivacyRequired() {
        return a.ads != null && a.ads.privacyOptionsRequired();
    }

    @JavascriptInterface
    public void adPrivacyOptions() {
        if (a.ads != null) a.ads.showPrivacyOptions();
    }

    /** 아직 구글 테스트 광고 ID 를 쓰고 있는지 (설정 화면 안내용) */
    @JavascriptInterface
    public boolean adTestMode() {
        try { return a.getResources().getBoolean(R.bool.admob_is_test); } catch (Throwable t) { return false; }
    }

    // ---------------- 잡기능 ----------------

    @JavascriptInterface
    public void share(String text) { a.runOnUiThread(() -> a.shareText(text)); }

    @JavascriptInterface
    public void toast(String msg) { a.toast(msg); }

    @JavascriptInterface
    public void keepAwake(boolean on) { a.keepAwake(on); }

    @JavascriptInterface
    public void haptic() {
        a.runOnUiThread(() -> {
            if (a.web != null) a.web.performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY);
        });
    }

    @JavascriptInterface
    public String appVersion() { return BuildConfig.VERSION_NAME; }
}
