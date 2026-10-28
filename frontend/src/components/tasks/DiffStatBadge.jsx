import React from 'react';
import { formatDiffStat } from './taskFormatters';

export function DiffStatBadge({ entry }) {
  if (!formatDiffStat(entry)) return null;
  return (
    <>
      {' • '}
      <span
        className="font-mono"
        title={`${entry.additions} lines added, ${entry.deletions} lines removed`}
      >
        <span className="text-primary font-bold">+{entry.additions}</span>{' '}
        <span className="text-error">-{entry.deletions}</span>
      </span>
    </>
  );
}
