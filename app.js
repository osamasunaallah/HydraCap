// HydraCap: every 3D scene on the page and the pills that spill onto it.
//   hero       clear bottle with the integrated flip-top cap
//   duo        both integrations floating side by side; one click opens both
//   story      bottle -> compartment with rope -> tied on, or built into the cap
//   iterations round cap, round elastic case, rectangular rope case
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const V3 = THREE.Vector3;
const DEG = Math.PI / 180;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp01 = t => Math.max(0, Math.min(1, t));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = t => t * t * (3 - 2 * t);
const backOut = t => 1 + 2.4 * Math.pow(t - 1, 3) + 1.4 * Math.pow(t - 1, 2);

// capsule colour pairs from the product photos
const PAIRS = [['#ffffff', '#ffffff'], ['#2f6fd6', '#f4f1ea'], ['#f2c14e', '#2f6fd6'], ['#ec6f93', '#ec6f93'],
               ['#d8462f', '#f4f1ea'], ['#f4f1ea', '#2a9d6f'], ['#ffffff', '#d8462f']];
const TABS = ['#f6f4ef', '#f6f4ef', '#f3d9c2', '#ec9fb4', '#f2c14e'];
const pick = a => a[Math.random() * a.length | 0];
const rnd = (a, b) => a + Math.random() * (b - a);

const plastic = (color, rough = .45) => new THREE.MeshPhysicalMaterial({ color, roughness: rough, metalness: 0, clearcoat: .25, clearcoatRoughness: .5 });

/* ---------- textures made in code ---------- */
function canvasTex(w, h, draw, repeat = [1, 1], srgb = true){
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
// twisted rope: diagonal strands with dark grooves
const ropeMap = () => canvasTex(64, 64, (x, w, h) => {
  x.fillStyle = '#5c1724'; x.fillRect(0, 0, w, h);
  for (let i = -2; i < 6; i++){
    const g = x.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, '#3b0c15'); g.addColorStop(.35, '#7e2b3a'); g.addColorStop(.6, '#6a1f2d'); g.addColorStop(1, '#3b0c15');
    x.fillStyle = g; x.save(); x.translate(i * 16, 0); x.transform(1, 0, -.9, 1, 0, 0); x.fillRect(0, 0, 14, h); x.restore();
  }
  for (let i = 0; i < 400; i++){ x.fillStyle = `rgba(255,220,225,${Math.random() * .05})`; x.fillRect(Math.random() * w, Math.random() * h, 1, 1); }
});
const ropeBump = () => canvasTex(64, 64, (x, w, h) => {
  x.fillStyle = '#000'; x.fillRect(0, 0, w, h);
  for (let i = -2; i < 6; i++){ const g = x.createLinearGradient(0, 0, w, 0); g.addColorStop(0, '#000'); g.addColorStop(.5, '#fff'); g.addColorStop(1, '#000');
    x.fillStyle = g; x.save(); x.translate(i * 16, 0); x.transform(1, 0, -.9, 1, 0, 0); x.fillRect(0, 0, 14, h); x.restore(); }
}, [1, 1], false);
// fine powder-coat grain for the steel bottle
const grain = () => canvasTex(256, 256, (x, w, h) => {
  const d = x.createImageData(w, h);
  for (let i = 0; i < d.data.length; i += 4){ const v = 110 + Math.random() * 60; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
  x.putImageData(d, 0, 0);
}, [6, 6], false);

let ROPE = null;
function ropeMaterial(){
  if (!ROPE) ROPE = { map: ropeMap(), bump: ropeBump() };
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, map: ROPE.map.clone(), bumpMap: ROPE.bump.clone(), bumpScale: 2.2, roughness: .9 });
  return m;
}
function setRopeRepeat(m, len){ m.map.repeat.set(len * 34, 1); m.bumpMap.repeat.set(len * 34, 1); m.map.needsUpdate = m.bumpMap.needsUpdate = true; }

/* ---------- 3D pills: capsules, round and oval tablets, softgels, in mixed sizes ---------- */
function capsule3D(r, len, [a, b]){
  const g = new THREE.Group();
  [[a, 1], [b, -1]].forEach(([col, s]) => {
    const m = plastic(col, .28);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len / 2, 20, 1, true), m); body.position.y = s * len / 4;
    const end = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 10, 0, Math.PI * 2, s > 0 ? 0 : Math.PI / 2, Math.PI / 2), m); end.position.y = s * len / 2;
    g.add(body, end);
  });
  return g;
}
function tablet3D(r, thick, col, oval = 1){
  const prof = [[0, -thick / 2], [r * .82, -thick / 2], [r, -thick / 4], [r, thick / 4], [r * .82, thick / 2], [0, thick / 2 + thick * .12]].map(([x, y]) => new THREE.Vector2(x, y));
  const m = new THREE.Mesh(new THREE.LatheGeometry(prof, 28), plastic(col, .5));
  m.scale.set(oval, 1, 1);
  return m;
}
// amber softgel: a glossy, slightly see-through oval
function softgel3D(r){
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14),
    new THREE.MeshPhysicalMaterial({ color: 0xd99a2b, roughness: .1, clearcoat: 1, transparent: true, opacity: .9 }));
  m.scale.set(1.5, .72, .85);
  return m;
}
// k scales the whole set; returns a pill lying flat
function randomPill3D(k = 1, white = false){
  const t = Math.random();
  if (white){ const p = capsule3D(.032 * k * rnd(.85, 1.15), .1 * k * rnd(.8, 1.15), ['#ffffff', '#ffffff']); p.rotation.z = Math.PI / 2; return p; }
  if (t < .5){ const p = capsule3D(.024 * k * rnd(.7, 1.3), .07 * k * rnd(.7, 1.4), pick(PAIRS)); p.rotation.z = Math.PI / 2; return p; }
  if (t < .72) return tablet3D(.036 * k * rnd(.7, 1.25), .022 * k, pick(TABS));
  if (t < .87) return tablet3D(.03 * k * rnd(.8, 1.2), .022 * k, pick(TABS), 1.6);
  return softgel3D(.024 * k * rnd(.85, 1.2));
}

