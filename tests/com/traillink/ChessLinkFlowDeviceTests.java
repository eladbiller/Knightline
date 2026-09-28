package com.traillink;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Intent;
import android.graphics.Rect;
import android.os.Bundle;
import android.os.SystemClock;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.accessibility.AccessibilityNodeInfo;
import android.widget.TextView;
import java.util.ArrayDeque;

/**
 * Flow-level verification for the dedicated ChessLink activity.  These checks
 * intentionally drive entry points and board state transitions rather than
 * asserting a single screen image.
 */
public final class ChessLinkFlowDeviceTests extends Instrumentation {
    ChessLinkActivity app;
    final StringBuilder report = new StringBuilder();
    Bundle arguments = new Bundle();

    @Override public void onCreate(Bundle extras) { arguments = extras == null ? new Bundle() : extras; start(); }

    void say(String value) {
        report.append(value).append('\n');
        Bundle progress = new Bundle(); progress.putString("stream", value + "\n"); sendStatus(0, progress);
    }

    void require(boolean value, String message) { if (!value) throw new AssertionError(message); }

    void main(Runnable runnable) {
        final Throwable[] failure = {null};
        runOnMainSync(() -> { try { runnable.run(); } catch (Throwable error) { failure[0] = error; } });
        waitForIdleSync();
        if (failure[0] != null) throw new AssertionError("Main-thread action failed", failure[0]);
    }

    @Override public void onStart() {
        Bundle result = new Bundle();
        try {
            Intent intent = new Intent();
            intent.setClassName("com.chesslink", "com.traillink.ChessLinkActivity");
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            app = (ChessLinkActivity) startActivitySync(intent);
            waitForIdleSync();
            waitForAppWindow();
            String flow = arguments.getString("flow", "full");
            verifyLearningContracts();
            if (flow.equals("contracts") || flow.equals("full")) verifyFullRegressionContracts();
            if (flow.equals("entry") || flow.equals("full")) verifyEntryAndHintFlow();
            if (flow.equals("guided")) verifyGuidedEntryAndHintFlow();
            if (flow.equals("bot-hint")) verifyNormalBotCoachHintFlow();
            if (flow.equals("setup")) verifyNewGameSetupSafetyAndStability();
            if (flow.equals("remote")) verifyRemoteSavedGameSafety();
            if (flow.equals("lines-a") || flow.equals("full")) verifyEveryAuthoredLine(0, 4);
            if (flow.equals("lines-b") || flow.equals("full")) verifyEveryAuthoredLine(4, ChessTutor.NAMES.length);
            if (flow.equals("recovery") || flow.equals("full")) verifyCompletionActionsAndRecovery();
            if (flow.equals("race") || flow.equals("full")) verifyContinueDuringReplyAndHomeFlow();
            // The contracts-only run intentionally leaves the app at Home, so
            // board geometry is asserted only after a real board flow.
            if (!flow.equals("contracts") && !flow.equals("setup") && !flow.equals("remote")) verifyScreenFits();
            say("PASS");
            result.putString("stream", report.toString());
            finish(Activity.RESULT_OK, result);
        } catch (Throwable error) {
            say("FAIL: " + error);
            result.putString("stream", report + "\n" + android.util.Log.getStackTraceString(error));
            finish(Activity.RESULT_CANCELED, result);
        }
    }

    void verifyLearningContracts() {
        LearningTest.run();
        say("Pure learning contracts: " + LearningTest.assertions + " assertions");
    }

    /**
     * Keep the guided-learning checks coupled to the broader chess engine
     * contracts.  A lesson that looks right but breaks move legality, history,
     * notation, or analysis is not release-ready.
     */
    void verifyFullRegressionContracts() {
        GameTest.run();
        TimelineTest.run();
        V3Test.run();
        UpgradeTest.run();
        say("Core chess contracts: " + GameTest.assertions + " game, "
            + TimelineTest.assertions + " timeline, " + V3Test.assertions
            + " notation, " + UpgradeTest.assertions + " upgrade assertions");
    }

    void clearForFlow() {
        app.link.close(); app.ready = false; app.host = false; app.awaiting = false;
        app.game = null; app.state = null; app.local = false; app.solo = false;
        app.learnMode = false; app.openingLesson = -1; app.session = ""; app.savedPeer = "";
        app.resetGuidedState(); app.home();
    }

    void verifyEntryAndHintFlow() throws Exception {
        verifyFreePracticeReplacementSafety();
        say("Free-practice replacement safety passed");
        verifyNewGameSetupSafetyAndStability();
        say("New-game setup stability and replacement safety passed");
        verifyRemoteSavedGameSafety();
        say("Remote saved-game safety and Home deferral passed");
        verifyLongPeerLabelsStayBounded();
        say("Long peer labels stay bounded");
        verifyGuidedEntryAndHintFlow();
    }

