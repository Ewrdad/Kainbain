import React, { useState, useRef, useEffect, useCallback, useId } from 'react';
import { createPortal } from 'react-dom';
import { isInteractiveTarget, prefersTouchInput } from '../../hooks/useTapGuard';

/***
 * MARK: InfoTooltip
 * @description Accessible, rich interactive tooltip and help popover component.
 * Provides passive user education by explaining system concepts, behind-the-scenes
 * engine actions, keyboard shortcuts, and helpful tips.
 *
 * Supports both inline info icon trigger or wrapping arbitrary children.
 * Accessible via keyboard focus (Tab), mouse hover, and click/tap to lock open.
 *
 * On coarse-pointer (touch) devices, popovers open only from non-interactive
 * taps: tapping a button, dropdown, or input wrapped by this component actuates
 * that control and never opens the popover, so dropdown menus are never covered.
 * A tap on a non-button region pins the popover open (tap again or tap outside
 * to dismiss). Desktop hover/focus behaviour is unchanged.
 *
 * The popover is rendered into a React Portal attached to document.body with
 * fixed viewport coordinates, so it is never clipped by overflow-hidden ancestors
 * (stage columns, task cards, drawers, modals). It repositions on scroll/resize
 * and auto-flips to stay on-screen.
 *
 * Hover reveal is intentionally delayed (HOVER_DELAY_MS) so tooltips do not pop
 * up the instant the pointer touches a control.
 *
 * @param {Object} props
 * @param {string} [props.title] - Concept or control name.
 * @param {string} [props.description] - Concise explanation of what this control or feature does.
 * @param {string} [props.behindTheScenes] - Technical details of what the system does under the hood.
 * @param {string} [props.shortcut] - Keyboard shortcut hint (e.g. "Alt+Left", "Ctrl+Enter").
 * @param {string} [props.tip] - Helpful advice or usage tip.
 * @param {string} [props.position='auto'] - 'top' | 'bottom' | 'left' | 'right' | 'auto'.
 * @param {string} [props.size='md'] - 'sm' | 'md' | 'lg'.
 * @param {React.ReactNode} [props.children] - Optional custom trigger element. If omitted, renders an accessible info icon.
 * @param {string} [props.className] - Additional trigger container styling classes.
 * @param {string} [props.panelClassName] - Additional popover panel styling classes.
 * @param {boolean} [props.inline=true] - Whether to render as inline-flex.
 * @example <InfoTooltip title="Human Checkpoint" description="Pauses workflow for review" behindTheScenes="Halts task scheduler until approved or rejected with feedback" />
 ***/
