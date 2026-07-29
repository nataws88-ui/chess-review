#!/usr/bin/env bash
# 안드로이드 자바 코드 타입 검사
#
# 안드로이드 SDK는 x86_64 전용이라 이 폰(arm64)에서 못 돌린다.
# 대신 우리가 쓰는 API만 담은 스텁을 만들어 javac 로 컴파일해 본다.
# → 오타·잘못된 메서드 이름·인자 개수·미구현 인터페이스를 CI 가기 전에 잡는다.
set -e
BASE="$(cd "$(dirname "$0")/.." && pwd -P)"
WORK="${TMPDIR:-/tmp}/chessreview-javacheck"
rm -rf "$WORK"
mkdir -p "$WORK/stub/android/"{app,content,content/pm,content/res,graphics,net,os,view,webkit,widget} \
         "$WORK/stub/androidx/webkit" "$WORK/stub/org/json" "$WORK/out"

S="$WORK/stub"

cat > "$S/android/content/Context.java" <<'EOF'
package android.content;
public class Context {
  public ContentResolver getContentResolver() { return null; }
  public android.content.pm.ApplicationInfo getApplicationInfo() { return null; }
  public void startActivity(Intent i) {}
}
EOF

cat > "$S/android/content/ContentResolver.java" <<'EOF'
package android.content;
public class ContentResolver {
  public java.io.InputStream openInputStream(android.net.Uri u) throws java.io.FileNotFoundException { return null; }
  public java.io.OutputStream openOutputStream(android.net.Uri u) throws java.io.FileNotFoundException { return null; }
}
EOF

cat > "$S/android/content/pm/ApplicationInfo.java" <<'EOF'
package android.content.pm;
public class ApplicationInfo { public String nativeLibraryDir; }
EOF

cat > "$S/android/content/Intent.java" <<'EOF'
package android.content;
public class Intent {
  public static final String ACTION_SEND = "android.intent.action.SEND";
  public static final String ACTION_VIEW = "android.intent.action.VIEW";
  public static final String ACTION_OPEN_DOCUMENT = "android.intent.action.OPEN_DOCUMENT";
  public static final String ACTION_CREATE_DOCUMENT = "android.intent.action.CREATE_DOCUMENT";
  public static final String CATEGORY_OPENABLE = "android.intent.category.OPENABLE";
  public static final String EXTRA_TEXT = "android.intent.extra.TEXT";
  public static final String EXTRA_MIME_TYPES = "android.intent.extra.MIME_TYPES";
  public static final String EXTRA_TITLE = "android.intent.extra.TITLE";
  public Intent() {}
  public Intent(String action) {}
  public Intent(String action, android.net.Uri uri) {}
  public String getAction() { return null; }
  public String getStringExtra(String n) { return null; }
  public android.net.Uri getData() { return null; }
  public Intent addCategory(String c) { return this; }
  public Intent setType(String t) { return this; }
  public Intent putExtra(String k, String v) { return this; }
  public Intent putExtra(String k, String[] v) { return this; }
  public static Intent createChooser(Intent target, CharSequence title) { return target; }
}
EOF

cat > "$S/android/app/Activity.java" <<'EOF'
package android.app;
public class Activity extends android.content.Context {
  public static final int RESULT_OK = -1;
  protected void onCreate(android.os.Bundle b) {}
  protected void onDestroy() {}
  protected void onNewIntent(android.content.Intent i) {}
  protected void onActivityResult(int req, int res, android.content.Intent data) {}
  public void onBackPressed() {}
  public void setContentView(android.view.View v) {}
  public android.view.Window getWindow() { return null; }
  public void runOnUiThread(Runnable r) {}
  public void startActivityForResult(android.content.Intent i, int req) {}
  public android.content.Intent getIntent() { return null; }
  public void setIntent(android.content.Intent i) {}
}
EOF

cat > "$S/android/graphics/Color.java" <<'EOF'
package android.graphics;
public class Color { public static int parseColor(String s) { return 0; } }
EOF

cat > "$S/android/net/Uri.java" <<'EOF'
package android.net;
public class Uri { public String getLastPathSegment() { return null; } public String toString() { return ""; } }
EOF

cat > "$S/android/os/Bundle.java" <<'EOF'
package android.os;
public class Bundle {}
EOF

cat > "$S/android/os/Build.java" <<'EOF'
package android.os;
public class Build {
  public static class VERSION { public static final int SDK_INT = 36; }
  public static class VERSION_CODES { public static final int LOLLIPOP = 21; }
}
EOF

cat > "$S/android/os/Looper.java" <<'EOF'
package android.os;
public class Looper { public static Looper getMainLooper() { return null; } }
EOF

cat > "$S/android/os/Handler.java" <<'EOF'
package android.os;
public class Handler {
  public Handler(Looper l) {}
  public boolean post(Runnable r) { return true; }
  public boolean postDelayed(Runnable r, long ms) { return true; }
}
EOF

cat > "$S/android/view/View.java" <<'EOF'
package android.view;
public class View {
  public View(android.content.Context c) {}
  public void setBackgroundColor(int c) {}
  public boolean post(Runnable r) { return true; }
  public boolean performHapticFeedback(int feedbackConstant) { return true; }
}
EOF

cat > "$S/android/view/Window.java" <<'EOF'
package android.view;
public class Window { public void addFlags(int f) {} public void clearFlags(int f) {} }
EOF

cat > "$S/android/view/WindowManager.java" <<'EOF'
package android.view;
public class WindowManager {
  public static class LayoutParams { public static final int FLAG_KEEP_SCREEN_ON = 128; }
}
EOF

