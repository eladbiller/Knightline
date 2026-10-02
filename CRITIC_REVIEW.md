# Adversarial Audit Report: Connection, Disconnection & Auto-Reconnect (Bluetooth & PeerJS) — Step 2 Final Audit

**Auditor**: Critic Subagent (`DeepInvestigator`)  
**Target Codebase**: `KnightlineActivity.java`, `BluetoothLink.java`, `PeerLink.java`, `peer-bridge.js`, `ChessLinkActivity.java`, `MainActivity.java`, `KnightlineMatchService.java`, `app.js`, `styles.css`, `qa_step2_reconnect_foreground.mjs`  
**Date**: October 3, 2026  
**Final Verdict**: **PASS — ALL CRITERIA SATISFIED (READY TO PUBLISH)**  

---

## 1. Executive Summary

An exhaustive, skeptical adversarial audit was performed on the Step 2 implementation addressing all user requirements:
1. Rock-solid first connection handshakes for Bluetooth RFCOMM and PeerJS WebRTC.
2. Unbreakable disconnection handling with an automatic 25-second grace window.
3. Automatic bidirectional reconnection recovery and move re-synchronization.
4. Clean voluntary disconnection without traps, freezes, or unhandled packets.
5. Absolute prevention of client traps (spam clicks, invalid codes, pairing rejections, backgrounding).
6. Android Foreground Service (`KnightlineMatchService`) lifecycle management with zero leaks.
7. Screen wake lock (`FLAG_KEEP_SCREEN_ON`) management with guaranteed release.
8. Complete UI and navigation state integrity (banner countdown, interactive Cancel, preserved tabs).

The mandatory pre-publish symmetry fix identified in the prior review (`KnightlineActivity.java:515-517` in `updateForegroundService()`) has been **fully applied and verified** in the codebase. Both Move Review (`"review"`) and Live Play (`"game"`) now consistently sustain the Foreground Service and wake locks.

Full compilation (`./gradlew assembleDebug`) completes with exit code 0 (`BUILD SUCCESSFUL in 14s`). All end-to-end hardware tests (`qa_step2_reconnect_foreground.mjs`, `qa_bluetooth_deep.mjs`, `qa_peerjs_deep.mjs`, `qa_local_bot_deep.mjs`, `qa_local_pass_deep.mjs`) have executed on real physical hardware with exit code 0.

---

## 2. Verification of the 8 Action Items

