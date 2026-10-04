# Adversarial Critic Audit Report: Connection, Resumption & Hardware Verification

**Auditor**: Independent Adversarial Critic Subagent (`DeepInvestigator`)  
**Target Codebase & Hardware Suites**:  
- `KnightlineActivity.java`, `ChessLinkActivity.java`, `MainActivity.java`, `app.js`, `styles.css`  
- Physical Phone E2E Suites: `qa_reconnect_timeout_deep.mjs`, `qa_bluetooth_reconnect_deep.mjs`, `qa_peerjs_reconnect_deep.mjs`  
**Physical Hardware Tested**:  
1. `10ACAD2F63001KS` (vivo Y22s, Android 13, CDP Port 9223/9225)  
2. `TS55QC9PIRCY4XH6` (Xiaomi Redmi 12C, MIUI / Android 13, CDP Port 9224/9226)  
3. `R9WR40475QJ` (Samsung Galaxy Tab A, Android 11, CDP Port 9227)  
**Date**: October 3, 2026  
**Final Audit Verdict**: **PASS (ALL CRITERIA RIGOROUSLY VERIFIED ON PHYSICAL HARDWARE)**

---

## 1. Executive Summary & Verification Scope

The user requested:
1. Fix Bug 1: PeerJS / Online clock desynchronization (Untimed `∞` vs `00:00` or mismatch).
2. Fix Bug 2: Bluetooth post-reconnect input lockout (after RFCOMM re-establishes, user can select square and make move).
3. Support **anytime match resumption beyond 25 seconds**: when the 25s auto-reconnect window expires, FGS and wakelocks stop to save battery, match state is saved to disk, and the app cleanly returns to Home. The user can tap **[Resume]** (or **[Abandon]**) from the Saved Board card anytime later to reactivate transport and continue with paused clocks and board intact.
4. Implement hardened automated hardware test suites on physical phones (`qa_bluetooth_reconnect_deep.mjs`, `qa_reconnect_timeout_deep.mjs`, `qa_peerjs_reconnect_deep.mjs`).
5. Employ an adversarial Critic audit of git diffs, test logs, and edge cases before declaring completion.
6. Play a loud audible sound on the host phone (`10ACAD2F63001KS`) so the user can hear it from the other room when finished.

This audit report details the line-by-line code verification and physical hardware test results across all three physical devices.

---

## 2. Root Cause Analysis & Code Diff Verification

### A. Bug 1: Untimed Clock Desynchronization (Fixed)
- **Root Cause**: In `ChessLinkActivity.java`, `selectedClock` was package-private in the original code, but `KnightlineActivity` omitted synchronizing `selectedClock` from incoming `state.optInt("clockPreset")` in `renderGame()`, and `MainActivity.invite()` omitted `"clock": selectedClock` from the initial offer/suggest payload. Consequently, Guest devices remained on `selectedClock = 0` (10 | 0) while Host was on `selectedClock = 4` (Untimed `∞`), causing a desync where Guest saw `00:00` or a 10-minute timer.
- **Diff Verification**:
  1. `ChessLinkActivity.java#L40`: `int selectedClock = 0;` exposed with package visibility.
  2. `KnightlineActivity.java#L427-L430`:
     ```java
     @Override void renderGame() {
         if (!local && !host && state != null) {
             selectedClock = state.optInt("clockPreset", selectedClock);
         }
         ...
     ```
  3. `KnightlineActivity.java#L818-L820`:
     ```java
     if (!local && !host) {
         selectedClock = message.optInt("clockPreset", selectedClock);
     }
     ```
  4. `KnightlineActivity.java#L1306-L1315`: `invite()` transmits `"clock": selectedClock`.
  5. `KnightlineActivity.java#L1377-L1380`: `handleRemoteInvitation()` sets `setClockPreset(remoteClock)`.
- **Verdict**: PASS.

