package com.traillink;

import java.util.Arrays;

/** Independent offline board: legal play, transactional editing and native undo. */
final class ChessSandbox implements java.io.Serializable {
    private static final long serialVersionUID=1L;
    Game position=new Game(0,0);
    int orientation;
    long revision;
    int[] draft;
    int draftTurn;
    int draftRights;
    boolean editing(){return draft!=null;}
    void edit(){draft=Arrays.copyOf(position.b,64);draftTurn=position.turn;draftRights=position.rights;revision++;}
    void cancel(){draft=null;revision++;}
    void place(int square,int piece){
        if(!editing()||square<0||square>=64||piece < -6||piece>6)throw new IllegalArgumentException("Choose a piece and square.");
        draft[square]=piece;revision++;
    }
    void clear(){if(!editing())throw new IllegalArgumentException("Open the editor first.");Arrays.fill(draft,0);draftRights=0;revision++;}
    void apply(){
        if(!editing())return;
        Game next=new Game(0,0);next.b=Arrays.copyOf(draft,200);next.turn=draftTurn;next.rights=draftRights;
        validate(next);ChessPosition.initializeHistory(next);finish(next);position=next;draft=null;revision++;
    }
    void importFen(String fen){
        if(fen==null||fen.length()>150)throw new IllegalArgumentException("Enter a standard six-field FEN.");
        Game next=ChessPosition.fromFen(fen);validate(next);finish(next);position=next;draft=null;revision++;
    }
    void reset(){position=new Game(0,0);draft=null;revision++;}
    boolean play(int from,int to,int promotion){
        if(editing()||promotion<2||promotion>5)return false;
        if(!position.move(position.turn,from,to,promotion))return false;revision++;return true;
    }
    boolean undo(){
        if(editing()||position.chessMoves.isEmpty())return false;
        position=ChessTimeline.branch(position,position.chessMoves.size()-1);revision++;return true;
    }
    static void validate(Game g){
        int[] kings=new int[2],count=new int[2],pawns=new int[2];
        for(int i=0;i<64;i++){
            int p=g.b[i];if(p==0)continue;int side=p>0?0:1;count[side]++;
            if(Math.abs(p)==6)kings[side]++;
            if(Math.abs(p)==1){pawns[side]++;if(i<8||i>=56)throw new IllegalArgumentException("Pawns cannot be on rank 1 or 8.");}
        }
        if(kings[0]!=1||kings[1]!=1)throw new IllegalArgumentException("Place exactly one White king and one Black king.");
        if(count[0]>16||count[1]>16||pawns[0]>8||pawns[1]>8)throw new IllegalArgumentException("Use at most 16 pieces and 8 pawns per side.");
        if(g.check(1-g.turn))throw new IllegalArgumentException("The side that just moved cannot be in check. Change the position or side to move.");
        int[] squares={63,56,7,0};
        for(int i=0;i<4;i++)if((g.rights&(1<<i))!=0&&(g.b[i<2?60:4]!=(i<2?6:-6)||g.b[squares[i]]!=(i<2?4:-4)))
            throw new IllegalArgumentException("Castling requires the king and rook on their starting squares.");
        if(g.ep>=0){
            int offset=g.turn==0?8:-8;
            if(g.ep/8!=(g.turn==0?2:5)||g.b[g.ep]!=0||g.b[g.ep+offset]!=(g.turn==0?-1:1)||g.b[g.ep-offset]!=0)
                throw new IllegalArgumentException("Invalid en passant target.");
        }
    }
    private static void finish(Game g){
        if(g.legal().isEmpty())g.winner=g.check(g.turn)?1-g.turn:2;
        else if(g.insufficient()||g.quiet>=100)g.winner=2;
    }
}
