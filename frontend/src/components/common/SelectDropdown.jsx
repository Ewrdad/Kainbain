import React, { useState, useRef, useEffect, useCallback, useId } from 'react';
import { createPortal } from 'react-dom';

/***
 * MARK: normalizeOptions
 * @description Normalizes option objects from either `options` prop or React `<option>`/`<optgroup>` children.
 * @param {Array<Object|string>} options - Option array.
 * @param {React.ReactNode} children - Option child elements.
 * @returns {Array<Object>} Normalized option array.
 * @example normalizeOptions([{ value: '1', label: 'One' }]) => [{ value: '1', label: 'One', disabled: false }]
 ***/
export function normalizeOptions(options = [], children = null) {
  if (Array.isArray(options) && options.length > 0) {
    return options.map((opt) => {
      if (typeof opt === 'string' || typeof opt === 'number') {
        return { value: String(opt), label: String(opt), disabled: false };
      }
      return {
        value: opt.value !== undefined ? String(opt.value) : '',
        label: opt.label !== undefined ? opt.label : String(opt.value || ''),
        group: opt.group || null,
        icon: opt.icon || null,
        badge: opt.badge || null,
        disabled: Boolean(opt.disabled),
        description: opt.description || null,
      };
    });
  }

  if (children) {
    const extracted = [];
    React.Children.forEach(children, (child) => {
      if (!child || !child.props) return;
      if (child.type === 'option') {
        extracted.push({
          value: child.props.value !== undefined ? String(child.props.value) : '',
          label: child.props.children || String(child.props.value || ''),
          disabled: Boolean(child.props.disabled),
        });
      } else if (child.type === 'optgroup') {
        const group = child.props.label;
        React.Children.forEach(child.props.children, (opt) => {
          if (!opt || !opt.props) return;
          extracted.push({
            value: opt.props.value !== undefined ? String(opt.props.value) : '',
            label: opt.props.children || String(opt.props.value || ''),
            group,
            disabled: Boolean(opt.props.disabled),
          });
        });
      }
    });
    return extracted;
  }

  return [];
}

/***
 * MARK: SelectDropdown
 * @description Accessible, dark-themed custom dropdown adhering to DESIGN_SPEC role chromatics,
 * JetBrains Mono typography, full keyboard navigation (Arrow Up/Down, Enter, Space, Escape, Tab),
 * and WAI-ARIA combobox/listbox accessibility patterns.
 *
 * Renders the popup listbox into a React Portal on document.body with fixed coordinates,
 * completely escaping overflow-hidden / overflow-y-auto clipping on stage columns, modals,
 * inspector sidebars, and drawer panels.
 *
 * Features:
 * - React Portal rendering attached to document.body
 * - Viewport-aware auto-flipping (renders above trigger when space below is constrained)
 * - Dynamic repositioning on window scroll (capture phase) and resize
 * - Full ARIA combobox 1.2 compliance with active descendant tracking
 * - JetBrains Mono typography with role chromatic variants
 *
 * @param {Object} props
 * @param {string|number} [props.value] - Currently selected value.
 * @param {Function} props.onChange - Selection change callback `(value, option) => void`.
 * @param {Array<Object|string>} [props.options] - Array of options `{ value, label, group, icon, badge, disabled }`.
 * @param {React.ReactNode} [props.children] - Child `<option>` / `<optgroup>` elements.
 * @param {string} [props.placeholder='Select...'] - Placeholder text when no value selected.
 * @param {string} [props.ariaLabel] - Accessible label for screen readers.
 * @param {string} [props.id] - Element ID.
 * @param {string} [props.name] - Form field name.
 * @param {boolean} [props.disabled=false] - Whether dropdown is disabled.
 * @param {string} [props.variant='default'] - Role chromatic variant ('default' | 'primary' | 'ochre' | 'secondary').
 * @param {string} [props.size='md'] - Sizing ('sm' | 'md' | 'lg').
 * @param {boolean} [props.mono=true] - Use JetBrains Mono font.
 * @param {string} [props.className=''] - Additional class names for trigger container.
 * @example <SelectDropdown value={stageId} onChange={setStageId} options={stages} ariaLabel="Stage Selection" />
 ***/
