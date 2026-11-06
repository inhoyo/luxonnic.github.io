/*
 * reel.js — the LUXONNICore zoom, scrubbed by scroll.
 *
 * The section is tall and its stage is position: sticky. Scroll progress drives
 * video.currentTime through a small ease so frames glide instead of jumping. The video
 * is encoded with every frame a keyframe, so seeking stays smooth. The caption swaps
 * halfway. Reduced-motion visitors keep the poster frame and see both captions.
 */
(function () {
  var root = document.getElementById("reel");
  if (!root) return;
  var video = root.querySelector(".reel-video");
  var copies = Array.prototype.slice.call(root.querySelectorAll(".ch-copy"));
  if (!video) return;

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    copies.forEach(function (el) { el.classList.add("is-active"); });
    return;
  }

  var target = 0;      // wanted time, from scroll
  var shown = 0;       // eased time
  var near = false;
  var loaded = false;
  var raf = 0;

  function progress() {
    var r = root.getBoundingClientRect();
    var span = root.offsetHeight - window.innerHeight;
    return Math.min(1, Math.max(0, -r.top / span));
  }

  function onScroll() {
    var r = root.getBoundingClientRect();
    near = r.top < window.innerHeight * 2 && r.bottom > -window.innerHeight;
    if (near && !loaded) { loaded = true; video.preload = "auto"; video.load(); }
    var p = progress();
    target = p * (video.duration || 10);
    var idx = p < 0.55 ? 0 : 1;
    copies.forEach(function (el, k) { el.classList.toggle("is-active", k === idx); });
    if (!raf) raf = requestAnimationFrame(tick);
  }

  function tick() {
    raf = 0;
    if (!near || !video.duration) return;
    var d = target - shown;
    shown += d * 0.14;
    if (Math.abs(d) < 0.01) shown = target;
    if (Math.abs(video.currentTime - shown) > 0.02) video.currentTime = shown;
    if (shown !== target) raf = requestAnimationFrame(tick);
  }

  video.addEventListener("loadedmetadata", onScroll);
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  onScroll();
})();
