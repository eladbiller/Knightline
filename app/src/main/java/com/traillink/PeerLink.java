package com.traillink;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Context;
import android.graphics.Color;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.webkit.ConsoleMessage;
import android.webkit.WebMessage;
import android.webkit.WebMessagePort;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.view.Gravity;
import android.view.ViewGroup;
import android.widget.FrameLayout;

import androidx.webkit.WebViewAssetLoader;

import com.eladbiller.knightline.BuildConfig;

import org.json.JSONObject;

import java.io.ByteArrayInputStream;

/**
 * Isolated PeerJS/WebRTC transport for private online rooms.
 *
 * <p>The hidden page receives only a message port, not an injected JavaScript
 * interface. Its bundled PeerJS client can talk to its public signaling
 * service, while game frames are still bounded and validated by MainActivity.</p>
 */
public final class PeerLink extends BluetoothLink {
    private static final String ORIGIN = "https://appassets.androidplatform.net";
    private static final String PAGE = ORIGIN + "/assets/peer-bridge.html";
    // The transport page has no visible surface and may use only this exact
    // TLS signalling service. The visible Knightline WebView remains local-only.
    private static final String PEER_SIGNALING_HOST = "0.peerjs.com";
    private final Handler ui = new Handler(Looper.getMainLooper());
    private final WebView web;
    private WebMessagePort port;
    private boolean pageReady;
    private JSONObject pending;
    private boolean intentionallyClosed;

    @SuppressLint("SetJavaScriptEnabled")
    public PeerLink(Context context, Listener callback) {
        super(null, callback);
        WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(context))
                .build();
        // Keep the transport WebView attached to the Activity. Chromium can
        // throttle a completely detached page, preventing its signalling
        // WebSocket from opening even though the packaged page itself loads.
        web = new WebView(context);
        web.setBackgroundColor(Color.TRANSPARENT);
        web.setAlpha(.01f);
        web.setFocusable(false);
        web.setFocusableInTouchMode(false);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        if (BuildConfig.DEBUG) {
            web.setWebChromeClient(new android.webkit.WebChromeClient() {
                @Override public boolean onConsoleMessage(ConsoleMessage message) {
                    Log.d("KnightlinePeer", message.message() + " @" + message.lineNumber());
                    return true;
                }
            });
        }
        web.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view,
                    WebResourceRequest request) {
                return intercept(loader, request == null ? null : request.getUrl());
            }

            @Override @SuppressWarnings("deprecation") public WebResourceResponse shouldInterceptRequest(
                    WebView view, String url) {
                return intercept(loader, url == null ? null : Uri.parse(url));
            }

            @Override public void onPageFinished(WebView view, String url) {
                if (PAGE.equals(url)) {
                    pageReady = true;
                    attachPort();
                }
            }
        });
        attachInvisibleTransport(context);
        web.loadUrl(PAGE);
    }

    private void attachInvisibleTransport(Context context) {
        if (!(context instanceof Activity)) return;
        Activity activity = (Activity) context;
        ViewGroup content = activity.findViewById(android.R.id.content);
        if (content == null) return;
        FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(1, 1,
                Gravity.BOTTOM | Gravity.END);
        content.addView(web, params);
    }

    private WebResourceResponse intercept(WebViewAssetLoader loader, Uri uri) {
        if (uri != null && "https".equals(uri.getScheme())
                && "appassets.androidplatform.net".equals(uri.getHost())) {
            WebResourceResponse response = loader.shouldInterceptRequest(uri);
            if (response != null) return response;
        }
        if (uri != null && ("https".equals(uri.getScheme()) || "wss".equals(uri.getScheme()))
                && PEER_SIGNALING_HOST.equalsIgnoreCase(uri.getHost())) {
            // PeerJS first allocates an id over HTTPS before it upgrades to its
            // WebSocket channel. Do not intercept that single, allow-listed host.
            return null;
        }
        // PeerJS uses WebSocket/WebRTC signaling; unexpected HTTP subresources
        // have no reason to load in this minimal hidden page.
        return new WebResourceResponse("text/plain", "UTF-8", new ByteArrayInputStream(new byte[0]));
    }

    private void attachPort() {
        if (!pageReady) return;
        if (port != null) try { port.close(); } catch (Exception ignored) { }
        WebMessagePort[] ports = web.createWebMessageChannel();
        port = ports[0];
        port.setWebMessageCallback(new WebMessagePort.WebMessageCallback() {
            @Override public void onMessage(WebMessagePort source, WebMessage message) {
                final String raw = message == null ? "" : message.getData();
                ui.post(() -> receive(raw));
            }
        });
        web.postWebMessage(new WebMessage("knightline-peer-bridge-v1",
                new WebMessagePort[]{ports[1]}), Uri.parse(ORIGIN));
        runPending();
    }

    public void hostRoom(String room) {
        intentionallyClosed = false;
        connected = false;
        pending = command("type", "host", "room", room);
        runPending();
    }

    public void joinRoom(String room, String name) {
        intentionallyClosed = false;
        connected = false;
        pending = command("type", "join", "room", room, "name", name);
        runPending();
    }

    @Override public synchronized void close() {
        intentionallyClosed = true;
        connected = false;
        generation++;
        pending = null;
        post(command("type", "close"));
    }

    @Override public void send(JSONObject data) {
        if (!connected || data == null || data.toString().length() > 65536) return;
        post(command("type", "frame", "raw", data.toString()));
    }

    @Override public void sendLatest(JSONObject data) { send(data); }

    private void runPending() {
        if (!pageReady || pending == null) return;
        JSONObject command = pending;
        pending = null;
        post(command);
    }

    private void post(JSONObject command) {
        if (port == null || command == null) return;
        web.post(() -> {
            try { if (port != null) port.postMessage(new WebMessage(command.toString())); }
            catch (Exception ignored) { }
        });
    }

    private void receive(String raw) {
        if (raw == null || raw.length() > 65536) return;
        try {
            JSONObject event = new JSONObject(raw);
            String kind = event.optString("kind");
            if ("status".equals(kind)) listener.status(event.optString("text"));
            else if ("connected".equals(kind)) {
                connected = true;
                listener.connected(event.optString("name", "Online friend"),
                        "peerjs:" + event.optString("room"));
            } else if ("message".equals(kind)) {
                JSONObject frame = event.optJSONObject("frame");
                if (frame != null && frame.toString().length() <= 65536) listener.message(frame);
            } else if ("lost".equals(kind) && !intentionallyClosed) {
                connected = false;
                listener.status("Online connection lost • rejoin the room to resume");
                listener.lost();
            }
        } catch (Exception ignored) {
            // The hidden transport page is never game authority.
        }
    }

    private static JSONObject command(Object... values) {
        JSONObject command = new JSONObject();
        try {
            for (int index = 0; index < values.length; index += 2) {
                command.put((String) values[index], values[index + 1]);
            }
        } catch (Exception ignored) { }
        return command;
    }
}
