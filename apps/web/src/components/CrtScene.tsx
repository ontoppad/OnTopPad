import { useEffect, useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import type { TokenSummary } from "../lib/api.ts";
import { artSrc } from "./ui.tsx";

/**
 * The landing page's screening room: real CRT sets (Poly Haven "Television 02", CC0) whose glass is
 * re-skinned with a CRT shader, so every screen can show a token, static, colour bars or a live caption.
 * Three layouts share it: a floating wall for the hero, a feature set with neighbours, and one big set for the close.
 */

export type Mode = "wall" | "feature" | "cta";
export type Hover = { label: string; to?: string } | null;

type Props = {
  mode: Mode;
  tokens: TokenSummary[];
  /** feature: which token is on the centre set */
  index?: number;
  /** wall: 0 → 1 as the hero scrolls away; the camera pushes in */
  progress?: MutableRefObject<number>;
  onHover?: (h: Hover) => void;
  onPick?: (to: string) => void;
  onStep?: (dir: 1 | -1) => void;
  onFail?: () => void;
};

// ───────────── model ─────────────

// The glass is its own island in the model's UV atlas (measured from the asset): u runs with x, v against y, 4:3.
const ISLAND = new THREE.Vector4(0.6907, 0.0105, 0.9941, 0.2348);

type Model = { geometry: THREE.BufferGeometry; body: THREE.MeshStandardMaterial };
let model: Promise<Model> | undefined;

function loadModel(): Promise<Model> {
  model ??= new GLTFLoader()
    .loadAsync("/models/crt/crt.gltf")
    .then((gltf) => {
      let mesh: THREE.Mesh | undefined;
      gltf.scene.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) mesh = o as THREE.Mesh;
      });
      const src = mesh!.geometry;
      const uv = src.getAttribute("uv");
      const index = src.getIndex()!;
      const body: number[] = [];
      const screen: number[] = [];
      for (let i = 0; i < index.count; i += 3) {
        const tri = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
        (tri.every((k) => uv.getX(k) > 0.68 && uv.getY(k) < 0.245) ? screen : body).push(...tri);
      }
      // one geometry, two material groups: the cabinet keeps its scanned PBR, the glass gets the CRT shader
      const geometry = src.clone();
      geometry.setIndex([...body, ...screen]);
      geometry.clearGroups();
      geometry.addGroup(0, body.length, 0);
      geometry.addGroup(body.length, screen.length, 1);
      geometry.translate(0, -0.205, 0.053).scale(4, 4, 4); // pivot in the middle, 1.6 units wide
      geometry.computeBoundingSphere();
      const mat = mesh!.material as THREE.MeshStandardMaterial;
      rebrand(mat);
      mat.aoMap = mat.roughnessMap; // the ARM map carries ambient occlusion in red
      mat.envMapIntensity = 0.7;
      return { geometry, body: mat };
    })
    .catch((e) => {
      model = undefined;
      throw e;
    });
  return model;
}

/** The scan ships with a made-up "PARAGON Viewing System" badge; ours says what it is. */
function rebrand(mat: THREE.MeshStandardMaterial) {
  const img = mat.map?.image as CanvasImageSource & { width: number; height: number };
  if (!img) return;
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext("2d")!;
  g.drawImage(img, 0, 0);
  const k = c.width / 1024;
  const [r, gr, b] = g.getImageData(Math.round(275 * k), Math.round(500 * k), 1, 1).data;
  g.fillStyle = `rgb(${r},${gr},${b})`;
  g.fillRect(279 * k, 457 * k, 12 * k, 80 * k);
  g.save();
  g.translate(281 * k, 461 * k);
  g.rotate(Math.PI / 2);
  g.fillStyle = "#d4d8c8";
  g.font = `700 ${7 * k}px "JetBrains Mono Variable", monospace`;
  g.fillText("OnTopPad", 0, 0);
  g.font = `${5 * k}px "JetBrains Mono Variable", monospace`;
  g.fillText("Game Station", 38 * k, 0);
  g.restore();
  const tex = new THREE.CanvasTexture(c);
  tex.flipY = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  mat.map = tex;
  mat.needsUpdate = true;
}

