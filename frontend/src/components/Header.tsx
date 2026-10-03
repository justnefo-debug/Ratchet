import React from 'react';
import { WifiOff, Sun, Moon, Sliders } from 'lucide-react';
import type { ThemeMode } from '../types';

interface HeaderProps {
  theme: ThemeMode;
  onToggleTheme: () => void;
  onOpenSettings: () => void;
  isBackendConnected?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  theme,
  onToggleTheme,
  onOpenSettings,
  isBackendConnected = false,
}) => {
  return (
    <header className="ratchet-header">
      <div className="header-left">
        {/* Samurai warrior logo provided in Context/logo.jfif */}
        <div className="brand-logo-wrap" title="Ratchet Samurai Privacy Guard">
          <img
            src={theme === 'dark' ? '/samurai_icon_coral.png' : '/samurai_icon_dark.png'}
            alt="Ratchet Samurai Logo"
            className="brand-logo-img"
          />
        </div>

        <div className="brand-text-group">
          <h1 className="brand-title">Ratchet</h1>
          <span className="brand-tagline">Privacy that only tightens</span>
        </div>
      </div>

      <div className="header-right">
        {/* Runs on this device pill badge */}
        <div
          className="device-status-badge"
          title={
            isBackendConnected
              ? 'Connected to local Ratchet backend (Fast NER + Encrypted Vault)'
              : 'Zero-cloud processing: In-browser local engine active. No data leaves your device.'
          }
        >
          <WifiOff className="device-icon" size={15} strokeWidth={2.4} />
          <span className="device-text">Runs on this device</span>
          {isBackendConnected && <span className="backend-dot" title="Python API Active" />}
        </div>

        {/* Theme Toggle (Dark / Light) */}
        <button
          className="header-icon-btn"
          onClick={onToggleTheme}
          title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} mode`}
          aria-label="Toggle color theme"
        >
          {theme === 'dark' ? (
            <Sun size={18} className="theme-toggle-icon" />
          ) : (
            <Moon size={18} className="theme-toggle-icon" />
          )}
        </button>

        {/* Settings & Rules Modal Trigger */}
        <button
          className="header-icon-btn"
          onClick={onOpenSettings}
          title="Configure detection rules, sensitivity & engine"
          aria-label="Open settings"
        >
          <Sliders size={18} />
        </button>
      </div>
    </header>
  );
};
