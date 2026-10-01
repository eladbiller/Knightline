# Knightline Preview 0.6.0 beta

Download **Knightline-Preview-v0.6.0-beta.apk** from Assets below. Install over the previous Knightline beta to keep local games and progress. ChessLink is unchanged.

## Play and feel

- Pieces lift above your finger with a shadow while dragging. Engine updates no longer detach the active board; illegal/off-board/cancelled drops restore it safely.
- Stronger, device-tuned heavy-click vibration, independent sound/vibration switches and a diagnostic when Android touch vibration is off. Physical strength still depends on the phone and its system settings.
- New original dry board clicks and double-impact capture sounds, including en passant. These are not copied Chess.com recordings.

## Review

- Restored the evaluation graph in Highlights, above key moments.
- Saved move: board before the move, numeric score after it. Play from here or select a piece to evaluate the actual analysis position instead.
- Explore both sides with normal last-move highlights and no automatic arrows. Show best remains an explicit choice.
- Back/Forward first leaves an alternative line at the same saved move; the following tap steps through the game. Next key move stops at the end.

## Learn

- Choose White or Black in opening lessons, with side-specific guidance and saved side selection for that lesson. Completed lessons stop cleanly and offer Restart, Review and Lessons.
- Seven endgame topics: king + rook, queen, two bishops, bishop + knight, two knights, lone bishop, and lone knight against a lone king.
- Full technique practice against offline Stockfish and short finishing patterns, playable as either color. Lessons explain forced mate versus merely possible mate versus impossible mate. Impossible-material lessons are explanations, not unwinnable challenges.

## Validation and limits

Native suites: **42,182 assertions**, plus **277** JavaScript orientation/notation assertions. Pixel emulator testing covers real touch flows, enlarged text, offline Stockfish, review alternatives, lesson completion and persistence. Continuous recordings and the detailed [validation record](https://github.com/eladbiller/Knightline/blob/main/docs/validation-v0.6.0.md) accompany this release.

Only the Pixel emulator was connected. Physical vibration feel and two-phone Bluetooth/PeerJS were not revalidated. This is a developer-signed beta; existing online relay limitations remain. Stockfish GPL source/notices and puzzle attribution remain included.

APK SHA-256: `dd833ed034877b9f2e2277e56cbe9a2a1894e1bfc395c82441a387ead14445fe`.
