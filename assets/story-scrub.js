/*
 * story-scrub.js — scroll-scrubbed video for the "story" section.
 *
 * The video's playhead eases toward the scroll position instead of jumping
 * to it, and a new seek only starts once the previous one has finished.
 * The video is encoded with every frame as a keyframe, so each seek is
 * a single-frame decode. Reduced-motion visitors get the first frame.
 */
(function () {
  var section = document.getElementById("story");
  var video = document.querySelector(".story-video");
  if (!section || !video) return;

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var EASE = 0.14;      // how fast the playhead catches up with scroll (0–1)
  var duration = 0;
  var current = 0;      // playhead position in seconds, eased
  var running = false;

  function progress() {
    var rect = section.getBoundingClientRect();
    var total = section.offsetHeight - window.innerHeight;
    if (total <= 0) return 0;
    return Math.min(1, Math.max(0, -rect.top / total));
  }

  function tick() {
    running = false;
    if (!duration) return;
    var target = progress() * duration;
    current += (target - current) * EASE;
    if (Math.abs(target - current) < 0.005) current = target;

    // Only seek when the decoder is idle; 'seeked' picks up the latest target
    if (!video.seeking && Math.abs(video.currentTime - current) > 0.01) {
      video.currentTime = current;
    }
    if (current !== target) requestLoop();
  }

  function requestLoop() {
    if (!running) {
      running = true;
      requestAnimationFrame(tick);
    }
  }

  function init() {
    duration = video.duration || 0;
    video.pause();
    if (reduce) {
      video.currentTime = 0;
      return;
    }
    current = progress() * duration;
    requestLoop();
  }

  video.pause();
  if (video.readyState >= 1) init();
  else video.addEventListener("loadedmetadata", init, { once: true });

  video.addEventListener("seeked", function () {
    if (!reduce) requestLoop();
  });
  window.addEventListener("scroll", requestLoop, { passive: true });
  window.addEventListener("resize", requestLoop);
})();
