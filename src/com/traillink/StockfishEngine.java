package com.traillink;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;

/** Independent Stockfish process, communicating only through standard UCI text. */
public final class StockfishEngine implements Closeable {
    public static final String NAME = "Stockfish 16";
    public static final int[] SKILLS = {0, 8, 20};
    public static final int[] MOVE_MS = {350, 750, 1600};
    private final File executable, network;
    private volatile Process process;
    private BufferedWriter input;
    private BlockingQueue<String> output;
    private String identity = "";
    public volatile int lastDepth, lastSkill, lastBotSkill;
    public volatile long lastNodes;

    public StockfishEngine(File executable, File network) {
        this.executable = executable;
        this.network = network;
    }

    private void send(String command) throws IOException {
        input.write(command); input.newLine(); input.flush();
    }

    private String line(long deadline) throws IOException, InterruptedException {
        long remaining = deadline - System.nanoTime();
        if (remaining <= 0) throw new IOException("Stockfish response timed out");
        String s = output.poll(remaining, TimeUnit.NANOSECONDS);
        if (s == null) throw new IOException("Stockfish response timed out");
        if (s.equals("[EOF]")) throw new IOException("Stockfish process exited");
        return s;
    }

    private void waitFor(String token, long milliseconds) throws IOException, InterruptedException {
        long deadline = System.nanoTime() + milliseconds * 1_000_000L;
        while (true) {
            String s = line(deadline);
            if (s.startsWith("id name ")) identity = s.substring(8);
            if (s.equals(token)) return;
        }
    }

    private void start() throws IOException, InterruptedException {
        if (Thread.currentThread().isInterrupted()) throw new InterruptedException();
        if (process != null && process.isAlive()) return;
        if (!executable.isFile() || !network.isFile()) throw new IOException("Bundled Stockfish files are missing");
        final Process started = new ProcessBuilder(executable.getAbsolutePath())
                .redirectErrorStream(true).start();
        process = started;
        final BlockingQueue<String> lines = new LinkedBlockingQueue<>();
        output = lines;
        input = new BufferedWriter(new OutputStreamWriter(started.getOutputStream(), StandardCharsets.UTF_8));
        Thread reader = new Thread(() -> {
            try (BufferedReader r = new BufferedReader(new InputStreamReader(started.getInputStream(), StandardCharsets.UTF_8))) {
                String s;
                while ((s = r.readLine()) != null) lines.offer(s);
            } catch (IOException ignored) {
            } finally { lines.offer("[EOF]"); }
        }, "stockfish-output");
        reader.setDaemon(true); reader.start();
        send("uci"); waitFor("uciok", 10000);
        if (!identity.startsWith(NAME)) throw new IOException("Unexpected engine: " + identity);
        send("setoption name Threads value 1");
        send("setoption name Hash value 32");
        send("setoption name Ponder value false");
        send("setoption name Use NNUE value true");
        send("setoption name EvalFile value " + network.getAbsolutePath());
        send("isready"); waitFor("readyok", 10000);
    }

    public synchronized String identify() throws IOException, InterruptedException {
        try { start(); return identity; } catch (IOException | InterruptedException e) { close(); throw e; }
    }

    private void configure(int skill) throws IOException, InterruptedException {
        start();
        lastSkill = skill;
        send("ucinewgame");
        send("setoption name UCI_LimitStrength value false");
        send("setoption name Skill Level value " + skill);
        send("setoption name MultiPV value 1");
        send("isready"); waitFor("readyok", 5000);
    }

    public synchronized int[] choose(Game g, int level) throws IOException, InterruptedException {
        if (g.id != 0 || g.winner >= 0) return null;
        int difficulty = Math.max(0, Math.min(2, level));
        try {
            configure(SKILLS[difficulty]);
            Search result = search(position(g), "go movetime " + MOVE_MS[difficulty], MOVE_MS[difficulty]);
            int[] move = parseMove(g, result.best);
            Info latest = result.depths.isEmpty() ? null : result.depths.lastEntry().getValue();
            lastBotSkill = SKILLS[difficulty];
            lastDepth = latest == null ? 0 : latest.depth;
            lastNodes = latest == null ? 0 : latest.nodes;
            if (move == null) throw new IOException("Stockfish returned no legal move");
            return move;
        } catch (IOException | InterruptedException e) { close(); throw e; }
    }

    public static final class Coach {
        public final int[] move;
        public final String score, explanation;
        /** UCI scores are reported for the side to move.  These values are always White's view. */
        public final int whiteCentipawns, depth;
        public final Integer whiteMate;
        Coach(int[] move,String score,String explanation,int whiteCentipawns,Integer whiteMate,int depth){
            this.move=move;this.score=score;this.explanation=explanation;
            this.whiteCentipawns=whiteCentipawns;this.whiteMate=whiteMate;this.depth=depth;
        }
    }
    public synchronized Coach coach(Game g,int player) throws IOException,InterruptedException {
        try {
            configure(20);Search result=search(position(g),"go movetime 500",500);
            if(result.depths.isEmpty())throw new IOException("No position evaluation");
            Info info=result.depths.lastEntry().getValue();int[] best=parseMove(g,info.pv);
            if(best==null)throw new IOException("No legal hint");
            String score=coachScore(info,g.turn,player);
            int whitePerspective=g.turn==0?1:-1;
            Integer whiteMate=info.mate==null?null:info.mate*whitePerspective;
            return new Coach(best,score,ChessTutor.explain(g,best),info.cp*whitePerspective,whiteMate,info.depth);
        }catch(IOException|InterruptedException e){close();throw e;}
    }

