import { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';

const Popup = () => {
  const [isEnabled, setIsEnabled] = useState(true);
  const [stats, setStats] = useState({ detected: 0, redacted: 0 });
  const [restoreText, setRestoreText] = useState('');

  useEffect(() => {
    // Load state from extension storage in later stage
    if (chrome?.storage?.local) {
      chrome.storage.local.get(['ratchet_enabled', 'ratchet_stats'], (result) => {
        if (result.ratchet_enabled !== undefined) {
          setIsEnabled(result.ratchet_enabled);
        }
        if (result.ratchet_stats) {
          setStats(result.ratchet_stats);
        }
      });
    }
  }, []);

  const handleToggle = (checked: boolean) => {
    setIsEnabled(checked);
    if (chrome?.storage?.local) {
      chrome.storage.local.set({ ratchet_enabled: checked });
    }
  };

  return (
    <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0, fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '24px' }}>🛡️</span> Ratchet
        </h2>
        <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
          <input 
            type="checkbox" 
            checked={isEnabled} 
            onChange={(e) => handleToggle(e.target.checked)}
            style={{ marginRight: '8px' }}
          />
          Active
        </label>
      </div>
      
      <div style={{ background: '#16213e', padding: '16px', borderRadius: '8px', border: '1px solid #2a2a4a' }}>
        <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#94a3b8' }}>Session Status</h3>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
          <span>Items Detected</span>
          <span style={{ fontWeight: 'bold' }}>{stats.detected}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Items Redacted</span>
          <span style={{ fontWeight: 'bold', color: '#e53e3e' }}>{stats.redacted}</span>
        </div>
      </div>
      
      {/* Quick Restore Area */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <h3 style={{ margin: '0', fontSize: '14px', color: '#94a3b8' }}>Quick Restore</h3>
        <textarea 
          placeholder="Paste AI response containing placeholders..."
          value={restoreText}
          style={{ width: '100%', height: '80px', padding: '8px', borderRadius: '4px', background: '#0f172a', color: 'white', border: '1px solid #2a2a4a', boxSizing: 'border-box' }}
          onChange={(e) => setRestoreText(e.target.value)}
        />
      </div>

      <div style={{ marginTop: 'auto' }}>
        <button 
          style={{ 
            width: '100%', 
            padding: '10px', 
            background: '#e53e3e', 
            color: 'white', 
            border: 'none', 
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: 'bold'
          }}
          onClick={() => {
            if (chrome?.runtime?.openOptionsPage) {
              chrome.runtime.openOptionsPage();
            } else {
              window.open('options.html', '_blank');
            }
          }}
        >
          Open Settings
        </button>
      </div>
    </div>
  );
};

const rootElement = document.getElementById('root');
if (rootElement) {
  const root = createRoot(rootElement);
  root.render(<Popup />);
}
