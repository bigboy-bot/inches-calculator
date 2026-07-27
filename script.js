const exprEl = document.getElementById('expr');
const mainEl = document.getElementById('main');
const hintEl = document.getElementById('hint');
const historyListEl = document.getElementById('historyList');
const historyClearEl = document.getElementById('historyClear');

const HISTORY_STORAGE_KEY = 'inches-calculator-history';
const REMINDERS_STORAGE_KEY = 'inches-calculator-reminders';
const remindersEl = document.getElementById('reminders');
const DEFAULT_REMINDERS =
  'When pieces grooved - 1/2 (1/4 + 1/4) to total height.\n' +
  'E.g 1 7/8 - 1/2 = 1 3/8\n' +
  '\n' +
  'Decimals for invitory: 1/8 - .125   .375   .625   .875';

const ACCENT_STORAGE_KEY = 'inches-calculator-accent';
const DEFAULT_ACCENT = '#4ade80';
const accentPicker = document.getElementById('accentPicker');

let display = '';
let accumulator = null;
let operator = null;
let resetDisplayOnNextChar = false;
let history = [];

const OP_SYMBOL = { add: '+', sub: '−', mul: '×', div: '÷' };

// Only odd numerators are kept — an even numerator over these denominators
// always reduces to a simpler fraction (e.g. 2/4 is really 1/2).
const DENOM_OPTIONS = {
  4: [1, 3],
  8: [1, 3, 5, 7],
  16: [1, 3, 5, 7, 9, 11, 13, 15],
};

let activePopup = null;

function gcd(a, b) {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) {
    [a, b] = [b, a % b];
  }
  return a;
}

// Formats a whole number of 32nds (e.g. 105) as an inches fraction string (e.g. `3 9/32"`).
function fractionStringFromTotal32(total32) {
  const sign = total32 < 0 ? '-' : '';
  const abs = Math.abs(total32);
  const whole = Math.floor(abs / 32);
  const rem = abs % 32;
  if (rem === 0) return `${sign}${whole}"`;
  const divisor = gcd(rem, 32);
  const num = rem / divisor;
  const den = 32 / divisor;
  const wholePart = whole > 0 ? `${whole} ` : '';
  return `${sign}${wholePart}${num}/${den}"`;
}

function formatFraction(value) {
  if (!isFinite(value)) return 'Error';
  return fractionStringFromTotal32(Math.round(value * 32));
}

// Reads typed text like "23 3/32", "3/4", "-5", or "" back into a decimal number.
function parseFraction(str) {
  str = str.trim().replace(/"$/, '');
  if (str === '') return 0;
  const negative = str.startsWith('-');
  if (negative) str = str.slice(1);
  const spaceIdx = str.indexOf(' ');
  const wholeStr = spaceIdx === -1 ? (str.includes('/') ? '0' : str) : str.slice(0, spaceIdx);
  const fracStr = spaceIdx === -1 ? (str.includes('/') ? str : '') : str.slice(spaceIdx + 1);
  const whole = parseFloat(wholeStr) || 0;
  let fracValue = 0;
  if (fracStr.includes('/')) {
    const [numStr, denStr] = fracStr.split('/');
    const num = parseFloat(numStr);
    const den = parseFloat(denStr);
    if (num && den) fracValue = num / den;
  }
  const value = whole + fracValue;
  return negative ? -value : value;
}

// True 32nds (odd numerator) don't line up with an 1/8" or 1/16" mark on a tape
// measure, so we point at the two ticks it falls between instead.
function analyzeHint(value) {
  if (!isFinite(value)) return '';
  const total32 = Math.round(value * 32);
  const isTrue32nd = Math.abs(total32) % 32 % 2 === 1;
  return isTrue32nd
    ? `between ${fractionStringFromTotal32(total32 - 1)} and ${fractionStringFromTotal32(total32 + 1)}`
    : '';
}

function render() {
  mainEl.textContent = display === '' ? '0' : display;
  hintEl.textContent = analyzeHint(parseFraction(display)) || ' ';
  updateRulerMarker(parseFraction(display));
}

const EIGHTH_LABELS = {
  0: '0', 4: '1/8', 8: '1/4', 12: '3/8', 16: '1/2',
  20: '5/8', 24: '3/4', 28: '7/8', 32: '1"',
};

// Draws the fixed set of tick marks once (0 to 32/32nds); only the marker moves after this.
function buildRuler() {
  const track = document.getElementById('rulerTrack');
  for (let i = 0; i <= 32; i++) {
    const tick = document.createElement('div');
    let tier = 'ruler-tick-32nd';
    if (i % 8 === 0) tier = 'ruler-tick-quarter';
    else if (i % 4 === 0) tier = 'ruler-tick-eighth';
    else if (i % 2 === 0) tier = 'ruler-tick-sixteenth';
    tick.className = `ruler-tick ${tier}`;
    tick.style.left = `${(i / 32) * 100}%`;
    track.appendChild(tick);

    if (EIGHTH_LABELS[i] !== undefined) {
      const label = document.createElement('div');
      label.className = 'ruler-label';
      label.style.left = `${(i / 32) * 100}%`;
      label.textContent = EIGHTH_LABELS[i];
      track.appendChild(label);
    }
  }

  const marker = document.createElement('div');
  marker.className = 'ruler-marker';
  marker.id = 'rulerMarker';
  track.appendChild(marker);
}

// Shows where the current value's fractional part sits within the 0-1" span.
function updateRulerMarker(value) {
  const marker = document.getElementById('rulerMarker');
  if (!marker) return;
  const total32 = isFinite(value) ? Math.round(value * 32) : 0;
  const rem = ((total32 % 32) + 32) % 32;
  marker.style.left = `${(rem / 32) * 100}%`;
}

function saveHistory() {
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
  } catch (e) {
    // localStorage unavailable (e.g. private browsing) — history just won't persist.
  }
}