    static String coachScore(Info info,int turn,int player){
        int perspective=turn==player?1:-1;
        if(info.mate!=null){int mate=info.mate*perspective;return mate>0?"You can force mate in "+mate:mate<0?"Opponent can force mate in "+Math.abs(mate):"Checkmate";}
        int cp=info.cp*perspective;String verdict=Math.abs(cp)<30?"About equal":cp>0?"You are ahead":"You are behind";
        return String.format(Locale.ROOT,"%+.2f pawns · %s",cp/100.0,verdict);
    }

    public static final class Review {
        public final String text;
        public final int[] best;
        public Review(String text, int[] best) { this.text = text; this.best = best; }
    }

    public synchronized Review analyze(Game match, int ply) throws IOException, InterruptedException {
        Game g = ChessAnalysis.position(match, ply);
        return analyzePosition(g, match.chessMoves.get(ply), historyPosition(match, ply));
    }

    public synchronized Review analyzePosition(Game g, int[] played) throws IOException, InterruptedException {
        return analyzePosition(g, played, position(g));
    }

    private Review analyzePosition(Game g, int[] played, String command) throws IOException, InterruptedException {
        try {
            if (parseMove(g, uci(g, played)) == null) throw new IOException("Invalid review move");
            configure(20);
            Search root = search(command, "go movetime 1400", 1400);
            if (root.depths.isEmpty()) throw new IOException("Stockfish produced no evaluation");
            int targetDepth = root.depths.lastKey();
            Search actual = search(command, "go depth " + targetDepth + " movetime 1800 searchmoves " + uci(g, played), 1800);
            int depth = 0;
            for (int d : root.depths.keySet()) if (actual.depths.containsKey(d)) depth = d;
            if (depth == 0) throw new IOException("No comparable completed search depth");
            Info best = root.depths.get(depth), chosen = actual.depths.get(depth);
            int[] bestMove = parseMove(g, best.pv);
            if (bestMove == null) throw new IOException("Invalid recommendation");
            long searchedNodes = best.nodes + chosen.nodes;
            boolean same = Arrays.equals(bestMove, played);
            // Separate selective searches can differ even at the same depth. A move cannot lose evaluation against itself.
            if (same) chosen = best;
            int loss = Math.max(0, best.value() - chosen.value());
            String verdict = same ? "Best move found" : loss < 30 ? "Good move" :
                    loss < 80 ? "Small inaccuracy" : loss < 200 ? "Mistake" : "Blunder";
            String reason = loss < 30 ? "Your move kept approximately the same evaluation." :
                    String.format(Locale.ROOT, "Stockfish prefers the alternative by about %.2f pawns.", loss / 100.0);
            if (best.mate != null && best.mate > 0 && (chosen.mate == null || chosen.mate <= 0))
                reason = "Stockfish found a forced mate with the alternative, but not with your move.";
            else if (chosen.mate != null && chosen.mate < 0 && (best.mate == null || best.mate >= 0))
                reason = "Your move allows a forced mate in the searched line.";
            else if (best.mate != null || chosen.mate != null)
                reason = "Stockfish predicts forced mate. Compare the two evaluation cards.";
            if (same) reason = ChessReviewText.sameMoveReason(g.turn == 0 ? "White" : "Black", best.score());
            String text = verdict + "\nPlayed: " + ChessNotation.san(g, played[0], played[1], played[2])
                    + "\nBest found: " + ChessNotation.san(g, bestMove[0], bestMove[1], bestMove[2])
                    + "\n" + reason
                    + "\nEvaluation for " + (g.turn == 0 ? "White" : "Black") + ": best " + best.score()
                    + "; played " + chosen.score() + "."
                    + "\n" + NAME + " NNUE · compared depth " + depth + " · " + searchedNodes
                    + " nodes. Offline, time-limited search; not an absolute verdict.";
            lastDepth = depth; lastNodes = searchedNodes;
            return new Review(text, bestMove);
        } catch (IOException | InterruptedException e) { close(); throw e; }
    }

    static final class Info {
        int depth, cp; Integer mate; long nodes; String pv = "";
        int value() { return mate == null ? cp : mate > 0 ? 100000 - mate : -100000 - mate; }
        String score() { return mate == null ? String.format(Locale.ROOT, "%+.2f", cp / 100.0) :
                mate > 0 ? "mate in " + mate : "opponent mate in " + Math.abs(mate); }
    }

