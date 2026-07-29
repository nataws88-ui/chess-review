package com.bicyail.chessreview;

import android.os.Handler;
import android.os.Looper;

import org.json.JSONArray;

import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.File;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/**
 * 스톡피시(네이티브 arm64 바이너리)를 자식 프로세스로 띄우고 UCI로 주고받는다.
 *
 * 왜 jniLibs 안의 libstockfish.so 를 실행하는가:
 *   Android 10부터 앱 데이터 디렉터리의 파일은 실행(exec)이 금지된다.
 *   설치 시 풀리는 네이티브 라이브러리 디렉터리만 예외라서, 엔진 바이너리를
 *   .so 이름으로 위장해 넣고 그 경로를 실행한다. (build.gradle의 useLegacyPackaging=true 필수)
 */
class Engine {

    interface Sink {
        void onLines(String jsonArray);   // 엔진이 뱉은 줄들(JSON 배열 문자열)
        void onDead(String reason);
    }

    private final String exePath;
    private final Sink sink;
    private final Handler ui = new Handler(Looper.getMainLooper());

    private Process proc;
    private BufferedWriter in;
    private Thread reader;

    private final List<String> buf = new ArrayList<>();
    private boolean flushScheduled = false;
    private volatile boolean stopping = false;

    Engine(String exePath, Sink sink) {
        this.exePath = exePath;
        this.sink = sink;
    }

    String path() { return exePath; }

    boolean available() {
        File f = new File(exePath);
        return f.exists() && f.canExecute();
    }

    synchronized boolean isRunning() {
        return proc != null && proc.isAlive();
    }

    /** @return null이면 성공, 아니면 실패 사유 */
    synchronized String start() {
        if (isRunning()) return null;
        stop();
        stopping = false;
        try {
            ProcessBuilder pb = new ProcessBuilder(exePath);
            pb.redirectErrorStream(true);
            // 엔진이 임시 파일을 만들 일은 없지만, 작업 디렉터리는 쓰기 가능한 곳으로 둔다.
            File dir = new File(exePath).getParentFile();
            if (dir != null && dir.exists()) pb.directory(dir);
            proc = pb.start();
            in = new BufferedWriter(new OutputStreamWriter(proc.getOutputStream(), StandardCharsets.UTF_8));

            final Process p = proc;
            reader = new Thread(() -> {
                try (BufferedReader br = new BufferedReader(
                        new InputStreamReader(p.getInputStream(), StandardCharsets.UTF_8))) {
                    String line;
                    while ((line = br.readLine()) != null) push(line);
                } catch (Exception ignored) {
                } finally {
                    flushNow();
                    if (!stopping) ui.post(() -> sink.onDead("engine exited"));
                }
            }, "sf-reader");
            reader.setDaemon(true);
            reader.start();
            return null;
        } catch (Exception e) {
            proc = null;
            return e.getClass().getSimpleName() + ": " + e.getMessage();
        }
    }

    synchronized void send(String cmd) {
        if (in == null || !isRunning()) return;
        try {
            in.write(cmd);
            in.write("\n");
            in.flush();
        } catch (Exception e) {
            ui.post(() -> sink.onDead("write failed"));
        }
    }

    synchronized void stop() {
        stopping = true;
        try { if (in != null) { in.write("quit\n"); in.flush(); } } catch (Exception ignored) {}
        try { if (proc != null) proc.destroy(); } catch (Exception ignored) {}
        proc = null;
        in = null;
        reader = null;
    }

    // ---- 엔진 출력은 초당 수십 줄이 나올 수 있어 40ms 단위로 묶어서 WebView에 넘긴다 ----
    private void push(String line) {
        synchronized (buf) {
            buf.add(line);
            if (!flushScheduled) {
                flushScheduled = true;
                ui.postDelayed(this::flushNow, 40);
            }
        }
    }

    private void flushNow() {
        String json;
        synchronized (buf) {
            flushScheduled = false;
            if (buf.isEmpty()) return;
            json = new JSONArray(buf).toString();
            buf.clear();
        }
        sink.onLines(json);
    }
}
