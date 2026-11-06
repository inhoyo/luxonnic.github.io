/*
 * chapters.js — one pinned stage, four chapters.
 *
 * The section is tall; its inner stage is position: sticky. Scroll progress picks the
 * chapter. Each chapter plays its own part of a video once (no scrubbing, so playback
 * stays smooth) and holds the last frame until the next chapter. Scrolling back jumps
 * to the start of that chapter's part.
 *
 * Reduced-motion visitors get the static layout from the CSS (poster + all captions).
 */
(function () {
  var root = document.getElementById("chapters");
  if (!root) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  var hall = root.querySelector(".ch-video--hall");
  var chip = root.querySelector(".ch-video--chip");
  var copies = Array.prototype.slice.call(root.querySelectorAll(".ch-copy"));
  var dots = Array.prototype.slice.call(root.querySelectorAll(".ch-dot"));

  // video: which element; from/to: seconds of that video (to = null: play to the end)
  var CHAPTERS = [
    { video: hall, from: 0, to: null, rate: 0.6 },
    { video: chip, from: 0.0, to: 7.6, rate: 1 },
    { video: chip, from: 7.8, to: 13.6, rate: 1 },
    { video: chip, from: 13.8, to: null, rate: 1 },
  ];

  var active = -1;
  var inView = false;

  function play(v) {
    var p = v.play();
    if (p && p.catch) p.catch(function () {});
  }

  function show(chapter) {
    hall.classList.toggle("is-on", chapter.video === hall);
    chip.classList.toggle("is-on", chapter.video === chip);
  }

  function setChapter(i) {
    if (i === active) return;
    var prev = active;
    active = i;
    copies.forEach(function (el, k) { el.classList.toggle("is-active", k === i); });
    dots.forEach(function (el, k) { el.classList.toggle("is-active", k === i); });
    var ch = CHAPTERS[i];
    show(ch);
    var v = ch.video;
    v.playbackRate = ch.rate;
    // the hall video keeps its place when we come back to chapter 1 only if it never finished
    if (v === hall && prev !== -1 && hall.ended) v.currentTime = 0;
    if (v === chip) v.currentTime = ch.from;
    if (v === hall) { hall.pause(); chip.pause(); if (hall.ended) hall.currentTime = 0; }
    else { hall.pause(); }
    if (inView) play(v);
  }

  // hold the last frame of a chapter's part
  function tick() {
    var ch = CHAPTERS[active];
    if (ch && ch.video === chip && ch.to !== null && chip.currentTime >= ch.to) chip.pause();
    requestAnimationFrame(tick);
  }

  function onScroll() {
    var r = root.getBoundingClientRect();
    var vh = window.innerHeight;
    var span = root.offsetHeight - vh;
    var wasInView = inView;
    inView = r.top < vh * 0.75 && r.bottom > vh * 0.25;
    var p = Math.min(1, Math.max(0, -r.top / span));
    var i = Math.min(CHAPTERS.length - 1, Math.floor(p * CHAPTERS.length));
    if (r.top > 0) i = 0;
    setChapter(i);
    if (inView && !wasInView) {
      var v = CHAPTERS[active].video;
      var to = CHAPTERS[active].to;
      if (!v.ended && (to === null || v.currentTime < to)) play(v);
    }
    if (!inView && wasInView) { hall.pause(); chip.pause(); }
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  setChapter(0);
  onScroll();
  requestAnimationFrame(tick);
})();
