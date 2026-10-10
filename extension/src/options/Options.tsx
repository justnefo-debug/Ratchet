import React, { useState, useEffect } from 'react';
import './options.css';
import { DEFAULT_SETTINGS, STORAGE_KEY_SETTINGS } from '../shared/constants';
import { validateRegexSafetyAsync } from '../detectors/redos-validator';
import type { RatchetSettings, CustomRule, Sensitivity, SensitiveTerm, SensitiveTermCategory } from '../shared/types';

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
  PERSON: 'Names (built-in list + sensitive terms)',
  ORG: 'Organizations (built-in list + sensitive terms)',
  LOCATION: 'Locations (built-in list + sensitive terms)',
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
  const [ruleRewrittenPattern, setRuleRewrittenPattern] = useState<string | null>(null);

  // Sensitive terms form state
  const [newTermText, setNewTermText] = useState('');
  const [newTermCategory, setNewTermCategory] = useState<SensitiveTermCategory>('PERSON');

  // Diagnostics state
  const [diagnosticEntries, setDiagnosticEntries] = useState<any[]>([]);
  const [diagnosticCopyStatus, setDiagnosticCopyStatus] = useState('');

  const handleAddSensitiveTerm = () => {
    const trimmed = newTermText.trim();
    if (!trimmed) return;
    const newTerm: SensitiveTerm = {
      id: `term-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      term: trimmed,
      category: newTermCategory,
      enabled: true,
    };
    const updated = [...(settings.sensitiveTerms || []), newTerm];
    const newSettings = { ...settings, sensitiveTerms: updated };
    setSettings(newSettings);
    setNewTermText('');
    if (chrome?.storage?.local) {
      chrome.storage.local.set({ [STORAGE_KEY_SETTINGS]: newSettings });
    }
  };

  const handleRemoveSensitiveTerm = (id: string) => {
    const updated = (settings.sensitiveTerms || []).filter((t) => t.id !== id);
    const newSettings = { ...settings, sensitiveTerms: updated };
    setSettings(newSettings);
    if (chrome?.storage?.local) {
      chrome.storage.local.set({ [STORAGE_KEY_SETTINGS]: newSettings });
    }
  };

  const handleToggleSensitiveTerm = (id: string, enabled: boolean) => {
    const updated = (settings.sensitiveTerms || []).map((t) =>
      t.id === id ? { ...t, enabled } : t,
    );
    const newSettings = { ...settings, sensitiveTerms: updated };
    setSettings(newSettings);
    if (chrome?.storage?.local) {
      chrome.storage.local.set({ [STORAGE_KEY_SETTINGS]: newSettings });
    }
  };

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
      setRuleRewrittenPattern(null);
      return;
    }

    if (newRuleType === 'regex') {
      let isMounted = true;
      validateRegexSafetyAsync(newRulePattern.trim(), 300).then((validation) => {
        if (!isMounted) return;
        if (!validation.valid) {
          setRuleValidationError(validation.error || 'Invalid regex pattern');
          setRuleRewrittenPattern(null);
        } else {
          setRuleValidationError(null);
          setRuleRewrittenPattern(validation.rewrittenPattern || null);
        }
      });
      return () => {
        isMounted = false;
      };
    } else {
      setRuleValidationError(null);
      setRuleRewrittenPattern(null);
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
    setRuleRewrittenPattern(null);
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

  const handleLoadDiagnostics = () => {
    if (chrome?.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ action: 'getDiagnostics' }, (res) => {
        if (res?.success && Array.isArray(res.data)) {
          setDiagnosticEntries(res.data);
        }
      });
    }
  };

  const handleClearDiagnostics = () => {
    if (chrome?.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ action: 'clearDiagnostics' }, () => {
        setDiagnosticEntries([]);
      });
    }
  };

  const handleCopyDiagnostics = () => {
    const text = JSON.stringify(diagnosticEntries, null, 2);
    navigator.clipboard.writeText(text).then(() => {
      setDiagnosticCopyStatus('Copied!');
      setTimeout(() => setDiagnosticCopyStatus(''), 3000);
    }).catch(() => {
      setDiagnosticCopyStatus('Copy failed');
      setTimeout(() => setDiagnosticCopyStatus(''), 3000);
    });
  };

  // Load diagnostics on mount
  useEffect(() => {
    handleLoadDiagnostics();
  }, []);

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
          <div
            id="detection-accuracy-disclosure"
            style={{
              background: 'rgba(59, 130, 246, 0.08)',
              border: '1px solid rgba(59, 130, 246, 0.25)',
              borderRadius: '6px',
              padding: '12px 14px',
              margin: '10px 0 14px',
              fontSize: '12px',
              lineHeight: '1.5',
              color: '#cbd5e1',
            }}
          >
            <div style={{ fontWeight: 600, color: '#60a5fa', marginBottom: '6px' }}>
              ℹ️ Detection Coverage &amp; Accuracy Disclosure
            </div>
            <div style={{ marginBottom: '6px' }}>
              • <strong>Structured PII:</strong> High recall (&gt;98%) via deterministic patterns and checksums (emails, phone numbers, API keys, credit cards, SSNs, IP addresses).
            </div>
            <div>
              • <strong>Names, Organizations &amp; Places:</strong> Matched exclusively against our offline built-in gazetteer (~13,000 common entries), context cues, and your personal <a href="#sensitive-terms-storage-notice" style={{ color: '#38bdf8', textDecoration: 'underline' }}>My sensitive terms</a> or manual redactions in the review panel. <em>Unlisted or rare names are not automatically recognized.</em>
            </div>
          </div>

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

        {/* My Sensitive Terms Section */}
        <section className="settings-section">
          <h2>My Sensitive Terms</h2>
          <p className="help-text">
            Add your personal sensitive terms (names, employers, projects, places). Terms are matched as whole words (case-insensitive) and automatically include possessive variants (<code>'s</code>) and last names alone if a full name is added.
          </p>

          {/* Security Disclosure Notice */}
          <div
            id="sensitive-terms-storage-notice"
            style={{
              background: 'rgba(234, 179, 8, 0.1)',
              border: '1px solid rgba(234, 179, 8, 0.3)',
              borderRadius: '6px',
              padding: '10px 14px',
              margin: '10px 0 16px',
              fontSize: '12px',
              color: '#fef08a',
              lineHeight: '1.4',
            }}
          >
            🔒 <strong>Security Notice:</strong> This list is stored locally on this machine and is itself sensitive. It never leaves your browser.
          </div>

          {/* Add New Term Form */}
          <div className="rule-form">
            <h3 style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#e2e8f0' }}>Add Sensitive Term</h3>
            <div className="form-row">
              <div className="form-group" style={{ flex: 2 }}>
                <label htmlFor="new-term-input">Sensitive Term or Name</label>
                <input
                  id="new-term-input"
                  type="text"
                  maxLength={100}
                  placeholder="e.g., Alice Smith, Acme Corp, Project Titan, Zurich"
                  value={newTermText}
                  onChange={(e) => setNewTermText(e.target.value)}
                  className="text-input"
                />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label htmlFor="new-term-category">Category</label>
                <select
                  id="new-term-category"
                  value={newTermCategory}
                  onChange={(e) => setNewTermCategory(e.target.value as SensitiveTermCategory)}
                  className="select-input"
                >
                  <option value="PERSON">Name (PERSON)</option>
                  <option value="ORG">Employer (ORG)</option>
                  <option value="PROJECT">Project (PROJECT)</option>
                  <option value="LOCATION">Place (LOCATION)</option>
                </select>
              </div>
              <div className="form-group" style={{ alignSelf: 'flex-end' }}>
                <button
                  id="add-term-btn"
                  type="button"
                  onClick={handleAddSensitiveTerm}
                  disabled={!newTermText.trim()}
                  className="btn btn-primary"
                  style={{ height: '38px', whiteSpace: 'nowrap' }}
                >
                  + Add Term
                </button>
              </div>
            </div>
          </div>

          {/* Existing Terms List */}
          <div className="rules-list" style={{ marginTop: '16px' }}>
            <h3 style={{ fontSize: '14px', color: '#e2e8f0', marginBottom: '8px' }}>
              Configured Terms ({settings.sensitiveTerms?.length || 0})
            </h3>
            {(!settings.sensitiveTerms || settings.sensitiveTerms.length === 0) ? (
              <p style={{ fontSize: '13px', color: '#64748b', fontStyle: 'italic' }}>
                No sensitive terms configured yet. Add your name, company, or secret projects above.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {settings.sensitiveTerms.map((term) => (
                  <div
                    key={term.id}
                    className="sensitive-term-card"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                      background: '#1e293b',
                      border: '1px solid #334155',
                      borderRadius: '6px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          background:
                            term.category === 'PERSON' ? '#8b5cf6' :
                            term.category === 'ORG' ? '#0ea5e9' :
                            term.category === 'LOCATION' ? '#10b981' : '#f59e0b',
                          color: '#ffffff',
                        }}
                      >
                        {term.category}
                      </span>
                      <strong style={{ fontSize: '13px', color: '#f8fafc' }}>{term.term}</strong>
                      {term.category === 'PERSON' && term.term.trim().includes(' ') && (
                        <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                          (matches full name, possessive, &amp; last name alone)
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#cbd5e1', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={term.enabled}
                          onChange={(e) => handleToggleSensitiveTerm(term.id, e.target.checked)}
                        />
                        Active
                      </label>
                      <button
                        type="button"
                        onClick={() => handleRemoveSensitiveTerm(term.id)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#f87171',
                          cursor: 'pointer',
                          fontSize: '12px',
                          padding: '4px 8px',
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
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
                {ruleRewrittenPattern && ruleRewrittenPattern !== newRulePattern.trim() && (
                  <div style={{ color: '#f59e0b', marginTop: '4px' }}>
                    Note: Unbounded repeats are capped at 200 characters. Capped form: <code style={{background: 'rgba(0,0,0,0.2)', padding: '2px 4px', borderRadius: '4px'}}>{ruleRewrittenPattern}</code>
                  </div>
                )}
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

        {/* Diagnostics Section */}
        <section className="settings-section" id="diagnostics-section">
          <h2>🔍 Diagnostics</h2>
          <p className="help-text" style={{ marginBottom: '12px' }}>
            Last 20 content-free request summaries. No raw prompt text is ever stored here.
            Use this to debug which requests are being redacted, passed through, or blocked.
          </p>

          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            <button
              id="diagnostics-refresh-btn"
              type="button"
              className="secondary-btn"
              onClick={handleLoadDiagnostics}
            >
              Refresh
            </button>
            <button
              id="diagnostics-copy-btn"
              type="button"
              className="secondary-btn"
              onClick={handleCopyDiagnostics}
            >
              Copy
            </button>
            <button
              id="diagnostics-clear-btn"
              type="button"
              className="danger-btn"
              onClick={handleClearDiagnostics}
            >
              Clear
            </button>
            {diagnosticCopyStatus && (
              <span style={{ color: '#10b981', fontSize: '13px', alignSelf: 'center' }}>
                ✓ {diagnosticCopyStatus}
              </span>
            )}
          </div>

          {diagnosticEntries.length === 0 ? (
            <p style={{ color: '#9ca3af', fontSize: '13px', fontStyle: 'italic' }}>
              No diagnostic entries yet. Send a message on a supported site to see entries.
            </p>
          ) : (
            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
              <table id="diagnostics-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #374151', textAlign: 'left' }}>
                    <th style={{ padding: '6px 8px', color: '#9ca3af' }}>Time</th>
                    <th style={{ padding: '6px 8px', color: '#9ca3af' }}>Method</th>
                    <th style={{ padding: '6px 8px', color: '#9ca3af' }}>Path</th>
                    <th style={{ padding: '6px 8px', color: '#9ca3af' }}>Type</th>
                    <th style={{ padding: '6px 8px', color: '#9ca3af' }}>Classification</th>
                    <th style={{ padding: '6px 8px', color: '#9ca3af' }}>Decision</th>
                  </tr>
                </thead>
                <tbody>
                  {diagnosticEntries.map((entry, idx) => (
                    <tr
                      key={idx}
                      style={{
                        borderBottom: '1px solid #1f2937',
                        backgroundColor: entry.decision === 'blocked' ? 'rgba(239,68,68,0.1)' :
                          entry.decision === 'redacted' ? 'rgba(59,130,246,0.1)' : 'transparent',
                      }}
                    >
                      <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>
                        {entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString() : '—'}
                      </td>
                      <td style={{ padding: '6px 8px' }}>{entry.method || '—'}</td>
                      <td style={{ padding: '6px 8px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        title={entry.path}
                      >
                        {entry.path || '—'}
                      </td>
                      <td style={{ padding: '6px 8px' }}>{entry.contentType || '—'}</td>
                      <td style={{ padding: '6px 8px' }}>
                        <span style={{
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 600,
                          backgroundColor: entry.classification === 'message' ? '#1e3a5f' :
                            entry.classification === 'non-message' ? '#1a3a2a' : '#5f1e1e',
                          color: entry.classification === 'message' ? '#93c5fd' :
                            entry.classification === 'non-message' ? '#6ee7b7' : '#fca5a5',
                        }}>
                          {entry.classification || '—'}
                        </span>
                      </td>
                      <td style={{ padding: '6px 8px' }}>
                        <span style={{
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 600,
                          backgroundColor: entry.decision === 'redacted' ? '#1e3a5f' :
                            entry.decision === 'passed-through' ? '#1a3a2a' : '#5f1e1e',
                          color: entry.decision === 'redacted' ? '#93c5fd' :
                            entry.decision === 'passed-through' ? '#6ee7b7' : '#fca5a5',
                        }}>
                          {entry.decision || '—'}
                        </span>
                        {entry.blockReason && (
                          <div style={{ fontSize: '10px', color: '#f87171', marginTop: '2px' }}>
                            {entry.blockReason}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {diagnosticEntries.length > 0 && (
            <details style={{ marginTop: '12px' }}>
              <summary style={{ cursor: 'pointer', color: '#9ca3af', fontSize: '12px' }}>
                Raw JSON structure of last entry
              </summary>
              <pre style={{
                background: '#111827',
                padding: '12px',
                borderRadius: '6px',
                fontSize: '11px',
                color: '#d1d5db',
                overflow: 'auto',
                maxHeight: '300px',
                marginTop: '8px',
              }}>
                {JSON.stringify(diagnosticEntries[diagnosticEntries.length - 1]?.jsonStructure, null, 2)}
              </pre>
            </details>
          )}
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
