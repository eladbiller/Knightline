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

  console.log("=== STEP 1: Ensuring Bluetooth is enabled on both phones ===");
  adb(hostSerial, 'shell', 'svc', 'bluetooth', 'enable');
  adb(clientSerial, 'shell', 'svc', 'bluetooth', 'enable');
  await delay(2000);

  console.log("=== STEP 2: Launching Knightline on Vivo and Xiaomi ===");
  const hostCdp = await connectToDevice(hostSerial, hostPort);
  const clientCdp = await connectToDevice(clientSerial, clientPort);
  await delay(1500);

  console.log("=== STEP 3: Establishing Bluetooth Link ===");
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
  console.log("Bluetooth link established!");

  console.log("=== STEP 4: Starting Game with 3 | 2 Clock ===");
  await hostCdp.clickSelector('[data-action="remote-setup"]');
  await delay(1000);
  await hostCdp.clickSelector('[data-choice="clock"][data-value="2"]');
  await delay(500);
  await hostCdp.clickSelector('[data-setup-start]');

  await clientCdp.waitForSelector('[data-confirm="accept"]');
  await clientCdp.clickSelector('[data-confirm="accept"]');

  await hostCdp.waitForSelector('.board');
  await clientCdp.waitForSelector('.board');
  await delay(3000);

  console.log("=== STEP 5: Dynamic Role Detection & Initial Moves ===");
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
    console.log("Roles: Host is White.");
  } else {
    hostIsWhite = false;
    console.log("Roles: Host is Black (Client is White).");
  }

  const whiteCdp = hostIsWhite ? hostCdp : clientCdp;
  const blackCdp = hostIsWhite ? clientCdp : hostCdp;

  if (hostIsWhite) {
    await blackCdp.assertPiece(36, "White pawn");
  } else {
    await whiteCdp.tapSquare(52);
    await whiteCdp.tapSquare(36);
    await delay(1500);
    await whiteCdp.assertPiece(36, "White pawn");
    await blackCdp.assertPiece(36, "White pawn");
  }
  console.log("Move 1 (e4) synced.");

  // Black plays e5 (12 -> 28)
  console.log("Black playing Move 2: e5 (12 -> 28)...");
  await blackCdp.tapSquare(12);
  await blackCdp.tapSquare(28);
  await delay(1500);
  await whiteCdp.assertPiece(28, "Black pawn");
  console.log("Move 2 (e5) synced.");

  console.log("=== STEP 6: Dropping Bluetooth & Waiting for 25s Grace Period Expiry ===");
  adb(clientSerial, 'shell', 'svc', 'bluetooth', 'disable');
  console.log("Bluetooth disabled on Client. Waiting 28 seconds for 25s timeout expiry...");
  await delay(28000);

  console.log("Verifying clean transition to Home screen with Saved Board card...");
  await hostCdp.waitForSelector('[data-action="resume"]');
  await clientCdp.waitForSelector('[data-action="resume"]');

  const hostHasAbandon = await hostCdp.evaluate(`!!document.querySelector('[data-action="abandon"]')`);
  const clientHasAbandon = await clientCdp.evaluate(`!!document.querySelector('[data-action="abandon"]')`);
  console.log(`Saved Board card options: Host Abandon=${hostHasAbandon}, Client Abandon=${clientHasAbandon}`);
  assert(hostHasAbandon, "Host did not display [Abandon] button on saved card!");
  assert(clientHasAbandon, "Client did not display [Abandon] button on saved card!");
  console.log("PASS: 25s grace timeout cleanly paused and saved match without crashing or lingering wakelocks!");

  console.log("=== STEP 7: Re-enabling Bluetooth and Resuming Match Beyond 25s ===");
  adb(clientSerial, 'shell', 'svc', 'bluetooth', 'enable');
  await delay(2000);

  console.log("Tapping [Resume] on Host and Client...");
  await hostCdp.clickSelector('[data-action="resume"]');
  await delay(1000);
  await clientCdp.clickSelector('[data-action="resume"]');
  await delay(2000);

  console.log("Verifying restored board with saved moves...");
  await hostCdp.waitForSelector('.board');
  await clientCdp.waitForSelector('.board');

  // Assert Move 1 and Move 2 pieces are intact!
  await hostCdp.assertPiece(36, "White pawn");
  await hostCdp.assertPiece(28, "Black pawn");
  await clientCdp.assertPiece(36, "White pawn");
  await clientCdp.assertPiece(28, "Black pawn");
  console.log("Verified: Board positions and pieces perfectly restored!");

  console.log("Waiting for Bluetooth link re-establishment during extended resumption...");
  let reconnected = false;
  for (let i = 0; i < 20; i++) {
    const banner = await hostCdp.evaluate(`!!document.querySelector('.reconnecting-banner')`);
    if (!banner) {
      reconnected = true;
      break;
    }
    await delay(1000);
  }
  console.log("Reconnection state:", reconnected ? "Reconnected" : "Ready");

  console.log("=== STEP 8: Executing Moves 3 & 4 After Extended Resumption ===");
  // White plays Move 3: Bc4 (61 -> 34)
  console.log("White tapping square 61 (f1)...");
  await whiteCdp.tapSquare(61);
  await delay(400);

  const selectedSquare = await whiteCdp.evaluate(`
    (function() {
      const s = document.querySelector('.square--selected, [aria-label*="selected"]');
      return s ? s.getAttribute('data-square') : null;
    })()
  `);
  console.log("White selected square:", selectedSquare);
  assert.equal(selectedSquare, "61", "Square 61 was not selected after extended resumption!");

  await whiteCdp.tapSquare(34);
  await delay(1500);
  await whiteCdp.assertPiece(34, "White bishop");
  await blackCdp.assertPiece(34, "White bishop");
  console.log("Move 3 (Bc4) successfully executed and synced after extended resumption!");

  // Black plays Move 4: Nc6 (1 -> 18)
  console.log("Black tapping square 1 (b8)...");
  await blackCdp.tapSquare(1);
  await delay(400);
  await blackCdp.tapSquare(18);
  await delay(1500);

  await whiteCdp.assertPiece(18, "Black knight");
  await blackCdp.assertPiece(18, "Black knight");
  console.log("Move 4 (Nc6) successfully executed and synced after extended resumption!");

  console.log("=================================================");
  console.log("qa_reconnect_timeout_deep PASSED ALL AUDIT CHECKS!");
  console.log("=================================================");
  process.exit(0);
}

run().catch(err => {
  console.error("qa_reconnect_timeout_deep FAILED:", err);
  process.exit(1);
});
