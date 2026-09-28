package com.eladbiller.knightline;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * The on-device skill estimate used by Knightline.
 *
 * <p>This is deliberately a private, local estimate. It is not a leaderboard,
 * a global account rating, or an anti-cheat system. Callers decide when a game
 * is clean enough to be rated through {@link Eligibility}; the store never
 * receives moves, identities, or network data.</p>
 */
public final class SkillRatingStore {
    public static final String STORAGE_KEY = "private_skill_rating_v1";
    public static final int INITIAL_RATING = 800;
    public static final int PROVISIONAL_GAMES = 20;
    public static final int PROVISIONAL_K = 32;
    public static final int ESTABLISHED_K = 20;
    public static final int HISTORY_LIMIT = 32;

    private static final String FORMAT = "v1";

    /** A score from the local player's point of view. */
    public enum Result {
        WIN(1.0d, "Win"),
        DRAW(0.5d, "Draw"),
        LOSS(0.0d, "Loss");

        private final double score;
        private final String label;

        Result(double score, String label) {
            this.score = score;
            this.label = label;
        }

        public double score() {
            return score;
        }

        public String label() {
            return label;
        }

        private char code() {
            return name().charAt(0);
        }

        private static Result fromCode(String code) {
            if ("W".equals(code)) return WIN;
            if ("D".equals(code)) return DRAW;
            if ("L".equals(code)) return LOSS;
            throw new IllegalArgumentException("Unknown result code");
        }
    }

    /** Fixed, clearly estimated anchors used for offline bot games. */
    public enum BotLevel {
        EASY(600, "Easy"),
        MEDIUM(1200, "Medium"),
        HARD(1800, "Hard");

        private final int anchorRating;
        private final String label;

        BotLevel(int anchorRating, String label) {
            this.anchorRating = anchorRating;
            this.label = label;
        }

        public int anchorRating() {
            return anchorRating;
        }

        public String label() {
            return label;
        }
    }

    public enum OpponentKind {
        BOT('B'),
        FRIEND('F');

        private final char code;

        OpponentKind(char code) {
            this.code = code;
        }

        private char code() {
            return code;
        }

        private static OpponentKind fromCode(String code) {
            if ("B".equals(code)) return BOT;
            if ("F".equals(code)) return FRIEND;
            throw new IllegalArgumentException("Unknown opponent kind");
        }
    }

    /**
     * Minimal persistence contract so the rating logic remains unit-testable.
     * Android code should provide a per-app private implementation.
     */
    public interface Storage {
        String get(String key);
        void put(String key, String value);
    }

    /** In-memory storage for tests and previews. It intentionally is not durable. */
    public static final class MemoryStorage implements Storage {
        private final Map<String, String> values = new HashMap<>();

        @Override public String get(String key) {
            return values.get(key);
        }

        @Override public void put(String key, String value) {
            values.put(key, value);
        }
    }

    /**
     * A rating is valid only for a clean, standard game. Any coaching or
     * non-standard continuation explicitly turns it into Practice.
     */
    public static final class Eligibility {
        public final boolean standardGame;
        public final boolean usedHint;
        public final boolean usedTakeback;
        public final boolean lessonMode;
        public final boolean reviewBranch;
        public final boolean resumedCustomPosition;

        public Eligibility(boolean standardGame, boolean usedHint, boolean usedTakeback,
                boolean lessonMode, boolean reviewBranch, boolean resumedCustomPosition) {
            this.standardGame = standardGame;
            this.usedHint = usedHint;
            this.usedTakeback = usedTakeback;
            this.lessonMode = lessonMode;
            this.reviewBranch = reviewBranch;
            this.resumedCustomPosition = resumedCustomPosition;
        }

        public static Eligibility cleanStandardGame() {
            return new Eligibility(true, false, false, false, false, false);
        }

        public static Eligibility practiceGame() {
            return new Eligibility(false, false, false, false, false, false);
        }

        public boolean isEligibleForPrivateRating() {
            return standardGame && !usedHint && !usedTakeback && !lessonMode
                    && !reviewBranch && !resumedCustomPosition;
        }

        /** Short, user-safe explanation for a non-rated game. */
        public String practiceReason() {
            if (isEligibleForPrivateRating()) return "Rated";
            if (!standardGame) return "Practice: standard rules are required";
            if (lessonMode) return "Practice: lesson mode";
            if (usedHint) return "Practice: hint used";
            if (usedTakeback) return "Practice: takeback used";
            if (reviewBranch) return "Practice: review branch";
            if (resumedCustomPosition) return "Practice: custom position";
            return "Practice";
        }
    }

