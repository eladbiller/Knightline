package com.traillink;
import java.util.*;
/** Short authored, offline guided opening lessons. No engine-strength claims. */
public final class ChessTutor {
 public static final String[] NAMES={"Italian Game","Ruy Lopez","Queen's Gambit","London System","Sicilian Defence","French Defence","Caro-Kann Defence"};
 public static final String[] LINES={
 "e2e4 e7e5 g1f3 b8c6 f1c4 f8c5",
 "e2e4 e7e5 g1f3 b8c6 f1b5 a7a6",
 "d2d4 d7d5 c2c4 e7e6 b1c3 g8f6",
 "d2d4 d7d5 c1f4 g8f6 e2e3 e7e6",
 "e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4 g8f6",
 "e2e4 e7e6 d2d4 d7d5 b1c3 f8b4",
 "e2e4 c7c6 d2d4 d7d5 b1c3 d5e4 c3e4 c8f5"};
 public static final String[] INTRO={
 "Build a strong centre, develop your knight, then aim the bishop at f7. Finish development and prepare to castle.",
 "Develop the knight and put pressure on the knight defending e5. Avoid rushing to capture; develop and castle.",
 "Offer the c-pawn to challenge Black's central d-pawn. This lesson uses the declined line, then develops both knights.",
 "Develop the bishop outside the pawn chain before playing e3. Build a solid centre and get your kingside ready to castle.",
 "Black challenges the centre asymmetrically with c5. Open the centre with d4 and recapture with your developed knight.",
 "Black prepares d5 with e6. Take central space, support e4 with a knight, and notice Black's pin with Bb4.",
 "Black prepares d5 with c6 and keeps the light-squared bishop free. Develop, recapture in the centre, and notice Bf5."};
 public static int lessonMoveCount(int lesson){if(lesson<0||lesson>=LINES.length)return 0;return (LINES[lesson].split(" ").length+1)/2;}
 public static final String[] BLACK_INTRO={
 "Meet White's centre with e5, defend that pawn with Nc6, and develop your bishop actively to c5.",
 "Claim the centre with e5, support it with Nc6, then question the Spanish bishop with a6.",
 "Hold central space with d5, support it with e6, and develop your king's knight to f6.",
 "Meet d4 with d5, develop Nf6, and strengthen the centre with e6 against White's London setup.",
 "Challenge e4 with c5. Support the centre with d6, exchange on d4, then develop Nf6 with tempo on e4.",
 "Prepare d5 with e6, challenge White's centre, then pin the knight with Bb4 in the Winawer line.",
 "Prepare d5 with c6, exchange on e4, then develop your light-squared bishop before closing its diagonal."};
 public static String objective(int lesson,int side){return side==1&&lesson>=0&&lesson<BLACK_INTRO.length?BLACK_INTRO[lesson]:objective(lesson);}
 public static String objective(int lesson){if(lesson<0||lesson>=INTRO.length)return "Use the centre, development and king safety.";String text=INTRO[lesson];int end=text.indexOf('.');return end<0?text:text.substring(0,end+1);}
 public static int[] next(Game game,int lesson){if(lesson<0||lesson>=LINES.length)return null;String[] moves=LINES[lesson].split(" ");int ply=game.chessMoves.size();if(ply>=moves.length)return null;return StockfishEngine.parseMove(game,moves[ply]);}
 public static String opening(Game game){int ply=game.chessMoves.size();if(ply==0)return "Opening principles: centre, development, king safety.";StringBuilder path=new StringBuilder();Game initial=new Game(0,0);for(int[] m:game.chessMoves){if(path.length()>0)path.append(' ');path.append(StockfishEngine.uci(initial,m));initial.chessApply(m[0],m[1],m[2]);initial.turn=1-initial.turn;}
 String current=path.toString();for(int i=0;i<LINES.length;i++)if(current.equals(LINES[i])||current.startsWith(LINES[i]+" "))return NAMES[i]+" · develop remaining pieces and protect your king.";for(int i=0;i<LINES.length;i++)if(LINES[i].startsWith(current+" "))return "Opening: develop toward "+NAMES[i]+" (several lines are possible).";return "Off the lesson lines · develop pieces, contest the centre and check king safety.";}
 public static String explain(Game game,int[] move){if(move==null)return "No move is available.";int piece=Math.abs(game.b[move[0]]);String san=ChessNotation.san(game,move[0],move[1],move[2]);if(piece==6&&Math.abs(move[1]-move[0])==2)return san+": castle to improve king safety and connect your rooks.";if(san.endsWith("#"))return san+": this move gives checkmate.";if(san.contains("x"))return san+": captures a piece or pawn. Check what can recapture afterward.";if(piece==2||piece==3)return san+": develops or improves a minor piece. Look at its new attacks and defenders.";if(piece==1&&(move[1]%8==3||move[1]%8==4))return san+": contests central space and can open lines for your pieces.";if(san.endsWith("+"))return san+": gives check. Look at every legal king escape and blocking move.";return san+": the engine's best move found. Check threats, captures and king safety before playing.";}
 public static String pieceName(Game game,int[] move){if(game==null||move==null)return "piece";switch(Math.abs(game.b[move[0]])){case 1:return "pawn";case 2:return "knight";case 3:return "bishop";case 4:return "rook";case 5:return "queen";case 6:return "king";default:return "piece";}}
 /** A conceptual first hint: useful, but deliberately does not reveal the square or SAN. */
 public static String cue(Game game,int[] move){if(game==null||move==null)return "Look for a move that improves your position.";int piece=Math.abs(game.b[move[0]]);if(piece==6&&Math.abs(move[1]-move[0])==2)return "Keep king safety in mind and look for castling.";if(piece==2)return "Develop a knight toward the centre.";if(piece==3)return "Develop a bishop to an active diagonal.";if(piece==1&&(move[1]%8==3||move[1]%8==4))return "Use a pawn to claim or challenge the centre.";if(piece==1)return "Use a pawn move that helps your pieces develop.";if(Math.abs(move[1]-move[0])==2)return "Look for a move that improves king safety.";return "Look for the move that improves your activity and central control.";}
 /** The final hint names the move only after the learner has requested the arrow. */
 public static String briefHint(Game game,int[] move){if(move==null)return "No move is available.";return ChessNotation.san(game,move[0],move[1],move[2])+" · "+cue(game,move);}
}
