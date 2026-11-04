/*
 * scroll.js — Locomotive Scroll (v5, Lenis-based) for the landing page.
 *
 * Smooth wheel and touch scrolling, smooth in-page links, and a thin progress
 * bar at the top. Locomotive v5 keeps the native scroll position, so the 3D
 * world (which reads window.scrollY) and CSS sticky keep working.
 *
 * Skipped entirely for visitors who prefer reduced motion: they get native scroll.
 * Parallax is only applied to plain text blocks, never to the 3D station boxes,
 * because the world aligns to their on-screen position.
 */
(function () {
  if (!window.LocomotiveScroll) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  var bar = document.querySelector(".scroll-progress");

  var scroll = new window.LocomotiveScroll({
    lenisOptions: {
      lerp: 0.085,
      smoothWheel: true,
      wheelMultiplier: 0.95,
      touchMultiplier: 1.2,
    },
    scrollCallback: function (values) {
      if (bar) bar.style.transform = "scaleX(" + Math.min(1, Math.max(0, values.progress)).toFixed(4) + ")";
    },
  });
  window.luxScroll = scroll;

  // smooth in-page links (e.g. "News ↓" in the hero)
  document.querySelectorAll("a[href^='#']").forEach(function (a) {
    a.addEventListener("click", function (e) {
      var id = a.getAttribute("href");
      if (!id || id.length < 2) return;
      var target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      scroll.scrollTo(target, { offset: -24 });
    });
  });
})();