// ───────────── the glass ─────────────

const VERT = /* glsl */ `
  #include <fog_pars_vertex>
  uniform vec4 uIsland;
  varying vec2 vUv;
  void main() {
    vUv = vec2((uv.x - uIsland.x) / (uIsland.z - uIsland.x), 1.0 - (uv.y - uIsland.y) / (uIsland.w - uIsland.y));
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const FRAG = /* glsl */ `
  #include <fog_pars_fragment>
  uniform sampler2D uMap;
  uniform sampler2D uMap2;
  uniform float uKind, uKind2, uAspect, uAspect2, uMix, uTime, uBright, uGlitch, uSeed;
  varying vec2 vUv;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

  vec3 snow(vec2 uv) {
    float n = hash(floor(uv * vec2(180.0, 135.0)) + floor(uTime * 24.0) * vec2(1.7, 9.2) + uSeed);
    return vec3(n * (0.8 + 0.2 * sin(uv.y * 40.0 + uTime * 9.0)) * 0.9);
  }

  // SMPTE-style test card: seven bars, a reverse strip, then the pluge row
  vec3 bars(vec2 uv) {
    float i = floor(clamp(uv.x, 0.0, 0.999) * 7.0);
    vec3 top = 0.78 * vec3(1.0 - mod(floor(i / 2.0), 2.0), step(i, 3.5), 1.0 - mod(i, 2.0));
    if (uv.y > 0.33) return top;
    // reverse strip: blue, magenta, cyan, grey on the even bars, black between
    float r = step(1.5, i) * (1.0 - step(3.5, i)) + step(5.5, i);
    float g = step(3.5, i) * (1.0 - step(4.5, i)) + step(5.5, i);
    if (uv.y > 0.25) return 0.78 * vec3(r, g, 1.0) * (1.0 - mod(i, 2.0));
    float j = floor(uv.x * 6.0);
    return j < 1.0 ? vec3(0.0, 0.13, 0.3) : j < 2.0 ? vec3(0.9) : j < 3.0 ? vec3(0.2, 0.0, 0.42) : vec3(0.03);
  }

  vec3 channel(float kind, sampler2D map, float aspect, vec2 uv) {
    if (kind < 0.5) return texture2D(map, vec2(0.5 + (uv.x - 0.5) * aspect, uv.y)).rgb;
    if (kind < 1.5) return snow(uv);
    return bars(uv);
  }

  void main() {
    vec2 cc = vUv - 0.5;
    vec2 uv = 0.5 + cc * (1.0 + 0.12 * dot(cc, cc)); // tube curvature
    uv.x += (hash(vec2(floor(uv.y * 90.0), floor(uTime * 40.0))) - 0.5) * 0.07 * uGlitch;
    vec3 col = channel(uKind, uMap, uAspect, uv);
    if (uMix > 0.0) {
      // pixel dissolve: blocks flip to black, then to the next channel
      vec3 next = channel(uKind2, uMap2, uAspect2, uv);
      float cell = hash(floor(uv * vec2(24.0, 18.0)) + uSeed);
      col = cell < uMix - 0.2 ? next : cell < uMix ? vec3(0.0) : col;
    }
    col *= 0.76 + 0.24 * sin(vUv.y * 3.14159 * 240.0);      // scanlines
    col *= 0.93 + 0.07 * sin(vUv.x * 3.14159 * 520.0);      // phosphor columns
    col *= 0.94 + 0.12 * smoothstep(0.9, 1.0, sin((vUv.y + uTime * 0.22) * 6.2831) * 0.5 + 0.5); // rolling refresh
    col += (hash(vUv * 700.0 + uTime) - 0.5) * 0.06;
    vec2 edge = smoothstep(vec2(0.0), vec2(0.05, 0.07), vUv) * smoothstep(vec2(0.0), vec2(0.05, 0.07), 1.0 - vUv);
    col *= edge.x * edge.y * (1.0 - 0.7 * dot(cc, cc));
    col *= (0.97 + 0.03 * sin(uTime * 53.0 + uSeed)) * uBright;
    col += vec3(0.05, 0.06, 0.06) * smoothstep(0.5, 0.0, length(vUv - vec2(0.27, 0.8))); // glass sheen
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

function glass() {
  return new THREE.ShaderMaterial({
    fog: true,
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      uIsland: { value: ISLAND },
      uMap: { value: null },
      uMap2: { value: null },
      uKind: { value: 1 },
      uKind2: { value: 1 },
      uAspect: { value: 1 },
      uAspect2: { value: 1 },
      uMix: { value: 0 },
      uTime: { value: 0 },
      uBright: { value: 1.3 },
      uGlitch: { value: 0 },
      uSeed: { value: Math.random() * 100 },
    },
  });
}

