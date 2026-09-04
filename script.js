/* XENSIV™ Game Controller Dashboard
   Der Controller kennt keine Einstellungen. Das Skript hat deshalb nur eine
   Aufgabe: die Werte des Geräts lesen und an zwei Stellen zeigen – als
   Zeichnung auf der dunklen Bühne und als Zahlen daneben. */

// ─── Gerätesteckbrief ─────────────────────────────────
// Nur Geräte mit diesem Profil werden angenommen.

const REQUIRED_BUTTONS = 16;
const REQUIRED_AXES    = 4;

const BUTTON_NAMES = {
  0: 'F', 1: 'X', 2: 'I', 3: 'T',
  4: 'L1', 5: 'R1', 6: 'L2', 7: 'R2',
  8: 'Select', 9: 'Start', 10: 'L3', 11: 'R3',
  12: 'D-Pad ▲', 13: 'D-Pad ▼',
  14: 'D-Pad ◀', 15: 'D-Pad ▶',
  16: 'Control'
};

const AXIS_NAMES = {
  0: 'Links X', 1: 'Links Y',
  2: 'Rechts X', 3: 'Rechts Y'
};

// Analoge Trigger in der Zeichnung: Fassung bleibt stehen, gefüllt wird
// von unten nach Wert.
const TRIGGER_GEOMETRY = {
  6: { y: 18, height: 68 },
  7: { y: 18, height: 68 }
};

// Farben der Bühne, damit die Leinwände dieselbe Sprache sprechen wie
// das Stilblatt.
const PALETTE = {
  accent:  '#0a8a7c',
  soft:    '#12a190',
  ghost:   'rgba(10, 138, 124, 0.28)',
  signal:  '#eb7000',
  line:    '#dfe4e4',
  muted:   '#6b7a7d',
  neutral: '#c3cacb'
};

// Unterhalb dieser Auslenkung gilt eine Achse als in Ruhe. Der Wert trennt
// das Zittern der Mechanik von einer Absicht.
const AXIS_DEADZONE = 0.12;

const SEARCH_INTERVAL = 400;
const RATE_WINDOW     = 500;
const LOG_LIMIT       = 300;

// ─── Zustand ──────────────────────────────────────────

let animationId     = null;
let searchTimer     = null;
let activeGamepad   = null;
let lastButtonState = [];
let frameCount      = 0;
let rateStartedAt   = 0;

const byId = (id) => document.getElementById(id);

// ─── Start ────────────────────────────────────────────

window.addEventListener('load', () => {
  buildAxisBars(REQUIRED_AXES);
  buildButtonItems(REQUIRED_BUTTONS);

  byId('connect-button').addEventListener('click', toggleSearch);
  byId('clear-log').addEventListener('click', clearLog);

  drawJoystick('joystick-left', 0, 0);
  drawJoystick('joystick-right', 0, 0);

  startSearch();
});

// Der Browser gibt ein Gamepad erst frei, nachdem daran eine Taste gedrückt
// wurde. Das Ereignis ist deshalb der verlässlichere Weg als jede Abfrage –
// die laufende Suche bleibt trotzdem, weil manche Treiber es auslassen.
window.addEventListener('gamepadconnected', () => scanForGamepads());

window.addEventListener('gamepaddisconnected', (event) => {
  if (activeGamepad === event.gamepad.index) handleDisconnect();
});

// ─── Suche ────────────────────────────────────────────

function toggleSearch() {
  if (activeGamepad !== null) {
    releaseGamepad('Verbindung gelöst');
    return;
  }

  searchTimer === null ? startSearch() : stopSearch();
}

function startSearch() {
  if (searchTimer !== null) return;

  setConnectionState('searching', 'Suche läuft', 'Suche abbrechen');
  setLiveState(false, 'Warte auf Tastendruck am Controller');

  searchTimer = setInterval(scanForGamepads, SEARCH_INTERVAL);
  scanForGamepads();
}

function stopSearch() {
  if (searchTimer === null) return;

  clearInterval(searchTimer);
  searchTimer = null;

  setConnectionState('offline', 'Nicht verbunden', 'Controller suchen');
  setLiveState(false, 'Nicht verbunden');
}

function isSupportedGamepad(gamepad) {
  return gamepad.buttons.length === REQUIRED_BUTTONS
      && gamepad.axes.length    === REQUIRED_AXES;
}

