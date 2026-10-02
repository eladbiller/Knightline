import assert from 'node:assert/strict';
import {AndroidDevice,delay} from './android-device.mjs';
const d=new AndroidDevice(process.env.SERIAL||'emulator-5554',9223);
try{
  await d.connect();await d.home();await d.touch('[data-nav="history"]');
  const history=await d.read(`[...document.querySelectorAll('[data-archive-id]')].map(e=>e.dataset.archiveId)`);
  await d.touch('[data-nav="play"]');await d.touch('[data-action="sandbox-open"]');await d.wait(`document.querySelector('#app').dataset.screen==='sandbox'`,'sandbox');
  const board=await d.board();await d.touch('[data-sandbox="edit"]');await d.touch('[data-sandbox-piece="5"]');await d.touch('[data-square="32"]',false);
  await d.wait(`document.querySelector('[data-square="32"]').getAttribute('aria-label').includes('White queen')`,'draft edit');
  const draft=await d.board();d.close();d.adb('shell','am','force-stop',d.appId);d.adb('shell','am','start','-n',d.appId+'/com.traillink.KnightlineActivity');await delay(600);await d.connect();
  await d.touch('[data-nav="play"]');await d.touch('[data-action="sandbox-open"]');await d.wait(`!!document.querySelector('[data-sandbox="apply"]')`,'draft restored');assert.deepEqual(await d.board(),draft);
  await d.touch('[data-action="sandbox-options"]');await d.touch('[data-sandbox="cancel"]');await d.wait(`!!document.querySelector('[data-sandbox="edit"]')`,'draft discarded');assert.deepEqual(await d.board(),board);
  await d.home();await d.touch('[data-nav="history"]');assert.deepEqual(await d.read(`[...document.querySelectorAll('[data-archive-id]')].map(e=>e.dataset.archiveId)`),history,'sandbox polluted game library');
  const packages=d.adb('shell','pm','list','packages','com.eladbiller.knightline');assert(packages.includes('package:com.eladbiller.knightline\n')||packages.includes('package:com.eladbiller.knightline\r'));assert(packages.includes('package:com.eladbiller.knightline.gpt'));
  console.log('PASS independent GPT install, draft survives process restart, discard restores playable board, history unchanged');
}finally{d.close();}
