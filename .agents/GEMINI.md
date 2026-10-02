---
trigger: always_on
---

# Knightline Chess App — Project Knowledge

## Architecture
- **Hybrid Android app**: Native Java activities + WebView-based UI (`app/src/main/assets/ui/`)
- **Game state is native-side**: Managed in `KnightlineActivity.java` and `ChessLinkActivity.java`, pushed to the WebView as JSON payloads via `postEvent()`
- **Clocks are native**: `Handler` + `SystemClock.elapsedRealtime()` in Java, NOT JavaScript timers
- **Drag-and-drop is frontend**: `pointermove` → `translate3d()` in `app.js`, bridge call only on `pointerup`
- **Rendering**: Screen navigation replaces `main.innerHTML`, but in-game updates use custom template diffing (`positionKey`) to avoid destroying the board DOM

## Key Files
- `KnightlineActivity.java` — Main game activity, state management, UI payloads, rating integration
- `ChessLinkActivity.java` — Board rendering, clock management, hints, player panels, engine integration
- `SkillRatingStore.java` (in `com.eladbiller.knightline`) — Elo rating system
- `GameArchive.java` — Game library, serialized `.game` files
- `ChessFeedback.java` — Sound & haptic system (SoundPool)
- `app/src/main/assets/ui/app.js` — All frontend UI rendering, navigation, events
- `app/src/main/assets/ui/styles.css` — All CSS
- `app/src/main/assets/ui/index.html` — Shell HTML

## Testing
- E2E tests use Chrome DevTools Protocol (CDP) via WebSocket to control the WebView on real phones
- Two test phones: `10ACAD2F63001KS` (vivo Y22s, host), `TS55QC9PIRCY4XH6` (Xiaomi, client)
- CDP ports: Host 9225, Client 9226
- `auto_allow.mjs` is needed as a background daemon for Bluetooth tests on MIUI (auto-clicks system permission dialogs via `uiautomator`)
- Test scripts: `qa_local_bot_deep.mjs`, `qa_local_pass_deep.mjs`, `qa_peerjs_deep.mjs`, `qa_bluetooth_deep.mjs`
- The takeback confirmation is a **web-based** `[data-confirm="accept"]` button, NOT an Android native dialog
- Bluetooth roles are **randomly assigned** — never assume Host is always White

## Rating System
- Standard Elo: K=32 provisional (first 20 games), K=20 established
- Initial rating: 800. Bot anchors: Easy=600, Medium=1200, Hard=1800
- Stored in `SharedPreferences` key `private_skill_rating_v1`
- Games are only rated if: no hints, no takebacks, no lesson mode, no review branch, no custom position
- Session integrity is persisted to prevent force-stop exploits

## Known Issues (Not Yet Fixed)
- No auto-reconnect for Bluetooth/PeerJS disconnects
- PeerLink WebView throttled when backgrounded (kills online games after ~60s)
- `FLAG_KEEP_SCREEN_ON` never cleared (battery drain)
- Portrait-locked (no tablet/landscape support)
- No PGN export, no check/castling sounds, no premoves
- Zero latency compensation for online clocks

## Behavioral Notes
- The user expects **complete, thorough work** — never skip tests or claim something is done without evidence
- Always use `process.exit(1)` in test scripts on error to prevent task stalls
- When testing Bluetooth, always run `auto_allow.mjs` as a background daemon first
- The `"Game complete"` text in DOM is mixed-case (not all caps)
- **Critic Subagent Gate**: Always employ an adversarial Critic subagent (`DeepInvestigator`) to independently audit code diffs and real hardware test logs before committing or releasing any milestone. Never accept stubs, placeholders, or unverified claims.
