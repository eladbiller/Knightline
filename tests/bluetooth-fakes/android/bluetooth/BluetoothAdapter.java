package android.bluetooth;
import java.io.*;import java.util.UUID;
public class BluetoothAdapter {
    public boolean cancelDiscovery(){return true;}
    public BluetoothServerSocket listenUsingRfcommWithServiceRecord(String name,UUID id)throws IOException{return new BluetoothServerSocket();}
}
