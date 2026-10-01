// Real Android WebView regression: native session + touch input, no mock bridge.
// Run only on a test device: this starts fresh untimed games in the installed app.
// ADB=<adb path> ANDROID_SERIAL=emulator-5554 node tests/webview-board-flow.mjs
// --probe reproduces selection only; --record=<local path.mp4> records 45 seconds.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';

const adbPath = process.env.ADB || 'adb';
const serial = process.env.ANDROID_SERIAL || 'emulator-5554';
const appId = 'com.eladbiller.knightline';
const port = Number(process.env.CDP_PORT || 9223);
const args = process.argv.slice(2);
const probe = args.includes('--probe');
const mode = args.find(a => a.startsWith('--mode='))?.split('=')[1] || 'bot';
const record = args.find(a => a.startsWith('--record='))?.slice(9);
// Optional human-paced recordings; assertions and native responses are unchanged.
const actionDelayMs = Number(process.env.QA_ACTION_DELAY_MS || 180);
assert(Number.isFinite(actionDelayMs) && actionDelayMs >= 0 && actionDelayMs <= 2000);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const adb = (...a) => execFileSync(adbPath, ['-s', serial, ...a], {encoding: 'utf8'}).trim();

class CDP {
  pending = new Map();
  id = 0;
  async open(url) {
    this.ws = new WebSocket(url);
    this.ws.addEventListener('message', ({data}) => {
      const msg = JSON.parse(data);
      const request = this.pending.get(msg.id);
      if (!request) return;
      clearTimeout(request.timeout);
      this.pending.delete(msg.id);
      if (msg.error) request.reject(new Error(JSON.stringify(msg.error)));
      else request.resolve(msg.result);
    });
    await new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, {once: true});
      this.ws.addEventListener('error', reject, {once: true});
    });
  }
  call(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.id;
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timed out: ${method}`));
      }, 15000);
      this.pending.set(id, {resolve, reject, timeout});
      this.ws.send(JSON.stringify({id, method, params}));
    });
  }
  async evaluate(expression) {
    const response = await this.call('Runtime.evaluate', {expression, returnByValue: true, awaitPromise: true});
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
    return response.result.value;
  }
}

const cdp = new CDP();
async function waitFor(expression, label, timeout = 12000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    if (await cdp.evaluate(expression)) return;
    await delay(80);
  }
  throw new Error(`Timed out waiting for ${label}`);
}
const sq = n => `[data-square="${n}"]`;
async function point(selector) {
  return cdp.evaluate(`(() => {
    const e = document.querySelector(${JSON.stringify(selector)});
    if (!e || e.disabled) throw new Error('Missing or disabled: ' + ${JSON.stringify(selector)});
    const r = e.getBoundingClientRect();
    if (!r.width || !r.height) throw new Error('Hidden control');
    return {x:r.x+r.width/2,y:r.y+r.height/2};
  })()`);
}
async function touch(selector, scroll = false) {
  await waitFor(`!!document.querySelector(${JSON.stringify(selector)})`, selector);
  if (scroll) {
    await cdp.evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'nearest'})`);
    await delay(100);
  }
  const p = await point(selector);
  await cdp.call('Input.dispatchTouchEvent', {type:'touchStart',touchPoints:[{...p,id:1}]});
  await delay(65);
  await cdp.call('Input.dispatchTouchEvent', {type:'touchEnd',touchPoints:[]});
  await delay(actionDelayMs);
}
async function drag(from, to) {
  const a = await point(sq(from)), b = await point(sq(to));
  await cdp.call('Input.dispatchTouchEvent', {type:'touchStart',touchPoints:[{...a,id:1}]});
  for (let n = 1; n <= 12; n++) {
    await delay(25);
    await cdp.call('Input.dispatchTouchEvent', {type:'touchMove',touchPoints:[{x:a.x+(b.x-a.x)*n/12,y:a.y+(b.y-a.y)*n/12,id:1}]});
    if(n===6){
      const lift=await cdp.evaluate(`(()=>{const g=document.querySelector('.drag-piece'),s=document.querySelector('[data-square="${from}"] .piece-svg');return {present:!!g,hidden:getComputedStyle(s).visibility,rect:g?.getBoundingClientRect().toJSON()}})()`);
      assert(lift.present&&lift.hidden==='hidden','Dragging must lift the piece, not leave it at the origin');
      assert(Math.abs(lift.rect.x+lift.rect.width/2-(a.x+b.x)/2)<2,'Floating piece follows pointer');
    }
  }
  await cdp.call('Input.dispatchTouchEvent', {type:'touchEnd',touchPoints:[]});
  await delay(200);
  assert.equal(await cdp.evaluate(`document.querySelectorAll('.drag-piece,.square--drag-source,.square--drop').length`),0,'Drop leaves no ghost');
}
async function startGame() {
  if (await cdp.evaluate(`!!document.querySelector('[data-action="game-back"]')`)) {
    await touch('[data-action="game-back"]');
    await touch('[data-nav="home"]');
    await waitFor(`!!document.querySelector('[data-action="setup-bot"]')`, 'home');
  }
  if (mode === 'pass') {
    await touch('[data-nav="play"]');
    await touch('[data-action="setup-pass"]', true);
  } else if (mode === 'lesson') {
    await touch('[data-nav="learn"]');
    await touch('[data-learn-section="openings"]', true);
    await touch('[data-lesson="0"]', true);
    await touch('[data-lesson-start]', true);
  } else await touch('[data-action="setup-bot"]', true);
  if (mode !== 'lesson') {
    await waitFor(`document.querySelector('#bottom-sheet').dataset.open === 'true'`, 'setup');
    await delay(350);
    await touch('[data-choice="clock"][data-value="4"]', true);
    if (mode === 'bot') await touch('[data-choice="level"][data-value="0"]', true);
    await touch('[data-setup-start]', true);
  }
  await delay(700);
  if (await cdp.evaluate(`!!document.querySelector('[data-confirm="accept"]')`)) await touch('[data-confirm="accept"]', true);
  await waitFor(`document.querySelectorAll('.square').length === 64 && document.querySelector('.game-name')?.innerText === 'Your move'`, 'playable game');
  if (mode !== 'pass') await waitFor(`document.querySelector('.eval-state')?.innerText.toLowerCase() === 'live'`, 'native evaluation');
  await delay(400);
  await cdp.evaluate(`document.querySelector('#main-content').scrollTop=0`);
}

