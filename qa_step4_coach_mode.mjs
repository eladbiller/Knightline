import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

const adbPath = process.env.ADB || 'adb';
const serial = process.env.SERIAL || 'TS55QC9PIRCY4XH6';
const adb = (serial, ...a) => execFileSync(adbPath, ['-s', serial, ...a], {encoding: 'utf8'}).trim();
const delay = ms => new Promise(r => setTimeout(r, ms));

class CDP {
  pending = new Map(); id = 0;
  constructor(serial) { this.serial = serial; }
  async open(url) {
    this.ws = new WebSocket(url);
    this.ws.addEventListener('message', ({data}) => {
      const msg = JSON.parse(data);
      if (msg.method === 'Runtime.consoleAPICalled') {
        console.log('[WEBVIEW CONSOLE]', msg.params.args?.map(a => a.value || a.description).join(' '));
      }
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
    await this.call('Runtime.enable', {});
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
  async waitForSelector(selector, timeoutMs = 15000) {
    let retries = Math.floor(timeoutMs / 500);
    while (retries > 0) {
      const exists = await this.evaluate(`!!document.querySelector('${selector}')`);
      if (exists) return;
      await delay(500);
      retries--;
    }
    throw new Error(`Timeout waiting for selector: ${selector}`);
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
    throw new Error(`Could not find and click selector: ` + selector);
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
    assert(text && text.includes(pieceName), `Expected ${pieceName} at square ${index}, got: "${text}"`);
  }
}

async function connectToDevice(serial, port) {
  adb(serial, 'shell', 'pm', 'clear', 'com.eladbiller.knightline');
  adb(serial, 'shell', 'monkey', '-p', 'com.eladbiller.knightline', '-c', 'android.intent.category.LAUNCHER', '1');
  await delay(3000);
  const pid = adb(serial, 'shell', 'pidof', 'com.eladbiller.knightline');
  adb(serial, 'forward', `tcp:${port}`, `localabstract:webview_devtools_remote_${pid}`);
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = targets.find(t => t.type === 'page' && t.url.includes('ui/index.html')) || targets.find(t => t.type === 'page');
  const cdp = new CDP(serial);
  await cdp.open(page.webSocketDebuggerUrl);
  return cdp;
}

async function runDevice(serial, port) {
  console.log(`\n=== Testing on device ${serial} ===`);
  const cdp = await connectToDevice(serial, port);
  await delay(1500);

  // Go to Sandbox
  await cdp.clickSelector('[data-action="nav-sandbox"]');
  await cdp.waitForSelector('.sandbox-workspace');
  await delay(1000);

  console.log("Toggling Coach Mode ON...");
  await cdp.evaluate(`window._send('sandbox.toggleCoach', {})`);
  await delay(1000);
  const coachEnabled = await cdp.evaluate(`window._model?.sandbox?.coachEnabled`);
  console.log("Coach Mode is now:", coachEnabled);

  // Play a move: e2-e4 (52 -> 36)
  console.log("Playing e2-e4...");
  await cdp.tapSquare(52);
  await cdp.tapSquare(36);
  
  // Wait for insight to appear
  console.log("Waiting for Live Coach insight...");
  try {
    await cdp.waitForSelector('.review-insight');
    const insightText = await cdp.evaluate(`document.querySelector('.coach-copy')?.textContent`);
    console.log("Coach insight text:", insightText);
    assert(insightText && (insightText.includes('Best') || insightText.includes('Book') || insightText.includes('Excellent') || insightText.includes('Good') || insightText.includes('played') || insightText.includes('book')), "Should receive a positive grade for e4");
  } catch (e) {
    const debugInfo = await cdp.evaluate(`window._model?.sandbox?.coach?.explanation`);
    const evalText = await cdp.evaluate(`window._model?.sandbox?.coach?.evaluation`);
    console.log("TIMEOUT! Debug info:", debugInfo, "Eval text:", evalText);
    throw e;
  }

  // Play another move for black: a7-a6 (8 -> 16)
  console.log("Playing a7-a6...");
  await cdp.tapSquare(8);
  await cdp.tapSquare(16);
  await delay(3000);
  const insight2 = await cdp.evaluate(`document.querySelector('.coach-copy')?.textContent`);
  console.log("Coach insight 2:", insight2);
  
  // Check that the engine does not freeze on checkmate
  console.log("Testing Checkmate freeze safety...");
  // Load Fool's Mate FEN
  await cdp.clickSelector('[data-sandbox-action="fen"]');
  await delay(500);
  await cdp.evaluate(`document.getElementById('sandbox-fen-input').value = 'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3';`);
  await cdp.clickSelector('[data-sandbox-load-fen]');
  await delay(1500);
  
  // Turn ON Eval Mode
  await cdp.clickSelector('[data-sandbox-action="eval"]');
  await delay(1500);
  const evalText = await cdp.evaluate(`document.querySelector('.best-move-chip')?.textContent`);
  console.log("Evaluation after checkmate:", evalText);
  assert(evalText && evalText.includes('Checkmate'), "Engine must report Checkmate and not freeze.");
}

async function runAll() {
  console.log("=== Step 4 Coach Mode Verification Suite ===");
  const devices = [
    { serial: '10ACAD2F63001KS', port: 9225 },
    { serial: 'TS55QC9PIRCY4XH6', port: 9226 }
  ];
  for (const d of devices) {
    await runDevice(d.serial, d.port);
  }
  console.log("\nALL TESTS PASSED ON ALL DEVICES!");
  process.exit(0);
}

runAll().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
