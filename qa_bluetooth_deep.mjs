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
      this.pending.set(id, {resolve, reject, timeout: setTimeout(() => reject(new Error('timeout')), 5000)});
      this.ws.send(JSON.stringify({id, method, params}));
    });
  }
  async evaluate(expression) {
    const response = await this.call('Runtime.evaluate', {expression, returnByValue: true, awaitPromise: true});
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
    return response.result.value;
  }
  async waitForSelector(selector) {
    let retries = 30;
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
    await delay(400);
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
  const page = targets.find(t => t.type === 'page');
  const cdp = new CDP(serial);
  await cdp.open(page.webSocketDebuggerUrl);
  return cdp;
}

async function run() {
  const hostCdp = await connectToDevice('10ACAD2F63001KS', 9223);
  const clientCdp = await connectToDevice('TS55QC9PIRCY4XH6', 9224);
  
  await delay(1000);
  console.log("Navigating menus...");
  await hostCdp.clickSelector('[data-action="transport-menu"]');
  await clientCdp.clickSelector('[data-action="transport-menu"]');
  await hostCdp.clickSelector('[data-transport="host"]');
  await delay(2000);
  await clientCdp.clickSelector('[data-transport="join"]');
  console.log("Client scanning for host...");
  
  // Wait up to 15 seconds for a device to appear
  let deviceFound = false;
  for (let i = 0; i < 15; i++) {
    const devices = await clientCdp.evaluate(`
      Array.from(document.querySelectorAll('[data-device-index]')).map(el => el.textContent)
    `);
    console.log(`[Client] Discovered devices:`, devices);
      const targetIdx = devices.findIndex(d => d.includes('vivo Y22s'));
      if (targetIdx !== -1) {
        console.log("Found vivo Y22s. Clicking it...");
        await clientCdp.evaluate(`document.querySelectorAll('[data-device-index]')[${targetIdx}].click()`);
        deviceFound = true;
        break;
      }
    await delay(1000);
  }
  
  if (!deviceFound) throw new Error("Could not find any Bluetooth devices to pair with.");
  
  console.log("Waiting for connection...");
  await hostCdp.waitForSelector('[data-action="remote-setup"]');
  
  console.log("Connected! Host starting game...");
  await hostCdp.clickSelector('[data-action="remote-setup"]');
  await delay(1000);
  await hostCdp.clickSelector('[data-setup-start]');
  
  console.log("Client accepting game invitation...");
  await clientCdp.waitForSelector('[data-confirm="accept"]');
  await clientCdp.clickSelector('[data-confirm="accept"]');
  
  console.log("Waiting for game to load...");
  await hostCdp.waitForSelector('.board');
  await clientCdp.waitForSelector('.board');
  await delay(5000); // Wait for board pieces to fully render
  
  console.log("Testing role assignment by attempting a move...");
  let hostIsWhite = false;
  await hostCdp.tapSquare(52); // e2
  await hostCdp.tapSquare(36); // e4
  await delay(1500);
  
  const hostE4 = await hostCdp.evaluate(`
    (function() {
      const el = document.querySelector('[data-square="36"]');
      return el ? el.getAttribute('aria-label') : '';
    })()
  `);
  
  if (hostE4 && hostE4.includes('White pawn')) {
    hostIsWhite = true;
    console.log("Roles assigned: Host is White (local move succeeded).");
  } else {
    hostIsWhite = false;
    console.log("Roles assigned: Host is Black (local move ignored).");
  }
  
  const whiteCdp = hostIsWhite ? hostCdp : clientCdp;
  const blackCdp = hostIsWhite ? clientCdp : hostCdp;
  
  if (hostIsWhite) {
    // Move 1 was already done by host. Just verify client received it.
    await blackCdp.assertPiece(36, "White pawn");
    console.log("Move 1 synced.");
  } else {
    // Host is black, so client is white. Client must do move 1.
    await whiteCdp.tapSquare(52);
    await whiteCdp.tapSquare(36);
    await delay(1500);
    await whiteCdp.assertPiece(36, "White pawn");
    console.log("White move rendered locally.");
    await blackCdp.assertPiece(36, "White pawn");
    console.log("Move 1 synced.");
  }
  
  // Black: e7-e5 (12 -> 28)
  await blackCdp.tapSquare(12);
  await blackCdp.tapSquare(28);
  await delay(1500);
  // Verify white received e5
  await whiteCdp.assertPiece(28, "Black pawn");
  console.log("Move 2 synced.");
  
  console.log("Testing takeback disabled...");
  // White tries to takeback (button should be disabled)
  const canTakeback = await whiteCdp.evaluate(`
    (function() {
      const tb = document.querySelector('[data-action="takeback"]');
      return (tb && !tb.disabled);
    })()
  `);
  assert(canTakeback, "Takeback button should be enabled in Bluetooth mode via bilateral handshake");
  console.log("Takeback button correctly enabled for bilateral handshake.");
  
  // Finish Scholar's Mate
  console.log("Executing Scholar's Mate...");
  // Bc4 (61 -> 34)
  await whiteCdp.tapSquare(61); await whiteCdp.tapSquare(34); await delay(1500);
  // Nc6 (1 -> 18)
  await blackCdp.tapSquare(1); await blackCdp.tapSquare(18); await delay(1500);
  // Qh5 (59 -> 31)
  await whiteCdp.tapSquare(59); await whiteCdp.tapSquare(31); await delay(1500);
  // Nf6 (6 -> 21)
  await blackCdp.tapSquare(6); await blackCdp.tapSquare(21); await delay(1500);
  
  // Qxf7# (31 -> 13)
  await whiteCdp.tapSquare(31); await whiteCdp.tapSquare(13); await delay(2500);
  
  // Verify checkmate state on both
  const hostCheckmate = await hostCdp.evaluate(`document.body.innerHTML.includes('Game complete')`);
  const clientCheckmate = await clientCdp.evaluate(`document.body.innerHTML.includes('Game complete')`);
  
  assert(hostCheckmate, "Host did not show Game complete");
  assert(clientCheckmate, "Client did not show Game complete");
  
  console.log("Scholar's Mate verified successfully on both screens via real Bluetooth.");
  
  process.exit(0);
}
run().catch(err => {
  console.error(err);
  process.exit(1);
});
