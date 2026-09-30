package com.traillink;

import java.io.*;
import java.util.*;

public final class AdvancedLearningTest {
    static int checks;
    static void check(boolean condition,String message){checks++;if(!condition)throw new AssertionError(message);}
    public static void main(String[] args)throws Exception{
        PuzzleCatalog catalog;
        try(Reader r=new FileReader("app/src/main/assets/puzzles/lichess-pack.tsv")){catalog=new PuzzleCatalog(r);}
        check(catalog.entries.size()==256,"Catalog count");
        HashSet<String> ids=new HashSet<>();int black=0,white=0,plies=0;
        for(PuzzleCatalog.Entry entry:catalog.entries){
            check(ids.add(entry.id),"Duplicate ID");
            PuzzleSession p=new PuzzleSession(entry);
            if(p.side==0)white++;else black++;
            int[] initial=p.position.b.clone();int[] best=p.solution();
            for(int[] pair:p.position.legal()){
                int[] move=new int[]{pair[0],pair[1],5};
                Game candidate=p.position.copy();candidate.move(candidate.turn,move[0],move[1],move[2]);
                if(!Arrays.equals(move,best)&&candidate.winner!=p.side){
                    check(!p.play(move[0],move[1],move[2]),"Wrong puzzle accepted "+entry.id);
                    check(Arrays.equals(initial,p.position.b)&&p.missed,"Wrong puzzle moved board "+entry.id);break;
                }
            }
            for(int n=0;n<4;n++)p.advanceHint();
            check(p.hint==0&&p.usedHelp,"Hide erased assistance");
            int limit=0;
            while(!p.solved){
                check(++limit<8,"Puzzle does not finish");int[] move=p.solution();
                check(move!=null&&p.play(move[0],move[1],move[2]),"Solution illegal "+entry.id+" "+p.cursor);
                plies++;
                if(p.pendingReply){
                    long revision=p.revision;
                    check(!p.play(move[0],move[1],move[2]),"Player moved during reply");
                    p.reply();check(p.revision>revision&&p.position.turn==p.side,"Reply/turn invalid "+entry.id);
                }
            }
            check(p.completedMoves()==p.playerMoves(),"Wrong progress");
            check(p.feedback.contains("hints"),"Assisted feedback missing");
            check(!p.play(best[0],best[1],best[2]),"Solved accepts stale input");
            PuzzleSession clean=new PuzzleSession(entry);
            while(!clean.solved){int[] m=clean.solution();check(clean.play(m[0],m[1],m[2]),"Clean solution failed");if(clean.pendingReply)clean.reply();}
            check(!clean.missed&&!clean.usedHelp&&clean.feedback.contains("without help"),"Clean solve classification");
        }
        check(black>70&&white>70,"Insufficient side diversity");
        for(String band:new String[]{"foundation","intermediate","challenging","advanced","expert"})check(catalog.entries.stream().filter(e->e.band().equals(band)).count()==50,"Band quota");
        Game saved=new Game(0,0);saved.move(0,52,36,5);saved.move(1,12,28,5);
        int[] savedBoard=saved.b.clone();int savedPly=saved.chessMoves.size();
        ChessReviewWorkspace w=new ChessReviewWorkspace(ChessPosition.at(saved,0),1);
        check(w.play(53,45,5),"Rejects weak but legal White move");
        check(w.play(12,28,5),"Cannot move Black");
        check(w.play(54,38,5),"Cannot alternate sides");
        check(w.orientation==1,"Board rotated");
        check(w.play(3,39,5)&&w.position.winner==1,"Checkmate branch incorrect");
        check(!w.play(52,36,5),"Moves after mate");long rev=w.revision;
        check(w.undo()&&w.position.winner==-1&&w.revision>rev,"Undo mate/revision");
        check(w.undo()&&w.undo()&&w.undo()&&!w.undo(),"Undo boundary");
        check(Arrays.equals(saved.b,savedBoard)&&saved.chessMoves.size()==savedPly,"Review changed original save");
        check(w.position.turn==0&&w.orientation==1,"Reset orientation/turn");
        Game castle=ChessPosition.fromFen("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
        ChessReviewWorkspace c=new ChessReviewWorkspace(castle,0);
        check(c.play(60,62,5)&&c.position.b[61]==4,"White castle");
        check(c.play(4,2,5)&&c.position.b[3]==-4,"Black castle");
        Game ep=ChessPosition.fromFen("4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1");
        check(ep.move(0,28,19,5)&&ep.b[27]==0,"En passant FEN");
        for(int promotion:new int[]{2,3,4,5}){
            ChessReviewWorkspace p=new ChessReviewWorkspace(ChessPosition.fromFen("7k/P7/8/8/8/8/8/7K w - - 0 1"),0);
            check(p.play(8,0,promotion)&&p.position.b[0]==promotion,"Underpromotion");
        }
        System.out.println("Advanced learning PASS: "+checks+" assertions; "+plies+" player solution moves; White "+white+", Black "+black);
    }
}
