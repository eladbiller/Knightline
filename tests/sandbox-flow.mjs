import assert from 'node:assert/strict';
import {AndroidDevice,delay} from './android-device.mjs';
const d=new AndroidDevice(process.env.SERIAL||'emulator-5554',9223);
try{
  await d.connect();await d.home();await d.touch('[data-nav="play"]');await d.touch('[data-action="sandbox-open"]');
  await d.wait(`document.querySelector('#app').dataset.screen==='sandbox'`,'sandbox');await d.auditStart();
  const recorder=d.record('knightline-v080-sandbox',45);
  if(!await d.read(`!!document.querySelector('[data-sandbox="clear"]')`))await d.touch('[data-sandbox="edit"]');
  await d.touch('[data-sandbox="clear"]');
  await d.touch('[data-sandbox-turn="0"]');
  assert((await d.board()).every(s=>s.includes('empty')),'clear board');
  await d.touch('[data-sandbox="apply"]');await d.wait(`document.querySelector('.sandbox-error').innerText.includes('king')`,'invalid empty position explained');
  for(const [p,sq] of [[6,56],[-6,7],[4,57]]){await d.touch('[data-sandbox-piece="'+p+'"]');await d.touch('[data-square="'+sq+'"]',false);}
  await d.touch('[data-sandbox="apply"]');await d.wait(`!!document.querySelector('[data-sandbox="edit"]')`,'position starts');
  await d.wait(`/[0-9]/.test(document.querySelector('[data-evaluation]')?.innerText||'')`,'offline sandbox evaluation',30000);
  const orientation=await d.read(`document.querySelector('[data-square]').dataset.square`);
  await d.move('b1b2');await d.move('h8g8');
  assert.equal(await d.read(`document.querySelector('[data-square]').dataset.square`),orientation,'orientation changed');
  assert((await d.board())[6].includes('Black king'),'both sides movable');
  await d.touch('[data-sandbox="undo"]');await d.wait(`document.querySelector('[data-square="7"]').getAttribute('aria-label').includes('Black king')`,'undo returned king');
  const saved=await d.board();await d.back();await d.touch('[data-action="sandbox-open"]');await d.wait(`document.querySelector('#app').dataset.screen==='sandbox'&&document.querySelectorAll('[data-square]').length===64`,'return to sandbox');assert.deepEqual(await d.board(),saved,'navigation preserves sandbox');
  await d.touch('[data-sandbox="edit"]');await d.touch('[data-sandbox-piece="0"]');await d.touch('[data-square="7"]',false);
  await d.touch('[data-sandbox="apply"]');await d.wait(`document.querySelector('.sandbox-error').innerText.includes('king')`,'missing king explained');
  await d.touch('[data-action="sandbox-options"]');await d.touch('[data-sandbox="cancel"]');await d.wait(`!!document.querySelector('[data-sandbox="edit"]')`,'cancel editor');assert.deepEqual(await d.board(),saved,'cancel preserves playable board');
  await d.touch('[data-action="sandbox-options"]');await d.touch('#sandbox-fen');
  const fen='1r5k/P7/8/8/8/8/8/7K w - - 0 1';await d.call('Input.insertText',{text:fen});assert.equal(await d.read(`document.querySelector('#sandbox-fen').value`),fen);
  d.adb('shell','input','keyevent','4');await delay(300);await d.touch('[data-sandbox-import]');
  await d.wait(`document.querySelector('[data-square="8"]').getAttribute('aria-label').includes('White pawn')`,'FEN loaded');await d.wait(`document.querySelector('#bottom-sheet').dataset.open!=='true'`,'FEN options closed');
  await d.move('a7b8');await d.touch('[data-analysis-promotion="2"]');await d.wait(`document.querySelector('[data-square="1"]').getAttribute('aria-label').includes('White knight')`,'underpromotion');
  const geometry=await d.read(`(()=>{const m=document.querySelector('#main-content'),b=document.querySelector('.board').getBoundingClientRect();return {width:b.width,height:b.height,overflow:m.scrollHeight-m.clientHeight,scale:visualViewport.scale}})()`);
  assert(Math.abs(geometry.width-geometry.height)<1&&geometry.overflow<2&&geometry.scale===1,JSON.stringify(geometry));
  d.screenshot('../../work/knightline-v080-sandbox.png');console.log('PASS sandbox UI: empty editor, invalid position, both sides, fixed orientation, undo, cancel, navigation, offline score, FEN, underpromotion',geometry);
  await new Promise(resolve=>recorder.exitCode!==null?resolve():recorder.once('close',resolve));d.adb('pull',d.recordPath,'../../work/knightline-v080-sandbox.mp4');
  const audit=await d.auditEnd();assert.deepEqual(audit.errors,[]);console.log(audit);
}finally{d.close();}
