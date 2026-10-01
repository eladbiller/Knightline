package com.traillink;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;

public final class ArchiveLessonTest {
    private static int checks;
    private static void check(boolean value,String message){checks++;if(!value)throw new AssertionError(message);}
    private static Path file(Path dir,String id){return dir.resolve(UUID.nameUUIDFromBytes(id.getBytes(StandardCharsets.UTF_8))+".game");}
    public static void main(String[] args)throws Exception {
        Path dir=Files.createTempDirectory("knightline-lesson-exclusion-");
        Game g=new Game(0,0);g.move(0,52,36,5);
        GameArchive archive=new GameArchive(dir.toFile());
        archive.put(new GameArchive.Entry("match-0","W","B","Stockfish",1,0,0,g));
        Map<Path,byte[]> oldFiles=new HashMap<>();
        // Seed the exact legacy archive format, bypassing the new write gate.
        for(int i=0;i<120;i++){
            String id="lesson-"+i,mode=i%2==0?"Guided lesson":"Endgame practice";
            Path path=file(dir,id);
            try(ObjectOutputStream out=new ObjectOutputStream(Files.newOutputStream(path))){
                out.writeInt(1);out.writeObject(new GameArchive.Entry(id,"W","B",mode,10000+i,0,0,g));
            }
            oldFiles.put(path,Files.readAllBytes(path));
        }
        archive=new GameArchive(dir.toFile());
        check(archive.list().size()==1&&archive.summaries().size()==1,"Legacy lessons leaked into library");
        check(archive.get("match-0")!=null,"Lessons displaced an actual match");
        check(archive.get("lesson-0")==null&&archive.get("lesson-1")==null,"Hidden lesson accessible as archived match");
        for(String mode:new String[]{"Guided lesson","Endgame practice","  GUIDED LESSON  "}){
            archive.put(new GameArchive.Entry("new-"+mode,"W","B",mode,20000,0,0,g));
            check(!Files.exists(file(dir,"new-"+mode)),"New teaching session written to archive");
        }
        for(int i=1;i<100;i++)archive.put(new GameArchive.Entry("match-"+i,"W","B",i%2==0?"Friend game":"Pass & play",i+1,0,-1,g));
        archive=new GameArchive(dir.toFile());
        check(archive.list().size()==100&&archive.get("match-0")!=null,"Lesson files consumed real-game retention");
        archive.put(new GameArchive.Entry("match-100","W","B","Stockfish",101,0,0,g));
        check(archive.list().size()==100&&archive.get("match-0")==null&&archive.get("match-1")!=null,"Match-only pruning incorrect");
        for(Map.Entry<Path,byte[]> old:oldFiles.entrySet())check(Arrays.equals(Files.readAllBytes(old.getKey()),old.getValue()),"Legacy lesson data changed");
        for(String mode:new String[]{"Stockfish","Pass & play","Friend game","Practice","Test"})check(!GameArchive.isLessonMode(mode),"Ordinary game wrongly excluded: "+mode);
        check(!GameArchive.isLessonMode(null),"Null mode handling");
        System.out.println("ArchiveLessonTest: "+checks+" assertions passed; legacy lesson files preserved");
    }
}