/* ---------- open / close behaviour for a hinged lid with pills inside ---------- */
function compartment({ pivot, caps, openAngle, mouth, mouthParent, hit }){
  let open = false, t0 = -1e9;
  // the pills inside stay put, so an open compartment never looks empty; copies of them jump out
  const jumpers = caps.map(c => { const j = c.clone(true); j.userData.home = c.userData.home.clone(); j.visible = false; c.parent.add(j); return j; });
  return {
    hit, pivot,
    isOpen: () => open,
    set(v){ if (v === open) return false; open = v; t0 = performance.now(); return true; },
    mouthWorld: () => mouthParent.localToWorld(mouth.clone()),
    update(){
      const now = performance.now(), k = clamp01((now - t0) / 650);
      pivot.rotation.x = open ? openAngle * backOut(k) : openAngle * (1 - smooth(k));
      const j = clamp01((now - t0 - 160) / 520);
      jumpers.forEach((c, i) => {
        const h = c.userData.home;
        c.visible = open && j > 0 && j < 1;
        if (!c.visible) return;
        c.position.set(h.x * (1 + j * 1.6), h.y + Math.sin(j * Math.PI) * (.25 + (i % 3) * .06), h.z * (1 + j * 1.6));
        c.scale.setScalar(Math.max(0, 1 - j * 1.25));
      });
    }
  };
}

function contactShadow(size, strength = .42){
  const tex = canvasTex(128, 128, (x) => { const g = x.createRadialGradient(64, 64, 4, 64, 64, 64);
    g.addColorStop(0, `rgba(15,40,70,${strength})`); g.addColorStop(1, 'rgba(15,40,70,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = .003;
  return m;
}

// see-through plastic: nearly invisible face-on, tinted at the silhouette, with two highlight streaks
function clearMat(edge, base, edgeAlpha, side){
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side,
    uniforms: { uEdge: { value: new THREE.Color(edge) }, uBase: { value: base }, uEdgeA: { value: edgeAlpha } },
    vertexShader: `varying vec3 vN; varying vec3 vV;
      void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uEdge; uniform float uBase; uniform float uEdgeA; varying vec3 vN; varying vec3 vV;
      void main(){
        vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n;
        float f = pow(1. - abs(dot(n, vV)), 2.4);
        float s1 = smoothstep(.93, .99, dot(n, normalize(vec3(.55, .2, .8))));
        float s2 = smoothstep(.965, .995, dot(n, normalize(vec3(-.7, .1, .7))));
        vec3 c = mix(uEdge, vec3(1.), clamp(s1 + s2 * .7, 0., 1.));
        gl_FragColor = vec4(c, clamp(uBase + uEdgeA * f + s1 * .55 + s2 * .3, 0., 1.));
      }`,
  });
}

/* ======================================================================
   MODELS
   ====================================================================== */

// clear water bottle; integrated flip-top cap (default), or a plain screw cap that can morph into it
function buildCapBottle({ lid = '#f6f4ef', collar = 0x16161a, white = false, plain = false } = {}){
  const grp = new THREE.Group();
  const prof = [[0, 0], [.4, 0], [.5, .03], [.54, .1], [.54, .42], [.51, .5], [.54, .58], [.54, 1.22], [.52, 1.34], [.46, 1.48],
                [.37, 1.6], [.29, 1.69], [.27, 1.75], [.27, 1.9]].map(([r, y]) => new THREE.Vector2(r, y));
  const geo = new THREE.LatheGeometry(prof, 96);
  const back = new THREE.Mesh(geo, clearMat('#7f949c', 0, .22, THREE.BackSide)); back.renderOrder = 1;
  const front = new THREE.Mesh(geo, clearMat('#7f949c', .015, .55, THREE.FrontSide)); front.renderOrder = 3;
  const wprof = prof.map(v => new THREE.Vector2(Math.max(0, v.x - .025), v.y)).filter(v => v.y <= 1.2);
  wprof.push(new THREE.Vector2(.515, 1.2), new THREE.Vector2(0, 1.2));
  const water = new THREE.Mesh(new THREE.LatheGeometry(wprof, 96), clearMat('#86c2d8', .1, .4, THREE.FrontSide)); water.position.y = .02; water.renderOrder = 2;
  grp.add(back, water, front, contactShadow(2));

  // ribbed collar
  const cg = new THREE.CylinderGeometry(.32, .32, .3, 240, 1, true), pos = cg.attributes.position;
  for (let i = 0; i < pos.count; i++){ const a = Math.atan2(pos.getZ(i), pos.getX(i)), r = .318 + .014 * Math.pow(.5 + .5 * Math.cos(a * 60), 2); pos.setX(i, Math.cos(a) * r); pos.setZ(i, Math.sin(a) * r); }
  cg.computeVertexNormals();
  const black = plastic(collar, .55);
  const collarM = new THREE.Mesh(cg, black); collarM.position.y = 2.02;
  const ringBot = new THREE.Mesh(new THREE.TorusGeometry(.32, .018, 10, 96), black); ringBot.rotation.x = Math.PI / 2; ringBot.position.y = 1.875;
  grp.add(collarM, ringBot);

  // plain screw cap (story step 1)
  const plainCap = new THREE.Mesh(new THREE.CylinderGeometry(.322, .322, .035, 96), black); plainCap.position.y = 2.185;
  grp.add(plainCap);

  // integrated compartment: ring, shallow well, hinged lid, capsules
  const integ = new THREE.Group(); grp.add(integ);
  const ringTop = new THREE.Mesh(new THREE.RingGeometry(.245, .33, 96), black); ringTop.rotation.x = -Math.PI / 2; ringTop.position.y = 2.17;
  const lidMat = plastic(lid, .32);
  const well = new THREE.Mesh(new THREE.LatheGeometry([[0, 2.19], [.205, 2.19], [.205, 2.25], [.25, 2.25], [.25, 2.1]].map(([r, y]) => new THREE.Vector2(r, y)), 96), lidMat);
  const hinge = new THREE.Mesh(new RoundedBoxGeometry(.12, .05, .05, 2, .012), lidMat); hinge.position.set(0, 2.25, -.255);
  integ.add(ringTop, well, hinge);
  const pivot = new THREE.Group(); pivot.position.set(0, 2.255, -.255); integ.add(pivot);
  const lidG = new THREE.Group(); lidG.position.z = .255; pivot.add(lidG);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(.258, .258, .035, 96), lidMat); top.position.y = .018;
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(.258, .258, .03, 96, 1, true), lidMat); skirt.position.y = -.01;
  const tab = new THREE.Mesh(new RoundedBoxGeometry(.1, .025, .06, 2, .01), lidMat); tab.position.set(0, .01, .275);
  const ridge = new THREE.Mesh(new THREE.TorusGeometry(.19, .006, 6, 80), lidMat); ridge.rotation.x = Math.PI / 2; ridge.position.y = .037;
  lidG.add(top, skirt, tab, ridge);
  const floorDisc = new THREE.Mesh(new THREE.CircleGeometry(.204, 64), plastic(0xdfe6ec, .6)); floorDisc.rotation.x = -Math.PI / 2; floorDisc.position.y = 2.193;
  integ.add(floorDisc);
  const caps = [];
  [[-.08, .04, 20], [.07, -.06, -15], [-.01, -.1, 75], [.08, .07, 40], [-.1, -.07, 110], [.02, .11, -60], [.0, .0, 5], [-.06, .12, 150]].forEach(([x, z, rot], i) => {
    const c = white ? randomPill3D(1, true) : (i % 3 === 0 ? randomPill3D(1, true) : randomPill3D(1.25));
    const holder = new THREE.Group(); holder.add(c); holder.rotation.y = rot * DEG;
    // heaped so they show over the rim
    holder.position.set(x, 2.222 + (i > 4 ? .03 : 0), z); holder.userData.home = holder.position.clone();
    integ.add(holder); caps.push(holder);
  });
  integ.visible = !plain; plainCap.visible = plain;

  const comp = compartment({ pivot, caps, openAngle: -112 * DEG, mouth: new V3(0, 2.3, 0), mouthParent: grp, hit: [well, lidG, collarM, ringTop, plainCap] });
  return { grp, comp, integ, plainCap, height: 2.3 };
}

