package com.traillink;

import java.util.Arrays;

/** Original offline teaching positions. Uses exactly the match's native rules. */
public final class ChessPuzzles {
    public static final String[] NAMES = {"The back rank", "A ladder of rooks", "The knight's net", "Queen and king", "Black strikes back", "A dark-square finish"};
    public static final String[] THEMES = {"Back-rank mate", "Ladder mate", "Smothered mate", "Supported queen", "Back-rank mate", "Supported queen"};
    private static final String[] BOARDS = {
        "6k1/5ppp/8/8/8/8/8/4R1K1",
        "7k/R7/8/8/8/8/8/KR6",
        "6rk/6pp/8/6N1/8/8/8/6K1",
        "7k/8/5KQ1/8/8/8/8/8",
        "4r1k1/8/8/8/8/8/5PPP/6K1",
        "8/8/8/8/8/5kq1/8/7K"
    };
    public static final String[] IDEAS = {
        "The king's own pawns block its escape. Find a rook check on the back rank.",
        "One rook cuts off the seventh rank. Use the other rook to finish the ladder.",
        "The king is surrounded by its own pieces. A knight can jump over the blockade.",
        "Bring the queen close, but keep it protected by your king.",
        "White has no escape through its pawn shield. Invade the first rank with check.",
        "Your king controls the escape squares. Put the queen beside it to finish."
    };
    public final int index, side;
    public Game position;
    public int attempts, hint;
    public boolean solved;
    public boolean usedHelp;
    public String feedback = "Find checkmate in one move.";

    public ChessPuzzles(int index) {
        if (index < 0 || index >= NAMES.length) throw new IllegalArgumentException("Unknown puzzle");
        this.index = index;
        side = index < 4 ? 0 : 1;
        position = new Game(0, 0);
        Arrays.fill(position.b, 0);
        int square = 0;
        for (char c : BOARDS[index].toCharArray()) {
            if (c == '/') continue;
            if (Character.isDigit(c)) { square += c - '0'; continue; }
            int piece = " pnbrqk".indexOf(Character.toLowerCase(c));
            position.b[square++] = Character.isUpperCase(c) ? piece : -piece;
        }
        position.turn = side; position.rights = 0; position.ep = -1;
        position.history.clear(); position.history.add(position.b.clone());
        position.chessStates.clear(); position.chessStates.add(new int[]{side, -1, 0, 0});
        position.repetition.clear(); position.remember();
    }

    public boolean play(int from, int to, int promotion) {
        if (solved) return false;
        Game candidate = position.copy();
        if (!candidate.move(side, from, to, promotion)) { feedback = "Choose a legal move."; return false; }
        attempts++;
        if (candidate.winner != side) {
            feedback = "Legal move, but not checkmate. Look for every king escape.";
            return false;
        }
        position = candidate; solved = true;
        feedback = usedHelp ? "Solved with help. Try it again without a hint." : "Checkmate. You found the pattern!";
        return true;
    }

    public int[] solution() {
        if (solved) return null;
        for (int[] move : position.legal()) {
            Game candidate = position.copy();
            if (candidate.move(side, move[0], move[1], 5) && candidate.winner == side) return move;
        }
        return null;
    }
}
