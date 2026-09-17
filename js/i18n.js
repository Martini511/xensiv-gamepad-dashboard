/* Die Oberflaeche in zwei Sprachen.

   Englisch ist die Vorgabe und steht zugleich unuebersetzt im HTML: Bleibt
   dieses Skript aus - kein JavaScript, ein Ladefehler, ein alter Browser -,
   ist die Seite trotzdem vollstaendig lesbar. Das Deutsche liegt allein hier
   und wird beim Umschalten darueber gelegt.

   Uebersetzt wurde einmal und von Hand ins Repository gelegt, nicht im
   Browser beim Aufruf. Ein Schluessel fuer einen Uebersetzungsdienst waere im
   JavaScript einer statischen Seite fuer jeden lesbar, und der Text ist
   konstant - ihn je Besuch neu uebersetzen zu lassen hiesse, fuer dieselbe
   Antwort wieder und wieder zu zahlen.

   Ein gewoehnliches Skript, kein Modul: Das Skript der Seite ist auch keins,
   damit sie von der Festplatte aus laeuft. Die Reihenfolge im Dokument
   genuegt, damit `I18N` dort schon steht.

   Die Tastenkuerzel bleiben unuebersetzt: L1, R2 und D-Pad stehen so auf dem
   Geraet, in beiden Sprachen. */

