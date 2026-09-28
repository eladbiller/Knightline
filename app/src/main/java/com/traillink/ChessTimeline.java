package com.traillink;

import java.util.Arrays;

/** Builds an independent, playable branch; replay also restores repetition and special-move rights. */
final class ChessTimeline {
 static int undoPly(Game match, boolean solo, int player) {
  if(match==null||match.id!=0||match.chessMoves.isEmpty())return -1;
  for(int i=match.chessMoves.size()-1;i>=0;i--)
   if(!solo||match.chessStates.get(i)[0]==player)return i;
  return -1;
 }
 static Game branch(Game match,int ply) {
  if(match==null||match.id!=0||ply<0||ply>match.chessMoves.size())throw new IllegalArgumentException("Invalid chess position");
  if(match.history.size()!=match.chessMoves.size()+1||match.chessStates.size()!=match.history.size())throw new IllegalArgumentException("Incomplete move history");
  Game result=new Game(0,0);
  result.b=Arrays.copyOf(match.history.get(0),200);
  int[] initial=match.chessStates.get(0);
  result.turn=initial[0];result.ep=initial[1];result.rights=initial[2];result.quiet=initial[3];
  result.history.clear();result.chessStates.clear();result.commentary.clear();result.repetition.clear();
  result.history.add(Arrays.copyOf(result.b,64));result.chessStates.add(initial.clone());
  result.commentary.add(match.commentary.isEmpty()?"Starting position":match.commentary.get(0));result.remember();
  for(int i=0;i<ply;i++){
   int[] move=match.chessMoves.get(i);
   if(!result.move(result.turn,move[0],move[1],move[2])||!Arrays.equals(Arrays.copyOf(result.b,64),match.history.get(i+1)))
    throw new IllegalArgumentException("Move history cannot be replayed");
  }
  if(result.winner>=0)throw new IllegalArgumentException("This position has already ended. Choose an earlier move.");
  return result;
 }
 private ChessTimeline(){}
}
