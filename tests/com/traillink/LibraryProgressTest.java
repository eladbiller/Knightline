package com.traillink;

import java.io.*;
import java.nio.file.*;
import java.util.*;

public final class LibraryProgressTest {
    private static int checks;
    private static void check(boolean value,String message){checks++;if(!value)throw new AssertionError(message);}
    public static void main(String[] args)throws Exception {
        Path directory=Files.createTempDirectory("knightline-library-test-");
        Game active=new Game(0,0);active.move(0,52,36,5);active.move(1,12,28,5);
        int[] original=active.b.clone();
        GameArchive archive=new GameArchive(directory.toFile());
        archive.put(new GameArchive.Entry("game-a","You · White","Stockfish · Black","Stockfish",1,0,0,active));
        GameArchive.Entry saved=archive.get("game-a");
        saved.game.b[0]=0;saved.game.history.get(0)[0]=0;
        check(active.b[0]!=0&&active.history.get(0)[0]!=0,"Archive aliases active game");
        check(archive.get("game-a").game.b[0]!=0&&archive.get("game-a").game.history.get(0)[0]!=0,"Read aliases stored archive");
        ChessReviewWorkspace review=new ChessReviewWorkspace(ChessPosition.at(archive.get("game-a").game,0),0);
        check(review.play(51,35,5)&&review.play(11,27,5),"Alternate archived line");
        check(Arrays.equals(active.b,original)&&archive.get("game-a").game.chessMoves.size()==2,"Review touched active save/archive");
        saved=archive.get("game-a");saved.game.analysis.add("Native report");saved.game.analysisBest.add(new int[]{52,36,5});
        archive.put(saved);
        archive=new GameArchive(directory.toFile());
        check(archive.get("game-a").game.analysis.get(0).equals("Native report"),"Reports survive restart");
        check(archive.get("game-a").startedAt==1,"Report update reordered game");
        for(int i=2;i<=105;i++)archive.put(new GameArchive.Entry("game-"+i,"White","Black","Pass & play",i,1,-1,active));
        check(archive.list().size()==100&&archive.get("game-a")==null&&archive.get("game-5")==null,"Retention boundary");
        check(archive.get("game-6")!=null&&archive.list().get(0).id.equals("game-105"),"Latest games retained");
        // Corrupt just one managed entry; the others must still load. This is a temporary test directory only.
        String filename=UUID.nameUUIDFromBytes("game-105".getBytes(java.nio.charset.StandardCharsets.UTF_8))+".game";
        Files.write(directory.resolve(filename),new byte[]{1,2,3});
        archive=new GameArchive(directory.toFile());
        check(archive.list().size()==99&&archive.get("game-104")!=null,"Corrupt game hid healthy entries");
        archive.put(new GameArchive.Entry("../../must-stay-private","W","B","Test",106,0,0,active));
        check(archive.get("../../must-stay-private")!=null,"Safe ID storage");
        check(!Files.exists(directory.getParent().resolve("must-stay-private")),"ID escaped archive directory");
        active.winner=1;archive.put(new GameArchive.Entry("game-104","W","B","Test",999,0,0,active));
        check(archive.get("game-104").result().equals("0–1")&&archive.get("game-104").startedAt==104,"Result update/date preservation");
        PuzzleCatalog catalog;try(Reader input=new FileReader("app/src/main/assets/puzzles/lichess-pack.tsv")){catalog=new PuzzleCatalog(input);}
        for(int index:new int[]{0,6,56,156,206}) {
            PuzzleSession p=new PuzzleSession(catalog.entries.get(index));
            PuzzleProgress progress=new PuzzleProgress();p.advanceHint();progress.record(p);
            check(progress.everHint&&!progress.clean,"Hint not recorded immediately");
            p=new PuzzleSession(p.entry);p.previouslyAssisted=progress.assisted();solve(p);progress.record(p);
            check(progress.solved&&progress.everHint&&!progress.clean&&p.feedback.contains("Practice"),"Retry erased earlier hint");
            PuzzleProgress failed=new PuzzleProgress();p=new PuzzleSession(p.entry);p.missed=true;failed.record(p);
            p=new PuzzleSession(p.entry);p.previouslyAssisted=failed.assisted();solve(p);failed.record(p);
            check(failed.solved&&failed.everFailed&&!failed.clean,"Retry erased failure");
            PuzzleProgress clean=new PuzzleProgress();p=new PuzzleSession(p.entry);solve(p);clean.record(p);
            check(clean.clean&&clean.solved&&!clean.assisted(),"Fresh first attempt should count");
            clean.everFailed=true;clean.record(p);check(!clean.clean,"Lifetime failure did not invalidate clean label");
            PuzzleProgress legacy=new PuzzleProgress();legacy.legacySolved=true;legacy.record(p);
            check(legacy.solved&&!legacy.clean,"Legacy cannot invent first-attempt evidence");
        }
        System.out.println("Library/progress PASS: "+checks+" assertions; temporary data: "+directory);
    }
    private static void solve(PuzzleSession p){while(!p.solved){int[] m=p.solution();p.play(m[0],m[1],m[2]);if(p.pendingReply)p.reply();}}
}
