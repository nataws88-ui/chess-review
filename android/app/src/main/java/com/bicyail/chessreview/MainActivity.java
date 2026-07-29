package com.bicyail.chessreview;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import androidx.webkit.WebSettingsCompat;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewFeature;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * 체스 복기왕 — WebView 한 장 + 네이티브 스톡피시.
 *
 * 웹 자산은 file:// 이 아니라 https://appassets.androidplatform.net/ 로 제공한다.
 * (ES 모듈·fetch·localStorage 가 정상 오리진에서만 제대로 동작하기 때문)
 */
public class MainActivity extends Activity {

    static final String ORIGIN = "https://appassets.androidplatform.net";
    private static final int REQ_OPEN = 1001;
    private static final int REQ_SAVE = 1002;

    WebView web;
    Engine engine;
    Ads ads;
    private WebViewAssetLoader assetLoader;
    private FrameLayout adHolder;

    /** 시스템 바 인셋(px)과 배너 높이(px) — 웹앱 CSS 변수로 내려준다 */
    private int insTopPx, insBottomPx, adHeightPx;

    /** 공유·파일열기로 들어온 PGN 텍스트. 웹앱이 준비되면 가져간다. */
    String pendingShare = null;
    private String pendingSaveContent = null;
    private String openReqId = null;
    private boolean pageReady = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#0e1116"));

