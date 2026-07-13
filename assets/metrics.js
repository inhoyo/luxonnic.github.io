(function () {
  var reduceMotion =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var panels = document.querySelectorAll(".metric-panel[data-target]");
  if (!panels.length) return;

  function runCount(panel) {
    var target = parseFloat(panel.getAttribute("data-target"));
    var valueEl = panel.querySelector(".metric-value");
    if (!valueEl || isNaN(target)) return;

    if (reduceMotion) {
      valueEl.textContent = target;
      return;
    }

    var duration = 1200;
    var start = performance.now();

    function tick(now) {
      var p = Math.min((now - start) / duration, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      valueEl.textContent = Math.round(eased * target);
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  if (!("IntersectionObserver" in window)) {
    panels.forEach(runCount);
    return;
  }

  var io = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          runCount(entry.target);
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.4 }
  );

  panels.forEach(function (panel) {
    io.observe(panel);
  });
})();
