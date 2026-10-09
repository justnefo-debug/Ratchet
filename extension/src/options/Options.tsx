import React, { useState, useEffect } from 'react';
import './options.css';
import { DEFAULT_SETTINGS, STORAGE_KEY_SETTINGS } from '../shared/constants';
import { validateRegexSafetyAsync } from '../detectors/redos-validator';
import type { RatchetSettings, CustomRule, Sensitivity } from '../shared/types';

const ENTITY_TYPE_LABELS: Record<string, string> = {
  EMAIL: 'Email Addresses',
  PHONE: 'Phone Numbers',
  API_KEY: 'API Keys & Secrets',
  CREDIT_CARD: 'Credit Card Numbers',
  SSN: 'Social Security Numbers (SSN)',
  CNIC: 'CNIC Numbers',
  IPV4: 'IPv4 Addresses',
  IPV6: 'IPv6 Addresses',
  MAC_ADDRESS: 'MAC Addresses',
  URL_WITH_CREDS: 'URLs with Embedded Passwords',
  DATE_OF_BIRTH: 'Dates of Birth',
  PERSON: 'People & Names (PERSON)',
  ORG: 'Organizations & Companies (ORG)',
  LOCATION: 'Locations & Cities (LOCATION)',
};

const Options: React.FC = () => {
  const [settings, setSettings] = useState<RatchetSettings>(DEFAULT_SETTINGS);
  const [saveStatus, setSaveStatus] = useState<string>('');
  const [clearStatus, setClearStatus] = useState<string>('');

  // New rule form state
  const [newRuleName, setNewRuleName] = useState('');
  const [newRuleCategory, setNewRuleCategory] = useState('');
  const [newRuleType, setNewRuleType] = useState<'regex' | 'keyword'>('regex');
  const [newRulePattern, setNewRulePattern] = useState('');
  const [ruleValidationError, setRuleValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (chrome?.storage?.local) {
      chrome.storage.local.get([STORAGE_KEY_SETTINGS], (result) => {
        const stored = result[STORAGE_KEY_SETTINGS] as Partial<RatchetSettings> | undefined;
        if (stored) {
          setSettings({ ...DEFAULT_SETTINGS, ...stored });
        }
      });
    }
  }, []);

  // Validate regex patterns in real time using Worker with hard timeout
  useEffect(() => {
    if (!newRulePattern.trim()) {
      setRuleValidationError(null);
      return;
    }

    if (newRuleType === 'regex') {
      let isMounted = true;
      validateRegexSafetyAsync(newRulePattern.trim(), 300).then((validation) => {
        if (!isMounted) return;
        if (!validation.valid) {
          setRuleValidationError(validation.error || 'Invalid regex pattern');
        } else {
          setRuleValidationError(null);
        }
      });
      return () => {
        isMounted = false;
      };
    } else {
      setRuleValidationError(null);
    }
  }, [newRulePattern, newRuleType]);

  const handleSave = () => {
    if (chrome?.storage?.local) {
      chrome.storage.local.set({ [STORAGE_KEY_SETTINGS]: settings }, () => {
        setSaveStatus('Settings saved successfully!');
        setTimeout(() => setSaveStatus(''), 3000);
      });
    }
  };

  const handleEntityToggle = (entityType: string, enabled: boolean) => {
    const updatedToggles = { ...settings.entityToggles, [entityType]: enabled };
    setSettings({ ...settings, entityToggles: updatedToggles });
  };

  const handleAddRule = async () => {
    if (!newRuleName.trim() || !newRuleCategory.trim() || !newRulePattern.trim()) {
      return;
    }

    if (newRuleType === 'regex') {
      const validation = await validateRegexSafetyAsync(newRulePattern.trim(), 300);
      if (!validation.valid) {
        setRuleValidationError(validation.error || 'Pattern failed ReDoS validation');
        return;
      }
    }

    const newRule: CustomRule = {
      id: `rule_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name: newRuleName.trim(),
      category: newRuleCategory.trim().toUpperCase(),
      type: newRuleType,
      pattern: newRulePattern.trim(),
      values: newRuleType === 'keyword' ? newRulePattern.split(',').map((s) => s.trim()) : undefined,
      enabled: true,
      confidence: 0.95,
    };

    setSettings({
      ...settings,
      customRules: [...(settings.customRules || []), newRule],
    });

    // Reset form
    setNewRuleName('');
    setNewRuleCategory('');
    setNewRulePattern('');
    setRuleValidationError(null);
  };

  const handleDeleteRule = (id: string) => {
    setSettings({
      ...settings,
      customRules: settings.customRules.filter((r) => r.id !== id),
    });
  };

  const handleToggleRule = (id: string, enabled: boolean) => {
    setSettings({
      ...settings,
      customRules: settings.customRules.map((r) => (r.id === id ? { ...r, enabled } : r)),
    });
  };

  const handleClearAllMappings = () => {
    if (chrome?.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ action: 'clearAllMappings' }, (res) => {
        if (res?.success) {
          setClearStatus('All conversation mappings cleared.');
        } else {
          setClearStatus('Mappings cleared.');
        }
        setTimeout(() => setClearStatus(''), 4000);
      });
    } else {
      setClearStatus('Cleared.');
      setTimeout(() => setClearStatus(''), 3000);
    }
  };

  return (
    <div className="options-container">
      <header className="options-header">
        <div className="logo-container">
          <span className="shield-icon">🛡️</span>
          <h1>Ratchet Privacy Shield</h1>
        </div>
        <p className="tagline">Configure detection sensitivity, custom rules, entity filters, and storage.</p>
      </header>

      <main className="options-content">
        {/* General Settings */}
        <section className="settings-section">
          <h2>General Protection Settings</h2>

          <div className="setting-group">
            <label htmlFor="sensitivity-select">Detection Sensitivity</label>
            <select
              id="sensitivity-select"
              value={settings.sensitivity}
              onChange={(e) => setSettings({ ...settings, sensitivity: e.target.value as Sensitivity })}
              className="select-input"
            >
              <option value="low">Low (Strict PII, highest confidence threshold)</option>
              <option value="medium">Medium (Standard balanced protection)</option>
              <option value="high">High (Broad detection, catches edge cases)</option>
            </select>
            <p className="help-text">Controls the confidence threshold required before an entity is redacted.</p>
          </div>
        </section>

        {/* Review Before Sending */}
        <section className="settings-section">
          <h2>Review Before Sending</h2>
          <p className="help-text">
            Display a floating confirmation panel before outgoing prompts leave your browser, allowing you to inspect and selectively un-redact detected items.
          </p>
          <div className="setting-group" style={{ marginTop: '10px' }}>
            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: '8px' }}>
              <input
                id="global-review-toggle"
                type="checkbox"
                checked={settings.reviewBeforeSend !== false}
                onChange={(e) => setSettings({ ...settings, reviewBeforeSend: e.target.checked })}
              />
              Enable Review-Before-Send (Default: On)
            </label>
          </div>
          <div className="entity-grid" style={{ marginTop: '12px' }}>
            <div className="entity-card">
              <span className="entity-label">ChatGPT</span>
              <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                <input
                  id="review-site-chatgpt"
                  type="checkbox"
                  checked={settings.reviewSites?.chatgpt !== false}
                  onChange={(e) => {
                    const prev = settings.reviewSites || { chatgpt: true, claude: true, gemini: true };
                    setSettings({ ...settings, reviewSites: { ...prev, chatgpt: e.target.checked } });
                  }}
                />
              </label>
            </div>
            <div className="entity-card">
              <span className="entity-label">Claude</span>
              <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                <input
                  id="review-site-claude"
                  type="checkbox"
                  checked={settings.reviewSites?.claude !== false}
                  onChange={(e) => {
                    const prev = settings.reviewSites || { chatgpt: true, claude: true, gemini: true };
                    setSettings({ ...settings, reviewSites: { ...prev, claude: e.target.checked } });
                  }}
                />
              </label>
            </div>
            <div className="entity-card" style={{ opacity: 0.6 }}>
              <span className="entity-label">Gemini (Not Supported)</span>
              <span style={{ fontSize: '12px', color: '#94a3b8' }}>Coming soon</span>
            </div>
          </div>
          <div className="setting-group" style={{ marginTop: '14px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span className="setting-title" style={{ fontSize: '13px', color: '#cbd5e1' }}>Review Timeout (seconds):</span>
              <input
                id="review-timeout-input"
                type="number"
                min="5"
                max="300"
                value={settings.reviewTimeoutSeconds ?? 60}
                onChange={(e) => setSettings({ ...settings, reviewTimeoutSeconds: parseInt(e.target.value, 10) || 60 })}
                style={{ width: '80px', padding: '4px 8px', borderRadius: '4px', background: '#1e293b', border: '1px solid #475569', color: '#fff' }}
              />
            </label>
            <p className="help-text" style={{ marginTop: '4px' }}>Outgoing requests fail closed if not confirmed before the timeout expires.</p>
          </div>
        </section>

        {/* Per-Entity Type Toggles */}
        <section className="settings-section">
          <h2>Protected Entity Types</h2>
          <p className="help-text">Toggle which types of sensitive information are intercepted and redacted.</p>
          <p className="help-text" style={{ color: '#fbbf24', marginTop: '4px' }}>
            ℹ️ Note: Name, organization, and location detection is best-effort and will miss some entities.
          </p>

          <div className="entity-grid">
            {Object.entries(ENTITY_TYPE_LABELS).map(([typeKey, label]) => {
              const isChecked = settings.entityToggles[typeKey] !== false;
              return (
                <div key={typeKey} className="entity-card">
                  <span className="entity-label">{label}</span>
                  <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                    <input
                      id={`entity-toggle-${typeKey}`}
                      type="checkbox"
                      checked={isChecked}
                      onChange={(e) => handleEntityToggle(typeKey, e.target.checked)}
                    />
                  </label>
                </div>
              );
            })}
          </div>
        </section>

        {/* Custom Rules Editor */}
        <section className="settings-section">
          <h2>Custom Detection Rules</h2>
          <p className="help-text">
            Add custom regex or keyword rules. All regular expressions are validated for ReDoS safety before saving.
          </p>

          {/* New Rule Form */}
          <div className="rule-form">
            <h3 style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#e2e8f0' }}>Add New Custom Rule</h3>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="new-rule-name">Rule Name</label>
                <input
                  id="new-rule-name"
                  type="text"
                  maxLength={50}
                  placeholder="e.g., Internal Project Alpha"
                  value={newRuleName}
                  onChange={(e) => setNewRuleName(e.target.value)}
                  className="text-input"
                />
              </div>
              <div className="form-group">
                <label htmlFor="new-rule-category">Placeholder Category</label>
                <input
                  id="new-rule-category"
                  type="text"
                  maxLength={30}
                  placeholder="e.g., PROJECT_ALPHA"
                  value={newRuleCategory}
                  onChange={(e) => setNewRuleCategory(e.target.value)}
                  className="text-input"
                />
              </div>
              <div className="form-group" style={{ maxWidth: '140px' }}>
                <label htmlFor="new-rule-type">Type</label>
                <select
                  id="new-rule-type"
                  value={newRuleType}
                  onChange={(e) => setNewRuleType(e.target.value as 'regex' | 'keyword')}
                  className="select-input"
                >
                  <option value="regex">Regex</option>
                  <option value="keyword">Keyword</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="new-rule-pattern">
                {newRuleType === 'regex' ? 'Regular Expression (max 200 characters, ReDoS-safe subset)' : 'Keywords (comma-separated)'}
              </label>
              <input
                id="new-rule-pattern"
                type="text"
                maxLength={200}
                placeholder={newRuleType === 'regex' ? 'e.g., PRJ-[A-Z0-9]{4,8}' : 'e.g., SecretProject, CodeName'}
                value={newRulePattern}
                onChange={(e) => setNewRulePattern(e.target.value)}
                className="text-input"
              />
              {newRuleType === 'regex' && (
                <p className="help-text" style={{ fontSize: '11px', color: '#94a3b8', marginTop: '3px' }}>
                  Enforces ReDoS-safe subset: no nested repetition, no overlapping adjacent wildcards, 200-char max length limit.
                </p>
              )}
            </div>

            {/* Validation Feedback */}
            {ruleValidationError ? (
              <div
                id="rule-validation-status"
                style={{
                  color: '#ef4444',
                  fontSize: '12px',
                  background: 'rgba(239, 68, 68, 0.1)',
                  padding: '8px 10px',
                  borderRadius: '4px',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                }}
              >
                ⚠️ {ruleValidationError}
              </div>
            ) : newRulePattern.trim() && newRuleType === 'regex' ? (
              <div
                id="rule-validation-status"
                style={{ color: '#10b981', fontSize: '12px', padding: '2px 4px' }}
              >
                ✓ Safe regex pattern
              </div>
            ) : null}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
              <button
                id="add-rule-btn"
                type="button"
                className="secondary-btn"
                disabled={Boolean(ruleValidationError) || !newRuleName.trim() || !newRulePattern.trim()}
                onClick={handleAddRule}
                style={{
                  opacity: Boolean(ruleValidationError) || !newRuleName.trim() || !newRulePattern.trim() ? 0.5 : 1,
                  cursor: Boolean(ruleValidationError) || !newRuleName.trim() || !newRulePattern.trim() ? 'not-allowed' : 'pointer',
                }}
              >
                + Add Rule
              </button>
            </div>
          </div>

          {/* Rules List */}
          <div className="rules-list">
            {(settings.customRules || []).length === 0 ? (
              <p className="no-rules">No custom rules configured yet.</p>
            ) : (
              (settings.customRules || []).map((rule) => (
                <div key={rule.id} className="rule-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div className="rule-info" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <label style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer', margin: 0 }}>
                        <input
                          id={`toggle-rule-${rule.id}`}
                          type="checkbox"
                          checked={rule.enabled}
                          onChange={(e) => handleToggleRule(rule.id, e.target.checked)}
                          style={{ marginRight: '6px' }}
                        />
                        <strong>{rule.name}</strong>
                      </label>
                      <span className="badge">{rule.category}</span>
                    </div>
                    <div className="rule-type">
                      {rule.type}: {rule.pattern}
                    </div>
                  </div>

                  <button
                    id={`delete-rule-${rule.id}`}
                    type="button"
                    onClick={() => handleDeleteRule(rule.id)}
                    style={{
                      background: 'transparent',
                      border: '1px solid #475569',
                      color: '#ef4444',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      fontSize: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    Delete
                  </button>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Persistent Storage & Privacy Settings */}
        <section className="settings-section">
          <h2>Persistent Storage (Optional)</h2>
          <div className="setting-group">
            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: '8px' }}>
              <input
                id="enable-persistence"
                type="checkbox"
                checked={settings.enablePersistence}
                onChange={(e) => setSettings({ ...settings, enablePersistence: e.target.checked })}
              />
              Enable Encrypted Persistent Mappings (Off by default)
            </label>
            <p className="help-text">
              By default, all mappings live only in volatile session memory. Enabling persistent storage saves mappings across browser restarts using AES-GCM WebCrypto encryption.
            </p>
          </div>

          {settings.enablePersistence && (
            <div className="setting-group" style={{ marginTop: '12px' }}>
              <label htmlFor="persistence-expiry-hours">Storage Expiry (Hours)</label>
              <input
                id="persistence-expiry-hours"
                type="number"
                min="1"
                max="720"
                value={settings.persistenceExpiryHours}
                onChange={(e) =>
                  setSettings({ ...settings, persistenceExpiryHours: Math.max(1, parseInt(e.target.value, 10) || 24) })
                }
                className="text-input"
                style={{ width: '120px' }}
              />
              <p className="help-text">Expired encrypted records are automatically purged.</p>
            </div>
          )}

          <div className="threat-model-box">
            <strong>Threat Model Notice:</strong> A non-extractable WebCrypto key prevents JavaScript from exporting the raw key material and protects mappings from casual inspection or plain-text storage dumps. However, because the key (IndexedDB) and encrypted data (chrome.storage.local) reside in the same browser profile directory, this <strong>does not protect against anyone with access to your browser profile folder or local disk</strong>, nor against in-memory malware while Chrome is running.
          </div>
        </section>

        {/* Clear Mappings & Privacy Notice */}
        <section className="settings-section" style={{ borderColor: '#7f1d1d' }}>
          <h2 style={{ color: '#f87171' }}>Danger Zone: Storage Reset</h2>
          <p className="help-text" style={{ marginBottom: '16px' }}>
            Instantly wipe all conversation mapping tables from both session storage and persistent encrypted storage.
          </p>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <button
              id="clear-all-mappings-btn"
              type="button"
              className="danger-btn"
              onClick={handleClearAllMappings}
            >
              Clear All Conversation Mappings
            </button>
            {clearStatus && (
              <span id="clear-status-msg" style={{ color: '#10b981', fontSize: '13px', fontWeight: '500' }}>
                ✓ {clearStatus}
              </span>
            )}
          </div>
        </section>

        {/* Save Actions */}
        <div className="actions">
          <button id="save-settings-btn" onClick={handleSave} className="primary-btn">
            Save Settings
          </button>
          {saveStatus && (
            <span id="save-status-msg" style={{ color: '#10b981', fontSize: '14px', alignSelf: 'center' }}>
              {saveStatus}
            </span>
          )}
        </div>
      </main>
    </div>
  );
};

export default Options;