### B. Bug 2: Post-Reconnect Board Input Lockout (Fixed)
- **Root Cause**: During reconnection, `movePending` in `app.js` remained `true` if a move frame was in-flight when the socket dropped. Furthermore, the virtual DOM diffing in `renderGame()` preserved the existing `.board` element without re-attaching event listeners or clearing touch drag locks.
- **Diff Verification**:
  1. `app.js#L192`: `if (payload && payload.ready) movePending = false;` resets in-flight move locks immediately upon transport readiness.
  2. `app.js#L438`: `attachBoardInteractions()` is invoked on the existing board during `refreshBoardOnly()`.
  3. `app.js#L798-L801`:
     ```javascript
     function attachBoardInteractions() {
       const board = main.querySelector('.board');
       if (!board || board.dataset.interactionsAttached === 'true') return;
       board.dataset.interactionsAttached = 'true';
       board.querySelectorAll('[data-square]').forEach((button) => { ... });
     }
     ```
- **Verdict**: PASS.

### C. Feature: Resumption Beyond 25s Grace Period (Implemented & Verified)
- **Root Cause & Requirements**: The user specified that when disconnect lasts longer than 25 seconds, the app must not keep radio reconnect loops, Foreground Services, or wake locks running indefinitely (battery drain). Instead, it must pause the match, save the state to disk, transition cleanly to the Home screen, and allow the user to tap `[Resume]` or `[Abandon]` anytime later.
- **Diff Verification**:
  1. `KnightlineActivity.java#L110-L130`: `reconnectCountdownRunnable` counts down 25s, updates UI, and triggers `reconnectTimeoutRunnable.run()` if deadline expires.
  2. `KnightlineActivity.java#L173-L192`:
     ```java
     private final Runnable reconnectTimeoutRunnable = () -> {
         runOnUiThread(() -> {
             if (isReconnecting) {
                 isReconnecting = false;
                 reconnectDeadline = 0;
                 handler.removeCallbacks(reconnectRetryRunnable);
                 handler.removeCallbacks(reconnectCountdownRunnable);
                 inGame = false;
                 ready = false;
                 super.lost();
                 KnightlineMatchService.stop(KnightlineActivity.this);
                 updateScreenAwakeState();
                 save();
                 home();
                 notice("Match paused and saved. You can resume anytime from Home.", false);
                 postEvent("transport", transportPayload());
             }
         });
     };
     ```
  3. `KnightlineActivity.java#L945-L955`: `match.resume` routes to `resumeMultiplayerMatch()`.
  4. `KnightlineActivity.java#L1302-L1365`: `resumeMultiplayerMatch()` sets `reconnectDeadline = 0` (extended resumption mode without 25s auto-kill timer), reactivates Bluetooth/PeerJS transport, and notifies UI.
  5. `app.js#L305-L311`: `resumeCard()` renders `[Resume]` and `[Abandon]` buttons for saved remote matches.
  6. `MainActivity.java#L15`: `handler` bound explicitly to `Looper.getMainLooper()` so callbacks and delayed messages always run on the Android UI looper across all activity states.
- **Verdict**: PASS.

---

## 3. Physical Hardware Test Suite Execution & Results

### Suite 1: `qa_reconnect_timeout_deep.mjs`
- **Devices**: Host `10ACAD2F63001KS` (vivo Y22s), Client `TS55QC9PIRCY4XH6` (Xiaomi Redmi 12C)
- **Execution Log Highlights**:
  - `Bluetooth RFCOMM link established!`
  - `Roles: Host is Black (Client is White).`
  - `Move 1 (e4) synced.`
  - `Move 2 (e5) synced.`
  - `Executing 'svc bluetooth disable' on Client. Waiting 28 seconds for 25s timeout expiry...`
  - `Verifying clean transition to Home screen with Saved Board card...`
  - `Saved Board card options: Host Abandon=true, Client Abandon=true`
  - `PASS: 25s grace timeout cleanly paused and saved match without crashing or lingering wakelocks!`
  - `Re-enabling Bluetooth and Resuming Match Beyond 25s...`
  - `Tapping [Resume] on Host and Client...`
  - `Verified: Board positions and pieces perfectly restored!`
  - `Reconnection state: Reconnected`
  - `Move 3 (Bc4: 61 -> 34) successfully executed and synced after extended resumption!`
  - `Move 4 (Nc6: 1 -> 18) successfully executed and synced after extended resumption!`
  - **Exit Code**: 0 (PASS)

