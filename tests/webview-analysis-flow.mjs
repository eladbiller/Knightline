// Real installed APK: touch flows, native decisions, layout and persistence.
// Destructive ONLY to the emulator's test match. Do not run on a personal save.
// ADB=<path> node tests/webview-analysis-flow.mjs [--record=<path.mp4>]
import assert from 'node:assert/strict';
import {execFileSync, spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
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
  await wait(`document.querySelector('#app')?.dataset.ready==='true'`,'native bridge ready');
}
async function wait(expression, label, timeout=25000) {
  const until=Date.now()+timeout;
  while(Date.now()<until){if(await evaluate(expression))return;await delay(100);}
  throw Error('Waiting for '+label);
}
async function touch(selector, scroll=false) {
  await wait(`!!document.querySelector(${JSON.stringify(selector)}) && !document.querySelector(${JSON.stringify(selector)}).disabled`,selector);
  await wait(`(()=>{const s=document.querySelector(${JSON.stringify(selector)}).closest('#bottom-sheet');return !s || s.dataset.open==='true' && !s.getAnimations().some(a=>a.playState==='running') && Math.abs(new DOMMatrixReadOnly(getComputedStyle(s).transform).m42)<.1})()`,'settled sheet for '+selector,5000);
  if(scroll) { await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'nearest'})`); await delay(160); }
  const p=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),r=e.getBoundingClientRect();if(e.disabled||!r.width||r.y<0||r.bottom>innerHeight+1)throw Error('Inaccessible ${selector}');return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  await wait(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),hit=document.elementFromPoint(${p.x},${p.y});return e===hit||e.contains(hit)})()`,'uncovered control: '+selector,1500);
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
  const header=await evaluate(`(()=>{const e=document.querySelector('[data-action="review-overview"]');if(!e)return null;const range=document.createRange();range.selectNodeContents(e);return {height:range.getBoundingClientRect().height,line:parseFloat(getComputedStyle(e).lineHeight),right:e.getBoundingClientRect().right,viewport:innerWidth}})()`);
  if(header){assert(header.height<=header.line+2,`${label}: header label wrapped`);assert(header.right<=header.viewport,`${label}: header overflow`);}
  const overflow=await evaluate(`(()=>{const parent=document.querySelector('.insight-reading');if(!parent)return 0;const copy=parent.querySelector('.coach-copy');return copy.getBoundingClientRect().bottom-parent.getBoundingClientRect().bottom})()`);
  assert(overflow<2, `${label}: coach text overlaps score/actions by ${overflow}px`);
  console.log(JSON.stringify({label,scroll:d.scroll,viewport:d.viewport,board:Math.round(d.board.width),squareError:d.maxSquareError,actionsVisible:true}));
}
async function beginFrameAudit() {
  await evaluate(`(()=>{
    window.__flowAudit={frames:0,uiFrames:0,sheetFrames:0,errors:[],last:null,running:true};
    function frame(){const a=window.__flowAudit;if(!a.running)return;const board=document.querySelector('.board');
      a.uiFrames++;
      const sheet=document.querySelector('#bottom-sheet');
      if(sheet.dataset.open==='true'){
        a.sheetFrames++;const r=sheet.getBoundingClientRect();
        if(Math.abs(r.x-(innerWidth-r.width)/2)>1)a.errors.push('Sideways sheet displacement');
      }
      for(const e of document.querySelectorAll('.learn-tabs button,.nav-item,.setting-toggle,.lesson-card,#sheet-scroll button')){
        const box=e.getBoundingClientRect();if(!box.width||!box.height)continue;
        const range=document.createRange();range.selectNodeContents(e);const text=range.getBoundingClientRect();
        if(text.height>0&&text.bottom>box.bottom+2)a.errors.push('Navigation/sheet text clipped: '+e.textContent);
        if(e.scrollWidth>e.clientWidth+2)a.errors.push('Control overflows horizontally: '+e.textContent);
      }
      if(board){a.frames++;const r=board.getBoundingClientRect(),cells=[...board.querySelectorAll('.square')];
        if(Math.abs(r.width-r.height)>1||cells.length!==64||cells.some(e=>{const c=e.getBoundingClientRect();return Math.abs(c.width-c.height)>1}))a.errors.push('Unequal board cells');
        const scale=visualViewport?.scale||1;if(scale!==1)a.errors.push('Viewport zoom '+scale);
        const screen=document.querySelector('#app').dataset.screen;
        const key=screen+':'+innerWidth+':'+innerHeight+':'+(document.querySelector('.review-workspace')?.dataset.positionKey||'');
        if(a.last?.key===key&&screen==='review'&&Math.abs(a.last.width-r.width)>1)a.errors.push('Unchanged review position resized');
        a.last={key,width:r.width};
        for(const e of document.querySelectorAll('.review-tools button,.review-navigation button,.puzzle-actions button,.puzzle-status strong,.review-verdict,.player-name,.player-meta')){
          const box=e.getBoundingClientRect();if(!box.width||!box.height)continue;const range=document.createRange();range.selectNodeContents(e);const text=range.getBoundingClientRect();
          if(text.height>0&&text.bottom>box.bottom+2)a.errors.push('Text below control: '+e.textContent);
        }
      }requestAnimationFrame(frame);
    }requestAnimationFrame(frame);
  })()`);
}
async function endFrameAudit(){
  const result=await evaluate(`(()=>{const a=window.__flowAudit;if(!a)return null;a.running=false;return {frames:a.frames,uiFrames:a.uiFrames,sheetFrames:a.sheetFrames,errors:[...new Set(a.errors)]}})()`);
  if(result){console.log('Continuous frame audit: '+JSON.stringify(result));assert.deepEqual(result.errors,[],'Flow geometry/text regression');}
}
async function home() {
  for(let n=0;n<5 && await evaluate(`document.querySelector('#bottom-sheet').dataset.open==='true'`);n++){adb('shell','input','keyevent','4');await delay(400);}
  for(let n=0;n<6;n++) {
    if(await evaluate(`document.querySelector('#app').dataset.screen==='home'`))return;
    if(await evaluate(`document.querySelector('#app').dataset.screen==='review'`)) await touch('[data-action="review-back"]');
    else if(await evaluate(`document.querySelector('#app').dataset.screen==='puzzle'`)) await touch('[data-action="nav-learn"]');
    else if(await evaluate(`!!document.querySelector('[data-action="game-back"]')`)) await touch('[data-action="game-back"]');
    else await touch('[data-nav="home"]');
  }
}
async function move(from,to,promotion) {
  const old=await evaluate(`document.querySelector('.review-workspace')?.dataset.positionKey || null`);
  await touch(`[data-square="${from}"]`);await touch(`[data-square="${to}"]`);await delay(300);
  if(promotion)await touch(`[data-analysis-promotion="${promotion}"]`);
  if(old)await wait(`document.querySelector('.review-workspace').dataset.positionKey!==${JSON.stringify(old)}`,'native review move');
}
async function noBest(label) {
  await wait(`document.querySelector('[data-action="review-best"]').getAttribute('aria-pressed')==='false'`,'best hidden after '+label);
  assert.equal(await evaluate(`document.querySelectorAll('[data-arrow-role="best"]').length`),0,label+': best arrow leaked');
  assert.equal(await evaluate(`document.querySelector('[data-action="review-best"]').getAttribute('aria-pressed')`),'false');
}
async function evaluated() {
  await wait(`document.querySelector('[data-review-evaluation-state]').innerText.startsWith('Live') || document.querySelector('[data-review-evaluation-state]').innerText==='Final position'`,'live position evaluation',30000);
  return evaluate(`document.querySelector('[data-review-evaluation]').innerText`);
}
async function railOrientation(blackAtBottom) {
  const d=await evaluate(`(()=>{const r=document.querySelector('.eval-rail'),f=r.querySelector('rect');return {first:document.querySelector('[data-square]').dataset.square,top:r.dataset.topSide,y:+f.getAttribute('y'),height:+f.getAttribute('height')}})()`);
  assert.equal(d.first,blackAtBottom?'63':'0','Board orientation');
  assert.equal(d.top,blackAtBottom?'white':'black','Evaluation rail follows board');
  assert(Math.abs(d.y-(blackAtBottom?0:100-d.height))<.2,'White fill touches White side');
}
async function reviewFlow() {
  await home();await touch('[data-nav="play"]');await touch('[data-action="setup-pass"]',true);await delay(350);
  // Wait for the opening transition itself, not a wall-clock guess: a busy
  // emulator can deliver the first rendered animation frame after that delay.
  // Settings must stay fixed once open; do not count the intentional slide-up.
  await wait(`(()=>{const e=document.querySelector('#bottom-sheet');return e.dataset.open==='true' && !e.getAnimations().some(a=>a.playState==='running') && Math.abs(new DOMMatrixReadOnly(getComputedStyle(e).transform).m42)<.1})()`,'setup opening transition');
  await evaluate(`window.__sheetSamples=[];window.__watchSheet=true;(function f(){if(!window.__watchSheet)return;const r=document.querySelector('#bottom-sheet').getBoundingClientRect();window.__sheetSamples.push([r.x,r.y,r.width,r.height]);requestAnimationFrame(f)})()`);
  for(const clock of [1,2,3,0,4])await touch(`[data-choice="clock"][data-value="${clock}"]`,true);
  const samples=await evaluate(`window.__watchSheet=false;window.__sheetSamples`);
  for(const s of samples)for(let n=0;n<4;n++)assert(Math.abs(s[n]-samples[0][n])<1,'Setup sheet shifted');
  await touch('[data-setup-start]',true);
  await wait(`document.querySelector('#app').dataset.screen==='game' || !!document.querySelector('[data-confirm="accept"]')`,'start or replacement confirmation');
  if(await evaluate(`!!document.querySelector('[data-confirm="accept"]')`))await touch('[data-confirm="accept"]',true);
  await wait(`document.querySelector('#app').dataset.screen==='game'`,'test game');
  await move(53,45);
  await touch('[data-action="moves"]');await touch('[data-native-action="review.open"]',true);
  await wait(`document.querySelector('#app').dataset.screen==='review'`,'Black-oriented live review');
  await evaluated();await railOrientation(false);await screenshot('knightline-v05-live-review');
  await touch('[data-action="review-back"]');await wait(`document.querySelector('#app').dataset.screen==='game'`,'resume original game');
  await move(12,28);await move(54,38);await move(3,39);
  await wait(`!!document.querySelector('[data-action="review-open"]')`,'mate');
  await touch('[data-action="review-open"]');
  await wait(`document.querySelector('#bottom-sheet').dataset.sheetKind==='review-overview'`,'overview');
  await wait(`document.querySelector('.review-overview-status').innerText.includes('4 / 4')`,'full saved analysis',60000);
  assert(await evaluate(`document.querySelector('[data-action="review-start-guided"]').getBoundingClientRect().bottom < innerHeight`),'Key moments CTA below fold');
  assert(await evaluate(`document.querySelector('.overview-key-list').compareDocumentPosition(document.querySelector('.overview-statistics')) & Node.DOCUMENT_POSITION_FOLLOWING`),'Key moments after move statistics');
  assert(await evaluate(`!!document.querySelector('.overview-graph .analysis-chart') && !document.querySelector('.overview-graph').closest('details')`),'Highlights graph is missing or collapsed');
  assert(await evaluate(`document.querySelector('.review-player-key').textContent.includes('White') && document.querySelector('.review-player-key').textContent.includes('Black')`),'Player key missing');
  assert(await evaluate(`[...document.querySelectorAll('.highlight-player')].every(e=>/White|Black/.test(e.innerText))`),'Highlight owner missing');
  await touch('[data-review-filter="black"]',true);
  assert(await evaluate(`[...document.querySelectorAll('.highlight-player')].every(e=>e.innerText.includes('Black'))`),'Black filter leaks White');
  await touch('[data-review-filter="white"]',true);
  assert(await evaluate(`[...document.querySelectorAll('.highlight-player')].every(e=>e.innerText.includes('White'))`),'White filter leaks Black');
  await screenshot('knightline-v04-highlights');
  await touch('[data-review-filter="both"]',true);await touch('[data-action="review-start-guided"]',true);
  await touch('.review-ribbon [data-review-jump="4"]');await wait(`document.querySelector('.review-verdict').innerText==='Best move'`,'Best title');
  await noBest('review entry');assert.equal(await evaluated(),'−M0','After-move checkmate score');
  assert(await evaluate(`document.querySelector('[data-square="3"]').getAttribute('aria-label').includes('queen')`),'Played queen not at origin before move');
  assert.equal(await evaluate(`document.querySelectorAll('[data-review-mode]').length`),0,'Before/after toggle still present');
  assert(await evaluate(`+getComputedStyle(document.querySelector('.piece-svg')).zIndex > +getComputedStyle(document.querySelector('.board-overlay')).zIndex`),'Arrow paints over piece');
  assert(await evaluate(`(()=>{const p=document.querySelector('[data-square="3"] .piece-svg'),a=document.querySelector('.board-overlay'),r=p.getBoundingClientRect();const pp=p.style.pointerEvents,ap=a.style.pointerEvents;try{p.style.pointerEvents='all';a.style.pointerEvents='all';return !!document.elementFromPoint(r.x+r.width/2+1,r.y+r.height/2+1)?.closest('.piece-svg');}finally{p.style.pointerEvents=pp;a.style.pointerEvents=ap;}})()`),'Rendered arrow layer is above queen at its origin');
  await railOrientation(false);
  assert(await evaluate(`!!document.querySelector('[data-arrow-role="played"].chess-arrow--best')`),'Played best arrow is not green');
  const orientation=await evaluate(`document.querySelector('[data-square]').dataset.square`);
  await layout('review default');await screenshot('knightline-v04-review');
  await touch('[data-action="review-best"]');await wait(`!!document.querySelector('[data-arrow-role="best"]')`,'explicit best');
  await touch('[data-action="review-prev"]');await wait(`document.querySelector('.review-ribbon [aria-current="step"]').dataset.reviewJump==='3'`,'previous');
  await noBest('next/previous hides best');
  assert(await evaluate(`!!document.querySelector('[data-arrow-role="played"].chess-arrow--blunder')`),'Blunder arrow not graded red');
  await touch('.review-ribbon [data-review-jump="4"]');
  await wait(`document.querySelector('.review-ribbon [aria-current="step"]').dataset.reviewJump==='4'`,'mate selected');
  const before=await evaluated();assert.equal(before,'−M0','Saved move after-score missing');
  assert(await evaluate(`document.querySelector('[data-action="review-key"]').disabled`),'Final key navigation can wrap');
  await touch('[data-action="review-explore"]');
  await wait(`document.querySelector('.review-verdict').innerText==='Exploring'`,'explicit exploration');
  assert.match(await evaluated(),/−M[1-9]/,'Explore must evaluate before the saved move');
  await move(1,18); // Nc6: legal, not the searched mate. Must be accepted.
  await wait(`document.querySelector('.review-position-line strong').innerText==='Your analysis'`,'free analysis');
  const after=await evaluated();assert.notEqual(after,before,'Free move did not change evaluation');
  await noBest('free move hides best');
  assert.equal(await evaluate(`document.querySelectorAll('.board-overlay .chess-arrow').length`),0,'Alternative line has automatic arrows');
  assert.equal(await evaluate(`document.querySelectorAll('.square--last').length`),2,'Alternative line missing game-style last-move highlights');
  await move(52,44); // White e3. Both sides remain controllable.
  await wait(`document.querySelector('.review-position-line .coach-kicker').innerText.toLowerCase().includes('black')`,'Black turn');
  await move(6,21); // Black Nf6.
  await evaluated();
  assert.equal(await evaluate(`document.querySelector('[data-square]').dataset.square`),orientation,'Review board rotated');
  await layout('free both-side analysis');await screenshot('knightline-v04-analysis');
  // Reevaluation must not remount the board or steal keyboard focus.
  await evaluate(`window.__reviewBoard=document.querySelector('.board');document.querySelector('[data-square="57"]').focus({preventScroll:true})`);
  await touch('[data-action="review-evaluate"]');await evaluated();
  assert(await evaluate(`window.__reviewBoard===document.querySelector('.board')`),'Engine remounted board');
  await touch('[data-action="review-best"]');await wait(`!!document.querySelector('[data-arrow-role="best"]')`,'branch best reveal');
  await touch('[data-action="review-undo"]');await wait(`document.querySelector('.review-position-line .coach-kicker').innerText.toLowerCase().includes('black')`,'undo restored Black turn');await noBest('undo hides best');await evaluated();
  await touch('[data-action="review-reset"]');await wait(`document.querySelector('.review-verdict').innerText==='Best move'`,'restore saved game');
  assert.equal(await evaluated(),'−M0','Reset lost saved after-move score');
  await move(1,18);
  await touch('[data-action="review-prev"]');
  await wait(`document.querySelector('.review-verdict').innerText==='Best move'`,'Previous first exits variation');
  assert.equal(await evaluate(`document.querySelector('.review-ribbon [aria-current="step"]').dataset.reviewJump`),'4','Previous skipped selected move');
  await move(1,18);await touch('[data-action="review-next"]');
  await wait(`document.querySelector('.review-verdict').innerText==='Best move'`,'Next first exits variation');
  assert.equal(await evaluate(`document.querySelector('.review-ribbon [aria-current="step"]').dataset.reviewJump`),'4','Next skipped selected move');
  await touch('.review-ribbon [data-review-jump="1"]');
  await wait(`document.querySelector('.review-ribbon [aria-current="step"]').dataset.reviewJump==='1'`,'first saved move selected');
  let keyIndex=1;
  while(!await evaluate(`document.querySelector('[data-action="review-key"]').disabled`)){
    await touch('[data-action="review-key"]');
    await wait(`Number(document.querySelector('.review-ribbon [aria-current="step"]').dataset.reviewJump)!==${keyIndex}`,'next key native response',5000);
    const next=Number(await evaluate(`document.querySelector('.review-ribbon [aria-current="step"]').dataset.reviewJump`));
    assert(next>keyIndex,'Key move wrapped or failed to advance');keyIndex=next;
  }
  await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  assert.equal(Number(await evaluate(`document.querySelector('.review-ribbon [aria-current="step"]').dataset.reviewJump`)),keyIndex,'Disabled next key wrapped');
  await touch('.review-ribbon [data-review-jump="4"]');
  await wait(`document.querySelector('.review-ribbon [aria-current="step"]').dataset.reviewJump==='4'`,'rapid navigation settled');
  await delay(2200);assert.equal(await evaluated(),'−M0','Stale analysis overwrote after-move score');
  await touch('[data-action="review-list"]');await touch('#sheet-scroll [data-review-jump="1"]',true);await noBest('jump hides best');
  await touch('[data-action="review-details"]');adb('shell','input','keyevent','4');await delay(400);
  assert.equal(await evaluate(`document.querySelector('#app').dataset.screen`),'review','Back left review');
  await touch('[data-action="review-back"]');
  await wait(`document.querySelector('#app').dataset.screen==='home'`,'completed review exits Home');
  assert.equal(await evaluate(`document.querySelectorAll('[data-action="resume"]').length`),0,'Finished game advertised Resume');
  assert(await evaluate(`document.querySelector('[data-action="review-open"]').innerText.includes('Review last game')`),'Missing review-last-game entry');
  console.log('PASS: graded played arrows, explicit best, two-side legal analysis, evaluation changes, fixed orientation, undo/reset, filters and native Back');
}
const pack=readFileSync('app/src/main/assets/puzzles/lichess-pack.tsv','utf8').trim().split(/\r?\n/).map((line,i)=>{const f=line.split('\t');return {index:i+6,rating:Number(f[3]),moves:f[2].split(' '),band:i<50?'foundation':i<100?'intermediate':i<150?'challenging':i<200?'advanced':'expert'};});
const square=s=>(8-Number(s[1]))*8+s.charCodeAt(0)-97;
async function puzzleMove(uci) {
  await move(square(uci.slice(0,2)),square(uci.slice(2,4)));
  if(uci.length===5){await touch(`[data-analysis-promotion="${' pnbrqk'.indexOf(uci[4])}"]`);}
}
async function solve(entry) {
  for(let i=1;i<entry.moves.length;i+=2){
    await puzzleMove(entry.moves[i]);
    await wait(i+2>=entry.moves.length?`!!document.querySelector('[data-action="puzzle-next"]')`:`document.querySelector('.puzzle-status').innerText.includes('${(i+1)/2} /') && !document.querySelector('[data-action="puzzle-hint"]').disabled`,'puzzle reply / solve');
    await layout('puzzle '+entry.index+' step '+i);
  }
}
async function openPuzzle(entry) {
  await home();await touch('[data-nav="learn"]');await touch(`[data-puzzle-filter="${entry.band}"]`,true);
  const page=Math.floor((entry.index-6)%50/10);
  for(let i=0;i<page;i++)await touch('[data-puzzle-page="1"]',true);
  await touch(`[data-puzzle="${entry.index}"]`,true);await wait(`document.querySelector('#app').dataset.screen==='puzzle'`,'puzzle');
}
async function puzzleFlow() {
  await home();await touch('[data-nav="learn"]');await screenshot('knightline-v04-learn');
  await touch('[data-puzzle-filter="warmup"]',true);await touch('[data-puzzle="0"]',true);
  await move(60,52);await wait(`document.querySelector('.puzzle-feedback').innerText.includes('misses the tactic')`,'wrong move feedback');
  assert(await evaluate(`document.querySelector('[data-square="52"]').getAttribute('aria-label').includes('rook')`),'Legal wrong move was not played');
  await touch('[data-action="puzzle-undo"]');
  await wait(`!!document.querySelector('[data-action="puzzle-hint"]')`,'native Undo complete');
  assert(await evaluate(`document.querySelector('[data-square="60"]').getAttribute('aria-label').includes('rook')`),'Undo did not restore puzzle');
  for(let i=0;i<4;i++)await touch('[data-action="puzzle-hint"]');
  await move(60,4);await wait(`!!document.querySelector('[data-action="puzzle-next"]')`,'assisted solve');
  await touch('[data-action="nav-learn"]');await touch('[data-puzzle-filter="missed"]',true);
  assert(await evaluate(`!!document.querySelector('[data-puzzle="0"]')`),'Assisted puzzle missing from practice');
  await touch('[data-puzzle="0"]',true);await move(60,4);await wait(`!!document.querySelector('[data-action="puzzle-next"]')`,'clean retry');
  await touch('[data-action="nav-learn"]');await touch('[data-puzzle-filter="missed"]',true);
  assert.equal(await evaluate(`!!document.querySelector('[data-puzzle="0"]')`),true,'Retry erased lifetime mistake');
  assert(!await evaluate(`document.querySelector('[data-puzzle="0"]').innerText.includes('Unassisted')`),'Known answer received clean credit');
  const selected=[pack[0],pack[50],pack[100],pack[150],pack[200]];
  const promotion=pack.find(p=>p.moves.some((m,i)=>i%2===1&&m.length===5));if(promotion&&!selected.includes(promotion))selected.push(promotion);
  for(const entry of selected){await openPuzzle(entry);await solve(entry);await screenshot('knightline-v04-puzzle-'+entry.band);}
  await home();await wait(`!!document.querySelector('[data-action="review-open"]')`,'independent saved mate');
  await touch('[data-action="review-open"]');await wait(`document.querySelector('#app').dataset.screen==='review'`,'saved review');
  assert(await evaluate(`document.querySelector('.review-counter').innerText.includes('4 moves')`),'Puzzles changed saved game');
  console.log('PASS: difficulty packs, missed/assisted/clean solves, complete multi-move replies, promotion, saved-game isolation');
}
async function persistenceFlow() {
  await home();await touch('[data-nav="learn"]');await touch('[data-learn-section="puzzles"]',true);await touch('[data-puzzle-filter="warmup"]',true);
  await touch('[data-puzzle="1"]',true);await touch('[data-action="puzzle-hint"]');
  await touch('[data-action="nav-learn"]');await delay(350);
  ws.close();adb('shell','am','force-stop','com.eladbiller.knightline');
  adb('shell','am','start','-n','com.eladbiller.knightline/com.traillink.KnightlineActivity');
  await delay(1000);await connect();await wait(`!!document.querySelector('[data-nav="learn"]')`,'restart');
  await touch('[data-nav="learn"]');await touch('[data-learn-section="puzzles"]',true);await touch('[data-puzzle-filter="missed"]',true);
  assert(await evaluate(`!!document.querySelector('[data-puzzle="1"]')`),'Missed puzzle lost on restart');
  await touch('[data-puzzle-filter="warmup"]',true);
  assert(!await evaluate(`document.querySelector('[data-puzzle="0"]').innerText.includes('Unassisted')`),'Restart erased failure history');
  await home();await wait(`!!document.querySelector('[data-action="review-open"]')`,'saved match after restart');
  console.log('PASS: clean progress, missed collection and independent saved match survive process restart');
}
async function botReviewFlow() {
  await touch('[data-action="game-menu"]');await touch('[data-native-action="match.resign"]',true);
  await touch('[data-confirm="accept"]',true);await wait(`!!document.querySelector('[data-action="review-open"]')`,'resigned bot game');
  await touch('[data-action="review-open"]');
  await wait(`document.querySelector('.review-overview-status')?.innerText.includes('ANALYSIS READY')`,'bot review analysis',60000);
  assert(await evaluate(`document.querySelector('.review-player-key').textContent.includes('You') && document.querySelector('.review-player-key').textContent.includes('Stockfish')`),'Bot identity missing');
  await touch('[data-review-filter="mine"]',true);
  assert(await evaluate(`[...document.querySelectorAll('.highlight-player')].every(e=>e.innerText.startsWith('You'))`),'My moves contains opponent');
  await touch('[data-review-filter="both"]',true);
  adb('shell','input','keyevent','4');await noBest('bot review entry');await evaluated();await layout('bot review');
  console.log('PASS: bot/player identities, My moves filter, review after resignation');
}
async function challengeFlow() {
  for(const entry of [pack[150],pack.find(p=>p.moves.some((m,i)=>i%2===1&&m.length===5))]) {
    await openPuzzle(entry);await solve(entry);
  }
  console.log('PASS: continuous advanced puzzle and promotion flow');
}
async function reviewPromotionFlow() {
  await home();await touch('[data-action="review-open"]',true);
  await wait(`document.querySelector('#bottom-sheet').dataset.sheetKind==='review-overview'`,'review overview');
  adb('shell','input','keyevent','4');await wait(`document.querySelector('#sheet-backdrop').hidden`,'overview closed');
  await touch('.review-ribbon [data-review-jump="1"]');
  await wait(`document.querySelector('.review-ribbon [aria-current="step"]').dataset.reviewJump==='1'`,'first move');
  const orientation=await evaluate(`document.querySelector('[data-square]').dataset.square`);
  for(const m of [[48,32],[15,31],[32,24],[31,39],[24,16],[39,47],[16,9],[47,54],[9,0,2]])await move(...m);
  await wait(`document.querySelector('[data-square="0"]').getAttribute('aria-label').toLowerCase().includes('knight')`,'review knight underpromotion');
  assert.equal(await evaluate(`document.querySelector('[data-square]').dataset.square`),orientation,'Promotion rotated review');
  await evaluated();await layout('review underpromotion');
  await touch('[data-action="review-undo"]');
  await wait(`document.querySelector('[data-square="9"]').getAttribute('aria-label').toLowerCase().includes('pawn')`,'undo promotion restored pawn');
  await touch('[data-action="review-reset"]');await wait(`document.querySelector('.review-position-line strong').innerText!=='Your analysis'`,'return to saved game');
  console.log('PASS: review underpromotion, both-side nine-ply line, Undo and reset');
}