    /** Run separately so the engine-evaluation interaction stays observable within one device-test window. */
    void verifyGuidedEntryAndHintFlow() throws Exception {
        main(this::clearForFlow);
        waitForAppWindow();
        require(clickText("Training"), "Home Training entry is tappable");
        require(hasText("GUIDED OPENINGS"), "Training opens the learning hub, not bot setup");
        require(hasText("Free practice with Stockfish"), "Free practice is visibly separate");
        require(hasText("Scroll for all 7 openings"), "Learning hub signals that more lessons are available below");
        verifyVisibleAccessibilityActionsFit("learning hub");
        require(scrollActiveDialogToEnd(), "Guided lesson list accepts a real scroll gesture");
        require(clickText("Caro-Kann Defence"), "A lower guided lesson is reachable through the learning hub");
        require(hasText("PLAY WHITE"), "A lower lesson receives the same preview contract");
        require(clickText("All lessons"), "A lower lesson preview returns to the learning hub");
        require(clickText("Italian Game"), "Italian lesson selectable");
        require(hasText("Build a strong centre"), "Lesson preview shows a complete, concise opening objective");
        require(hasText("PLAY WHITE"), "Lesson preview explains learner color");
        require(hasText("UNTIMED"), "Lesson preview explains clock contract");
        verifyVisibleAccessibilityActionsFit("lesson preview");
        require(clickText("Start guided lesson"), "Lesson preview starts a guided session");
        require(app.isGuidedLesson() && app.me == 0, "Guided session forces learner to White");
        require(findText(app.root, "GUIDED OPENING") > 0, "Active lesson has persistent coach card");
        require(findText(app.root, "Move 1 of 3") > 0, "Active lesson exposes progress");
        require(findText(app.root, "Stockfish engine") == 0, "Active lesson is not presented as a generic bot game");
        require(app.hasValidGuidedHistory(), "A fresh lesson is an authored history prefix");
        require(clickText("•••"), "Active lesson More menu is reachable");
        require(!hasText("Resign game"), "An in-progress guided lesson cannot be invalidated through Resign");
        require(clickText("Not now"), "Active lesson menu can close without changing the lesson");
        waitForNumericEvaluation(app.game.seq, "the opening position");

        int initialSeq = app.game.seq;
        main(() -> app.act(51, 35, 5)); // d2-d4 is legal, but not the Italian lesson move.
        require(app.game.seq == initialSeq, "Wrong legal lesson move does not change board state");
        require(findText(app.root, "Not this move yet") > 0, "Wrong legal lesson move gives visible recovery feedback");
        require(findText(app.root, "Hint") > 0, "Recovery keeps a Hint action available");

        // A burst of taps must not leap from Hint to the full answer.
        main(() -> { app.advanceLessonHint(); app.advanceLessonHint(); app.advanceLessonHint(); });
        require(findText(app.root, "Show piece") > 0 && app.board.s.optInt("hintFrom", -1) < 0,
            "Rapid hint taps advance exactly one stage");
        SystemClock.sleep(300);
        require(clickText("Show piece"), "Second-stage hint is reachable after the concept is visible");
        require(app.board.s.optInt("hintFrom", -1) == 52 && app.board.s.optInt("bestFrom", -1) < 0,
            "Second hint highlights e2 without revealing e4");
        require(clickText("Show move"), "Third-stage hint is reachable");
        require(app.board.s.optInt("hintFrom", -1) == 52 && app.board.s.optInt("bestFrom", -1) == 52 && app.board.s.optInt("bestTo", -1) == 36,
            "Final hint draws the real e2-e4 arrow");
        require(clickText("Hide hint"), "Learner can hide a fully revealed hint");
        require(app.board.s.optInt("hintFrom", -1) < 0 && app.board.s.optInt("bestFrom", -1) < 0,
            "Hidden hint clears all guidance markers");

        /*
         * This branch remains explicit rather than relying on a screenshot:
         * the card must make the first conceptual stage reachable at all.
         */
        require(clickText("Hint"), "First-stage hint is reachable again after hiding");
        require(app.board.s.optInt("hintFrom", -1) < 0 && app.board.s.optInt("bestFrom", -1) < 0,
            "First hint gives a concept without revealing a square or arrow");

        // Use the actual board hit targets for the first move, not a direct model mutation.
        cell(52); cell(36); waitForSequence(2);
        require(app.game.chessMoves.size() == 2 && app.game.turn == app.me, "Correct move receives exactly one scripted reply");
        require(app.board.s.optInt("hintFrom", -1) < 0, "A new learner turn begins with a fresh hint state");
        waitForNumericEvaluation(app.game.seq, "the next learner position after Black's reply");
        say("Entry → preview → hint stages → wrong move recovery → scripted reply passed");
    }

