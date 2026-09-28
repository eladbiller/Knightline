package com.eladbiller.knightline;

/** Plain-Java contract coverage for the native WebMessagePort command gate. */
public final class BridgeGuardTest {
    private static int assertions;

    private static void check(boolean value, String label) {
        assertions++;
        if (!value) throw new AssertionError(label);
    }

    public static void main(String[] args) {
        run();
        System.out.println("PASS: " + assertions + " BridgeGuard assertions");
    }

    public static void run() {
        BridgeGuard guard = new BridgeGuard();
        check(!guard.accept(2, "a", "ui.ready", 1, false).accepted,
                "Rejects an unsupported bridge version");
        check(!guard.accept(1, "", "ui.ready", 1, false).accepted,
                "Rejects a missing request id");
        check(!guard.accept(1, "a", "ui.ready", -1, false).accepted,
                "Rejects a negative sequence");
        check(!guard.accept(1, "a", "not.a.command", 1, false).accepted,
                "Rejects an unknown command before it reaches native code");
        check(!guard.accept(1, "a", "match.move", 1, false).accepted,
                "Rejects a command before ui.ready");

        BridgeGuard.Decision ready = guard.accept(1, "a", "ui.ready", 3, false);
        check(ready.accepted && ready.becomesReady, "Accepts a well-formed readiness handshake");
        check(!guard.accept(1, "b", "nav.play", 3, true).accepted,
                "Rejects a replayed sequence");
        check(guard.accept(1, "b", "nav.play", 4, true).accepted,
                "Accepts a fresh top-level navigation request");
        check(BridgeGuard.requiresActiveMatch("match.move"), "Moves require an active session");
        check(BridgeGuard.requiresActiveMatch("chat.send"), "Chat is bound to an active session");
        check(!BridgeGuard.requiresActiveMatch("nav.profile"), "Profile does not require a match");
        check(!BridgeGuard.matchesActiveSession("old", "current", true),
                "Rejects commands from a stale session");
        check(!BridgeGuard.matchesActiveSession("current", "", true),
                "Rejects session-bound commands without an active session");
        check(!BridgeGuard.matchesActiveSession("current", "current", false),
                "Rejects session-bound commands when the board is absent");
        check(BridgeGuard.matchesActiveSession("current", "current", true),
                "Accepts a command bound to the current board session");

        guard.reset();
        check(guard.accept(1, "reload", "ui.ready", 1, false).accepted,
                "A fresh page port may establish a new sequence stream");
    }
}
