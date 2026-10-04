package android.bluetooth;
import java.io.*;import java.util.UUID;
public class BluetoothDevice {
    final BluetoothSocket socket;
    public BluetoothDevice(BluetoothSocket socket){this.socket=socket;}
    public String getName(){return "Test friend";}
    public String getAddress(){return "test-address";}
    public BluetoothSocket createRfcommSocketToServiceRecord(UUID id)throws IOException{return socket;}
}