    /**
     * Free practice must be coached too: concept first, then an explicitly
     * requested board arrow.  The engine result is allowed to update the
     * existing coach card, but must never reconstruct the game screen.
     */
    void verifyNormalBotCoachHintFlow() throws Exception {
        main(() -> { clearForFlow(); app.startLocalConfirmed(true, false, 1); });
        waitForBotLearnerTurn();
        require(!app.learnMode && !app.isGuidedLesson(), "Free practice is a normal bot game, not a forced lesson");
        require(findText(app.root, "POSITION COACH") > 0, "Normal bot play exposes a persistent position coach");
        waitForNumericEvaluation(app.game.seq, "a normal bot position before a hint");

        View stableRoot = app.root;
        require(clickText("Hint"), "Normal bot play exposes a visible Hint action");
        require(app.root == stableRoot, "First coach hint updates in place without a menu or screen jump");
        require(findText(app.root, "POSITION COACH") > 0, "Concept hint remains in the position coach card");
        require(app.board.s.optInt("hintFrom", -1) < 0 && app.board.s.optInt("bestFrom", -1) < 0,
            "First normal-game hint does not prematurely reveal the move");

        require(clickText("Show move"), "Normal bot hint can explicitly reveal the move");
        int[] best = app.coach.move;
        require(app.board.s.optInt("hintFrom", -1) == best[0]
                && app.board.s.optInt("bestFrom", -1) == best[0]
                && app.board.s.optInt("bestTo", -1) == best[1],
            "Normal bot reveal draws Stockfish's real source and destination arrow");
        require(clickText("Hide hint"), "Normal bot player can hide a revealed move");
        require(app.board.s.optInt("hintFrom", -1) < 0 && app.board.s.optInt("bestFrom", -1) < 0,
            "Hiding a normal-game hint clears all coaching markers");
        verifyVisibleAccessibilityActionsFit("normal bot coach");
        say("Normal bot coach: concept → explicit move → hide passed without screen rebuild");
    }

    void verifyFreePracticeReplacementSafety() throws Exception {
        main(() -> { clearForFlow(); app.startLocal(true, false, 1); app.home(); });
        waitForAppWindow();
        require(app.game != null && app.game.winner < 0, "A live game exists before entering Free practice");
        require(clickText("Training"), "Training remains reachable with a saved game");
        require(clickText("Free practice with Stockfish"), "Free practice action is reachable");
        require(hasText("Replace saved game?"), "Free practice asks before overwriting a saved game");
        require(clickText("Cancel"), "Free practice replacement can be cancelled");
        require(app.game != null && app.game.winner < 0, "Cancelling Free practice preserves the saved game");
        // A cancellation intentionally returns to the learning chooser when it
        // is still closing; leave that overlay before the next independent flow.
        if (hasText("Not now")) require(clickText("Not now"), "Learning chooser can close after a cancelled free-practice request");
    }

    /**
     * Changing time or strength must keep the same setup sheet open, and its
     * primary action must not mutate an existing game until replacement is
     * explicitly confirmed.
     */
    void verifyNewGameSetupSafetyAndStability() throws Exception {
        main(() -> { clearForFlow(); app.startLocalConfirmed(true, false, 1); app.home(); });
        String originalClock = app.clockLabel();
        require(clickText("Quick game"), "Quick game opens its setup sheet");
        int botSetupWindow = activeWindowId("bot setup");
        Rect botPrimaryBefore = exactTextBounds("Play " + originalClock);
        require(clickText("3|2"), "A time control can be changed in place");
        require(hasText("Play 3 | 2"), "The setup sheet updates its primary action without closing");
        requireStableSetupSheet(botSetupWindow, botPrimaryBefore, "Play 3 | 2", "bot setup time change");
        verifyVisibleAccessibilityActionsFit("bot setup after a time change");
        require(clickText("Hard"), "A bot level can be changed in place");
        require(hasText("Play 3 | 2"), "Changing strength keeps the chosen time and the same setup sheet");
        requireStableSetupSheet(botSetupWindow, botPrimaryBefore, "Play 3 | 2", "bot setup strength change");
        verifyVisibleAccessibilityActionsFit("bot setup after a level change");
        require(clickText("Play 3 | 2"), "Configured bot game can be requested");
        require(hasText("Replace saved game?"), "Quick game asks before replacing a live match");
        require(clickText("Cancel"), "Quick-game replacement can be cancelled");
        require(app.game != null && app.game.winner < 0 && originalClock.equals(app.clockLabel()),
            "Cancelling replacement preserves both the saved game and its clock choice");

        require(clickText("Pass & play"), "Pass-and-play setup is reachable");
        int passSetupWindow = activeWindowId("pass-and-play setup");
        Rect passPrimaryBefore = exactTextBounds("Start " + originalClock);
        require(clickText("1|0"), "Pass-and-play time can be changed in place");
        require(hasText("Start 1 | 0"), "Pass-and-play primary action updates without jumping");
        requireStableSetupSheet(passSetupWindow, passPrimaryBefore, "Start 1 | 0", "pass-and-play time change");
        verifyVisibleAccessibilityActionsFit("pass-and-play setup after a time change");
        require(clickText("Start 1 | 0"), "Configured pass-and-play game can be requested");
        require(hasText("Replace saved game?"), "Pass-and-play asks before replacing a live match");
        require(clickText("Cancel"), "Pass-and-play replacement can be cancelled");
        require(app.game != null && app.game.winner < 0 && originalClock.equals(app.clockLabel()),
            "Cancelled pass-and-play setup leaves the live game untouched");

        require(clickText("Nearby"), "Nearby entry is reachable");
        require(clickText("Host a game"), "Nearby host action is reachable");
        require(hasText("Replace saved game?"), "Nearby play asks before replacing a live match");
        require(clickText("Cancel"), "Nearby replacement can be cancelled");
        main(() -> app.beginOnline(true, "FLOWSAFE"));
        require(hasText("Replace saved game?"), "Online play asks before replacing a live match");
        require(clickText("Cancel"), "Online replacement can be cancelled");
        require(app.game != null && app.game.winner < 0, "Every new-game route preserves a cancelled saved match");
    }