        // [화면 구조] 웹앱이 화면 전체를 쓰고, 배너는 그 위에 얹는다.
        // 배너가 차지하는 높이는 CSS 변수(--ad-h)로 웹앱에 알려주므로
        // 하단 탭바가 배너에 가려지지 않는다.
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor("#0e1116"));
        root.addView(web, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        adHolder = new FrameLayout(this);
        adHolder.setBackgroundColor(Color.parseColor("#0e1116"));
        FrameLayout.LayoutParams adLp = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT);
        adLp.gravity = android.view.Gravity.BOTTOM;
        root.addView(adHolder, adLp);
        setContentView(root);

        // Android 15+ 는 화면 끝까지 그리는 것이 강제된다(상태바/내비바 뒤로 내용이 깔린다).
        // API 30 이상에서는 우리가 직접 인셋을 다뤄 CSS 변수로 내려주고,
        // API 26~29 는 시스템이 알아서 여백을 잡아주므로 0으로 둔다.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            getWindow().setDecorFitsSystemWindows(false);
            getWindow().setStatusBarColor(Color.TRANSPARENT);
            getWindow().setNavigationBarColor(Color.TRANSPARENT);
            root.setOnApplyWindowInsetsListener((v, insets) -> {
                Insets bars = insets.getInsets(
                        WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                int imeBottom = insets.getInsets(WindowInsets.Type.ime()).bottom;
                insTopPx = bars.top;
                insBottomPx = bars.bottom;
                // 키보드가 올라오면 그만큼 화면을 밀어 올린다(입력칸이 가려지지 않게)
                v.setPadding(0, 0, 0, Math.max(0, imeBottom - insBottomPx));
                adHolder.setPadding(0, 0, 0, imeBottom > 0 ? 0 : insBottomPx);
                if (ads != null) ads.setKeyboardUp(imeBottom > 0);
                pushInsets();
                return insets;
            });
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        }

        android.webkit.WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setCacheMode(android.webkit.WebSettings.LOAD_NO_CACHE);

        // 시스템/브라우저 강제 다크모드가 우리 색을 뒤집지 못하게 한다.
        // (기존 HTML판에서 SVG까지 반전돼 PNG로 우회해야 했던 문제의 근본 해결)
        if (WebViewFeature.isFeatureSupported(WebViewFeature.ALGORITHMIC_DARKENING)) {
            WebSettingsCompat.setAlgorithmicDarkeningAllowed(s, false);
        }
        if (WebViewFeature.isFeatureSupported(WebViewFeature.FORCE_DARK)) {
            WebSettingsCompat.setForceDark(s, WebSettingsCompat.FORCE_DARK_OFF);
        }

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest req) {
                return assetLoader.shouldInterceptRequest(req.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest req) {
                Uri u = req.getUrl();
                if (u.toString().startsWith(ORIGIN)) return false;
                // 외부 링크(라이선스·소스코드 등)는 브라우저로
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, u));
                } catch (Exception ignored) {}
                return true;
            }

            @Override
            public void onPageFinished(WebView v, String url) {
                pageReady = true;
                pushInsets();
                deliverShare();
            }
        });

        engine = new Engine(getApplicationInfo().nativeLibraryDir + "/libstockfish.so",
                new Engine.Sink() {
                    @Override public void onLines(String jsonArray) {
                        js("window.__engineLines && window.__engineLines(" + jsonArray + ")");
                    }
                    @Override public void onDead(String reason) {
                        js("window.__engineDead && window.__engineDead(" + q(reason) + ")");
                    }
                });

        web.addJavascriptInterface(new NativeBridge(this), "Native");

        ads = new Ads(this, adHolder);
        ads.start();

        takeShare(getIntent());
        web.loadUrl(ORIGIN + "/assets/index.html");
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        takeShare(intent);
        deliverShare();
    }

    @Override
    protected void onPause() {
        if (ads != null) ads.onPause();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (ads != null) ads.onResume();
    }

    @Override
    protected void onDestroy() {
        if (engine != null) engine.stop();
        if (ads != null) ads.onDestroy();
        super.onDestroy();
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    // ---------------- 여백(인셋)·배너 높이를 웹앱에 알려주기 ----------------

    /** 배너가 보이는/사라진 높이(px). Ads 가 부른다. */
    void setAdHeight(int px) {
        adHeightPx = px;
        pushInsets();
    }

    /**
     * 상태바 높이·하단 여백·배너 높이를 CSS 변수로 내려준다.
     * 배너가 떠 있는 동안에는 배너 영역이 하단 여백까지 덮으므로 --safe-b 를 0 으로 만든다.
     */
    private void pushInsets() {
        if (!pageReady || web == null) return;
        float d = getResources().getDisplayMetrics().density;
        if (d <= 0) d = 1f;
        boolean adOn = adHeightPx > 0;
        float safeT = insTopPx / d;
        float safeB = (adOn ? 0 : insBottomPx) / d;
        float adH = adOn ? (adHeightPx + insBottomPx) / d : 0;
        js("(function(r){"
                + "r.setProperty('--safe-t','" + safeT + "px');"
                + "r.setProperty('--safe-b','" + safeB + "px');"
                + "r.setProperty('--ad-h','" + adH + "px');"
                + "})(document.documentElement.style)");
    }

    // ---------------- 공유·파일 열기로 들어온 PGN ----------------

    private void takeShare(Intent it) {
        if (it == null) return;
        String action = it.getAction();
        String text = null;
        if (Intent.ACTION_SEND.equals(action)) {
            text = it.getStringExtra(Intent.EXTRA_TEXT);
            if (text == null && it.getData() != null) text = readUri(it.getData());
        } else if (Intent.ACTION_VIEW.equals(action) && it.getData() != null) {
            text = readUri(it.getData());
        }
        if (text != null && !text.trim().isEmpty()) pendingShare = text;
    }

    private void deliverShare() {
        if (pendingShare == null || !pageReady) return;
        js("window.__incomingPgn && window.__incomingPgn(" + q(pendingShare) + ")");
        pendingShare = null;
    }

    String readUri(Uri uri) {
        try (BufferedReader r = new BufferedReader(new InputStreamReader(
                getContentResolver().openInputStream(uri), StandardCharsets.UTF_8))) {
            StringBuilder sb = new StringBuilder();
            char[] cbuf = new char[8192];
            int n, total = 0;
            while ((n = r.read(cbuf)) > 0) {
                sb.append(cbuf, 0, n);
                total += n;
                if (total > 40 * 1024 * 1024) break;   // 안전장치
            }
            return sb.toString();
        } catch (Exception e) {
            return null;
        }
    }

    // ---------------- 파일 열기/저장 (SAF) ----------------

    void pickFile(String reqId) {
        openReqId = reqId;
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        i.addCategory(Intent.CATEGORY_OPENABLE);
        i.setType("*/*");
        i.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{
                "application/json", "text/plain", "application/x-chess-pgn", "*/*"});
        try {
            startActivityForResult(i, REQ_OPEN);
        } catch (Exception e) {
            js("window.__filePicked && window.__filePicked(" + q(reqId) + ",null,null)");
        }
    }

    void saveFile(String name, String content) {
        pendingSaveContent = content;
        Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        i.addCategory(Intent.CATEGORY_OPENABLE);
        i.setType(name.endsWith(".json") ? "application/json" : "text/plain");
        i.putExtra(Intent.EXTRA_TITLE, name);
        try {
            startActivityForResult(i, REQ_SAVE);
        } catch (Exception e) {
            toast("저장할 수 없습니다");
        }
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (req == REQ_OPEN) {
            String id = openReqId;
            openReqId = null;
            if (res != RESULT_OK || data == null || data.getData() == null) {
                js("window.__filePicked && window.__filePicked(" + q(id) + ",null,null)");
                return;
            }
            Uri uri = data.getData();
            String name = uri.getLastPathSegment();
            String body = readUri(uri);
            js("window.__filePicked && window.__filePicked(" + q(id) + "," + q(name) + "," + q(body) + ")");
        } else if (req == REQ_SAVE) {
            String content = pendingSaveContent;
            pendingSaveContent = null;
            if (res != RESULT_OK || data == null || data.getData() == null || content == null) return;
            try (OutputStream os = getContentResolver().openOutputStream(data.getData())) {
                os.write(content.getBytes(StandardCharsets.UTF_8));
                toast("저장했습니다");
            } catch (Exception e) {
                toast("저장 실패: " + e.getMessage());
            }
        }
    }

    // ---------------- 도우미 ----------------

    void js(final String script) {
        if (web == null) return;
        web.post(() -> {
            try { web.evaluateJavascript(script, null); } catch (Exception ignored) {}
        });
    }

    /** 자바 문자열 → 자바스크립트 리터럴 (JSONObject.quote 는 이스케이프까지 처리) */
    static String q(String s) {
        return s == null ? "null" : JSONObject.quote(s);
    }

    void toast(final String msg) {
        runOnUiThread(() -> Toast.makeText(this, msg, Toast.LENGTH_SHORT).show());
    }

    void keepAwake(final boolean on) {
        runOnUiThread(() -> {
            if (on) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        });
    }

    void shareText(String text) {
        Intent i = new Intent(Intent.ACTION_SEND);
        i.setType("text/plain");
        i.putExtra(Intent.EXTRA_TEXT, text);
        try { startActivity(Intent.createChooser(i, "공유")); } catch (Exception ignored) {}
    }
}
