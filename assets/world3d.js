/*
 * world3d.js — the whole landing page as one 3D world.
 *
 * One fixed WebGL canvas sits behind the page. A light field runs through the
 * whole document in depth. Two stations sit in that world at the height of
 * their section: the power wall (an open rack, a bare transceiver and stacked
 * light rings) and the LUXONNICore signal (a lattice with the waveform running
 * through it). Both are modelled in Blender (models/build_stations.py) and
 * embedded in assets/stations-models.js, so this works from disk too.
 *
 * Interaction: the stations grow and shrink with the scroll (a station grows as
 * it reaches the centre of the screen), and the part under the pointer swells.
 * Scrolling fast adds energy: the light speeds up and the camera rolls a little.
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
    import("three/addons/loaders/GLTFLoader.js"),
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
        GLTFLoader: m[9].GLTFLoader,
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
  /* shaders for the light field                                         */
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
    scene.environmentIntensity = 0.55;

    var camera = new T.PerspectiveCamera(30, 1, 0.1, 400);

    var key = new T.DirectionalLight(0xffffff, 1.4);
    key.position.set(3, 6, 6);
    scene.add(key);
    var rim = new T.DirectionalLight(new T.Color(IRIS[0], IRIS[1], IRIS[2]), 0.8);
    rim.position.set(-6, 3, -4);
    scene.add(rim);

    var palette = {
      photon: new T.Color(PHOTON[0], PHOTON[1], PHOTON[2]),
      ember: new T.Color(EMBER[0], EMBER[1], EMBER[2]),
      iris: new T.Color(IRIS[0], IRIS[1], IRIS[2]),
      glow: makeGlow(T),
    };

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
        pts.push(new T.Vector3(x, yb + Math.sin(x * 0.18 + i * 0.37) * 1.1, zb + Math.cos(x * 0.12 + i * 0.21) * 1.6));
      }
      var curve = new T.CatmullRomCurve3(pts, false, "centripetal");
      var depthT = Math.max(0, Math.min(1, (zb + 24) / 16));
      var color = palette.iris.clone().lerp(palette.photon, (i % 5) / 5);
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
      strandGroup.add(new T.Mesh(new T.TubeGeometry(curve, 240, 0.007 + 0.016 * depthT, 6, false), mat));
      strands.push({ mat: mat, phase: i * 0.61, curve: curve });

      if (i % 3 === 0) {
        var s = new T.Sprite(
          new T.SpriteMaterial({
            map: palette.glow,
            color: palette.photon.clone().multiplyScalar(2.4),
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

    /* ---------------- post ----------------------------------------------- */

    var size = new T.Vector2();
    var target = new T.WebGLRenderTarget(4, 4, { type: T.HalfFloatType, samples: LOW_POWER ? 0 : 4 });
    var composer = new D.EffectComposer(renderer, target);
    composer.addPass(new D.RenderPass(scene, camera));
    var bloom = new D.UnrealBloomPass(new T.Vector2(1, 1), 0.55, 0.45, 0.36);
    composer.addPass(bloom);
    composer.addPass(new D.OutputPass());

    /* ---------------- stations: loaded from the Blender exports ---------- */

    var stations = [];
    var lineMats = [];
    var hoverRay = new T.Raycaster();
    var pointer = { x: 0, y: 0, sx: 0, sy: 0, inside: false };

    var loads = [
      loadStation(D, "power").then(function (group) {
        var api = buildPowerStation(T, group, palette);
        return { key: "power", el: document.querySelector("[data-station='power']"), group: group, api: api };
      }),
      loadStation(D, "signal").then(function (group) {
        var api = buildSignalStation(T, D, group, palette);
        lineMats.push(api.lineMat, api.baseMat);
        return { key: "signal", el: document.querySelector("[data-station='signal']"), group: group, api: api };
      }),
    ];

    Promise.all(loads)
      .then(function (list) {
        list.forEach(function (st) {
          if (!st.el) return;
          scene.add(st.group);
          var sz = new T.Box3().setFromObject(st.group).getSize(new T.Vector3());
          st.bw = Math.max(0.5, sz.x);
          st.bh = Math.max(0.5, sz.y);
          st.docCY = 0;
          stations.push(st);
        });
        layout();
      })
      .catch(function (err) {
        console.warn("world3d: stations unavailable", err);
      });

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
      camera.position.z = (vh * K) / 2 / Math.tan(T.MathUtils.degToRad(15));
      camera.aspect = vw / vh;
      camera.updateProjectionMatrix();

      stations.forEach(function (st) {
        var r = st.el.getBoundingClientRect();
        var cx = r.left + r.width / 2;
        var cy = r.top + window.scrollY + r.height / 2;
        var fit = Math.min((r.width * 0.92) / (st.bw * 200), (r.height * 0.92) / (st.bh * 200));
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

    if (!REDUCED) {
      window.addEventListener(
        "pointermove",
        function (e) {
          pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
          pointer.y = -((e.clientY / window.innerHeight) * 2 - 1); // NDC, y up
          pointer.inside = true;
        },
        { passive: true }
      );
    }

    /* ---------------- the scroll-driven frame ---------------------------- */

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

    function hoveredPart() {
      if (!pointer.inside || !stations.length) return null;
      hoverRay.setFromCamera({ x: pointer.sx, y: pointer.sy }, camera);
      var meshes = [];
      stations.forEach(function (st) {
        st.group.traverse(function (o) {
          if (o.isMesh && o.userData.part) meshes.push(o);
        });
      });
      var hit = hoverRay.intersectObjects(meshes, false)[0];
      return hit ? { station: hit.object.userData.station, part: hit.object.userData.part } : null;
    }

    function render(dt) {
      var vh = window.innerHeight;
      cur += (window.scrollY - cur) * (1 - Math.exp(-dt * 9));
      var v = dt > 0 ? (cur - prevCur) / dt : 0;
      prevCur = cur;
      vel += (v - vel) * (1 - Math.exp(-dt * 6));
      var energy = Math.min(1, Math.abs(vel) / 2500);
      clock += dt * (1 + 2.2 * energy);

      pointer.sx += (pointer.x - pointer.sx) * Math.min(1, dt * 6);
      pointer.sy += (pointer.y - pointer.sy) * Math.min(1, dt * 6);

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

      var hot = hoveredPart();
      stations.forEach(function (st) {
        var focus = 1 - Math.min(1, Math.abs(st.docCY - (cur + vh / 2)) / (vh * 0.8));
        var part = hot && hot.station === st.key ? hot.part : null;
        st.api.update(dt, clock, Math.max(0, focus), energy, part);
      });

      composer.render();
    }

    function frame(now) {
      raf = null;
      var dt = Math.max(0, Math.min((now - last) / 1000, 0.05));
      last = now;
      render(dt);
      if (!REDUCED) raf = requestAnimationFrame(frame);
    }

    if (REDUCED) {
      render(0);
      window.addEventListener(
        "scroll",
        function () {
          render(0);
        },
        { passive: true }
      );
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
  /* models                                                              */
  /* ------------------------------------------------------------------ */

  function loadStation(D, key) {
    return new Promise(function (resolve, reject) {
      var data = window.LUX_STATIONS && window.LUX_STATIONS[key];
      if (!data) return reject(new Error("missing model: " + key));
      var bin = atob(data);
      var bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      new D.GLTFLoader().parse(
        bytes.buffer,
        "",
        function (gltf) {
          resolve(gltf.scene);
        },
        reject
      );
    });
  }

  // Each exported material is re-created as a lit or glowing material.
  // Parts are tagged so the pointer can find them.
  function skin(T, group, palette, station) {
    group.traverse(function (o) {
      if (!o.isMesh) return;
      var base = o.material && o.material.name ? o.material.name : "";
      o.userData.station = station;
      o.userData.part = o.name;
      if (base === "Metal") {
        o.material = new T.MeshPhysicalMaterial({ color: 0x1b1e27, metalness: 0.85, roughness: 0.28, clearcoat: 0.7, clearcoatRoughness: 0.2 });
      } else if (base === "PCB") {
        o.material = new T.MeshPhysicalMaterial({ color: 0x07120f, metalness: 0, roughness: 0.5, clearcoat: 0.3 });
      } else if (base === "Chip") {
        o.material = new T.MeshStandardMaterial({ color: 0x1a0c07, metalness: 0.5, roughness: 0.35, emissive: palette.ember.clone(), emissiveIntensity: 1.2 });
        o.userData.dsp = o.material;
      } else {
        var col = base === "Iris" ? palette.iris : base === "Photon" ? palette.photon : palette.ember;
        o.material = new T.MeshBasicMaterial({ color: col.clone(), toneMapped: false });
        o.userData.base = col.clone();
      }
    });
  }

  function buildPowerStation(T, group, palette) {
    skin(T, group, palette, "power");

    var shelves = [];
    var dsp = null;
    var rings = [[], [], []];
    var caps = [null, null, null];

    group.traverse(function (o) {
      if (!o.isMesh) return;
      if (o.userData.dsp) dsp = o.userData.dsp;
      var strip = /^Strip_(\d)$/.exec(o.name);
      if (strip) shelves.push({ mat: o.material, seed: Number(strip[1]) * 1.73, base: o.material.color.clone() });
      var ring = /^Bar(\d)_Seg(\d+)$/.exec(o.name);
      if (ring) {
        // each ring gets its own material so it can glow on its own
        o.material = o.material.clone();
        rings[Number(ring[1])].push({ obj: o, mat: o.material, cur: 0, rest: o.position.y, base: o.userData.base.clone() });
      }
      var cap = /^Bar(\d)_Cap$/.exec(o.name);
      if (cap) caps[Number(cap[1])] = o;
    });

    var bars = [0, 1, 2].map(function (b) {
      var list = rings[b].sort(function (a, c) {
        return a.rest - c.rest;
      });
      return { index: b, rings: list, cap: caps[b], grow: 0, hover: 0 };
    });

    return {
      update: function (dt, clock, focus, energy, part) {
        var k = 1 - Math.exp(-dt * 10);

        shelves.forEach(function (sl) {
          var on = 0.5 + 0.5 * Math.sin(clock * 2.4 + sl.seed);
          sl.mat.color.copy(sl.base).multiplyScalar((0.2 + 1.1 * on * on) * (0.45 + 0.8 * focus));
        });

        if (dsp) dsp.emissiveIntensity = (0.9 + 1.4 * (0.5 + 0.5 * Math.sin(clock * 1.6))) * (0.5 + 0.7 * focus);

        bars.forEach(function (bar) {
          var m = part && /^Bar(\d)_/.exec(part);
          var hovered = !!m && Number(m[1]) === bar.index;
          bar.hover += ((hovered ? 0.22 : 0) - bar.hover) * k;
          bar.grow += (0.35 + 0.65 * focus + bar.hover - bar.grow) * k;
          var n = bar.rings.length * Math.min(1.3, Math.max(0, bar.grow));

          bar.rings.forEach(function (r, idx) {
            var target = smooth(Math.min(1, Math.max(0, n - idx)));
            r.cur += (target - r.cur) * k;
            var sc = Math.max(0.0001, r.cur);
            r.obj.scale.set(sc, sc, sc);
            var wave = 0.5 + 0.5 * Math.sin(clock * 3 - idx * 0.45 + bar.index * 0.9);
            r.mat.color.copy(r.base).multiplyScalar((0.55 + 0.9 * wave) * (0.5 + 0.8 * focus));
          });

          if (bar.cap && bar.rings.length > 1) {
            var pitch = bar.rings[1].rest - bar.rings[0].rest;
            bar.cap.position.y = bar.rings[0].rest + n * pitch;
            var cs = Math.max(0.0001, Math.min(1, bar.grow));
            bar.cap.scale.set(cs, cs, cs);
          }
        });
      },
    };
  }

  function buildSignalStation(T, D, group, palette) {
    skin(T, group, palette, "signal");

    var nodes = [];
    var edges = [];
    group.traverse(function (o) {
      if (!o.isMesh) return;
      if (/^Node_/.test(o.name)) {
        o.material = o.material.clone();
        nodes.push({ obj: o, mat: o.material, idx: nodes.length, s: 1 });
      } else if (/^Edge_/.test(o.name)) {
        o.material = o.material.clone();
        edges.push(o.material);
      }
    });

    // The waveform running through the lattice is the signal itself.
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

    var lineMat = new D.LineMaterial({ linewidth: 1.6, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false, blending: T.AdditiveBlending });
    var baseMat = new D.LineMaterial({ linewidth: 1, color: palette.iris.getHex(), transparent: true, opacity: 0.25, depthWrite: false });
    var traces = [];
    for (var k = 0; k < TRACES; k++) {
      var geo = new D.LineGeometry();
      group.add(new D.Line2(geo, lineMat));
      traces.push({ geo: geo, seed: (k / TRACES) * Math.PI * 2, z: -1.1 + (2.2 * k) / (TRACES - 1), amp: 0.8 + 0.3 * Math.sin(k * 1.9) });
    }
    var baseGeo = new D.LineGeometry();
    baseGeo.setPositions([X0, 0, 0, X1, 0, 0]);
    group.add(new D.Line2(baseGeo, baseMat));

    var positions = new Float32Array(SAMPLES * 3);
    var colors = new Float32Array(SAMPLES * 3);
    var tmpC = new T.Color();
    for (var si = 0; si < SAMPLES; si++) {
      var xs = X0 + ((X1 - X0) * si) / (SAMPLES - 1);
      var s2 = smoothstep(-CORE_W * 0.7, CORE_W * 0.7, xs);
      tmpC.copy(palette.ember).lerp(palette.photon, s2);
      var br = 0.42 + 0.3 * s2;
      colors[si * 3] = tmpC.r * br;
      colors[si * 3 + 1] = tmpC.g * br;
      colors[si * 3 + 2] = tmpC.b * br;
    }

    return {
      lineMat: lineMat,
      baseMat: baseMat,
      update: function (dt, clock, focus, energy, part) {
        var k2 = 1 - Math.exp(-dt * 10);
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
        lineMat.opacity = 0.45 + 0.5 * focus;

        nodes.forEach(function (n) {
          var flash = 0.5 + 0.5 * Math.sin(clock * 3 - (n.idx % 5) * 0.5 - Math.floor(n.idx / 5) * 0.7);
          var hovered = part === n.obj.name;
          var target = (0.8 + 0.35 * flash) * (0.5 + 0.7 * focus) * (hovered ? 1.9 : 1);
          n.s += (target - n.s) * k2;
          n.obj.scale.setScalar(Math.max(0.0001, n.s));
          n.mat.color.copy(palette.photon).multiplyScalar((0.5 + 0.9 * flash) * (0.45 + 0.8 * focus) * (hovered ? 1.6 : 1));
        });
        edges.forEach(function (m) {
          m.color.copy(palette.iris).multiplyScalar(0.25 + 0.9 * focus);
        });
      },
    };
  }

  function smooth(t) {
    return t * t * (3 - 2 * t);
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