    void verifyRemoteSavedGameSafety() throws Exception {
        main(() -> {
            clearForFlow();
            app.local = false; app.host = false; app.solo = false; app.ready = false; app.game = null;
            app.session = "saved-guest-flow";
            app.state = app.obj("id", 0, "winner", -1, "turn", 0, "clockPreset", 0);
            app.inGame = true;
            app.home();
        });
        require(app.hasLiveSavedChessGame(), "A disconnected guest chess state is treated as a live saved game");
        require(clickText("Training"), "Training stays reachable beside a remote saved game");
        require(clickText("Free practice with Stockfish"), "Free practice can be requested from a remote saved game");
        require(hasText("Replace saved game?"), "Remote guest game asks before being overwritten");
        require(clickText("Cancel"), "Remote-game replacement can be cancelled");
        if (hasText("Not now")) require(clickText("Not now"), "Remote learning chooser can close after cancellation");
        main(app::renderGame);
        require(hasText("Training"), "A remote state update does not pull a player out of Home or Training");
        require(findText(app.root, "YOUR SAVED GAME") > 0,
            "A disconnected remote saved game has a visible continuation card on Home");
        require(clickText("YOUR SAVED GAME"), "Disconnected remote saved-game card is tappable");
        require(app.inGame, "Saved-game card returns a disconnected guest to the board");

        // Confirming a transport replacement is intentionally different from
        // cancelling it: the old guest-only state and peer lock must disappear
        // before prepare(host/join) is called, or the next Bluetooth room is
        // silently treated as a forbidden resume of the old one.
        main(() -> {
            app.local = false; app.host = false; app.solo = false; app.ready = true; app.game = null;
            app.session = "old-guest-session"; app.savedPeer = "old-peer-address";
            app.peer = "Old opponent"; app.peerAddress = "old-peer-address";
            app.state = app.obj("id", 0, "winner", -1, "turn", 0, "clockPreset", 0);
            app.clearRemoteMatchForReplacement();
        });
        require(app.game == null && app.state == null && app.session.isEmpty() && app.savedPeer.isEmpty()
                && !app.ready && !app.host && !app.local,
            "Confirmed nearby replacement clears the old remote match before starting Bluetooth");
    }

    void verifyLongPeerLabelsStayBounded() {
        final String longPeer = "A very long nearby chess opponent name that must never run under the action arrow";
        main(() -> {
            clearForFlow();
            app.local = false; app.host = false; app.solo = false; app.ready = true; app.peer = longPeer;
            app.state = app.obj("id", 0, "winner", -1, "turn", 0, "clockPreset", 0);
            app.home();
        });
        require(app.connection.getMaxLines() == 1
                && app.connection.getEllipsize() == android.text.TextUtils.TruncateAt.END,
            "Long connection names are bounded to one ellipsized header line");
        TextView savedTitle = findTextView(app.root, longPeer);
        require(savedTitle != null && savedTitle.getEllipsize() == android.text.TextUtils.TruncateAt.END,
            "Long saved-game opponent names are ellipsized before the fixed action arrow");
    }

