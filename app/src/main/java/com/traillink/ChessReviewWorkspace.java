package com.traillink;

import java.util.ArrayList;

/** Free legal analysis for either side; never mutates the saved game. */
public final class ChessReviewWorkspace {
    public Game position;
    public final int orientation;
    public long revision;
    private final ArrayList<Game> history = new ArrayList<>();
    private final ArrayList<String> moves = new ArrayList<>();
    public ChessReviewWorkspace(Game initial, int orientation) {
        position = initial.copy(); this.orientation = orientation;
        history.add(position.copy());
    }
    public boolean play(int from, int to, int promotion) {
        String notation = ChessNotation.san(position, from, to, promotion);
        Game next = position.copy();
        if (!next.move(next.turn, from, to, promotion)) return false;
        position = next; history.add(next.copy()); moves.add(notation); revision++; return true;
    }
    public boolean undo() {
        if (history.size() <= 1) return false;
        history.remove(history.size() - 1); moves.remove(moves.size() - 1);
        position = history.get(history.size() - 1).copy(); revision++; return true;
    }
    public int length() { return moves.size(); }
    public String line() { return String.join(" · ", moves); }
}
