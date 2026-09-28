/* Private PeerJS transport. This is packaged with the app so the bridge keeps its
 * strict CSP; Knightline never executes inline or downloaded bridge code. */
let peer = null;
let connection = null;
let roomCode = '';
let bridgePort = null;
let connectionTimer = null;

const config = {
  // Keep bundled PeerJS quiet in production; the native shell may still log
  // explicit transport failures in debug builds without exposing them in UI.
  debug: 0,
  // Be explicit about the peer cloud endpoint, while retaining PeerJS's own
  // default ICE configuration. Its bundled defaults include the cloud TURN
  // fallback required when a direct STUN route is unavailable.
  host: '0.peerjs.com',
  port: 443,
  path: '/',
  secure: true,
  key: 'peerjs',
};

function tell(kind, more = {}) {
  if (bridgePort) bridgePort.postMessage(JSON.stringify(Object.assign({kind}, more)));
}

function clearConnectionTimer() {
  if (connectionTimer) window.clearTimeout(connectionTimer);
  connectionTimer = null;
}

function cleanRoom(room) {
  return String(room || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
}

function closeRoom() {
  clearConnectionTimer();
  if (connection) {
    try { connection.close(); } catch (_) { /* nothing to close */ }
    connection = null;
  }
  if (peer) {
    try { peer.destroy(); } catch (_) { /* nothing to destroy */ }
    peer = null;
  }
  roomCode = '';
}

function watch(channel, room) {
  clearConnectionTimer();
  connection = channel;
  connectionTimer = window.setTimeout(() => {
    if (connection === channel && !channel.open) {
      tell('status', {text: 'Direct connection is taking longer than usual. Keep both apps open, or use Nearby Bluetooth.'});
    }
  }, 12000);
  channel.on('open', () => tell('connected', {
    name: (channel.metadata && channel.metadata.name) || 'Online friend', room,
  }));
  channel.on('data', frame => {
    if (frame && typeof frame === 'object') tell('message', {frame});
  });
  channel.on('open', clearConnectionTimer);
  channel.on('close', () => { clearConnectionTimer(); tell('lost'); });
  channel.on('error', () => { clearConnectionTimer(); tell('lost'); });
}

function common(instance, room) {
  instance.on('error', error => {
    const kind = error && error.type;
    tell('status', {text: kind === 'peer-unavailable'
      ? 'Room not found. Check the code.'
      : kind === 'unavailable-id'
        ? 'That room code is already in use. Ask your friend to join it instead.'
        : 'Online connection problem. Try again.'});
  });
  instance.on('disconnected', () => tell('lost'));
  instance.on('connection', channel => watch(channel, room));
}

function hostRoom(room) {
  closeRoom();
  roomCode = cleanRoom(room);
  if (roomCode.length < 4) {
    tell('status', {text: 'Use a four-to-eight character room code.'});
    return;
  }
  tell('status', {text: 'Creating online room…'});
  try {
    peer = new Peer('knightline-v1-' + roomCode, config);
    common(peer, roomCode);
    peer.on('open', () => tell('status', {text: 'Online room ' + roomCode + ' is ready. Share this code.'}));
  } catch (_) {
    tell('status', {text: 'PeerJS could not load. Check internet and try again.'});
  }
}

function joinRoom(room, name) {
  closeRoom();
  roomCode = cleanRoom(room);
  if (roomCode.length < 4) {
    tell('status', {text: 'Use the room code your friend shared.'});
    return;
  }
  tell('status', {text: 'Joining online room…'});
  try {
    peer = new Peer(config);
    common(peer, roomCode);
    peer.on('open', () => {
      tell('status', {text: 'Opening a direct channel to ' + roomCode + '…'});
      watch(peer.connect('knightline-v1-' + roomCode, {
        reliable: true,
        metadata: {name: String(name || 'Guest').slice(0, 24)},
      }), roomCode);
    });
  } catch (_) {
    tell('status', {text: 'PeerJS could not load. Check internet and try again.'});
  }
}

function receive(command) {
  if (!command || typeof command !== 'object') return;
  if (command.type === 'host') hostRoom(command.room);
  else if (command.type === 'join') joinRoom(command.room, command.name);
  else if (command.type === 'close') closeRoom();
  else if (command.type === 'frame' && connection && connection.open) {
    try { connection.send(JSON.parse(command.raw)); }
    catch (_) { tell('status', {text: 'Could not send that move.'}); }
  }
}

window.addEventListener('message', event => {
  if (event.data !== 'knightline-peer-bridge-v1' || !event.ports || !event.ports[0]) return;
  bridgePort = event.ports[0];
  bridgePort.onmessage = message => {
    try { receive(JSON.parse(message.data)); } catch (_) { /* Ignore malformed transport messages. */ }
  };
});
