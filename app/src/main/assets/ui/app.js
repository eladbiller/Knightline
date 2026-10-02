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
    archive: {entries: [], limit: 100},
    settings: {sound: true, vibration: true},
  };
  let port = null;
  let sequence = 0;
  let selectedSquare = null;
  let boardDrag = null;
  let suppressNextBoardClick = false;
  let overlay = null;
  let overlayReturnFocus = null;
  let pendingSheetReturn = null;
  let closingSheetTimer = 0;
  let renderedScreen = '';
  let renderedView = '';
  const scrollPositions = new Map();
  let movePending = false;
  let showReviewOverview = false;
  let reviewFilter = 'both';
  let puzzleFilter = 'warmup';
  let puzzlePage = 0;
  let learnSection = 'puzzles';

  const clockNames = ['10 | 0', '5 | 0', '3 | 2', '1 | 0', 'Untimed'];
  const strengthNames = ['Easy', 'Medium', 'Hard'];

  function knightIcon() {
    return '<img src="knightline.svg" width="34" height="34" alt="" aria-hidden="true">';
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
    app.inert = false;
    app.dataset.ready = 'true';
    app.setAttribute('aria-busy', 'false');
    const previousPosition=boardPositionKey();
    const payload = object(event.payload, {});
    applyFontScale(payload.fontScale);
    model.screen = payload.screen || model.screen;
    model.backTarget = payload.backTarget || 'home';
    model.session = payload.session || '';
    model.transport = object(payload.transport, model.transport);
    model.profile = object(payload.profile, model.profile);
    model.lessons = object(payload.lessons, model.lessons);
    model.match = payload.match && payload.match.position ? payload.match : null;
    model.review = object(payload.review, model.review);
    model.puzzle = object(payload.puzzle, {});
    model.archive = object(payload.archive, model.archive);
    model.settings = object(payload.settings, model.settings);
    if(previousPosition!==boardPositionKey())selectedSquare=null;
    if (boardDrag && boardDrag.key !== boardPositionKey()) cancelBoardDrag();
    // Any authoritative state response completes (or rejects) the one pending
    // board command. This prevents rapid taps from queuing a second move against
    // a position that is already changing natively.
    movePending = false;
    if (!model.match && model.screen === 'game' || !model.review.available && model.screen === 'review') model.screen = 'home';
    if (selectedSquare != null && !canSelectFrom(selectedSquare)) selectedSquare = null;
    render();
    if (overlay?.kind === 'feedback') patchFeedback();
    if (model.screen === 'review' && !model.review.liveGame && showReviewOverview) {
      showReviewOverview = false; openReviewOverview();
    } else if (overlay && overlay.kind === 'review-overview') {
      const scroll = sheetScroll.scrollTop;
      const statisticsOpen = !!sheetScroll.querySelector('.overview-statistics[open]');
      const focus = document.activeElement?.dataset.reviewFilter;
      sheetScroll.innerHTML = reviewOverviewMarkup();
      if(statisticsOpen) sheetScroll.querySelector('.overview-statistics').open = true;
      sheetScroll.scrollTop = scroll;
      if(focus) sheetScroll.querySelector('[data-review-filter="' + focus + '"]')?.focus({preventScroll:true});
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
      if (model.screen === 'game') renderGame();
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
      if (overlay) dismissOverlay();
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
    // Keep each tab/category's position when returning from a detail or another tab.
    const view = model.screen === 'learn' ? 'learn:' + learnSection : model.screen;
    const scroll = main.scrollTop;
    if (renderedView) scrollPositions.set(renderedView, scroll);
    const screenChanged = renderedScreen !== model.screen;
    if (screenChanged) { cancelBoardDrag(); selectedSquare = null; pendingSheetReturn = null; if (overlay) closeOverlay(); }
    app.dataset.screen = model.screen;
    patchHeader();
    patchNavigation();
    if (model.screen === 'play') renderPlay();
    else if (model.screen === 'learn') renderLearn();
    else if (model.screen === 'profile') renderProfile();
    else if (model.screen === 'history') renderHistory();
    else if (model.screen === 'game') renderGame();
    else if (model.screen === 'review') renderReview();
    else if (model.screen === 'puzzle') renderPuzzle();
    else renderHome();
    main.scrollTop = view !== renderedView ? scrollPositions.get(view) || 0 : scroll;
    renderedScreen = model.screen;
    renderedView = view;
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
    if (model.screen === 'history') {
      header.innerHTML = '<div class="header-brand"><div class="brand-mark" aria-hidden="true">' + knightIcon() + '</div><p class="brand-word">Your games</p></div><span class="header-status">Review library</span>';
      return;
    }
    const focused = model.screen === 'game' || model.screen === 'review';
    header.innerHTML = focused
      ? '<div class="header-brand"><button class="header-back" type="button" data-action="' + (model.screen === 'review' ? 'review-back' : 'game-back') + '" aria-label="Back to ' + escape({history:'Games',learn:'Learn',play:'Play',game:'game',home:'Home',profile:'Profile'}[model.backTarget] || 'Home') + '">' + icon('back') + '</button>' +
        '<div><p class="brand-word">' + (model.screen === 'review' ? 'Review' : 'Knightline') + '</p></div></div>' +
        (model.screen === 'review' ? '<button class="button button--compact" type="button" data-action="review-overview">' + icon('review') + 'Highlights</button>' : '<div class="header-status header-status--compact"><span class="status-dot ' + (connected ? '' : 'status-dot--idle') + '"></span><span>' + escape(connected ? 'Connected' : 'Saved') + '</span></div>')
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
      (match ? resumeCard(match) : '') +
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
      roomStatusCard(match) +
      '<section class="quick-grid" aria-label="Ways to play">' +
      quickCard('bot', 'Play Stockfish', 'Offline bot, clocks and private skill', 'setup-bot') +
      quickCard('bluetooth', 'Nearby game', 'Bluetooth on two Knightline phones', 'transport-menu') +
      quickCard('room', 'Private room', 'Online peer-to-peer room code', 'online-menu') +
      quickCard('learn', 'Learn an opening', 'Guided lines with progressive hints', 'nav-openings') +
      '</section>' +
      '<button class="surface library-link" type="button" data-action="nav-history"><span class="quick-icon">' + icon('review') + '</span><span><strong>Game library</strong><small>' + array(model.archive.entries).length + ' saved · revisit your games</small></span><span aria-hidden="true">›</span></button></section>';
  }

  function resumeCard(match) {
    if (match.winner >= 0 || match.lessonComplete) return '<article class="surface surface--flat"><p class="eyebrow">' + (match.lessonComplete?'Lesson complete':'Last game · finished') + '</p><h2 class="surface-title">' + escape(match.opponent || 'Private game') + '</h2><div class="hero-actions"><button class="button button--mint" type="button" data-action="review-open" ' + (!match.canReview ? 'disabled' : '') + '>' + icon('review') + (match.lessonComplete?'Review lesson':'Review last game') + '</button><button class="button button--quiet" type="button" data-action="nav-history">All games</button></div></article>';
    return '<article class="surface surface--flat"><div class="section-heading"><div><p class="eyebrow">Saved board</p><h2 class="surface-title">' +
      escape(match.yourTurn ? 'Your move is waiting' : 'Match in progress') + '</h2><p class="subtitle">' +
      escape(match.opponent || 'Private game') + ' · ' + escape(match.clock && match.clock.preset || 'Untimed') + '</p></div>' +
      '<button class="button button--mint button--compact" type="button" data-action="resume">Resume</button></div></article>';
  }

  function renderHistory() {
    const library = model.archive, entries = array(library.entries);
    main.innerHTML = '<section class="screen"><div><p class="eyebrow">Your games</p><h1 class="title">Every game, a lesson.</h1><p class="subtitle">Your latest ' + library.limit + ' games are saved on this phone. Open a review without changing your active match.</p></div>' +
      (library.error ? '<p class="library-error" role="alert">' + escape(library.error) + '</p>' : '') +
      '<div class="game-library">' + entries.map(e => '<button class="surface archived-game" type="button" data-archive-id="' + escape(e.id) + '"><div class="archive-heading"><span class="eyebrow">' + escape(e.mode) + '</span><span class="archive-result">' + escape(e.result) + '</span></div><div class="archive-players"><span><i class="side-disc side-disc--white"></i>' + escape(e.white) + '</span><span><i class="side-disc side-disc--black"></i>' + escape(e.black) + '</span></div><div class="archive-footer"><small>' + escape(new Date(e.at).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})) + ' · ' + e.plies + ' plies</small><strong>Review →</strong></div></button>').join('') +
      (entries.length ? '' : '<article class="empty-state"><div><h2 class="surface-title">Your story starts here.</h2><p class="body-copy">Play a game and its moves will be saved automatically.</p><button class="button button--primary" type="button" data-action="nav-play">Start a game</button></div></article>') + '</div></section>';
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
      (model.match ? resumeCard(model.match) : '') +
      connectedRoom +
      '<article class="surface"><div class="section-heading"><div><h2 class="surface-title">Play Stockfish</h2><p class="subtitle">Choose a clock and a level. Hints turn it into Practice.</p></div></div>' +
      '<div class="hero-actions"><button class="button button--primary" type="button" data-action="setup-bot">Set up bot game</button></div></article>' +
      '<div class="quick-grid">' +
      quickCard('pass', 'Pass & play', 'Two people, one device', 'setup-pass') +
      quickCard('bluetooth', 'Nearby Bluetooth', 'No internet required', 'transport-menu') +
      quickCard('room', 'Private Peer room', 'Invite only, internet for signaling', 'online-menu') +
      quickCard('review', 'Game library', 'Review your saved games', 'nav-history') +
      '</div>' +
      '<article class="surface"><p class="eyebrow">Match integrity</p><p class="body-copy">A clean standard game can update your on-device private skill estimate. Hints, takebacks, lessons and review branches are clearly labelled Practice.</p></article></section>';
  }

  function renderLearn() {
    const lessons = array(object(model.lessons, {}).items);
    const puzzles = array(object(model.lessons, {}).puzzles);
    const solved = puzzles.filter((p) => p.solved).length;
    const clean = puzzles.filter(p => p.clean).length, assisted = puzzles.filter(p => p.solved && !p.clean).length;
    const missed = puzzles.filter(p => p.missed).length;
    const bands = [['warmup','Warm-up','Mate in one'],['foundation','Foundation','800–1199'],['intermediate','Intermediate','1200–1599'],['challenging','Challenging','1600–1999'],['advanced','Advanced','2000–2399'],['expert','Expert','2400+']];
    const filtered = puzzles.filter(p => puzzleFilter === 'missed' ? p.missed : p.band === puzzleFilter);
    puzzlePage = Math.max(0, Math.min(puzzlePage, Math.ceil(filtered.length / 10) - 1));
    const visible = filtered.slice(puzzlePage * 10, puzzlePage * 10 + 10);
    main.innerHTML =
      '<section class="screen"><div><p class="eyebrow">Learn</p><h1 class="title">Build your game.</h1><p class="subtitle">Tactics, opening plans and the art of finishing.</p></div>' +
      '<nav class="learn-tabs" aria-label="Learning categories">' + [['puzzles','Puzzles'],['openings','Openings'],['endgames','Endgames']].map(([key,label])=>'<button type="button" data-learn-section="'+key+'" aria-pressed="'+(learnSection===key)+'">'+label+'</button>').join('')+'</nav>' +
      (learnSection === 'puzzles' ?
      '<article class="surface puzzle-hero"><div class="section-heading"><div><p class="eyebrow">Your practice</p><h2 class="surface-title">' + solved + ' / ' + puzzles.length + ' solved</h2></div></div><div class="puzzle-progress-row"><span><strong>' + clean + '</strong> First try · no help</span><span><strong>' + assisted + '</strong> Practice / earlier solves</span></div><button class="button button--wide missed-collection" type="button" data-puzzle-filter="missed">' + icon('undo') + 'Practice again <span>' + missed + '</span></button><p class="tiny">Hints and mistakes stay recorded, even after a restart. Earlier-version solves are preserved as practice because their first-attempt history cannot be verified.</p></article>' +
      '<section class="difficulty-grid" aria-label="Puzzle difficulty">' + bands.map(([key,label,range])=>'<button class="difficulty-card" type="button" data-puzzle-filter="' + key + '" aria-pressed="' + (puzzleFilter === key) + '"><strong>' + label + '</strong><span>' + range + '</span><small>' + puzzles.filter(p=>p.band===key).length + ' puzzles</small></button>').join('') + '</section>' +
      '<article class="surface puzzle-library"><div class="section-heading"><h2 class="surface-title">' + (puzzleFilter === 'missed' ? 'Practice missed' : bands.find(b=>b[0]===puzzleFilter)?.[1] || 'Puzzles') + '</h2><span class="tiny">' + filtered.length + ' positions</span></div><div class="puzzle-pack">' + visible.map(p=>'<button class="puzzle-entry" type="button" data-puzzle="' + p.index + '"><span class="puzzle-number">' + (p.clean ? icon('check') : p.solved ? '◐' : String(p.index + 1).padStart(2,'0')) + '</span><span><strong>' + escape(p.name) + '</strong><small>' + (p.rating ? 'Difficulty ' + p.rating + ' · ' : '') + (p.clean ? 'Unassisted' : p.missed ? 'Needs practice' : p.solved ? 'Solved with help' : 'Unsolved') + '</small></span><span aria-hidden="true">›</span></button>').join('') + (filtered.length ? '' : '<p class="body-copy">Nothing to revisit yet. Choose a difficulty and start a puzzle.</p>') + '</div>' + (filtered.length > 10 ? '<div class="puzzle-pagination"><button class="button button--compact" type="button" data-puzzle-page="-1" ' + (puzzlePage===0?'disabled':'') + '>Previous</button><span>' + (puzzlePage+1) + ' / ' + Math.ceil(filtered.length/10) + '</span><button class="button button--compact" type="button" data-puzzle-page="1" ' + ((puzzlePage+1)*10>=filtered.length?'disabled':'') + '>Next</button></div>' : '') + '<p class="tiny">Puzzle difficulty is from Lichess, not your player rating. 250 CC0 positions plus six original warm-ups. Progress stays on this phone.</p></article>' +
      '' : learnSection === 'openings' ? '<div class="section-heading"><div><p class="eyebrow">Build your repertoire</p><h2 class="surface-title">Guided openings</h2><p class="subtitle">Choose a line, then play it as White or Black.</p></div></div>' +
      '<section class="lesson-list" aria-label="Opening lessons">' +
      lessons.map((lesson) => '<button class="lesson-card" type="button" data-lesson="' + escape(lesson.id) + '">' +
        '<span class="lesson-icon" aria-hidden="true">✦</span><span class="lesson-content"><span class="lesson-title">' + escape(lesson.name) + '</span>' +
        '<span class="lesson-copy">' + escape(lesson.intro) + '</span></span><span class="progress-ring" data-label="' +
        escape(lesson.moves) + 'm" aria-label="' + escape(lesson.moves) + ' guided moves"></span></button>').join('') +
      '</section>' : '') + '</section>';
    const endgames=array(model.lessons.endgames);
    if(learnSection==='endgames') main.querySelector('.screen').insertAdjacentHTML('beforeend','<section class="endgame-library"><p class="eyebrow">Convert the advantage</p><h2 class="surface-title">Learn to finish.</h2><p class="subtitle">Mating methods, stalemate traps, and what your pieces can actually force against a lone king.</p><div class="lesson-list">' + endgames.map(l=>'<button class="lesson-card" type="button" data-endgame="'+l.id+'"><span class="lesson-icon" aria-hidden="true">'+icon('learn')+'</span><span class="lesson-content"><span class="lesson-title">'+escape(l.name)+'</span><span class="lesson-copy">'+escape(l.verdict)+'</span></span><span aria-hidden="true">›</span></button>').join('')+'</div></section>');
  }

  function openLesson(lesson,endgame=false) {
    overlay={kind:'lesson',lesson,endgame,side:0,pattern:false};openSheet('lesson');
    const playable=!endgame||lesson.playable;
    sheetScroll.innerHTML='<div class="sheet-heading"><div><p class="eyebrow">'+(endgame?'Endgame lesson':'Guided opening')+'</p><h2 id="sheet-title" class="sheet-title">'+escape(lesson.name)+'</h2></div><button class="icon-button" type="button" data-sheet-close aria-label="Close">'+icon('close')+'</button></div>'+
      (endgame?'<p class="lesson-verdict">'+escape(lesson.verdict)+'</p>':'')+'<p class="body-copy" data-lesson-intro>'+escape(endgame?lesson.explanation:lesson.intro)+'</p>'+
      (endgame?'<p class="body-copy lesson-method">'+escape(lesson.steps)+'</p>':'<p class="tiny">You play the selected color. The coach follows the other side of the opening. Untimed practice; use Hint at any step.</p>')+
      (playable?'<fieldset class="lesson-side"><legend class="eyebrow">Play as</legend><div class="choice-grid choice-grid--two">'+[[0,'White'],[1,'Black']].map(([side,label])=>'<button type="button" class="choice" data-lesson-side="'+side+'" aria-pressed="'+(side===0)+'"><span class="side-disc side-disc--'+label.toLowerCase()+'"></span> '+label+'</button>').join('')+'</div></fieldset>'+
        (endgame?'<fieldset class="lesson-side"><legend class="eyebrow">Practice</legend><div class="choice-grid choice-grid--two"><button class="choice" type="button" data-endgame-stage="technique" aria-pressed="true">Full technique</button><button class="choice" type="button" data-endgame-stage="pattern" aria-pressed="false">Finish pattern</button></div></fieldset><p class="tiny">Full technique uses Stockfish defense. Finish pattern starts one move from mate; it is not evidence that every position is won.</p>':'')+
        '<div class="sheet-footer"><button class="button" type="button" data-sheet-close>Cancel</button><button class="button button--primary" type="button" data-lesson-start>Start as White</button></div>':'<p class="tiny">No unwinnable bot challenge: this material is a dead draw against a lone king. Try the rook or queen lesson to practise a forced mate.</p><button class="button button--wide" type="button" data-sheet-close>Back to lessons</button>');
  }

  function renderPuzzle() {
    const p = model.puzzle;
    if (!p || !p.available) { renderLearn(); return; }
    const action = ['Hint', 'Show piece', 'Show move', 'Hide hint'][p.hint || 0];
    const markup = '<section class="screen puzzle-workspace"><div class="puzzle-title"><p class="eyebrow">' + (p.rating ? 'Difficulty ' + p.rating + ' · ' + p.steps + '-move line' : 'Warm-up · mate in one') + '</p><h1 class="surface-title">' + escape(p.name) + '</h1></div><div class="puzzle-status"><span class="side-disc side-disc--' + (p.me === 0 ? 'white' : 'black') + '"></span><strong>' + (p.failed ? 'Not quite — try another idea' : p.solved ? (p.assisted ? 'Practice solve' : 'First-try solve!') : p.pendingReply ? 'Opponent replies…' : p.me === 0 ? 'White to move' : 'Black to move') + '</strong><span>' + p.completedSteps + ' / ' + p.steps + '</span></div><div id="board-host" class="board-stage">' + boardLayout(p.position, p.me, !!p.yourTurn, {}, false) + '</div><article class="puzzle-feedback' + (p.failed ? ' puzzle-feedback--mistake' : '') + '" aria-live="polite"><p class="eyebrow">' + (p.failed ? 'Your move is shown' : p.solved ? 'Pattern found' : p.hint ? 'A little direction' : p.assisted ? 'Practice · earlier help or retry' : 'Calculate the continuation') + '</p><p class="body-copy">' + escape(p.copy) + '</p></article><div class="puzzle-actions"><button class="button" type="button" data-action="puzzle-retry">Restart</button><button class="button button--primary" type="button" data-action="' + (p.failed ? 'puzzle-undo' : p.solved ? 'puzzle-next' : 'puzzle-hint') + '" ' + (p.pendingReply ? 'disabled' : '') + '>' + (p.failed ? icon('undo') + 'Undo mistake' : p.solved ? 'Next puzzle →' : icon('hint') + escape(action)) + '</button></div></section>';
    paintBoardWorkspace(markup, '.puzzle-workspace');
  }

  function boardContext() { return model.screen === 'puzzle' ? model.puzzle : model.screen === 'review' ? model.review : model.match; }
  function boardPositionKey() {
    const c = boardContext(), p = c?.position;
    return [model.screen,model.session,c?.token,c?.index,c?.me,p?.seq,array(p?.b).join(',')].join(':');
  }
  function paintBoardWorkspace(markup, selector) {
    const existing = main.querySelector(selector), key = boardPositionKey();
    if (existing?.dataset.positionKey === key) {
      const template = document.createElement('template'); template.innerHTML = markup;
      // Keep the live board connected: moving it into a new parent would lose
      // pointer capture mid-drag when Stockfish publishes an evaluation.
      const fresh = template.content.firstElementChild;
      const boardHost = existing.querySelector('#board-host');
      const freshBoardHost = fresh.querySelector('#board-host');
      const freshOverlay = fresh.querySelector('.board-overlay');
      if (boardHost && freshBoardHost) {
        if (freshOverlay) {
          boardHost.querySelector('.board-overlay')?.replaceWith(freshOverlay);
        }
        freshBoardHost.replaceWith(boardHost);
      }
      existing.replaceChildren(...fresh.childNodes);
      const rail = existing.querySelector('.eval-rail'), nextRail = fresh.querySelector('.eval-rail');
      if (rail && nextRail) { rail.setAttribute('aria-label', nextRail.getAttribute('aria-label')); rail.innerHTML = nextRail.innerHTML; }
      refreshBoardOnly();
    } else {
      cancelBoardDrag(); main.innerHTML = markup;
      main.querySelector(selector).dataset.positionKey = key;
      attachBoardInteractions();
    }
  }
  function puzzleCommand(type, payload) {
    const p = model.puzzle;
    if (p) send('puzzle.' + type, Object.assign({token: p.token, positionSeq: p.position.seq}, payload || {}), false);
  }
  function reviewCommand(type, payload) {
    const r = model.review;
    send('review.' + type, Object.assign({token:r.token,index:r.index,positionSeq:r.position.seq},payload || {}));
  }

  function renderProfile() {
    const profile = object(model.profile, {});
    const history = array(profile.history);
    main.innerHTML =
      '<section class="screen"><div><p class="eyebrow">Profile</p><h1 class="title">Your private skill.</h1><p class="subtitle">' +
      escape(profile.scope || 'Private skill rating · on this device') + '</p></div>' +
      '<article class="surface feedback-settings"><div class="section-heading"><div><p class="eyebrow">Make it yours</p><h2 class="surface-title">Sound & vibration</h2></div></div>' + feedbackMarkup() + '</article>' +
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
    const opponentActive = !finished && !match.lessonComplete && Number(clock.active) !== Number(match.me);
    const youActive = !finished && !match.lessonComplete && Number(clock.active) === Number(match.me);
    const position = object(match.position, {});
    const evaluationEnabled = !!match.evaluationEnabled;
    const material = materialBalance(array(position.b));
    const reconnectBanner = model.transport && model.transport.reconnecting ?
      '<div class="reconnecting-banner"><span class="status-dot"></span><span>Connection interrupted. Reconnecting (' + (model.transport.reconnectSeconds || 25) + 's)…</span></div>' : '';
    const markup =
      '<section class="screen screen--game play-workspace">' + reconnectBanner + '<div class="game-topline"><div><p class="game-name">' + escape(finished ? gameResult(match) : match.lessonComplete ? 'Lesson complete' : match.yourTurn ? 'Your move' : 'Opponent to move') + '</p><span class="game-integrity">' + escape(match.practice || 'Practice') + '</span></div>' +
      (evaluationEnabled ? '<button class="eval-chip" type="button" data-action="engine-info" aria-label="Stockfish evaluation ' + escape(coach.evaluation || 'not ready') + '. ' + escape(coach.evaluationState || 'Analyzing') + '">' +
      '<span class="eval-label">EVAL</span><span data-evaluation>' + escape(coach.evaluation || '—') + '</span><span class="eval-state">' + escape(coach.evaluationState || 'Analyzing') + '</span></button></div>' +
      '' : '<span class="game-state-pill">' + icon('check') + escape(finished ? 'Complete' : match.yourTurn ? 'Your turn' : 'In play') + '</span></div>') +
      playerCard(match.opponent || 'Opponent', playerDetail(match.opponentDetail || 'Private match', material, 1 - Number(match.me)), initials(match.opponent || 'OP'), clockForOpponent(match, clock), opponentActive, !!match.solo, 'opponent') +
      '<div id="board-host" class="board-stage">' + boardLayout(position, Number(match.me), true, coach, evaluationEnabled) + '</div>' +
      playerCard(match.you || 'You', playerDetail(match.youDetail || 'Your side', material, Number(match.me)), 'ME', clockForYou(match, clock), youActive, false, 'you') +
      coachMarkup(coach, match, finished) +
      gameActions(match, finished) + '</section>';
    paintBoardWorkspace(markup, '.play-workspace');
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
    if (match.lessonComplete) return '<div class="game-actions"><button class="button button--primary" type="button" data-action="rematch">Restart</button><button class="button" type="button" data-action="review-open">Review</button><button class="button" type="button" data-action="nav-learn">Lessons</button></div>';
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
    const scored = !!review.analyzed;
    const category = reviewCategory(review.variation ? '' : review.verdict);
    const key = [model.session,review.index,review.mode,review.token,review.position.seq,review.me].join(':');
    const existing = main.querySelector('.review-workspace');
    const title = review.variation ? 'Your analysis' : reviewMovePrefix(array(review.timeline).find(m=>m.index===review.index) || {index:review.index,side:review.toMove}) + ' ' + (review.notation || 'Move');
    const copy = review.variation ? (review.variationLine || 'Play any legal continuation.') : liveGame ? 'Explore both sides. This analysis does not change your saved game.' : review.reason || 'Stockfish is grading the saved game. You can explore the board now.';
    const markup =
      '<section class="screen screen--review review-workspace" data-position-key="' + escape(key) + '"><div class="review-position-line"><div><span class="coach-kicker">' + escape(review.variation ? (review.toMove===0?'White':'Black') + ' to move' : review.player) + '</span><strong>' + escape(title) + '</strong></div><span class="review-verdict review-verdict--' + category.key + '">' + escape(review.variation ? 'Exploring' : scored ? category.label : 'Not graded yet') + '</span></div>' +
      '<div id="board-host" class="board-stage">' + boardLayout(object(review.position, {}), Number(review.me || 0), !!review.yourTurn, {evaluation:review.evaluation}, true) + '</div>' +
      reviewTimeline(review) +
      '<div class="review-tools"><button class="button button--compact" type="button" data-action="review-best" aria-pressed="' + !!review.showBest + '" ' + (!review.canShowBest?'disabled':'') + '>' + (review.showBest?'Hide best':'Show best') + '</button><button class="button button--compact" type="button" data-action="review-undo" ' + (!review.variationLength?'disabled':'') + '>' + icon('undo') + 'Undo</button></div>' +
      '<article class="review-insight review-insight--' + category.key + '"><button class="insight-reading" type="button" data-action="review-details"><div class="insight-heading"><span class="coach-kicker">' + (review.variation?'Independent line':'Position notes') + '</span><span class="detail-link">Details ›</span></div><p class="coach-copy">' + escape(copy) + '</p></button>' +
      '<button class="review-score-line review-live-score" type="button" data-action="review-evaluate" aria-label="Reevaluate. Positive favors White"><span><span data-review-score-label>' + escape(review.evaluationLabel || 'After played move') + '</span> <strong data-review-evaluation>' + escape(review.evaluation || '…') + '</strong></span><span data-review-evaluation-state>' + escape(review.evaluationState || 'Analyzing…') + '</span></button>' +
      '<div class="review-coach-actions"><button class="button button--compact" type="button" data-action="' + (review.variation?'review-reset':'review-explore') + '">' + (review.variation?'Reset line':'Play from here') + '</button><button class="button button--primary button--compact" type="button" data-action="review-key" ' + (nextKeyTarget()?'':'disabled') + '>' + (nextKeyTarget()?'Next key move →':'No more key moves') + '</button></div></article>' +
      '<div class="review-navigation"><button class="button" type="button" data-action="review-prev" aria-label="Previous move" ' + (review.canPrevious ? '' : 'disabled') + '>←</button><button class="button review-counter" type="button" data-action="review-list">' + escape(review.index) + ' <span>/ ' + escape(review.total) + ' moves</span></button><button class="button" type="button" data-action="review-next" aria-label="Next move" ' + (review.canNext ? '' : 'disabled') + '>→</button></div></section>';
    if (existing?.dataset.positionKey === key) {
      // Engine/grade updates must not replace squares or interrupt a drag.
      const template = document.createElement('template'); template.innerHTML = markup;
      for (const selector of ['.review-position-line','.review-timeline','.review-tools','.review-insight','.review-navigation']) existing.querySelector(selector).replaceWith(template.content.querySelector(selector));
      const rail = existing.querySelector('.eval-rail'), freshRail = template.content.querySelector('.eval-rail');
      if(rail && freshRail) {
        rail.setAttribute('aria-label',freshRail.getAttribute('aria-label'));
        for(const name of ['y','height'])rail.querySelector('rect').setAttribute(name,freshRail.querySelector('rect').getAttribute(name));
      }
      const oldArrow = existing.querySelector('.board-overlay');
      const arrowTemplate = document.createElement('template'); arrowTemplate.innerHTML = arrowMarkup(review.position,review.me);
      if(oldArrow)oldArrow.replaceWith(arrowTemplate.content.firstChild);
    } else { main.innerHTML = markup; attachBoardInteractions(); }
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

  function keyMoves() { return array(model.review.timeline).filter(m => /mistake|blunder|inaccuracy/i.test(m.verdict) && (reviewFilter==='both'||reviewFilter==='mine'&&m.side===model.review.mySide||reviewFilter==='white'&&m.side===0||reviewFilter==='black'&&m.side===1)); }
  function reviewMovePrefix(move) {
    const index=Number(move.index), side=Number(move.side ?? (index-1)%2);
    const initialSide=(side+index-1)%2;
    return (Math.floor((index-1+initialSide)/2)+1)+(side===0?'.':'…');
  }
  function nextKeyTarget() { return keyMoves().find(m => m.index > model.review.index); }
  function nextKeyMove() {
    const target = nextKeyTarget();
    if (target) send('review.jump', {index: target.index});
  }
  function openReviewOverview() {
    overlay = {kind:'review-overview'}; openSheet('review-overview');
    sheetScroll.innerHTML = reviewOverviewMarkup();
  }
  function reviewOverviewMarkup() {
    if (model.review.mySide < 0 && reviewFilter === 'mine' || model.review.mySide >= 0 && ['white','black'].includes(reviewFilter)) reviewFilter = 'both';
    const r = model.review, moves = array(r.timeline), keys = keyMoves();
    const counts = {};
    ['best','good','inaccuracy','mistake','blunder'].forEach(k => counts[k] = [0,0]);
    moves.forEach(m => {const category = reviewCategory(m.verdict).key;if(counts[category])counts[category][Number(m.side)]++;});
    const analyzed = moves.filter(m => !!m.verdict).length;
    const complete = analyzed === moves.length && !r.liveGame;
    const filters = r.mySide >= 0 ? [['both','Both players'],['mine','My moves']] : [['both','Both players'],['white','White'],['black','Black']];
    return '<div class="sheet-heading"><div><p class="eyebrow">Your game, understood</p><h2 id="sheet-title" class="sheet-title">Review highlights</h2></div><button class="icon-button" type="button" data-sheet-close aria-label="Close">' + icon('close') + '</button></div>' +
      '<div class="review-overview-status"><span class="result-badge">' + (r.liveGame ? 'Game in progress' : complete ? 'Analysis ready' : 'Analyzing on device') + '</span><span class="tiny">' + analyzed + ' / ' + moves.length + ' moves</span></div>' +
      '<p class="body-copy overview-lead">' + (r.liveGame ? 'Browse the moves now. Finish the game for scored feedback.' : keys.length ? keys.length + ' moment' + (keys.length === 1 ? '' : 's') + ' to learn from. Revisit the turning points and try a better move.' : complete ? 'No inaccuracies found in this search. Walk through the game to see Stockfish’s recommendations.' : 'Stockfish is comparing your moves with its best alternatives.') + '</p>' +
      '<div class="overview-graph"><div class="overview-graph-label"><strong>Game evaluation</strong><span>White ↑ · Black ↓</span></div>' + reviewTimeline(r) + '</div>' +
      '<button class="button button--primary button--wide" type="button" data-action="review-start-guided">' + (keys.length ? 'Review key moments' : 'Walk through the game') + ' →</button><h3 class="key-moments-heading">Key moments</h3>' +
      '<div class="review-filters" aria-label="Highlight player filter">' + filters.map(([id,label])=>'<button class="chip" type="button" data-review-filter="' + id + '" aria-pressed="' + (reviewFilter===id) + '">' + label + '</button>').join('') + '</div><div class="overview-key-list">' + keys.map(m=>'<button class="choice choice-row" type="button" data-review-jump="' + m.index + '"><span class="move-mark move-mark--' + reviewCategory(m.verdict).key + '">' + reviewCategory(m.verdict).mark + '</span><span><small class="highlight-player">' + escape(m.player) + '</small><strong>' + reviewMovePrefix(m) + ' ' + escape(m.notation) + '</strong><small>' + escape(m.verdict) + '</small></span><span>›</span></button>').join('') + (keys.length?'':'<p class="tiny">No graded key moments for this filter.</p>') + '</div>' +
      '<details class="overview-statistics"><summary>Game statistics</summary>' +
      '<div class="review-player-key"><span><i class="side-disc side-disc--white"></i>' + escape(r.whitePlayer) + '</span><span><i class="side-disc side-disc--black"></i>' + escape(r.blackPlayer) + '</span></div><div class="classification-table"><div class="classification-row classification-heading"><span>Move quality</span><span>White</span><span>Black</span></div>' + Object.keys(counts).map(k=>{const c=reviewCategory(k);return '<div class="classification-row"><span><i class="move-mark move-mark--' + k + '">' + c.mark + '</i>' + c.label + '</span><strong>' + counts[k][0] + '</strong><strong>' + counts[k][1] + '</strong></div>';}).join('') + '</div>' +
      '<p class="tiny">Engine classifications, not a global accuracy rating. Offline, time-limited analysis may change with a deeper search.</p></details>';
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
    return '<div class="review-timeline">' + chart + '<div class="review-ribbon" aria-label="Jump to move">' + moves.map((m) => '<button type="button" data-review-jump="' + m.index + '" aria-current="' + (m.index === review.index ? 'step' : 'false') + '"><span>' + reviewMovePrefix(m) + '</span> ' + escape(m.notation) + '</button>').join('') + '</div></div>';
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
    const meter = evaluationEnabled ? evaluationMeter(coach, me) : '';
    return '<div class="board-layout' + (evaluationEnabled ? ' board-layout--evaluated' : '') + '">' + meter + boardMarkup(position, me, interactive) + '</div>';
  }

  function evaluationMeter(coach, me) {
    const text = String(coach && coach.evaluation || '');
    let white = 50;
    const numeric = Number(text.replace('\u2212', '-'));
    if (Number.isFinite(numeric)) white = 50 + (numeric / (Math.abs(numeric) + 4)) * 44;
    else if (/^(#-|[-−]M)/.test(text)) white = 4;
    else if (/^(#|M)/.test(text)) white = 96;
    white = Math.max(4, Math.min(96, white));
    // White belongs next to White's side of the board, not always the bottom.
    // Changing orientation changes placement only; the score is always White's.
    const whiteAtTop = Number(me) === 1;
    const top = (whiteAtTop ? 0 : 100 - white).toFixed(1);
    return '<div class="eval-rail" data-top-side="' + (whiteAtTop?'white':'black') + '" role="img" aria-label="Evaluation ' + text.replace(/[^0-9+.−M#-]/g,'') + '; White at ' + (whiteAtTop?'top':'bottom') + '"><svg viewBox="0 0 10 100" preserveAspectRatio="none" aria-hidden="true"><rect class="eval-rail-fill" x="0" y="' + top + '" width="10" height="' + white.toFixed(1) + '"></rect></svg></div>';
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
    if (played[0] >= 0 && played[1] >= 0 && (played[0] !== best[0] || played[1] !== best[1])) arrows.push(chessArrow(played[0], played[1], me, position.arrowGrade != null ? reviewCategory(position.arrowGrade).key : 'played', 'played'));
    if (best[0] >= 0 && best[1] >= 0) arrows.push(chessArrow(best[0], best[1], me, 'best', 'best'));
    return '<svg class="board-overlay" viewBox="0 0 100 100" aria-hidden="true">' + arrows.join('') + '</svg>';
  }

  function chessArrow(from, to, me, kind, role) {
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
    return '<g class="chess-arrow chess-arrow--' + kind + '" data-arrow-role="' + role + '"><path class="chess-arrow-shaft" d="' + path + '"/><path class="chess-arrow-head" d="' + head + '"/></g>';
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
          event.preventDefault(); suppressNextBoardClick = false;
          return;
        }
        selectSquare(Number(button.dataset.square));
      });
      button.addEventListener('pointerdown', (event) => {
        if (!event.isPrimary || event.button !== 0 || boardDrag) return;
        suppressNextBoardClick = false;
        const from = Number(button.dataset.square);
        if (overlay || movePending || !boardContext()?.yourTurn || !canSelectFrom(from)) return;
        boardDrag = {from,button,board,key:boardPositionKey(),pointer:event.pointerId,x:event.clientX,y:event.clientY,
          previous:selectedSquare,active:false,ghost:null,drop:null};
        button.setPointerCapture(event.pointerId);
      });
      button.addEventListener('pointermove', (event) => {
        const d=boardDrag;
        if(!d || d.pointer!==event.pointerId)return;
        if(!d.active && Math.hypot(event.clientX-d.x,event.clientY-d.y)<6)return;
        if(!d.active){
          d.active=true; selectedSquare=d.from; prepareReviewExploration(); refreshBoardOnly();
          const piece=button.querySelector('.piece-svg'), size=button.getBoundingClientRect().width*1.18;
          d.size=size; d.lift=event.pointerType==='touch'?size*.38:0;
          d.ghost=document.createElement('div');d.ghost.className='drag-piece';d.ghost.setAttribute('aria-hidden','true');
          d.ghost.style.width=d.ghost.style.height=size+'px';d.ghost.appendChild(piece.cloneNode(true));
          document.body.appendChild(d.ghost);button.classList.add('square--drag-source');
        }
        event.preventDefault();
        d.ghost.style.transform=`translate3d(${event.clientX-d.size/2}px,${event.clientY-d.size/2-d.lift}px,0)`;
        const target=document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-square]');
        const legal=target && board.contains(target) && array(boardContext().position.moves).some(m=>Number(m[0])===d.from&&Number(m[1])===Number(target.dataset.square));
        d.drop?.classList.remove('square--drop');d.drop=legal?target:null;d.drop?.classList.add('square--drop');
      });
      button.addEventListener('pointerup', (event) => {
        const d=boardDrag;if(!d||d.pointer!==event.pointerId)return;
        const target=document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-square]');
        finishBoardDrag();
        if(d.active){
          suppressNextBoardClick = true;
          if(target && board.contains(target) && d.key===boardPositionKey())tryMove(d.from,Number(target.dataset.square));
          window.setTimeout(() => { suppressNextBoardClick = false; }, 350);
        }
      });
      button.addEventListener('pointercancel', cancelBoardDrag);
      button.addEventListener('lostpointercapture', cancelBoardDrag);
    });
  }

  function finishBoardDrag() {
    const d=boardDrag;if(!d)return;boardDrag=null;
    d.ghost?.remove();d.button.classList.remove('square--drag-source');d.drop?.classList.remove('square--drop');
    if(d.button.hasPointerCapture(d.pointer))d.button.releasePointerCapture(d.pointer);
    return d;
  }
  function cancelBoardDrag() {
    const d=finishBoardDrag();if(!d)return;
    selectedSquare=d.previous!=null&&canSelectFrom(d.previous)?d.previous:null;
    refreshBoardOnly();
  }
  window.addEventListener('blur',cancelBoardDrag);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)cancelBoardDrag();});

  function canSelectFrom(square) {
    const context = boardContext();
    const position = context && object(context.position, {});
    return position && array(position.moves).some((move) => Number(move[0]) === square);
  }

  function prepareReviewExploration() {
    if(model.screen!=='review'||model.review.variation)return;
    model.review.variation=true;
    main.querySelector('.board-overlay')?.replaceChildren();
    reviewCommand('explore');
  }

  function selectSquare(square) {
    if (movePending || !boardContext() || !boardContext().yourTurn) return;
    if (selectedSquare == null) {
      if (canSelectFrom(square)) {
        prepareReviewExploration();
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
    if (['review','puzzle'].includes(model.screen) && Math.abs(Number(position.b[from])) === 1 && (to < 8 || to >= 56)) {
      selectedSquare = null;
      overlay = {kind:'analysis-promotion',from,to,screen:model.screen,token:boardContext().token,positionSeq:position.seq,index:boardContext().index}; openSheet('promotion');
      sheetScroll.innerHTML = '<div class="sheet-heading"><h2 id="sheet-title" class="sheet-title">Choose your promotion</h2><button class="icon-button" type="button" data-sheet-close aria-label="Cancel">' + icon('close') + '</button></div><div class="choice-grid choice-grid--two">' + [[5,'Queen'],[4,'Rook'],[3,'Bishop'],[2,'Knight']].map(([piece,name])=>'<button class="choice" type="button" data-analysis-promotion="'+piece+'">'+name+'</button>').join('') + '</div>';
      refreshBoardOnly(); return true;
    }
    selectedSquare = null;
    movePending = true;
    if (model.screen === 'puzzle') puzzleCommand('move', {from, to});
    else if (model.screen === 'review') reviewCommand('try', {from, to});
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
      button.classList.toggle('square--coach-source', square===Number(position.bestFrom)&&Number(position.bestTo??-1)<0);
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
    return '<div class="setup-content"><div class="sheet-heading"><div><p class="eyebrow">' + (bot ? 'Offline bot' : remote ? 'Private room' : 'One device') + '</p><h2 id="sheet-title" class="sheet-title">' +
      (bot ? 'Set up your game' : remote ? (remoteHosting ? 'Invite a friend' : 'Suggest a game') : 'Pass & play') + '</h2><p class="sheet-subtitle">' +
      (bot ? 'Choose a time and opponent. Hints make this a Practice game.' : remote ? 'Choose a clock. This sheet stays put while you decide.' : 'Hand the phone over after every move.') + '</p></div><button class="icon-button" type="button" data-sheet-close aria-label="Close">' + icon('close') + '</button></div>' +
      '<section class="sheet-section"><p class="sheet-label">Time control</p><div class="choice-grid" data-choice-group="clock">' +
      clockNames.map((name, index) => choiceButton('clock', index, name, index === 4 ? 'No clock' : name.replace(' | ', ' min + '), overlay.clock === index)).join('') + '</div></section>' +
      (bot ? '<section class="sheet-section"><p class="sheet-label">Opponent</p><div class="choice-grid" data-choice-group="level">' +
        strengthNames.map((name, index) => choiceButton('level', index, name, index === 0 ? 'Estimated 600' : index === 1 ? 'Estimated 1200' : 'Estimated 1800', overlay.level === index)).join('') +
        '</div></section>' : '') +
      '</div><div class="sheet-footer"><button class="button button--quiet" type="button" data-sheet-close>Cancel</button><button class="button button--primary" type="button" data-setup-start>' +
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
      '<div class="online-note"><span aria-hidden="true">⌁</span><span>Bluetooth works in airplane mode after Android pairing and permission. Both players need Knightline.</span></div>' +
      '<div class="sheet-footer"><button class="button button--quiet" type="button" data-sheet-close>Done</button></div>';
  }

  let onlineTab = 'host';
  let hostRoomCode = '';

  function generateRoomCode() {
    const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const digits = '23456789';
    let res = '';
    for (let i = 0; i < 4; i++) res += letters[Math.floor(Math.random() * letters.length)];
    for (let i = 0; i < 2; i++) res += digits[Math.floor(Math.random() * digits.length)];
    return res;
  }

  function openOnlineMenu(tab) {
    if (tab) onlineTab = tab;
    if (!hostRoomCode) hostRoomCode = generateRoomCode();
    overlay = {kind: 'online-menu', tab: onlineTab, code: hostRoomCode};
    openSheet('room');
    renderOnlineMenuContent();
  }

  function renderOnlineMenuContent() {
    sheetScroll.innerHTML =
      '<div class="sheet-heading"><div>' +
      '<p class="eyebrow">Private online room</p>' +
      '<h2 id="sheet-title" class="sheet-title">Play with a friend</h2>' +
      '<p class="sheet-subtitle">Direct peer-to-peer chess. Works across Wi-Fi or mobile data without accounts.</p></div>' +
      '<button class="icon-button" type="button" data-sheet-close aria-label="Close">' + icon('close') + '</button></div>' +
      '<nav class="sheet-tabs" role="tablist" aria-label="Online options">' +
      '<button type="button" role="tab" data-online-tab="host" aria-selected="' + (onlineTab === 'host') + '">Host a game</button>' +
      '<button type="button" role="tab" data-online-tab="join" aria-selected="' + (onlineTab === 'join') + '">Join a friend</button>' +
      '</nav>' +
      (onlineTab === 'host' ? renderHostTab() : renderJoinTab()) +
      '<div class="online-note"><span aria-hidden="true">◌</span><span>Private and encrypted peer-to-peer connection.</span></div>';
  }

  function renderHostTab() {
    return '<section class="sheet-section">' +
      '<p class="sheet-label">Your room code</p>' +
      '<div class="room-code-badge">' +
      '<span class="room-code-value" id="generated-code-display">' + escape(hostRoomCode) + '</span>' +
      '<div class="room-code-tools">' +
      '<button class="button button--compact" type="button" data-online-action="randomize" aria-label="Generate new code">🎲 New</button>' +
      '<button class="button button--compact" type="button" data-online-action="copy" aria-label="Copy code">📋 Copy</button>' +
      '</div></div>' +
      '<input type="hidden" id="room-code" value="' + escape(hostRoomCode) + '">' +
      '<p class="sheet-help">Give this code to your friend to enter on their device.</p>' +
      '<button class="button button--primary button--wide" type="button" data-online="host">Create room & wait for friend</button>' +
      '</section>';
  }

  function renderJoinTab() {
    return '<section class="sheet-section">' +
      '<label class="sheet-label" for="room-code">Enter your friend\'s code</label>' +
      '<div class="room-join-row">' +
      '<input id="room-code" class="input room-code-input" maxlength="8" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="E.g. ' + escape(hostRoomCode || 'KNIGHT') + '" autofocus>' +
      '<button class="button button--compact" type="button" data-online-action="paste">Paste</button>' +
      '</div>' +
      '<p class="sheet-help">Type the code shown on your friend\'s screen.</p>' +
      '<button class="button button--primary button--wide" type="button" data-online="join">Join room</button>' +
      '</section>';
  }

  function showNativeOverlay(payload) {
    const kind = payload.kind || 'information';
    const parent = pendingSheetReturn; pendingSheetReturn = null;
    if (kind === 'nearby') {
      overlay = {kind: 'nearby', parent};
      openSheet('room');
      updateNearbySheet();
      return;
    }
    // Chat/nearby updates retain their existing parent and do not reset scrolling.
    const same = overlay?.kind === kind, previous = overlay;
    const scroll = same ? sheetScroll.scrollTop : 0;
    overlay = {kind: kind, payload: payload, parent: parent || (same ? previous.parent : null)};
    openSheet(kind === 'moves' ? 'moves' : 'room');
    if (kind === 'menu') sheetScroll.innerHTML = menuMarkup(payload);
    else if (kind === 'moves') sheetScroll.innerHTML = movesMarkup(payload);
    else if (kind === 'chat') sheetScroll.innerHTML = chatMarkup(payload);
    else sheetScroll.innerHTML = informationMarkup(payload);
    sheetScroll.scrollTop = scroll;
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
      '<section class="sheet-section"><button class="choice choice-row" type="button" data-action="feedback-settings"><span class="choice-row-icon">' + icon('settings') + '</span><span class="choice-row-copy"><span class="choice-main">Sound & vibration</span><span class="choice-detail">Adjust feedback without leaving your board</span></span><span aria-hidden="true">›</span></button>' + choices.map((choice) => '<button class="choice choice-row" type="button" data-native-action="' + escape(choice.id) +
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
    const parent = pendingSheetReturn || captureSheet(); pendingSheetReturn = null;
    overlay = {kind: 'confirm', token: payload.token || '', parent};
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
    cancelBoardDrag();
    clearTimeout(closingSheetTimer);
    const active = document.activeElement;
    if (active && active !== document.body && !sheet.contains(active)) overlayReturnFocus = active;
    sheet.dataset.sheetKind = kind || 'room';
    sheet.dataset.open = 'true';
    sheet.setAttribute('aria-hidden', 'false');
    sheetScroll.scrollTop = 0;
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

  function captureSheet() {
    return overlay ? {state: overlay, kind: sheet.dataset.sheetKind, html: sheetScroll.innerHTML, scroll: sheetScroll.scrollTop,
      contentScroll: sheetScroll.querySelector('.setup-content')?.scrollTop || 0,
      inputs: Array.from(sheetScroll.querySelectorAll('input,textarea'),e=>e.value)} : null;
  }

  function overlayAction(type, payload, needsSession) {
    // Keep the same sheet open across the bridge round-trip. A confirmation is
    // a child of the setup/menu, not a new flow that discards the user's choices.
    pendingSheetReturn = captureSheet();
    send(type, payload || {}, needsSession);
  }

  function dismissOverlay() {
    if (!overlay) return;
    const current = overlay;
    pendingSheetReturn = null;
    if (current.kind === 'confirm') send('confirm.cancel', {token:current.token}, false);
    if (current.parent) {
      overlay = current.parent.state;
      openSheet(current.parent.kind);
      sheetScroll.innerHTML = current.parent.html;
      sheetScroll.querySelectorAll('input,textarea').forEach((e,i)=>{e.value=current.parent.inputs[i] || '';});
      sheetScroll.scrollTop = current.parent.scroll;
      const options = sheetScroll.querySelector('.setup-content'); if(options) options.scrollTop = current.parent.contentScroll;
    } else closeOverlay();
  }

  function feedbackMarkup() {
    return ['sound','vibration'].map(key => '<button class="setting-toggle" type="button" role="switch" aria-checked="'+!!model.settings[key]+'" data-feedback="'+key+'"><span><strong>'+(key==='sound'?'Wooden board sounds':'Board vibration')+'</strong><small>'+(key==='sound'?'Natural placements and captures · media volume':'Game feedback, independent of touch settings')+'</small></span><span class="switch-track" aria-hidden="true"><i></i></span></button>').join('') +
      '<p class="tiny" data-vibration-status>'+escape(model.settings.vibrationStatus || '')+'</p><div class="hero-actions"><button class="button button--compact" type="button" data-action="feedback-preview">Try a move</button><button class="button button--compact" type="button" data-action="feedback-capture">Try a capture</button></div>';
  }

  function openFeedback() {
    const parent = captureSheet();
    overlay = {kind:'feedback', parent}; openSheet('room');
    sheetScroll.innerHTML = '<div class="sheet-heading"><h2 id="sheet-title" class="sheet-title">Sound & vibration</h2><button class="icon-button" type="button" data-sheet-close aria-label="Back to game menu">'+icon('back')+'</button></div>'+feedbackMarkup();
  }

  function patchFeedback() {
    sheetScroll.querySelectorAll('[data-feedback]').forEach(e=>e.setAttribute('aria-checked', String(!!model.settings[e.dataset.feedback])));
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
      else if (value === 'nav-openings') { learnSection = 'openings'; go('learn'); }
      else if (value === 'nav-profile') go('profile');
      else if (value === 'nav-history') go('history');
      else if (value === 'feedback-preview' || value === 'feedback-capture') send('settings.preview', {cue:value==='feedback-capture'?'capture':'move'}, false);
      else if (value === 'feedback-settings') openFeedback();
      else if (value === 'setup-bot') openSetup('bot');
      else if (value === 'setup-pass') openSetup('pass');
      else if (value === 'transport-menu') openTransportMenu();
      else if (value === 'online-menu') openOnlineMenu();
      else if (value === 'remote-setup') openSetup('remote');
      else if (value === 'resume') { showReviewOverview = !!model.match && model.match.winner >= 0; send('match.resume'); }
      else if (value === 'coach') send('coach.advance');
      else if (value === 'coach-details') openReading(model.match.coach.heading || 'Position coach', model.match.coach.copy+(model.match.endgame?'\n\n'+model.match.endgame.method:''));
      else if (value === 'takeback') send('match.takeback');
      else if (value === 'moves') send('match.openMoves');
      else if (value === 'game-menu') send('match.openMenu');
      else if (value === 'rematch') send('match.rematch');
      else if (value === 'review-open') { showReviewOverview = true; send('review.open'); }
      else if (value === 'review-back' || value === 'game-back') send('nav.back', {}, false);
      else if (value === 'review-prev') send('review.previous');
      else if (value === 'review-next') send('review.next');
      else if (value === 'review-overview') openReviewOverview();
      else if (value === 'review-key') nextKeyMove();
      else if (value === 'review-best') send('review.best');
      else if (value === 'review-evaluate') send('review.evaluate');
      else if (value === 'review-undo') reviewCommand('undo');
      else if (value === 'review-reset') send('review.reset');
      else if (value === 'review-explore') reviewCommand('explore');
      else if (value === 'review-start-guided') { closeOverlay(); send('review.jump', {index:keyMoves()[0]?.index || 1}); }
      else if (value === 'review-details') openReading(model.review.variation ? 'Your analysis line' : model.review.verdict || 'Position details', model.review.variation ? model.review.variationLine + '\n\nMove either side in turn. Evaluation is always from White’s perspective: positive favors White; negative favors Black. Your saved game and rating are unchanged.' : (model.review.report || 'Saved moves are being analyzed. You can move either side and see a fresh position evaluation now.') + '\n\nPosition evaluation: positive favors White; negative favors Black. Move-report comparison scores are labeled for their player.');
      else if (value === 'review-list') openReading('Move navigator', 'Choose any move to inspect it.', '<div class="move-navigator">' + array(model.review.timeline).map((m) => '<button class="choice" type="button" data-review-jump="' + m.index + '"><span class="tiny">' + escape(m.player) + '</span><strong>' + reviewMovePrefix(m) + ' ' + escape(m.notation) + '</strong><span class="tiny">' + escape(m.verdict || 'Unscored') + '</span></button>').join('') + '</div>');
      else if (value === 'engine-info') send('engine.info', {}, false);
      else if (value.startsWith('puzzle-')) puzzleCommand(value.substring(7));
      return;
    }

    const navButton = event.target.closest('[data-nav]');
    if (navButton) {
      go(navButton.dataset.nav);
      return;
    }
    const savedGame = event.target.closest('[data-archive-id]');
    if (savedGame) { showReviewOverview = true; send('archive.open', {id:savedGame.dataset.archiveId}, false); return; }
    const feedbackToggle = event.target.closest('[data-feedback]');
    if (feedbackToggle) {
      const key = feedbackToggle.dataset.feedback;
      send('settings.feedback', {key,enabled:!model.settings[key]}, false); return;
    }
    const analysisPromotion = event.target.closest('[data-analysis-promotion]');
    if (analysisPromotion && overlay?.kind === 'analysis-promotion') {
      const {from,to,screen,token,positionSeq,index} = overlay;
      closeOverlay(); movePending = true;
      send(screen === 'review' ? 'review.try' : 'puzzle.move', {from,to,promotion:Number(analysisPromotion.dataset.analysisPromotion),index,token,positionSeq},screen === 'review');
      refreshBoardOnly(); return;
    }
    const filter = event.target.closest('[data-review-filter]');
    if(filter) { reviewFilter = filter.dataset.reviewFilter; const scroll = sheetScroll.scrollTop; sheetScroll.innerHTML = reviewOverviewMarkup(); sheetScroll.scrollTop = scroll; return; }
    const collection = event.target.closest('[data-puzzle-filter]');
    const category = event.target.closest('[data-learn-section]');
    if (category) { learnSection = category.dataset.learnSection; render(); return; }
    if(collection) { puzzleFilter = collection.dataset.puzzleFilter; puzzlePage=0; renderLearn(); main.querySelector('.puzzle-library')?.scrollIntoView({block:'start'}); return; }
    const puzzlePagination = event.target.closest('[data-puzzle-page]');
    if(puzzlePagination) { puzzlePage += Number(puzzlePagination.dataset.puzzlePage); renderLearn(); main.querySelector('.puzzle-library')?.scrollIntoView({block:'start'}); return; }
    const lesson = event.target.closest('[data-lesson]');
    if (lesson) {
      openLesson(array(model.lessons.items).find(l=>l.id===Number(lesson.dataset.lesson)));
      return;
    }
    const endgame=event.target.closest('[data-endgame]');
    if(endgame){openLesson(array(model.lessons.endgames).find(l=>l.id===Number(endgame.dataset.endgame)),true);return;}
    const lessonSide=event.target.closest('[data-lesson-side]');
    if(lessonSide && overlay?.kind==='lesson'){
      overlay.side=Number(lessonSide.dataset.lessonSide);
      if(!overlay.endgame)sheet.querySelector('[data-lesson-intro]').textContent=overlay.side===1?overlay.lesson.introBlack:overlay.lesson.intro;
      sheet.querySelectorAll('[data-lesson-side]').forEach(e=>e.setAttribute('aria-pressed',String(Number(e.dataset.lessonSide)===overlay.side)));
      sheet.querySelector('[data-lesson-start]').textContent='Start as '+(overlay.side===0?'White':'Black');return;
    }
    const endgameStage=event.target.closest('[data-endgame-stage]');
    if(endgameStage && overlay?.kind==='lesson'){
      overlay.pattern=endgameStage.dataset.endgameStage==='pattern';
      sheet.querySelectorAll('[data-endgame-stage]').forEach(e=>e.setAttribute('aria-pressed',String((e.dataset.endgameStage==='pattern')===overlay.pattern)));return;
    }
    if(event.target.closest('[data-lesson-start]') && overlay?.kind==='lesson'){
      const {lesson,side,endgame,pattern}=overlay;overlayAction(endgame?'learn.endgame':'learn.start',{lesson:lesson.id,side,pattern},false);return;
    }
    const puzzle = event.target.closest('[data-puzzle]');
    if (puzzle) { send('puzzle.start', {index: Number(puzzle.dataset.puzzle),collection:puzzleFilter}, false); return; }
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
      overlayAction(type, payload, false);
      return;
    }
    const transportButton = event.target.closest('[data-transport]');
    if (transportButton) {
      const type = transportButton.dataset.transport;
      if (type === 'host') { pendingSheetReturn = captureSheet(); closeOverlay(); send('transport.host', {}, false); }
      else if (type === 'join') { overlayAction('transport.join', {}, false); }
      else if (type === 'scan') send('transport.scan', {}, false);
      else if (type === 'settings') send('transport.settings', {}, false);
      return;
    }
    const device = event.target.closest('[data-device-index]');
    if (device) {
      send('transport.connect', {index: Number(device.dataset.deviceIndex)}, false);
      return;
    }
    const onlineTabBtn = event.target.closest('[data-online-tab]');
    if (onlineTabBtn) {
      onlineTab = onlineTabBtn.dataset.onlineTab;
      renderOnlineMenuContent();
      return;
    }
    const onlineAction = event.target.closest('[data-online-action]');
    if (onlineAction) {
      const act = onlineAction.dataset.onlineAction;
      if (act === 'randomize') {
        hostRoomCode = generateRoomCode();
        renderOnlineMenuContent();
      } else if (act === 'copy') {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(hostRoomCode).catch(() => {});
        }
        toast('Room code ' + hostRoomCode + ' copied!');
      } else if (act === 'paste') {
        if (navigator.clipboard && navigator.clipboard.readText) {
          navigator.clipboard.readText().then((text) => {
            const clean = text.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
            const input = document.getElementById('room-code');
            if (input && clean) {
              input.value = clean;
              input.dispatchEvent(new Event('input', {bubbles: true}));
            }
          }).catch(() => {});
        }
      }
      return;
    }
    const online = event.target.closest('[data-online]');
    if (online) {
      const input = document.getElementById('room-code');
      let code = input ? input.value : '';
      if (!code && online.dataset.online === 'host') {
        code = hostRoomCode;
      }
      const type = online.dataset.online === 'host' ? 'online.host' : 'online.join';
      if (code.replace(/[^a-z0-9]/gi,'').length < 4) { toast('Use a room code with 4 to 8 letters or numbers.', true); input?.focus(); return; }
      pendingSheetReturn = captureSheet();
      closeOverlay();
      send(type, {code: code}, false);
      return;
    }
    const nativeAction = event.target.closest('[data-native-action]');
    if (nativeAction) {
      const type = nativeAction.dataset.nativeAction;
      if (['match.resign','match.clear','engine.info','chat.open'].includes(type)) overlayAction(type);
      else { closeOverlay(); send(type); }
      return;
    }
    const confirmation = event.target.closest('[data-confirm]');
    if (confirmation) {
      if (confirmation.dataset.confirm === 'cancel') { dismissOverlay(); return; }
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
      dismissOverlay();
    }
  });

  backdrop.addEventListener('click', () => {
    if (overlay && overlay.kind !== 'confirm' && overlay.kind !== 'promotion') dismissOverlay();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && event.target && event.target.id === 'chat-text') {
      event.preventDefault();
      const sendButton = sheet.querySelector('[data-chat-send]:not([disabled])');
      if (sendButton) sendButton.click();
      return;
    }
    if (!overlay) return;
    if (event.key === 'Escape' && overlay.kind !== 'promotion') {
      event.preventDefault();
      dismissOverlay();
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

  app.inert = true;
  app.setAttribute('aria-busy', 'true');
  render();
})();
