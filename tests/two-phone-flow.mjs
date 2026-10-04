// Actual two-phone chess. Run only on devices explicitly designated for testing.
// Set ADB, HOST_SERIAL and GUEST_SERIAL, then:
// node tests/two-phone-flow.mjs <bluetooth|reconnect|invite|play|online|online-reconnect|finish|inspect>
import assert from 'node:assert/strict';
import {AndroidDevice,delay} from './android-device.mjs';
if(!process.env.HOST_SERIAL||!process.env.GUEST_SERIAL)throw Error('Set HOST_SERIAL and GUEST_SERIAL to explicitly authorized test devices.');
const a=new AndroidDevice(process.env.HOST_SERIAL,9224);
const b=new AndroidDevice(process.env.GUEST_SERIAL,9225);
const mode=process.argv[2]||'inspect',output=process.env.QA_OUTPUT||'../../work';
let setupRecords;
const text=d=>d.read('document.body.innerText');
async function closed(d){await d.wait(`document.querySelector('#bottom-sheet').dataset.open!=='true'`,'sheet closed');}
async function game(d){await d.wait(`document.querySelector('#app').dataset.screen==='game'`,'game');await closed(d);}
async function nativeAllow(d,optional=false){
  const focus=d.adb('shell','dumpsys','window').split('\n').find(line=>line.includes('mCurrentFocus='))||'';
  if(optional&&focus.includes(d.appId+'/'))return false;
  d.adb('shell','uiautomator','dump','/sdcard/knightline-window.xml');
  const xml=d.adb('shell','cat','/sdcard/knightline-window.xml');
  const nodes=[...xml.matchAll(/<node\b[^>]+/g)].map(m=>m[0]);
  const node=nodes.find(n=>/resource-id="(?:com.android.permissioncontroller:id\/permission_allow_button|android:id\/button1)"/.test(n));
  if(!node){if(optional)return false;throw Error('Expected Android Bluetooth Allow dialog, got '+xml.slice(0,300));}
  assert(/Bluetooth|permissioncontroller/.test(xml),'Unexpected system dialog');
  const [,x1,y1,x2,y2]=node.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/).map(Number);
  d.adb('shell','input','tap',String((x1+x2)/2),String((y1+y2)/2));
  await delay(300);return true;
}
async function invite(sender,receiver,clock=0,decline=false){
  await sender.home();await sender.touch('[data-nav="play"]');await sender.touch('[data-action="remote-setup"]');
  const savedClock=await sender.read(`document.querySelector('.resume-card .subtitle')?.innerText||document.querySelector('[data-action="resume"]')?.closest('article')?.innerText`);
  await sender.wait(`(()=>{const e=document.querySelector('#bottom-sheet');return !e.getAnimations().some(a=>a.playState==='running')&&Math.abs(new DOMMatrixReadOnly(getComputedStyle(e).transform).m42)<.1})()`,'setup opening finished');
  const before=await sender.read(`document.querySelector('#bottom-sheet').getBoundingClientRect().toJSON()`);
  for(const c of [1,2,4,clock]){
    await sender.touch(`[data-choice="clock"][data-value="${c}"]`);
    const after=await sender.read(`document.querySelector('#bottom-sheet').getBoundingClientRect().toJSON()`);
    for(const key of ['x','y','width','height'])assert(Math.abs(before[key]-after[key])<1,'Setup moved '+key);
  }
  await sender.touch('[data-setup-start]');
  await receiver.wait(`!!document.querySelector('[data-confirm="accept"]')`,'invitation');
  const label=['10 | 0','5 | 0','3 | 2','1 | 0','Untimed'][clock];
  assert((await text(receiver)).includes('Play '+label+' with'),'Invitation lost clock '+label);
  await receiver.touch(`[data-confirm="${decline?'cancel':'accept'}"]`);
  if(decline){await closed(sender);assert.equal(await sender.read(`document.querySelector('.resume-card .subtitle')?.innerText||document.querySelector('[data-action="resume"]')?.closest('article')?.innerText`),savedClock,'Declined invitation changed active game');console.log('PASS declined '+label+' invitation without stuck setup or changed saved clock');return;}
  await Promise.all([game(a),game(b)]);
  for(const d of [a,b]){assert(!(await text(d)).includes('lesson mode'),'Lesson flag leaked to friend match');await d.wait(`document.querySelector('.game-integrity')?.innerText==='Private rating eligible'`,'rating exchange');}
  if(clock===4){for(const d of [a,b])assert.equal(await d.read(`document.querySelector('[data-clock="you"]').innerText`),'∞');}
  else {for(const d of [a,b])assert.match(await d.read(`document.querySelector('[data-clock="you"]').innerText`),/^\d\d:\d\d$/);}
  console.log('PASS '+label+' invitation, both clocks and automatic board transition');
}
async function compare(label){
  let x,y;const until=Date.now()+5000;
  do{[x,y]=await Promise.all([a.board(),b.board()]);if(JSON.stringify(x)===JSON.stringify(y))break;await delay(100);}while(Date.now()<until);
  assert.equal(x.length,64);assert.deepEqual(x,y,label+': board divergence');
  const clocks=[];
  for(const d of [a,b]){
    clocks.push(await d.read(`(()=>{const white=document.querySelector('[data-square]').dataset.square==='0';function seconds(role){const t=document.querySelector('[data-clock="'+role+'"]').innerText;if(t==='∞')return -1;const [m,s]=t.split(':').map(Number);return m*60+s;}return [seconds(white?'you':'opponent'),seconds(white?'opponent':'you')]})()`));
    const layout=await d.read(`(()=>{const b=document.querySelector('.board'),r=b.getBoundingClientRect(),m=document.querySelector('#main-content');return {square:Math.abs(r.width-r.height),cells:[...b.querySelectorAll('.square')].every(e=>{const c=e.getBoundingClientRect();return Math.abs(c.width-c.height)<1}),scroll:m.scrollHeight-m.clientHeight,scale:visualViewport.scale}})()`);
    assert(layout.square<1&&layout.cells&&layout.scroll<2&&layout.scale===1,JSON.stringify(layout));
  }
  assert(clocks[0].every((n,i)=>Math.abs(n-clocks[1][i])<=2),'Clocks diverged: '+JSON.stringify(clocks));
}
async function play(){
  await Promise.all([game(a),game(b)]);
  const white=await a.read(`document.querySelector('[data-square]').dataset.square==='0'`)?a:b,black=white===a?b:a;
  assert.equal(await black.read(`document.querySelector('[data-square]').dataset.square`),'63');
  const transport=process.env.QA_TRANSPORT||'bluetooth';
  const recorders=[a.record('knightline-v071-'+transport+'-vivo'),b.record('knightline-v071-'+transport+'-redmi')];
  const start=await white.board();await black.move('e7e5');assert.deepEqual(await black.board(),start,'Out-of-turn move accepted');
  for(const [who,uci] of [[white,'e2e4'],[black,'d7d5'],[white,'e4d5'],[black,'d8d5'],[white,'b1c3'],[black,'d5a5'],[white,'d2d4'],[black,'g8f6']]){
    const previous=await who.board();await who.move(uci);const until=Date.now()+5000;
    while(JSON.stringify(await who.board())===JSON.stringify(previous)&&Date.now()<until)await delay(100);
    assert.notDeepEqual(await who.board(),previous,'Move not committed: '+uci);
    await compare(uci);console.log('PASS synced '+uci);
  }
  for(const d of [a,b]){await d.touch('[data-action="moves"]');await d.wait(`document.querySelectorAll('.move-item').length===8`,'eight visible moves');await d.back();}
  for(const d of [a,b]){await d.touch('[data-action="game-menu"]');await d.touch('[data-native-action="chat.open"]');}
  await a.type('#chat-text','Good game');a.adb('shell','input','keyevent','4');await delay(300);await a.touch('[data-chat-send]');
  await b.wait(`document.querySelector('.chat-log')?.innerText.includes('Good game')`,'incoming chat visible',4000);
  await b.type('#chat-text','Your turn');b.adb('shell','input','keyevent','4');await delay(300);await b.touch('[data-chat-send]');
  await a.wait(`document.querySelector('.chat-log')?.innerText.includes('Your turn')`,'reply visible',4000);
  console.log('PASS live bidirectional chat');
  await Promise.all(recorders.map(r=>new Promise(resolve=>r.exitCode!==null?resolve():r.once('close',resolve))));
  a.adb('pull',a.recordPath,output+'/knightline-v071-'+transport+'-vivo.mp4');b.adb('pull',b.recordPath,output+'/knightline-v071-'+transport+'-redmi.mp4');
}
try{
  await Promise.all([a.connect(),b.connect()]);
  await Promise.all([a.auditStart(),b.auditStart()]);
  if(mode==='bluetooth'){
    for(const [d,role] of [[a,'host'],[b,'join']]){
      await d.home();await d.touch('[data-action="transport-menu"]');await d.touch(`[data-transport="${role}"]`);await d.acceptReplacement();
      for(let n=0;n<3;n++)if(!await nativeAllow(d,true))break;
    }
    await b.wait(`[...document.querySelectorAll('[data-device-index]')].some(e=>e.innerText.includes('vivo'))`,'paired Vivo listed',25000);
    const index=await b.read(`[...document.querySelectorAll('[data-device-index]')].find(e=>e.innerText.includes('vivo')).dataset.deviceIndex`);
    await b.touch(`[data-device-index="${index}"]`);
    for(const d of [a,b])await d.wait(`!!document.querySelector('[data-action="remote-setup"]')&&document.querySelector('#bottom-sheet').dataset.open!=='true'`,'connected room without picker');
    console.log('PASS first-run Bluetooth permission/discovery/connection flow');
  }else if(mode==='online-reconnect'){
    await Promise.all([a.home(),b.home()]);for(const d of [a,b])await d.touch('[data-action="resume"]');
    const before=await a.board();
    await a.touch('[data-action="game-menu"]');await a.touch('[data-native-action="transport.disconnect"]');
    await b.wait(`document.querySelector('.header-status').innerText.includes('Saved')`,'remote loss');await b.home();
    await a.touch('[data-transport="resume"]');await delay(2000);await b.touch('[data-transport="resume"]');
    await Promise.all([game(a),game(b)]);await compare('online reconnect');assert.deepEqual(await a.board(),before,'Online reconnect changed board');
    console.log('PASS online disconnect/reconnect preserved the same match');
  }else if(mode==='reconnect'){
    await Promise.all([a.home(),b.home()]);await a.touch('[data-transport="resume"]');await nativeAllow(a);
    await b.touch('[data-transport="resume"]');await b.wait(`[...document.querySelectorAll('[data-device-index]')].some(e=>e.innerText.includes('vivo'))`,'host discovered',25000);
    const index=await b.read(`[...document.querySelectorAll('[data-device-index]')].find(e=>e.innerText.includes('vivo')).dataset.deviceIndex`);
    await b.touch(`[data-device-index="${index}"]`);await Promise.all([game(a),game(b)]);await compare('reconnect');console.log('PASS reconnect to original board, no replace confirmation or stuck picker');
  }else if(mode==='invite'){
    await invite(a,b,2,true);await invite(b,a,1,true);await invite(b,a,0);
  }else if(mode==='play')await play();
  else if(mode==='online'){
    let code=process.env.AUTO_CODE?'':process.env.ROOM_CODE||'TEST714';
    if(process.env.AUTO_CODE)setupRecords=[a.record('knightline-v071-setup-vivo'),b.record('knightline-v071-setup-redmi')];
    for(const [d,role] of [[a,'host'],[b,'join']]){
      await d.home();await d.touch('[data-action="online-menu"]');if(code){await d.type('#room-code',code);d.adb('shell','input','keyevent','4');await delay(400);}await d.touch(`[data-online="${role}"]`);await d.acceptReplacement();
      if(role==='host'){
        await d.wait(`document.querySelector('.room-status')?.innerText.includes('is ready')`,'shareable ready room',30000);
        if(!code){code=(await d.read(`document.querySelector('.room-status .surface-title').innerText`)).match(/Online room ([A-Z2-9]{6})/)[1];console.log('PASS automatic six-character room code');}
      }
    }
    await Promise.all([a.wait(`!!document.querySelector('[data-action="remote-setup"]')`,'online host connected',35000),b.wait(`!!document.querySelector('[data-action="remote-setup"]')`,'online guest connected',35000)]);
    console.log('PASS actual PeerJS room handshake');await invite(a,b,4);
  }else if(mode==='finish'){
    await a.home();
    if(await a.read(`!!document.querySelector('[data-action="resume"]')`)) {
      for(const d of [a,b]){await d.home();await d.touch('[data-action="resume"]');}
      await a.touch('[data-action="game-menu"]');await a.touch('[data-native-action="match.resign"]');await a.touch('[data-confirm="accept"]');
    }
    for(const d of [a,b]){
      await d.home();
      await d.wait(`!!document.querySelector('[data-action="review-open"]')`,'finished game');
      await d.touch('[data-action="review-open"]');await d.wait(`document.querySelector('#bottom-sheet').dataset.sheetKind==='review-overview'`,'completed highlights');
      await d.back();await d.touch('[data-action="review-back"]');await d.wait(`document.querySelector('#app').dataset.screen==='home'`,'finished review goes Home');
      await d.touch('[data-nav="history"]');await d.wait(`[...document.querySelectorAll('[data-archive-id]')].some(e=>e.innerText.toLowerCase().includes('friend game')&&e.innerText.includes('8 plies'))`,'saved friend game');
      assert(await d.read(`[...document.querySelectorAll('.archive-heading .eyebrow')].every(e=>!['guided lesson','endgame practice'].includes(e.innerText.toLowerCase()))`),'Lesson in history');
    }
    console.log('PASS resignation, result, review and saved friend-game history on both phones');
  }else for(const d of [a,b])console.log(d.serial,await text(d));
  for(const d of [a,b]){const audit=await d.auditEnd();console.log(d.serial+' flow audit '+JSON.stringify(audit));assert.deepEqual(audit.errors,[]);}
}catch(e){console.error(e.stack);for(const d of [a,b]){try{console.error(d.serial,await text(d));d.screenshot(output+'/knightline-v071-failure-'+d.serial+'.png');}catch{}}process.exitCode=1;}
finally{if(setupRecords){await Promise.all(setupRecords.map(r=>new Promise(resolve=>r.exitCode!==null?resolve():r.once('close',resolve))));a.adb('pull',a.recordPath,output+'/knightline-v071-setup-vivo.mp4');b.adb('pull',b.recordPath,output+'/knightline-v071-setup-redmi.mp4');}a.close();b.close();}