export function SelectDropdown({
  value = '',
  onChange,
  options = [],
  children,
  placeholder = 'Select...',
  ariaLabel,
  'aria-label': ariaLabelProp,
  id: customId,
  name,
  disabled = false,
  variant = 'default',
  size = 'md',
  mono = true,
  className = '',
}) {
  const autoId = useId();
  const sanitizedAutoId = `select-${autoId.replace(/:/g, '')}`;
  const id = customId || sanitizedAutoId;
  const listboxId = `${id}-listbox`;

  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [portalStyle, setPortalStyle] = useState({
    position: 'fixed',
    top: '0px',
    left: '0px',
    width: 'auto',
    minWidth: '200px',
    maxHeight: '240px',
    zIndex: 9999,
  });

  const containerRef = useRef(null);
  const triggerRef = useRef(null);
  const listboxRef = useRef(null);

  const parsedOptions = normalizeOptions(options, children);
  const stringValue = value !== undefined && value !== null ? String(value) : '';

  const selectedIndex = parsedOptions.findIndex((opt) => opt.value === stringValue);
  const selectedOption = selectedIndex >= 0 ? parsedOptions[selectedIndex] : null;

  // Calculates viewport-relative position for floating listbox with auto-flip
  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 800;
    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1200;
    const gap = 4;
    const maxDropdownHeight = 240;

    const spaceBelow = viewportHeight - rect.bottom;
    const spaceAbove = rect.top;
    const shouldFlip = spaceBelow < maxDropdownHeight && spaceAbove > spaceBelow;

    let top;
    let maxHeight;

    if (shouldFlip) {
      maxHeight = Math.min(maxDropdownHeight, Math.max(60, spaceAbove - gap - 8));
      const measuredHeight = listboxRef.current ? listboxRef.current.offsetHeight : maxHeight;
      const actualHeight = Math.min(measuredHeight, maxHeight);
      top = Math.max(0, rect.top - gap - actualHeight);
    } else {
      maxHeight = Math.min(maxDropdownHeight, Math.max(60, spaceBelow - gap - 8));
      top = Math.max(0, rect.bottom + gap);
    }

    const triggerWidth = rect.width > 0 ? rect.width : 200;
    const dropdownMinWidth = Math.max(triggerWidth, 200);

    let left = rect.left;
    let width = triggerWidth;

    // Mobile full-width override: if viewport is small, expand dropdown to nearly full width
    if (viewportWidth < 640) {
      const margin = 16;
      left = margin;
      width = viewportWidth - margin * 2;
    } else if (left + dropdownMinWidth > viewportWidth - 8) {
      left = Math.max(0, viewportWidth - dropdownMinWidth - 8);
    }
    if (left < 0) {
      left = 0;
    }

    setPortalStyle({
      position: 'fixed',
      top: `${Math.round(top)}px`,
      left: `${Math.round(left)}px`,
      width: `${Math.round(width)}px`,
      minWidth: `${Math.round(dropdownMinWidth)}px`,
      maxHeight: `${Math.round(maxHeight)}px`,
      zIndex: 9999,
    });
  }, []);

  const openDropdown = useCallback(() => {
    if (disabled) return;
    const idx = selectedIndex >= 0 ? selectedIndex : 0;
    setHighlightedIndex(idx);
    updatePosition();
    setIsOpen(true);
  }, [disabled, selectedIndex, updatePosition]);

  const closeDropdown = useCallback(() => {
    setIsOpen(false);
  }, []);

  const toggleDropdown = useCallback(() => {
    if (isOpen) {
      closeDropdown();
    } else {
      openDropdown();
    }
  }, [isOpen, closeDropdown, openDropdown]);

  // Keep portal positioned on scroll (any container) and resize
  useEffect(() => {
    if (!isOpen) return undefined;
    updatePosition();

    const handleScrollOrResize = () => {
      updatePosition();
    };

    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);

    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [isOpen, updatePosition]);

  // Click outside to close dropdown (checks both container and portal listbox)
  useEffect(() => {
    if (!isOpen) return undefined;
    const handleClickOutside = (e) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target) &&
        listboxRef.current &&
        !listboxRef.current.contains(e.target)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Scroll active option into view inside the portal listbox
  useEffect(() => {
    if (isOpen && highlightedIndex >= 0 && listboxRef.current) {
      const activeEl = listboxRef.current.querySelector(`[data-opt-index="${highlightedIndex}"]`);
      activeEl?.scrollIntoView?.({ block: 'nearest' });
    }
  }, [isOpen, highlightedIndex]);

  const handleSelectOption = useCallback(
    (opt) => {
      if (opt.disabled) return;
      setIsOpen(false);
      if (onChange) {
        onChange(opt.value, opt);
      }
      triggerRef.current?.focus();
    },
    [onChange],
  );

  const handleKeyDown = (e) => {
    if (disabled) return;

    switch (e.key) {
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (!isOpen) {
          openDropdown();
        } else if (highlightedIndex >= 0 && highlightedIndex < parsedOptions.length) {
          handleSelectOption(parsedOptions[highlightedIndex]);
        }
        break;

      case 'ArrowDown':
        e.preventDefault();
        if (!isOpen) {
          openDropdown();
        } else {
          setHighlightedIndex((prev) => {
            let next = prev + 1;
            while (next < parsedOptions.length && parsedOptions[next].disabled) {
              next += 1;
            }
            return next < parsedOptions.length ? next : prev;
          });
        }
        break;

      case 'ArrowUp':
        e.preventDefault();
        if (!isOpen) {
          openDropdown();
        } else {
          setHighlightedIndex((prev) => {
            let next = prev - 1;
            while (next >= 0 && parsedOptions[next].disabled) {
              next -= 1;
            }
            return next >= 0 ? next : prev;
          });
        }
        break;

      case 'Home':
        if (isOpen) {
          e.preventDefault();
          const firstNonDisabled = parsedOptions.findIndex((o) => !o.disabled);
          if (firstNonDisabled >= 0) setHighlightedIndex(firstNonDisabled);
        }
        break;

      case 'End':
        if (isOpen) {
          e.preventDefault();
          for (let i = parsedOptions.length - 1; i >= 0; i -= 1) {
            if (!parsedOptions[i].disabled) {
              setHighlightedIndex(i);
              break;
            }
          }
        }
        break;

      case 'Escape':
        if (isOpen) {
          e.preventDefault();
          closeDropdown();
          triggerRef.current?.focus();
        }
        break;

      case 'Tab':
        if (isOpen) {
          closeDropdown();
        }
        break;

      default:
        // Type-ahead jump to matching option
        if (isOpen && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          const char = e.key.toLowerCase();
          const nextIdx = parsedOptions.findIndex(
            (opt, idx) =>
              idx > highlightedIndex &&
              !opt.disabled &&
              String(opt.label).toLowerCase().startsWith(char),
          );
          if (nextIdx >= 0) {
            setHighlightedIndex(nextIdx);
          } else {
            const wrapIdx = parsedOptions.findIndex(
              (opt) => !opt.disabled && String(opt.label).toLowerCase().startsWith(char),
            );
            if (wrapIdx >= 0) setHighlightedIndex(wrapIdx);
          }
        }
        break;
    }
  };

  // Sizing styles
  const sizeClasses =
    {
      sm: 'min-h-[44px] px-2 py-1 text-[10px]',
      md: 'min-h-[44px] px-3 py-1.5 text-xs',
      lg: 'min-h-[44px] px-4 py-2 text-sm',
    }[size] || 'min-h-[44px] px-3 py-1.5 text-xs';

  // Variant border & accent styles
  const variantStyles =
    {
      default: 'border-border-standard focus-visible:border-primary text-on-surface',
      primary: 'border-primary/40 focus-visible:border-primary text-primary font-bold',
      ochre: 'border-ochre/40 focus-visible:border-ochre text-ochre font-bold',
      secondary: 'border-secondary/40 focus-visible:border-secondary text-secondary font-bold',
    }[variant] || 'border-border-standard focus-visible:border-primary text-on-surface';

  const effectiveAriaLabel = ariaLabel || ariaLabelProp || 'Select option';

  return (
    <div
      ref={containerRef}
      className={`relative text-left ${className || 'inline-block'}`}
      data-testid="select-dropdown-container"
    >
      {/* Accessible Trigger Button */}
      <button
        ref={triggerRef}
        type="button"
        id={id}
        name={name}
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-controls={listboxId}
        aria-label={effectiveAriaLabel}
        aria-activedescendant={
          isOpen && highlightedIndex >= 0 ? `${id}-opt-${highlightedIndex}` : undefined
        }
        disabled={disabled}
        onClick={toggleDropdown}
        onKeyDown={handleKeyDown}
        className={`w-full flex items-center justify-between gap-2 bg-surface-container hover:bg-surface-container-high border rounded-sm transition-all duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed outline-none select-none ${sizeClasses} ${variantStyles} ${
          mono ? 'font-mono' : ''
        } ${isOpen ? 'ring-1 ring-primary border-primary' : ''}`}
      >
        <span className="flex items-center gap-2 truncate text-left flex-1 min-w-0">
          {selectedOption?.icon && <span aria-hidden="true">{selectedOption.icon}</span>}
          <span className="truncate">{selectedOption ? selectedOption.label : placeholder}</span>
          {selectedOption?.badge && (
            <span className="px-1.5 py-0.2 rounded text-[9px] bg-primary/20 text-primary border border-primary/30 font-mono shrink-0">
              {selectedOption.badge}
            </span>
          )}
        </span>

        <span
          className={`material-symbols-outlined text-text-muted transition-transform duration-200 text-base shrink-0 select-none ${
            isOpen ? 'rotate-180 text-primary' : ''
          }`}
          aria-hidden="true"
        >
          expand_more
        </span>
      </button>

      {/* Floating Dropdown Listbox rendered via React Portal attached to document.body */}
      {isOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          /* No tabIndex: keyboard flows through the trigger button via
             aria-activedescendant; the popup is never a tab stop (APG). */
          <div
            ref={listboxRef}
            id={listboxId}
            role="listbox"
            aria-label={effectiveAriaLabel}
            style={portalStyle}
            className={`overflow-y-auto custom-scrollbar bg-surface-deep/95 backdrop-blur-md border border-border-standard rounded-sm shadow-2xl py-1 focus:outline-none animate-in fade-in zoom-in-95 duration-100 ${
              mono ? 'font-mono' : ''
            }`}
          >
            {parsedOptions.length === 0 ? (
              <div className="px-3 py-2 text-xs text-text-muted italic">No options</div>
            ) : (
              parsedOptions.map((opt, idx) => {
                const isSelected = opt.value === stringValue;
                const isHighlighted = idx === highlightedIndex;
                const isOptDisabled = opt.disabled;

                return (
                  <React.Fragment key={opt.value || idx}>
                    {/* Group header if changed. The header is NOT an entry in
                        parsedOptions: it is decorative for keyboard flows
                        (navigation/type-ahead only ever match options) while
                        `role="group"` + `aria-label` expose the provider
                        grouping to assistive tech. */}
                    {opt.group && (idx === 0 || parsedOptions[idx - 1]?.group !== opt.group) && (
                      <div
                        role="group"
                        aria-label={opt.group}
                        className="px-3 pt-2 pb-1 text-[9px] font-bold uppercase tracking-wider text-text-muted border-b border-border-standard/40 bg-surface-container/50 select-none"
                      >
                        {opt.group}
                      </div>
                    )}

                    {/* Keyboard flow is container-managed: the trigger button owns
                        Arrow/Home/End/type-ahead via aria-activedescendant, so
                        options intentionally stay unfocusable (WCAG 2.1.1, APG
                        listbox pattern); hover/click are pointer parity only. */}
                    {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/interactive-supports-focus -- see above */}
                    <div
                      id={`${id}-opt-${idx}`}
                      role="option"
                      data-opt-index={idx}
                      aria-selected={isSelected}
                      aria-disabled={isOptDisabled}
                      data-selected={isSelected}
                      onClick={() => handleSelectOption(opt)}
                      onMouseEnter={() => !isOptDisabled && setHighlightedIndex(idx)}
                      className={`flex items-center justify-between gap-2 px-3 py-2 min-h-[44px] text-xs cursor-pointer select-none transition-colors ${
                        isOptDisabled
                          ? 'opacity-30 cursor-not-allowed text-text-muted'
                          : isHighlighted
                            ? 'border-l-4 border-primary pl-2 bg-primary/20 text-primary font-medium'
                            : isSelected
                              ? 'bg-surface-container-high text-on-surface font-semibold'
                              : 'text-on-surface hover:bg-surface-container'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate min-w-0">
                        {opt.icon && <span aria-hidden="true">{opt.icon}</span>}
                        <span className="truncate">{opt.label}</span>
                        {opt.description && (
                          <span className="text-[10px] text-text-muted truncate">
                            ({opt.description})
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {opt.badge && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] bg-primary/20 text-primary border border-primary/30 font-mono">
                            {opt.badge}
                          </span>
                        )}
                        {isSelected && (
                          <span className="text-primary font-bold text-xs" aria-hidden="true">
                            ✓
                          </span>
                        )}
                      </div>
                    </div>
                  </React.Fragment>
                );
              })
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}

export default SelectDropdown;