// Samples every displayed animation frame, so a transient expansion during
// selection/submission fails even if the next native event restores the board.
async function beginMeasure() {
  await cdp.evaluate(`(() => {
    window.__boardMeasure = {samples:[],running:true,host:document.querySelector('#board-host'),board:document.querySelector('.board')};
    const m=window.__boardMeasure;
    m.read=()=>{
      const b=document.querySelector('.board'),r=b?.getBoundingClientRect();
      return {x:r?.x,y:r?.y,w:r?.width,h:r?.height,rail:document.querySelectorAll('.eval-rail').length,
        scroll:document.querySelector('#main-content').scrollTop,scale:visualViewport.scale,
        selected:document.querySelector('.square--selected')?.dataset.square||null,
        squareCount:document.querySelectorAll('.square').length,sameBoard:m.board===b};
    };
    m.base=m.read();
    const frame=()=>{if(!m.running)return;m.samples.push(m.read());requestAnimationFrame(frame)};
    requestAnimationFrame(frame);
  })()`);
}
async function endMeasure(label, requireSameNode = true, positionStable = true) {
  const report = await cdp.evaluate(`(() => {const m=window.__boardMeasure;m.running=false;return {base:m.base,samples:m.samples,final:m.read()}})()`);
  assert(report.samples.length > 0, 'Measurement must include displayed frames');
  const bad = report.samples.filter(s => Math.abs(s.w-report.base.w)>.05 || Math.abs(s.h-report.base.h)>.05 ||
    Math.abs(s.x-report.base.x)>.05 || s.rail!==report.base.rail || s.scale!==report.base.scale || s.squareCount!==64 ||
    (positionStable && (Math.abs(s.y-report.base.y)>.05 || s.scroll!==report.base.scroll)) ||
    (requireSameNode && !s.sameBoard));
  console.log(JSON.stringify({label,frames:report.samples.length,before:report.base,after:report.final,unstableFrames:bad.length,firstUnstable:bad[0]}));
  assert.equal(bad.length, 0, `${label}: board geometry, evaluation rail, or interaction target changed`);
}
async function expectSelected(square) {
  assert.equal(await cdp.evaluate(`document.querySelector('.square--selected')?.dataset.square`), String(square), `select ${square}`);
}
async function noSelection() {
  assert.equal(await cdp.evaluate(`document.querySelectorAll('.square--selected').length`), 0, 'selection clears');
}

