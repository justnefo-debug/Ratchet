import React from 'react';
import type { DetectedEntity } from '../types';
import { Badge } from './Badge';

interface EntityHighlightProps {
  text: string;
  entities: DetectedEntity[];
  mode: 'original' | 'placeholder';
  onEntityClick?: (entity: DetectedEntity) => void;
}

export const EntityHighlight: React.FC<EntityHighlightProps> = ({
  text,
  entities,
  mode,
  onEntityClick,
}) => {
  if (!text) {
    return <span className="text-muted">Enter or paste text to see privacy shields in action...</span>;
  }

  // Filter entities: only active entities when in placeholder mode, or all in original
  const activeEntities = (
    mode === 'placeholder' ? entities.filter((e) => e.enabled) : entities
  ).sort((a, b) => a.startIndex - b.startIndex);

  const elements: React.ReactNode[] = [];
  let currentIndex = 0;

  activeEntities.forEach((entity, idx) => {
    // If there's plain text before this entity
    if (entity.startIndex > currentIndex) {
      elements.push(
        <span key={`text-${currentIndex}-${entity.startIndex}`}>
          {text.substring(currentIndex, entity.startIndex)}
        </span>
      );
    }

    // Render the entity badge
    if (mode === 'original') {
      elements.push(
        <Badge
          key={`entity-${entity.id}-${idx}`}
          type={entity.type}
          label={entity.originalValue}
          onClick={() => onEntityClick && onEntityClick(entity)}
          className="inline-text-badge clickable-badge"
        />
      );
    } else {
      elements.push(
        <Badge
          key={`placeholder-${entity.id}-${idx}`}
          type={entity.type}
          label={entity.placeholder}
          isPlaceholder={true}
          onClick={() => onEntityClick && onEntityClick(entity)}
          className="inline-text-badge clickable-badge"
        />
      );
    }

    currentIndex = entity.endIndex;
  });

  // Remaining text after last entity
  if (currentIndex < text.length) {
    elements.push(
      <span key={`text-end-${currentIndex}`}>
        {text.substring(currentIndex)}
      </span>
    );
  }

  return <div className="entity-highlight-container">{elements}</div>;
};
