package com.traillink;

/** Multi-move puzzle authority. Wrong guesses cannot change the position. */
public final class PuzzleSession {
    public final PuzzleCatalog.Entry entry;
    public final int side;
    public Game position;
    public int cursor=1, attempts, hint;
    public long revision;
    public boolean solved, usedHelp, missed, pendingReply;
    public String feedback="Find the strongest continuation.";
    private int[] warmupSolution;
    public PuzzleSession(PuzzleCatalog.Entry entry) {
        this.entry=entry;
        if(entry.index<6){
            ChessPuzzles p=new ChessPuzzles(entry.index);position=p.position.copy();int[] move=p.solution();warmupSolution=new int[]{move[0],move[1],5};feedback="Find checkmate in one move.";
        } else {
            position=ChessPosition.fromFen(entry.fen);int[] first=ChessPosition.uci(entry.moves[0]);
            if(!position.move(position.turn,first[0],first[1],first[2]))throw new IllegalArgumentException("Illegal puzzle setup: "+entry.id);
        }
        side=position.turn;
    }
    public int[] solution(){return solved||pendingReply?null:warmupSolution!=null?warmupSolution.clone():ChessPosition.uci(entry.moves[cursor]);}
    public boolean play(int from,int to,int promotion){
        if(solved||pendingReply||position.turn!=side)return false;
        Game next=position.copy();
        if(!next.move(side,from,to,promotion)){feedback="Choose a legal move.";return false;}
        attempts++;int[] expected=solution();
        boolean promotes=Math.abs(position.b[from])==1&&(to/8==0||to/8==7);
        if(next.winner!=side&&(from!=expected[0]||to!=expected[1]||(promotes&&promotion!=expected[2]))){
            missed=true;feedback="That move misses the tactic. The position is unchanged; try another idea.";return false;
        }
        position=next;revision++;hint=0;cursor++;
        if(warmupSolution!=null||position.winner==side||cursor>=entry.moves.length){solved=true;feedback=usedHelp?"Solved with hints. Revisit this in Practice missed.":missed?"Solved after another try. Revisit it to secure the pattern.":"Solved without help. Well calculated.";}
        else {pendingReply=true;feedback="Good continuation. Your opponent is replying…";}
        return true;
    }
    public void reply(){
        if(!pendingReply||solved)return;
        int[] move=ChessPosition.uci(entry.moves[cursor]);
        if(!position.move(position.turn,move[0],move[1],move[2]))throw new IllegalStateException("Invalid packaged reply: "+entry.id);
        cursor++;revision++;pendingReply=false;feedback="Keep calculating. Find your next move.";
    }
    public void advanceHint(){if(!solved&&!pendingReply){hint=(hint+1)%4;usedHelp=true;}}
    public int playerMoves(){return entry.index<6?1:entry.moves.length/2;}
    public int completedMoves(){return solved?playerMoves():cursor/2;}
    public String hintText(){
        if(entry.index<6)return ChessPuzzles.IDEAS[entry.index];
        int[] move=solution();
        if(move==null)return feedback;
        if(hint>=2)return "Look at your "+Game.pieceName(position.b[move[0]])+" on "+Game.square(move[0])+".";
        return entry.theme+". Compare checks, captures, and threats, then account for the opponent's strongest reply.";
    }
}
