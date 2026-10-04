package com.traillink;

import android.bluetooth.*;
import android.os.Handler;
import android.os.Looper;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.concurrent.*;
import org.json.JSONObject;

/** Paired RFCOMM. Every socket, write and UI callback belongs to one attempt. */
public class BluetoothLink {
    public static final UUID SERVICE=com.eladbiller.knightline.BuildConfig.APPLICATION_ID.endsWith(".gpt")
            ?UUID.nameUUIDFromBytes("com.eladbiller.knightline.gpt.bluetooth.v2".getBytes(StandardCharsets.UTF_8))
            :UUID.fromString("c2d6c10c-8171-4f83-b9f3-6e1789e1683f");
    public interface Listener {void connected(String name,String address);void message(JSONObject value);void status(String value);void lost();}
    final BluetoothAdapter adapter;
    final Listener listener;
    final ExecutorService writer=Executors.newSingleThreadExecutor();
    private final Handler callbacks=new Handler(Looper.getMainLooper());
    volatile BluetoothSocket socket;
    volatile BluetoothServerSocket server;
    volatile int generation;
    volatile boolean connected;
    private JSONObject latest;
    private boolean latestQueued;

    public BluetoothLink(BluetoothAdapter adapter,Listener listener){this.adapter=adapter;this.listener=listener;}

    private void postCurrent(int epoch,Runnable action){
        // Checking on the reader alone is insufficient: Android may deliver the
        // queued UI task after a retry, manual disconnect or transport change.
        callbacks.post(()->{synchronized(this){if(epoch==generation)action.run();}});
    }

    public synchronized void close(){
        latest=null;generation++;connected=false;
        try{if(server!=null)server.close();}catch(Exception ignored){}
        try{if(socket!=null)socket.close();}catch(Exception ignored){}
        server=null;socket=null;
    }

    public void host(){
        final int epoch;
        synchronized(this){close();epoch=generation;}
        new Thread(()->{
            try{
                BluetoothServerSocket listening=adapter.listenUsingRfcommWithServiceRecord("Knightline",SERVICE);
                synchronized(this){if(epoch!=generation){listening.close();return;}server=listening;}
                postCurrent(epoch,()->listener.status("Room open · waiting for a Knightline friend"));
                BluetoothSocket incoming=listening.accept();listening.close();
                synchronized(this){if(server==listening)server=null;}
                attach(incoming,epoch);
            }catch(Exception error){fail(epoch,"Could not host. Check Bluetooth and Nearby devices permission.");}
        },"Knightline-host").start();
    }

    public void join(BluetoothDevice device){
        final int epoch;
        synchronized(this){close();epoch=generation;}
        new Thread(()->{
            try{
                adapter.cancelDiscovery();
                BluetoothSocket outgoing=device.createRfcommSocketToServiceRecord(SERVICE);
                synchronized(this){if(epoch!=generation){outgoing.close();return;}socket=outgoing;}
                postCurrent(epoch,()->listener.status("Connecting… keep both apps open"));
                callbacks.postDelayed(()->{
                    synchronized(this){if(epoch==generation&&!connected)try{outgoing.close();}catch(Exception ignored){}}
                },60_000);
                outgoing.connect();attach(outgoing,epoch);
            }catch(Exception error){
                android.util.Log.w("Knightline","Bluetooth connect failed",error);
                fail(epoch,"Connection failed. Check that your friend is hosting Knightline and both phones accepted pairing.");
            }
        },"Knightline-join").start();
    }

    void attach(BluetoothSocket incoming,int epoch)throws Exception{
        synchronized(this){
            if(epoch!=generation){incoming.close();return;}
            socket=incoming;connected=true;
        }
        String name=incoming.getRemoteDevice().getName(),address=incoming.getRemoteDevice().getAddress();
        postCurrent(epoch,()->listener.connected(name,address));
        DataInputStream input=new DataInputStream(incoming.getInputStream());
        while(epoch==generation){
            int length=input.readInt();
            if(length<2||length>65536)throw new IOException("Invalid message size");
            byte[] bytes=new byte[length];input.readFully(bytes);
            JSONObject frame=new JSONObject(new String(bytes,StandardCharsets.UTF_8));
            postCurrent(epoch,()->listener.message(frame));
        }
    }

    synchronized void fail(int epoch,String why){
        if(epoch!=generation)return;
        boolean wasConnected=connected;close();final int closedEpoch=generation;
        postCurrent(closedEpoch,()->{
            listener.status(wasConnected?"Connection lost · reconnect to resume":why);
            listener.lost();
        });
    }

    private void write(BluetoothSocket target,int epoch,byte[] bytes){
        try{
            if(target==null||!connected||epoch!=generation)return;
            if(bytes.length>65536)throw new IOException("Message too large");
            DataOutputStream output=new DataOutputStream(target.getOutputStream());
            output.writeInt(bytes.length);output.write(bytes);output.flush();
        }catch(Exception error){fail(epoch,"Connection lost · reconnect to resume");}
    }

    public synchronized void send(JSONObject data){
        if(data==null)return;
        final BluetoothSocket target=socket;final int epoch=generation;
        final byte[] bytes=data.toString().getBytes(StandardCharsets.UTF_8);
        writer.execute(()->write(target,epoch,bytes));
    }

    /** Slow radios coalesce obsolete snapshots, never commands or chat. */
    public synchronized void sendLatest(JSONObject data){
        latest=data;
        if(!latestQueued){latestQueued=true;writer.execute(this::drainLatest);}
    }
    private void drainLatest(){
        JSONObject data;int epoch;BluetoothSocket target;
        synchronized(this){data=latest;latest=null;epoch=generation;target=socket;}
        if(data!=null)write(target,epoch,data.toString().getBytes(StandardCharsets.UTF_8));
        synchronized(this){if(latest!=null)writer.execute(this::drainLatest);else latestQueued=false;}
    }
}
