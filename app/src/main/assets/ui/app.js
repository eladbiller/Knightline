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
  let showReviewOverview = false;

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
    // One scaling authority: native disables WebView text-only zoom, while CSS
    // scales both glyphs and their layout units by the actual Android preference.
    const requested = Math.max(85, Math.min(200, Math.round(Number(value) || 100)));
    const root = document.documentElement;
    root.style.setProperty('--system-font-size', requested + '%');
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
    model.puzzle = object(payload.puzzle, {});
    // Any authoritative state response completes (or rejects) the one pending
    // board command. This prevents rapid taps from queuing a second move against
    // a position that is already changing natively.
    movePending = false;
    if (!model.match && (model.screen === 'game' || model.screen === 'review')) model.screen = 'home';
    if (selectedSquare != null && !canSelectFrom(selectedSquare)) selectedSquare = null;
    render();
    if (model.screen === 'review' && !model.review.liveGame && showReviewOverview) {
      showReviewOverview = false; openReviewOverview();
    } else if (overlay && overlay.kind === 'review-overview') {
      const scroll = sheetScroll.scrollTop;
      sheetScroll.innerHTML = reviewOverviewMarkup();
      sheetScroll.scrollTop = scroll;
    }
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
    if (screenChanged) selectedSquare = null;
    app.dataset.screen = model.screen;
    patchHeader();
    patchNavigation();
    if (model.screen === 'play') renderPlay();
    else if (model.screen === 'learn') renderLearn();
    else if (model.screen === 'profile') renderProfile();
    else if (model.screen === 'game') renderGame();
    else if (model.screen === 'review') renderReview();
    else if (model.screen === 'puzzle') renderPuzzle();
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
    if (model.screen === 'puzzle') {
      header.innerHTML = '<div class="header-brand"><button class="header-back" type="button" data-action="nav-learn" aria-label="Back to Learn">' + icon('back') + '</button><p class="brand-word">Puzzle practice</p></div><span class="header-status">Offline</span>';
      return;
    }
    const focused = model.screen === 'game' || model.screen === 'review';
    header.innerHTML = focused
      ? '<div class="header-brand"><button class="header-back" type="button" data-action="' + (model.screen === 'review' ? 'review-back' : 'nav-home') + '" aria-label="Back">' + icon('back') + '</button>' +
        '<div><p class="brand-word">' + (model.screen === 'review' ? 'Game review' : 'Knightline') + '</p></div></div>' +
        (model.screen === 'review' ? '<button class="button button--compact" type="button" data-action="review-overview">' + icon('review') + 'Overview</button>' : '<div class="header-status header-status--compact"><span class="status-dot ' + (connected ? '' : 'status-dot--idle') + '"></span><span>' + escape(connected ? 'Connected' : 'Saved') + '</span></div>')
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
    const puzzles = array(object(model.lessons, {}).puzzles);
    const solved = puzzles.filter((p) => p.solved).length;
    main.innerHTML =
      '<section class="screen"><div><p class="eyebrow">Learn</p><h1 class="title">See the next move.</h1><p class="subtitle">Short, focused practice. No connection needed.</p></div>' +
      '<article class="surface puzzle-hero"><div class="section-heading"><div><p class="eyebrow">Offline starter pack</p><h2 class="surface-title">The checkmate collection</h2></div><span class="puzzle-progress">' + solved + '<small> / ' + puzzles.length + '</small></span></div><p class="body-copy">Six original positions. Find the finish, learn the pattern.</p><div class="puzzle-pack">' + puzzles.map((p) => '<button class="puzzle-entry" type="button" data-puzzle="' + p.index + '"><span class="puzzle-number">' + (p.solved ? icon('check') : String(p.index + 1).padStart(2, '0')) + '</span><span><strong>' + escape(p.name) + '</strong><small>' + escape(p.theme) + ' · Mate in 1</small></span><span aria-hidden="true">›</span></button>').join('') + '</div><p class="tiny">Progress stays on this phone. Puzzles never replace your saved match.</p></article>' +
      '<div class="section-heading"><div><p class="eyebrow">Build your repertoire</p><h2 class="surface-title">Guided openings</h2></div></div>' +
      '<section class="lesson-list" aria-label="Opening lessons">' +
      lessons.map((lesson) => '<button class="lesson-card" type="button" data-lesson="' + escape(lesson.id) + '">' +
        '<span class="lesson-icon" aria-hidden="true">✦</span><span class="lesson-content"><span class="lesson-title">' + escape(lesson.name) + '</span>' +
        '<span class="lesson-copy">' + escape(lesson.intro) + '</span></span><span class="progress-ring" data-label="' +
        escape(lesson.moves) + 'm" aria-label="' + escape(lesson.moves) + ' guided moves"></span></button>').join('') +
      '</section></section>';
  }

  function renderPuzzle() {
    const p = model.puzzle;
    if (!p || !p.available) { renderLearn(); return; }
    const action = ['Hint', 'Show piece', 'Show move', 'Hide hint'][p.hint || 0];
    main.innerHTML = '<section class="screen puzzle-workspace"><div class="puzzle-title"><p class="eyebrow">' + escape(p.theme) + '</p><h1 class="surface-title">' + escape(p.name) + '</h1></div><div class="puzzle-status"><span class="side-disc side-disc--' + (p.me === 0 ? 'white' : 'black') + '"></span><strong>' + (p.solved ? 'Checkmate!' : p.me === 0 ? 'White to move' : 'Black to move') + '</strong><span>' + (p.index + 1) + ' / ' + p.total + '</span></div><div id="board-host" class="board-stage">' + boardLayout(p.position, p.me, !p.solved, {}, false) + '</div><article class="puzzle-feedback" aria-live="polite"><p class="eyebrow">' + (p.solved ? 'Pattern found' : p.hint ? 'A little direction' : p.attempts ? 'Try again' : 'Your challenge') + '</p><p class="body-copy">' + escape(p.copy) + '</p></article><div class="puzzle-actions"><button class="button" type="button" data-action="puzzle-retry">' + icon('undo') + 'Retry</button><button class="button button--primary" type="button" data-action="' + (p.solved ? 'puzzle-next' : 'puzzle-hint') + '">' + (p.solved ? 'Next puzzle →' : icon('hint') + escape(action)) + '</button></div></section>';
    attachBoardInteractions();
  }

  function boardContext() { return model.screen === 'puzzle' ? model.puzzle : model.screen === 'review' ? model.review : model.match; }
  function puzzleCommand(type, payload) {
    const p = model.puzzle;
    if (p) send('puzzle.' + type, Object.assign({token: p.token, positionSeq: p.position.seq}, payload || {}), false);
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
      '<section class="screen screen--game play-workspace"><div class="game-topline"><div><p class="game-name">' + escape(finished ? gameResult(match) : match.yourTurn ? 'Your move' : 'Opponent to move') + '</p><span class="game-integrity">' + escape(match.practice || 'Practice') + '</span></div>' +
      (evaluationEnabled ? '<button class="eval-chip" type="button" data-action="engine-info" aria-label="Stockfish evaluation ' + escape(coach.evaluation || 'not ready') + '. ' + escape(coach.evaluationState || 'Analyzing') + '">' +
      '<span class="eval-label">EVAL</span><span data-evaluation>' + escape(coach.evaluation || '—') + '</span><span class="eval-state">' + escape(coach.evaluationState || 'Analyzing') + '</span></button></div>' +
      '' : '<span class="game-state-pill">' + icon('check') + escape(finished ? 'Complete' : match.yourTurn ? 'Your turn' : 'In play') + '</span></div>') +
      playerCard(match.opponent || 'Opponent', playerDetail(match.opponentDetail || 'Private match', material, 1 - Number(match.me)), initials(match.opponent || 'OP'), clockForOpponent(match, clock), opponentActive, !!match.solo, 'opponent') +
      '<div id="board-host" class="board-stage">' + boardLayout(position, Number(match.me), true, coach, evaluationEnabled) + '</div>' +
      playerCard(match.you || 'You', playerDetail(match.youDetail || 'Your side', material, Number(match.me)), 'ME', clockForYou(match, clock), youActive, false, 'you') +
      coachMarkup(coach, match, finished) +
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
    if (finished) return '<div class="coach-summary"><div><span class="coach-kicker">Game complete</span><p class="coach-copy">' + escape(match.note || gameResult(match)) + '</p></div></div>';
    if (!coach.copy && !coach.heading) return '<div class="coach-summary"><div><span class="coach-kicker">Last move</span><p class="coach-copy">' + escape(match.lastMove || 'Select a piece to see its legal moves.') + '</p></div></div>';
    const stage = Math.max(0, Math.min(3, Number(coach.stage) || 0));
    const total = coach.kind === 'lesson' ? 3 : 2;
    const progress = '<span class="coach-progress" aria-label="Hint stage ' + stage + ' of ' + total + '">' +
      Array.from({length: total + 1}, (_, index) => '<i class="' + (index <= stage ? 'is-active' : '') + '"></i>').join('') + '</span>';
    return '<button class="coach-summary" type="button" data-action="coach-details" aria-label="Read full coaching advice"><div class="coach-body"><div class="coach-heading"><span class="coach-kicker">' + escape(coach.heading || 'Position coach') + '</span>' + progress + '</div>' +
      '<p class="coach-copy">' + escape(coach.copy || 'Stockfish is preparing a useful thought.') + '</p></div><span class="detail-link">Read ›</span></button>';
  }

  function gameActions(match, finished) {
    if (finished) {
      return '<div class="game-actions"><button class="button button--primary" type="button" data-action="rematch">Rematch</button>' +
        '<button class="button" type="button" data-action="review-open">Review</button><button class="button" type="button" data-action="game-menu">More</button></div>';
    }
    const coachState = object(match.coach, {});
    const coachAction = coachState.action || 'Hint';
    const takeback = !!match.canTakeback;
    return '<div class="game-actions game-actions--dock">' +
      '<button class="button button--primary" type="button" data-action="coach" ' + (!coachState.available || coachState.loading ? 'disabled' : '') + '>' + icon('hint') + '<span>' + escape(coachAction === 'Preparing' ? 'Hint' : coachAction) + '</span></button>' +
      '<button class="button" type="button" data-action="takeback" ' + (takeback ? '' : 'disabled') + '>' + icon('undo') + '<span>Take back</span></button>' +
      '<button class="button" type="button" data-action="moves">' + icon('moves') + 'Moves</button><button class="button" type="button" data-action="game-menu">' + icon('more') + 'More</button></div>';
  }

  function renderReview() {
    const review = object(model.review, {});
    if (!review.available) { renderGame(); return; }
    const liveGame = !!review.liveGame;
    const scored = !liveGame && !!review.analyzed;
    const playedScore = scored ? review.playedCompact : 'Not scored';
    const bestScore = scored ? review.bestCompact : 'Not scored';
    const category = reviewCategory(review.verdict);
    main.innerHTML =
      '<section class="screen screen--review review-workspace"><div class="review-position-line"><div><span class="coach-kicker">' + escape(liveGame ? 'Move explorer' : 'Stockfish analysis') + '</span><strong>' + escape(Math.ceil(Number(review.index) / 2)) + (Number(review.index) % 2 ? '. ' : '… ') + escape(review.notation || 'Move') + '</strong></div><span class="review-verdict review-verdict--' + category.key + '">' + escape(scored ? category.label : liveGame ? 'In progress' : 'Analyzing…') + '</span></div>' +
      '<div id="board-host" class="board-stage">' + boardLayout(object(review.position, {}), Number(review.me || 0), !!review.yourTurn, {}, false) + '</div>' +
      reviewTimeline(review) +
      '<div class="tab-row" role="tablist" aria-label="Review view">' +
      reviewTab('Before', 0, review.mode) + reviewTab('Played', 1, review.mode) + (scored ? reviewTab('Best move', 2, review.mode) : '') + '</div>' +
      '<article class="review-insight review-insight--' + category.key + '"><button class="insight-reading" type="button" data-action="review-details"><div class="insight-heading"><span class="coach-kicker">' + escape(review.retrying ? review.retryComplete ? 'Well found' : 'Your turn · find the best move' : scored ? category.label : 'Position coach') + '</span><span class="detail-link">Details ›</span></div><p class="coach-copy">' + escape(review.retrying ? review.retryFeedback : liveGame ? 'Explore your moves here. Scored analysis is available after the game ends.' : review.reason || 'Stockfish is analyzing the game on your device.') + '</p></button>' +
      (scored && !review.retrying ? '<div class="review-score-line" aria-label="Scores from ' + escape(review.scoreSide) + '\u2019s perspective"><span>' + escape(review.scoreSide) + ' · played <strong>' + escape(playedScore.replace(' pawns','')) + '</strong></span><span>Best <strong>' + escape(bestScore.replace(' pawns','')) + '</strong></span></div>' : '') +
      '<div class="review-coach-actions">' + (review.retrying ? '<button class="button button--compact" type="button" data-action="review-cancel-retry">Back to review</button>' : review.canRetry ? '<button class="button button--compact" type="button" data-action="review-retry">' + icon('undo') + 'Retry move</button>' : '<span class="tiny">' + (liveGame ? 'Your game is unchanged' : 'Offline Stockfish') + '</span>') + '<button class="button button--primary button--compact" type="button" data-action="review-key">Next key move →</button></div></article>' +
      '<div class="review-navigation"><button class="button" type="button" data-action="review-prev" aria-label="Previous move" ' + (review.canPrevious ? '' : 'disabled') + '>←</button><button class="button review-counter" type="button" data-action="review-list">' + escape(review.index) + ' <span>/ ' + escape(review.total) + ' moves</span></button><button class="button" type="button" data-action="review-next" aria-label="Next move" ' + (review.canNext ? '' : 'disabled') + '>→</button></div></section>';
    attachBoardInteractions();
    const current = main.querySelector('.review-ribbon [aria-current="step"]');
    if (current) current.parentElement.scrollLeft = current.offsetLeft - current.parentElement.offsetLeft - current.parentElement.clientWidth / 2 + current.clientWidth / 2;
  }

  function reviewCategory(verdict) {
    if (/blunder/i.test(verdict)) return {key:'blunder',label:'Blunder',mark:'??'};
    if (/mistake/i.test(verdict)) return {key:'mistake',label:'Mistake',mark:'?'};
    if (/inaccuracy/i.test(verdict)) return {key:'inaccuracy',label:'Inaccuracy',mark:'?!'};
    if (/best/i.test(verdict)) return {key:'best',label:'Best move',mark:'★'};
    if (/good/i.test(verdict)) return {key:'good',label:'Good move',mark:'✓'};
    return {key:'pending',label:'Not analyzed yet',mark:'…'};
  }

  function keyMoves() { return array(model.review.timeline).filter(m => /mistake|blunder|inaccuracy/i.test(m.verdict)); }
  function nextKeyMove() {
    const keys = keyMoves();
    if (!keys.length) { openReviewOverview(); return; }
    const target = keys.find(m => m.index > model.review.index) || keys[0];
    send('review.jump', {index: target.index});
  }
  function openReviewOverview() {
    overlay = {kind:'review-overview'}; openSheet('review-overview');
    sheetScroll.innerHTML = reviewOverviewMarkup();
  }
  function reviewOverviewMarkup() {
    const r = model.review, moves = array(r.timeline), keys = keyMoves();
    const counts = {};
    ['best','good','inaccuracy','mistake','blunder'].forEach(k => counts[k] = [0,0]);
    moves.forEach(m => {const category = reviewCategory(m.verdict).key;if(counts[category])counts[category][(m.index-1)%2]++;});
    const analyzed = moves.filter(m => !!m.verdict).length;
    const complete = analyzed === moves.length && !r.liveGame;
    return '<div class="sheet-heading"><div><p class="eyebrow">Your game, understood</p><h2 id="sheet-title" class="sheet-title">Review highlights</h2></div><button class="icon-button" type="button" data-sheet-close aria-label="Close">' + icon('close') + '</button></div>' +
      '<div class="review-overview-status"><span class="result-badge">' + (r.liveGame ? 'Game in progress' : complete ? 'Analysis ready' : 'Analyzing on device') + '</span><span class="tiny">' + analyzed + ' / ' + moves.length + ' moves</span></div>' +
      '<p class="body-copy overview-lead">' + (r.liveGame ? 'Browse the moves now. Finish the game for scored feedback.' : keys.length ? keys.length + ' moment' + (keys.length === 1 ? '' : 's') + ' to learn from. Revisit the turning points and try a better move.' : complete ? 'No inaccuracies found in this search. Walk through the game to see Stockfish’s recommendations.' : 'Stockfish is comparing your moves with its best alternatives.') + '</p>' +
      '<div class="overview-graph">' + reviewTimeline(r) + '</div>' +
      '<div class="classification-table"><div class="classification-row classification-heading"><span>Move quality</span><span>White</span><span>Black</span></div>' + Object.keys(counts).map(k=>{const c=reviewCategory(k);return '<div class="classification-row"><span><i class="move-mark move-mark--' + k + '">' + c.mark + '</i>' + c.label + '</span><strong>' + counts[k][0] + '</strong><strong>' + counts[k][1] + '</strong></div>';}).join('') + '</div>' +
      '<p class="tiny">Engine classifications, not a global accuracy rating. Offline, time-limited analysis may change with a deeper search.</p>' +
      '<div class="overview-key-list">' + keys.map(m=>'<button class="choice choice-row" type="button" data-review-jump="' + m.index + '"><span class="move-mark move-mark--' + reviewCategory(m.verdict).key + '">' + reviewCategory(m.verdict).mark + '</span><span><strong>' + Math.ceil(m.index/2) + (m.index%2?'. ':'… ') + escape(m.notation) + '</strong><small>' + escape(m.verdict) + '</small></span><span>›</span></button>').join('') + '</div>' +
      '<div class="sheet-footer"><button class="button button--primary button--wide" type="button" data-action="review-start-guided">' + (keys.length ? 'Review key moments' : 'Walk through the game') + ' →</button></div>';
  }

  function reviewTimeline(review) {
    const moves = array(review.timeline);
    const hasScore = (m) => m.whiteScore != null || m.whiteMate != null;
    const values = moves.filter(hasScore);
    const chart = values.length > 1 && !review.liveGame ? '<svg class="analysis-chart" viewBox="0 0 100 32" preserveAspectRatio="none" role="img" aria-label="Evaluation through the game. Above the line favors White; forced mates are at the chart edges."><path class="analysis-zero" d="M0 16H100"/>' + moves.map((m, i) => {
      if (!hasScore(m) || i === 0 || !hasScore(moves[i - 1])) return '';
      const y = (entry) => 16 - (entry.whiteMate != null ? Math.sign(entry.whiteMate) : Math.tanh(Number(entry.whiteScore) / 4)) * 14;
      const x1 = (i - 1) / Math.max(1, moves.length - 1) * 100, x2 = i / Math.max(1, moves.length - 1) * 100;
      const segment = 'M' + x1 + ' ' + y(moves[i-1]) + 'L' + x2 + ' ' + y(m);
      return '<path class="analysis-area" d="' + segment + 'L' + x2 + ' 16L' + x1 + ' 16Z"/><path class="analysis-line" d="' + segment + '"/>';
    }).join('') + '<path class="analysis-cursor" d="M' + ((Number(review.index) - 1) / Math.max(1, moves.length - 1) * 100) + ' 0v32"/></svg>' : '<div class="analysis-caption">' + (review.liveGame ? 'Your game, move by move' : 'Evaluation appears as Stockfish analyzes') + '</div>';
    return '<div class="review-timeline">' + chart + '<div class="review-ribbon" aria-label="Jump to move">' + moves.map((m) => '<button type="button" data-review-jump="' + m.index + '" aria-current="' + (m.index === review.index ? 'step' : 'false') + '"><span>' + Math.ceil(m.index / 2) + (m.index % 2 ? '.' : '…') + '</span> ' + escape(m.notation) + '</button>').join('') + '</div></div>';
  }

  function openReading(title, copy, extra) {
    overlay = {kind: 'reading'};
    openSheet('reading');
    sheetScroll.innerHTML = '<div class="sheet-heading"><h2 id="sheet-title" class="sheet-title">' + escape(title) + '</h2><button class="icon-button" type="button" data-sheet-close aria-label="Close">' + icon('close') + '</button></div><p class="body-copy reading-copy">' + escape(copy) + '</p>' + (extra || '');
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
      const coachClass = square === coachFrom && coachTo < 0 ? ' square--coach-source' : '';
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
    const arrows = [];
    const best = [Number(position.bestFrom ?? -1), Number(position.bestTo ?? -1)];
    const played = [Number(position.playedFrom ?? -1), Number(position.playedTo ?? -1)];
    if (played[0] >= 0 && played[1] >= 0 && (played[0] !== best[0] || played[1] !== best[1])) arrows.push(chessArrow(played[0], played[1], me, 'played'));
    if (best[0] >= 0 && best[1] >= 0) arrows.push(chessArrow(best[0], best[1], me, 'best'));
    return '<svg class="board-overlay" viewBox="0 0 100 100" aria-hidden="true">' + arrows.join('') + '</svg>';
  }

  function chessArrow(from, to, me, kind) {
    const a = visualPoint(from, me), b = visualPoint(to, me);
    const dx = b.x - a.x, dy = b.y - a.y;
    const knight = (Math.abs(dx) === 25 && Math.abs(dy) === 12.5) || (Math.abs(dx) === 12.5 && Math.abs(dy) === 25);
    const bend = knight ? Math.abs(dx) > Math.abs(dy) ? {x:b.x,y:a.y} : {x:a.x,y:b.y} : a;
    const length = Math.hypot(b.x-bend.x,b.y-bend.y);
    if (!length) return '';
    const ux = (b.x-bend.x)/length, uy = (b.y-bend.y)/length;
    const end = {x:b.x-ux*4.3,y:b.y-uy*4.3};
    const path = 'M' + a.x + ' ' + a.y + (knight ? 'L' + bend.x + ' ' + bend.y : '') + 'L' + end.x + ' ' + end.y;
    const head = 'M' + b.x + ' ' + b.y + 'L' + (end.x-uy*3.7) + ' ' + (end.y+ux*3.7) + 'L' + (end.x+uy*3.7) + ' ' + (end.y-ux*3.7) + 'Z';
    // One translucent group avoids a dark seam where shaft and head meet.
    return '<g class="chess-arrow chess-arrow--' + kind + '"><path class="chess-arrow-shaft" d="' + path + '"/><path class="chess-arrow-head" d="' + head + '"/></g>';
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
    const context = boardContext();
    const position = context && object(context.position, {});
    return position && array(position.moves).some((move) => Number(move[0]) === square);
  }

  function selectSquare(square) {
    if (movePending || !boardContext() || !boardContext().yourTurn) return;
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
    if (movePending || !boardContext() || !boardContext().yourTurn) return false;
    const position = object(boardContext().position, {});
    const valid = array(position.moves).some((move) => Number(move[0]) === from && Number(move[1]) === to);
    if (!valid) return false;
    if (model.screen === 'review' && Math.abs(Number(position.b[from])) === 1 && (to < 8 || to >= 56)) {
      selectedSquare = null;
      overlay = {kind:'retry-promotion',from,to}; openSheet('promotion');
      sheetScroll.innerHTML = '<div class="sheet-heading"><h2 id="sheet-title" class="sheet-title">Choose your promotion</h2><button class="icon-button" type="button" data-sheet-close aria-label="Cancel">' + icon('close') + '</button></div><div class="choice-grid choice-grid--two">' + [[5,'Queen'],[4,'Rook'],[3,'Bishop'],[2,'Knight']].map(([piece,name])=>'<button class="choice" type="button" data-retry-promotion="'+piece+'">'+name+'</button>').join('') + '</div>';
      refreshBoardOnly(); return true;
    }
    selectedSquare = null;
    movePending = true;
    if (model.screen === 'puzzle') puzzleCommand('move', {from, to});
    else if (model.screen === 'review') send('review.try', {from, to, index:model.review.index, token:model.review.retryToken});
    else send('match.move', {from: from, to: to});
    refreshBoardOnly();
    return true;
  }

  function refreshBoardOnly() {
    const host = document.getElementById('board-host');
    if (!host || !boardContext()) return;
    const shell = host.querySelector('.board-shell');
    if (!shell) return;
    const position = object(boardContext().position, {});
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
    if (match.local && !match.solo) return Number(match.winner) === 0 ? 'White wins' : 'Black wins';
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
    const primaryLabel = bot ? 'Play' : remote ? (remoteHosting ? 'Send invite' : 'Suggest game') : 'Start game';
    return '<div class="sheet-heading"><div><p class="eyebrow">' + (bot ? 'Offline bot' : remote ? 'Private room' : 'One device') + '</p><h2 id="sheet-title" class="sheet-title">' +
      (bot ? 'Set up your game' : remote ? (remoteHosting ? 'Invite a friend' : 'Suggest a game') : 'Pass & play') + '</h2><p class="sheet-subtitle">' +
      (bot ? 'Choose a time and opponent. Hints make this a Practice game.' : remote ? 'Choose a clock. This sheet stays put while you decide.' : 'Hand the phone over after every move.') + '</p></div><button class="icon-button" type="button" data-sheet-close aria-label="Close">' + icon('close') + '</button></div>' +
      '<section class="sheet-section"><p class="sheet-label">Time control</p><div class="choice-grid" data-choice-group="clock">' +
      clockNames.map((name, index) => choiceButton('clock', index, name, index === 4 ? 'No clock' : name.replace(' | ', ' min + '), overlay.clock === index)).join('') + '</div></section>' +
      (bot ? '<section class="sheet-section"><p class="sheet-label">Opponent</p><div class="choice-grid" data-choice-group="level">' +
        strengthNames.map((name, index) => choiceButton('level', index, name, index === 0 ? 'Estimated 600' : index === 1 ? 'Estimated 1200' : 'Estimated 1800', overlay.level === index)).join('') +
        '</div></section>' : '') +
      '<div class="sheet-footer"><button class="button button--quiet" type="button" data-sheet-close>Cancel</button><button class="button button--primary" type="button" data-setup-start>' +
      primaryLabel + '</button></div>';
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
    // The selected chip communicates the clock. A stable action label avoids
    // resizing the footer (and the whole sheet) when "Untimed" is selected.
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
      else if (value === 'coach-details') openReading(model.match.coach.heading || 'Position coach', model.match.coach.copy);
      else if (value === 'takeback') send('match.takeback');
      else if (value === 'moves') send('match.openMoves');
      else if (value === 'game-menu') send('match.openMenu');
      else if (value === 'rematch') send('match.rematch');
      else if (value === 'review-open') { showReviewOverview = true; send('review.open'); }
      else if (value === 'review-back') send('nav.back', {}, false);
      else if (value === 'review-prev') send('review.previous');
      else if (value === 'review-next') send('review.next');
      else if (value === 'review-overview') openReviewOverview();
      else if (value === 'review-key') nextKeyMove();
      else if (value === 'review-retry') send('review.retry');
      else if (value === 'review-cancel-retry') send('review.cancelRetry');
      else if (value === 'review-start-guided') { closeOverlay(); send('review.jump', {index:keyMoves()[0]?.index || 1}); }
      else if (value === 'review-branch') { closeOverlay(); send('review.branch'); }
      else if (value === 'review-details') openReading(model.review.verdict || 'Position details', model.review.liveGame ? 'Finish the game to unlock scored Stockfish analysis. You can explore every played move without changing your saved game.' : model.review.report || 'Stockfish is analyzing this move.', model.review.canBranch ? '<button class="button button--wide review-branch" type="button" data-action="review-branch">Practice from here</button>' : '');
      else if (value === 'review-list') openReading('Move navigator', 'Choose any move to inspect it.', '<div class="move-navigator">' + array(model.review.timeline).map((m) => '<button class="choice" type="button" data-review-jump="' + m.index + '"><strong>' + Math.ceil(m.index / 2) + (m.index % 2 ? '. ' : '… ') + escape(m.notation) + '</strong><span class="tiny">' + escape(m.verdict || 'Unscored') + '</span></button>').join('') + '</div>');
      else if (value === 'engine-info') send('engine.info', {}, false);
      else if (value.startsWith('puzzle-')) puzzleCommand(value.substring(7));
      return;
    }

    const navButton = event.target.closest('[data-nav]');
    if (navButton) {
      go(navButton.dataset.nav);
      return;
    }
    const retryPromotion = event.target.closest('[data-retry-promotion]');
    if (retryPromotion && overlay?.kind === 'retry-promotion') {
      const {from,to} = overlay;
      closeOverlay(); movePending = true;
      send('review.try', {from,to,promotion:Number(retryPromotion.dataset.retryPromotion),index:model.review.index,token:model.review.retryToken});
      refreshBoardOnly(); return;
    }
    const lesson = event.target.closest('[data-lesson]');
    if (lesson) {
      send('learn.start', {lesson: Number(lesson.dataset.lesson)});
      return;
    }
    const puzzle = event.target.closest('[data-puzzle]');
    if (puzzle) { send('puzzle.start', {index: Number(puzzle.dataset.puzzle)}, false); return; }
    const mode = event.target.closest('[data-review-mode]');
    if (mode) {
      send('review.mode', {mode: Number(mode.dataset.reviewMode)});
      return;
    }
    const jump = event.target.closest('[data-review-jump]');
    if (jump) { if (overlay) closeOverlay(); send('review.jump', {index: Number(jump.dataset.reviewJump)}); return; }
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
