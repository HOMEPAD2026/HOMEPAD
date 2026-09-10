// Injects the Launch modal's HTML into the page if it isn't already there.
// This used to live only inline in index.html, which meant every other
// page (Docs, Mechanism, Flywheel...) had no modal to open and "Launch"
// just fell through to a normal page navigation instead. Including this
// script on every page fixes that in one place.
(function () {
  if (document.getElementById("launch-modal-overlay")) return; // already present (shouldn't happen, but don't duplicate)

  const wrapper = document.createElement("div");
  wrapper.innerHTML = `
    <div id="launch-modal-overlay" class="modal-overlay hidden" onclick="if (event.target === this) closeLaunchModal();">
      <div class="modal-blob">
        <button class="modal-close" onclick="closeLaunchModal()" aria-label="Close">✕</button>
        <div class="modal-inner">
          <div id="launch-modal-content"><p>Loading…</p></div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(wrapper.firstElementChild);
})();
