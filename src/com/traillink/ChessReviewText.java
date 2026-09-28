package com.traillink;

/** Presentation for both saved v3.1 reports and current Stockfish results. */
public final class ChessReviewText {
    public final String report, reason, side, playedScore, bestScore;
    private ChessReviewText(String report, String reason, String side, String played, String best) {
        this.report=report;this.reason=reason;this.side=side;playedScore=played;bestScore=best;
    }
    public static ChessReviewText from(String report) {
        String[] lines=report.split("\n");
        String side="",best="",played="";
        if(lines.length>4 && lines[4].startsWith("Evaluation for ")) {
            String line=lines[4];int colon=line.indexOf(": best "),split=line.indexOf("; played ");
            if(colon>=0&&split>colon){side=line.substring(15,colon);best=line.substring(colon+7,split);played=line.substring(split+9);if(played.endsWith("."))played=played.substring(0,played.length()-1);}
        }
        String reason=lines.length>3?lines[3]:"Stockfish is analyzing this move.";
        boolean same=lines.length>2&&lines[1].startsWith("Played: ")&&lines[2].startsWith("Best found: ")&&lines[1].substring(8).equals(lines[2].substring(12));
        if(same&&!best.isEmpty()){
            played=best;
            reason=sameMoveReason(side,best);
            lines[3]=reason;
            lines[4]="Evaluation for "+side+": best "+best+"; played "+best+".";
        }else if(reason.contains("Mate scores are shown below")){
            reason="Stockfish predicts forced mate. Compare the two evaluation cards.";
            lines[3]=reason;
        }
        return new ChessReviewText(String.join("\n",lines),reason,side,displayScore(side,played),displayScore(side,best));
    }
    static String other(String side){return side.equals("White")?"Black":"White";}
    static String sameMoveReason(String side,String score){
        if(score.startsWith("opponent mate in "))return "Best move found, but "+other(side)+" still has forced mate in "+score.substring(17)+".";
        if(score.startsWith("mate in "))return "Your move keeps a forced mate in "+score.substring(8)+" for "+side+".";
        return "Your move matches Stockfish's recommendation; there is no better alternative in this search.";
    }
    static String displayScore(String side,String score){
        if(score.isEmpty())return "Analyzing…";
        if(score.startsWith("opponent mate in "))return other(side)+" mates in "+score.substring(17);
        if(score.startsWith("mate in "))return side+" mates in "+score.substring(8);
        if(score.equals("checkmated"))return side+" is checkmated";
        return score+" pawns";
    }
}
