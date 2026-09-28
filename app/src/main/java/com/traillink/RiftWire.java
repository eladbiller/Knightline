package com.traillink;
import org.json.*;

/** Player-filtered snapshots. Hidden enemy entities, economy, orders and queues never cross the link. */
final class RiftWire {
 static JSONObject snapshot(RiftWar war,int side,String session,boolean paused){
  JSONArray units=new JSONArray();for(RiftWar.Entity e:war.entities)if(e.hp>0&&(e.side==side||war.visible[side][RiftWar.cell(e.x,e.y)])){
   JSONArray row=new JSONArray();row.put(e.id).put(e.side).put(e.type).put(Math.round(e.x*100)).put(Math.round(e.y*100)).put(e.hp).put(e.max).put(e.build).put(e.flash);
   if(e.side==side){row.put(e.progress).put(new JSONArray(e.queue)).put(e.goalX).put(e.goalY).put(e.order).put(e.carry);}else row.put(0).put(new JSONArray()).put(0).put(0).put(0).put(0);
   RiftWar.Entity victim=war.get(e.shot);row.put(victim!=null&&(victim.side==side||war.visible[side][RiftWar.cell(victim.x,victim.y)])?e.shot:-1);units.put(row);
  }
  StringBuilder fog=new StringBuilder();for(int i=0;i<RiftWar.W*RiftWar.H;i++)fog.append(war.visible[side][i]?'2':war.explored[side][i]?'1':'0');
  JSONArray nodes=new JSONArray();for(int i=0;i<war.nodes.length;i++)if(war.nodes[i]>0&&war.explored[side][i])nodes.put(MainActivity.array(new int[]{i,war.nodes[i],war.visible[side][i]?war.remaining[i]:1}));
  JSONArray tech=new JSONArray();for(int t=0;t<22;t++)tech.put(war.tech(side,t));
  return MainActivity.obj("type","state","id",15,"session",session,"seq",war.tick,"me",side,"turn",side,"winner",war.winner,"b",new JSONArray(),"moves",new JSONArray(),"units",units,"terrain",MainActivity.array(war.terrain),"nodes",nodes,"fog",fog.toString(),"ore",war.ore[side],"gas",war.gas[side],"used",war.supply(side),"cap",war.cap(side),"weapons",war.weapons[side],"armor",war.armor[side],"tech",tech,"ack",war.lastCommand[side],"paused",paused,"message",war.message[side],"doctrine",war.doctrine(side));
 }
}