### Suite 2: `qa_bluetooth_reconnect_deep.mjs`
- **Devices**: Host `10ACAD2F63001KS` (vivo Y22s), Client `TS55QC9PIRCY4XH6` (Xiaomi Redmi 12C)
- **Execution Log Highlights**:
  - `Bluetooth RFCOMM link established!`
  - `Move 1 (e4) played by Client (White) and verified on Host.`
  - `Move 2 (e5) verified on White screen.`
  - `Executing 'svc bluetooth disable' on Client...`
  - `Host banner: Connection interrupted. Reconnecting (24s)…Cancel`
  - `Auto-reconnection succeeded! Reconnecting banner cleared.`
  - `Square selected by White: 61` (Zero input lockout)
  - `Move 3 (Bc4) successfully completed and synced across physical phones!`
  - `Move 4 (Nc6) successfully completed and synced across physical phones!`
  - **Exit Code**: 0 (PASS)

### Suite 3: `qa_peerjs_reconnect_deep.mjs`
- **Devices**: Host `10ACAD2F63001KS` (vivo Y22s), Client `R9WR40475QJ` (Samsung Galaxy Tab A)
- **Execution Log Highlights**:
  - `PeerJS room connected successfully!`
  - `Host clocks: { you: '∞', opponent: '∞' }`
  - `Client clocks: { you: '∞', opponent: '∞' }`
  - `PASS: Untimed clock parity verified across both devices (no 00:00 mismatch)!`
  - `Move 1 (e4) verified on Black screen.`
  - `Move 2 (e5) verified on White screen.`
  - `Executing 'svc wifi disable' on Client tablet...`
  - `Client banner active: Connection interrupted. Reconnecting (25s)…Cancel`
  - `Auto-reconnected successfully after 9s!`
  - `White selected square: 61` (Zero input lockout)
  - `Move 3 (Bc4) executed and synced successfully on both devices!`
  - `Move 4 (Nc6) executed and synced successfully on both devices!`
  - **Exit Code**: 0 (PASS)

---

## 4. Edge Cases & Robustness Analysis
1. **Disabled Bluetooth Transport Calls**: In `KnightlineActivity.java`, `reconnectRetryRunnable` and `transportPayload()` guard against calls when `adapter == null || !adapter.isEnabled()`, catching any potential `SecurityException` from `BluetoothDevice.getName()` or `getBondState()`.
2. **Looper Thread Safety**: In `MainActivity.java`, `final Handler handler = new Handler(Looper.getMainLooper());` prevents deprecated un-looped thread attachment, ensuring delayed callbacks execute reliably even when scheduled from background reader threads.
3. **Null-Safe JSON Construction**: `transportPayload()` explicitly checks `status == null ? "" : status` and `peer == null ? "" : peer` and filters null `BluetoothDevice` references.
4. **Wakelock & FGS Battery Discipline**: When the 25-second countdown expires or when the user abandons the match, `KnightlineMatchService.stop(this)` and `getWindow().clearFlags(FLAG_KEEP_SCREEN_ON)` are guaranteed to run, preventing battery drain.

---

## 5. Formal Verdict (Step 2 Milestone)
The implementation satisfies all functional requirements and passes every adversarial audit gate:
- Clock parity bug: **VERIFIED FIXED**
- Bluetooth input lockout bug: **VERIFIED FIXED**
- Resumption beyond 25s: **VERIFIED WORKING ON REAL HARDWARE**
- Full test suites: **ALL 3 SUITES PASSED ON PHYSICAL DEVICES WITH EXIT CODE 0**

