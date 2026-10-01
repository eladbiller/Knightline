package com.traillink;

import android.content.Context;
import android.content.SharedPreferences;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.SoundPool;
import android.os.Build;
import android.os.VibrationAttributes;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.provider.Settings;
import android.view.HapticFeedbackConstants;
import android.view.View;
import java.util.*;

/** Short native feedback, respecting the user's app and system settings. */
final class ChessFeedback implements AutoCloseable {
    private final SharedPreferences preferences;
    private final AudioManager audio;
    private final Context context;
    private final Vibrator vibrator;
    private final SoundPool sounds;
    private final Map<String,Integer> ids=new HashMap<>();
    private final Set<Integer> loaded=new HashSet<>();
    ChessFeedback(Context context) {
        this.context=context;
        vibrator=(Vibrator)context.getSystemService(Context.VIBRATOR_SERVICE);
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
    String vibrationStatus() {
        if(vibrator==null||!vibrator.hasVibrator())return "This device has no vibration motor.";
        if(Settings.System.getInt(context.getContentResolver(),Settings.System.HAPTIC_FEEDBACK_ENABLED,1)==0)
            return "Touch vibration is off in Android settings. Enable system haptics to feel feedback.";
        return "Firm move feedback. Android touch-vibration intensity and Do Not Disturb still apply.";
    }
    void set(String key,boolean enabled) {
        if(!key.equals("sound")&&!key.equals("vibration"))throw new IllegalArgumentException("Unknown feedback setting");
        preferences.edit().putBoolean(key,enabled).apply();
    }
    void play(View surface,String cue) {
        if(surface==null||!surface.hasWindowFocus())return;
        Integer id=ids.get(cue);
        if(soundEnabled()&&audio!=null&&audio.getRingerMode()==AudioManager.RINGER_MODE_NORMAL&&id!=null&&loaded.contains(id))
            sounds.play(id,.55f,.55f,1,0,1);
        if(vibrationEnabled()&&vibrator!=null&&vibrator.hasVibrator()
                &&Settings.System.getInt(context.getContentResolver(),Settings.System.HAPTIC_FEEDBACK_ENABLED,1)!=0) {
            // CLOCK_TICK is intentionally tiny on many phones. A predefined
            // click has device-tuned support and Android's fallback pattern.
            // USAGE_TOUCH preserves system intensity/DND policy; never bypass it.
            if(Build.VERSION.SDK_INT>=29) {
                VibrationEffect effect=VibrationEffect.createPredefined(cue.equals("mistake")||cue.equals("finish")
                        ?VibrationEffect.EFFECT_DOUBLE_CLICK:VibrationEffect.EFFECT_HEAVY_CLICK);
                if(Build.VERSION.SDK_INT>=33)vibrator.vibrate(effect,new VibrationAttributes.Builder().setUsage(VibrationAttributes.USAGE_TOUCH).build());
                else vibrator.vibrate(effect,new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION).build());
            } else surface.performHapticFeedback(HapticFeedbackConstants.LONG_PRESS);
        }
    }
    @Override public void close(){sounds.release();}
}
