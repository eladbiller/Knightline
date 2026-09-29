# Knightline Preview

Knightline Preview is an offline-first Android chess beta with a local HTML/CSS/JavaScript interface and a native Java chess core. It installs alongside ChessLink with its own package ID: `com.eladbiller.knightline`.

The interface is packaged inside the APK and served through Android's `WebViewAssetLoader` from a local HTTPS-style origin. No board library, font, UI code, or engine is downloaded at runtime.

## Included in the beta

- Complete native chess rules: legal move validation, castling, en passant, promotion, checkmate, stalemate, threefold repetition, and the 50-move rule.
- Bundled Stockfish 16 NNUE for arm64-v8a, armeabi-v7a, and x86_64; Easy, Medium, and Hard bot levels; live numeric evaluation; and post-game review.
- Offline bot games, pass-and-play, saved/resumed games, clocks, promotion, takebacks, and review branching.
- Board-first game and review workspaces: essential controls fit the viewport. Review includes highlights, real engine move-quality titles, a scored graph, key moments, and isolated retry practice.
- Six original offline mate-in-one puzzles with progressive hints, legal-move feedback, retry, Black-side positions, and native-stored completion. Puzzle practice never replaces the saved match.
- Progressive coaching for bot play and guided lessons: concept, piece, move arrow, then Hide hint. Hint use clearly changes a game to Practice.
- Native-stored Private Skill Rating: starts at 800; K=32 for the first 20 rated games then K=20; local history/deltas; bot anchors 600/1200/1800. It never claims a global ranking or leaderboard.
- Knightline-only Bluetooth rooms and private PeerJS/WebRTC rooms, with native move validation and local chat.
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

See [v0.3 flow validation](docs/validation-v0.3.0.md) for the current changes and limits. The native CLI suites pass 36,020 checks in total, including legacy core rules, tutor, timeline, bot, puzzle/review isolation, bridge, and rating checks. These are real Java `main` test runs, not an empty Gradle/JUnit result.

Prior beta Pixel coverage includes:

- Home, setup, bot play, pass-and-play, move history, live review, Back behavior, save/resume, and confirmation flows at 100%, 130%, and 150% Android text scale.
- In-place clock/strength selection whose sheet bounds and scroll position remain unchanged after every setting change.
- Live Stockfish evaluation, Hint → Show move → Hide hint, the on-board coaching arrow, accessible Take back, and persistent Practice reasons after process restart.
- Correct pass-and-play player identities, independent clocks, turn handoff, board rotation, and no engine evaluation in a friend game.
- Dynamic-type reflow at 130%/150%. The v0.3 tests additionally caught and fixed WebView text-only zoom and the narrow-screen setup footer changing height.
- Airplane-mode launch, resume, coaching, and live Stockfish evaluation with `navigator.onLine` false.

The private online room can create a PeerJS signaling session in the app. A final physical-phone-to-physical-phone online match still needs validation on a network with usable WebRTC relay/direct connectivity. Public PeerJS TURN hostnames did not resolve on the test emulator-to-phone network, so this beta does not claim universal PeerJS connectivity yet. Bluetooth and all local play remain usable offline.

### Selection regression in v0.2.1

Version 0.2.0 incorrectly replaced the board/evaluation layout when selecting a piece, widening the board by 14 CSS pixels. Version 0.2.1 updates highlights and legal targets on the existing square elements. The layout and evaluation rail stay mounted, and keyboard focus is preserved.

`tests/webview-board-flow.mjs` exercises the installed Android app through real WebView touch input and the native chess session. It measures each animation frame during selection, switching pieces, deselection, keyboard activation, illegal taps, tap/drag moves, native replies, takeback, and hint overlays. The selection probe fails on v0.2.0 and passes on v0.2.1. See [the focused validation record](docs/validation-v0.2.1.md) for the tested configurations and limitations.

## Stockfish licensing

Stockfish is GPLv3-or-later. Its source and notices are retained in `third_party/stockfish`; binary notices and the NNUE network are packaged in `app/src/main/assets/stockfish`. Knightline's source release must retain those materials.
