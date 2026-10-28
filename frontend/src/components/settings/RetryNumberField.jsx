import React from 'react';

/***
 * MARK: RetryNumberField
 * @description One numeric retry/timeout override row: label, number input,
 *   source hint (project override vs global default), help text, and an
 *   inline validation error. Blank means "follow the global default".
 * @param {Object} props
 * @param {string} props.id - Input id (also wires the label).
 * @param {string} props.label - Field label.
 * @param {string|number} props.value - Raw draft value ('' = unset).
 * @param {Function} props.onChange - Change handler receiving the raw string.
 * @param {string} [props.error] - Inline validation message, if any.
 * @param {string} props.help - Static help text (documents the global default).
 * @param {string} [props.placeholder] - Placeholder showing the global default.
 * @param {string} [props.step] - Number-input step ('1' for counts, '0.5' for minute timeouts).
 ***/
export function RetryNumberField({
  id,
  label,
  value,
  onChange,
  error,
  help,
  placeholder,
  step = '1',
}) {
  const isSet = value !== '' && value !== null && value !== undefined;
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-xs font-bold uppercase text-text-muted tracking-wider">
        {label}
      </label>
      <input
        id={id}
        type="number"
        min="0"
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-invalid={Boolean(error)}
        className="p-2.5 bg-surface-container border border-border-standard rounded-sm text-xs font-mono outline-none focus:border-primary transition-colors text-on-surface"
      />
      <p className="text-[10px] text-text-muted">
        {help}{' '}
        <span className="font-semibold">
          {isSet ? 'Source: project override.' : 'Source: global default.'}
        </span>
      </p>
      {error && (
        <p role="alert" className="text-[11px] font-bold text-red-500">
          {error}
        </p>
      )}
    </div>
  );
}
