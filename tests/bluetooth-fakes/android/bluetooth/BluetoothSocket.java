package android.bluetooth;
import java.io.*;
public class BluetoothSocket {
    public volatile boolean closed;
    public final InputStream input;
    public final ByteArrayOutputStream output=new ByteArrayOutputStream();
    public BluetoothSocket(InputStream input){this.input=input;}
    public void connect() throws IOException{}
    public void close() throws IOException{closed=true;}
    public InputStream getInputStream() throws IOException{return input;}
    public OutputStream getOutputStream() throws IOException{return output;}
    public BluetoothDevice getRemoteDevice(){return new BluetoothDevice(this);}
}
