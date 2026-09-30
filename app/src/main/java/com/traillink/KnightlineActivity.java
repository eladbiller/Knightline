package com.traillink;

import android.annotation.SuppressLint;
import android.bluetooth.BluetoothDevice;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.webkit.WebMessage;
import android.webkit.WebMessagePort;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.view.ViewGroup;
import android.view.Gravity;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.graphics.Typeface;

import androidx.core.view.ViewCompat;
import androidx.webkit.WebViewAssetLoader;

import com.eladbiller.knightline.AndroidPrivateRatingStorage;
import com.eladbiller.knightline.BridgeGuard;
import com.eladbiller.knightline.BuildConfig;
import com.eladbiller.knightline.SkillRatingStore;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Locale;
import java.util.UUID;

/**
 * Knightline's Android shell. The page is only a view: move validation,
 * persistence, Stockfish, Bluetooth, PeerJS frames and clocks stay in the
 * inherited native chess controller.
 */
public final class KnightlineActivity extends ChessLinkActivity {
    static final int KNIGHTLINE_PROTOCOL = 1;
    static final int BRIDGE_VERSION = 1;
    static final int MAX_COMMAND_BYTES = 16 * 1024;
    static final String ORIGIN = "https://appassets.androidplatform.net";
    static final String START_URL = ORIGIN + "/assets/ui/index.html";

    private final byte[] blockedResource = new byte[0];
    private WebView webView;
    private View startupOverlay;
    private WebMessagePort messagePort;
    private boolean pageLoaded;
    private boolean pageCommitted;
    private boolean uiReady;
    private final BridgeGuard bridgeGuard = new BridgeGuard();
    private long revision;
    private String requestedScreen = "home";
    private Runnable pendingConfirmation;
    private Runnable pendingConfirmationCancel;
    private String pendingConfirmationToken = "";
    private int incomingRemoteGame = -1;
    private String pendingPromotionSession = "";
    private int pendingPromotionFrom = -1;
    private int pendingPromotionTo = -1;
    private String ratingOutcomeSession = "";
    private String ratingPeerSession = "";
    private int peerRatingAtStart = -1;
    private int ownRatingAtStart = -1;
    private boolean usedHint;
    private boolean usedTakeback;
    private boolean usedReviewBranch;
    private SkillRatingStore privateRating;
    private PuzzleCatalog puzzleCatalog;
    private PuzzleSession puzzle;
    private String puzzleToken = "";
    private String puzzleCollection = "all";
    private ChessReviewWorkspace reviewWorkspace;
    private String reviewToken = "";
    private int reviewWorkspaceIndex = -1, reviewOrientation;
    private String reviewWorkspaceSession = "";
    private boolean reviewShowBest;
    private volatile long reviewSearchGeneration;
    private volatile StockfishEngine reviewEngine;
    private final java.util.concurrent.ExecutorService reviewWorker = java.util.concurrent.Executors.newSingleThreadExecutor();
    private StockfishEngine.Coach reviewEvaluation;
    private String reviewEvaluationState = "Analyzing…";

