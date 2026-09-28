# Board selection fix: v0.2.1

## Reproduced defect

On the released v0.2.0 APK, a real touch selecting a pawn changed the board from 363.2976 × 363.2976 CSS pixels to 377.2976 × 377.2976. The left edge moved 14 pixels and the evaluation rail disappeared. The first regression probe detected 13 unstable frames out of 21.

`refreshBoardOnly()` replaced the entire board host with `boardMarkup()`, dropping the `board-layout` wrapper and its evaluation column. The next native state render restored them, making the board shrink again.

## Correction

Selection, reselection, deselection, and pending submission now update classes, accessible square labels, and disabled state on the existing 64 buttons. They do not replace the board host, evaluation rail, pieces, or focused button. Both tap and drag submission also respect the pending-move and current-turn guards.

## Verification on the installed APK

- Pixel emulator, 412dp viewport: bot flow at 130% and 150% font scale, including both board orientations across runs.
- Pixel emulator, 412dp viewport at 100%: pass-and-play and guided opening flows.
- Pixel emulator, 360dp viewport at 150%: complete bot flow.
- Every configuration passed pawn/knight selection, switching pieces, deselection, keyboard activation with focus retained, invalid destination, tap move, takeback, and drag move.
- Bot and lesson flows additionally passed selection with the coaching overlay present and hiding the hint.
- Each measured animation frame retained the board width, height, horizontal position, viewport scale, 64 squares, and evaluation-rail count. Selection-only checks also require the same board node, vertical position, and scroll offset. No unstable frames were detected in the passing runs.
- A continuous Android screen recording covers the interaction sequence. The release clip keeps the first 45 seconds at the original timing; only its idle tail is shortened.

The script starts new games and replaces the test device's current saved game. Use it only on a test device with the debug beta installed and Node.js 22+ available:

```powershell
$env:ADB = 'path\to\adb.exe'
$env:ANDROID_SERIAL = 'emulator-5554'
node tests/webview-board-flow.mjs --probe
node tests/webview-board-flow.mjs --record=C:\test-output\board-flow.mp4
node tests/webview-board-flow.mjs --mode=pass
node tests/webview-board-flow.mjs --mode=lesson
```

This is focused regression evidence for board interaction stability. Physical phones were unavailable during this fix. It does not establish that every UI flow or multiplayer connection is defect-free.
