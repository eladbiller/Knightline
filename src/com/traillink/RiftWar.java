package com.traillink;

import java.io.Serializable;
import java.util.*;

/** Original, host-authoritative 10 Hz RTS simulation. No Android or network dependencies. */
public final class RiftWar implements Serializable {
 private static final long serialVersionUID=1L;
 public static final int W=36,H=24,WORKER=0,RANGER=1,SCOUT=2,SIEGE=3,MEDIC=4,WING=5,CORE=10,RELAY=11,BARRACKS=12,FACTORY=13,LAB=14,TURRET=15,REFINERY=16,AIRPAD=17;
 public static final int MOVE=1,ATTACK=2,GATHER=3,BUILD=4,TRAIN=5,STOP=6,HOLD=7,RALLY=8,CANCEL=9,RESEARCH=10,REPAIR=11;
 public static final String[] NAMES={"Harvester","Ranger","Rover","Siege crawler","Mender","Wraithwing","","","","","Command core","Supply relay","Barracks","Foundry","Research lab","Sentinel","Gas extractor","Skyport","","","Weapons","Armor"};
 static final int[] ORE={50,50,75,140,75,150,0,0,0,0,400,75,150,200,150,100,75,200,0,0,100,100};
 static final int[] GAS={0,0,25,75,50,100,0,0,0,0,0,0,0,75,75,25,0,100,0,0,75,75};
 static final int[] HP={45,65,100,190,75,120,0,0,0,0,1500,350,700,850,600,350,450,750};
 static final int[] TIME={50,55,70,110,75,120,0,0,0,0,240,90,140,180,150,120,100,200,0,0,180,180};
 static final int[] SUPPLY={1,1,2,3,2,3};
 static final float[] SPEED={1.8f,1.65f,2.8f,.95f,1.8f,3.1f};
 static final float[] RANGE={1.2f,4.2f,3.2f,6.2f,3.5f,4.2f};
 static final int[] DAMAGE={4,8,13,36,0,18},COOLDOWN={12,9,12,28,10,13};
 public static final class Entity implements Serializable {
  private static final long serialVersionUID=1L;
  public int id,side,type,hp,max,build,order=STOP,target=-1,goalX,goalY,cool,work,carry,carryKind,resource,progress,shot=-1,flash;
  public float x,y;public boolean returning;public ArrayList<Integer> queue=new ArrayList<>();public ArrayDeque<Integer> path=new ArrayDeque<>();
  boolean building(){return type>=10;}boolean ready(){return hp>0&&build==0;}boolean air(){return type==WING;}
 }
 public int tick,winner=-1,nextId=1,map,doctrine0;public int[] ore={350,350},gas={50,50},weapons={0,0},armor={0,0};public long[] lastCommand={0,0};
 public int[] terrain=new int[W*H],nodes=new int[W*H],remaining=new int[W*H];public boolean[][] explored=new boolean[2][W*H],visible=new boolean[2][W*H];
 public ArrayList<Entity> entities=new ArrayList<>();public String[] message={"Build an economy. Destroy all enemy structures.","Build an economy. Destroy all enemy structures."};
 int[] commandsThisTick={0,0};transient boolean[] navigation;
 public RiftWar(long seed,int layout,int doctrine){map=Math.floorMod(layout,3);doctrine0=doctrine;Random random=new Random(seed);for(int y=0;y<H;y++)for(int x=0;x<W;x++){boolean rock=(x>=16&&x<=19&&!(y>=9&&y<=14)&&!(map==1&&y>=3&&y<=5)&&!(map==2&&y>=18&&y<=20));if(rock)terrain[y*W+x]=1;}
  for(int side=0;side<2;side++){int bx=side==0?5:30;spawn(side,CORE,bx,12,0);for(int j=0;j<4;j++){int x=side==0?2:33,y=8+j*2;nodes[y*W+x]=1;remaining[y*W+x]=1800;}int gx=side==0?8:27;nodes[7*W+gx]=2;remaining[7*W+gx]=2200;for(int j=0;j<5;j++){Entity e=spawn(side,WORKER,bx+(side==0?2:-2),10+j,0);if(j<4){e.order=GATHER;e.resource=(8+j*2)*W+(side==0?2:33);}}
   int ex=side==0?11:24;for(int j=0;j<3;j++){int at=(map==2?19:3)*W+ex+j;nodes[at]=1;remaining[at]=1600;}nodes[20*W+ex]=2;remaining[20*W+ex]=1800;
  }vision();
 }
 public Entity get(int id){for(Entity e:entities)if(e.id==id&&e.hp>0)return e;return null;}
 Entity spawn(int side,int type,float x,float y,int construction){Entity e=new Entity();e.id=nextId++;e.side=side;e.type=type;e.x=x;e.y=y;e.max=HP[type]+(type>=10&&doctrine(side)==0?HP[type]/5:0);e.hp=construction>0?Math.max(30,e.max/10):e.max;e.build=construction;e.goalX=Math.round(x);e.goalY=Math.round(y);entities.add(e);navigation=null;return e;}
 public int doctrine(int side){return side==0?doctrine0:1-doctrine0;}
 public int supply(int side){int n=0;for(Entity e:entities)if(e.side==side&&e.hp>0){if(!e.building())n+=SUPPLY[e.type];for(int q:e.queue)if(q<6)n+=SUPPLY[q];}return n;}
 public int cap(int side){int n=0;for(Entity e:entities)if(e.side==side&&e.ready())n+=e.type==CORE?12:e.type==RELAY?8:0;return Math.min(100,n);}
 public boolean has(int side,int type){for(Entity e:entities)if(e.side==side&&e.type==type&&e.ready())return true;return false;}
 public int count(int side,int type){int n=0;for(Entity e:entities)if(e.side==side&&e.type==type&&e.hp>0)n++;return n;}
 public int costOre(int side,int type){return ORE[type]*(type==20?weapons[side]+1:type==21?armor[side]+1:1);}
 public int costGas(int side,int type){return GAS[type]*(type==20?weapons[side]+1:type==21?armor[side]+1:1);}
 public boolean tech(int side,int type){switch(type){case FACTORY:case LAB:case MEDIC:return has(side,BARRACKS)&&(type!=MEDIC||has(side,LAB));case AIRPAD:return has(side,FACTORY);case SIEGE:return has(side,FACTORY)&&has(side,LAB);case WING:return has(side,AIRPAD);case TURRET:return has(side,BARRACKS);default:return true;}}
 boolean pay(int side,int type){int a=costOre(side,type),b=costGas(side,type);if(ore[side]<a||gas[side]<b)return false;ore[side]-=a;gas[side]-=b;return true;}
 public boolean issue(int side,long serial,int action,int[] ids,int type,int x,int y){
  if(side<0||side>1||winner>=0||serial<=lastCommand[side]||serial-lastCommand[side]>64||ids==null||ids.length==0||ids.length>24||commandsThisTick[side]>=12)return false;
  lastCommand[side]=serial;commandsThisTick[side]++;ArrayList<Entity> own=new ArrayList<>();HashSet<Integer> seen=new HashSet<>();for(int id:ids){Entity e=get(id);if(e!=null&&e.side==side&&seen.add(id))own.add(e);}if(own.isEmpty())return fail(side,"Select your own units or a structure.");
  if(action==BUILD){Entity worker=own.get(0);if(worker.type!=WORKER||!worker.ready()||type<CORE||type>AIRPAD)return false;if(!tech(side,type))return fail(side,"Build the required tech structure first.");if(!placeable(side,type,x,y))return fail(side,"Choose visible, clear terrain away from other structures.");if(!pay(side,type))return fail(side,"Not enough ore or gas.");Entity site=spawn(side,type,x,y,TIME[type]);worker.order=REPAIR;worker.target=site.id;worker.path.clear();message[side]="Constructing "+NAMES[type];return true;}
  if(action==TRAIN||action==RESEARCH){Entity b=own.get(0);if(!b.ready()||!b.building()||b.queue.size()>=5)return fail(side,"Production queue is full or construction is incomplete.");boolean allowed=action==TRAIN&&(type==WORKER&&b.type==CORE||type==RANGER&&b.type==BARRACKS||type==MEDIC&&b.type==BARRACKS||type==SCOUT&&b.type==FACTORY||type==SIEGE&&b.type==FACTORY||type==WING&&b.type==AIRPAD)||action==RESEARCH&&b.type==LAB&&(type==20||type==21);
   if(!allowed||!tech(side,type))return fail(side,"Required production technology is missing.");if(type<6&&supply(side)+SUPPLY[type]>cap(side))return fail(side,"Supply blocked. Build a relay.");if(type>=20){if((type==20?weapons[side]:armor[side])>=3)return fail(side,"Maximum research level reached.");for(Entity other:entities)if(other.side==side&&other.queue.contains(type))return fail(side,"That upgrade is already queued.");}
   if(!pay(side,type))return fail(side,"Not enough ore or gas.");b.queue.add(type);message[side]=NAMES[type]+" queued";return true;}
  if(action==CANCEL){Entity b=own.get(0);if(b.queue.isEmpty())return false;int q=b.queue.remove(b.queue.size()-1);ore[side]+=costOre(side,q);gas[side]+=costGas(side,q);if(b.queue.isEmpty())b.progress=0;message[side]="Queue item cancelled and refunded";return true;}
  if(action<1||action>REPAIR||x<0||y<0||x>=W||y>=H)return false;int offset=0;
  for(Entity e:own){if(e.building()){if(action==RALLY||action==MOVE){e.goalX=x;e.goalY=y;}continue;}if(!e.ready())continue;e.path.clear();e.target=-1;e.returning=false;
   if(action==GATHER&&e.type==WORKER&&nodes[y*W+x]>0){e.resource=y*W+x;e.order=GATHER;e.returning=e.carry>0;}
   else if(action==REPAIR&&e.type==WORKER){Entity at=at(x,y,side);if(at!=null&&at.building()){e.target=at.id;e.order=REPAIR;}}
   else if(action==MOVE||action==ATTACK){e.order=action;int dx=own.size()>1?(offset%5)-2:0,dy=own.size()>1?(offset/5)-2:0;e.goalX=Math.max(0,Math.min(W-1,x+dx));e.goalY=Math.max(0,Math.min(H-1,y+dy));offset++;}
   else if(action==STOP||action==HOLD){e.order=action;e.goalX=Math.round(e.x);e.goalY=Math.round(e.y);}
  }message[side]=action==ATTACK?"Attack-move ordered":action==GATHER?"Harvesting assigned":action==HOLD?"Holding position":"Orders received";return true;
 }
 boolean fail(int side,String why){message[side]=why;return false;}
 public Entity at(float x,float y,int side){Entity best=null;float distance=1.8f;for(Entity e:entities)if(e.hp>0&&(side<0||e.side==side)){float d=distance(e.x,e.y,x,y);if(d<(e.building()?1.5f:.8f)&&d<distance){best=e;distance=d;}}return best;}
 public boolean placeable(int side,int type,int x,int y){if(x<1||y<1||x>=W-1||y>=H-1||!visible[side][y*W+x]||terrain[y*W+x]!=0)return false;if(type==REFINERY){if(nodes[y*W+x]!=2)return false;}else if(nodes[y*W+x]!=0)return false;if(type!=REFINERY)for(int i=0;i<nodes.length;i++)if(nodes[i]==2&&distance(x,y,i%W,i/W)<4)return false;for(Entity e:entities)if(e.hp>0&&(e.building()?distance(e.x,e.y,x,y)<4.0f:!e.air()&&distance(e.x,e.y,x,y)<1.2f))return false;for(int dy=-1;dy<=1;dy++)for(int dx=-1;dx<=1;dx++)if(terrain[(y+dy)*W+x+dx]!=0)return false;return true;}
 public void step(){if(winner>=0)return;tick++;Arrays.fill(commandsThisTick,0);vision();ArrayList<Entity> current=new ArrayList<>(entities);for(Entity e:current){if(e.hp<=0)continue;e.shot=-1;if(e.flash>0)e.flash--;if(e.cool>0)e.cool--;if(e.build>0)continue;
   if(e.building()){produce(e);if(e.type==TURRET)fight(e);continue;}
   if(e.type==WORKER&&(e.order==GATHER||e.order==REPAIR)){if(e.order==GATHER)harvest(e);else repair(e);continue;}
   if(e.type==MEDIC)heal(e);else if(e.order!=MOVE&&fight(e))continue;
   if(e.order==MOVE||e.order==ATTACK)travel(e,e.goalX,e.goalY,.25f);
  }
  if(entities.removeIf(e->e.hp<=0))navigation=null;boolean[] alive={false,false};for(Entity e:entities)if(e.building())alive[e.side]=true;if(!alive[0]||!alive[1])winner=alive[0]?0:alive[1]?1:2;vision();
 }
 void produce(Entity e){if(e.queue.isEmpty())return;int kind=e.queue.get(0);e.progress++;int duration=TIME[kind]*(doctrine(e.side)==1&&kind<6?9:10)/10;if(e.progress<duration)return;if(kind>=20){if(kind==20)weapons[e.side]++;else armor[e.side]++;}else{int spot=freeNear(Math.round(e.x),Math.round(e.y));if(spot<0)return;Entity unit=spawn(e.side,kind,spot%W,spot/W,0);unit.order=kind==WORKER?STOP:MOVE;unit.goalX=e.goalX;unit.goalY=e.goalY;if(kind==WORKER){int resource=nearestNode(unit,1);if(resource>=0){unit.resource=resource;unit.order=GATHER;}}}e.progress=0;e.queue.remove(0);message[e.side]=NAMES[kind]+" ready";}
 int freeNear(int x,int y){for(int r=2;r<=5;r++)for(int dy=-r;dy<=r;dy++)for(int dx=-r;dx<=r;dx++)if(Math.max(Math.abs(dx),Math.abs(dy))==r){int a=x+dx,b=y+dy;if(a>=0&&b>=0&&a<W&&b<H&&!blocked(a,b,-1)&&!occupied(a,b,-1))return b*W+a;}return -1;}
 void repair(Entity e){Entity site=get(e.target);if(site==null||site.side!=e.side){e.order=STOP;return;}if(distance(e.x,e.y,site.x,site.y)>2.3f){travel(e,Math.round(site.x),Math.round(site.y),2.2f);return;}if(site.build>0){int before=site.build;site.build--;int growth=site.max-site.max/10;site.hp=Math.min(site.max,site.hp+growth*(TIME[site.type]-site.build)/TIME[site.type]-growth*(TIME[site.type]-before)/TIME[site.type]);if(site.build==0){message[e.side]=NAMES[site.type]+" complete";e.order=STOP;}}else if(site.hp<site.max){if(++e.work>=5&&ore[e.side]>0){e.work=0;ore[e.side]--;site.hp=Math.min(site.max,site.hp+12);}}else e.order=STOP;}
 void harvest(Entity e){if(e.carry>0&&(e.returning||remaining[e.resource]<=0)){Entity depot=null;float near=Float.MAX_VALUE;for(Entity b:entities)if(b.side==e.side&&b.type==CORE&&b.ready()){float d=distance(e.x,e.y,b.x,b.y);if(d<near){near=d;depot=b;}}if(depot==null)return;if(near>2.3){travel(e,Math.round(depot.x),Math.round(depot.y),2.2f);return;}if(e.carryKind==2)gas[e.side]+=e.carry;else ore[e.side]+=e.carry;e.carry=0;e.returning=false;e.path.clear();return;}
  if(e.resource<0||e.resource>=nodes.length||remaining[e.resource]<=0){e.resource=nearestNode(e,1);if(e.resource<0){e.order=STOP;return;}}
  if(nodes[e.resource]==2){Entity ref=at(e.resource%W,e.resource/W,e.side);if(ref==null||ref.type!=REFINERY||!ref.ready()){message[e.side]="Build a gas extractor on the vent first";return;}}
  if(distance(e.x,e.y,e.resource%W,e.resource/W)>(nodes[e.resource]==2?2.3:1.7)){travel(e,e.resource%W,e.resource/W,nodes[e.resource]==2?2.2f:1.6f);return;}if(++e.work>=10){e.work=0;int amount=Math.min(nodes[e.resource]==2?6:8,remaining[e.resource]);remaining[e.resource]-=amount;e.carry=amount;e.carryKind=nodes[e.resource];e.returning=true;e.path.clear();}
 }
 int nearestNode(Entity e,int kind){int best=-1;float near=Float.MAX_VALUE;for(int i=0;i<nodes.length;i++)if(nodes[i]==kind&&remaining[i]>0&&explored[e.side][i]){float d=distance(e.x,e.y,i%W,i/W);if(d<near){near=d;best=i;}}return best;}
 void heal(Entity e){if(e.cool>0)return;for(Entity friend:entities)if(friend.side==e.side&&!friend.building()&&friend.type!=MEDIC&&friend.hp>0&&friend.hp<friend.max&&distance(e.x,e.y,friend.x,friend.y)<3.5f){friend.hp=Math.min(friend.max,friend.hp+7);e.cool=10;e.shot=friend.id;return;}}
 boolean fight(Entity e){float range=e.type==TURRET?6:RANGE[e.type],scan=e.order==HOLD||e.type==TURRET?range:7;Entity target=null;float near=Float.MAX_VALUE;for(Entity enemy:entities)if(enemy.hp>0&&enemy.side!=e.side&&visible[e.side][cell(enemy.x,enemy.y)]&&(!enemy.air()||e.type==RANGER||e.type==WING||e.type==TURRET)){float d=distance(e.x,e.y,enemy.x,enemy.y);if(d<=scan&&d<near){near=d;target=enemy;}}
  if(target==null)return false;if(near<=range+(target.building()?.6f:0)){if(e.cool==0){int damage=e.type==TURRET?17:DAMAGE[e.type];damage+=weapons[e.side]*2;if(doctrine(e.side)==1&&e.type==RANGER)damage++;if(e.type==SCOUT&&target.type==RANGER)damage+=5;if(e.type==SIEGE&&target.building())damage+=18;hit(target,damage);e.cool=e.type==TURRET?11:COOLDOWN[e.type];e.shot=target.id;if(e.type==SIEGE)for(Entity other:entities)if(other.id!=target.id&&other.side!=e.side&&!other.air()&&other.hp>0&&distance(other.x,other.y,target.x,target.y)<1.3f)hit(other,damage/3);}return true;}
  if(!e.building()&&e.order!=HOLD){travel(e,Math.round(target.x),Math.round(target.y),range*.8f);return true;}return false;
 }
 void hit(Entity target,int damage){target.hp-=Math.max(1,damage-armor[target.side]-(target.type==SIEGE?2:0));target.flash=3;}
 static int cell(float x,float y){return Math.max(0,Math.min(H-1,Math.round(y)))*W+Math.max(0,Math.min(W-1,Math.round(x)));}
 static float distance(float x,float y,float a,float b){return (float)Math.hypot(x-a,y-b);}
 boolean blocked(int x,int y,int ignore){if(x<0||y<0||x>=W||y>=H)return true;if(navigation==null){navigation=new boolean[W*H];for(int i=0;i<navigation.length;i++)navigation[i]=terrain[i]!=0;for(Entity e:entities)if(e.hp>0&&e.building())for(int dy=-1;dy<=1;dy++)for(int dx=-1;dx<=1;dx++){int a=Math.round(e.x)+dx,b=Math.round(e.y)+dy;if(a>=0&&b>=0&&a<W&&b<H)navigation[b*W+a]=true;}}return navigation[y*W+x];}
 boolean occupied(float x,float y,int ignore){for(Entity e:entities)if(e.id!=ignore&&e.hp>0&&!e.building()&&!e.air()&&!(e.type==WORKER&&e.order==GATHER)&&distance(e.x,e.y,x,y)<.48)return true;return false;}
 void travel(Entity e,int tx,int ty,float stop){if(stop<1&&!e.air()&&blocked(tx,ty,e.id))stop=2.4f;if(distance(e.x,e.y,tx,ty)<=stop){e.path.clear();if(e.order==MOVE)e.order=STOP;return;}float speed=SPEED[e.type]*(doctrine(e.side)==1?1.1f:1)/10;if(e.air()){float d=distance(e.x,e.y,tx,ty);e.x+=(tx-e.x)/d*Math.min(speed,d);e.y+=(ty-e.y)/d*Math.min(speed,d);return;}
  if(e.path.isEmpty()||tick%20==e.id%20){int ax=Math.round(e.x),ay=Math.round(e.y);e.path=route(ax,ay,tx,ty,stop,e.id);if(e.path.isEmpty()&&distance(ax,ay,tx,ty)<=stop&&!blocked(ax,ay,e.id))e.path.add(ay*W+ax);}
  if(e.path.isEmpty())return;int at=e.path.peek();float dx=at%W-e.x,dy=at/W-e.y,d=(float)Math.hypot(dx,dy);if(d<.12){e.path.remove();return;}float nx=e.x+dx/d*Math.min(speed,d),ny=e.y+dy/d*Math.min(speed,d);if(blocked(at%W,at/W,e.id)){e.path.clear();return;}if(e.type==WORKER&&e.order==GATHER||!occupied(nx,ny,e.id)){e.x=nx;e.y=ny;}else if(tick%8==e.id%8){e.path.clear();float side=e.id%2==0?.22f:-.22f;float sx=Math.max(0,Math.min(W-1,e.x-dy/d*side)),sy=Math.max(0,Math.min(H-1,e.y+dx/d*side));if(!blocked(Math.round(sx),Math.round(sy),e.id)&&!occupied(sx,sy,e.id)){e.x=sx;e.y=sy;}}
 }
 ArrayDeque<Integer> route(int sx,int sy,int tx,int ty,float stop,int ignore){int start=sy*W+sx;boolean[] traffic=new boolean[W*H];Entity mover=get(ignore);if(mover==null||mover.type!=WORKER||mover.order!=GATHER)for(Entity other:entities)if(other.id!=ignore&&other.hp>0&&!other.building()&&!other.air()&&!(other.type==WORKER&&other.order==GATHER))traffic[cell(other.x,other.y)]=true;int[] prev=new int[W*H];Arrays.fill(prev,-2);int[] queue=new int[W*H];int head=0,tail=0;queue[tail++]=start;prev[start]=-1;int found=-1;while(head<tail){int at=queue[head++],x=at%W,y=at/W;if(distance(x,y,tx,ty)<=Math.max(.6f,stop)){found=at;break;}for(int k=0;k<4;k++){int nx=x+(k==0?1:k==1?-1:0),ny=y+(k==2?1:k==3?-1:0);if(nx<0||ny<0||nx>=W||ny>=H)continue;int n=ny*W+nx;if(prev[n]!=-2||blocked(nx,ny,ignore)||traffic[n])continue;prev[n]=at;queue[tail++]=n;}}ArrayDeque<Integer> path=new ArrayDeque<>();while(found>=0&&found!=start){path.addFirst(found);found=prev[found];}return path;}
 void vision(){for(int side=0;side<2;side++){Arrays.fill(visible[side],false);for(Entity e:entities)if(e.side==side&&e.hp>0){int radius=e.type==SCOUT||e.type==WING?8:e.building()?6:5;int x=Math.round(e.x),y=Math.round(e.y);for(int dy=-radius;dy<=radius;dy++)for(int dx=-radius;dx<=radius;dx++)if(dx*dx+dy*dy<=radius*radius){int a=x+dx,b=y+dy;if(a>=0&&b>=0&&a<W&&b<H)visible[side][b*W+a]=explored[side][b*W+a]=true;}}}}
 public void bot(int side,int level){if(winner>=0||tick%(level==0?30:level==1?20:12)!=0)return;ArrayList<Entity> workers=new ArrayList<>(),army=new ArrayList<>();Entity core=null;for(Entity e:new ArrayList<>(entities))if(e.side==side&&e.hp>0){if(e.type==WORKER)workers.add(e);else if(!e.building())army.add(e);if(e.type==CORE&&e.ready())core=e;}
  if(core==null){if(army.isEmpty())army.addAll(workers);attackArmy(side,level,army);return;}int bx=Math.round(core.x),by=Math.round(core.y);for(Entity worker:workers)if(worker.order==STOP){worker.resource=nearestNode(worker,1);if(worker.resource>=0)worker.order=GATHER;}
  if(workers.size()< (level==0?8:12)&&core.queue.size()<2)command(side,TRAIN,core,WORKER,0,0);
  int want=cap(side)-supply(side)<5?RELAY:!has(side,BARRACKS)?BARRACKS:!has(side,REFINERY)?REFINERY:!has(side,FACTORY)?FACTORY:!has(side,LAB)?LAB:count(side,BARRACKS)<2?BARRACKS:!has(side,AIRPAD)&&level>0?AIRPAD:!has(side,TURRET)?TURRET:-1;
  if(want>=0&&count(side,want)==(want==RELAY?count(side,RELAY):want==BARRACKS&&has(side,BARRACKS)?1:0)&&tech(side,want)&&!workers.isEmpty()){
   boolean constructing=false;for(Entity e:entities)if(e.side==side&&e.type==want&&e.build>0)constructing=true;
   if(!constructing){Entity builder=null;for(Entity e:workers)if(e.order!=REPAIR){builder=e;break;}if(builder!=null){boolean placed=false;for(int r=2;r<=9&&!placed;r++)for(int dy=-r;dy<=r&&!placed;dy++)for(int dx=-r;dx<=r&&!placed;dx++){int x=bx+dx,y=by+dy;if(placeable(side,want,x,y)&&ore[side]>=costOre(side,want)&&gas[side]>=costGas(side,want))placed=command(side,BUILD,builder,want,x,y);}}}
  }
  if(has(side,REFINERY)){int assigned=0;for(Entity e:workers)if(e.order==GATHER&&e.resource>=0&&nodes[e.resource]==2)assigned++;for(Entity e:workers)if(assigned<3&&e.order==GATHER&&nodes[e.resource]==1){int node=-1;float nearest=Float.MAX_VALUE;for(Entity refinery:entities)if(refinery.side==side&&refinery.type==REFINERY&&refinery.ready()){float dist=distance(e.x,e.y,refinery.x,refinery.y);if(dist<nearest){nearest=dist;node=cell(refinery.x,refinery.y);}}if(node>=0){e.resource=node;e.returning=e.carry>0;e.path.clear();assigned++;}}}
  int reserveGas=want>=0&&count(side,want)==0?costGas(side,want):0;for(Entity b:new ArrayList<>(entities))if(b.side==side&&b.ready()&&b.queue.size()<2){int unit=b.type==BARRACKS?(has(side,LAB)&&count(side,MEDIC)<2?MEDIC:RANGER):b.type==FACTORY?(has(side,LAB)&&count(side,SIEGE)<4?SIEGE:SCOUT):b.type==AIRPAD?WING:-1;if(unit>=0&&gas[side]>=GAS[unit]+reserveGas)command(side,TRAIN,b,unit,0,0);if(b.type==LAB&&level>0&&b.queue.isEmpty()&&gas[side]>=75+reserveGas)command(side,RESEARCH,b,weapons[side]<=armor[side]?20:21,0,0);}
  attackArmy(side,level,army);
 }
 void attackArmy(int side,int level,ArrayList<Entity> army){
  if(tick>=(level==0?1800:level==1?1200:900)&&!army.isEmpty()){int start=(tick/120)%(1+(army.size()-1)/24)*24;int[] ids=new int[Math.min(24,army.size()-start)];for(int i=0;i<ids.length;i++)ids[i]=army.get(start+i).id;int tx=side==0?30:5,ty=new int[]{12,4,20,8,16}[tick/400%5];float closest=Float.MAX_VALUE;for(Entity enemy:entities)if(enemy.side!=side&&enemy.hp>0&&enemy.building()&&visible[side][cell(enemy.x,enemy.y)]){float dist=distance(army.get(start).x,army.get(start).y,enemy.x,enemy.y);if(dist<closest){closest=dist;tx=Math.round(enemy.x);ty=Math.round(enemy.y);}}issue(side,lastCommand[side]+1,ATTACK,ids,0,tx,ty);}
 }
 boolean command(int side,int action,Entity e,int type,int x,int y){return issue(side,lastCommand[side]+1,action,new int[]{e.id},type,x,y);}
}
