# GPT edition 0.8.1 — recovery validation

## Isolation and artifact

Test date: 2026-10-04. This is **Knightline Preview gpt version**, package `com.eladbiller.knightline.gpt`, version `0.8.1-beta`, code 11, on the separate `gpt-version` branch. The user explicitly allowed installing this separate app on the two test phones. It has independent saves/preferences, Bluetooth UUID and PeerJS room namespace.

The normal package on both physical phones remained **1.0.0-step3 / code 13**. Its installation path and last-update time were compared before and after GPT installation and remained unchanged. It was not installed, cleared, uninstalled or launched by these tests. The normal app's branch and latest release are not part of this update. The installed GPT `base.apk` SHA-256 matched the final artifact on both phones and Pixel.

Final APK: `Knightline-Preview-v0.8.1-beta-side-by-side-gpt-version.apk`, 37,857,663 bytes.

SHA-256: `b9694c79353e592de9fb4ff254ec30f0cf0e216ad1040b7963118e19faf306bc`.

`apksigner verify` passed. Developer/debug certificate SHA-256: `779396cfdce796d353a7f0f1f5212477d24d4ed69b107c5369294384000705b9`. This is not production signing. Stockfish GPL source/notices are retained.

## Changes

- Bluetooth socket allocation, queued UI callbacks and read/write failures are bound to their connection generation. Delayed work from an old socket cannot resurrect it or close its replacement.
- PeerJS acknowledges a retry's new native generation when its data channel is still alive, including during signaling recovery. Stale native commands are rejected; a second joiner cannot displace a pending channel.
- Recovery exposes native `checking`, `retrying`, `exhausted`, `paused` and `blocked` states instead of inferring them from prose. Retry attempts are bounded, and exhausted retries offer an explicit restart.
- Manual Disconnect is available while reconnecting and remains paused after process restart. Explicit Reconnect/new-room actions reenable recovery.
- Reconnection is not navigation: host and guest can remain in Sandbox or another foreground screen. Accepted snapshots alone may change takeback integrity or dismiss consent.
- A room retains its recovery target before the first game. Creating an online room persists the replacement, so restarting does not resurrect the previous match. An empty remote room cannot clear an existing local saved board.
- Saved-match recovery correctly says that the board is saved; empty-room recovery describes the room.

## Native and JavaScript checks

The final build passed **42,422 native assertions** via `tests/run-native.ps1`, plus **12 deterministic Bluetooth lifecycle assertions** compiling the real `BluetoothLink` against test-only platform fakes. Total: **42,434**. The baseline breakdown and scope are in [0.8.0 validation](validation-gpt-v0.8.0.md); these totals include inherited non-chess foundation assertions and are not counts of UI scenarios.

The Bluetooth regression was reproduced against the old implementation: a queued connected callback survived `close()`. The new test covers stale attach, late frames, stale failures, late allocation, current callback delivery and exactly-once loss. The fakes are not packaged and are not radio tests.

JavaScript passed 75 evaluation-orientation assertions, 202 review-numbering assertions, 10 recovery-copy assertions, and PeerJS lifecycle/isolation checks. The warm-channel epoch failure and incorrect saved-board wording both failed new tests before their fixes. These contract tests do not replace real WebRTC testing.

## Final APK on Pixel

Pixel API 35, **360dp / 150% font scale**, airplane mode enabled and Wi-Fi disabled:

- Empty Sandbox → invalid empty position → place both kings and a rook → legal play for both sides → offline Stockfish numerical score → undo → navigate away/back → reject invalid edits → discard edits → FEN import → knight underpromotion.
- Draft survives a process restart. Discard restores the previous playable position. Game-history contents remain unchanged.
- Pass-and-play captures are attributed to the right player; capture rows do not resize the board. Player, capture and clock labels in this flow do not clip. Entering Sandbox and returning preserves the active game and captures.
- Sandbox board 316 × 316 CSS px, viewport scale 1, page overflow 0. Continuous geometry audit: 2,024 frames, no errors. Capture flow: 278 frames, no errors.
- Recorded a continuous 36-second Sandbox flow, not a slideshow. Display/network settings restored after testing.

## Physical Bluetooth

Vivo V2206 / Android 14 (384 CSS px) and Redmi A2+ / Android 13 (360 CSS px), already paired, 100% font scale. The separate GPT package ran on both phones.

