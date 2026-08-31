(function () {
  var intro = document.getElementById("intro");
  if (!intro) return;

  if (sessionStorage.getItem("luxIntroSeen")) {
    intro.remove();
    return;
  }

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    sessionStorage.setItem("luxIntroSeen", "1");
    intro.remove();
    return;
  }

  var skip = document.getElementById("intro-skip");
  var timers = [];

  function exitIntro() {
    if (intro.classList.contains("intro-exit")) return;
    timers.forEach(clearTimeout);
    sessionStorage.setItem("luxIntroSeen", "1");
    intro.classList.add("intro-exit");
    document.body.classList.remove("intro-active");
    intro.addEventListener(
      "transitionend",
      function () {
        intro.remove();
      },
      { once: true }
    );
  }

  document.body.classList.add("intro-active");
  skip.addEventListener("click", exitIntro);

  requestAnimationFrame(function () {
    intro.classList.add("intro-visible");
  });
  timers.push(setTimeout(function () { intro.classList.add("intro-step-2"); }, 900));
  timers.push(setTimeout(exitIntro, 3000));
})();
