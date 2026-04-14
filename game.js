// ─── Casino La Marash – Blackjack Engine ───────────────────────
'use strict';

// ── Deck ────────────────────────────────────────────────────────
const SUITS    = ['♠','♥','♦','♣'];
const RANKS    = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const RED_SUITS = new Set(['♥','♦']);

function buildDeck(numDecks = 6) {
  const deck = [];
  for (let d = 0; d < numDecks; d++)
    for (const s of SUITS)
      for (const r of RANKS)
        deck.push({ rank: r, suit: s });
  return deck;
}

function shuffle(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function cardValue(rank) {
  if (['J','Q','K'].includes(rank)) return 10;
  if (rank === 'A') return 11;
  return parseInt(rank, 10);
}

function handTotal(cards) {
  let total = 0, aces = 0;
  for (const c of cards) {
    total += cardValue(c.rank);
    if (c.rank === 'A') aces++;
  }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
}

// Returns a display string for the score badge.
// If the hand has a "soft" ace (counted as 11 but could be 1),
// shows both values: e.g. "7/17". Otherwise just the best total.
function scoreDisplay(cards) {
  let total = 0, aces = 0;
  for (const c of cards) {
    total += cardValue(c.rank);
    if (c.rank === 'A') aces++;
  }
  // hard total after reducing aces
  let hard = total;
  while (hard > 21 && aces > 0) { hard -= 10; aces--; }

  // If there are still aces counted as 11 (soft hand) and
  // the soft value is <= 21, show "low/high"
  if (aces > 0 && hard <= 21 && hard !== (hard - 10)) {
    const low = hard - 10; // ace as 1 instead of 11
    if (low !== hard && low > 0) return `${low}/${hard}`;
  }
  return `${hard}`;
}

function isBust(cards)       { return handTotal(cards) > 21; }
function isBlackjack(cards)  { return cards.length === 2 && handTotal(cards) === 21; }
function is21(cards)         { return handTotal(cards) === 21; }

// ── State ────────────────────────────────────────────────────────
const DEALER_MESSAGES = {
  greet:     ["Place your bets!", "Good luck!", "Las cartas están listas.", "Shuffle up and deal!"],
  deal:      ["Cards are dealt.", "Here we go!", "Let's play!", "Good hand?"],
  hit:       ["Another card?", "Brave choice!", "Here you go.", "Let's see…"],
  bust:      ["Bust! Sorry.", "Over 21!", "Too many.", "Ouch!"],
  stand:     ["Standing pat.", "Wise.", "Dealer's turn.", "Let me play now."],
  blackjack: ["Blackjack! Magnifico!", "21! Automatic!", "Perfect hand!", "¡Blackjack!"],
  win:       ["Lucky player!", "Congratulations!", "Well played!", "Winner!"],
  lose:      ["Dealer wins.", "Better luck!", "House wins.", "Close one!"],
  push:      ["Push. Tie.", "Even money.", "Same score, same hand.", "We tie!"],
  dealerBJ:  ["Blackjack! House wins.", "21 for the house!", "¡Blackjack!"],
  next:      ["Place your bets!", "Next hand!", "Ready?", "Here we go again!"],
};

function rnd(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

let state = {
  deck:          [],
  players:       [],   // { name, bank, bet, hand, status, outcome }
  dealer:        { hand: [], hiddenCard: null },
  currentIdx:    0,
  phase:         'betting',  // betting | playing | dealerTurn | result
  // Multiplayer fields (persist across hands):
  numPlayers:    1,
  setupNames:    ['Player'],
  setupBanks:    [1000],
  bets:          [0],
  currentBetIdx: 0,
};

// ── DOM refs ─────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const dealerHandEl  = $('dealer-hand');
const dealerScoreEl = $('dealer-score');
const dealerMsgEl   = $('dealer-msg');
const playersZone   = $('players-zone');
const betPanel      = $('bet-panel');
const actionPanel   = $('action-panel');
const resultPanel   = $('result-panel');
const resultMsg     = $('result-msg');
const betAmount     = $('bet-amount');
const bankAmount    = $('bank-amount');

// ── Card rendering ───────────────────────────────────────────────
function cardHTML(card, hidden = false, animate = false) {
  const el = document.createElement('div');
  el.className = 'card' +
    (hidden ? ' hidden' : (RED_SUITS.has(card.suit) ? ' red' : ' black')) +
    (animate ? ' dealing' : '');

  if (!hidden) {
    el.innerHTML = `
      <div class="corner-top"><span class="rank">${card.rank}</span><span class="suit">${card.suit}</span></div>
      <div class="center-suit">${card.suit}</div>
      <div class="corner-bot"><span class="rank">${card.rank}</span><span class="suit">${card.suit}</span></div>
    `;
  }
  return el;
}

function revealDealerCard() {
  const hidden = dealerHandEl.querySelector('.card.hidden');
  if (!hidden) return;
  const card = state.dealer.hiddenCard;
  const revealed = cardHTML(card, false, false);
  hidden.replaceWith(revealed);
}

function renderDealerHand(revealAll = false) {
  dealerHandEl.innerHTML = '';
  state.dealer.hand.forEach((card, i) => {
    const hide = !revealAll && i === 1;
    dealerHandEl.appendChild(cardHTML(card, hide, false));
  });
  dealerScoreEl.textContent = revealAll
    ? scoreDisplay(state.dealer.hand)
    : cardValue(state.dealer.hand[0].rank);
  dealerScoreEl.className = 'score-badge';
  if (revealAll && isBust(state.dealer.hand))     dealerScoreEl.classList.add('bust');
  if (revealAll && isBlackjack(state.dealer.hand)) dealerScoreEl.classList.add('blackjack');
}

function renderPlayerSeat(player, idx) {
  let seat = $(`seat-${idx}`);
  const isActive = idx === state.currentIdx && state.phase === 'playing';

  if (!seat) {
    seat = document.createElement('div');
    seat.id = `seat-${idx}`;
    seat.className = 'player-seat';
    playersZone.appendChild(seat);
  }

  seat.className = 'player-seat' + (isActive ? ' active' : '');
  const score = handTotal(player.hand);

  seat.innerHTML = `
    <div class="player-name">${player.name}</div>
    <div class="player-bet-label">Bet: $${player.bet}</div>
    <div class="score-badge ${score > 21 ? 'bust' : (score === 21 ? 'blackjack' : '')}" id="score-${idx}">${scoreDisplay(player.hand)}</div>
  `;

  const handEl = document.createElement('div');
  handEl.className = 'hand';
  player.hand.forEach(c => handEl.appendChild(cardHTML(c, false, false)));
  seat.appendChild(handEl);
}

function refreshAllSeats() {
  state.players.forEach((p, i) => renderPlayerSeat(p, i));
}

// ── Dealer speech ─────────────────────────────────────────────────
let speechTimeout;
function speak(key) {
  clearTimeout(speechTimeout);
  dealerMsgEl.textContent = `"${rnd(DEALER_MESSAGES[key])}"`;
  speechTimeout = setTimeout(() => { dealerMsgEl.textContent = ''; }, 3500);
}

// ── Game logic ────────────────────────────────────────────────────
function initDeck() {
  state.deck = shuffle(buildDeck(6));
}

function drawCard() {
  if (state.deck.length < 52) initDeck();
  return state.deck.pop();
}

function showPanel(name) {
  betPanel.classList.add('hidden');
  actionPanel.classList.add('hidden');
  resultPanel.classList.add('hidden');
  if (name) $(`${name}-panel`).classList.remove('hidden');
}

function updateBankForCurrent() {
  const idx  = state.phase === 'playing' ? state.currentIdx : state.currentBetIdx;
  const name = state.phase === 'playing'
    ? (state.players[idx] ? state.players[idx].name : state.setupNames[idx])
    : state.setupNames[idx];
  const bank = state.setupBanks[idx] != null ? state.setupBanks[idx] : 0;
  $('bank-player-label').textContent = `${name}:`;
  bankAmount.textContent = `$${bank.toLocaleString()}`;
}

// ── Setup helpers ─────────────────────────────────────────────────
function renderNameInputs(n) {
  const section = $('player-names-section');
  section.innerHTML = '';
  for (let i = 0; i < n; i++) {
    const row = document.createElement('div');
    row.className = 'name-input-row';
    row.innerHTML = `<label class="setup-label">Player ${i + 1}</label>
      <input class="name-input" type="text" maxlength="12"
             placeholder="Player ${i + 1}" data-idx="${i}">`;
    section.appendChild(row);
  }
}

// ── Betting phase ─────────────────────────────────────────────────
function startBettingPhase() {
  state.phase = 'betting';
  state.currentBetIdx = 0;
  showBetForPlayer(0);
}

function showBetForPlayer(idx) {
  state.currentBetIdx = idx;
  // Update bank bar to show this player's bank
  $('bank-player-label').textContent = `${state.setupNames[idx]}:`;
  bankAmount.textContent = `$${state.setupBanks[idx].toLocaleString()}`;
  // Show whose turn it is to bet
  const ind = $('betting-player-indicator');
  ind.textContent = `${state.setupNames[idx]}'s Bet`;
  ind.classList.remove('hidden');
  // Show this player's current staged bet
  betAmount.textContent = state.bets[idx] || 0;
  // Last player's button says "Deal", others say "Confirm"
  $('btn-deal').textContent = (idx === state.numPlayers - 1) ? 'Deal' : 'Confirm';
  showPanel('bet');
}

// ── Deal ──────────────────────────────────────────────────────────
function deal() {
  state.phase = 'playing';
  state.currentIdx = 0;

  // Build players array from staged bets, deduct bets from banks
  state.players = state.setupNames.map((name, i) => {
    state.setupBanks[i] -= state.bets[i];
    return {
      name,
      bank:   state.setupBanks[i],
      bet:    state.bets[i],
      hand:   [],
      status: 'playing',
      outcome: null,
    };
  });

  updateBankForCurrent();
  state.dealer.hand = [];
  playersZone.innerHTML = '';

  // Deal round-robin: p0→p1→…→pN-1→dealer→p0→p1→…→pN-1→dealer
  const dealOrder = [];
  for (let i = 0; i < state.players.length; i++) dealOrder.push(i);
  dealOrder.push('dealer');
  for (let i = 0; i < state.players.length; i++) dealOrder.push(i);
  dealOrder.push('dealer');

  let delay = 0;
  dealOrder.forEach((who, step) => {
    setTimeout(() => {
      const card = drawCard();
      if (who === 'dealer') {
        const hide = (step === dealOrder.length - 1); // last dealer card is hidden
        if (hide) state.dealer.hiddenCard = card;
        state.dealer.hand.push(card);
        renderDealerHand(false);
        const cards = dealerHandEl.querySelectorAll('.card');
        cards[cards.length - 1].classList.add('dealing');
        speak('deal');
      } else {
        state.players[who].hand.push(card);
        renderPlayerSeat(state.players[who], who);
        const seat = $(`seat-${who}`);
        if (seat) {
          const cards = seat.querySelectorAll('.card');
          cards[cards.length - 1].classList.add('dealing');
        }
      }
    }, delay);
    delay += 350;
  });

  setTimeout(() => checkForImmediateBlackjack(), delay + 200);
}

function checkForImmediateBlackjack() {
  const dealerBJ = isBlackjack(state.dealer.hand);
  let anyPlayerBJ = false;

  state.players.forEach((player, idx) => {
    if (isBlackjack(player.hand)) {
      anyPlayerBJ = true;
      speak('blackjack');
      highlightSeat21(idx);
      player.status = 'blackjack';
    }
  });

  if (anyPlayerBJ || dealerBJ) {
    revealDealerCard();
    renderDealerHand(true);
    speak(dealerBJ ? 'dealerBJ' : 'blackjack');
    setTimeout(() => resolveResults(), 1000);
    return;
  }

  // Auto-pass first active player if they have 21 without blackjack
  const first = state.players[0];
  if (is21(first.hand) && !isBlackjack(first.hand)) {
    autoPass21();
    return;
  }

  $('action-player-name').textContent = state.players[0].name;
  updateBankForCurrent();
  showPanel('action');
}

// ─── AUTO-PASS on 21 ─────────────────────────────────────────────
function highlightSeat21(idx) {
  const seat = $(`seat-${idx}`);
  if (seat) seat.classList.add('pulse21');
}

function autoPass21() {
  const player = state.players[state.currentIdx];
  speak('blackjack');
  highlightSeat21(state.currentIdx);
  player.status = 'stand';
  refreshAllSeats();
  setTimeout(() => advanceTurn(), 900);
}

// ── Hit ───────────────────────────────────────────────────────────
function hit() {
  const player = state.players[state.currentIdx];
  const card = drawCard();
  player.hand.push(card);
  speak('hit');

  renderPlayerSeat(player, state.currentIdx);
  const seat = $(`seat-${state.currentIdx}`);
  if (seat) {
    const cards = seat.querySelectorAll('.card');
    cards[cards.length - 1].classList.add('dealing');
  }

  const total = handTotal(player.hand);

  if (total > 21) {
    player.status = 'bust';
    speak('bust');
    refreshAllSeats();
    setTimeout(() => advanceTurn(), 700);
    return;
  }

  // ── KEY RULE: If total reaches 21 after a hit, auto-pass ────────
  if (total === 21) {
    player.status = 'stand';
    autoPass21();
    return;
  }

  // Still playing
  refreshAllSeats();
}

// ── Stand ─────────────────────────────────────────────────────────
function stand() {
  const player = state.players[state.currentIdx];
  player.status = 'stand';
  speak('stand');
  refreshAllSeats();
  advanceTurn();
}

// ── Double Down ───────────────────────────────────────────────────
function doubleDown() {
  const player = state.players[state.currentIdx];
  if (state.setupBanks[state.currentIdx] < player.bet) return;
  state.setupBanks[state.currentIdx] -= player.bet;
  player.bank = state.setupBanks[state.currentIdx];
  player.bet *= 2;
  updateBankForCurrent();

  const card = drawCard();
  player.hand.push(card);

  renderPlayerSeat(player, state.currentIdx);
  const seat = $(`seat-${state.currentIdx}`);
  if (seat) {
    const cards = seat.querySelectorAll('.card');
    cards[cards.length - 1].classList.add('dealing');
  }

  const total = handTotal(player.hand);
  if (total > 21) {
    player.status = 'bust';
    speak('bust');
  } else if (total === 21) {
    player.status = 'stand';
    speak('blackjack');
    highlightSeat21(state.currentIdx);
  } else {
    player.status = 'stand';
    speak('stand');
  }

  refreshAllSeats();
  setTimeout(() => advanceTurn(), 700);
}

// ── Advance turn ──────────────────────────────────────────────────
function advanceTurn() {
  showPanel(null);
  state.currentIdx++;

  if (state.currentIdx >= state.players.length) {
    // All players done – dealer plays
    dealerTurn();
    return;
  }

  const next = state.players[state.currentIdx];
  refreshAllSeats();

  // Skip players who are already resolved
  if (next.status === 'bust' || next.status === 'stand' || next.status === 'blackjack') {
    advanceTurn();
    return;
  }

  // Auto-pass if next player already has 21
  if (is21(next.hand)) {
    autoPass21();
    return;
  }

  $('action-player-name').textContent = next.name;
  updateBankForCurrent();
  showPanel('action');
}

// ── Dealer turn ───────────────────────────────────────────────────
function dealerTurn() {
  state.phase = 'dealerTurn';
  revealDealerCard();
  renderDealerHand(true);

  const allBust = state.players.every(p => p.status === 'bust');

  if (allBust) {
    setTimeout(() => resolveResults(), 800);
    return;
  }

  // Dealer draws to 16, stands on 17
  function dealerDraw() {
    const total = handTotal(state.dealer.hand);
    if (total < 17) {
      setTimeout(() => {
        const card = drawCard();
        state.dealer.hand.push(card);
        renderDealerHand(true);
        const cards = dealerHandEl.querySelectorAll('.card');
        cards[cards.length - 1].classList.add('dealing');
        dealerDraw();
      }, 700);
    } else {
      setTimeout(() => resolveResults(), 600);
    }
  }
  dealerDraw();
}

// ── Resolve ───────────────────────────────────────────────────────
function resolveResults() {
  const dealerTotal = handTotal(state.dealer.hand);
  const dealerBust  = isBust(state.dealer.hand);
  const dealerBJ    = isBlackjack(state.dealer.hand);

  state.players.forEach((player, idx) => {
    const playerTotal = handTotal(player.hand);
    const playerBJ    = isBlackjack(player.hand) || player.status === 'blackjack';

    let outcome;
    if (player.status === 'bust') {
      outcome = 'lose';
    } else if (dealerBJ && playerBJ) {
      outcome = 'push';
    } else if (dealerBJ) {
      outcome = 'dealer_blackjack';
    } else if (playerBJ) {
      outcome = 'blackjack';
    } else if (dealerBust) {
      outcome = 'win';
    } else if (playerTotal > dealerTotal) {
      outcome = 'win';
    } else if (playerTotal < dealerTotal) {
      outcome = 'lose';
    } else {
      outcome = 'push';
    }

    player.outcome = outcome;

    // Apply payout to persistent bank
    let payout = 0;
    switch (outcome) {
      case 'blackjack':       payout = Math.floor(player.bet * 2.5); break;
      case 'push':            payout = player.bet; break;
      case 'win':             payout = player.bet * 2; break;
      default:                payout = 0;
    }
    state.setupBanks[idx] += payout;
    player.bank = state.setupBanks[idx];
  });

  endRound();
}

function endRound() {
  state.phase = 'result';
  showPanel('result');

  const lines = state.players.map(p => {
    switch (p.outcome) {
      case 'blackjack':
        return `${p.name}: ♛ BLACKJACK! +$${Math.floor(p.bet * 1.5)}`;
      case 'push':
        return `${p.name}: PUSH`;
      case 'win':
        return `${p.name}: WIN +$${p.bet}`;
      case 'lose':
      case 'dealer_blackjack':
      default:
        return `${p.name}: LOSE -$${p.bet}`;
    }
  });

  resultMsg.innerHTML = lines.join('<br>');

  const wins   = state.players.filter(p => ['win', 'blackjack'].includes(p.outcome)).length;
  const losses = state.players.filter(p => !['win', 'blackjack', 'push'].includes(p.outcome)).length;
  resultMsg.className = wins > losses ? 'result-win' : wins < losses ? 'result-lose' : 'result-push';

  speak(wins > losses ? 'win' : wins < losses ? 'lose' : 'push');
  refreshAllSeats();

  // Update bank bar to show Player 1's bank after round
  $('bank-player-label').textContent = `${state.setupNames[0]}:`;
  bankAmount.textContent = `$${state.setupBanks[0].toLocaleString()}`;
}

// ── Next hand ─────────────────────────────────────────────────────
function nextHand() {
  // Rebuy any broke players
  for (let i = 0; i < state.numPlayers; i++) {
    if (state.setupBanks[i] < 5) state.setupBanks[i] = 1000;
  }

  state.bets    = Array(state.numPlayers).fill(0);
  state.players = [];
  state.dealer  = { hand: [], hiddenCard: null };

  playersZone.innerHTML   = '';
  dealerHandEl.innerHTML  = '';
  dealerScoreEl.textContent = '0';
  dealerScoreEl.className   = 'score-badge';

  speak('next');
  startBettingPhase();
}

// ── Event listeners ───────────────────────────────────────────────
document.querySelectorAll('.chip-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const val = parseInt(btn.dataset.val, 10);
    const idx = state.currentBetIdx;
    if (state.setupBanks[idx] - (state.bets[idx] || 0) >= val) {
      state.bets[idx] = (state.bets[idx] || 0) + val;
      betAmount.textContent = state.bets[idx];
    }
  });
});