- Empty connected room survived restarting the host and then the guest, without requiring a new room or resurrecting the replaced game.
- Both players' declined 3+2 / 5+0 invitations left the saved game unchanged. A 10+0 invitation transitioned both devices to the same board and clocks. Clock choices did not move or resize the setup sheet.
- Played `e4 d5 exd5 Qxd5`. Both capture trays matched the capturing player. Declining a takeback kept the board unchanged. White's accepted request rewound two plies; Black's accepted request rewound one. Both phones became Practice, with corrected capture trays and history.
- A newer move expired the pending consent. Restarting the guest and then the host automatically recovered the same board, captures and Practice status. Continued with `...Nf6`; both move lists contained the expected six plies.
- Final board widths were approximately 351.84 / 318.20 CSS px, square aspect, scale 1, game-page overflow 0. Setup frame audits recorded 2,063 / 1,190 frames without geometry errors.
- Disconnect remained paused across app restart. Manual Reconnect restored the same board. Reconnecting while either player used Sandbox preserved that screen and the saved game.
- A separate 3+2 game confirmed that an accepted takeback did not reset clocks or add an increment: the observed pair changed from `[180, 180]` seconds to `[178, 180]`.
- Continuous approximately 45-second recordings cover both sides of takebacks and the host's disconnect/recovery flow.

## Online connectivity

Two-physical-phone online testing could not connect while the Redmi had no active network (Wi-Fi was enabled but unassociated). After the task resumed, the Vivo was behind a secure lock screen. A proposed Vivo–Pixel run stopped at the foreground guard before starting a room. These are incomplete tests, not passes or an app diagnosis. The user was asked to unlock/connect the phones; no lock settings were altered.

The final APK passed actual PeerJS signaling and WebRTC data-channel flows between **two API 35 emulators**, not mocked connections. Host: 412 CSS px / 130% font. Guest: 393 CSS px / 100% font.

- Guest joined before the host existed, automatically retried, and connected after the host opened the room. An untimed invitation opened the same board on both devices.
- An empty connected room survived restarting each role. A second check restarted the host before the first invitation and verified that the replaced match did not return.
- The full takeback sequence passed: both requesters, decline, one/two-ply acceptance, captures, Practice eligibility, stale consent dismissal and six-ply history after continued play.
- Restarting the guest and then the host automatically recovered the same game. Deliberate Disconnect survived restart; explicit Reconnect resumed it. Both roles remained in Sandbox while their opponent reconnected.
- 3+2 takeback retained remaining time without a new increment: `[173, 182]` → `[171, 182]` seconds in the observed player order.
- A missing room exhausted its eight retries, displayed a stable stopped state, and restarted at attempt 1 after explicit Reconnect.
- Takeback frame audits: 2,429 / 2,258 frames, no geometry errors. Final game boards 374.87 / 359.80 CSS px, square, viewport scale 1, page overflow 0.
- Published online recordings include the guest takeback flow (30.39 seconds) and host disconnect/recovery flow (37.80 seconds). A shorter 28.77-second host takeback recording is retained locally, not used as the required 30–45-second clip.

## Test limitations and environment interruptions

- The shared ADB server uses an older client version. One full Bluetooth flow was interrupted by an ADB diagnostics timeout after successful app reconnection; the flow was restarted. A streaming APK update also stalled; the same package-verified APK installed successfully through push + Android package manager, without restarting the shared server.
- Android UI hierarchy dumping was unavailable for some system permission dialogs. The Redmi's GPT Bluetooth permissions were granted through ADB. Existing pairing/connection is tested, but a full first-install Android permission-dialog sequence is not certified by this run.
- Earlier Pixel boot attempts displayed an Android System UI ANR. The driver rejected those covered runs. The final offline run completed after dismissing the system dialog; this does not claim a proven cause of the Android ANR.
- Fixed-duration test waits also caused premature room checks and repeated Back input on a slow emulator. The driver now waits for navigation-state changes and room confirmation/closure. An independent single-Back check reached Play (the contextual parent), not Home; its initial Home-only test expectation was incorrect. The missing-room flow then passed using the corrected Home helper. These harness failures are not counted as passing app scenarios.
- Recordings are continuous input flows. Geometry checks run across animation frames; selected recording frames were also visually inspected. There is no claim that every video frame was manually watched, or that subjective sound/vibration perception was measured.
- No claim covers every carrier/NAT, network handover, radio toggle, Android background policy, long-duration disconnect, or every historical app feature. Older-release tests are not relabelled as final-build tests.
