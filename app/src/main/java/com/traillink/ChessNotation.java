package com.traillink;

/** Standard algebraic notation, including legal disambiguation and check/mate. */
public final class ChessNotation {
 public static String san(Game g,int a,int z,int promotion){if(!g.in(a,64)||!g.in(z,64)||!g.chessLegal(a,z))return "";if(promotion<2||promotion>5)promotion=5;int piece=Math.abs(g.b[a]);String result;
  if(piece==6&&Math.abs(z-a)==2)result=z>a?"O-O":"O-O-O";
  else {StringBuilder s=new StringBuilder();boolean capture=g.b[z]!=0||piece==1&&a%8!=z%8;
   if(piece!=1){s.append(" PNBRQK".charAt(piece));boolean other=false,sameFile=false,sameRank=false;for(int i=0;i<64;i++)if(i!=a&&g.b[i]==g.b[a]&&g.chessLegal(i,z)){other=true;if(i%8==a%8)sameFile=true;if(i/8==a/8)sameRank=true;}if(other){if(!sameFile)s.append((char)('a'+a%8));else if(!sameRank)s.append(8-a/8);else s.append(Game.square(a));}}
   else if(capture)s.append((char)('a'+a%8));if(capture)s.append('x');s.append(Game.square(z));if(piece==1&&(z/8==0||z/8==7))s.append('=').append(" PNBRQK".charAt(promotion));result=s.toString();}
  Game next=g.copy();next.chessApply(a,z,promotion);next.turn=1-next.turn;if(next.check(next.turn)){boolean legal=false;for(int i=0;i<64&&!legal;i++)for(int j=0;j<64&&!legal;j++)if(next.chessLegal(i,j))legal=true;result+=legal?"+":"#";}return result;
 }
}
