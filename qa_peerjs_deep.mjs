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
  async typeInput(selector, text) {
    await this.evaluate(`document.querySelector('${selector}').value = '${text}'; document.querySelector('${selector}').dispatchEvent(new Event('input', { bubbles: true }));`);
  }
  async tapSquare(index) {
    await this.clickSelector(`[data-square="${index}"]`);
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
  const hostSerial = process.env.HOST_SERIAL || '10ACAD2F63001KS';
  const clientSerial = process.env.CLIENT_SERIAL || 'R9WR40475QJ';
  const hostPort = process.env.HOST_PORT ? parseInt(process.env.HOST_PORT) : 9225;
  const clientPort = process.env.CLIENT_PORT ? parseInt(process.env.CLIENT_PORT) : 9227;
  const hostCdp = await connectToDevice(hostSerial, hostPort);
  const clientCdp = await connectToDevice(clientSerial, clientPort);
  
  await delay(1000);
  console.log("Starting PeerJS Online Room test...");
  
  // Navigate to Online menu on both
  await hostCdp.clickSelector('[data-action="nav-play"]');
  await clientCdp.clickSelector('[data-action="nav-play"]');
  await delay(1000);
  
  await hostCdp.clickSelector('[data-action="online-menu"]');
  await clientCdp.clickSelector('[data-action="online-menu"]');
  await delay(1000);
  
  const roomCode = "PJS" + Math.random().toString(36).substring(2, 7).toUpperCase();
  console.log(`Using online room code: ${roomCode}`);
  
  // Host creates room
  await hostCdp.typeInput('#room-code', roomCode);
  await hostCdp.clickSelector('[data-online="host"]');
  await delay(2500);

  // Client switches to join tab and joins room
  await clientCdp.clickSelector('[data-online-tab="join"]');
  await delay(600);
  await clientCdp.typeInput('#room-code', roomCode);
  await clientCdp.clickSelector('[data-online="join"]');
  
  console.log("Waiting for WebRTC connection...");
  // Wait for the remote-setup button to appear on host (indicates connected)
  await hostCdp.waitForSelector('[data-action="remote-setup"]');
  
  console.log("Connected! Host starting game...");
  await hostCdp.clickSelector('[data-action="remote-setup"]');
  await delay(1000);
  await hostCdp.clickSelector('[data-setup-start]');
  
  console.log("Client accepting game invitation...");
  await clientCdp.waitForSelector('[data-confirm="accept"]');
  await clientCdp.clickSelector('[data-confirm="accept"]');
  
  console.log("Waiting for game board...");
  await hostCdp.waitForSelector('.board');
  await clientCdp.waitForSelector('.board');
  await delay(2000);
  
  console.log("Testing role assignment by attempting move 1 on Host...");
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
    console.log("Roles assigned: Host is White (local move succeeded).");
  } else {
    hostIsWhite = false;
    console.log("Roles assigned: Host is Black (local move ignored).");
  }

  const whiteCdp = hostIsWhite ? hostCdp : clientCdp;
  const blackCdp = hostIsWhite ? clientCdp : hostCdp;

  if (hostIsWhite) {
    await blackCdp.assertPiece(36, "White pawn");
    console.log("Move 1 synced.");
  } else {
    await whiteCdp.tapSquare(52);
    await whiteCdp.tapSquare(36);
    await delay(1500);
    await whiteCdp.assertPiece(36, "White pawn");
    await blackCdp.assertPiece(36, "White pawn");
    console.log("Move 1 synced.");
  }

  // Black: e7-e5 (12 -> 28)
  await blackCdp.tapSquare(12);
  await blackCdp.tapSquare(28);
  await delay(1500);
  await whiteCdp.assertPiece(28, "Black pawn");
  console.log("Move 2 synced.");

  console.log("Deep PeerJS Test PASSED.");
  process.exit(0);
}
run().catch(err => {
  console.error("PeerJS Test Failed:", err);
  process.exit(1);
});
