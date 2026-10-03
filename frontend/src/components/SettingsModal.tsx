import React, { useState } from 'react';
import {
  X,
  Plus,
  Trash2,
  Sliders,
  Shield,
  Play,
} from 'lucide-react';
import type { CustomRule, EntityType } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  enabledTypes: Record<EntityType, boolean>;
  onToggleEntityType: (type: EntityType) => void;
  customRules: CustomRule[];
  onAddRule: (rule: Omit<CustomRule, 'id'>) => void;
  onDeleteRule: (id: string) => void;
  onToggleRule: (id: string) => void;
  sensitivity: 'low' | 'medium' | 'high';
  onSetSensitivity: (lvl: 'low' | 'medium' | 'high') => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  enabledTypes,
  onToggleEntityType,
  customRules,
  onAddRule,
  onDeleteRule,
  onToggleRule,
  sensitivity,
  onSetSensitivity,
}) => {
  // New rule form states
  const [newRuleName, setNewRuleName] = useState('');
  const [newRulePattern, setNewRulePattern] = useState('');
  const [newRuleIsRegex, setNewRuleIsRegex] = useState(false);
  const [newRulePrefix, setNewRulePrefix] = useState('CUSTOM');

  // Test sandbox
  const [testText, setTestText] = useState('Confidential Project X AE-12 launched by M.Nafees');
  const [testResult, setTestResult] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCreateRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRulePattern.trim()) return;

    onAddRule({
      name: newRuleName.trim() || 'Custom Rule',
      pattern: newRulePattern.trim(),
      type: 'Custom',
      isRegex: newRuleIsRegex,
      placeholderPrefix: newRulePrefix.trim().toUpperCase() || 'CUSTOM',
      enabled: true,
    });

    setNewRuleName('');
    setNewRulePattern('');
  };

  const handleRunTest = () => {
    if (!newRulePattern) {
      setTestResult('Please enter a pattern first');
      return;
    }
    try {
      const regex = newRuleIsRegex
        ? new RegExp(newRulePattern, 'gi')
        : new RegExp(`\\b${newRulePattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
      const matches = testText.match(regex);
      if (matches && matches.length > 0) {
        setTestResult(`Matched ${matches.length} instance(s): "${matches.join('", "')}"`);
      } else {
        setTestResult('No matches found in test string');
      }
    } catch (err) {
      setTestResult(`Regex Error: ${(err as Error).message}`);
    }
  };

  const entityTypeList: EntityType[] = [
    'Name',
    'Email',
    'CNIC',
    'API key',
    'Phone',
    'Credit Card',
    'IP Address',
  ];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="modal-header">
          <div className="modal-header-title">
            <Sliders size={20} className="modal-title-icon" />
            <h2>Shield Settings & Custom Detection Rules</h2>
          </div>
          <button className="modal-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="modal-body-scrollable">
          {/* Section 1: Sensitivity Setting */}
          <div className="settings-section">
            <h3 className="section-title">Detection Sensitivity</h3>
            <p className="section-desc">
              Controls how aggressively Ratchet detects ambiguous tokens and names.
            </p>
            <div className="sensitivity-selector">
              {(['low', 'medium', 'high'] as const).map((lvl) => (
                <button
                  key={lvl}
                  className={`sensitivity-btn ${sensitivity === lvl ? 'active' : ''}`}
                  onClick={() => onSetSensitivity(lvl)}
                >
                  <span className="sensitivity-name">
                    {lvl.charAt(0).toUpperCase() + lvl.slice(1)}
                  </span>
                  <span className="sensitivity-caption">
                    {lvl === 'low'
                      ? 'Strict exact matches only'
                      : lvl === 'medium'
                      ? 'Standard balanced protection'
                      : 'Aggressive contextual NER'}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Section 2: Active Detectors Toggle */}
          <div className="settings-section">
            <h3 className="section-title">Active Privacy Detectors</h3>
            <p className="section-desc">Enable or disable specific entity classifiers.</p>
            <div className="detectors-grid">
              {entityTypeList.map((type) => (
                <label key={type} className="detector-toggle-label">
                  <input
                    type="checkbox"
                    checked={enabledTypes[type] ?? true}
                    onChange={() => onToggleEntityType(type)}
                  />
                  <span className="detector-name">{type}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Section 3: Custom Rules Manager */}
          <div className="settings-section">
            <h3 className="section-title">Custom Keyword & Regex Rules</h3>
            <p className="section-desc">
              Define your own proprietary keywords, project codenames, or custom regexes.
            </p>

            <form onSubmit={handleCreateRule} className="new-rule-form">
              <div className="form-row">
                <input
                  type="text"
                  placeholder="Rule Name (e.g. Project Codename)"
                  className="form-input"
                  value={newRuleName}
                  onChange={(e) => setNewRuleName(e.target.value)}
                />
                <input
                  type="text"
                  placeholder="Pattern (e.g. Project-X or \bEMP-\d{4}\b)"
                  className="form-input pattern-input font-mono"
                  value={newRulePattern}
                  onChange={(e) => setNewRulePattern(e.target.value)}
                  required
                />
              </div>

              <div className="form-row">
                <input
                  type="text"
                  placeholder="Placeholder Prefix (e.g. SECRET)"
                  className="form-input font-mono"
                  value={newRulePrefix}
                  onChange={(e) => setNewRulePrefix(e.target.value)}
                />
                <label className="checkbox-inline">
                  <input
                    type="checkbox"
                    checked={newRuleIsRegex}
                    onChange={(e) => setNewRuleIsRegex(e.target.checked)}
                  />
                  <span>Is Regular Expression</span>
                </label>
                <button type="submit" className="add-rule-btn">
                  <Plus size={15} /> Add Rule
                </button>
              </div>
            </form>

            {/* Test Sandbox */}
            <div className="test-sandbox-card">
              <div className="sandbox-header">
                <span className="sandbox-label">Live Rule Tester:</span>
                <button type="button" className="test-run-btn" onClick={handleRunTest}>
                  <Play size={12} /> Test Match
                </button>
              </div>
              <input
                type="text"
                className="sandbox-input font-mono"
                value={testText}
                onChange={(e) => setTestText(e.target.value)}
              />
              {testResult && <div className="test-result-output">{testResult}</div>}
            </div>

            {/* Current Custom Rules List */}
            {customRules.length > 0 && (
              <div className="custom-rules-list">
                {customRules.map((rule) => (
                  <div key={rule.id} className="rule-item-card">
                    <div className="rule-item-left">
                      <span className="rule-name">{rule.name}</span>
                      <code className="rule-pattern font-mono">{rule.pattern}</code>
                      <span className="rule-tag">
                        Prefix: <span className="font-mono">[{rule.placeholderPrefix}_#]</span>
                      </span>
                    </div>

                    <div className="rule-item-right">
                      <label className="switch-toggle" title="Toggle rule on/off">
                        <input
                          type="checkbox"
                          checked={rule.enabled}
                          onChange={() => onToggleRule(rule.id)}
                        />
                        <span className="slider round" />
                      </label>
                      <button
                        className="delete-rule-btn"
                        onClick={() => onDeleteRule(rule.id)}
                        title="Delete rule"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="modal-footer">
          <span className="modal-note">
            <Shield size={13} /> Settings persist automatically in your browser's private storage.
          </span>
          <button className="primary-done-btn" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
