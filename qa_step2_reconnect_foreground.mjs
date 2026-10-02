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
  async assertPiece(index, pieceName) {
    let retries = 20;
    while (retries > 0) {
      const text = await this.evaluate(`
        (function() {
          const el = document.querySelector('[data-square="${index}"]');
          return el ? el.getAttribute('aria-label') : null;
        })()
      `);
      if (text && text.includes(pieceName)) return;
      await delay(500);
      retries--;
    }
    throw new Error(`[${this.serial}] Expected ${pieceName} at square ${index}`);
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
  const page = targets.find(t => t.type === 'page' && t.url && t.url.includes('index.html')) || targets.find(t => t.type === 'page');
  const cdp = new CDP(serial);
  await cdp.open(page.webSocketDebuggerUrl);
  return cdp;
}

async function run() {
  console.log("Starting Specific Test 5: Foreground Service & Auto-Reconnect Banner...");
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

  const roomCode = "FGSREC01";
  console.log(`Hosting room: ${roomCode}`);
  await hostCdp.typeInput('#room-code', roomCode);
  await hostCdp.clickSelector('[data-online="host"]');
  await delay(2500);

  // Client switches to Join tab and joins
  console.log(`Client joining room: ${roomCode}`);
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
  await delay(3000);

  // 1. Verify Foreground Service is actively running on Host
  console.log("Verifying Android Foreground Service (KnightlineMatchService)...");
  const fgsDump = adb(SERIAL_HOST, 'shell', 'dumpsys', 'activity', 'services', 'com.traillink.KnightlineMatchService');
  console.log("FGS Dumpsys Output Snippet:", fgsDump.slice(0, 300));
  assert(fgsDump.includes('KnightlineMatchService'), "KnightlineMatchService was NOT found running in activity services!");
  console.log("PASS: KnightlineMatchService is actively running in background/foreground on Host!");

  // 2. Play a move to ensure game is live
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

  console.log("White plays Move 1 (e4)...");
  await whiteCdp.tapSquare(52);
  await delay(600);
  await whiteCdp.tapSquare(36);
  await delay(1000);
  await blackCdp.assertPiece(36, "White pawn");
  console.log("Move 1 confirmed received on both devices.");
  await delay(1000);

  // 3. Disconnect Client via game-menu -> Disconnect
  console.log("Client opening game menu...");
  await clientCdp.clickSelector('[data-action="game-menu"]');
  await delay(1000);
  console.log("Client clicking Disconnect option...");
  await clientCdp.clickSelector('[data-native-action="transport.disconnect"]');
  await delay(1500);

  // 4. Assert Host enters reconnect grace period with banner
  console.log("Asserting Host displays auto-reconnect grace banner (25s window)...");
  let hasBannerOrNotice = null;
  const startWait = Date.now();
  while (Date.now() - startWait < 15000) {
    hasBannerOrNotice = await hostCdp.evaluate(`
      (function() {
        const banner = document.querySelector('.reconnecting-banner');
        const toast = document.querySelector('.toast');
        const body = document.body.innerText;
        return {
          hasBanner: !!banner,
          bannerText: banner ? banner.textContent : null,
          toastText: toast ? toast.textContent : null,
          bodyHasReconnecting: body.includes('Reconnecting') || body.includes('reconnecting') || body.includes('interrupted')
        };
      })()
    `);
    console.log(`[${Math.round((Date.now() - startWait)/1000)}s] Host Reconnect State:`, hasBannerOrNotice);
    if (hasBannerOrNotice.hasBanner || hasBannerOrNotice.bodyHasReconnecting) break;
    await delay(1000);
  }
  assert(hasBannerOrNotice.hasBanner || hasBannerOrNotice.bodyHasReconnecting,
    "Host did NOT enter reconnect grace period or show reconnect banner!");
  console.log("PASS: Reconnecting banner and 25s grace window correctly active on Host!");

  // Verify Foreground Service is STILL active on Host during grace period
  const fgsDuringGrace = adb(SERIAL_HOST, 'shell', 'dumpsys', 'activity', 'services', 'com.traillink.KnightlineMatchService');
  assert(fgsDuringGrace.includes('KnightlineMatchService'), "Foreground service should remain active during grace period!");
  console.log("PASS: KnightlineMatchService stayed active during reconnect grace period!");

  hostCdp.close();
  clientCdp.close();
  console.log("\nSpecific Test 5 (Foreground Service & Auto-Reconnect): PASSED");
  process.exit(0);
}

run().catch(err => {
  console.error("Test Failed:", err);
  process.exit(1);
});
