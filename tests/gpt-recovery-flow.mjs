// Real installed-app flows: user input only; no injected bridge or game state.
import assert from 'node:assert/strict';
import {AndroidDevice,delay} from './android-device.mjs';
if(process.env.APP_ID!=='com.eladbiller.knightline.gpt')throw Error('This test requires the separate GPT app.');
if(!process.env.HOST_SERIAL||!process.env.GUEST_SERIAL)throw Error('Explicitly name both authorized test devices.');
if((!process.env.HOST_SERIAL.startsWith('emulator-')||!process.env.GUEST_SERIAL.startsWith('emulator-'))&&process.env.QA_ALLOW_PHYSICAL!=='1')throw Error('Physical GPT testing requires explicit opt-in after user authorization.');
const host=new AndroidDevice(process.env.HOST_SERIAL,9224),guest=new AndroidDevice(process.env.GUEST_SERIAL,9225);
const mode=process.argv[2]||'guest-first';
async function room(d,role,code){
  await d.home();await d.touch('[data-action="online-menu"]');await d.touch('#room-code');
  await d.call('Input.insertText',{text:code});assert.equal(await d.read(`document.querySelector('#room-code').value`),code);
  d.adb('shell','input','keyevent','4');await delay(350);await d.touch(`[data-online="${role}"]`);
  await d.wait(`!!document.querySelector('[data-confirm="accept"]')||document.querySelector('#bottom-sheet').dataset.open!=='true'`,'room submission or replacement confirmation');
  if(await d.read(`!!document.querySelector('[data-confirm="accept"]')`))await d.touch('[data-confirm="accept"]');
  await d.wait(`document.querySelector('#bottom-sheet').dataset.open!=='true'`,'room setup completed');
}
async function connected(d){await d.wait(`document.querySelector('.header-status')?.innerText.includes('Connected')||document.querySelector('.header-status')?.innerText.includes('Private room')`,'connected',70000);}
async function restart(d){d.close();d.adb('shell','am','force-stop',d.appId);d.adb('shell','am','start','-n',d.appId+'/com.traillink.KnightlineActivity');await d.connect();}
async function game(d){await d.home();await d.touch('[data-action="resume"]');await d.wait(`document.querySelector('#app').dataset.screen==='game'`,'saved board');}
try{
  await Promise.all([host.connect(),guest.connect()]);
  if(mode==='guest-first'){
    const code='G'+Date.now().toString(36).toUpperCase().slice(-6);
    await room(guest,'join',code);
    await guest.wait(`document.querySelector('.room-status')?.innerText.includes('Attempt')`,'retry before host exists',30000);
    await room(host,'host',code);await Promise.all([connected(host),connected(guest)]);
    host.close();host.adb('shell','am','force-stop',host.appId);
    await guest.wait(`document.querySelector('.room-status')?.innerText.includes('Reconnecting')`,'empty room retains reconnect target',25000);
    host.adb('shell','am','start','-n',host.appId+'/com.traillink.KnightlineActivity');await host.connect();
    await Promise.all([connected(host),connected(guest)]);
    assert(await host.read(`!document.querySelector('[data-action="resume"]')`),'old match resurrected after replacing it with a room');
    for(const d of [host,guest])await d.wait(`!!document.querySelector('[data-action="remote-setup"]')`,'connected room');
    await host.touch('[data-action="remote-setup"]');await host.touch('[data-choice="clock"][data-value="4"]');await host.touch('[data-setup-start]');
    await guest.touch('[data-confirm="accept"]');
    for(const d of [host,guest])await d.wait(`document.querySelector('#app').dataset.screen==='game'`,'new friend game');
    assert.deepEqual(await host.board(),await guest.board());
    console.log('PASS guest-before-host retry, empty-room process recovery, GPT namespace, actual WebRTC handshake and untimed invitation');
  }else if(mode==='room-restart'){
    await Promise.all([connected(host),connected(guest)]);
    for(const d of [host,guest]){await d.home();assert(await d.read(`!!document.querySelector('[data-action="remote-setup"]')&&!document.querySelector('[data-action="resume"]')`),'expected an empty connected room');}
    for(const d of [host,guest]){
      await restart(d);await Promise.all([connected(host),connected(guest)]);
      for(const phone of [host,guest])assert(await phone.read(`!!document.querySelector('[data-action="remote-setup"]')&&!document.querySelector('[data-action="resume"]')`),'room restart lost its identity or resurrected a replaced game');
    }
    console.log('PASS empty room survives host and guest process restarts without resurrecting a replaced game');
  }else if(mode==='manual'){
    await Promise.all([game(host),game(guest)]);const before=await host.board();
    const recordingName='knightline-v081-'+(process.env.QA_TRANSPORT||'gpt')+'-disconnect-recovery';
    const recording=host.record(recordingName,45);
    await host.touch('[data-action="game-menu"]');await host.touch('[data-native-action="transport.disconnect"]');
    await host.wait(`document.querySelector('.room-status')?.innerText.includes('Connection paused')`,'explicit disconnect');
    assert(await host.read(`document.querySelector('.room-status').innerText.includes('Your board is saved.')`),'saved-match recovery must describe the board, not an empty room');
    await restart(host);await delay(4500);
    assert(await host.read(`document.querySelector('.room-status')?.innerText.includes('Connection paused')`),'manual disconnect was forgotten on restart');
    await host.touch('[data-transport="resume"]');await Promise.all([connected(host),connected(guest)]);
    await Promise.all([game(host),game(guest)]);assert.deepEqual(await host.board(),before);assert.deepEqual(await guest.board(),before);
    for(const [staying,restarted] of [[host,guest],[guest,host]]){
      await staying.home();await staying.touch('[data-nav="play"]');await staying.touch('[data-action="sandbox-open"]');
      await restart(restarted);await connected(restarted);await delay(1200);
      assert.equal(await staying.read(`document.querySelector('#app').dataset.screen`),'sandbox','reconnect ejected '+(staying===host?'host':'guest')+' Sandbox');
      await game(staying);await connected(staying);assert.deepEqual(await staying.board(),before,'Sandbox/reconnect lost match');
    }
    await new Promise(resolve=>recording.exitCode!==null?resolve():recording.once('close',resolve));host.adb('pull',host.recordPath,'../../work/'+recordingName+'.mp4');
    console.log('PASS deliberate Disconnect survives restart, manual resume restores same board, reconnect preserves Sandbox navigation');
  }else if(mode==='timed'){
    const recordingName='knightline-v081-'+(process.env.QA_TRANSPORT||'gpt')+'-timed-takeback';
    const recording=host.record(recordingName,45);
    await host.home();await host.touch('[data-nav="play"]');await host.touch('[data-action="remote-setup"]');
    await host.touch('[data-choice="clock"][data-value="2"]');await host.touch('[data-setup-start]');await guest.touch('[data-confirm="accept"]');
    for(const d of [host,guest])await d.wait(`document.querySelector('#app').dataset.screen==='game'`,'timed match');
    const white=await host.read(`document.querySelector('[data-square]').dataset.square==='0'`)?host:guest,black=white===host?guest:host;
    await white.move('e2e4');await black.move('d7d5');
    await white.touch('[data-action="takeback"]');await black.wait(`!!document.querySelector('[data-confirm="accept"]')`,'timed consent');
    const clock=d=>d.read(`[...document.querySelectorAll('[data-clock]')].map(e=>{const [m,s]=e.innerText.split(':').map(Number);return m*60+s})`);
    const before=await clock(black);assert(before.every(Number.isFinite),'3+2 clocks must be active');
    await black.touch('[data-confirm="accept"]');
    for(const d of [host,guest])await d.wait(`document.querySelector('[data-square="52"]').getAttribute('aria-label').includes('White pawn')&&document.querySelector('[data-square="11"]').getAttribute('aria-label').includes('Black pawn')`,'timed rollback');
    const after=await clock(black);assert(after.every((t,i)=>t<=before[i]),'undo added increment or reset clock: '+JSON.stringify({before,after}));
    assert.deepEqual(await host.board(),await guest.board());
    console.log('PASS 3+2 takeback preserves remaining clocks without awarding a new increment', {before,after});
    await new Promise(resolve=>recording.exitCode!==null?resolve():recording.once('close',resolve));
    host.adb('pull',host.recordPath,'../../work/'+recordingName+'.mp4');
  }else if(mode==='exhausted'){
    await room(guest,'join','X'+Date.now().toString(36).toUpperCase().slice(-6));
    await guest.wait(`document.querySelector('.room-status')?.innerText.includes('Automatic retries stopped')`,'bounded retries exhausted',130000);
    const title=await guest.read(`document.querySelector('.room-status .surface-title').innerText`);assert.equal(title,'Connection interrupted');
    await delay(3500);assert.equal(await guest.read(`document.querySelector('.room-status .surface-title').innerText`),title);
    await guest.touch('[data-transport="resume"]');await guest.wait(`document.querySelector('.room-status')?.innerText.includes('Attempt 1 of 8')`,'explicit retry resets attempt budget');
    console.log('PASS exhausted retry status is honest, stable and manually restartable');
  }else throw Error('Unknown mode '+mode);
}catch(error){for(const d of [host,guest])try{console.error(d.serial,await d.state());}catch{}throw error;}
finally{host.close();guest.close();}
