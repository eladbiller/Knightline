# Knightline Preview gpt version — separate beta

Download **Knightline-Preview-v0.8.0-beta-side-by-side-gpt-version.apk** from Assets. This is a separate app (`com.eladbiller.knightline.gpt`): it installs alongside Knightline 1.0.0, with fresh saves/profile, and does not replace or migrate that app. Nothing was installed on the physical phones after the request to leave their current versions unchanged.

## New

- Captured pieces for each player, including correct en passant and promotion captures.
- **Play → Sandbox:** empty board; place pieces of either color; choose who moves; then play both sides with offline evaluation, undo and fixed orientation. Drafts persist. Sandbox never changes your active game or Games history.
- **Ask undo** in multiplayer: your opponent accepts or declines your last move's takeback, including their reply if already played. Accepted takebacks make the game Practice. Remaining clock time is kept.
- Automatic saved-game recovery after interruption for Bluetooth and PeerJS. Old-channel events cannot kill a new connection. Clocks pause while disconnected. Manual Disconnect stops retries.

Both players need this GPT edition for its multiplayer rooms; they are intentionally separate from the normal edition.

## Testing and limits

42,422 native assertions passed, plus JavaScript and installed-app flow tests. Core multiplayer changes passed real Vivo/Redmi play and automatic reconnection after restarting either app, over Bluetooth and actual PeerJS. These tests preceded the installation freeze and used the standard-package candidate. The final separate GPT package passed Pixel offline Sandbox, persistence and isolation tests at 360dp / 150% text. Its isolated transport identity has contract tests, not a fresh two-physical-GPT-install test.

Continuous screen recordings are attached. Exact coverage and limitations: [validation record](https://github.com/eladbiller/Knightline/blob/gpt-version/docs/validation-gpt-v0.8.0.md). Different mobile networks/NAT, all radio-toggle cases, and subjective sound/vibration are not certified.

Developer-signed beta. Stockfish GPL source and notices remain in the source repository.

SHA-256: `fbc381e05907ba5a5a1638f26d5797d08a8f0c822f2be3daae52687aec3adb98`.
