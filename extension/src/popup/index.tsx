import { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';

const Popup = () => {
  const [isEnabled, setIsEnabled] = useState(true);
  const [stats, setStats] = useState({ detected: 0, redacted: 0 });

  useEffect(() => {
    // In a real app, fetch from local storage or background worker
    setStats({ detected: 14, redacted: 12 });
  }, []);

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
            onChange={(e) => setIsEnabled(e.target.checked)}
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
          onClick={() => window.open('http://localhost:5173', '_blank')}
        >
          Open Dashboard
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