// ───────────── channels ─────────────

type Channel = { kind: 0 | 1 | 2; tex: THREE.Texture | null; aspect: number; color: THREE.Color; label: string; to?: string };

const snowChannel = (): Channel => ({ kind: 1, tex: null, aspect: 1, color: new THREE.Color("#aeb8b4"), label: "Static · click to tune in" });
const barsChannel = (): Channel => ({ kind: 2, tex: null, aspect: 1, color: new THREE.Color("#c9c4ff"), label: "Test card · click to tune in" });

/** TokenArt's 5×5 sprite, for tokens without a picture we can put on a screen. */
function sprite(seed: string) {
  let h = [...seed.toLowerCase()].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const c = document.createElement("canvas");
  c.width = c.height = 5;
  const g = c.getContext("2d")!;
  g.fillStyle = "#1e2019";
  g.fillRect(0, 0, 5, 5);
  g.fillStyle = "#cbfd00";
  for (let i = 0; i < 15; i++) {
    if (h & 1) {
      g.fillRect(Math.floor(i / 5), i % 5, 1, 1);
      g.fillRect(4 - Math.floor(i / 5), i % 5, 1, 1);
    }
    h = (h >>> 1) ^ (h & 1 ? 0xa3000000 : 0);
  }
  return c;
}

function pixelTexture(source: TexImageSource | HTMLCanvasElement) {
  const tex = new THREE.Texture(source as HTMLImageElement);
  tex.magFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function artChannel(t: TokenSummary): Channel {
  const ch: Channel = { kind: 0, tex: pixelTexture(sprite(t.address)), aspect: 4 / 3, color: new THREE.Color("#cbfd00"), label: `$${t.symbol} · +${t.bonusBps / 100}% on top`, to: `/token/${t.address}` };
  const src = artSrc(t.image);
  if (src) {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      // the sprite may already be on the GPU at 5×5; GL storage can't grow, so drop it and upload fresh
      ch.tex!.dispose();
      ch.tex!.image = img;
      ch.tex!.needsUpdate = true;
      // the set throws the picture's average colour into the room
      try {
        const c = document.createElement("canvas");
        c.width = c.height = 1;
        const g = c.getContext("2d", { willReadFrequently: true })!;
        g.drawImage(img, 0, 0, 1, 1);
        const [r, gr, b] = g.getImageData(0, 0, 1, 1).data;
        ch.color.setRGB(r! / 255, gr! / 255, b! / 255, THREE.SRGBColorSpace);
      } catch {
        // tainted canvas: keep the lime
      }
    };
    img.src = src;
  }
  return ch;
}

const DISPLAY = '"Big Shoulders Inline Variable", "Bricolage Grotesque Variable", sans-serif';

