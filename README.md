# Knightline Preview

Knightline Preview is an offline-first Android chess beta with a local HTML/CSS/JavaScript interface and a native Java chess core. It installs alongside ChessLink with its own package ID: `com.eladbiller.knightline`.

The interface is packaged inside the APK and served through Android's `WebViewAssetLoader` from a local HTTPS-style origin. No board library, font, UI code, or engine is downloaded at runtime.

## Included in the beta

- Complete native chess rules: legal move validation, castling, en passant, promotion, checkmate, stalemate, threefold repetition, and the 50-move rule.
- Bundled Stockfish 16 NNUE for arm64-v8a, armeabi-v7a, and x86_64; Easy, Medium, and Hard bot levels; live numeric evaluation; and post-game review.
- Offline bot games, pass-and-play, saved/resumed games, clocks, promotion, takebacks, and review branching.
- Progressive coaching for bot play and guided lessons: concept, piece, move arrow, then Hide hint. Hint use clearly changes a game to Practice.
- Native-stored Private Skill Rating: starts at 800; K=32 for the first 20 rated games then K=20; local history/deltas; bot anchors 600/1200/1800. It never claims a global ranking or leaderboard.
- Knightline-only Bluetooth rooms and private PeerJS/WebRTC rooms, with native move validation and local chat.
- A responsive dark tournament UI with a warm ivory board, original local SVG pieces, keyboard focus, square labels, safe-area handling, and dynamic-type reflow.

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

The current beta has passed native bridge/rating contract checks and JavaScript syntax checks. Real Pixel emulator flow captures cover:

- Home, Play, and bot setup at 130% and 150% Android text scale.
- In-place clock/strength selection in the setup sheet, followed by a bot game.
- Live Stockfish evaluation (`+0.33` observed), normal-game Hint → Show move → Hide hint, and the on-board coaching arrow.
- Responsive reflow with no clipped text at 130%/150%; 150% switches dense cards to one column instead of shrinking or clipping them.

The private online room can create a PeerJS signaling session in the app. A final physical-phone-to-physical-phone online match still needs validation on a network with usable WebRTC relay/direct connectivity. Public PeerJS TURN hostnames did not resolve on the test emulator-to-phone network, so this beta does not claim universal PeerJS connectivity yet. Bluetooth and all local play remain usable offline.

## Stockfish licensing

Stockfish is GPLv3-or-later. Its source and notices are retained in `third_party/stockfish`; binary notices and the NNUE network are packaged in `app/src/main/assets/stockfish`. Knightline's source release must retain those materials.