// rectangular flip-top case (used on the steel bottle, in the story and as an iteration)
function buildRectCase({ scale = 1 } = {}){
  const g = new THREE.Group();
  const W = .5, D = .48, Hb = .17, t = .03;
  const dark = plastic(0x141416, .55);
  const floor = new THREE.Mesh(new RoundedBoxGeometry(W, t, D, 3, .012), dark); floor.position.y = t / 2;
  g.add(floor);
  [[0, D / 2 - t / 2, W, t], [0, -D / 2 + t / 2, W, t]].forEach(([x, z, w, d]) => { const m = new THREE.Mesh(new RoundedBoxGeometry(w, Hb, d, 2, .012), dark); m.position.set(x, Hb / 2, z); g.add(m); });
  [W / 2 - t / 2, -W / 2 + t / 2].forEach(x => { const m = new THREE.Mesh(new RoundedBoxGeometry(t, Hb, D, 2, .012), dark); m.position.set(x, Hb / 2, 0); g.add(m); });
  // rope channels on the back: the rope runs through these
  const channels = [];
  [-.16, .16].forEach(x => { const c = new THREE.Mesh(new THREE.TorusGeometry(.032, .012, 10, 24, Math.PI), dark); c.position.set(x, Hb * .62, -D / 2 - .002); c.rotation.set(0, Math.PI / 2, Math.PI / 2); g.add(c); channels.push(c); });
  const pivot = new THREE.Group(); pivot.position.set(0, Hb, -D / 2); g.add(pivot);
  const lid = new THREE.Mesh(new RoundedBoxGeometry(W + .012, .055, D + .012, 3, .02), dark); lid.position.set(0, .027, D / 2); pivot.add(lid);
  const hinge = new THREE.Mesh(new THREE.CylinderGeometry(.014, .014, W * .7, 12), dark); hinge.rotation.z = Math.PI / 2; hinge.position.set(0, Hb, -D / 2); g.add(hinge);
  // mixed pills filling the tray
  const caps = [];
  for (let i = 0; i < 20; i++){
    const p = randomPill3D(1), holder = new THREE.Group(); holder.add(p);
    holder.rotation.y = Math.random() * Math.PI;
    holder.position.set(rnd(-.17, .17), t + .028 + (i % 3) * .018, rnd(-.16, .16));
    holder.userData.home = holder.position.clone();
    g.add(holder); caps.push(holder);
  }
  g.scale.setScalar(scale);
  const comp = compartment({ pivot, caps, openAngle: -86 * DEG, mouth: new V3(0, Hb + .06, 0), mouthParent: g, hit: [lid, floor, ...g.children] });
  return { g, comp, W, D, Hb, channelY: Hb * .62 };
}

// rope tube along a closed or open path of points
function ropeMesh(points, closed, radius = .017){
  const curve = new THREE.CatmullRomCurve3(points, closed, 'centripetal');
  const m = ropeMaterial(); setRopeRepeat(m, curve.getLength());
  return new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(40, points.length * 3), radius, 10, closed), m);
}

