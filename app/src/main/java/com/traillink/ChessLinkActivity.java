package com.traillink;

import android.app.AlertDialog;
import android.app.Dialog;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.view.Gravity;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.Window;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import org.json.JSONObject;
import org.json.JSONArray;
import java.util.ArrayList;

/**
 * The dedicated ChessLink entry point.  It deliberately inherits the battle-tested
 * board, game state, Bluetooth protocol and Stockfish integration from MainActivity,
 * but exposes only chess rather than TrailLink's multi-game catalogue.
 */
public class ChessLinkActivity extends MainActivity {
    private boolean onlineMode;
    private static final int NIGHT = 0xff0b1020;
    private static final int PANEL = 0xff131c31;
    private static final int PANEL_RAISED = 0xff1b2740;
    private static final int TEXT = 0xfff5f7ff;
    private static final int SUBTEXT = 0xff9eabc4;
    private static final int ACCENT = 0xff7697ff;
    private static final int MINT = 0xff75d5ad;
    private static final int[] CLOCK_MINUTES = {10, 5, 3, 1, 0};
    private static final int[] CLOCK_INCREMENT = {0, 0, 2, 0, 0};
    private static final String[] CLOCK_LABELS = {"10 | 0", "5 | 0", "3 | 2", "1 | 0", "Untimed"};
    private final long[] clocks = new long[2];
    private final TextView[] clockViews = new TextView[2];
    private int selectedClock = 0, clockTurn = -1, clockSeq = -1;
    private long clockAnchor;
    private boolean clocksRunning;
    private final Runnable clockLoop = new Runnable() { @Override public void run() { tickClocks(); } };
    /*
     * A guided lesson is deliberately stateful.  These values are tied to the
     * game sequence, so a clue from one position can never leak into the next
     * position (or a newly selected lesson).
     */
    private int lessonHintStage;
    private int lessonHintSeq = -1;
    private int lessonAttempts;
    private int lessonAttemptsSeq = -1;
    private String lessonFeedback = "";
    /** Prevent a double-tap from silently skipping a progressive hint stage. */
    private long lessonHintChangedAt;
    /** A bot may finish thinking after the player deliberately returns to Home. */
    private boolean deferBoardUntilResume;

    /*
     * Free practice needs a coach too.  Keep it deliberately separate from
     * lesson hints: a regular game may use Stockfish's recommendation, while a
     * guided lesson must always follow its authored line.
     *
     * The state is attached to the exact game session and ply. A suggestion
     * cannot survive a move, a rematch, or a return from a different match.
     */
    private int normalHintStage;
    private int normalHintSeq = -1;
    private String normalHintSession = "";
    private boolean normalHintLoading;
    private long normalHintChangedAt;
    private TextView normalCoachCopy;
    private Button normalHintButton;
    /** The content itself may grow for Android accessibility text. */
    private android.widget.ScrollView pageScroll;

    /** Choices stay local to a setup sheet until its primary action confirms them. */
    static final class SetupChoice {
        int clock, level;
        SetupChoice(int clock, int level) { this.clock = clock; this.level = level; }
    }

    /**
     * Most sheets need a safe overflow container.  The lesson hub has its own
     * scrollable catalogue inside that container, so it can explicitly route
     * vertical gestures to the catalogue instead of letting two ScrollViews
     * fight over the same swipe.
     */
    static final class StableSheetScrollView extends android.widget.ScrollView {
        boolean delegateVerticalGestures;
        StableSheetScrollView(android.content.Context context) { super(context); }
        @Override public boolean onInterceptTouchEvent(android.view.MotionEvent event) {
            return !delegateVerticalGestures && super.onInterceptTouchEvent(event);
        }
    }

    @Override void base(String eyebrow, String title) {
        leaveRts();
        getWindow().setStatusBarColor(NIGHT);
        getWindow().setNavigationBarColor(NIGHT);
        getWindow().getDecorView().setSystemUiVisibility(0);
        if (android.os.Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            getWindow().getInsetsController().setSystemBarsAppearance(0,
                WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS);
        }
        gameScreen = false;
        pageScroll = new android.widget.ScrollView(this);
        pageScroll.setFillViewport(true);
        pageScroll.setClipToPadding(false);
        pageScroll.setVerticalScrollBarEnabled(false);
        pageScroll.setLayoutDirection(View.LAYOUT_DIRECTION_LTR);
        pageScroll.setBackgroundColor(NIGHT);
        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setLayoutDirection(View.LAYOUT_DIRECTION_LTR);
        root.setBackgroundColor(NIGHT);
        root.setPadding(dp(18), dp(8), dp(18), dp(8));
        pageScroll.addView(root, new android.widget.ScrollView.LayoutParams(-1, -2));
        pageScroll.setOnApplyWindowInsetsListener((view, insets) -> {
            int left = insets.getSystemWindowInsetLeft(), top = insets.getSystemWindowInsetTop();
            int right = insets.getSystemWindowInsetRight(), bottom = insets.getSystemWindowInsetBottom();
            if (android.os.Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets safe = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                left = safe.left; top = safe.top; right = safe.right; bottom = safe.bottom;
            }
            int wide = Math.max(0, (getResources().getDisplayMetrics().widthPixels - left - right - dp(620)) / 2);
            // The inner page owns the visual 18 dp rhythm; the scroll host
            // owns only system bars and wide-screen centering.  This means a
            // taller accessible page can scroll above the navigation bar
            // rather than losing its final line or action beneath it.
            view.setPadding(left + wide, top, right + wide, bottom);
            return insets;
        });
        setContentView(pageScroll);
        pageScroll.requestApplyInsets();

        LinearLayout bar = new LinearLayout(this);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        TextView mark = text("♞", 26, NIGHT);
        mark.setGravity(Gravity.CENTER);
        mark.setTypeface(Typeface.create("serif", Typeface.BOLD));
        mark.setBackground(shape(MINT, 15));
        bar.addView(mark, new LinearLayout.LayoutParams(dp(48), dp(48)));
        TextView heading = text(title, 25, TEXT);
        heading.setTypeface(Typeface.create("sans-serif", Typeface.BOLD));
        heading.setPadding(dp(12), 0, 0, 0);
        heading.setMaxLines(1);
        bar.addView(heading, new LinearLayout.LayoutParams(0, dp(48), 1));
        Button menu = secondary("•••", this::menu);
        menu.setContentDescription("Game options");
        bar.addView(menu, new LinearLayout.LayoutParams(dp(54), dp(46)));
        root.addView(bar);

        String transport = onlineMode ? "Online room" : "Bluetooth";
        String label = local ? (solo ? Bot.LEVELS[botLevel] + " • Stockfish" : "Local board")
            : ready ? "●  " + peer + " • " + transport : "Private chess • ready to play";
        connection = text(label, 12, SUBTEXT);
        connection.setSingleLine(true);
        connection.setEllipsize(android.text.TextUtils.TruncateAt.END);
        connection.setAutoSizeTextTypeUniformWithConfiguration(10, 12, 1, android.util.TypedValue.COMPLEX_UNIT_SP);
        root.addView(connection, new LinearLayout.LayoutParams(-1, dp(32)));
    }

    @Override TextView text(String value, int size, int color) {
        if (color == INK || color == Color.BLACK) color = TEXT;
        else if (color == MUTED) color = SUBTEXT;
        else if (color == GREEN) color = MINT;
        TextView view = super.text(value, size, color);
        view.setIncludeFontPadding(false);
        return view;
    }

    @Override GradientDrawable shape(int color, int radius) {
        if (color == Color.WHITE || color == 0xfffffcf5 || color == 0xffe5e9dc) color = PANEL;
        return super.shape(color, radius);
    }

    @Override Button button(String label, Runnable action) {
        Button button = new Button(this);
        button.setText(label);
        button.setAllCaps(false);
        button.setTextColor(NIGHT);
        button.setTextSize(15);
        button.setTypeface(Typeface.create("sans-serif", Typeface.BOLD));
        GradientDrawable fill = new GradientDrawable(GradientDrawable.Orientation.TL_BR, new int[]{0xff8ba7ff, 0xff6e82f6});
        fill.setCornerRadius(dp(16));
        button.setBackground(new android.graphics.drawable.RippleDrawable(android.content.res.ColorStateList.valueOf(0x33ffffff), fill, null));
        button.setStateListAnimator(null);
        button.setMinHeight(dp(52));
        button.setPadding(dp(16), dp(10), dp(16), dp(10));
        LinearLayout.LayoutParams layout = new LinearLayout.LayoutParams(-1, dp(56));
        layout.setMargins(0, dp(5), 0, dp(5));
        button.setLayoutParams(layout);
        button.setOnClickListener(view -> action.run());
        return button;
    }

    @Override Button secondary(String label, Runnable action) {
        Button button = button(label, action);
        button.setTextColor(TEXT);
        GradientDrawable fill = shape(PANEL_RAISED, 16);
        fill.setStroke(dp(1), 0xff2a3854);
        button.setBackground(new android.graphics.drawable.RippleDrawable(android.content.res.ColorStateList.valueOf(0x227697ff), fill, null));
        return button;
    }

    @Override void home() {
        // A delayed bot reply is still saved, but it must not pull someone back
        // to the board after they deliberately left it.
        boolean liveChess = (game != null && game.id == 0 && game.winner < 0)
            || (state != null && state.optInt("id", -1) == 0 && state.optInt("winner", -1) < 0);
        if (inGame && liveChess) deferBoardUntilResume = true;
        reviewing = false;
        inGame = false;
        base("", "ChessLink");
        if (onlineMode) connection.setText(status);

        LinearLayout hero = new LinearLayout(this);
        hero.setOrientation(LinearLayout.VERTICAL);
        hero.setPadding(dp(18), dp(15), dp(18), dp(12));
        GradientDrawable heroFill = new GradientDrawable(GradientDrawable.Orientation.TL_BR, new int[]{0xff1b2b4a, 0xff11192c});
        heroFill.setCornerRadius(dp(18));
        hero.setBackground(heroFill);
        TextView overline = text("READY TO PLAY", 10, MINT);
        overline.setTypeface(Typeface.create("sans-serif", Typeface.BOLD));
        hero.addView(overline);
        TextView title = text("Your next game\nstarts here.", 25, TEXT);
        title.setTypeface(Typeface.create("sans-serif", Typeface.BOLD));
        title.setMaxLines(2);
        hero.addView(title);
        TextView heroSubtitle = text("Private rooms, nearby play and serious practice.", 13, 0xffbdc8dd);
        heroSubtitle.setMaxLines(2);
        hero.addView(heroSubtitle);
        // The hero contains a two-line title; let its supporting copy wrap at
        // larger Android font settings instead of cutting off a second line.
        int heroHeight = 164 + Math.round(Math.max(0f, userFontScale() - 1f) * 106f);
        LinearLayout.LayoutParams heroLayout = new LinearLayout.LayoutParams(-1, dp(heroHeight));
        heroLayout.setMargins(0, dp(6), 0, dp(8));
        root.addView(hero, heroLayout);

        if (ready) {
            root.addView(button(host ? (onlineMode ? "Set up online game" : "Set up nearby game") : "Accept the match", () -> { if (host) showRemoteSetup(); else invite(0); }));
            root.addView(secondary("Message" + (unread > 0 ? " (" + unread + ")" : ""), this::chat));
        } else {
            root.addView(button("Quick game", () -> chooseBot(false)));
            TextView heading = text("WAYS TO PLAY", 10, SUBTEXT);
            heading.setTypeface(Typeface.create("sans-serif", Typeface.BOLD));
            heading.setPadding(0, dp(12), 0, dp(5));
            root.addView(heading, new LinearLayout.LayoutParams(-1, dp(36)));
            LinearLayout rowOne = new LinearLayout(this);
            root.addView(rowOne, new LinearLayout.LayoutParams(-1, dp(82)));
            homeTile(rowOne, "Play online", "Private room", this::onlineRoom, true);
            homeTile(rowOne, "Nearby", "Bluetooth", this::nearbyGame, false);
            LinearLayout rowTwo = new LinearLayout(this);
            root.addView(rowTwo, new LinearLayout.LayoutParams(-1, dp(82)));
            homeTile(rowTwo, "Training", "Guided openings", this::showLearningHub, true);
            homeTile(rowTwo, "Pass & play", "One device", () -> showPassSetup(), false);
        }
        // A disconnected guest still has an authoritative saved chess state.
        // Keep a visible return path rather than protecting it only in the
        // background while leaving the player stranded on Home.
        if ((game != null || state != null) && (local || ready || hasLiveSavedChessGame())) addContinueCard();
        root.addView(text("PRIVATE BY DEFAULT   •   NO ADS   •   YOUR MOVES STAY YOURS", 10, SUBTEXT));
    }

