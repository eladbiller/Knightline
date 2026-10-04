import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

const adbPath = process.env.ADB || 'adb';
const adb = (serial, ...a) => execFileSync(adbPath, ['-s', serial, ...a], {encoding: 'utf8'}).trim();
const delay = ms => new Promise(r => setTimeout(r, ms));

class CDP {
  pending = new Map(); id = 0;
  constructor(serial) { this.serial = serial; }
  async open(url) {
    this.ws = new WebSocket(url);
    this.ws.addEventListener('message', ({data}) => {
      const msg = JSON.parse(data);
      const request = this.pending.get(msg.id);
      if (!request) return;
      this.pending.delete(msg.id);
      if (msg.error) request.reject(new Error(JSON.stringify(msg.error)));
      else request.resolve(msg.result);
    });
    await new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, {once: true});
      this.ws.addEventListener('error', reject, {once: true});
    });
  }
  call(method, params) {
    return new Promise((resolve, reject) => {
      const id = ++this.id;
      this.pending.set(id, {resolve, reject, timeout: setTimeout(() => reject(new Error('timeout')), 8000)});
      this.ws.send(JSON.stringify({id, method, params}));
    });
  }
  async evaluate(expression) {
    const response = await this.call('Runtime.evaluate', {expression, returnByValue: true, awaitPromise: true});
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
    return response.result.value;
  }
  async waitForSelector(selector, maxRetries = 35) {
    let retries = maxRetries;
    while (retries > 0) {
      const exists = await this.evaluate(`!!document.querySelector('${selector}')`);
      if (exists) return;
      await delay(1000);
      retries--;
    }
    throw new Error(`[${this.serial}] Timeout waiting for selector: ${selector}`);
  }
  async clickSelector(selector) {
    let retries = 20;
    while (retries > 0) {
      const clicked = await this.evaluate(`
        (function() {
          const el = document.querySelector('${selector}');
          if (el) { el.click(); return true; }
          return false;
        })()
      `);
      if (clicked) return true;
      await delay(500);
      retries--;
    }
    throw new Error(`[${this.serial}] Could not find and click selector: ` + selector);
  }
  async typeInput(selector, text) {
    await this.evaluate(`document.querySelector('${selector}').value = '${text}'; document.querySelector('${selector}').dispatchEvent(new Event('input', { bubbles: true }));`);
  }
  async tapSquare(index) {
    console.log(`[${this.serial}] Tapping square ${index}`);
    const rect = await this.evaluate(`
      (function() {
        const el = document.querySelector('[data-square="${index}"]');
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return {x: r.left + r.width/2, y: r.top + r.height/2};
      })()
    `);
    if (!rect) throw new Error(`[${this.serial}] Could not find square ${index}`);
    await this.call('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{x: rect.x, y: rect.y, id: 1}]});
    await delay(65);
    await this.call('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
    await delay(500);
  }
  async assertPiece(index, pieceName) {
    const text = await this.evaluate(`
      (function() {
        const el = document.querySelector('[data-square="${index}"]');
        return el ? el.getAttribute('aria-label') : null;
      })()
    `);
    assert(text && text.includes(pieceName), `[${this.serial}] Expected ${pieceName} at ${index}, got ${text}`);
  }
}

async function connectToDevice(serial, port) {
  adb(serial, 'shell', 'pm', 'clear', 'com.eladbiller.knightline');
  adb(serial, 'shell', 'monkey', '-p', 'com.eladbiller.knightline', '-c', 'android.intent.category.LAUNCHER', '1');
  await delay(3000);
  const pid = adb(serial, 'shell', 'pidof', 'com.eladbiller.knightline');
  adb(serial, 'forward', `tcp:${port}`, `localabstract:webview_devtools_remote_${pid}`);
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = targets.find(t => t.type === 'page' && t.url.includes('index.html')) || targets.find(t => t.type === 'page');
  const cdp = new CDP(serial);
  await cdp.open(page.webSocketDebuggerUrl);
  return cdp;
}

async function run() {
  const hostSerial = process.env.HOST_SERIAL || '10ACAD2F63001KS';
  const clientSerial = process.env.CLIENT_SERIAL || 'R9WR40475QJ';
  const hostPort = 9225;
  const clientPort = 9227;

  console.log("=== Ensuring Wi-Fi enabled on both devices ===");
  adb(hostSerial, 'shell', 'svc', 'wifi', 'enable');
  adb(clientSerial, 'shell', 'svc', 'wifi', 'enable');
  await delay(2000);

  console.log("=== STEP 1: Launching Knightline on Host & Client ===");
  const hostCdp = await connectToDevice(hostSerial, hostPort);
  const clientCdp = await connectToDevice(clientSerial, clientPort);
  await delay(1500);

  console.log("=== STEP 2: Navigating to Online Menu & Creating Room ===");
  await hostCdp.clickSelector('[data-action="nav-play"]');
  await clientCdp.clickSelector('[data-action="nav-play"]');
  await delay(1000);

  await hostCdp.clickSelector('[data-action="online-menu"]');
  await clientCdp.clickSelector('[data-action="online-menu"]');
  await delay(1000);

  const roomCode = "QA" + Math.random().toString(36).substring(2, 6).toUpperCase();
  console.log(`Using online room code: ${roomCode}`);

  await hostCdp.waitForSelector('#room-code');
  await hostCdp.typeInput('#room-code', roomCode);
  await hostCdp.clickSelector('[data-online="host"]');
  await delay(2500);

  await clientCdp.waitForSelector('[data-online-tab="join"]');
  await clientCdp.clickSelector('[data-online-tab="join"]');
  await delay(600);
  await clientCdp.waitForSelector('#room-code');
  await clientCdp.typeInput('#room-code', roomCode);
  await clientCdp.clickSelector('[data-online="join"]');

  console.log("Waiting for WebRTC connection...");
  await hostCdp.waitForSelector('[data-action="remote-setup"]');
  console.log("PeerJS room connected successfully!");

  console.log("=== STEP 3: MANDATE 1 - Untimed Clock Parity Verification ===");
  await hostCdp.clickSelector('[data-action="remote-setup"]');
  await delay(1000);

  // Host explicitly selects "Untimed" clock (value 4)
  console.log("Host selecting 'Untimed' (No clock / value 4)...");
  await hostCdp.clickSelector('[data-choice="clock"][data-value="4"]');
  await delay(500);

  await hostCdp.clickSelector('[data-setup-start]');
  console.log("Invitation sent with Untimed clock. Waiting for Client accept...");

  await clientCdp.waitForSelector('[data-confirm="accept"]');
  await clientCdp.clickSelector('[data-confirm="accept"]');

  console.log("Waiting for game boards...");
  await hostCdp.waitForSelector('.board');
  await clientCdp.waitForSelector('.board');
  await delay(2000);

  // Read both clocks on both devices
  const hostClocks = await hostCdp.evaluate(`
    ({
      you: document.querySelector('[data-clock="you"]')?.textContent?.trim() || '',
      opponent: document.querySelector('[data-clock="opponent"]')?.textContent?.trim() || ''
    })
  `);
  const clientClocks = await clientCdp.evaluate(`
    ({
      you: document.querySelector('[data-clock="you"]')?.textContent?.trim() || '',
      opponent: document.querySelector('[data-clock="opponent"]')?.textContent?.trim() || ''
    })
  `);

  console.log("Host clocks:", hostClocks);
  console.log("Client clocks:", clientClocks);

  // Verify clock parity: Neither clock should show "00:00"
  assert.notEqual(hostClocks.you, "00:00", "Host clock displayed 00:00 for Untimed game!");
  assert.notEqual(hostClocks.opponent, "00:00", "Host opponent clock displayed 00:00 for Untimed game!");
  assert.notEqual(clientClocks.you, "00:00", "Client clock displayed 00:00 for Untimed game!");
  assert.notEqual(clientClocks.opponent, "00:00", "Client opponent clock displayed 00:00 for Untimed game!");

  assert(hostClocks.you.includes("∞") || hostClocks.you.includes("Untimed"), `Expected Untimed/∞ on Host, got ${hostClocks.you}`);
  assert(clientClocks.you.includes("∞") || clientClocks.you.includes("Untimed"), `Expected Untimed/∞ on Client, got ${clientClocks.you}`);
  console.log("PASS: Untimed clock parity verified across both devices (no 00:00 mismatch)!");

  console.log("=== STEP 4: Dynamic Role Detection & Initial Moves ===");
  let hostIsWhite = false;
  await hostCdp.tapSquare(52); // e2
  await hostCdp.tapSquare(36); // e4
  await delay(1500);

  const hostE4 = await hostCdp.evaluate(`
    (function() {
      const el = document.querySelector('[data-square="36"]');
      return el ? (el.getAttribute('aria-label') || '') : '';
    })()
  `);

  if (hostE4 && hostE4.includes('White')) {
    hostIsWhite = true;
    console.log("Roles: Host is White (local move succeeded).");
  } else {
    hostIsWhite = false;
    console.log("Roles: Host is Black (Client is White).");
  }

  const whiteCdp = hostIsWhite ? hostCdp : clientCdp;
  const blackCdp = hostIsWhite ? clientCdp : hostCdp;

  if (hostIsWhite) {
    await blackCdp.assertPiece(36, "White pawn");
    console.log("Move 1 (e4) verified on Black screen.");
  } else {
    await whiteCdp.tapSquare(52);
    await whiteCdp.tapSquare(36);
    await delay(1500);
    await whiteCdp.assertPiece(36, "White pawn");
    await blackCdp.assertPiece(36, "White pawn");
    console.log("Move 1 (e4) played by Client (White) and verified on Host.");
  }

  // Black plays e5 (12 -> 28)
  console.log("Black playing Move 2: e5 (12 -> 28)...");
  await blackCdp.tapSquare(12);
  await blackCdp.tapSquare(28);
  await delay(1500);
  await whiteCdp.assertPiece(28, "Black pawn");
  console.log("Move 2 (e5) verified on White screen.");

  console.log("=== STEP 5: Physical Network Interruption & Auto-Reconnection ===");
  console.log("Executing 'svc wifi disable' on Client tablet...");
  adb(clientSerial, 'shell', 'svc', 'wifi', 'disable');
  
  console.log("Waiting for reconnect banner on Client...");
  await clientCdp.waitForSelector('.reconnecting-banner', 20);
  const clientBanner = await clientCdp.evaluate(`document.querySelector('.reconnecting-banner')?.textContent`);
  console.log("Client banner active:", clientBanner);

  console.log("Re-enabling Wi-Fi on Client tablet...");
  adb(clientSerial, 'shell', 'svc', 'wifi', 'enable');

  console.log("Waiting for Wi-Fi re-association and WebRTC auto-reconnection...");
  let reconnected = false;
  for (let i = 0; i < 30; i++) {
    await delay(1000);
    const cBanner = await clientCdp.evaluate(`!!document.querySelector('.reconnecting-banner')`);
    const hBanner = await hostCdp.evaluate(`!!document.querySelector('.reconnecting-banner')`);
    if (!cBanner && !hBanner) {
      reconnected = true;
      console.log(`Auto-reconnected successfully after ${i + 1}s!`);
      break;
    }
  }
  assert(reconnected, "Failed to auto-reconnect WebRTC within 30s!");

  console.log("=== STEP 6: Post-Reconnect Move 3 Execution (Checking Input Lockout) ===");
  // White plays Bc4 (61 -> 34)
  console.log("White attempting Move 3: Bc4 (61 -> 34)...");
  await whiteCdp.tapSquare(61);
  await delay(400);

  // Check square selection
  const selectedSquare = await whiteCdp.evaluate(`
    (function() {
      const s = document.querySelector('.square--selected, [aria-label*="selected"]');
      return s ? s.getAttribute('data-square') : null;
    })()
  `);
  console.log("White selected square:", selectedSquare);
  assert.equal(selectedSquare, "61", "Square 61 was not selected after reconnect! (Input lockout detected)");

  await whiteCdp.tapSquare(34);
  await delay(1500);
  await whiteCdp.assertPiece(34, "White bishop");
  await blackCdp.assertPiece(34, "White bishop");
  console.log("Move 3 (Bc4) executed and synced successfully on both devices!");

  // Black plays Nc6 (1 -> 18)
  console.log("Black playing Move 4: Nc6 (1 -> 18)...");
  await blackCdp.tapSquare(1);
  await delay(400);
  await blackCdp.tapSquare(18);
  await delay(1500);
  await whiteCdp.assertPiece(18, "Black knight");
  await blackCdp.assertPiece(18, "Black knight");
  console.log("Move 4 (Nc6) executed and synced successfully on both devices!");

  console.log("==========================================");
  console.log("qa_peerjs_reconnect_deep PASSED ALL AUDIT CHECKS!");
  console.log("==========================================");
  process.exit(0);
}

run().catch(err => {
  console.error("qa_peerjs_reconnect_deep FAILED:", err);
  process.exit(1);
});
