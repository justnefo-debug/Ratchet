import React from 'react';
import type { EntityType } from '../types';

interface BadgeProps {
  type: EntityType | string;
  label?: string;
  isPlaceholder?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  onClick?: () => void;
}

export const Badge: React.FC<BadgeProps> = ({
  type,
  label,
  isPlaceholder = false,
  size = 'md',
  className = '',
  onClick,
}) => {
  const normalizedType = type.toLowerCase();

  let colorClass = 'badge-name';
  if (normalizedType.includes('email')) {
    colorClass = 'badge-email';
  } else if (normalizedType.includes('cnic')) {
    colorClass = 'badge-cnic';
  } else if (normalizedType.includes('api') || normalizedType.includes('key')) {
    colorClass = 'badge-key';
  } else if (normalizedType.includes('phone')) {
    colorClass = 'badge-phone';
  } else if (normalizedType.includes('card')) {
    colorClass = 'badge-card';
  } else if (normalizedType.includes('ip')) {
    colorClass = 'badge-ip';
  } else if (normalizedType.includes('custom')) {
    colorClass = 'badge-custom';
  }

  const displayText = label || type;

  return (
    <span
      onClick={onClick}
      className={`ratchet-badge ${colorClass} ${size} ${isPlaceholder ? 'placeholder' : ''} ${className}`}
      title={isPlaceholder ? `Protected placeholder: ${displayText}` : `Detected entity: ${type}`}
    >
      {displayText}
    </span>
  );
};
