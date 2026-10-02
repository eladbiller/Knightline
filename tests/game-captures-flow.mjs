import assert from 'node:assert/strict';
import {AndroidDevice,delay} from './android-device.mjs';
const d=new AndroidDevice(process.env.SERIAL||'emulator-5554',9223);
try{
  await d.connect();await d.home();await d.touch('[data-nav="play"]');await d.touch('[data-action="setup-pass"]');await d.touch('[data-choice="clock"][data-value="4"]');await d.touch('[data-setup-start]');await d.acceptReplacement();
  await d.wait(`document.querySelector('#app').dataset.screen==='game'`,'pass and play');await d.auditStart();
  const size=await d.read(`document.querySelector('.board').getBoundingClientRect().width`);
  for(const [uci,square,piece] of [['e2e4',36,'White pawn'],['d7d5',27,'Black pawn'],['e4d5',27,'White pawn'],['d8d5',27,'Black queen']]){
    await d.move(uci);await d.wait(`document.querySelector('[data-square="${square}"]').getAttribute('aria-label').includes('${piece}')`,'committed '+uci);
    assert(Math.abs(await d.read(`document.querySelector('.board').getBoundingClientRect().width`)-size)<1,'capture resized board');
  }
  await d.wait(`document.querySelectorAll('.captured-group').length===2`,'both players captures');
  assert.equal(await d.read(`[...document.querySelectorAll('.captured-group')].map(e=>e.dataset.capturedPiece).sort().join(',')`),'-1,1');
  const layout=await d.read(`(()=>{const m=document.querySelector('#main-content');return {overflow:m.scrollHeight-m.clientHeight,scale:visualViewport.scale,labels:[...document.querySelectorAll('.player-name,.captured-pieces,.clock')].map(e=>({text:e.getAttribute('aria-label')||e.innerText,clip:e.scrollHeight>e.clientHeight+1}))}})()`);
  assert(layout.overflow<2&&layout.scale===1&&layout.labels.every(l=>!l.clip),JSON.stringify(layout));
  d.screenshot('../../work/knightline-gpt-captures-150.png');
  const audit=await d.auditEnd();assert.deepEqual(audit.errors,[]);console.log('PASS final GPT capture rows, fixed board size, both colors and no clipped tested labels at 150%',layout,audit);
  const before=await d.board();await d.home();await d.touch('[data-nav="play"]');await d.touch('[data-action="sandbox-open"]');await d.wait(`document.querySelector('#app').dataset.screen==='sandbox'`,'sandbox');await d.home();await d.touch('[data-action="resume"]');await d.wait(`document.querySelector('#app').dataset.screen==='game'`,'saved game');assert.deepEqual(await d.board(),before,'Sandbox changed the active game');
  console.log('PASS Sandbox preserves existing active game and captures');
}finally{d.close();}
