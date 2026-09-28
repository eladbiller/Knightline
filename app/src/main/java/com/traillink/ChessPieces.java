package com.traillink;

import android.graphics.*;

/** Original resolution-independent Staunton-inspired set, drawn without font glyphs. */
final class ChessPieces {
 private final Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG);
 private Canvas canvas;private int fill,edge,shine;
 void draw(Canvas c,int piece,float x,float y,float size){
  canvas=c;int save=c.save();c.translate(x-size*.5f,y-size*.5f);c.scale(size/100,size/100);
  fill=piece>0?0xfffffaf0:0xff202b3c;edge=piece>0?0xff6f6d65:0xff0d1420;shine=piece>0?0xffd7c7a4:0xff52647a;
  paint.setStyle(Paint.Style.FILL);paint.setColor(0x26000000);c.drawOval(20,82,82,92,paint);
  int kind=Math.abs(piece);
  if(kind==1){body(40,39,60,39,62,66,72,78,28,78,38,66);oval(35,15,65,45);}
  if(kind==2){body(29,76,34,59,49,43,33,48,23,41,39,24,42,12,50,20,65,20,76,38,74,62,70,77);line(47,31,51,30);line(29,41,35,41);line(58,37,62,49);}
  if(kind==3){body(42,43,58,43,60,63,71,77,29,77,40,63);Path p=new Path();p.moveTo(50,13);p.cubicTo(26,31,29,47,50,49);p.cubicTo(72,47,74,31,50,13);draw(p);line(53,24,44,36);oval(46,7,54,15);}
  if(kind==4){body(33,39,67,39,64,65,72,77,28,77,36,65);body(27,15,38,15,38,24,45,24,45,15,55,15,55,24,62,24,62,15,73,15,70,40,30,40);line(33,46,67,46);}
  if(kind==5){body(39,45,61,45,62,62,72,77,28,77,38,62);body(26,25,39,34,50,17,61,34,74,25,65,49,35,49);for(int[] a:new int[][]{{23,19,31,27},{46,10,54,18},{69,19,77,27}})oval(a[0],a[1],a[2],a[3]);line(37,53,63,53);}
  if(kind==6){body(37,42,63,42,60,61,72,77,28,77,40,61);Path p=new Path();p.moveTo(36,44);p.cubicTo(15,21,41,20,50,30);p.cubicTo(60,20,85,21,64,44);p.close();draw(p);body(46,8,54,8,54,15,62,15,62,22,54,22,54,29,46,29,46,22,38,22,38,15,46,15);line(36,49,64,49);}
  body(29,74,71,74,75,82,25,82);body(25,82,75,82,78,88,22,88);
  paint.setColor(shine);paint.setStrokeWidth(2);c.drawLine(30,79,70,79,paint);c.restoreToCount(save);
 }
 private void body(float... xy){Path p=new Path();p.moveTo(xy[0],xy[1]);for(int i=2;i<xy.length;i+=2)p.lineTo(xy[i],xy[i+1]);p.close();draw(p);}
 private void oval(float l,float t,float r,float b){Path p=new Path();p.addOval(l,t,r,b,Path.Direction.CW);draw(p);}
 private void draw(Path p){paint.setStyle(Paint.Style.FILL);paint.setColor(fill);canvas.drawPath(p,paint);paint.setStyle(Paint.Style.STROKE);paint.setStrokeWidth(1.45f);paint.setStrokeJoin(Paint.Join.ROUND);paint.setColor(edge);canvas.drawPath(p,paint);paint.setStyle(Paint.Style.FILL);}
 private void line(float x,float y,float z,float t){paint.setColor(shine);paint.setStrokeWidth(2.4f);paint.setStrokeCap(Paint.Cap.ROUND);canvas.drawLine(x,y,z,t,paint);}
}
