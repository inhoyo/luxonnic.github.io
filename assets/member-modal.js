(function () {
  var modal = document.getElementById("member-modal");
  if (!modal) return;

  var nameEl = modal.querySelector(".modal-name");
  var roleEl = modal.querySelector(".modal-role");
  var bioEl = modal.querySelector(".modal-bio");
  var closeBtn = modal.querySelector(".modal-close");
  var cards = document.querySelectorAll(".member");
  var lastFocused = null;

  function openModal(card) {
    var name = card.querySelector(".member-name");
    var role = card.querySelector(".member-role");
    var detail = card.querySelector(".member-detail");

    nameEl.textContent = name ? name.textContent.trim() : "";
    roleEl.textContent = role ? role.textContent.trim() : "";
    bioEl.textContent = detail ? detail.textContent.replace(/\s+/g, " ").trim() : "";

    lastFocused = document.activeElement;
    modal.hidden = false;
    document.body.classList.add("modal-open");
    closeBtn.focus();
    document.addEventListener("keydown", onKeydown);
  }

  function closeModal() {
    modal.hidden = true;
    document.body.classList.remove("modal-open");
    document.removeEventListener("keydown", onKeydown);
    if (lastFocused && typeof lastFocused.focus === "function") {
      lastFocused.focus();
    }
  }

  function onKeydown(e) {
    if (e.key === "Escape") closeModal();
  }

  cards.forEach(function (card) {
    card.addEventListener("click", function () {
      openModal(card);
    });
    card.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
        e.preventDefault();
        openModal(card);
      }
    });
  });

  closeBtn.addEventListener("click", closeModal);

  modal.addEventListener("click", function (e) {
    if (e.target === modal) closeModal();
  });
})();
