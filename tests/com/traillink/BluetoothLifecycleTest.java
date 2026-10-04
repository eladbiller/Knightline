package com.traillink;
import android.bluetooth.*;
import android.os.Handler;
import org.json.JSONObject;
import java.io.*;
import java.util.*;
import java.util.concurrent.*;

/** Runs the real BluetoothLink with controllable platform I/O and event queues. */
public final class BluetoothLifecycleTest {
    static int assertions;
    static void check(boolean value,String why){assertions++;if(!value)throw new AssertionError(why);}
    static class Listener implements BluetoothLink.Listener {
        final List<String> events=new ArrayList<>();
        public void connected(String name,String address){events.add("connected");}
        public void message(JSONObject frame){events.add("message");}
        public void status(String text){events.add("status");}
        public void lost(){events.add("lost");}
    }
    static BluetoothSocket empty(){return new BluetoothSocket(new ByteArrayInputStream(new byte[0]));}
    static void attach(BluetoothLink link,BluetoothSocket socket,int epoch){try{link.attach(socket,epoch);}catch(EOFException expected){}catch(Exception e){throw new RuntimeException(e);}}
    static final class LateFrame extends InputStream {
        final CountDownLatch reading=new CountDownLatch(1),release=new CountDownLatch(1);
        final ByteArrayInputStream bytes;
        LateFrame()throws IOException{ByteArrayOutputStream b=new ByteArrayOutputStream();DataOutputStream d=new DataOutputStream(b);d.writeInt(2);d.writeBytes("{}");bytes=new ByteArrayInputStream(b.toByteArray());}
        public int read()throws IOException{reading.countDown();try{if(!release.await(3,TimeUnit.SECONDS))throw new IOException("Test deadline");}catch(InterruptedException e){throw new IOException(e);}return bytes.read();}
    }
    public static void main(String[] args)throws Exception {
        Listener listener=new Listener();BluetoothLink link=new BluetoothLink(new BluetoothAdapter(),listener);
        try {
            // Closing after the transport callback is queued but before UI delivery
            // must not open an invitation or mark a dead socket as ready.
            attach(link,empty(),link.generation);link.close();Handler.drain();
            check(listener.events.isEmpty(),"queued connected callback survived close");
            int old=link.generation;link.close();BluetoothSocket stale=empty();attach(link,stale,old);Handler.drain();
            check(stale.closed&&!link.connected&&link.socket==null,"stale attach resurrected socket");
            check(listener.events.isEmpty(),"stale attach emitted callback");

            // A frame may finish reading after close/new socket, even if the
            // platform eventually reports an IOException. It still must be dropped.
            LateFrame late=new LateFrame();BluetoothSocket first=new BluetoothSocket(late);int firstEpoch=link.generation;
            Thread reader=new Thread(()->attach(link,first,firstEpoch));reader.start();
            check(late.reading.await(3,TimeUnit.SECONDS),"reader never started");Handler.drain();listener.events.clear();
            link.close();BluetoothSocket replacement=empty();attach(link,replacement,link.generation);Handler.drain();listener.events.clear();
            late.release.countDown();reader.join(3000);Handler.drain();
            check(!reader.isAlive()&&listener.events.isEmpty(),"late frame contaminated new channel");
            link.fail(firstEpoch,"old failure");Handler.drain();
            check(link.socket==replacement&&link.connected&&!replacement.closed,"old failure killed replacement");

            // Old failure already queued for the UI must not reset a newer retry.
            link.fail(link.generation,"current failure");link.close();Handler.drain();
            check(listener.events.isEmpty(),"queued failure survived a new epoch");

            CountDownLatch allocating=new CountDownLatch(1),release=new CountDownLatch(1);
            BluetoothSocket delayed=empty();BluetoothDevice device=new BluetoothDevice(delayed){
                public BluetoothSocket createRfcommSocketToServiceRecord(java.util.UUID id)throws IOException{
                    allocating.countDown();try{if(!release.await(3,TimeUnit.SECONDS))throw new IOException("Test deadline");}catch(InterruptedException e){throw new IOException(e);}return delayed;
                }
            };
            link.join(device);check(allocating.await(3,TimeUnit.SECONDS),"join never started");link.close();
            BluetoothSocket current=empty();attach(link,current,link.generation);Handler.drain();listener.events.clear();release.countDown();
            long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(3);while(!delayed.closed&&System.nanoTime()<deadline)Thread.sleep(5);
            Handler.drain();check(delayed.closed&&link.socket==current&&link.connected,"late socket allocation replaced current connection");
            check(listener.events.isEmpty(),"old join delivered status/failure");

            // Normal lifecycle still delivers, and one loss is emitted once.
            link.close();attach(link,empty(),link.generation);Handler.drain();check(listener.events.equals(List.of("connected")),"current connection was suppressed");
            listener.events.clear();int currentEpoch=link.generation;link.fail(currentEpoch,"failed");link.fail(currentEpoch,"failed twice");Handler.drain();
            check(listener.events.equals(List.of("status","lost")),"current loss not delivered exactly once");
            System.out.println("BluetoothLifecycleTest: "+assertions+" assertions passed (deterministic I/O, not a radio test)");
        } finally {link.close();link.writer.shutdownNow();}
    }
}
