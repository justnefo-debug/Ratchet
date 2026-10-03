import React, { useState, useEffect } from 'react';
import {
  Copy,
  Check,
  Bot,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  History,
  FileCheck,
} from 'lucide-react';
import type { SessionRecord } from '../types';
import { restoreTextFromSession, type RestorationResult } from '../engine/restorer';
import { Badge } from './Badge';

interface RestoreTabProps {
  sessions: SessionRecord[];
  currentSession: SessionRecord | null;
  onSelectSession: (session: SessionRecord) => void;
  onCopyText: (text: string) => void;
}

export const RestoreTab: React.FC<RestoreTabProps> = ({
  sessions,
  currentSession,
  onSelectSession,
  onCopyText,
}) => {
  const [selectedSessionId, setSelectedSessionId] = useState<string>(
    currentSession?.id || (sessions.length > 0 ? sessions[0].id : '')
  );

  const activeSession =
    sessions.find((s) => s.id === selectedSessionId) || currentSession || null;

  // AI response input with default mock AI answer
  const [aiResponseText, setAiResponseText] = useState<string>('');
  const [restoration, setRestoration] = useState<RestorationResult | null>(null);
  const [isCopied, setIsCopied] = useState<boolean>(false);

  // Initialize or update default response when session changes
  useEffect(() => {
    if (activeSession) {
      // Create a realistic AI response using the session's placeholders
      const pName = activeSession.entities.find((e) => e.type === 'Name')?.placeholder || 'PERSON_1';
      const pEmail = activeSession.entities.find((e) => e.type === 'Email')?.placeholder || 'EMAIL_1';
      const pKey = activeSession.entities.find((e) => e.type === 'API key')?.placeholder || 'API_KEY_1';

      const sampleResponse = `Hello ${pName},\n\nI have verified your production environment setup. Your API key ${pKey} has been tested against the rate limit endpoints successfully.\n\nWe will send the comprehensive audit report directly to ${pEmail}.\n\nBest regards,\nSecurity Engineering Team`;

      setAiResponseText(sampleResponse);
    }
  }, [activeSession?.id]);

  // Recalculate restoration whenever input or active session changes
  useEffect(() => {
    if (activeSession && aiResponseText) {
      const res = restoreTextFromSession(aiResponseText, activeSession);
      setRestoration(res);
    } else {
      setRestoration(null);
    }
  }, [aiResponseText, activeSession]);

  const handleCopy = () => {
    if (restoration?.restoredText) {
      onCopyText(restoration.restoredText);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  };

  return (
    <div className="restore-tab-container">
      {/* Session Selector Header Bar */}
      <div className="restore-toolbar-card">
        <div className="restore-toolbar-left">
          <History size={17} className="toolbar-icon" />
          <span className="toolbar-label">Active Encryption Session:</span>
          {sessions.length > 0 ? (
            <select
              className="session-select-dropdown"
              value={activeSession?.id || ''}
              onChange={(e) => {
                setSelectedSessionId(e.target.value);
                const found = sessions.find((s) => s.id === e.target.value);
                if (found) onSelectSession(found);
              }}
            >
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.entities.length} entities) &bull;{' '}
                  {new Date(s.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </option>
              ))}
            </select>
          ) : (
            <span className="no-session-badge">No active session yet — Redact some text first</span>
          )}
        </div>

        <div className="restore-toolbar-right">
          <button
            className="preset-chip"
            onClick={() => {
              if (activeSession) {
                const p = activeSession.entities;
                const pName = p.find((e) => e.type === 'Name')?.placeholder || 'PERSON_1';
                const pKey = p.find((e) => e.type === 'API key')?.placeholder || 'API_KEY_1';
                setAiResponseText(
                  `Confirmed! Successfully authenticated ${pName} using credentials ${pKey}. All systems operational.`
                );
              }
            }}
          >
            <Sparkles size={13} /> Load Sample AI Response
          </button>
        </div>
      </div>

      {/* Dual Panels for AI Response & Restored Text */}
      <div className="dual-panels-grid">
        {/* Left Panel: AI Response with Placeholders */}
        <div className="panel-card panel-left">
          <div className="panel-header">
            <div className="panel-title-wrap">
              <Bot size={18} className="panel-icon" />
              <h2 className="panel-title">Paste AI response with placeholders</h2>
            </div>
            <span className="panel-status-pill">Incoming</span>
          </div>

          <div className="panel-body">
            <textarea
              className="panel-textarea font-mono"
              placeholder="Paste ChatGPT, Claude, or Gemini response containing PERSON_1, EMAIL_1, etc..."
              value={aiResponseText}
              onChange={(e) => setAiResponseText(e.target.value)}
              rows={8}
            />
          </div>

          <div className="panel-footer">
            <span className="meta-info">
              {restoration?.restoredCount || 0} placeholders detected ready to unlock
            </span>
          </div>
        </div>

        {/* Right Panel: Reconstructed Original Text */}
        <div className="panel-card panel-right">
          <div className="panel-header">
            <div className="panel-title-wrap">
              <FileCheck size={18} className="panel-icon shield-accent" />
              <h2 className="panel-title">Restored Text (Originals Recovered)</h2>
            </div>
            <span className="panel-status-pill success">Protected Vault</span>
          </div>

          <div className="panel-body">
            <div className="panel-highlight-box safe-box restored-preview-box">
              {restoration ? (
                restoration.parts.map((part, idx) =>
                  part.isRestored && part.entity ? (
                    <span
                      key={idx}
                      className="restored-inline-highlight"
                      title={`Restored from ${part.entity.placeholder}`}
                    >
                      {part.text}
                    </span>
                  ) : (
                    <span key={idx}>{part.text}</span>
                  )
                )
              ) : (
                <span className="text-muted">Restored preview will appear here...</span>
              )}
            </div>
          </div>

          <div className="panel-footer">
            <span className="meta-info">
              Zero PII stored on remote servers &bull; In-memory restoration
            </span>
          </div>
        </div>
      </div>

      {/* Restoration Action Bar */}
      <div className="status-bar-container">
        <div className="status-bar-left">
          <div className="status-shield-icon-wrap">
            <ShieldCheck size={22} className="status-shield-icon" />
          </div>
          <div className="status-message">
            <strong className="status-count-highlight">
              {restoration?.restoredCount || 0} entities
            </strong>{' '}
            safely reunited with original data
          </div>
        </div>

        <div className="status-bar-right">
          <button
            className={`copy-safe-btn ${isCopied ? 'copied' : ''}`}
            onClick={handleCopy}
            disabled={!restoration?.restoredText}
          >
            {isCopied ? (
              <>
                <Check size={16} strokeWidth={2.8} />
                <span>Copied Restored Text!</span>
              </>
            ) : (
              <>
                <Copy size={16} strokeWidth={2.4} />
                <span>Copy restored text</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Vault Mapping Table */}
      {activeSession && activeSession.entities.length > 0 && (
        <div className="table-card">
          <div className="table-header-title">
            <h3>Active Session Vault Mappings ({activeSession.entities.length})</h3>
            <span className="table-subtitle">
              Session ID: <code className="font-mono">{activeSession.id}</code> &bull; AES-256 Protected
            </span>
          </div>

          <div className="entity-table-wrapper">
            <table className="entity-table">
              <thead>
                <tr>
                  <th className="col-type">TYPE</th>
                  <th className="col-placeholder">PLACEHOLDER IN AI</th>
                  <th className="col-arrow"></th>
                  <th className="col-original">RESTORED ORIGINAL VALUE</th>
                  <th className="col-confidence">CONFIDENCE</th>
                </tr>
              </thead>
              <tbody>
                {activeSession.entities.map((entity) => (
                  <tr key={entity.id} className="entity-table-row">
                    <td className="col-type">
                      <Badge type={entity.type} label={entity.type} size="sm" />
                    </td>
                    <td className="col-placeholder">
                      <Badge
                        type={entity.type}
                        label={entity.placeholder}
                        isPlaceholder={true}
                        size="sm"
                      />
                    </td>
                    <td className="col-arrow">
                      <ArrowRight size={14} className="table-arrow-icon" />
                    </td>
                    <td className="col-original">
                      <span className="original-val-text font-mono">
                        {entity.originalValue}
                      </span>
                    </td>
                    <td className="col-confidence">
                      <span className="confidence-text">{entity.confidence}%</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
