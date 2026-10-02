# GPT edition 0.8.0 — validation record

## Scope and device freeze

The requested edition is **Knightline Preview gpt version**, `com.eladbiller.knightline.gpt`, version 0.8.0-beta / code 10. It has independent app-private files/preferences, a separate Bluetooth service UUID and `knightline-gpt-v2-` signaling IDs. It does not migrate or overwrite the normal app.

Before the user asked to freeze phone installations, a standard-package 0.8.0 candidate was installed over the designated test apps. Actual multiplayer tests below ran on that candidate. At the freeze request, a read-only check showed both phones had independently changed to **1.0.0 / code 12**. No APK was installed on either physical phone after that request. The final side-by-side GPT package was installed and tested only on the Pixel emulator. Its new transport namespace has contract coverage, but was not retested between two physical GPT installs; this is an explicit limit, not a claim that namespace tests are radio tests.

## Implemented behavior

- Captured pieces come from native move history, attributed to the capturing player. En passant and promotion captures are covered; missing starting pieces in custom positions are not invented captures. Trays reserve stable vertical space and group multiples by count.
- Independent native Sandbox: empty editor, both colors, erase, side to move, validated start, legal play for both sides, fixed orientation, flip, undo, underpromotion, offline numerical evaluation, castling choices, FEN and persisted drafts. Invalid edits never replace the playable position. History and active game are independent.
- Multiplayer takeback consent is bound to a request ID, session and exact monotonic position sequence. The host alone applies it. Both requester colors can rewind their latest decision; neither can approve their own request. Acceptance updates capture trays, history and Practice eligibility on both devices. Clock time remains, without a new increment for undoing a move. Requests time out or expire on a changed position/end/disconnection.
- Recovery reconnects directly to the saved Bluetooth address or online room. Bounded retry, heartbeat, clock pause, session validation and explicit Disconnect behavior replace the repeated picker flow. Peer callbacks from old channels/native epochs are ignored, and an occupied established channel cannot be replaced by another joiner. The host keeps its signaling identity while waiting for the guest. Signaling loss alone does not terminate an open data channel, consistent with the [PeerJS API](https://peerjs.com/client/api/peer).
- Dark captured pieces/palette have a lighter outline on dark surfaces. The native shell resets inherited cream system-bar colors before requesting light icons. These final cosmetic changes were not reinstalled on the physical phones.

## Executed native / contract checks

`tests/run-native.ps1` compiles UTF-8 tests against the actual Gradle-compiled application classes. This avoids accidentally testing the older duplicate `src/` foundation. **42,422 native assertions** passed: Game 35,004; Learning 317; Timeline 70; V3 76; Upgrade 237; Puzzle 265; AdvancedLearning 5,748; Library 42; Endgame 336; Navigation 29; Archive 134; SandboxTakeback 49; BridgeGuard 85; SkillRating 30. Some foundation suites include non-chess games; these are assertions, not distinct UI scenarios.

SandboxTakeback covers capture attribution, en passant, promotion, custom roots, both requesters, own-consent rejection, stale/out-of-session/finished requests, monotonic sequence, special-move restoration, both-side Sandbox play, undo retaining earlier moves, invalid kings/pawns/castling/en-passant, terminal positions and serialization.

JavaScript: 75 evaluation-orientation assertions, 202 review-numbering assertions, plus Peer lifecycle/isolation contract checks using a deterministic event harness. Those transport contract checks are not presented as real WebRTC connectivity tests.

## Real phones, before installation freeze

Vivo V2206 / Android 14 (384 CSS px) and Redmi A2+ / Android 13 (360 CSS px), already paired, at 100% font scale:

- Bluetooth and actual PeerJS room setup/handshake. Host and guest clock invitations; rejection leaves the old clock unchanged.
- Played `e4 d5 exd5 Qxd5`, verified each side's pawn capture tray and synchronized boards.
- Declined a takeback: unchanged position and captures.
- White requested their last move after Black's reply: both moves rewound; captures cleared; both players Practice.
- Black requested their latest move: one ply rewound; only White's capture remained.
- A new move while a request was pending invalidated and dismissed the request without undoing the newer board.
- For each transport, force-stopped/reopened the guest and then the host. Automatic reconnection restored the same board, capture trays and Practice status without a discovery picker or new invitation. Continued with a legal move afterward; both histories contained the expected six plies.
- Board geometry remained square, viewport scale 1, and game-page scroll overflow 0. Final game board widths were approximately 351.8 px / 318.2 px.

These new tests cover app/process interruption, not every radio-toggle, background policy, network handover, mobile-carrier NAT or TURN failure. PeerJS ran on the phones' shared Wi-Fi. The earlier 0.7.1 release has separate offline-Bluetooth evidence; it is not relabelled as a new GPT-edition radio test.

## Final GPT package on Pixel

- Installed alongside the original package, without removing or clearing either app.
- Empty editor → explained invalid empty position → place two kings and a rook → play both sides → numerical offline Stockfish score → undo → navigate away/back → erase a king and reject invalid play → discard edits → import FEN → knight underpromotion.
- Full final flow passed at **360dp / 150% font**, in airplane mode with Wi-Fi disabled. Network settings restored afterward. Board 316 × 316 px in the final displayed position, viewport scale 1, page overflow 0; continuous layout audit reported no square-aspect, zoom or sideways-sheet violations.
- A draft with a newly placed queen survives process restart. Discard restores the prior playable board. Sandbox does not add game-library entries.
- Final GPT pass-and-play capture flow at 150%: both pawn trays match their capturer, board size is unchanged as captures appear, tested player/capture/clock labels do not clip, page overflow 0 and scale 1. Opening Sandbox and returning preserves the existing active game and its captures. Continuous audit: 226 frames, no recorded geometry errors.

Continuous 45-second screen recordings cover Sandbox and the physical Bluetooth/PeerJS takeback flows. Recordings are actual input flows, not reconstructed screenshot slides. Automated checks continue outside the recorded excerpt. No claim is made of manually watching every frame or measuring human sound/vibration perception.

## Artifact

`Knightline-Preview-v0.8.0-beta-side-by-side-gpt-version.apk` — 37,604,268 bytes.

SHA-256: `fbc381e05907ba5a5a1638f26d5797d08a8f0c822f2be3daae52687aec3adb98`.

Developer/debug signed, certificate SHA-256 `779396cfdce796d353a7f0f1f5212477d24d4ed69b107c5369294384000705b9`. This is not a production signing claim. Existing Stockfish GPL source and notices are retained.
