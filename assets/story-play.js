/*
 * story-play.js — plays each story video once when it scrolls into view.
 * data-rate sets the playback speed (default 0.5, i.e. half speed).
 * Reduced-motion visitors keep the poster frame instead.
 */
(function () {
  var videos = document.querySelectorAll(".story-video");
  if (!videos.length) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    videos.forEach(function (v) { v.removeAttribute("autoplay"); });
    return;
  }

  videos.forEach(function (v) {
    v.playbackRate = parseFloat(v.getAttribute("data-rate") || "0.5");
  });

  if (!("IntersectionObserver" in window)) {
    videos.forEach(function (v) { v.play().catch(function () {}); });
    return;
  }
  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.play().catch(function () {});
      } else {
        entry.target.pause();
      }
    });
  }, { threshold: 0.4 });
  videos.forEach(function (v) { observer.observe(v); });
})();
