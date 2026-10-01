# v0.7.1 — real two-phone flows and lesson-free Games

## What changed

- Opening lessons and endgame practice are neither newly archived nor listed from older archive files. The old lesson files are left untouched. They do not consume the 100-match retention limit. Active lesson saves and immediate lesson review still work.
- Nearby setup explains Host / Join, shows a waiting state, lists paired phones immediately and dismisses the picker after the protocol handshake.
- Create online room needs no typed code: it generates six characters and displays the shareable code. Join still accepts a friend's code. Custom codes remain supported.
- Invitations carry their own clock proposal. Accepting from either direction uses that clock; cancelling/declining cannot change a running game. The receiving phone displays the host's clock instead of its last bot/lesson setting.
- New friend matches clear stale lesson/Practice state. A queued rating exchange no longer erases an already-received rating.
- Both phones receive move history during play, not just at the end. Both retain saved reviews. Incoming chat updates an open chat log without replacing the draft input.
- Reconnect uses the existing remote session instead of clearing the saved board. Waiting/reconnecting states are visible.
- Review text/control rows size to their content, while reserving the two-line reading area. This fixes an enlarged-text overlap without changing square geometry or requiring page scrolling.

## Executed checks

Freshly compiled native CLI suites: **42,344 assertions**, including **134** new archive/legacy-lesson checks. These are assertions, not 42,344 distinct UI scenarios. The inherited rules suite includes non-chess foundation games. JavaScript orientation/notation: **277 assertions**. Six packaged sound assets passed PCM/provenance checks; this is not a human listening test.

`ArchiveLessonTest` seeds 120 old lesson files plus actual games, checks list/get exclusion and 100-game pruning, verifies byte-for-byte preservation of old lessons, and proves new lessons are not written. Stockfish, pass-and-play and friend-game archive modes remain supported.

The UI drivers use touch/keyboard input against the installed APK's real WebView and native controller. They do not replace chess/engine/transport decisions with injected mock state. Network/UI delivery is awaited with bounded deadlines, rather than asserting before an asynchronous response renders.

## Physical phones

- **Vivo V2206 / Android 14:** 384 CSS-pixel viewport; default and 130% font scale.
- **Redmi A2+ (23028RNCAG) / Android 13:** 360 CSS-pixel viewport; default and 150% font scale.
- Both devices were explicitly designated for testing by the user. APK updates used install-over-existing, not app-data clearing. The user reinstalled v0.7.0 midway; installed versions were rechecked, the candidate restored and first-install flows repeated.
- Bluetooth permission/discoverability, paired-device selection and handshake passed. These phones were already Android-paired; creating a brand-new Android bond was not retested.
- Host invitations and guest suggestions, declined offers, unchanged saved-game clock, accepted clock, automatic transition into the game and both players' rating eligibility passed.
- Eight-ply real matches included `e4 d5 exd5 Qxd5 Nc3 Qa5 d4 Nf6`. Boards were compared after every accepted move, illegal out-of-turn input was rejected, and both phones displayed all eight moves. Timed clock readings were checked within two seconds of each other.
- Bidirectional chat, completed-game result, resignation, review and friend-game library entries passed on both phones.
- Bluetooth resume after app restart preserved the board. PeerJS explicit disconnect/reconnect preserved the same position.
- PeerJS signaling **and actual moves/chat** passed on the phones' shared Wi-Fi LAN (different Wi-Fi bands). This does not establish reliability across separate mobile carriers, restrictive NAT, or unavailable public TURN relays.
- Final offline Bluetooth test: both phones reported airplane mode **1** and **Active default network: none**, with Wi-Fi off and Bluetooth on. Setup, invitation, moves, captures, clocks, chat, result and both saved reviews passed at 130%/150% text.
- Continuous physical layout sampling reported no square-aspect, viewport-zoom or sideways-sheet violations: offline setup 1,897 / 1,660 frames; invitations 1,176 / 1,021; play/chat 2,829 / 1,445; result/library 1,171 / 564 (Vivo / Redmi). These probes do not prove every text or performance property.
- Automatic online-code setup at enlarged text passed with 1,243 / 699 sampled frames and no recorded geometry violations.

Phone font scales were returned to 100%; airplane mode disabled and Wi-Fi restored. The updated APK remains installed.

## Pixel emulator

- **412dp / 130%:** opening and endgame sessions survive process restart; neither adds a Games entry; existing match IDs are unchanged; active custom-position review still works. Review board measured 328px, 64 square cells, zero page scroll, no tested reading/control overlap.
- **360dp / 150%:** full saved-game review, graded played arrows, optional best arrow, both-side legal exploration, score changes, fixed orientation, undo/reset, highlight filters and Back passed. Board measured 270px with zero page scroll. Continuous audit: 2,096 UI frames / 1,855 board frames / 677 sheet frames, no recorded violations.
- **Final candidate, 360dp / 150%:** complete navigation/setup cancellation, keyboard room entry, saved selection restoration, nested menu returns, lesson navigation, puzzle/list position and archive return passed. Continuous audit: 1,829 UI frames / 455 board frames / 908 sheet frames, no recorded violations.

## Recordings and limits

GitHub release assets include continuous Android screen recordings of setup, Bluetooth, PeerJS, offline Bluetooth, Pixel lesson/history, review and narrow setup. These are actual flows, not slideshow reconstructions. Screenrecord was requested for 45 seconds; device variable-frame-rate output can have longer reported timestamps, notably on the Redmi. Assertions continue beyond the recorded excerpt. A sampled sequence of the Redmi setup recording was also visually inspected; that supplements, not replaces, the live flow assertions.

No claim is made that every possible phone, pairing state, network or UI edge case has been tested. Real physical perception of sound/vibration was not measured by a human in this run. The beta remains developer-signed; the Stockfish GPL source/notices are retained.

APK SHA-256: `f768cc697ab565fad246dc8b7f0243e6ccc67f18889b4381ee7d9bd143d72217`.