$('btn-clear-bet').addEventListener('click', () => {
  state.bets[state.currentBetIdx] = 0;
  betAmount.textContent = '0';
});

$('btn-deal').addEventListener('click', () => {
  const idx = state.currentBetIdx;
  const bet = state.bets[idx] || 0;
  if (bet < 1 || bet > state.setupBanks[idx]) return;

  const next = idx + 1;
  if (next < state.numPlayers) {
    state.bets[next] = state.bets[next] || 0;
    showBetForPlayer(next);
  } else {
    deal();
  }
});

$('btn-hit').addEventListener('click', hit);
$('btn-stand').addEventListener('click', stand);
$('btn-double').addEventListener('click', doubleDown);
$('btn-next').addEventListener('click', nextHand);

// ── Setup modal ───────────────────────────────────────────────────
document.querySelectorAll('.count-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.count-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderNameInputs(parseInt(btn.dataset.n, 10));
  });
});

$('btn-start-game').addEventListener('click', () => {
  const activeBtn = document.querySelector('.count-btn.active');
  const n = parseInt(activeBtn.dataset.n, 10);
  const inputs = document.querySelectorAll('.name-input');

  state.numPlayers  = n;
  state.setupNames  = Array.from({ length: n }, (_, i) =>
    (inputs[i] ? inputs[i].value.trim() : '') || `Player ${i + 1}`
  );
  state.setupBanks  = Array(n).fill(1000);
  state.bets        = Array(n).fill(0);
  state.currentBetIdx = 0;

  $('setup-modal').classList.add('hidden');
  speak('greet');
  startBettingPhase();
});

// ── Init ─────────────────────────────────────────────────────────
initDeck();
renderNameInputs(1);
updateBankForCurrent();
