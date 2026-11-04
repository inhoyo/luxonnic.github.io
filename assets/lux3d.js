/*
 * lux3d.js — "Signal equalization", shown as the signal itself, in 3D.
 *
 * One stream of light runs left to right through a glass LUXONNICore block.
 * Several traces, spread in depth, enter smeared and jittered (distorted, ember).
 * Inside the core they pull together and straighten, until on the right they
 * are a single sharp, clean wave (photon-cyan). The viewer sees the change
 * happen along the whole path, which the old 4-layer network did not show.
 *
 * Classic script with dynamic import() so it also works from file://.
 * Mounts every <canvas data-scene="chip">; exposes canvas.luxScene.
 */
(function () {
  var canvases = document.querySelectorAll("canvas[data-scene='chip']");
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
    import("three/addons/lines/LineGeometry.js"),
    import("three/addons/lines/LineMaterial.js"),
    import("three/addons/lines/Line2.js"),
    import("three/addons/geometries/RoundedBoxGeometry.js"),
  ])
    .then(function (m) {
      var deps = {
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
      };
      canvases.forEach(function (canvas) {
        var api = mountSignal(canvas, deps);
        if (api) canvas.luxScene = api;
      });
    })
    .catch(function (err) {
      console.warn("lux3d: 3D figure unavailable, showing labels only", err);
      canvases.forEach(function (c) {
        c.classList.add("is-fallback");
      });
    });

  var VOID = 0x09090f;
  var X0 = -4.8;
  var X1 = 4.8;
  var SAMPLES = 220;
  var TRACES = LOW_POWER ? 6 : 9;
  var CORE_W = 2.6;

  function smoothstep(a, b, x) {
    var t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  }

  // Where a trace is at x: distorted on the left, clean on the right.
  function traceY(x, t, seed, amp) {
    var s = smoothstep(-CORE_W * 0.7, CORE_W * 0.7, x); // 0 = input, 1 = output
    var distorted =
      0.55 * Math.sin(2 * Math.PI * 0.85 * x - 2.4 * t + seed) +
      0.35 * Math.sin(2 * Math.PI * 2.3 * x + seed * 1.7 + 3.1 * t) +
      0.18 * Math.sin(2 * Math.PI * 4.1 * x - 1.3 * t + seed * 2.3) +
      0.14 * Math.sin(x * 13 + seed * 5 + t * 6) * Math.sin(x * 5.3 - t * 2);
    var clean = 0.9 * Math.sin(2 * Math.PI * 0.85 * x - 2.4 * t);
    return (1 - s) * distorted * amp + s * clean;
  }

  function mountSignal(canvas, deps) {
    var T = deps.T;
    var PHOTON = new T.Color(0.78, 0.96, 1.0);
    var EMBER = new T.Color(1.0, 0.42, 0.21);
    var IRIS = new T.Color(0.48, 0.44, 1.0);

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
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = T.SRGBColorSpace;

    var scene = new T.Scene();
    scene.background = new T.Color(VOID);

    var pmrem = new T.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new deps.RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.5;

    var camera = new T.PerspectiveCamera(30, 1, 0.1, 100);

    var key = new T.DirectionalLight(0xffffff, 1.2);
    key.position.set(3, 6, 6);
    scene.add(key);
    var irisLight = new T.PointLight(IRIS.getHex(), 8, 18, 2);
    irisLight.position.set(-5, 3, -4);
    scene.add(irisLight);

    // ---- the reference floor: a receding grid gives the scene its depth ----
    var grid = new T.GridHelper(14, 28, IRIS.getHex(), 0x2a2850);
    grid.position.y = -2.1;
    grid.material.transparent = true;
    grid.material.opacity = 0.3;
    scene.add(grid);

    // ---- the LUXONNICore: glass block with an interferometer lattice ------
    var core = new T.Mesh(
      new deps.RoundedBoxGeometry(CORE_W, 1.7, 1.5, 3, 0.1),
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
    scene.add(core);

    var nodeMat = new T.MeshBasicMaterial({ color: PHOTON.clone(), toneMapped: false });
    var nodes = [];
    var nodeGeo = new T.SphereGeometry(0.05, 14, 10);
    for (var ix = 0; ix < 5; ix++) {
      for (var iy = 0; iy < 3; iy++) {
        var node = new T.Mesh(nodeGeo, nodeMat);
        node.position.set(-0.9 + ix * 0.45, -0.4 + iy * 0.4, 0.0);
        scene.add(node);
        nodes.push(node);
      }
    }

    // ---- traces: one stream, spread in depth, converging and cleaning -----
    var traces = [];
    var lineMat = new deps.LineMaterial({
      linewidth: 1.6,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: T.AdditiveBlending,
    });
    for (var k = 0; k < TRACES; k++) {
      var seed = (k / TRACES) * Math.PI * 2;
      var zDepth = -1.1 + (2.2 * k) / (TRACES - 1);
      var amp = 0.8 + 0.3 * Math.sin(k * 1.9);
      var geo = new deps.LineGeometry();
      var line = new deps.Line2(geo, lineMat);
      scene.add(line);
      traces.push({ geo: geo, seed: seed, z: zDepth, amp: amp, line: line });
    }

    // the baseline the clean wave should sit on
    var baseGeo = new deps.LineGeometry();
    baseGeo.setPositions([X0, 0, 0, X1, 0, 0]);
    var baseMat = new deps.LineMaterial({
      linewidth: 1,
      color: IRIS.getHex(),
      transparent: true,
      opacity: 0.25,
      depthWrite: false,
    });
    var base = new deps.Line2(baseGeo, baseMat);
    base.computeLineDistances();
    scene.add(base);

    // ---- post ------------------------------------------------------------
    var size = new T.Vector2();
    renderer.getDrawingBufferSize(size);
    var target = new T.WebGLRenderTarget(size.x, size.y, {
      type: T.HalfFloatType,
      samples: LOW_POWER ? 0 : 4,
    });
    var composer = new deps.EffectComposer(renderer, target);
    composer.addPass(new deps.RenderPass(scene, camera));
    var bloom = new deps.UnrealBloomPass(new T.Vector2(1, 1), 0.45, 0.4, 0.75);
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
      lineMat.resolution.set(w, h);
      baseMat.resolution.set(w, h);
      camera.aspect = w / h;
      camera.fov = camera.aspect < 1.2 ? 40 : 30;
      camera.updateProjectionMatrix();
    }
    var ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    var time = 0;
    var last = performance.now();
    var raf = null;
    var visible = true;
    var positions = new Float32Array(SAMPLES * 3);
    var colors = new Float32Array(SAMPLES * 3);
    var tmpColor = new T.Color();

    // the colour of the light at x: ember while distorted, photon once clean
    function lightColor(x, out) {
      var s = smoothstep(-CORE_W * 0.7, CORE_W * 0.7, x);
      tmpColor.copy(EMBER).lerp(PHOTON, s);
      var brightness = 0.42 + 0.3 * s;
      out[0] = tmpColor.r * brightness;
      out[1] = tmpColor.g * brightness;
      out[2] = tmpColor.b * brightness;
    }
    var rgb = [0, 0, 0];
    for (var sIdx = 0; sIdx < SAMPLES; sIdx++) {
      var xs = X0 + ((X1 - X0) * sIdx) / (SAMPLES - 1);
      lightColor(xs, rgb);
      colors[sIdx * 3] = rgb[0];
      colors[sIdx * 3 + 1] = rgb[1];
      colors[sIdx * 3 + 2] = rgb[2];
    }

    function step(dt) {
      pointer.sx += (pointer.x - pointer.sx) * Math.min(1, dt * 2.5);
      pointer.sy += (pointer.y - pointer.sy) * Math.min(1, dt * 2.5);

      var portrait = camera.aspect < 1.2;
      var dist = portrait ? 17 : 12.2;
      var yaw = (REDUCED ? 0.3 : 0.3 + Math.sin(time * 0.15) * 0.22) + pointer.sx * 0.18;
      camera.position.set(Math.sin(yaw) * dist, 2.8 - pointer.sy * 0.5, Math.cos(yaw) * dist);
      camera.lookAt(0, -0.2, 0);

      traces.forEach(function (tr) {
        for (var i = 0; i < SAMPLES; i++) {
          var x = X0 + ((X1 - X0) * i) / (SAMPLES - 1);
          var s = smoothstep(-CORE_W * 0.7, CORE_W * 0.7, x);
          // traces pull toward the centre line inside the core, so they converge
          var z = tr.z * (1 - 0.85 * s);
          positions[i * 3] = x;
          positions[i * 3 + 1] = traceY(x, time, tr.seed, tr.amp) * 1.1;
          positions[i * 3 + 2] = z;
        }
        tr.geo.setPositions(positions);
        tr.geo.setColors(colors);
      });
      var beat = 0.5 + 0.5 * Math.sin(time * 2.2);
      nodeMat.color.copy(PHOTON).multiplyScalar(0.8 + 0.9 * beat);
      nodes.forEach(function (n, idx) {
        var flash = 0.5 + 0.5 * Math.sin(time * 3 - idx * 0.5);
        n.scale.setScalar(0.8 + 0.4 * flash);
      });
      bloom.strength = 0.35 + 0.1 * beat;
      grid.position.z = -(time * 0.35) % 1; // the floor scrolls, so the stream feels like it moves
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
})();
