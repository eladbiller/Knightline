package com.traillink;

import android.content.Context;
import android.content.SharedPreferences;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.SoundPool;
import android.os.Build;
import android.view.HapticFeedbackConstants;
import android.view.View;
import java.util.*;

/** Short native feedback, respecting the user's app and system settings. */
final class ChessFeedback implements AutoCloseable {
    private final SharedPreferences preferences;
    private final AudioManager audio;
    private final SoundPool sounds;
    private final Map<String,Integer> ids=new HashMap<>();
    private final Set<Integer> loaded=new HashSet<>();
    ChessFeedback(Context context) {
        preferences=context.getSharedPreferences("knightline-feedback",Context.MODE_PRIVATE);
        audio=(AudioManager)context.getSystemService(Context.AUDIO_SERVICE);
        sounds=new SoundPool.Builder().setMaxStreams(2).setAudioAttributes(new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_GAME).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build()).build();
        sounds.setOnLoadCompleteListener((pool,id,status)->{if(status==0)loaded.add(id);});
        for(String key:new String[]{"move","capture","mistake","finish"}) {
            try(android.content.res.AssetFileDescriptor file=context.getAssets().openFd("audio/"+key+".wav")) {
                ids.put(key,sounds.load(file,1));
            } catch(java.io.IOException error) { android.util.Log.w("Knightline","Feedback sample unavailable",error); }
        }
    }
    boolean soundEnabled(){return preferences.getBoolean("sound",true);}
    boolean vibrationEnabled(){return preferences.getBoolean("vibration",true);}
    void set(String key,boolean enabled) {
        if(!key.equals("sound")&&!key.equals("vibration"))throw new IllegalArgumentException("Unknown feedback setting");
        preferences.edit().putBoolean(key,enabled).apply();
    }
    void play(View surface,String cue) {
        if(surface==null||!surface.hasWindowFocus())return;
        Integer id=ids.get(cue);
        if(soundEnabled()&&audio!=null&&audio.getRingerMode()==AudioManager.RINGER_MODE_NORMAL&&id!=null&&loaded.contains(id))
            sounds.play(id,.55f,.55f,1,0,1);
        if(vibrationEnabled())surface.performHapticFeedback(Build.VERSION.SDK_INT>=30&&cue.equals("mistake")
                ? HapticFeedbackConstants.REJECT : HapticFeedbackConstants.CLOCK_TICK);
    }
    @Override public void close(){sounds.release();}
}