    /** A saved game should look like something worth returning to, not a utility button. */
    void addContinueCard() {
        boolean complete = state != null && state.optInt("winner", -1) >= 0;
        String opponent = solo ? "Stockfish" : (peer == null || peer.trim().isEmpty() ? "Your opponent" : peer);
        LinearLayout card = new LinearLayout(this);
        card.setGravity(Gravity.CENTER_VERTICAL);
        card.setPadding(dp(15), dp(10), dp(10), dp(10));
        GradientDrawable fill = shape(PANEL_RAISED, 16);
        fill.setStroke(dp(1), complete ? 0xff3d5677 : ACCENT);
        card.setBackground(new android.graphics.drawable.RippleDrawable(android.content.res.ColorStateList.valueOf(0x227697ff), fill, null));
        card.setOnClickListener(view -> resumeSavedGame());

        LinearLayout copy = new LinearLayout(this);
        copy.setOrientation(LinearLayout.VERTICAL);
        TextView eyebrow = compactText(complete ? "GAME COMPLETE" : "YOUR SAVED GAME", 9, complete ? MINT : ACCENT);
        eyebrow.setTypeface(Typeface.create("sans-serif", Typeface.BOLD));
        copy.addView(eyebrow, new LinearLayout.LayoutParams(-1, -2));
        int savedClock = state == null ? selectedClock : state.optInt("clockPreset", selectedClock);
        TextView title = compactText(complete ? outcomeText(state.optInt("winner")) : clockLabel(savedClock) + " · " + opponent, 16, TEXT);
        title.setTypeface(Typeface.create("sans-serif", Typeface.BOLD));
        title.setSingleLine(true);
        title.setEllipsize(android.text.TextUtils.TruncateAt.END);
        title.setAutoSizeTextTypeUniformWithConfiguration(11, 16, 1, android.util.TypedValue.COMPLEX_UNIT_SP);
        copy.addView(title, new LinearLayout.LayoutParams(-1, -2));
        TextView detail = compactText(complete ? "Review your moves and accuracy" : "Tap to return to the board", 11, SUBTEXT);
        copy.addView(detail, new LinearLayout.LayoutParams(-1, -2));
        card.addView(copy, new LinearLayout.LayoutParams(0, -2, 1));

        TextView arrow = text("›", 30, NIGHT);
        arrow.setTypeface(Typeface.create("sans-serif", Typeface.BOLD));
        arrow.setGravity(Gravity.CENTER);
        arrow.setBackground(shape(ACCENT, 14));
        card.addView(arrow, new LinearLayout.LayoutParams(dp(48), dp(48)));
        card.setMinimumHeight(dp(84));
        LinearLayout.LayoutParams cardLayout = new LinearLayout.LayoutParams(-1, -2);
        cardLayout.setMargins(0, dp(9), 0, dp(4));
        root.addView(card, cardLayout);
    }

    void resumeSavedGame() {
        deferBoardUntilResume = false;
        if (local || host) showSnapshot(); else renderGame();
    }

    void homeTile(LinearLayout row, String title, String detail, Runnable action, boolean first) {
        LinearLayout tile = new LinearLayout(this);
        tile.setOrientation(LinearLayout.VERTICAL);
        tile.setGravity(Gravity.CENTER_VERTICAL);
        tile.setPadding(dp(14), dp(10), dp(14), dp(8));
        GradientDrawable fill = shape(PANEL_RAISED, 14);
        fill.setStroke(dp(1), 0xff2a3854);
        tile.setBackground(new android.graphics.drawable.RippleDrawable(android.content.res.ColorStateList.valueOf(0x227697ff), fill, null));
        tile.setOnClickListener(view -> action.run());
        TextView name = compactText(title, 15, TEXT);
        name.setTypeface(Typeface.create("sans-serif", Typeface.BOLD));
        tile.addView(name, new LinearLayout.LayoutParams(-1, -2));
        tile.addView(compactText(detail, 11, SUBTEXT), new LinearLayout.LayoutParams(-1, -2));
        LinearLayout.LayoutParams layout = new LinearLayout.LayoutParams(0, -1, 1);
        if (!first) layout.setMargins(dp(8), 0, 0, 0);
        row.addView(tile, layout);
    }

    /**
     * Training has its own entry flow.  It must never be a disguised bot setup:
     * a learner first chooses a finite lesson, sees the objective, then starts.
     */
    void showLearningHub() {
        Dialog dialog = setupDialog("Learn chess", "Short guided openings teach one idea at a time. You always play White.");
        LinearLayout body = (LinearLayout) dialog.findViewById(991);
        StableSheetScrollView sheetOverflow = (StableSheetScrollView) dialog.findViewById(992);
        if (sheetOverflow != null) sheetOverflow.delegateVerticalGestures = true;
        TextView label = compactText("GUIDED OPENINGS", 10, MINT);
        label.setTypeface(Typeface.create("sans-serif", Typeface.BOLD));
        body.addView(label, new LinearLayout.LayoutParams(-1, -2));
        TextView browse = compactText("Scroll for all 7 openings", 10, SUBTEXT);
        browse.setContentDescription("Scroll for all seven guided openings");
        body.addView(browse, new LinearLayout.LayoutParams(-1, -2));

        android.widget.ScrollView scroll = new android.widget.ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setClipToPadding(false);
        scroll.setContentDescription("Guided lesson catalogue");
        LinearLayout lessons = new LinearLayout(this);
        lessons.setOrientation(LinearLayout.VERTICAL);
        scroll.addView(lessons, new android.widget.ScrollView.LayoutParams(-1, -2));
        for (int index = 0; index < ChessTutor.NAMES.length; index++) {
            final int lesson = index;
            lessons.addView(lessonCard(lesson, () -> { dialog.dismiss(); showLessonPreview(lesson); }));
        }
        // Give the headings their extra height at larger font sizes by taking
        // it from a scrolling list rather than from a hidden bottom action.
        int hubScrollHeight = 300 - Math.round(Math.max(0f, userFontScale() - 1f) * 112f);
        LinearLayout.LayoutParams scrollLayout = new LinearLayout.LayoutParams(-1, dp(Math.max(250, hubScrollHeight)));
        scrollLayout.setMargins(0, 0, 0, dp(6));
        body.addView(scroll, scrollLayout);

        Button free = secondary("Free practice with Stockfish", () -> { dialog.dismiss(); beginFreePractice(); });
        free.setContentDescription("Free practice with Stockfish, without guided lesson moves");
        body.addView(free, new LinearLayout.LayoutParams(-1, dp(scaledControlHeight(48, 15))));
        Button close = secondary("Not now", dialog::dismiss);
        close.setTextSize(13);
        body.addView(close, new LinearLayout.LayoutParams(-1, dp(scaledControlHeight(42, 13))));
        dialog.show();
    }

    LinearLayout lessonCard(int lesson, Runnable action) {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setGravity(Gravity.CENTER_VERTICAL);
        card.setPadding(dp(13), dp(6), dp(13), dp(5));
        GradientDrawable fill = shape(PANEL_RAISED, 13);
        fill.setStroke(dp(1), 0xff2a3854);
        card.setBackground(new android.graphics.drawable.RippleDrawable(android.content.res.ColorStateList.valueOf(0x227697ff), fill, null));
        card.setContentDescription("Guided lesson: " + ChessTutor.NAMES[lesson] + ". " + ChessTutor.lessonMoveCount(lesson) + " moves as White.");
        card.setOnClickListener(view -> action.run());
        TextView title = compactText(ChessTutor.NAMES[lesson], 15, TEXT);
        title.setTypeface(Typeface.create("sans-serif", Typeface.BOLD));
        title.setSingleLine(true);
        title.setEllipsize(android.text.TextUtils.TruncateAt.END);
        card.addView(title, new LinearLayout.LayoutParams(-1, -2));
        TextView detail = compactText(ChessTutor.lessonMoveCount(lesson) + " learner moves  ·  White  ·  Untimed", 10, SUBTEXT);
        detail.setSingleLine(true);
        detail.setEllipsize(android.text.TextUtils.TruncateAt.END);
        card.addView(detail, new LinearLayout.LayoutParams(-1, -2));
        card.setMinimumHeight(dp(Math.max(54, 11 + (int) Math.ceil(15f * userFontScale() * 1.28f)
            + (int) Math.ceil(10f * userFontScale() * 1.28f))));
        LinearLayout.LayoutParams layout = new LinearLayout.LayoutParams(-1, -2);
        layout.setMargins(0, dp(3), 0, dp(3));
        card.setLayoutParams(layout);
        return card;
    }

    void showLessonPreview(int lesson) {
        final int selected = Math.max(0, Math.min(ChessTutor.NAMES.length - 1, lesson));
        // The full authored introduction is useful as reference material, but
        // a modal preview needs one complete goal—not a fourth clipped line at
        // a larger Android font size.  The objective is the opening's first,
        // self-contained teaching sentence.
        Dialog dialog = setupDialog(ChessTutor.NAMES[selected], ChessTutor.objective(selected));
        LinearLayout body = (LinearLayout) dialog.findViewById(991);
        TextView facts = compactText("PLAY WHITE  ·  " + ChessTutor.lessonMoveCount(selected) + " MOVES  ·  UNTIMED", 10, MINT);
        facts.setTypeface(Typeface.create("sans-serif", Typeface.BOLD));
        body.addView(facts, new LinearLayout.LayoutParams(-1, -2));
        TextView expectation = compactText("Hints progress from an idea, to the piece, to the complete move. A different legal move stays on the board and gives you a useful recovery cue.", 12, SUBTEXT);
        expectation.setMaxLines(3);
        body.addView(expectation, new LinearLayout.LayoutParams(-1, -2));
        Button start = button("Start guided lesson", () -> { dialog.dismiss(); beginGuidedLesson(selected); });
        start.setContentDescription("Start the " + ChessTutor.NAMES[selected] + " guided lesson");
        LinearLayout.LayoutParams startLayout = new LinearLayout.LayoutParams(-1, dp(scaledControlHeight(54, 15)));
        startLayout.setMargins(0, dp(10), 0, 0);
        body.addView(start, startLayout);
        Button all = secondary("All lessons", () -> { dialog.dismiss(); showLearningHub(); });
        all.setTextSize(13);
        body.addView(all, new LinearLayout.LayoutParams(-1, dp(scaledControlHeight(42, 13))));
        dialog.show();
    }

    boolean hasLiveSavedChessGame() {
        boolean ownedGame = game != null && game.id == 0 && game.winner < 0;
        boolean guestGame = state != null && state.optInt("id", -1) == 0 && state.optInt("winner", -1) < 0;
        return ownedGame || guestGame;
    }

    /** Every new-game route shares this guard, including a guest's saved room. */
    void replaceSavedChessGame(String destination, Runnable replace) {
        if (hasLiveSavedChessGame()) {
            confirm("Replace saved game?", "Your current chess game will be replaced by " + destination + ".", replace);
        } else {
            replace.run();
        }
    }

    /** Free practice has the same saved-game safety contract as a guided lesson. */
    void beginFreePractice() {
        if (hasLiveSavedChessGame()) {
            confirm("Replace saved game?", "Your current chess game will be replaced by free practice.", () -> showBotSetup(true));
        } else {
            showBotSetup(false);
        }
    }

    void beginGuidedLesson(int lesson) {
        replaceSavedChessGame("this guided lesson", () -> startGuidedLesson(lesson));
    }

    void resetGuidedState() {
        lessonHintStage = 0;
        lessonHintSeq = -1;
        lessonAttempts = 0;
        lessonAttemptsSeq = -1;
        lessonFeedback = "";
        lessonHintChangedAt = 0L;
    }

    void startGuidedLesson(int lesson) {
        deferBoardUntilResume = false;
        useBluetooth();
        link.close();
        ready = false;
        host = false;
        awaiting = false;
        game = null;
        state = null;
        session = "";
        savedPeer = "";
        local = true;
        solo = true;
        botLevel = 1;
        selectedClock = 4;
        learnMode = true;
        openingLesson = Math.max(0, Math.min(ChessTutor.NAMES.length - 1, lesson));
        resetGuidedState();
        save();
        startGame(0);
    }

    void nearbyGame() {
        showOptionSheet("Play nearby", "Use Bluetooth to play in the same room without internet.",
            new String[]{"Host a game", "Join a friend"},
            new Runnable[]{() -> startBluetooth(true), () -> startBluetooth(false)}, 0);
    }

    void feature(LinearLayout row, String value, String label) {
        LinearLayout item = new LinearLayout(this);
        item.setOrientation(LinearLayout.VERTICAL);
        TextView number = text(value, 11, MINT);
        number.setTypeface(Typeface.create("sans-serif", Typeface.BOLD));
        item.addView(number);
        item.addView(text(label, 10, 0xffb5c1d9));
        LinearLayout.LayoutParams layout = new LinearLayout.LayoutParams(0, dp(43), 1);
        if (row.getChildCount() > 0) layout.setMargins(dp(10), 0, 0, 0);
        row.addView(item, layout);
    }

    static final class SquareBoardFrame extends FrameLayout {
        SquareBoardFrame(android.content.Context context) { super(context); }
        @Override protected void onMeasure(int widthSpec, int heightSpec) {
            int size = MeasureSpec.getSize(widthSpec);
            int childSpec = MeasureSpec.makeMeasureSpec(Math.max(0, size - getPaddingLeft() - getPaddingRight()), MeasureSpec.EXACTLY);
            for (int index = 0; index < getChildCount(); index++) getChildAt(index).measure(childSpec, childSpec);
            setMeasuredDimension(size, size);
        }
    }

