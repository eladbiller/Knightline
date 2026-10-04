package org.json;
/** Only framing/dispatch is under test; JSON parser correctness is not. */
public final class JSONObject {
    final String raw;
    public JSONObject(String raw){this.raw=raw;}
    public String toString(){return raw;}
}