// rope around a bottle of radius Rb at height y; it bulges out to run through the case channels at angle `side`
function wrapPoints(Rb, y, side, bulge, half){
  const pts = [];
  for (let i = 0; i < 160; i++){
    const a = i / 160 * Math.PI * 2;
    let d = Math.atan2(Math.sin(a - side), Math.cos(a - side));
    const w = Math.exp(-Math.pow(d / half, 6));           // flat-topped bump under the case
    const r = Rb + .017 + bulge * w;
    pts.push(new V3(Math.sin(a) * r, y - .01 * w, Math.cos(a) * r));
  }
  return pts;
}

// insulated steel bottle with the rope-tied case
function buildSteelBottle(){
  const grp = new THREE.Group();
  const g = grain();
  const coat = new THREE.MeshPhysicalMaterial({ color: 0x1c1c20, roughness: .58, metalness: .35, roughnessMap: g, bumpMap: g, bumpScale: .35, clearcoat: .25, clearcoatRoughness: .55 });
  const prof = [[0, 0], [.4, 0], [.49, .02], [.52, .08], [.525, .3], [.525, 1.5], [.515, 1.6], [.48, 1.68], [.41, 1.76], [.365, 1.81], [.358, 1.86], [0, 1.86]].map(([r, y]) => new THREE.Vector2(r, y));
  const body = new THREE.Mesh(new THREE.LatheGeometry(prof, 128), coat); grp.add(body, contactShadow(2.2, .5));
  const steel = new THREE.MeshPhysicalMaterial({ color: 0xd3d6da, roughness: .18, metalness: 1 });
  const band = new THREE.Mesh(new THREE.CylinderGeometry(.364, .364, .055, 96), steel); band.position.y = 1.888;
  const lidB = new THREE.Mesh(new THREE.LatheGeometry([[0, 1.915], [.352, 1.915], [.36, 1.95], [.36, 2.13], [.33, 2.18], [.26, 2.2], [.26, 2.3], [.2, 2.33], [0, 2.33]].map(([r, y]) => new THREE.Vector2(r, y)), 96), coat);
  const spout = new THREE.Mesh(new THREE.CylinderGeometry(.075, .085, .09, 32), coat); spout.position.set(0, 2.37, .06);
  grp.add(band, lidB, spout);
  // flexible strap handle: a flattened loop from both sides of the lid
  const hc = new THREE.CatmullRomCurve3([new V3(-.27, 2.2, -.02), new V3(-.3, 2.5, -.02), new V3(-.2, 2.72, -.02), new V3(0, 2.78, -.02), new V3(.2, 2.72, -.02), new V3(.3, 2.5, -.02), new V3(.27, 2.2, -.02)]);
  const handle = new THREE.Mesh(new THREE.TubeGeometry(hc, 60, .045, 14), coat); handle.scale.z = .55; grp.add(handle);
  [-1, 1].forEach(s => { const pin = new THREE.Mesh(new THREE.CylinderGeometry(.06, .06, .025, 32), steel); pin.rotation.z = Math.PI / 2; pin.position.set(s * .285, 2.22, -.02); grp.add(pin); });
  // printed wordmark near the bottom
  const word = canvasTex(1024, 128, (x, w, h) => { x.clearRect(0, 0, w, h); x.fillStyle = 'rgba(235,235,235,.82)'; x.font = '300 74px "Plus Jakarta Sans", Arial'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('HYDRA', w * .25 - 55, h / 2); x.font = '300 74px "Plus Jakarta Sans", Arial'; x.fillText('Cap', w * .25 + 125, h / 2); });
  const label = new THREE.Mesh(new THREE.CylinderGeometry(.527, .527, .12, 96, 1, true, -.9, 1.8), new THREE.MeshBasicMaterial({ map: word, transparent: true, depthWrite: false }));
  word.repeat.set(1, 1); label.position.y = .32; grp.add(label);

  // the case sits on the rope against the bottle, front-right
  const side = 32 * DEG, out = new V3(Math.sin(side), 0, Math.cos(side));
  const kase = buildRectCase();
  const ropeY = .96, Rb = .525, rope = .017;
  kase.g.position.copy(out.clone().multiplyScalar(Rb + rope * 2 + .006 + kase.D / 2)).setY(ropeY - kase.channelY);
  kase.g.rotation.y = side;
  grp.add(kase.g);
  grp.add(ropeMesh(wrapPoints(Rb, ropeY, side, rope * 1.1, .42), true, rope));
  return { grp, comp: kase.comp, height: 2.78 };
}

