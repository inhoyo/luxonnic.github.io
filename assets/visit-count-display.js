(function () {
  var el = document.getElementById("visit-mark");
  if (!el) return;
  fetch("https://api.countapi.xyz/get/luxonnic-hhi-site/visits")
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (d && typeof d.value === "number") el.textContent = d.value;
    })
    .catch(function () {});
})();
