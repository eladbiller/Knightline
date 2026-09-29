// Real installed APK: touch flows, native decisions, layout and persistence.
// Destructive ONLY to the emulator's test match. Do not run on a personal save.
// ADB=<path> node tests/webview-workspace-flow.mjs [--record=<path.mp4>]
import assert from 'node:assert/strict';
import {execFileSync, spawn} from 'node:child_process';
import {writeFileSync} from 'node:fs';
const adbPath = process.env.ADB || 'adb';
const serial = process.env.ANDROID_SERIAL || 'emulator-5554';
const adb = (...args) => execFileSync(adbPath, ['-s', serial, ...args], {encoding:'utf8'}).trim();
const delay = ms => new Promise(r => setTimeout(r, ms));
const record = process.argv.find(a => a.startsWith('--record='))?.slice(9);
const output = process.env.QA_OUTPUT || '../../work';
const mode = process.argv.find(a => a.startsWith('--mode='))?.slice(7) || 'all';
let ws, recording, requestId = 0;
const pending = new Map();
function call(method, params={}) {
  return new Promise((resolve,reject) => {
    const id=++requestId;
    const timeout=setTimeout(()=>{pending.delete(id);reject(new Error('Timeout: '+method));},20000);
    pending.set(id,{resolve,reject,timeout}); ws.send(JSON.stringify({id,method,params}));
  });
}
async function evaluate(expression) {
  const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}
