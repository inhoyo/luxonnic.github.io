(function () {
  var reduceMotion =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var mounts = document.querySelectorAll(".fiber-bg");
  if (!mounts.length) return;

  var PHOTON = "200, 245, 255";
  var IRIS = "123, 111, 255";

  mounts.forEach(function (mount) {
    initFiber(mount);
  });

  function initFiber(mount) {
    var canvas = document.createElement("canvas");
    canvas.className = "fiber-canvas";
    mount.appendChild(canvas);

    var ctx;
    try {
      ctx = canvas.getContext("2d");
    } catch (e) {
      ctx = null;
    }
    if (!ctx) return; // CSS radial-gradient behind it still renders — graceful fallback

    var w, h, strands;
    var SAMPLES = 42;

    function resize() {
      var rect = mount.getBoundingClientRect();
      w = canvas.width = Math.max(1, Math.round(rect.width));
      h = canvas.height = Math.max(1, Math.round(rect.height));
    }

    function rand(a, b) {
      return a + Math.random() * (b - a);
    }

    function makeAnchors(x0, x1, count) {
      var anchors = [];
      for (var i = 0; i < count; i++) {
        var t = count === 1 ? 0 : i / (count - 1);
        anchors.push({
          bx: x0 + (x1 - x0) * t,
          by: rand(h * 0.12, h * 0.88),
          ax: rand(6, 16),
          ay: rand(16, 38),
          fx: rand(0.00006, 0.00016),
          fy: rand(0.00005, 0.00013),
          px: rand(0, Math.PI * 2),
          py: rand(0, Math.PI * 2),
        });
      }
      return anchors;
    }

    function makeStrand(color, thin) {
      return {
        anchors: makeAnchors(rand(-w * 0.1, w * 0.1), rand(w * 0.9, w * 1.1), 4 + Math.floor(Math.random() * 2)),
        color: color,
        baseAlpha: thin ? rand(0.12, 0.22) : rand(0.25, 0.4),
        lineWidth: thin ? 1 : 1.5,
        pulseSpeed: rand(0.00012, 0.00026),
        pulsePhase: Math.random(),
        pulse: !thin,
      };
    }

    function buildStrands() {
      var count = w < 700 ? 6 : 11;
      strands = [];
      for (var i = 0; i < count; i++) {
        var color = Math.random() < 0.7 ? PHOTON : IRIS;
        strands.push(makeStrand(color, false));
        // ~35% chance this strand forks into a second, dimmer branch
        // sharing its first two anchors, then diverging
        if (Math.random() < 0.35) {
          var main = strands[strands.length - 1];
          var branch = makeStrand(color, true);
          branch.anchors[0] = main.anchors[0];
          branch.anchors[1] = main.anchors[1];
          strands.push(branch);
        }
      }
    }

    function catmullRom(p0, p1, p2, p3, t) {
      var t2 = t * t,
        t3 = t2 * t;
      var x =
        0.5 *
        (2 * p1.x +
          (-p0.x + p2.x) * t +
          (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
          (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
      var y =
        0.5 *
        (2 * p1.y +
          (-p0.y + p2.y) * t +
          (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
          (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);
      return { x: x, y: y };
    }

    function sampleStrand(anchors, time) {
      var pts = anchors.map(function (a) {
        if (reduceMotion) return { x: a.bx, y: a.by };
        return {
          x: a.bx + Math.sin(time * a.fx + a.px) * a.ax,
          y: a.by + Math.sin(time * a.fy + a.py) * a.ay,
        };
      });
      var n = pts.length;
      var out = [];
      for (var s = 0; s <= SAMPLES; s++) {
        var g = s / SAMPLES;
        var segT = g * (n - 1);
        var i = Math.min(n - 2, Math.floor(segT));
        var localT = segT - i;
        var p0 = pts[Math.max(0, i - 1)];
        var p1 = pts[i];
        var p2 = pts[Math.min(n - 1, i + 1)];
        var p3 = pts[Math.min(n - 1, i + 2)];
        out.push(catmullRom(p0, p1, p2, p3, localT));
      }
      return out;
    }

    function strokePoints(pts, color, alpha, lineWidth) {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.strokeStyle = "rgba(" + color + ", " + alpha + ")";
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    }

    function draw(time) {
      ctx.clearRect(0, 0, w, h);

      for (var s = 0; s < strands.length; s++) {
        var st = strands[s];
        var pts = sampleStrand(st.anchors, time);
        strokePoints(pts, st.color, st.baseAlpha, st.lineWidth);

        if (st.pulse && !reduceMotion) {
          var t = (time * st.pulseSpeed + st.pulsePhase) % 1;
          var idx = Math.floor(t * (pts.length - 1));
          var span = 6;
          var start = Math.max(0, idx - span);
          var end = Math.min(pts.length - 1, idx + span);
          var glowPts = pts.slice(start, end + 1);
          if (glowPts.length > 1) {
            ctx.save();
            ctx.shadowColor = "rgba(" + st.color + ", 0.9)";
            ctx.shadowBlur = 8;
            strokePoints(glowPts, st.color, 0.9, st.lineWidth + 0.6);
            ctx.restore();
          }
        }
      }
    }

    var raf;
    function loop(ts) {
      draw(ts);
      raf = requestAnimationFrame(loop);
    }

    function start() {
      resize();
      buildStrands();
      if (reduceMotion) {
        draw(0);
      } else {
        loop(0);
      }
    }

    var resizeTimer;
    window.addEventListener("resize", function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        resize();
        buildStrands();
        if (reduceMotion) draw(0);
      }, 200);
    });

    document.addEventListener("visibilitychange", function () {
      if (document.hidden) {
        if (raf) cancelAnimationFrame(raf);
      } else if (!reduceMotion) {
        loop(0);
      }
    });

    start();
  }
})();
