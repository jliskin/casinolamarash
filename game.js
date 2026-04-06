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
  deck:       [],
  players:    [],   // { name, bank, bet, hand, status }
  dealer:     { hand: [], hiddenCard: null },
  currentIdx: 0,
  phase:      'betting',  // betting | playing | dealerTurn | result
  bank:       1000,
  bet:        0,
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
  const score = revealAll
    ? handTotal(state.dealer.hand)
    : cardValue(state.dealer.hand[0].rank);
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

function updateBank() {
  bankAmount.textContent = `$${state.bank.toLocaleString()}`;
}

// ── Deal ──────────────────────────────────────────────────────────
function deal() {
  if (state.bet < 1) { speak('greet'); return; }

  state.phase = 'playing';
  state.currentIdx = 0;

  // Setup players (single player for now – easily extendable)
  state.players = [{
    name:   'Player',
    bank:   state.bank,
    bet:    state.bet,
    hand:   [],
    status: 'playing',
  }];
  state.bank -= state.bet;
  updateBank();

  // Dealer hand
  state.dealer.hand = [];

  playersZone.innerHTML = '';

  // Deal two cards each
  const dealOrder = [0, 'dealer', 0, 'dealer'];
  let delay = 0;
  dealOrder.forEach((who, step) => {
    setTimeout(() => {
      const card = drawCard();
      if (who === 'dealer') {
        const hide = step === 3; // second dealer card is hidden
        if (hide) state.dealer.hiddenCard = card;
        state.dealer.hand.push(card);
        renderDealerHand(false);
        // animate last appended card
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

  setTimeout(() => {
    checkForImmediateBlackjack();
  }, delay + 200);
}

function checkForImmediateBlackjack() {
  const player = state.players[0];
  const dealerBJ = isBlackjack(state.dealer.hand);

  if (isBlackjack(player.hand)) {
    speak('blackjack');
    highlightSeat21(0);
    // Reveal dealer card now
    revealDealerCard();
    renderDealerHand(true);

    setTimeout(() => {
      if (dealerBJ) {
        endRound('push');
      } else {
        endRound('blackjack');
      }
    }, 1000);
    return;
  }

  if (dealerBJ) {
    revealDealerCard();
    renderDealerHand(true);
    speak('dealerBJ');
    setTimeout(() => endRound('dealer_blackjack'), 1000);
    return;
  }

  // Check if player has 21 without blackjack (shouldn't happen on first deal but safety)
  if (is21(player.hand) && !isBlackjack(player.hand)) {
    autoPass21();
    return;
  }

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
  // Short pause then move on
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
  if (state.bank < player.bet) return;
  state.bank -= player.bet;
  player.bet *= 2;
  updateBank();

  const card = drawCard();
  player.hand.push(card);

  const seat = $(`seat-${state.currentIdx}`);
  renderPlayerSeat(player, state.currentIdx);
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

  if (next.status === 'bust') {
    advanceTurn();
    return;
  }

  // Auto-pass if next player already has 21
  if (is21(next.hand)) {
    autoPass21();
    return;
  }

  showPanel('action');
}

// ── Dealer turn ───────────────────────────────────────────────────
function dealerTurn() {
  state.phase = 'dealerTurn';
  revealDealerCard();
  renderDealerHand(true);

  const allBust = state.players.every(p => p.status === 'bust');

  if (allBust) {
    setTimeout(() => endRound('dealer_wins_all_bust'), 800);
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
  const player      = state.players[0];
  const playerTotal = handTotal(player.hand);

  let outcome;

  if (player.status === 'bust') {
    outcome = 'lose';
  } else if (dealerBust) {
    outcome = 'win';
  } else if (playerTotal > dealerTotal) {
    outcome = 'win';
  } else if (playerTotal < dealerTotal) {
    outcome = 'lose';
  } else {
    outcome = 'push';
  }

  endRound(outcome);
}

function endRound(outcome) {
  state.phase = 'result';
  showPanel('result');

  const player = state.players[0];
  let msg = '', cls = '', payout = 0;

  switch (outcome) {
    case 'blackjack':
      payout = Math.floor(player.bet * 2.5); // 3:2 pays 2.5×
      msg = `♛ BLACKJACK! +$${payout - player.bet}`;
      cls = 'result-bj';
      speak('blackjack');
      break;
    case 'push':
      payout = player.bet;
      msg = `PUSH – Bet Returned`;
      cls = 'result-push';
      speak('push');
      break;
    case 'win':
      payout = player.bet * 2;
      msg = `YOU WIN! +$${player.bet}`;
      cls = 'result-win';
      speak('win');
      break;
    case 'lose':
    case 'dealer_wins_all_bust':
      payout = 0;
      msg = `DEALER WINS. -$${player.bet}`;
      cls = 'result-lose';
      speak('lose');
      break;
    case 'dealer_blackjack':
      payout = 0;
      msg = `DEALER BLACKJACK. -$${player.bet}`;
      cls = 'result-lose';
      speak('lose');
      break;
    default:
      payout = 0;
      msg = 'DEALER WINS.';
      cls = 'result-lose';
  }

  state.bank += payout;
  updateBank();

  resultMsg.className = cls;
  resultMsg.textContent = msg;
}

// ── Next hand ─────────────────────────────────────────────────────
function nextHand() {
  state.phase   = 'betting';
  state.bet     = 0;
  betAmount.textContent = '0';
  state.players = [];
  state.dealer  = { hand: [], hiddenCard: null };
  playersZone.innerHTML = '';
  dealerHandEl.innerHTML = '';
  dealerScoreEl.textContent = '0';
  dealerScoreEl.className = 'score-badge';

  if (state.bank < 5) {
    state.bank = 1000;
    updateBank();
  }

  showPanel('bet');
  speak('next');
}

// ── Event listeners ───────────────────────────────────────────────
document.querySelectorAll('.chip-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const val = parseInt(btn.dataset.val, 10);
    if (state.bank - state.bet >= val) {
      state.bet += val;
      betAmount.textContent = state.bet;
    }
  });
});

$('btn-clear-bet').addEventListener('click', () => {
  state.bet = 0;
  betAmount.textContent = '0';
});

$('btn-deal').addEventListener('click', () => {
  if (state.bet > 0 && state.bet <= state.bank) deal();
});

$('btn-hit').addEventListener('click', hit);
$('btn-stand').addEventListener('click', stand);
$('btn-double').addEventListener('click', doubleDown);
$('btn-next').addEventListener('click', nextHand);

// ── Init ─────────────────────────────────────────────────────────
initDeck();
updateBank();
speak('greet');
showPanel('bet');
