import { InfoTooltip } from '../common/InfoTooltip';

/***
 * MARK: MonitorPopoutButton
 * @description Header button that opens the Telemetry & Observability
 *   Cockpit in a dedicated popout window (left-click, unchanged). A
 *   right-click (or keyboard Shift+F10, which raises `contextmenu`
 *   natively) opens the compact logs-only monitor in the same tab
 *   instead — no popout, no extra route. On mobile the popout is
 *   replaced by a visible compact-monitor button (phones have no second
 *   monitor, and the compact view is automatic on narrow viewports), so
 *   the monitor stays reachable with one tap.
 * @param {Object} props
 * @param {Function} [props.onOpenPopout] - Left-click: open the popout window.
 * @param {Function} [props.onOpenCompact] - Right-click (desktop) or tap (mobile): open the compact view.
 * @example <MonitorPopoutButton onOpenPopout={openPopout} onOpenCompact={openCompact} />
 ***/
export function MonitorPopoutButton({ onOpenPopout = () => {}, onOpenCompact = () => {} }) {
  const handleContextMenu = (event) => {
    event.preventDefault();
    onOpenCompact();
  };

  return (
    <>
      <InfoTooltip
        title="Popout Observability Screen"
        className="hidden sm:flex"
        description="Opens the Telemetry & Observability Cockpit in a dedicated popout window for multi-monitor setups or kiosks. Right-click (or Shift+F10) for the compact logs-only view in this tab."
        behindTheScenes="Launches a zero-touch window streaming live task queue and LiteLLM latency stats"
        shortcut="4 or O"
        position="bottom-left"
      >
        <button
          type="button"
          onClick={onOpenPopout}
          onContextMenu={handleContextMenu}
          className="px-2 sm:px-2.5 py-1.5 min-h-[44px] rounded-sm bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant hover:text-primary transition-colors flex items-center justify-center gap-1.5 text-xs font-bold font-mono cursor-pointer"
          aria-label="Open Observability Screen in Popout Window"
          title="Open monitor popout (left-click) or compact logs view (right-click)"
        >
          <span>📡</span>
          {/* Label waits for 2xl: with remote + app link present the full
              labeled row needs ~1333px, so at xl=1280 it overlaps the app
              cluster — task 66ad153f guard. Icon + tooltip below that. */}
          <span className="hidden 2xl:inline font-label-caps text-[10px] uppercase">Monitor</span>
          <span className="text-[10px] text-primary">↗</span>
        </button>
      </InfoTooltip>
      {/* Mobile entry: a single tap opens the compact logs-only monitor in
          this tab. Visible below `sm`, where the popout above is hidden. */}
      <button
        type="button"
        onClick={onOpenCompact}
        className="flex sm:hidden px-2 py-1.5 min-h-[44px] min-w-[44px] rounded-sm bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant hover:text-primary transition-colors items-center justify-center text-xs font-bold font-mono cursor-pointer"
        aria-label="Open Compact Monitor Logs View"
        title="Open compact logs monitor"
      >
        <span aria-hidden="true">📡</span>
      </button>
    </>
  );
}

export default MonitorPopoutButton;
