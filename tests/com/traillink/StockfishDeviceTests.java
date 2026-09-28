package com.traillink;
import android.app.*;import android.os.*;import android.content.*;import java.io.*;import java.nio.file.*;import java.util.*;

public final class StockfishDeviceTests extends V3DeviceTests {
 @Override public void onStart(){Bundle result=new Bundle();byte[] saved=null;File saveFile=null;try{
  Intent intent=new Intent();intent.setClassName("com.traillink","com.traillink.MainActivity");intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);app=(MainActivity)startActivitySync(intent);waitForIdleSync();
  saveFile=new File(app.getFilesDir(),"match.bin");if(saveFile.exists())saved=Files.readAllBytes(saveFile.toPath());
  main(()->{clean();app.botError=app.analysisError="";});StockfishEngine engine=app.getStockfish();require(engine.identify().startsWith("Stockfish 16"),"Genuine native engine");say("Native engine: "+engine.identify()+"; ABI "+android.os.Build.SUPPORTED_ABIS[0]);
  if(args.getString("mode","engine").equals("duel"))duel(engine);else if(args.getString("mode","engine").equals("bots"))otherBots();else engineTests(engine);
  say("PASS");result.putString("stream",report.toString());
 }catch(Throwable e){say("FAIL: "+e);result.putString("stream",report+"\n"+android.util.Log.getStackTraceString(e));}
 finally{if(app!=null){final byte[] restore=saved;final File target=saveFile;main(()->{clean();app.botError=app.analysisError="";app.local=app.solo=false;try{if(target!=null){if(restore!=null)Files.write(target.toPath(),restore);else Files.deleteIfExists(target.toPath());app.restore();}}catch(Exception e){throw new RuntimeException(e);}app.home();});}finish(report.toString().contains("FAIL:")?Activity.RESULT_CANCELED:Activity.RESULT_OK,result);}
 }
 @Override void fits(){waitForIdleSync();SystemClock.sleep(250);super.fits();}
 void engineTests(StockfishEngine engine)throws Exception{
  Game g=new Game(0,1);require(StockfishEngine.fen(g).equals("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"),"Initial FEN");
  require(Arrays.equals(StockfishEngine.parseMove(g,"e2e4"),new int[]{52,36,5}),"UCI coordinates");require(StockfishEngine.parseMove(g,"e2e5")==null&&StockfishEngine.parseMove(g,"e2e4q")==null,"Reject illegal UCI moves");
  g.move(0,52,36,5);require(StockfishEngine.position(g).endsWith("moves e2e4"),"Repetition-aware move history");
  Game promotion=new Game(0,1);Arrays.fill(promotion.b,0);promotion.rights=0;promotion.b[60]=6;promotion.b[7]=-6;promotion.b[8]=1;
  require(StockfishEngine.parseMove(promotion,"a7a8n")[2]==2,"Underpromotion parsing");
  int[] promoted=engine.choose(promotion,2);require(promotion.move(0,promoted[0],promoted[1],promoted[2]),"Native promotion position legal");
  Game castle=new Game(0,1);Arrays.fill(castle.b,0);castle.b[60]=6;castle.b[4]=-6;castle.b[63]=4;castle.rights=1;require(StockfishEngine.parseMove(castle,"e1g1")!=null,"Castling UCI");
  Game ep=new Game(0,1);Arrays.fill(ep.b,0);ep.b[60]=6;ep.b[4]=-6;ep.b[28]=1;ep.b[27]=-1;ep.ep=19;ep.rights=0;require(StockfishEngine.parseMove(ep,"e5d6")!=null,"En passant UCI");
  Game mate=new Game(0,1);mate.move(0,53,45,5);mate.move(1,12,28,5);mate.move(0,54,38,5);
  int[] move=engine.choose(mate,2);require(Arrays.equals(move,new int[]{3,39,5}),"Hard finds Qh4 mate");say("Hard mate: "+ChessNotation.san(mate,move[0],move[1],move[2])+"; depth "+engine.lastDepth+"; nodes "+engine.lastNodes);
  mate.move(1,3,39,5);StockfishEngine.Review check=engine.analyze(mate,2);require(check.text.contains("Blunder")&&check.text.contains("Stockfish 16")&&!Arrays.equals(check.best,new int[]{54,38,5}),"Stockfish flags g4");say(check.text);
  for(int level=0;level<3;level++){final int difficulty=level;main(()->{clean();app.botError=app.analysisError="";app.game=new Game(0,1);app.solo=true;app.botLevel=difficulty;app.bot=new Bot(difficulty,1);app.me=0;app.showSnapshot();app.act(52,36,5);});
   long start=SystemClock.uptimeMillis(),until=start+12000;while(app.game.seq<2&&app.botError.isEmpty()&&SystemClock.uptimeMillis()<until)SystemClock.sleep(100);
   require(app.game.seq==2&&app.botError.isEmpty(),"App receives native bot move at "+level);require(engine.lastBotSkill==StockfishEngine.SKILLS[level],"Difficulty reaches UCI");say("App "+Bot.LEVELS[level]+": skill "+engine.lastBotSkill+", depth "+engine.lastDepth+", "+(SystemClock.uptimeMillis()-start)+" ms");fits();
  }
  main(()->{clean();app.botError=app.analysisError="";app.game=new Game(0,1);app.game.move(0,53,45,5);app.game.move(1,12,28,5);app.game.move(0,54,38,5);app.game.move(1,3,39,5);app.showSnapshot();});long until=SystemClock.uptimeMillis()+40000;
  while(app.game.analysis.size()<4&&app.analysisError.isEmpty()&&SystemClock.uptimeMillis()<until)SystemClock.sleep(100);
  require(app.game.analysis.size()==4&&app.analysisError.isEmpty(),"All review plies use Stockfish");
  for(String text:app.game.analysis)require(text.contains("Stockfish 16"),"No custom-engine fallback");
  main(()->{app.reviewIndex=3;app.reviewMode=0;app.review();});SystemClock.sleep(150);fits();screen("stockfish-review");
  require(app.board.s.optInt("playedFrom")==54&&app.board.s.optInt("bestFrom")>=0,"Stockfish review arrows");
  engine.close();require(engine.identify().startsWith("Stockfish 16"),"Engine restarts after process close");say("Review, arrows, legal special moves and process restart passed");
 }
 void otherBots()throws Exception{
  for(int level=0;level<3;level++)for(int id=1;id<15;id++){final int kind=id,difficulty=level;final int[] before={0};main(()->{clean();app.botError=app.analysisError="";app.game=new Game(kind,19);if(app.game.setup)for(int p=0;p<2;p++){app.game.randomSetup(p);app.game.move(p,-10,0,5);}app.game.turn=1;app.me=0;app.solo=true;app.botLevel=difficulty;app.bot=new Bot(difficulty,17);before[0]=app.game.seq;app.showSnapshot();});
   long until=SystemClock.uptimeMillis()+12000;while(app.game.seq==before[0]&&app.botError.isEmpty()&&SystemClock.uptimeMillis()<until)SystemClock.sleep(100);require(app.game.seq>before[0]&&app.botError.isEmpty(),"Other bot remains functional: "+Game.NAMES[id]+"/"+level);say("Bot regression: "+Game.NAMES[id]+" / "+Bot.LEVELS[level]);}
 }
 void duel(StockfishEngine engine)throws Exception{
  Game game=new Game(0,22);Bot old=new Bot(2,11);int actions=0;
  while(game.winner<0&&actions<60){int side=game.turn;int[] m=side==0?engine.choose(game,2):old.choose(game,1);require(m!=null&&game.move(side,m[0],m[1],m.length>2?m[2]:5),"Duel legal");actions++;if(actions%10==0)say("Stockfish vs old Hard: "+actions+" legal plies");}
  say("Duel result: "+(game.winner==0?"Stockfish won":game.winner==1?"old bot won":game.winner==2?"draw":"60-ply cap, not a completed match")+"; plies "+actions);
 }
}
