import { execFileSync, spawn } from 'node:child_process';
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
    let retries = 15;
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
  adb(serial, 'shell', 'pm', 'grant', 'com.eladbiller.knightline', 'android.permission.BLUETOOTH_CONNECT');
  adb(serial, 'shell', 'pm', 'grant', 'com.eladbiller.knightline', 'android.permission.BLUETOOTH_SCAN');
  adb(serial, 'shell', 'pm', 'grant', 'com.eladbiller.knightline', 'android.permission.BLUETOOTH_ADVERTISE');
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
  const hostSerial = '10ACAD2F63001KS';
  const clientSerial = 'TS55QC9PIRCY4XH6';
  const hostPort = 9223;
  const clientPort = 9224;

  console.log("=== STEP 1: Ensuring Bluetooth is enabled on both devices ===");
  adb(hostSerial, 'shell', 'svc', 'bluetooth', 'enable');
  adb(clientSerial, 'shell', 'svc', 'bluetooth', 'enable');
  await delay(2000);

  console.log("=== STEP 2: Launching Knightline on Vivo and Xiaomi ===");
  const hostCdp = await connectToDevice(hostSerial, hostPort);
  const clientCdp = await connectToDevice(clientSerial, clientPort);
  await delay(1500);

  console.log("=== STEP 3: Navigating to Bluetooth Menu & Connecting ===");
  await hostCdp.clickSelector('[data-action="transport-menu"]');
  await clientCdp.clickSelector('[data-action="transport-menu"]');
  await delay(500);

  await hostCdp.clickSelector('[data-transport="host"]');
  await delay(2000);

  await clientCdp.clickSelector('[data-transport="join"]');
  console.log("Client scanning for nearby host...");

  let deviceFound = false;
  for (let i = 0; i < 20; i++) {
    const devices = await clientCdp.evaluate(`
      Array.from(document.querySelectorAll('[data-device-index]')).map(el => el.textContent)
    `);
    console.log(`[Client] Discovered devices:`, devices);
    const targetIdx = devices.findIndex(d => d.includes('vivo Y22s') || d.includes('V2206'));
    if (targetIdx !== -1) {
      console.log("Found vivo Y22s! Clicking it...");
      await clientCdp.evaluate(`document.querySelectorAll('[data-device-index]')[${targetIdx}].click()`);
      deviceFound = true;
      break;
    }
    await delay(1000);
  }
  assert(deviceFound, "Failed to find Host Bluetooth device during scan!");

  console.log("Waiting for Bluetooth link establishment...");
  await hostCdp.waitForSelector('[data-action="remote-setup"]');
  console.log("Bluetooth RFCOMM link established!");

  console.log("=== STEP 4: Starting Game with Clock Preset ===");
  await hostCdp.clickSelector('[data-action="remote-setup"]');
  await delay(1000);
  // Pick 3 | 2 clock preset (value 2)
  await hostCdp.clickSelector('[data-choice="clock"][data-value="2"]');
  await delay(500);
  await hostCdp.clickSelector('[data-setup-start]');

  console.log("Waiting for Client invitation confirmation...");
  await clientCdp.waitForSelector('[data-confirm="accept"]');
  await clientCdp.clickSelector('[data-confirm="accept"]');

  console.log("Waiting for game boards...");
  await hostCdp.waitForSelector('.board');
  await clientCdp.waitForSelector('.board');
  await delay(3000);

  console.log("=== STEP 5: MANDATE 4 - Dynamic White/Black Detection ===");
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

  // Move 2: Black plays e5 (12 -> 28)
  console.log("Black playing Move 2: e5 (12 -> 28)...");
  await blackCdp.tapSquare(12);
  await blackCdp.tapSquare(28);
  await delay(1500);
  await whiteCdp.assertPiece(28, "Black pawn");
  console.log("Move 2 (e5) verified on White screen.");

  console.log("=== STEP 6: MANDATE 2 - Genuine Physical RFCOMM Drop Test ===");
  console.log("Executing 'svc bluetooth disable' on Client...");
  adb(clientSerial, 'shell', 'svc', 'bluetooth', 'disable');
  await delay(2500);

  console.log("Verifying reconnecting banner on Host...");
  const bannerOnHost = await hostCdp.evaluate(`
    (function() {
      const b = document.querySelector('.reconnecting-banner');
      return b ? b.textContent : null;
    })()
  `);
  console.log("Host banner:", bannerOnHost);
  assert(bannerOnHost && bannerOnHost.includes("Reconnecting"), "Host did not show reconnecting banner after RFCOMM drop!");

  console.log("=== STEP 7: Re-enabling Bluetooth & Verifying Auto-Reconnect ===");
  adb(clientSerial, 'shell', 'svc', 'bluetooth', 'enable');
  console.log("Bluetooth re-enabled. Waiting for auto-reconnect...");

  let reconnected = false;
  for (let i = 0; i < 20; i++) {
    const banner = await hostCdp.evaluate(`!!document.querySelector('.reconnecting-banner')`);
    if (!banner) {
      reconnected = true;
      break;
    }
    await delay(1000);
  }
  assert(reconnected, "Failed to auto-reconnect RFCOMM link within timeout!");
  console.log("Auto-reconnection succeeded! Reconnecting banner cleared.");

  console.log("=== STEP 8: MANDATE 3 - Board Input Lockout & Square Selection Verification ===");
  // White attempts Move 3: Bc4 (61 -> 34)
  console.log("White tapping square 61 (f1)...");
  await whiteCdp.tapSquare(61);
  await delay(400);

  // Check that square 61 was selected and NOT blocked by awaiting/interaction flags
  const selectedSquare = await whiteCdp.evaluate(`
    (function() {
      const s = document.querySelector('.square--selected, [aria-label*="selected"]');
      return s ? s.getAttribute('data-square') : null;
    })()
  `);
  console.log("Square selected by White:", selectedSquare);
  assert.equal(selectedSquare, "61", "CRITICAL BUG: Square 61 was not selected! Input is locked out after reconnect.");

  console.log("White tapping destination square 34 (c4)...");
  await whiteCdp.tapSquare(34);
  await delay(1500);

  await whiteCdp.assertPiece(34, "White bishop");
  await blackCdp.assertPiece(34, "White bishop");
  console.log("Move 3 (Bc4) successfully completed and synced across physical phones!");

  // Move 4: Black plays Nc6 (1 -> 18)
  console.log("Black tapping square 1 (b8)...");
  await blackCdp.tapSquare(1);
  await delay(400);
  await blackCdp.tapSquare(18);
  await delay(1500);

  await whiteCdp.assertPiece(18, "Black knight");
  await blackCdp.assertPiece(18, "Black knight");
  console.log("Move 4 (Nc6) successfully completed and synced across physical phones!");

  console.log("=================================================");
  console.log("qa_bluetooth_reconnect_deep PASSED ALL AUDIT CHECKS!");
  console.log("=================================================");
  process.exit(0);
}

run().catch(err => {
  console.error("qa_bluetooth_reconnect_deep FAILED:", err);
  process.exit(1);
});
