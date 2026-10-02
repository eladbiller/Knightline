/* Bundled transport only. Native owns the game and the reconnect policy. */
let peer=null, connection=null, roomCode='', bridgePort=null, connectionTimer=null;
let epoch=0, hosting=false, guestName='Guest';
let namespace='knightline-v2-';
const config={debug:0,host:'0.peerjs.com',port:443,path:'/',secure:true,key:'peerjs'};
function tell(kind,more={}){if(bridgePort)bridgePort.postMessage(JSON.stringify({kind,epoch,...more}));}
function clearTimer(){if(connectionTimer)clearTimeout(connectionTimer);connectionTimer=null;}
function closeChannel(){
  clearTimer();const old=connection;connection=null;
  if(old)try{old.close();}catch(_){}
}
function closeRoom(){
  const old=peer;peer=null;closeChannel();roomCode='';
  if(old)try{old.destroy();}catch(_){}
}
function watch(channel,instance){
  closeChannel();connection=channel;
  const current=()=>peer===instance&&connection===channel;
  connectionTimer=setTimeout(()=>{if(current()&&!channel.open){closeChannel();tell('lost');}},12000);
  channel.on('open',()=>{if(!current())return;clearTimer();tell('connected',{name:channel.metadata?.name||'Online friend',room:roomCode});});
  channel.on('data',frame=>{if(current()&&frame&&typeof frame==='object')tell('message',{frame});});
  const lost=()=>{if(!current())return;closeChannel();tell('lost');};
  channel.on('close',lost);channel.on('error',lost);
}
function connectGuest(instance){
  if(instance!==peer||hosting||!instance.open)return;
  if(connection?.open){tell('connected',{name:'Online friend',room:roomCode});return;}
  tell('status',{text:'Opening a direct channel to '+roomCode+'…'});
  watch(instance.connect(namespace+roomCode,{reliable:true,metadata:{name:guestName}}),instance);
}
function openRoom(room,isHost,name){
  const code=String(room||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,8);
  if(code.length<4){tell('status',{text:'Use a four-to-eight character room code.'});return;}
  guestName=String(name||'Guest').slice(0,24);
  if(peer&&!peer.destroyed&&roomCode===code&&hosting===isHost){
    // Retain the host identity; recreating it races the signaling server's id release.
    if(peer.disconnected)try{peer.reconnect();}catch(_){}
    else if(!hosting)connectGuest(peer);
    else if(connection?.open)tell('connected',{name:'Online friend',room:code});
    else tell('status',{text:'Room '+code+' open · waiting for your friend to reconnect'});
    return;
  }
  closeRoom();roomCode=code;hosting=isHost;
  tell('status',{text:isHost?'Creating online room…':'Joining online room…'});
  try{
    const instance=isHost?new Peer(namespace+code,config):new Peer(config);peer=instance;
    instance.on('open',()=>{
      if(peer!==instance)return;
      if(hosting)tell('status',{text:'Online room '+code+' is ready. Share this code.'});
      else connectGuest(instance);
    });
    instance.on('connection',channel=>{
      if(peer!==instance||!hosting||connection?.open){channel.close();return;}
      watch(channel,instance);
    });
    instance.on('disconnected',()=>{
      if(peer!==instance)return;
      // Signaling loss alone does not interrupt an established WebRTC channel.
      if(!connection?.open)tell('lost');
      setTimeout(()=>{if(peer===instance&&instance.disconnected&&!instance.destroyed)try{instance.reconnect();}catch(_){}},1500);
    });
    instance.on('error',error=>{
      if(peer!==instance)return;
      const kind=error?.type;
      if(kind==='unavailable-id'){closeRoom();tell('status',{text:'Room is still reconnecting. Keep both apps open.'});tell('lost');}
      else if(!connection?.open){tell('status',{text:kind==='peer-unavailable'?'Waiting for the host to reopen the room…':'Online connection interrupted. Retrying…'});tell('lost');}
    });
  }catch(_){tell('status',{text:'PeerJS could not load. Check internet and try again.'});tell('lost');}
}
function receive(command){
  if(!command||typeof command!=='object')return;
  if(command.type==='host'||command.type==='join'||command.type==='close'){
    epoch=command.epoch;
    const nextNamespace=command.namespace==='knightline-gpt-v2-'?'knightline-gpt-v2-':'knightline-v2-';
    if(namespace!==nextNamespace)closeRoom();namespace=nextNamespace;
  }
  if(command.epoch!==epoch)return;
  if(command.type==='host')openRoom(command.room,true);
  else if(command.type==='join')openRoom(command.room,false,command.name);
  else if(command.type==='close')closeRoom();
  else if(command.type==='frame'&&connection?.open){try{connection.send(JSON.parse(command.raw));}catch(_){closeChannel();tell('lost');}}
}
window.addEventListener('message',event=>{
  if(event.data!=='knightline-peer-bridge-v1'||!event.ports?.[0])return;
  bridgePort=event.ports[0];bridgePort.onmessage=message=>{try{receive(JSON.parse(message.data));}catch(_){}};
});
