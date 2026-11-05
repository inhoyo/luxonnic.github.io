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
  var video = document.getElementById("intro-video");
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

  // The reveal video plays once; the tagline follows its last frame, then the intro lifts away.
  if (video) {
    video.addEventListener("ended", function () {
      intro.classList.add("intro-step-2");
      timers.push(setTimeout(exitIntro, 1600));
    });
    var playing = video.play();
    if (playing && playing.catch) {
      // autoplay blocked or file missing: keep the poster frame briefly, then go on
      playing.catch(function () {
        timers.push(setTimeout(exitIntro, 2500));
      });
    }
  } else {
    timers.push(setTimeout(exitIntro, 2500));
  }
  // safety net in case 'ended' never fires
  timers.push(setTimeout(exitIntro, 9000));
})();