// iteration 2: round case with a hinged lid; an elastic cord runs through two side holes
function buildRoundCase(){
  const g = new THREE.Group();
  const dark = plastic(0x18181b, .5);
  const R = .255, H = .16;
  const cup = new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [R - .015, 0], [R, .02], [R, H], [R - .03, H], [R - .03, .03], [0, .03]].map(([r, y]) => new THREE.Vector2(r, y)), 72), dark);
  g.add(cup, contactShadow(1.3, .3));
  // cord holes on both sides (dark grommets)
  [-1, 1].forEach(sx => { const hole = new THREE.Mesh(new THREE.TorusGeometry(.017, .007, 8, 20), plastic(0x0a0a0c, .7)); hole.position.set(sx * (R + .002), .06, 0); hole.rotation.y = Math.PI / 2; g.add(hole); });
  // hinge: a barrel on two knuckles at the back
  const hingeY = H + .006, hingeZ = -R - .012;
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(.014, .014, .16, 16), dark); barrel.rotation.z = Math.PI / 2; barrel.position.set(0, hingeY, hingeZ); g.add(barrel);
  [-.055, .055].forEach(x => { const k = new THREE.Mesh(new RoundedBoxGeometry(.04, .045, .03, 2, .008), dark); k.position.set(x, H - .015, hingeZ + .004); g.add(k); });
  const pivot = new THREE.Group(); pivot.position.set(0, hingeY, hingeZ); g.add(pivot);
  const lidG = new THREE.Group(); pivot.add(lidG);
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(R + .006, R + .006, .045, 72), dark); lid.position.set(0, .012, R + .012); lidG.add(lid);
  const leaf = new THREE.Mesh(new RoundedBoxGeometry(.05, .03, .04, 2, .008), dark); leaf.position.set(0, .006, .012); lidG.add(leaf);
  const tab = new THREE.Mesh(new RoundedBoxGeometry(.07, .02, .05, 2, .008), dark); tab.position.set(0, .01, 2 * R + .035); lidG.add(tab);
  const caps = [];
  [[-.08, .02, 30], [.06, -.05, -20], [.0, .09, 80], [.1, .06, 10]].forEach(([x, z, r], i) => { const h = new THREE.Group(); h.add(i === 3 ? tablet3D(.04, .022, '#f6f4ef') : capsule3D(.04, .13, ['#ffffff', '#ffffff'])); if (i < 3) h.children[0].rotation.z = Math.PI / 2; h.rotation.y = r * DEG; h.position.set(x, .075, z); h.userData.home = h.position.clone(); g.add(h); caps.push(h); });
  // elastic: in through one hole, along the floor inside, out the other hole, and a loop resting behind the case
  const y0 = .06, pts = [
    new V3(R + .01, y0, 0), new V3(R + .14, .04, -.06), new V3(R + .2, .014, -.3), new V3(.18, .012, -.62), new V3(0, .012, -.7),
    new V3(-.18, .012, -.62), new V3(-R - .2, .014, -.3), new V3(-R - .14, .04, -.06), new V3(-R - .01, y0, 0), new V3(-R + .05, .045, 0), new V3(R - .05, .045, 0)];
  const elastic = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true, 'centripetal'), 200, .011, 8, true),
    new THREE.MeshPhysicalMaterial({ color: 0xc9a03a, roughness: .45, metalness: .35, sheen: .6, sheenColor: new THREE.Color('#ffe7a0') }));
  g.add(elastic);
  return { grp: g, comp: compartment({ pivot, caps, openAngle: -100 * DEG, mouth: new V3(0, .22, 0), mouthParent: g, hit: [cup, lid, barrel] }), height: .4 };
}

/* ======================================================================
   PILLS ON THE PAGE: 2D layer; mixed shapes and sizes fall, bounce, pile up
   and can be pushed with the pointer
   ====================================================================== */
