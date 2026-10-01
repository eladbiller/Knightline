package com.traillink;
import java.util.*;

public final class EndgameFeedbackTest {
    private static int checks;
    private static void check(boolean yes,String message){checks++;if(!yes)throw new AssertionError(message);}
    public static void main(String[] args){
        for(int i=0;i<EndgameLessons.ALL.length;i++)for(int side=0;side<2;side++){
            EndgameLessons.Lesson l=EndgameLessons.ALL[i];Game g=EndgameLessons.position(i,side,false);
            check(g.turn==side,"Side to move");check(!g.check(1-side)&&!g.check(side),"Illegal initial check "+i);
            check(g.history.size()==1&&Arrays.equals(g.history.get(0),Arrays.copyOf(g.b,64)),"Custom initial history");
            check(l.playable?!g.legal().isEmpty():g.legal().isEmpty(),"Playable/dead move availability "+i);
            check(l.playable?g.winner<0:g.winner==2,"Dead-position distinction "+i);
            if(l.playable){
                Game finish=EndgameLessons.position(i,side,true);int[] move=ChessPosition.uci(l.finish);
                if(side==1){move[0]=63-move[0];move[1]=63-move[1];}
                check(!finish.check(1-side),"Finish setup checks non-moving king "+i);
                check(finish.move(side,move[0],move[1],move[2]),"Legal finish "+i);
                check(finish.winner==side&&finish.check(1-side),"Expected checkmate "+i);
                check(ChessPosition.at(finish,0).winner<0,"Review custom starting position");
                check(ChessPosition.at(finish,1).winner==side,"Review after mate");
            }
        }
        check(!EndgameLessons.position(4,0,false).insufficient(),"Two knights possible mate, not dead");
        for(int lesson=0;lesson<ChessTutor.LINES.length;lesson++)for(int side=0;side<2;side++){
            Game g=new Game(0,0);int learner=0,coach=0;
            for(int n=0;n<ChessTutor.LINES[lesson].split(" ").length;n++){
                int[] m=ChessTutor.next(g,lesson);check(m!=null,"Authored reply exists");
                if(g.turn==side)learner++;else coach++;
                check(g.move(g.turn,m[0],m[1],m[2]),"Opening legal for either learner side");
            }
            check(learner==ChessTutor.lessonMoveCount(lesson)&&coach==learner,"Both sides complete full opening");
            check(ChessTutor.next(g,lesson)==null,"Finite lesson completes");
        }
        Game ep=ChessPosition.fromFen("4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1");
        int n=MoveFeedback.pieces(ep.b);ep.move(0,28,19,5);
        check(MoveFeedback.cue(n,MoveFeedback.pieces(ep.b),ep.winner).equals("capture"),"En passant capture sound");
        Game promotion=ChessPosition.fromFen("7k/P7/8/8/8/8/8/7K w - - 0 1");n=MoveFeedback.pieces(promotion.b);promotion.move(0,8,0,5);
        check(MoveFeedback.cue(n,MoveFeedback.pieces(promotion.b),promotion.winner).equals("move"),"Promotion is not capture");
        check(MoveFeedback.cue(4,3,0).equals("finish"),"Checkmate capture uses finish");
        System.out.println("Endgame/feedback PASS: "+checks+" assertions");
    }
}