    @Override public void onCreate(Bundle bundle) {
        // MainActivity restores its native save and calls the virtual home().
        // Our home() deliberately queues state until this safe local page is ready.
        super.onCreate(bundle);
        privateRating = new SkillRatingStore(new AndroidPrivateRatingStorage(this));
        ratingOutcomeSession = getSharedPreferences("knightline-rating-session", MODE_PRIVATE)
                .getString("completed", "");
        restoreSessionIntegrityState();
        try (java.io.Reader input = new java.io.InputStreamReader(getAssets().open("puzzles/lichess-pack.tsv"), StandardCharsets.UTF_8)) {
            puzzleCatalog = new PuzzleCatalog(input);
        } catch (Exception error) { throw new IllegalStateException("Packaged puzzle catalog is invalid", error); }
        // Prepare the shared NNUE once; review uses a separate process so a long
        // post-game report cannot block interactive exploration.
        worker.execute(() -> { try { getStockfish(); } catch (Exception ignored) { } });
        createLocalWebView();
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void createLocalWebView() {
        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();
        webView = new WebView(this);
        // Keep the browser's first frame on the same deep-ink surface as the
        // native shell. Transparent WebViews can remain blank on a slow cold
        // start on some emulators.
        webView.setBackgroundColor(Color.rgb(7, 16, 30));
        WebSettings settings = webView.getSettings();
        // CSS receives Android's font preference with native state. WebView's
        // independent text zoom would otherwise enlarge glyphs without their
        // rem-based layout tracks, creating clipped text at large font sizes.
        settings.setTextZoom(100);
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(false);
        settings.setDatabaseEnabled(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        settings.setMediaPlaybackRequiresUserGesture(true);
        if (Build.VERSION.SDK_INT >= 26) settings.setSafeBrowsingEnabled(true);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        webView.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view,
                    WebResourceRequest request) {
                return localOnly(loader, request == null ? null : request.getUrl());
            }

            @Override @SuppressWarnings("deprecation") public WebResourceResponse shouldInterceptRequest(
                    WebView view, String url) {
                return localOnly(loader, url == null ? null : Uri.parse(url));
            }

            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                // The visible UI never leaves its packaged origin. External links are not trusted
                // navigation targets for this game shell.
                return true;
            }

            @Override @SuppressWarnings("deprecation") public boolean shouldOverrideUrlLoading(
                    WebView view, String url) {
                return true;
            }

            @Override public void onPageFinished(WebView view, String url) {
                if (START_URL.equals(url)) {
                    pageLoaded = true;
                    attachMessagePort();
                }
            }

            @Override public void onPageCommitVisible(WebView view, String url) {
                if (START_URL.equals(url)) {
                    pageCommitted = true;
                    dismissStartupWhenReady();
                }
            }
        });
        // API 35 can draw edge-to-edge even when the manifest asks for resize.
        // Shrinking the actual WebView for the IME gives CSS fixed sheets a real
        // viewport above the keyboard instead of letting the keyboard cover them.
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(7, 16, 30));
        root.addView(webView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        startupOverlay = createStartupOverlay();
        root.addView(startupOverlay, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            // Own all system/IME insets in one place. WebView safe-area reports
            // omitted the gesture bar on some builds, putting controls beneath
            // it. Consume them after resizing the real HTML viewport.
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets safe = insets.getInsets(android.view.WindowInsets.Type.systemBars()
                        | android.view.WindowInsets.Type.displayCutout() | android.view.WindowInsets.Type.ime());
                view.setPadding(safe.left, safe.top, safe.right, safe.bottom);
                return android.view.WindowInsets.CONSUMED;
            }
            view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                    insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            return insets.consumeSystemWindowInsets();
        });
        setContentView(root);
        ViewCompat.requestApplyInsets(root);
        webView.loadUrl(START_URL);
    }

    /** A short native first frame only; all reachable app UI remains HTML. */
    private View createStartupOverlay() {
        FrameLayout surface = new FrameLayout(this);
        surface.setBackgroundColor(Color.rgb(7, 16, 30));
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setGravity(Gravity.CENTER_HORIZONTAL);
        content.setPadding(dp(28), dp(26), dp(28), dp(28));

        android.widget.ImageView mark = new android.widget.ImageView(this);
        mark.setImageResource(com.eladbiller.knightline.R.drawable.icon);
        mark.setContentDescription("Knightline knight");
        content.addView(mark, new LinearLayout.LayoutParams(dp(72), dp(72)));

        TextView title = new TextView(this);
        title.setText("Knightline");
        title.setGravity(Gravity.CENTER);
        title.setTextColor(Color.rgb(248, 242, 229));
        title.setTextSize(25);
        title.setTypeface(Typeface.create("sans-serif", Typeface.BOLD));
        LinearLayout.LayoutParams titleParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        titleParams.topMargin = dp(17);
        content.addView(title, titleParams);

        TextView detail = new TextView(this);
        detail.setText("Preparing your private board");
        detail.setGravity(Gravity.CENTER);
        detail.setTextColor(Color.rgb(181, 193, 215));
        detail.setTextSize(14);
        LinearLayout.LayoutParams detailParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        detailParams.topMargin = dp(7);
        content.addView(detail, detailParams);

        FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER);
        params.leftMargin = dp(20);
        params.rightMargin = dp(20);
        surface.addView(content, params);
        return surface;
    }

    private void dismissStartupOverlay() {
        if (startupOverlay == null || startupOverlay.getVisibility() != View.VISIBLE) return;
        final View closing = startupOverlay;
        startupOverlay = null;
        closing.animate().alpha(0f).setDuration(160L).withEndAction(() -> {
            closing.setVisibility(View.GONE);
            closing.setAlpha(1f);
        }).start();
    }

    private void dismissStartupWhenReady() {
        if (!pageCommitted || !uiReady || webView == null) return;
        // Page-commit-visible is WebView's compositor guarantee. Posting once
        // lets the just-published initial state reach the local page before the
        // native first frame fades, avoiding a dark gap on cold emulator boots.
        webView.postDelayed(this::dismissStartupOverlay, 100L);
    }

    @Override public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (!hasFocus) return;
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().getInsetsController().setSystemBarsAppearance(0,
                    android.view.WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
                            | android.view.WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS);
        } else {
            View decor = getWindow().getDecorView();
            decor.setSystemUiVisibility(decor.getSystemUiVisibility()
                    & ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR & ~View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        }
    }

    private WebResourceResponse localOnly(WebViewAssetLoader loader, Uri request) {
        if (request != null && "https".equals(request.getScheme())
                && "appassets.androidplatform.net".equals(request.getHost())) {
            WebResourceResponse response = loader.shouldInterceptRequest(request);
            if (response != null) return response;
        }
        return new WebResourceResponse("text/plain", "UTF-8",
                new ByteArrayInputStream(blockedResource));
    }

    private void attachMessagePort() {
        if (!pageLoaded || webView == null) return;
        if (messagePort != null) {
            try { messagePort.close(); } catch (Exception ignored) { }
        }
        WebMessagePort[] ports = webView.createWebMessageChannel();
        messagePort = ports[0];
        uiReady = false;
        bridgeGuard.reset();
        messagePort.setWebMessageCallback(new WebMessagePort.WebMessageCallback() {
            @Override public void onMessage(WebMessagePort port, WebMessage message) {
                final String raw = message == null ? null : message.getData();
                runOnUiThread(() -> receiveCommand(raw));
            }
        });
        webView.postWebMessage(new WebMessage("knightline-bridge-v1",
                new WebMessagePort[]{ports[1]}), Uri.parse(ORIGIN));
    }

    @Override int protocolVersion() { return KNIGHTLINE_PROTOCOL; }

    @Override void home() {
        reviewing = false;
        inGame = false;
        gameScreen = false;
        board = null;
        requestedScreen = "home";
        publishState();
    }

    @Override void renderGame() {
        // A delayed match/engine callback may refresh data, but must not eject
        // the player from an independent puzzle into the saved game.
        if ("puzzle".equals(requestedScreen)) { publishState(); return; }
        if (state == null) { home(); return; }
        reviewing = false;
        inGame = true;
        // ChessLink's asynchronous coach publishes its result only while the
        // game surface is active.  The WebView is still that game surface.
        gameScreen = true;
        board = null;
        requestedScreen = "game";
        recordFinishedRatingIfEligible();
        publishState();
    }

    @Override void review() {
        if (!hasReview()) {
            notice("Review unlocks after the first move is saved.", false);
            return;
        }
        boolean entering = !"review".equals(requestedScreen);
        if (entering) { reviewOrientation = me; reviewMode = 1; resetReviewWorkspace(); }
        reviewing = true;
        inGame = true;
        gameScreen = false;
        requestedScreen = "review";
        ensureReviewWorkspace();
        publishState();
    }

    @Override void updateClockViews() {
        if (state != null && state.optInt("id", -1) == 0) {
            postEvent("clock", clockPayload());
        }
    }

    @Override void updateEvaluationChip() {
        // Stockfish resolves asynchronously. Publish only the changed state rather
        // than rebuilding a native view or disturbing the HTML board/sheet.
        publishState();
    }

    @Override public void status(String value) {
        runOnUiThread(() -> {
            status = value == null ? "" : value;
            postEvent("transport", transportPayload());
            publishState();
        });
    }

    @Override public void connected(String name, String address) {
        super.connected(name, address);
        runOnUiThread(() -> postEvent("transport", transportPayload()));
    }

    @Override public void lost() {
        super.lost();
        runOnUiThread(() -> postEvent("transport", transportPayload()));
    }

    @Override void toast(String text) { notice(text, false); }

    @Override void menu() {
        JSONArray choices = new JSONArray();
        if (inGame && state != null && state.optInt("winner", -1) < 0) {
            if (isNormalBotGame() && undoPly() >= 0) option(choices, "match.takeback", "Take back move", "Return to your prior decision");
            option(choices, "match.resign", "Resign game", "End this game and save the result");
        }
        if (game != null || state != null) option(choices, "match.clear", "Clear saved game", "Remove this local saved match");
        if (ready && !local) option(choices, "chat.open", "Private chat", "Message the connected Knightline player");
        if (ready) option(choices, "transport.disconnect", "Disconnect", "Leave this private room");
        option(choices, "engine.info", "Stockfish engine", "Offline engine, license and source notice");
        option(choices, "transport.settings", "Bluetooth setup", "Pair and discover a nearby Knightline phone");
        JSONObject payload = obj("kind", "menu", "title", "Game menu",
                "subtitle", "Private controls for this device and match.", "choices", choices);
        postEvent("overlay", payload);
    }

    @Override void confirm(String title, String message, Runnable yes) {
        pendingConfirmationToken = UUID.randomUUID().toString();
        pendingConfirmation = yes;
        pendingConfirmationCancel = null;
        JSONObject payload = obj("kind", "confirm", "title", title, "subtitle", message,
                "token", pendingConfirmationToken, "confirmLabel", "Continue");
        postEvent("confirm", payload);
    }

    @Override void chat() {
        JSONArray messages = new JSONArray();
        for (String entry : chats) messages.put(entry);
        postEvent("overlay", obj("kind", "chat", "title", "Private chat",
                "subtitle", ready ? "Messages travel only through this private match." : "Connect first to send a message.",
                "messages", messages, "connected", ready));
    }

    @Override void moveList() {
        boolean liveGame = game != null && game.winner < 0;
        postEvent("overlay", obj("kind", "moves", "title", "Move history",
                "subtitle", hasReview() ? (liveGame
                        ? "Explore any played position without leaving your saved game."
                        : "Review every decision with Stockfish scores and alternatives.")
                        : "Moves are saved as you play.",
                "moves", moveHistory(), "canReview", hasReview(), "liveGame", liveGame));
    }

    @Override void devices() {
        foundDevices.clear();
        seen.clear();
        discovered.clear();
        postEvent("overlay", obj("kind", "nearby", "title", "Join nearby game",
                "subtitle", "Scanning for Knightline phones nearby.", "transport", transportPayload()));
        scan();
    }

    @Override void scan() {
        if (adapter == null) {
            notice("This device does not have Bluetooth. Offline play is still available.", true);
            return;
        }
        adapter.cancelDiscovery();
        seen.clear();
        discovered.clear();
        foundDevices.clear();
        boolean started = adapter.startDiscovery();
        status = started ? "Scanning for nearby Knightline phones…"
                : "Could not start scanning. Check Bluetooth and Nearby devices permission.";
        postEvent("transport", transportPayload());
    }

    @Override void addDevice(BluetoothDevice device) {
        if (device == null || seen.contains(device.getAddress())) return;
        String name = device.getName();
        if (name == null || name.trim().isEmpty()) return;
        seen.add(device.getAddress());
        foundDevices.add(device);
        postEvent("transport", transportPayload());
    }

    @Override void startGame(int id) {
        usedHint = false;
        usedTakeback = false;
        usedReviewBranch = false;
        peerRatingAtStart = -1;
        ownRatingAtStart = -1;
        ratingPeerSession = "";
        super.startGame(id);
        persistSessionIntegrityState();
        if (id == 0 && !local && ready) ensureFriendRatingExchange();
    }

    @Override void continueChess(int ply) {
        // Review branching and a normal takeback both invalidate rating, but
        // they are different player choices and must remain labelled correctly.
        if (reviewing) usedReviewBranch = true;
        else usedTakeback = true;
        super.continueChess(ply);
        persistSessionIntegrityState();
    }

    @Override void showSnapshot() {
        super.showSnapshot();
        ensureFriendRatingExchange();
        recordFinishedRatingIfEligible();
    }

    @Override public void message(JSONObject message) {
        if (message != null && "rating".equals(message.optString("type"))) {
            String match = message.optString("session", "");
            int rating = message.optInt("rating", -1);
            if (!match.isEmpty() && match.equals(session) && rating >= 1 && rating <= 10000) {
                peerRatingAtStart = rating;
                persistSessionIntegrityState();
                publishState();
            }
            return;
        }
        if (message != null && ("offer".equals(message.optString("type"))
                || "suggest".equals(message.optString("type")))) {
            handleRemoteInvitation(message);
            return;
        }
        super.message(message);
        if (message != null && "state".equals(message.optString("type"))) {
            handler.post(this::ensureFriendRatingExchange);
        }
    }

    @Override public void onBackPressed() {
        if (uiReady) {
            postEvent("back", new JSONObject());
            return;
        }
        super.onBackPressed();
    }

    @Override protected void onDestroy() {
        reviewSearchGeneration++;
        reviewWorker.shutdownNow();
        if (reviewEngine != null) reviewEngine.close();
        if (messagePort != null) {
            try { messagePort.close(); } catch (Exception ignored) { }
            messagePort = null;
        }
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    private void receiveCommand(String raw) {
        if (raw == null || raw.length() == 0 || raw.getBytes(StandardCharsets.UTF_8).length > MAX_COMMAND_BYTES) {
            reject("Malformed or oversized command.");
            return;
        }
        try {
            JSONObject command = new JSONObject(raw);
            String id = command.optString("id", "");
            String type = command.optString("type", "");
            BridgeGuard.Decision decision = bridgeGuard.accept(command.optInt("v", -1), id, type,
                    command.optLong("seq", -1), uiReady);
            if (!decision.accepted) { reject(decision.rejection); return; }
            if (decision.becomesReady) {
                uiReady = true;
                publishState();
                postEvent("transport", transportPayload());
                dismissStartupWhenReady();
                return;
            }
            JSONObject payload = command.optJSONObject("payload");
            if (payload == null) payload = new JSONObject();
            if (BridgeGuard.requiresActiveMatch(type)
                    && !BridgeGuard.matchesActiveSession(command.optString("session", ""), session, state != null)) {
                reject("This game changed. The board has been refreshed.");
                publishState();
                return;
            }
            handleCommand(type, payload);
        } catch (Exception error) {
            reject("That action could not be read safely.");
        }
    }

    private void handleCommand(String type, JSONObject payload) {
        switch (type) {
            case "nav.home": home(); return;
            case "nav.play": requestedScreen = "play"; publishState(); return;
            case "nav.learn": requestedScreen = "learn"; publishState(); return;
            case "nav.profile": requestedScreen = "profile"; publishState(); return;
            case "nav.back":
                if ("puzzle".equals(requestedScreen)) { requestedScreen = "learn"; publishState(); return; }
                if (reviewing) renderGame(); else if (inGame) home(); else requestedScreen = "home";
                publishState(); return;
            case "ui.closeOverlay": return;
            case "confirm.accept": acceptConfirmation(payload.optString("token", "")); return;
            case "confirm.cancel": cancelConfirmation(payload.optString("token", "")); return;
            case "match.startBot": startBotFromPayload(payload); return;
            case "match.startPass": startPassFromPayload(payload); return;
            case "match.resume": requestedScreen = "game"; if (local || host) showSnapshot(); else renderGame(); return;
            case "learn.start": beginLesson(payload); return;
            case "puzzle.start": puzzleCollection = payload.optString("collection", "all"); startPuzzle(payload.optInt("index", -1)); return;
            case "puzzle.move":
            case "puzzle.hint":
            case "puzzle.retry":
            case "puzzle.next": puzzleCommand(type, payload); return;
            case "match.move": moveFromPayload(payload); return;
            case "promotion.choose": choosePromotion(payload); return;
            case "coach.advance": advanceCoach(); return;
            case "match.takeback": undoChess(); return;
            case "match.resign": requestResign(); return;
            case "match.rematch": rematch(); return;
            case "match.retryBot": retryBot(); return;
            case "match.openMoves": moveList(); return;
            case "match.openMenu": menu(); return;
            case "match.clear": requestClearSaved(); return;
            case "match.inviteRemote":
            case "match.suggestRemote": inviteRemoteChess(payload); return;
            case "review.open": reviewIndex = Math.max(1, reviewTotal() - 1); reviewMode = 1; resetReviewWorkspace(); review(); return;
            case "review.previous": if (reviewIndex > 1) { reviewIndex--; reviewMode = 1; resetReviewWorkspace(); review(); } return;
            case "review.next": if (reviewIndex < reviewTotal() - 1) { reviewIndex++; reviewMode = 1; resetReviewWorkspace(); review(); } return;
            case "review.mode": reviewMode = clamp(payload.optInt("mode", 1), 0, 1); resetReviewWorkspace(); review(); return;
            case "review.jump":
                int target = payload.optInt("index", -1);
                if (target < 1 || target >= reviewTotal()) { reject("That move is not in this game."); return; }
                reviewIndex = target; reviewMode = 1; resetReviewWorkspace(); review(); return;
            case "review.branch": continueReview(); return;
            case "review.best":
                if (!"review".equals(requestedScreen)) return;
                if (reviewWorkspace != null && reviewWorkspace.length() > 0) reviewShowBest = !reviewShowBest;
                else { boolean show = !reviewShowBest; reviewMode = show ? 0 : 1; resetReviewWorkspace(); ensureReviewWorkspace(); reviewShowBest = show; }
                publishState(); return;
            case "review.evaluate": scheduleReviewEvaluation(); publishState(); return;
            case "review.undo":
                if (!validReviewPosition(payload)) return;
                if (reviewWorkspace.undo()) { reviewShowBest = false; scheduleReviewEvaluation(); }
                publishState(); return;
            case "review.reset": reviewMode = 1; resetReviewWorkspace(); review(); return;
            case "review.try":
                if (!validReviewPosition(payload)) return;
                if (reviewWorkspace.play(payload.optInt("from", -1), payload.optInt("to", -1), payload.optInt("promotion", 5))) {
                    reviewShowBest = false; scheduleReviewEvaluation();
                } else reject("Choose a legal move for the side to move.");
                publishState(); return;
            case "transport.host": startBluetooth(true); return;
            case "transport.join": startBluetooth(false); return;
            case "transport.scan": scan(); return;
            case "transport.connect": joinNearby(payload); return;
            case "transport.disconnect": link.close(); ready = false; home(); return;
            case "transport.settings": openBluetoothSettings(); return;
            case "online.host": beginOnlineRoom(true, payload); return;
            case "online.join": beginOnlineRoom(false, payload); return;
            case "chat.open": chat(); return;
            case "chat.send": sendChatFromPayload(payload); return;
            case "engine.info": engineInformation(); return;
            default: reject("That control is not available in this version.");
        }
    }

    private void resetReviewWorkspace() {
        reviewWorkspace = null; reviewWorkspaceIndex = -1; reviewToken = "";
        reviewShowBest = false; reviewEvaluation = null; reviewSearchGeneration++;
    }

    private Game reviewPosition(int ply) {
        if (local || host) return ChessPosition.at(game, ply);
        Game replay = new Game(0, 0);
        for (int i = 1; i <= ply; i++) {
            JSONArray m = reviewMoves.optJSONArray(i);
            if (m == null || !replay.move(replay.turn, m.optInt(0, -1), m.optInt(1, -1), m.optInt(2, 5)))
                throw new IllegalStateException("Review move history is incomplete");
        }
        JSONArray expected = reviewBoards.optJSONArray(ply);
        if (expected == null) throw new IllegalStateException("Review position is not ready");
        for (int i = 0; i < 64; i++) if (replay.b[i] != expected.optInt(i, 99))
            throw new IllegalStateException("Review position does not match its move history");
        return replay;
    }

    private void ensureReviewWorkspace() {
        if (!"review".equals(requestedScreen) || !hasReview()) return;
        reviewIndex = clamp(reviewIndex, 1, reviewTotal() - 1);
        if (reviewWorkspace != null && reviewWorkspaceIndex == reviewIndex && session.equals(reviewWorkspaceSession)) return;
        try {
            reviewWorkspace = new ChessReviewWorkspace(reviewPosition(reviewMode == 1 ? reviewIndex : reviewIndex - 1), reviewOrientation);
            reviewWorkspaceIndex = reviewIndex; reviewWorkspaceSession = session;
            reviewToken = UUID.randomUUID().toString(); scheduleReviewEvaluation();
        } catch (Exception error) {
            reviewEvaluationState = "Waiting for complete move history";
        }
    }

    private boolean validReviewPosition(JSONObject payload) {
        if (!"review".equals(requestedScreen) || reviewWorkspace == null || !reviewToken.equals(payload.optString("token", ""))
                || payload.optInt("index", -1) != reviewIndex || payload.optLong("positionSeq", -1) != reviewWorkspace.revision) {
            reject("That analysis position changed. Please try again."); publishState(); return false;
        }
        return true;
    }

    private void scheduleReviewEvaluation() {
        if (reviewWorkspace == null || destroyed) return;
        final long generation = ++reviewSearchGeneration;
        final String token = reviewToken;
        final Game position = reviewWorkspace.position.copy();
        reviewEvaluation = null; reviewEvaluationState = position.winner >= 0 ? "Final position" : "Analyzing…";
        if (position.winner >= 0) return;
        reviewWorker.execute(() -> {
            if (destroyed || generation != reviewSearchGeneration) return;
            StockfishEngine.Coach result = null;
            try {
                java.io.File net = new java.io.File(getFilesDir(), "nn-5af11540bbfe.nnue");
                for (int n = 0; n < 100 && !net.isFile(); n++) {
                    if (destroyed || generation != reviewSearchGeneration) return;
                    Thread.sleep(100);
                }
                if (reviewEngine == null) reviewEngine = new StockfishEngine(new java.io.File(getApplicationInfo().nativeLibraryDir, "libstockfish.so"), net);
                result = reviewEngine.coach(position, 0);
            } catch (Exception error) { android.util.Log.w("Knightline", "Interactive review evaluation unavailable", error); }
            final StockfishEngine.Coach value = result;
            handler.post(() -> {
                if (destroyed || generation != reviewSearchGeneration || !token.equals(reviewToken) || !"review".equals(requestedScreen)) return;
                reviewEvaluation = value; reviewEvaluationState = value == null ? "Tap score to retry" : "Live · depth " + value.depth;
                publishState();
            });
        });
    }

    private String reviewScore() {
        if (reviewWorkspace == null) return "—";
        int winner = reviewWorkspace.position.winner;
        if (winner == 2) return "0.00";
        if (winner >= 0) return winner == 0 ? "M0" : "−M0";
        if (reviewEvaluation == null) return "…";
        if (reviewEvaluation.whiteMate != null) return (reviewEvaluation.whiteMate >= 0 ? "M" : "−M") + Math.abs(reviewEvaluation.whiteMate);
        return String.format(Locale.ROOT, "%+.2f", reviewEvaluation.whiteCentipawns / 100.0);
    }

    private void acceptConfirmation(String token) {
        if (!token.equals(pendingConfirmationToken) || pendingConfirmation == null) {
            reject("That confirmation has expired."); return;
        }
        Runnable action = pendingConfirmation;
        pendingConfirmation = null;
        pendingConfirmationCancel = null;
        pendingConfirmationToken = "";
        action.run();
    }

    private void cancelConfirmation(String token) {
        if (token.equals(pendingConfirmationToken)) {
            Runnable cancel = pendingConfirmationCancel;
            pendingConfirmation = null;
            pendingConfirmationCancel = null;
            pendingConfirmationToken = "";
            if (cancel != null) cancel.run();
            notice("Cancelled.", false);
        }
    }

    private void startBotFromPayload(JSONObject payload) {
        int clock = clamp(payload.optInt("clock", 0), 0, 4);
        int level = clamp(payload.optInt("level", 1), 0, 2);
        startBotGame(clock, level, false);
    }

    private void startPassFromPayload(JSONObject payload) {
        startPassGame(clamp(payload.optInt("clock", 0), 0, 4));
    }

    private void inviteRemoteChess(JSONObject payload) {
        if (!ready || local) {
            reject("Connect to another Knightline player before setting up a private game.");
            return;
        }
        setClockPreset(clamp(payload.optInt("clock", 0), 0, 4));
        invite(0);
        postEvent("transport", transportPayload());
        publishState();
    }

    /** Keep invitations inside the single HTML UI rather than opening a native dialog. */
    private void handleRemoteInvitation(JSONObject message) {
        final String type = message.optString("type", "");
        final int gameId = message.optInt("game", -1);
        runOnUiThread(() -> {
            boolean validDirection = ("offer".equals(type) && !host) || ("suggest".equals(type) && host);
            if (!ready || !validDirection || gameId != 0) return;
            if (pendingGame >= 0 || incomingRemoteGame >= 0 || pendingConfirmation != null) {
                send(obj("type", "decline"));
                return;
            }
            incomingRemoteGame = gameId;
            pendingConfirmationToken = UUID.randomUUID().toString();
            pendingConfirmation = () -> {
                int acceptedGame = incomingRemoteGame;
                incomingRemoteGame = -1;
                if (!ready || acceptedGame != 0) {
                    notice("That invitation is no longer available.", true);
                } else if (host) {
                    startGame(acceptedGame);
                } else {
                    send(obj("type", "accept", "game", acceptedGame));
                    notice("Game accepted. Your friend is setting up the board.", false);
                }
            };
            pendingConfirmationCancel = () -> {
                incomingRemoteGame = -1;
                if (ready) send(obj("type", "decline"));
            };
            String action = host ? "suggests" : "invites you to";
            postEvent("confirm", obj("kind", "confirm", "title", peer + " " + action + " chess",
                    "subtitle", "Start a private " + clockLabel() + " game with a fresh random side?",
                    "token", pendingConfirmationToken, "confirmLabel", "Play"));
        });
    }

    private void beginLesson(JSONObject payload) {
        beginGuidedLesson(clamp(payload.optInt("lesson", 0), 0, ChessTutor.NAMES.length - 1));
    }

    private void moveFromPayload(JSONObject payload) {
        if (state == null || state.optInt("id", -1) != 0 || !active()) {
            reject("Wait for your turn."); return;
        }
        int from = payload.optInt("from", -1);
        int to = payload.optInt("to", -1);
        int choice = payload.optInt("choice", 0);
        if (from < 0 || from >= 64 || to < 0 || to >= 64) { reject("Invalid square."); return; }
        if (choice == 0 && promotionNeeded(from, to)) {
            pendingPromotionSession = session;
            pendingPromotionFrom = from;
            pendingPromotionTo = to;
            postEvent("promotion", obj("from", from, "to", to));
            return;
        }
        act(from, to, choice == 0 ? 5 : clamp(choice, 2, 5));
        publishState();
    }

    private boolean promotionNeeded(int from, int to) {
        JSONArray boardState = state == null ? null : state.optJSONArray("b");
        if (boardState == null || Math.abs(boardState.optInt(from)) != 1) return false;
        return to / 8 == 0 || to / 8 == 7;
    }

    private void choosePromotion(JSONObject payload) {
        if (!session.equals(pendingPromotionSession) || pendingPromotionFrom < 0 || pendingPromotionTo < 0) {
            reject("That promotion is no longer available."); return;
        }
        int piece = clamp(payload.optInt("piece", 5), 2, 5);
        int from = pendingPromotionFrom, to = pendingPromotionTo;
        pendingPromotionSession = ""; pendingPromotionFrom = pendingPromotionTo = -1;
        act(from, to, piece);
        publishState();
    }

    private void advanceCoach() {
        if (isGuidedLesson()) {
            usedHint = true;
            persistSessionIntegrityState();
            advanceLessonHint();
        } else if (isNormalBotGame()) {
            usedHint = true;
            persistSessionIntegrityState();
            advanceNormalHint();
        } else {
            notice("Hints are available in bot play and guided lessons.", false);
        }
        renderGame();
    }

    private void requestResign() {
        if (state == null || state.optInt("winner", -1) >= 0 || !(local || ready)) return;
        confirm("Resign game?", "Your opponent wins. This cannot be undone.", () -> {
            if (local || host) {
                game.winner = 1 - me;
                game.seq++;
                game.note = "Resigned";
                showSnapshot();
            } else {
                send(obj("type", "resign", "session", session));
            }
        });
    }

    private void rematch() {
        if (local) startGame(0); else if (ready) invite(0);
    }

    private void requestClearSaved() {
        confirm("Clear saved game?", "This removes the local saved match and disconnects this phone.", () -> {
            link.close();
            ready = false; game = null; state = null; local = solo = false;
            session = savedPeer = ""; peer = ""; peerAddress = "";
            save(); home();
        });
    }

    private void joinNearby(JSONObject payload) {
        int index = payload.optInt("index", -1);
        if (index < 0 || index >= foundDevices.size()) { reject("That nearby phone is no longer in this scan."); return; }
        BluetoothDevice selected = foundDevices.get(index);
        if (selected.getBondState() != BluetoothDevice.BOND_BONDED) {
            notice("Pair both phones in Android Bluetooth settings, then scan again.", false);
            openBluetoothSettings();
            return;
        }
        status = "Connecting to " + selected.getName() + "…";
        postEvent("transport", transportPayload());
        link.join(selected);
    }

    private void openBluetoothSettings() {
        try { startActivity(new Intent(android.provider.Settings.ACTION_BLUETOOTH_SETTINGS)); }
        catch (Exception error) { notice("Bluetooth settings are unavailable on this device.", true); }
    }

    private void beginOnlineRoom(boolean hosting, JSONObject payload) {
        String code = payload.optString("code", "").toUpperCase(Locale.ROOT).replaceAll("[^A-Z0-9]", "");
        if (code.length() < 4 || code.length() > 8) {
            reject("Use a room code with 4 to 8 letters or numbers."); return;
        }
        beginOnline(hosting, code);
    }

    private void sendChatFromPayload(JSONObject payload) {
        String body = payload.optString("text", "").trim();
        if (body.length() == 0 || body.length() > 300) { reject("Messages must be between 1 and 300 characters."); return; }
        sendChat(body);
        chat();
    }

    private void engineInformation() {
        postEvent("overlay", obj("kind", "information", "title", "Stockfish 16 · offline NNUE",
                "subtitle", "Knightline runs Stockfish locally for bots, coaching and review. Easy uses skill 0, Medium skill 8, and Hard skill 20. No engine search is sent to a server.",
                "detail", "Stockfish is free software under the GNU GPL v3 or later. Its source and license notices ship with the Knightline source release."));
    }

    private void ensureFriendRatingExchange() {
        if (privateRating == null || state == null || local || !ready || state.optInt("id", -1) != 0 || session.isEmpty()) return;
        if (session.equals(ratingPeerSession)) return;
        ratingPeerSession = session;
        ownRatingAtStart = privateRating.snapshot().rating;
        peerRatingAtStart = -1;
        persistSessionIntegrityState();
        send(obj("type", "rating", "session", session, "rating", ownRatingAtStart,
                "protocol", KNIGHTLINE_PROTOCOL));
    }

    private void recordFinishedRatingIfEligible() {
        if (privateRating == null || state == null || state.optInt("id", -1) != 0
                || state.optInt("winner", -1) < 0 || session.isEmpty()) return;
        if (session.equals(ratingOutcomeSession)) return;
        SkillRatingStore.Eligibility eligibility = new SkillRatingStore.Eligibility(
                true, usedHint, usedTakeback, learnMode, usedReviewBranch, false);
        SkillRatingStore.Match match = null;
        int winner = state.optInt("winner", -1);
        SkillRatingStore.Result result = winner == 2 ? SkillRatingStore.Result.DRAW
                : winner == me ? SkillRatingStore.Result.WIN : SkillRatingStore.Result.LOSS;
        if (solo && !learnMode && game != null) {
            SkillRatingStore.BotLevel level = botLevel == 0 ? SkillRatingStore.BotLevel.EASY
                    : botLevel == 1 ? SkillRatingStore.BotLevel.MEDIUM : SkillRatingStore.BotLevel.HARD;
            match = SkillRatingStore.Match.againstBot(level, result, eligibility);
        } else if (!local && peerRatingAtStart > 0) {
            match = SkillRatingStore.Match.againstFriend(peerRatingAtStart, result, eligibility);
        }
        if (match == null) return;
        SkillRatingStore.Update update = privateRating.record(match);
        ratingOutcomeSession = session;
        getSharedPreferences("knightline-rating-session", MODE_PRIVATE).edit()
                .putString("completed", ratingOutcomeSession).apply();
        notice(update.rated ? "Private rating " + update.status : update.status, false);
    }

    private void publishState() {
        if (!uiReady) return;
        postEvent("state", uiState());
    }

    private JSONObject uiState() {
        JSONObject root = obj("screen", requestedScreen, "session", session,
                "revision", revision + 1, "transport", transportPayload(), "profile", profilePayload(),
                "lessons", lessonPayload(), "fontScale", fontScalePercent());
        try {
            root.put("match", matchPayload());
            root.put("review", reviewPayload());
            root.put("puzzle", puzzlePayload());
        } catch (Exception ignored) { }
        return root;
    }

    private int fontScalePercent() {
        return Math.max(85, Math.min(200,
                Math.round(getResources().getConfiguration().fontScale * 100f)));
    }

    private JSONObject matchPayload() {
        if (state == null || state.optInt("id", -1) != 0) return obj("available", false);
        boolean yourTurn = state.optInt("winner", -1) < 0 && state.optInt("turn", -1) == me;
        boolean guided = isGuidedLesson();
        boolean normal = isNormalBotGame();
        JSONObject display = state;
        if (guided) { syncGuidedState(); display = guidedBoardState(yourTurn); }
        else if (normal) { syncNormalHintState(); display = normalBotBoardState(yourTurn); }
        JSONObject coachPayload = new JSONObject();
        try {
            if (guided) {
                boolean complete = lessonComplete();
                String action = complete ? "" : lessonHintAction();
                coachPayload.put("kind", "lesson");
                coachPayload.put("heading", complete ? "Lesson complete" : ChessTutor.NAMES[openingLesson]);
                coachPayload.put("copy", lessonCoachCopy(yourTurn, complete));
                coachPayload.put("action", action);
                coachPayload.put("available", !complete && yourTurn);
                coachPayload.put("stage", hintStage(action, true));
                coachPayload.put("loading", false);
            } else if (normal) {
                String action = normalHintAction(yourTurn);
                coachPayload.put("kind", "coach");
                coachPayload.put("heading", "Position coach");
                coachPayload.put("copy", normalCoachCopy(yourTurn));
                coachPayload.put("action", action);
                coachPayload.put("available", yourTurn);
                coachPayload.put("stage", hintStage(action, false));
                coachPayload.put("loading", "Preparing".equals(action));
            }
            boolean sameSession = coach != null && session.equals(coachSession);
            boolean fresh = sameSession && coachSeq == state.optInt("seq", -1);
            coachPayload.put("evaluation", sameSession ? formatEvaluation(coach) : "—");
            coachPayload.put("evaluationState", fresh ? "Live" : sameSession ? "Updating" : "Analyzing");
            coachPayload.put("evaluationDetail", fresh ? coach.explanation
                    : sameSession ? "Showing the previous position while Stockfish updates."
                    : "Stockfish is calculating the position.");
            coachPayload.put("hasEvaluation", fresh);
        } catch (Exception ignored) { }
        int winner = state.optInt("winner", -1);
        String opponent = guided ? "Coach" : solo ? "Stockfish"
                : local ? playerLabel(1 - me)
                : (peer == null || peer.length() == 0 ? "Friend" : peer);
        String opponentDetail = guided ? "Guided opening" : solo ? (botLevel == 0 ? "Easy · estimated 600" : botLevel == 1 ? "Medium · estimated 1200" : "Hard · estimated 1800")
                : local ? (1 - me == 0 ? "White" : "Black")
                : ready ? "Private Knightline room" : "Waiting to reconnect";
        return obj("position", display, "rawPosition", state, "me", me, "turn", state.optInt("turn", -1),
                "winner", winner, "yourTurn", yourTurn, "local", local, "solo", solo, "ready", ready,
                "evaluationEnabled", solo,
                "opponent", opponent, "opponentDetail", opponentDetail,
                "you", local && !solo ? playerLabel(me) : "You",
                "youDetail", me == 0 ? "White" : "Black",
                "lastMove", state.optString("lastMove", ""), "note", state.optString("note", ""),
                "clock", clockPayload(), "coach", coachPayload, "canTakeback", undoPly() >= 0,
                "canReview", hasReview(), "practice", practiceLabel(), "moveCount", game == null ? 0 : game.chessMoves.size());
    }

    private JSONObject reviewPayload() {
        if (!hasReview()) return obj("available", false);
        int total = reviewTotal();
        reviewIndex = clamp(reviewIndex == 0 ? total - 1 : reviewIndex, 1, total - 1);
        int ply = reviewIndex - 1;
        JSONArray boardState = local || host ? array(game.history.get(reviewMode == 1 ? reviewIndex : ply))
                : reviewBoards.optJSONArray(reviewMode == 1 ? reviewIndex : ply);
        JSONArray played = local || host ? array(game.chessMoves.get(ply)) : reviewMoves.optJSONArray(reviewIndex);
        JSONArray best = (local || host) && ply < game.analysisBest.size() ? array(game.analysisBest.get(ply))
                : reviewBest.optJSONArray(reviewIndex);
        String report = local || host ? (ply < game.analysis.size() ? game.analysis.get(ply) : "")
                : analysisNotes.optString(reviewIndex, "");
        ChessReviewText presentation = ChessReviewText.from(report);
        JSONObject position = obj("b", boardState == null ? new JSONArray() : boardState, "turn", ply % 2,
                "winner", 2, "id", 0, "moves", new JSONArray());
        try {
            if (played != null && reviewMode != 2) {
                position.put(reviewMode == 1 ? "lastA" : "playedFrom", played.optInt(0, -1));
                position.put(reviewMode == 1 ? "lastZ" : "playedTo", played.optInt(1, -1));
            }
        } catch (Exception ignored) { }
        JSONArray timeline = new JSONArray();
        String notation = "Move";
        for (int index = 1; index < total; index++) {
            String note = local || host ? (index - 1 < game.analysis.size() ? game.analysis.get(index - 1) : "") : analysisNotes.optString(index, "");
            ChessReviewText text = ChessReviewText.from(note);
            String san = text.playedMove;
            if ((local || host) && san.isEmpty()) {
                int[] move = game.chessMoves.get(index - 1);
                san = ChessNotation.san(ChessAnalysis.position(game, index - 1), move[0], move[1], move[2]);
            }
            if (san.isEmpty()) san = "Move " + index;
            timeline.put(obj("index", index, "notation", san, "verdict", text.verdict,
                    "side", (index - 1) % 2, "player", reviewPlayer((index - 1) % 2),
                    "whiteScore", text.whiteScore == null ? JSONObject.NULL : text.whiteScore,
                    "whiteMate", text.whiteMate == null ? JSONObject.NULL : text.whiteMate));
            if (index == reviewIndex) notation = san;
        }
        boolean active = reviewWorkspace != null && "review".equals(requestedScreen);
        boolean variation = active && reviewWorkspace.length() > 0;
        if (active) {
            JSONArray legal = new JSONArray();
            Game shown = reviewWorkspace.position;
            if (shown.winner < 0) for (int[] move : shown.legal()) legal.put(array(move));
            position = obj("b", array(shown.b), "moves", legal, "turn", shown.turn, "winner", shown.winner,
                    "seq", reviewWorkspace.revision);
            try {
                if (reviewShowBest) {
                    int[] arrow = variation ? (reviewEvaluation == null ? null : reviewEvaluation.move)
                            : best == null || best.length() < 2 ? null : new int[]{best.optInt(0, -1), best.optInt(1, -1)};
                    if (arrow != null) { position.put("bestFrom", arrow[0]); position.put("bestTo", arrow[1]); }
                } else if (variation) {
                    position.put("playedFrom", shown.lastA); position.put("playedTo", shown.lastZ); position.put("arrowGrade", "pending");
                } else if (played != null) {
                    position.put("playedFrom", played.optInt(0, -1)); position.put("playedTo", played.optInt(1, -1));
                    position.put("arrowGrade", presentation.verdict);
                }
            } catch (Exception ignored) { }
        }
        return obj("available", true, "index", reviewIndex, "total", total - 1, "mode", reviewMode, "me", reviewOrientation,
                "position", position, "report", presentation.report, "reason", presentation.reason,
                "playedScore", presentation.playedScore, "bestScore", presentation.bestScore,
                "playedCompact", presentation.playedCompact, "bestCompact", presentation.bestCompact,
                "notation", notation, "timeline", timeline, "analyzed", !report.isEmpty(), "verdict", presentation.verdict,
                "token", reviewToken, "yourTurn", active && reviewWorkspace.position.winner < 0,
                "variation", variation, "variationLength", active ? reviewWorkspace.length() : 0,
                "variationLine", active ? reviewWorkspace.line() : "", "showBest", reviewShowBest,
                "canShowBest", variation ? reviewEvaluation != null : best != null && best.length() >= 2,
                "evaluation", reviewScore(), "evaluationState", reviewEvaluationState,
                "toMove", active ? reviewWorkspace.position.turn : ply % 2,
                "player", reviewPlayer(ply % 2), "mySide", local && !solo ? -1 : me,
                "whitePlayer", reviewPlayer(0), "blackPlayer", reviewPlayer(1),
                "scoreSide", presentation.side,
                "liveGame", game != null && game.winner < 0,
                "canPrevious", reviewIndex > 1, "canNext", reviewIndex < total - 1,
                "canBranch", local);
    }

    private String reviewPlayer(int side) {
        String color = side == 0 ? "White" : "Black";
        String name = local && !solo ? playerLabel(side) : side == me ? "You"
                : solo ? (learnMode ? "Coach" : "Stockfish") : peer == null || peer.isEmpty() ? "Friend" : peer;
        return name + " · " + color;
    }

    private JSONObject clockPayload() {
        long white = clockFor(0), black = clockFor(1);
        return obj("white", formatClock(white), "black", formatClock(black), "whiteMs", white,
                "blackMs", black, "preset", clockLabel(), "active", state == null ? -1 : state.optInt("turn", -1));
    }

    private JSONObject profilePayload() {
        if (privateRating == null) return obj("rating", SkillRatingStore.INITIAL_RATING, "ratedGames", 0,
                "provisional", true, "history", new JSONArray(), "scope", "Private skill rating · on this device");
        SkillRatingStore.Snapshot snapshot = privateRating.snapshot();
        JSONArray history = new JSONArray();
        for (SkillRatingStore.HistoryEntry entry : snapshot.recentHistory) {
            history.put(obj("before", entry.ratingBefore, "after", entry.ratingAfter, "delta", entry.delta(),
                    "opponent", entry.opponentRating, "opponentKind", entry.opponentKind.name().toLowerCase(Locale.ROOT),
                    "result", entry.result.label(), "at", entry.completedAtMillis));
        }
        return obj("rating", snapshot.rating, "ratedGames", snapshot.ratedGames, "provisional", snapshot.isProvisional(),
                "nextK", snapshot.nextKFactor(), "history", history, "scope", snapshot.scopeLabel());
    }

    private JSONObject lessonPayload() {
        JSONArray lessons = new JSONArray();
        for (int index = 0; index < ChessTutor.NAMES.length; index++) {
            lessons.put(obj("id", index, "name", ChessTutor.NAMES[index], "intro", ChessTutor.INTRO[index],
                    "moves", ChessTutor.lessonMoveCount(index)));
        }
        JSONArray puzzles = new JSONArray();
        android.content.SharedPreferences progress = getSharedPreferences("knightline-puzzles", MODE_PRIVATE);
        if (puzzleCatalog != null) for (PuzzleCatalog.Entry entry : puzzleCatalog.entries) {
            puzzles.put(obj("index", entry.index, "id", entry.id, "name", entry.name, "theme", entry.theme, "rating", entry.rating, "band", entry.band(),
                    "solved", progress.getBoolean(entry.id + ".solved", entry.index < 6 && progress.getBoolean("solved-" + entry.index, false)),
                    "clean", progress.getBoolean(entry.id + ".clean", false),
                    "assisted", progress.getBoolean(entry.id + ".assisted", false),
                    "missed", progress.getBoolean(entry.id + ".missed", false)));
        }
        return obj("items", lessons, "puzzles", puzzles);
    }

    private void startPuzzle(int index) {
        if (puzzleCatalog == null || index < 0 || index >= puzzleCatalog.entries.size()) { reject("Unknown puzzle."); return; }
        puzzle = new PuzzleSession(puzzleCatalog.entries.get(index));
        puzzleToken = UUID.randomUUID().toString();
        requestedScreen = "puzzle"; reviewing = false; gameScreen = false; inGame = false;
        publishState();
    }

    private void puzzleCommand(String type, JSONObject payload) {
        if (puzzle == null || !"puzzle".equals(requestedScreen) || !puzzleToken.equals(payload.optString("token"))
                || payload.optLong("positionSeq", -1) != puzzle.revision) {
            reject("This puzzle position has changed."); publishState(); return;
        }
        switch (type) {
            case "puzzle.retry": startPuzzle(puzzle.entry.index); return;
            case "puzzle.next": nextPuzzle(); return;
            case "puzzle.hint":
                puzzle.advanceHint(); persistPuzzleProgress();
                break;
            case "puzzle.move":
                puzzle.play(payload.optInt("from", -1), payload.optInt("to", -1), payload.optInt("promotion", 5));
                persistPuzzleProgress();
                if (puzzle.pendingReply) {
                    final PuzzleSession current = puzzle; final String token = puzzleToken; final long seq = puzzle.revision;
                    handler.postDelayed(() -> {
                        if (destroyed || puzzle != current || !token.equals(puzzleToken) || puzzle.revision != seq) return;
                        puzzle.reply(); if ("puzzle".equals(requestedScreen)) publishState();
                    }, 650);
                }
                break;
        }
        publishState();
    }

    private JSONObject puzzlePayload() {
        if (puzzle == null) return obj("available", false);
        JSONArray moves = new JSONArray();
        if (!puzzle.solved && !puzzle.pendingReply) for (int[] move : puzzle.position.legal()) moves.put(array(move));
        JSONObject position = obj("b", array(puzzle.position.b), "moves", moves,
                "seq", puzzle.revision, "lastA", puzzle.position.lastA, "lastZ", puzzle.position.lastZ);
        int[] solution = puzzle.solution();
        if (solution != null && puzzle.hint >= 2) {
            try { position.put("bestFrom", solution[0]); if (puzzle.hint >= 3) position.put("bestTo", solution[1]); }
            catch (Exception ignored) { }
        }
        String copy = puzzle.solved || puzzle.hint == 0 ? puzzle.feedback : puzzle.hintText();
        return obj("available", true, "index", puzzle.entry.index, "token", puzzleToken, "name", puzzle.entry.name,
                "theme", puzzle.entry.theme, "rating", puzzle.entry.rating, "position", position, "me", puzzle.side,
                "yourTurn", !puzzle.solved && !puzzle.pendingReply, "solved", puzzle.solved, "pendingReply", puzzle.pendingReply,
                "attempts", puzzle.attempts, "hint", puzzle.hint, "steps", puzzle.playerMoves(), "completedSteps", puzzle.completedMoves(),
                "copy", copy, "total", puzzleCatalog.entries.size(), "collection", puzzleCollection);
    }

    private void persistPuzzleProgress() {
        String id = puzzle.entry.id;
        android.content.SharedPreferences.Editor edit = getSharedPreferences("knightline-puzzles", MODE_PRIVATE).edit();
        if (puzzle.missed || puzzle.usedHelp) edit.putBoolean(id + ".missed", true);
        if (puzzle.solved) {
            edit.putBoolean(id + ".solved", true);
            if (puzzle.usedHelp) edit.putBoolean(id + ".assisted", true);
            if (!puzzle.usedHelp && !puzzle.missed) edit.putBoolean(id + ".clean", true).putBoolean(id + ".missed", false);
        }
        edit.apply();
    }

    private void nextPuzzle() {
        android.content.SharedPreferences progress = getSharedPreferences("knightline-puzzles", MODE_PRIVATE);
        int total = puzzleCatalog.entries.size();
        for (int offset = 1; offset <= total; offset++) {
            PuzzleCatalog.Entry entry = puzzleCatalog.entries.get((puzzle.entry.index + offset) % total);
            boolean eligible = puzzleCollection.equals("missed") ? progress.getBoolean(entry.id + ".missed", false)
                    : puzzleCollection.equals("all") || puzzleCollection.equals(entry.band());
            if (eligible) { startPuzzle(entry.index); return; }
        }
        requestedScreen = "learn"; notice("Collection complete. Choose your next challenge.", false); publishState();
    }

    private JSONObject transportPayload() {
        JSONArray devices = new JSONArray();
        for (int index = 0; index < foundDevices.size(); index++) {
            BluetoothDevice device = foundDevices.get(index);
            devices.put(obj("index", index, "name", device.getName() == null ? "Nearby phone" : device.getName(),
                    "paired", device.getBondState() == BluetoothDevice.BOND_BONDED));
        }
        return obj("ready", ready, "hosting", host, "status", status, "peer", peer,
                "kind", savedPeer.startsWith("peerjs:") ? "online" : "bluetooth", "devices", devices);
    }

    private JSONArray moveHistory() {
        JSONArray list = new JSONArray();
        if (game == null) return list;
        for (int ply = 0; ply < game.chessMoves.size(); ply++) {
            int[] move = game.chessMoves.get(ply);
            String notation;
            try { notation = ChessNotation.san(ChessAnalysis.position(game, ply), move[0], move[1], move[2]); }
            catch (Exception ignored) { notation = squareName(move[0]) + "–" + squareName(move[1]); }
            list.put(obj("ply", ply + 1, "move", notation, "side", ply % 2 == 0 ? "White" : "Black"));
        }
        return list;
    }

    private boolean hasReview() { return reviewTotal() >= 2; }
    private int reviewTotal() { return local || host ? game == null ? 0 : game.history.size() : reviewBoards.length(); }

    private String practiceLabel() {
        if (learnMode) return "Practice · lesson mode";
        if (usedHint) return "Practice · hint used";
        if (usedTakeback) return "Practice · takeback used";
        if (usedReviewBranch) return "Practice · review branch";
        if (solo) return "Private rating eligible";
        if (!local && peerRatingAtStart > 0) return "Private rating eligible";
        return "Practice";
    }

    private String formatEvaluation(StockfishEngine.Coach result) {
        if (result == null) return "…";
        if (result.whiteMate != null) return (result.whiteMate > 0 ? "#" : "#-") + Math.abs(result.whiteMate);
        int value = result.whiteCentipawns;
        return String.format(Locale.ROOT, "%s%.2f", value >= 0 ? "+" : "-", Math.abs(value) / 100.0d);
    }

    private int hintStage(String action, boolean lesson) {
        if ("Hide hint".equals(action)) return lesson ? 3 : 2;
        if ("Show move".equals(action)) return lesson ? 2 : 1;
        if ("Show piece".equals(action)) return 1;
        if ("Preparing".equals(action) || "Retry hint".equals(action)) return 1;
        return 0;
    }

    private void option(JSONArray list, String id, String title, String detail) {
        list.put(obj("id", id, "title", title, "detail", detail));
    }

    private void notice(String message, boolean error) {
        postEvent("notice", obj("message", message == null ? "" : message, "error", error));
    }

    private void reject(String message) { notice(message, true); }

    /**
     * Rating eligibility is part of the saved match, not transient screen state.
     * Keeping it in a session-keyed preference prevents force-stop/resume from
     * turning a hinted or branched Practice game back into a rated game.
     */
    private void persistSessionIntegrityState() {
        getSharedPreferences("knightline-session-integrity", MODE_PRIVATE).edit()
                .putString("session", session == null ? "" : session)
                .putBoolean("hint", usedHint)
                .putBoolean("takeback", usedTakeback)
                .putBoolean("reviewBranch", usedReviewBranch)
                .putString("ratingPeerSession", ratingPeerSession == null ? "" : ratingPeerSession)
                .putInt("peerRating", peerRatingAtStart)
                .putInt("ownRating", ownRatingAtStart)
                .apply();
    }

    private void restoreSessionIntegrityState() {
        android.content.SharedPreferences saved = getSharedPreferences(
                "knightline-session-integrity", MODE_PRIVATE);
        String savedSession = saved.getString("session", "");
        if (session == null || session.isEmpty() || !session.equals(savedSession)) return;
        usedHint = saved.getBoolean("hint", false);
        usedTakeback = saved.getBoolean("takeback", false);
        usedReviewBranch = saved.getBoolean("reviewBranch", false);
        ratingPeerSession = saved.getString("ratingPeerSession", "");
        peerRatingAtStart = saved.getInt("peerRating", -1);
        ownRatingAtStart = saved.getInt("ownRating", -1);
    }

    private void postEvent(String type, JSONObject payload) {
        if (!uiReady || messagePort == null) return;
        try {
            JSONObject event = obj("v", BRIDGE_VERSION, "revision", ++revision, "type", type,
                    "session", session, "payload", payload == null ? new JSONObject() : payload);
            messagePort.postMessage(new WebMessage(event.toString()));
        } catch (Exception ignored) {
            // A page reload simply establishes a fresh port and requests the latest state.
        }
    }

    private static int clamp(int value, int low, int high) { return Math.max(low, Math.min(high, value)); }
}
