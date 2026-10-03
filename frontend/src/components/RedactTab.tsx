import React, { useState } from 'react';
import {
  FileText,
  ShieldCheck,
  Copy,
  Check,
  RotateCcw,
  Sparkles,
  ArrowRightCircle,
  Eye,
  Edit3,
} from 'lucide-react';
import type { DetectedEntity } from '../types';
import { EntityHighlight } from './EntityHighlight';
import { EntityTable } from './EntityTable';

interface RedactTabProps {
  inputText: string;
  onInputChange: (text: string) => void;
  safeText: string;
  entities: DetectedEntity[];
  onToggleEntity: (id: string) => void;
  onToggleAll: (selectAll: boolean) => void;
  onCopySafeText: () => void;
  isCopied: boolean;
  onSendToRestore: () => void;
  onLoadPreset: (presetKey: string) => void;
}

export const RedactTab: React.FC<RedactTabProps> = ({
  inputText,
  onInputChange,
  safeText,
  entities,
  onToggleEntity,
  onToggleAll,
  onCopySafeText,
  isCopied,
  onSendToRestore,
  onLoadPreset,
}) => {
  const [leftViewMode, setLeftViewMode] = useState<'edit' | 'highlight'>('highlight');
  const [rightViewMode, setRightViewMode] = useState<'badges' | 'raw'>('badges');

  const activeHiddenCount = entities.filter((e) => e.enabled).length;

  return (
    <div className="redact-tab-container">
      {/* Quick Preset Prompts Bar */}
      <div className="presets-bar">
        <span className="presets-label">
          <Sparkles size={14} className="sparkle-icon" /> Quick Presets:
        </span>
        <button
          className="preset-chip"
          onClick={() => {
            onLoadPreset('default');
            setLeftViewMode('highlight');
          }}
          title="Load reference design example (M.Nafees)"
        >
          Reference Design (M.Nafees)
        </button>
        <button
          className="preset-chip"
          onClick={() => {
            onLoadPreset('dev');
            setLeftViewMode('highlight');
          }}
          title="Load Developer Secrets & Tokens"
        >
          Developer Secrets & AWS
        </button>
        <button
          className="preset-chip"
          onClick={() => {
            onLoadPreset('pakistan');
            setLeftViewMode('highlight');
          }}
          title="Pakistani Identity & Phone"
        >
          Pakistani CNIC & Mobile
        </button>
        <button
          className="preset-chip secondary"
          onClick={() => onLoadPreset('clear')}
          title="Clear editor"
        >
          <RotateCcw size={12} /> Clear
        </button>
      </div>

      {/* Side-by-Side Dual Panels */}
      <div className="dual-panels-grid">
        {/* Left Panel: Paste your text */}
        <div className="panel-card panel-left">
          <div className="panel-header">
            <div className="panel-title-wrap">
              <FileText size={18} className="panel-icon" />
              <h2 className="panel-title">Paste your text</h2>
            </div>

            <div className="panel-actions">
              <button
                className={`panel-toggle-btn ${leftViewMode === 'edit' ? 'active' : ''}`}
                onClick={() => setLeftViewMode('edit')}
                title="Edit raw text"
              >
                <Edit3 size={13} /> Edit
              </button>
              <button
                className={`panel-toggle-btn ${leftViewMode === 'highlight' ? 'active' : ''}`}
                onClick={() => setLeftViewMode('highlight')}
                title="View detected entity highlights"
              >
                <Eye size={13} /> Highlighted
              </button>
            </div>
          </div>

          <div className="panel-body">
            {leftViewMode === 'edit' ? (
              <textarea
                className="panel-textarea"
                placeholder="Paste or type text containing names, emails, CNICs, or API keys..."
                value={inputText}
                onChange={(e) => onInputChange(e.target.value)}
                rows={7}
                autoFocus
              />
            ) : (
              <div
                className="panel-highlight-box"
                onClick={() => setLeftViewMode('edit')}
                title="Click to edit text"
              >
                <EntityHighlight
                  text={inputText}
                  entities={entities}
                  mode="original"
                  onEntityClick={() => setLeftViewMode('edit')}
                />
              </div>
            )}
          </div>

          <div className="panel-footer">
            <span className="meta-info">
              {inputText.length} characters &bull; {inputText.trim().split(/\s+/).filter(Boolean).length} words
            </span>
            {leftViewMode === 'highlight' && (
              <span className="meta-hint">Click text to edit</span>
            )}
          </div>
        </div>

        {/* Right Panel: Safe version to send */}
        <div className="panel-card panel-right">
          <div className="panel-header">
            <div className="panel-title-wrap">
              <ShieldCheck size={18} className="panel-icon shield-accent" />
              <h2 className="panel-title">Safe version to send</h2>
            </div>

            <div className="panel-actions">
              <button
                className={`panel-toggle-btn ${rightViewMode === 'badges' ? 'active' : ''}`}
                onClick={() => setRightViewMode('badges')}
                title="View safe text with placeholder badges"
              >
                Badges
              </button>
              <button
                className={`panel-toggle-btn ${rightViewMode === 'raw' ? 'active' : ''}`}
                onClick={() => setRightViewMode('raw')}
                title="View raw sanitized text"
              >
                Raw Text
              </button>
            </div>
          </div>

          <div className="panel-body">
            {rightViewMode === 'badges' ? (
              <div className="panel-highlight-box safe-box">
                <EntityHighlight
                  text={inputText}
                  entities={entities}
                  mode="placeholder"
                />
              </div>
            ) : (
              <textarea
                className="panel-textarea font-mono read-only"
                value={safeText}
                readOnly
                rows={7}
              />
            )}
          </div>

          <div className="panel-footer">
            <span className="meta-info">
              Ready to send safely to ChatGPT, Claude, or Gemini
            </span>
            <span className="meta-badge-count">
              {activeHiddenCount} protected tokens
            </span>
          </div>
        </div>
      </div>

      {/* Status Bar */}
      <div className="status-bar-container">
        <div className="status-bar-left">
          <div className="status-shield-icon-wrap">
            <ShieldCheck size={22} className="status-shield-icon" />
          </div>
          <div className="status-message">
            <strong className="status-count-highlight">
              {entities.length} {entities.length === 1 ? 'item' : 'items'}
            </strong>{' '}
            found, {activeHiddenCount === entities.length ? 'all hidden' : `${activeHiddenCount} hidden`}
          </div>
        </div>

        <div className="status-bar-right">
          {entities.length > 0 && (
            <button
              className="send-restore-btn"
              onClick={onSendToRestore}
              title="Save this session to the Restore tab"
            >
              <ArrowRightCircle size={15} /> Send to Restore
            </button>
          )}

          <button
            className={`copy-safe-btn ${isCopied ? 'copied' : ''}`}
            onClick={onCopySafeText}
            disabled={!safeText}
            title="Copy safe text to clipboard"
          >
            {isCopied ? (
              <>
                <Check size={16} strokeWidth={2.8} />
                <span>Copied to Clipboard!</span>
              </>
            ) : (
              <>
                <Copy size={16} strokeWidth={2.4} />
                <span>Copy safe text</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Entity Summary Table */}
      <div className="table-card">
        <EntityTable
          entities={entities}
          onToggleEntity={onToggleEntity}
          onToggleAll={onToggleAll}
        />
      </div>
    </div>
  );
};
