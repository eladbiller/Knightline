# Knightline Preview

Knightline Preview is an offline-first Android chess beta with a local HTML/CSS/JavaScript interface and a native Java chess core. It installs alongside ChessLink with its own package ID: `com.eladbiller.knightline`.

The interface is packaged inside the APK and served through Android's `WebViewAssetLoader` from a local HTTPS-style origin. No board library, font, UI code, or engine is downloaded at runtime.

## Separate GPT edition

The `gpt-version` branch adds captured-piece trays, an independent empty-board Sandbox, consensual multiplayer takebacks and interrupted-game recovery. Build with `gradle :app:assembleDebug -PknightlineGpt=true` for **Knightline Preview gpt version**, package `com.eladbiller.knightline.gpt`. It installs alongside the normal app, starts with fresh private storage, and uses its own Bluetooth service and online room namespace. Both players need the GPT edition for its multiplayer rooms. Building or downloading it does not upgrade or modify the normal app.

Sandbox: Play → Sandbox. Place either color's pieces on an empty board, choose the side to move, then Play position. Standard legal positions require both kings; invalid edits remain editable with an explanation. Play both sides with a fixed orientation, offline Stockfish score, undo, optional board flip, explicit castling rights and FEN import. The draft and playable board survive restart independently. Neither changes your active match, rating or game history.

Multiplayer: Ask undo requests your most recent move, including the opponent's reply if present. The opponent must agree. Acceptance makes both sides Practice; remaining clock time is retained, not reset. Requests expire after 30 seconds, a new position, game end or disconnection. Interrupted matches reconnect to the saved opponent/room; clocks pause while disconnected. Manual Disconnect stops automatic retry. See [GPT validation](docs/validation-gpt-v0.8.0.md) for exact coverage and limits.

## Included in the beta

- Complete native chess rules: legal move validation, castling, en passant, promotion, checkmate, stalemate, threefold repetition, and the 50-move rule.
- Bundled Stockfish 16 NNUE for arm64-v8a, armeabi-v7a, and x86_64; Easy, Medium, and Hard bot levels; live numeric evaluation; and post-game review.
- Offline bot games, pass-and-play, saved/resumed games, clocks, promotion, takebacks, and independent review analysis.
- Review shows the board **before** the selected move, with the numeric score **after that saved move**. Play from here (or selecting a piece) switches to the current analysis position's score. Both sides can explore legal alternatives without automatic arrows; normal last-move highlights remain. Back/Forward first exits the alternative line at the same saved move. Show best is optional, orientation stays fixed, and Next key move never wraps. Highlights includes the evaluation graph above key moments and collapsed statistics.
- A review-only library automatically keeps the latest 100 played games, separate from the active save. Opening/endgame lessons are excluded, including older lesson entries, and never consume the match limit. Lesson resume and immediate review remain available. Finished games open Review last game and return Home. Archived analysis cannot replace a match or change its rating.
- 256 offline puzzles in ascending difficulty: six original warm-ups and 250 multi-move Lichess CC0 positions, from 800–1199 through 2400+. Legal mistakes are played on the board, with an explicit Undo. Hints and mistakes permanently mark that puzzle as practice—even after retries or restarts. Earlier-version completions are preserved as practice because their first-attempt history cannot be verified. Puzzle practice never replaces the saved match.
- Offline wooden-board feedback built from Kenney's CC0 wood-impact assets: three placement variations, two-contact captures and softer mistake/finish cues. Independent sound/vibration switches and move/capture previews are available in Profile and directly in the game menu. Board-event vibration uses Android's game/media category, so disabling touch feedback does not disable it; device-wide vibration restrictions and DND still apply. Sound follows media volume. User-selected modern-knight logo, including an adaptive Android launcher icon.
- Five direct destinations: Home, Play, Learn, Games and Profile. Saved boards are prominent on Home and Play. Learn separates Puzzles, Openings and Endgames. Archive Back returns to Games; lessons return to Learn; live analysis returns to its game. Lists keep their scroll/filter/page, nested menus return to their parent, and cancelling replacement restores setup choices. Android Back from Home leaves the app.
- Lifted drag pieces follow the pointer with a shadow and touch offset. Engine updates preserve the live board and pointer capture; cancelled, off-board and illegal drops do not commit moves.
- Progressive coaching for bot play and guided lessons: concept, piece, move arrow, then Hide hint. Hint use clearly changes a game to Practice.
- Seven opening lessons offer White or Black, side-specific coaching and a finite completed-lesson screen. Seven endgame lessons cover rook, queen, two bishops, bishop + knight, two knights, lone bishop and lone knight against a bare king. Playable lessons offer full Stockfish technique practice or a mate-in-one finishing pattern, as either color. Notes distinguish forced mate, possible-but-not-forced mate, and dead positions.
- Native-stored Private Skill Rating: starts at 800; K=32 for the first 20 rated games then K=20; local history/deltas; bot anchors 600/1200/1800. It never claims a global ranking or leaderboard.
- Knightline-only Bluetooth rooms and private PeerJS/WebRTC rooms, with native move validation and live private chat. Paired phones appear immediately; the device picker closes when connected. Invitations carry the selected clock without changing an existing game. Online Create generates a shareable code if left blank. Reconnect preserves an unfinished friend match. Both phones retain live move history and saved reviews.
- A responsive dark tournament UI with a cool tournament board, original local SVG pieces, clean translucent move arrows, keyboard focus, square labels, safe-area handling, and dynamic-type reflow.