/** A caption card: lines of display type on black, like a station ident. */
function textChannel(paint: (g: CanvasRenderingContext2D) => void, label: string, to?: string): Channel {
  const c = document.createElement("canvas");
  c.width = 480;
  c.height = 360;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const draw = () => {
    const g = c.getContext("2d")!;
    g.fillStyle = "#040503";
    g.fillRect(0, 0, 480, 360);
    g.textAlign = "center";
    g.textBaseline = "middle";
    paint(g);
    tex.needsUpdate = true;
  };
  draw();
  void document.fonts.load(`800 120px ${DISPLAY}`).then(draw, () => {});
  return { kind: 0, tex, aspect: 1, color: new THREE.Color("#cbfd00"), label, to };
}

function stampChannel(bps: number, to?: string) {
  return textChannel(
    (g) => {
      g.save();
      g.translate(240, 180);
      g.rotate(-0.06);
      g.transform(1, 0, -0.14, 1, 0, 0);
      g.fillStyle = "#000";
      g.fillRect(-196, -84, 400, 176);
      g.fillStyle = "#cbfd00";
      g.fillRect(-204, -92, 400, 176);
      g.fillStyle = "#0e0f0c";
      g.font = `800 132px ${DISPLAY}`;
      g.fillText(`+${bps / 100}%`, -4, -22);
      g.font = `800 56px ${DISPLAY}`;
      g.fillText("ON TOP", -4, 52);
      g.restore();
    },
    `+${bps / 100}% bonus on every buy`,
    to,
  );
}

function wordsChannel(lines: string[], label: string, to?: string) {
  return textChannel(
    (g) => {
      g.fillStyle = "#cbfd00";
      g.font = `800 112px ${DISPLAY}`;
      lines.forEach((l, i) => g.fillText(l, 240, 180 + (i - (lines.length - 1) / 2) * 112));
    },
    label,
    to,
  );
}

// ───────────── layouts ─────────────

// [x, y, z, scale, yaw, pitch, roll] — the wall keeps the middle column open for the headline and the buttons
type Slot = [number, number, number, number, number, number, number];
const WALL: Slot[] = [
  [-5.3, 1.35, -1.2, 1.15, 0.52, 0.02, 0.03],
  [-3.2, 2.55, -4.2, 0.8, 0.32, -0.08, -0.05],
  [-3.9, -1.25, 0.2, 1.05, 0.4, 0.05, -0.02],
  [-6.9, -1.1, -3.0, 1.2, 0.62, 0.0, 0.04],
  [-2.6, 0.25, -6.5, 0.8, 0.22, 0.0, 0.06],
  [-5.4, -3.6, -1.8, 1.0, 0.44, 0.12, 0.0],
  [4.3, 2.7, -2.8, 0.9, -0.34, -0.06, 0.04],
  [5.4, 0.95, -0.8, 1.2, -0.5, 0.03, -0.03],
  [3.0, -0.1, -6.0, 0.8, -0.25, 0.0, -0.05],
  [4.0, -1.55, 0.2, 1.05, -0.42, 0.06, 0.03],
  [7.0, -1.3, -3.0, 1.2, -0.6, 0.0, -0.04],
  [5.2, -3.7, -1.7, 1.0, -0.38, 0.12, 0.02],
  [0.3, 1.0, -11.0, 1.0, 0.0, -0.04, 0.0],
];
// on a phone the wall stacks above and below the copy
const WALL_NARROW: Slot[] = [
  [-1.55, 3.0, -1.2, 0.75, 0.45, -0.05, 0.04],
  [1.6, 2.7, -2.2, 0.75, -0.45, -0.05, -0.04],
  [-1.8, 0.65, -0.8, 0.8, 0.5, 0.0, -0.03],
  [1.85, 0.3, -1.5, 0.8, -0.5, 0.0, 0.03],
  [0.0, 1.2, -9.0, 0.9, 0.0, 0.0, 0.0],
  [-1.4, -3.35, -0.8, 0.85, 0.35, 0.1, -0.03],
  [1.45, -3.55, -1.6, 0.85, -0.35, 0.1, 0.04],
];
const FEATURE: Slot[] = [
  [0, -0.02, 0, 1.38, 0, 0.02, 0],
  [-3.7, -0.02, -1.6, 1.3, 0.6, 0.02, 0],
  [3.7, -0.02, -1.6, 1.3, -0.6, 0.02, 0],
];
const FEATURE_NARROW: Slot[] = [
  [0, 0.15, 0, 1.25, 0, 0.02, 0],
  [-2.3, 0.15, -2.2, 1.0, 0.65, 0.02, 0],
  [2.3, 0.15, -2.2, 1.0, -0.65, 0.02, 0],
];
const CTA: Slot[] = [[1.75, -0.3, 0, 2.55, -0.52, 0.05, 0.02]];
const CTA_NARROW: Slot[] = [[0.25, 1.1, 0, 1.15, -0.3, 0.05, 0.02]];

