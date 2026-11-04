/*
 * world3d.js — the whole landing page as one 3D world.
 *
 * One fixed WebGL canvas sits behind the page. The light field runs through the
 * whole document in depth, and the two 3D stations (the power wall and the
 * LUXONNICore signal) sit in that same world at the height of their section.
 * The camera rides the scroll position, so the scene, the stations and the
 * animation move together. Scrolling fast adds energy: the light speeds up and
 * the camera rolls a little. A station lights up as it reaches the centre of
 * the screen.
 *
 * Classic script with dynamic import() so it also runs from file://.
 * If it cannot start, the canvas stays hidden and the 2D fallback in
 * background.js takes over the hero.
 */
(function () {
  var canvas = document.getElementById("world");
  if (!canvas) return;

  var REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var LOW_POWER = window.innerWidth < 760 || (navigator.hardwareConcurrency || 8) <= 4;

  Promise.all([
    import("three"),
    import("three/addons/postprocessing/EffectComposer.js"),
    import("three/addons/postprocessing/RenderPass.js"),
    import("three/addons/postprocessing/UnrealBloomPass.js"),
    import("three/addons/postprocessing/OutputPass.js"),
    import("three/addons/environments/RoomEnvironment.js"),
    import("three/addons/lines/LineGeometry.js"),
    import("three/addons/lines/LineMaterial.js"),
    import("three/addons/lines/Line2.js"),
    import("three/addons/geometries/RoundedBoxGeometry.js"),
  ])
    .then(function (m) {
      start({
        T: m[0],
        EffectComposer: m[1].EffectComposer,
        RenderPass: m[2].RenderPass,
        UnrealBloomPass: m[3].UnrealBloomPass,
        OutputPass: m[4].OutputPass,
        RoomEnvironment: m[5].RoomEnvironment,
        LineGeometry: m[6].LineGeometry,
        LineMaterial: m[7].LineMaterial,
        Line2: m[8].Line2,
        RoundedBoxGeometry: m[9].RoundedBoxGeometry,
      });
    })
    .catch(function (err) {
      console.warn("world3d: 3D world unavailable, using the 2D background", err);
      canvas.style.display = "none";
    });

  var K = 1 / 200; // world units per CSS pixel: 200 px = 1 unit
  var VOID = 0x09090f;
  var AMP = 0.6; // wave amplitude, must match the strand shader
  var PHOTON = [0.78, 0.96, 1.0];
  var EMBER = [1.0, 0.42, 0.21];
  var IRIS = [0.48, 0.44, 1.0];

  /* ------------------------------------------------------------------ */
  /* shaders                                                             */
  /* ------------------------------------------------------------------ */

  var WAVE_GLSL = [
    "uniform float uTime;",
    "uniform float uPhase;",
    "uniform float uAmp;",
    "vec3 wave(vec3 p, float t, float ph, float amp) {",
    "  p.y += sin(p.x * 0.32 + t * 1.1 + ph) * amp;",
    "  p.z += cos(p.x * 0.21 - t * 0.8 + ph * 1.3) * amp * 1.4;",
    "  return p;",
    "}",
  ].join("\n");

  var STRAND_VS = [
    WAVE_GLSL,
    "varying float vA;",
    "varying float vD;",
    "void main() {",
    "  vec3 p = wave(position, uTime, uPhase, uAmp);",
    "  vA = 1.0 - smoothstep(9.0, 17.0, abs(p.x));",
    "  vec4 mv = modelViewMatrix * vec4(p, 1.0);",
    "  vD = clamp((-mv.z - 10.0) / 26.0, 0.0, 1.0);",
    "  gl_Position = projectionMatrix * mv;",
    "}",
  ].join("\n");

  var STRAND_FS = [
    "uniform vec3 uColor;",
    "uniform float uOpacity;",
    "varying float vA;",
    "varying float vD;",
    "void main() {",
    "  gl_FragColor = vec4(uColor * (1.0 - 0.6 * vD), uOpacity * vA * (1.0 - 0.8 * vD));",
    "}",
  ].join("\n");

  var BAND_VS = [
    "varying vec2 vUv;",
    "void main() {",
    "  vUv = uv;",
    "  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);",
    "}",
  ].join("\n");

  var BAND_FS = [
    "uniform float uTime;",
    "uniform float uSpeed;",
    "uniform float uDisp;",
    "uniform float uPhase;",
    "uniform float uBright;",
    "uniform vec3 uPhoton;",
    "uniform vec3 uEmber;",
    "varying vec2 vUv;",
    "void main() {",
    "  float u = vUv.x;",
    "  float p = fract(u * 1.6 - uTime * uSpeed + uPhase);",
    "  p += uDisp * 0.06 * sin(u * 60.0 + uTime * 10.0 + uPhase * 9.0);",
    "  p = fract(p);",
    "  float tail = mix(10.0, 3.5, uDisp);",
    "  float I = exp(-p * tail) + uDisp * 0.5 * exp(-fract(p + 0.4) * tail * 0.7);",
    "  vec3 col = mix(uPhoton, uEmber, uDisp);",
    "  gl_FragColor = vec4(vec3(0.07, 0.07, 0.12) + col * I * uBright, 1.0);",
    "}",
  ].join("\n");

  /* ------------------------------------------------------------------ */

  function start(D) {
    var T = D.T;
    var renderer;
    try {
      renderer = new T.WebGLRenderer({ canvas: canvas, antialias: false, powerPreference: "high-performance" });
    } catch (e) {
      canvas.style.display = "none";
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, LOW_POWER ? 1.25 : 2));
    renderer.setClearColor(VOID, 1);
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = T.SRGBColorSpace;

    var scene = new T.Scene();
    scene.background = new T.Color(VOID);

    var pmrem = new T.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new D.RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.5;

    var camera = new T.PerspectiveCamera(30, 1, 0.1, 400);

    var key = new T.DirectionalLight(0xffffff, 1.2);
    key.position.set(3, 6, 6);
    scene.add(key);
    var irisLight = new T.PointLight(new T.Color(IRIS[0], IRIS[1], IRIS[2]).getHex(), 8, 40, 2);
    irisLight.position.set(-6, 4, -6);
    scene.add(irisLight);

    var colPhoton = new T.Color(PHOTON[0], PHOTON[1], PHOTON[2]);
    var colEmber = new T.Color(EMBER[0], EMBER[1], EMBER[2]);
    var colIris = new T.Color(IRIS[0], IRIS[1], IRIS[2]);
    var glowTex = makeGlow(T);

    /* ---------------- the light field: strands through the whole page ---- */

    var docH = Math.max(document.documentElement.scrollHeight, window.innerHeight);
    var yBottom = -(docH * K) - 5;
    var yTop = 4;
    var strandCount = LOW_POWER ? 40 : 90;
    var strands = [];
    var pulses = [];
    var strandGroup = new T.Group();
    scene.add(strandGroup);

    for (var i = 0; i < strandCount; i++) {
      var fy = (i * 0.618034) % 1;
      var fz = (i * 0.7548776662) % 1;
      var yb = yBottom + fy * (yTop - yBottom);
      var zb = -24 + fz * 16 + Math.sin(i * 1.7) * 1.2;
      var pts = [];
      for (var x = -18; x <= 18; x += 1.5) {
        pts.push(
          new T.Vector3(
            x,
            yb + Math.sin(x * 0.18 + i * 0.37) * 1.1,
            zb + Math.cos(x * 0.12 + i * 0.21) * 1.6
          )
        );
      }
      var curve = new T.CatmullRomCurve3(pts, false, "centripetal");
      var depthT = Math.max(0, Math.min(1, (zb + 24) / 16));
      var color = new T.Color(IRIS[0], IRIS[1], IRIS[2]).lerp(colPhoton, (i % 5) / 5);
      var mat = new T.ShaderMaterial({
        vertexShader: STRAND_VS,
        fragmentShader: STRAND_FS,
        uniforms: {
          uTime: { value: 0 },
          uPhase: { value: i * 0.61 },
          uAmp: { value: AMP },
          uColor: { value: color },
          uOpacity: { value: 0.1 + (i % 3) * 0.035 },
        },
        transparent: true,
        depthWrite: false,
        blending: T.AdditiveBlending,
      });
      var tube = new T.Mesh(new T.TubeGeometry(curve, 240, 0.007 + 0.016 * depthT, 6, false), mat);
      strandGroup.add(tube);
      strands.push({ mat: mat, phase: i * 0.61, curve: curve });

      if (i % 3 === 0) {
        var s = new T.Sprite(
          new T.SpriteMaterial({
            map: glowTex,
            color: colPhoton.clone().multiplyScalar(2.4),
            transparent: true,
            depthWrite: false,
            blending: T.AdditiveBlending,
            toneMapped: false,
          })
        );
        s.scale.setScalar(0.22);
        scene.add(s);
        pulses.push({ sprite: s, strand: strands.length - 1, t: (i * 0.071) % 1, speed: 0.035 + ((i * 13) % 9) * 0.004 });
      }
    }

    // a few hundred specks of dust so the depth reads even between strands
    var dustN = LOW_POWER ? 160 : 360;
    var dustPos = new Float32Array(dustN * 3);
    for (var d = 0; d < dustN; d++) {
      dustPos[d * 3] = (Math.random() - 0.5) * 30;
      dustPos[d * 3 + 1] = yBottom + Math.random() * (yTop - yBottom);
      dustPos[d * 3 + 2] = -18 + Math.random() * 22;
    }
    var dustGeo = new T.BufferGeometry();
    dustGeo.setAttribute("position", new T.BufferAttribute(dustPos, 3));
    scene.add(new T.Points(dustGeo, new T.PointsMaterial({ color: 0x9a9790, size: 0.03, transparent: true, opacity: 0.45, depthWrite: false })));

    /* ---------------- station 1: the power wall -------------------------- */

    var power = buildPower(T, D, glowTex, colPhoton, colEmber, colIris);
    scene.add(power.group);

    /* ---------------- station 2: the LUXONNICore signal ----------------- */

    var signal = buildSignal(T, D, colPhoton, colEmber, colIris);
    scene.add(signal.group);

    var stations = [
      { el: document.querySelector("[data-station='power']"), group: power.group, bw: 8.4, bh: 2.9, api: power, docCY: 0 },
      { el: document.querySelector("[data-station='signal']"), group: signal.group, bw: 9.8, bh: 3.2, api: signal, docCY: 0 },
    ].filter(function (st) {
      return st.el;
    });

    /* ---------------- post ----------------------------------------------- */

    var size = new T.Vector2();
    var target = new T.WebGLRenderTarget(4, 4, { type: T.HalfFloatType, samples: LOW_POWER ? 0 : 4 });
    var composer = new D.EffectComposer(renderer, target);
    composer.addPass(new D.RenderPass(scene, camera));
    var bloom = new D.UnrealBloomPass(new T.Vector2(1, 1), 0.55, 0.45, 0.36);
    composer.addPass(bloom);
    composer.addPass(new D.OutputPass());

    var lineMats = [signal.lineMat, signal.baseMat];

    /* ---------------- layout: stations follow their sections ------------- */

    function layout() {
      var vw = window.innerWidth;
      var vh = window.innerHeight;
      renderer.setSize(vw, vh, false);
      renderer.getDrawingBufferSize(size);
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(vw, vh);
      bloom.setSize(vw, vh);
      lineMats.forEach(function (m) {
        m.resolution.set(size.x, size.y);
      });
      // the camera keeps 1 unit = 200 px at the station plane
      var dist = vh * K / 2 / Math.tan(T.MathUtils.degToRad(15));
      camera.position.z = dist;
      camera.aspect = vw / vh;
      camera.updateProjectionMatrix();

      stations.forEach(function (st) {
        var r = st.el.getBoundingClientRect();
        var cx = r.left + r.width / 2;
        var cy = r.top + window.scrollY + r.height / 2;
        var fit = Math.min((r.width * 0.9) / (st.bw * 200), (r.height * 0.9) / (st.bh * 200));
        st.group.scale.setScalar(fit);
        st.group.position.set((cx - vw / 2) * K, -cy * K, 0);
        st.docCY = cy;
      });
    }

    var resizeTimer = null;
    window.addEventListener("resize", function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(layout, 120);
    });
    window.addEventListener("load", layout);
    layout();

    /* ---------------- the scroll-driven frame ---------------------------- */

    var pointer = { x: 0, y: 0, sx: 0, sy: 0 };
    if (!REDUCED) {
      window.addEventListener(
        "pointermove",
        function (e) {
          pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
          pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
        },
        { passive: true }
      );
    }

    var cur = window.scrollY;
    var prevCur = cur;
    var vel = 0;
    var clock = 0;
    var last = performance.now();
    var raf = null;
    var tmp = new T.Vector3();

    function wavePoint(p, t, phase) {
      p.y += Math.sin(p.x * 0.32 + t * 1.1 + phase) * AMP;
      p.z += Math.cos(p.x * 0.21 - t * 0.8 + phase * 1.3) * AMP * 1.4;
      return p;
    }

    function render(dt, now) {
      var vh = window.innerHeight;
      cur += (window.scrollY - cur) * (1 - Math.exp(-dt * 9));
      var v = dt > 0 ? (cur - prevCur) / dt : 0;
      prevCur = cur;
      vel += (v - vel) * (1 - Math.exp(-dt * 6));
      var energy = Math.min(1, Math.abs(vel) / 2500);
      clock += dt * (1 + 2.2 * energy);

      pointer.sx += (pointer.x - pointer.sx) * Math.min(1, dt * 2.5);
      pointer.sy += (pointer.y - pointer.sy) * Math.min(1, dt * 2.5);

      var camY = -(cur + vh / 2) * K;
      var roll = Math.max(-0.05, Math.min(0.05, vel * 0.000012));
      camera.up.set(Math.sin(roll), Math.cos(roll), 0);
      camera.position.x = pointer.sx * 0.12;
      camera.position.y = camY - pointer.sy * 0.08;
      camera.lookAt(0, camY, 0);

      strands.forEach(function (s) {
        s.mat.uniforms.uTime.value = clock;
      });
      pulses.forEach(function (p) {
        p.t = (((p.t + dt * p.speed * (1 + energy)) % 1) + 1) % 1;
        tmp.copy(strands[p.strand].curve.getPointAt(p.t));
        wavePoint(tmp, clock, strands[p.strand].phase);
        p.sprite.position.copy(tmp);
        p.sprite.material.opacity = Math.max(0, 1 - Math.min(1, Math.abs(tmp.x) / 17));
      });

      stations.forEach(function (st) {
        var focus = 1 - Math.min(1, Math.abs(st.docCY - (cur + vh / 2)) / (vh * 0.8));
        st.api.update(clock, Math.max(0, focus), energy);
      });

      composer.render();
    }

    function frame(now) {
      raf = null;
      var dt = Math.max(0, Math.min((now - last) / 1000, 0.05));
      last = now;
      render(dt, now);
      if (!REDUCED) raf = requestAnimationFrame(frame);
    }

    if (REDUCED) {
      render(0, 0);
      window.addEventListener("scroll", function () {
        render(0, 0);
      }, { passive: true });
    } else {
      raf = requestAnimationFrame(frame);
    }

    // The 2D fallback in the hero is no longer needed once the world is running.
    document.querySelectorAll(".fiber-bg").forEach(function (el) {
      el.querySelectorAll(".fiber-canvas").forEach(function (c) {
        c.remove();
      });
      el.dataset.gl = "on";
    });
  }

  /* ------------------------------------------------------------------ */
  /* the stations, in their own local space (centred on the origin)      */
  /* ------------------------------------------------------------------ */

  function buildPower(T, D, glowTex, colPhoton, colEmber, colIris) {
    var group = new T.Group();
    var rackX = -3.5;
    var xcvrX = -0.8;
    var barsX = [1.9, 2.8, 3.7];
    var barsH = [1.0, 1.6, 2.4];

    var rack = new T.Mesh(
      new T.BoxGeometry(1.5, 2.9, 1.1),
      new T.MeshStandardMaterial({ color: 0x14161e, metalness: 0.6, roughness: 0.35 })
    );
    rack.position.set(rackX, 0, 0);
    group.add(rack);

    var slots = [];
    var slotGeo = new T.BoxGeometry(1.2, 0.07, 0.04);
    for (var s = 0; s < 9; s++) {
      var sm = new T.MeshStandardMaterial({
        color: 0x111318,
        emissive: s % 3 === 0 ? colEmber.clone() : colIris.clone(),
        emissiveIntensity: 0.4,
      });
      var slot = new T.Mesh(slotGeo, sm);
      slot.position.set(rackX, -1.2 + s * 0.3, 0.57);
      group.add(slot);
      slots.push({ mat: sm, seed: s * 1.73 });
    }

    var xcvr = new T.Mesh(
      new T.BoxGeometry(0.95, 0.42, 0.6),
      new T.MeshStandardMaterial({ color: 0x1b1e28, metalness: 0.8, roughness: 0.25 })
    );
    xcvr.position.set(xcvrX, 0, 0);
    group.add(xcvr);

    var dspMat = new T.MeshStandardMaterial({ color: 0x20110c, emissive: colEmber.clone(), emissiveIntensity: 1.2, roughness: 0.5 });
    var dsp = new T.Mesh(new T.BoxGeometry(0.34, 0.07, 0.34), dspMat);
    dsp.position.set(xcvrX, 0.245, 0);
    group.add(dsp);

    var heatMat = new T.SpriteMaterial({
      map: glowTex,
      color: colEmber.clone(),
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
      blending: T.AdditiveBlending,
    });
    var heat = new T.Sprite(heatMat);
    heat.position.set(xcvrX, 0.3, 0);
    heat.scale.setScalar(0.9);
    group.add(heat);

    var bands = [];
    function addBand(curve, disp, phase, radius) {
      var mat = new T.ShaderMaterial({
        vertexShader: BAND_VS,
        fragmentShader: BAND_FS,
        uniforms: {
          uTime: { value: 0 },
          uSpeed: { value: 0.3 },
          uDisp: { value: disp },
          uPhase: { value: phase },
          uBright: { value: 1.5 },
          uPhoton: { value: new T.Vector3(PHOTON[0], PHOTON[1], PHOTON[2]) },
          uEmber: { value: new T.Vector3(EMBER[0], EMBER[1], EMBER[2]) },
        },
      });
      group.add(new T.Mesh(new T.TubeGeometry(curve, 60, radius, 8, false), mat));
      bands.push(mat);
    }
    addBand(
      new T.CatmullRomCurve3([new T.Vector3(rackX + 0.8, 0, 0), new T.Vector3(-2.1, 0.12, 0), new T.Vector3(xcvrX - 0.5, 0, 0)]),
      1.0,
      0.0,
      0.035
    );
    barsX.forEach(function (bx, i) {
      var curve = new T.CatmullRomCurve3([
        new T.Vector3(xcvrX + 0.5, 0, 0),
        new T.Vector3((xcvrX + bx) / 2, 0.5 + i * 0.12, -0.5 + i * 0.5),
        new T.Vector3(bx, -1.1 + barsH[i] * 0.5, 0),
      ]);
      addBand(curve, 0.0, i * 0.37, 0.022);
    });

    var bars = [];
    barsX.forEach(function (bx, i) {
      var mat = new T.MeshStandardMaterial({
        color: 0x1a0e0a,
        emissive: colEmber.clone(),
        emissiveIntensity: 0.25 + i * 0.2,
        roughness: 0.4,
        metalness: 0.3,
      });
      var bar = new T.Mesh(new T.BoxGeometry(0.52, barsH[i], 0.52), mat);
      bar.position.set(bx, -1.45 + barsH[i] / 2, 0);
      group.add(bar);
      var cap = new T.Mesh(
        new T.SphereGeometry(0.1, 16, 12),
        new T.MeshBasicMaterial({ color: colPhoton.clone(), toneMapped: false })
      );
      cap.position.set(bx, -1.45 + barsH[i] + 0.1, 0);
      group.add(cap);
      bars.push({ mesh: bar, mat: mat, cap: cap, base: barsH[i], i: i });
    });

    return {
      group: group,
      update: function (clock, focus, energy) {
        slots.forEach(function (sl) {
          var on = 0.5 + 0.5 * Math.sin(clock * 2.4 + sl.seed);
          sl.mat.emissiveIntensity = (0.15 + 1.1 * on * on) * (0.45 + 0.7 * focus);
        });
        var heatBeat = 0.5 + 0.5 * Math.sin(clock * 1.6);
        dspMat.emissiveIntensity = (0.9 + 1.4 * heatBeat) * (0.5 + 0.6 * focus);
        heatMat.opacity = 0.25 + 0.35 * heatBeat;
        heat.scale.setScalar(0.8 + 0.3 * heatBeat);
        bands.forEach(function (b) {
          b.uniforms.uTime.value = clock;
        });
        bars.forEach(function (b) {
          var grow = 0.82 + 0.18 * (0.5 + 0.5 * Math.sin(clock * 0.7 - b.i * 0.6 + energy * 2));
          b.mesh.scale.y = grow;
          b.mesh.position.y = -1.45 + (b.base * grow) / 2;
          b.cap.position.y = -1.45 + b.base * grow + 0.1;
          b.mat.emissiveIntensity = (0.25 + b.i * 0.2 + 0.4 * heatBeat) * (0.5 + 0.6 * focus);
        });
      },
    };
  }

  function buildSignal(T, D, colPhoton, colEmber, colIris) {
    var group = new T.Group();
    var SAMPLES = 220;
    var X0 = -4.8;
    var X1 = 4.8;
    var CORE_W = 2.6;
    var TRACES = LOW_POWER ? 6 : 9;

    function smoothstep(a, b, x) {
      var t = Math.min(1, Math.max(0, (x - a) / (b - a)));
      return t * t * (3 - 2 * t);
    }
    function traceY(x, t, seed, amp) {
      var s = smoothstep(-CORE_W * 0.7, CORE_W * 0.7, x);
      var distorted =
        0.55 * Math.sin(2 * Math.PI * 0.85 * x - 2.4 * t + seed) +
        0.35 * Math.sin(2 * Math.PI * 2.3 * x + seed * 1.7 + 3.1 * t) +
        0.18 * Math.sin(2 * Math.PI * 4.1 * x - 1.3 * t + seed * 2.3) +
        0.14 * Math.sin(x * 13 + seed * 5 + t * 6) * Math.sin(x * 5.3 - t * 2);
      var clean = 0.9 * Math.sin(2 * Math.PI * 0.85 * x - 2.4 * t);
      return (1 - s) * distorted * amp + s * clean;
    }

    var core = new T.Mesh(
      new D.RoundedBoxGeometry(CORE_W, 1.7, 1.5, 3, 0.1),
      new T.MeshPhysicalMaterial({
        color: 0x1a1d2a,
        roughness: 0.05,
        transparent: true,
        opacity: 0.32,
        depthWrite: false,
        clearcoat: 1,
        clearcoatRoughness: 0.04,
        ior: 1.5,
      })
    );
    core.renderOrder = 2;
    group.add(core);

    var nodeMat = new T.MeshBasicMaterial({ color: colPhoton.clone(), toneMapped: false });
    var nodes = [];
    var nodeGeo = new T.SphereGeometry(0.05, 14, 10);
    for (var ix = 0; ix < 5; ix++) {
      for (var iy = 0; iy < 3; iy++) {
        var node = new T.Mesh(nodeGeo, nodeMat);
        node.position.set(-0.9 + ix * 0.45, -0.4 + iy * 0.4, 0);
        group.add(node);
        nodes.push(node);
      }
    }

    var lineMat = new D.LineMaterial({
      linewidth: 1.6,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: T.AdditiveBlending,
    });
    var traces = [];
    for (var k = 0; k < TRACES; k++) {
      var geo = new D.LineGeometry();
      group.add(new D.Line2(geo, lineMat));
      traces.push({ geo: geo, seed: (k / TRACES) * Math.PI * 2, z: -1.1 + (2.2 * k) / (TRACES - 1), amp: 0.8 + 0.3 * Math.sin(k * 1.9) });
    }

    var baseGeo = new D.LineGeometry();
    baseGeo.setPositions([X0, 0, 0, X1, 0, 0]);
    var baseMat = new D.LineMaterial({ linewidth: 1, color: colIris.getHex(), transparent: true, opacity: 0.25, depthWrite: false });
    group.add(new D.Line2(baseGeo, baseMat));

    var positions = new Float32Array(SAMPLES * 3);
    var colors = new Float32Array(SAMPLES * 3);
    var tmpC = new T.Color();
    for (var si = 0; si < SAMPLES; si++) {
      var xs = X0 + ((X1 - X0) * si) / (SAMPLES - 1);
      var s2 = smoothstep(-CORE_W * 0.7, CORE_W * 0.7, xs);
      tmpC.copy(colEmber).lerp(colPhoton, s2);
      var br = 0.42 + 0.3 * s2;
      colors[si * 3] = tmpC.r * br;
      colors[si * 3 + 1] = tmpC.g * br;
      colors[si * 3 + 2] = tmpC.b * br;
    }

    return {
      group: group,
      lineMat: lineMat,
      baseMat: baseMat,
      update: function (clock, focus) {
        traces.forEach(function (tr) {
          for (var i = 0; i < SAMPLES; i++) {
            var x = X0 + ((X1 - X0) * i) / (SAMPLES - 1);
            var s = smoothstep(-CORE_W * 0.7, CORE_W * 0.7, x);
            positions[i * 3] = x;
            positions[i * 3 + 1] = traceY(x, clock, tr.seed, tr.amp) * 1.1;
            positions[i * 3 + 2] = tr.z * (1 - 0.85 * s);
          }
          tr.geo.setPositions(positions);
          tr.geo.setColors(colors);
        });
        var beat = 0.5 + 0.5 * Math.sin(clock * 2.2);
        nodeMat.color.copy(colPhoton).multiplyScalar((0.8 + 0.9 * beat) * (0.5 + 0.7 * focus));
        nodes.forEach(function (n, idx) {
          var flash = 0.5 + 0.5 * Math.sin(clock * 3 - idx * 0.5);
          n.scale.setScalar(0.8 + 0.4 * flash);
        });
        lineMat.opacity = 0.45 + 0.5 * focus;
      },
    };
  }

  function makeGlow(T) {
    var c = document.createElement("canvas");
    c.width = c.height = 64;
    var g = c.getContext("2d");
    var grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, "rgba(255,255,255,1)");
    grd.addColorStop(0.3, "rgba(255,255,255,0.4)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    var tex = new T.CanvasTexture(c);
    tex.colorSpace = T.SRGBColorSpace;
    return tex;
  }
})();