    void verifyEveryAuthoredLine(int firstLesson, int endExclusive) throws Exception {
        for (int lesson = firstLesson; lesson < endExclusive; lesson++) {
            final int selected = lesson;
            main(() -> app.startGuidedLesson(selected));
            require(app.isGuidedLesson() && app.me == 0, ChessTutor.NAMES[lesson] + " starts as White");
            int guard = 0;
            while (!app.lessonComplete() && guard++ < 16) {
                if (app.game.turn == app.me) {
                    int[] expected = ChessTutor.next(app.game, lesson);
                    require(expected != null, ChessTutor.NAMES[lesson] + " exposes expected learner move");
                    main(() -> app.act(expected[0], expected[1], expected[2]));
                }
                waitForLearnerTurnOrCompletion();
            }
            require(app.lessonComplete(), ChessTutor.NAMES[lesson] + " reaches an explicit completed state");
            require(!app.active(), ChessTutor.NAMES[lesson] + " completion locks forced-line input");
            // The scripted reply mutates the game and then immediately renders
            // its completion card on the main thread. Observe the rendered
            // state too: a state-only assertion can race that same event loop.
            waitForLessonCompletionCard(ChessTutor.NAMES[lesson]);
            require(findText(app.root, "Continue") > 0 && findText(app.root, "Review") > 0 && findText(app.root, "Lessons") > 0,
                ChessTutor.NAMES[lesson] + " has all completion exits");
            say("Authored flow passed: " + ChessTutor.NAMES[lesson]);
        }
    }

    void verifyCompletionActionsAndRecovery() throws Exception {
        main(() -> app.startGuidedLesson(0));
        require(clickText("Hint") && clickText("Show piece"), "Hint can be progressed before persistence");
        require(app.board.s.optInt("hintFrom", -1) == 52, "Source hint is visible before persistence");
        main(() -> { app.save(); app.game = null; app.state = null; app.local = false; app.solo = false; app.learnMode = false; app.openingLesson = -1; app.restore(); app.showSnapshot(); });
        require(app.isGuidedLesson() && app.board.s.optInt("hintFrom", -1) == 52,
            "Resume preserves the active lesson and its matching-stage hint");

        while (!app.lessonComplete()) {
            if (app.game.turn == app.me) {
                int[] expected = ChessTutor.next(app.game, app.openingLesson);
                main(() -> app.act(expected[0], expected[1], expected[2]));
                // A tap while Black replies cannot advance or skip the next hint state.
                main(app::advanceLessonHint);
            }
            waitForLearnerTurnOrCompletion();
        }
        require(clickText("•••"), "Completion More menu is reachable");
        require(!hasText("Resign game"), "Completion menu cannot discard the lesson recap through Resign");
        require(clickText("Not now"), "Completion menu can be closed without changing the lesson");
        require(clickText("Review"), "Completion opens lesson review");
        require(app.reviewing && findText(app.root, "Review") > 0, "Lesson review is a usable move-by-move flow");
        require(app.analyzing.equals(app.session) || !app.game.analysis.isEmpty(),
            "Lesson review immediately requests Stockfish analysis rather than only showing move history");
        waitForAnalysis(1);
        require(!app.game.analysis.get(0).isEmpty() && app.game.analysisBest.size() >= 1,
            "Completed lesson review receives a real Stockfish report and best move");
        require(clickText("Best"), "Completed lesson review enables its Stockfish Best line");
        require(app.reviewMode == 2, "Best line changes the review board mode");
        require(clickText("Done"), "Review returns to the lesson state");
        require(app.lessonComplete(), "Review return preserves completed lesson state");
        require(clickText("Continue"), "Completion can continue against Stockfish");
        require(!app.learnMode && app.openingLesson == -1 && app.active(), "Continue removes forced lesson restrictions on the same board");
        int before = app.game.seq;
        int[] free = app.game.legal().get(0);
        main(() -> app.act(free[0], free[1], 5));
        waitForSequence(before + 2);
        require(app.game.seq == before + 2, "Free practice accepts an ordinary legal move and Stockfish reply");
        main(() -> { app.botError = "Engine unavailable. Tap Retry bot."; app.renderGame(); });
        require(clickText("Retry bot"), "A Stockfish failure has a visible retry action");
        require(app.botError.isEmpty(), "Retry bot clears the recoverable engine error");
        say("Resume → complete → review → continue-vs-bot recovery flow passed");
    }

    void verifyContinueDuringReplyAndHomeFlow() throws Exception {
        main(() -> app.startGuidedLesson(0));
        main(() -> { app.act(52, 36, 5); app.continueLessonWithBot(); });
        require(!app.learnMode && app.openingLesson == -1, "Mid-line Continue exits guided restrictions immediately");
        waitForSequence(2);
        require(!app.learnMode && app.game.turn == app.me, "The replacement Stockfish reply returns control normally");

        main(() -> app.startGuidedLesson(0));
        main(() -> { app.act(52, 36, 5); app.home(); });
        SystemClock.sleep(900);
        waitForAppWindow();
        require(hasText("Training"), "A delayed bot reply does not pull the player back from Home");
        main(app::resumeSavedGame);
        waitForSequence(2);
        require(app.game.turn == app.me, "Resume returns to the saved board after its pending reply");

        // An old Stockfish search must not hold a newly selected authored reply
        // behind its worker queue. The lesson reply is local, session-scoped data.
        main(() -> {
            app.startLocalConfirmed(true, false, 2);
            app.act(52, 36, 5);
            app.startGuidedLesson(0);
            app.act(52, 36, 5);
        });
        waitForSequenceWithin(2, 1800);
        require(app.isGuidedLesson() && app.game.turn == app.me,
            "A new guided lesson replies promptly while an abandoned engine search exists");
        say("Mid-line Continue and Home-with-pending-reply recovery flow passed");
    }

