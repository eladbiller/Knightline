package com.traillink;
import java.util.*;
public final class GameTest {
 static int assertions=0;
 static void check(boolean ok,String label){assertions++;if(!ok)throw new AssertionError(label);}
 static void play(Game g,int a,int b){check(g.move(g.turn,a,b,5),Game.NAMES[g.id]+" rejected "+a+","+b);}
 static Game empty(int id){Game g=new Game(id,1);Arrays.fill(g.b,0);g.setup=false;return g;}
 static long perft(Game g,int depth){if(depth==0)return 1;long nodes=0;for(int[] m:g.legal()){int[] b=g.b.clone();int ep=g.ep,rights=g.rights,quiet=g.quiet,turn=g.turn;g.chessApply(m[0],m[1],5);g.turn=1-g.turn;nodes+=perft(g,depth-1);g.b=b;g.ep=ep;g.rights=rights;g.quiet=quiet;g.turn=turn;}return nodes;}
 public static void main(String[] args){run();System.out.println("PASS: "+assertions+" assertions");}
 public static void run(){
  check(perft(new Game(0,1),3)==8902,"Chess opening perft depth 3 = 8902");
  Game g=new Game(0,1);check(g.legal().size()==20,"Chess opening 20 moves");check(!g.move(1,8,16,5),"Wrong player rejected");check(!g.move(0,60,44,5),"Illegal king rejected");play(g,53,45);play(g,12,28);play(g,54,38);play(g,3,39);check(g.winner==1,"Fool's mate");
  g=empty(0);g.b[60]=6;g.b[63]=4;g.b[4]=-6;check(g.chessLegal(60,62),"Legal castling");g.b[5]=-4;check(!g.chessLegal(60,62),"Cannot castle through check");g.b[5]=0;play(g,60,62);check(g.b[61]==4&&g.b[62]==6,"Castling moves rook");
  g=new Game(0,1);play(g,52,36);play(g,8,16);play(g,36,28);play(g,11,27);play(g,28,19);check(g.b[27]==0&&g.b[19]==1,"En passant");
  g=empty(0);g.b[60]=6;g.b[4]=-6;g.b[8]=1;check(g.move(0,8,0,2)&&g.b[0]==2,"Knight promotion");
  g=empty(0);g.b[60]=6;g.b[4]=-4;g.b[0]=-6;g.b[52]=4;check(!g.chessLegal(52,51),"Pinned rook");
  g=new Game(0,1);for(int t=0;t<2;t++){play(g,62,45);play(g,6,21);play(g,45,62);play(g,21,6);}check(g.winner==2,"Threefold repetition");
  g=empty(1);g.b[60]=1;g.b[50]=-10;g.b[0]=-12;g.b[99]=12;play(g,60,50);check(g.b[50]==1,"Spy defeats attacking marshal");g=empty(1);g.b[60]=3;g.b[50]=-11;g.b[0]=-12;g.b[1]=-2;play(g,60,50);check(g.b[50]==3,"Miner defuses bomb");g=new Game(1,2);for(int i=0;i<40;i++)check(g.view(0)[i]==-13,"Stratego hides ranks");
  g=empty(2);g.b[42]=1;g.b[35]=-1;g.b[19]=-1;g.b[1]=-1;check(!g.move(0,42,33,5),"Forced checkers capture");play(g,42,28);check(g.chain==28&&g.turn==0,"Multiple jump continues");play(g,28,10);check(g.b[19]==0&&g.turn==1,"Second jump");
  g=new Game(3,1);check(g.legal().size()==4,"Reversi opening moves");play(g,19,0);check(g.b[27]==1,"Reversi flips bracket");
  g=new Game(4,1);for(int i=0;i<3;i++){play(g,0,0);play(g,1,0);}play(g,0,0);check(g.winner==0,"Connect four vertical");
  g=new Game(5,1);for(int a:new int[]{0,3,1,4,2})play(g,a,0);check(g.winner==0,"Tic tac toe win");
  g=new Game(6,1);for(int i=0;i<4;i++){play(g,i,0);play(g,11+i,0);}play(g,4,0);check(g.winner==0,"Gomoku five");
  g=new Game(7,1);for(int p=0;p<2;p++){g.randomSetup(p);check(g.move(p,-10,0,0),"Fleet locks");}check(Arrays.stream(g.b).filter(v->v>0).count()==34,"Battleship fleet sizes");for(int i=0;i<100;i++)check(g.view(0)[i]==0,"Enemy fleet hidden");int target=0;while(g.b[100+target]==0)target++;play(g,target,0);check(g.score[0]==1,"Battleship hit scores");check(!g.move(0,target,0,5),"Out of turn shot rejected");
  g=new Game(8,1);for(int a:new int[]{0,4,20,21})play(g,a,0);check(g.score[1]==1&&g.turn==1,"Dots box extra turn");
  g=new Game(9,1);play(g,2,0);check(g.turn==0&&g.b[6]==1,"Mancala store extra turn");check(Arrays.stream(g.b).sum()==48,"Mancala conserves stones");
  g=new Game(10,1);for(int a:new int[]{0,3,1,4,2})play(g,a,0);check(g.phase==1&&g.turn==0,"Morris mill removal");play(g,3,0);check(g.b[3]==0&&g.turn==1,"Morris removes opponent");
  g=new Game(11,1);play(g,0,3);play(g,1,5);play(g,2,7);check(g.winner==0,"Nim last wins");check(!g.move(g.turn,0,1,5),"Finished game locked");
  g=new Game(12,1);int mate=1;while(g.b[mate]!=g.b[0])mate++;play(g,0,0);play(g,mate,0);check(g.score[0]==1&&g.turn==0,"Memory matched pair");check(g.view(1)[0]!=0,"Matched card public");
  g=new Game(13,1);check(g.move(0,40,0,5),"Go center placement");check(!g.move(1,40,0,5),"Occupied Go point rejected");check(g.move(1,-3,0,5)&&g.move(0,-3,0,5),"Go passes");check(g.move(0,-4,0,5)&&g.move(1,-4,0,5)&&g.winner>=0,"Go agreed area score");
  g=new Game(14,1);check(!g.move(0,1,0,5),"Cannot hold zero");for(int i=0;i<10000&&g.winner<0;i++){play(g,g.phase>=12?1:0,0);}check(g.winner>=0,"Dice duel completes");
  Random random=new Random(28);for(int id=0;id<15;id++){int completed=0;for(int run=0;run<5;run++){g=new Game(id,run);if(g.setup)for(int p=0;p<2;p++){g.randomSetup(p);g.move(p,-10,0,0);}for(int step=0;step<500&&g.winner<0;step++){ArrayList<int[]> legal=g.legal();check(!legal.isEmpty(),Game.NAMES[id]+" has legal action");int[] m=legal.get(random.nextInt(legal.size()));int before=g.seq;play(g,m[0],m[1]);check(g.seq==before+1,"Sequence increments exactly once");if(id==9)check(Arrays.stream(g.b).sum()==48,"Mancala invariant");}if(g.winner>=0)completed++;}System.out.println(Game.NAMES[id]+": "+completed+"/5 random matches completed (500-action cap)");}
 }
}