function scanForGamepads() {
  if (activeGamepad !== null) return;

  for (const gamepad of navigator.getGamepads()) {
    if (gamepad && isSupportedGamepad(gamepad)) {
      initController(gamepad);
      return;
    }
  }
}

// ─── Verbindung ───────────────────────────────────────

function initController(gamepad) {
  if (searchTimer !== null) {
    clearInterval(searchTimer);
    searchTimer = null;
  }

  activeGamepad = gamepad.index;

  // Der Ausgangsstand ist "nicht gedrückt". Ohne ihn läse der erste Durchlauf
  // aus jeder unbelegten Stelle eine Änderung heraus und schriebe für jede
  // Taste ein Loslassen ins Protokoll, das nie stattgefunden hat.
  lastButtonState = new Array(gamepad.buttons.length).fill(false);

  setConnectionState('online', 'Verbunden', 'Verbindung lösen');
  setLiveState(true, 'Datenerfassung läuft');

  const device = byId('stage-device');
  device.textContent = gamepad.id;
  device.title       = gamepad.id;

  buildAxisBars(gamepad.axes.length);
  buildButtonItems(gamepad.buttons.length);

  addLog(`[OK]  Gerät verbunden: ${gamepad.id}`);
  addLog(`      Tasten: ${gamepad.buttons.length} | Achsen: ${gamepad.axes.length}`);

  startPolling();
}

function handleDisconnect() {
  releaseGamepad('Verbindung zum Gerät getrennt');
  startSearch();
}

function releaseGamepad(message) {
  if (activeGamepad === null) return;

  addLog(`[!]   ${message}`);

  activeGamepad = null;

  if (animationId !== null) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }

  const device = byId('stage-device');
  device.textContent = '–';
  device.removeAttribute('title');

  setConnectionState('offline', 'Nicht verbunden', 'Controller suchen');
  setLiveState(false, 'Nicht verbunden');
  resetReadouts();
}

// ─── Abtastung ────────────────────────────────────────
// `getGamepads` liefert bei jedem Aufruf eine neue Momentaufnahme; ein
// festgehaltenes Gamepad-Objekt veraltet sofort.

function startPolling() {
  frameCount    = 0;
  rateStartedAt = performance.now();

  function loop() {
    if (activeGamepad === null) return;

    const gamepad = navigator.getGamepads()[activeGamepad];

    if (!gamepad) {
      handleDisconnect();
      return;
    }

    updateButtons(gamepad.buttons);
    updateAxes(gamepad.axes);
    updateRate();

    animationId = requestAnimationFrame(loop);
  }

  animationId = requestAnimationFrame(loop);
}

function updateRate() {
  frameCount += 1;

  const elapsed = performance.now() - rateStartedAt;
  if (elapsed < RATE_WINDOW) return;

  const hertz = Math.round((frameCount * 1000) / elapsed);
  byId('poll-actual').textContent = hertz;

  frameCount    = 0;
  rateStartedAt = performance.now();
}

// ─── Tasten ───────────────────────────────────────────

function updateButtons(buttons) {
  let pressedCount = 0;

  buttons.forEach((button, index) => {
    const isPressed = button.pressed;
    if (isPressed) pressedCount += 1;

    updatePadButton(index, isPressed, button.value);

    const item = byId(`btn-${index}`);
    if (item) {
      item.querySelector('.btn-value').textContent = button.value.toFixed(2);
      item.classList.toggle('is-pressed', isPressed);
    }

    // Schulter und Trigger haben zusätzlich eine Marke in den Messwerten.
    // Wo es keine gibt, greift die Zeile ins Leere und tut nichts.
    const chip = byId(`state-${index}`);
    if (chip) chip.classList.toggle('is-on', isPressed);

    if (lastButtonState[index] !== isPressed) {
      lastButtonState[index] = isPressed;
      const name = BUTTON_NAMES[index] || `Btn ${index}`;
      addLog(isPressed
        ? `[IN]  ${name} — gedrückt`
        : `[IN]  ${name} — losgelassen`);
    }
  });

  byId('metric-pressed').textContent = pressedCount;
}

function updatePadButton(index, isPressed, value) {
  const pad = byId(`pad-${index}`);
  if (!pad) return;

  pad.classList.toggle('is-pressed', isPressed);

  const geometry = TRIGGER_GEOMETRY[index];
  const fill     = byId(`trigger-fill-${index}`);

  if (geometry && fill) {
    const filled = geometry.height * value;
    fill.setAttribute('height', filled);
    fill.setAttribute('y', geometry.y + geometry.height - filled);
  }
}

