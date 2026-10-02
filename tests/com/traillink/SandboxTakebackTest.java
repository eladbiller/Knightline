package com.traillink;
import java.util.*;
import java.io.*;

public final class SandboxTakebackTest {
    static int checks;
    static void check(boolean b,String message){checks++;if(!b)throw new AssertionError(message);}
    static void rejects(Runnable r,String message){try{r.run();throw new AssertionError(message);}catch(IllegalArgumentException expected){checks++;}}
    static void move(Game g,String uci){int[] m=ChessPosition.uci(uci);check(g.move(g.turn,m[0],m[1],m[2]),"legal "+uci);}
    public static void main(String[] args)throws Exception{
        Game g=new Game(0,0);move(g,"e2e4");move(g,"d7d5");move(g,"e4d5");move(g,"d8d5");
        int[][] c=ChessCaptures.byPlayer(g);check(Arrays.equals(c[0],new int[]{-1})&&Arrays.equals(c[1],new int[]{1}),"captures belong to capturer");
        Game ep=new Game(0,0);for(String m:new String[]{"e2e4","a7a6","e4e5","d7d5","e5d6"})move(ep,m);
        check(Arrays.equals(ChessCaptures.byPlayer(ep)[0],new int[]{-1}),"en passant capture");
        Game promotion=ChessPosition.fromFen("1r5k/P7/8/8/8/8/8/7K w - - 0 1");
        check(ChessCaptures.byPlayer(promotion)[0].length==0,"custom root has no invented captures");
        move(promotion,"a7b8n");check(Arrays.equals(ChessCaptures.byPlayer(promotion)[0],new int[]{-4}),"promotion capture is rook not missing pawn");
        for(int requester=0;requester<2;requester++){
            ChessTakeback req=new ChessTakeback("request","session",g,requester);
            Game next=req.accept("session",g,1-requester);
            check(next.turn==requester,"returns to requester's decision");check(next.seq>g.seq,"sequence monotonic");
            check(next.chessMoves.size()==(requester==0?2:3),"correct ply");
            rejects(()->req.accept("other",g,1-req.requester),"other session accepted");
            rejects(()->req.accept("session",g,req.requester),"self consent accepted");
            Game changed=g.copy();move(changed,"b1c3");rejects(()->req.accept("session",changed,1-req.requester),"stale consent accepted");
            Game done=g.copy();done.winner=2;rejects(()->req.accept("session",done,1-req.requester),"finished accepted");
        }
        check(ChessTakeback.target(new Game(0,0),0)<0,"no takeback before moves");
        ChessTakeback req=new ChessTakeback("r","s",ep,0);Game undo=req.accept("s",ep,1);
        check(ChessCaptures.byPlayer(undo)[0].length==0&&undo.ep==ChessPosition.square("d6"),"undo restores en passant and captures");
        ChessSandbox s=new ChessSandbox();s.edit();s.clear();
        rejects(s::apply,"empty playable");check(s.editing(),"invalid edit retained");
        s.place(60,6);s.place(4,-6);s.place(56,4);s.apply();check(!s.editing()&&s.position.winner<0,"custom rook position playable");
        check(s.play(56,48,5),"white move");check(s.play(4,12,5),"black move");check(s.orientation==0,"no auto rotate");
        check(s.undo()&&s.position.turn==1,"undo side restored");
        check(s.position.b[48]==4&&s.position.b[56]==0,"undo retains earlier rook move");
        s.edit();s.place(0,1);rejects(s::apply,"last rank pawn accepted");s.cancel();check(!s.editing()&&s.position.b[0]==0,"cancel transactional");
        rejects(()->s.importFen("8/8/8/8/8/8/4k3/4K3 w - - 0 1"),"adjacent kings");
        rejects(()->s.importFen("4k3/8/8/8/8/8/8/4K3 w K - 0 1"),"impossible castling");
        rejects(()->s.importFen("4k3/8/8/8/8/8/8/4K3 w - d6 0 1"),"bad ep");
        s.importFen("7k/8/8/8/8/8/8/K7 w - - 0 1");check(s.position.winner==2,"bare kings draw");
        s.importFen("7k/6Q1/5K2/8/8/8/8/8 b - - 0 1");check(s.position.winner==0,"checkmate detected");
        s.reset();check(s.position.legal().size()==20,"standard reset");
        s.edit();s.clear();s.place(35,5);
        ByteArrayOutputStream bytes=new ByteArrayOutputStream();new ObjectOutputStream(bytes).writeObject(s);
        ChessSandbox restored=(ChessSandbox)new ObjectInputStream(new ByteArrayInputStream(bytes.toByteArray())).readObject();
        check(restored.editing()&&restored.draft[35]==5&&restored.position.legal().size()==20,"draft and playable board persist independently");
        System.out.println("SandboxTakebackTest: "+checks+" assertions passed");
    }
}