async function connect() {
  let page;
  for(let attempt=0;attempt<40;attempt++) {
    try {
      const pid=adb('shell','pidof','com.eladbiller.knightline');
      adb('forward','tcp:9223','localabstract:webview_devtools_remote_'+pid);
      const pages=await (await fetch('http://127.0.0.1:9223/json')).json();
      page=pages.find(p=>p.url.endsWith('/ui/index.html'));
      if(page)break;
    } catch { }
    await delay(400);
  }
  if(!page)throw Error('Android WebView did not become debuggable');
  ws=new WebSocket(page.webSocketDebuggerUrl);
  ws.addEventListener('message',({data})=>{const m=JSON.parse(data),p=pending.get(m.id);if(!p)return;clearTimeout(p.timeout);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);});
  await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
}
async function wait(expression, label, timeout=25000) {
  const until=Date.now()+timeout;
  while(Date.now()<until){if(await evaluate(expression))return;await delay(100);}
  throw Error('Waiting for '+label);
}
async function touch(selector, scroll=false) {
  await wait(`!!document.querySelector(${JSON.stringify(selector)}) && !document.querySelector(${JSON.stringify(selector)}).disabled`,selector);
  if(scroll) { await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'nearest'})`); await delay(160); }
  const p=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),r=e.getBoundingClientRect();if(e.disabled||!r.width||r.y<0||r.bottom>innerHeight+1)throw Error('Inaccessible ${selector}');return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...p,id:1}]});
  await delay(65);await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await delay(230);
}
async function screenshot(name) {
  adb('shell','screencap','-p','/sdcard/knightline-qa.png');
  adb('pull','/sdcard/knightline-qa.png',output+'/'+name+'.png');
}
async function layout(label) {
  const d=await evaluate(`(()=>{const m=document.querySelector('#main-content'),b=document.querySelector('.board'),r=b.getBoundingClientRect(),cells=[...b.querySelectorAll('.square')].map(e=>e.getBoundingClientRect());const buttons=[...m.querySelectorAll('.game-actions button,.review-navigation button,.puzzle-actions button')].map(e=>({text:e.innerText,r:e.getBoundingClientRect().toJSON()}));return {scroll:m.scrollHeight-m.clientHeight,viewport:[innerWidth,innerHeight],board:r.toJSON(),squareCount:cells.length,maxSquareError:Math.max(...cells.map(c=>Math.abs(c.width-c.height))),buttons}})()`);
  assert(d.scroll<=1,`${label}: page scroll ${d.scroll}px`);
  assert(Math.abs(d.board.width-d.board.height)<1,`${label}: board not square`);
  assert(d.board.width>=240,`${label}: board too small ${d.board.width}`);
  assert.equal(d.squareCount,64);
  assert(d.maxSquareError<1,`${label}: cells not square`);
  assert(d.buttons.every(b=>b.r.y>=0&&b.r.bottom<=d.viewport[1]+1),`${label}: action below viewport`);
  const overflow=await evaluate(`(()=>{const parent=document.querySelector('.insight-reading');if(!parent)return 0;const copy=parent.querySelector('.coach-copy');return copy.getBoundingClientRect().bottom-parent.getBoundingClientRect().bottom})()`);
  assert(overflow<2, `${label}: coach text overlaps score/actions by ${overflow}px`);
  console.log(JSON.stringify({label,scroll:d.scroll,viewport:d.viewport,board:Math.round(d.board.width),squareError:d.maxSquareError,actionsVisible:true}));
}
async function home() {
  if(await evaluate(`document.querySelector('#bottom-sheet').dataset.open==='true'`)){adb('shell','input','keyevent','4');await delay(400);}
  for(let n=0;n<3;n++) {
    if(await evaluate(`document.querySelector('#app').dataset.screen==='home'`))return;
    if(await evaluate(`document.querySelector('#app').dataset.screen==='review'`)) await touch('[data-action="review-back"]');
    else if(await evaluate(`document.querySelector('#app').dataset.screen==='puzzle'`)) await touch('[data-action="nav-learn"]');
    else if(await evaluate(`!!document.querySelector('[data-action="nav-home"]')`)) await touch('[data-action="nav-home"]');
    else await touch('[data-nav="home"]');
  }
}
async function move(from,to) {
  await touch(`[data-square="${from}"]`);await touch(`[data-square="${to}"]`);await delay(300);
}
async function reviewFlow() {
  await home();await touch('[data-nav="play"]');await touch('[data-action="setup-pass"]',true);await delay(300);
  // Continuous sheet geometry and scroll stability while changing choices.
  await evaluate(`window.__sheetSamples=[];window.__watchSheet=true;(function f(){if(!window.__watchSheet)return;const r=document.querySelector('#bottom-sheet').getBoundingClientRect();window.__sheetSamples.push([r.x,r.y,r.width,r.height,document.querySelector('#sheet-scroll').scrollTop]);requestAnimationFrame(f)})()`);
  for(const clock of [1,2,3,0,4])await touch(`[data-choice="clock"][data-value="${clock}"]`,true);
  const samples=await evaluate(`window.__watchSheet=false;window.__sheetSamples`);
  for(const s of samples)for(let n=0;n<4;n++)assert(Math.abs(s[n]-samples[0][n])<1,'Setup sheet moved');
  await touch('[data-setup-start]',true);await delay(550);
  if(await evaluate(`!!document.querySelector('[data-confirm="accept"]')`))await touch('[data-confirm="accept"]',true);
  await wait(`document.querySelector('#app').dataset.screen==='game'`,'pass game');
  await layout('pass start');
  await move(53,45); // f3
  await touch('[data-action="moves"]');await delay(350);await touch('[data-native-action="review.open"]',true);
  await wait(`document.querySelector('#app').dataset.screen==='review'`,'live review');
  await layout('live review');
  assert.equal(await evaluate(`!!document.querySelector('[data-review-mode="2"]')`),false,'Unscored best move offered');
  await touch('[data-action="review-back"]');
  await move(12,28);await move(54,38);await move(3,39); // e5 g4 Qh4#
  await wait(`!!document.querySelector('[data-action="review-open"]')`,'checkmate');
  await layout('finished game');
  await touch('[data-action="review-open"]');
  await wait(`document.querySelectorAll('[data-review-mode]').length===3`,'scored native review',60000);
  await wait(`document.querySelector('#bottom-sheet').dataset.sheetKind==='review-overview'`,'review highlights');
  await delay(350);await screenshot('knightline-v03-overview');
  await touch('[data-action="review-start-guided"]',true);await delay(400);
  await touch('.review-ribbon [data-review-jump="4"]');
  await wait(`document.querySelector('.review-ribbon [aria-current="step"]').dataset.reviewJump==='4'`,'last move');
  assert.equal(await evaluate(`document.querySelector('.review-verdict').innerText`),'Best move','Move-quality title missing');
  assert.equal(await evaluate(`document.querySelectorAll('.board-overlay circle,.board-overlay rect,.square--coach-target').length`),0,'Decorative endpoint shapes returned');
  assert(await evaluate(`!!document.querySelector('.chess-arrow--best .chess-arrow-head')`),'Best-move arrow missing');
  await layout('scored review');await screenshot('knightline-v03-review');
  for(const [action,target] of [['review-prev',3],['review-prev',2],['review-next',3]]){await touch(`[data-action="${action}"]`);await wait(`document.querySelector('.review-ribbon [aria-current="step"]').dataset.reviewJump==='${target}'`,'review index '+target);await layout(action);}
  for(const mode of [1,2,0]){await touch(`[data-review-mode="${mode}"]`);await wait(`document.querySelector('[data-review-mode="${mode}"]').getAttribute('aria-selected')==='true'`,'review mode '+mode);await layout('review mode '+mode);}
  await touch('[data-action="review-list"]');await delay(300);await touch('#sheet-scroll [data-review-jump="1"]',true);
  await wait(`document.querySelector('.review-ribbon [aria-current="step"]').dataset.reviewJump==='1'`,'jump first');
  await touch('.review-ribbon [data-review-jump="4"]');
  await wait(`document.querySelector('.review-ribbon [aria-current="step"]').dataset.reviewJump==='4'`,'last move for retry');
  await touch('[data-action="review-retry"]');await wait(`!!document.querySelector('[data-action="review-cancel-retry"]')`,'retry');
  await layout('review retry');
  await move(1,18); // Nc6 is legal, but not the immediate mate.
  await wait(`document.querySelector('.review-insight').innerText.includes('another move')`,'retry wrong move');
  await move(3,39); // Qh4# is Stockfish's best.
  await wait(`document.querySelector('.review-insight').innerText.includes('You found')`,'retry solved');
  await screenshot('knightline-v03-retry');
  await touch('[data-action="review-cancel-retry"]');await delay(300);
  await touch('[data-action="review-details"]');await delay(350);await screenshot('knightline-v03-review-details');
  adb('shell','input','keyevent','4');await delay(400);
  assert.equal(await evaluate(`document.querySelector('#app').dataset.screen`),'review','Back lost review');
  await layout('review after Back');
  await touch('[data-action="review-back"]');
  console.log('PASS: checkmate, live/scored review, tabs, jump navigation, native Back');
}
async function puzzleFlow() {
  await home();await touch('[data-nav="learn"]');await screenshot('knightline-v03-learn');
  await touch('[data-puzzle="0"]',true);await wait(`document.querySelector('#app').dataset.screen==='puzzle'`,'puzzle');
  await layout('puzzle');
  const original=await evaluate(`document.querySelector('.board').innerHTML`);
  await move(60,52); // Legal Re2, not mate. Native keeps position unchanged.
  await wait(`document.querySelector('.puzzle-feedback').innerText.includes('not checkmate')`,'wrong puzzle attempt');
  assert(await evaluate(`document.querySelector('.puzzle-feedback').innerText.includes('not checkmate')`),'Wrong move feedback');
  assert.equal(await evaluate(`document.querySelector('.board').innerHTML`),original,'Wrong attempt changes board');
  for(let n=0;n<4;n++){await touch('[data-action="puzzle-hint"]');await layout('puzzle hint '+n);}
  const solutions=[[60,4],[57,1],[30,13],[22,14],[4,60],[46,54]];
  for(let n=0;n<solutions.length;n++){
    await move(...solutions[n]);await wait(`!!document.querySelector('[data-action="puzzle-next"]')`,'solved '+n);await layout('solved puzzle '+n);
    if(n===0){await screenshot('knightline-v03-puzzle');assert(await evaluate(`document.querySelector('.puzzle-feedback').innerText.includes('with help')`),'Hiding hint erased assistance');}
    if(n<solutions.length-1){await touch('[data-action="puzzle-next"]');await wait(`document.querySelector('.puzzle-status').innerText.includes('${n+2} / 6') && !!document.querySelector('[data-action="puzzle-hint"]')`,'next puzzle');}
  }
  await touch('[data-action="puzzle-retry"]');await wait(`!!document.querySelector('[data-action="puzzle-hint"]')`,'puzzle retry reset');
  await touch('[data-action="nav-learn"]');
  assert.equal(await evaluate(`document.querySelectorAll('.puzzle-number .ui-icon').length`),6,'Puzzle progress');
  await touch('[data-nav="home"]');await touch('[data-action="resume"]',true);
  await wait(`document.querySelector('#app').dataset.screen==='game'`,'saved game');
  assert(await evaluate(`!!document.querySelector('[data-action="review-open"]')`),'Puzzles replaced saved game');
  await touch('[data-action="review-open"]');await wait(`document.querySelector('#app').dataset.screen==='review'`,'saved review');assert(await evaluate(`document.querySelector('.review-counter').innerText.includes('4 moves')`),'Saved match move count changed');
  console.log('PASS: all 6 puzzles, wrong attempt, hints, assisted solve, retry, saved-match isolation');
}
async function persistenceFlow() {
  await home(); await touch('[data-nav="learn"]');
  assert.equal(await evaluate(`document.querySelectorAll('.puzzle-number .ui-icon').length`),6,'Puzzle completion lost on restart');
  await touch('[data-nav="home"]'); await touch('[data-action="resume"]',true);
  await wait(`document.querySelector('#app').dataset.screen==='game'`,'saved match after restart');
  assert(await evaluate(`!!document.querySelector('[data-action="review-open"]')`),'Finished game lost on restart');
  console.log('PASS: persisted puzzle collection and independent match after process restart');
}
async function keyboardFlow() {
  await home();await touch('[data-nav="play"]');await touch('[data-action="online-menu"]',true);await delay(400);
  const height=await evaluate('innerHeight');await touch('#room-code',true);
  await wait(`innerHeight<${height-100}`,'Android keyboard resize');
  await call('Input.insertText',{text:'QA1234'});await delay(300);
  const field=await evaluate(`(()=>{const e=document.querySelector('#room-code'),r=e.getBoundingClientRect();return {value:e.value,bottom:r.bottom,top:r.top,height:innerHeight}})()`);
  assert.equal(field.value,'QA1234');assert(field.top>=0&&field.bottom<=field.height,'Keyboard covers input');
  await screenshot('knightline-v03-keyboard');
  adb('shell','input','keyevent','4');await wait(`innerHeight>=${height-1}`,'keyboard dismissal');
  adb('shell','input','keyevent','4');await wait(`document.querySelector('#bottom-sheet').dataset.open!=='true'`,'sheet dismissal');
  console.log('PASS: Android keyboard, visible editable field, Back restores viewport and closes sheet');
}
try {
  adb('shell','am','start','-n','com.eladbiller.knightline/com.traillink.KnightlineActivity');await delay(1000);await connect();
  await wait(`!!document.querySelector('#bottom-sheet') && !!document.querySelector('#main-content').firstElementChild`,'loaded app');await delay(600);
  if(record){const child=spawn(adbPath,['-s',serial,'shell','screenrecord','--time-limit','45','--bit-rate','3000000','/sdcard/knightline-workspace-flow.mp4']);recording=new Promise(r=>child.on('close',r));}
  if(mode==='all'||mode==='review')await reviewFlow();
  if(mode==='all'||mode==='puzzles')await puzzleFlow();
  if(mode==='persist')await persistenceFlow();
  if(mode==='keyboard')await keyboardFlow();
  console.log('PASS: workspace flow at font '+adb('shell','settings','get','system','font_scale'));
} catch(e){console.error(e.stack);if(ws?.readyState===1){console.error(await evaluate('document.body.innerText'));await screenshot('knightline-v03-failure');}process.exitCode=1;}
finally{if(recording){await recording;adb('pull','/sdcard/knightline-workspace-flow.mp4',record);}ws?.close();}
