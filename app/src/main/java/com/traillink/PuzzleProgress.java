package com.traillink;

/** Lifetime evidence. A retry cannot erase a hint or a failed attempt. */
public final class PuzzleProgress {
    public boolean solved, everHint, everFailed, legacySolved, clean;
    public boolean assisted() { return everHint || everFailed || legacySolved; }
    public void record(PuzzleSession session) {
        everHint |= session.usedHelp;
        everFailed |= session.missed;
        solved |= session.solved;
        if(assisted()) clean=false;
        else if(session.solved) clean=true;
    }
}