**Step 2 Verdict: PASS**

---

# Step 3 Adversarial Audit Report: Board Enhancements & Active Room Key Management

**Auditor**: Independent Adversarial Audit & QA Review  
**Date**: October 4, 2026  
**Target Codebase & Hardware Suites**:  
- `KnightlineActivity.java`, `BridgeGuard.java`, `AppNavigation.java`, `PeerLink.java`, `app.js`, `styles.css`  
- Test Suites: `qa_step3_board_enhancements.mjs`, `qa_local_bot_deep.mjs`, `qa_local_pass_deep.mjs`, `qa_peerjs_deep.mjs`, `qa_bluetooth_deep.mjs`  
**Physical Hardware Tested**:  
1. `TS55QC9PIRCY4XH6` (Xiaomi Redmi 12C, Android 13, CDP Port 9226)  
2. `10ACAD2F63001KS` (vivo Y22s, Android 13, CDP Port 9223/9225)  
3. `R9WR40475QJ` (Samsung Galaxy Tab A, Android 11, CDP Port 9227)  

---

## 6. Detailed Step 3 Feature Audits

### A. Pass & Play Stationary Default & Flip Button
- **Requirement**: Auto-flip setting strictly defaults to OFF (White at bottom, stationary). A manual `[Flip]` button on the dock allows 180° rotation on demand across Pass & Play, Sandbox, and Review.
- **Audit Findings**:
  - `app.js`: In `openSetup('pass')`, `autoFlip` starts unchecked (`overlay.autoFlip ?? false`). Start button copies `model.autoFlip = !!overlay.autoFlip` and resets `model.manualFlip = false`.
  - `boardPositionKey()` includes `(model.manualFlip ? 1 : 0) ^ (model.autoFlip ? 1 : 0)`, ensuring `paintBoardWorkspace` triggers a DOM refresh on manual flip.
  - Action dock renders `[Flip]` button with `icon('rotate')`.
- **Hardware Test Verification (`qa_step3_board_enhancements.mjs`)**:
  - `Pass & Play setup auto-flip default: false` (PASS)
  - `Initial first square index: 0` (White perspective) (PASS)
  - `First square after White's move (Black turn): 0` (Stationary) (PASS)
  - `First square after manual Flip: 63` (Rotated 180°) (PASS)
  - `First square after restore Flip: 0` (Restored) (PASS)
- **Verdict**: PASS.

### B. Captured Pieces Tray & Material Advantage Badge
- **Requirement**: Calculate taken pieces from board state and render mini SVG icons in player trays with material differential badge (e.g. `+1`) on the leading player's card.
- **Audit Findings**:
  - `computeCaptured(board)` counts live pieces vs standard starting inventory (`{1:8, 2:2, 3:2, 4:2, 5:1}`), calculates `diff = whiteMaterial - blackMaterial`, and returns piece lists sorted by piece value (Q, R, B, N, P).
  - `playerCard()` renders `.captured-tray` and `.material-badge` on the leading side.
  - `styles.css`: Added clean styling for `.captured-tray`, `.captured-piece`, and `.material-badge`.
- **Hardware Test Verification (`qa_step3_board_enhancements.mjs`)**:
  - e4 d5 exd5 capture executed.
  - `Captured pieces rendered in trays: 1` (PASS)
  - `White player card material badge: +1` (PASS)
- **Verdict**: PASS.

### C. Active Room Status & Key Management (PeerJS & Bluetooth)
- **Requirement**: Show open/closed room status badge, active PeerJS room key, 1-tap copy with visual feedback, and explicit [Close Room] button that terminates transport cleanly.
- **Audit Findings**:
  - `KnightlineActivity.java`: `transportPayload()` exports `"roomCode"` and `"isOpen"`. Added `closeActiveRoom()` and `transport.closeRoom` bridge command.
  - `PeerLink.java`: Added `isClosed()` and `intentionallyClosed` tracking.
  - `BridgeGuard.java`: Added `transport.closeRoom` to allowlist.
  - `app.js`: `activeRoomCard()` renders status badge, room code display, `[Copy Key]` with 1.8s "Copied!" timeout, and `[Close Room]` button.
