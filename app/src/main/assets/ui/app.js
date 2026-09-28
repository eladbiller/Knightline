(() => {
  'use strict';

  const BRIDGE_VERSION = 1;
  const app = document.getElementById('app');
  const header = document.getElementById('app-header');
  const main = document.getElementById('main-content');
  const sheet = document.getElementById('bottom-sheet');
  const sheetScroll = document.getElementById('sheet-scroll');
  const backdrop = document.getElementById('sheet-backdrop');
  const toastRegion = document.getElementById('toast-region');
  const nav = document.querySelector('.bottom-nav');

  const model = {
    screen: 'home',
    session: '',
    transport: {ready: false, status: 'Preparing local board…', devices: []},
    profile: {rating: 800, ratedGames: 0, provisional: true, history: [], scope: 'Private skill rating · on this device'},
    lessons: {items: []},
    match: null,
    review: {available: false},
  };
  let port = null;
  let sequence = 0;
  let selectedSquare = null;
  let dragStart = null;
  let suppressNextBoardClick = false;
  let overlay = null;
  let overlayReturnFocus = null;
  let closingSheetTimer = 0;
  let renderedScreen = '';
  let movePending = false;

  const clockNames = ['10 | 0', '5 | 0', '3 | 2', '1 | 0', 'Untimed'];
  const strengthNames = ['Easy', 'Medium', 'Hard'];

  function knightIcon() {
    return '<svg viewBox="0 0 32 32" role="img" focusable="false" aria-hidden="true">' +
      '<path fill="currentColor" d="M23.8 27H8.3c-.8 0-1.4-.8-1.1-1.6l1.5-4.1c.2-.5.5-.9 1-1.1l2.8-1.2-3.2-4.7c-.6-.8-.3-2 .6-2.5l3.1-1.8-1-4.2c-.2-.9.4-1.7 1.3-1.7 4.1 0 7.6 2.4 8.9 6.1l1.1 3.1c.2.6.1 1.2-.3 1.7l-2.9 3.4 2.4 2.1c.4.3.6.8.6 1.3V27Zm-11.6-4.5-.4 1.1h8.8v-.8l-3.4-3-3.8 1.6-1.2 1.1Zm2.4-13.7.5 2.1 2.8-1.6a5.6 5.6 0 0 0-3.3-.5Z"/>' +
      '</svg>';
  }

  function icon(name) {
    const paths = {
      back: '<path d="m14.5 5-7 7 7 7M8 12h11"/>',
      bot: '<rect x="4" y="6" width="16" height="13" rx="4"/><path d="M9 11h.01M15 11h.01M9 15h6M12 6V3"/>',
      bluetooth: '<path d="m12 3 5 4-5 5 5 5-5 4V3Zm0 9L7 7m5 5-5 5"/>',
      room: '<circle cx="9" cy="12" r="3.5"/><circle cx="15" cy="12" r="3.5"/><path d="M3.5 18.5c1.2-2 3-3 5.5-3m11.5 3c-1.2-2-3-3-5.5-3"/>',
      learn: '<path d="M12 3.5 13.8 9l5.7 1.8-5.7 1.8L12 18l-1.8-5.4-5.7-1.8L10.2 9Z"/>',
      pass: '<path d="M4 8h13m-3-3 3 3-3 3M20 16H7m3 3-3-3 3-3"/>',
      save: '<path d="M5 3.5h11l3 3V20H5Z"/><path d="M8 3.5v5h7v-5M8 20v-7h8v7"/>',
      engine: '<path d="M8 4h8v3h3v10h-3v3H8v-3H5V7h3Z"/><path d="M9 10h6M9 14h4"/>',
      moves: '<path d="M6 5h12M6 12h12M6 19h12"/><circle cx="3" cy="5" r=".8"/><circle cx="3" cy="12" r=".8"/><circle cx="3" cy="19" r=".8"/>',
      more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
      close: '<path d="m6 6 12 12M18 6 6 18"/>',
      hint: '<path d="M9 18h6M10 21h4M8.3 14.5A6 6 0 1 1 15.7 14.5c-.8.6-1.2 1.3-1.2 2h-5c0-.7-.4-1.4-1.2-2Z"/>',
      flag: '<path d="M6 21V4m0 1h11l-2 4 2 4H6"/>',
      trash: '<path d="M4 6h16M9 6V3h6v3m3 0-1 15H7L6 6M10 10v7m4-7v7"/>',
      undo: '<path d="M8 7H3v-5M3.5 7A9 9 0 1 1 4 18"/>',
      chat: '<path d="M4 5h16v12H9l-5 4Z"/><path d="M8 9h8M8 13h5"/>',
      settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2M12 19.2v2M2.8 12h2M19.2 12h2M5.5 5.5l1.4 1.4m10.2 10.2 1.4 1.4m0-13-1.4 1.4M6.9 17.1l-1.4 1.4"/>',
      check: '<path d="m5 12 4 4 10-10"/>',
      review: '<path d="M4 5h16v14H4Z"/><path d="M8 15v-3m4 3V8m4 7v-5"/>',
    };
    return '<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + (paths[name] || paths.more) + '</svg>';
  }

  function actionIcon(action) {
    const value = String(action || '');
    if (value.indexOf('takeback') >= 0) return 'undo';
    if (value.indexOf('resign') >= 0) return 'flag';
    if (value.indexOf('clear') >= 0) return 'trash';
    if (value.indexOf('chat') >= 0) return 'chat';
    if (value.indexOf('engine') >= 0) return 'engine';
    if (value.indexOf('setting') >= 0) return 'settings';
    if (value.indexOf('disconnect') >= 0) return 'close';
    return 'more';
  }

  function escape(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  function object(value, fallback) {
    return value && typeof value === 'object' ? value : fallback;
  }

  function array(value) {
    return Array.isArray(value) ? value : [];
  }

  function applyFontScale(value) {
    // Android's large-text preference must make supporting copy easier to read,
    // without allowing display headings to consume an entire phone viewport.
    // The layout adds its own reflow tier below, so 150% users get both larger
    // body copy and wider, stacked content rather than clipped or tiny columns.
    const requested = Math.max(85, Math.min(200, Math.round(Number(value) || 100)));
    const responsive = Math.round(100 + (requested - 100) * 0.28);
    const root = document.documentElement;
    root.style.setProperty('--system-font-size', responsive + '%');
    root.dataset.fontScale = String(requested);
    root.dataset.fontScaleTier = requested >= 145 ? 'large' : requested >= 120 ? 'medium' : 'normal';
  }

  function send(type, payload, needsSession) {
    if (!port) return;
    const requiresSession = needsSession !== false;
    const envelope = {
      v: BRIDGE_VERSION,
      id: 'web-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
      type: type,
      session: requiresSession ? model.session : '',
      seq: ++sequence,
      payload: payload || {},
    };
    port.postMessage(JSON.stringify(envelope));
  }

  function go(screen) {
    // Navigation is safe to paint optimistically: native remains authoritative
    // and will immediately correct state if a command changes the destination.
    // This removes the perceptible bridge round trip when moving between tabs.
    if (model.screen !== screen) {
      model.screen = screen;
      render();
    }
    send('nav.' + screen, {}, false);
  }

  function stateEvent(event) {
    const payload = object(event.payload, {});
    applyFontScale(payload.fontScale);
    model.screen = payload.screen || model.screen;
    model.session = payload.session || '';
    model.transport = object(payload.transport, model.transport);
    model.profile = object(payload.profile, model.profile);
    model.lessons = object(payload.lessons, model.lessons);
    model.match = payload.match && payload.match.position ? payload.match : null;
    model.review = object(payload.review, model.review);
    // Any authoritative state response completes (or rejects) the one pending
    // board command. This prevents rapid taps from queuing a second move against
    // a position that is already changing natively.
    movePending = false;
    if (!model.match && (model.screen === 'game' || model.screen === 'review')) model.screen = 'home';
    if (selectedSquare != null && !canSelectFrom(selectedSquare)) selectedSquare = null;
    render();
  }

  function receive(raw) {
    let event;
    try { event = JSON.parse(raw); } catch (_) { return; }
    if (!event || event.v !== BRIDGE_VERSION) return;
    const payload = object(event.payload, {});
    if (event.type === 'state') {
      stateEvent(event);
    } else if (event.type === 'clock') {
      if (model.match) {
        model.match.clock = payload;
        patchClocks();
      }
    } else if (event.type === 'transport') {
      model.transport = payload;
      patchHeader();
      if (overlay && overlay.kind === 'nearby') updateNearbySheet();
    } else if (event.type === 'notice') {
      toast(payload.message || '', !!payload.error);
    } else if (event.type === 'overlay') {
      showNativeOverlay(payload);
    } else if (event.type === 'confirm') {
      openConfirmation(payload);
    } else if (event.type === 'promotion') {
      openPromotion(payload);
    } else if (event.type === 'back') {
      if (overlay) closeOverlay();
      else send('nav.back', {}, false);
    }
  }

  window.addEventListener('message', (event) => {
    if (event.data !== 'knightline-bridge-v1' || !event.ports || !event.ports[0]) return;
    port = event.ports[0];
    port.onmessage = (message) => receive(message.data);
    send('ui.ready', {}, false);
  });

  function render() {
    // The main area intentionally owns scrolling while the header and navigation stay
    // put.  A top-level destination must therefore begin at its top, but incremental
    // state updates for the same destination (clocks, engine analysis, hints) must not
    // steal the player's scroll position.
    const screenChanged = renderedScreen !== model.screen;
    app.dataset.screen = model.screen;
    patchHeader();
    patchNavigation();
    if (model.screen === 'play') renderPlay();
    else if (model.screen === 'learn') renderLearn();
    else if (model.screen === 'profile') renderProfile();
    else if (model.screen === 'game') renderGame();
    else if (model.screen === 'review') renderReview();
    else renderHome();
    if (screenChanged) main.scrollTop = 0;
    renderedScreen = model.screen;
  }

  function patchHeader() {
    const transport = object(model.transport, {});
    const connected = !!transport.ready;
    const waitingForRoom = !connected && transport.kind === 'online' &&
      /opening|waiting|connecting|created|join/i.test(String(transport.status || ''));
    const findingNearby = !connected && /scanning|connecting/i.test(String(transport.status || ''));
    const label = connected ? 'Private room' : waitingForRoom ? 'Room opening…' : findingNearby ? 'Finding friend…' : 'Offline ready';
    const focused = model.screen === 'game' || model.screen === 'review';
    header.innerHTML = focused
      ? '<div class="header-brand"><button class="header-back" type="button" data-action="' + (model.screen === 'review' ? 'review-back' : 'nav-home') + '" aria-label="Back">' + icon('back') + '</button>' +
        '<div><p class="header-context">' + (model.screen === 'review' ? 'Analysis' : 'Current game') + '</p><p class="brand-word">' + (model.screen === 'review' ? 'Game review' : escape(model.match && model.match.opponent || 'Knightline')) + '</p></div></div>' +
        '<div class="header-status header-status--compact"><span class="status-dot ' + (connected ? '' : 'status-dot--idle') + '"></span><span>' + escape(connected ? 'Connected' : 'Saved') + '</span></div>'
      : '<div class="header-brand"><div class="brand-mark" aria-hidden="true">' + knightIcon() + '</div>' +
        '<p class="brand-word">Knightline</p></div>' +
        '<div class="header-status"><span class="status-dot ' + (connected ? '' : 'status-dot--idle') + '"></span>' +
        '<span>' + escape(label) + '</span></div>';
  }

  function patchNavigation() {
    const screen = model.screen === 'game' || model.screen === 'review' ? '' : model.screen;
    nav.querySelectorAll('[data-nav]').forEach((button) => {
      const current = button.dataset.nav === screen;
      if (current) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
  }

  function renderHome() {
    const profile = object(model.profile, {});
    const match = model.match;
    const last = array(profile.history)[0];
    main.innerHTML =
      '<section class="screen screen--home">' +
      '<article class="surface hero">' +
      '<div class="hero-grid"><div><p class="eyebrow">Your board. Your pace.</p>' +
      '<h1 class="title">Make the next move count.</h1>' +
      '<p class="subtitle">Offline engine play, private rooms, and focused learning—without an account.</p></div>' +
      '<div class="hero-rating"><span class="rating-number">' + escape(profile.rating || 800) + '</span>' +
      '<span class="rating-label">Private skill</span>' +
      (last ? '<span class="rating-delta">' + (last.delta >= 0 ? '+' : '') + escape(last.delta) + ' last game</span>' : '') +
      '</div></div><div class="hero-actions">' +
      '<button class="button button--primary" type="button" data-action="nav-play">' + icon('bot') + ' Play now</button>' +
      '<button class="button button--quiet" type="button" data-action="nav-learn">Open learning</button>' +
      '</div></article>' +
      (match ? resumeCard(match) : '') +
      roomStatusCard(match) +
      '<section class="quick-grid" aria-label="Ways to play">' +
      quickCard('bot', 'Play Stockfish', 'Offline bot, clocks and private skill', 'setup-bot') +
      quickCard('bluetooth', 'Nearby game', 'Bluetooth on two Knightline phones', 'transport-menu') +
      quickCard('room', 'Private room', 'Online peer-to-peer room code', 'online-menu') +
      quickCard('learn', 'Learn an opening', 'Guided lines with progressive hints', 'nav-learn') +
      '</section>' +
      '<article class="surface home-activity"><div class="section-heading"><div><p class="eyebrow">Local only</p><h2 class="surface-title">Your private rating</h2></div>' +
      '<button class="section-action" type="button" data-action="nav-profile">View profile</button></div>' +
      '<div class="activity-list"><div class="activity-item"><span class="activity-badge">⌁</span><div><p class="activity-title">' +
      escape(profile.scope || 'Private skill rating · on this device') + '</p><p class="activity-copy">No leaderboard, accounts, or global claims.</p></div>' +
      '<span class="activity-value">' + escape(profile.ratedGames || 0) + ' rated</span></div>' +
      '<div class="activity-item"><span class="activity-badge">◈</span><div><p class="activity-title">Built for offline play</p>' +
      '<p class="activity-copy">Bots, lessons, review, saves and Bluetooth work without a network.</p></div><span class="activity-value activity-value--neutral">Ready</span></div>' +
      '</div></article></section>';
  }

  function resumeCard(match) {
    return '<article class="surface surface--flat"><div class="section-heading"><div><p class="eyebrow">Saved board</p><h2 class="surface-title">' +
      escape(match.yourTurn ? 'Your move is waiting' : 'Match in progress') + '</h2><p class="subtitle">' +
      escape(match.opponent || 'Private game') + ' · ' + escape(match.clock && match.clock.preset || 'Untimed') + '</p></div>' +
      '<button class="button button--mint button--compact" type="button" data-action="resume">Resume</button></div></article>';
  }

  function roomStatusCard(match) {
    const transport = object(model.transport, {});
    const activelyOpening = transport.kind === 'online' &&
      /opening|waiting|connecting|created|join/i.test(String(transport.status || ''));
    if (match || (!transport.ready && !activelyOpening)) return '';
    const roomName = String(transport.peer || '').trim() || 'Private room';
    if (transport.ready) {
      const action = transport.hosting ? 'Set up a game' : 'Suggest a game';
      const detail = transport.hosting
        ? 'Choose a clock, then invite your connected friend.'
        : 'Choose a clock and ask your friend to start a private game.';
      return '<article class="surface room-status"><div class="section-heading"><div><p class="eyebrow">Private room connected</p><h2 class="surface-title">' + escape(roomName) + '</h2><p class="subtitle">' + escape(detail) +
        '</p></div><button class="button button--mint button--compact" type="button" data-action="remote-setup">' + escape(action) + '</button></div></article>';
    }
    return '<article class="surface surface--flat room-status"><p class="eyebrow">Private online room</p><h2 class="surface-title">Waiting for your friend</h2><p class="subtitle">' +
      escape(transport.status || roomName + ' is opening. Keep Knightline open while your friend joins.') + '</p></article>';
  }

  function quickCard(iconName, title, detail, action) {
    return '<button class="quick-card" type="button" data-action="' + action + '"><span class="quick-icon" aria-hidden="true">' +
      icon(iconName) + '</span><span class="quick-label">' + escape(title) + '</span><span class="quick-meta">' + escape(detail) + '</span><span class="quick-chevron" aria-hidden="true">›</span></button>';
  }

  function renderPlay() {
    const transport = object(model.transport, {});
    const connectedRoom = transport.ready ? '<article class="surface room-status"><p class="eyebrow">Private room connected</p><h2 class="surface-title">Ready to play together</h2><p class="subtitle">' +
      escape(transport.hosting ? 'Choose the clock and invite your friend.' : 'Suggest a clock to your connected friend.') +
      '</p><div class="hero-actions"><button class="button button--mint" type="button" data-action="remote-setup">' +
      escape(transport.hosting ? 'Set up a game' : 'Suggest a game') + '</button></div></article>' : '';
    main.innerHTML =
      '<section class="screen"><div><p class="eyebrow">Play</p><h1 class="title">Choose your board.</h1><p class="subtitle">Every local game is ready without a sign-in.</p></div>' +
      connectedRoom +
      '<article class="surface"><div class="section-heading"><div><h2 class="surface-title">Play Stockfish</h2><p class="subtitle">Choose a clock and a level. Hints turn it into Practice.</p></div></div>' +
      '<div class="hero-actions"><button class="button button--primary" type="button" data-action="setup-bot">Set up bot game</button></div></article>' +
      '<div class="quick-grid">' +
      quickCard('pass', 'Pass & play', 'Two people, one device', 'setup-pass') +
      quickCard('bluetooth', 'Nearby Bluetooth', 'No internet required', 'transport-menu') +
      quickCard('room', 'Private Peer room', 'Invite only, internet for signaling', 'online-menu') +
      quickCard('save', 'Saved board', model.match ? 'Resume where you stopped' : 'No game in progress', model.match ? 'resume' : 'setup-bot') +
      '</div>' +
      '<article class="surface"><p class="eyebrow">Match integrity</p><p class="body-copy">A clean standard game can update your on-device private skill estimate. Hints, takebacks, lessons and review branches are clearly labelled Practice.</p></article></section>';
  }

  function renderLearn() {
    const lessons = array(object(model.lessons, {}).items);
    main.innerHTML =
      '<section class="screen"><div><p class="eyebrow">Learn</p><h1 class="title">Build patterns, not guesses.</h1><p class="subtitle">Guided opening lines reveal the idea first, then the piece, then the move.</p></div>' +
      '<article class="lesson-hero"><p class="eyebrow">Progressive coaching</p><h2 class="surface-title">Hints never change the board.</h2><p class="body-copy">Ask for a concept, reveal the piece, then show the arrow only when you want it.</p></article>' +
      '<section class="lesson-list" aria-label="Opening lessons">' +
      lessons.map((lesson) => '<button class="lesson-card" type="button" data-lesson="' + escape(lesson.id) + '">' +
        '<span class="lesson-icon" aria-hidden="true">✦</span><span class="lesson-content"><span class="lesson-title">' + escape(lesson.name) + '</span>' +
        '<span class="lesson-copy">' + escape(lesson.intro) + '</span></span><span class="progress-ring" data-label="' +
        escape(lesson.moves) + 'm" aria-label="' + escape(lesson.moves) + ' guided moves"></span></button>').join('') +
      '</section></section>';
  }

  function renderProfile() {
    const profile = object(model.profile, {});
    const history = array(profile.history);
    main.innerHTML =
      '<section class="screen"><div><p class="eyebrow">Profile</p><h1 class="title">Your private skill.</h1><p class="subtitle">' +
      escape(profile.scope || 'Private skill rating · on this device') + '</p></div>' +
      '<article class="surface hero"><div class="hero-grid"><div><p class="eyebrow">' + (profile.provisional ? 'Provisional estimate' : 'Established estimate') +
      '</p><h2 class="title">Keep playing clean games.</h2><p class="subtitle">Bot anchors are estimated: Easy 600, Medium 1200, Hard 1800.</p></div><div class="hero-rating"><span class="rating-number">' +
      escape(profile.rating || 800) + '</span><span class="rating-label">Private skill</span></div></div></article>' +
      '<div class="profile-grid"><article class="metric"><span class="metric-value">' + escape(profile.ratedGames || 0) + '</span><span class="metric-label">Rated games</span></article>' +
      '<article class="metric"><span class="metric-value">K ' + escape(profile.nextK || 32) + '</span><span class="metric-label">Next update factor</span></article></div>' +
      '<article class="surface"><div class="section-heading"><div><p class="eyebrow">Recent results</p><h2 class="surface-title">On this device</h2></div></div>' +
      ratingChart(history) + (history.length ? '<div class="activity-list">' + history.map((entry) =>
        '<div class="activity-item"><span class="activity-badge">' + (entry.result === 'Win' ? '↑' : entry.result === 'Loss' ? '↓' : '—') +
        '</span><div><p class="activity-title">' + escape(entry.result) + ' vs ' + escape(entry.opponentKind === 'bot' ? 'estimated bot' : 'friend') +
        '</p><p class="activity-copy">Opponent estimate ' + escape(entry.opponent) + '</p></div><span class="activity-value">' +
        (entry.delta >= 0 ? '+' : '') + escape(entry.delta) + '</span></div>').join('') + '</div>' :
        '<div class="empty-state">Complete a clean standard game to start this local history.</div>') +
      '<p class="rating-footnote">This is an Elo-style estimate stored only on this phone. It is not a global ranking, account rating or anti-cheat guarantee.</p></article></section>';
  }

  function ratingChart(history) {
    const values = history.slice().reverse().map((entry) => Number(entry.after || 800));
    if (!values.length) return '';
    const min = Math.min.apply(null, values.concat([800])) - 12;
    const max = Math.max.apply(null, values.concat([800])) + 12;
    const range = Math.max(1, max - min);
    const points = values.map((value, index) => {
      const x = values.length === 1 ? 50 : (index / (values.length - 1)) * 100;
      const y = 91 - ((value - min) / range) * 76;
      return x.toFixed(1) + ',' + y.toFixed(1);
    }).join(' ');
    return '<div class="rating-chart" aria-label="Private rating history"><svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img"><defs><linearGradient id="rating-area" x1="0" x2="0" y1="0" y2="1"><stop stop-color="#76e2c7" stop-opacity=".28"></stop><stop offset="1" stop-color="#76e2c7" stop-opacity="0"></stop></linearGradient></defs><path class="chart-grid" d="M0 20H100M0 55H100M0 90H100"></path><polygon class="chart-area" points="0,100 ' +
      points + ' 100,100"></polygon><polyline class="chart-line" points="' + points + '"></polyline></svg></div>';
  }

  function renderGame() {
    const match = model.match;
    if (!match) { renderHome(); return; }
    const clock = object(match.clock, {});
    const coach = object(match.coach, {});
    const winner = Number(match.winner);
    const finished = winner >= 0;
    const opponentActive = !finished && Number(clock.active) !== Number(match.me);
    const youActive = !finished && Number(clock.active) === Number(match.me);
    const position = object(match.position, {});
    const evaluationEnabled = !!match.evaluationEnabled;
    const material = materialBalance(array(position.b));
    main.innerHTML =
      '<section class="screen screen--game"><div class="game-topline"><div><p class="eyebrow">' + escape(match.practice || 'Practice') +
      '</p><p class="game-name">' + escape(match.yourTurn ? 'Your move' : finished ? gameResult(match) : 'Board in play') + '</p></div>' +
      (evaluationEnabled ? '<button class="eval-chip" type="button" data-action="engine-info" aria-label="Stockfish evaluation ' + escape(coach.evaluation || 'not ready') + '. ' + escape(coach.evaluationState || 'Analyzing') + '">' +
      '<span class="eval-label">EVAL</span><span data-evaluation>' + escape(coach.evaluation || '—') + '</span><span class="eval-state">' + escape(coach.evaluationState || 'Analyzing') + '</span></button></div>' +
      '' : '<span class="game-state-pill">' + icon('check') + escape(finished ? 'Complete' : match.yourTurn ? 'Your turn' : 'In play') + '</span></div>') +
      playerCard(match.opponent || 'Opponent', playerDetail(match.opponentDetail || 'Private match', material, 1 - Number(match.me)), initials(match.opponent || 'OP'), clockForOpponent(match, clock), opponentActive, !!match.solo, 'opponent') +
      '<div id="board-host" class="board-stage">' + boardLayout(position, Number(match.me), true, coach, evaluationEnabled) + '</div>' +
      playerCard(match.you || 'You', playerDetail(match.youDetail || 'Your side', material, Number(match.me)), 'ME', clockForYou(match, clock), youActive, false, 'you') +
      coachMarkup(coach, match, finished) +
      '<p class="turn-note">' + escape(finished ? (match.note || gameResult(match)) : (match.lastMove || match.note || (match.yourTurn ? 'Choose a piece to see legal destinations.' : 'Waiting for the next move.'))) + '</p>' +
      gameActions(match, finished) + '</section>';
    attachBoardInteractions();
  }

  function playerCard(name, detail, initialsValue, clock, active, bot, clockRole) {
    return '<article class="player-card' + (active ? ' player-card--active' : '') + '"><span class="avatar' + (bot ? ' avatar--bot' : '') + '">' +
      escape(initialsValue) + '</span><div class="player-copy"><p class="player-name">' + escape(name) + '</p><p class="player-meta">' +
      escape(detail) + '</p></div><span class="clock' + (active ? ' clock--active' : '') + '" data-clock="' + escape(clockRole) + '">' +
      escape(clock) + '</span></article>';
  }

  function coachMarkup(coach, match, finished) {
    if (finished) return '';
    if (!coach.copy && !coach.heading) return '';
    const stage = Math.max(0, Math.min(3, Number(coach.stage) || 0));
    const total = coach.kind === 'lesson' ? 3 : 2;
    const progress = '<span class="coach-progress" aria-label="Hint stage ' + stage + ' of ' + total + '">' +
      Array.from({length: total + 1}, (_, index) => '<i class="' + (index <= stage ? 'is-active' : '') + '"></i>').join('') + '</span>';
    return '<article class="coach-card"><div class="coach-icon">' + icon('hint') + '</div><div class="coach-body"><div class="coach-heading"><div class="coach-kicker">' + escape(coach.heading || 'Position coach') + '</div>' + progress + '</div>' +
      '<p class="coach-copy">' + escape(coach.copy || 'Stockfish is preparing a useful thought.') + '</p></div></article>';
  }

  function gameActions(match, finished) {
    if (finished) {
      return '<div class="game-actions"><button class="button button--primary" type="button" data-action="rematch">Rematch</button>' +
        '<button class="button" type="button" data-action="review-open">Review</button><button class="button" type="button" data-action="game-menu">More</button></div>';
    }
    const coachState = object(match.coach, {});
    const coachAction = coachState.available ? coachState.action : '';
    const takeback = !!match.canTakeback;
    const count = (coachAction ? 1 : 0) + (takeback ? 1 : 0) + 2;
    return '<div class="game-actions game-actions--' + count + '">' +
      (coachAction ? '<button class="button button--primary" type="button" data-action="coach" ' + (coachState.loading ? 'disabled aria-busy="true"' : '') + '>' + icon('hint') + escape(coachAction) + '</button>' : '') +
      (takeback ? '<button class="button" type="button" data-action="takeback">' + icon('undo') + 'Take back</button>' : '') +
      '<button class="button" type="button" data-action="moves">' + icon('moves') + 'Moves</button><button class="button" type="button" data-action="game-menu">' + icon('more') + 'More</button></div>';
  }

  function renderReview() {
    const review = object(model.review, {});
    if (!review.available) { renderGame(); return; }
    const liveGame = !!review.liveGame;
    const playedScore = liveGame ? '—' : (review.playedScore || '…');
    const bestScore = liveGame ? '—' : (review.bestScore || '…');
    main.innerHTML =
      '<section class="screen screen--game"><div class="review-position-line"><strong>Move ' +
      escape(Math.ceil(Number(review.index) / 2)) + ' · ' + escape(Number(review.index) % 2 ? 'White' : 'Black') + '</strong><span>Position ' + escape(review.index) + ' of ' + escape(review.total) + '</span></div>' +
      '<div id="board-host" class="board-stage">' + boardLayout(object(review.position, {}), Number(review.me || 0), false, {}, false) + '</div>' +
      '<article class="surface review-summary"><div><span class="result-badge">' + (liveGame ? 'Move explorer' : 'Stockfish review') + '</span><p class="body-copy">' +
      escape(liveGame ? 'Explore the played position now. Full engine review starts when the game ends.' : (review.reason || 'Analysis is preparing.')) +
      '</p></div><div class="review-scores"><div><span>Played</span><strong>' + escape(playedScore) + '</strong></div><div><span>Best</span><strong>' + escape(bestScore) + '</strong></div></div></article>' +
      '<div class="tab-row" role="tablist" aria-label="Review view">' +
      reviewTab('Compare', 0, review.mode) + reviewTab('Played', 1, review.mode) + reviewTab('Best move', 2, review.mode) + '</div>' +
      '<article class="surface"><div class="review-step"><div><p class="eyebrow">Position note</p><p class="tiny">Position ' + escape(review.index) + ' of ' + escape(review.total) + '</p></div></div><p class="body-copy">' + escape(liveGame ? 'Finish the game to unlock scored Stockfish review. You can still compare positions and branch from here.' : (review.report || 'Stockfish analysis appears after it completes.')) +
       '</p><div class="button-row button-row--review"><button class="button" type="button" data-action="review-prev" ' + (review.canPrevious ? '' : 'disabled') +
      '>← Previous</button><button class="button" type="button" data-action="review-next" ' + (review.canNext ? '' : 'disabled') + '>Next →</button></div>' +
       (review.canBranch ? '<button class="button button--quiet button--wide review-branch" type="button" data-action="review-branch">Play from this position</button>' : '') +
      '</article></section>';
  }

  function reviewTab(label, mode, current) {
    return '<button class="tab" type="button" role="tab" aria-selected="' + (Number(current) === mode ? 'true' : 'false') +
      '" data-review-mode="' + mode + '">' + escape(label) + '</button>';
  }

  function boardMarkup(position, me, interactive) {
    const board = array(position.b);
    const legal = array(position.moves);
    const selected = selectedSquare;
    const coachFrom = position.bestFrom != null && Number(position.bestFrom) >= 0 ? Number(position.bestFrom) :
      (position.playedFrom != null && Number(position.playedFrom) >= 0 ? Number(position.playedFrom) : -1);
    const coachTo = position.bestTo != null && Number(position.bestTo) >= 0 ? Number(position.bestTo) :
      (position.playedTo != null && Number(position.playedTo) >= 0 ? Number(position.playedTo) : -1);
    const legalTargets = selected == null ? [] : legal.filter((move) => Number(move[0]) === selected).map((move) => Number(move[1]));
    const cells = [];
    for (let visual = 0; visual < 64; visual += 1) {
      const square = me === 1 ? 63 - visual : visual;
      const piece = Number(board[square] || 0);
      const dark = ((Math.floor(square / 8) + (square % 8)) % 2) !== 0;
      const hasPiece = piece !== 0;
      const legalTarget = legalTargets.indexOf(square) >= 0;
      const selectedClass = selected === square ? ' square--selected' : '';
      const legalClass = legalTarget ? (hasPiece ? ' square--capture' : ' square--legal') : '';
      const lastClass = square === Number(position.lastA) || square === Number(position.lastZ) ? ' square--last' : '';
      const coachClass = square === coachFrom ? ' square--coach-source' : square === coachTo ? ' square--coach-target' : '';
      const label = squareLabel(square, piece, legalTarget, selected === square);
      // Labels belong to the displayed orientation, not to the pre-rotation
      // logical square.  That is what keeps the black side's ranks/files true.
      const rankLabel = visual % 8 === 0 ? '<span class="coordinate coordinate--rank">' + (me === 1 ? Math.floor(visual / 8) + 1 : 8 - Math.floor(visual / 8)) + '</span>' : '';
      const fileLabel = visual >= 56 ? '<span class="coordinate coordinate--file">' + String.fromCharCode(97 + (me === 1 ? 7 - (visual % 8) : visual % 8)) + '</span>' : '';
      cells.push('<button class="square' + (dark ? ' square--dark' : '') + selectedClass + legalClass + lastClass + coachClass +
        '" type="button" data-square="' + square + '" aria-label="' + escape(label) + '"' + (interactive && !movePending ? '' : ' disabled') + '>' +
        rankLabel + fileLabel + pieceSvg(piece) + '</button>');
    }
    return '<div class="board-shell' + (movePending ? ' board-shell--pending' : '') + '" data-board-interactive="' + (interactive && !movePending ? 'true' : 'false') + '"><div class="board" role="grid" aria-label="Chess board">' +
      cells.join('') + arrowMarkup(position, me) + '</div>' +
      '<span class="board-accessibility-note">Tap a piece, then a legal destination. Board orientation follows your color.</span></div>';
  }

  function boardLayout(position, me, interactive, coach, evaluationEnabled) {
    const meter = evaluationEnabled ? evaluationMeter(coach) : '';
    return '<div class="board-layout' + (evaluationEnabled ? ' board-layout--evaluated' : '') + '">' + meter + boardMarkup(position, me, interactive) + '</div>';
  }

  function evaluationMeter(coach) {
    const text = String(coach && coach.evaluation || '');
    let white = 50;
    const numeric = Number(text.replace('\u2212', '-'));
    if (Number.isFinite(numeric)) white = 50 + (numeric / (Math.abs(numeric) + 4)) * 44;
    else if (/^#-/.test(text)) white = 4;
    else if (/^#/.test(text)) white = 96;
    white = Math.max(4, Math.min(96, white));
    const top = (100 - white).toFixed(1);
    return '<div class="eval-rail" role="img" aria-label="White evaluation share ' + Math.round(white) + ' percent"><svg viewBox="0 0 10 100" preserveAspectRatio="none" aria-hidden="true"><rect class="eval-rail-fill" x="0" y="' + top + '" width="10" height="' + white.toFixed(1) + '"></rect></svg></div>';
  }

  function materialBalance(board) {
    const values = [0, 1, 3, 3, 5, 9, 0];
    let balance = 0;
    board.forEach((piece) => { balance += (piece > 0 ? 1 : piece < 0 ? -1 : 0) * values[Math.abs(Number(piece) || 0)]; });
    return balance;
  }

  function playerDetail(detail, balance, side) {
    const advantage = side === 0 ? balance : -balance;
    return detail + (advantage > 0 ? '  ·  +' + advantage : '');
  }

  function squareLabel(square, piece, legal, selected) {
    const names = ['', 'pawn', 'knight', 'bishop', 'rook', 'queen', 'king'];
    const side = piece > 0 ? 'White ' : piece < 0 ? 'Black ' : '';
    return squareName(square) + ', ' + (piece ? side + names[Math.abs(piece)] : 'empty') +
      (selected ? ', selected' : '') + (legal ? ', legal destination' : '');
  }

  function squareName(square) {
    return String.fromCharCode(97 + (square % 8)) + String(8 - Math.floor(square / 8));
  }

  function pieceSvg(piece) {
    if (!piece) return '';
    const light = piece > 0;
    const kind = Math.abs(piece);
    const cls = 'piece-svg piece-svg--' + (light ? 'white' : 'black');
    const shape = (d) => '<path class="piece-main" d="' + d + '"></path>';
    const detail = (d) => '<path class="piece-detail" d="' + d + '"></path>';
    const circle = (cx, cy, r) => '<circle class="piece-main" cx="' + cx + '" cy="' + cy + '" r="' + r + '"></circle>';
    // Keep the exact proportions of ChessLink's proven vector set. The first
    // WebView draft improvised new silhouettes and lost the crisp, weighted
    // Staunton look that already worked well in the native board.
    const common = shape('M29 74H71L75 82H25Z') + shape('M25 82H75L78 88H22Z') + detail('M30 79H70');
    let figure = '';
    if (kind === 1) {
      figure = circle(50, 30, 15) + shape('M40 39H60L62 66 72 78H28L38 66Z');
    } else if (kind === 2) {
      figure = shape('M29 76 34 59 49 43 33 48 23 41 39 24 42 12 50 20 65 20 76 38 74 62 70 77Z') +
        detail('M47 31 51 30M29 41H35M58 37 62 49');
    } else if (kind === 3) {
      figure = shape('M42 43H58L60 63 71 77H29L40 63Z') +
        shape('M50 13C26 31 29 47 50 49 72 47 74 31 50 13Z') + detail('M53 24 44 36') + circle(50, 11, 4);
    } else if (kind === 4) {
      figure = shape('M33 39H67L64 65 72 77H28L36 65Z') + shape('M27 15H38V24H45V15H55V24H62V15H73L70 40H30Z') + detail('M33 46H67');
    } else if (kind === 5) {
      figure = shape('M39 45H61L62 62 72 77H28L38 62Z') + shape('M26 25 39 34 50 17 61 34 74 25 65 49H35Z') +
        circle(27, 23, 4) + circle(50, 14, 4) + circle(73, 23, 4) + detail('M37 53H63');
    } else {
      figure = shape('M37 42H63L60 61 72 77H28L40 61Z') +
        shape('M36 44C15 21 41 20 50 30 60 20 85 21 64 44Z') +
        shape('M46 8H54V15H62V22H54V29H46V22H38V15H46Z') + detail('M36 49H64');
    }
    return '<svg class="' + cls + '" viewBox="0 0 100 100" aria-hidden="true"><ellipse class="piece-shadow" cx="51" cy="87" rx="31" ry="5"></ellipse>' + figure + common + '</svg>';
  }

  function arrowMarkup(position, me) {
    const from = position.bestFrom != null && Number(position.bestFrom) >= 0 ? Number(position.bestFrom) :
      (position.playedFrom != null && Number(position.playedFrom) >= 0 ? Number(position.playedFrom) : -1);
    const to = position.bestTo != null && Number(position.bestTo) >= 0 ? Number(position.bestTo) :
      (position.playedTo != null && Number(position.playedTo) >= 0 ? Number(position.playedTo) : -1);
    if (from < 0 || to < 0) return '<svg class="board-overlay" viewBox="0 0 100 100" aria-hidden="true"></svg>';
    const a = visualPoint(from, me);
    const b = visualPoint(to, me);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.max(1, Math.sqrt(dx * dx + dy * dy));
    const ux = dx / length;
    const uy = dy / length;
    // Coach guidance should frame a move, never conceal the source piece.
    // Stop it short of both piece centres and keep the head proportional to a
    // single square on compact phones.
    // A one-square move has no free corridor between two full-size pieces.
    // Its source/target rings are clearer than an arrow drawn across artwork.
    if (length <= 12.6) return '<svg class="board-overlay" viewBox="0 0 100 100" aria-hidden="true"></svg>';
    const sourceClearance = Math.min(7.4, Math.max(6.25, length * .42));
    const targetClearance = Math.min(7.4, Math.max(6.25, length * .42));
    const headBase = Math.min(targetClearance + 3.2, Math.max(targetClearance + 2.1, length * .31));
    const startX = a.x + ux * sourceClearance;
    const startY = a.y + uy * sourceClearance;
    const tipX = b.x - ux * targetClearance;
    const tipY = b.y - uy * targetClearance;
    const x2 = b.x - ux * headBase;
    const y2 = b.y - uy * headBase;
    const leftX = b.x - ux * headBase - uy * 2.5;
    const leftY = b.y - uy * headBase + ux * 2.5;
    const rightX = b.x - ux * headBase + uy * 2.5;
    const rightY = b.y - uy * headBase - ux * 2.5;
    return '<svg class="board-overlay" viewBox="0 0 100 100" aria-hidden="true"><line class="coach-arrow" x1="' + startX + '" y1="' + startY + '" x2="' + x2 + '" y2="' + y2 + '"></line><path class="coach-arrow-head" d="M' + tipX + ' ' + tipY + ' L' + leftX + ' ' + leftY + ' L' + rightX + ' ' + rightY + ' Z"></path></svg>';
  }

  function visualPoint(square, me) {
    const visual = me === 1 ? 63 - square : square;
    return {x: (visual % 8) * 12.5 + 6.25, y: Math.floor(visual / 8) * 12.5 + 6.25};
  }

  function attachBoardInteractions() {
    const board = main.querySelector('[data-board-interactive="true"]');
    if (!board) return;
    board.querySelectorAll('[data-square]').forEach((button) => {
      button.addEventListener('click', (event) => {
        // A touch drag normally emits a trailing click.  Do not turn a
        // completed drag move into a stale follow-up selection.
        if (suppressNextBoardClick) {
          event.preventDefault();
          return;
        }
        selectSquare(Number(button.dataset.square));
      });
      button.addEventListener('pointerdown', (event) => {
        dragStart = Number(button.dataset.square);
        button.setPointerCapture && button.setPointerCapture(event.pointerId);
      });
      button.addEventListener('pointerup', (event) => {
        if (dragStart == null) return;
        const hit = document.elementFromPoint(event.clientX, event.clientY);
        const target = hit && hit.closest ? hit.closest('[data-square]') : null;
        const from = dragStart;
        dragStart = null;
        if (target && Number(target.dataset.square) !== from) {
          suppressNextBoardClick = true;
          tryMove(from, Number(target.dataset.square));
          window.setTimeout(() => { suppressNextBoardClick = false; }, 0);
        }
      });
      button.addEventListener('pointercancel', () => { dragStart = null; });
    });
  }

  function canSelectFrom(square) {
    const position = model.match && object(model.match.position, {});
    return position && array(position.moves).some((move) => Number(move[0]) === square);
  }

  function selectSquare(square) {
    if (movePending || !model.match || !model.match.yourTurn) return;
    if (selectedSquare == null) {
      if (canSelectFrom(square)) {
        selectedSquare = square;
        refreshBoardOnly();
      }
      return;
    }
    if (square === selectedSquare) {
      selectedSquare = null;
      refreshBoardOnly();
      return;
    }
    const moved = tryMove(selectedSquare, square);
    if (!moved && canSelectFrom(square)) {
      selectedSquare = square;
      refreshBoardOnly();
    }
  }

  function tryMove(from, to) {
    if (movePending || !model.match || !model.match.yourTurn) return false;
    const position = object(model.match && model.match.position, {});
    const valid = array(position.moves).some((move) => Number(move[0]) === from && Number(move[1]) === to);
    if (!valid) return false;
    selectedSquare = null;
    movePending = true;
    send('match.move', {from: from, to: to});
    refreshBoardOnly();
    return true;
  }

  function refreshBoardOnly() {
    const host = document.getElementById('board-host');
    if (!host || !model.match) return;
    const shell = host.querySelector('.board-shell');
    if (!shell) return;
    const position = object(model.match.position, {});
    const pieces = array(position.b);
    const targets = new Set(selectedSquare == null ? [] : array(position.moves)
      .filter((move) => Number(move[0]) === selectedSquare)
      .map((move) => Number(move[1])));
    // Selection changes decoration, never layout. Replacing the host with
    // boardMarkup used to remove board-layout and its evaluation rail, growing
    // the board by 14px until the next native render. Keep the exact nodes so
    // keyboard focus and pointer capture also survive selecting/deselecting.
    shell.classList.toggle('board-shell--pending', movePending);
    shell.dataset.boardInteractive = movePending ? 'false' : 'true';
    shell.querySelectorAll('[data-square]').forEach((button) => {
      const square = Number(button.dataset.square);
      const piece = Number(pieces[square] || 0);
      const selected = square === selectedSquare;
      const legal = targets.has(square);
      button.classList.toggle('square--selected', selected);
      button.classList.toggle('square--legal', legal && !piece);
      button.classList.toggle('square--capture', legal && !!piece);
      button.setAttribute('aria-label', squareLabel(square, piece, legal, selected));
      button.disabled = movePending;
    });
  }

  function clockForYou(match, clock) {
    return Number(match.me) === 0 ? clock.white || '∞' : clock.black || '∞';
  }

  function clockForOpponent(match, clock) {
    return Number(match.me) === 0 ? clock.black || '∞' : clock.white || '∞';
  }

  function patchClocks() {
    if (!model.match) return;
    const clock = object(model.match.clock, {});
    const you = document.querySelector('[data-clock="you"]');
    const opponent = document.querySelector('[data-clock="opponent"]');
    if (you) you.textContent = clockForYou(model.match, clock);
    if (opponent) opponent.textContent = clockForOpponent(model.match, clock);
  }

  function gameResult(match) {
    if (Number(match.winner) === 2) return 'Draw';
    return Number(match.winner) === Number(match.me) ? 'You won' : 'You lost';
  }

  function initials(value) {
    return String(value || 'OP').split(/\s+/).map((word) => word.charAt(0)).join('').slice(0, 2).toUpperCase();
  }

  function openSetup(mode) {
    overlay = {kind: 'setup', mode: mode, clock: 0, level: 1};
    openSheet('setup');
    sheetScroll.innerHTML = setupMarkup();
  }

  function setupMarkup() {
    const bot = overlay.mode === 'bot';
    const remote = overlay.mode === 'remote';
    const remoteHosting = !!object(model.transport, {}).hosting;
    const primaryLabel = bot ? 'Play ' : remote ? (remoteHosting ? 'Invite · ' : 'Suggest · ') : 'Start ';
    return '<div class="sheet-heading"><div><p class="eyebrow">' + (bot ? 'Offline bot' : remote ? 'Private room' : 'One device') + '</p><h2 id="sheet-title" class="sheet-title">' +
      (bot ? 'Set up your game' : remote ? (remoteHosting ? 'Invite a friend' : 'Suggest a game') : 'Pass & play') + '</h2><p class="sheet-subtitle">' +
      (bot ? 'Choose a time and opponent. Hints make this a Practice game.' : remote ? 'Choose a clock. This sheet stays put while you decide.' : 'Hand the phone over after every move.') + '</p></div><button class="icon-button" type="button" data-sheet-close aria-label="Close">' + icon('close') + '</button></div>' +
      '<section class="sheet-section"><p class="sheet-label">Time control</p><div class="choice-grid" data-choice-group="clock">' +
      clockNames.map((name, index) => choiceButton('clock', index, name, index === 4 ? 'No clock' : name.replace(' | ', ' min + '), overlay.clock === index)).join('') + '</div></section>' +
      (bot ? '<section class="sheet-section"><p class="sheet-label">Opponent</p><div class="choice-grid" data-choice-group="level">' +
        strengthNames.map((name, index) => choiceButton('level', index, name, index === 0 ? 'Estimated 600' : index === 1 ? 'Estimated 1200' : 'Estimated 1800', overlay.level === index)).join('') +
        '</div></section>' : '') +
      '<div class="sheet-footer"><button class="button button--quiet" type="button" data-sheet-close>Cancel</button><button class="button button--primary" type="button" data-setup-start>' +
      primaryLabel + escape(clockNames[overlay.clock]) + '</button></div>';
  }

  function choiceButton(group, value, mainLabel, detail, active) {
    return '<button class="choice" type="button" data-choice="' + group + '" data-value="' + value + '" aria-pressed="' + (active ? 'true' : 'false') +
      '"><span class="choice-main">' + escape(mainLabel) + '</span><span class="choice-detail">' + escape(detail) + '</span></button>';
  }

  function updateSetupChoice(group, value) {
    if (!overlay || overlay.kind !== 'setup') return;
    overlay[group] = Number(value);
    sheetScroll.querySelectorAll('[data-choice="' + group + '"]').forEach((button) => {
      button.setAttribute('aria-pressed', String(Number(button.dataset.value) === overlay[group]));
    });
    const start = sheetScroll.querySelector('[data-setup-start]');
    if (start) {
      const prefix = overlay.mode === 'bot' ? 'Play ' : overlay.mode === 'remote'
        ? (object(model.transport, {}).hosting ? 'Invite · ' : 'Suggest · ') : 'Start ';
      start.textContent = prefix + clockNames[overlay.clock];
    }
  }

  function openTransportMenu() {
    overlay = {kind: 'transport-menu'};
    openSheet('room');
    sheetScroll.innerHTML = '<div class="sheet-heading"><div><p class="eyebrow">Private multiplayer</p><h2 id="sheet-title" class="sheet-title">Play together</h2><p class="sheet-subtitle">Knightline connects only to another Knightline install.</p></div><button class="icon-button" type="button" data-sheet-close aria-label="Close">' + icon('close') + '</button></div>' +
      '<section class="sheet-section"><button class="button button--primary button--wide" type="button" data-transport="host">Host nearby game</button><button class="button button--wide" type="button" data-transport="join">Join nearby game</button></section>' +
      '<div class="online-note"><span aria-hidden="true">⌁</span><span>Bluetooth works in airplane mode after Android pairing and permission. Both players need Knightline Preview.</span></div>' +
      '<div class="sheet-footer"><button class="button button--quiet" type="button" data-sheet-close>Done</button></div>';
  }

  function openOnlineMenu() {
    overlay = {kind: 'online-menu', code: ''};
    openSheet('room');
    sheetScroll.innerHTML = '<div class="sheet-heading"><div><p class="eyebrow">Private online room</p><h2 id="sheet-title" class="sheet-title">Invite one friend</h2><p class="sheet-subtitle">Peer-to-peer gameplay. Internet is only needed for signaling and the direct connection.</p></div><button class="icon-button" type="button" data-sheet-close aria-label="Close">' + icon('close') + '</button></div>' +
      '<section class="sheet-section"><label class="sheet-label" for="room-code">Room code</label><input id="room-code" class="input" maxlength="8" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="E.g. KNIGHT42"></section>' +
      '<section class="sheet-section"><button class="button button--primary button--wide" type="button" data-online="host">Create room</button><button class="button button--wide" type="button" data-online="join">Join room</button></section>' +
      '<div class="online-note"><span aria-hidden="true">◌</span><span>No accounts or public matchmaking. Share the code only with your friend.</span></div>';
  }

  function showNativeOverlay(payload) {
    const kind = payload.kind || 'information';
    if (kind === 'nearby') {
      overlay = {kind: 'nearby'};
      openSheet('room');
      updateNearbySheet();
      return;
    }
    overlay = {kind: kind, payload: payload};
    openSheet(kind === 'moves' ? 'moves' : 'room');
    if (kind === 'menu') sheetScroll.innerHTML = menuMarkup(payload);
    else if (kind === 'moves') sheetScroll.innerHTML = movesMarkup(payload);
    else if (kind === 'chat') sheetScroll.innerHTML = chatMarkup(payload);
    else sheetScroll.innerHTML = informationMarkup(payload);
  }

  function updateNearbySheet() {
    if (!overlay || overlay.kind !== 'nearby') return;
    const transport = object(model.transport, {});
    const devices = array(transport.devices);
    sheetScroll.innerHTML = '<div class="sheet-heading"><div><p class="eyebrow">Nearby Bluetooth</p><h2 id="sheet-title" class="sheet-title">Join a Knightline game</h2><p class="sheet-subtitle">' +
      escape(transport.status || 'Scanning…') + '</p></div><button class="icon-button" type="button" data-sheet-close aria-label="Close">' + icon('close') + '</button></div>' +
      '<section class="sheet-section"><p class="sheet-label">Found phones</p>' +
      (devices.length ? devices.map((device) => '<button class="choice" type="button" data-device-index="' + escape(device.index) + '" aria-pressed="false"><span class="choice-main">' +
        escape(device.name) + '</span><span class="choice-detail">' + (device.paired ? 'Paired · connect' : 'Pair first in Android settings') + '</span></button>').join('') :
        '<div class="empty-state">No phone has appeared yet. Ask your friend to host and allow Bluetooth visibility.</div>') +
      '</section><div class="sheet-footer"><button class="button button--quiet" type="button" data-transport="settings">Pair phones</button><button class="button button--primary" type="button" data-transport="scan">Scan again</button></div>';
  }

  function menuMarkup(payload) {
    const choices = array(payload.choices);
    return '<div class="sheet-heading"><div><p class="eyebrow">Private controls</p><h2 id="sheet-title" class="sheet-title">' + escape(payload.title || 'Menu') +
      '</h2><p class="sheet-subtitle">' + escape(payload.subtitle || '') + '</p></div><button class="icon-button" type="button" data-sheet-close aria-label="Close">' + icon('close') + '</button></div>' +
      '<section class="sheet-section">' + choices.map((choice) => '<button class="choice choice-row" type="button" data-native-action="' + escape(choice.id) +
        '" aria-pressed="false"><span class="choice-row-icon">' + icon(actionIcon(choice.id)) + '</span><span class="choice-row-copy"><span class="choice-main">' + escape(choice.title) + '</span><span class="choice-detail">' + escape(choice.detail) +
        '</span></span><span class="choice-row-chevron" aria-hidden="true">›</span></button>').join('') + '</section><div class="sheet-footer"><button class="button button--quiet" type="button" data-sheet-close>Done</button></div>';
  }

  function movesMarkup(payload) {
    const moves = array(payload.moves);
    return '<div class="sheet-heading"><div><p class="eyebrow">Notation</p><h2 id="sheet-title" class="sheet-title">' + escape(payload.title || 'Move history') +
      '</h2><p class="sheet-subtitle">' + escape(payload.subtitle || '') + '</p></div><button class="icon-button" type="button" data-sheet-close aria-label="Close">' + icon('close') + '</button></div>' +
      (moves.length ? '<div class="move-list">' + moves.map((move) => {
        const ply = Math.max(1, Number(move.ply) || 1);
        const turn = Math.floor((ply - 1) / 2) + 1;
        const prefix = turn + (String(move.side) === 'Black' ? '…' : '.');
        return '<div class="move-item"><span><span class="move-number">' + escape(prefix) + '</span> ' + escape(move.move) + '</span><span class="tiny">' + escape(move.side) + '</span></div>';
      }).join('') + '</div>' :
        '<div class="empty-state">No moves yet.</div>') +
      '<div class="sheet-footer"><button class="button button--quiet" type="button" data-sheet-close>Close</button>' +
      (payload.canReview ? '<button class="button button--primary" type="button" data-native-action="review.open">' + (payload.liveGame ? 'Explore moves' : 'Open review') + '</button>' : '') + '</div>';
  }

  function chatMarkup(payload) {
    const messages = array(payload.messages);
    return '<div class="sheet-heading"><div><p class="eyebrow">Invite only</p><h2 id="sheet-title" class="sheet-title">' + escape(payload.title || 'Private chat') +
      '</h2><p class="sheet-subtitle">' + escape(payload.subtitle || '') + '</p></div><button class="icon-button" type="button" data-sheet-close aria-label="Close">' + icon('close') + '</button></div>' +
      '<div class="chat-log">' + (messages.length ? messages.map((message) => '<div class="chat-message' + (String(message).indexOf('You:') === 0 ? ' chat-message--self' : '') +
        '">' + escape(message) + '</div>').join('') : '<div class="tiny">No messages yet.</div>') + '</div>' +
      '<div class="chat-compose chat-compose--spaced"><input class="input" id="chat-text" maxlength="300" placeholder="Message your friend" ' + (payload.connected ? '' : 'disabled') +
        '><button class="button button--mint" type="button" data-chat-send ' + (payload.connected ? '' : 'disabled') + '>Send</button></div>';
  }

  function informationMarkup(payload) {
    return '<div class="sheet-heading"><div><p class="eyebrow">Knightline</p><h2 id="sheet-title" class="sheet-title">' + escape(payload.title || 'Information') +
      '</h2><p class="sheet-subtitle">' + escape(payload.subtitle || '') + '</p></div><button class="icon-button" type="button" data-sheet-close aria-label="Close">' + icon('close') + '</button></div>' +
      (payload.detail ? '<article class="surface surface--flat"><p class="body-copy">' + escape(payload.detail) + '</p></article>' : '') +
      '<div class="sheet-footer"><button class="button button--primary" type="button" data-sheet-close>Done</button></div>';
  }

  function openConfirmation(payload) {
    overlay = {kind: 'confirm', token: payload.token || ''};
    openSheet('room');
    sheetScroll.innerHTML = '<div class="sheet-heading"><div><p class="eyebrow">Confirm action</p><h2 id="sheet-title" class="sheet-title">' +
      escape(payload.title || 'Continue?') + '</h2><p class="sheet-subtitle">' + escape(payload.subtitle || '') + '</p></div></div>' +
      '<div class="sheet-footer"><button class="button button--quiet" type="button" data-confirm="cancel">Cancel</button><button class="button button--primary" type="button" data-confirm="accept">' +
      escape(payload.confirmLabel || 'Continue') + '</button></div>';
  }

  function openPromotion(payload) {
    overlay = {kind: 'promotion'};
    openSheet('room');
    sheetScroll.innerHTML = '<div class="sheet-heading"><div><p class="eyebrow">Promotion</p><h2 id="sheet-title" class="sheet-title">Choose a piece</h2><p class="sheet-subtitle">Your pawn is ready to promote.</p></div></div>' +
      '<section class="choice-grid choice-grid--two">' +
      promotionChoice(5, 'Queen') + promotionChoice(4, 'Rook') + promotionChoice(3, 'Bishop') + promotionChoice(2, 'Knight') +
      '</section>';
  }

  function promotionChoice(piece, label) {
    return '<button class="choice" type="button" data-promotion="' + piece + '" aria-pressed="false"><span class="choice-main">' + pieceSvg(piece) +
      escape(label) + '</span><span class="choice-detail">Promote to ' + escape(label.toLowerCase()) + '</span></button>';
  }

  function openSheet(kind) {
    clearTimeout(closingSheetTimer);
    const active = document.activeElement;
    if (active && active !== document.body && !sheet.contains(active)) overlayReturnFocus = active;
    sheet.dataset.sheetKind = kind || 'room';
    sheet.dataset.open = 'true';
    sheet.setAttribute('aria-hidden', 'false');
    backdrop.hidden = false;
    requestAnimationFrame(() => {
      backdrop.classList.add('is-visible');
      // Prefer an explicit close/cancel affordance. Do not auto-focus text
      // fields, which would unexpectedly raise Android's keyboard.
      const firstControl = sheet.querySelector('[data-sheet-close], [data-confirm="cancel"], button, [href]');
      if (firstControl && typeof firstControl.focus === 'function') firstControl.focus({preventScroll: true});
      else sheet.focus({preventScroll: true});
    });
  }

  function closeOverlay() {
    if (!overlay) return;
    // Do not carry an Android keyboard into the newly selected game/home flow.
    if (document.activeElement && typeof document.activeElement.blur === 'function') document.activeElement.blur();
    overlay = null;
    sheet.dataset.open = 'false';
    sheet.setAttribute('aria-hidden', 'true');
    backdrop.classList.remove('is-visible');
    closingSheetTimer = window.setTimeout(() => {
      if (!overlay) {
        backdrop.hidden = true;
        sheetScroll.replaceChildren();
        if (overlayReturnFocus && overlayReturnFocus.isConnected
            && typeof overlayReturnFocus.focus === 'function') {
          overlayReturnFocus.focus({preventScroll: true});
        }
        overlayReturnFocus = null;
      }
    }, 240);
    send('ui.closeOverlay', {}, false);
  }

  function toast(message, error) {
    if (!message) return;
    const item = document.createElement('div');
    item.className = 'toast' + (error ? ' toast--error' : '');
    item.textContent = message;
    toastRegion.appendChild(item);
    window.setTimeout(() => item.remove(), 4300);
  }

  document.addEventListener('click', (event) => {
    const action = event.target.closest('[data-action]');
    if (action) {
      const value = action.dataset.action;
      if (value === 'nav-home') go('home');
      else if (value === 'nav-play') go('play');
      else if (value === 'nav-learn') go('learn');
      else if (value === 'nav-profile') go('profile');
      else if (value === 'setup-bot') openSetup('bot');
      else if (value === 'setup-pass') openSetup('pass');
      else if (value === 'transport-menu') openTransportMenu();
      else if (value === 'online-menu') openOnlineMenu();
      else if (value === 'remote-setup') openSetup('remote');
      else if (value === 'resume') send('match.resume');
      else if (value === 'coach') send('coach.advance');
      else if (value === 'takeback') send('match.takeback');
      else if (value === 'moves') send('match.openMoves');
      else if (value === 'game-menu') send('match.openMenu');
      else if (value === 'rematch') send('match.rematch');
      else if (value === 'review-open') send('review.open');
      else if (value === 'review-back') send('nav.back', {}, false);
      else if (value === 'review-prev') send('review.previous');
      else if (value === 'review-next') send('review.next');
      else if (value === 'review-branch') send('review.branch');
      else if (value === 'engine-info') send('engine.info', {}, false);
      return;
    }

    const navButton = event.target.closest('[data-nav]');
    if (navButton) {
      go(navButton.dataset.nav);
      return;
    }
    const lesson = event.target.closest('[data-lesson]');
    if (lesson) {
      send('learn.start', {lesson: Number(lesson.dataset.lesson)});
      return;
    }
    const mode = event.target.closest('[data-review-mode]');
    if (mode) {
      send('review.mode', {mode: Number(mode.dataset.reviewMode)});
      return;
    }
    const choice = event.target.closest('[data-choice]');
    if (choice) {
      updateSetupChoice(choice.dataset.choice, choice.dataset.value);
      return;
    }
    if (event.target.closest('[data-setup-start]')) {
      const payload = {clock: overlay.clock, level: overlay.level};
      const type = overlay.mode === 'bot' ? 'match.startBot'
        : overlay.mode === 'remote' ? (object(model.transport, {}).hosting ? 'match.inviteRemote' : 'match.suggestRemote')
          : 'match.startPass';
      closeOverlay();
      send(type, payload, false);
      return;
    }
    const transportButton = event.target.closest('[data-transport]');
    if (transportButton) {
      const type = transportButton.dataset.transport;
      if (type === 'host') { closeOverlay(); send('transport.host', {}, false); }
      else if (type === 'join') { closeOverlay(); send('transport.join', {}, false); }
      else if (type === 'scan') send('transport.scan', {}, false);
      else if (type === 'settings') send('transport.settings', {}, false);
      return;
    }
    const device = event.target.closest('[data-device-index]');
    if (device) {
      send('transport.connect', {index: Number(device.dataset.deviceIndex)}, false);
      return;
    }
    const online = event.target.closest('[data-online]');
    if (online) {
      const input = document.getElementById('room-code');
      const code = input ? input.value : '';
      const type = online.dataset.online === 'host' ? 'online.host' : 'online.join';
      closeOverlay();
      send(type, {code: code}, false);
      return;
    }
    const nativeAction = event.target.closest('[data-native-action]');
    if (nativeAction) {
      closeOverlay();
      send(nativeAction.dataset.nativeAction);
      return;
    }
    const confirmation = event.target.closest('[data-confirm]');
    if (confirmation) {
      const type = confirmation.dataset.confirm === 'accept' ? 'confirm.accept' : 'confirm.cancel';
      const token = overlay && overlay.token || '';
      closeOverlay();
      send(type, {token: token}, false);
      return;
    }
    const promotion = event.target.closest('[data-promotion]');
    if (promotion) {
      closeOverlay();
      send('promotion.choose', {piece: Number(promotion.dataset.promotion)});
      return;
    }
    if (event.target.closest('[data-chat-send]')) {
      const input = document.getElementById('chat-text');
      const text = input ? input.value : '';
      send('chat.send', {text: text});
      return;
    }
    if (event.target.closest('[data-sheet-close]')) {
      closeOverlay();
    }
  });

  backdrop.addEventListener('click', () => {
    if (overlay && overlay.kind !== 'confirm' && overlay.kind !== 'promotion') closeOverlay();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && event.target && event.target.id === 'chat-text') {
      event.preventDefault();
      const sendButton = sheet.querySelector('[data-chat-send]:not([disabled])');
      if (sendButton) sendButton.click();
      return;
    }
    if (!overlay) return;
    if (event.key === 'Escape' && overlay.kind !== 'confirm' && overlay.kind !== 'promotion') {
      event.preventDefault();
      closeOverlay();
      return;
    }
    if (event.key !== 'Tab') return;
    const controls = Array.from(sheet.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )).filter((element) => element.offsetParent !== null);
    if (!controls.length) {
      event.preventDefault();
      sheet.focus({preventScroll: true});
      return;
    }
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus({preventScroll: true});
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus({preventScroll: true});
    }
  });

  // A modal field must remain usable when Android resizes the WebView for its
  // keyboard. Scrolling the sheet (rather than the app beneath it) preserves
  // the current game and keeps the action immediately reachable.
  document.addEventListener('focusin', (event) => {
    const field = event.target.closest && event.target.closest('input, textarea');
    if (!field || !sheet.dataset.open || sheet.dataset.open !== 'true') return;
    window.requestAnimationFrame(() => field.scrollIntoView({block: 'center', behavior: 'auto'}));
  });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => {
      const field = document.activeElement;
      if (!field || !sheet.contains(field)) return;
      window.requestAnimationFrame(() => field.scrollIntoView({block: 'center', behavior: 'auto'}));
    });
  }

  render();
})();