const SKY: Record<Mode, [number, string][]> = {
  wall: [
    [0, "#0f1716"],
    [0.5, "#0b0f0e"],
    [1, "#060706"],
  ],
  // a lime dusk across the top, the way the reference's case wall sits under a sunset
  feature: [
    [0, "#46590a"],
    [0.22, "#1b2309"],
    [0.5, "#090b07"],
    [1, "#050605"],
  ],
  cta: [
    [0, "#121b1c"],
    [0.6, "#0a0e0e"],
    [1, "#050606"],
  ],
};

type Tv = {
  group: THREE.Group;
  mesh: THREE.Mesh;
  glass: THREE.ShaderMaterial;
  light: THREE.PointLight;
  ch: Channel;
  next: Channel | null;
  t: number;
  dur: number;
  glitch: number;
  hover: number;
  dim: number;
  slot: Slot;
  phase: number;
};

function show(tv: Tv, ch: Channel) {
  const u = tv.glass.uniforms;
  u.uMap!.value = ch.tex;
  u.uKind!.value = ch.kind;
  u.uAspect!.value = ch.aspect;
  tv.ch = ch;
}

function tune(tv: Tv, ch: Channel, dur = 0.9) {
  if (tv.ch === ch || tv.next === ch) return;
  if (tv.next) show(tv, tv.next);
  const u = tv.glass.uniforms;
  u.uMap2!.value = ch.tex;
  u.uKind2!.value = ch.kind;
  u.uAspect2!.value = ch.aspect;
  tv.next = ch;
  tv.t = 0;
  tv.dur = dur;
  tv.glitch = 1;
}

// ───────────── component ─────────────