    @Override void addBoard(LinearLayout parent, JSONObject position, boolean animate) {
        SquareBoardFrame frame = new SquareBoardFrame(this);
        frame.setPadding(dp(8), dp(8), dp(8), dp(8));
        GradientDrawable surround = shape(PANEL, 22);
        surround.setStroke(dp(1), 0xff2a3854);
        frame.setBackground(surround);
        LinearLayout.LayoutParams layout = new LinearLayout.LayoutParams(-1, -2);
        layout.setMargins(0, dp(7), 0, dp(7));
        parent.addView(frame, layout);
        board = new BoardView(this, position, me);
        frame.addView(board, new FrameLayout.LayoutParams(-1, -1));
        board.update(position, animate);
    }

    @Override void renderGame() {
        if (state == null) return;
        if (deferBoardUntilResume && !reviewing) { home(); return; }
        if (state.optInt("id") != 0) { super.renderGame(); return; }
        if (!local && !host) selectedClock = state.optInt("clockPreset", selectedClock);
        reviewing = false;
        inGame = true;
        int turn = state.optInt("turn"), winner = state.optInt("winner");
        boolean guided = isGuidedLesson();
        syncGuidedState();
        boolean lessonFinished = guided && lessonComplete();
        boolean yourTurn = winner < 0 && turn == me && !lessonFinished;
        boolean normalBot = isNormalBotGame();
        if (normalBot) syncNormalHintState();
        matchBase();
        gameScreen = true;

        String opponent = guided ? "Coach" : solo ? "Stockfish" : (peer == null || peer.isEmpty() ? "Opponent" : peer);
        String opponentDetail = guided ? (lessonFinished ? "Guided line complete" : "Planned lesson reply") : solo ? "Stockfish engine" : materialPieces(1 - me);
        playerPanel(root, opponent, opponentDetail, me == 0 ? "BLACK" : "WHITE", !yourTurn && winner < 0 && !lessonFinished, false, 1 - me);

        addBoard(root, guided ? guidedBoardState(yourTurn) : normalBot ? normalBotBoardState(yourTurn) : state, false);

        String ownTitle = winner == 2 ? "Draw" : winner >= 0 ? (winner == me ? "You" : "You") : "You";
        String ownDetail = winner >= 0 ? state.optString("note", "Game complete") : materialPieces(me);
        playerPanel(root, ownTitle, ownDetail, me == 0 ? "WHITE" : "BLACK", yourTurn, true, me);

        if (guided && winner < 0) {
            addLearningCoachCard(yourTurn, lessonFinished);
        } else {
            if (winner >= 0) outcomeCard(winner);
            else {
                if (normalBot && botError.isEmpty()) {
                    addNormalCoachStrip(yourTurn);
                } else {
                    String last = state.optString("lastMove", "").trim();
                    if (solo && !botError.isEmpty()) last = "Stockfish needs attention · Retry bot";
                    else if (last.isEmpty()) last = yourTurn ? "Your move" : "Opponent is thinking";
                    TextView latest = text(last, 12, SUBTEXT);
                    latest.setGravity(Gravity.CENTER_VERTICAL);
                    latest.setPadding(dp(4), 0, dp(4), 0);
                    latest.setSingleLine(true);
                    latest.setEllipsize(android.text.TextUtils.TruncateAt.END);
                    root.addView(latest, new LinearLayout.LayoutParams(-1, dp(scaledTextSlot(28, 12, 1))));
                }
            }
            LinearLayout rail = new LinearLayout(this);
            rail.setGravity(Gravity.CENTER_VERTICAL);
            root.addView(rail, new LinearLayout.LayoutParams(-1, dp(46)));
            if (winner >= 0) {
                compactAction(rail, "Rematch", () -> { if (local) startGame(0); else invite(0); }, true);
                compactAction(rail, "Review", () -> { reviewIndex = 1; reviewMode = 0; review(); }, false);
            } else {
                if (solo && !botError.isEmpty()) compactAction(rail, "Retry bot", this::retryBot, true);
                else if (normalBot) {
                    normalHintButton = compactAction(rail, normalHintAction(yourTurn), this::advanceNormalHint, true);
                    normalHintButton.setContentDescription("Position coach: " + normalHintAction(yourTurn));
                    refreshNormalBotHint();
                }
                else if (local && undoPly() >= 0) compactAction(rail, "Take back", this::undoChess, false);
                compactAction(rail, "Moves", this::moveList, false);
                compactAction(rail, "More", this::menu, false);
            }
        }
        if (solo && winner < 0) scheduleCoach();
    }

    boolean isGuidedLesson() {
        return local && solo && learnMode && openingLesson >= 0 && game != null && game.id == 0;
    }

    /** A normal Stockfish game has an optional coach, never a forced lesson line. */
    boolean isNormalBotGame() {
        return local && solo && !learnMode && game != null && game.id == 0 && game.winner < 0;
    }

    void syncNormalHintState() {
        if (!isNormalBotGame()) return;
        if (normalHintSeq != game.seq || !session.equals(normalHintSession)) {
            normalHintStage = 0;
            normalHintSeq = game.seq;
            normalHintSession = session;
            normalHintLoading = false;
            normalHintChangedAt = 0L;
        }
    }

    boolean hasFreshNormalCoach() {
        return isNormalBotGame() && coach != null && coachSeq == game.seq && session.equals(coachSession);
    }

    /**
     * Concept first, answer only on request.  The final stage uses the same
     * green source/arrow language as Game Review, so the board itself carries
     * the move rather than making a learner parse coordinates from a sentence.
     */
    JSONObject normalBotBoardState(boolean yourTurn) {
        if (!isNormalBotGame() || !yourTurn || normalHintStage < 2 || !hasFreshNormalCoach()) return state;
        try {
            JSONObject display = new JSONObject(state.toString());
            display.put("hintFrom", coach.move[0]);
            display.put("bestFrom", coach.move[0]);
            display.put("bestTo", coach.move[1]);
            return display;
        } catch (Exception ignored) {
            return state;
        }
    }

    String normalCoachCopy(boolean yourTurn) {
        if (!yourTurn) return "Stockfish is thinking. Your position coach will be ready on your turn.";
        boolean fresh = hasFreshNormalCoach();
        if (normalHintStage == 1 && !fresh) {
            return normalHintLoading ? "Stockfish is finding the strongest plan for this position…"
                : "The coach could not finish this hint. Try again when you are ready.";
        }
        if (!fresh || normalHintStage == 0) return "Your move. Tap Hint for a Stockfish-backed plan.";
        if (normalHintStage == 1) return ChessTutor.cue(game, coach.move);
        return ChessTutor.briefHint(game, coach.move);
    }

    String normalHintAction(boolean yourTurn) {
        if (!yourTurn) return "Waiting";
        if (normalHintStage == 1 && !hasFreshNormalCoach()) return normalHintLoading ? "Preparing" : "Retry hint";
        if (normalHintStage == 0) return "Hint";
        if (normalHintStage == 1) return "Show move";
        return "Hide hint";
    }

    void addNormalCoachStrip(boolean yourTurn) {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(12), dp(6), dp(12), dp(6));
        GradientDrawable fill = shape(PANEL_RAISED, 12);
        fill.setStroke(dp(1), ACCENT);
        card.setBackground(fill);

        // This strip is deliberately compact, but its text slots must still
        // have their real font height.  The former 16 dp header clipped at
        // the common 130–150% Android text settings.
        TextView title = compactText("POSITION COACH", 10, MINT);
        title.setTypeface(Typeface.create("sans-serif", Typeface.BOLD));
        title.setSingleLine(true);
        card.addView(title, new LinearLayout.LayoutParams(-1, -2));

        TextView copy = compactText(normalCoachCopy(yourTurn), 11, TEXT);
        copy.setMaxLines(2);
        copy.setEllipsize(android.text.TextUtils.TruncateAt.END);
        copy.setLineSpacing(0f, 1f);
        copy.setContentDescription("Position coach. " + normalCoachCopy(yourTurn));
        normalCoachCopy = copy;
        int copyHeight = Math.max(32, (int) Math.ceil(11f * userFontScale() * 2.45f));
        card.addView(copy, new LinearLayout.LayoutParams(-1, dp(copyHeight)));

