// Real Android WebView UI driver. Never injects bridge commands or game state.
import {execFileSync, spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
export const delay=ms=>new Promise(r=>setTimeout(r,ms));
export class AndroidDevice {
  constructor(serial,port){this.serial=serial;this.port=Number(port)+Number(process.env.QA_PORT_OFFSET||0);this.appId=process.env.APP_ID||'com.eladbiller.knightline';this.pending=new Map();this.id=0;}
  adb(...args){return execFileSync(process.env.ADB||'adb',['-s',this.serial,...args],{encoding:'utf8',timeout:60000}).trim();}
  async connect(){
    let pid;const startDeadline=Date.now()+20000;
    while(!pid&&Date.now()<startDeadline){try{pid=this.adb('shell','pidof',this.appId);}catch{}if(!pid)await delay(250);}
    if(!pid)throw Error('Knightline process did not start: '+this.serial);
    this.adb('forward','tcp:'+this.port,'localabstract:webview_devtools_remote_'+pid);
    let page;const deadline=Date.now()+20000;
    while(!page&&Date.now()<deadline){
      try{const pages=await(await fetch(`http://127.0.0.1:${this.port}/json`,{signal:AbortSignal.timeout(2000)})).json();page=pages.find(p=>p.url.endsWith('/ui/index.html'));}catch{}
      if(!page)await delay(250);
    }
    if(!page)throw Error('No visible Knightline WebView: '+this.serial);
    this.ws=new WebSocket(page.webSocketDebuggerUrl);
    this.ws.addEventListener('message',({data})=>{const m=JSON.parse(data),p=this.pending.get(m.id);if(!p)return;clearTimeout(p.timer);this.pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);});
    await new Promise((resolve,reject)=>{this.ws.onopen=resolve;this.ws.onerror=reject;});
    await this.wait(`document.querySelector('#app')?.dataset.ready==='true'`,'native bridge');
    await this.foreground();
    return this;
  }
  close(){this.ws?.close();}
  call(method,params={}){return new Promise((resolve,reject)=>{const id=++this.id,timer=setTimeout(()=>{this.pending.delete(id);reject(Error('CDP timeout '+method));},20000);this.pending.set(id,{resolve,reject,timer});this.ws.send(JSON.stringify({id,method,params}));});}
  async read(expression){const r=await this.call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
  async wait(expression,label,timeout=20000){const until=Date.now()+timeout;while(Date.now()<until){if(await this.read(expression))return;await delay(150);}throw Error(this.serial+': waiting for '+label);}
  async foreground(){
    const until=Date.now()+5000;let focus='';
    do{focus=this.adb('shell','dumpsys','window').split('\n').find(line=>line.includes('mCurrentFocus='))||'';
      if(focus.includes('Not Responding'))throw Error('Android ANR covers test app: '+focus);
      if(focus.includes(this.appId+'/'))return;
      await delay(200);
    }while(Date.now()<until);
    throw Error('Test app is not the focused Android window: '+focus);
  }
  async touch(selector,scroll=true){
    await this.foreground();
    const s=JSON.stringify(selector);
    await this.wait(`!!document.querySelector(${s})&&!document.querySelector(${s}).disabled`,selector);
    await this.wait(`(()=>{const e=document.querySelector(${s}).closest('#bottom-sheet');return !e||e.dataset.open==='true'&&!e.getAnimations().some(a=>a.playState==='running')&&Math.abs(new DOMMatrixReadOnly(getComputedStyle(e).transform).m42)<.1})()`,'settled sheet');
    if(scroll){await this.read(`document.querySelector(${s}).scrollIntoView({block:'nearest'})`);await delay(150);}
    const p=await this.read(`(()=>{const e=document.querySelector(${s}),r=e.getBoundingClientRect();if(!r.width||r.y<0||r.bottom>innerHeight+1)throw Error('Offscreen control: '+${s});return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    await this.wait(`(()=>{const e=document.querySelector(${s}),h=document.elementFromPoint(${p.x},${p.y});return e===h||e.contains(h)})()`,'uncovered '+selector,3000);
    await this.call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...p,id:1}]});await delay(75);
    await this.call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await delay(300);
  }
  async type(selector,value){await this.touch(selector);this.adb('shell','input','text',value.replaceAll(' ','%s'));await delay(250);}
  async back(){await this.foreground();this.adb('shell','input','keyevent','4');await delay(400);}
  async home(){
    const state=`({screen:document.querySelector('#app').dataset.screen,sheet:document.querySelector('#bottom-sheet').dataset.open==='true',kind:document.querySelector('#bottom-sheet').dataset.sheetKind,title:document.querySelector('#sheet-title')?.innerText,nav:!!document.querySelector('[data-nav="home"]')?.getBoundingClientRect().width})`;
    for(let n=0;n<10;n++){
      const s=await this.read(state);if(!s.sheet&&s.screen==='home')return;
      if(s.sheet)await this.back();else if(s.nav)await this.touch('[data-nav="home"]');else await this.back();
      // Back crosses the WebMessagePort asynchronously. Do not send a second
      // Back merely because a slow emulator has not painted the first yet.
      await this.wait(`JSON.stringify(${state})!==${JSON.stringify(JSON.stringify(s))}`,'navigation response');
    }
    throw Error('Cannot return Home');
  }
  async acceptReplacement(){await delay(350);if(await this.read(`!!document.querySelector('[data-confirm="accept"]')`))await this.touch('[data-confirm="accept"]');}
  async board(){return this.read(`[...document.querySelectorAll('[data-square]')].sort((a,b)=>Number(a.dataset.square)-Number(b.dataset.square)).map(e=>e.getAttribute('aria-label').replace(/, (selected|legal move|last move|check).*$/,''))`);}
  async move(uci){for(const sq of [uci.slice(0,2),uci.slice(2,4)])await this.touch(`[data-square="${(8-Number(sq[1]))*8+sq.charCodeAt(0)-97}"]`,false);}
  async state(){return this.read(`({screen:document.querySelector('#app').dataset.screen,text:document.querySelector('#app').innerText,sheet:document.querySelector('#bottom-sheet').dataset,controls:[...document.querySelectorAll('button,input')].filter(e=>e.getBoundingClientRect().width).map(e=>({text:e.innerText||e.placeholder,data:{...e.dataset}})),viewport:[innerWidth,innerHeight]})`);}
  screenshot(path){this.adb('shell','screencap','-p','/sdcard/knightline-qa.png');this.adb('pull','/sdcard/knightline-qa.png',path);}
  async auditStart(){await this.read(`(()=>{window.__phoneAudit={frames:0,errors:[],running:true};function frame(){const a=window.__phoneAudit;if(!a.running)return;a.frames++;const b=document.querySelector('.board');if(b){const r=b.getBoundingClientRect();if(Math.abs(r.width-r.height)>1)a.errors.push('Board aspect');if(visualViewport.scale!==1)a.errors.push('Viewport zoom');for(const e of b.querySelectorAll('.square')){const c=e.getBoundingClientRect();if(Math.abs(c.width-c.height)>1)a.errors.push('Square aspect');}}const s=document.querySelector('#bottom-sheet');if(s.dataset.open==='true'){const r=s.getBoundingClientRect();if(Math.abs(r.x-(innerWidth-r.width)/2)>1)a.errors.push('Sideways sheet');}requestAnimationFrame(frame);}requestAnimationFrame(frame)})()`);}
  async auditEnd(){return this.read(`(()=>{const a=window.__phoneAudit;a.running=false;return {frames:a.frames,errors:[...new Set(a.errors)]}})()`);}
  record(name,seconds=45){this.recordPath='/sdcard/'+name+'.mp4';return spawn(process.env.ADB||'adb',['-s',this.serial,'shell','screenrecord','--time-limit',String(seconds),this.recordPath],{stdio:'ignore'});}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const [serial,port,action,...args]=process.argv.slice(2),d=new AndroidDevice(serial,Number(port));
  try{await d.connect();let result;if(action==='read')result=await d.read(args[0]);else if(action==='touch')result=await d.touch(args[0]);else if(action==='type')result=await d.type(args[0],args[1]);else if(action==='move')result=await d.move(args[0]);else if(action==='back')result=await d.back();else if(action==='home')result=await d.home();else if(action==='screenshot')result=d.screenshot(args[0]);else result=await d.state();console.log(JSON.stringify(result??await d.state()));}finally{d.close();}
}
