// Das CAD-Modell des Controllers in der Live-Ansicht: Es neigt seine Sticks,
// zieht die Trigger, schiebt die Schultertasten und faerbt ein, was gerade
// gedrueckt wird.
//
// Gezeichnet wird nur, wenn sich etwas aendert. Solange kein Controller
// verbunden ist, liegt das Bild still; eine Dauerschleife mit sechzig Bildern
// je Sekunde wuerde nichts gewinnen und den Akku belasten.

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

// Die Knoten, die das Ausfuhrskript gesetzt hat. Jeder sitzt dort, wo sein
// Teil im Geraet aufgehaengt ist; mehr muss die Seite nicht wissen. Die Namen
// tragen einen Unterstrich und keinen Punkt: Punkte trennen in three.js die
// Stufen eines Pfades, der Lader schriebe sie um.
const SIDES = ["left", "right"];
const PARTS = ["trigger", "bumper", "stick"];

// Die Wege der beweglichen Teile stehen im Modell. Fehlen sie, gelten diese
// Werte - es sind dieselben, die das Ausfuhrskript eintraegt.
const FALLBACK = {
  triggerTravel: 18.0,                                   // Grad
  bumperTravel: 0.0018,                                  // m
  stickTilt: 22.0,                                       // Grad
  stickPress: 0.0012,                                    // m
};

// Blickrichtung ohne Zutun des Betrachters: von schraeg oben auf die
// Oberseite, so wie der Controller vor einem liegt - leicht aus der Achse
// gedreht, damit das Geraet eine Tiefe bekommt und nicht als Aufriss
// dasteht. Gedreht wird nur ein wenig: Wer links drueckt, soll den Stick auch
// links sehen, und das ginge bei einem Blick von vorn verloren. Winkel als
// Kugelkoordinaten um den Modellmittelpunkt.
const HOME = { azimuth: 0.15, polar: 0.78 };
const POLAR_LIMITS = [0.18, 1.4];

// Luft zwischen Modell und Bildrand. Der Controller ist breit und flach; was
// er ueber den Huellkoerper hinaus noch bewegt - der gezogene Trigger, der
// geneigte Stick - bleibt unter dieser Zugabe.
const FIT_MARGIN = 1.1;

// So viele Blickrichtungen prueft die Abstandssuche. Feiner lohnt nicht: Die
// unguenstigste Lage aendert sich ueber wenige Grad kaum.
const FRAMING_AZIMUTHS = 32;
const FRAMING_POLARS = 6;

// So viele Richtungen tastet der Ladevorgang ab, um die aeussersten Punkte des
// Modells zu finden. Der Huellquader waere einfacher, seine Ecken ragen aber
// weit ueber das gerundete Gehaeuse hinaus - das Bild bliebe unnoetig weit weg.
const HULL_DIRECTIONS = 48;

// Nach dieser Ruhezeit gleitet die Ansicht zurueck in die Ausgangslage.
const RETURN_DELAY = 2200;
const RETURN_EASE = 0.055;

// Die Teile folgen dem gemessenen Wert nicht sprunghaft, sondern gleiten ihm
// nach. Das glaettet das Zittern der Sticks um ihre Ruhelage, ohne dass die
// Bewegung traege wirkt.
const EASE = 0.35;
const SETTLED = 0.002;

// Gedrueckt wird das Teil eingefaerbt, nicht nur aufgehellt: Auf dem hellen
// Gehaeuse ginge ein reiner Leuchtanteil im Glanzlicht unter. Die Farbe ist
// dieselbe, die auch die Zeichnung benutzt.
const PRESS_COLOR = 0x12a190;
const PRESS_GLOW = 0.3;
const PRESS_TONE = new THREE.Color(PRESS_COLOR);

