package com.traillink;

import java.util.ArrayList;

/** Captured pieces, not missing starting material (which is wrong after promotion). */
final class ChessCaptures {
    static int[][] byPlayer(Game game) {
        ArrayList<Integer> white = new ArrayList<>(), black = new ArrayList<>();
        if (game != null && game.id == 0) for (int i=0; i<game.chessMoves.size(); i++) {
            int[] before = game.history.get(i), move = game.chessMoves.get(i);
            int piece = before[move[0]], captured = before[move[1]];
            if (Math.abs(piece)==1 && move[0]%8!=move[1]%8 && captured==0)
                captured=before[move[1]+(piece>0?8:-8)];
            if (captured!=0 && Math.abs(captured)!=6) (piece>0?white:black).add(captured);
        }
        return new int[][]{sorted(white),sorted(black)};
    }
    private static int[] sorted(ArrayList<Integer> values) {
        values.sort((a,b)->Integer.compare(Math.abs(a),Math.abs(b)));
        return values.stream().mapToInt(Integer::intValue).toArray();
    }
    private ChessCaptures() { }
}