class PillRain {
  constructor(host){
    this.host = host;
    this.cv = document.createElement('canvas'); this.cv.className = 'pillrain'; this.cv.setAttribute('aria-hidden', 'true');
    host.appendChild(this.cv);
    this.cx = this.cv.getContext('2d');
    this.pills = []; this.mouse = { x: -1e4, y: -1e4 };
    host.addEventListener('pointermove', e => { const r = host.getBoundingClientRect(); this.mouse.x = e.clientX - r.left; this.mouse.y = e.clientY - r.top; });
    host.addEventListener('pointerleave', () => { this.mouse.x = this.mouse.y = -1e4; });
    new ResizeObserver(() => this.size()).observe(host); this.size();
  }
  size(){ const dpr = Math.min(devicePixelRatio || 1, 2); this.W = this.host.clientWidth; this.H = this.host.clientHeight; this.cv.width = this.W * dpr; this.cv.height = this.H * dpr; this.cx.setTransform(dpr, 0, 0, dpr, 0, 0); }
  spawn(x, y, n, spread = 1){
    for (let i = 0; i < n; i++){
      const t = Math.random(), s = rnd(.6, 1.45);   // mixed sizes
      const kind = t < .45 ? 'cap' : t < .62 ? 'tab' : t < .76 ? 'oval' : t < .88 ? 'gel' : 'mini';
      const r = { cap: 7, tab: 9, oval: 8, gel: 7.5, mini: 5 }[kind] * s;
      this.pills.push({ kind, r, x: x + rnd(-10, 10), y: y + rnd(-6, 6), vx: rnd(-1, 1) * 520 * spread, vy: rnd(-640, -260),
        ang: Math.random() * Math.PI, va: rnd(-14, 14), life: 1, a: pick(PAIRS), tab: pick(TABS) });
    }
    const extra = this.pills.length - 150; for (let i = 0; i < extra; i++) this.pills[i].dying = true;
  }
  clear(){ this.pills.forEach(p => p.dying = true); }
  step(dt){
    const P = this.pills, G = 2100, floor = this.H - 6, h = dt / 3;
    for (let s = 0; s < 3; s++){
      for (const p of P){
        p.vy += G * h;
        const dx = p.x - this.mouse.x, dy = p.y - this.mouse.y, d2 = dx * dx + dy * dy;
        if (d2 < 3600 && d2 > 1){ const d = Math.sqrt(d2), f = (60 - d) * 40; p.vx += dx / d * f * h; p.vy += dy / d * f * h; }
        p.x += p.vx * h; p.y += p.vy * h; p.ang += p.va * h;
        const rr = p.kind === 'cap' || p.kind === 'oval' || p.kind === 'gel' ? p.r * .95 : p.r;
        if (p.y > floor - rr){ p.y = floor - rr; if (p.vy > 0) p.vy *= -.3; p.vx *= .9; p.va = p.vx / (p.r * 2.4); }
        if (p.x < p.r){ p.x = p.r; p.vx = Math.abs(p.vx) * .5; }
        if (p.x > this.W - p.r){ p.x = this.W - p.r; p.vx = -Math.abs(p.vx) * .5; }
      }
      for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++){
        const A = P[i], B = P[j], dx = B.x - A.x, dy = B.y - A.y, min = (A.r + B.r) * 1.05, d2 = dx * dx + dy * dy;
        if (d2 >= min * min || d2 === 0) continue;
        const d = Math.sqrt(d2), o = (min - d) / 2, nx = dx / d, ny = dy / d;
        A.x -= nx * o; A.y -= ny * o; B.x += nx * o; B.y += ny * o;
        const rv = (B.vx - A.vx) * nx + (B.vy - A.vy) * ny;
        if (rv < 0){ const imp = -rv * .6; A.vx -= nx * imp; A.vy -= ny * imp; B.vx += nx * imp; B.vy += ny * imp; }
      }
    }
    for (const p of P){ p.va *= .985; if (p.dying) p.life -= dt * 1.6; }
    this.pills = P.filter(p => p.life > 0);
  }
  draw(){
    const c = this.cx; c.clearRect(0, 0, this.W, this.H);
    for (const p of this.pills){
      c.save(); c.globalAlpha = Math.max(0, p.life); c.translate(p.x, p.y); c.rotate(p.ang);
      c.shadowColor = 'rgba(15,35,60,.22)'; c.shadowBlur = 6; c.shadowOffsetY = 3;
      const r = p.r;
      if (p.kind === 'cap'){
        const L = r * 2.8;
        c.fillStyle = p.a[0]; c.beginPath(); c.moveTo(0, -r); c.lineTo(-L / 2 + r, -r); c.arc(-L / 2 + r, 0, r, -Math.PI / 2, Math.PI / 2, true); c.lineTo(0, r); c.closePath(); c.fill();
        c.fillStyle = p.a[1]; c.beginPath(); c.moveTo(0, -r); c.lineTo(L / 2 - r, -r); c.arc(L / 2 - r, 0, r, -Math.PI / 2, Math.PI / 2); c.lineTo(0, r); c.closePath(); c.fill();
        c.shadowColor = 'transparent'; c.fillStyle = 'rgba(255,255,255,.45)'; c.fillRect(-L / 2 + r, -r * .62, L - 2 * r, r * .28);
      } else if (p.kind === 'tab' || p.kind === 'mini'){
        c.fillStyle = p.tab; c.beginPath(); c.arc(0, 0, r, 0, 7); c.fill();
        c.shadowColor = 'transparent'; c.strokeStyle = 'rgba(0,0,0,.1)'; c.lineWidth = 1;
        c.beginPath(); c.arc(0, 0, r * .78, 0, 7); c.stroke();
        if (p.kind === 'tab'){ c.beginPath(); c.moveTo(-r * .55, 0); c.lineTo(r * .55, 0); c.stroke(); }
      } else if (p.kind === 'oval'){
        c.fillStyle = p.tab; c.beginPath(); c.ellipse(0, 0, r * 1.55, r * .85, 0, 0, 7); c.fill();
        c.shadowColor = 'transparent'; c.strokeStyle = 'rgba(0,0,0,.1)'; c.beginPath(); c.moveTo(-r * .8, 0); c.lineTo(r * .8, 0); c.stroke();
      } else {   // softgel
        const g = c.createRadialGradient(-r * .5, -r * .35, 1, 0, 0, r * 1.6);
        g.addColorStop(0, '#ffe7a6'); g.addColorStop(.45, '#e3a531'); g.addColorStop(1, '#a8650f');
        c.fillStyle = g; c.beginPath(); c.ellipse(0, 0, r * 1.45, r * .82, 0, 0, 7); c.fill();
        c.shadowColor = 'transparent'; c.fillStyle = 'rgba(255,255,255,.55)'; c.beginPath(); c.ellipse(-r * .45, -r * .3, r * .45, r * .16, -.2, 0, 7); c.fill();
      }
      c.restore();
    }
  }
}

/* ======================================================================
   STAGE: renderer + camera + drag to turn + click targets
   ====================================================================== */
function stage(el, label, { camPos, target, spin = false, fit = .62, polar = [55, 98] }){
  const R = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  R.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  R.outputColorSpace = THREE.SRGBColorSpace; R.toneMapping = THREE.ACESFilmicToneMapping; R.toneMappingExposure = 1.05;
  el.appendChild(R.domElement);
  R.domElement.setAttribute('role', 'img'); R.domElement.setAttribute('aria-label', label);
  const S = new THREE.Scene();
  S.environment = new THREE.PMREMGenerator(R).fromScene(new RoomEnvironment(R), .04).texture;
  S.add(new THREE.HemisphereLight(0xf2f9ff, 0x6f8aa3, .7));
  const key = new THREE.DirectionalLight(0xffffff, 2.3); key.position.set(3, 5, 4); S.add(key);
  const rim = new THREE.DirectionalLight(0xd8efff, 1.5); rim.position.set(-4, 3, -3); S.add(rim);
  const cam = new THREE.PerspectiveCamera(30, 1, .05, 60); cam.position.copy(camPos);
  const ctl = new OrbitControls(cam, R.domElement);
  ctl.target.copy(target); ctl.enableZoom = false; ctl.enablePan = false; ctl.enableDamping = true; ctl.dampingFactor = .08;
  ctl.minPolarAngle = polar[0] * DEG; ctl.maxPolarAngle = polar[1] * DEG;
  ctl.autoRotate = spin && !reduced; ctl.autoRotateSpeed = .7; ctl.update();
  const targets = [];
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const hitAt = e => {
    const r = R.domElement.getBoundingClientRect();
    ndc.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
    ray.setFromCamera(ndc, cam);
    return targets.find(t => ray.intersectObjects(t.objs, true).length);
  };
  let down = null;
  R.domElement.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; ctl.autoRotate = false; });
  R.domElement.addEventListener('pointermove', e => { R.domElement.style.cursor = hitAt(e) ? 'pointer' : 'grab'; });
  R.domElement.addEventListener('pointerup', e => {
    if (down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) < 6){ const t = hitAt(e); if (t) t.fn(); }
    down = null; setTimeout(() => { ctl.autoRotate = spin && !reduced; }, 3000);
  });
  const size = () => { const w = el.clientWidth, h = el.clientHeight; if (!w || !h) return;
    R.setSize(w, h, false); cam.aspect = w / h; cam.zoom = Math.min(1, cam.aspect / fit); cam.updateProjectionMatrix(); };
  new ResizeObserver(size).observe(el); size();
  let visible = true; new IntersectionObserver(([en]) => visible = en.isIntersecting).observe(el);
  return {
    S, cam,
    onClick(objs, fn){ targets.push({ objs, fn }); },
    toHost(p, host){ const v = p.clone().project(cam), r = R.domElement.getBoundingClientRect(), hr = host.getBoundingClientRect();
      return { x: r.left - hr.left + (v.x + 1) / 2 * r.width, y: r.top - hr.top + (1 - v.y) / 2 * r.height }; },
    frame(fn){ if (!visible) return; fn && fn(); ctl.update(); R.render(S, cam); }
  };
}

