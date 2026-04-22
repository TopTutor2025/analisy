(function () {
  const CONSENT_KEY = 'analisy_cookie_consent';
  if (localStorage.getItem(CONSENT_KEY)) return;

  const style = document.createElement('style');
  style.textContent = `
    #cookie-banner {
      position: fixed;
      bottom: 0; left: 0; right: 0;
      z-index: 9999;
      background: rgba(6, 14, 26, 0.97);
      border-top: 1px solid rgba(79, 158, 255, 0.15);
      backdrop-filter: blur(20px);
      padding: 20px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 24px;
      flex-wrap: wrap;
      font-family: 'Inter', 'DM Sans', system-ui, sans-serif;
      animation: cookie-slide-up 0.35s ease;
    }
    @keyframes cookie-slide-up {
      from { transform: translateY(100%); opacity: 0; }
      to   { transform: translateY(0);    opacity: 1; }
    }
    #cookie-banner .cookie-text {
      flex: 1;
      min-width: 240px;
    }
    #cookie-banner .cookie-text strong {
      display: block;
      font-size: 0.9rem;
      font-weight: 700;
      color: #f0f4ff;
      margin-bottom: 4px;
    }
    #cookie-banner .cookie-text p {
      font-size: 0.8rem;
      color: rgba(160, 180, 210, 0.85);
      line-height: 1.55;
      margin: 0;
    }
    #cookie-banner .cookie-text a {
      color: #4f9eff;
      text-decoration: underline;
    }
    #cookie-banner .cookie-actions {
      display: flex;
      gap: 10px;
      flex-shrink: 0;
      flex-wrap: wrap;
    }
    #cookie-banner .cookie-btn {
      padding: 9px 20px;
      border-radius: 8px;
      font-size: 0.82rem;
      font-weight: 700;
      cursor: pointer;
      border: none;
      transition: opacity 0.15s;
      white-space: nowrap;
    }
    #cookie-banner .cookie-btn:hover { opacity: 0.85; }
    #cookie-banner .cookie-btn-accept {
      background: #4f9eff;
      color: #060e1a;
    }
    #cookie-banner .cookie-btn-reject {
      background: transparent;
      color: rgba(160, 180, 210, 0.8);
      border: 1px solid rgba(79, 158, 255, 0.25);
    }
  `;
  document.head.appendChild(style);

  const banner = document.createElement('div');
  banner.id = 'cookie-banner';
  banner.innerHTML = `
    <div class="cookie-text">
      <strong>🍪 Questo sito usa i cookie</strong>
      <p>Utilizziamo cookie tecnici e analitici per migliorare la tua esperienza. Puoi accettare tutti i cookie o continuare solo con quelli necessari. <a href="#">Cookie Policy</a></p>
    </div>
    <div class="cookie-actions">
      <button class="cookie-btn cookie-btn-reject" id="cookie-reject">Solo necessari</button>
      <button class="cookie-btn cookie-btn-accept" id="cookie-accept">Accetta tutto</button>
    </div>
  `;
  document.body.appendChild(banner);

  function dismiss(choice) {
    localStorage.setItem(CONSENT_KEY, choice);
    banner.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
    banner.style.transform = 'translateY(100%)';
    banner.style.opacity = '0';
    setTimeout(() => banner.remove(), 320);
  }

  document.getElementById('cookie-accept').addEventListener('click', () => dismiss('accepted'));
  document.getElementById('cookie-reject').addEventListener('click', () => dismiss('necessary'));
})();