    void waitForLearnerTurnOrCompletion() throws Exception {
        long deadline = SystemClock.uptimeMillis() + 15000;
        while (SystemClock.uptimeMillis() < deadline && !app.lessonComplete() && app.game.turn != app.me) SystemClock.sleep(80);
        require(app.lessonComplete() || app.game.turn == app.me, "Scripted reply returns control to learner");
    }

    /** Completion is only complete when its deliberately locked UI is rendered. */
    void waitForLessonCompletionCard(String lesson) throws Exception {
        long deadline = SystemClock.uptimeMillis() + 4000;
        while (SystemClock.uptimeMillis() < deadline) {
            if (findText(app.root, "LESSON COMPLETE") > 0) return;
            SystemClock.sleep(40);
        }
        require(false, lesson + " completion card is visible");
    }

    void waitForBotLearnerTurn() throws Exception {
        long deadline = SystemClock.uptimeMillis() + 15000;
        while (SystemClock.uptimeMillis() < deadline && app.game != null && app.game.turn != app.me) SystemClock.sleep(80);
        require(app.game != null && app.game.turn == app.me, "Stockfish returns control for the normal-game hint flow");
    }

    void waitForSequence(int sequence) throws Exception {
        long deadline = SystemClock.uptimeMillis() + 15000;
        while (SystemClock.uptimeMillis() < deadline && app.game.seq < sequence) SystemClock.sleep(80);
        require(app.game.seq == sequence, "Expected game sequence " + sequence + ", got " + app.game.seq);
    }

    void waitForSequenceWithin(int sequence, long timeoutMillis) throws Exception {
        long deadline = SystemClock.uptimeMillis() + timeoutMillis;
        while (SystemClock.uptimeMillis() < deadline && app.game.seq < sequence) SystemClock.sleep(40);
        require(app.game.seq == sequence, "Expected sequence " + sequence + " within " + timeoutMillis + "ms, got " + app.game.seq);
    }

    void waitForNumericEvaluation(int sequence, String stage) throws Exception {
        long deadline = SystemClock.uptimeMillis() + 10000;
        while (SystemClock.uptimeMillis() < deadline) {
            String score = app.liveChessScore == null ? "" : app.liveChessScore.getText().toString();
            boolean fresh = app.coach != null && app.session.equals(app.coachSession) && app.coachSeq == sequence;
            if (fresh && score.matches("[+\\-−]\\d+\\.\\d{2}")) return;
            SystemClock.sleep(80);
        }
        String score = app.liveChessScore == null ? "(missing)" : app.liveChessScore.getText().toString();
        require(false, "A fresh numeric evaluation is visible for " + stage + "; found " + score);
    }

    void waitForAnalysis(int count) throws Exception {
        long deadline = SystemClock.uptimeMillis() + 10000;
        while (SystemClock.uptimeMillis() < deadline && app.game.analysis.size() < count) SystemClock.sleep(80);
        require(app.game.analysis.size() >= count, "Stockfish analysis reaches the lesson review");
    }

    boolean hasText(String value) { return findNode(value, false) != null; }

    /** A chip tap must not dismiss/recreate the bottom sheet or move its primary action. */
    int activeWindowId(String stage) {
        AccessibilityNodeInfo root = getUiAutomation().getRootInActiveWindow();
        require(root != null, stage + " has an active window");
        return root.getWindowId();
    }

    Rect exactTextBounds(String value) {
        AccessibilityNodeInfo node = findNode(value, true);
        require(node != null, "Visible setup action exists: " + value);
        Rect bounds = new Rect();
        node.getBoundsInScreen(bounds);
        return bounds;
    }

    void requireStableSetupSheet(int expectedWindow, Rect expectedPrimary, String currentPrimary, String stage) {
        require(activeWindowId(stage) == expectedWindow, stage + " stays in the same dialog window");
        require(expectedPrimary.equals(exactTextBounds(currentPrimary)),
            stage + " keeps the primary action at the same on-screen bounds");
    }

