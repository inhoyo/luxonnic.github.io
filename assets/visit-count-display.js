(function () {
  var el = document.getElementById("visit-mark");
  if (!el) return;
  fetch("https://abacus.jasoncameron.dev/get/luxonnic-hhi-site/visits")
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (d && typeof d.value === "number") el.textContent = d.value;
    })
    .catch(function () {});
})();
