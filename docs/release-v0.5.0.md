# Knightline Preview 0.5.0 beta

Download **Knightline-Preview-v0.5.0-beta.apk** from Assets. Install it over Knightline Preview to preserve your save and progress; ChessLink remains separate.

## Changes

- Review opens **before the selected move**. The graded played-move arrow is behind pieces. Play a different line immediately, for either side, without rotating the board. Show best remains optional; Undo and Reset line never change the original game.
- **Key moments first** in Highlights. Move lists and statistics are below them in a collapsible section.
- **Game library:** the latest 100 played games, stored on the phone for review only. Finished games say Review last game. Back from a completed or archived review returns Home.
- **Honest puzzle progress:** wrong legal moves are shown on the board; Undo restores the position. Hints and failures remain in the record through retries and restarts. Warm-up is first in the difficulty sequence. Older completions are kept as practice, without unverifiable first-try claims.
- **Sound and vibration**, independently switchable in Profile, with a preview button. Sound respects silent mode; system haptic settings still apply.
- Your chosen **modern knight** logo, including an adaptive launcher icon. Removed the redundant Local only Home panel. Fixed large-text review-header wrapping and low-contrast Resume interaction styling.

## Validation and limits

See the [flow validation record](https://github.com/eladbiller/Knightline/blob/main/docs/validation-v0.5.0.md). The native suites passed 41,839 assertions plus 75 evaluation-orientation checks. Continuous recordings accompany real installed-APK touch/state tests; these are not screenshots-only checks.

Only the Pixel API 35 emulator was connected. Physical vibration feel, physical-phone layouts, Bluetooth and two-phone PeerJS were **not revalidated**. Existing PeerJS network/relay limitations remain. This is a developer/debug-signed beta, with time-limited local Stockfish analysis—not Chess.com's cloud review or ratings.

Stockfish GPL source/notices remain in the repository. The offline puzzle pack retains its Lichess CC0 attribution and source IDs. Original feedback samples are reproducible with `scripts/generate-feedback.mjs`.

APK SHA-256: `7f38fdb84c1a7420ff7aacbeace065a649052351de85fac724cf6d95cc4762f5`