    void waitForAppWindow() throws Exception {
        long deadline = SystemClock.uptimeMillis() + 8000;
        while (SystemClock.uptimeMillis() < deadline) {
            AccessibilityNodeInfo root = getUiAutomation().getRootInActiveWindow();
            if (root != null && "com.chesslink".contentEquals(root.getPackageName())) return;
            SystemClock.sleep(80);
        }
        throw new AssertionError("ChessLink did not become the active window");
    }

    boolean clickText(String value) {
        AccessibilityNodeInfo node = findNode(value, true);
        if (node == null) return false;
        Rect bounds = new Rect(); node.getBoundsInScreen(bounds); tap(bounds.centerX(), bounds.centerY()); return true;
    }

    AccessibilityNodeInfo findNode(String value, boolean exact) {
        AccessibilityNodeInfo root = getUiAutomation().getRootInActiveWindow();
        if (root == null) return null;
        ArrayDeque<AccessibilityNodeInfo> queue = new ArrayDeque<>(); queue.add(root);
        while (!queue.isEmpty()) {
            AccessibilityNodeInfo node = queue.remove();
            CharSequence text = node.getText();
            CharSequence description = node.getContentDescription();
            if ((text != null && (exact ? value.equalsIgnoreCase(text.toString()) : text.toString().contains(value)))
                || (description != null && !exact && description.toString().contains(value))) return node;
            for (int index = 0; index < node.getChildCount(); index++) {
                AccessibilityNodeInfo child = node.getChild(index); if (child != null) queue.add(child);
            }
        }
        return null;
    }

    boolean scrollActiveDialogToEnd() {
        AccessibilityNodeInfo root = getUiAutomation().getRootInActiveWindow();
        if (root == null) return false;
        ArrayDeque<AccessibilityNodeInfo> queue = new ArrayDeque<>();
        queue.add(root);
        AccessibilityNodeInfo fallback = null;
        while (!queue.isEmpty()) {
            AccessibilityNodeInfo node = queue.remove();
            if ("android.widget.ScrollView".contentEquals(node.getClassName()) && node.isVisibleToUser()) {
                CharSequence description = node.getContentDescription();
                if (description != null && description.toString().contains("Guided lesson catalogue")) {
                    Rect bounds = new Rect(); node.getBoundsInScreen(bounds);
                    if (bounds.height() < 40) return false;
                    swipe(bounds.centerX(), bounds.bottom - 10, bounds.centerX(), bounds.top + 10);
                    return true;
                }
                // A sheet can provide an outer safety scroller. Keep it only
                // as a fallback; the inner lesson catalogue owns the gesture.
                fallback = node;
            }
            for (int index = 0; index < node.getChildCount(); index++) {
                AccessibilityNodeInfo child = node.getChild(index); if (child != null) queue.add(child);
            }
        }
        if (fallback != null) {
            Rect bounds = new Rect(); fallback.getBoundsInScreen(bounds);
            if (bounds.height() >= 40) { swipe(bounds.centerX(), bounds.bottom - 10, bounds.centerX(), bounds.top + 10); return true; }
        }
        return false;
    }

    void tap(float x, float y) {
        long now = SystemClock.uptimeMillis();
        MotionEvent down = MotionEvent.obtain(now, now, MotionEvent.ACTION_DOWN, x, y, 0);
        MotionEvent up = MotionEvent.obtain(now, now + 70, MotionEvent.ACTION_UP, x, y, 0);
        getUiAutomation().injectInputEvent(down, true); getUiAutomation().injectInputEvent(up, true);
        down.recycle(); up.recycle(); waitForIdleSync(); SystemClock.sleep(300);
    }

    void swipe(float fromX, float fromY, float toX, float toY) {
        long started = SystemClock.uptimeMillis();
        MotionEvent down = MotionEvent.obtain(started, started, MotionEvent.ACTION_DOWN, fromX, fromY, 0);
        getUiAutomation().injectInputEvent(down, true); down.recycle();
        for (int step = 1; step <= 8; step++) {
            long when = started + step * 35L;
            float amount = step / 8f;
            MotionEvent move = MotionEvent.obtain(started, when, MotionEvent.ACTION_MOVE,
                fromX + (toX - fromX) * amount, fromY + (toY - fromY) * amount, 0);
            getUiAutomation().injectInputEvent(move, true); move.recycle();
        }
        MotionEvent up = MotionEvent.obtain(started, started + 315L, MotionEvent.ACTION_UP, toX, toY, 0);
        getUiAutomation().injectInputEvent(up, true); up.recycle();
        // A nested catalogue may still be settling its inertial scroll. The
        // platform's global idle signal can wait indefinitely for that
        // animation; a bounded render pause keeps this a real gesture test.
        SystemClock.sleep(500);
    }

