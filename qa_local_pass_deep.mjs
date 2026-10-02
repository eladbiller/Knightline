import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

const adbPath = process.env.ADB || 'adb';
const serial = 'TS55QC9PIRCY4XH6';
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
  const cdp = await connectToDevice(serial, 9226);
  await delay(1000);
  
  console.log("Navigating to Pass & Play Setup...");
  await cdp.clickSelector('[data-action="nav-play"]');
  await delay(1000);
  
  await cdp.clickSelector('[data-action="setup-pass"]');
  await delay(1000);
  
  // Click start game
  await cdp.clickSelector('[data-setup-start]');
  
  console.log("Waiting for game board...");
  await cdp.waitForSelector('.board');
  await delay(2000);
  
  console.log("Testing pass & play logic...");
  
  // White: e2-e4 (52 -> 36)
  await cdp.tapSquare(52);
  await cdp.tapSquare(36);
  await delay(1000);
  await cdp.assertPiece(36, "White pawn");
  console.log("White moved.");

  // Black: e7-e5 (12 -> 28)
  await cdp.tapSquare(12);
  await cdp.tapSquare(28);
  await delay(1000);
  await cdp.assertPiece(28, "Black pawn");
  console.log("Black moved.");
  
  // Takeback should work in local pass and play
  const canTakeback = await cdp.evaluate(`
    (function() {
      const tb = document.querySelector('[data-action="takeback"]');
      if (tb && !tb.disabled) { tb.click(); return true; }
      return false;
    })()
  `);
  console.log("Takeback clicked:", canTakeback);
  assert(canTakeback, "Takeback button should be enabled in Pass & Play mode");
  await delay(1000);
  
  // Click the web-based confirm dialog
  await cdp.waitForSelector('[data-confirm="accept"]');
  await cdp.clickSelector('[data-confirm="accept"]');
  await delay(1000);

  // Black pawn should no longer be at e5
  const isE5Empty = await cdp.evaluate(`
    (function() {
      const el = document.querySelector('[data-square="28"]');
      return el && el.getAttribute('aria-label') && el.getAttribute('aria-label').includes('empty');
    })()
  `);
  console.log("Takeback successful (e5 is empty):", isE5Empty);
  assert(isE5Empty, "Square 28 (e5) should be empty after takeback");

  console.log("Offline Pass & Play Test Finished.");
  process.exit(0);
}
run().catch(err => {
  console.error(err);
  process.exit(1);
});
