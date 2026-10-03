import React, { useState, useEffect, useCallback } from 'react';
import type {
  ActiveTab,
  ThemeMode,
  DetectedEntity,
  SessionRecord,
  CustomRule,
  SystemMetrics,
  EntityType,
} from './types';
import { Header } from './components/Header';
import { TabNav } from './components/TabNav';
import { RedactTab } from './components/RedactTab';
import { RestoreTab } from './components/RestoreTab';
import { MetricsTab } from './components/MetricsTab';
import { ChangelogTab } from './components/ChangelogTab';
import { SettingsModal } from './components/SettingsModal';
import { ToastContainer, type ToastMessage } from './components/Toast';
import { detectEntitiesInText, buildRedactedText } from './engine/detector';
import { checkBackendHealth } from './engine/api';
import './App.css';

const DEFAULT_SAMPLE_TEXT = `Hi, my name is M.Nafees and I work at Tech Solutions.
You can reach me at nafees@example.com for any queries.
My CNIC is 42201-1234567-1 and I use this API key sk-7f3a9e8c4d2e6b1a
for the production environment. Please keep this information private.`;

const DEV_SAMPLE_TEXT = `Deploying microservice cluster for user Alice Johnson (alice.j@cloudinfra.io).
AWS Access Key ID: AKIAIOSFODNN7EXAMPLE
GitHub Personal Access Token: ghp_9876543210abcdef9876543210abcdef9876
Internal production server IP is 192.168.1.105 with secondary node 10.0.4.12.
Direct inquiries to +1 (415) 555-2671 or Dr. Robert Vance.`;

const PAKISTAN_SAMPLE_TEXT = `Assalam-o-Alaikum, this is Syed Bilal Shah from Karachi.
CNIC number: 42101-9876543-3 (issued by NADRA).
Mobile number: 0300-8291045 or via email bilal.shah@fast.edu.pk.
Emergency contact: Muhammad Tariq (+92-321-4455667).`;