    void cell(int square) {
        BoardView board = app.board; int[] origin = new int[2];
        main(() -> board.getLocationOnScreen(origin));
        android.graphics.RectF hit = board.hit.get(square);
        tap(origin[0] + hit.centerX(), origin[1] + hit.centerY());
    }

    int findText(View view, String part) {
        int count = view instanceof TextView && ((TextView) view).getText().toString().contains(part) ? 1 : 0;
        if (view instanceof ViewGroup) for (int index = 0; index < ((ViewGroup) view).getChildCount(); index++) count += findText(((ViewGroup) view).getChildAt(index), part);
        return count;
    }

    TextView findTextView(View view, String part) {
        if (view instanceof TextView && ((TextView) view).getText().toString().contains(part)) return (TextView) view;
        if (view instanceof ViewGroup) for (int index = 0; index < ((ViewGroup) view).getChildCount(); index++) {
            TextView found = findTextView(((ViewGroup) view).getChildAt(index), part);
            if (found != null) return found;
        }
        return null;
    }

    void verifyScreenFits() {
        main(() -> checkBounds(app.root));
        main(() -> checkTextLayouts(app.root));
        require(app.board != null && app.board.getHeight() > app.dp(140), "Board remains usable after the full flow");
        say("Visible action bounds, text layouts and board usability passed");
    }

    /**
     * Dialogs are a separate window from the activity hierarchy, so checking
     * app.root alone can miss a bottom action hidden by the system navigation
     * area.  Inspect the active accessibility window while the hub and preview
     * are actually open; off-screen lesson cards are deliberately ignored.
     */
    void verifyVisibleAccessibilityActionsFit(String stage) {
        AccessibilityNodeInfo root = getUiAutomation().getRootInActiveWindow();
        require(root != null, stage + " has an active accessibility window");
        int inspected = 0;
        int viewportBottom = safeViewportBottom();
        ArrayDeque<AccessibilityNodeInfo> queue = new ArrayDeque<>();
        queue.add(root);
        while (!queue.isEmpty()) {
            AccessibilityNodeInfo node = queue.remove();
            CharSequence label = node.getText() != null ? node.getText() : node.getContentDescription();
            if (node.isVisibleToUser() && node.isClickable() && label != null && label.length() > 0) {
                Rect bounds = new Rect();
                node.getBoundsInScreen(bounds);
                require(bounds.top >= 0 && bounds.bottom <= viewportBottom,
                    stage + " action fits the safe viewport: " + label);
                inspected++;
            }
            for (int index = 0; index < node.getChildCount(); index++) {
                AccessibilityNodeInfo child = node.getChild(index); if (child != null) queue.add(child);
            }
        }
        require(inspected > 0, stage + " exposes visible actions");
    }

    int safeViewportBottom() {
        int viewportBottom = app.getWindow().getDecorView().getHeight();
        if (android.os.Build.VERSION.SDK_INT >= 30 && app.getWindow().getDecorView().getRootWindowInsets() != null) {
            viewportBottom -= app.getWindow().getDecorView().getRootWindowInsets()
                .getInsets(android.view.WindowInsets.Type.systemBars() | android.view.WindowInsets.Type.displayCutout()).bottom;
        }
        return viewportBottom;
    }

    void checkBounds(View view) {
        if (view.getVisibility() != View.VISIBLE) return;
        android.graphics.Rect visible = new android.graphics.Rect();
        boolean isOnScreen = view.getGlobalVisibleRect(visible) && visible.width() > 0 && visible.height() > 0;
        if (view instanceof android.widget.Button) {
            // A large-text page may intentionally scroll. Fully off-screen
            // actions are reachable by scrolling; a partially clipped action
            // is not acceptable.
            if (!isOnScreen) return;
            int viewportBottom = safeViewportBottom();
            require(visible.height() == view.getHeight() && visible.top >= 0 && visible.bottom <= viewportBottom,
                "Visible action fits on screen: " + ((android.widget.Button) view).getText());
        }
        if (view instanceof ViewGroup) for (int index = 0; index < ((ViewGroup) view).getChildCount(); index++) checkBounds(((ViewGroup) view).getChildAt(index));
    }

    /** No rendered TextView may have more laid-out text than its own box can show. */
    void checkTextLayouts(View view) {
        if (view.getVisibility() != View.VISIBLE) return;
        if (view instanceof TextView) {
            TextView text = (TextView) view;
            android.text.Layout layout = text.getLayout();
            if (layout != null && text.getHeight() > 0) {
                int available = text.getHeight() - text.getPaddingTop() - text.getPaddingBottom();
                require(layout.getHeight() <= available + 1,
                    "Text fits vertically: " + text.getText().toString().replace('\n', ' '));
            }
        }
        if (view instanceof ViewGroup) for (int index = 0; index < ((ViewGroup) view).getChildCount(); index++) checkTextLayouts(((ViewGroup) view).getChildAt(index));
    }
}
