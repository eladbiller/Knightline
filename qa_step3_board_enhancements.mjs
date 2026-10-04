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
  async waitForSelector(selector, timeoutMs = 30000) {
    let retries = Math.floor(timeoutMs / 500);
    while (retries > 0) {
      const exists = await this.evaluate(`!!document.querySelector('${selector}')`);
      if (exists) return;
      await delay(500);
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
    assert(text && text.includes(pieceName), `[${this.serial}] Expected ${pieceName} at square ${index}, got: "${text}"`);
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

async function run() {
  console.log("=== Step 3 Hardware E2E Verification Suite ===");
  const cdp = await connectToDevice(serial, 9226);
  await delay(1500);

  // ----------------------------------------------------
  // TEST 1: Pass & Play Stationary Default & Flip Button
  // ----------------------------------------------------
  console.log("\n[Test 1] Testing Pass & Play Stationary Default & Flip Button...");
  await cdp.clickSelector('[data-action="nav-play"]');
  await delay(1000);
  await cdp.clickSelector('[data-action="setup-pass"]');
  await delay(1000);

  // Verify auto-flip toggle is OFF (aria-checked="false")
  const autoFlipDefault = await cdp.evaluate(`
    document.querySelector('[data-toggle-autoflip]')?.getAttribute('aria-checked')
  `);
  console.log("Pass & Play setup auto-flip default:", autoFlipDefault);
  assert.equal(autoFlipDefault, 'false', "Auto-flip default MUST be false (unchecked)");

  // Start game
  await cdp.clickSelector('[data-setup-start]');
  await cdp.waitForSelector('.board');
  await delay(1500);

  // Check initial orientation: square 56 (a1) is bottom-left, square 0 (a8) is top-left
  const getFirstSquare = async () => await cdp.evaluate(`
    Number(document.querySelector('.square')?.dataset.square)
  `);
  const initialFirst = await getFirstSquare();
  console.log("Initial first square index:", initialFirst);
  assert.equal(initialFirst, 0, "Square 0 (a8) is at top, square 56 (a1) at bottom (White perspective)");

  // White moves: e2 -> e4 (52 -> 36)
  await cdp.tapSquare(52);
  await cdp.tapSquare(36);
  await delay(1000);
  await cdp.assertPiece(36, "White pawn");

  // Verify board remained STATIONARY on Black's turn (not auto-flipped)
  const afterWhiteFirst = await getFirstSquare();
  console.log("First square after White's move (Black turn):", afterWhiteFirst);
  assert.equal(afterWhiteFirst, 0, "Board MUST remain stationary (White perspective) on Black turn by default");

  // Verify manual [Flip] button exists on dock
  const hasFlipBtn = await cdp.evaluate(`!!document.querySelector('[data-action="flip-board"]')`);
  assert(hasFlipBtn, "Manual Flip Board button must be present in Pass & Play dock");

  // Tap manual [Flip]
  await cdp.clickSelector('[data-action="flip-board"]');
  await delay(500);
  const afterManualFlip = await getFirstSquare();
  console.log("First square after manual Flip:", afterManualFlip);
  assert.equal(afterManualFlip, 63, "Board perspective must rotate 180° (square 63 at top) when Flip is tapped");

  // Tap [Flip] again to restore
  await cdp.clickSelector('[data-action="flip-board"]');
  await delay(500);
  assert.equal(await getFirstSquare(), 0, "Board perspective must restore to square 0 at top");
  console.log("✓ Test 1 PASSED: Stationary default & manual Flip verified!");

  // ----------------------------------------------------
  // TEST 2: Captured Pieces Tray & Material Advantage Badge
  // ----------------------------------------------------
  console.log("\n[Test 2] Testing Captured Pieces Tray & Material Advantage Badge...");
  // Black moves: d7 -> d5 (11 -> 27)
  await cdp.tapSquare(11);
  await cdp.tapSquare(27);
  await delay(1000);
  await cdp.assertPiece(27, "Black pawn");

  // White captures: exd5 (36 -> 27)
  await cdp.tapSquare(36);
  await cdp.tapSquare(27);
  await delay(1000);
  await cdp.assertPiece(27, "White pawn");

  // Verify captured tray contains captured black pawn
  const capturedCount = await cdp.evaluate(`
    document.querySelectorAll('.captured-tray .captured-piece').length
  `);
  console.log("Captured pieces rendered in trays:", capturedCount);
  assert(capturedCount >= 1, "At least 1 captured piece must be rendered in player tray");

  // Verify White has +1 material badge
  const materialBadgeText = await cdp.evaluate(`
    document.querySelector('.player-card--bottom .material-badge, .material-badge')?.textContent || ''
  `);
  console.log("White player card material badge:", materialBadgeText);
  assert(materialBadgeText.includes('+1'), `Material badge must show +1, got: "${materialBadgeText}"`);
  console.log("✓ Test 2 PASSED: Captured pieces tray and material badge (+1) verified!");

  // ----------------------------------------------------
  // TEST 3: Active Room Card & Key Management (PeerJS)
  // ----------------------------------------------------
  console.log("\n[Test 3] Testing Active Room Card & Key Management...");
  // Return to home/play via header back or abandon
  await cdp.clickSelector('[data-action="game-back"]');
  await delay(1000);
  // Abandon game to clear match
  const hasAbandon = await cdp.evaluate(`!!document.querySelector('[data-action="abandon"]')`);
  if (hasAbandon) {
    await cdp.clickSelector('[data-action="abandon"]');
    await delay(1000);
  }

  // Open online menu and host room
  const curScreen3 = await cdp.evaluate(`document.getElementById('app')?.dataset.screen`);
  if (curScreen3 !== 'play') {
    await cdp.clickSelector('[data-nav="play"]');
    await delay(1000);
  }
  await cdp.clickSelector('[data-action="online-menu"]');
  await delay(1000);

  // Host room
  await cdp.clickSelector('[data-online="host"]');
  await delay(1200);

  // If replacing an existing saved game, accept confirmation modal
  const hasConfirm = await cdp.evaluate(`!!document.querySelector('[data-confirm="accept"]')`);
  if (hasConfirm) {
    console.log("Accepting replace saved game confirmation...");
    await cdp.clickSelector('[data-confirm="accept"]');
    await delay(2000);
  }

  // Check Active Room Card on Play screen
  await cdp.waitForSelector('.active-room-card');
  const roomCardStatus = await cdp.evaluate(`
    document.querySelector('.active-room-badge')?.textContent
  `);
  const roomKeyCode = await cdp.evaluate(`
    document.querySelector('.active-room-code-val')?.textContent
  `);
  console.log("Active room status badge:", roomCardStatus);
  console.log("Active room key code:", roomKeyCode);
  assert(roomCardStatus && roomCardStatus.includes("Room is Open"), "Active room card must indicate Room is Open");
  assert(roomKeyCode && roomKeyCode.length >= 4, "Active room code must be at least 4 characters");

  // Test [Copy Key] button
  const copyBtnText = await cdp.evaluate(`
    document.querySelector('[data-copy-key]')?.textContent
  `);
  console.log("Copy Key button text:", copyBtnText);
  await cdp.clickSelector('[data-copy-key]');
  await delay(500);
  const copyBtnAfter = await cdp.evaluate(`
    document.querySelector('[data-copy-key]')?.textContent
  `);
  console.log("Copy Key button after click:", copyBtnAfter);
  assert(copyBtnAfter && copyBtnAfter.includes("Copied"), "Copy Key button should show 'Copied!' feedback");

  // Test [Close Room] button
  console.log("Clicking Close Room...");
  await cdp.clickSelector('[data-native-action="transport.closeRoom"]');
  await delay(1500);

  // Verify room is closed
  const isRoomStillActive = await cdp.evaluate(`
    !!document.querySelector('.active-room-card')
  `);
  console.log("Active room card still present:", isRoomStillActive);
  assert(!isRoomStillActive, "Active room card must be removed once closed");
  console.log("✓ Test 3 PASSED: Active room card, key display, copy feedback, and close room verified!");

  // ----------------------------------------------------
  // TEST 4: Standalone Sandbox / Free Analysis Board
  // ----------------------------------------------------
  console.log("\n[Test 4] Testing Standalone Sandbox / Analysis Board...");
  const curScreen4 = await cdp.evaluate(`document.getElementById('app')?.dataset.screen`);
  if (curScreen4 !== 'play') {
    await cdp.clickSelector('[data-nav="play"]');
    await delay(1000);
  }

  // Click Sandbox quick card
  await cdp.clickSelector('[data-action="nav-sandbox"]');
  await delay(1500);
  await cdp.waitForSelector('.sandbox-workspace');

  // Verify toolbar buttons
  const toolbarButtons = await cdp.evaluate(`
    Array.from(document.querySelectorAll('.sandbox-toolbar button')).map(b => b.textContent.trim())
  `);
  console.log("Sandbox toolbar buttons:", toolbarButtons);
  assert(toolbarButtons.some(b => b.includes('Reset')), "Reset button must exist");
  assert(toolbarButtons.some(b => b.includes('Clear')), "Clear button must exist");
  assert(toolbarButtons.some(b => b.includes('Undo')), "Undo button must exist");
  assert(toolbarButtons.some(b => b.includes('Redo')), "Redo button must exist");
  assert(toolbarButtons.some(b => b.includes('Flip')), "Flip button must exist");
  assert(toolbarButtons.some(b => b.includes('FEN')), "FEN button must exist");

  // Move 1: e2 -> e4 (52 -> 36)
  await cdp.tapSquare(52);
  await cdp.tapSquare(36);
  await delay(1000);
  await cdp.assertPiece(36, "White pawn");
  console.log("Sandbox move e2-e4 completed.");

  // Test Undo: square 36 should become empty and piece back at 52
  console.log("Testing Undo...");
  await cdp.clickSelector('[data-sandbox-action="undo"]');
  await delay(1000);
  await cdp.assertPiece(52, "White pawn");
  console.log("Undo restored pawn to e2.");

  // Test Redo: square 36 should have pawn again
  console.log("Testing Redo...");
  await cdp.clickSelector('[data-sandbox-action="redo"]');
  await delay(1000);
  await cdp.assertPiece(36, "White pawn");
  console.log("Redo moved pawn back to e4.");

  // Test Eval Toggle
  console.log("Testing Stockfish Eval toggle cycle (ON -> OFF -> ON)...");
  await cdp.waitForSelector('.eval-chip', 8000);
  const beforeEval = await cdp.evaluate(`({
    hasEvalBtn: !!document.querySelector('[data-sandbox-action="eval"]'),
    evalBtnText: document.querySelector('[data-sandbox-action="eval"]')?.textContent,
    evalChip: !!document.querySelector('.eval-chip')
  })`);
  console.log("Initial eval state (enabled by default):", beforeEval);
  assert(beforeEval.evalChip, "Stockfish eval chip must be visible by default");

  // Toggle OFF
  console.log("Toggling eval OFF...");
  await cdp.clickSelector('[data-sandbox-action="eval"]');
  await delay(1200);
  const afterEvalOff = await cdp.evaluate(`({
    hasEvalBtn: !!document.querySelector('[data-sandbox-action="eval"]'),
    evalBtnText: document.querySelector('[data-sandbox-action="eval"]')?.textContent,
    evalChip: !!document.querySelector('.eval-chip')
  })`);
  console.log("Eval state after toggling OFF:", afterEvalOff);
  assert(!afterEvalOff.evalChip, "Stockfish eval chip must be hidden when toggled off");
  assert(afterEvalOff.evalBtnText.includes("Enable Eval"), "Button should show 'Enable Eval' when off");

  // Toggle BACK ON
  console.log("Toggling eval back ON...");
  await cdp.clickSelector('[data-sandbox-action="eval"]');
  await cdp.waitForSelector('.eval-chip', 8000);
  const evalRestored = await cdp.evaluate(`({
    evalChip: !!document.querySelector('.eval-chip'),
    chipText: document.querySelector('.eval-chip')?.textContent
  })`);
  console.log("Eval state after toggling ON:", evalRestored);
  assert(evalRestored.evalChip, "Stockfish eval chip must be restored when toggled back on");

  // Test FEN Sheet
  console.log("Testing FEN modal sheet...");
  await cdp.clickSelector('[data-sandbox-action="fen"]');
  await delay(1000);
  await cdp.waitForSelector('#sandbox-fen-current');
  const currentFen = await cdp.evaluate(`document.getElementById('sandbox-fen-current')?.value`);
  console.log("Sandbox current FEN:", currentFen);
  assert(currentFen && currentFen.includes('4P3'), `FEN must reflect e4 move, got: "${currentFen}"`);
  await cdp.clickSelector('[data-sheet-close]');
  await delay(1000);

  // Test Clear Board (leaves only 2 kings to preserve chess legality)
  console.log("Testing Clear Board...");
  await cdp.clickSelector('[data-sandbox-action="clear"]');
  await delay(1000);
  const piecesCountAfterClear = await cdp.evaluate(`
    document.querySelectorAll('.square .piece-svg').length
  `);
  console.log("Pieces count after Clear (2 kings):", piecesCountAfterClear);
  assert.equal(piecesCountAfterClear, 2, "Clear board must leave only the two kings (2 pieces) for engine legality");
  await cdp.assertPiece(60, "White king");
  await cdp.assertPiece(4, "Black king");

  // Test Reset Board
  console.log("Testing Reset Board...");
  await cdp.clickSelector('[data-sandbox-action="reset"]');
  await delay(1000);
  const piecesCountAfterReset = await cdp.evaluate(`
    document.querySelectorAll('.square .piece-svg').length
  `);
  console.log("Pieces count after Reset:", piecesCountAfterReset);
  assert.equal(piecesCountAfterReset, 32, "Reset board must restore all 32 starting pieces");

  // Test Back button navigation
  console.log("Testing header back button...");
  await cdp.clickSelector('.header-back');
  await delay(1000);
  const currentScreen = await cdp.evaluate(`document.getElementById('app')?.dataset.screen`);
  console.log("Screen after back button:", currentScreen);
  assert.equal(currentScreen, 'play', "Back button from Sandbox must navigate back to Play screen");
  console.log("✓ Test 4 PASSED: Sandbox free movement, undo, redo, eval, FEN, clear, reset, and navigation verified!");

  console.log("\n========================================================");
  console.log("ALL STEP 3 HARDWARE ACCEPTANCE TESTS PASSED SUCCESSFULLY!");
  console.log("========================================================");
  process.exit(0);
}

run().catch(err => {
  console.error("Hardware test failed:", err);
  process.exit(1);
});
