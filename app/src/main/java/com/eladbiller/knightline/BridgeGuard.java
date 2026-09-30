package com.eladbiller.knightline;

import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;

/**
 * Small, Android-free gate for commands crossing from the packaged WebView to
 * the native chess controller. The view is never game authority; this class
 * keeps malformed, replayed and out-of-session requests out before a command
 * can reach it.
 */
public final class BridgeGuard {
    public static final int VERSION = 1;
    public static final int MAX_ID_LENGTH = 96;
    public static final int MAX_TYPE_LENGTH = 80;

    private static final Set<String> KNOWN_TYPES = Collections.unmodifiableSet(new HashSet<>(Arrays.asList(
            "ui.ready", "ui.closeOverlay",
            "nav.home", "nav.play", "nav.learn", "nav.profile", "nav.history", "nav.back",
            "archive.open", "settings.feedback", "settings.preview",
            "confirm.accept", "confirm.cancel",
            "match.startBot", "match.startPass", "match.resume", "match.move",
            "match.takeback", "match.resign", "match.rematch", "match.retryBot",
            "match.openMoves", "match.openMenu", "match.clear", "match.inviteRemote", "match.suggestRemote",
            "learn.start", "promotion.choose", "coach.advance",
            "puzzle.start", "puzzle.move", "puzzle.hint", "puzzle.retry", "puzzle.next", "puzzle.undo",
            "review.open", "review.previous", "review.next", "review.jump",
            "review.try", "review.best", "review.undo", "review.reset", "review.evaluate",
            "transport.host", "transport.join", "transport.scan", "transport.connect",
            "transport.disconnect", "transport.settings",
            "online.host", "online.join", "chat.open", "chat.send", "engine.info"
    )));

    private long lastSequence = -1;

    public void reset() {
        lastSequence = -1;
    }

    public Decision accept(int version, String id, String type, long sequence, boolean uiReady) {
        if (version != VERSION) return Decision.reject("Unsupported app bridge version.");
        if (id == null || id.isEmpty() || id.length() > MAX_ID_LENGTH
                || type == null || type.isEmpty() || type.length() > MAX_TYPE_LENGTH) {
            return Decision.reject("Malformed command.");
        }
        if (!KNOWN_TYPES.contains(type)) return Decision.reject("That control is not available in this version.");
        if (sequence < 0) return Decision.reject("Malformed command.");
        if ("ui.ready".equals(type)) {
            lastSequence = sequence;
            return Decision.ready();
        }
        if (!uiReady || sequence <= lastSequence) return Decision.reject("Stale command ignored.");
        lastSequence = sequence;
        return Decision.accept();
    }

    public static boolean requiresActiveMatch(String type) {
        return "match.resume".equals(type) || "match.move".equals(type)
                || "match.takeback".equals(type) || "match.resign".equals(type)
                || "match.rematch".equals(type) || "match.retryBot".equals(type)
                || "match.openMoves".equals(type) || "match.openMenu".equals(type)
                || "match.clear".equals(type) || type.startsWith("coach.")
                || type.startsWith("review.") || type.startsWith("promotion.")
                || type.startsWith("chat.");
    }

    public static boolean matchesActiveSession(String supplied, String active, boolean hasState) {
        return hasState && active != null && !active.isEmpty() && active.equals(supplied);
    }

    public static final class Decision {
        public final boolean accepted;
        public final boolean becomesReady;
        public final String rejection;

        private Decision(boolean accepted, boolean becomesReady, String rejection) {
            this.accepted = accepted;
            this.becomesReady = becomesReady;
            this.rejection = rejection;
        }

        private static Decision accept() { return new Decision(true, false, ""); }
        private static Decision ready() { return new Decision(true, true, ""); }
        private static Decision reject(String message) { return new Decision(false, false, message); }
    }
}
