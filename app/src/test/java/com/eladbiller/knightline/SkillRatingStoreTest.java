package com.eladbiller.knightline;

import java.util.List;

/** Plain-Java coverage for the private, local rating model. */
public final class SkillRatingStoreTest {
    private static int assertions;

    private static void check(boolean value, String label) {
        assertions++;
        if (!value) throw new AssertionError(label);
    }

    private static void near(double actual, double expected, double tolerance, String label) {
        check(Math.abs(actual - expected) <= tolerance,
                label + " expected=" + expected + " actual=" + actual);
    }

    private static SkillRatingStore.Match bot(SkillRatingStore.BotLevel level,
            SkillRatingStore.Result result, SkillRatingStore.Eligibility eligibility, long when) {
        return SkillRatingStore.Match.againstBot(level, result, eligibility, when);
    }

    public static void main(String[] args) {
        run();
        System.out.println("PASS: " + assertions + " SkillRatingStore assertions");
    }

    public static void run() {
        SkillRatingStore.MemoryStorage storage = new SkillRatingStore.MemoryStorage();
        SkillRatingStore store = new SkillRatingStore(storage);

        check(store.snapshot().rating == 800, "New private rating starts at 800");
        check(store.snapshot().ratedGames == 0, "New profile has no rated games");
        check(store.snapshot().isProvisional(), "New profile is provisional");
        check(SkillRatingStore.BotLevel.EASY.anchorRating() == 600, "Easy bot anchor");
        check(SkillRatingStore.BotLevel.MEDIUM.anchorRating() == 1200, "Medium bot anchor");
        check(SkillRatingStore.BotLevel.HARD.anchorRating() == 1800, "Hard bot anchor");
        near(SkillRatingStore.expectedScore(800, 800), .5d, .000001d, "Equal Elo expected score");
        near(SkillRatingStore.expectedScore(800, 1200), .090909d, .00001d,
                "Stronger opponent expected score");

        SkillRatingStore.Update win = store.record(bot(SkillRatingStore.BotLevel.EASY,
                SkillRatingStore.Result.WIN, SkillRatingStore.Eligibility.cleanStandardGame(), 1000L));
        check(win.rated, "Clean standard bot win is rated");
        check(win.entry.delta() == 8, "800 win versus estimated 600 changes by +8 with K32");
        check(store.snapshot().rating == 808 && store.snapshot().ratedGames == 1,
                "Rated result changes profile once");
        check(win.entry.isEstimatedOpponent(), "Bot history is marked estimated");

        SkillRatingStore.Update draw = store.record(bot(SkillRatingStore.BotLevel.MEDIUM,
                SkillRatingStore.Result.DRAW, SkillRatingStore.Eligibility.cleanStandardGame(), 2000L));
        check(draw.rated && draw.entry.delta() > 0, "Underdog draw gains private rating");
        SkillRatingStore.Update loss = store.record(bot(SkillRatingStore.BotLevel.HARD,
                SkillRatingStore.Result.LOSS, SkillRatingStore.Eligibility.cleanStandardGame(), 3000L));
        check(loss.rated && loss.entry.delta() < 0, "Loss updates private rating");

        int beforePractice = store.snapshot().rating;
        int gamesBeforePractice = store.snapshot().ratedGames;
        SkillRatingStore.Eligibility hinted = new SkillRatingStore.Eligibility(true, true, false,
                false, false, false);
        SkillRatingStore.Update practice = store.record(bot(SkillRatingStore.BotLevel.HARD,
                SkillRatingStore.Result.WIN, hinted, 4000L));
        check(!practice.rated && practice.entry == null, "Hinted game remains Practice");
        check(practice.status.contains("hint"), "Practice explains the hint exclusion");
        check(store.snapshot().rating == beforePractice
                        && store.snapshot().ratedGames == gamesBeforePractice,
                "Practice game never changes rating or rated count");
        check(!new SkillRatingStore.Eligibility(true, false, true, false, false, false)
                        .isEligibleForPrivateRating(), "Takeback excludes rating");
        check(!new SkillRatingStore.Eligibility(true, false, false, true, false, false)
                        .isEligibleForPrivateRating(), "Lesson excludes rating");
        check(!new SkillRatingStore.Eligibility(true, false, false, false, true, false)
                        .isEligibleForPrivateRating(), "Review branch excludes rating");
        check(!new SkillRatingStore.Eligibility(true, false, false, false, false, true)
                        .isEligibleForPrivateRating(), "Custom resume excludes rating");

        SkillRatingStore.Update friend = store.record(SkillRatingStore.Match.againstFriend(1000,
                SkillRatingStore.Result.WIN, SkillRatingStore.Eligibility.cleanStandardGame(), 5000L));
        check(friend.rated && !friend.entry.isEstimatedOpponent(),
                "Clean friend match uses exchanged local rating");

        while (store.snapshot().ratedGames < 20) {
            store.record(bot(SkillRatingStore.BotLevel.MEDIUM, SkillRatingStore.Result.DRAW,
                    SkillRatingStore.Eligibility.cleanStandardGame(), 6000L + store.snapshot().ratedGames));
        }
        check(store.snapshot().nextKFactor() == 20, "K becomes 20 after first 20 rated games");
        check(SkillRatingStore.kFactorForRatedGames(19) == 32, "Twentieth game uses K32");
        check(SkillRatingStore.kFactorForRatedGames(20) == 20, "Twenty-first game uses K20");

        SkillRatingStore reloaded = new SkillRatingStore(storage);
        check(reloaded.snapshot().rating == store.snapshot().rating, "Rating persists locally");
        check(reloaded.snapshot().ratedGames == store.snapshot().ratedGames, "Rated count persists locally");
        List<SkillRatingStore.HistoryEntry> history = reloaded.snapshot().recentHistory;
        check(!history.isEmpty() && history.get(0).completedAtMillis >= history.get(history.size() - 1).completedAtMillis,
                "History is newest first for the Profile screen");

        for (int index = 0; index < SkillRatingStore.HISTORY_LIMIT + 5; index++) {
            reloaded.record(bot(SkillRatingStore.BotLevel.MEDIUM, SkillRatingStore.Result.DRAW,
                    SkillRatingStore.Eligibility.cleanStandardGame(), 100000L + index));
        }
        check(reloaded.snapshot().recentHistory.size() == SkillRatingStore.HISTORY_LIMIT,
                "History remains compact at its fixed cap");
        check(SkillRatingStore.privateRatingExplanation().contains("not a leaderboard"),
                "UI explanation does not claim a global rating");
    }
}
