/**
 * Ratchet Privacy Shield — Fail-Closed Visual Notice
 *
 * Displays a visible warning notification when an outgoing message is blocked.
 */

export function showPrivacyNotice(message: string, durationMs: number = 6000): void {
  try {
    const existing = document.getElementById('ratchet-privacy-notice');
    if (existing) existing.remove();

    const notice = document.createElement('div');
    notice.id = 'ratchet-privacy-notice';
    notice.setAttribute('role', 'alert');
    Object.assign(notice.style, {
      position: 'fixed',
      top: '20px',
      left: '50%',
      transform: 'translateX(-50%)',
      backgroundColor: '#b91c1c',
      color: '#ffffff',
      padding: '12px 20px',
      borderRadius: '8px',
      fontSize: '14px',
      fontWeight: '600',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.4)',
      zIndex: '2147483647',
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      pointerEvents: 'auto',
      transition: 'opacity 0.3s ease',
    });

    const shieldSpan = document.createElement('span');
    shieldSpan.textContent = '🛡️';
    shieldSpan.style.fontSize = '18px';

    const textSpan = document.createElement('span');
    textSpan.textContent = message;

    notice.appendChild(shieldSpan);
    notice.appendChild(textSpan);

    const target = document.body || document.documentElement;
    if (target) {
      target.appendChild(notice);
      setTimeout(() => {
        notice.style.opacity = '0';
        setTimeout(() => notice.remove(), 300);
      }, durationMs);
    }
  } catch {
    // Failsafe
  }
}