    static Info parseInfo(String line) {
        if (!line.startsWith("info ") || !line.contains(" score ") || !line.contains(" pv ")
                || line.contains(" lowerbound") || line.contains(" upperbound")) return null;
        String[] parts = line.split(" ");
        Info info = new Info();
        try {
            for (int i = 1; i < parts.length; i++) {
                if (parts[i].equals("depth")) info.depth = Integer.parseInt(parts[++i]);
                else if (parts[i].equals("nodes")) info.nodes = Long.parseLong(parts[++i]);
                else if (parts[i].equals("score")) {
                    String type = parts[++i]; int value = Integer.parseInt(parts[++i]);
                    if (type.equals("mate")) info.mate = value;
                    else if (type.equals("cp")) info.cp = value; else return null;
                } else if (parts[i].equals("pv")) { info.pv = parts[++i]; break; }
            }
        } catch (RuntimeException e) { return null; }
        return info.depth > 0 && !info.pv.isEmpty() ? info : null;
    }

    static final class Search {
        String best = "";
        final TreeMap<Integer, Info> depths = new TreeMap<>();
    }

    private Search search(String position, String go, long budget) throws IOException, InterruptedException {
        send(position); send(go);
        Search result = new Search();
        long deadline = System.nanoTime() + (budget + 5000) * 1_000_000L;
        while (true) {
            String s = line(deadline);
            if (s.startsWith("bestmove ")) { result.best = s.split(" ")[1]; return result; }
            Info info = parseInfo(s);
            if (info != null) result.depths.put(info.depth, info);
            if (s.startsWith("info string ERROR") || s.contains("NNUE evaluation used, but"))
                throw new IOException("Stockfish could not load its evaluation network");
        }
    }

    public static String fen(Game g) {
        StringBuilder out = new StringBuilder();
        for (int r = 0; r < 8; r++) {
            int empty = 0;
            for (int c = 0; c < 8; c++) {
                int p = g.b[r * 8 + c];
                if (p == 0) { empty++; continue; }
                if (empty > 0) { out.append(empty); empty = 0; }
                char letter = " PNBRQK".charAt(Math.abs(p));
                out.append(p > 0 ? letter : Character.toLowerCase(letter));
            }
            if (empty > 0) out.append(empty);
            if (r < 7) out.append('/');
        }
        out.append(g.turn == 0 ? " w " : " b ");
        String rights = "";
        for (int i = 0; i < 4; i++) if ((g.rights & (1 << i)) != 0) rights += "KQkq".charAt(i);
        out.append(rights.isEmpty() ? "-" : rights).append(' ')
                .append(g.ep < 0 ? "-" : Game.square(g.ep)).append(' ')
                .append(g.quiet).append(' ').append(Math.max(1, g.chessMoves.size() / 2 + 1));
        return out.toString();
    }

    public static String uci(Game g, int[] m) {
        String s = Game.square(m[0]) + Game.square(m[1]);
        if (Math.abs(g.b[m[0]]) == 1 && (m[1] / 8 == 0 || m[1] / 8 == 7))
            s += " pnbrqk".charAt(m[2]);
        return s;
    }

    public static int[] parseMove(Game g, String s) {
        if (s == null || !s.matches("[a-h][1-8][a-h][1-8][nbrq]?")) return null;
        int a = (8 - (s.charAt(1) - '0')) * 8 + s.charAt(0) - 'a';
        int z = (8 - (s.charAt(3) - '0')) * 8 + s.charAt(2) - 'a';
        boolean promotes = Math.abs(g.b[a]) == 1 && (z / 8 == 0 || z / 8 == 7);
        if (promotes != (s.length() == 5) || !g.chessLegal(a, z)) return null;
        return new int[]{a, z, promotes ? " pnbrqk".indexOf(s.charAt(4)) : 5};
    }

    public static String historyPosition(Game match, int ply) {
        Game initial = ChessAnalysis.position(match, 0);
        StringBuilder s = new StringBuilder("position fen " + fen(initial));
        if (ply > 0) s.append(" moves");
        for (int i = 0; i < ply; i++) {
            int[] m = match.chessMoves.get(i);
            s.append(' ').append(uci(initial, m));
            initial.chessApply(m[0], m[1], m[2]); initial.turn = 1 - initial.turn;
        }
        return s.toString();
    }

    public static String position(Game g) {
        int ply = g.chessMoves.size();
        if (g.history.size() == ply + 1 && g.chessStates.size() == ply + 1
                && Arrays.equals(Arrays.copyOf(g.b, 64), g.history.get(ply)))
            return historyPosition(g, ply);
        return "position fen " + fen(g);
    }

    @Override public void close() {
        Process p = process; process = null;
        if (p != null) {
            p.destroy();
            try { if (!p.waitFor(150, TimeUnit.MILLISECONDS)) p.destroyForcibly(); }
            catch (InterruptedException e) { p.destroyForcibly(); Thread.currentThread().interrupt(); }
        }
    }
}
