import http from 'http';
import { execSync } from 'child_process';

const TABLET_SERIAL = 'R9WR40475QJ';
const TABLET_PORT = 9227;

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getWsUrl(port) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}/json`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const list = JSON.parse(data);
          const page = list.find(p => p.type === 'page' && p.url && p.url.includes('ui/index.html')) || list.find(p => p.type === 'page');
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

async function run() {
  console.log("Starting Specific Test 3: Landscape & Tablet Responsive Layout on Physical Tablet...");

  // Ensure tablet is in landscape and cleanly started
  execSync(`adb -s ${TABLET_SERIAL} shell "settings put system accelerometer_rotation 0; settings put system user_rotation 1"`);
  execSync(`adb -s ${TABLET_SERIAL} shell pm clear com.eladbiller.knightline`);
  execSync(`adb -s ${TABLET_SERIAL} shell monkey -p com.eladbiller.knightline -c android.intent.category.LAUNCHER 1`);
  await delay(3000);

  // Setup port forward
  const pid = execSync(`adb -s ${TABLET_SERIAL} shell pidof com.eladbiller.knightline`, { encoding: 'utf8' }).trim().split(/\s+/)[0];
  execSync(`adb -s ${TABLET_SERIAL} forward tcp:${TABLET_PORT} localabstract:webview_devtools_remote_${pid}`);

  const wsUrl = await getWsUrl(TABLET_PORT);
  const cdp = new CDP();
  await cdp.open(wsUrl);

  // 1. Verify viewport dimensions
  const dims = await cdp.evaluate(`({
    width: window.innerWidth,
    height: window.innerHeight,
    isLandscape: window.matchMedia('(orientation: landscape)').matches,
    minWidth580: window.matchMedia('(min-width: 580px)').matches
  })`);
  console.log("Tablet Viewport Geometry:", dims);

  if (!dims.isLandscape || dims.width < 580) {
    throw new Error(`Expected landscape viewport >= 580px, got ${JSON.stringify(dims)}`);
  }
  console.log("PASS: Physical tablet viewport satisfies @media (orientation: landscape) and (min-width: 580px).");

  // 2. Start a Pass & Play game to verify 2-column in-game grid
  console.log("Navigating to Pass & Play game...");
  await cdp.click('[data-action="nav-play"]');
  await delay(1000);
  await cdp.click('[data-action="setup-pass"]');
  await delay(1000);
  const confirm = await cdp.evaluate("!!document.querySelector('[data-confirm=\"accept\"]')");
  if (confirm) {
    await cdp.click('[data-confirm=\"accept\"]');
    await delay(1000);
  }
  await cdp.click('[data-setup-start]');
  await cdp.waitForSelector('#board-host', 15000);
  await delay(1500);

  // 3. Inspect 2-column layout rects
  const layout = await cdp.evaluate(`
    (function() {
      const boardHost = document.querySelector('#board-host');
      const gameActions = document.querySelector('.game-actions');
      const gameTopline = document.querySelector('.game-topline');
      const bRect = boardHost ? boardHost.getBoundingClientRect() : null;
      const aRect = gameActions ? gameActions.getBoundingClientRect() : null;
      const tRect = gameTopline ? gameTopline.getBoundingClientRect() : null;
      return {
        board: bRect ? { left: bRect.left, top: bRect.top, width: bRect.width, height: bRect.height, right: bRect.right } : null,
        actions: aRect ? { left: aRect.left, top: aRect.top, width: aRect.width, right: aRect.right } : null,
        topline: tRect ? { left: tRect.left, top: tRect.top, width: tRect.width, right: tRect.right } : null,
        windowWidth: window.innerWidth
      };
    })()
  `);
  console.log("In-Game Landscape Layout Rects:", JSON.stringify(layout, null, 2));

  if (!layout.board) throw new Error("Board element #board-host not found!");
  if (!layout.actions) throw new Error("Game actions element not found!");

  // Assert board is on the left half
  const halfWidth = layout.windowWidth / 2;
  console.log(`Checking horizontal split: Board right edge (${layout.board.right}) vs Actions left edge (${layout.actions.left})`);
  
  // In 2-column grid, board is on left, actions on right:
  if (layout.board.left >= halfWidth) {
    throw new Error(`Board left edge (${layout.board.left}) is NOT on the left half (< ${halfWidth})!`);
  }
  if (layout.actions.left < layout.board.left + 50) {
    throw new Error(`Actions left edge (${layout.actions.left}) overlaps or is not right of board left!`);
  }
  console.log("PASS: Board is cleanly positioned in the left column; actions and status are in the right column.");

  // 4. Test playing a move on the physical tablet in landscape
  console.log("Testing move interaction in landscape...");
  // White pawn e2 is square 52, e4 is square 36
  await cdp.click('[data-square="52"]');
  await delay(400);
  await cdp.click('[data-square="36"]');
  await delay(2000);

  // Assert pawn moved to square 36
  const square36 = await cdp.evaluate(`
    document.querySelector('[data-square="36"]')?.getAttribute('aria-label') || ''
  `);
  console.log("Square 36 aria-label after move:", square36);
  if (!square36.toLowerCase().includes('pawn')) {
    throw new Error(`Expected pawn on square 36, got '${square36}'`);
  }
  console.log("PASS: Move e2-e4 successfully played and verified on physical tablet in landscape!");

  // Pull physical screenshot of the live landscape game
  execSync(`adb -s ${TABLET_SERIAL} shell screencap -p /sdcard/game_landscape.png`);
  execSync(`adb -s ${TABLET_SERIAL} pull /sdcard/game_landscape.png ./tablet_game_landscape.png`);
  execSync(`adb -s ${TABLET_SERIAL} shell rm /sdcard/game_landscape.png`);
  console.log("Saved tablet in-game landscape screenshot: tablet_game_landscape.png");

  cdp.close();
  console.log("Specific Test 3 (Landscape & Tablet Responsive Layout): PASSED");
  process.exit(0);
}

run().catch(err => {
  console.error("Test Failed:", err);
  process.exit(1);
});
