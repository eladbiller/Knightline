import { execSync } from 'child_process';

const SERIAL_HOST = '10ACAD2F63001KS';
const SERIAL_CLIENT = 'R9WR40475QJ';
const PORT_HOST = 9225;
const PORT_CLIENT = 9227;

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function adb(serial, ...args) {
  return execSync(`adb -s ${serial} ${args.join(' ')}`, { encoding: 'utf8' }).trim();
}

function assert(condition, message) {
  if (!condition) {
    console.error("Assertion Failed:", message);
    throw new Error(message);
  }
}

class CDP {
  constructor(serial) {
    this.serial = serial;
    this.pending = new Map();
    this.id = 0;
  }
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
      this.pending.set(id, {resolve, reject, timeout: setTimeout(() => reject(new Error('timeout')), 15000)});
      this.ws.send(JSON.stringify({id, method, params}));
    });
  }
  async evaluate(expression) {
    const response = await this.call('Runtime.evaluate', {expression, returnByValue: true, awaitPromise: true});
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
    return response.result.value;
  }
  async waitForSelector(selector, timeoutMs = 25000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const exists = await this.evaluate(`!!document.querySelector('${selector}')`);
      if (exists) return;
      await delay(500);
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
    await this.evaluate(`
      (function() {
        const el = document.querySelector('${selector}');
        if (!el) throw new Error('Input not found: ${selector}');
        el.value = '${text}';
        el.dispatchEvent(new Event('input', { bubbles: true }));
      })()
    `);
  }
  async tapSquare(index) {
    await this.clickSelector(`[data-square="${index}"]`);
    await delay(400);
  }
  async assertPiece(index, pieceName, timeoutMs = 12000) {
    const start = Date.now();
    let text = '';
    while (Date.now() - start < timeoutMs) {
      text = await this.evaluate(`
        (function() {
          const el = document.querySelector('[data-square="${index}"]');
          return el ? el.getAttribute('aria-label') : null;
        })()
      `);
      if (text && text.includes(pieceName)) return;
      await delay(500);
    }
    assert(false, `[${this.serial}] Expected ${pieceName} at ${index}, got ${text}`);
  }
  async assertSquareEmpty(index, timeoutMs = 12000) {
    const start = Date.now();
    let text = '';
    while (Date.now() - start < timeoutMs) {
      text = await this.evaluate(`
        (function() {
          const el = document.querySelector('[data-square="${index}"]');
          return el ? (el.getAttribute('aria-label') || '') : '';
        })()
      `);
      if (!text || (!text.toLowerCase().includes('pawn') && !text.toLowerCase().includes('piece'))) return;
      await delay(500);
    }
    assert(false, `[${this.serial}] Expected square ${index} to be empty, but got ${text}`);
  }
  close() { this.ws.close(); }
}

async function connectToDevice(serial, port) {
  adb(serial, 'shell', 'pm', 'clear', 'com.eladbiller.knightline');
  adb(serial, 'shell', 'monkey', '-p', 'com.eladbiller.knightline', '-c', 'android.intent.category.LAUNCHER', '1');
  await delay(3500);
  const pid = adb(serial, 'shell', 'pidof', 'com.eladbiller.knightline');
  adb(serial, 'forward', `tcp:${port}`, `localabstract:webview_devtools_remote_${pid}`);
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = targets.find(t => t.type === 'page' && t.url && t.url.includes('ui/index.html')) || targets.find(t => t.type === 'page');
  const cdp = new CDP(serial);
  await cdp.open(page.webSocketDebuggerUrl);
  return cdp;
}

