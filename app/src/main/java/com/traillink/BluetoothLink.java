package com.traillink;

import android.bluetooth.*;
import java.io.*;
import java.util.UUID;
import java.util.concurrent.*;
import org.json.JSONObject;

/** Secure paired RFCOMM; no IP sockets, remote services, or Internet permission. */
public class BluetoothLink {
 /** Knightline-only RFCOMM endpoint. ChessLink deliberately uses a different UUID. */
 public static final UUID SERVICE=com.eladbiller.knightline.BuildConfig.APPLICATION_ID.endsWith(".gpt")
     ?UUID.nameUUIDFromBytes("com.eladbiller.knightline.gpt.bluetooth.v2".getBytes(java.nio.charset.StandardCharsets.UTF_8))
     :UUID.fromString("c2d6c10c-8171-4f83-b9f3-6e1789e1683f");
 public interface Listener {void connected(String name,String address);void message(JSONObject value);void status(String value);void lost();}
 final BluetoothAdapter adapter;final Listener listener;final ExecutorService writer=Executors.newSingleThreadExecutor();
 volatile BluetoothSocket socket;volatile BluetoothServerSocket server;volatile int generation;volatile boolean connected;
 private JSONObject latest;private boolean latestQueued;
 /** At most one pending RTS frame; slow radios drop obsolete snapshots, not commands/chat. */
 public synchronized void sendLatest(JSONObject data){latest=data;if(!latestQueued){latestQueued=true;writer.execute(()->drainLatest());}}
 private void drainLatest(){JSONObject data;int epoch;BluetoothSocket target;synchronized(this){data=latest;latest=null;epoch=generation;target=socket;}try{if(data!=null&&connected&&target!=null){byte[] bytes=data.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8);if(bytes.length>65536)throw new IOException("Frame too large");DataOutputStream out=new DataOutputStream(target.getOutputStream());out.writeInt(bytes.length);out.write(bytes);out.flush();}}catch(Exception e){fail(epoch,"Connection lost • reconnect to resume");}synchronized(this){if(latest!=null)writer.execute(()->drainLatest());else latestQueued=false;}}
 public BluetoothLink(BluetoothAdapter a,Listener l){adapter=a;listener=l;}
 public synchronized void close(){latest=null;generation++;connected=false;try{if(server!=null)server.close();}catch(Exception ignored){}try{if(socket!=null)socket.close();}catch(Exception ignored){}server=null;socket=null;}
 public void host(){close();final int epoch=generation;new Thread(()->{try{BluetoothServerSocket ss=adapter.listenUsingRfcommWithServiceRecord("Knightline",SERVICE);if(epoch!=generation){ss.close();return;}server=ss;listener.status("Room open • waiting for a Knightline friend");BluetoothSocket s=ss.accept();ss.close();if(epoch!=generation){s.close();return;}attach(s,epoch);}catch(Exception e){fail(epoch,"Could not host: "+e.getMessage());}},"Knightline-host").start();}
 public void join(BluetoothDevice device){close();final int epoch=generation;new Thread(()->{try{adapter.cancelDiscovery();BluetoothSocket s=device.createRfcommSocketToServiceRecord(SERVICE);socket=s;listener.status("Connecting… accept pairing on both phones");new Thread(()->{try{Thread.sleep(60000);if(epoch==generation&&!connected)s.close();}catch(Exception ignored){}},"Knightline-timeout").start();s.connect();if(epoch!=generation){s.close();return;}attach(s,epoch);}catch(Exception e){android.util.Log.w("Knightline","Bluetooth connect failed",e);fail(epoch,"Connection failed. Check that your friend is hosting Knightline and both phones accepted pairing.");}},"Knightline-join").start();}
 void attach(BluetoothSocket s,int epoch)throws Exception{socket=s;connected=true;listener.connected(s.getRemoteDevice().getName(),s.getRemoteDevice().getAddress());DataInputStream in=new DataInputStream(s.getInputStream());while(epoch==generation){int length=in.readInt();if(length<2||length>65536)throw new IOException("Invalid message size");byte[] bytes=new byte[length];in.readFully(bytes);listener.message(new JSONObject(new String(bytes,"UTF-8")));}}
 void fail(int epoch,String why){if(epoch!=generation)return;boolean was=connected;close();listener.status(was?"Connection lost • reconnect to resume":why);listener.lost();}
 public void send(JSONObject data){final BluetoothSocket s=socket;final int epoch=generation;final byte[] bytes=data.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8);writer.execute(()->{try{if(s==null||!connected||epoch!=generation)return;if(bytes.length>65536)throw new IOException("Message too large");DataOutputStream out=new DataOutputStream(s.getOutputStream());out.writeInt(bytes.length);out.write(bytes);out.flush();}catch(Exception e){fail(epoch,"Connection lost • reconnect to resume");}});}
}
