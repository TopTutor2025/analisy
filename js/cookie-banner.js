(function () {
  const CONSENT_KEY = 'analisy_cookie_consent';
  if (localStorage.getItem(CONSENT_KEY)) return;

  const style = document.createElement('style');
  style.textContent = `
    #cookie-banner {
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%) translateY(0);
      z-index: 9999;
      width: calc(100% - 48px);
      max-width: 780px;
      background: #0a0a0e;
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 14px;
      backdrop-filter: blur(24px);
      -webkit-backdrop-filter: blur(24px);
      padding: 18px 22px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 20px;
      flex-wrap: wrap;
      font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', system-ui, sans-serif;
      box-shadow: 0 8px 40px rgba(0,0,0,0.6), 0 0 0 0.5px rgba(255,255,255,0.04);
      animation: cookie-up 0.38s cubic-bezier(0.34,1.56,0.64,1) both;
    }
    @keyframes cookie-up {
      from { transform: translateX(-50%) translateY(30px); opacity: 0; }
      to   { transform: translateX(-50%) translateY(0);   opacity: 1; }
    }
    #cookie-banner .cookie-icon {
      width: 32px;
      height: 32px;
      border-radius: 8px;
      background: rgba(232,52,78,0.12);
      border: 1px solid rgba(232,52,78,0.2);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    #cookie-banner .cookie-icon svg {
      width: 15px;
      height: 15px;
      stroke: #e8344e;
    }
    #cookie-banner .cookie-text {
      flex: 1;
      min-width: 200px;
    }
    #cookie-banner .cookie-text strong {
      display: block;
      font-size: 0.85rem;
      font-weight: 600;
      color: rgba(235,235,245,0.92);
      margin-bottom: 3px;
      letter-spacing: -0.01em;
    }
    #cookie-banner .cookie-text p {
      font-size: 0.76rem;
      color: rgba(235,235,245,0.42);
      line-height: 1.5;
      margin: 0;
    }
    #cookie-banner .cookie-text a {
      color: rgba(235,235,245,0.65);
      text-decoration: underline;
      text-underline-offset: 2px;
    }
    #cookie-banner .cookie-text a:hover {
      color: rgba(235,235,245,0.9);
    }
    #cookie-banner .cookie-actions {
      display: flex;
      gap: 8px;
      flex-shrink: 0;
      flex-wrap: wrap;
    }
    #cookie-banner .cookie-btn {
      padding: 8px 18px;
      border-radius: 8px;
      font-size: 0.78rem;
      font-weight: 600;
      cursor: pointer;
      border: none;
      transition: opacity 0.15s, background 0.15s;
      white-space: nowrap;
      letter-spacing: -0.01em;
    }
    #cookie-banner .cookie-btn-accept {
      background: #e8344e;
      color: #fff;
    }
    #cookie-banner .cookie-btn-accept:hover {
      background: #ff3d55;
    }
    #cookie-banner .cookie-btn-reject {
      background: transparent;
      color: rgba(235,235,245,0.5);
      border: 1px solid rgba(255,255,255,0.1);
    }
    #cookie-banner .cookie-btn-reject:hover {
      border-color: rgba(255,255,255,0.22);
      color: rgba(235,235,245,0.75);
    }
    @media (max-width: 520px) {
      #cookie-banner {
        bottom: 12px;
        width: calc(100% - 24px);
        padding: 14px 16px;
        gap: 14px;
      }
      #cookie-banner .cookie-actions {
        width: 100%;
        justify-content: flex-end;
      }
    }
  `;
  document.head.appendChild(style);

  const banner = document.createElement('div');
  banner.id = 'cookie-banner';
  banner.innerHTML = `
    <div class="cookie-icon">
      <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 2a10 10 0 1 0 10 10 4 4 0 0 1-5-5 4 4 0 0 1-5-5"/>
        <path d="M8.5 8.5v.01M16 15.5v.01M12 12v.01"/>
      </svg>
    </div>
    <div class="cookie-text">
      <strong>Utilizziamo i cookie</strong>
      <p>Cookie tecnici e analitici per migliorare l'esperienza. <a href="cookie-policy.html">Cookie Policy</a></p>
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
    banner.style.transform = 'translateX(-50%) translateY(calc(100% + 32px))';
    banner.style.opacity = '0';
    setTimeout(() => banner.remove(), 320);
  }

  document.getElementById('cookie-accept').addEventListener('click', () => dismiss('accepted'));
  document.getElementById('cookie-reject').addEventListener('click', () => dismiss('necessary'));
})();
