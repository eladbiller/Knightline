package com.traillink;

import java.util.*;

/** Offline, bounded bots. Hidden-information games never enter perfect-information search. */
public final class Bot implements java.io.Serializable {
 private static final long serialVersionUID=1L;
 public static final String[] LEVELS={"Easy","Medium","Hard"};
 final int level;final Random random;final int[] memory=new int[16];
 transient long deadline;transient int nodes;
 public Bot(int level,long seed){this.level=Math.max(0,Math.min(2,level));random=new Random(seed);}
 public void observe(Game g,int player){if(g.id!=12)return;int[] visible=g.view(player);for(int i=0;i<16;i++)if(visible[i]!=0)memory[i]=visible[i];}
 public int[] choose(Game original,int player){
  // Sanitize a private copy before any evaluation: no enemy fleet, hidden rank,
  // unrevealed card, secret word, or host random-generator state reaches search.
  Game g=original.copy();int[] visible=original.view(player);g.rng=new Random(0);
  if(g.id==1||g.id==12)g.b=visible;
  if(g.id==7){Arrays.fill(g.b,0);for(int i=0;i<100;i++)g.b[player*100+i]=visible[100+i]==2||visible[100+i]==3?1:0;}

  ArrayList<int[]> moves=g.legal();if(moves.isEmpty())return null;
  if(level==0)return moves.get(random.nextInt(moves.size()));
  if(g.id==1||g.id==7||g.id==12||g.id==13||g.id==14||g.id==11)return special(g,visible,moves,player);
  deadline=System.nanoTime()+(level==1?250_000_000L:900_000_000L);nodes=0;
  Collections.shuffle(moves,random);int[] best=moves.get(0);int maxDepth=g.id==5?(level==2?9:2):(level==2?3:1);
  for(int depth=1;depth<=maxDepth;depth++){
   int[] iteration=best;double highest=-Double.MAX_VALUE;boolean complete=true;
   for(int[] m:candidates(g,moves)){
    if(expired()){complete=false;break;}Game c=next(g,m);double value=search(c,depth-1,player,-1e9,1e9);
    if(value>highest){highest=value;iteration=m;}
   }
   if(complete)best=iteration;else break;
  }
  return best;
 }
 boolean expired(){return System.nanoTime()>deadline||nodes>18000||Thread.currentThread().isInterrupted();}
 Game next(Game g,int[] m){Game c=g.copy();c.history.clear();c.commentary.clear();c.move(c.turn,m[0],m[1],5);return c;}
 ArrayList<int[]> candidates(Game g,ArrayList<int[]> all){if(g.id!=6||all.size()<25)return all;ArrayList<int[]> near=new ArrayList<>();for(int[] m:all){int a=m[0];boolean neighbor=false;for(int dr=-2;dr<=2;dr++)for(int dc=-2;dc<=2;dc++){int r=a/11+dr,c=a%11+dc;if(r>=0&&r<11&&c>=0&&c<11&&g.b[r*11+c]!=0)neighbor=true;}if(neighbor||a==60)near.add(m);}return near;}
 double search(Game g,int depth,int player,double alpha,double beta){nodes++;if(depth==0||g.winner>=0||expired())return evaluate(g,player);boolean maximize=g.turn==player;double best=maximize?-1e9:1e9;ArrayList<int[]> legal=candidates(g,g.legal());if(legal.isEmpty())return evaluate(g,player);for(int[] m:legal){double v=search(next(g,m),depth-1,player,alpha,beta);if(maximize){best=Math.max(best,v);alpha=Math.max(alpha,best);}else{best=Math.min(best,v);beta=Math.min(beta,best);}if(beta<=alpha||expired())break;}return best;}
 double evaluate(Game g,int player){if(g.winner>=0)return g.winner==2?0:g.winner==player?100000:-100000;double value=0;int sign=player==0?1:-1;
  if(g.id==0){int[] values={0,100,320,330,500,900,0};for(int i=0;i<64;i++){int p=Math.abs(g.b[i]);if(p==0)continue;int own=Integer.signum(g.b[i])*sign;double center=7-Math.abs(3.5-i%8)-Math.abs(3.5-i/8);value+=own*(values[p]+(p==2||p==3?center*7:0)+(p==1?(g.b[i]>0?6-i/8:i/8-1)*7:0));}return value;}
  if(g.id==2){for(int i=0;i<64;i++)value+=Integer.signum(g.b[i])*sign*(Math.abs(g.b[i])==2?180:100);return value;}
  if(g.id==3){for(int i=0;i<64;i++)if(g.b[i]!=0){boolean corner=i==0||i==7||i==56||i==63;boolean danger=i==9||i==14||i==49||i==54;value+=g.b[i]*sign*(corner?100:danger?-20:3);}return value;}
  if(g.id==4||g.id==5||g.id==6){int width=g.id==4?7:g.id==5?3:11,height=g.id==4?6:width,need=g.id==4?4:g.id==5?3:5;for(int r=0;r<height;r++)for(int c=0;c<width;c++)for(int[] d:new int[][]{{1,0},{0,1},{1,1},{1,-1}}){int endR=r+d[0]*(need-1),endC=c+d[1]*(need-1);if(endR<0||endR>=height||endC<0||endC>=width)continue;int mine=0,theirs=0;for(int k=0;k<need;k++){int v=g.b[(r+d[0]*k)*width+c+d[1]*k]*sign;if(v>0)mine++;if(v<0)theirs++;}if(theirs==0)value+=Math.pow(7,mine);if(mine==0)value-=Math.pow(7,theirs);}return value;}
  if(g.id==8){value=100*(g.score[player]-g.score[1-player]);for(int r=0;r<4;r++)for(int c=0;c<4;c++){int edges=0;for(int i:new int[]{r*4+c,(r+1)*4+c,20+r*5+c,20+r*5+c+1})if(g.b[i]!=0)edges++;if(edges==3)value+=g.turn==player?35:-35;}return value;}
  if(g.id==9){value=30*(g.b[player==0?6:13]-g.b[player==0?13:6]);for(int i=0;i<6;i++)value+=g.b[(player==0?0:7)+i]-g.b[(player==0?7:0)+i];return value+(g.turn==player?5:-5);}
  if(g.id==10){value=100*(g.pieces(player)-g.pieces(1-player));for(int[] mill:Game.MILLS){int mine=0,theirs=0;for(int i:mill){if(g.owner(g.b[i])==player)mine++;if(g.owner(g.b[i])==1-player)theirs++;}if(theirs==0)value+=mine*mine*10;if(mine==0)value-=theirs*theirs*10;}if(g.phase==1)value+=g.turn==player?90:-90;return value;}
  return 100*(g.score[player]-g.score[1-player]);
 }
 static boolean goEye(Game g,int a,int player){if(a<0)return false;for(int t:Game.neighbors(a))if(g.owner(g.b[t])!=player)return false;return true;}
 int[] special(Game g,int[] visible,ArrayList<int[]> moves,int player){double best=-1e9;int[] chosen=moves.get(0);for(int[] m:moves){int a=m[0],z=m[1];double v=random.nextDouble()*(level==1?5:1);
  if(g.id==11){int xor=0;for(int i=0;i<3;i++)xor^=g.b[i]-(i==a?z:0);if(xor==0)v+=100;if(level==1&&random.nextDouble()<.25)v-=110;}
  if(g.id==14){int threshold=level==1?12:Math.max(12,Math.min(22,50-g.score[player]));v+=(a==1&&(g.phase>=threshold||g.phase+g.score[player]>=50)||a==0&&g.phase<threshold?100:0);}

  if(g.id==13){if(g.phase==1){if(a==-4)v+=1000;else v-=1000;}else if(a==-3){boolean movesLeft=false;for(int[] option:moves)if(option[0]>=0&&!goEye(g,option[0],player))movesLeft=true;v+=movesLeft?-1000:1000;}else{int[] next=g.goBoard(a);if(next!=null){int captured=0;for(int i=0;i<81;i++)if(g.b[i]!=0&&next[i]==0)captured++;int liberties=Game.liberties(next,Game.group(next,a));v+=captured*40+(liberties<=1?-35:liberties*2);if(goEye(g,a,player))v-=150;v+=4-Math.abs(a%9-4)*.3-Math.abs(a/9-4)*.3;if(level==2){for(int t:Game.neighbors(a))if(next[t]!=0&&g.owner(next[t])!=player&&Game.liberties(next,Game.group(next,t))==1)v+=18;}}}}
  if(g.id==12&&a>=0){if(g.phase==1&&memory[a]!=0&&memory[a]==visible[g.selected])v+=100;else if(g.phase==0&&memory[a]!=0)for(int i=0;i<16;i++)if(i!=a&&g.aux[i]==0&&memory[i]==memory[a])v+=50;if(level==1&&random.nextDouble()<.35)v=0;}
  if(g.id==7){if(level==2&&(a/10+a%10)%2==0)v+=3;for(int step:new int[]{-10,10,-1,1}){int t=a+step;if(t>=0&&t<100&&Math.abs(t/10-a/10)+Math.abs(t%10-a%10)==1&&visible[t]==2){v+=20;if(level==2){int u=t+step;if(u>=0&&u<100&&Math.abs(u/10-t/10)+Math.abs(u%10-t%10)==1&&visible[u]==2)v+=20;}}}}
  if(g.id==1){int atk=Math.abs(g.b[a]),def=Math.abs(g.b[z]);v+=(player==0?a/10-z/10:z/10-a/10)*1.5;if(def==13)v+=atk==2?8:atk>=8?-6:2;else if(def>0){int result=def==12?1:def==11?(atk==3?1:-1):atk==1&&def==10?1:Integer.compare(atk,def);v+=result>0?30+def:result==0?3:-(20+atk);}if(level==2){for(int d:new int[]{-10,10,-1,1}){int t=z+d;if(t>=0&&t<100&&Math.abs(t/10-z/10)+Math.abs(t%10-z%10)==1&&g.owner(g.b[t])==1-player){int rank=Math.abs(g.b[t]);if(rank>atk&&rank<=10)v-=15;}}}}
  if(v>best){best=v;chosen=m;}
 }return chosen;}
}
