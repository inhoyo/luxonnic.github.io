/*
 * reel.js: LUXONNICore video on the landing page.
 *
 * The video autoplays as a muted loop (see the attributes in index.html).
 * Visitors who prefer reduced motion get the still poster frame instead.
 */
(function () {
  var video = document.querySelector("#reel .reel-video");
  if (!video) return;

  var reduceMotion =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (reduceMotion) {
    video.removeAttribute("autoplay");
    video.removeAttribute("loop");
    video.pause();
    return;
  }

  var p = video.play();
  if (p && p.catch) p.catch(function () {});
})();
