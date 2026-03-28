/**
 * main.js — Grim Dice Roller application logic
 */
import './style.css';
import { diceIcons, diceTypes, diceMax } from './dice-icons.js';
import { initScene, rollDice3D, clearDice, resizeScene, getIsAnimating, setScoreOrbit } from './dice3d.js';

// ── State ────────────────────────────────────────────────
const state = {
  /** @type {Record<string, number>} quantity per die type */
  quantities: Object.fromEntries(diceTypes.map(t => [t, 0])),
  /** @type {Array<{timestamp: string, dice: Array<{type: string, result: number}>, total: number}>} */
  history: loadHistory(),
  sceneInitialized: false,
};

const MAX_HISTORY = 10;
const MAX_DICE_3D = 10;
const MAX_QTY = 20;

// ── DOM refs ─────────────────────────────────────────────
const diceGrid = document.getElementById('dice-grid');
const rollBtn = document.getElementById('roll-btn');
const diceCanvas = document.getElementById('dice-canvas');
const diceOverlay = document.getElementById('dice-overlay');
const scoreOverlay = document.getElementById('score-overlay');
const perTypeTotals = document.getElementById('per-type-totals');
const grandTotalEl = document.getElementById('grand-total');
const totalsOnly = document.getElementById('totals-only');
const totalsGrid = document.getElementById('totals-grid');
const historyList = document.getElementById('history-list');
const historyEmpty = document.getElementById('history-empty');
const clearHistoryBtn = document.getElementById('clear-history-btn');
const newRollBtn = document.getElementById('new-roll-btn');

// ── Init ─────────────────────────────────────────────────
buildDiceSelector();
renderHistory();
rollBtn.addEventListener('click', handleRoll);
clearHistoryBtn.addEventListener('click', clearHistory);
newRollBtn.addEventListener('click', showDiceOverlay);
window.addEventListener('resize', handleResize);

// Initialize the 3D scene immediately (canvas always visible)
initScene(diceCanvas);
state.sceneInitialized = true;

// ── Dice Selector ────────────────────────────────────────
function buildDiceSelector() {
  diceGrid.innerHTML = '';
  diceTypes.forEach(type => {
    const card = document.createElement('div');
    card.className = 'dice-card';
    card.id = `card-${type}`;
    card.innerHTML = `
      <div class="die-icon">${diceIcons[type]}</div>
      <span class="die-name">${type}</span>
      <div class="qty-controls">
        <button class="qty-btn" data-action="dec" data-type="${type}" aria-label="Decrease ${type}">−</button>
        <span class="qty-value" id="qty-${type}">0</span>
        <button class="qty-btn" data-action="inc" data-type="${type}" aria-label="Increase ${type}">+</button>
      </div>
    `;
    diceGrid.appendChild(card);
  });

  // Event delegation on the grid
  diceGrid.addEventListener('click', (e) => {
    const btn = e.target.closest('.qty-btn');
    if (!btn) return;
    const { type, action } = btn.dataset;
    if (action === 'inc' && state.quantities[type] < MAX_QTY) {
      state.quantities[type]++;
    } else if (action === 'dec' && state.quantities[type] > 0) {
      state.quantities[type]--;
    }
    updateDiceUI();
  });
}

function updateDiceUI() {
  let totalDice = 0;
  diceTypes.forEach(type => {
    const qty = state.quantities[type];
    const qtyEl = document.getElementById(`qty-${type}`);
    const cardEl = document.getElementById(`card-${type}`);
    if (qtyEl) qtyEl.textContent = qty;
    if (cardEl) {
      cardEl.classList.toggle('active', qty > 0);
    }
    totalDice += qty;
  });
  rollBtn.disabled = totalDice === 0;
}

// Show the dice selector overlay
function showDiceOverlay() {
  diceOverlay.classList.remove('fade-out');
  scoreOverlay.classList.remove('visible');
  scoreOverlay.style.pointerEvents = 'none';
  grandTotalEl.classList.remove('animate');
  setScoreOrbit(false);
  diceCanvas.classList.remove('score-active');
}

// ── Rolling ──────────────────────────────────────────────
function handleRoll() {
  if (getIsAnimating()) return;

  const totalDice = Object.values(state.quantities).reduce((a, b) => a + b, 0);
  if (totalDice === 0) return;

  // Fade out the dice selector overlay
  diceOverlay.classList.add('fade-out');
  scoreOverlay.classList.remove('visible');
  grandTotalEl.classList.remove('animate');

  if (totalDice <= MAX_DICE_3D) {
    // 3D mode — pass dice types, let physics determine results
    totalsOnly.classList.add('hidden');

    // Build list of dice to roll (no result yet)
    const diceToRoll = [];
    diceTypes.forEach(type => {
      const qty = state.quantities[type];
      for (let i = 0; i < qty; i++) {
        diceToRoll.push({ type });
      }
    });

    rollBtn.classList.add('rolling');
    rollDice3D(diceToRoll, (physicsResults) => {
      rollBtn.classList.remove('rolling');

      // Build diceList from physics-determined face values
      const diceList = physicsResults.map(r => ({
        type: r.type,
        result: r.value,
      }));

      showScoreOverlay(diceList);
      addToHistory(diceList);
    });
  } else {
    // Totals-only mode — generate random results
    totalsOnly.classList.remove('hidden');

    // Clear any existing dice from the scene (keep renderer alive)
    clearDice();

    const diceList = [];
    diceTypes.forEach(type => {
      const qty = state.quantities[type];
      for (let i = 0; i < qty; i++) {
        diceList.push({
          type,
          result: Math.floor(Math.random() * diceMax[type]) + 1,
        });
      }
    });

    showTotalsOnlyGrid(diceList);
    showScoreOverlay(diceList);
    addToHistory(diceList);
  }
}

