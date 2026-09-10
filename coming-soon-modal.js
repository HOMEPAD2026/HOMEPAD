// "Mainnet coming soon" announcement — shows once per browser session, on
// whichever page someone lands on first. Same injected-modal pattern as
// launch-modal.js (one script, works on every page without editing each
// page's own HTML). Removing this file (and its one <script> include) is
// the whole cleanup needed once mainnet actually ships.
(function () {
  var SEEN_KEY = "hp_seen_mainnet_soon_v1";
  if (document.getElementById("soon-modal-overlay")) return; // already present
  try {
    if (sessionStorage.getItem(SEEN_KEY)) return; // already shown this session
  } catch (e) { /* storage blocked (private mode etc.) — just show it every time */ }

  var wrapper = document.createElement("div");
  wrapper.innerHTML = `
    <div id="soon-modal-overlay" class="modal-overlay hidden" onclick="if (event.target === this) closeSoonModal();">
      <div class="modal-blob soon-blob">
        <button class="modal-close" onclick="closeSoonModal()" aria-label="Close">✕</button>
        <div class="modal-inner soon-inner">
          <img class="soon-sticker" src="images/gallery-throne.jpg" alt="">
          <span class="pixel eyebrow-chip alt">mainnet — coming soon</span>
          <h2 class="pixel soon-title">the house is almost ready.</h2>
          <p class="soon-body">Everything you've been testing — Hybrid, Bonding Curve, Instant Liquidity, Stock Pair, Proof of Rent — is moving to Robinhood Chain mainnet. Real \$HOME, real rent, real receipts.</p>
          <p class="soon-body soon-body-sub">Every number on <a href="rent.html">Proof of Rent</a> is already real today. Mainnet just makes it real money.</p>
          <div class="soon-cta-row">
            <a class="btn btn-cute" href="https://x.com/HOMEonRobinhood" target="_blank"><img class="btn-icon" src="images/gallery-cubist.jpg" alt="">Follow the countdown</a>
            <a class="btn btn-cute" href="https://t.me/HOMEonRobin" target="_blank"><img class="btn-icon" src="images/gallery-floral-mug.jpg" alt="">Join the Telegram</a>
          </div>
          <button class="soon-dismiss" onclick="closeSoonModal()">Keep exploring on testnet →</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(wrapper.firstElementChild);

  function showSoonModal() {
    document.getElementById("soon-modal-overlay").classList.remove("hidden");
    document.body.style.overflow = "hidden";
  }
  window.closeSoonModal = function () {
    var overlay = document.getElementById("soon-modal-overlay");
    if (!overlay) return;
    overlay.classList.add("hidden");
    document.body.style.overflow = "";
    try { sessionStorage.setItem(SEEN_KEY, "1"); } catch (e) { /* ignore */ }
  };
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") window.closeSoonModal();
  });

  // A beat after paint, not instantly on load — feels like a considered
  // announcement, not a popup ad blocking the page before it's rendered.
  setTimeout(showSoonModal, 500);
})();