let recording;
try {
  adb('shell','monkey','-p',appId,'-c','android.intent.category.LAUNCHER','1');
  await delay(1000);
  const pid = adb('shell','pidof',appId);
  assert(pid, 'App process must be running');
  adb('forward',`tcp:${port}`,`localabstract:webview_devtools_remote_${pid}`);
  let page;
  const readyBy = Date.now() + 15000;
  while (!page && Date.now() < readyBy) {
    try {
      const pages = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      page = pages.find(p => p.url.endsWith('/ui/index.html'));
    } catch { /* The native shell can be ready before its WebView socket. */ }
    if (!page) await delay(250);
  }
  assert(page, 'Local UI WebView must be debuggable');
  await cdp.open(page.webSocketDebuggerUrl);
  await waitFor(`document.querySelector('#app')?.dataset.ready==='true'`, 'native bridge ready');
  await waitFor(`!!document.querySelector('[data-action="setup-bot"], [data-action="game-back"]')`, 'initial app surface');
  // Native startup cover fades only after the first committed WebView frame.
  await delay(500);
  await startGame();
  if (record) {
    const child = spawn(adbPath, ['-s',serial,'shell','screenrecord','--time-limit','45','/sdcard/knightline-board-flow.mp4'], {stdio:'ignore'});
    recording = new Promise((resolve, reject) => {child.on('error',reject);child.on('exit',code => code===0?resolve():reject(new Error(`screenrecord: ${code}`)));});
    await delay(500);
  }
  const black = await cdp.evaluate(`document.querySelector('[data-square]').dataset.square === '63'`);
  if(mode!=='pass') {
    const rail=await cdp.evaluate(`(()=>{const r=document.querySelector('.eval-rail'),f=r.querySelector('rect');return {top:r.dataset.topSide,y:+f.getAttribute('y'),height:+f.getAttribute('height')}})()`);
    assert.equal(rail.top,black?'white':'black','Game evaluation rail follows board');
    assert(Math.abs(rail.y-(black?0:100-rail.height))<.2,'Game White fill touches White side');
  }
  const pawnA = black ? 12 : 52, pawnB = black ? 11 : 51, knight = black ? 6 : 62;
  const pawnTarget = black ? 28 : 36;
  await beginMeasure();
  await touch(sq(pawnA));
  await expectSelected(pawnA);
  await endMeasure('select pawn', !probe);
  if (!probe) {
    await beginMeasure();
    for (let i = 0; i < 3; i++) {
      await touch(sq(pawnB)); await expectSelected(pawnB);
      await touch(sq(knight)); await expectSelected(knight);
      await touch(sq(knight)); await noSelection();
      await touch(sq(pawnA)); await expectSelected(pawnA);
    }
    await endMeasure('switch pieces and cancel');
    await beginMeasure();
    await cdp.evaluate(`document.querySelector(${JSON.stringify(sq(pawnB))}).focus({preventScroll:true})`);
    await cdp.call('Input.dispatchKeyEvent', {type:'keyDown',key:' ',code:'Space',text:' ',unmodifiedText:' ',windowsVirtualKeyCode:32,nativeVirtualKeyCode:32});
    await cdp.call('Input.dispatchKeyEvent', {type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32,nativeVirtualKeyCode:32});
    await delay(150);
    await expectSelected(pawnB);
    assert.equal(await cdp.evaluate(`document.activeElement.dataset.square`), String(pawnB), 'keyboard focus survives selection');
    await touch(sq(pawnA));
    await endMeasure('keyboard selection and focus');
    // A tap on a non-legal empty square must not submit a move or resize.
    await beginMeasure();
    await touch(sq(32)); await expectSelected(pawnA);
    await endMeasure('illegal destination');
    await beginMeasure();
    await touch(sq(pawnTarget));
    await waitFor(`document.querySelector('.game-name')?.innerText === 'Your move' && !!document.querySelector('[data-action="takeback"]')`, 'move and reply');
    if (mode !== 'pass') await waitFor(`document.querySelector('.eval-state')?.innerText.toLowerCase() === 'live'`, 'updated evaluation');
    await endMeasure('tap move and native reply', false, false);
    await touch('[data-action="takeback"]', true);
    await waitFor(`!!document.querySelector('[data-confirm="accept"]')`, 'takeback confirmation');
    await touch('[data-confirm="accept"]', true);
    await waitFor(`document.querySelector('.game-name')?.innerText === 'Your move'`, 'takeback');
    await cdp.evaluate(`document.querySelector('#main-content').scrollTop=0`);
    await delay(700);
    await beginMeasure();
    await drag(pawnA, pawnTarget);
    await waitFor(`!!document.querySelector('[data-action="takeback"]') && document.querySelector('.game-name')?.innerText==='Your move'`, 'drag move and reply');
    if (mode !== 'pass') await waitFor(`document.querySelector('.eval-state')?.innerText.toLowerCase() === 'live'`, 'drag evaluation');
    await endMeasure('drag move and native reply', false, false);
    if (mode !== 'pass') {
      await touch('[data-action="coach"]', true);
      await waitFor(`!document.querySelector('[data-action="coach"]').disabled`, 'hint ready');
      for (let stage = 0; stage < 3; stage++) {
        if (await cdp.evaluate(`document.querySelector('[data-action="coach"]').innerText.includes('Hide hint')`)) break;
        await touch('[data-action="coach"]', true);
        await delay(300);
      }
      assert(await cdp.evaluate(`document.querySelector('[data-action="coach"]').innerText.includes('Hide hint')`), 'move hint shown');
      await cdp.evaluate(`document.querySelector('#main-content').scrollTop=0`);
      await delay(250);
      await beginMeasure();
      await touch(sq(knight)); await expectSelected(knight);
      await touch(sq(knight)); await noSelection();
      await endMeasure('selection with coaching overlay');
      await touch('[data-action="coach"]', true);
      await waitFor(`document.querySelector('[data-action="coach"]').innerText.trim() === 'Hint'`, 'hint hidden');
    }
  }
  console.log(`PASS: ${probe ? 'probe' : 'touch flow'} (${mode}), font scale ${adb('shell','settings','get','system','font_scale')}`);
} catch (error) {
  console.error(error.stack);
  process.exitCode = 1;
} finally {
  if (cdp.ws?.readyState === WebSocket.OPEN) {
    await cdp.evaluate(`if(window.__boardMeasure) window.__boardMeasure.running=false`).catch(() => {});
  }
  if (recording) {
    console.log('Finishing continuous 45-second recording…');
    await recording;
    adb('pull','/sdcard/knightline-board-flow.mp4',record);
    console.log(`Recording: ${record}`);
  }
  cdp.ws?.close();
}