function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (raw) history = JSON.parse(raw);
  } catch (e) {
    history = [];
  }
}

function loadReminders() {
  try {
    const saved = localStorage.getItem(REMINDERS_STORAGE_KEY);
    remindersEl.value = saved !== null ? saved : DEFAULT_REMINDERS;
  } catch (e) {
    remindersEl.value = DEFAULT_REMINDERS;
  }
}

remindersEl.addEventListener('input', () => {
  try {
    localStorage.setItem(REMINDERS_STORAGE_KEY, remindersEl.value);
  } catch (e) {
    // localStorage unavailable — reminders just won't persist.
  }
});

function applyAccent(color) {
  document.documentElement.style.setProperty('--accent', color);
}

function loadAccent() {
  let color = DEFAULT_ACCENT;
  try {
    const saved = localStorage.getItem(ACCENT_STORAGE_KEY);
    if (saved) color = saved;
  } catch (e) {
    // localStorage unavailable — falls back to the default accent.
  }
  accentPicker.value = color;
  applyAccent(color);
}

accentPicker.addEventListener('input', () => {
  applyAccent(accentPicker.value);
  try {
    localStorage.setItem(ACCENT_STORAGE_KEY, accentPicker.value);
  } catch (e) {
    // localStorage unavailable — accent choice just won't persist.
  }
});

const LAYOUT_STORAGE_KEY = 'inches-calculator-layout';
const appEl = document.querySelector('.app');
const layoutToggleEl = document.getElementById('layoutToggle');

function applyLayout(compact) {
  appEl.classList.toggle('app-compact', compact);
  layoutToggleEl.textContent = compact ? 'Expand' : 'Compact';
}

function loadLayout() {
  let compact = false;
  try {
    compact = localStorage.getItem(LAYOUT_STORAGE_KEY) === '1';
  } catch (e) {
    // localStorage unavailable — falls back to expanded layout.
  }
  applyLayout(compact);
}

layoutToggleEl.addEventListener('click', () => {
  const compact = !appEl.classList.contains('app-compact');
  applyLayout(compact);
  try {
    localStorage.setItem(LAYOUT_STORAGE_KEY, compact ? '1' : '0');
  } catch (e) {
    // localStorage unavailable — layout choice just won't persist.
  }
});


function renderHistory() {
  historyListEl.innerHTML = '';
  if (history.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'history-empty';
    empty.textContent = 'No calculations yet';
    historyListEl.appendChild(empty);
    return;
  }
  for (const entry of history) {
    const item = document.createElement('li');
    item.className = 'history-item';

    const formulaEl = document.createElement('div');
    formulaEl.className = 'formula';
    formulaEl.textContent = `${entry.formula} =`;

    const resultEl = document.createElement('div');
    resultEl.className = 'result';
    resultEl.textContent = entry.result;

    item.append(formulaEl, resultEl);
    item.addEventListener('click', () => loadFromHistory(entry));
    historyListEl.appendChild(item);
  }
}

function appendChar(ch) {
  if (resetDisplayOnNextChar) {
    display = '';
    resetDisplayOnNextChar = false;
  }
  if (ch === ' ' && (display === '' || display.includes(' ') || display.includes('/'))) return;
  if (ch === '/' && (display === '' || display.includes('/'))) return;
  display += ch;
  render();
}

function appendDenominator(n) {
  if (resetDisplayOnNextChar) {
    display = '';
    resetDisplayOnNextChar = false;
  }
  if (display === '' || display.includes('/')) return;
  display += `/${n}`;
  render();
}

function appendFraction(numerator, denominator) {
  if (resetDisplayOnNextChar) {
    display = '';
    resetDisplayOnNextChar = false;
  }
  if (display.includes('/')) return;
  display += `${numerator}/${denominator}`;
  render();
}

function closeDenomPopup() {
  if (!activePopup) return;
  activePopup.remove();
  activePopup = null;
  document.removeEventListener('click', handleOutsideClick, true);
  document.removeEventListener('keydown', handlePopupEscape, true);
}

function handleOutsideClick(e) {
  if (activePopup && !activePopup.contains(e.target)) closeDenomPopup();
}

