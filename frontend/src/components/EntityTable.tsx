import React from 'react';
import {
  User,
  Mail,
  CreditCard,
  Key,
  Phone,
  MapPin,
  Globe,
  ShieldAlert,
  ArrowRight,
  Check,
} from 'lucide-react';
import type { DetectedEntity, EntityType } from '../types';
import { Badge } from './Badge';

interface EntityTableProps {
  entities: DetectedEntity[];
  onToggleEntity: (id: string) => void;
  onToggleAll: (selectAll: boolean) => void;
}

export const EntityTable: React.FC<EntityTableProps> = ({
  entities,
  onToggleEntity,
  onToggleAll,
}) => {
  const allSelected = entities.length > 0 && entities.every((e) => e.enabled);

  const getEntityIcon = (type: EntityType) => {
    switch (type) {
      case 'Name':
        return <User size={16} className="entity-row-icon" />;
      case 'Email':
        return <Mail size={16} className="entity-row-icon" />;
      case 'CNIC':
        return <CreditCard size={16} className="entity-row-icon" />;
      case 'API key':
        return <Key size={16} className="entity-row-icon" />;
      case 'Phone':
        return <Phone size={16} className="entity-row-icon" />;
      case 'Credit Card':
        return <CreditCard size={16} className="entity-row-icon" />;
      case 'Address':
        return <MapPin size={16} className="entity-row-icon" />;
      case 'IP Address':
        return <Globe size={16} className="entity-row-icon" />;
      default:
        return <ShieldAlert size={16} className="entity-row-icon" />;
    }
  };

  if (entities.length === 0) {
    return (
      <div className="entity-table-empty">
        <p>No sensitive entities detected yet. Start typing or load a sample preset above.</p>
      </div>
    );
  }

  return (
    <div className="entity-table-wrapper">
      <table className="entity-table">
        <thead>
          <tr>
            <th className="col-checkbox">
              <label
                className="custom-checkbox-wrap"
                title={allSelected ? 'Deselect all items' : 'Select all items'}
              >
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={(e) => onToggleAll(e.target.checked)}
                />
                <span className={`custom-checkbox ${allSelected ? 'checked' : ''}`}>
                  {allSelected && <Check size={12} strokeWidth={3.5} />}
                </span>
              </label>
            </th>
            <th className="col-type">TYPE</th>
            <th className="col-original">ORIGINAL VALUE</th>
            <th className="col-arrow"></th>
            <th className="col-placeholder">PLACEHOLDER</th>
            <th className="col-confidence">CONFIDENCE</th>
          </tr>
        </thead>
        <tbody>
          {entities.map((entity) => {
            return (
              <tr
                key={entity.id}
                className={`entity-table-row ${!entity.enabled ? 'disabled-row' : ''}`}
              >
                {/* Checkbox */}
                <td className="col-checkbox">
                  <label
                    className="custom-checkbox-wrap"
                    title={entity.enabled ? 'Click to unhide (whitelist)' : 'Click to hide (redact)'}
                  >
                    <input
                      type="checkbox"
                      checked={entity.enabled}
                      onChange={() => onToggleEntity(entity.id)}
                    />
                    <span className={`custom-checkbox ${entity.enabled ? 'checked' : ''}`}>
                      {entity.enabled && <Check size={12} strokeWidth={3.5} />}
                    </span>
                  </label>
                </td>

                {/* Icon + Type Badge */}
                <td className="col-type">
                  <div className="type-badge-container">
                    <span className="type-icon-wrapper">{getEntityIcon(entity.type)}</span>
                    <Badge type={entity.type} label={entity.type} size="sm" />
                  </div>
                </td>

                {/* Original Value */}
                <td className="col-original">
                  <span className="original-val-text font-mono" title={entity.originalValue}>
                    {entity.originalValue}
                  </span>
                </td>

                {/* Arrow */}
                <td className="col-arrow">
                  <ArrowRight size={14} className="table-arrow-icon" />
                </td>

                {/* Placeholder Badge */}
                <td className="col-placeholder">
                  <Badge
                    type={entity.type}
                    label={entity.placeholder}
                    isPlaceholder={true}
                    size="sm"
                  />
                </td>

                {/* Confidence */}
                <td className="col-confidence">
                  <span className="confidence-text">{entity.confidence}%</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