export const App: React.FC = () => {
  // Theme state
  const [theme, setTheme] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('ratchet_theme') as ThemeMode;
    if (saved) return saved;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches
      ? 'light'
      : 'dark';
  });

  // Active Tab state
  const [activeTab, setActiveTab] = useState<ActiveTab>('redact');

  // Backend connection status
  const [isBackendConnected, setIsBackendConnected] = useState<boolean>(false);

  // Redact state
  const [inputText, setInputText] = useState<string>(() => {
    return localStorage.getItem('ratchet_input') || DEFAULT_SAMPLE_TEXT;
  });
  const [entities, setEntities] = useState<DetectedEntity[]>([]);
  const [safeText, setSafeText] = useState<string>('');
  const [isCopied, setIsCopied] = useState<boolean>(false);

  // Settings & Custom rules
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [sensitivity, setSensitivity] = useState<'low' | 'medium' | 'high'>('medium');
  const [enabledTypes, setEnabledTypes] = useState<Record<EntityType, boolean>>({
    Name: true,
    Email: true,
    CNIC: true,
    'API key': true,
    Phone: true,
    'Credit Card': true,
    Address: true,
    'IP Address': true,
    Custom: true,
  });

  const [customRules, setCustomRules] = useState<CustomRule[]>(() => {
    const saved = localStorage.getItem('ratchet_custom_rules');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        // fallback
      }
    }
    return [
      {
        id: 'rule-project-secret',
        name: 'Project Codename',
        pattern: 'Tech Solutions',
        type: 'Custom',
        isRegex: false,
        placeholderPrefix: 'ORG',
        enabled: false,
      },
    ];
  });

  // Sessions state
  const [sessions, setSessions] = useState<SessionRecord[]>(() => {
    const saved = localStorage.getItem('ratchet_sessions');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        // fallback
      }
    }
    return [];
  });

  const [currentSession, setCurrentSession] = useState<SessionRecord | null>(null);

  // Metrics telemetry state
  const [metrics, setMetrics] = useState<SystemMetrics>(() => {
    const saved = localStorage.getItem('ratchet_metrics');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        // fallback
      }
    }
    return {
      totalDetected: 42,
      totalRedacted: 39,
      sessionsCount: 8,
      accuracyRate: 98,
      entityTypeCounts: {
        Name: 14,
        Email: 12,
        CNIC: 7,
        'API key': 5,
        Phone: 3,
        'Credit Card': 1,
      },
      history: [],
    };
  });

  // Toasts
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = (text: string, type: 'success' | 'info' | 'warning' = 'success') => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { id, text, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Sync theme attribute to HTML root
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('ratchet_theme', theme);
  }, [theme]);

  // Check backend health periodically
  useEffect(() => {
    let mounted = true;
    const verifyBackend = async () => {
      const isUp = await checkBackendHealth();
      if (mounted) setIsBackendConnected(isUp);
    };
    verifyBackend();
    const interval = setInterval(verifyBackend, 15000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  // Save custom rules to storage
  useEffect(() => {
    localStorage.setItem('ratchet_custom_rules', JSON.stringify(customRules));
  }, [customRules]);

  // Core detection on input or rule changes
  const runDetection = useCallback(
    (textToScan: string) => {
      const detected = detectEntitiesInText(textToScan, customRules, enabledTypes);
      setEntities(detected);
      const safe = buildRedactedText(textToScan, detected);
      setSafeText(safe);
    },
    [customRules, enabledTypes]
  );

  // Trigger detection whenever input changes
  useEffect(() => {
    runDetection(inputText);
    localStorage.setItem('ratchet_input', inputText);
  }, [inputText, runDetection]);

  // Recalculate safe text whenever individual entity enabled toggles change
  const handleToggleEntity = (entityId: string) => {
    setEntities((prev) => {
      const updated = prev.map((e) =>
        e.id === entityId ? { ...e, enabled: !e.enabled } : e
      );
      const safe = buildRedactedText(inputText, updated);
      setSafeText(safe);
      return updated;
    });
  };

  const handleToggleAll = (selectAll: boolean) => {
    setEntities((prev) => {
      const updated = prev.map((e) => ({ ...e, enabled: selectAll }));
      const safe = buildRedactedText(inputText, updated);
      setSafeText(safe);
      return updated;
    });
  };

  // Preset loading handler
  const handleLoadPreset = (key: string) => {
    if (key === 'default') {
      setInputText(DEFAULT_SAMPLE_TEXT);
      addToast('Loaded reference design preset (M.Nafees)', 'info');
    } else if (key === 'dev') {
      setInputText(DEV_SAMPLE_TEXT);
      addToast('Loaded Developer Secrets & Cloud preset', 'info');
    } else if (key === 'pakistan') {
      setInputText(PAKISTAN_SAMPLE_TEXT);
      addToast('Loaded Pakistani CNIC & Mobile preset', 'info');
    } else if (key === 'clear') {
      setInputText('');
      setEntities([]);
      setSafeText('');
      addToast('Cleared text area', 'info');
    }
  };

  // Copy safe text action
  const handleCopySafeText = async () => {
    if (!safeText) return;
    try {
      await navigator.clipboard.writeText(safeText);
      setIsCopied(true);
      addToast('Safe text copied to clipboard!', 'success');

      // Update telemetry
      const newCounts = { ...metrics.entityTypeCounts };
      entities
        .filter((e) => e.enabled)
        .forEach((e) => {
          newCounts[e.type] = (newCounts[e.type] || 0) + 1;
        });

      const newHistoryItem = {
        id: `sess-${Date.now().toString(36).slice(-5)}`,
        timestamp: Date.now(),
        entityCount: entities.filter((e) => e.enabled).length,
        types: Array.from(new Set(entities.map((e) => e.type))),
        safeSnippet: safeText.slice(0, 50),
      };

      const updatedMetrics: SystemMetrics = {
        totalDetected: metrics.totalDetected + entities.length,
        totalRedacted: metrics.totalRedacted + entities.filter((e) => e.enabled).length,
        sessionsCount: metrics.sessionsCount + 1,
        accuracyRate: 98,
        entityTypeCounts: newCounts,
        history: [newHistoryItem, ...metrics.history].slice(0, 20),
      };

      setMetrics(updatedMetrics);
      localStorage.setItem('ratchet_metrics', JSON.stringify(updatedMetrics));

      setTimeout(() => setIsCopied(false), 2200);
    } catch {
      addToast('Failed to copy text', 'warning');
    }
  };

  // Send current redacted session to Restore Tab
  const handleSendToRestore = () => {
    const newSession: SessionRecord = {
      id: `SES-${Date.now().toString(36).toUpperCase()}`,
      timestamp: Date.now(),
      originalText: inputText,
      safeText,
      entities: [...entities],
      name: `Prompt (${entities.length} items)`,
    };

    const updatedSessions = [newSession, ...sessions.slice(0, 15)];
    setSessions(updatedSessions);
    setCurrentSession(newSession);
    localStorage.setItem('ratchet_sessions', JSON.stringify(updatedSessions));

    setActiveTab('restore');
    addToast('Vault session created & sent to Restore Tab!', 'success');
  };

  // Export metrics report
  const handleExportReport = () => {
    const dataStr =
      'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(metrics, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `ratchet-audit-report-${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    addToast('Exported audit report JSON', 'info');
  };

  return (
    <div className="ratchet-app-layout">
      {/* Toast Notifications Container */}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />

      {/* Main Container */}
      <div className="ratchet-main-container">
        {/* Top Header */}
        <Header
          theme={theme}
          onToggleTheme={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
          onOpenSettings={() => setIsSettingsOpen(true)}
          isBackendConnected={isBackendConnected}
        />

        {/* Tab Navigation */}
        <TabNav
          activeTab={activeTab}
          onSelectTab={(tab) => setActiveTab(tab)}
          entityCount={entities.length}
        />

        {/* Tab Content Display */}
        <main className="tab-content-area">
          {activeTab === 'redact' && (
            <RedactTab
              inputText={inputText}
              onInputChange={(text) => setInputText(text)}
              safeText={safeText}
              entities={entities}
              onToggleEntity={handleToggleEntity}
              onToggleAll={handleToggleAll}
              onCopySafeText={handleCopySafeText}
              isCopied={isCopied}
              onSendToRestore={handleSendToRestore}
              onLoadPreset={handleLoadPreset}
            />
          )}

          {activeTab === 'restore' && (
            <RestoreTab
              sessions={sessions}
              currentSession={
                currentSession ||
                (entities.length > 0
                  ? {
                      id: 'SESSION-CURRENT',
                      timestamp: Date.now(),
                      originalText: inputText,
                      safeText,
                      entities,
                      name: 'Current Editor Prompt',
                    }
                  : null)
              }
              onSelectSession={(sess) => setCurrentSession(sess)}
              onCopyText={async (text) => {
                await navigator.clipboard.writeText(text);
                addToast('Copied restored text!', 'success');
              }}
            />
          )}

          {activeTab === 'metrics' && (
            <MetricsTab metrics={metrics} onExportReport={handleExportReport} />
          )}

          {activeTab === 'changelog' && <ChangelogTab />}
        </main>
      </div>

      {/* Custom Rules & Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        enabledTypes={enabledTypes}
        onToggleEntityType={(type) =>
          setEnabledTypes((prev) => ({ ...prev, [type]: !prev[type] }))
        }
        customRules={customRules}
        onAddRule={(newR) => {
          setCustomRules((prev) => [
            ...prev,
            { ...newR, id: `rule-${Date.now().toString(36)}` },
          ]);
          addToast(`Added rule "${newR.name}"`, 'success');
        }}
        onDeleteRule={(id) => {
          setCustomRules((prev) => prev.filter((r) => r.id !== id));
          addToast('Deleted custom rule', 'info');
        }}
        onToggleRule={(id) => {
          setCustomRules((prev) =>
            prev.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r))
          );
        }}
        sensitivity={sensitivity}
        onSetSensitivity={(lvl) => {
          setSensitivity(lvl);
          addToast(`Sensitivity set to ${lvl}`, 'info');
        }}
      />
    </div>
  );
};

export default App;
