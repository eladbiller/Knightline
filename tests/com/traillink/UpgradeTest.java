package com.traillink;
import java.util.*;
public final class UpgradeTest {
 static int assertions=0;
 static void check(boolean b,String s){assertions++;if(!b)throw new AssertionError(s);}
 static void setup(Game g){if(g.setup)for(int p=0;p<2;p++){g.randomSetup(p);check(g.move(p,-10,0,0),"Ready accepted");}}
 public static void main(String[] args){run();System.out.println("Upgrade PASS: "+assertions+" assertions");}
 public static void run(){
  Game g=new Game(1,6);check(g.n==10&&g.setup,"Full-size Stratego setup");for(int p=0;p<2;p++){int[] ranks=new int[14];for(int v:g.b)if(g.owner(v)==p)ranks[Math.abs(v)]++;check(Arrays.equals(Arrays.copyOf(ranks,13),new int[]{0,1,8,5,4,4,4,3,2,1,1,6,1}),"40-piece army composition");}int a=g.b[60],b=g.b[61];check(g.move(0,60,61,0)&&g.b[60]==b&&g.b[61]==a,"Manual army swap");check(!g.move(0,60,0,0),"Cannot move into other setup zone");check(g.move(1,-10,0,0)&&!g.move(1,0,1,0),"Ready locks layout");check(g.move(0,-10,0,0)&&!g.setup,"Both ready start");
  g=new Game(1,1);g.setup=false;Arrays.fill(g.b,0);g.b[60]=2;g.b[99]=12;g.b[0]=-12;g.b[9]=-2;check(g.tacticoLegal(60,10,0),"Long scout movement");g.b[40]=2;check(!g.tacticoLegal(40,44,0),"Scout blocked by lake");g.b[40]=1;check(!g.tacticoLegal(60,10,0),"Scout cannot jump");g.b[40]=0;g.shuttles[0]=3;g.lastFrom[0]=50;g.lastTo[0]=60;check(!g.tacticoLegal(60,50,0),"Fourth repeated traversal blocked");
  g=new Game(7,1);check(!g.move(0,-10,0,0),"Incomplete fleet cannot lock");check(!g.move(0,8,1,0),"Off-board ship blocked");check(g.move(0,0,1,0),"Manual carrier");check(!g.move(0,2,10,1),"Overlap blocked");check(g.move(0,10,1,0)&&g.b[0]==0&&g.b[10]==1,"Reposition removes old ship");for(int i=1;i<5;i++)check(g.move(0,(i+1)*10,1,i),"Manual ship placement");check(g.setupComplete(0),"Five full-size ships");check(g.move(0,-10,0,0)&&!g.move(0,0,1,0),"Fleet locked");g.randomSetup(1);check(g.move(1,-10,0,0),"Battle starts");for(int i=0;i<100;i++)check(g.view(0)[i]==0,"Enemy fleet hidden");
  for(int id=0;id<15;id++)for(int level=0;level<3;level++){g=new Game(id,19);setup(g);Bot bot=new Bot(level,4);int player=g.turn;bot.observe(g,player);long start=System.currentTimeMillis();int[] m=bot.choose(g,player);check(m!=null&&g.move(player,m[0],m[1],5),Game.NAMES[id]+" legal bot at level "+level);check(System.currentTimeMillis()-start<10000,"Bot bounded computation");}
  // Same public position + seed => same decision, even if the secret is changed.
  for(int id:new int[]{1,7,12}){g=new Game(id,8);setup(g);Game other=g.copy();if(id==7){Arrays.fill(other.b,100,200,0);other.setup=true;other.prepared[1]=false;other.randomSetup(1);other.setup=false;}if(id==1){int t=other.b[0];other.b[0]=other.b[20];other.b[20]=t;}if(id==12){int t=other.b[0];other.b[0]=other.b[7];other.b[7]=t;}int[] x=new Bot(2,7).choose(g,0),y=new Bot(2,7).choose(other,0);check(Arrays.equals(x,y),"No secret-information advantage: "+Game.NAMES[id]);}
  g=new Game(5,4);g.b[0]=g.b[1]=1;g.b[3]=g.b[4]=-1;int[] win=new Bot(2,9).choose(g,0);check(win[0]==2,"Hard bot finds immediate win");
  g=new Game(11,1);int[] nim=new Bot(2,1).choose(g,0);g.move(0,nim[0],nim[1],5);check((g.b[0]^g.b[1]^g.b[2])==0,"Hard Nim optimal strategy");
  g=new Game(0,1);g.move(0,53,45,5);g.move(1,12,28,5);g.move(0,54,38,5);g.move(1,3,39,5);check(g.history.size()==5&&g.chessMoves.size()==4&&g.chessStates.size()==5,"Complete replay history");String report=new ChessAnalysis(3000).analyze(ChessAnalysis.position(g,3),g.chessMoves.get(3));check(report.contains("Best found: Qh4#")&&report.contains("forced mate"),"Engine finds Fool's mate: "+report);System.out.println(report);
  Game pos=new Game(0,2);Arrays.fill(pos.b,0);pos.b[60]=6;pos.b[4]=-6;pos.b[35]=5;pos.b[27]=-5;String mistake=new ChessAnalysis(3000).analyze(pos,new int[]{60,61,5});check(mistake.contains("Best found: Qxd5")&&mistake.contains("Blunder"),"Engine flags missed free queen: "+mistake);System.out.println(mistake);
 }
}
