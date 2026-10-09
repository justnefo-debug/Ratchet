import { useState, useEffect } from 'react';
import './options.css';

interface RuleItem {
  id?: string;
  name: string;
  type: string;
  category: string;
  pattern?: string;
  values?: string[];
  enabled?: boolean;
}

const Options = () => {
  const [sensitivity, setSensitivity] = useState('medium');
  const [rules, setRules] = useState<RuleItem[]>([]);
  const [apiEndpoint, setApiEndpoint] = useState('http://127.0.0.1:5000');
  const [powerMode, setPowerMode] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');

  useEffect(() => {
    if (chrome?.storage?.local) {
      chrome.storage.local.get(['sensitivity', 'apiEndpoint', 'customRules', 'powerMode'], (result) => {
        if (result.sensitivity) setSensitivity(result.sensitivity);
        if (result.apiEndpoint) setApiEndpoint(result.apiEndpoint);
        if (result.customRules) setRules(result.customRules);
        if (result.powerMode !== undefined) setPowerMode(result.powerMode);
      });
    }
  }, []);

  const handleSave = () => {
    if (chrome?.storage?.local) {
      chrome.storage.local.set({ sensitivity, apiEndpoint, powerMode }, () => {
        setSaveStatus('Settings saved successfully!');
        setTimeout(() => setSaveStatus(''), 3000);
      });
    }
  };

  return (
    <div className="options-container">
      <header className="options-header">
        <div className="logo-container">
          <span className="shield-icon">🛡️</span>
          <h1>Ratchet Settings</h1>
        </div>
        <p className="tagline">Configure your local privacy shield.</p>
      </header>

      <main className="options-content">
        <section className="settings-section">
          <h2>General Settings</h2>

          <div className="setting-group">
            <label htmlFor="sensitivity">Global Sensitivity</label>
            <select 
              id="sensitivity" 
              value={sensitivity} 
              onChange={(e) => setSensitivity(e.target.value)}
              className="select-input"
            >
              <option value="low">Low (Fewer false positives)</option>
              <option value="medium">Medium (Balanced)</option>
              <option value="high">High (Catch everything)</option>
            </select>
          </div>

          <div className="setting-group">
            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: '8px' }}>
              <input 
                type="checkbox" 
                checked={powerMode} 
                onChange={(e) => setPowerMode(e.target.checked)}
              />
              Power Mode (Optional Python Backend)
            </label>
            <p className="help-text">Enable to route NER to a local spaCy Python backend for enhanced accuracy.</p>
          </div>

          {powerMode && (
            <div className="setting-group">
              <label htmlFor="apiEndpoint">Backend API URL</label>
              <input 
                id="apiEndpoint"
                type="text" 
                value={apiEndpoint} 
                onChange={(e) => setApiEndpoint(e.target.value)}
                className="text-input"
              />
              <p className="help-text">Local Python backend address.</p>
            </div>
          )}
        </section>

        <section className="settings-section">
          <h2>Custom Rules</h2>
          <p className="help-text">User-defined detection rules stored locally.</p>
          <div className="rules-list">
            {rules.length === 0 ? (
              <p className="no-rules">No custom rules configured yet.</p>
            ) : (
              rules.map((rule, i) => (
                <div key={i} className="rule-item">
                  <div className="rule-info">
                    <strong>{rule.name}</strong>
                    <span className="badge">{rule.category}</span>
                  </div>
                  <div className="rule-type">{rule.type}: {rule.pattern || rule.values?.join(', ')}</div>
                </div>
              ))
            )}
          </div>
        </section>
        
        <div className="actions">
          <button onClick={handleSave} className="primary-btn">Save Settings</button>
          {saveStatus && <span style={{ marginLeft: '12px', color: '#10b981' }}>{saveStatus}</span>}
        </div>
      </main>
    </div>
  );
};

export default Options;
