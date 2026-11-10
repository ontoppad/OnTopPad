import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * The hero moment: the ONTOPPAD coin from the launch banner, spinning over a dotted globe.
 * Drag to spin it, click to flip it. Rendering pauses off-screen and in hidden tabs.
 */
export default function CoinScene({ onFlip }: { onFlip?: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const flipRef = useRef(onFlip);
  flipRef.current = onFlip;

  useEffect(() => {
    const el = host.current!;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    el.appendChild(renderer.domElement);
    renderer.domElement.style.touchAction = "pan-y";

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    camera.position.set(0, 0, 9);

    // ── coin faces: black disc, lime rim ring, the sticker logo in the middle
    const face = document.createElement("canvas");
    face.width = face.height = 1024;
    const g = face.getContext("2d")!;
    const faceTex = new THREE.CanvasTexture(face);
    faceTex.colorSpace = THREE.SRGBColorSpace;
    faceTex.anisotropy = 8;
    // cylinder caps map UVs sideways; turn the art upright for the camera
    faceTex.center.set(0.5, 0.5);
    faceTex.rotation = Math.PI / 2;
    const paintFace = (logo?: HTMLImageElement) => {
      g.fillStyle = "#cbfd00";
      g.fillRect(0, 0, 1024, 1024);
      g.beginPath();
      g.arc(512, 512, 440, 0, Math.PI * 2);
      g.fillStyle = "#010000"; // the logo file's own black, so its square edge disappears
      g.fill();
      g.lineWidth = 10;
      g.strokeStyle = "#7d9a00";
      g.beginPath();
      g.arc(512, 512, 470, 0, Math.PI * 2);
      g.stroke();
      if (logo) g.drawImage(logo, 512 - 300, 512 - 300, 600, 600);
      faceTex.needsUpdate = true;
    };
    paintFace();
    const img = new Image();
    img.onload = () => paintFace(img);
    img.src = "/brand/logo-512.webp";

    // reeded edge
    const edge = document.createElement("canvas");
    edge.width = 512;
    edge.height = 16;
    const e = edge.getContext("2d")!;
    for (let x = 0; x < 512; x += 8) {
      e.fillStyle = "#cbfd00";
      e.fillRect(x, 0, 5, 16);
      e.fillStyle = "#94b800";
      e.fillRect(x + 5, 0, 3, 16);
    }
    const edgeTex = new THREE.CanvasTexture(edge);
    edgeTex.colorSpace = THREE.SRGBColorSpace;
    edgeTex.wrapS = THREE.RepeatWrapping;
    edgeTex.repeat.set(6, 1);

    const faceMat = new THREE.MeshStandardMaterial({ map: faceTex, metalness: 0.35, roughness: 0.42 });
    const edgeMat = new THREE.MeshStandardMaterial({ map: edgeTex, metalness: 0.7, roughness: 0.3 });
    const coin = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 0.22, 128, 1), [edgeMat, faceMat, faceMat]);
    coin.rotation.x = Math.PI / 2;
    const pivot = new THREE.Group();
    pivot.add(coin);
    pivot.position.y = 1.0;
    scene.add(pivot);

    // ── dotted globe, like the Robinhood Chain world on the banner
    const N = 2400;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const y = 1 - (i / (N - 1)) * 2;
      const r = Math.sqrt(1 - y * y);
      const th = i * Math.PI * (3 - Math.sqrt(5));
      pos.set([Math.cos(th) * r * 3.4, y * 3.4, Math.sin(th) * r * 3.4], i * 3);
    }
    const dots = new THREE.Points(
      new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(pos, 3)),
      new THREE.PointsMaterial({ size: 0.035, transparent: true, opacity: 0.55, depthWrite: false }),
    );
    dots.position.set(0, -4.2, -1.2);
    scene.add(dots);

    scene.add(new THREE.AmbientLight(0xffffff, 0.9));
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(-3, 4, 6);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xe8ffb0, 1.4);
    rim.position.set(4, -1, -3);
    scene.add(rim);

    const applyTheme = () => {
      const light = document.documentElement.dataset.theme === "light";
      (dots.material as THREE.PointsMaterial).color.set(light ? "#5e7a00" : "#cbfd00");
      (dots.material as THREE.PointsMaterial).opacity = light ? 0.45 : 0.35;
    };
    applyTheme();
    const themeObs = new MutationObserver(applyTheme);
    themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = el;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = `${w}px`;
      renderer.domElement.style.height = `${h}px`;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      pivot.scale.setScalar(Math.min(1, camera.aspect * 0.95));
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    // ── interaction: drag spins with inertia, a click flips the coin
    let spin = reduced ? 0 : 0.6;
    let vel = 0;
    let tiltX = 0;
    let tiltY = 0;
    let dragging = false;
    let lastX = 0;
    let moved = 0;
    let flip = 0;
    const onDown = (ev: PointerEvent) => {
      dragging = true;
      lastX = ev.clientX;
      moved = 0;
      renderer.domElement.setPointerCapture(ev.pointerId);
    };
    const onMove = (ev: PointerEvent) => {
      const r = el.getBoundingClientRect();
      tiltX = ((ev.clientY - r.top) / r.height - 0.5) * 0.4;
      tiltY = ((ev.clientX - r.left) / r.width - 0.5) * 0.5;
      if (!dragging) return;
      const dx = ev.clientX - lastX;
      lastX = ev.clientX;
      moved += Math.abs(dx);
      vel = dx * 0.012;
    };
    const onUp = () => {
      if (dragging && moved < 4) {
        flip += Math.PI * 2;
        flipRef.current?.();
      }
      dragging = false;
    };
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointermove", onMove);
    renderer.domElement.addEventListener("pointerup", onUp);
    renderer.domElement.addEventListener("pointercancel", onUp);
    renderer.domElement.style.cursor = "grab";

    let visible = true;
    const io = new IntersectionObserver(([en]) => (visible = !!en?.isIntersecting));
    io.observe(el);

    const clock = new THREE.Clock();
    let flipDone = 0;
    let raf = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      if (!visible || document.hidden) return;
      const dt = Math.min(clock.getDelta(), 0.05);
      vel *= 0.94;
      pivot.rotation.y += (spin + vel * 60) * dt;
      // flips ease out toward their target so they land face-on
      const fd = (flip - flipDone) * Math.min(1, dt * 5);
      flipDone += fd;
      coin.rotation.x = Math.PI / 2 + flipDone;
      pivot.rotation.x += (tiltX - pivot.rotation.x) * 0.06;
      pivot.rotation.z += (-tiltY * 0.3 - pivot.rotation.z) * 0.06;
      dots.rotation.y += 0.04 * dt;
      renderer.render(scene, camera);
    };
    frame();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      themeObs.disconnect();
      renderer.dispose();
      faceTex.dispose();
      edgeTex.dispose();
      faceMat.dispose();
      edgeMat.dispose();
      coin.geometry.dispose();
      dots.geometry.dispose();
      (dots.material as THREE.Material).dispose();
      el.removeChild(renderer.domElement);
    };
  }, []);

  return <div ref={host} className="absolute inset-0" aria-label="ONTOPPAD coin, drag to spin, click to flip" role="img" />;
}
