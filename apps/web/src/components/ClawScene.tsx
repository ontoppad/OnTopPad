import { useEffect, useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import type { TokenSummary } from "../lib/api.ts";
import { HOUSE_SYMBOL } from "../lib/chain.ts";
import { clunk, coin as coinSound, whirr } from "../lib/sound.ts";
import { artSrc } from "./ui.tsx";

/**
 * The arcade's claw machine: a glass cabinet full of coins, one per live token with its art on both faces.
 * play() sends the claw to a random coin, carries it to the prize chute and hands the token to onPrize.
 */

export type ClawApi = { play: () => void };

type Props = {
  tokens: TokenSummary[];
  api: MutableRefObject<ClawApi | null>;
  onBusy: (busy: boolean) => void;
  onPrize: (t: TokenSummary) => void;
  onFail: () => void;
};

// cabinet interior: x ±2, z ±1.3, floor at 0
const R = 0.32; // coin radius
const T = 0.08; // coin thickness
const TOP = 2.55; // hub height at rest
const RAIL = 3.1;
const HOME = { x: 0.5, z: 0.15 };
const CHUTE = { x: -1.45, z: 0.7 };
const LIME = "#cbfd00";
const TITLE = '"Bungee", "Bricolage Grotesque Variable", sans-serif';

const easeInOut = (k: number) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
const easeIn = (k: number) => k * k * k;

function canvasTexture(w: number, h: number, paint: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const draw = () => {
    paint(c.getContext("2d")!);
    tex.needsUpdate = true;
  };
  draw();
  void document.fonts.load(`64px ${TITLE}`).then(draw, () => {});
  return tex;
}

/** A coin face: the token's own art, or its ticker on black when it has none. */
function faceTexture(t: TokenSummary) {
  const src = t.symbol === HOUSE_SYMBOL ? "/brand/logo-512.webp" : artSrc(t.image);
  let art: HTMLImageElement | null = null;
  const tex = canvasTexture(256, 256, (g) => {
    if (art) return g.drawImage(art, 0, 0, 256, 256);
    g.fillStyle = "#151612";
    g.fillRect(0, 0, 256, 256);
    g.fillStyle = LIME;
    g.font = `${t.symbol.length > 5 ? 40 : 56}px ${TITLE}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(t.symbol, 128, 132);
  });
  if (src) {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      art = img;
      tex.image.getContext("2d")!.drawImage(img, 0, 0, 256, 256);
      tex.needsUpdate = true;
    };
    img.src = src;
  }
  tex.anisotropy = 4;
  return tex;
}

export default function ClawScene(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const live = useRef(props);
  live.current = props;

  useEffect(() => {
    const el = host.current!;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    } catch {
      live.current.onFail();
      return;
    }
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.style.display = "block";
    renderer.domElement.style.touchAction = "pan-y";
    renderer.domElement.style.cursor = "pointer";
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#0b0c09");
    const pmrem = new THREE.PMREMGenerator(renderer);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.35;
    scene.add(new THREE.HemisphereLight("#cfe0d8", "#0b0c0a", 0.6));
    const key = new THREE.DirectionalLight("#ffffff", 1.1);
    key.position.set(2, 5, 6);
    scene.add(key);
    const glow = new THREE.PointLight(LIME, 5, 6, 1.5);
    glow.position.set(0, 2.9, 0.4);
    scene.add(glow);

    // high and pitched down, so the coins on the floor show their faces
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 40);
    camera.position.set(0, 4.6, 9);
    const disposables: { dispose: () => void }[] = [];
    const keep = <T extends { dispose: () => void }>(x: T) => (disposables.push(x), x);
    const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], x = 0, y = 0, z = 0) => {
      const m = new THREE.Mesh(keep(geo), mat);
      m.position.set(x, y, z);
      scene.add(m);
      return m;
    };

    // ── cabinet
    const plastic = keep(new THREE.MeshStandardMaterial({ color: LIME, roughness: 0.45, metalness: 0.05 }));
    const dark = keep(new THREE.MeshStandardMaterial({ color: "#191b15", roughness: 0.9 }));
    const metal = keep(new THREE.MeshStandardMaterial({ color: "#c9cdc2", roughness: 0.25, metalness: 0.9 }));
    mesh(new THREE.BoxGeometry(4.3, 0.3, 2.9), dark, 0, -0.15, 0);
    mesh(new THREE.BoxGeometry(4, 0.02, 2.6), keep(new THREE.MeshStandardMaterial({ color: "#20231b", roughness: 0.8 })), 0, 0.001, 0);
    for (const x of [-2.07, 2.07]) for (const z of [-1.37, 1.37]) mesh(new THREE.BoxGeometry(0.12, 3.9, 0.12), plastic, x, 1.8, z);
    const wall = canvasTexture(512, 384, (g) => {
      g.fillStyle = "#10120d";
      g.fillRect(0, 0, 512, 384);
      g.strokeStyle = "rgba(203,253,0,0.07)";
      g.lineWidth = 18;
      for (let i = -384; i < 512; i += 48) {
        g.beginPath();
        g.moveTo(i, 384);
        g.lineTo(i + 384, 0);
        g.stroke();
      }
      g.fillStyle = "rgba(203,253,0,0.16)";
      g.font = `72px ${TITLE}`;
      g.textAlign = "center";
      g.fillText("ON TOP", 256, 220);
    });
    mesh(new THREE.PlaneGeometry(4, 3.2), keep(new THREE.MeshStandardMaterial({ map: keep(wall), roughness: 1 })), 0, 1.6, -1.3);
    const glass = keep(new THREE.MeshPhysicalMaterial({ color: "#ffffff", roughness: 0.05, transparent: true, opacity: 0.07, depthWrite: false, envMapIntensity: 1.4, side: THREE.DoubleSide }));
    mesh(new THREE.PlaneGeometry(4, 3.2), glass, 0, 1.6, 1.32);
    for (const s of [-1, 1]) mesh(new THREE.PlaneGeometry(2.6, 3.2), glass, s * 2, 1.6, 0).rotation.y = (s * Math.PI) / 2;

    // the marquee: a sign between two rows of chasing bulbs
    const sign = canvasTexture(1024, 160, (g) => {
      g.fillStyle = "#0e0f0c";
      g.fillRect(0, 0, 1024, 160);
      g.fillStyle = LIME;
      g.font = `86px ${TITLE}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText("GRAB A TOKEN", 512, 86);
    });
    const signMat = keep(new THREE.MeshStandardMaterial({ map: keep(sign), emissive: "#ffffff", emissiveMap: sign, emissiveIntensity: 0.55 }));
    mesh(new THREE.BoxGeometry(4.3, 0.62, 0.3), [plastic, plastic, plastic, plastic, signMat, plastic], 0, 3.55, 1.37);
    const bulbOn = keep(new THREE.MeshStandardMaterial({ color: "#fffbe0", emissive: "#fff3a0", emissiveIntensity: 2.2 }));
    const bulbOff = keep(new THREE.MeshStandardMaterial({ color: "#6b6a55", emissive: "#3a3820", emissiveIntensity: 0.4 }));
    const bulbGeo = keep(new THREE.SphereGeometry(0.045, 12, 8));
    const bulbs: THREE.Mesh[] = [];
    for (const y of [3.93, 3.17]) for (let x = -2.0; x <= 2.01; x += 0.25) bulbs.push(mesh(bulbGeo, bulbOff, x, y, 1.53));

    // prize chute in the front-left corner
    const chuteMat = keep(new THREE.MeshStandardMaterial({ color: LIME, roughness: 0.5 }));
    mesh(new THREE.BoxGeometry(0.84, 0.5, 0.05), chuteMat, CHUTE.x, 0.25, CHUTE.z - 0.42);
    mesh(new THREE.BoxGeometry(0.84, 0.5, 0.05), chuteMat, CHUTE.x, 0.25, CHUTE.z + 0.42);
    mesh(new THREE.BoxGeometry(0.05, 0.5, 0.84), chuteMat, CHUTE.x - 0.42, 0.25, CHUTE.z);
    mesh(new THREE.BoxGeometry(0.05, 0.5, 0.84), chuteMat, CHUTE.x + 0.42, 0.25, CHUTE.z);
    mesh(new THREE.PlaneGeometry(0.8, 0.8), keep(new THREE.MeshBasicMaterial({ color: "#000000" })), CHUTE.x, 0.006, CHUTE.z).rotation.x = -Math.PI / 2;

    // ── gantry and claw
    mesh(new THREE.BoxGeometry(0.06, 0.06, 2.6), metal, -1.95, RAIL, 0);
    mesh(new THREE.BoxGeometry(0.06, 0.06, 2.6), metal, 1.95, RAIL, 0);
    const xRail = mesh(new THREE.BoxGeometry(3.9, 0.05, 0.05), metal);
    const carriage = mesh(new THREE.BoxGeometry(0.28, 0.1, 0.28), plastic);
    const cable = mesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 6), metal);
    const rig = new THREE.Group();
    scene.add(rig);
    rig.add(new THREE.Mesh(keep(new THREE.CylinderGeometry(0.14, 0.14, 0.16, 24)), metal));
    const ring = new THREE.Mesh(keep(new THREE.TorusGeometry(0.145, 0.022, 8, 32)), plastic);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -0.06;
    rig.add(ring);
    const upperGeo = keep(new THREE.BoxGeometry(0.04, 0.45, 0.04));
    const hookGeo = keep(new THREE.BoxGeometry(0.04, 0.22, 0.04));
    const pivots: THREE.Group[] = [];
    for (let k = 0; k < 3; k++) {
      const arm = new THREE.Group();
      arm.rotation.y = (k * Math.PI * 2) / 3;
      rig.add(arm);
      const pivot = new THREE.Group();
      pivot.position.set(0, -0.08, 0.12);
      arm.add(pivot);
      const upper = new THREE.Mesh(upperGeo, metal);
      upper.position.y = -0.225;
      pivot.add(upper);
      // the hook bends back in under the coin's rim
      const elbow = new THREE.Group();
      elbow.position.y = -0.45;
      elbow.rotation.x = 0.9;
      pivot.add(elbow);
      const hook = new THREE.Mesh(hookGeo, metal);
      hook.position.y = -0.11;
      elbow.add(hook);
      pivots.push(pivot);
    }

    const claw = { x: HOME.x, z: HOME.z, y: TOP, open: 0 };
    const placeClaw = (time: number) => {
      // closed the tips pinch a coin's rim; open they clear it
      for (const p of pivots) p.rotation.x = -(0.5 + 0.3 * claw.open);
      const sway = reduced ? 0 : Math.sin(time * 1.3) * 0.025;
      rig.position.set(claw.x, claw.y, claw.z);
      rig.rotation.z = sway;
      xRail.position.set(0, RAIL, claw.z);
      carriage.position.set(claw.x, RAIL - 0.05, claw.z);
      const top = RAIL - 0.1;
      const bottom = claw.y + 0.08;
      cable.position.set(claw.x, (top + bottom) / 2, claw.z);
      cable.scale.y = Math.max(0.01, top - bottom);
    };

    // ── the coins: one per live token, the first ones spread over the floor, later ones stack
    const edge = keep(new THREE.MeshStandardMaterial({ color: LIME, roughness: 0.3, metalness: 0.7 }));
    const coinGeo = keep(new THREE.CylinderGeometry(R, R, T, 40));
    type Coin = { mesh: THREE.Mesh; token: TokenSummary };
    const coins: Coin[] = [];
    const tokens = live.current.tokens;
    const count = Math.min(18, Math.max(tokens.length * 2, 8));
    for (let i = 0; i < count && tokens.length; i++) {
      const token = tokens[i % tokens.length]!;
      const face = keep(new THREE.MeshStandardMaterial({ map: keep(faceTexture(token)), roughness: 0.45, metalness: 0.1 }));
      let x = 0;
      let z = 0;
      for (let tries = 0; tries < 30; tries++) {
        // inside the reach of an open claw: clear of the glass, the back wall and the chute
        x = -0.6 + Math.random() * 2.15;
        z = -0.85 + Math.random() * 1.75;
        if (!coins.some((c) => c.mesh.position.y < 0.1 && Math.hypot(c.mesh.position.x - x, c.mesh.position.z - z) < 2 * R + 0.02)) break;
      }
      // every coin this one overlaps lifts it a layer, so coins rest on each other instead of cutting through
      const under = coins.filter((c) => Math.hypot(c.mesh.position.x - x, c.mesh.position.z - z) < 2 * R).length;
      const m = mesh(coinGeo, [edge, face, face], x, T / 2 + 0.005 + under * 0.1, z);
      m.rotation.set((Math.random() - 0.5) * (under ? 0.4 : 0.12), Math.random() * Math.PI * 2, (Math.random() - 0.5) * (under ? 0.4 : 0.12));
      coins.push({ mesh: m, token });
    }

    // ── tweens: play() is a script of awaited moves
    type Tween = { from: number; to: number; dur: number; t: number; set: (v: number) => void; ease: (k: number) => number; done: () => void };
    const tweens: Tween[] = [];
    const tween = (from: number, to: number, dur: number, set: (v: number) => void, ease = easeInOut) =>
      new Promise<void>((done) => tweens.push({ from, to, dur: reduced ? 0 : dur, t: 0, set, ease, done }));
    const move = (to: { x: number; z: number }, dur: number) =>
      Promise.all([tween(claw.x, to.x, dur, (v) => (claw.x = v)), tween(claw.z, to.z, dur, (v) => (claw.z = v))]);
    const motor = async (job: Promise<unknown>) => {
      const stop = whirr();
      await job;
      stop();
    };

    let held: { coin: Coin; dx: number; dy: number; dz: number } | null = null;
    let busy = false;
    let disposed = false;
    const play = async () => {
      if (busy || !coins.length) return;
      busy = true;
      live.current.onBusy(true);
      // only coins nothing rests on: the claw never digs
      const free = coins.filter((c) => !coins.some((o) => o.mesh.position.y > c.mesh.position.y + 0.05 && c.mesh.position.distanceTo(o.mesh.position) < 2 * R + 0.1));
      const pick = free[Math.floor(Math.random() * free.length)]!;
      const p = pick.mesh.position;
      await motor(move(p, 1.1));
      clunk();
      await tween(0, 1, 0.3, (v) => (claw.open = v));
      await motor(tween(claw.y, p.y + 0.63, 1.1, (v) => (claw.y = v)));
      await tween(1, 0, 0.35, (v) => (claw.open = v));
      clunk();
      held = { coin: pick, dx: p.x - claw.x, dy: p.y - claw.y, dz: p.z - claw.z };
      await motor(tween(claw.y, TOP, 1.0, (v) => (claw.y = v)));
      await motor(move(CHUTE, 1.2));
      await tween(0, 1, 0.25, (v) => (claw.open = v));
      const drop = held;
      held = null;
      coins.splice(coins.indexOf(pick), 1);
      const y0 = drop.coin.mesh.position.y;
      await tween(y0, -0.6, 0.5, (v) => (drop.coin.mesh.position.y = v), easeIn);
      if (disposed) return;
      coinSound();
      live.current.onPrize(pick.token);
      await tween(1, 0, 0.3, (v) => (claw.open = v));
      await move(HOME, 1.0);
      busy = false;
      live.current.onBusy(false);
    };
    live.current.api.current = { play: () => void play() };

    // ── sizing: the whole cabinet stays in frame at any aspect
    const resize = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (!w || !h) return;
      renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
      renderer.setSize(w, h);
      camera.aspect = w / h;
      const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      camera.position.z = 1.4 + Math.max(2.3 / tan, 2.5 / (tan * camera.aspect));
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    const look = { x: 0, y: 0 };
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      look.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      look.y = ((e.clientY - r.top) / r.height) * 2 - 1;
    };
    const onLeave = () => ((look.x = 0), (look.y = 0));
    const onClick = () => void play();
    renderer.domElement.addEventListener("pointermove", onMove);
    renderer.domElement.addEventListener("pointerleave", onLeave);
    renderer.domElement.addEventListener("click", onClick);

    let visible = true;
    const io = new IntersectionObserver(([en]) => (visible = !!en?.isIntersecting), { rootMargin: "100px" });
    io.observe(el);

    let last = performance.now();
    let time = 0;
    let raf = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const now = performance.now();
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      if (!visible || document.hidden) return;
      time += dt;
      for (const tw of [...tweens]) {
        tw.t += dt;
        const k = tw.dur > 0 ? Math.min(1, tw.t / tw.dur) : 1;
        tw.set(tw.from + (tw.to - tw.from) * tw.ease(k));
        if (k >= 1) {
          tweens.splice(tweens.indexOf(tw), 1);
          tw.done();
        }
      }
      placeClaw(time);
      if (held) {
        const m = held.coin.mesh;
        m.position.set(claw.x + held.dx, claw.y + held.dy, claw.z + held.dz);
        // the grabbed coin levels out in the claw
        m.rotation.x *= 0.9;
        m.rotation.z *= 0.9;
      }
      // chasing bulbs: odd and even swap, faster while the claw works
      const phase = Math.floor(time * (busy ? 8 : 3)) % 2;
      bulbs.forEach((b, i) => (b.material = i % 2 === phase ? bulbOn : bulbOff));
      glow.intensity = 4.5 + Math.sin(time * 2) * 0.8 + (busy ? 2 : 0);
      camera.position.x += (look.x * 0.6 - camera.position.x) * Math.min(1, dt * 3);
      camera.position.y += (4.6 - look.y * 0.3 - camera.position.y) * Math.min(1, dt * 3);
      camera.lookAt(0, 1.35, 0);
      renderer.render(scene, camera);
    };
    frame();

    return () => {
      disposed = true;
      live.current.api.current = null;
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      disposables.forEach((d) => d.dispose());
      env.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, []);

  return <div ref={host} className="absolute inset-0" role="img" aria-label="Claw machine full of coins, one for each live token on ONTOPPAD" />;
}
