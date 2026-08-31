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

  var video = document.getElementById("intro-video");
  var skip = document.getElementById("intro-skip");

  function exitIntro() {
    if (intro.classList.contains("intro-exit")) return;
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
  video.addEventListener("ended", exitIntro);
  video.addEventListener("error", exitIntro);
  skip.addEventListener("click", exitIntro);
  video.play().catch(exitIntro);
})();
