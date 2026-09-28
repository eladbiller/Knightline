package com.traillink;
import java.util.*;
public final class TimelineTest {
 static int assertions;
 static void check(boolean condition,String message){assertions++;if(!condition)throw new AssertionError(message);}
 static void move(Game g,String uci){int a=(8-(uci.charAt(1)-'0'))*8+uci.charAt(0)-'a',z=(8-(uci.charAt(3)-'0'))*8+uci.charAt(2)-'a';int promote=uci.length()==5?"  nbrq".indexOf(uci.charAt(4)):5;check(g.move(g.turn,a,z,promote),"Legal fixture "+uci);}
 static Game line(String moves){Game g=new Game(0,1);for(String m:moves.split(" "))move(g,m);return g;}
 static void same(Game a,Game b){check(Arrays.equals(a.b,b.b),"Board restored");check(a.turn==b.turn&&a.rights==b.rights&&a.ep==b.ep&&a.quiet==b.quiet,"Special rights and clocks restored");check(a.repetition.equals(b.repetition),"Repetition restored");check(a.lastMove.equals(b.lastMove)&&a.seq==b.seq,"Last move and sequence restored");}
 static void invalid(Game g,int ply){try{ChessTimeline.branch(g,ply);throw new AssertionError("Expected rejection");}catch(IllegalArgumentException expected){assertions++;}}
 public static void main(String[] args){run();System.out.println("Timeline PASS: "+assertions);}
 static void run(){
  Game g=line("e2e4 e7e5 g1f3 b8c6 f1c4 g8f6 e1g1");
  check(ChessTimeline.undoPly(g,true,0)==6,"Undo human move before reply");check(ChessTimeline.undoPly(g,true,1)==5,"Undo decision plus opponent reply");check(ChessTimeline.undoPly(g,false,0)==6,"Pass-play one ply");
  Game prior=line("e2e4 e7e5 g1f3 b8c6 f1c4 g8f6"),branch=ChessTimeline.branch(g,6);same(branch,prior);check(branch.rights==15,"Castling rights recovered");move(branch,"e1g1");same(branch,g);
  g.analysis.add("old");g.analysisBest.add(new int[]{52,36,5});branch=ChessTimeline.branch(g,4);check(branch.chessMoves.size()==4&&branch.analysis.isEmpty()&&branch.analysisBest.isEmpty(),"Future moves and old review removed");branch.b[0]=0;check(g.b[0]!=0&&g.chessMoves.size()==7&&g.analysis.size()==1,"Source untouched");
  Game ep=line("e2e4 a7a6 e4e5 d7d5 e5d6");branch=ChessTimeline.branch(ep,4);check(branch.ep==19&&branch.b[27]==-1&&branch.b[28]==1,"En passant restored before capture");move(branch,"e5d6");same(branch,ep);
  Game repeated=line("g1f3 g8f6 f3g1 f6g8 g1f3 g8f6 f3g1 f6g8");check(repeated.winner==2,"Repetition draw fixture");branch=ChessTimeline.branch(repeated,6);move(branch,"f3g1");move(branch,"f6g8");check(branch.winner==2,"Branch retains repetition draw");invalid(repeated,8);
  Game mate=line("f2f3 e7e5 g2g4 d8h4");invalid(mate,4);branch=ChessTimeline.branch(mate,3);move(branch,"g8f6");check(branch.winner<0,"Alternate future remains playable");invalid(mate,-1);invalid(mate,5);invalid(new Game(7,0),0);
  Game custom=new Game(0,0);Arrays.fill(custom.b,0);custom.b[60]=6;custom.b[4]=-6;custom.b[8]=1;custom.b[7]=-4;custom.rights=0;custom.history.clear();custom.chessStates.clear();custom.commentary.clear();custom.repetition.clear();custom.history.add(Arrays.copyOf(custom.b,64));custom.chessStates.add(new int[]{0,-1,0,0});custom.commentary.add("Custom fixture");custom.remember();move(custom,"a7a8n");branch=ChessTimeline.branch(custom,1);check(branch.b[0]==2,"Underpromotion preserved");check(ChessTimeline.branch(custom,0).b[8]==1,"Promotion rolled back");
  Game resigned=line("e2e4");resigned.winner=1;check(ChessTimeline.branch(resigned,1).winner<0,"Resigned but legal position can be continued");check(ChessTimeline.undoPly(new Game(0,0),true,0)==-1,"No undo at start");check(ChessTimeline.undoPly(line("e2e4"),true,1)==-1,"Cannot undo before first human decision");
 }
}
