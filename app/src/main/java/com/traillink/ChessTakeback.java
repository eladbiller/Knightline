package com.traillink;

/** Host-side position-bound consent. Sequence numbers never go backwards on undo. */
final class ChessTakeback {
    final String id, session;
    final int sequence, requester, ply;
    ChessTakeback(String id, String session, Game game, int requester) {
        int target=target(game,requester);
        if(id==null||id.isEmpty()||id.length()>96||session==null||session.isEmpty()||target<0)
            throw new IllegalArgumentException("No move to take back.");
        this.id=id;this.session=session;this.sequence=game.seq;this.requester=requester;this.ply=target;
    }
    static int target(Game game,int player) {
        return game==null||game.winner>=0||player<0||player>1?-1:ChessTimeline.undoPly(game,true,player);
    }
    boolean current(String session,Game game) {
        return this.session.equals(session)&&game!=null&&game.winner<0&&game.seq==sequence&&target(game,requester)==ply;
    }
    Game accept(String session,Game game,int responder) {
        if(responder!=1-requester||!current(session,game))throw new IllegalArgumentException("That request has expired.");
        Game result=ChessTimeline.branch(game,ply);
        result.seq=game.seq+1;
        return result;
    }
}
