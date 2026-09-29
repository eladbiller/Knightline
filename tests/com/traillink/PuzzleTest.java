package com.traillink;

import java.util.Arrays;

public class PuzzleTest {
    private static int checks;
    private static void check(boolean ok, String message) { checks++; if (!ok) throw new AssertionError(message); }
    public static void main(String[] args) {
        for (int i = 0; i < ChessPuzzles.NAMES.length; i++) {
            ChessPuzzles puzzle = new ChessPuzzles(i);
            check(!puzzle.position.check(1 - puzzle.side), "Opponent is already checked: " + i);
            int mates = 0;
            for (int[] move : puzzle.position.legal()) {
                Game candidate = puzzle.position.copy();
                candidate.move(puzzle.side, move[0], move[1], 5);
                if (candidate.winner == puzzle.side) mates++;
                else {
                    int[] before = puzzle.position.b.clone();
                    check(!puzzle.play(move[0], move[1], 5), "Wrong solution accepted");
                    check(Arrays.equals(before, puzzle.position.b), "Wrong move changed puzzle");
                }
            }
            check(mates == 1, "Expected one mate, got " + mates + " in puzzle " + i);
            int[] solution = puzzle.solution();
            check(solution != null && puzzle.play(solution[0], solution[1], 5), "Missing solution");
            check(puzzle.position.winner == puzzle.side && puzzle.solved, "Not checkmate");
            check(!puzzle.play(solution[0], solution[1], 5), "Solved puzzle replay accepted");
        }
        ChessReviewText white = ChessReviewText.from("Mistake\nPlayed: e4\nBest found: d4\nReason\nEvaluation for White: best +1.20; played -0.40.");
        ChessReviewText black = ChessReviewText.from("Mistake\nPlayed: e5\nBest found: d5\nReason\nEvaluation for Black: best +1.20; played -0.40.");
        check(white.whiteScore == -.4 && black.whiteScore == .4, "White evaluation perspective");
        check(white.playedMove.equals("e4") && white.verdict.equals("Mistake"), "Review labels");
        check(ChessReviewText.from("").whiteScore == null, "Empty analysis invented a score");
        ChessReviewText mate = ChessReviewText.from("Best move found\nPlayed: Qh4#\nBest found: Qh4#\nReason\nEvaluation for Black: best mate in 1; played mate in 1.");
        check(mate.whiteScore == null && mate.whiteMate == -1 && mate.playedCompact.equals("M1"), "Mate graph/compact score");
        Game original = new ChessPuzzles(0).position;
        int[] before = original.b.clone();
        ChessReviewPractice retry = new ChessReviewPractice(original, new int[]{60,4,5});
        check(!retry.play(60,52,5), "Retry accepted alternative");
        check(Arrays.equals(before, original.b) && Arrays.equals(before, retry.position.b), "Retry changed saved board");
        check(retry.play(60,4,5) && retry.complete, "Retry rejected recommendation");
        check(Arrays.equals(before, original.b), "Correct retry changed saved board");
        check(!retry.play(60,4,5), "Completed retry accepts stale move");
        System.out.println("Puzzle and review checks passed: " + checks);
    }
}
