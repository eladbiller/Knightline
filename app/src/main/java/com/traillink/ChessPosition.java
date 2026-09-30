package com.traillink;

import java.util.Arrays;

/** Strict standard-chess FEN input for packaged puzzles and independent review. */
public final class ChessPosition {
    private ChessPosition() { }
    public static Game fromFen(String fen) {
        String[] fields = fen.trim().split("\\s+");
        if (fields.length != 6) throw new IllegalArgumentException("Six FEN fields required");
        Game g = new Game(0, 0); Arrays.fill(g.b, 0);
        String[] rows = fields[0].split("/");
        if (rows.length != 8) throw new IllegalArgumentException("Eight ranks required");
        int white = 0, black = 0;
        for (int r = 0; r < 8; r++) {
            int col = 0;
            for (char c : rows[r].toCharArray()) {
                if (c >= '1' && c <= '8') col += c - '0';
                else {
                    int p = " pnbrqk".indexOf(Character.toLowerCase(c));
                    if (p < 1 || col >= 8) throw new IllegalArgumentException("Invalid FEN piece");
                    g.b[r * 8 + col++] = Character.isUpperCase(c) ? p : -p;
                    if (c == 'K') white++; if (c == 'k') black++;
                }
            }
            if (col != 8) throw new IllegalArgumentException("Invalid rank width");
        }
        if (white != 1 || black != 1 || !(fields[1].equals("w") || fields[1].equals("b"))) throw new IllegalArgumentException("Invalid kings/turn");
        g.turn = fields[1].equals("w") ? 0 : 1; g.rights = 0;
        if (!fields[2].matches("-|K?Q?k?q?")) throw new IllegalArgumentException("Invalid castling");
        for (char c : fields[2].toCharArray()) { int bit = "KQkq".indexOf(c); if (bit >= 0) g.rights |= 1 << bit; }
        g.ep = fields[3].equals("-") ? -1 : square(fields[3]);
        if (g.ep >= 0 && g.ep / 8 != 2 && g.ep / 8 != 5) throw new IllegalArgumentException("Invalid en passant rank");
        g.quiet = Integer.parseInt(fields[4]);
        if (g.quiet < 0 || Integer.parseInt(fields[5]) < 1) throw new IllegalArgumentException("Invalid counters");
        initializeHistory(g);
        return g;
    }
    public static int square(String text) {
        if (!text.matches("[a-h][1-8]")) throw new IllegalArgumentException("Invalid square");
        return (8 - (text.charAt(1) - '0')) * 8 + text.charAt(0) - 'a';
    }
    public static int[] uci(String text) {
        if (!text.matches("[a-h][1-8][a-h][1-8][qrbn]?")) throw new IllegalArgumentException("Invalid move");
        return new int[]{square(text.substring(0, 2)), square(text.substring(2, 4)), text.length() == 5 ? " pnbrqk".indexOf(text.charAt(4)) : 5};
    }
    public static void initializeHistory(Game g) {
        g.history.clear(); g.history.add(Arrays.copyOf(g.b, 64));
        g.chessStates.clear(); g.chessStates.add(new int[]{g.turn, g.ep, g.rights, g.quiet});
        g.chessMoves.clear(); g.commentary.clear(); g.commentary.add("Analysis position");
        g.analysis.clear(); g.analysisBest.clear(); g.repetition.clear(); g.remember();
    }
    public static Game at(Game match, int ply) {
        Game g = ChessAnalysis.position(match, ply);
        initializeHistory(g);
        g.seq = 0; g.lastA = g.lastZ = -1;
        if (g.legal().isEmpty()) g.winner = g.check(g.turn) ? 1 - g.turn : 2;
        else if (g.insufficient() || g.quiet >= 100) g.winner = 2;
        return g;
    }
}
