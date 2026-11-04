/*
 * power3d.js — "The power wall", rendered in 3D.
 *
 * A server rack with blinking slots feeds a transceiver. Its DSP chip glows
 * ember and breathes with its 20 W draw, and the distorted light runs out of
 * the module as bands. On the right, a row of columns climbs with every
 * generation: the power wall.
 *
 * Classic script with dynamic import() so it also works from file://.
 * Mounts every <canvas data-scene="power">; exposes canvas.luxScene.
 */
(function () {
  var canvases = document.querySelectorAll("canvas[data-scene='power']");
  if (!canvases.length) return;

  var REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var LOW_POWER = window.innerWidth < 760 || (navigator.hardwareConcurrency || 8) <= 4;

  Promise.all([
    import("three"),
    import("three/addons/postprocessing/EffectComposer.js"),
    import("three/addons/postprocessing/RenderPass.js"),
    import("three/addons/postprocessing/UnrealBloomPass.js"),
    import("three/addons/postprocessing/OutputPass.js"),
    import("three/addons/environments/RoomEnvironment.js"),
  ])
    .then(function (m) {
      var deps = {
        T: m[0],
        EffectComposer: m[1].EffectComposer,
        RenderPass: m[2].RenderPass,
        UnrealBloomPass: m[3].UnrealBloomPass,
        OutputPass: m[4].OutputPass,
        RoomEnvironment: m[5].RoomEnvironment,
      };
      canvases.forEach(function (canvas) {
        var api = mountPower(canvas, deps);
        if (api) canvas.luxScene = api;
      });
    })
    .catch(function (err) {
      console.warn("power3d: 3D figure unavailable, showing labels only", err);
      canvases.forEach(function (c) {
        c.classList.add("is-fallback");
      });
    });

  var VOID = 0x09090f;
  var EMBER_HEX = 0xff6b35;
  var PHOTON_HEX = 0xc8f5ff;
  var IRIS_HEX = 0x7b6fff;

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
    "  gl_FragColor = vec4(vec3(0.07, 0.07, 0.12) + col * I * 1.5, 1.0);",
    "}",
  ].join("\n");

  function mountPower(canvas, deps) {
    var T = deps.T;
    var renderer;
    try {
      renderer = new T.WebGLRenderer({ canvas: canvas, antialias: false, powerPreference: "high-performance" });
    } catch (e) {
      canvas.classList.add("is-fallback");
      return null;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, LOW_POWER ? 1.25 : 2));
    renderer.setClearColor(VOID, 1);
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.outputColorSpace = T.SRGBColorSpace;

    var scene = new T.Scene();
    scene.background = new T.Color(VOID);
    scene.fog = new T.Fog(VOID, 16, 32);

    var pmrem = new T.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new deps.RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.6;

    var camera = new T.PerspectiveCamera(32, 1, 0.1, 100);

    var key = new T.DirectionalLight(0xffffff, 1.3);
    key.position.set(4, 8, 6);
    scene.add(key);
    var ember = new T.PointLight(EMBER_HEX, 8, 14, 2);
    ember.position.set(-0.6, 1.2, 2.5);
    scene.add(ember);
    var iris = new T.PointLight(IRIS_HEX, 8, 18, 2);
    iris.position.set(-5, 3, -4);
    scene.add(iris);

    // floor grid for depth
    var grid = new T.GridHelper(16, 32, IRIS_HEX, 0x2a2850);
    grid.position.y = -1.45;
    grid.material.transparent = true;
    grid.material.opacity = 0.35;
    scene.add(grid);

    // ---- rack -------------------------------------------------------------
    var rackX = -3.5;
    var rack = new T.Mesh(
      new T.BoxGeometry(1.5, 2.9, 1.1),
      new T.MeshStandardMaterial({ color: 0x14161e, metalness: 0.6, roughness: 0.35 })
    );
    rack.position.set(rackX, 0, 0);
    scene.add(rack);

    var slots = [];
    var slotGeo = new T.BoxGeometry(1.2, 0.07, 0.04);
    for (var s = 0; s < 9; s++) {
      var sm = new T.MeshStandardMaterial({
        color: 0x111318,
        emissive: new T.Color(s % 3 === 0 ? EMBER_HEX : IRIS_HEX),
        emissiveIntensity: 0.4,
      });
      var slot = new T.Mesh(slotGeo, sm);
      slot.position.set(rackX, -1.2 + s * 0.3, 0.57);
      scene.add(slot);
      slots.push({ mat: sm, seed: s * 1.73 });
    }

    // ---- transceiver with DSP ------------------------------------------------
    var xcvrX = -0.8;
    var xcvr = new T.Mesh(
      new T.BoxGeometry(0.95, 0.42, 0.6),
      new T.MeshStandardMaterial({ color: 0x1b1e28, metalness: 0.8, roughness: 0.25 })
    );
    xcvr.position.set(xcvrX, 0, 0);
    scene.add(xcvr);

    var dspMat = new T.MeshStandardMaterial({
      color: 0x20110c,
      emissive: new T.Color(EMBER_HEX),
      emissiveIntensity: 1.2,
      roughness: 0.5,
    });
    var dsp = new T.Mesh(new T.BoxGeometry(0.34, 0.07, 0.34), dspMat);
    dsp.position.set(xcvrX, 0.245, 0);
    scene.add(dsp);

    var heatMat = new T.SpriteMaterial({
      map: makeGlow(T),
      color: new T.Color(EMBER_HEX),
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
      blending: T.AdditiveBlending,
    });
    var heat = new T.Sprite(heatMat);
    heat.position.set(xcvrX, 0.3, 0);
    heat.scale.setScalar(0.9);
    scene.add(heat);

    // ---- light: rack -> transceiver (distorted), transceiver -> bars (clean)
    var bands = [];
    function addBand(curve, disp, phase, radius) {
      var geo = new T.TubeGeometry(curve, 60, radius, 8, false);
      var mat = new T.ShaderMaterial({
        vertexShader: BAND_VS,
        fragmentShader: BAND_FS,
        uniforms: {
          uTime: { value: 0 },
          uSpeed: { value: 0.3 },
          uDisp: { value: disp },
          uPhase: { value: phase },
          uPhoton: { value: new T.Vector3(0.78, 0.96, 1.0) },
          uEmber: { value: new T.Vector3(1.0, 0.42, 0.21) },
        },
      });
      scene.add(new T.Mesh(geo, mat));
      bands.push(mat);
    }
    addBand(
      new T.CatmullRomCurve3([
        new T.Vector3(rackX + 0.8, 0, 0),
        new T.Vector3(-2.1, 0.12, 0),
        new T.Vector3(xcvrX - 0.5, 0, 0),
      ]),
      1.0,
      0.0,
      0.035
    );

    // clean fibers out of the transceiver to the power wall
    var barsX = [1.9, 2.8, 3.7];
    var barsH = [1.0, 1.6, 2.4];
    barsX.forEach(function (bx, i) {
      var curve = new T.CatmullRomCurve3([
        new T.Vector3(xcvrX + 0.5, 0, 0),
        new T.Vector3((xcvrX + bx) / 2, 0.5 + i * 0.12, -0.5 + i * 0.5),
        new T.Vector3(bx, -1.1 + barsH[i] * 0.5, 0),
      ]);
      addBand(curve, 0.0, i * 0.37, 0.022);
    });

    // ---- power wall: columns that climb with each generation ----------------
    var bars = [];
    barsX.forEach(function (bx, i) {
      var mat = new T.MeshStandardMaterial({
        color: 0x1a0e0a,
        emissive: new T.Color(EMBER_HEX),
        emissiveIntensity: 0.25 + i * 0.2,
        roughness: 0.4,
        metalness: 0.3,
      });
      var bar = new T.Mesh(new T.BoxGeometry(0.52, barsH[i], 0.52), mat);
      bar.position.set(bx, -1.45 + barsH[i] / 2, 0);
      scene.add(bar);
      var cap = new T.Mesh(
        new T.SphereGeometry(0.1, 16, 12),
        new T.MeshBasicMaterial({ color: new T.Color(PHOTON_HEX), toneMapped: false })
      );
      cap.position.set(bx, -1.45 + barsH[i] + 0.1, 0);
      scene.add(cap);
      bars.push({ mesh: bar, mat: mat, cap: cap, base: barsH[i], i: i });
    });

    // ---- atmosphere ----------------------------------------------------
    var haloMat = new T.SpriteMaterial({
      map: makeGlow(T),
      color: new T.Color(IRIS_HEX),
      transparent: true,
      opacity: 0.07,
      depthWrite: false,
      blending: T.AdditiveBlending,
    });
    var halo = new T.Sprite(haloMat);
    halo.position.set(0, 0.2, -5);
    halo.scale.set(22, 12, 1);
    scene.add(halo);

    // ---- post ---------------------------------------------------------
    var size = new T.Vector2();
    renderer.getDrawingBufferSize(size);
    var target = new T.WebGLRenderTarget(size.x, size.y, {
      type: T.HalfFloatType,
      samples: LOW_POWER ? 0 : 4,
    });
    var composer = new deps.EffectComposer(renderer, target);
    composer.addPass(new deps.RenderPass(scene, camera));
    var bloom = new deps.UnrealBloomPass(new T.Vector2(1, 1), 0.7, 0.45, 0.5);
    composer.addPass(bloom);
    composer.addPass(new deps.OutputPass());

    var pointer = { x: 0, y: 0, sx: 0, sy: 0 };
    function onPointer(e) {
      pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
    }
    if (!REDUCED) window.addEventListener("pointermove", onPointer, { passive: true });

    function resize() {
      var r = canvas.getBoundingClientRect();
      var w = Math.max(1, Math.round(r.width));
      var h = Math.max(1, Math.round(r.height));
      renderer.setSize(w, h, false);
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(w, h);
      bloom.setSize(w, h);
      camera.aspect = w / h;
      camera.fov = camera.aspect < 1.2 ? 44 : 32;
      camera.updateProjectionMatrix();
    }
    var ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    var time = 0;
    var last = performance.now();
    var raf = null;
    var visible = true;

    function step(dt) {
      pointer.sx += (pointer.x - pointer.sx) * Math.min(1, dt * 2.5);
      pointer.sy += (pointer.y - pointer.sy) * Math.min(1, dt * 2.5);

      var portrait = camera.aspect < 1.2;
      var dist = portrait ? 19 : 14.2;
      var yaw = (REDUCED ? 0.18 : 0.18 + Math.sin(time * 0.14) * 0.22) + pointer.sx * 0.15;
      camera.position.set(Math.sin(yaw) * dist - 0.6, 2.4 - pointer.sy * 0.5, Math.cos(yaw) * dist);
      camera.lookAt(-0.4, -0.2, 0);

      bands.forEach(function (b) {
        b.uniforms.uTime.value = time;
      });

      // rack slots blink in their own rhythm
      slots.forEach(function (sl) {
        var on = 0.5 + 0.5 * Math.sin(time * 2.4 + sl.seed);
        sl.mat.emissiveIntensity = 0.15 + 1.1 * on * on;
      });

      // DSP breathes with its power draw
      var heatBeat = 0.5 + 0.5 * Math.sin(time * 1.6);
      dspMat.emissiveIntensity = 0.9 + 1.4 * heatBeat;
      heatMat.opacity = 0.25 + 0.35 * heatBeat;
      heat.scale.setScalar(0.8 + 0.3 * heatBeat);

      // power wall keeps climbing, then settles, on a loop
      bars.forEach(function (b) {
        var grow = 0.82 + 0.18 * (0.5 + 0.5 * Math.sin(time * 0.7 - b.i * 0.6));
        var h = b.base * grow;
        b.mesh.scale.y = grow;
        b.mesh.position.y = -1.45 + h / 2;
        b.cap.position.y = -1.45 + h + 0.1;
        b.mat.emissiveIntensity = 0.25 + b.i * 0.2 + 0.4 * heatBeat;
      });

      bloom.strength = 0.6 + 0.15 * heatBeat;
    }

    function frame(now) {
      raf = null;
      if (!visible && !REDUCED) return;
      var dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      time += dt;
      step(dt);
      composer.render();
      if (!REDUCED) raf = requestAnimationFrame(frame);
    }

    if (REDUCED) {
      step(0);
      composer.render();
    } else {
      raf = requestAnimationFrame(frame);
    }

    var io = new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
      if (visible && !raf && !REDUCED) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    });
    io.observe(canvas);

    return {
      destroy: function () {
        if (raf) cancelAnimationFrame(raf);
        io.disconnect();
        ro.disconnect();
        window.removeEventListener("pointermove", onPointer);
        target.dispose();
        renderer.dispose();
        pmrem.dispose();
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
