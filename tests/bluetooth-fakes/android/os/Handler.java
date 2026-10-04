package android.os;
import java.util.concurrent.ConcurrentLinkedQueue;
/** Deterministic main-thread queue, not an Android behavior/radio simulator. */
public final class Handler {
    private static final ConcurrentLinkedQueue<Runnable> queue=new ConcurrentLinkedQueue<>();
    public Handler(){} public Handler(Looper looper){}
    public boolean post(Runnable r){queue.add(r);return true;}
    public boolean postDelayed(Runnable r,long delay){return true;}
    public static void drain(){Runnable r;while((r=queue.poll())!=null)r.run();}
}
