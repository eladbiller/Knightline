import http from 'http';
import { execSync } from 'child_process';

const SERIAL = '10ACAD2F63001KS';

function getWindowFlags() {
  const output = execSync(`adb -s ${SERIAL} shell "dumpsys window windows | grep -A 5 'Window.*KnightlineActivity'"`, { encoding: 'utf8' });
  const flMatch = output.match(/fl=([^\r\n]+)/);
  return flMatch ? flMatch[1] : '';
}

function getWsUrl(port) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}/json`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const list = JSON.parse(data);
          const page = list.find(p => p.type === 'page');
          if (page && page.webSocketDebuggerUrl) resolve(page.webSocketDebuggerUrl);
          else reject(new Error(`No page target on port ${port}`));
        } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

class CDP {
  pending = new Map(); id = 0;
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
  async waitForSelector(selector, timeoutMs = 15000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const exists = await this.evaluate(`!!document.querySelector('${selector}')`);
      if (exists) return true;
      await delay(400);
    }
    throw new Error(`Timeout waiting for selector: ${selector}`);
  }
  async click(selector) {
    await this.waitForSelector(selector);
    await this.evaluate(`
      (function() {
        const el = document.querySelector('${selector}');
        if (!el) throw new Error('Element not found: ${selector}');
        el.click();
      })()
    `);
  }
  close() { this.ws.close(); }
}

const delay = ms => new Promise(r => setTimeout(r, ms));

async function run() {
  console.log("Starting Specific Test 2: Dynamic WakeLock Management...");

  // Launch fresh app state
  execSync(`adb -s ${SERIAL} shell pm clear com.eladbiller.knightline`);
  execSync(`adb -s ${SERIAL} shell monkey -p com.eladbiller.knightline -c android.intent.category.LAUNCHER 1`);
  await delay(3500);

  // Re-forward port
  const pid = execSync(`adb -s ${SERIAL} shell pidof com.eladbiller.knightline`, { encoding: 'utf8' }).trim();
  execSync(`adb -s ${SERIAL} forward tcp:9225 localabstract:webview_devtools_remote_${pid}`);

  // 1. Initial Home state check (CDP disconnected)
  let flags = getWindowFlags();
  console.log("Initial Home screen window flags:", flags);
  if (flags.includes("KEEP_SCREEN_ON")) {
    throw new Error("WakeLock FAIL: FLAG_KEEP_SCREEN_ON should NOT be active on Home screen!");
  }
  console.log("PASS: Screen awake flag is correctly inactive on Home screen.");

  // 2. Start a Bot game
  console.log("Connecting CDP to start Bot game...");
  const wsUrl = await getWsUrl(9225);
  let cdp = new CDP();
  await cdp.open(wsUrl);

  await cdp.click('[data-action="nav-play"]');
  await delay(1000);
  await cdp.click('[data-action="setup-bot"]');
  await delay(1000);
  await cdp.click('[data-setup-start]');
  await delay(3500);

  // Disconnect CDP so DevTools does not hold KEEP_SCREEN_ON
  cdp.close();
  await delay(1000);

  flags = getWindowFlags();
  console.log("In-game window flags (without DevTools):", flags);
  if (!flags.includes("KEEP_SCREEN_ON")) {
    throw new Error("WakeLock FAIL: FLAG_KEEP_SCREEN_ON should be active during a live match!");
  }
  console.log("PASS: Screen awake flag is correctly active during gameplay.");

  // 3. Resign game and verify flag is cleared
  console.log("Reconnecting CDP to resign match...");
  cdp = new CDP();
  await cdp.open(wsUrl);

  await cdp.click('[data-action="game-menu"]');
  await delay(800);
  await cdp.click('[data-native-action="match.resign"]');
  await delay(1000);
  const confirmBtn = await cdp.evaluate("!!document.querySelector('[data-confirm=\"accept\"]')");
  if (confirmBtn) {
    await cdp.click('[data-confirm="accept"]');
    await delay(1200);
  }

  // Disconnect CDP so DevTools does not hold KEEP_SCREEN_ON
  cdp.close();
  await delay(1000);

  flags = getWindowFlags();
  console.log("Post-resignation window flags (without DevTools):", flags);
  if (flags.includes("KEEP_SCREEN_ON")) {
    throw new Error("WakeLock FAIL: FLAG_KEEP_SCREEN_ON was NOT cleared after match ended!");
  }
  console.log("PASS: Screen awake flag is correctly cleared after match ends.");

  console.log("Specific Test 2 (WakeLock Management): PASSED");
  process.exit(0);
}

run().catch(err => {
  console.error("Test Failed:", err);
  process.exit(1);
});
