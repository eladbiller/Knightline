// Read-only transport diagnostics. No SDP, addresses, tokens or peer identifiers.
for(const port of (process.argv.slice(2).length?process.argv.slice(2):['19224','19225'])){
  const pages=await(await fetch('http://127.0.0.1:'+port+'/json')).json();
  const page=pages.find(p=>p.url.endsWith('/peer-bridge.html'));
  if(!page){console.log(port,'No transport WebView');continue;}
  const ws=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((ok,no)=>{ws.onopen=ok;ws.onerror=no;});
  const response=new Promise((ok,no)=>{
    const timer=setTimeout(()=>no(Error('Diagnostic timeout')),10000);
    ws.onmessage=({data})=>{const r=JSON.parse(data);if(r.id===1){clearTimeout(timer);ok(r);}};
  });
  ws.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{returnByValue:true,awaitPromise:true,expression:`(async()=>{
    const pc=connection?.peerConnection;
    const pairs=pc?[...((await pc.getStats()).values())].filter(r=>r.type==='candidate-pair').map(r=>({state:r.state,nominated:r.nominated,bytesSent:r.bytesSent,bytesReceived:r.bytesReceived})):[];
    return {epoch,hosting,peer:peer?{open:peer.open,disconnected:peer.disconnected,destroyed:peer.destroyed}:null,channel:connection?{open:connection.open,ice:pc?.iceConnectionState,connection:pc?.connectionState,signaling:pc?.signalingState}:null,pairs};
  })()`}}));
  try{console.log(port,JSON.stringify(await response));}finally{ws.close();}
}
