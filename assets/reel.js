/*
 * reel.js — the LUXONNICore zoom plays once, a little faster, when it comes into view.
 * It pauses if you scroll away mid-way and resumes when you return; after the end it holds
 * the last frame. The caption swaps halfway through. Reduced-motion visitors keep the
 * poster frame and see both captions.
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

  video.playbackRate = 1.4;

  function caption(i) {
    copies.forEach(function (el, k) { el.classList.toggle("is-active", k === i); });
  }

  video.addEventListener("timeupdate", function () {
    if (!video.duration) return;
    caption(video.currentTime / video.duration >= 0.5 ? 1 : 0);
  });
  video.addEventListener("ended", function () { caption(1); });

  if (!("IntersectionObserver" in window)) {
    video.play().catch(function () {});
    return;
  }
  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        if (!video.ended) video.play().catch(function () {});
      } else {
        video.pause();
      }
    });
  }, { threshold: 0.5 });
  observer.observe(video);
})();