export function InfoTooltip({
  title,
  description,
  behindTheScenes,
  shortcut,
  tip,
  position = 'auto',
  size = 'md',
  children,
  className = '',
  panelClassName = '',
  inline = true,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const containerRef = useRef(null);
  const popoverRef = useRef(null);
  const hoverTimeoutRef = useRef(null);
  const popoverId = useId();

  // Mobile tap policy (task e2cf55ac): touch-primary devices never open the
  // popover from emulated hover or focus on an interactive control — taps must
  // actuate the wrapped button/dropdown, not pop a popup over it. The flag is
  // read once per render via the injectable detector in useTapGuard.
  const isTouch = prefersTouchInput();
  const hasChildren = Boolean(children);

  // Portal positioning state
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const [ready, setReady] = useState(false);

  const shouldShow = isOpen || isPinned;

  /***
   * MARK: computePlacement
   * @description Resolves the effective popover placement, honoring an explicit
   *   `position` prop or auto-flipping based on the trigger's viewport location.
   * @returns {string} One of 'top' | 'top-right' | 'top-left' | 'bottom' | 'bottom-right' | 'bottom-left' | 'left' | 'right'.
   ***/
  const computePlacement = useCallback(() => {
    if (!containerRef.current) return 'top';
    const rect = containerRef.current.getBoundingClientRect();
    const windowWidth = typeof window !== 'undefined' ? window.innerWidth : 1200;

    if (position !== 'auto') return position;

    let next = rect.top < 220 ? 'bottom' : 'top';
    if (rect.left < 160) {
      next = next === 'bottom' ? 'bottom-right' : 'top-right';
    } else if (windowWidth - rect.right < 160) {
      next = next === 'bottom' ? 'bottom-left' : 'top-left';
    }
    return next;
  }, [position]);

  /***
   * MARK: updatePosition
   * @description Measures the trigger and popover, then computes fixed viewport
   *   coordinates for the portal so it never overflows the window or gets clipped.
   * @example updatePosition()
   ***/
  const updatePosition = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const windowWidth = typeof window !== 'undefined' ? window.innerWidth : 1200;
    const windowHeight = typeof window !== 'undefined' ? window.innerHeight : 800;
    const p = computePlacement();
    const popover = popoverRef.current;
    const pw = popover ? popover.offsetWidth : 288;
    const ph = popover ? popover.offsetHeight : 160;
    const gap = 8;

    let top = 0;
    let left = 0;
    switch (p) {
      case 'top':
        top = rect.top - ph - gap;
        left = rect.left + rect.width / 2 - pw / 2;
        break;
      case 'top-right':
        top = rect.top - ph - gap;
        left = rect.left;
        break;
      case 'top-left':
        top = rect.top - ph - gap;
        left = rect.right - pw;
        break;
      case 'bottom':
        top = rect.bottom + gap;
        left = rect.left + rect.width / 2 - pw / 2;
        break;
      case 'bottom-right':
        top = rect.bottom + gap;
        left = rect.left;
        break;
      case 'bottom-left':
        top = rect.bottom + gap;
        left = rect.right - pw;
        break;
      case 'left':
        top = rect.top + rect.height / 2 - ph / 2;
        left = rect.left - pw - gap;
        break;
      case 'right':
        top = rect.top + rect.height / 2 - ph / 2;
        left = rect.right + gap;
        break;
      default:
        top = rect.bottom + gap;
        left = rect.left + rect.width / 2 - pw / 2;
    }

    // Clamp within the viewport so the popover is never cut off at screen edges.
    top = Math.max(8, Math.min(top, windowHeight - ph - 8));
    left = Math.max(8, Math.min(left, windowWidth - pw - 8));

    setCoords({ top, left });
    setReady(true);
  }, [computePlacement]);

  // Position on open and keep it anchored while scrolling/resizing.
  useEffect(() => {
    if (!shouldShow) return undefined;
    updatePosition();
    const handle = () => updatePosition();
    window.addEventListener('scroll', handle, true);
    window.addEventListener('resize', handle);
    return () => {
      window.removeEventListener('scroll', handle, true);
      window.removeEventListener('resize', handle);
    };
  }, [shouldShow, updatePosition]);

  // Re-measure when content changes so the popover stays correctly placed.
  useEffect(() => {
    if (shouldShow) updatePosition();
  }, [shouldShow, updatePosition, title, description, behindTheScenes, tip]);

  // Click outside to dismiss pinned tooltip
  useEffect(() => {
    if (!isPinned) return undefined;
    const handleOutsideClick = (e) => {
      const inTrigger = containerRef.current && containerRef.current.contains(e.target);
      const inPopover = popoverRef.current && popoverRef.current.contains(e.target);
      if (!inTrigger && !inPopover) {
        setIsPinned(false);
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsPinned(false);
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isPinned]);

  const handleMouseEnter = () => {
    if (isTouch) {
      // Touch devices emit an emulated mouseenter on every tap; tap-to-pin is
      // the only touch affordance, so hover must never schedule an open (a
      // scheduled open would ghost-re-open after a second tap unpins).
      return;
    }
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => {
      setReady(false);
      setIsOpen(true);
    }, HOVER_DELAY_MS);
  };

  const handleMouseLeave = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    if (!isPinned) {
      hoverTimeoutRef.current = setTimeout(() => {
        setIsOpen(false);
      }, HIDE_DELAY_MS);
    }
  };

  const handleFocus = (e) => {
    // Tapping a wrapped button/input gives it focus; on touch that focus must
    // actuate the control, not pop a popover on top of its dropdown menu.
    if (isTouch && hasChildren && isInteractiveTarget(e?.target)) return;
    setReady(false);
    setIsOpen(true);
  };

  const handleBlur = (e) => {
    if (!containerRef.current?.contains(e.relatedTarget) && !isPinned) {
      setIsOpen(false);
    }
  };

  /***
   * MARK: togglePinned
   * @description Shared pin/unpin state toggle so every open affordance (ⓘ icon
   *   click, keyboard Enter/Space, mobile non-interactive tap) leaves the
   *   footer/hint copy truthful about the pinned state.
   ***/
  const togglePinned = () => {
    setReady(false);
    setIsPinned((prev) => !prev);
    setIsOpen((prev) => !prev);
  };

  const handleClick = (e) => {
    e.stopPropagation();
    togglePinned();
  };

  /***
   * MARK: handleContainerClick
   * @description Mobile tap affordance for wrapped triggers: a tap on a
   *   NON-interactive region pins the popover open and stops bubbling, so the
   *   surrounding card does not also open the inspector. Taps on buttons,
   *   dropdowns, and inputs are ignored here so the control actuates itself
   *   (the tap keeps bubbling for ancestors that need it). Desktop clicks are
   *   untouched — hover/focus remain the only desktop openers.
   * @param {React.MouseEvent} e
   ***/
  const handleContainerClick = (e) => {
    if (!hasChildren || !isTouch) return;
    if (isInteractiveTarget(e.target)) return;
    e.stopPropagation();
    togglePinned();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      setReady(false);
      setIsPinned((prev) => !prev);
      setIsOpen((prev) => !prev);
    } else if (e.key === 'Escape') {
      setIsPinned(false);
      setIsOpen(false);
    }
  };

  // Size width classes
  const widthClasses =
    {
      sm: 'w-60',
      md: 'w-72 sm:w-80',
      lg: 'w-80 sm:w-96',
    }[size] || 'w-72 sm:w-80';

  // Container clicks only pin the popover on touch devices over
  // non-interactive regions (desktop: hover/focus; keyboard: the trigger
  // button). The default trigger is a real button; wrapped children keep
  // their own semantics — this wrapper adds no new function (WCAG 2.1.1).
  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- see above; focus/blur parity via handleFocus/handleBlur
    <div
      ref={containerRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onClick={handleContainerClick}
      className={`relative ${inline ? 'inline-flex items-center' : 'flex'} ${className}`}
    >
      {/* Trigger element: either user children or default info icon button */}
      {children ? (
        children
      ) : (
        // WCAG 2.5.8 (AAA): the default trigger hit area is 44x44px; the
        // glyph itself stays small so inline help icons keep the text flow.
        <button
          type="button"
          aria-label={title ? `Learn more about ${title}` : 'Help and system information'}
          aria-haspopup={isPinned ? 'dialog' : undefined}
          aria-expanded={shouldShow}
          aria-describedby={!isPinned ? popoverId : undefined}
          onClick={handleClick}
          onKeyDown={handleKeyDown}
          className="inline-flex items-center justify-center min-w-[44px] min-h-[44px] p-1 rounded-full bg-surface-container text-text-muted hover:text-primary hover:bg-surface-container-high border border-border-standard text-[10px] font-bold font-mono transition-colors cursor-help focus:outline-none focus:ring-1 focus:ring-primary select-none shrink-0"
        >
          ⓘ
        </button>
      )}

      {/* Floating Info Popover rendered via React Portal. Targeted into the
          app's top-level <main id="main-content"> landmark (falling back to
          document.body) so open popover content stays contained by a landmark
          (axe "region" rule). Position stays pixel-identical: the popover is
          position:fixed, which resolves against the viewport, and ancestors'
          overflow:hidden never clips fixed elements. */}
      {shouldShow &&
        createPortal(
          // eslint-disable-next-line jsx-a11y/click-events-have-key-events -- propagation guard only; popover content has no click function
          <div
            ref={popoverRef}
            id={popoverId}
            role={isPinned ? 'dialog' : 'tooltip'}
            aria-label={isPinned ? title || 'System Guide' : undefined}
            style={{
              position: 'fixed',
              top: `${Math.round(coords.top)}px`,
              left: `${Math.round(coords.left)}px`,
              zIndex: 9999,
              visibility: ready ? 'visible' : 'hidden',
            }}
            className={`${widthClasses} p-3 rounded-md bg-[#0f172a] border border-emerald-500/40 text-slate-100 shadow-[0_10px_25px_-5px_rgba(0,0,0,0.8),0_0_15px_rgba(16,185,129,0.15)] z-[60] text-left text-xs font-sans animate-in fade-in zoom-in-95 duration-150 backdrop-blur-md pointer-events-auto select-text ${panelClassName}`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Popover Header */}
            <div className="flex items-start justify-between gap-2 pb-2 mb-2 border-b border-slate-800">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-emerald-400 text-sm select-none" aria-hidden="true">
                  💡
                </span>
                <div
                  role="heading"
                  aria-level="2"
                  className="font-bold text-xs font-mono uppercase tracking-wider text-emerald-300 truncate"
                >
                  {title || 'How this works'}
                </div>
              </div>

              {shortcut && (
                <span
                  className="px-1.5 py-0.2 rounded font-mono text-[9px] font-bold bg-slate-900 text-cyan-300 border border-slate-700 select-none shrink-0"
                  title={`Keyboard shortcut: ${shortcut}`}
                >
                  {shortcut}
                </span>
              )}
            </div>

            {/* Body: Description */}
            {description && (
              <p className="text-[11px] leading-relaxed text-slate-200 mb-2 font-normal">
                {description}
              </p>
            )}

            {/* Body: Behind the Scenes Operation */}
            {behindTheScenes && (
              <div className="p-2 rounded bg-slate-900/90 border border-slate-800 text-[10px] font-mono text-slate-200 space-y-1 mb-2">
                <div className="text-[9px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1">
                  <span>⚙️</span>
                  <span>Behind the Scenes:</span>
                </div>
                <p className="leading-normal text-slate-200">{behindTheScenes}</p>
              </div>
            )}

            {/* Body: Pro Tip */}
            {tip && (
              <div className="text-[10px] text-amber-300 flex items-start gap-1 font-mono pt-1">
                <span className="shrink-0">💡</span>
                <span className="leading-tight">{tip}</span>
              </div>
            )}

            {/* Popover Footer: Pinned indicator / dismiss */}
            <div className="flex items-center justify-between pt-2 mt-1 border-t border-slate-800/60 text-[9px] font-mono text-slate-300">
              <span>
                {isPinned ? '📌 Pinned (Click outside to close)' : 'Hover or focus to view'}
              </span>
              {/* WCAG 2.5.8 (AAA): dismiss action meets the 44px minimum. */}
              <button
                type="button"
                onClick={() => {
                  setIsPinned(false);
                  setIsOpen(false);
                }}
                className="min-w-[44px] min-h-[44px] px-3 py-2 text-slate-200 hover:text-white cursor-pointer uppercase font-bold"
              >
                Close
              </button>
            </div>
          </div>,
          document.getElementById('main-content') || document.body,
        )}
    </div>
  );
}

/***
 * MARK: HOVER_DELAY_MS
 * @description Delay before a hover-triggered tooltip appears. Kept deliberately
 *   long so popovers do not flash open the instant the pointer touches a control.
 ***/
export const HOVER_DELAY_MS = 1000;

/***
 * MARK: HIDE_DELAY_MS
 * @description Grace period before a hover-triggered tooltip hides after the
 *   pointer leaves, so moving between the trigger and the popover does not flicker.
 ***/
export const HIDE_DELAY_MS = 150;

export default InfoTooltip;