export class PadModel {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas, antialias: true, alpha: true, powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.01, 10);
    this.pivot = new THREE.Group();
    this.scene.add(this.pivot);

    this.azimuth = HOME.azimuth;
    this.polar = HOME.polar;
    this.lastInput = 0;
    this.visible = true;
    this.frame = 0;

    this.nodes = {};
    this.skins = {};
    this.travel = { ...FALLBACK };

    // Je Teil, was es zeigen soll und was es gerade zeigt. Getrennt, weil das
    // eine dem anderen nachgleitet.
    this.wanted = blankState();
    this.shown = blankState();

    this.hull = [];
    this.distance = 0.4;

    // Rechengroessen fuer die Bildschleife, einmal angelegt statt je Bild neu.
    this.direction = new THREE.Vector3();
    this.right = new THREE.Vector3();
    this.upward = new THREE.Vector3();
    this.target = new THREE.Vector3();
    this.worldUp = new THREE.Vector3(0, 1, 0);

    this.#setupStage();
    this.#setupInput();

    this.resizeObserver = new ResizeObserver(() => this.#resize());
    this.resizeObserver.observe(canvas);

    // Ein Zeichenfeld ausserhalb des Bildes hat keine Flaeche - dann ruht auch
    // das Bild.
    this.intersectionObserver = new IntersectionObserver(([entry]) => {
      this.visible = entry.isIntersecting;
      if (this.visible) this.#invalidate();
    });
    this.intersectionObserver.observe(canvas);
    document.addEventListener("visibilitychange", () => this.#invalidate());

    this.#resize();
  }

  // ─── Aufbau ─────────────────────────────────────────

  #setupStage() {
    const generator = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = generator.fromScene(new RoomEnvironment(), 0.04).texture;
    generator.dispose();
    if ("environmentIntensity" in this.scene) {
      this.scene.environmentIntensity = 0.5;
    }

    const key = new THREE.DirectionalLight(0xffffff, 1.5);
    key.position.set(0.25, 0.6, 0.4);
    this.scene.add(key);

    const rim = new THREE.DirectionalLight(0xbfe6ea, 0.7);
    rim.position.set(-0.4, 0.25, -0.35);
    this.scene.add(rim);
  }

  #setupInput() {
    const pointers = new Set();
    let last = null;

    this.canvas.addEventListener("pointerdown", (event) => {
      pointers.add(event.pointerId);
      last = event;
      this.canvas.setPointerCapture(event.pointerId);
      this.lastInput = Infinity;      // solange gehalten wird, kein Ruecklauf
    });

    this.canvas.addEventListener("pointermove", (event) => {
      if (!pointers.has(event.pointerId) || !last) return;
      this.azimuth -= (event.clientX - last.clientX) * 0.008;
      this.polar = clamp(
        this.polar - (event.clientY - last.clientY) * 0.008, ...POLAR_LIMITS);
      last = event;
      this.#invalidate();
    });

    const release = (event) => {
      pointers.delete(event.pointerId);
      last = null;
      this.lastInput = performance.now();

      // Nach dem Loslassen zeichnet niemand mehr - ohne diesen Wecker bliebe
      // die Ansicht stehen, wo der Zeiger sie gelassen hat.
      clearTimeout(this.returnTimer);
      this.returnTimer = setTimeout(() => this.#invalidate(), RETURN_DELAY + 20);
    };
    this.canvas.addEventListener("pointerup", release);
    this.canvas.addEventListener("pointercancel", release);
  }

  async load(url) {
    const gltf = await new GLTFLoader().loadAsync(url);
    this.pivot.add(gltf.scene);
    this.pivot.updateMatrixWorld(true);

    for (const part of PARTS) {
      for (const side of SIDES) {
        const key = `${part}_${side}`;
        const node = gltf.scene.getObjectByName(key);
        if (!node) throw new Error(`node "${key}" missing`);
        this.nodes[key] = node;
        this.skins[key] = materialsOf(node);
      }
    }

    // Die Wege gehoeren zur Mechanik und kommen deshalb aus dem Modell. Zahlen
    // in der Seite waeren eine zweite Stelle, an die denken muesste, wer die
    // Mechanik aendert.
    for (const [name, fallback] of Object.entries(FALLBACK)) {
      const value = Number(gltf.scene.userData?.[name]);
      this.travel[name] = Number.isFinite(value) && value > 0 ? value : fallback;
    }

    this.#measure(gltf.scene);
    this.#invalidate();
    return this;
  }

  // Aeussere Punkte und Mittelpunkt des Modells, gemessen in der Ruhelage.
  // Was sich bewegt, bewegt sich um Millimeter und bleibt innerhalb der
  // Zugabe, die das Bild ohnehin laesst.
  #measure(root) {
    root.updateMatrixWorld(true);

    const points = [];
    const position = new THREE.Vector3();
    const box = new THREE.Box3();

    root.traverse((object) => {
      if (!object.isMesh) return;
      const attribute = object.geometry.getAttribute("position");
      for (let index = 0; index < attribute.count; index += 1) {
        position.fromBufferAttribute(attribute, index)
          .applyMatrix4(object.matrixWorld);
        box.expandByPoint(position);
        points.push(position.clone());
      }
    });

    box.getCenter(this.target);
    for (const point of points) point.sub(this.target);

    // Der Huellquader eines Controllers ist zum grossen Teil Luft - zwischen
    // den Griffen liegt nichts als die flache Platine. Gesucht sind deshalb
    // die aeussersten Punkte in vielen Richtungen, nicht die Ecken eines
    // Quaders, den nichts ausfuellt.
    const direction = new THREE.Vector3();
    this.hull = [];
    for (let index = 0; index < HULL_DIRECTIONS; index += 1) {
      // Punkte, gleichmaessig ueber die Kugel verteilt: Die Hoehe wandert
      // linear, der Umlauf im goldenen Winkel. So ballen sie sich nicht an den
      // Polen.
      const height = 1 - (2 * index + 1) / HULL_DIRECTIONS;
      const radius = Math.sqrt(Math.max(0, 1 - height * height));
      const turn = index * Math.PI * (3 - Math.sqrt(5));
      direction.set(Math.cos(turn) * radius, height, Math.sin(turn) * radius);

      let best = null;
      let reach = -Infinity;
      for (const point of points) {
        const along = point.dot(direction);
        if (along > reach) {
          reach = along;
          best = point;
        }
      }
      if (best) this.hull.push(best.clone());
    }

    this.#updateFraming();
  }

  // ─── Bewegung ───────────────────────────────────────

  // Die Achsen des Gamepads, schon um ihre Totzone bereinigt. Nach vorn
  // gedrueckt meldet die Norm -1 auf der Y-Achse; das Modell neigt den Stick
  // in dieselbe Richtung.
  setAxes(leftX, leftY, rightX, rightY) {
    this.#aim("stick_left", "x", leftX);
    this.#aim("stick_left", "y", leftY);
    this.#aim("stick_right", "x", rightX);
    this.#aim("stick_right", "y", rightY);
  }

  // Trigger und Schultertasten. Der Controller meldet fuer beide einen Wert
  // zwischen null und eins - meldet er nur gedrueckt oder frei, ist es
  // dieselbe Zahl in ihren Endlagen.
  setPress(part, side, value) {
    this.#aim(`${part}_${side}`, "press", value);
  }

  setStickPress(side, pressed) {
    this.#aim(`stick_${side}`, "press", pressed ? 1 : 0);
  }

  // Alles zurueck in die Ruhelage - beim Trennen der Verbindung meldet kein
  // Geraet mehr, dass es losgelassen wurde.
  reset() {
    this.wanted = blankState();
    this.#invalidate();
  }

  #aim(key, channel, value) {
    if (!Number.isFinite(value)) return;
    const limit = channel === "press" ? [0, 1] : [-1, 1];
    this.wanted[key][channel] = clamp(value, ...limit);
    this.#invalidate();
  }

  // ─── Bild ───────────────────────────────────────────

  #resize() {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    if (!width || !height) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.#updateFraming();
    this.#invalidate();
  }

  #invalidate() {
    if (this.frame || !this.visible || document.hidden) return;
    this.frame = requestAnimationFrame(() => this.#draw());
  }

  // Der Abstand gilt fuer jede erreichbare Blickrichtung, nicht nur fuer die
  // gerade gezeigte: Sonst wuechse und schrumpfte das Geraet beim Drehen.
  // Gesucht ist also die unguenstigste Lage.
  #updateFraming() {
    if (!this.hull.length) return;

    const vertical = Math.tan(THREE.MathUtils.degToRad(this.camera.fov) * 0.5);
    const horizontal = vertical * this.camera.aspect;
    const [lowPolar, highPolar] = POLAR_LIMITS;
    let worst = 0;

    for (let a = 0; a < FRAMING_AZIMUTHS; a += 1) {
      const azimuth = (a / FRAMING_AZIMUTHS) * Math.PI * 2;
      for (let p = 0; p <= FRAMING_POLARS; p += 1) {
        const polar = lowPolar + (highPolar - lowPolar) * (p / FRAMING_POLARS);
        worst = Math.max(worst,
          this.#fitDistance(azimuth, polar, horizontal, vertical));
      }
    }
    this.distance = worst * FIT_MARGIN;
  }

  // Wie weit muss die Kamera weg, damit das Modell ins Bild passt? Ein Punkt
  // ist sichtbar, solange sein seitlicher Abstand kleiner bleibt als die
  // Bildbreite in seiner Tiefe - nach dem Abstand aufgeloest ergibt das je
  // Huellpunkt eine Untergrenze, die groesste davon gilt.
  #fitDistance(azimuth, polar, horizontal, vertical) {
    this.direction.set(
      Math.sin(polar) * Math.sin(azimuth),
      Math.cos(polar),
      Math.sin(polar) * Math.cos(azimuth),
    );
    this.right.crossVectors(this.worldUp, this.direction).normalize();
    this.upward.crossVectors(this.direction, this.right);

    let distance = 0;
    for (const point of this.hull) {
      const depth = point.dot(this.direction);
      distance = Math.max(distance,
        depth + Math.abs(point.dot(this.right)) / horizontal,
        depth + Math.abs(point.dot(this.upward)) / vertical);
    }
    return distance;
  }

  #draw() {
    this.frame = 0;
    let moving = false;

    for (const key of Object.keys(this.wanted)) {
      const wanted = this.wanted[key];
      const shown = this.shown[key];
      for (const channel of Object.keys(wanted)) {
        const gap = wanted[channel] - shown[channel];
        if (Math.abs(gap) > SETTLED) {
          shown[channel] += gap * EASE;
          moving = true;
        } else {
          shown[channel] = wanted[channel];
        }
      }
      this.#place(key, shown);
    }

    if (performance.now() - this.lastInput > RETURN_DELAY) {
      const azimuth = shortestAngle(this.azimuth, HOME.azimuth);
      const polar = HOME.polar - this.polar;
      this.azimuth += azimuth * RETURN_EASE;
      this.polar += polar * RETURN_EASE;
      const arrived = Math.abs(azimuth) <= 1e-4 && Math.abs(polar) <= 1e-4;
      moving = moving || !arrived;
      if (arrived) {
        this.azimuth = HOME.azimuth;
        this.polar = HOME.polar;
      }
    }

    this.direction.set(
      Math.sin(this.polar) * Math.sin(this.azimuth),
      Math.cos(this.polar),
      Math.sin(this.polar) * Math.cos(this.azimuth),
    );
    this.camera.position.copy(this.direction)
      .multiplyScalar(this.distance).add(this.target);
    this.camera.lookAt(this.target);

    this.renderer.render(this.scene, this.camera);
    if (moving) this.#invalidate();
  }

  // Wohin ein Teil gehoert, wenn es so weit ausgelenkt ist. Die Knoten sitzen
  // im Modell schon an der richtigen Stelle - der Trigger auf seinem Bolzen,
  // der Stick auf seinem Kugelpunkt -, deshalb genuegt hier ein Winkel oder
  // ein Weg um die eigene Achse.
  #place(key, shown) {
    const node = this.nodes[key];
    if (!node) return;

    if (key.startsWith("trigger")) {
      node.rotation.x = THREE.MathUtils.degToRad(
        this.travel.triggerTravel * shown.press);
    } else if (key.startsWith("bumper")) {
      // Die Schultertaste schiebt sich auf den Betrachter zu, also nach +Z.
      node.position.z = this.travel.bumperTravel * shown.press;
    } else {
      // Diagonal ausgelenkt melden beide Achsen fast eins. Ohne diese
      // Begrenzung neigte sich der Stick in die Ecken weiter als an seinen
      // Anschlag - der Weg ist aber ein Kreis, kein Quadrat.
      const reach = Math.hypot(shown.x, shown.y);
      const scale = reach > 1 ? 1 / reach : 1;
      const tilt = THREE.MathUtils.degToRad(this.travel.stickTilt);
      node.rotation.x = tilt * shown.y * scale;
      node.rotation.z = -tilt * shown.x * scale;
      node.position.y = -this.travel.stickPress * shown.press;
    }

    this.#tint(key, shown.press);
  }

  // Der Farbauftrag des gedrueckten Teils. Er waechst mit dem Weg: Ein
  // halb gezogener Trigger ist halb eingefaerbt, und wo der Controller nur
  // gedrueckt oder frei meldet, springt die Farbe eben.
  #tint(key, amount) {
    for (const material of this.skins[key] ?? []) {
      if (!material.userData.baseColor) {
        material.userData.baseColor = material.color.clone();
        material.emissive = new THREE.Color(PRESS_COLOR);
      }
      material.color.copy(material.userData.baseColor)
        .lerp(PRESS_TONE, amount * 0.85);
      material.emissiveIntensity = amount * PRESS_GLOW;
    }
  }
}

function blankState() {
  const state = {};
  for (const part of PARTS) {
    for (const side of SIDES) {
      state[`${part}_${side}`] = part === "stick"
        ? { x: 0, y: 0, press: 0 } : { press: 0 };
    }
  }
  return state;
}

// Die Werkstoffe unter einem Knoten. Jeder bewegliche Teil hat im Modell einen
// eigenen - das Ausfuhrskript trennt die Netze nach Knoten -, eingefaerbt wird
// deshalb nur, was auch wirklich gedrueckt wurde.
function materialsOf(node) {
  const found = new Set();
  node.traverse((object) => {
    if (!object.isMesh) return;
    for (const material of [].concat(object.material)) found.add(material);
  });
  return [...found];
}

function clamp(value, low, high) {
  return Math.min(high, Math.max(low, value));
}

// Der kuerzere der beiden Wege zwischen zwei Winkeln - sonst liefe die Ansicht
// bei der Rueckkehr einmal aussen herum.
function shortestAngle(from, to) {
  return ((to - from + Math.PI) % (Math.PI * 2) + Math.PI * 2)
    % (Math.PI * 2) - Math.PI;
}
