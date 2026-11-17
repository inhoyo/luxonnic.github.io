/*
 * marquee.js: seamless logo loop for the "Supported by" band.
 *
 * Put each logo once in the .marquee-group list in index.html. This script
 * copies that group until the track is wider than the band plus one group,
 * then sets the scroll distance to exactly one group. Each copy is identical
 * and equally spaced, so the loop closes without a gap, whatever the number
 * of logos or the screen width. Re-measures on resize and when images load.
 *
 * Reduced-motion visitors keep a single static row (no copies, no animation).
 */
(function () {
  var marquee = document.querySelector(".marquee");
  var track = marquee && marquee.querySelector(".marquee-track");
  var base = track && track.querySelector(".marquee-group");
  if (!base) return;

  var reduceMotion =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var SPEED = 60; // px per second

  function clearClones() {
    track.querySelectorAll(".marquee-group[data-clone]").forEach(function (el) {
      el.remove();
    });
  }

  function build() {
    clearClones();
    if (reduceMotion) {
      track.style.removeProperty("--shift");
      track.style.animation = "none";
      return;
    }
    track.style.animation = "";

    var groupW = base.getBoundingClientRect().width;
    if (!groupW) return;

    // enough copies to cover the band, plus one extra so the seam is never visible
    var copies = Math.ceil(marquee.clientWidth / groupW) + 1;
    for (var i = 0; i < copies; i++) {
      var clone = base.cloneNode(true);
      clone.setAttribute("aria-hidden", "true");
      clone.setAttribute("data-clone", "");
      clone.querySelectorAll("img").forEach(function (img) {
        img.alt = "";
      });
      track.appendChild(clone);
    }

    track.style.setProperty("--shift", groupW + "px");
    track.style.animationDuration = groupW / SPEED + "s";
  }

  var timer = null;
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(build, 120);
  }

  base.querySelectorAll("img").forEach(function (img) {
    if (!img.complete) img.addEventListener("load", schedule);
  });
  window.addEventListener("resize", schedule);
  build();
})();
