import React from 'react';
import type { ActiveTab } from '../types';

interface TabNavProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  entityCount?: number;
}

interface TabItem {
  id: ActiveTab;
  num: number;
  label: string;
}

const TABS: TabItem[] = [
  { id: 'redact', num: 1, label: 'Redact' },
  { id: 'restore', num: 2, label: 'Restore' },
  { id: 'metrics', num: 3, label: 'Metrics' },
  { id: 'changelog', num: 4, label: 'Changelog' },
];

export const TabNav: React.FC<TabNavProps> = ({ activeTab, onSelectTab }) => {
  return (
    <nav className="tab-nav-container">
      <div className="tab-nav-list" role="tablist">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              className={`tab-btn ${isActive ? 'active' : ''}`}
              onClick={() => onSelectTab(tab.id)}
            >
              <span className={`tab-num-circle ${isActive ? 'active' : ''}`}>
                {tab.num}
              </span>
              <span className="tab-label">{tab.label}</span>
              {isActive && <div className="tab-active-indicator" />}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
