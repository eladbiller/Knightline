# Knightline Preview 0.4.0 beta

Download **Knightline-Preview-v0.4.0-beta.apk** from Assets below. It updates Knightline Preview, preserves its saved progress, and remains separate from ChessLink.

## What's changed

- **256 offline puzzles:** 250 new rated, multi-move positions across five difficulty bands, plus the six warm-ups. Includes native opponent replies, promotions, hints, missed-puzzle practice and separate unassisted progress.
- **Review your played move first.** The arrow uses its grade color; Show best is optional and hides again when you move or navigate.
- **Explore either side freely.** Any legal continuation, live numeric Stockfish evaluation, Undo and Return to game. The board does not rotate and your saved match stays unchanged.
- **Correct evaluation-bar orientation.** Its white/black ends follow the board. Positive scores always favor White, regardless of rotation.
- Player/color labels on highlights, My moves/Both players filters, and White/Black filters for pass-and-play.
- Cleaner knight logo and bottom Play icon; corrected review-menu overlap.

## Tested

41,016 native assertions and 75 evaluation-orientation assertions passed. Every packaged puzzle solution was replayed through native chess legality. Installed-APK touch flows passed on the Pixel emulator at 100%, 130% and 150% text, including 360dp width, gesture/three-button navigation, free review analysis, underpromotion, Undo/reset, hints, takeback, saved progress, keyboard/Back and airplane-mode play. Continuous recordings are attached.

Physical phones were not connected; two-device Bluetooth and end-to-end PeerJS testing were **not repeated**. This remains a developer/debug-signed beta with time-limited offline analysis and a finite puzzle library, not Chess.com's proprietary cloud review or rating system. See [detailed validation](https://github.com/eladbiller/Knightline/blob/main/docs/validation-v0.4.0.md).

Stockfish GPL notices and corresponding source remain in `third_party/stockfish`. The Lichess puzzle pack is CC0, with source IDs, provenance and license notice bundled in the APK.

APK SHA-256: `e519bd60f9b26bd7e25be7a72c1c6eca35ae403a96a05c4446e49c18c00f3e2b`
