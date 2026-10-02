import assert from 'node:assert/strict';
import {AndroidDevice,delay} from './android-device.mjs';
if(!process.env.HOST_SERIAL||!process.env.GUEST_SERIAL)throw Error('Set authorized HOST_SERIAL/GUEST_SERIAL');
const a=new AndroidDevice(process.env.HOST_SERIAL,9224),b=new AndroidDevice(process.env.GUEST_SERIAL,9225);
const transport=process.env.QA_TRANSPORT||'bluetooth';
const board=d=>d.read(`[...document.querySelectorAll('[data-square]')].sort((a,b)=>Number(a.dataset.square)-Number(b.dataset.square)).map(e=>e.getAttribute('aria-label').split(', ').slice(0,2).join(', '))`);
async function sync(expected){const until=Date.now()+7000;while(Date.now()<until){const x=await board(a),y=await board(b);if(JSON.stringify(x)===JSON.stringify(y)&&(!expected||JSON.stringify(x)===JSON.stringify(expected)))return x;await delay(150);}throw Error('Boards did not converge');}
async function captures(total){for(const d of [a,b])await d.wait(`[...document.querySelectorAll('.captured-group')].reduce((n,e)=>n+Number(e.dataset.count),0)===${total}`,'captured pieces '+total);}
async function move(d,uci){const before=await board(d);await d.move(uci);const until=Date.now()+5000;while(JSON.stringify(await board(d))===JSON.stringify(before)&&Date.now()<until)await delay(100);assert.notDeepEqual(await board(d),before,'move '+uci);return sync();}
async function consent(sender,receiver,accept){await sender.touch('[data-action="takeback"]');await receiver.wait(`document.querySelector('#sheet-title')?.innerText==='Allow takeback?'`,'opponent consent');await receiver.touch('[data-confirm="'+(accept?'accept':'cancel')+'"]');await sender.wait(`document.querySelector('[data-action="takeback"]')?.innerText!=='Requested'`,'request resolved');}
async function returnGame(d){await d.home();await d.touch('[data-action="resume"]');await d.wait(`document.querySelector('#app').dataset.screen==='game'`,'game');}
async function restart(d){d.close();d.adb('shell','am','start','-n','com.eladbiller.knightline/com.traillink.KnightlineActivity');await delay(1200);await d.connect();}
async function connected(d){await d.wait(`document.querySelector('.header-status')?.innerText.includes('Connected')||document.querySelector('.header-status')?.innerText.includes('Private room')`,'automatic reconnect',65000);}
try{
  await Promise.all([a.connect(),b.connect()]);await Promise.all([a.auditStart(),b.auditStart()]);
  const white=await a.read(`document.querySelector('[data-square]').dataset.square==='0'`)?a:b,black=white===a?b:a;
  const recorders=[a.record('knightline-v080-'+transport+'-takeback-host',45),b.record('knightline-v080-'+transport+'-takeback-guest',45)];
  await move(white,'e2e4');const beforeCapture=await move(black,'d7d5');await move(white,'e4d5');await captures(1);const four=await move(black,'d8d5');await captures(2);
  for(const d of [a,b]){const labels=await d.read(`[...document.querySelectorAll('.captured-pieces')].map(e=>e.getAttribute('aria-label'))`);assert(labels.some(s=>s.includes('Black pawn'))&&labels.some(s=>s.includes('White pawn')));}
  await consent(black,white,false);await sync(four);await captures(2);console.log('PASS decline preserves board and captures');
  await consent(white,black,true);await sync(beforeCapture);await captures(0);
  for(const d of [a,b])assert(await d.read(`document.querySelector('.game-integrity').innerText.includes('takeback')`),'Practice on both phones');
  const three=await move(white,'e4d5');await move(black,'d8d5');await consent(black,white,true);await sync(three);await captures(1);await move(black,'d8d5');
  console.log('PASS either player requests last own move; one/two ply rollback; captures and Practice sync');
  await white.touch('[data-action="takeback"]');await black.wait(`document.querySelector('#sheet-title')?.innerText==='Allow takeback?'`,'pending request');
  const five=await move(white,'g1f3');await black.wait(`document.querySelector('#bottom-sheet').dataset.open!=='true'`,'stale consent dismissed');await sync(five);
  console.log('PASS newer move expires consent without undoing anything');
  await Promise.all(recorders.map(r=>new Promise(resolve=>r.exitCode!==null?resolve():r.once('close',resolve))));
  a.adb('pull',a.recordPath,'../../work/knightline-v080-'+transport+'-takeback-host.mp4');b.adb('pull',b.recordPath,'../../work/knightline-v080-'+transport+'-takeback-guest.mp4');
  // Kill each app in turn: the surviving phone must notice loss and recover
  // without a picker, a new invitation, or replacing the saved position.
  for(const [lost,survivor] of [[b,a],[a,b]]){
    lost.adb('shell','am','force-stop','com.eladbiller.knightline');
    await survivor.wait(`document.body.innerText.toLowerCase().includes('connection interrupted')`,'loss detected',25000);
    await restart(lost);await Promise.all([connected(lost),connected(survivor)]);
    if(await lost.read(`document.querySelector('#app').dataset.screen!=='game'`))await returnGame(lost);
    if(await survivor.read(`document.querySelector('#app').dataset.screen!=='game'`))await returnGame(survivor);
    await sync(five);await captures(2);console.log('PASS '+transport+' automatic reconnect after '+(lost===a?'host':'guest')+' process restart');
  }
  await move(black,'g8f6');
  for(const d of [a,b]){
    await d.touch('[data-action="moves"]');await d.wait(`document.querySelectorAll('.move-item').length===6`,'six moves after takeback/reconnect');await d.back();
    const layout=await d.read(`(()=>{const m=document.querySelector('#main-content'),r=document.querySelector('.board').getBoundingClientRect();return {scroll:m.scrollHeight-m.clientHeight,aspect:Math.abs(r.width-r.height),width:r.width,scale:visualViewport.scale}})()`);
    assert(layout.scroll<2&&layout.aspect<1&&layout.scale===1,JSON.stringify(layout));d.screenshot('../../work/knightline-v080-'+transport+'-'+(d===a?'host':'guest')+'.png');console.log(layout);
  }
  console.log('PASS playable after reconnect with preserved six-move history');
}catch(e){for(const d of [a,b])try{console.error(await d.state());}catch{}throw e;}finally{a.close();b.close();}
