package com.traillink;

import android.content.Context;
import android.content.SharedPreferences;
import android.media.AudioAttributes;
import android.media.SoundPool;
import android.os.Build;
import android.os.VibrationAttributes;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.view.View;
import java.util.*;

/** Short native feedback, respecting the user's app and system settings. */
final class ChessFeedback implements AutoCloseable {
    private final SharedPreferences preferences;
    private final Vibrator vibrator;
    private final SoundPool sounds;
    private final Map<String,Integer> ids=new HashMap<>();
    private final Set<Integer> loaded=new HashSet<>();
    private int moveVariant;
    ChessFeedback(Context context) {
        vibrator=(Vibrator)context.getSystemService(Context.VIBRATOR_SERVICE);
        preferences=context.getSharedPreferences("knightline-feedback",Context.MODE_PRIVATE);
        sounds=new SoundPool.Builder().setMaxStreams(2).setAudioAttributes(new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_GAME).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build()).build();
        sounds.setOnLoadCompleteListener((pool,id,status)->{if(status==0)loaded.add(id);});
        for(String key:new String[]{"move","move2","move3","capture","mistake","finish"}) {
            try(android.content.res.AssetFileDescriptor file=context.getAssets().openFd("audio/"+key+".wav")) {
                ids.put(key,sounds.load(file,1));
            } catch(java.io.IOException error) { android.util.Log.w("Knightline","Feedback sample unavailable",error); }
        }
    }
    boolean soundEnabled(){return preferences.getBoolean("sound",true);}
    boolean vibrationEnabled(){return preferences.getBoolean("vibration",true);}
    String vibrationStatus() {
        if(vibrator==null||!vibrator.hasVibrator())return "This device has no vibration motor.";
        return "Works with Android touch feedback off. Device-wide vibration restrictions and Do Not Disturb may still apply.";
    }
    void set(String key,boolean enabled) {
        if(!key.equals("sound")&&!key.equals("vibration"))throw new IllegalArgumentException("Unknown feedback setting");
        preferences.edit().putBoolean(key,enabled).apply();
    }
    void play(View surface,String cue) {
        if(surface==null||!surface.hasWindowFocus())return;
        if(!ids.containsKey(cue))return;
        String sample=cue.equals("move")?new String[]{"move","move2","move3"}[moveVariant++%3]:cue;
        Integer id=ids.get(sample);
        // Game audio uses media volume, independently of the notification ringer.
        if(soundEnabled()&&id!=null&&loaded.contains(id))sounds.play(id,.72f,.72f,1,0,1);
        if(vibrationEnabled()&&vibrator!=null&&vibrator.hasVibrator()) {
            boolean doubleContact=cue.equals("capture")||cue.equals("mistake")||cue.equals("finish");
            VibrationEffect effect=doubleContact
                    ?VibrationEffect.createWaveform(new long[]{0,28,65,45},new int[]{0,130,0,190},-1)
                    :VibrationEffect.createOneShot(45,170);
            // This accompanies a chess-board event (including the opponent's move),
            // not a generic button tap. MEDIA/GAME does not depend on touch haptics.
            // Do not bypass Android's global intensity, DND or power policies.
            if(Build.VERSION.SDK_INT>=33)vibrator.vibrate(effect,new VibrationAttributes.Builder().setUsage(VibrationAttributes.USAGE_MEDIA).build());
            else vibrator.vibrate(effect,new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_GAME).build());
        }
    }
    @Override public void close(){sounds.release();}
}