cat > "$S/android/view/HapticFeedbackConstants.java" <<'EOF'
package android.view;
public class HapticFeedbackConstants { public static final int VIRTUAL_KEY = 1; }
EOF

cat > "$S/android/webkit/JavascriptInterface.java" <<'EOF'
package android.webkit;
import java.lang.annotation.*;
@Retention(RetentionPolicy.RUNTIME) @Target(ElementType.METHOD)
public @interface JavascriptInterface {}
EOF

cat > "$S/android/webkit/ValueCallback.java" <<'EOF'
package android.webkit;
public interface ValueCallback<T> { void onReceiveValue(T value); }
EOF

cat > "$S/android/webkit/WebSettings.java" <<'EOF'
package android.webkit;
public class WebSettings {
  public static final int LOAD_NO_CACHE = 2;
  public void setJavaScriptEnabled(boolean b) {}
  public void setDomStorageEnabled(boolean b) {}
  public void setDatabaseEnabled(boolean b) {}
  public void setMediaPlaybackRequiresUserGesture(boolean b) {}
  public void setAllowFileAccess(boolean b) {}
  public void setAllowContentAccess(boolean b) {}
  public void setCacheMode(int m) {}
}
EOF

cat > "$S/android/webkit/WebResourceRequest.java" <<'EOF'
package android.webkit;
public interface WebResourceRequest { android.net.Uri getUrl(); }
EOF

cat > "$S/android/webkit/WebResourceResponse.java" <<'EOF'
package android.webkit;
public class WebResourceResponse {}
EOF

cat > "$S/android/webkit/WebViewClient.java" <<'EOF'
package android.webkit;
public class WebViewClient {
  public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) { return null; }
  public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) { return false; }
  public void onPageFinished(WebView v, String url) {}
}
EOF

cat > "$S/android/webkit/WebView.java" <<'EOF'
package android.webkit;
public class WebView extends android.view.View {
  public WebView(android.content.Context c) { super(c); }
  public static void setWebContentsDebuggingEnabled(boolean b) {}
  public WebSettings getSettings() { return null; }
  public void setWebViewClient(WebViewClient c) {}
  public void addJavascriptInterface(Object obj, String name) {}
  public void loadUrl(String url) {}
  public void evaluateJavascript(String script, ValueCallback<String> cb) {}
  public boolean canGoBack() { return false; }
  public void goBack() {}
}
EOF

cat > "$S/android/widget/Toast.java" <<'EOF'
package android.widget;
public class Toast {
  public static final int LENGTH_SHORT = 0;
  public static Toast makeText(android.content.Context c, CharSequence t, int d) { return null; }
  public void show() {}
}
EOF

cat > "$S/androidx/webkit/WebViewFeature.java" <<'EOF'
package androidx.webkit;
public class WebViewFeature {
  public static final String ALGORITHMIC_DARKENING = "ALGORITHMIC_DARKENING";
  public static final String FORCE_DARK = "FORCE_DARK";
  public static boolean isFeatureSupported(String f) { return false; }
}
EOF

cat > "$S/androidx/webkit/WebSettingsCompat.java" <<'EOF'
package androidx.webkit;
public class WebSettingsCompat {
  public static final int FORCE_DARK_OFF = 0;
  public static void setAlgorithmicDarkeningAllowed(android.webkit.WebSettings s, boolean allow) {}
  public static void setForceDark(android.webkit.WebSettings s, int mode) {}
}
EOF

cat > "$S/androidx/webkit/WebViewAssetLoader.java" <<'EOF'
package androidx.webkit;
public class WebViewAssetLoader {
  public interface PathHandler { android.webkit.WebResourceResponse handle(String path); }
  public static class AssetsPathHandler implements PathHandler {
    public AssetsPathHandler(android.content.Context c) {}
    public android.webkit.WebResourceResponse handle(String path) { return null; }
  }
  public static class Builder {
    public Builder addPathHandler(String prefix, PathHandler h) { return this; }
    public WebViewAssetLoader build() { return new WebViewAssetLoader(); }
  }
  public android.webkit.WebResourceResponse shouldInterceptRequest(android.net.Uri u) { return null; }
}
EOF

cat > "$S/org/json/JSONObject.java" <<'EOF'
package org.json;
public class JSONObject { public static String quote(String s) { return ""; } }
EOF

cat > "$S/org/json/JSONArray.java" <<'EOF'
package org.json;
public class JSONArray {
  public JSONArray(java.util.Collection<?> c) {}
  public String toString() { return "[]"; }
}
EOF

# AGP 가 생성해 주는 클래스
mkdir -p "$WORK/gen/com/bicyail/chessreview"
cat > "$WORK/gen/com/bicyail/chessreview/BuildConfig.java" <<'EOF'
package com.bicyail.chessreview;
public final class BuildConfig {
  public static final boolean DEBUG = false;
  public static final String VERSION_NAME = "1.0.0";
}
EOF

javac -nowarn -d "$WORK/out" -encoding UTF-8 \
  -sourcepath "$S:$WORK/gen:$BASE/android/app/src/main/java" \
  "$BASE"/android/app/src/main/java/com/bicyail/chessreview/*.java 2>&1 | tee "$WORK/log"

if [ -s "$WORK/log" ] && grep -q 'error' "$WORK/log"; then
  echo "❌ 자바 컴파일 오류"
  exit 1
fi
echo "✅ 자바 3개 파일 타입 검사 통과 (스텁 대상)"
ls "$WORK/out/com/bicyail/chessreview/" | sed 's/^/   /'