// ── Score Display ────────────────────────────────────────
function showScoreOverlay(diceList) {
  // Per-type totals
  const byType = {};
  diceList.forEach(d => {
    if (!byType[d.type]) byType[d.type] = [];
    byType[d.type].push(d.result);
  });

  perTypeTotals.innerHTML = '';
  Object.entries(byType).forEach(([type, results]) => {
    const sum = results.reduce((a, b) => a + b, 0);
    const badge = document.createElement('div');
    badge.className = 'type-total-badge';
    badge.innerHTML = `
      <span class="badge-label">${type}</span>
      <span class="badge-value">${sum}</span>
    `;
    perTypeTotals.appendChild(badge);
  });

  // Grand total with pop animation
  const grandTotal = diceList.reduce((a, d) => a + d.result, 0);
  grandTotalEl.textContent = grandTotal;

  // Show the score overlay with animation — stays until New Roll is clicked
  scoreOverlay.classList.add('visible');
  scoreOverlay.style.pointerEvents = 'auto';
  // Force reflow then add animation class
  void grandTotalEl.offsetWidth;
  grandTotalEl.classList.add('animate');

  // Start camera orbit and darken the frame
  setScoreOrbit(true);
  diceCanvas.classList.add('score-active');
}

function showTotalsOnlyGrid(diceList) {
  const byType = {};
  diceList.forEach(d => {
    if (!byType[d.type]) byType[d.type] = [];
    byType[d.type].push(d.result);
  });

  totalsGrid.innerHTML = '';
  Object.entries(byType).forEach(([type, results]) => {
    const sum = results.reduce((a, b) => a + b, 0);
    const card = document.createElement('div');
    card.className = 'result-type-card';
    card.innerHTML = `
      <div class="type-label">${type} × ${results.length}</div>
      <div class="type-rolls">[${results.join(', ')}]</div>
      <div class="type-subtotal">${sum}</div>
    `;
    totalsGrid.appendChild(card);
  });
}

// ── History ──────────────────────────────────────────────
function addToHistory(diceList) {
  const entry = {
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    dice: diceList.map(d => ({ type: d.type, result: d.result })),
    total: diceList.reduce((a, d) => a + d.result, 0),
  };
  state.history.unshift(entry);
  if (state.history.length > MAX_HISTORY) {
    state.history = state.history.slice(0, MAX_HISTORY);
  }
  saveHistory();
  renderHistory();
}

function renderHistory() {
  if (state.history.length === 0) {
    historyEmpty.classList.remove('hidden');
    clearHistoryBtn.classList.add('hidden');
    // Remove all history-card elements
    historyList.querySelectorAll('.history-card').forEach(el => el.remove());
    return;
  }

  historyEmpty.classList.add('hidden');
  clearHistoryBtn.classList.remove('hidden');

  // Remove old cards
  historyList.querySelectorAll('.history-card').forEach(el => el.remove());

  state.history.forEach(entry => {
    const card = document.createElement('div');
    card.className = 'history-card';

    // Group dice by type for compact display
    const byType = {};
    entry.dice.forEach(d => {
      if (!byType[d.type]) byType[d.type] = [];
      byType[d.type].push(d.result);
    });

    let diceHtml = '';
    Object.entries(byType).forEach(([type, results]) => {
      results.forEach(r => {
        diceHtml += `<span class="history-die-result"><span class="die-label">${type}</span>${r}</span>`;
      });
    });

    card.innerHTML = `
      <div class="flex items-center justify-between mb-1.5 sm:mb-2">
        <span class="font-body text-sm text-grim-muted">${entry.timestamp}</span>
        <span class="font-heading text-xl sm:text-2xl text-grim-white">${entry.total}</span>
      </div>
      <div class="history-dice">${diceHtml}</div>
    `;
    historyList.appendChild(card);
  });
}

function clearHistory() {
  state.history = [];
  saveHistory();
  renderHistory();
}

function saveHistory() {
  try {
    localStorage.setItem('grim-dice-history', JSON.stringify(state.history));
  } catch (e) {
    // Silently fail if localStorage is unavailable
  }
}

function loadHistory() {
  try {
    const data = localStorage.getItem('grim-dice-history');
    return data ? JSON.parse(data) : [];
  } catch (e) {
    return [];
  }
}

// ── Resize ───────────────────────────────────────────────
function handleResize() {
  if (state.sceneInitialized) {
    resizeScene(diceCanvas);
  }
}
