package com.traillink;
import android.graphics.*;

/** Original mechanical silhouettes with team markings; no borrowed game art or font placeholders. */
final class RiftArt {
 final Paint p=new Paint(3);Canvas c;int team;
 void rect(float l,float t,float r,float b,int color,float radius){p.setColor(color);p.setStyle(Paint.Style.FILL);c.drawRoundRect(l,t,r,b,radius,radius,p);}
 void line(float x,float y,float a,float b,int color,float width){p.setColor(color);p.setStrokeWidth(width);p.setStrokeCap(Paint.Cap.ROUND);c.drawLine(x,y,a,b,p);}
 void circle(float x,float y,float r,int color){p.setColor(color);c.drawCircle(x,y,r,p);}
 void hull(float... xy){Path path=new Path();path.moveTo(xy[0],xy[1]);for(int i=2;i<xy.length;i+=2)path.lineTo(xy[i],xy[i+1]);path.close();p.setShader(new LinearGradient(0,-45,0,45,0xff74909d,0xff273e4c,Shader.TileMode.CLAMP));c.drawPath(path,p);p.setShader(null);p.setStyle(Paint.Style.STROKE);p.setStrokeWidth(2);p.setColor(0xffa0b9be);c.drawPath(path,p);p.setStyle(Paint.Style.FILL);}
 void draw(Canvas canvas,int type,float x,float y,float radius,int color,int tick,float facing){c=canvas;team=color;int save=c.save();c.translate(x,y);c.scale(radius/50,radius/50);if(type<10)c.rotate(facing);
  if(type>=10){hull(-48,-20,-30,-43,30,-43,48,-20,48,30,28,46,-28,46,-48,30);rect(-38,32,38,42,0xff172b38,3);for(int a=-24;a<=24;a+=16){rect(a,35,a+8,38,team,0);}
   if(type==10){hull(-30,-23,0,-40,30,-23,30,17,0,33,-30,17);circle(0,-3,22,0xff162d3c);circle(0,-3,16,team);circle(-5,-9,7,0xffd9f5ee);line(28,-20,40,-58,0xffb9c9cd,3);circle(40,-58,4,tick%20<10?team:0xff263c49);for(int a=-1;a<=1;a+=2){rect(a<0?-57:39,-16,a<0?-39:57,18,0xff1e3e57,2);line(a*47,-12,a*47,14,team,2);}}
   else if(type==11){rect(-14,-32,14,29,0xff425b6d,5);for(int a=-1;a<=1;a+=2){rect(a<0?-57:20,-35,a<0?-20:57,24,0xff234c6a,2);for(int j=0;j<4;j++)line(a<0?-53:24,-29+j*13,a<0?-24:53,-29+j*13,0xff67a3c1,2);}circle(0,-4,8,team);}
   else if(type==12){for(int a=-1;a<=1;a+=2){rect(a<0?-35:3,-26,a<0?-3:35,30,0xff172e3c,8);for(int j=0;j<4;j++)line(a<0?-29:9,-17+j*10,a<0?-9:29,-17+j*10,0xff718a94,3);rect(a<0?-30:8,23,a<0?-8:30,29,team,1);}rect(-12,-38,12,-25,team,2);}
   else if(type==13){for(int j=-1;j<=1;j++){rect(-31+j*23,-30,-19+j*23,25,0xff172b36,2);line(-29+j*23,-25,-29+j*23,18,0xff9cabb0,3);}rect(-36,-17,33,2,0xff39535d,2);circle(5,8,15,0xffc89359);circle(5,8,8,0xfffff0bd);rect(25,-48,36,-10,0xff284150,3);circle(31,-48,5,team);}
   else if(type==14){circle(0,-3,29,0xff172d3c);circle(0,-8,24,0xff5b959d);circle(-8,-16,11,0xffb0dfdf);line(-27,14,26,14,team,4);int s=c.save();c.rotate(tick%120*3,0,-8);line(0,-8,20,-8,team,2);c.restoreToCount(s);rect(-31,23,-15,28,team,1);rect(15,23,31,28,team,1);}
   else if(type==15){circle(0,0,27,0xff192e3c);hull(-18,-16,18,-16,24,13,-24,13);line(-8,-9,-8,-54,0xffb0c0c7,8);line(8,-9,8,-54,0xffb0c0c7,8);rect(-16,12,16,20,team,2);}
   else if(type==16){for(int a=-1;a<=1;a+=2){rect(a<0?-33:4,-24,a<0?-4:33,22,0xff304d50,11);rect(a<0?-26:11,-16,a<0?-11:26,15,0xff8fe0a6,5);}line(-18,25,-18,38,0xffa0b9b8,5);line(-18,38,33,38,0xffa0b9b8,5);line(33,38,33,15,0xffa0b9b8,5);}
   else if(type==17){rect(-36,-29,36,27,0xff142d3b,3);p.setColor(0xffd0d8c1);p.setStyle(Paint.Style.STROKE);p.setStrokeWidth(3);c.drawCircle(0,-1,24,p);p.setStyle(Paint.Style.FILL);line(-27,-21,-18,-21,team,3);line(18,19,27,19,team,3);hull(0,-24,17,16,0,8,-17,16);}
  }else if(type==5){hull(0,-70,18,-15,61,33,14,22,0,41,-14,22,-61,33,-18,-15);rect(-7,-27,7,-2,team,5);line(-28,18,-28,35,0xffffd997,5);line(28,18,28,35,0xffffd997,5);}
  else if(type==0){line(-12,4,-45,26,0xff9eb3bd,8);line(12,4,45,26,0xff9eb3bd,8);line(0,13,0,43,0xff9eb3bd,8);hull(-25,-24,25,-24,33,18,-33,18);rect(-16,-15,16,-2,team,4);line(13,-15,28,-39,0xffc4dadd,5);circle(29,-41,6,0xffedf5b5);}
  else if(type==2||type==3){rect(-48,-35,-29,41,0xff101c26,6);rect(29,-35,48,41,0xff101c26,6);for(int j=-25;j<=30;j+=13){line(-46,j,-32,j,0xff657886,3);line(32,j,46,j,0xff657886,3);}hull(-28,-36,28,-36,32,33,-32,33);rect(-23,20,23,29,team,2);circle(0,-3,20,0xff294554);line(0,-9,0,type==3?-78:-56,0xffc5d4d7,type==3?13:7);rect(-13,-13,13,8,team,4);}
  else{line(-14,16,-24,46,0xff9daeb8,13);line(14,16,24,46,0xff9daeb8,13);hull(-25,-22,25,-22,27,20,-27,20);circle(0,-28,18,0xffafc0c6);rect(-12,-36,12,-26,team,4);if(type==4){line(-14,0,14,0,0xffe9fff3,8);line(0,-14,0,14,0xffe9fff3,8);}else{line(30,14,30,-49,0xff142834,10);rect(-19,-8,17,5,team,2);}}
  c.restoreToCount(save);
 }
}
