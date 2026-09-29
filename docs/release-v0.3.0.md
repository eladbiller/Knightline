# Knightline Preview 0.3.0 beta

Download **Knightline-Preview-v0.3.0-beta.apk** from Assets below. It updates the existing Knightline Preview installation and remains separate from ChessLink.

## What's changed

- Board-first game and review layouts, with essential controls visible without scrolling in the tested phone layouts.
- Clear **Best move, Good move, Inaccuracy, Mistake, and Blunder** review titles.
- Broad translucent arrows, including bent knight arrows. Decorative start/end circles and boxes are removed.
- Review highlights, evaluation graph, key-moment navigation, Before/Played/Best views, and independent move retry that leaves the saved game untouched.
- Six original offline mate-in-one puzzles with progressive hints and saved completion.
- Stable setup buttons, unified Android text scaling, and corrected system-bar/keyboard insets.
- Accessible Take back and numeric Stockfish evaluation remain in practice play. Piece selection retains stable board geometry.

## Tested

36,020 native checks passed, plus installed-APK touch flows on the Pixel emulator at 100%, 130%, and 150% text. Checks included 360dp width, gesture/three-button navigation, setup stability, full review, puzzles, hint stages, takeback, keyboard/Back, persistence, and airplane-mode bot play. Continuous emulator recordings are attached.

Only the emulator was connected: physical-phone, two-device Bluetooth, and end-to-end PeerJS tests were **not repeated** for this beta. The six puzzles are a starter collection. Review uses offline, time-limited Stockfish results, not Chess.com's proprietary accuracy or cloud service. See [validation details](https://github.com/eladbiller/Knightline/blob/main/docs/validation-v0.3.0.md).

This is a developer/debug-signed preview, not a production Play Store release. Stockfish GPL notices and corresponding source are included in the repository under `third_party/stockfish`.

APK SHA-256: `96d10e15c503e85e1d707d1178840e8d8adaefba718516b7fce814fef039fc03`