## Architecture and security

The visible WebView is local-content-only: file/content access is disabled, external navigation is blocked, and the UI uses a restrictive Content Security Policy. Native Java remains authoritative for moves, clocks, engine results, persistence, Bluetooth, and multiplayer state.

The versioned WebMessagePort protocol rejects malformed, stale, out-of-session, and illegal commands. PeerJS is isolated in a separate, hidden transport WebView with a narrowly allowlisted signaling origin; it does not loosen the visible UI WebView.

## Build

Use JDK 17, Android SDK platform 35, and Gradle 8.10.2 or compatible. From the repository root:

```powershell
gradle :app:assembleDebug
```

The debug APK is written to:

```
app/build/outputs/apk/debug/app-debug.apk
```

Keep release-signing files outside the repository; `.gitignore` excludes keystores and `signing.properties`.

## Validation status

See [v0.7.1 flow validation](docs/validation-v0.7.1.md) for the current changes and limits. The native CLI suites pass 42,344 checks in total, including legal replay of every packaged puzzle, endgame patterns in both colors, visible mistakes/Undo, permanent assistance, archive retention/isolation, lesson exclusion, contextual navigation, bridge and rating checks. Another 277 JavaScript assertions cover evaluation-rail orientation, White-perspective scores and Black-first custom-position notation. These are real test runs, not an empty Gradle/JUnit result.

Prior beta Pixel coverage includes:

- Home, setup, bot play, pass-and-play, move history, live review, Back behavior, save/resume, and confirmation flows at 100%, 130%, and 150% Android text scale.
- In-place clock/strength selection whose sheet bounds and scroll position remain unchanged after every setting change.
- Live Stockfish evaluation, Hint → Show move → Hide hint, the on-board coaching arrow, accessible Take back, and persistent Practice reasons after process restart.
- Correct pass-and-play player identities, independent clocks, turn handoff, board rotation, and no engine evaluation in a friend game.
- Dynamic-type reflow at 130%/150%. The v0.3 tests additionally caught and fixed WebView text-only zoom and the narrow-screen setup footer changing height.
- Airplane-mode launch, resume, coaching, and live Stockfish evaluation with `navigator.onLine` false.

Real Vivo V2206 and Redmi A2+ tests cover Bluetooth and PeerJS matches, alternating legal moves, captures, out-of-turn rejection, clocks, chat, reconnect, resignation, review and game history. Bluetooth was also tested with both phones in airplane mode, Wi-Fi off and no active network. Setup was tested at 130%/150% phone font scales. PeerJS passed on the same Wi-Fi LAN; separate cellular networks, restrictive NAT and relay availability are not certified. Bluetooth and all local play remain usable offline.

### Selection regression in v0.2.1

Version 0.2.0 incorrectly replaced the board/evaluation layout when selecting a piece, widening the board by 14 CSS pixels. Version 0.2.1 updates highlights and legal targets on the existing square elements. The layout and evaluation rail stay mounted, and keyboard focus is preserved.

`tests/webview-board-flow.mjs` exercises the installed Android app through real WebView touch input and the native chess session. It measures each animation frame during selection, switching pieces, deselection, keyboard activation, illegal taps, tap/drag moves, native replies, takeback, and hint overlays. The selection probe fails on v0.2.0 and passes on v0.2.1. See [the focused validation record](docs/validation-v0.2.1.md) for the tested configurations and limitations.

## Stockfish licensing

Stockfish is GPLv3-or-later. Its source and notices are retained in `third_party/stockfish`; binary notices and the NNUE network are packaged in `app/src/main/assets/stockfish`. Knightline's source release must retain those materials.

## Puzzle data

The 250 additional puzzles come from the [Lichess open puzzle database](https://database.lichess.org/#puzzles), released under CC0. Ratings are puzzle difficulty estimates, not Knightline player ratings. IDs, full solution lines, themes, source games and attribution are bundled in `app/src/main/assets/puzzles`. All gameplay is offline.

## Sound assets

Board feedback derives from [Kenney Impact Sounds](https://kenney.nl/assets/impact-sounds), CC0. Original source files and the processing recipe are in `third_party/kenney-impact-sounds` and `scripts/generate-feedback.mjs`; the license is also packaged in the APK. These are original-to-Kenney wood-impact assets, not Chess.com audio.

`tools/import-puzzles.mjs` accepts a local `.zst` archive (or bounded prefix) with Node 24+, and selects 50 positions per difficulty band using the criteria in `NOTICE.txt`. `tests/com/traillink/AdvancedLearningTest.java` checks every imported solution through native chess legality. `tests/webview-analysis-flow.mjs` tests the installed APK through touch input; it is destructive only to the emulator's test match and must not be run against personal saved games. The older workspace flow remains a v0.3 historical test; its review and puzzle selectors are superseded by the analysis flow.
