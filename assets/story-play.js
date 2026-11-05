/*
 * story-play.js — plays the story video once at half speed, when it scrolls
 * into view. Reduced-motion visitors keep the poster frame instead.
 */
(function () {
  var video = document.querySelector(".story-video");
  if (!video) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    video.removeAttribute("autoplay");
    return;
  }

  video.playbackRate = 0.5;

  if (!("IntersectionObserver" in window)) {
    video.play().catch(function () {});
    return;
  }
  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        video.play().catch(function () {});
      } else {
        video.pause();
      }
    });
  }, { threshold: 0.4 });
  observer.observe(video);
})();