    /** Immutable description of one completed game submitted to the store. */
    public static final class Match {
        public final OpponentKind opponentKind;
        public final int opponentRating;
        public final Result result;
        public final Eligibility eligibility;
        public final long completedAtMillis;
        public final BotLevel botLevel;

        private Match(OpponentKind opponentKind, int opponentRating, Result result,
                Eligibility eligibility, long completedAtMillis, BotLevel botLevel) {
            if (opponentKind == null || result == null || eligibility == null) {
                throw new IllegalArgumentException("Match fields are required");
            }
            if (opponentRating < 1 || opponentRating > 10000) {
                throw new IllegalArgumentException("Opponent rating must be between 1 and 10000");
            }
            if (completedAtMillis < 0L) {
                throw new IllegalArgumentException("Completion time cannot be negative");
            }
            if ((opponentKind == OpponentKind.BOT) != (botLevel != null)) {
                throw new IllegalArgumentException("Bot matches require a bot level");
            }
            this.opponentKind = opponentKind;
            this.opponentRating = opponentRating;
            this.result = result;
            this.eligibility = eligibility;
            this.completedAtMillis = completedAtMillis;
            this.botLevel = botLevel;
        }

        public static Match againstBot(BotLevel level, Result result, Eligibility eligibility) {
            return againstBot(level, result, eligibility, System.currentTimeMillis());
        }

        public static Match againstBot(BotLevel level, Result result, Eligibility eligibility,
                long completedAtMillis) {
            if (level == null) throw new IllegalArgumentException("Bot level is required");
            return new Match(OpponentKind.BOT, level.anchorRating(), result, eligibility,
                    completedAtMillis, level);
        }

        /**
         * The supplied rating is the opponent's private rating exchanged at
         * match start. It remains local to this device after calculation.
         */
        public static Match againstFriend(int friendPrivateRating, Result result,
                Eligibility eligibility) {
            return againstFriend(friendPrivateRating, result, eligibility,
                    System.currentTimeMillis());
        }

        public static Match againstFriend(int friendPrivateRating, Result result,
                Eligibility eligibility, long completedAtMillis) {
            return new Match(OpponentKind.FRIEND, friendPrivateRating, result, eligibility,
                    completedAtMillis, null);
        }

        public boolean isEstimatedOpponent() {
            return opponentKind == OpponentKind.BOT;
        }

        public String opponentLabel() {
            if (opponentKind == OpponentKind.FRIEND) return "Friend";
            return botLevel.label() + " bot · estimated " + opponentRating;
        }
    }

    /** Compact local record of a rated game. The list returned to UI is newest first. */
    public static final class HistoryEntry {
        public final long completedAtMillis;
        public final int ratingBefore;
        public final int ratingAfter;
        public final int opponentRating;
        public final OpponentKind opponentKind;
        public final Result result;

        private HistoryEntry(long completedAtMillis, int ratingBefore, int ratingAfter,
                int opponentRating, OpponentKind opponentKind, Result result) {
            this.completedAtMillis = completedAtMillis;
            this.ratingBefore = ratingBefore;
            this.ratingAfter = ratingAfter;
            this.opponentRating = opponentRating;
            this.opponentKind = opponentKind;
            this.result = result;
        }

        public int delta() {
            return ratingAfter - ratingBefore;
        }

        public boolean isEstimatedOpponent() {
            return opponentKind == OpponentKind.BOT;
        }
    }

    /** Immutable view suitable for the Profile screen. */
    public static final class Snapshot {
        public final int rating;
        public final int ratedGames;
        public final List<HistoryEntry> recentHistory;

        private Snapshot(int rating, int ratedGames, List<HistoryEntry> recentHistory) {
            this.rating = rating;
            this.ratedGames = ratedGames;
            this.recentHistory = recentHistory;
        }

        public boolean isProvisional() {
            return ratedGames < PROVISIONAL_GAMES;
        }

        public int nextKFactor() {
            return kFactorForRatedGames(ratedGames);
        }

        public String scopeLabel() {
            return "Private skill rating · on this device";
        }
    }

    /** Result of recording a game, including whether it counted toward the estimate. */
    public static final class Update {
        public final boolean rated;
        public final String status;
        public final Snapshot snapshot;
        public final HistoryEntry entry;

        private Update(boolean rated, String status, Snapshot snapshot, HistoryEntry entry) {
            this.rated = rated;
            this.status = status;
            this.snapshot = snapshot;
            this.entry = entry;
        }
    }

    private final Storage storage;
    private int rating = INITIAL_RATING;
    private int ratedGames;
    /** Persisted oldest first; snapshots reverse it for the Profile screen. */
    private final ArrayList<HistoryEntry> history = new ArrayList<>();

