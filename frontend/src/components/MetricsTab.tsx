import React from 'react';
import {
  ShieldCheck,
  TrendingUp,
  Lock,
  Zap,
  BarChart3,
  Download,
  Clock,
  Layers,
} from 'lucide-react';
import type { SystemMetrics } from '../types';

interface MetricsTabProps {
  metrics: SystemMetrics;
  onExportReport: () => void;
}

export const MetricsTab: React.FC<MetricsTabProps> = ({
  metrics,
  onExportReport,
}) => {
  const entityTypeEntries = Object.entries(metrics.entityTypeCounts).sort(
    (a, b) => b[1] - a[1]
  );

  const maxCount = Math.max(...entityTypeEntries.map(([, count]) => count), 1);

  return (
    <div className="metrics-tab-container">
      {/* Top Controls / Export */}
      <div className="metrics-top-bar">
        <div>
          <h2 className="metrics-main-title">Telemetry & Privacy Shield Metrics</h2>
          <p className="metrics-subtitle">
            All telemetry is strictly aggregated on-device. Zero telemetry packets sent to external servers.
          </p>
        </div>

        <button className="export-report-btn" onClick={onExportReport}>
          <Download size={15} /> Export Audit Log (JSON)
        </button>
      </div>

      {/* 4 Primary Stat Cards */}
      <div className="stats-cards-grid">
        <div className="stat-card">
          <div className="stat-card-icon-wrap shield">
            <ShieldCheck size={22} />
          </div>
          <div className="stat-card-content">
            <span className="stat-label">Total Entities Detected</span>
            <div className="stat-number">{metrics.totalDetected}</div>
            <span className="stat-trend positive">
              <TrendingUp size={12} /> 100% On-Device
            </span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card-icon-wrap lock">
            <Lock size={22} />
          </div>
          <div className="stat-card-content">
            <span className="stat-label">Sensitive Data Redacted</span>
            <div className="stat-number">{metrics.totalRedacted}</div>
            <span className="stat-trend neutral">
              <Zap size={12} /> 0 Leaks Prevented
            </span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card-icon-wrap accuracy">
            <BarChart3 size={22} />
          </div>
          <div className="stat-card-content">
            <span className="stat-label">Average Confidence</span>
            <div className="stat-number">{metrics.accuracyRate}%</div>
            <span className="stat-trend positive">High Precision</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card-icon-wrap sessions">
            <Layers size={22} />
          </div>
          <div className="stat-card-content">
            <span className="stat-label">Active Protected Sessions</span>
            <div className="stat-number">{metrics.sessionsCount}</div>
            <span className="stat-trend neutral">AES-256 Vault</span>
          </div>
        </div>
      </div>

      {/* Charts & Breakdown Grid */}
      <div className="metrics-charts-grid">
        {/* Most Common Entity Types Chart */}
        <div className="metric-chart-card">
          <div className="chart-card-header">
            <h3>Entity Type Frequency</h3>
            <span className="chart-tag">Realtime Breakdown</span>
          </div>

          <div className="bars-list">
            {entityTypeEntries.map(([type, count]) => {
              const percentage = Math.round((count / maxCount) * 100);
              return (
                <div key={type} className="bar-row">
                  <div className="bar-row-meta">
                    <span className="bar-type-name">{type}</span>
                    <span className="bar-count-badge">{count} detected</span>
                  </div>
                  <div className="bar-track">
                    <div
                      className={`bar-fill type-${type.toLowerCase().replace(/[^a-z]/g, '')}`}
                      style={{ width: `${Math.max(percentage, 8)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Protection Health & Engine Status */}
        <div className="metric-chart-card">
          <div className="chart-card-header">
            <h3>Shield Integrity & Defense</h3>
            <span className="chart-tag status-active">Active</span>
          </div>

          <div className="integrity-list">
            <div className="integrity-item">
              <div className="integrity-title-row">
                <span className="integrity-title">Pakistani CNIC Shield</span>
                <span className="integrity-status verified">Active (100%)</span>
              </div>
              <p className="integrity-desc">Validated against NADRA formatting rules.</p>
            </div>

            <div className="integrity-item">
              <div className="integrity-title-row">
                <span className="integrity-title">API Key & Secret Interceptor</span>
                <span className="integrity-status verified">Active (100%)</span>
              </div>
              <p className="integrity-desc">OpenAI, AWS, GitHub, JWT, and generic API keys shielded.</p>
            </div>

            <div className="integrity-item">
              <div className="integrity-title-row">
                <span className="integrity-title">PII & Contact Safeguard</span>
                <span className="integrity-status verified">Active (100%)</span>
              </div>
              <p className="integrity-desc">Full email, phone, and name pattern recognition.</p>
            </div>

            <div className="integrity-item">
              <div className="integrity-title-row">
                <span className="integrity-title">Zero Telemetry Compliance</span>
                <span className="integrity-status verified">Strict Enforced</span>
              </div>
              <p className="integrity-desc">No network calls made without explicit user trigger.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Activity Log Table */}
      <div className="table-card">
        <div className="table-header-title">
          <h3>
            <Clock size={16} /> Recent Shield Activity Log
          </h3>
          <span className="table-subtitle">Session history stored only in browser local storage</span>
        </div>

        {metrics.history.length > 0 ? (
          <div className="entity-table-wrapper">
            <table className="entity-table">
              <thead>
                <tr>
                  <th>TIMESTAMP</th>
                  <th>SESSION ID</th>
                  <th>ENTITIES SHIELDED</th>
                  <th>DETECTED TYPES</th>
                  <th>SAFE PREVIEW</th>
                </tr>
              </thead>
              <tbody>
                {metrics.history.map((item) => (
                  <tr key={item.id} className="entity-table-row">
                    <td className="font-mono text-muted">
                      {new Date(item.timestamp).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </td>
                    <td className="font-mono">{item.id}</td>
                    <td>
                      <span className="history-count-badge">
                        {item.entityCount} entities
                      </span>
                    </td>
                    <td>
                      <div className="types-chips-wrap">
                        {item.types.map((t, idx) => (
                          <span key={idx} className="type-micro-chip">
                            {t}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="safe-preview-snippet text-muted font-mono">
                      {item.safeSnippet.slice(0, 48)}...
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="entity-table-empty">
            <p>No activity recorded yet. Run a redaction to log events.</p>
          </div>
        )}
      </div>
    </div>
  );
};