const I18N = (() => {
  const LANGUAGES = { en: "English", de: "Deutsch" };
  const DEFAULT_LANGUAGE = "en";

  // Derselbe Schluessel wie in den uebrigen Dashboards: Wer dort einmal
  // umschaltet, findet hier dieselbe Sprache vor.
  const STORE = "xensiv.sprache";

  // Die Uhrzeit im Protokoll folgt der Sprache, bleibt aber in beiden
  // 24-stuendig - ein Protokoll mit "PM" liest sich schlechter, als es
  // aussieht.
  const CLOCKS = { en: "en-GB", de: "de-DE" };

  const TEXTS = {
    en: {
      "page.title": "Infineon | XENSIV\u2122 Game Controller Dashboard",
      "page.description": "Infineon demo application: live visualization of "
        + "input devices over the Web Gamepad API.",

      "brand.aria": "Infineon XENSIV game controller dashboard",
      "brand.name": "XENSIV\u2122 Game Controller",
      "brand.sub": "Live console",
      "lang.aria": "Language",

      "state.offline": "Not connected",
      "state.searching": "Searching",
      "state.online": "Connected",
      "header.search": "Search for controller",
      "header.stop": "Cancel search",
      "header.release": "Disconnect",
      "live.waiting": "Waiting for a button press on the controller",
      "live.running": "Capturing data",

      "stage.device": "DEVICE 01",
      "stage.api": "GAMEPAD API",
      "stage.model": "MODEL",
      "model.aria": "Model of the XENSIV game controller",
      "svg.aria": "Schematic view of the XENSIV game controller",
      "view.aria": "Viewing angle of the model",
      "view.front": "FRONT",
      "view.top": "TOP",

      "live.eyebrow": "LIVE TELEMETRY",
      "live.heading": "Input values",
      "live.rateBefore": "reaching",
      "live.rateAfter": "Hz",

      "metric.left": "LEFT STICK",
      "metric.right": "RIGHT STICK",
      "metric.axes01": "Axis 0 / 1",
      "metric.axes23": "Axis 2 / 3",
      "metric.shoulder": "SHOULDER L1 / R1",
      "metric.trigger": "TRIGGER L2 / R2",
      "metric.pressedOrFree": "pressed or free",
      "metric.active": "BUTTONS ACTIVE",
      "metric.atOnce": "pressed at once",

      "sticks.heading": "Joysticks",
      "stick.left": "LEFT",
      "stick.right": "RIGHT",
      "stick.leftAria": "Deflection of the left joystick",
      "stick.rightAria": "Deflection of the right joystick",

      "axes.heading": "Axes",
      "axis.value": "Value",
      "axis.0": "Left X",
      "axis.1": "Left Y",
      "axis.2": "Right X",
      "axis.3": "Right Y",
      "axis.other": "Axis {index}",

      "buttons.heading": "Buttons",
      "button.other": "Btn {index}",

      "log.heading": "Event log",
      "log.clear": "Clear",
      "log.empty": "No events yet.",

      "hint": "Connect the controller over USB or Bluetooth and press any "
        + "button \u2013 the browser only releases the device after that "
        + "input. Devices with 16 buttons and 4 axes are supported.",

      "msg.connected": "[OK]  Device connected: {id}",
      "msg.profile": "      Buttons: {buttons} | Axes: {axes}",
      "msg.released": "Connection closed",
      "msg.lost": "Device disconnected",
      "msg.pressed": "[IN]  {name} \u2014 pressed",
      "msg.let": "[IN]  {name} \u2014 released",
    },

    de: {
      "page.title": "Infineon | XENSIV\u2122 Game Controller Dashboard",
      "page.description": "Infineon Demo-Anwendung: Live-Visualisierung von "
        + "Eingabeger\u00e4ten \u00fcber die Web Gamepad API.",

      "brand.aria": "Infineon XENSIV Game Controller Dashboard",
      "brand.name": "XENSIV\u2122 Game Controller",
      "brand.sub": "Live-Konsole",
      "lang.aria": "Sprache",

      "state.offline": "Nicht verbunden",
      "state.searching": "Suche l\u00e4uft",
      "state.online": "Verbunden",
      "header.search": "Controller suchen",
      "header.stop": "Suche abbrechen",
      "header.release": "Verbindung l\u00f6sen",
      "live.waiting": "Warte auf Tastendruck am Controller",
      "live.running": "Datenerfassung l\u00e4uft",

      "stage.device": "GER\u00c4T 01",
      "stage.api": "GAMEPAD API",
      "stage.model": "MODELL",
      "model.aria": "Modell des XENSIV Game Controllers",
      "svg.aria": "Schematische Darstellung des XENSIV Game Controllers",
      "view.aria": "Blickwinkel auf das Modell",
      "view.front": "VORN",
      "view.top": "OBEN",

      "live.eyebrow": "LIVE-TELEMETRIE",
      "live.heading": "Eingabewerte",
      "live.rateBefore": "erreicht",
      "live.rateAfter": "Hz",

      "metric.left": "STICK LINKS",
      "metric.right": "STICK RECHTS",
      "metric.axes01": "Achse 0 / 1",
      "metric.axes23": "Achse 2 / 3",
      "metric.shoulder": "SCHULTER L1 / R1",
      "metric.trigger": "TRIGGER L2 / R2",
      "metric.pressedOrFree": "gedr\u00fcckt oder frei",
      "metric.active": "TASTEN AKTIV",
      "metric.atOnce": "gleichzeitig gedr\u00fcckt",

      "sticks.heading": "Joysticks",
      "stick.left": "LINKS",
      "stick.right": "RECHTS",
      "stick.leftAria": "Auslenkung des linken Joysticks",
      "stick.rightAria": "Auslenkung des rechten Joysticks",

      "axes.heading": "Achsen",
      "axis.value": "Wert",
      "axis.0": "Links X",
      "axis.1": "Links Y",
      "axis.2": "Rechts X",
      "axis.3": "Rechts Y",
      "axis.other": "Achse {index}",

      "buttons.heading": "Tasten",
      "button.other": "Btn {index}",

      "log.heading": "Ereignisprotokoll",
      "log.clear": "Leeren",
      "log.empty": "Noch keine Ereignisse.",

      "hint": "Verbinden Sie den Controller per USB oder Bluetooth und "
        + "dr\u00fccken Sie eine beliebige Taste \u2013 der Browser gibt das "
        + "Ger\u00e4t erst nach dieser Eingabe frei. Unterst\u00fctzt werden "
        + "Ger\u00e4te mit 16 Tasten und 4 Achsen.",

      "msg.connected": "[OK]  Ger\u00e4t verbunden: {id}",
      "msg.profile": "      Tasten: {buttons} | Achsen: {axes}",
      "msg.released": "Verbindung gel\u00f6st",
      "msg.lost": "Verbindung zum Ger\u00e4t getrennt",
      "msg.pressed": "[IN]  {name} \u2014 gedr\u00fcckt",
      "msg.let": "[IN]  {name} \u2014 losgelassen",
    },
  };

  const listeners = new Set();
  let current = recall();

  // Die zuletzt gewaehlte Sprache ueberdauert den Besuch. Was aus der Ablage
  // kommt, ist ungeprueft - eine fremde Hand, ein alter Stand -, deshalb gilt
  // nur, was es auch wirklich gibt.
  function recall() {
    try {
      const saved = localStorage.getItem(STORE);
      return saved in LANGUAGES ? saved : DEFAULT_LANGUAGE;
    } catch {
      return DEFAULT_LANGUAGE;
    }
  }

  // Platzhalter stehen in geschweiften Klammern. Fehlt ein Schluessel, kommt
  // er selbst zum Vorschein - das faellt beim Ansehen auf, waehrend ein leeres
  // Feld unbemerkt bliebe.
  function t(key, values) {
    const text = TEXTS[current][key] ?? TEXTS[DEFAULT_LANGUAGE][key] ?? key;
    if (!values) return text;
    return text.replace(/\{(\w+)\}/g, (whole, name) =>
      (name in values ? String(values[name]) : whole));
  }

  function language() {
    return current;
  }

  function clock() {
    return CLOCKS[current] ?? CLOCKS[DEFAULT_LANGUAGE];
  }

  function setLanguage(code) {
    if (!(code in LANGUAGES) || code === current) return;
    current = code;
    try {
      localStorage.setItem(STORE, code);
    } catch {
      // Ohne Ablage gilt die Wahl eben nur fuer diesen Besuch.
    }
    translate();
    listeners.forEach((listener) => listener(code));
  }

  // Wer eigene Texte setzt - Meldungen, Beschriftungen aus einer Liste -,
  // muss sie beim Wechsel neu setzen. Dafuer ist diese Anmeldung da.
  function onLanguage(listener) {
    listeners.add(listener);
  }

  // Traegt die Sprache in das Markup ein. `data-i18n` setzt den Text,
  // `data-i18n-aria` und `data-i18n-title` die gleichnamigen Merkmale - beides
  // gehoert uebersetzt, auch wenn man es nur hoert oder beim Verweilen sieht.
  function translate(root = document) {
    document.documentElement.lang = current;
    document.title = t("page.title");

    const description = document.querySelector('meta[name="description"]');
    if (description) description.content = t("page.description");

    root.querySelectorAll("[data-i18n]").forEach((element) => {
      element.textContent = t(element.dataset.i18n);
    });
    root.querySelectorAll("[data-i18n-aria]").forEach((element) => {
      element.setAttribute("aria-label", t(element.dataset.i18nAria));
    });
    root.querySelectorAll("[data-i18n-title]").forEach((element) => {
      element.title = t(element.dataset.i18nTitle);
    });
  }

  return {
    LANGUAGES, DEFAULT_LANGUAGE, t, language, clock, setLanguage, onLanguage,
    translate,
  };
})();