function handlePopupEscape(e) {
  if (e.key === 'Escape') closeDenomPopup();
}

function openDenomPopup(btn, denominator, numerators) {
  closeDenomPopup();
  const popup = document.createElement('div');
  popup.className = 'denom-popup';
  for (const num of numerators) {
    const optBtn = document.createElement('button');
    optBtn.className = 'denom-popup-btn';
    optBtn.textContent = `${num}/${denominator}`;
    optBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      appendFraction(num, denominator);
      closeDenomPopup();
    });
    popup.appendChild(optBtn);
  }
  document.body.appendChild(popup);

  const rect = btn.getBoundingClientRect();
  const popupRect = popup.getBoundingClientRect();
  let top = rect.bottom + 6;
  if (top + popupRect.height > window.innerHeight) top = rect.top - popupRect.height - 6;
  let left = rect.left + rect.width / 2 - popupRect.width / 2;
  left = Math.max(8, Math.min(left, window.innerWidth - popupRect.width - 8));
  popup.style.top = `${top}px`;
  popup.style.left = `${left}px`;

  activePopup = popup;
  setTimeout(() => {
    document.addEventListener('click', handleOutsideClick, true);
    document.addEventListener('keydown', handlePopupEscape, true);
  }, 0);
}

function handleDenominatorKey(n, btn) {
  if (n === 2) return appendFraction(1, 2);
  if (n === 32) return appendDenominator(32);
  const numerators = DENOM_OPTIONS[n];
  if (numerators) openDenomPopup(btn, n, numerators);
}

function loadFromHistory(entry) {
  display = entry.result;
  accumulator = null;
  operator = null;
  resetDisplayOnNextChar = false;
  exprEl.textContent = ' ';
  render();
}

function backspace() {
  display = display.slice(0, -1);
  render();
}

function clearAll() {
  display = '';
  accumulator = null;
  operator = null;
  resetDisplayOnNextChar = false;
  exprEl.textContent = ' ';
  render();
}

function compute(a, b, op) {
  switch (op) {
    case 'add': return a + b;
    case 'sub': return a - b;
    case 'mul': return a * b;
    case 'div': return b === 0 ? NaN : a / b;
    default: return b;
  }
}

function inputOperator(op) {
  const value = parseFraction(display);
  if (operator && !resetDisplayOnNextChar) {
    accumulator = compute(accumulator, value, operator);
    display = formatFraction(accumulator);
  } else {
    accumulator = value;
  }
  operator = op;
  exprEl.textContent = `${formatFraction(accumulator)} ${OP_SYMBOL[op]}`;
  resetDisplayOnNextChar = true;
  render();
}

function inputEquals() {
  if (operator === null) return;
  const value = parseFraction(display);
  const formula = `${formatFraction(accumulator)} ${OP_SYMBOL[operator]} ${formatFraction(value)}`;
  exprEl.textContent = `${formula} =`;
  const result = compute(accumulator, value, operator);
  display = formatFraction(result);
  accumulator = null;
  operator = null;
  resetDisplayOnNextChar = true;
  history.unshift({ formula, result: display });
  saveHistory();
  renderHistory();
  render();
}

function handleKey(key, btn) {
  if (!key.startsWith('den')) closeDenomPopup();
  if (/^[0-9]$/.test(key)) return appendChar(key);
  if (key === 'space') return appendChar(' ');
  if (key === 'slash') return appendChar('/');
  if (key === 'back') return backspace();
  if (key === 'ac') return clearAll();
  if (key === 'eq') return inputEquals();
  if (['add', 'sub', 'mul', 'div'].includes(key)) return inputOperator(key);
  if (key.startsWith('den')) return handleDenominatorKey(Number(key.slice(3)), btn);
}

document.querySelectorAll('.key').forEach((btn) => {
  btn.addEventListener('click', () => handleKey(btn.dataset.key, btn));
});

historyClearEl.addEventListener('click', () => {
  history = [];
  saveHistory();
  renderHistory();
});

const KEYBOARD_MAP = {
  '+': 'add', '-': 'sub', '*': 'mul', '/': 'slash',
  Enter: 'eq', '=': 'eq', Backspace: 'back',
  Escape: 'ac', ' ': 'space',
};

window.addEventListener('keydown', (e) => {
  const key = /^[0-9]$/.test(e.key) ? e.key : KEYBOARD_MAP[e.key];
  if (!key) return;
  e.preventDefault();
  handleKey(key);
});

loadHistory();
loadReminders();
loadAccent();
loadLayout();
buildRuler();
render();
renderHistory();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch(() => {
      // Offline caching just won't be available (e.g. opened as a plain file:// page).
    });
  });
}

// On phones the 3 panels scroll horizontally; open centered on the calculator
// (the main panel) instead of stranded at the left edge on Reminders.
if (window.matchMedia('(max-width: 900px)').matches) {
  document.querySelector('.calculator').scrollIntoView({ inline: 'center', block: 'nearest' });
}
