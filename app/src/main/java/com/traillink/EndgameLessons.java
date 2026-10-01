package com.traillink;

/** Original teaching notes and positions. All claims are against a lone king. */
public final class EndgameLessons {
    public static final class Lesson {
        public final String name, verdict, explanation, steps, fen, pattern, finish;
        public final boolean playable;
        Lesson(String name,String verdict,String explanation,String steps,String pieces,String pattern,String finish,boolean playable){
            this.name=name;this.verdict=verdict;this.explanation=explanation;this.steps=steps;
            fen="8/8/5k2/8/8/2K5/"+pieces+"/8 w - - 0 1";
            this.pattern=pattern;this.finish=finish;this.playable=playable;
        }
    }
    public static final Lesson[] ALL={
        new Lesson("King & rook","Can force mate","Your king must help. The rook cuts off ranks or files; the king takes away the final escape squares. Keep the rook safe.",
            "1. Cut the board with your rook.\n2. Bring your king up without giving the rook away.\n3. Use opposition to push the king to an edge.\n4. Check along the edge only when your king covers the escapes.","1R6",
            "4k3/R7/4K3/8/8/8/8/8 w - - 0 1","a7a8",true),
        new Lesson("King & queen","Can force mate","Use the queen to shrink the king's box, then bring your king closer. Do not remove every legal move without giving check: that is stalemate, not mate.",
            "1. Fence the enemy king into a smaller box.\n2. Stop shrinking the box when the king reaches the edge.\n3. Bring your king up to support the queen.\n4. Deliver a protected checkmate and check for stalemate first.","1Q6",
            "7k/8/5KQ1/8/8/8/8/8 w - - 0 1","g6g7",true),
        new Lesson("King & two bishops","Can force mate","Two bishops on opposite-colored squares can cover both colors. Keep them coordinated with the king. Two bishops confined to the same color cannot mate a lone king.",
            "1. Place the bishops on neighboring diagonals.\n2. Bring your king toward the defender.\n3. Reduce the available space toward a corner.\n4. One bishop gives check while the king and other bishop cover the escapes.","1BB5",
            "k7/8/BK1B4/8/8/8/8/8 w - - 0 1","a6b7",true),
        new Lesson("King, bishop & knight","Can force mate · advanced","Mate can be forced with accurate technique. The final corner must be the bishop's color. This is substantially harder than rook or queen mate.",
            "1. Coordinate all three pieces to restrict the king.\n2. Drive it to an edge.\n3. Use the knight to transfer it toward a bishop-colored corner.\n4. Check every escape square; the 50-move rule still applies.","1BN5",
            "k7/2K5/B7/1N6/8/8/8/8 w - - 0 1","a6b7",true),
        new Lesson("King & two knights","Mate possible, not generally forced","Against a lone king, two knights cannot force mate from a normal unrestricted position against correct defense. Mate positions do exist: the defender must have allowed one. This is different from impossible mate.",
            "1. Compare the finish pattern with the general practice position.\n2. The finish is deliberately arranged after a defender's mistake.\n3. In general play the defender avoids the mating corner.\n4. Do not confuse cannot force mate with no legal mate being possible.","1NN5",
            "k1N5/2K5/8/3N4/8/8/8/8 w - - 0 1","d5b6",true),
        new Lesson("King & bishop","Mate impossible vs lone king","A single bishop cannot cover both square colors. With only these kings and one bishop, no legal sequence can produce checkmate: the position is dead and drawn.",
            "The king cannot stand adjacent to the enemy king. The bishop covers only one color, leaving an escape. Extra opposing pieces can change the analysis; this lesson is specifically against a lone king.","1B6","","",false),
        new Lesson("King & knight","Mate impossible vs lone king","One knight and a king cannot close all the lone king's escape squares. No legal sequence can produce checkmate with only this material: the position is dead and drawn.",
            "A knight can give check but cannot cover the remaining escapes with its king. Extra opposing material can change what is possible. Kings alone are also a dead draw.","1N6","","",false)
    };
    public static Game position(int index,int side,boolean pattern) {
        if(index<0||index>=ALL.length||side<0||side>1)throw new IllegalArgumentException("Unknown endgame/side");
        Lesson l=ALL[index];Game g=ChessPosition.fromFen(pattern&&!l.pattern.isEmpty()?l.pattern:l.fen);
        if(side==1){int[] original=g.b.clone();for(int i=0;i<64;i++)g.b[63-i]=-original[i];g.turn=1;ChessPosition.initializeHistory(g);}
        if(g.insufficient()){g.winner=2;g.note="Dead position: checkmate is impossible with this material.";}
        return g;
    }
    public static String cue(Game game,int side) {
        int opponent=side==0?-6:6,square=0;
        for(int i=0;i<64;i++)if(game.b[i]==opponent)square=i;
        boolean edge=square/8==0||square/8==7||square%8==0||square%8==7;
        return edge?"The king is on the edge. Coordinate your king and pieces, cover its escapes, and avoid stalemate.":
                "Restrict the enemy king's space, keep your pieces safe, and bring your king closer.";
    }
}
