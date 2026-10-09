import { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import type { RatchetSettings, Sensitivity } from '../shared/types';
import { DEFAULT_SETTINGS, STORAGE_KEY_SETTINGS } from '../shared/constants';
import type { SessionStats } from '../background/storage';

const Popup = () => {
  const [settings, setSettings] = useState<RatchetSettings>(DEFAULT_SETTINGS);
  const [sessionStats, setSessionStats] = useState<SessionStats>({
    totalDetected: 0,
    totalRedacted: 0,
    byCategory: {},
  });
  const [currentDomain, setCurrentDomain] = useState<string>('');
  const [currentSiteKey, setCurrentSiteKey] = useState<'chatgpt' | 'claude' | 'gemini' | 'mock' | null>(null);

  useEffect(() => {
    // 1. Identify active tab domain
    if (chrome?.tabs) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.url) {
          try {
            const url = new URL(tabs[0].url);
            const host = url.hostname.toLowerCase();
            setCurrentDomain(host);

            if (host === 'chatgpt.com' || host === 'chat.openai.com') {
              setCurrentSiteKey('chatgpt');
            } else if (host === 'claude.ai') {
              setCurrentSiteKey('claude');
            } else if (host === 'gemini.google.com') {
              setCurrentSiteKey('gemini');
            } else if (host === 'localhost' || host === '127.0.0.1') {
              setCurrentSiteKey('mock');
            }
          } catch {
            // Non-URL tab
          }
        }
      });
    }

    // 2. Fetch current settings
    if (chrome?.runtime) {
      chrome.runtime.sendMessage({ action: 'getSettings' }, (res) => {
        if (res && res.success && res.data) {
          setSettings(res.data);
        }
      });

      // 3. Fetch real session stats by category
      chrome.runtime.sendMessage({ action: 'getSessionStats' }, (res) => {
        if (res && res.success && res.data) {
          setSessionStats(res.data);
        }
      });
    }
  }, []);

  const saveSettings = (updated: RatchetSettings) => {
    setSettings(updated);
    if (chrome?.storage?.local) {
      chrome.storage.local.set({ [STORAGE_KEY_SETTINGS]: updated });
    }
  };

  const handleGlobalToggle = (enabled: boolean) => {
    saveSettings({ ...settings, enabled });
  };

  const handleSiteToggle = (enabled: boolean) => {
    if (!currentSiteKey) return;
    const enabledSites = { ...settings.enabledSites, [currentSiteKey]: enabled };
    saveSettings({ ...settings, enabledSites });
  };

  const handleSensitivityChange = (sensitivity: Sensitivity) => {
    saveSettings({ ...settings, sensitivity });
  };

  const handleSiteReviewToggle = (enabled: boolean) => {
    if (!currentSiteKey) return;
    const reviewSites = {
      chatgpt: true,
      claude: true,
      gemini: true,
      ...settings.reviewSites,
      [currentSiteKey]: enabled,
    };
    saveSettings({ ...settings, reviewSites });
  };

  const isCurrentSiteReviewActive = currentSiteKey
    ? (settings.reviewSites as any)?.[currentSiteKey] !== false
    : true;

  const isCurrentSiteActive = currentSiteKey
    ? (settings.enabledSites as any)[currentSiteKey] !== false
    : true;

  const categoryEntries = Object.entries(sessionStats.byCategory || {});

  return (
    <div style={{ padding: '18px', width: '320px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', color: '#e2e8f0', background: '#0f172a', display: 'flex', flexDirection: 'column', gap: '14px', boxSizing: 'border-box' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #1e293b', paddingBottom: '10px' }}>
        <h2 style={{ margin: 0, fontSize: '17px', display: 'flex', alignItems: 'center', gap: '8px', color: '#f8fafc' }}>
          <span style={{ fontSize: '20px' }}>🛡️</span> Ratchet Privacy
        </h2>
        <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: '13px', gap: '6px' }}>
          <input
            id="global-shield-toggle"
            type="checkbox"
            checked={settings.enabled}
            onChange={(e) => handleGlobalToggle(e.target.checked)}
          />
          {settings.enabled ? 'Active' : 'Paused'}
        </label>
      </div>

      {/* Per-Site Control */}
      {currentDomain && currentSiteKey && (
        <div style={{ background: '#1e293b', padding: '12px', borderRadius: '6px', border: '1px solid #334155' }}>
          {currentSiteKey === 'gemini' ? (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', fontWeight: '500' }}>{currentDomain}</span>
                <span id="site-status-badge" style={{ fontSize: '11px', background: '#475569', color: '#cbd5e1', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>
                  Not Supported
                </span>
              </div>
              <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#94a3b8', lineHeight: '1.4' }}>
                Gemini adapter is not implemented yet. Prompts on this site are <strong>not protected</strong> by Ratchet.
              </p>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', fontWeight: '500' }}>Enabled on {currentDomain}</span>
                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                  <input
                    id="site-shield-toggle"
                    type="checkbox"
                    checked={isCurrentSiteActive}
                    onChange={(e) => handleSiteToggle(e.target.checked)}
                  />
                </label>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #334155' }}>
                <span style={{ fontSize: '12px', color: '#cbd5e1' }}>Review before sending</span>
                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                  <input
                    id="site-review-toggle"
                    type="checkbox"
                    checked={isCurrentSiteReviewActive}
                    onChange={(e) => handleSiteReviewToggle(e.target.checked)}
                  />
                </label>
              </div>
            </>
          )}
        </div>
      )}

      {/* Sensitivity Selector */}
      <div style={{ background: '#1e293b', padding: '12px', borderRadius: '6px', border: '1px solid #334155' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '13px', fontWeight: '500' }}>Sensitivity Level</span>
          <select
            id="sensitivity-selector"
            value={settings.sensitivity}
            onChange={(e) => handleSensitivityChange(e.target.value as Sensitivity)}
            style={{ background: '#0f172a', color: '#f8fafc', border: '1px solid #475569', borderRadius: '4px', padding: '4px 8px', fontSize: '12px', cursor: 'pointer' }}
          >
            <option value="low">Low (Strict PII)</option>
            <option value="medium">Medium (Standard)</option>
            <option value="high">High (Relaxed/Broad)</option>
          </select>
        </div>
      </div>

      {/* Real Session Status by Category */}
      <div style={{ background: '#1e293b', padding: '12px', borderRadius: '6px', border: '1px solid #334155' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <span style={{ fontSize: '13px', fontWeight: '600', color: '#94a3b8' }}>This Session</span>
          <span id="session-total-redacted" style={{ fontWeight: 'bold', color: '#38bdf8', fontSize: '14px' }}>
            {sessionStats.totalRedacted} redacted
          </span>
        </div>

        {categoryEntries.length === 0 ? (
          <p id="no-redactions-notice" style={{ margin: '6px 0 0', fontSize: '12px', color: '#64748b' }}>
            No entities redacted in this session yet.
          </p>
        ) : (
          <div id="category-pills" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
            {categoryEntries.map(([cat, count]) => (
              <span
                key={cat}
                style={{
                  background: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '12px',
                  padding: '2px 8px',
                  fontSize: '11px',
                  color: '#cbd5e1',
                }}
              >
                {cat}: <strong style={{ color: '#38bdf8' }}>{count}</strong>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Settings Action Button */}
      <div style={{ marginTop: '4px' }}>
        <button
          id="open-options-btn"
          style={{
            width: '100%',
            padding: '8px',
            background: '#2563eb',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer',
            fontWeight: '600',
            fontSize: '13px',
          }}
          onClick={() => {
            if (chrome?.runtime?.openOptionsPage) {
              chrome.runtime.openOptionsPage();
            } else {
              window.open('options.html', '_blank');
            }
          }}
        >
          Options & Custom Rules
        </button>
        <div style={{ marginTop: '8px', fontSize: '10px', color: '#64748b', textAlign: 'center', fontStyle: 'italic' }}>
          * Name, organization, and location detection is best-effort.
        </div>
      </div>
    </div>
  );
};

const rootElement = document.getElementById('root');
if (rootElement) {
  const root = createRoot(rootElement);
  root.render(<Popup />);
}