    public SkillRatingStore(Storage storage) {
        if (storage == null) throw new IllegalArgumentException("Storage is required");
        this.storage = storage;
        restore();
    }

    public synchronized Snapshot snapshot() {
        ArrayList<HistoryEntry> newestFirst = new ArrayList<>(history);
        Collections.reverse(newestFirst);
        return new Snapshot(rating, ratedGames,
                Collections.unmodifiableList(newestFirst));
    }

    public synchronized Update record(Match match) {
        if (match == null) throw new IllegalArgumentException("Match is required");
        if (!match.eligibility.isEligibleForPrivateRating()) {
            return new Update(false, match.eligibility.practiceReason(), snapshot(), null);
        }

        int before = rating;
        int k = kFactorForRatedGames(ratedGames);
        int after = (int) Math.round(before + k * (match.result.score()
                - expectedScore(before, match.opponentRating)));
        rating = after;
        ratedGames++;
        HistoryEntry entry = new HistoryEntry(match.completedAtMillis, before, after,
                match.opponentRating, match.opponentKind, match.result);
        history.add(entry);
        while (history.size() > HISTORY_LIMIT) history.remove(0);
        persist();
        return new Update(true, signedDelta(entry.delta()), snapshot(), entry);
    }

    public synchronized void reset() {
        rating = INITIAL_RATING;
        ratedGames = 0;
        history.clear();
        persist();
    }

    /** Standard Elo expected score from the local player's point of view. */
    public static double expectedScore(int playerRating, int opponentRating) {
        return 1.0d / (1.0d + Math.pow(10.0d, (opponentRating - playerRating) / 400.0d));
    }

    public static int kFactorForRatedGames(int completedRatedGames) {
        if (completedRatedGames < 0) {
            throw new IllegalArgumentException("Completed games cannot be negative");
        }
        return completedRatedGames < PROVISIONAL_GAMES ? PROVISIONAL_K : ESTABLISHED_K;
    }

    public static String privateRatingExplanation() {
        return "Private skill rating stored on this device. It is not a leaderboard or anti-cheat rating.";
    }

    private static String signedDelta(int delta) {
        return (delta >= 0 ? "+" : "") + delta + " private rating";
    }

    private void restore() {
        String saved = storage.get(STORAGE_KEY);
        if (saved == null || saved.length() == 0) return;
        try {
            String[] parts = saved.split("\\\\|", -1);
            if (parts.length != 4 || !FORMAT.equals(parts[0])) return;
            int savedRating = Integer.parseInt(parts[1]);
            int savedGames = Integer.parseInt(parts[2]);
            if (savedRating < 1 || savedRating > 10000 || savedGames < 0) return;
            ArrayList<HistoryEntry> restored = parseHistory(parts[3]);
            rating = savedRating;
            ratedGames = savedGames;
            history.clear();
            history.addAll(restored);
        } catch (RuntimeException ignored) {
            // Corrupt local preferences never prevent the chess app from opening.
        }
    }

    private ArrayList<HistoryEntry> parseHistory(String packed) {
        ArrayList<HistoryEntry> restored = new ArrayList<>();
        if (packed.length() == 0) return restored;
        String[] entries = packed.split(";", -1);
        for (String encoded : entries) {
            try {
                String[] fields = encoded.split(",", -1);
                if (fields.length != 6) continue;
                long completedAt = Long.parseLong(fields[0]);
                int before = Integer.parseInt(fields[1]);
                int after = Integer.parseInt(fields[2]);
                int opponent = Integer.parseInt(fields[3]);
                if (completedAt < 0L || before < 1 || after < 1 || opponent < 1) continue;
                restored.add(new HistoryEntry(completedAt, before, after, opponent,
                        OpponentKind.fromCode(fields[4]), Result.fromCode(fields[5])));
            } catch (RuntimeException ignored) {
                // Keep valid neighbouring compact entries when one is malformed.
            }
        }
        while (restored.size() > HISTORY_LIMIT) restored.remove(0);
        return restored;
    }

    private void persist() {
        StringBuilder packedHistory = new StringBuilder();
        for (int index = 0; index < history.size(); index++) {
            HistoryEntry entry = history.get(index);
            if (index > 0) packedHistory.append(';');
            packedHistory.append(entry.completedAtMillis).append(',')
                    .append(entry.ratingBefore).append(',')
                    .append(entry.ratingAfter).append(',')
                    .append(entry.opponentRating).append(',')
                    .append(entry.opponentKind.code()).append(',')
                    .append(entry.result.code());
        }
        storage.put(STORAGE_KEY, FORMAT + "|" + rating + "|" + ratedGames + "|" + packedHistory);
    }
}