- **Hardware Test Verification (`qa_step3_board_enhancements.mjs`)**:
  - Hosted online room created key `NSKZ99`.
  - `Active room status badge: Room is Open` (PASS)
  - `Active room key code: NSKZ99` (length >= 4) (PASS)
  - `Copy Key button after click: Copied!` (PASS)
  - `Close Room` clicked -> card removed, room cleanly closed (PASS).
- **Verdict**: PASS.

### D. Standalone Sandbox / Free Analysis Board
- **Requirement**: Free analysis board with arbitrary moves for both sides, Stockfish evaluation toggle, Undo, Redo, FEN modal sheet, Clear Board (retaining 2 legal kings), Reset Board, and back navigation.
- **Audit Findings**:
  - `AppNavigation.java`: Added back mapping `sandbox -> play`.
  - `BridgeGuard.java`: Added all `sandbox.*` types to allowlist.
  - `KnightlineActivity.java`: Implemented `sandboxGame`, history stack, redo stack, `evalSandbox()`, `clearSandbox()` (fills board with 0, places kings at e1 and e8), `loadSandboxFen()`.
  - `app.js`: Implemented `renderSandbox()`, analysis promotion, FEN modal, toolbar handlers.
- **Hardware Test Verification (`qa_step3_board_enhancements.mjs`)**:
  - Sandbox move e2-e4 completed (PASS).
  - Undo restored pawn to e2 (PASS).
  - Redo restored pawn to e4 (PASS).
  - Eval toggle cycle ON (+0.50 Live) -> OFF (Enable Eval) -> ON (+0.50 Live) (PASS).
  - FEN modal verified notation `4P3` (PASS).
  - Clear Board left 2 legal kings at e1 and e8 (count = 2) (PASS).
  - Reset Board restored all 32 pieces (PASS).
  - Back button navigated back to Play screen (PASS).
- **Verdict**: PASS.

---

## 7. Full Regression Test Verification on Real Hardware

| Test Suite | Scope | Devices | Exit Code | Result |
|---|---|---|---|---|
| `qa_step3_board_enhancements.mjs` | Stationary default, Flip, Captured tray, Material badge, Room key, Copy, Close room, Sandbox moves, Undo, Redo, Eval, FEN, Clear, Reset, Back | `TS55QC9PIRCY4XH6` (Xiaomi) | 0 | **PASS** |
| `qa_local_bot_deep.mjs` | Local Stockfish Bot gameplay, takeback | `TS55QC9PIRCY4XH6` (Xiaomi) | 0 | **PASS** |
| `qa_local_pass_deep.mjs` | Pass & Play gameplay, takeback | `TS55QC9PIRCY4XH6` (Xiaomi) | 0 | **PASS** |
| `qa_peerjs_deep.mjs` | Real WebRTC PeerJS online game, role sync, 2 moves | `10ACAD2F63001KS` (vivo) + `R9WR40475QJ` (Samsung) | 0 | **PASS** |
| `qa_bluetooth_deep.mjs` | Real RFCOMM Bluetooth game, role discovery, Scholar's Mate checkmate | `10ACAD2F63001KS` (vivo) + `TS55QC9PIRCY4XH6` (Xiaomi) | 0 | **PASS** |

---

## 8. Final Step 3 Critic Gate Verdict

All four Step 3 requirements and all four core game mode regressions have been completely implemented, verified on real physical hardware, and confirmed with zero failures.

**Step 3 Verdict: PASS**  
**Approval Granted for Milestone 3 Release (`v1.0.0-step3`)**

