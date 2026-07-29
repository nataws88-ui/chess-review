# WebView ↔ JS 브리지 메서드는 이름으로 호출되므로 절대 난독화/제거하면 안 된다.
-keepclassmembers class com.bicyail.chessreview.** {
    @android.webkit.JavascriptInterface <methods>;
}
-keep class com.bicyail.chessreview.NativeBridge { *; }
-keepattributes JavascriptInterface
