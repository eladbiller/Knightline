import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

const adbPath = process.env.ADB || 'adb';
const serial = '10ACAD2F63001KS';
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
  const cdp = await connectToDevice(serial, 9225);
  await delay(1000);
  
  console.log("Navigating to Bot Setup...");
  await cdp.clickSelector('[data-action="nav-play"]');
  await delay(1000);
  
  const buttons = await cdp.evaluate(`
    Array.from(document.querySelectorAll('button, a, div')).map(el => ({
      text: el.textContent,
      action: el.getAttribute('data-action')
    })).filter(o => o.action || o.text.includes('Pass'))
  `);
  console.log('Available actions in Play Menu:', buttons);

  console.log("Clicking setup-bot");
  await cdp.clickSelector('[data-action="setup-bot"]');
  await delay(1000);
  
  const setupButtons = await cdp.evaluate(`
    Array.from(document.querySelectorAll('button, a, div')).map(el => ({
      text: el.textContent,
      action: el.getAttribute('data-action'),
      setup: el.getAttribute('data-setup-start') !== null
    })).filter(o => o.action || o.setup)
  `);
  console.log('Available actions in Bot Setup Menu:', setupButtons);

  // Click start game
  await cdp.clickSelector('[data-setup-start]');
  
  console.log("Waiting for game board...");
  await cdp.waitForSelector('.board');
  await delay(2000);
  
  console.log("Testing bot gameplay logic...");
  
  // Dynamically detect assigned player color
  const playerColor = await cdp.evaluate(`
    (function() {
      const cards = Array.from(document.querySelectorAll('.player-card'));
      for (const card of cards) {
        if (!card.textContent.includes('Stockfish') && !card.querySelector('.avatar--bot')) {
          const meta = card.querySelector('.player-meta');
          if (meta && meta.textContent.includes('White')) return 'White';
          if (meta && meta.textContent.includes('Black')) return 'Black';
        }
      }
      return document.body.innerHTML.includes('You · White') ? 'White' : 'Black';
    })()
  `);
  console.log("Human player assigned color:", playerColor);
  const isWhite = playerColor === 'White';

  if (isWhite) {
    // Human is White: play e2-e4 (52 -> 36)
    console.log("Human playing e2-e4...");
    await cdp.tapSquare(52);
    await cdp.tapSquare(36);
    await delay(1000);
    await cdp.assertPiece(36, "White pawn");
    console.log("White move registered. Waiting for bot reply...");

    // Poll for bot move
    let botMoved = false;
    for (let i = 0; i < 20; i++) {
      await delay(1000);
      botMoved = await cdp.evaluate(`
        (function() {
          const b = Array.from(document.querySelectorAll('[data-square]'));
          return b.some(s => {
            const sq = Number(s.getAttribute('data-square'));
            const label = s.getAttribute('aria-label') || '';
            return sq >= 16 && sq <= 47 && label.includes('Black');
          });
        })()
      `);
      if (botMoved) { console.log("Bot replied!"); break; }
    }
    assert(botMoved, "Stockfish did not make a reply move within 20s");

    // Test Takeback
    console.log("Testing takeback...");
    const canTakeback = await cdp.evaluate(`
      (function() {
        const tb = document.querySelector('[data-action="takeback"]');
        return !!(tb && !tb.disabled);
      })()
    `);
    assert(canTakeback, "Takeback button must be enabled after playing a move");

    await cdp.clickSelector('[data-action="takeback"]');
    await delay(1000);
    // Click confirm if sheet appears
    await cdp.evaluate(`
      (function() {
        const confirmBtn = document.querySelector('[data-confirm="accept"]');
        if (confirmBtn) confirmBtn.click();
      })()
    `);
    await delay(1500);

    // Verify e4 reverted to empty
    const reverted = await cdp.evaluate(`
      (function() {
        const s = document.querySelector('[data-square="36"]');
        return !s || !s.getAttribute('aria-label') || s.getAttribute('aria-label').includes('empty');
      })()
    `);
    assert(reverted, "Takeback failed: square e4 still contains a piece");
    console.log("Takeback verified: move was reverted.");

  } else {
    // Human is Black: wait for Stockfish to open
    console.log("Waiting for Stockfish opening move as White...");
    let whiteMoved = false;
    for (let i = 0; i < 20; i++) {
      await delay(1000);
      whiteMoved = await cdp.evaluate(`
        (function() {
          const b = Array.from(document.querySelectorAll('[data-square]'));
          return b.some(s => {
            const sq = Number(s.getAttribute('data-square'));
            const label = s.getAttribute('aria-label') || '';
            return sq >= 16 && sq <= 47 && label.includes('White');
          });
        })()
      `);
      if (whiteMoved) { console.log("Stockfish opened!"); break; }
    }
    assert(whiteMoved, "Stockfish did not make an opening move within 20s");

    // Human plays e7-e5 (12 -> 28)
    console.log("Human playing e7-e5...");
    await cdp.tapSquare(12);
    await cdp.tapSquare(28);
    await delay(1000);
    await cdp.assertPiece(28, "Black pawn");
    console.log("Black move registered. Waiting for bot reply...");

    await delay(2500);

    // Test Takeback
    console.log("Testing takeback...");
    const canTakeback = await cdp.evaluate(`
      (function() {
        const tb = document.querySelector('[data-action="takeback"]');
        return !!(tb && !tb.disabled);
      })()
    `);
    assert(canTakeback, "Takeback button must be enabled after playing a move");

    await cdp.clickSelector('[data-action="takeback"]');
    await delay(1000);
    await cdp.evaluate(`
      (function() {
        const confirmBtn = document.querySelector('[data-confirm="accept"]');
        if (confirmBtn) confirmBtn.click();
      })()
    `);
    await delay(1500);

    const reverted = await cdp.evaluate(`
      (function() {
        const s = document.querySelector('[data-square="28"]');
        return !s || !s.getAttribute('aria-label') || s.getAttribute('aria-label').includes('empty');
      })()
    `);
    assert(reverted, "Takeback failed: square e5 still contains a piece");
    console.log("Takeback verified: move was reverted.");
  }
  
  console.log("Offline Bot Test Finished Successfully.");
  process.exit(0);
}
run().catch(err => {
  console.error("Bot Test Failed:", err);
  process.exit(1);
});