export default function CrtScene(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const live = useRef(props);
  live.current = props;
  const api = useRef<{ setTokens: (t: TokenSummary[]) => void; setIndex: (i: number) => void } | null>(null);

  useEffect(() => {
    const el = host.current!;
    const { mode } = live.current;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
    } catch {
      live.current.onFail?.();
      return;
    }
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.style.touchAction = "pan-y";
    renderer.domElement.style.display = "block";
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const sky = document.createElement("canvas");
    sky.width = 4;
    sky.height = 256;
    const sg = sky.getContext("2d")!;
    const grad = sg.createLinearGradient(0, 0, 0, 256);
    SKY[mode].forEach(([o, c]) => grad.addColorStop(o, c));
    sg.fillStyle = grad;
    sg.fillRect(0, 0, 4, 256);
    const skyTex = new THREE.CanvasTexture(sky);
    skyTex.colorSpace = THREE.SRGBColorSpace;
    scene.background = skyTex;
    scene.fog = new THREE.FogExp2(mode === "feature" ? "#0a0c08" : "#0a0e0d", mode === "wall" ? 0.075 : 0.05);
    const pmrem = new THREE.PMREMGenerator(renderer);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.22;
    scene.add(new THREE.HemisphereLight("#9fb7b0", "#0b0c0a", 0.35));
    const key = new THREE.DirectionalLight("#dfe8e4", 0.5);
    key.position.set(-3, 5, 6);
    scene.add(key);

    // floating dust in the projector beam
    const N = 360;
    const dustPos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) dustPos.set([(Math.random() - 0.5) * 18, (Math.random() - 0.5) * 10, -Math.random() * 10 + 2], i * 3);
    const dust = new THREE.Points(new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(dustPos, 3)), new THREE.PointsMaterial({ size: 0.025, color: "#c8d4cf", transparent: true, opacity: 0.45, depthWrite: false }));
    scene.add(dust);

    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 60);
    const camZ = mode === "wall" ? 10 : 7;
    camera.position.set(0, 0, camZ);

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.75, 0.55, 0.78);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());

    const tvs: Tv[] = [];
    let narrow = false;
    const cache = new Map<string, Channel>();
    const extras: Channel[] = [];
    let tokens: TokenSummary[] = [];
    let index = live.current.index ?? 0;
    let disposed = false;

    const art = (t: TokenSummary) => {
      let ch = cache.get(t.address);
      if (!ch) cache.set(t.address, (ch = artChannel(t)));
      return ch;
    };

    const slots = () => (mode === "wall" ? (narrow ? WALL_NARROW : WALL) : mode === "feature" ? (narrow ? FEATURE_NARROW : FEATURE) : narrow ? CTA_NARROW : CTA);

    const place = (tv: Tv, time: number) => {
      const [x, y, z, s, ry, rx, rz] = tv.slot;
      const bob = reduced ? 0 : Math.sin(time * 0.5 + tv.phase) * 0.06;
      const sway = reduced ? 0 : Math.sin(time * 0.3 + tv.phase * 2) * 0.03;
      tv.group.position.set(x, y + bob, z + tv.hover * 0.25);
      tv.group.rotation.set(rx + sway * 0.5, ry + sway - tv.hover * ry * 0.35, rz);
      tv.group.scale.setScalar(s * (1 + tv.hover * 0.05));
    };

    /** Who is on which set. The wall shuffles tokens in among static and idents; the feature follows the index. */
    const program = (instant = false) => {
      const go = (tv: Tv, ch: Channel) => (instant ? show(tv, ch) : tune(tv, ch, 0.9 + Math.random() * 0.5));
      if (mode === "wall") {
        const arts = tokens.slice(0, 9).map(art);
        const pool = [arts[0], extras[0], arts[1], snowChannel(), arts[2], arts[3], extras[1], arts[4], barsChannel(), arts[5], arts[6], snowChannel(), arts[7]];
        tvs.forEach((tv, i) => go(tv, pool[i] ?? (i % 2 ? snowChannel() : barsChannel())));
      } else if (mode === "feature") {
        if (!tokens.length) return;
        const at = (d: number) => art(tokens[(((index + d) % tokens.length) + tokens.length) % tokens.length]!);
        go(tvs[0]!, at(0));
        go(tvs[1]!, at(-1));
        go(tvs[2]!, at(1));
      }
    };

    const ctaCards = mode === "cta" ? [wordsChannel(["PRESS", "START"], "Insert coin", "/launch"), wordsChannel(["INSERT", "COIN"], "Insert coin", "/launch")] : [];

    const build = (m: Model) => {
      if (disposed) return;
      slots().forEach((slot, i) => {
        const g = glass();
        const mesh = new THREE.Mesh(m.geometry, [m.body, g]);
        const group = new THREE.Group();
        group.add(mesh);
        const light = new THREE.PointLight("#cbfd00", 0, 4.5, 1.6);
        light.position.set(0, 0.2, 1.3);
        group.add(light);
        const tv: Tv = { group, mesh, glass: g, light, ch: snowChannel(), next: null, t: 0, dur: 1, glitch: 0, hover: 0, dim: mode === "feature" && i > 0 ? 0.55 : 1, slot, phase: i * 1.7 };
        show(tv, mode === "cta" ? ctaCards[0]! : i % 3 === 2 ? barsChannel() : snowChannel());
        mesh.userData.tv = tv;
        tvs.push(tv);
        scene.add(group);
        place(tv, 0);
      });
      program();
    };

    // ── sizing
    const resize = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (!w || !h) return;
      const wasNarrow = narrow;
      narrow = w / h < 1;
      renderer.setPixelRatio(Math.min(devicePixelRatio, narrow ? 1.25 : 1.6));
      renderer.setSize(w, h);
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(w, h);
      bloom.resolution.set(w / 2, h / 2);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      if (wasNarrow !== narrow && tvs.length) {
        // the phone layout has fewer sets; rebuild them on the new slots
        tvs.splice(0).forEach((tv) => {
          scene.remove(tv.group);
          tv.glass.dispose();
        });
        void loadModel().then((m) => {
          build(m);
          program(true);
        });
      }
    };

    const pointer = new THREE.Vector2(9, 9);
    const look = { x: 0, y: 0 };
    let hovered: Tv | null = null;
    let said: string | undefined;
    const ray = new THREE.Raycaster();
    const onWindowMove = (e: PointerEvent) => {
      look.x = (e.clientX / innerWidth) * 2 - 1;
      look.y = (e.clientY / innerHeight) * 2 - 1;
    };
    const onMove = (e: PointerEvent) => {
      const r = renderer.domElement.getBoundingClientRect();
      pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    };
    const onLeave = () => pointer.set(9, 9);
    let downAt = { x: 0, y: 0 };
    const onDown = (e: PointerEvent) => (downAt = { x: e.clientX, y: e.clientY });
    const onUp = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 6 || !hovered) return;
      const p = live.current;
      if (mode === "feature" && hovered !== tvs[0]) return p.onStep?.(hovered === tvs[1] ? -1 : 1);
      const on = hovered.next && hovered.t > 0.5 ? hovered.next : hovered.ch;
      if (on.to) return p.onPick?.(on.to);
      // dead channel: tune it to a token nobody is watching
      const watching = new Set(tvs.map((t) => t.ch));
      const fresh = tokens.map(art).filter((c) => !watching.has(c));
      tune(hovered, fresh[Math.floor(Math.random() * fresh.length)] ?? barsChannel(), 0.7);
    };
    renderer.domElement.addEventListener("pointermove", onMove);
    renderer.domElement.addEventListener("pointerleave", onLeave);
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointerup", onUp);
    addEventListener("pointermove", onWindowMove, { passive: true });

    let visible = true;
    const io = new IntersectionObserver(([en]) => (visible = !!en?.isIntersecting), { rootMargin: "100px" });
    io.observe(el);
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    let last = performance.now();
    let time = 0;
    let lastFlip = 0;
    let raf = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const now = performance.now();
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      if (!visible || document.hidden) return;
      time += dt;

      // hover
      let hit: Tv | null = null;
      if (pointer.x < 2 && tvs.length) {
        ray.setFromCamera(pointer, camera);
        const h = ray.intersectObjects(
          tvs.map((t) => t.mesh),
          false,
        )[0];
        hit = (h?.object.userData.tv as Tv | undefined) ?? null;
      }
      // re-announce when the pointer moves to another set or the set under it changes channel
      const on = hit && (hit.next && hit.t > 0.5 ? hit.next : hit.ch);
      const desc: Hover = hit && on ? (mode === "feature" && hit !== tvs[0] ? { label: hit === tvs[1] ? "Previous" : "Next" } : { label: on.label, to: on.to }) : null;
      if (hit !== hovered || desc?.label !== said) {
        hovered = hit;
        said = desc?.label;
        renderer.domElement.style.cursor = hit ? "pointer" : "";
        live.current.onHover?.(desc);
      }

      // the close alternates its two idents
      if (mode === "cta" && tvs[0] && time - lastFlip > 2.6) {
        lastFlip = time;
        tune(tvs[0], tvs[0].ch === ctaCards[0] ? ctaCards[1]! : ctaCards[0]!, 0.7);
      }

      for (const tv of tvs) {
        const u = tv.glass.uniforms;
        u.uTime!.value = time;
        if (tv.next) {
          tv.t += dt / tv.dur;
          u.uMix!.value = tv.t * 1.25;
          if (tv.t >= 1) {
            show(tv, tv.next);
            tv.next = null;
            u.uMix!.value = 0;
          }
        }
        tv.glitch *= Math.exp(-dt * 5);
        u.uGlitch!.value = tv.glitch;
        tv.hover += ((tv === hovered ? 1 : 0) - tv.hover) * Math.min(1, dt * 8);
        const depth = Math.max(0.35, Math.min(1, 1 + tv.slot[2] * 0.09));
        u.uBright!.value = (1.25 + tv.hover * 0.35) * tv.dim * (depth + tv.hover * (1 - depth));
        const ch = tv.next && tv.t > 0.5 ? tv.next : tv.ch;
        tv.light.color.lerp(ch.color, Math.min(1, dt * 4));
        tv.light.intensity = (2.2 + tv.hover * 1.5) * tv.slot[3] * tv.dim * depth * (0.92 + 0.08 * Math.sin(time * 31 + tv.phase));
        place(tv, time);
      }

      // camera: drifts, leans toward the pointer, pushes in as the hero scrolls away
      const push = live.current.progress?.current ?? 0;
      const tx = (reduced ? 0 : Math.sin(time * 0.17) * 0.15) + look.x * (mode === "wall" ? 0.7 : 0.35);
      const ty = -look.y * (mode === "wall" ? 0.4 : 0.2) + push * 0.9;
      camera.position.x += (tx - camera.position.x) * Math.min(1, dt * 2.5);
      camera.position.y += (ty - camera.position.y) * Math.min(1, dt * 2.5);
      camera.position.z = camZ - push * 3;
      camera.lookAt(0, push * 0.6, 0);
      dust.rotation.y = time * 0.01;
      dust.position.y = reduced ? 0 : Math.sin(time * 0.1) * 0.2;

      composer.render(dt);
    };

    void document.fonts.load(`800 120px ${DISPLAY}`).catch(() => {});
    extras.push(stampChannel(500, "/rules"), wordsChannel(["START", "AHEAD"], "Start ahead. Stay paid.", "/arcade"));
    const setTokens = (t: TokenSummary[]) => {
      const first = !tokens.length && t.length > 0;
      tokens = t;
      // the house token's real rate on the stamp ident
      const house = t.find((x) => x.symbol === "ONTOP") ?? t[0];
      if (house && first) {
        extras[0]?.tex?.dispose();
        extras[0] = stampChannel(house.bonusBps, `/token/${house.address}`);
      }
      if (tvs.length && first) program();
    };
    setTokens(live.current.tokens);
    api.current = {
      setTokens,
      setIndex: (i) => {
        index = i;
        if (tvs.length) program();
      },
    };

    loadModel().then(build, () => live.current.onFail?.());
    frame();

    return () => {
      disposed = true;
      api.current = null;
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      removeEventListener("pointermove", onWindowMove);
      tvs.forEach((tv) => tv.glass.dispose());
      cache.forEach((c) => c.tex?.dispose());
      [...extras, ...ctaCards].forEach((c) => c.tex?.dispose());
      skyTex.dispose();
      env.dispose();
      pmrem.dispose();
      dust.geometry.dispose();
      (dust.material as THREE.Material).dispose();
      composer.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, []);

  useEffect(() => api.current?.setTokens(props.tokens), [props.tokens]);
  useEffect(() => api.current?.setIndex(props.index ?? 0), [props.index]);

  return <div ref={host} className="absolute inset-0" role="img" aria-label="Wall of CRT screens showing tokens on ONTOPPAD" />;
}