async function libraryFeedbackFlow() {
  await home();
  assert(!await evaluate(`document.querySelector('#main-content').innerText.includes('Local only')`),'Unnecessary Home box remains');
  await touch('[data-action="nav-history"]',true);
  await wait(`document.querySelector('#app').dataset.screen==='history' && !!document.querySelector('[data-archive-id]')`,'native library');
  const oldId=await evaluate(`[...document.querySelectorAll('[data-archive-id]')].find(e=>e.innerText.includes('4 plies')&&e.innerText.includes('0–1'))?.dataset.archiveId`);
  assert(oldId,'Completed test game not archived');
  await home();await touch('[data-nav="play"]');await touch('[data-action="setup-pass"]',true);
  await touch('[data-choice="clock"][data-value="4"]',true);await touch('[data-setup-start]',true);
  await wait(`document.querySelector('#app').dataset.screen==='game' || !!document.querySelector('[data-confirm="accept"]')`,'start or replacement confirmation');
  if(await evaluate(`!!document.querySelector('[data-confirm="accept"]')`))await touch('[data-confirm="accept"]',true);
  await wait(`document.querySelector('#app').dataset.screen==='game'`,'new active game');await move(53,45);
  await home();await touch('[data-action="nav-history"]',true);
  const count=await evaluate(`document.querySelectorAll('[data-archive-id]').length`);
  await touch(`[data-archive-id="${oldId}"]`,true);
  await wait(`document.querySelector('#bottom-sheet').dataset.sheetKind==='review-overview'`,'archived highlights');
  adb('shell','input','keyevent','4');await wait(`document.querySelector('#sheet-backdrop').hidden`,'highlights dismissed');
  assert(await evaluate(`document.querySelector('.review-counter').innerText.includes('4 moves')`),'Opened wrong archived game');
  await move(52,36);await move(12,28);await evaluated();await layout('archived alternate line');
  await touch('[data-action="review-back"]');await wait(`document.querySelector('#app').dataset.screen==='history'`,'archive Back returns Games');await home();
  await touch('[data-action="resume"]',true);await wait(`document.querySelector('#app').dataset.screen==='game'`,'active game resumes');
  assert(await evaluate(`document.querySelector('[data-square="45"]').getAttribute('aria-label').includes('pawn')&&document.querySelector('[data-square="52"]').getAttribute('aria-label').includes('pawn')&&document.querySelector('[data-square="36"]').getAttribute('aria-label').includes('empty')`),'Archive changed active board');
  await home();await touch('[data-nav="profile"]');
  for(const key of ['sound','vibration']) {
    if(await evaluate(`document.querySelector('[data-feedback="${key}"]').getAttribute('aria-checked')==='true'`))await touch(`[data-feedback="${key}"]`,true);
  }
  await touch('[data-action="feedback-preview"]',true);
  await touch('[data-feedback="sound"]',true);await touch('[data-action="feedback-preview"]',true);
  await screenshot('knightline-v05-feedback');
  ws.close();adb('shell','am','force-stop','com.eladbiller.knightline');
  adb('shell','am','start','-n','com.eladbiller.knightline/com.traillink.KnightlineActivity');await delay(1000);await connect();
  await wait(`!!document.querySelector('[data-nav="profile"]')`,'restarted');await touch('[data-nav="profile"]');
  assert.equal(await evaluate(`document.querySelector('[data-feedback="sound"]').getAttribute('aria-checked')`),'true','Sound preference lost');
  assert.equal(await evaluate(`document.querySelector('[data-feedback="vibration"]').getAttribute('aria-checked')`),'false','Vibration preference lost');
  await touch('[data-feedback="vibration"]',true);await touch('[data-action="feedback-preview"]',true);
  await touch('[data-nav="home"]');await touch('[data-action="nav-history"]',true);
  assert.equal(await evaluate(`document.querySelectorAll('[data-archive-id]').length`),count,'Library changed across restart');
  await screenshot('knightline-v05-library');
  await home();await touch('[data-action="resume"]',true);
  await touch('[data-action="game-menu"]');await touch('[data-native-action="match.clear"]',true);await touch('[data-confirm="accept"]',true);
  await wait(`document.querySelector('#app').dataset.screen==='home'`,'clear active save');
  assert.equal(await evaluate(`document.querySelectorAll('[data-action="resume"]').length`),0,'Active save not cleared');
  await touch('[data-action="nav-history"]',true);await touch(`[data-archive-id="${oldId}"]`,true);
  await wait(`document.querySelector('#app').dataset.screen==='review'`,'archive without active game');
  adb('shell','input','keyevent','4');await wait(`document.querySelector('#sheet-backdrop').hidden`,'overview closed');
  await move(52,36);await evaluated();await touch('[data-action="review-back"]');
  await wait(`document.querySelector('#app').dataset.screen==='history'`,'review-only exit to Games');
  console.log('PASS: archive isolation, persisted library, independent feedback preferences, review without active save, contextual Games exits');
}
async function startLessonUI(index,side,endgame=false,pattern=false){
  await home();await touch('[data-nav="learn"]');await touch(`[data-learn-section="${endgame?'endgames':'openings'}"]`,true);await touch(`[data-${endgame?'endgame':'lesson'}="${index}"]`,true);
  await wait(`document.querySelector('#bottom-sheet').dataset.sheetKind==='lesson' && !document.querySelector('#bottom-sheet').getAnimations().some(a=>a.playState==='running')`,'lesson sheet');
  const bounds=await evaluate(`document.querySelector('#bottom-sheet').getBoundingClientRect().toJSON()`);
  for(const choice of [1,0,side]){
    await touch(`[data-lesson-side="${choice}"]`,true);
    const now=await evaluate(`document.querySelector('#bottom-sheet').getBoundingClientRect().toJSON()`);
    for(const k of ['x','y','width','height'])assert(Math.abs(now[k]-bounds[k])<1,'Lesson side choice moved sheet');
  }
  if(endgame&&pattern)await touch('[data-endgame-stage="pattern"]',true);
  await touch('[data-lesson-start]',true);
  await wait(`document.querySelector('#app').dataset.screen==='game'||!!document.querySelector('[data-confirm="accept"]')`,'lesson start or confirmation');
  if(await evaluate(`!!document.querySelector('[data-confirm="accept"]')`))await touch('[data-confirm="accept"]',true);
  await wait(`document.querySelector('.game-name')?.innerText==='Your move'`,'selected-side turn');
  assert.equal(await evaluate(`document.querySelector('[data-square]').dataset.square`),side?'63':'0','Lesson orientation ignores side');
}
async function lessonsFlow(){
  const italian=['e2e4','e7e5','g1f3','b8c6','f1c4','f8c5'];
  for(const side of [0,1]){
    await startLessonUI(0,side);
    for(let ply=side;ply<italian.length;ply+=2){
      await wait(`document.querySelector('.game-name')?.innerText==='Your move'`,'learner turn');
      const uci=italian[ply];await move(square(uci.slice(0,2)),square(uci.slice(2,4)));
    }
    await wait(`document.querySelector('.coach-kicker')?.innerText==='LESSON COMPLETE'`,'finite opening completion');
    const completed=await evaluate(`[...document.querySelectorAll('[data-square]')].map(e=>e.getAttribute('aria-label'))`);
    await delay(2400);
    assert.deepEqual(await evaluate(`[...document.querySelectorAll('[data-square]')].map(e=>e.getAttribute('aria-label'))`),completed,'Opponent played after lesson completion');
    assert.equal(await evaluate(`document.querySelector('.game-name').innerText`),'Lesson complete','Completed lesson looks live');
    assert(await evaluate(`!!document.querySelector('[data-action="rematch"]')`),'Missing lesson restart');
    await layout('Italian completed as '+(side?'Black':'White'));
  }
  for(const [index,side,uci] of [[0,1,'a7a8'],[1,0,'g6g7'],[2,0,'a6b7'],[3,1,'a6b7'],[4,0,'d5b6']]){
    await startLessonUI(index,side,true,true);
    await layout('endgame pattern '+index);
    let from=square(uci.slice(0,2)),to=square(uci.slice(2,4));if(side){from=63-from;to=63-to;}
    await move(from,to);await wait(`!!document.querySelector('[data-action="rematch"]')`,'endgame checkmate');
    assert.equal(await evaluate(`document.querySelector('.game-name').innerText`),'You won','Mating pattern winner');
  }
  for(const index of [5,6]){
    await home();await touch('[data-nav="learn"]');await touch('[data-learn-section="endgames"]',true);await touch(`[data-endgame="${index}"]`,true);
    assert.equal(await evaluate(`document.querySelectorAll('[data-lesson-start]').length`),0,'Impossible material offered an unwinnable challenge');
    assert(await evaluate(`document.querySelector('#sheet-scroll').innerText.includes('dead draw')`),'Dead position explanation missing');
    adb('shell','input','keyevent','4');await wait(`document.querySelector('#sheet-backdrop').hidden`,'close lesson');
  }
  await startLessonUI(0,1,true,false);await move(14,30);
  await wait(`document.querySelector('.game-name')?.innerText==='Your move'`,'Stockfish endgame defense');
  await touch('[data-action="coach"]');await wait(`!document.querySelector('[data-action="coach"]').disabled`,'endgame hint ready');
  await touch('[data-action="coach"]');await wait(`!!document.querySelector('[data-arrow-role="best"]')`,'endgame move hint');
  await screenshot('knightline-v06-endgame');await layout('endgame technique');
  await touch('[data-action="coach-details"]');assert(await evaluate(`document.querySelector('#sheet-scroll').innerText.includes('opposition')`),'Endgame method unavailable in game');
  adb('shell','input','keyevent','4');await wait(`document.querySelector('#sheet-backdrop').hidden`,'method closed');
  console.log('PASS: opening White/Black, stable lesson setup, five endgame mates, impossible-material lessons and Stockfish technique/hints');
}
async function restartApp(){
  await delay(400);ws.close();adb('shell','am','force-stop','com.eladbiller.knightline');
  adb('shell','am','start','-n','com.eladbiller.knightline/com.traillink.KnightlineActivity');
  await delay(1000);await connect();await wait(`!!document.querySelector('[data-nav="learn"]')`,'restart Home');
}
async function lessonPersistenceFlow(){
  await home();await touch('[data-nav="history"]');
  const originalIds=await evaluate(`[...document.querySelectorAll('[data-archive-id]')].map(e=>e.dataset.archiveId)`);
  assert(await evaluate(`[...document.querySelectorAll('.archive-heading .eyebrow')].every(e=>!['guided lesson','endgame practice'].includes(e.innerText.toLowerCase()))`),'Legacy lessons leaked into Games');
  await startLessonUI(0,1);await move(12,28);
  await wait(`document.querySelector('[data-square="45"]').getAttribute('aria-label').includes('knight')`,'White authored reply');
  await home();await restartApp();await touch('[data-action="resume"]',true);
  await wait(`document.querySelector('.game-name')?.innerText==='Your move'`,'Black opening restored');
  assert.equal(await evaluate(`document.querySelector('[data-square]').dataset.square`),'63','Opening side lost after restart');
  assert(await evaluate(`document.querySelector('.coach-kicker').innerText==='ITALIAN GAME'`),'Restored opening lost guided mode');
  await move(1,18);await wait(`document.querySelector('[data-square="34"]').getAttribute('aria-label').includes('bishop')`,'Guided line resumes');
  await startLessonUI(0,1,true,false);await move(14,30);
  await wait(`document.querySelector('.game-name')?.innerText==='Your move'`,'endgame reply');
  const board=await evaluate(`[...document.querySelectorAll('[data-square]')].map(e=>e.getAttribute('aria-label'))`);
  await home();await restartApp();await touch('[data-action="resume"]',true);
  await wait(`document.querySelector('.game-name')?.innerText==='Your move'`,'endgame restored');
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('[data-square]')].map(e=>e.getAttribute('aria-label'))`),board,'Custom saved board/side lost');
  assert.equal(await evaluate(`document.querySelector('.coach-kicker').innerText`),'KING & ROOK','Endgame method lost after restart');
  await touch('[data-action="coach-details"]');assert(await evaluate(`document.querySelector('#sheet-scroll').innerText.includes('opposition')`),'Restored method missing');
  adb('shell','input','keyevent','4');await wait(`document.querySelector('#sheet-backdrop').hidden`,'close details');
  await home();await touch('[data-action="nav-history"]',true);
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('[data-archive-id]')].map(e=>e.dataset.archiveId)`),originalIds,'Lessons changed Games history');
  await home();await touch('[data-action="resume"]',true);await touch('[data-action="moves"]');await touch('[data-native-action="review.open"]',true);
  await wait(`document.querySelector('#app').dataset.screen==='review'`,'active endgame review');
  await touch('[data-action="review-overview"]');
  await wait(`document.querySelector('#bottom-sheet').dataset.sheetKind==='review-overview'`,'active endgame review');
  adb('shell','input','keyevent','4');await wait(`document.querySelector('#sheet-backdrop').hidden`,'close highlights');
  assert.equal(await evaluate(`document.querySelectorAll('.piece-svg').length`),3,'Custom lesson review became standard chess');
  assert.equal(await evaluate(`document.querySelector('.review-ribbon [data-review-jump="1"] span').innerText`),'1…','Black-first custom review has White move prefix');
  assert.equal(await evaluate(`document.querySelector('.review-ribbon [data-review-jump="2"] span').innerText`),'2.','White reply has wrong full-move number');
  await evaluated();await layout('active endgame review');await home();
  console.log('PASS: opening/endgame persistence and active review; lessons absent from Games while existing normal games remain');
}
async function feedbackFlow(){
  await home();await touch('[data-nav="profile"]');
  const original=adb('shell','settings','get','system','haptic_feedback_enabled');
  const events=()=>adb('shell','dumpsys','vibrator_manager').split('\n').filter(l=>l.includes('com.eladbiller.knightline')&&l.includes('|'));
  const uid=adb('shell','cmd','package','list','packages','-U','com.eladbiller.knightline').match(/uid:(\d+)/)[1];
  const audioEvents=()=>{
    const lines=adb('shell','dumpsys','audio').split('\n');
    const player=lines.filter(l=>l.includes('uid/pid:'+uid+'/')&&l.includes('type:android.media.SoundPool')).at(-1)?.match(/piid:(\d+)/)?.[1];
    assert(player,'Knightline SoundPool not registered');
    return lines.filter(l=>l.includes('player piid:'+player+' event:started'));
  };
  try{
    adb('shell','settings','put','system','haptic_feedback_enabled','1');
    for(const key of ['sound','vibration'])if(await evaluate(`document.querySelector('[data-feedback="${key}"]').getAttribute('aria-checked')==='true'`))await touch(`[data-feedback="${key}"]`,true);
    const disabled=events(),silent=audioEvents();await touch('[data-action="feedback-preview"]',true);await delay(300);
    assert.deepEqual(events(),disabled,'App-off haptic emitted vibration');
    assert.deepEqual(audioEvents(),silent,'App-off sound emitted audio');
    await touch('[data-feedback="vibration"]',true);await touch('[data-action="feedback-preview"]',true);await delay(350);
    const enabled=events();assert.notDeepEqual(enabled,disabled,'No native vibration request');
    assert(enabled.some(l=>l.includes('usage: MEDIA')&&l.includes('finished')),'Missing completed game-media effect');
    adb('shell','settings','put','system','haptic_feedback_enabled','0');
    await touch('[data-action="feedback-preview"]',true);await delay(300);
    assert.notDeepEqual(events(),enabled,'Board feedback incorrectly depends on touch settings');
    assert(events().filter(l=>!enabled.includes(l)).some(l=>l.includes('usage: MEDIA')&&l.includes('finished')),'Touch-off board vibration not completed');
    assert(await evaluate(`document.querySelector('#toast-region').innerText.includes('touch feedback off')`),'System-off diagnostic missing');
    await touch('[data-action="feedback-capture"]',true);await delay(350);
    await touch('[data-feedback="vibration"]',true);const touchOff=events();await touch('[data-action="feedback-preview"]',true);await delay(250);
    assert.deepEqual(events(),touchOff,'App vibration off ignored with touch settings off');
    await touch('[data-feedback="vibration"]',true);await touch('[data-feedback="sound"]',true);
    const beforeAudio=audioEvents();await touch('[data-action="feedback-preview"]',true);await touch('[data-action="feedback-capture"]',true);
    assert.notDeepEqual(audioEvents(),beforeAudio,'Enabled move/capture sounds did not reach Android audio service');
    await restartApp();await touch('[data-nav="profile"]');
    await wait(`!!document.querySelector('[data-feedback="vibration"]')`,'restored feedback settings');
    for(const key of ['sound','vibration'])assert.equal(await evaluate(`document.querySelector('[data-feedback="${key}"]').getAttribute('aria-checked')`),'true','Feedback preference lost');
    assert(await evaluate(`document.querySelector('[data-vibration-status]').innerText.includes('touch feedback off')`),'Profile diagnostic missing');
    console.log('PASS: completed MEDIA effects, touch-off game vibration, app-off suppression, capture preview and persisted switches');
  }finally{adb('shell','settings',original==='null'?'delete':'put','system','haptic_feedback_enabled',...(original==='null'?[]:[original]));}
  await home();
}
async function navigationFlow() {
  const screen = name => wait(`document.querySelector('#app').dataset.screen===${JSON.stringify(name)}`,'screen '+name);
  const back = async () => { adb('shell','input','keyevent','4');await delay(450); };
  const closed = () => wait(`document.querySelector('#bottom-sheet').dataset.open==='false'`,'sheet closed');
  const category = name => touch(`[data-learn-section="${name}"]`,true);
  const checkNav = async () => {
    const d=await evaluate(`[...document.querySelectorAll('.nav-item')].map(e=>({name:e.innerText,current:e.getAttribute('aria-current'),r:e.getBoundingClientRect().toJSON(),w:e.scrollWidth,c:e.clientWidth}))`);
    assert.equal(d.length,5);assert.equal(d.filter(e=>e.current==='page').length,1);
    assert(d.every(e=>e.r.width>=44 && e.r.height>=44 && e.w<=e.c+1),'Navigation label clipping or small target');
  };
  await home();await touch('[data-nav="play"]');await checkNav();
  await touch('[data-action="setup-pass"]',true);await touch('[data-choice="clock"][data-value="4"]',true);await touch('[data-setup-start]',true);
  await wait(`document.querySelector('#app').dataset.screen==='game'||!!document.querySelector('[data-confirm="accept"]')`,'test game start');
  if(await evaluate(`!!document.querySelector('[data-confirm="accept"]')`))await touch('[data-confirm="accept"]',true);
  await screen('game');await move(52,36);await move(12,28);
  const board=await evaluate(`[...document.querySelectorAll('[data-square]')].map(e=>e.getAttribute('aria-label'))`);
  await touch('[data-action="game-back"]');await screen('play');
  await touch('[data-action="setup-bot"]',true);await touch('[data-choice="clock"][data-value="2"]',true);await touch('[data-choice="level"][data-value="2"]',true);
  await touch('[data-setup-start]',true);await wait(`!!document.querySelector('[data-confirm="cancel"]')`,'replace confirmation');
  await back();await wait(`!!document.querySelector('[data-setup-start]')`,'Back restores setup');
  for(const key of ['clock','level'])assert.equal(await evaluate(`document.querySelector('[data-choice="${key}"][aria-pressed="true"]').dataset.value`),'2','Cancelled setup lost '+key);
  await touch('[data-setup-start]',true);await touch('[data-confirm="cancel"]',true);
  await wait(`!!document.querySelector('[data-setup-start]')`,'Cancel restores setup');
  await back();await closed();await touch('[data-action="online-menu"]',true);await touch('#room-code',true);
  await wait(`document.activeElement?.id==='room-code'`,'room code keyboard focus');
  adb('shell','input','text','AB');await wait(`document.querySelector('#room-code').value==='AB'`,'typed room code');await touch('[data-online="join"]',true);
  assert.equal(await evaluate(`document.querySelector('#room-code').value`),'AB','Invalid code discarded room input');
  adb('shell','input','text','CDEF');await wait(`document.querySelector('#room-code').value==='ABCDEF'`,'completed room code');
  await touch('[data-online="join"]',true);await touch('[data-confirm="cancel"]',true);
  await wait(`!!document.querySelector('#room-code')`,'Cancel restores room input');
  assert.equal(await evaluate(`document.querySelector('#room-code').value`),'ABCDEF','Cancelled room lost code');
  await back();if(await evaluate(`document.querySelector('#bottom-sheet').dataset.open==='true'`))await back();await closed();
  await touch('[data-nav="home"]');await touch('[data-action="resume"]',true);await screen('game');
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('[data-square]')].map(e=>e.getAttribute('aria-label'))`),board,'Cancellation replaced saved game');
  await touch('[data-action="game-menu"]');await touch('[data-action="feedback-settings"]',true);
  await evaluate(`window.__feedbackBoard=document.querySelector('.board')`);
  await touch('[data-feedback="sound"]',true);await touch('[data-feedback="sound"]',true);await touch('[data-action="feedback-capture"]',true);
  assert(await evaluate(`window.__feedbackBoard===document.querySelector('.board')`),'Feedback remounted game board');
  await back();await wait(`document.querySelector('#sheet-title').innerText==='Game menu'`,'feedback Back to menu');
  await touch('[data-native-action="engine.info"]',true);await back();await wait(`document.querySelector('#sheet-title').innerText==='Game menu'`,'engine Back to menu');
  await touch('[data-native-action="match.resign"]',true);await back();await wait(`document.querySelector('#sheet-title').innerText==='Game menu'`,'resign cancellation');
  await back();await closed();await back();await screen('home');
  await touch('[data-nav="learn"]');await category('openings');await checkNav();
  await touch('[data-lesson="0"]',true);await touch('[data-lesson-side="1"]',true);await touch('[data-lesson-start]',true);await touch('[data-confirm="cancel"]',true);
  await wait(`!!document.querySelector('[data-lesson-side="1"]')`,'Cancel restores lesson side');
  assert.equal(await evaluate(`document.querySelector('[data-lesson-side="1"]').getAttribute('aria-pressed')`),'true','Cancelled lesson lost side');
  await touch('[data-lesson-start]',true);await touch('[data-confirm="accept"]',true);await screen('game');
  await wait(`document.querySelector('.game-name')?.innerText==='Your move'`,'Black opening ready');
  await touch('[data-action="game-back"]');await screen('learn');
  assert.equal(await evaluate(`document.querySelector('[data-learn-section][aria-pressed="true"]').dataset.learnSection`),'openings','Lesson did not return to openings');
  await category('endgames');await touch('[data-endgame="0"]',true);await touch('[data-lesson-side="1"]',true);await touch('[data-endgame-stage="pattern"]',true);
  await touch('[data-lesson-start]',true);await back();
  assert.equal(await evaluate(`document.querySelector('[data-endgame-stage="pattern"]').getAttribute('aria-pressed')`),'true','Cancelled endgame lost stage');await back();await closed();
  await category('puzzles');await touch('[data-puzzle-filter="foundation"]',true);await touch('[data-puzzle-page="1"]',true);
  const puzzle=await evaluate(`document.querySelector('[data-puzzle]').dataset.puzzle`);
  await touch(`[data-puzzle="${puzzle}"]`,true);await screen('puzzle');await back();await screen('learn');
  assert.equal(await evaluate(`document.querySelector('[data-puzzle]').dataset.puzzle`),puzzle,'Puzzle page/filter lost');
  const scroll=await evaluate(`document.querySelector('#main-content').scrollTop`);assert(scroll>50,'Puzzle list returned to top');
  await touch('[data-nav="profile"]');await touch('[data-nav="learn"]');
  assert(Math.abs(await evaluate(`document.querySelector('#main-content').scrollTop`)-scroll)<2,'Learn tab scroll lost');
  await screenshot('knightline-v07-learn');await touch('[data-nav="history"]');await checkNav();
  const saved=await evaluate(`[...document.querySelectorAll('[data-archive-id]')].at(-1).dataset.archiveId`);
  await touch(`[data-archive-id="${saved}"]`,true);await screen('review');await back();await closed();await touch('[data-action="review-back"]');await screen('history');
  assert(await evaluate(`document.querySelector('#main-content').scrollTop>0`),'Game library lost scroll');
  await back();await screen('home');await back();
  assert(!adb('shell','dumpsys','activity','activities').split('\n').some(l=>l.includes('topResumedActivity')&&l.includes('com.eladbiller.knightline')),'Home Back traps user in app');
  adb('shell','am','start','-n','com.eladbiller.knightline/com.traillink.KnightlineActivity');await delay(700);await screen('home');
  console.log('PASS: five clear destinations, contextual Back, setup/lesson cancellation, nested menu returns, puzzle/list scroll, archive return, Home exits');
}
async function dragProbe(from,to,{cancel=false,outside=false,hold=false}={}){
  const point=async n=>evaluate(`(()=>{const r=document.querySelector('[data-square="${n}"]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  const a=await point(from),b=outside?{x:4,y:a.y}:await point(to);
  const key=await evaluate(`document.querySelector('.review-workspace').dataset.positionKey`);
  await evaluate(`window.__dragBoard=document.querySelector('.board')`);
  await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...a,id:1}]});
  for(let n=1;n<=8;n++){await delay(55);await call('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:a.x+(b.x-a.x)*n/8,y:a.y+(b.y-a.y)*n/8,id:1}]});}
  await wait(`!!document.querySelector('.drag-piece')`,'floating drag piece');
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('[data-square="${from}"] .piece-svg')).visibility`),'hidden','Origin piece duplicated during drag');
  if(hold){await delay(2300);assert(await evaluate(`window.__dragBoard===document.querySelector('.board') && !!document.querySelector('.drag-piece')`),'Engine interrupted drag');await screenshot('knightline-v06-floating-piece');}
  await call('Input.dispatchTouchEvent',{type:cancel?'touchCancel':'touchEnd',touchPoints:[]});await delay(450);
  assert.equal(await evaluate(`document.querySelectorAll('.drag-piece,.square--drag-source,.square--drop').length`),0,'Drag cleanup failed');
  if(cancel||outside||from===to)assert.equal(await evaluate(`document.querySelector('.review-workspace').dataset.positionKey`),key,'Cancelled drop changed position');
}
async function interactionFlow(){
  await home();await touch('[data-action="review-open"]',true);
  await wait(`document.querySelector('#bottom-sheet').dataset.sheetKind==='review-overview'`,'review overview');
  await touch('[data-action="review-start-guided"]',true);await touch('.review-ribbon [data-review-jump="4"]');
  await touch('[data-action="review-explore"]');await wait(`document.querySelector('.review-verdict').innerText==='Exploring'`,'analysis mode');
  await touch('[data-action="review-evaluate"]');
  await dragProbe(1,18,{cancel:true,hold:true});
  await dragProbe(1,18,{outside:true});
  // Illegal destination and same-square return must restore the piece.
  const before=await evaluate(`document.querySelector('.review-workspace').dataset.positionKey`);
  await dragProbe(1,33);assert.equal(await evaluate(`document.querySelector('.review-workspace').dataset.positionKey`),before,'Illegal drag accepted');
  await dragProbe(1,18,{hold:true});await wait(`document.querySelector('[data-square="18"]').getAttribute('aria-label').includes('knight')`,'legal drag committed');
  assert.equal(await evaluate(`document.querySelectorAll('.board-overlay .chess-arrow').length`),0,'Drag line retained arrows');
  await layout('floating drag and drops');await touch('[data-action="review-prev"]');
  await wait(`document.querySelector('.review-verdict').innerText==='Best move'`,'return to selected saved move');
  await touch('[data-action="review-back"]');
  console.log('PASS: lifted drag, engine update survival, cancel/off-board/illegal drops, native legal drop and cleanup');
}
try {
  adb('shell','am','start','-n','com.eladbiller.knightline/com.traillink.KnightlineActivity');await delay(1000);await connect();
  await wait(`!!document.querySelector('#main-content')?.firstElementChild`,'loaded app');
  if(!['persist','library'].includes(mode))await beginFrameAudit();
  if(record){const child=spawn(adbPath,['-s',serial,'shell','screenrecord','--time-limit','45','--bit-rate','3000000','/sdcard/knightline-analysis-flow.mp4']);recording=new Promise(r=>child.on('close',r));}
  if(mode==='all'||mode==='review')await reviewFlow();
  if(mode==='all'||mode==='puzzles')await puzzleFlow();
  if(mode==='persist')await persistenceFlow();
  if(mode==='bot-review')await botReviewFlow();
  if(mode==='challenge')await challengeFlow();
  if(mode==='review-promotion')await reviewPromotionFlow();
  if(mode==='library')await libraryFeedbackFlow();
  if(mode==='lessons')await lessonsFlow();
  if(mode==='interaction')await interactionFlow();
  if(mode==='lesson-persist')await lessonPersistenceFlow();
  if(mode==='feedback')await feedbackFlow();
  if(mode==='navigation')await navigationFlow();
  if(!['persist','library'].includes(mode))await endFrameAudit();
  console.log('PASS v0.7 flows at font '+adb('shell','settings','get','system','font_scale'));
} catch(e) { console.error(e.stack);process.exitCode=1;if(ws?.readyState===1){console.error(await evaluate('document.body.innerText'));await screenshot('knightline-v04-failure');} }
finally { if(recording){await recording;adb('pull','/sdcard/knightline-analysis-flow.mp4',record);}ws?.close(); }