function spill(st, comp, rain, host, n){
  setTimeout(() => {
    const p = st.toHost(comp.mouthWorld(), host);
    rain.spawn(p.x, p.y, 4, .8);
    let k = 0; const t = setInterval(() => { rain.spawn(p.x, p.y, 2, 1); if (++k >= n) clearInterval(t); }, 70);
  }, 260);
}

/* ======================================================================
   SCENES
   ====================================================================== */
const $ = s => document.querySelector(s);
const scenes = [];

/* hero */
{
  const host = $('#hero'), rain = new PillRain(host);
  const st = stage($('#hero3d'), 'Interactive 3D HydraCap bottle. Drag to turn it, click the lid to open the pill compartment.',
    { camPos: new V3(3.1, 4.3, 5.3), target: new V3(0, 1.3, 0), spin: true, polar: [40, 92] });
  const m = buildCapBottle(); st.S.add(m.grp);
  const btn = $('[data-toggle="hero"]');
  const set = v => { if (!m.comp.set(v)) return; btn.setAttribute('aria-pressed', v); btn.querySelector('span').textContent = v ? 'Close the cap' : 'Open the cap';
    if (v) spill(st, m.comp, rain, host, 14); else rain.clear(); };
  st.onClick(m.comp.hit, () => set(!m.comp.isOpen()));
  btn.addEventListener('click', () => set(!m.comp.isOpen()));
  scenes.push({ st, rain, update: () => m.comp.update() });
  if (!reduced) setTimeout(() => set(true), 2200);
}