        card.setMinimumHeight(dp(Math.max(60, 12 + (int) Math.ceil(10f * userFontScale() * 1.3f) + copyHeight)));
        LinearLayout.LayoutParams layout = new LinearLayout.LayoutParams(-1, -2);
        layout.setMargins(0, dp(5), 0, dp(2));
        root.addView(card, layout);
    }

    /** Progress a normal-game hint without ever changing the position or lesson state. */
    void advanceNormalHint() {
        if (!isNormalBotGame() || game.turn != me) return;
        syncNormalHintState();
        long now = android.os.SystemClock.uptimeMillis();
        if (now - normalHintChangedAt < 260L) return;
        normalHintChangedAt = now;
        if (normalHintStage >= 2) {
            normalHintStage = 0;
        } else {
            normalHintStage++;
            if (normalHintStage == 1 && !hasFreshNormalCoach()) normalHintLoading = true;
        }
        refreshNormalBotHint();
        if (normalHintStage == 1 && !hasFreshNormalCoach()) scheduleCoach();
    }

    /** Refresh the compact card in place; waiting for Stockfish must not make the screen jump. */
    void refreshNormalBotHint() {
        if (!isNormalBotGame()) return;
        syncNormalHintState();
        boolean yourTurn = game.turn == me;
        boolean fresh = hasFreshNormalCoach();
        if (fresh) normalHintLoading = false;
        String copy = normalCoachCopy(yourTurn);
        if (normalCoachCopy != null) {
            normalCoachCopy.setText(copy);
            normalCoachCopy.setContentDescription("Position coach. " + copy);
        }
        if (normalHintButton != null) {
            String label = normalHintAction(yourTurn);
            normalHintButton.setText(label);
            normalHintButton.setContentDescription("Position coach: " + label);
            boolean waitingForCoach = normalHintStage == 1 && !fresh && normalHintLoading;
            normalHintButton.setEnabled(yourTurn && !waitingForCoach);
            normalHintButton.setAlpha(yourTurn && !waitingForCoach ? 1f : .62f);
        }
        if (board != null) board.update(normalBotBoardState(yourTurn), false);
    }

    boolean lessonComplete() {
        return isGuidedLesson() && ChessTutor.next(game, openingLesson) == null;
    }

    /** A resumed lesson may only continue from an exact prefix of its authored line. */
    boolean hasValidGuidedHistory() {
        if (!isGuidedLesson() || openingLesson < 0 || openingLesson >= ChessTutor.LINES.length) return false;
        String[] authored = ChessTutor.LINES[openingLesson].split(" ");
        if (game.chessMoves.size() > authored.length || game.history.size() != game.chessMoves.size() + 1
            || game.seq != game.chessMoves.size()) return false;
        Game replay = new Game(0, 0);
        for (int ply = 0; ply < game.chessMoves.size(); ply++) {
            int[] expected = StockfishEngine.parseMove(replay, authored[ply]);
            int[] actual = game.chessMoves.get(ply);
            if (expected == null || actual == null || actual.length < 3
                || expected[0] != actual[0] || expected[1] != actual[1] || expected[2] != actual[2]
                || !replay.move(replay.turn, expected[0], expected[1], expected[2])) return false;
        }
        return true;
    }

    void syncGuidedState() {
        if (!isGuidedLesson()) return;
        if (lessonHintSeq != game.seq) {
            lessonHintSeq = game.seq;
            lessonHintStage = 0;
            lessonFeedback = "";
            lessonHintChangedAt = 0L;
        }
        if (lessonAttemptsSeq != game.seq) {
            lessonAttemptsSeq = game.seq;
            lessonAttempts = 0;
        }
    }

    @Override boolean active() {
        // A finished lesson is a deliberate stopping point, not a normal bot turn.
        return super.active() && !lessonComplete();
    }

    @Override void act(int from, int to, int choice) {
        if (isGuidedLesson() && !lessonComplete() && game.turn == me) {
            int[] expected = ChessTutor.next(game, openingLesson);
            if (expected != null && (from != expected[0] || to != expected[1] || choice != expected[2])) {
                syncGuidedState();
                lessonAttempts++;
                lessonFeedback = "Not this move yet. " + ChessTutor.cue(game, expected);
                if (board != null) board.performHapticFeedback(android.view.HapticFeedbackConstants.REJECT);
                save();
                renderGame();
                return;
            }
        }
        super.act(from, to, choice);
    }

    JSONObject guidedBoardState(boolean yourTurn) {
        if (!isGuidedLesson() || !yourTurn || lessonHintStage < 2) return state;
        try {
            int[] expected = ChessTutor.next(game, openingLesson);
            if (expected == null) return state;
            JSONObject display = new JSONObject(state.toString());
            display.put("hintFrom", expected[0]);
            if (lessonHintStage >= 3) {
                display.put("bestFrom", expected[0]);
                display.put("bestTo", expected[1]);
            }
            return display;
        } catch (Exception ignored) {
            return state;
        }
    }

    String lessonProgress() {
        if (!isGuidedLesson()) return "";
        int total = ChessTutor.lessonMoveCount(openingLesson);
        int current = Math.min(total, game.chessMoves.size() / 2 + 1);
        return "Move " + current + " of " + total;
    }

    String lessonCoachCopy(boolean yourTurn, boolean complete) {
        if (complete) return "You practised: " + ChessTutor.objective(openingLesson,me);
        if (!yourTurn) return lessonProgress() + " · " + (me==0?"Black":"White") + " is playing the planned reply.";
        int[] expected = ChessTutor.next(game, openingLesson);
        if (expected == null) return "Lesson complete.";
        if (!lessonFeedback.isEmpty()) return lessonFeedback;
        if (lessonHintStage == 1) return ChessTutor.cue(game, expected);
        if (lessonHintStage == 2) return "Start with the " + ChessTutor.pieceName(game, expected) + " on " + squareName(expected[0]) + ".";
        if (lessonHintStage >= 3) return ChessTutor.briefHint(game, expected);
        return lessonProgress() + " · Your move. " + ChessTutor.objective(openingLesson,me);
    }

    String lessonHintAction() {
        if (lessonHintStage == 0) return "Hint";
        if (lessonHintStage == 1) return "Show piece";
        if (lessonHintStage == 2) return "Show move";
        return "Hide hint";
    }

    void advanceLessonHint() {
        if (!isGuidedLesson() || lessonComplete() || game.turn != me) return;
        syncGuidedState();
        long now = android.os.SystemClock.uptimeMillis();
        // The old card is replaced synchronously, but Android may have a second
        // tap queued for it.  Keep every requested stage visible and deliberate.
        if (now - lessonHintChangedAt < 260L) return;
        lessonHintChangedAt = now;
        lessonHintStage = lessonHintStage >= 3 ? 0 : lessonHintStage + 1;
        lessonFeedback = "";
        save();
        renderGame();
    }

    void addLearningCoachCard(boolean yourTurn, boolean complete) {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(12), dp(6), dp(12), dp(6));
        GradientDrawable fill = shape(PANEL_RAISED, 12);
        fill.setStroke(dp(1), complete ? MINT : ACCENT);
        card.setBackground(fill);
        String heading = complete ? "LESSON COMPLETE · " + ChessTutor.NAMES[openingLesson]
            : "GUIDED OPENING · " + ChessTutor.NAMES[openingLesson];
        TextView title = compactText(heading, 10, complete ? MINT : ACCENT);
        title.setTypeface(Typeface.create("sans-serif", Typeface.BOLD));
        title.setSingleLine(true);
        title.setEllipsize(android.text.TextUtils.TruncateAt.END);
        card.addView(title, new LinearLayout.LayoutParams(-1, -2));
        TextView copy = compactText(lessonCoachCopy(yourTurn, complete), 11, TEXT);
        copy.setMaxLines(2);
        copy.setEllipsize(android.text.TextUtils.TruncateAt.END);
        copy.setContentDescription("Lesson guidance. " + lessonCoachCopy(yourTurn, complete));
        int coachCopyHeight = Math.max(45, (int) Math.ceil(11f * userFontScale() * 2.45f));
        card.addView(copy, new LinearLayout.LayoutParams(-1, dp(coachCopyHeight)));
        learningHint = copy;

        LinearLayout actions = new LinearLayout(this);
        actions.setGravity(Gravity.CENTER_VERTICAL);
        int coachActionHeight = scaledControlHeight(38, 11);
        card.addView(actions, new LinearLayout.LayoutParams(-1, dp(coachActionHeight)));
        if (complete) {
            coachAction(actions, "Continue", this::continueLessonWithBot, true, "Continue this position against Stockfish");
            coachAction(actions, "Review", this::reviewLesson, false, "Review the guided lesson move by move");
            coachAction(actions, "Lessons", this::showLearningHub, false, "Choose another guided lesson");
            hintButton = null;
        } else {
            if (yourTurn) {
                hintButton = coachAction(actions, lessonHintAction(), this::advanceLessonHint, true,
                    "Lesson hint stage: " + lessonHintAction());
            } else {
                hintButton = coachAction(actions, "Watching", () -> { }, false, "Black is making the planned reply");
                hintButton.setEnabled(false);
                hintButton.setAlpha(.65f);
            }
            coachAction(actions, "Moves", this::moveList, false, "Open lesson move history");
            coachAction(actions, "Lesson", this::showLessonMenu, false, "Open lesson controls");
        }
        int coachMinimum = 12 + (int) Math.ceil(10f * userFontScale() * 1.28f)
            + coachCopyHeight + coachActionHeight;
        card.setMinimumHeight(dp(Math.max(116, coachMinimum)));
        LinearLayout.LayoutParams layout = new LinearLayout.LayoutParams(-1, -2);
        layout.setMargins(0, dp(5), 0, dp(2));
        root.addView(card, layout);
    }

    Button coachAction(LinearLayout row, String label, Runnable action, boolean primary, String description) {
        Button item = primary ? button(label, action) : secondary(label, action);
        item.setTextSize(11);
        item.setSingleLine(true);
        item.setMinHeight(0);
        item.setMinimumHeight(0);
        item.setPadding(dp(4), 0, dp(4), 0);
        item.setContentDescription(description);
        LinearLayout.LayoutParams layout = new LinearLayout.LayoutParams(0, dp(scaledControlHeight(38, 11)), 1);
        if (row.getChildCount() > 0) layout.setMargins(dp(6), 0, 0, 0);
        row.addView(item, layout);
        return item;
    }

    void showLessonMenu() {
        if (!isGuidedLesson()) return;
        final int lesson = openingLesson;
        showOptionSheet("Guided lesson", ChessTutor.NAMES[lesson] + " · " + lessonProgress(),
            new String[]{"Restart lesson", "Choose another lesson", "Continue with Stockfish"},
            new Runnable[]{
                () -> confirm("Restart lesson?", "This returns to the first move of " + ChessTutor.NAMES[lesson] + ".", () -> startGuidedLesson(lesson)),
                this::showLearningHub,
                () -> confirm("Leave guided mode?", "You will keep this board and continue against Stockfish.", this::continueLessonWithBot)
            }, 0);
    }

    void continueLessonWithBot() {
        if (!isGuidedLesson()) return;
        // A scripted Black reply may already be queued.  MainActivity validates
        // this mode token before applying it, so clearing it makes that stale
        // reply a no-op and schedules a fresh Stockfish move instead.
        deferBoardUntilResume = false;
        learnMode = false;
        openingLesson = -1;
        resetGuidedState();
        coach = null;
        coachSeq = -1;
        coachRequest = "";
        botError = "";
        save();
        renderGame();
        scheduleBot();
    }

    void retryBot() {
        if (!solo || botError.isEmpty()) return;
        botError = "";
        renderGame();
        scheduleBot();
    }

    @Override boolean canAnalyzeChessGame() {
        // A completed lesson is a finite, locked line even though it is not a
        // checkmate/resignation. It deserves the same real review as a game.
        return super.canAnalyzeChessGame() || lessonComplete();
    }

    void reviewLesson() {
        reviewIndex = 1;
        reviewMode = 0;
        beginAnalysis();
        review();
    }

    void outcomeCard(int winner) {
        boolean draw = winner == 2;
        boolean won = winner == me;
        int color = draw ? 0xffa9c5ff : won ? MINT : 0xffffbc7b;
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(14), dp(7), dp(14), dp(7));
        GradientDrawable fill = shape(PANEL_RAISED, 12);
        fill.setStroke(dp(1), color);
        card.setBackground(fill);
        TextView title = compactText(draw ? "Draw" : won ? "Victory" : "Game over", 16, color);
        title.setTypeface(Typeface.create("sans-serif", Typeface.BOLD));
        card.addView(title, new LinearLayout.LayoutParams(-1, -2));
        TextView reason = compactText(state.optString("note", "Game complete"), 11, SUBTEXT);
        reason.setSingleLine(true);
        reason.setEllipsize(android.text.TextUtils.TruncateAt.END);
        card.addView(reason, new LinearLayout.LayoutParams(-1, -2));
        int outcomeMinimum = 14 + (int) Math.ceil(16f * userFontScale() * 1.28f)
            + (int) Math.ceil(11f * userFontScale() * 1.28f);
        card.setMinimumHeight(dp(Math.max(62, outcomeMinimum)));
        LinearLayout.LayoutParams layout = new LinearLayout.LayoutParams(-1, -2);
        layout.setMargins(0, dp(5), 0, dp(2));
        root.addView(card, layout);
    }

    @Override void review() {
        reviewing = true;
        int total = local || host ? game.history.size() : reviewBoards.length();
        if (total < 2) { toast("Make a move first to review it."); renderGame(); return; }
        reviewIndex = Math.max(1, Math.min(total - 1, reviewIndex));
        inGame = true;
        reviewBase(total);

        int ply = reviewIndex - 1;
        JSONArray played = local || host ? array(game.chessMoves.get(ply)) : reviewMoves.optJSONArray(reviewIndex);
        JSONArray best = local || host ? (ply < game.analysisBest.size() ? array(game.analysisBest.get(ply)) : null) : reviewBest.optJSONArray(reviewIndex);
        String report = local || host ? (ply < game.analysis.size() ? game.analysis.get(ply) : "") : analysisNotes.optString(reviewIndex);
        ChessReviewText assessment = ChessReviewText.from(report);
        boolean hasBest = best != null && best.length() >= 2 && best.optInt(0, -1) >= 0 && best.optInt(1, -1) >= 0;
        if (reviewMode == 2 && !hasBest) reviewMode = 0;
        String side = ply % 2 == 0 ? "White" : "Black";
        String move = state == null ? "Move" : state.optString("lastMove", "Move");
        if (played != null && (local || host)) {
            try { move = ChessNotation.san(ChessAnalysis.position(game, ply), played.optInt(0), played.optInt(1), played.optInt(2)); }
            catch (Exception ignored) { move = squareName(played.optInt(0)) + "–" + squareName(played.optInt(1)); }
        }

        LinearLayout summary = new LinearLayout(this);
        summary.setOrientation(LinearLayout.VERTICAL);
        summary.setPadding(dp(14), dp(7), dp(14), dp(7));
        summary.setBackground(shape(PANEL_RAISED, 12));
        TextView heading = compactText((ply / 2 + 1) + ". " + side + " · " + move, 17, TEXT);
        heading.setTypeface(Typeface.create("sans-serif", Typeface.BOLD));
        heading.setSingleLine(true);
        heading.setEllipsize(android.text.TextUtils.TruncateAt.END);
        summary.addView(heading, new LinearLayout.LayoutParams(-1, -2));
        boolean analysisAvailable = canAnalyzeChessGame();
        String pendingReview = analysisAvailable
            ? (analysisError.isEmpty() ? "Stockfish is analysing this lesson line" : analysisError)
            : "Move history · analysis completes after the game";
        TextView sub = compactText(report.isEmpty() ? pendingReview : assessment.reason, 11, SUBTEXT);
        sub.setMaxLines(2);
        sub.setEllipsize(android.text.TextUtils.TruncateAt.END);
        int reviewCopyHeight = Math.max(34, (int) Math.ceil(11f * userFontScale() * 2.45f));
        summary.addView(sub, new LinearLayout.LayoutParams(-1, dp(reviewCopyHeight)));
        int reviewMinimum = 14 + (int) Math.ceil(17f * userFontScale() * 1.28f) + reviewCopyHeight;
        summary.setMinimumHeight(dp(Math.max(78, reviewMinimum)));
        LinearLayout.LayoutParams summaryLayout = new LinearLayout.LayoutParams(-1, -2);
        summaryLayout.setMargins(0, dp(4), 0, dp(4));
        root.addView(summary, summaryLayout);

        JSONArray before = local || host ? array(game.history.get(ply)) : reviewBoards.optJSONArray(ply);
        JSONArray shown = reviewMode == 1 ? (local || host ? array(game.history.get(reviewIndex)) : reviewBoards.optJSONArray(reviewIndex)) : before;
        JSONObject position = obj("id", 0, "b", shown, "aux", new JSONArray(), "moves", new JSONArray(), "winner", 2, "turn", ply % 2);
        try {
            if (played != null && reviewMode != 2) { position.put("playedFrom", played.optInt(0, -1)); position.put("playedTo", played.optInt(1, -1)); }
            if (best != null && reviewMode != 1) { position.put("bestFrom", best.optInt(0, -1)); position.put("bestTo", best.optInt(1, -1)); }
        } catch (Exception ignored) { }
        addBoard(root, position, false);

        String legendText = reviewMode == 1 ? "Position after the move"
            : reviewMode == 2 ? "Position before the move · green shows Stockfish's line"
            : hasBest ? "Orange = played · green = Stockfish's line" : "Orange = played · Stockfish analysis is pending";
        TextView legend = compactText(legendText, 11, SUBTEXT);
        legend.setMaxLines(2);
        root.addView(legend, new LinearLayout.LayoutParams(-1, -2));

        if (!report.isEmpty()) {
            LinearLayout scores = new LinearLayout(this);
            int metricHeight = Math.max(52, 10 + (int) Math.ceil(9f * userFontScale() * 1.28f)
                + (int) Math.ceil(15f * userFontScale() * 1.28f));
            root.addView(scores, new LinearLayout.LayoutParams(-1, dp(metricHeight)));
            reviewMetric(scores, "PLAYED", assessment.playedScore);
            reviewMetric(scores, "BEST FOUND", assessment.bestScore);
        }

        LinearLayout tabs = new LinearLayout(this);
        root.addView(tabs, new LinearLayout.LayoutParams(-1, dp(scaledControlHeight(44, 12))));
        reviewTab(tabs, "Compare", 0, true);
        reviewTab(tabs, "Played", 1, true);
        reviewTab(tabs, hasBest ? "Best" : "Best later", 2, hasBest);

        LinearLayout navigation = new LinearLayout(this);
        navigation.setGravity(Gravity.CENTER_VERTICAL);
        int navigationHeight = scaledControlHeight(48, 22);
        root.addView(navigation, new LinearLayout.LayoutParams(-1, dp(navigationHeight)));
        reviewNavigate(navigation, "‹", reviewIndex > 1, () -> { reviewIndex--; review(); });
        TextView step = text(reviewIndex + " / " + (total - 1), 12, SUBTEXT);
        step.setGravity(Gravity.CENTER);
        navigation.addView(step, new LinearLayout.LayoutParams(0, dp(navigationHeight), 1));
        reviewNavigate(navigation, "›", reviewIndex < total - 1, () -> { reviewIndex++; review(); });
        if (local) { Button branch = button("Play from here", this::continueReview); branch.setTextSize(12); branch.setMinHeight(0); branch.setMinimumHeight(0); LinearLayout.LayoutParams branchLayout = new LinearLayout.LayoutParams(dp(150), dp(navigationHeight)); branchLayout.setMargins(dp(8), 0, 0, 0); navigation.addView(branch, branchLayout); }
    }

    void reviewBase(int total) {
        matchBase();
        LinearLayout top = (LinearLayout) root.getChildAt(0);
        Button back = (Button) top.getChildAt(0);
        back.setOnClickListener(view -> renderGame());
        TextView title = (TextView) top.getChildAt(1);
        title.setText("Review · " + reviewIndex + "/" + (total - 1));
        title.setTextSize(16);
        ((TextView) top.getChildAt(2)).setVisibility(View.GONE);
        Button done = (Button) top.getChildAt(3);
        done.setText("Done"); done.setSingleLine(true); done.setTextSize(11); done.setPadding(0, 0, 0, 0);
        done.setOnClickListener(view -> renderGame());
    }

    void reviewMetric(LinearLayout row, String label, String value) {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(12), dp(4), dp(12), dp(3));
        card.setBackground(shape(PANEL, 10));
        TextView caption = compactText(label, 9, SUBTEXT); caption.setTypeface(Typeface.create("sans-serif", Typeface.BOLD));
        caption.setSingleLine(true);
        card.addView(caption, new LinearLayout.LayoutParams(-1, -2));
        TextView score = compactText(value, 15, TEXT); score.setTypeface(Typeface.create("sans-serif", Typeface.BOLD));
        score.setSingleLine(true);
        card.addView(score, new LinearLayout.LayoutParams(-1, -2));
        LinearLayout.LayoutParams layout = new LinearLayout.LayoutParams(0, -1, 1);
        if (row.getChildCount() > 0) layout.setMargins(dp(8), 0, 0, 0);
        row.addView(card, layout);
    }

    void reviewTab(LinearLayout row, String label, int mode, boolean available) {
        Button tab = secondary(label, available ? () -> { reviewMode = mode; review(); } : () -> { });
        tab.setTextSize(12);
        if (mode == reviewMode) { tab.setTextColor(NIGHT); tab.setBackground(shape(ACCENT, 11)); }
        tab.setEnabled(available);
        tab.setAlpha(available ? 1f : .42f);
        tab.setMinHeight(0); tab.setMinimumHeight(0); tab.setPadding(dp(4), 0, dp(4), 0);
        LinearLayout.LayoutParams layout = new LinearLayout.LayoutParams(0, dp(scaledControlHeight(40, 12)), 1);
        if (row.getChildCount() > 0) layout.setMargins(dp(7), 0, 0, 0);
        row.addView(tab, layout);
    }

    void reviewNavigate(LinearLayout row, String label, boolean available, Runnable action) {
        Button button = secondary(label, available ? action : () -> { });
        button.setTextSize(22); button.setPadding(0, 0, 0, dp(2)); button.setEnabled(available); button.setAlpha(available ? 1f : .28f);
        button.setMinHeight(0); button.setMinimumHeight(0); button.setPadding(0, 0, 0, 0);
        row.addView(button, new LinearLayout.LayoutParams(dp(44), dp(scaledControlHeight(44, 22))));
    }

    void matchBase() {
        leaveRts();
        liveChessScore = null;
        learningHint = null;
        hintButton = null;
        normalCoachCopy = null;
        normalHintButton = null;
        getWindow().setStatusBarColor(NIGHT);
        getWindow().setNavigationBarColor(NIGHT);
        getWindow().getDecorView().setSystemUiVisibility(0);
        pageScroll = new android.widget.ScrollView(this);
        pageScroll.setFillViewport(true);
        pageScroll.setClipToPadding(false);
        pageScroll.setVerticalScrollBarEnabled(false);
        pageScroll.setLayoutDirection(View.LAYOUT_DIRECTION_LTR);
        pageScroll.setBackgroundColor(NIGHT);
        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setLayoutDirection(View.LAYOUT_DIRECTION_LTR);
        root.setBackgroundColor(NIGHT);
        root.setPadding(dp(10), dp(6), dp(10), dp(6));
        pageScroll.addView(root, new android.widget.ScrollView.LayoutParams(-1, -2));
        pageScroll.setOnApplyWindowInsetsListener((view, insets) -> {
            int left = insets.getSystemWindowInsetLeft(), top = insets.getSystemWindowInsetTop();
            int right = insets.getSystemWindowInsetRight(), bottom = insets.getSystemWindowInsetBottom();
            if (android.os.Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets safe = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                left = safe.left; top = safe.top; right = safe.right; bottom = safe.bottom;
            }
            view.setPadding(left, top, right, bottom);
            return insets;
        });
        setContentView(pageScroll);
        LinearLayout top = new LinearLayout(this);
        top.setGravity(Gravity.CENTER_VERTICAL);
        int topHeight = scaledControlHeight(44, 15);
        Button back = secondary("‹", this::home);
        back.setTextSize(26); back.setPadding(0, 0, 0, 0); back.setIncludeFontPadding(false); back.setMinHeight(0); back.setMinimumHeight(0);
        top.addView(back, new LinearLayout.LayoutParams(dp(42), dp(topHeight)));
        String modeLabel = isGuidedLesson() ? "Guided · " + ChessTutor.NAMES[openingLesson]
            : clockLabel() + "  ·  " + (solo ? "Stockfish" : local ? "on this device" : onlineMode ? "online" : "nearby");
        TextView mode = text(modeLabel, 14, TEXT);
        mode.setTypeface(Typeface.create("sans-serif", Typeface.BOLD));
        mode.setSingleLine(true);
        mode.setEllipsize(android.text.TextUtils.TruncateAt.END);
        mode.setAutoSizeTextTypeUniformWithConfiguration(10, 14, 1, android.util.TypedValue.COMPLEX_UNIT_SP);
        mode.setGravity(Gravity.CENTER);
        top.addView(mode, new LinearLayout.LayoutParams(0, dp(topHeight), 1));
        boolean botMatch = solo && state != null && state.optInt("id") == 0 && state.optInt("winner", -1) < 0 && !reviewing;
        if (botMatch) {
            TextView evaluation = compactText("", 13, MINT);
            evaluation.setTypeface(Typeface.create("monospace", Typeface.BOLD));
            evaluation.setGravity(Gravity.CENTER);
            evaluation.setSingleLine(true);
            evaluation.setEllipsize(android.text.TextUtils.TruncateAt.END);
            evaluation.setAutoSizeTextTypeUniformWithConfiguration(10, 13, 1, android.util.TypedValue.COMPLEX_UNIT_SP);
            evaluation.setBackground(choiceSurface(false, 12));
            evaluation.setContentDescription("Stockfish evaluation. Tap for details.");
            evaluation.setOnClickListener(view -> showEvaluationDetails());
            liveChessScore = evaluation;
            updateEvaluationChip();
            top.addView(evaluation, new LinearLayout.LayoutParams(dp(94), dp(scaledControlHeight(36, 13))));
        } else {
            TextView live = compactText((ready || local) ? "●" : "○", 16, (ready || local) ? MINT : 0xffffbc7b);
            live.setGravity(Gravity.CENTER);
            top.addView(live, new LinearLayout.LayoutParams(dp(32), dp(topHeight)));
        }
        Button more = secondary("•••", this::menu);
        more.setTextSize(15); more.setPadding(0, 0, 0, 0); more.setMinHeight(0); more.setMinimumHeight(0);
        top.addView(more, new LinearLayout.LayoutParams(dp(46), dp(topHeight)));
        root.addView(top, new LinearLayout.LayoutParams(-1, dp(topHeight)));
        pageScroll.requestApplyInsets();
    }

    android.graphics.drawable.Drawable choiceSurface(boolean selected, int radius) {
        GradientDrawable fill = shape(selected ? ACCENT : PANEL_RAISED, radius);
        if (!selected) fill.setStroke(dp(1), 0xff2a3854);
        return new android.graphics.drawable.RippleDrawable(
            android.content.res.ColorStateList.valueOf(selected ? 0x33ffffff : 0x227697ff), fill, null);
    }

    void updateEvaluationChip() {
        if (liveChessScore == null) return;
        boolean sameSession = coach != null && session.equals(coachSession);
        boolean fresh = sameSession && game != null && coachSeq == game.seq;
        String score = sameSession ? formatWhiteEvaluation(coach) : "—";
        // Chess apps conventionally use the score itself in a compact eval chip.
        // Keeping the numeral alone protects the complete value at large font sizes.
        liveChessScore.setText(score);
        liveChessScore.setAlpha(fresh ? 1f : score.equals("—") ? .64f : .76f);
        liveChessScore.setContentDescription(fresh
            ? "Live Stockfish evaluation. " + score + ", positive favors White. Tap for details."
            : score.equals("—") ? "Stockfish evaluation is calculating. Tap for details."
            : "Stockfish evaluation from the previous position. " + score + ". Updating. Tap for details.");
    }

    String formatWhiteEvaluation(StockfishEngine.Coach result) {
        if (result == null) return "—";
        if (result.whiteMate != null) {
            int mate = result.whiteMate;
            return mate > 0 ? "M" + mate : mate < 0 ? "−M" + Math.abs(mate) : "Mate";
        }
        return String.format(java.util.Locale.ROOT, "%+.2f", result.whiteCentipawns / 100.0);
    }

    void showEvaluationDetails() {
        boolean sameSession = coach != null && session.equals(coachSession);
        boolean fresh = sameSession && game != null && coachSeq == game.seq;
        String state = fresh ? "Live for this position · depth " + coach.depth
            : sameSession ? "Previous position shown while Stockfish updates" : "Calculating this position";
        String score = sameSession ? formatWhiteEvaluation(coach) : "—";
        new AlertDialog.Builder(this)
            .setTitle("Stockfish evaluation")
            .setMessage(score + " · " + state + "\n\nPositive scores favor White; negative scores favor Black. A value such as +3.04 is an engine estimate of White's advantage in pawns, not a win probability. Mate scores use M followed by the number of moves.")
            .setPositiveButton("Got it", null)
            .show();
    }

    /**
     * Keep a score visible for bot games, including while Stockfish is replying.
     * Searches remain on the existing one-at-a-time worker, so a bot move is never
     * raced by a second native engine process.
     */
    @Override void scheduleCoach() {
        // A score is useful only on the learner's turn.  Crucially, never put a
        // 500 ms coaching search in front of a pending scripted/engine reply.
        if (!solo || game == null || game.id != 0 || game.winner >= 0 || destroyed
            || game.turn != me || lessonComplete()) return;
        final String token = session;
        final int seq = game.seq, player = me;
        final String request = token + ":" + seq;
        if (request.equals(coachRequest)) return;
        coachRequest = request;
        final Game position = game.copy();
        Runnable queueWhenIdle = () -> {
            // A fast move while the score was waiting makes this request stale;
            // leave the engine worker clear for the bot response.
            if (destroyed || game == null || !session.equals(token) || game.seq != seq
                || game.turn != player || !request.equals(coachRequest)) return;
            worker.execute(() -> {
                if (destroyed || game == null || !session.equals(token) || game.seq != seq
                    || game.turn != player || !request.equals(coachRequest)) return;
                StockfishEngine.Coach result = null;
                try { result = getStockfish().coach(position, player); }
                catch (Exception error) { android.util.Log.w("ChessLink", "Coach unavailable", error); }
                final StockfishEngine.Coach value = result;
                handler.post(() -> {
                    if (destroyed || game == null || !session.equals(token) || game.seq != seq || game.turn != player) return;
                    coach = value;
                    coachSeq = seq;
                    coachSession = token;
                    if (gameScreen && !reviewing) {
                        updateEvaluationChip();
                        if (hintButton != null && learnMode && value != null) hintButton.setVisibility(View.VISIBLE);
                        // Free-play coaching updates only the small coach card
                        // and board markers in place. Rebuilding the game view
                        // here used to make a late engine result look like a
                        // menu jump.
                        if (isNormalBotGame() && normalHintSeq == seq && token.equals(normalHintSession)) {
                            normalHintLoading = false;
                            refreshNormalBotHint();
                        }
                    }
                    if (value == null && request.equals(coachRequest)) coachRequest = "";
                });
            });
        };
        // This short idle window lets an immediate board move reach the bot
        // worker first, while still keeping the numeric evaluation responsive.
        handler.postDelayed(queueWhenIdle, 350L);
    }

    void playerPanel(LinearLayout parent, String name, String detail, String color, boolean active, boolean self, int player) {
        LinearLayout panel = new LinearLayout(this);
        panel.setGravity(Gravity.CENTER_VERTICAL);
        panel.setPadding(dp(10), dp(6), dp(8), dp(6));
        GradientDrawable fill = shape(active ? PANEL_RAISED : PANEL, 10);
        if (active) fill.setStroke(dp(1), ACCENT);
        panel.setBackground(fill);
        LinearLayout.LayoutParams panelLayout = new LinearLayout.LayoutParams(-1, dp(scaledPlayerPanelHeight()));
        panelLayout.setMargins(0, dp(3), 0, dp(3));
        parent.addView(panel, panelLayout);

        String monogram = self ? "ME" : (solo ? "SF" : initials(name));
        TextView avatar = compactText(monogram, 10, active ? NIGHT : TEXT);
        avatar.setGravity(Gravity.CENTER);
        avatar.setTypeface(Typeface.create("sans-serif", Typeface.BOLD));
        avatar.setBackground(shape(active ? ACCENT : 0xff2b3854, 10));
        panel.addView(avatar, new LinearLayout.LayoutParams(dp(40), dp(40)));
        LinearLayout copy = new LinearLayout(this);
        copy.setOrientation(LinearLayout.VERTICAL);
        copy.setGravity(Gravity.CENTER_VERTICAL);
        copy.setMinimumWidth(0);
        copy.setPadding(dp(10), 0, dp(4), 0);
        TextView primary = compactText(name, 16, TEXT);
        primary.setTypeface(Typeface.create("sans-serif", Typeface.BOLD));
        primary.setMaxLines(1);
        primary.setEllipsize(android.text.TextUtils.TruncateAt.END);
        copy.addView(primary, new LinearLayout.LayoutParams(-1, -2));
        TextView captures = compactText(detail, 11, SUBTEXT);
        captures.setSingleLine(true);
        captures.setEllipsize(android.text.TextUtils.TruncateAt.END);
        copy.addView(captures, new LinearLayout.LayoutParams(-1, -2));
        panel.addView(copy, new LinearLayout.LayoutParams(0, -1, 1));
        TextView clock = compactText(formatClock(clockFor(player)), selectedClock == 4 ? 22 : 28, active ? TEXT : 0xffd6def1);
        clock.setTypeface(Typeface.create("monospace", Typeface.BOLD));
        clock.setSingleLine(true);
        clock.setGravity(Gravity.CENTER_VERTICAL | Gravity.RIGHT);
        clock.setContentDescription(selectedClock == 4 ? "Untimed" : "Clock " + formatClock(clockFor(player)));
        clockViews[player] = clock;
        panel.addView(clock, new LinearLayout.LayoutParams(dp(92), -1));
    }

    /** Compact rows must never inherit the generous body-copy padding from text(). */
    TextView rowText(String value, int size, int color) {
        TextView label = text(value, size, color);
        label.setPadding(0, 0, 0, 0);
        label.setIncludeFontPadding(true);
        label.setGravity(Gravity.CENTER_VERTICAL);
        return label;
    }

    /** Text for a deliberately compact, fixed-height visual slot. */
    TextView compactText(String value, int size, int color) {
        TextView label = text(value, size, color);
        label.setPadding(0, 0, 0, 0);
        label.setIncludeFontPadding(false);
        label.setGravity(Gravity.CENTER_VERTICAL);
        return label;
    }

    float userFontScale() {
        return Math.max(1f, getResources().getConfiguration().fontScale);
    }

    /**
     * Button labels have a real line height in addition to their touch target.
     * This gives accessibility text room to grow instead of silently shaving
     * pixels off its descenders inside a fixed 42–48 dp row.
     */
    int scaledControlHeight(int base, int textSp) {
        int needed = (int) Math.ceil(18f + textSp * userFontScale() * 1.28f);
        return Math.max(base, needed);
    }

    /** A fixed visual text slot, without any button padding or touch target. */
    int scaledTextSlot(int base, int textSp, int lines) {
        int needed = (int) Math.ceil(textSp * userFontScale() * 1.28f * Math.max(1, lines));
        return Math.max(base, needed);
    }

    /** The large clock is the limiting item in a player card. */
    int scaledPlayerPanelHeight() {
        int needed = (int) Math.ceil(12f + 28f * userFontScale() * 1.28f);
        return Math.max(64, needed);
    }

    String initials(String name) {
        String cleaned = name == null ? "OP" : name.trim();
        if (cleaned.isEmpty()) return "OP";
        String[] words = cleaned.split("\\s+");
        String first = words[0].substring(0, 1).toUpperCase(java.util.Locale.ROOT);
        String second = words.length > 1 ? words[1].substring(0, 1).toUpperCase(java.util.Locale.ROOT) : "";
        return first + second;
    }

    String materialSummary(int capturedBy) {
        JSONArray squares = state == null ? null : state.optJSONArray("b");
        if (squares == null) return "No captures";
        int victim = capturedBy == 0 ? -1 : 1;
        int pieces = 0;
        for (int index = 0; index < 64; index++) if (squares.optInt(index) * victim > 0 && Math.abs(squares.optInt(index)) != 6) pieces++;
        int missing = 15 - pieces;
        return missing <= 0 ? "No captures" : missing + (missing == 1 ? " capture" : " captures");
    }

    String materialPieces(int capturedBy) {
        JSONArray squares = state == null ? null : state.optJSONArray("b");
        if (squares == null) return "No captures";
        int victim = capturedBy == 0 ? -1 : 1;
        int[] expected = {0, 8, 2, 2, 2, 1};
        int[] present = new int[6];
        for (int index = 0; index < 64; index++) { int piece = squares.optInt(index); if (piece * victim > 0 && Math.abs(piece) < 6) present[Math.abs(piece)]++; }
        String[] white = {"", "♙", "♘", "♗", "♖", "♕"};
        String[] black = {"", "♟", "♞", "♝", "♜", "♛"};
        StringBuilder pieces = new StringBuilder(); int value = 0;
        for (int type = 1; type < 6; type++) for (int missing = present[type]; missing < expected[type]; missing++) { pieces.append(victim > 0 ? white[type] : black[type]); value += type == 5 ? 9 : type == 4 ? 5 : type == 2 || type == 3 ? 3 : 1; }
        return pieces.length() == 0 ? "No captures" : "Material +" + value;
    }

    String clockLabel() { return clockLabel(selectedClock); }

    String clockLabel(int preset) { return CLOCK_LABELS[Math.max(0, Math.min(preset, CLOCK_LABELS.length - 1))]; }

    void configureClocks() {
        long initial = CLOCK_MINUTES[selectedClock] * 60_000L;
        clocks[0] = clocks[1] = initial;
        clockTurn = game == null ? -1 : game.turn;
        clockSeq = game == null ? -1 : game.seq;
        clockAnchor = android.os.SystemClock.elapsedRealtime();
        clocksRunning = initial > 0 && game != null && game.winner < 0;
        handler.removeCallbacks(clockLoop);
        if (clocksRunning) handler.postDelayed(clockLoop, 250);
    }

    @Override void applyLatencyCompensation(long clientTime) {
        if (clientTime > 0 && clocksRunning && clockTurn == 1 - me) {
            long now = android.os.SystemClock.elapsedRealtime();
            long transit = Math.max(0, Math.min(1000L, now - clientTime));
            clocks[1 - me] += transit;
        }
    }

    void advanceClock() {
        if (!clocksRunning || clockTurn < 0 || clockTurn > 1) return;
        long now = android.os.SystemClock.elapsedRealtime();
        long elapsed = Math.max(0, now - clockAnchor);
        clockAnchor = now;
        clocks[clockTurn] = Math.max(0, clocks[clockTurn] - elapsed);
    }

    long clockFor(int player) {
        if (!local && !host && state != null) return state.optLong("clock" + player, 0);
        advanceClock();
        return clocks[player];
    }

    String formatClock(long millis) {
        if (selectedClock == 4) return "∞";
        long seconds = Math.max(0, millis + 999) / 1000;
        return String.format(java.util.Locale.ROOT, "%02d:%02d", seconds / 60, seconds % 60);
    }

    void tickClocks() {
        if (!clocksRunning || game == null || game.id != 0 || game.winner >= 0) return;
        advanceClock();
        if (clocks[clockTurn] <= 0) {
            game.winner = 1 - clockTurn;
            game.note = "Time out";
            game.seq++;
            clocksRunning = false;
            showSnapshot();
            return;
        }
        updateClockViews();
        if (local || host) sendSnapshot();
        handler.postDelayed(clockLoop, 250);
    }

    void updateClockViews() {
        for (int player = 0; player < 2; player++) if (clockViews[player] != null) clockViews[player].setText(formatClock(clockFor(player)));
    }

    String outcomeText(int winner) {
        if (winner == 2) return "Draw · " + state.optString("note", "Game complete");
        return winner == me ? "You won · " + state.optString("note", "Game complete") : "You lost · " + state.optString("note", "Game complete");
    }

    @Override JSONObject snapshot(int player) {
        JSONObject snap = super.snapshot(player);
        if (game != null && game.id == 0) {
            advanceClock();
            try {
                snap.put("clock0", clocks[0]);
                snap.put("clock1", clocks[1]);
                snap.put("clockPreset", selectedClock);
                snap.put("clockPaused", !clocksRunning);
            } catch (Exception ignored) { }
        }
        return snap;
    }

    @Override void showSnapshot() {
        if (game != null && game.id == 0 && clocksRunning && clockSeq >= 0 && game.seq != clockSeq) {
            advanceClock();
            if (game.winner < 0 && game.turn != clockTurn) clocks[clockTurn] += CLOCK_INCREMENT[selectedClock] * 1000L;
            clockTurn = game.turn;
            clockSeq = game.seq;
            clockAnchor = android.os.SystemClock.elapsedRealtime();
        }
        super.showSnapshot();
        updateClockViews();
    }

    @Override void startGame(int id) {
        deferBoardUntilResume = false;
        super.startGame(id);
        if (id == 0 && game != null && (local || host)) {
            configureClocks();
            showSnapshot();
        }
    }

    @Override void save() {
        super.save();
        getSharedPreferences("chesslink-clock", 0).edit()
            .putLong("clock0", clocks[0]).putLong("clock1", clocks[1]).putLong("anchor", clockAnchor)
            .putInt("preset", selectedClock).putInt("turn", clockTurn).putInt("seq", clockSeq)
            .putBoolean("running", clocksRunning).apply();
        boolean guided = isGuidedLesson();
        getSharedPreferences("chesslink-training", 0).edit()
            .putString("session", guided ? session : "")
            .putInt("lesson", guided ? openingLesson : -1)
            .putInt("hintStage", guided ? lessonHintStage : 0)
            .putInt("hintSeq", guided ? lessonHintSeq : -1)
            .putInt("attempts", guided ? lessonAttempts : 0)
            .putInt("attemptSeq", guided ? lessonAttemptsSeq : -1)
            .putString("feedback", guided ? lessonFeedback : "")
            .apply();
    }

    @Override void restore() {
        super.restore();
        android.content.SharedPreferences saved = getSharedPreferences("chesslink-clock", 0);
        selectedClock = saved.getInt("preset", 0);
        clocks[0] = saved.getLong("clock0", 0); clocks[1] = saved.getLong("clock1", 0);
        clockTurn = saved.getInt("turn", -1); clockSeq = saved.getInt("seq", -1);
        if (game != null && game.id == 0 && game.winner < 0 && clocks[0] == 0 && clocks[1] == 0 && selectedClock != 4) {
            clocks[0] = clocks[1] = CLOCK_MINUTES[selectedClock] * 60_000L;
            clockTurn = game.turn; clockSeq = game.seq;
        }
        clocksRunning = false; // A resumed game is paused until the owner returns to it.
        clockAnchor = android.os.SystemClock.elapsedRealtime();
        android.content.SharedPreferences training = getSharedPreferences("chesslink-training", 0);
        boolean restoredGuided = isGuidedLesson();
        boolean trainingMatches = restoredGuided && session.equals(training.getString("session", ""))
            && openingLesson == training.getInt("lesson", -1);
        if (trainingMatches && hasValidGuidedHistory()) {
            lessonHintStage = Math.max(0, Math.min(3, training.getInt("hintStage", 0)));
            lessonHintSeq = training.getInt("hintSeq", -1);
            lessonAttempts = Math.max(0, training.getInt("attempts", 0));
            lessonAttemptsSeq = training.getInt("attemptSeq", -1);
            lessonFeedback = training.getString("feedback", "");
            // A saved hint may only describe the board position it was created for.
            if (lessonHintSeq != game.seq) { lessonHintStage = 0; lessonFeedback = ""; lessonHintSeq = game.seq; }
            if (lessonAttemptsSeq != game.seq) { lessonAttempts = 0; lessonAttemptsSeq = game.seq; }
        } else {
            // Never strand someone in an unwinnable forced line after a stale
            // or malformed save.  Preserve the board as ordinary free play.
            if (restoredGuided) {
                learnMode = false;
                openingLesson = -1;
                toast("Saved lesson could not be verified. Continuing as a normal Stockfish game.");
                save();
            }
            resetGuidedState();
        }
    }

    @Override protected void onPause() {
        advanceClock();
        clocksRunning = false;
        handler.removeCallbacks(clockLoop);
        if (game != null && game.id == 0) { save(); sendSnapshot(); }
        super.onPause();
    }

    @Override protected void onResume() {
        super.onResume();
        if ((local || host) && game != null && game.id == 0 && game.winner < 0 && selectedClock != 4) {
            clockTurn = game.turn; clockSeq = game.seq; clockAnchor = android.os.SystemClock.elapsedRealtime(); clocksRunning = true;
            handler.removeCallbacks(clockLoop); handler.postDelayed(clockLoop, 250); showSnapshot();
        }
    }

    void moveList() {
        boolean hasMoves = game != null && !game.chessMoves.isEmpty();
        boolean canReview = local || host ? game != null && game.history.size() >= 2 : reviewBoards.length() >= 2;
        StringBuilder list = new StringBuilder();
        if (hasMoves) {
            for (int ply = 0; ply < game.chessMoves.size(); ply++) {
                if (ply % 2 == 0) list.append(ply / 2 + 1).append(". ");
                int[] move = game.chessMoves.get(ply);
                try { list.append(ChessNotation.san(ChessAnalysis.position(game, ply), move[0], move[1], move[2])); }
                catch (Exception ignored) { list.append(squareName(move[0])).append("-").append(squareName(move[1])); }
                list.append(ply % 2 == 1 ? "\n" : "   ");
            }
        } else {
            String latest = state == null ? "" : state.optString("lastMove", "").trim();
            list.append(latest.isEmpty() ? "No moves yet." : latest).append("\n\nMove history is syncing with this match.");
        }
        boolean complete = state != null && state.optInt("winner", -1) >= 0;
        Dialog dialog = setupDialog("Move history", complete ? "Review every decision with Stockfish." : canReview ? "Your game is still in progress. Analysis follows the match." : "The first position is being saved. Keep playing to unlock review.");
        LinearLayout body = (LinearLayout) dialog.findViewById(991);
        android.widget.ScrollView scroll = new android.widget.ScrollView(this);
        scroll.setFillViewport(true);
        GradientDrawable recordFill = shape(PANEL_RAISED, 12);
        recordFill.setStroke(dp(1), 0xff2a3854);
        scroll.setBackground(recordFill);
        TextView record = text(list.toString().trim(), 15, TEXT);
        record.setTypeface(Typeface.create("monospace", Typeface.NORMAL));
        record.setLineSpacing(dp(5), 1f);
        record.setPadding(dp(14), dp(11), dp(14), dp(11));
        scroll.addView(record);
        LinearLayout.LayoutParams recordLayout = new LinearLayout.LayoutParams(-1, dp(138));
        recordLayout.setMargins(0, dp(8), 0, dp(8));
        body.addView(scroll, recordLayout);
        Button reviewButton = canReview ? button("Open review", () -> {
            dialog.dismiss();
            reviewIndex = Math.max(1, (local || host ? game.history.size() : reviewBoards.length()) - 1);
            review();
        }) : secondary("Review unlocks after a move", () -> { });
        reviewButton.setEnabled(canReview);
        reviewButton.setAlpha(canReview ? 1f : .55f);
        body.addView(reviewButton, new LinearLayout.LayoutParams(-1, dp(scaledControlHeight(52, 15))));
        Button close = secondary("Close", dialog::dismiss);
        close.setTextSize(13);
        body.addView(close, new LinearLayout.LayoutParams(-1, dp(scaledControlHeight(42, 13))));
        dialog.show();
    }

    String squareName(int square) { return "" + (char) ('a' + square % 8) + (8 - square / 8); }

    Button compactAction(LinearLayout row, String label, Runnable action, boolean primary) {
        Button item = primary ? button(label, action) : secondary(label, action);
        item.setTextSize(13);
        item.setSingleLine(true);
        item.setAutoSizeTextTypeUniformWithConfiguration(9, 13, 1, android.util.TypedValue.COMPLEX_UNIT_SP);
        item.setMinHeight(0);
        item.setMinimumHeight(0);
        item.setPadding(dp(6), 0, dp(6), 0);
        LinearLayout.LayoutParams layout = new LinearLayout.LayoutParams(0, dp(scaledControlHeight(46, 13)), 1);
        if (row.getChildCount() > 0) layout.setMargins(dp(8), 0, 0, 0);
        row.addView(item, layout);
        return item;
    }

    void chooseBot(boolean learn) {
        // Preserve the contract even if an older entry point still asks for "learn".
        if (learn) { showLearningHub(); return; }
        showBotSetup(false);
    }

    void showBotSetup(boolean savedGameAlreadyConfirmed) {
        // Guided learning always starts from a named lesson. This sheet is free play only.
        Dialog dialog = setupDialog("New game", "Play Stockfish on your terms.");
        LinearLayout body = (LinearLayout) dialog.findViewById(991);
        final SetupChoice selection = new SetupChoice(selectedClock, botLevel);
        final Button[] play = new Button[1];
        addClockChoices(body, selection, () -> { if (play[0] != null) play[0].setText("Play " + clockLabel(selection.clock)); });
        TextView strength = text("OPPONENT", 10, SUBTEXT); strength.setTypeface(Typeface.DEFAULT_BOLD); body.addView(strength);
        LinearLayout levels = new LinearLayout(this); levels.setGravity(Gravity.CENTER_VERTICAL); levels.setLayoutDirection(View.LAYOUT_DIRECTION_LTR); body.addView(levels, new LinearLayout.LayoutParams(-1, dp(52)));
        final ArrayList<Button> levelChips = new ArrayList<>();
        for (int i = 0; i < 3; i++) {
            final int pick = i;
            String label = i == 0 ? "Easy" : i == 1 ? "Medium" : "Hard";
            Button chip = setupChip(label, () -> {
                selection.level = pick;
                refreshChoiceRow(levelChips, selection.level);
                chipHaptic(levelChips.get(pick));
            });
            chip.setContentDescription(label + " Stockfish strength");
            levelChips.add(chip);
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, dp(48), 1);
            if (i > 0) lp.setMargins(dp(6), 0, 0, 0);
            levels.addView(chip, lp);
        }
        refreshChoiceRow(levelChips, selection.level);
        body.addView(text("Clocks pause while the app is not active.", 12, SUBTEXT));
        play[0] = button("Play " + clockLabel(selection.clock), () -> {
            dialog.dismiss();
            startBotGame(selection.clock, selection.level, savedGameAlreadyConfirmed);
        });
        LinearLayout.LayoutParams playLp = new LinearLayout.LayoutParams(-1, dp(scaledControlHeight(54, 15))); playLp.setMargins(0, dp(14), 0, 0); body.addView(play[0], playLp);
        dialog.show();
    }

    void showPassSetup() {
        Dialog dialog = setupDialog("Pass & play", "Two players. One device. Hand over after every move.");
        LinearLayout body = (LinearLayout) dialog.findViewById(991);
        final SetupChoice selection = new SetupChoice(selectedClock, botLevel);
        final Button[] play = new Button[1];
        addClockChoices(body, selection, () -> { if (play[0] != null) play[0].setText("Start " + clockLabel(selection.clock)); });
        play[0] = button("Start " + clockLabel(selection.clock), () -> {
            dialog.dismiss();
            startPassGame(selection.clock);
        });
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, dp(scaledControlHeight(54, 15))); lp.setMargins(0, dp(14), 0, 0); body.addView(play[0], lp);
        dialog.show();
    }

    void showRemoteSetup() {
        Dialog dialog = setupDialog(onlineMode ? "Online game" : "Nearby game", "Choose the clock before inviting your friend.");
        LinearLayout body = (LinearLayout) dialog.findViewById(991);
        final SetupChoice selection = new SetupChoice(selectedClock, botLevel);
        final Button[] play = new Button[1];
        addClockChoices(body, selection, () -> { if (play[0] != null) play[0].setText("Invite · " + clockLabel(selection.clock)); });
        play[0] = button("Invite · " + clockLabel(selection.clock), () -> {
            selectedClock = selection.clock;
            dialog.dismiss();
            invite(0);
        });
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, dp(scaledControlHeight(54, 15))); lp.setMargins(0, dp(14), 0, 0); body.addView(play[0], lp);
        dialog.show();
    }

    void addClockChoices(LinearLayout body, SetupChoice selection, Runnable onChanged) {
        TextView preset = text("TIME CONTROL", 10, SUBTEXT); preset.setTypeface(Typeface.DEFAULT_BOLD); body.addView(preset);
        LinearLayout times = new LinearLayout(this); times.setGravity(Gravity.CENTER_VERTICAL); times.setLayoutDirection(View.LAYOUT_DIRECTION_LTR); body.addView(times, new LinearLayout.LayoutParams(-1, dp(52)));
        final ArrayList<Button> timeChips = new ArrayList<>();
        String[] compact = {"10|0", "5|0", "3|2", "1|0", "∞"};
        for (int i = 0; i < CLOCK_LABELS.length; i++) {
            final int pick = i;
            Button chip = setupChip(compact[i], () -> {
                selection.clock = pick;
                refreshChoiceRow(timeChips, selection.clock);
                chipHaptic(timeChips.get(pick));
                onChanged.run();
            });
            chip.setTextSize(i == 4 ? 16 : 11);
            chip.setContentDescription(CLOCK_LABELS[i] + " time control");
            timeChips.add(chip);
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, dp(48), 1);
            if (i > 0) lp.setMargins(dp(5), 0, 0, 0);
            times.addView(chip, lp);
        }
        refreshChoiceRow(timeChips, selection.clock);
    }

    Button setupChip(String label, Runnable action) {
        Button chip = secondary(label, action);
        chip.setTextSize(12);
        chip.setMinWidth(0);
        chip.setMinHeight(0);
        chip.setMinimumWidth(0);
        chip.setMinimumHeight(0);
        chip.setPadding(dp(2), 0, dp(2), 0);
        chip.setGravity(Gravity.CENTER);
        chip.setSingleLine(true);
        chip.setLayoutDirection(View.LAYOUT_DIRECTION_LTR);
        chip.setTextDirection(View.TEXT_DIRECTION_LTR);
        return chip;
    }

    void refreshChoiceRow(ArrayList<Button> chips, int selected) {
        for (int index = 0; index < chips.size(); index++) {
            Button chip = chips.get(index);
            boolean chosen = index == selected;
            chip.setTextColor(chosen ? NIGHT : TEXT);
            chip.setBackground(choiceSurface(chosen, 12));
            chip.setSelected(chosen);
        }
    }

    void chipHaptic(View chip) {
        chip.performHapticFeedback(android.view.HapticFeedbackConstants.KEYBOARD_TAP);
    }

    Dialog setupDialog(String title, String subtitle) {
        Dialog dialog = new Dialog(this);
        /*
         * A Dialog normally starts at its theme's wrap-content centre position.
         * Moving it to the bottom and widening it from an OnShowListener makes
         * the first frame visibly slide or resize on some Android builds. Give
         * the window its final geometry before it is attached instead. The
         * setup chips below only repaint themselves, so their choices stay in
         * this same stable sheet rather than recreating it.
         */
        Window window = dialog.getWindow();
        if (window != null) {
            window.setBackgroundDrawable(new android.graphics.drawable.ColorDrawable(Color.TRANSPARENT));
            android.view.WindowManager.LayoutParams attributes = window.getAttributes();
            attributes.width = android.view.WindowManager.LayoutParams.MATCH_PARENT;
            attributes.height = android.view.WindowManager.LayoutParams.WRAP_CONTENT;
            attributes.gravity = Gravity.BOTTOM;
            attributes.dimAmount = .58f;
            // The sheet already has final geometry; suppress the theme's
            // default lateral/resize entrance transition.
            attributes.windowAnimations = 0;
            window.setAttributes(attributes);
            window.setWindowAnimations(0);
            window.setSoftInputMode(android.view.WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        }
        // The whole sheet is allowed to scroll when Android text is enlarged.
        // Its header and body use natural heights, replacing character-count
        // estimates that cut descenders or the last subtitle line.
        StableSheetScrollView overflow = new StableSheetScrollView(this);
        overflow.setId(992);
        overflow.setFillViewport(false);
        overflow.setClipToPadding(false);
        overflow.setVerticalScrollBarEnabled(false);
        overflow.setLayoutDirection(View.LAYOUT_DIRECTION_LTR);
        LinearLayout sheet = new LinearLayout(this); sheet.setId(991); sheet.setOrientation(LinearLayout.VERTICAL); sheet.setLayoutDirection(View.LAYOUT_DIRECTION_LTR); sheet.setPadding(dp(22), dp(18), dp(22), dp(22));
        GradientDrawable background = shape(PANEL, 24); background.setStroke(dp(1), 0xff334461); sheet.setBackground(background);
        TextView heading = compactText(title, 22, TEXT);
        heading.setTypeface(Typeface.create("sans-serif", Typeface.BOLD));
        heading.setMaxLines(2);
        LinearLayout.LayoutParams headingLayout = new LinearLayout.LayoutParams(-1, -2);
        headingLayout.setMargins(0, 0, 0, dp(3));
        sheet.addView(heading, headingLayout);
        TextView copy = compactText(subtitle, 13, SUBTEXT);
        copy.setMaxLines(3);
        LinearLayout.LayoutParams copyLayout = new LinearLayout.LayoutParams(-1, -2);
        copyLayout.setMargins(0, 0, 0, dp(2));
        sheet.addView(copy, copyLayout);
        overflow.addView(sheet, new android.widget.ScrollView.LayoutParams(-1, -2));
        dialog.setContentView(overflow);
        return dialog;
    }

    void startLocal(boolean againstBot, boolean learn, int level) {
        replaceSavedChessGame(againstBot ? "a new Stockfish game" : "a pass-and-play game",
            () -> startLocalConfirmed(againstBot, learn, level));
    }

    /** Do not commit a setup-sheet choice until any saved-game confirmation wins. */
    void startBotGame(int clock, int level, boolean savedGameAlreadyConfirmed) {
        Runnable start = () -> {
            selectedClock = clock;
            botLevel = level;
            startLocalConfirmed(true, false, level);
        };
        if (savedGameAlreadyConfirmed) start.run();
        else replaceSavedChessGame("a new Stockfish game", start);
    }

    void startPassGame(int clock) {
        replaceSavedChessGame("a pass-and-play game", () -> {
            selectedClock = clock;
            startLocalConfirmed(false, false, 1);
        });
    }

    /** Native authority for the clock selected by the HTML room setup sheet. */
    void setClockPreset(int clock) {
        selectedClock = Math.max(0, Math.min(CLOCK_LABELS.length - 1, clock));
    }

    void startLocalConfirmed(boolean againstBot, boolean learn, int level) {
        deferBoardUntilResume = false;
        useBluetooth();
        link.close();
        ready = false;
        host = false;
        awaiting = false;
        game = null;
        state = null;
        session = "";
        savedPeer = "";
        local = true;
        solo = againstBot;
        botLevel = level;
        learnMode = learn;
        openingLesson = -1;
        resetGuidedState();
        save();
        startGame(0);
    }

    @Override void offline(boolean bots) {
        if (bots) chooseBot(false); else startLocal(false, false, 1);
    }

    @Override void catalog() {
        home();
    }

    @Override void startFromLibrary(int id) {
        if (local) startGame(0); else if (ready) invite(0);
    }

    void startBluetooth(boolean hosting) {
        replaceSavedChessGame("a nearby game", () -> startBluetoothConfirmed(hosting));
    }

    /**
     * A confirmed transport switch must clear both sides of a persisted remote
     * match.  In particular, a guest only has {@code state}, not {@code game};
     * leaving its session or saved peer behind makes MainActivity.prepare()
     * treat the next host/join attempt as a forbidden resume.
     */
    void clearRemoteMatchForReplacement() {
        link.close();
        ready = false;
        host = false;
        awaiting = false;
        pendingGame = -1;
        game = null;
        state = null;
        local = solo = false;
        session = "";
        savedPeer = "";
        peer = "";
        peerAddress = "";
        save();
    }

    void startBluetoothConfirmed(boolean hosting) {
        deferBoardUntilResume = false;
        useBluetooth();
        clearRemoteMatchForReplacement();
        prepare(hosting);
    }

    void useBluetooth() {
        if (onlineMode) {
            link.close();
            link = new BluetoothLink(adapter, this);
            onlineMode = false;
        }
    }

    void useOnline() {
        if (!onlineMode) {
            link.close();
            link = new PeerLink(this, this);
            onlineMode = true;
        }
    }

    void onlineRoom() {
        showOptionSheet("Play online", "Create a private room code for a friend, or join one they shared. Internet is required.",
            new String[]{"Create private room", "Join a room"},
            new Runnable[]{() -> askForRoom(true), () -> askForRoom(false)}, 0);
    }

    void askForRoom(boolean hosting) {
        Dialog dialog = setupDialog(hosting ? "Create online room" : "Join online room", hosting ? "Share this code with your friend." : "Ask your friend for their room code.");
        LinearLayout body = (LinearLayout) dialog.findViewById(991);
        TextView label = text("ROOM CODE", 10, SUBTEXT);
        label.setTypeface(Typeface.create("sans-serif", Typeface.BOLD));
        LinearLayout.LayoutParams labelLayout = new LinearLayout.LayoutParams(-1, -2);
        labelLayout.setMargins(0, dp(8), 0, 0);
        body.addView(label, labelLayout);
        android.widget.EditText input = new android.widget.EditText(this);
        input.setSingleLine(true);
        input.setAllCaps(true);
        input.setHint("Room code");
        input.setHintTextColor(SUBTEXT);
        input.setTextColor(TEXT);
        input.setTextSize(20);
        input.setLetterSpacing(.12f);
        input.setTypeface(Typeface.create("monospace", Typeface.BOLD));
        input.setPadding(dp(14), 0, dp(14), 0);
        GradientDrawable field = shape(PANEL_RAISED, 12);
        field.setStroke(dp(1), 0xff40557a);
        input.setBackground(field);
        input.setFilters(new android.text.InputFilter[]{new android.text.InputFilter.LengthFilter(8)});
        if (hosting) input.setText(randomRoomCode());
        body.addView(input, new LinearLayout.LayoutParams(-1, dp(54)));
        Button submit = button(hosting ? "Create room" : "Join room", () -> {
            String code = input.getText().toString().trim().toUpperCase(java.util.Locale.ROOT).replaceAll("[^A-Z0-9]", "");
            if (code.length() < 4) { input.setError("Use at least four letters or numbers"); return; }
            dialog.dismiss();
            beginOnline(hosting, code);
        });
        LinearLayout.LayoutParams submitLayout = new LinearLayout.LayoutParams(-1, dp(scaledControlHeight(54, 15)));
        submitLayout.setMargins(0, dp(14), 0, 0);
        body.addView(submit, submitLayout);
        Button cancel = secondary("Cancel", dialog::dismiss);
        cancel.setTextSize(13);
        body.addView(cancel, new LinearLayout.LayoutParams(-1, dp(scaledControlHeight(44, 13))));
        dialog.show();
    }

    String randomRoomCode() {
        final String alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        java.security.SecureRandom random = new java.security.SecureRandom();
        StringBuilder code = new StringBuilder();
        for (int i = 0; i < 6; i++) code.append(alphabet.charAt(random.nextInt(alphabet.length())));
        return code.toString();
    }

    void beginOnline(boolean hosting, String code) {
        replaceSavedChessGame("this online room", () -> beginOnlineConfirmed(hosting, code));
    }

    void beginOnlineConfirmed(boolean hosting, String code) {
        deferBoardUntilResume = false;
        useOnline();
        game = null;
        state = null;
        local = solo = false;
        host = hosting;
        ready = false;
        session = "";
        savedPeer = "peerjs:" + code;
        peer = "Online room " + code;
        status = hosting ? "Creating online room " + code + "…" : "Joining online room " + code + "…";
        if (hosting) ((PeerLink) link).hostRoom(code); else ((PeerLink) link).joinRoom(code, "Guest");
        home();
    }

    @Override public void connected(String name, String address) {
        if (!onlineMode) { super.connected(name, address); return; }
        runOnUiThread(() -> {
            peer = name == null || name.trim().isEmpty() ? "Online friend" : name;
            peerAddress = address;
            status = "Online connected • checking game version";
            if (connection != null) connection.setText(status);
            send(obj("type", "hello", "version", protocolVersion()));
        });
    }

    @Override public void message(JSONObject message) {
        // The host's first authoritative state supersedes the guest's invitation sheet.
        // Without this, Android can leave the accepted invitation visually above the board.
        if ("state".equals(message.optString("type")) && invitationDialog != null) {
            runOnUiThread(() -> { if (invitationDialog != null && invitationDialog.isShowing()) invitationDialog.dismiss(); });
        }
        super.message(message);
    }

    @Override void menu() {
        ArrayList<String> names = new ArrayList<>();
        ArrayList<Runnable> actions = new ArrayList<>();
        if (inGame && state != null) {
            if (isGuidedLesson()) {
                names.add("Guided lesson controls");
                actions.add(this::showLessonMenu);
            }
            // Keep free-play coaching controls usable on 360 dp phones.  The
            // main rail intentionally has only Hint, Moves and More; a fourth
            // full-size text button would wrap or crop.  Takeback remains one
            // deliberate tap away here.
            if (isNormalBotGame() && undoPly() >= 0) {
                names.add("Take back move");
                actions.add(this::undoChess);
            }
            names.add("Chess rules");
            actions.add(() -> rules(0, 0));
            // The lesson recap is a locked learning checkpoint.  Resigning
            // there would bypass Continue / Review / Lessons and discard it.
            if (state.optInt("winner") == -1 && (local || ready) && !isGuidedLesson()) {
                names.add("Resign game");
                actions.add(() -> confirm("Resign game?", "Your opponent wins.", () -> {
                    if (local || host) { game.winner = 1 - me; game.seq++; game.note = "Resigned"; showSnapshot(); }
                    else send(obj("type", "resign", "session", session));
                }));
            }
        }
        if (game != null || state != null) {
            names.add("Clear saved game");
            actions.add(() -> confirm("Clear saved game?", "This removes the local saved game and disconnects.", () -> {
                link.close(); ready = false; game = null; state = null; local = solo = false; session = savedPeer = ""; save(); home();
            }));
        }
        if (ready) { names.add("Disconnect Bluetooth"); actions.add(() -> { link.close(); ready = false; home(); }); }
        names.add("Stockfish engine & license"); actions.add(this::engineAbout);
        names.add("Bluetooth setup"); actions.add(() -> pairSettings());
        showOptionSheet("Game menu", "Private controls for this device and match.",
            names.toArray(new String[0]), actions.toArray(new Runnable[0]), -1);
    }

    /** Keeps secondary flows in the same dark, touch-friendly language as the match screens. */
    void showOptionSheet(String title, String subtitle, String[] labels, Runnable[] actions, int primaryIndex) {
        Dialog dialog = setupDialog(title, subtitle);
        LinearLayout body = (LinearLayout) dialog.findViewById(991);
        for (int index = 0; index < labels.length; index++) {
            final int chosen = index;
            Button option = index == primaryIndex ? button(labels[index], () -> { dialog.dismiss(); actions[chosen].run(); })
                : secondary(labels[index], () -> { dialog.dismiss(); actions[chosen].run(); });
            option.setTextSize(14);
            LinearLayout.LayoutParams layout = new LinearLayout.LayoutParams(-1, dp(scaledControlHeight(48, 14)));
            layout.setMargins(0, dp(5), 0, 0);
            body.addView(option, layout);
        }
        Button cancel = secondary("Not now", dialog::dismiss);
        cancel.setTextSize(13);
        LinearLayout.LayoutParams cancelLayout = new LinearLayout.LayoutParams(-1, dp(scaledControlHeight(42, 13)));
        cancelLayout.setMargins(0, dp(8), 0, 0);
        body.addView(cancel, cancelLayout);
        dialog.show();
    }

    @Override void confirm(String title, String message, Runnable yes) {
        Dialog dialog = setupDialog(title, message);
        LinearLayout body = (LinearLayout) dialog.findViewById(991);
        Button continueButton = button("Continue", () -> { dialog.dismiss(); yes.run(); });
        LinearLayout.LayoutParams continueLayout = new LinearLayout.LayoutParams(-1, dp(scaledControlHeight(54, 15)));
        continueLayout.setMargins(0, dp(12), 0, 0);
        body.addView(continueButton, continueLayout);
        Button cancel = secondary("Cancel", dialog::dismiss);
        cancel.setTextSize(13);
        body.addView(cancel, new LinearLayout.LayoutParams(-1, dp(scaledControlHeight(44, 13))));
        dialog.show();
    }

    @Override void pairSettings() {
        Dialog dialog = setupDialog("Pair your phones", "Pair once in Android Bluetooth settings, then host on one phone and join from the other.");
        LinearLayout body = (LinearLayout) dialog.findViewById(991);
        TextView detail = compactText("Both phones need Bluetooth enabled. Contacts permission is never needed.", 12, SUBTEXT);
        detail.setMaxLines(2);
        body.addView(detail, new LinearLayout.LayoutParams(-1, -2));
        Button open = button("Open Bluetooth settings", () -> {
            dialog.dismiss();
            startActivity(new android.content.Intent(android.provider.Settings.ACTION_BLUETOOTH_SETTINGS));
        });
        LinearLayout.LayoutParams openLayout = new LinearLayout.LayoutParams(-1, dp(scaledControlHeight(54, 15)));
        openLayout.setMargins(0, dp(12), 0, 0);
        body.addView(open, openLayout);
        Button done = secondary("Done", dialog::dismiss);
        done.setTextSize(13);
        body.addView(done, new LinearLayout.LayoutParams(-1, dp(scaledControlHeight(44, 13))));
        dialog.show();
    }
}
