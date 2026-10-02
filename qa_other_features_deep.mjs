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
  const cdp = await connectToDevice(serial, 9227);
  await delay(1000);
  
  console.log("Navigating to Learn (Openings) Menu...");
  await cdp.clickSelector('[data-action="nav-learn"]');
  await delay(1000);

  // Click on "Learn an opening" if it exists
  const hasOpenings = await cdp.evaluate(`!!document.querySelector('[data-action="nav-openings"]')`);
  if(hasOpenings) {
    await cdp.clickSelector('[data-action="nav-openings"]');
    await delay(1000);
  }

  // See what openings are available
  const openings = await cdp.evaluate(`
    Array.from(document.querySelectorAll('.opening-card, [data-action^="opening"]')).map(el => el.textContent)
  `);
  console.log('Available openings or content:', openings);
  
  // Go back to Home
  await cdp.clickSelector('[data-nav="home"]');
  await delay(1000);

  console.log("Navigating to Game Library / History...");
  await cdp.clickSelector('[data-action="nav-history"]');
  await delay(1000);
  
  const games = await cdp.evaluate(`
    Array.from(document.querySelectorAll('.game-item, [data-action="review-open"]')).map(el => el.textContent)
  `);
  console.log('Available games in history:', games);
  
  console.log("Other Features Test Finished.");
  process.exit(0);
}
run().catch(console.error);
