// Lifecycle contract tests supplement (not replace) actual two-phone WebRTC flows.
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const peers=[],events=[],timers=[];
class Emitter{constructor(){this.handlers={};}on(n,f){(this.handlers[n]??=[]).push(f);}emit(n,...a){for(const f of this.handlers[n]||[])f(...a);}}
class Channel extends Emitter{constructor(){super();this.open=false;this.closed=false;}close(){this.closed=true;this.open=false;this.emit('close');}send(){}}
class Peer extends Emitter{constructor(id){super();this.id=id;this.open=false;this.destroyed=false;this.disconnected=false;peers.push(this);}destroy(){this.destroyed=true;this.emit('disconnected');}reconnect(){this.disconnected=false;this.reconnected=true;}connect(id){this.target=id;this.channel=new Channel();return this.channel;}}
const window={addEventListener:(n,f)=>window.listener=f};
const ctx=vm.createContext({Peer,window,setTimeout:f=>(timers.push(f),timers.length),clearTimeout:()=>{}});
vm.runInContext(readFileSync('app/src/main/assets/peer-bridge.js','utf8'),ctx);
const port={postMessage:s=>events.push(JSON.parse(s))};window.listener({data:'knightline-peer-bridge-v1',ports:[port]});
const send=x=>port.onmessage({data:JSON.stringify(x)});
send({type:'host',room:'TEST',epoch:1});const host=peers[0];host.open=true;host.emit('open');
const a=new Channel();host.emit('connection',a);a.open=true;a.emit('open');
assert.equal(events.at(-1).kind,'connected');
const intruder=new Channel();host.emit('connection',intruder);assert(intruder.closed);assert(!a.closed);
host.disconnected=true;host.emit('disconnected');assert.notEqual(events.at(-1).kind,'lost','signaling disconnect killed live channel');
send({type:'host',room:'TEST',epoch:2});assert.equal(peers.length,1);assert(host.reconnected,'reuse signaling identity');
a.close();assert.equal(events.at(-1).kind,'lost');
const b=new Channel();host.emit('connection',b);b.open=true;b.emit('open');const length=events.length;
a.emit('error');a.emit('data',{type:'move'});assert.equal(events.length,length,'old channel contaminated new channel');
send({type:'close',epoch:3});assert.equal(events.length,length,'intentional close emitted loss');
host.emit('connection',new Channel());assert.equal(events.length,length,'destroyed peer emitted events');
send({type:'join',room:'TEST',epoch:4});const guest=peers.at(-1);guest.open=true;guest.emit('open');const first=guest.channel;
send({type:'join',room:'TEST',epoch:5});assert(first.closed);const second=guest.channel;assert.notEqual(first,second);
second.open=true;second.emit('open');assert.equal(events.at(-1).epoch,5);
const end=events.length;first.emit('error');assert.equal(events.length,end);
send({type:'frame',epoch:4,raw:'{}'});assert.equal(events.length,end,'old native epoch accepted');
send({type:'host',room:'GPT1',epoch:6,namespace:'knightline-gpt-v2-'});assert.equal(peers.at(-1).id,'knightline-gpt-v2-GPT1');
send({type:'join',room:'GPT1',epoch:7,namespace:'knightline-gpt-v2-'});const gpt=peers.at(-1);gpt.open=true;gpt.emit('open');assert.equal(gpt.target,'knightline-gpt-v2-GPT1');
console.log('Peer reconnect lifecycle: 15 assertions passed, including GPT edition room isolation');
