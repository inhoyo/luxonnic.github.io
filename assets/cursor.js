(function () {
  // only on devices with an actual pointer, and only if motion is welcome
  if (!window.matchMedia) return;
  if (!window.matchMedia("(pointer: fine)").matches) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  document.documentElement.classList.add("custom-cursor-active");

  var cursor = document.createElement("div");
  cursor.id = "custom-cursor";
  document.body.appendChild(cursor);

  var mouseX = 0,
    mouseY = 0;

  window.addEventListener("mousemove", function (e) {
    mouseX = e.clientX;
    mouseY = e.clientY;
    cursor.classList.add("is-visible");
  });

  document.addEventListener("mouseleave", function () {
    cursor.classList.remove("is-visible");
  });

  var HOVER_SELECTOR = "a, button, .nav-link, .wordmark";

  function bindHover() {
    document.querySelectorAll(HOVER_SELECTOR).forEach(function (el) {
      el.addEventListener("mouseenter", function () {
        cursor.classList.add("is-hover");
      });
      el.addEventListener("mouseleave", function () {
        cursor.classList.remove("is-hover");
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindHover);
  } else {
    bindHover();
  }

  (function tick() {
    cursor.style.left = mouseX + "px";
    cursor.style.top = mouseY + "px";
    requestAnimationFrame(tick);
  })();
})();
