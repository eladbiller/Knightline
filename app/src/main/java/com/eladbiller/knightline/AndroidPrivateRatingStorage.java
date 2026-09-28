package com.eladbiller.knightline;

import android.content.Context;
import android.content.SharedPreferences;

/** Android-only, app-private persistence for {@link SkillRatingStore}. */
public final class AndroidPrivateRatingStorage implements SkillRatingStore.Storage {
    private static final String PREFERENCES = "knightline-private-rating";
    private final SharedPreferences preferences;

    public AndroidPrivateRatingStorage(Context context) {
        if (context == null) throw new IllegalArgumentException("Context is required");
        Context appContext = context.getApplicationContext();
        if (appContext == null) appContext = context;
        preferences = appContext.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE);
    }

    @Override public String get(String key) {
        return preferences.getString(key, null);
    }

    @Override public void put(String key, String value) {
        // commit keeps a completed rated game durable before a process death.
        preferences.edit().putString(key, value).commit();
    }
}
