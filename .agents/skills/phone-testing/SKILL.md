---
name: phone-testing
description: Automated real hardware testing skill for Knightline. Automates ADB device checks, port forwarding, MIUI permission clicks, screen recordings, and E2E CDP test runs on physical phones.
---

# Phone Testing Skill (Knightline Physical Hardware E2E)

This skill provides step-by-step procedures and runbooks for executing automated end-to-end tests against Knightline running on real physical Android devices via the Chrome DevTools Protocol (CDP).

---

## 1. Test Hardware Specifications

| Device Role | Device Model | Serial Number | CDP Port | Notes |
|---|---|---|---|---|
| **Host Phone** | vivo Y22s | `10ACAD2F63001KS` | **9225** | Primary device, Bluetooth master |
| **Client Phone** | Xiaomi (MIUI) | `TS55QC9PIRCY4XH6` | **9226** | Secondary device, Bluetooth client, requires MIUI permission handling |

---

## 2. Pre-Flight Device Setup

Before launching test suites, run this pre-flight verification script to ensure both phones are online, awake, and mapped to CDP ports:

```powershell
# Verify ADB devices are detected
adb devices

# Wake screens and keep them active
adb -s 10ACAD2F63001KS shell input keyevent 224
adb -s TS55QC9PIRCY4XH6 shell input keyevent 224

# Setup DevTools socket port forwarding (using PID of running app)
$hostPid = (adb -s 10ACAD2F63001KS shell pidof com.eladbiller.knightline).Trim()
$clientPid = (adb -s TS55QC9PIRCY4XH6 shell pidof com.eladbiller.knightline).Trim()
adb -s 10ACAD2F63001KS forward tcp:9225 "localabstract:webview_devtools_remote_$hostPid"
adb -s TS55QC9PIRCY4XH6 forward tcp:9226 "localabstract:webview_devtools_remote_$clientPid"

# Verify CDP endpoints respond
curl -s http://127.0.0.1:9225/json/list
curl -s http://127.0.0.1:9226/json/list
```

---

## 3. Background Permission Daemon (`auto_allow.mjs`)

On MIUI devices (Xiaomi), Bluetooth and pairing dialogs show native system alerts that block the web UI. 
* **Rule:** When running Bluetooth tests (`qa_bluetooth_deep.mjs`), **always** ensure `auto_allow.mjs` is running as a background daemon.
* **Launch Daemon:**
  ```powershell
  # Launch as a non-blocking background daemon
  node auto_allow.mjs
  ```
* **Verify Daemon Status:**
  The daemon continuously scans UIAutomator dumps on both phones for `"Allow"`, `"Pair"`, or `"Accept"` buttons and clicks them automatically.

---

## 4. Test Suite Execution Matrix

Run these scripts from the repository root:

### A. Bot Offline Mode
```powershell
node qa_local_bot_deep.mjs
```
* **Verifies:** Stockfish bot matchmaking, move play, evaluation rail updates, bot reply handling, and takeback execution.

### B. Pass & Play Local Multiplayer
```powershell
node qa_local_pass_deep.mjs
```
* **Verifies:** Two-player local turns, takeback confirmation modal (`[data-confirm="accept"]`), and board state consistency.

### C. WebRTC PeerJS Online Mode
```powershell
node qa_peerjs_deep.mjs
```
* **Verifies:** WebRTC room code hosting on Host, code entry on Client, P2P data channel synchronization, move exchange, and clock countdowns.

### D. Bluetooth 2-Phone Mode
```powershell
node qa_bluetooth_deep.mjs
```
* **Verifies:** Bluetooth discovery, pairing authorization, dynamic role determination (White vs Black), move transmission, and full checkmate assertion (`"Game complete"`).

### E. Secondary Features & Navigation
```powershell
node qa_other_features_deep.mjs
```
* **Verifies:** Profile rating rendering, Game Library archive inspection, Opening lessons, and Puzzle catalog.

---

## 5. Screen Recording Pipeline

To visually record test runs or capture screen evidence:
```powershell
# Start recording in background (up to 180s)
adb -s 10ACAD2F63001KS shell screenrecord --size 720x1600 /sdcard/test_run.mp4 &

# ... execute test script ...

# Stop recording and pull file to computer
adb -s 10ACAD2F63001KS shell pkill -2 screenrecord
adb -s 10ACAD2F63001KS pull /sdcard/test_run.mp4 ./test_run.mp4
adb -s 10ACAD2F63001KS shell rm /sdcard/test_run.mp4
```

---

## 6. Critical CDP Testing Guidelines
1. **Always use `process.exit(1)` on error:** In Node.js CDP scripts with active WebSocket connections, unhandled promise rejections will cause the script to hang indefinitely. Every error path must explicitly exit with code 1.
2. **Hydration Delays:** Wait at least 3000–5000ms after navigating to a game screen before asserting DOM elements to allow the WebView and Stockfish engine to initialize.
3. **Role Determination in Bluetooth:** Bluetooth roles (White/Black) are randomly assigned by the native transport. Never assume Host is White. Test scripts should perform an active move tap to dynamically determine which phone plays White.
4. **Takeback Confirmation:** The takeback confirm dialog is a web-based DOM element (`[data-confirm="accept"]`), NOT an Android native dialog.
