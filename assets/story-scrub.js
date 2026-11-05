/*
 * story-scrub.js — scroll-scrubbed transparent video for the "story" section.
 *
 * The video has an alpha channel, so it sits directly on the page background.
 * Its playhead follows how far the section has scrolled through the viewport.
 * Reduced-motion visitors get the first frame, held still.
 */
(function () {
  var section = document.getElementById("story");
  var video = document.querySelector(".story-video");
  if (!section || !video) return;

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var duration = 0;
  var ticking = false;

  function progress() {
    var rect = section.getBoundingClientRect();
    var total = section.offsetHeight - window.innerHeight;
    if (total <= 0) return 0;
    var p = -rect.top / total;
    return Math.min(1, Math.max(0, p));
  }

  function seek() {
    ticking = false;
    if (!duration) return;
    var target = progress() * duration;
    // Skip tiny changes so the decoder is not hit on every scroll tick
    if (Math.abs(video.currentTime - target) > 0.02) {
      video.currentTime = target;
    }
  }

  function onScroll() {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(seek);
    }
  }

  function init() {
    duration = video.duration || 0;
    if (reduce) {
      video.pause();
      video.currentTime = 0;
      return;
    }
    seek();
  }

  video.pause();
  if (video.readyState >= 1) init();
  else video.addEventListener("loadedmetadata", init, { once: true });

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
})();
