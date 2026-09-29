package com.traillink;

/** A retry is a separate position, never a branch that overwrites the save. */
public final class ChessReviewPractice {
    public Game position;
    public final int side;
    private final int[] best;
    public boolean complete;
    public String feedback = "Find Stockfish's recommended move. Your saved game will not change.";

    public ChessReviewPractice(Game before, int[] recommendation) {
        position = before.copy(); side = before.turn; best = recommendation.clone();
    }
    public boolean play(int from, int to, int promotion) {
        if (complete) return false;
        Game candidate = position.copy();
        if (!candidate.move(side, from, to, promotion)) { feedback = "Choose a legal move."; return false; }
        boolean promotes = Math.abs(position.b[from]) == 1 && (to / 8 == 0 || to / 8 == 7);
        if (from != best[0] || to != best[1] || (promotes && promotion != best[2])) {
            feedback = "That's legal, but Stockfish preferred another move in this search. Try again or reveal Best.";
            return false;
        }
        position = candidate; complete = true;
        feedback = "You found Stockfish's move. This practice did not change your game or rating.";
        return true;
    }
}