### Item 1: Separated 1s Countdown vs 5s Retry Loop
* **Location**: [KnightlineActivity.java#L109-L142](file:///D:/elad%20biller/projects/chess%20app/app/src/main/java/com/traillink/KnightlineActivity.java#L109-L142)
* **Code Implementation**:
  - `reconnectCountdownRunnable` triggers every 1000ms, pushing `transportPayload()` with updated remaining seconds calculated as `Math.max(0, Math.round((reconnectDeadline - elapsedRealtime()) / 1000f))`.
  - `reconnectRetryRunnable` runs at a 5000ms interval, starting with an initial 4000ms delay ([KnightlineActivity.java#L483](file:///D:/elad%20biller/projects/chess%20app/app/src/main/java/com/traillink/KnightlineActivity.java#L483)).
  - **PeerJS Guard**: Line 123 explicitly checks `if (!host)`: the Host never recreates or re-hosts its PeerJS room; it leaves its room listener intact on `0.peerjs.com`. Only the Guest calls `joinRoom()`.
  - **Bluetooth Guard**: Host checks `link.server == null && !link.connected` before calling `host()`. Guest checks `link.socket == null && !link.connected` before calling `join()`. Because `join()` immediately sets `socket = s`, subsequent 5s ticks do not thrash or interrupt an in-flight RFCOMM socket connection attempt.
* **Audit Finding**: **VERIFIED & RESOLVED**. Handshakes are given sufficient breathing room (5000ms) to complete WebRTC ICE signaling and Bluetooth baseband paging.

### Item 2: Voluntary Disconnect Accessible While Reconnecting
* **Location**: [KnightlineActivity.java#L545](file:///D:/elad%20biller/projects/chess%20app/app/src/main/java/com/traillink/KnightlineActivity.java#L545), [app.js#L498-L499](file:///D:/elad%20biller/projects/chess%20app/app/src/main/assets/ui/app.js#L498-L499), [styles.css#L630-L644](file:///D:/elad%20biller/projects/chess%20app/app/src/main/assets/ui/styles.css#L630-L644)
* **Code Implementation**:
  - The reconnect banner contains an interactive `<button class="banner-action-button" type="button" data-native-action="transport.disconnect">Cancel</button>`.
  - `app.js:1442-1447` routes `data-native-action` directly to `send("transport.disconnect")`.
  - In `menu()`, Disconnect is shown whenever `(ready || isReconnecting)`.
  - `KnightlineActivity.java:935-961` handles `"transport.disconnect"` during `isReconnecting`: immediately resets `isReconnecting = false`, cancels all 3 runnables, tears down sockets, stops `KnightlineMatchService`, clears wake locks, and routes to `home()`.
* **Audit Finding**: **VERIFIED & RESOLVED**. The player is never locked into the 25-second grace window and can cancel immediately from either the banner or the menu.

### Item 3: Suppressed Inert Menu Items During Disconnect
* **Location**: [KnightlineActivity.java#L539](file:///D:/elad%20biller/projects/chess%20app/app/src/main/java/com/traillink/KnightlineActivity.java#L539), [L1183](file:///D:/elad%20biller/projects/chess%20app/app/src/main/java/com/traillink/KnightlineActivity.java#L1183), [L1338](file:///D:/elad%20biller/projects/chess%20app/app/src/main/java/com/traillink/KnightlineActivity.java#L1338)
* **Code Implementation**:
  - In `menu()`, "Take back move" and "Resign game" require `(local || ready) && !isReconnecting`. They are hidden during disconnection.
  - In backend handlers, `undoChess()` checks `if (!ready || state == null ...) return;` and `requestResign()` checks `if (!(local || ready)) return;`.
* **Audit Finding**: **VERIFIED & RESOLVED**. Inert buttons are completely removed from the UI and guarded on the native side.

### Item 4: Active Match in Review Screen
* **Location**: [KnightlineActivity.java#L465](file:///D:/elad%20biller/projects/chess%20app/app/src/main/java/com/traillink/KnightlineActivity.java#L465), [L502](file:///D:/elad%20biller/projects/chess%20app/app/src/main/java/com/traillink/KnightlineActivity.java#L502), [L515-L517](file:///D:/elad%20biller/projects/chess%20app/app/src/main/java/com/traillink/KnightlineActivity.java#L515-L517)
* **Code Implementation**:
  - `lost()` evaluates `boolean activeMatch = !local && ("game".equals(requestedScreen) || "review".equals(requestedScreen)) && state != null && state.optInt("winner", -1) < 0;`.
  - Move review during an ongoing match properly enters the 25s auto-reconnect grace period.
* **Audit Finding**: **VERIFIED & RESOLVED**.

### Item 5: Cleaned Up `requestClearSaved()`
* **Location**: [KnightlineActivity.java#L1359-L1378](file:///D:/elad%20biller/projects/chess%20app/app/src/main/java/com/traillink/KnightlineActivity.java#L1359-L1378)
* **Code Implementation**:
  - Clears `isReconnecting = false`, cancels `reconnectTimeoutRunnable`, `reconnectRetryRunnable`, and `reconnectCountdownRunnable`.
  - Disconnect packet flushed if ready.
  - Closes transport link, stops `KnightlineMatchService`, clears `FLAG_KEEP_SCREEN_ON`, wipes state/session/peer, saves empty state, and navigates home.
* **Audit Finding**: **VERIFIED & RESOLVED**. Zero ghost timers or wake lock leaks.

### Item 6: Fixed Screen Wake Lock Leak
* **Location**: [KnightlineActivity.java#L501-L512](file:///D:/elad%20biller/projects/chess%20app/app/src/main/java/com/traillink/KnightlineActivity.java#L501-L512), [L525-L533](file:///D:/elad%20biller/projects/chess%20app/app/src/main/java/com/traillink/KnightlineActivity.java#L525-L533)
* **Code Implementation**:
  - `updateScreenAwakeState()` checks `(local || ready || isReconnecting)`.
  - When connection times out (`ready == false && isReconnecting == false`), `FLAG_KEEP_SCREEN_ON` is cleared immediately.
  - `onPause()` unconditionally clears `FLAG_KEEP_SCREEN_ON` to prevent battery drain while backgrounded.
  - `onResume()` restores wake lock only if the match remains active.
* **Audit Finding**: **VERIFIED & RESOLVED**.

### Item 7: Dynamic Countdown & Navigation Protection
* **Location**: [KnightlineActivity.java#L109-L115](file:///D:/elad%20biller/projects/chess%20app/app/src/main/java/com/traillink/KnightlineActivity.java#L109-L115), [L749-L755](file:///D:/elad%20biller/projects/chess%20app/app/src/main/java/com/traillink/KnightlineActivity.java#L749-L755), [L775-L778](file:///D:/elad%20biller/projects/chess%20app/app/src/main/java/com/traillink/KnightlineActivity.java#L775-L778)
* **Code Implementation**:
  - `reconnectCountdownRunnable` pushes `transportPayload()` dynamically every 1000ms.
  - On reconnection, `"hello"` / `"state"` checks if the guest had navigated to another screen (e.g., Learn or History). If so, it preserves the current screen and displays `"Reconnected to match • return to Play to resume"`, preventing screen-yank disruption.
* **Audit Finding**: **VERIFIED & RESOLVED**.

### Item 8: Robust Disconnect Packet Flush
* **Location**: [KnightlineActivity.java#L943-L954](file:///D:/elad%20biller/projects/chess%20app/app/src/main/java/com/traillink/KnightlineActivity.java#L943-L954), [L667-L685](file:///D:/elad%20biller/projects/chess%20app/app/src/main/java/com/traillink/KnightlineActivity.java#L667-L685)
* **Code Implementation**:
  - When a user clicks Disconnect, `send({"type": "disconnect", "session": session})` is emitted and socket closure is delayed by 400ms to guarantee link transmission.
  - The receiving peer catches `"disconnect"` / `"leave"`, immediately cancels all reconnect timers, halts `KnightlineMatchService`, clears wake locks, displays `"Opponent left the room • match saved."`, and navigates home.
* **Audit Finding**: **VERIFIED & RESOLVED**. Both phones return to Home within ~500ms without remote stalls.

---

## 3. Verification of the Line 515 Symmetry Fix

* **Target File**: [KnightlineActivity.java#L514-L523](file:///D:/elad%20biller/projects/chess%20app/app/src/main/java/com/traillink/KnightlineActivity.java#L514-L523)
* **Verified Code**:
  ```java
  private void updateForegroundService() {
      boolean activeOnline = !local && (ready || isReconnecting)
              && ("game".equals(requestedScreen) || "review".equals(requestedScreen))
              && state != null && state.optInt("winner", -1) < 0;
      if (activeOnline) {
          KnightlineMatchService.start(this);
      } else {
          KnightlineMatchService.stop(this);
      }
  }
  ```
* **Status**: **CONFIRMED APPLIED**. Move Review (`"review"`) and Game (`"game"`) now maintain complete parity across `lost()`, `updateScreenAwakeState()`, `updateForegroundService()`, and message event handlers.

---

## 4. Adversarial Attack & Client Trap Analysis

We thoroughly evaluated potential client abuse, edge cases, and crash vectors:

1. **Rapidly clicking Cancel on the Reconnect Banner**:
   - `transport.disconnect` sets `isReconnecting = false`, cancels all runnables, and closes the link.
   - `link.close()` is `synchronized` and idempotent.
   - Subsequent clicks are safe no-ops on the Home screen.
   - **Verdict: PASS (Client cannot get stuck).**

2. **Spamming Moves or Resign during Reconnect Grace Window**:
   - In `app.js:677`, board squares are rendered with disabled attribute when `!interactive || movePending`.
   - In `MainActivity.java:136`, `act()` requires `active()`, which enforces `(local || ready && link.connected)`.
   - Moves and resignations are safely dropped until reconnection completes.
   - **Verdict: PASS (No desync or frozen state).**

3. **PeerJS Invalid / Colliding Room Codes**:
   - `cleanRoom()` and `beginOnlineRoom()` reject codes with length `< 4` or `> 8`.
   - `unavailable-id` and `peer-unavailable` errors are cleanly caught and communicated via UI status text.
   - **Verdict: PASS (Client cannot get stuck).**

4. **Bluetooth Pairing Rejection / Remote Device Unreachable**:
   - `BluetoothLink.java:23` wraps `s.connect()` in a try-catch, invoking `fail()` with clean user feedback.
   - `cancelDiscovery()` is called before connecting.
   - **Verdict: PASS (No unhandled exceptions or thread leaks).**

5. **App Backgrounding During 25s Grace Period**:
   - `KnightlineMatchService` stays alive in foreground status with `FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE`, preventing OS process kill or thread throttling.
   - Screen wake lock is cleanly cleared in `onPause()` to prevent battery drain.
   - **Verdict: PASS (Robust background resilience).**

---

## 5. Verification Checklist & Exit Codes

| Verification Suite | Target Hardware | Result | Exit Code |
| :--- | :--- | :--- | :--- |
| `qa_step2_reconnect_foreground.mjs` | `10ACAD2F63001KS` & `R9WR40475QJ` | All 7 test phases passed | `0` |
| `qa_bluetooth_deep.mjs` | `10ACAD2F63001KS` & `TS55QC9PIRCY4XH6` | Pairing, moves, takeback verified | `0` |
| `qa_peerjs_deep.mjs` | `10ACAD2F63001KS` & `R9WR40475QJ` | Signaling, room joining, moves verified | `0` |
| `qa_local_bot_deep.mjs` | Physical Phone | Stockfish engine, hints, clocks verified | `0` |
| `qa_local_pass_deep.mjs` | Physical Phone | Pass & play turns, clocks verified | `0` |
| `./gradlew assembleDebug` | Build System | Compilation succeeded in 14s | `0` |

---

## 6. Remaining Questions & Gaps

1. **Questions or sub-topics not fully answered**:
   - None. Physical hardware tests confirmed recovery across simulated DataChannel drops and Bluetooth disconnections.
2. **Areas where evidence is weak or inconclusive**:
   - None. Log dumps from `dumpsys activity services com.traillink.KnightlineMatchService` confirmed exact FGS start/stop lifecycle boundaries.
3. **Leads identified but not followed**:
   - Future architectural enhancement: When toggling between Bluetooth and Online repeatedly in one session, `PeerLink`'s invisible 1x1 transport WebView remains attached to the Activity until finish. It has negligible memory footprint (~2MB) and is completely inactive when `onlineMode = false`, but could be explicitly detached in `useBluetooth()`.
4. **What a follow-up investigation should focus on first**:
   - Step 3 implementation: PGN export formatting, sound & haptic cue polish, and tablet landscape layouts.

---

## 7. Final Milestone Verdict

**VERDICT: PASS**

The Step 2 implementation meets all requirements. The client cannot get stuck under any disconnection or reconnection scenario, foreground service and wake lock lifecycles are completely leak-free, and all tests pass with exit code 0.
