/*
 * waves3d.js — the photonic light-waves background, rendered in 3D with Three.js.
 *
 * Dozens of glass-thin light strands travel across depth. Their waves are
 * computed in the vertex shader (cheap, smooth), and bright photon pulses ride
 * along them, bloomed. Mounts on every .fiber-bg. If WebGL or the CDN is not
 * available, the module does nothing and assets/background.js draws the flat
 * 2D version instead (it checks data-gl on each mount).
 */


(function () {
  var canvases = document.querySelectorAll(".fiber-bg");
  if (!canvases.length) return;
  Promise.all([
    import("three"),
    import("three/addons/postprocessing/EffectComposer.js"),
    import("three/addons/postprocessing/RenderPass.js"),
    import("three/addons/postprocessing/UnrealBloomPass.js"),
    import("three/addons/postprocessing/OutputPass.js"),
  ]).then(function (m) {
    var THREE = m[0];
    var EffectComposer = m[1].EffectComposer;
    var RenderPass = m[2].RenderPass;
    var UnrealBloomPass = m[3].UnrealBloomPass;
    var OutputPass = m[4].OutputPass;
const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const LOW_POWER = window.innerWidth < 760 || (navigator.hardwareConcurrency || 8) <= 4;

const VOID = 0x09090f;
const IRIS = new THREE.Color(0.48, 0.44, 1.0); // #7b6fff
const PHOTON = new THREE.Color(0.78, 0.96, 1.0); // #c8f5ff
const EMBER = new THREE.Color(1.0, 0.42, 0.21); // #ff6b35

const STRANDS = LOW_POWER ? 34 : 64;
const AMP = 0.6;

const WAVE_GLSL = `
  uniform float uTime;
  uniform float uPhase;
  uniform float uAmp;
  vec3 wave(vec3 p, float t, float ph, float amp) {
    p.y += sin(p.x * 0.32 + t * 1.1 + ph) * amp;
    p.z += cos(p.x * 0.21 - t * 0.8 + ph * 1.3) * amp * 1.4;
    return p;
  }
`;

const strandVS = `
  ${WAVE_GLSL}
  varying float vA;
  varying float vD;
  void main() {
    vec3 p = wave(position, uTime, uPhase, uAmp);
    vA = 1.0 - smoothstep(9.0, 17.0, abs(p.x));
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vD = clamp((-mv.z - 10.0) / 26.0, 0.0, 1.0); // 0 = near the viewer, 1 = far away
    gl_Position = projectionMatrix * mv;
  }
`;

const strandFS = `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vA;
  varying float vD;
  void main() {
    // near strands are brighter, far ones dissolve into the void
    gl_FragColor = vec4(uColor * (1.0 - 0.6 * vD), uOpacity * vA * (1.0 - 0.8 * vD));
  }
`;

function glowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.25, "rgba(255,255,255,0.55)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function mount(container) {
  const canvas = document.createElement("canvas");
  canvas.className = "fiber-canvas";
  canvas.setAttribute("aria-hidden", "true");
  container.appendChild(canvas);

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: !LOW_POWER, powerPreference: "high-performance" });
  } catch (e) {
    canvas.remove();
    return false;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, LOW_POWER ? 1 : 1.5));
  renderer.setClearColor(VOID, 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(VOID);
  scene.fog = new THREE.Fog(VOID, 26, 58);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
  camera.position.set(0, 0, 24);

  const glow = glowTexture();
  const strandGroup = new THREE.Group();
  scene.add(strandGroup);

  // Soft nebula behind the strands, replaces the old CSS radial glow.
  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glow,
      color: IRIS.clone(),
      transparent: true,
      opacity: 0.07,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  halo.position.set(0, 0.5, -14);
  halo.scale.set(46, 26, 1);
  scene.add(halo);

  const strands = [];
  const pulses = [];
  for (let i = 0; i < STRANDS; i++) {
    const f = i / (STRANDS - 1);
    const yb = (f - 0.5) * 11;
    const zb = -16 + ((i * 0.618034) % 1) * 20 + Math.sin(i * 1.7) * 1.2;
    const pts = [];
    for (let x = -18; x <= 18; x += 1.5) {
      pts.push(
        new THREE.Vector3(
          x,
          yb + Math.sin(x * 0.18 + i * 0.37) * 1.1,
          zb + Math.cos(x * 0.12 + i * 0.21) * 1.6
        )
      );
    }
    const curve = new THREE.CatmullRomCurve3(pts, false, "centripetal");
    const color = IRIS.clone().lerp(PHOTON, (i % 5) / 5);
    const mat = new THREE.ShaderMaterial({
      vertexShader: strandVS,
      fragmentShader: strandFS,
      uniforms: {
        uTime: { value: 0 },
        uPhase: { value: i * 0.61 },
        uAmp: { value: AMP },
        uColor: { value: color },
        uOpacity: { value: 0.1 + (i % 3) * 0.035 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const depthT = Math.max(0, Math.min(1, (zb + 16) / 20));
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 240, 0.012 + 0.03 * depthT, 6, false), mat);
    strandGroup.add(tube);
    strands.push({ mat, phase: i * 0.61, curve });

    // one or two photon pulses per strand; the freshest ones are brightest
    if (i % 2 === 0) {
      const count = i % 4 === 0 ? 2 : 1;
      for (let k = 0; k < count; k++) {
        const s = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: glow,
            color: (k ? EMBER : PHOTON).clone().multiplyScalar(2.4),
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            toneMapped: false,
          })
        );
        s.scale.setScalar(k ? 0.3 : 0.4);
        scene.add(s);
        pulses.push({
          sprite: s,
          strand: strands.length - 1,
          t: (k * 0.5 + i * 0.07) % 1,
          speed: 0.035 + ((i * 13 + k * 7) % 9) * 0.004,
        });
      }
    }
  }

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.85, 0.4, 0.55);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const pointer = { x: 0, y: 0, sx: 0, sy: 0 };
  function onPointer(e) {
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
  }
  if (!REDUCED) window.addEventListener("pointermove", onPointer, { passive: true });

  function resize() {
    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);
    renderer.setSize(w, h, false);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.fov = w / h < 0.9 ? 56 : 42;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  let time = 0;
  let last = performance.now();
  let raf = null;
  let visible = true;

  function wavePoint(p, t, phase) {
    // must mirror WAVE_GLSL so pulses ride exactly on the strands
    p.y += Math.sin(p.x * 0.32 + t * 1.1 + phase) * AMP;
    p.z += Math.cos(p.x * 0.21 - t * 0.8 + phase * 1.3) * AMP * 1.4;
    return p;
  }

  const tmp = new THREE.Vector3();
  function frame(now) {
    raf = null;
    if (!visible && !REDUCED) return;
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    time += REDUCED ? 0 : dt;
    step(dt);
    composer.render();
    if (!REDUCED) raf = requestAnimationFrame(frame);
  }

  function step(dt) {
    pointer.sx += (pointer.x - pointer.sx) * Math.min(1, dt * 2.5);
    pointer.sy += (pointer.y - pointer.sy) * Math.min(1, dt * 2.5);
    const drift = REDUCED ? 0 : Math.sin(time * 0.12) * 0.6;
    camera.position.set(pointer.sx * 2.2 + drift, -pointer.sy * 1.0 + 0.6, 24 + Math.sin(time * 0.09) * 5);
    camera.lookAt(0, 0, -2);

    strands.forEach((s) => {
      s.mat.uniforms.uTime.value = time;
    });

    pulses.forEach((p) => {
      p.t = (p.t + dt * p.speed) % 1;
      tmp.copy(strands[p.strand].curve.getPointAt(p.t));
      wavePoint(tmp, time, strands[p.strand].phase);
      p.sprite.position.copy(tmp);
      const fade = 1 - Math.min(1, Math.abs(tmp.x) / 17);
      p.sprite.material.opacity = Math.max(0, fade);
    });
  }

  if (REDUCED) {
    step(0);
    composer.render();
  } else {
    raf = requestAnimationFrame(frame);
  }

  const io = new IntersectionObserver((entries) => {
    visible = entries[0].isIntersecting;
    if (visible && !raf && !REDUCED) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
  });
  io.observe(canvas);

  container.dataset.gl = "on";
  return true;
}

function boot() {
  document.querySelectorAll(".fiber-bg").forEach((el) => {
    try {
      mount(el);
    } catch (e) {
      console.warn("waves3d: falling back to the 2D background", e);
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}

  }).catch(function (err) {
    console.warn("waves3d: falling back to the 2D background", err);
  });
})();
