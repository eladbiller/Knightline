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
    window.__flowAudit={frames:0,errors:[],last:null,running:true};
    function frame(){const a=window.__flowAudit;if(!a.running)return;const board=document.querySelector('.board');
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
  const result=await evaluate(`(()=>{const a=window.__flowAudit;if(!a)return null;a.running=false;return {frames:a.frames,errors:[...new Set(a.errors)]}})()`);
  if(result){console.log('Continuous frame audit: '+JSON.stringify(result));assert.deepEqual(result.errors,[],'Flow geometry/text regression');}
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
  assert(await evaluate(`document.querySelector('.review-player-key').textContent.includes('White') && document.querySelector('.review-player-key').textContent.includes('Black')`),'Player key missing');
  assert(await evaluate(`[...document.querySelectorAll('.highlight-player')].every(e=>/White|Black/.test(e.innerText))`),'Highlight owner missing');
  await touch('[data-review-filter="black"]',true);
  assert(await evaluate(`[...document.querySelectorAll('.highlight-player')].every(e=>e.innerText.includes('Black'))`),'Black filter leaks White');
  await touch('[data-review-filter="white"]',true);
  assert(await evaluate(`[...document.querySelectorAll('.highlight-player')].every(e=>e.innerText.includes('White'))`),'White filter leaks Black');
  await screenshot('knightline-v04-highlights');
  await touch('[data-review-filter="both"]',true);await touch('[data-action="review-start-guided"]',true);
  await touch('.review-ribbon [data-review-jump="4"]');await wait(`document.querySelector('.review-verdict').innerText==='Best move'`,'Best title');
  await noBest('review entry');assert.match(await evaluated(),/−M[1-9]/,'Pre-move mate score');
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
  const before=await evaluated();assert(before.includes('M'),'Pre-mate evaluation missing');
  await move(1,18); // Nc6: legal, not the searched mate. Must be accepted.
  await wait(`document.querySelector('.review-position-line strong').innerText==='Your analysis'`,'free analysis');
  const after=await evaluated();assert.notEqual(after,before,'Free move did not change evaluation');
  await noBest('free move hides best');
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
  assert.match(await evaluated(),/−M[1-9]/,'Reset lost pre-move position');
  await touch('.review-ribbon [data-review-jump="1"]');
  await touch('.review-ribbon [data-review-jump="4"]');
  await wait(`document.querySelector('.review-ribbon [aria-current="step"]').dataset.reviewJump==='4'`,'rapid navigation settled');
  await delay(2200);assert.match(await evaluated(),/−M[1-9]/,'Stale analysis overwrote pre-move score');
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
  await home();await touch('[data-nav="learn"]');await touch('[data-puzzle-filter="warmup"]',true);
  await touch('[data-puzzle="1"]',true);await touch('[data-action="puzzle-hint"]');
  await touch('[data-action="nav-learn"]');await delay(350);
  ws.close();adb('shell','am','force-stop','com.eladbiller.knightline');
  adb('shell','am','start','-n','com.eladbiller.knightline/com.traillink.KnightlineActivity');
  await delay(1000);await connect();await wait(`!!document.querySelector('[data-nav="learn"]')`,'restart');
  await touch('[data-nav="learn"]');await touch('[data-puzzle-filter="missed"]',true);
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
  await touch('[data-action="nav-home"]');await touch('[data-nav="play"]');await touch('[data-action="setup-pass"]',true);
  await touch('[data-choice="clock"][data-value="4"]',true);await touch('[data-setup-start]',true);
  await wait(`document.querySelector('#app').dataset.screen==='game' || !!document.querySelector('[data-confirm="accept"]')`,'start or replacement confirmation');
  if(await evaluate(`!!document.querySelector('[data-confirm="accept"]')`))await touch('[data-confirm="accept"]',true);
  await wait(`document.querySelector('#app').dataset.screen==='game'`,'new active game');await move(53,45);
  await touch('[data-action="nav-home"]');await touch('[data-action="nav-history"]',true);
  const count=await evaluate(`document.querySelectorAll('[data-archive-id]').length`);
  await touch(`[data-archive-id="${oldId}"]`,true);
  await wait(`document.querySelector('#bottom-sheet').dataset.sheetKind==='review-overview'`,'archived highlights');
  adb('shell','input','keyevent','4');await wait(`document.querySelector('#sheet-backdrop').hidden`,'highlights dismissed');
  assert(await evaluate(`document.querySelector('.review-counter').innerText.includes('4 moves')`),'Opened wrong archived game');
  await move(52,36);await move(12,28);await evaluated();await layout('archived alternate line');
  await touch('[data-action="review-back"]');await wait(`document.querySelector('#app').dataset.screen==='home'`,'archive Back exits Home');
  await touch('[data-action="resume"]',true);await wait(`document.querySelector('#app').dataset.screen==='game'`,'active game resumes');
  assert(await evaluate(`document.querySelector('[data-square="45"]').getAttribute('aria-label').includes('pawn')&&document.querySelector('[data-square="52"]').getAttribute('aria-label').includes('pawn')&&document.querySelector('[data-square="36"]').getAttribute('aria-label').includes('empty')`),'Archive changed active board');
  await touch('[data-action="nav-home"]');await touch('[data-nav="profile"]');
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
  await touch('[data-action="nav-home"]');await touch('[data-action="resume"]',true);
  await touch('[data-action="game-menu"]');await touch('[data-native-action="match.clear"]',true);await touch('[data-confirm="accept"]',true);
  await wait(`document.querySelector('#app').dataset.screen==='home'`,'clear active save');
  assert.equal(await evaluate(`document.querySelectorAll('[data-action="resume"]').length`),0,'Active save not cleared');
  await touch('[data-action="nav-history"]',true);await touch(`[data-archive-id="${oldId}"]`,true);
  await wait(`document.querySelector('#app').dataset.screen==='review'`,'archive without active game');
  adb('shell','input','keyevent','4');await wait(`document.querySelector('#sheet-backdrop').hidden`,'overview closed');
  await move(52,36);await evaluated();await touch('[data-action="review-back"]');
  await wait(`document.querySelector('#app').dataset.screen==='home'`,'review-only exit');
  console.log('PASS: archive isolation, persisted library, independent feedback preferences, review without active save, Home exits');
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
  if(!['persist','library'].includes(mode))await endFrameAudit();
  console.log('PASS v0.5 flows at font '+adb('shell','settings','get','system','font_scale'));
} catch(e) { console.error(e.stack);process.exitCode=1;if(ws?.readyState===1){console.error(await evaluate('document.body.innerText'));await screenshot('knightline-v04-failure');} }
finally { if(recording){await recording;adb('pull','/sdcard/knightline-analysis-flow.mp4',record);}ws?.close(); }
