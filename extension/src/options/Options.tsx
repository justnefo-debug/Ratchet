import { useState, useEffect } from 'react';
import './options.css';

const Options = () => {
  const [sensitivity, setSensitivity] = useState('medium');
  const [rules, setRules] = useState([]);
  const [apiEndpoint, setApiEndpoint] = useState('http://127.0.0.1:5000');

  useEffect(() => {
    chrome.storage.local.get(['sensitivity', 'apiEndpoint'], (result) => {
      if (result.sensitivity) setSensitivity(result.sensitivity);
      if (result.apiEndpoint) setApiEndpoint(result.apiEndpoint);
    });

    // Fetch custom rules from backend
    fetch(`${apiEndpoint}/api/rules`)
      .then(res => res.json())
      .then(data => {
        if (data.rules) setRules(data.rules);
      })
      .catch(err => console.error("Could not fetch rules:", err));
  }, [apiEndpoint]);

  const handleSave = () => {
    chrome.storage.local.set({ sensitivity, apiEndpoint }, () => {
      alert('Settings saved!');
    });
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
            <label htmlFor="apiEndpoint">Backend API URL</label>
            <input 
              id="apiEndpoint"
              type="text" 
              value={apiEndpoint} 
              onChange={(e) => setApiEndpoint(e.target.value)}
              className="text-input"
            />
            <p className="help-text">Ensure your local python backend is running here.</p>
          </div>

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
        </section>

        <section className="settings-section">
          <h2>Custom Rules</h2>
          <p className="help-text">Custom rules are synced from your backend engine.</p>
          <div className="rules-list">
            {rules.length === 0 ? (
              <p className="no-rules">No custom rules configured. Configure them in the Web UI.</p>
            ) : (
              rules.map((rule: any, i) => (
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
        </div>
      </main>
    </div>
  );
};

export default Options;
