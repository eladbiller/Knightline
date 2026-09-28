package com.traillink;

import java.util.*;

/** Small independent offline chess engine: iterative alpha-beta + capture quiescence.
 * Scores are estimates, not Stockfish/Chess.com accuracy ratings. */
public final class ChessAnalysis {
 public int[] bestMove={-1,-1,5};
 static final int MATE=100000;final long budgetMs;long deadline;int nodes;
 static final class Timeout extends RuntimeException {public synchronized Throwable fillInStackTrace(){return this;}}
 static final Timeout TIMEOUT=new Timeout();
 public ChessAnalysis(long budgetMs){this.budgetMs=budgetMs;}
 public static Game position(Game match,int ply){Game g=new Game(0,0);g.b=Arrays.copyOf(match.history.get(ply),200);int[] meta=match.chessStates.get(ply);g.turn=meta[0];g.ep=meta[1];g.rights=meta[2];g.quiet=meta[3];g.history.clear();g.chessStates.clear();g.commentary.clear();return g;}
 static String notation(int[] m){return Game.square(m[0])+"–"+Game.square(m[1])+(m[2]!=5?"="+Game.pieceName(m[2]):"");}
 public String analyze(Game position,int[] played){deadline=System.nanoTime()+budgetMs*1_000_000L;nodes=0;ArrayList<int[]> moves=moves(position);if(moves.isEmpty())return "No legal moves in this position.";int[] best=moves.get(0);int bestScore=-MATE,playedScore=-MATE,completed=0;String continuation="";
  for(int depth=1;depth<=4;depth++){int iterationBest=-MATE*2,iterationPlayed=-MATE*2;int[] iterationMove=best;try{for(int[] m:moves){Game child=next(position,m);int value=-search(child,depth-1,-MATE*2,MATE*2,1);if(value>iterationBest){iterationBest=value;iterationMove=m;}if(m[0]==played[0]&&m[1]==played[1]&&m[2]==played[2])iterationPlayed=value;}if(iterationPlayed==-MATE*2)break;best=iterationMove;bestScore=iterationBest;playedScore=iterationPlayed;completed=depth;}catch(Timeout e){break;}}
  bestMove=best.clone();if(completed==0){bestMove=new int[]{-1,-1,5};return "Analysis budget exhausted before a complete search. Try analysis again on this phone.";}
  // Search a short reply line separately; score comparisons above use the same completed depth.
  try{Game child=next(position,best);int value=-MATE*2;int[] reply=null;for(int[] m:moves(child)){int score=-search(next(child,m),Math.max(0,completed-2),-MATE*2,MATE*2,2);if(score>value){value=score;reply=m;}}if(reply!=null)continuation=" Suggested line: "+ChessNotation.san(position,best[0],best[1],best[2])+", "+ChessNotation.san(child,reply[0],reply[1],reply[2])+".";}catch(Timeout e){}
  int loss=Math.max(0,bestScore-playedScore);boolean same=Arrays.equals(best,played);String verdict=same?"Best move found":loss<30?"Good move":loss<80?"Small inaccuracy":loss<200?"Mistake":"Blunder";
  String side=position.turn==0?"White":"Black";String reason=loss<30?"Your move kept approximately the same evaluation.":"The engine prefers the alternative by about "+String.format(Locale.ROOT,"%.2f",loss/100.0)+" pawns.";if(bestScore>90000&&playedScore<90000)reason="The search found a forced mate with the alternative, but not with your move.";if(playedScore< -90000&&bestScore> -90000)reason="Your move allows a forced mate in the searched line.";
  return verdict+"\nPlayed: "+ChessNotation.san(position,played[0],played[1],played[2])+"\nBest found: "+ChessNotation.san(position,best[0],best[1],best[2])+"\n"+reason+"\nEvaluation for "+side+": best "+score(bestScore)+"; played "+score(playedScore)+"."+continuation+"\nDepth "+completed+" + tactical capture search • "+nodes+" nodes. Limited offline engine; recommendations can change with deeper search.";
 }
 static String score(int cp){if(cp>90000)return "forced mate";if(cp< -90000)return "opponent has forced mate";return String.format(Locale.ROOT,"%+.2f",cp/100.0);}
 void tick(){nodes++;if((nodes&63)==0&&(System.nanoTime()>deadline||Thread.currentThread().isInterrupted()))throw TIMEOUT;}
 int search(Game g,int depth,int alpha,int beta,int ply){tick();if(depth<=0)return quiet(g,alpha,beta,ply,0);ArrayList<int[]> legal=moves(g);if(legal.isEmpty())return g.check(g.turn)?-MATE+ply:0;if(g.quiet>=100||g.insufficient())return 0;for(int[] m:legal){int score=-search(next(g,m),depth-1,-beta,-alpha,ply+1);if(score>=beta)return score;if(score>alpha)alpha=score;}return alpha;}
 int quiet(Game g,int alpha,int beta,int ply,int extension){tick();boolean check=g.check(g.turn);ArrayList<int[]> legal=moves(g);if(legal.isEmpty())return check?-MATE+ply:0;int staticScore=evaluate(g);if(extension>=5)return staticScore;if(!check){if(staticScore>=beta)return staticScore;alpha=Math.max(alpha,staticScore);}for(int[] m:legal){boolean capture=g.b[m[1]]!=0||Math.abs(g.b[m[0]])==1&&(m[1]==g.ep||m[1]/8==0||m[1]/8==7);if(!check&&!capture)continue;int score=-quiet(next(g,m),-beta,-alpha,ply+1,extension+1);if(score>=beta)return score;alpha=Math.max(alpha,score);}return alpha;}
 static Game next(Game g,int[] m){Game c=g.copy();c.chessApply(m[0],m[1],m[2]);c.turn=1-c.turn;return c;}
 static ArrayList<int[]> moves(Game g){ArrayList<int[]> out=new ArrayList<>();for(int a=0;a<64;a++){if(g.owner(g.b[a])!=g.turn)continue;int piece=Math.abs(g.b[a]);for(int z=0;z<64;z++)if(g.chessLegal(a,z)){if(piece==1&&(z/8==0||z/8==7)){for(int promotion:new int[]{5,4,3,2})out.add(new int[]{a,z,promotion});}else out.add(new int[]{a,z,5});}}out.sort((a,b)->Integer.compare(order(g,b),order(g,a)));return out;}
 static int order(Game g,int[] m){int[] val={0,100,320,330,500,900,10000};return (g.b[m[1]]!=0?10*val[Math.abs(g.b[m[1]])]-val[Math.abs(g.b[m[0]])]:0)+(Math.abs(g.b[m[0]])==1&&(m[1]/8==0||m[1]/8==7)?val[m[2]]:0);}
 static int evaluate(Game g){int[] val={0,100,320,335,500,900,0};int score=0;for(int i=0;i<64;i++){int p=Math.abs(g.b[i]);if(p==0)continue;int color=Integer.signum(g.b[i]),rank=color>0?7-i/8:i/8;double center=7-Math.abs(3.5-i%8)-Math.abs(3.5-i/8);int bonus=(p==2||p==3)?(int)(center*8):p==1?rank*8:0;if(p==6&&rank==0&&(i%8==6||i%8==2))bonus+=25;score+=color*(val[p]+bonus);}return score*(g.turn==0?1:-1);}
}