// ─── Achsen ───────────────────────────────────────────
// Achswerte tragen ihr Vorzeichen immer mit sich. Ohne das Pluszeichen wäre
// eine Zahl je nach Richtung ein Zeichen kürzer, und der zweite Wert eines
// Paares spränge bei jeder Bewegung um eine Stelle hin und her.

function signed(value) {
  const text = value.toFixed(2);
  if (text === '-0.00') return '+0.00';
  return text.startsWith('-') ? text : `+${text}`;
}

function updateAxes(axes) {
  axes.forEach((value, index) => {
    const text = signed(value);

    const stickReadout = byId(`axis-${index}`);
    if (stickReadout) stickReadout.textContent = text;

    const listReadout = byId(`axis-value-${index}`);
    if (listReadout) listReadout.textContent = text;

    const fill = byId(`axis-fill-${index}`);
    if (fill) {
      const percent = Math.abs(value) * 50;
      fill.style.width      = `${percent}%`;
      fill.style.left       = value >= 0 ? '50%' : `${50 - percent}%`;
      fill.style.background = value > AXIS_DEADZONE
        ? PALETTE.soft
        : value < -AXIS_DEADZONE
          ? PALETTE.signal
          : PALETTE.neutral;
    }

    const item = byId(`axis-item-${index}`);
    if (item) {
      item.classList.toggle('is-active', Math.abs(value) > AXIS_DEADZONE);
    }
  });

  const leftX  = axes[0] || 0;
  const leftY  = axes[1] || 0;
  const rightX = axes[2] || 0;
  const rightY = axes[3] || 0;

  byId('metric-left').textContent  = `${signed(leftX)} / ${signed(leftY)}`;
  byId('metric-right').textContent = `${signed(rightX)} / ${signed(rightY)}`;

  drawJoystick('joystick-left', leftX, leftY);
  drawJoystick('joystick-right', rightX, rightY);

  updateStick('stick-left-move', leftX, leftY);
  updateStick('stick-right-move', rightX, rightY);
}

function updateStick(elementId, x, y) {
  const stick = byId(elementId);
  if (!stick) return;

  stick.setAttribute(
    'transform',
    `translate(${(x * 16).toFixed(2)} ${(y * 16).toFixed(2)})`
  );
}

// ─── Joystick-Leinwand ────────────────────────────────

function drawJoystick(canvasId, x, y) {
  const canvas = byId(canvasId);
  if (!canvas) return;

  // Die Leinwand bekommt so viele Bildpunkte, wie die Anzeige hergibt.
  // Ohne diesen Schritt bliebe der Kreis auf feinen Schirmen unscharf.
  const ratio  = window.devicePixelRatio || 1;
  const size   = canvas.clientWidth || canvas.width;
  const pixels = Math.round(size * ratio);

  if (canvas.width !== pixels) {
    canvas.width  = pixels;
    canvas.height = pixels;
  }

  const context = canvas.getContext('2d');
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, size, size);

  const center = size / 2;
  const radius = center - 12;

  context.beginPath();
  context.arc(center, center, radius, 0, Math.PI * 2);
  context.strokeStyle = PALETTE.line;
  context.lineWidth   = 1;
  context.stroke();

  context.beginPath();
  context.moveTo(center - radius, center);
  context.lineTo(center + radius, center);
  context.moveTo(center, center - radius);
  context.lineTo(center, center + radius);
  context.strokeStyle = PALETTE.line;
  context.stroke();

  const dotX = center + x * radius;
  const dotY = center + y * radius;

  context.beginPath();
  context.moveTo(center, center);
  context.lineTo(dotX, dotY);
  context.strokeStyle = PALETTE.ghost;
  context.lineWidth   = 2;
  context.stroke();

  context.beginPath();
  context.arc(dotX, dotY, 9, 0, Math.PI * 2);
  context.fillStyle = PALETTE.accent;
  context.fill();

  context.beginPath();
  context.arc(center, center, 3, 0, Math.PI * 2);
  context.fillStyle = PALETTE.muted;
  context.fill();
}

// ─── Aufbau der Listen ────────────────────────────────

