# Knightline Preview 0.7.0 beta

Download **Knightline-Preview-v0.7.0-beta.apk** from Assets below. Install over the previous Knightline beta to keep your games and progress. ChessLink is unchanged.

## Board sound and vibration

- Natural wood-impact placements with three variations and a distinct two-contact capture, replacing the synthesized clicks. All sounds are bundled offline; source assets are Kenney CC0, not copied Chess.com audio.
- Board vibration no longer depends on Android's **touch feedback** switch. Knightline has independent saved sound/vibration controls; device-wide restrictions and DND can still apply.
- Try a move / Try a capture in Profile or **Game menu → Sound & vibration**, without leaving the board. Sound uses media volume.

## Easier navigation

- Direct **Games** destination for saved reviews; prominent Resume on Home and Play.
- Separate **Puzzles / Openings / Endgames** categories, with remembered list positions.
- Back returns to the relevant game, lesson category or saved-games list. Home Back leaves the app.
- Cancelling replacement restores your clock, strength, lesson side, stage or room code. Nested menus return to their parent.
- Fixed the setup footer covering Hard on narrow phones with enlarged text. Choices scroll above a separate action row; no overlapping menu footers.

## Validation and limits

42,210 native assertions and 277 JavaScript orientation/notation assertions passed. Actual installed-APK journeys cover navigation, cancellation, keyboard input, review, lessons, bot play and feedback. Continuous recordings accompany the [validation record](https://github.com/eladbiller/Knightline/blob/main/docs/validation-v0.7.0.md).

Only the Pixel emulator was connected. Android service diagnostics verify sound requests and vibration with touch feedback off; physical speaker/vibration feel still needs checking on your phone. Two-phone Bluetooth/PeerJS was not revalidated. Developer-signed beta; Stockfish GPL source/notices remain included.

APK SHA-256: `262ecfa3056c10ff29e78882bf670dc48f98be7c2828ea86b60fbc3d6623fd88`.
