package com.traillink;

/** Counts captures, including en passant, without mistaking promotion for capture. */
public final class MoveFeedback {
    public static int pieces(int[] board){int n=0;for(int p:board)if(p!=0)n++;return n;}
    public static String cue(int before,int after,int winner){return winner>=0?"finish":before>after?"capture":"move";}
}