/* duo: both integrations floating; one click opens both */
{
  const host = $('#duo'), rain = new PillRain(host);
  const st = stage($('#duo3d'), 'Both HydraCap integrations floating side by side. Click either compartment to open both.',
    { camPos: new V3(0, 2.3, 8.6), target: new V3(0, 1.25, 0), fit: 1.1, polar: [62, 92] });
  const a = buildCapBottle(), b = buildSteelBottle();
  a.grp.position.x = -1.05; b.grp.position.x = 1.05; b.grp.rotation.y = -.25;
  st.S.add(a.grp, b.grp);
  const btn = $('[data-toggle="duo"]'), lblA = $('#lblA'), lblB = $('#lblB');
  const set = v => { const ch = a.comp.set(v) | b.comp.set(v); if (!ch) return;
    btn.setAttribute('aria-pressed', v); btn.querySelector('span').textContent = v ? 'Close both' : 'Open both';
    if (v){ spill(st, a.comp, rain, host, 9); spill(st, b.comp, rain, host, 9); } else rain.clear(); };
  st.onClick([...a.comp.hit, ...b.comp.hit], () => set(!a.comp.isOpen()));
  btn.addEventListener('click', () => set(!a.comp.isOpen()));
  scenes.push({ st, rain, update(t){
    a.grp.position.y = .1 + Math.sin(t * 1.1) * .07; a.grp.rotation.y = Math.sin(t * .4) * .35;
    b.grp.position.y = .1 + Math.sin(t * 1.1 + 1.6) * .07; b.grp.rotation.y = -.15 + Math.sin(t * .4 + 1) * .35;
    a.comp.update(); b.comp.update();
    [[lblA, a], [lblB, b]].forEach(([el, m]) => { const p = st.toHost(new V3(m.grp.position.x, -.12, 0), host); el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, 0)`; });
  } });
}

/* story: the bottle, then a compartment with a rope, then tied on, or built into the cap */
{
  const el = $('#story3d');
  const st = stage(el, 'How HydraCap comes together: a bottle, a pill compartment on a rope, tied onto the bottle or built into the cap.',
    { camPos: new V3(2.2, 2.2, 7.4), target: new V3(0, 1.15, 0), fit: .9, polar: [60, 92] });
  const bottle = buildCapBottle({ plain: true }); st.S.add(bottle.grp);
  const kase = buildRectCase(); st.S.add(kase.g);
  let rope = null;
  const steps = [...document.querySelectorAll('#storySteps button')];
  let target = 0, p = 0, lastStep = performance.now(), manualAt = -1e9;
  const stageEl = el.parentElement;
  const go = i => {
    if (i === 0 && target === steps.length - 1){ p = 0; stageEl.classList.add('reset'); setTimeout(() => stageEl.classList.remove('reset'), 450); }
    target = i; lastStep = performance.now();
    steps.forEach((b, j) => b.setAttribute('aria-current', j === i ? 'step' : 'false'));
    $('#storyText').textContent = steps[i].dataset.text;
  };
  steps.forEach((b, i) => b.addEventListener('click', () => { manualAt = performance.now(); if (i === 0) p = 0; go(i); }));
  go(0);
  const side = 32 * DEG, out = new V3(Math.sin(side), 0, Math.cos(side)), Rb = .54, ropeY = .96;
  let ropeKey = '';
  scenes.push({ st, update(t){
    const nowMs = performance.now();
    if (!reduced && nowMs - lastStep > 4200 && nowMs - manualAt > 9000) go((target + 1) % steps.length);
    p += (target - p) * .045; if (Math.abs(target - p) < .002) p = target;
    const s1 = smooth(clamp01(p)), s2 = smooth(clamp01(p - 1)), s3 = smooth(clamp01(p - 2));
    // bottle slides left to make room, then back to the centre
    bottle.grp.position.x = -.75 * s1 * (1 - s2);
    bottle.grp.position.y = Math.sin(t * 1.1) * .04;
    // case: appears beside the bottle, moves onto its side (tie-on), then shrinks into the cap (built-in)
    const free = new V3(.95, .9 + Math.sin(t * 1.3) * .05, .2);
    const onBottle = out.clone().multiplyScalar(Rb + .04 + kase.D / 2).setY(ropeY - kase.channelY).add(new V3(bottle.grp.position.x, bottle.grp.position.y, 0));
    const inCap = new V3(bottle.grp.position.x, 2.1 + bottle.grp.position.y, 0);
    const cp = free.clone().lerp(onBottle, s2).lerp(inCap, s3);
    kase.g.position.copy(cp);
    kase.g.rotation.y = lerp(-.35 + Math.sin(t * .6) * .2, side, s2);
    kase.g.scale.setScalar(Math.max(.001, s1 * (1 - s3)));
    // rope: a loose loop through the case, then wrapped around the bottle
    const key = (s1 * (1 - s3)).toFixed(2) + '|' + s2.toFixed(3) + '|' + cp.x.toFixed(3) + '|' + cp.y.toFixed(2);
    if (key !== ropeKey){
      ropeKey = key;
      if (rope){ st.S.remove(rope); rope.geometry.dispose(); }
      const vis = s1 * (1 - s3);
      if (vis > .02){
        const loop = [], wrap = wrapPoints(Rb, ropeY, side, .02, .42);
        const cx = cp.x, cy = cp.y + kase.channelY * kase.g.scale.y;
        for (let i = 0; i < 160; i++){ const a = i / 160 * Math.PI * 2; loop.push(new V3(cx + Math.cos(a) * .32, cy - .12 - Math.sin(a) * .22 - .1, cp.z - .1 + Math.sin(a) * .04)); }
        const pts = loop.map((q, i) => q.clone().lerp(wrap[i].clone().add(new V3(bottle.grp.position.x, bottle.grp.position.y, 0)), s2));
        rope = ropeMesh(pts, true, .017 * Math.max(.2, vis)); st.S.add(rope);
      } else rope = null;
    }
    // built-in: the plain cap becomes the integrated flip-top cap, then it opens
    bottle.plainCap.visible = s3 < .5;
    bottle.integ.visible = s3 >= .5;
    bottle.integ.scale.set(1, 1, 1);
    bottle.comp.set(p > 2.95);
    bottle.comp.update();
    kase.comp.set(p > .95 && p < 1.4);
    kase.comp.update();
  } });
}

/* iterations: three prototypes in 3D */
{
  const host = $('#iterations'), rain = new PillRain(host);
  const st = stage($('#iter3d'), 'Three HydraCap iterations in 3D: round flip-top cap, round case on an elastic loop, rectangular case on a rope. Click one to open it.',
    { camPos: new V3(0, 1.7, 7.6), target: new V3(0, .72, 0), fit: 1.5, polar: [62, 90] });
  const i1 = buildCapBottle({ lid: '#ec6f93', white: true }); i1.grp.scale.setScalar(.78); i1.grp.position.x = -2.15;
  const i2 = buildRoundCase(); i2.grp.scale.setScalar(2.5); i2.grp.position.set(0, .3, 0);
  const i3c = buildRectCase({ scale: 2.2 }); const i3 = { grp: new THREE.Group(), comp: i3c.comp };
  i3.grp.add(i3c.g, contactShadow(1.6, .35)); i3c.g.position.y = .3; i3.grp.position.x = 2.15;
  // a rope loop through the rectangular case, hanging behind it
  const loop = []; for (let i = 0; i < 120; i++){ const a = i / 120 * Math.PI * 2; loop.push(new V3(Math.cos(a) * .7, .3 + i3c.channelY * 2.2 - .28 + Math.sin(a) * .42, -.57 - Math.abs(Math.cos(a)) * .08)); }
  i3.grp.add(ropeMesh(loop, true, .03));
  st.S.add(i1.grp, i2.grp, i3.grp);
  const items = [i1, i2, i3], lbls = [...document.querySelectorAll('.iter-label')], stageBox = $('.iter-stage');
  items.forEach(m => st.onClick(m.comp.hit, () => { const v = !m.comp.isOpen(); m.comp.set(v); if (v) spill(st, m.comp, rain, host, 7); }));
  scenes.push({ st, rain, update(t){
    items.forEach((m, i) => { m.grp.rotation.y = Math.sin(t * .45 + i) * .5; m.grp.position.y = Math.sin(t * 1.1 + i * 1.3) * .05; m.comp.update(); });
    // labels sit just under each model, inside the stage box
    lbls.forEach((el, i) => { const p = st.toHost(new V3(items[i].grp.position.x, -.05, .4), stageBox); el.style.left = p.x + 'px'; el.style.top = (p.y + 8) + 'px'; });
  } });
}

/* one loop for everything */
let last = performance.now();
(function loop(now){
  requestAnimationFrame(loop);
  const dt = Math.min(.033, (now - last) / 1000); last = now;
  const t = now / 1000;
  for (const s of scenes){ s.st.frame(() => s.update(t)); if (s.rain){ s.rain.step(dt); s.rain.draw(); } }
})(last);