async function run() {
  console.log("Starting Specific Test 4: Online Takeback Handshake over WebRTC...");
  const hostCdp = await connectToDevice(SERIAL_HOST, PORT_HOST);
  const clientCdp = await connectToDevice(SERIAL_CLIENT, PORT_CLIENT);

  await delay(1000);
  console.log("Navigating to Online Room...");
  await hostCdp.clickSelector('[data-action="nav-play"]');
  await clientCdp.clickSelector('[data-action="nav-play"]');
  await delay(1000);

  await hostCdp.clickSelector('[data-action="online-menu"]');
  await clientCdp.clickSelector('[data-action="online-menu"]');
  await delay(1000);

  const roomCode = "TKBACK01";
  console.log(`Connecting room: ${roomCode}`);
  await hostCdp.typeInput('#room-code', roomCode);
  await hostCdp.clickSelector('[data-online="host"]');
  await delay(2500);

  // Client switches to Join tab and joins room
  await clientCdp.clickSelector('[data-online-tab="join"]');
  await delay(500);
  await clientCdp.typeInput('#room-code', roomCode);
  await clientCdp.clickSelector('[data-online="join"]');

  console.log("Waiting for WebRTC handshake...");
  await hostCdp.waitForSelector('[data-action="remote-setup"]');

  console.log("Connected! Starting game...");
  await hostCdp.clickSelector('[data-action="remote-setup"]');
  await delay(1000);
  await hostCdp.clickSelector('[data-setup-start]');

  console.log("Client accepting game invitation...");
  await clientCdp.waitForSelector('[data-confirm="accept"]');
  await clientCdp.clickSelector('[data-confirm="accept"]');

  console.log("Waiting for game board...");
  await hostCdp.waitForSelector('.board');
  await clientCdp.waitForSelector('.board');
  await delay(4000);

  // Determine White / Black definitively via match.yourTurn
  console.log("Determining roles...");
  const hostTurn = await hostCdp.evaluate(`
    (function() {
      const text = document.querySelector('.game-name')?.textContent || '';
      return text.includes('Your move') || text.includes('Your turn');
    })()
  `);

  const hostIsWhite = !!hostTurn;
  console.log(`Role assigned: Host is ${hostIsWhite ? 'White' : 'Black'}`);

  const whiteCdp = hostIsWhite ? hostCdp : clientCdp;
  const blackCdp = hostIsWhite ? clientCdp : hostCdp;

  // Move 1: White plays e4 (52 -> 36)
  console.log("White plays Move 1 (e4)...");
  await whiteCdp.tapSquare(52);
  await delay(600);
  await whiteCdp.tapSquare(36);
  await delay(1500);

  await whiteCdp.assertPiece(36, "White pawn");
  await blackCdp.assertPiece(36, "White pawn");
  console.log("Move 1 (e4) synced on both devices.");

  // Move 2: Black plays e5 (12 -> 28)
  console.log("Black plays Move 2 (e5)...");
  await blackCdp.tapSquare(12);
  await delay(600);
  await blackCdp.tapSquare(28);
  await delay(1500);

  await whiteCdp.assertPiece(28, "Black pawn");
  await blackCdp.assertPiece(28, "Black pawn");
  console.log("Move 2 (e5) synced on both devices.");

  // NOW TEST ONLINE TAKEBACK HANDSHAKE!
  console.log("\n--- Triggering Online Takeback Handshake ---");
  console.log("Black proposes takeback of move e5...");
  await blackCdp.clickSelector('[data-action="takeback"]');
  await delay(800);

  // Black confirms propose prompt: "Propose takeback?"
  console.log("Black confirming takeback proposal...");
  await blackCdp.waitForSelector('[data-confirm="accept"]');
  await blackCdp.clickSelector('[data-confirm="accept"]');
  await delay(1000);

  // White receives opponent proposal: "Takeback requested"
  console.log("White receiving takeback request modal...");
  await whiteCdp.waitForSelector('[data-confirm="accept"]');
  console.log("White accepting opponent's takeback request...");
  await whiteCdp.clickSelector('[data-confirm="accept"]');
  await delay(2500);

  // Verify that square 28 (e5) is now EMPTY on BOTH devices!
  console.log("Asserting bilateral rollback...");
  await whiteCdp.assertSquareEmpty(28);
  await blackCdp.assertSquareEmpty(28);
  console.log("PASS: Square 28 (e5) is cleared on BOTH Host and Client!");

  // Verify that White's e4 pawn is STILL intact on both devices!
  await whiteCdp.assertPiece(36, "White pawn");
  await blackCdp.assertPiece(36, "White pawn");
  console.log("PASS: Previous move e4 remains intact on both devices!");

  // Now prove that the game continues: Black plays c5 (10 -> 26) instead of e5!
  console.log("Black plays alternate move c5 (10 -> 26)...");
  await blackCdp.tapSquare(10);
  await delay(600);
  await blackCdp.tapSquare(26);
  await delay(1500);

  await whiteCdp.assertPiece(26, "Black pawn");
  await blackCdp.assertPiece(26, "Black pawn");
  console.log("PASS: Alternate move c5 successfully synced to both devices after takeback!");

  hostCdp.close();
  clientCdp.close();
  console.log("\nSpecific Test 4 (Online Takeback Handshake): PASSED");
  process.exit(0);
}

run().catch(err => {
  console.error("Test Failed:", err);
  process.exit(1);
});