function buildAxisBars(count) {
  const list = byId('axes-bars');
  list.textContent = '';

  for (let index = 0; index < count; index += 1) {
    const item = document.createElement('div');
    item.className = 'axis-item';
    item.id        = `axis-item-${index}`;

    item.innerHTML = `
      <div class="axis-head">
        <span class="axis-name"><i class="axis-dot"></i></span>
        <span class="axis-readout">Wert <b id="axis-value-${index}">+0.00</b></span>
      </div>
      <div class="axis-track"><div class="axis-fill" id="axis-fill-${index}"></div></div>
      <div class="axis-scale"><span>-1.00</span><span>0</span><span>+1.00</span></div>`;

    // Der Name kommt als Text und nicht als Auszeichnung in die Zeile: Er
    // stammt zwar aus einer eigenen Liste, aber Gerätenamen sind nichts,
    // dem man Auszeichnung zutrauen sollte.
    item.querySelector('.axis-name')
        .append(AXIS_NAMES[index] || `Achse ${index}`);

    list.appendChild(item);
  }
}

function buildButtonItems(count) {
  const grid = byId('buttons-grid');
  grid.textContent = '';

  for (let index = 0; index < count; index += 1) {
    const item = document.createElement('div');
    item.className = 'btn-item';
    item.id        = `btn-${index}`;

    const number = document.createElement('span');
    number.className   = 'btn-number';
    number.textContent = `#${index}`;

    const name = document.createElement('span');
    name.className   = 'btn-name';
    name.textContent = BUTTON_NAMES[index] || `Btn ${index}`;

    const value = document.createElement('span');
    value.className   = 'btn-value';
    value.textContent = '0.00';

    item.append(number, name, value);
    grid.appendChild(item);
  }
}

// ─── Anzeige zurücksetzen ─────────────────────────────

function resetReadouts() {
  const pair = '-- / --';

  byId('metric-left').textContent    = pair;
  byId('metric-right').textContent   = pair;
  byId('metric-pressed').textContent = '--';
  byId('poll-actual').textContent    = '–';

  document.querySelectorAll('.state-chip')
          .forEach((chip) => chip.classList.remove('is-on'));

  document.querySelectorAll('.pad-btn.is-pressed')
          .forEach((pad) => pad.classList.remove('is-pressed'));

  Object.entries(TRIGGER_GEOMETRY).forEach(([index, geometry]) => {
    const fill = byId(`trigger-fill-${index}`);
    if (!fill) return;
    fill.setAttribute('height', 0);
    fill.setAttribute('y', geometry.y + geometry.height);
  });

  updateStick('stick-left-move', 0, 0);
  updateStick('stick-right-move', 0, 0);

  document.querySelectorAll('.btn-item').forEach((item) => {
    item.classList.remove('is-pressed');
    item.querySelector('.btn-value').textContent = '0.00';
  });

  document.querySelectorAll('.axis-item').forEach((item) => {
    item.classList.remove('is-active');
    item.querySelector('.axis-readout b').textContent = '+0.00';
  });

  document.querySelectorAll('.axis-fill').forEach((fill) => {
    fill.style.width      = '0%';
    fill.style.left       = '50%';
    fill.style.background = PALETTE.neutral;
  });

  ['axis-0', 'axis-1', 'axis-2', 'axis-3'].forEach((id) => {
    const readout = byId(id);
    if (readout) readout.textContent = '+0.00';
  });

  drawJoystick('joystick-left', 0, 0);
  drawJoystick('joystick-right', 0, 0);
}

// ─── Zustandsanzeigen ─────────────────────────────────

function setConnectionState(state, text, buttonLabel) {
  const label = byId('connection-label');
  label.dataset.state = state;
  byId('connection-text').textContent = text;
  byId('connect-button').textContent  = buttonLabel;
}

function setLiveState(running, text) {
  byId('live-state').classList.toggle('is-running', running);
  byId('live-state-text').textContent = text;
}

// ─── Protokoll ────────────────────────────────────────

function addLog(message) {
  const log = byId('log-box');
  if (!log) return;

  const entry = document.createElement('div');
  entry.textContent =
    `[${new Date().toLocaleTimeString('de-DE')}] ${message}`;

  log.appendChild(entry);

  // Ein Protokoll, das nie vergisst, wächst über die Sitzung hinweg zu
  // einem Speicherproblem.
  while (log.childElementCount > LOG_LIMIT) log.firstElementChild.remove();

  log.scrollTop = log.scrollHeight;
}

function clearLog() {
  byId('log-box').textContent = '';
}
