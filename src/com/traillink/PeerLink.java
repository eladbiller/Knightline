package com.traillink;

import android.annotation.SuppressLint;
import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import org.json.JSONObject;

/**
 * PeerJS/WebRTC transport for private online rooms.  Game authority, legality and
 * state validation remain in MainActivity; this class only moves bounded JSON
 * messages over a reliable WebRTC data channel.
 */
public final class PeerLink extends BluetoothLink {
    private final Handler ui = new Handler(Looper.getMainLooper());
    private final WebView web;
    private boolean pageReady;
    private String pending = "";
    private boolean intentionallyClosed;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    public PeerLink(Context context, Listener callback) {
        super(null, callback);
        web = new WebView(context.getApplicationContext());
        web.getSettings().setJavaScriptEnabled(true);
        web.getSettings().setDomStorageEnabled(false);
        web.addJavascriptInterface(new Bridge(), "ChessLinkNative");
        web.setWebViewClient(new WebViewClient() {
            @Override public void onPageFinished(WebView view, String url) {
                pageReady = true;
                runPending();
            }
        });
        web.loadUrl("file:///android_asset/peer-bridge.html");
    }

    public void hostRoom(String room) {
        intentionallyClosed = false;
        connected = false;
        pending = "hostRoom(" + quote(room) + ")";
        runPending();
    }

    public void joinRoom(String room, String name) {
        intentionallyClosed = false;
        connected = false;
        pending = "joinRoom(" + quote(room) + "," + quote(name) + ")";
        runPending();
    }

    @Override public synchronized void close() {
        intentionallyClosed = true;
        connected = false;
        generation++;
        pending = "";
        if (pageReady) web.post(() -> web.evaluateJavascript("closeRoom()", null));
    }

    @Override public void send(JSONObject data) {
        if (!connected || data == null || data.toString().length() > 65536) return;
        String call = "sendFrame(" + quote(data.toString()) + ")";
        web.post(() -> web.evaluateJavascript(call, null));
    }

    @Override public void sendLatest(JSONObject data) { send(data); }

    private void runPending() {
        if (!pageReady || pending.isEmpty()) return;
        String call = pending;
        pending = "";
        web.post(() -> web.evaluateJavascript(call, null));
    }

    private static String quote(String value) { return JSONObject.quote(value == null ? "" : value); }

    private final class Bridge {
        @JavascriptInterface public void receive(String raw) {
            ui.post(() -> {
                try {
                    JSONObject event = new JSONObject(raw);
                    String kind = event.optString("kind");
                    if ("status".equals(kind)) listener.status(event.optString("text"));
                    else if ("connected".equals(kind)) {
                        connected = true;
                        listener.connected(event.optString("name", "Online friend"), "peerjs:" + event.optString("room"));
                    } else if ("message".equals(kind)) {
                        JSONObject frame = event.optJSONObject("frame");
                        if (frame != null && frame.toString().length() <= 65536) listener.message(frame);
                    } else if ("lost".equals(kind) && !intentionallyClosed) {
                        connected = false;
                        listener.status("Online connection lost • rejoin the room to resume");
                        listener.lost();
                    }
                } catch (Exception ignored) { }
            });
        }
    }
}
