/***
 * MARK: KpiCard
 * @description The one KPI card atom every KPI widget is built from: a compact
 *   gradient card with a label row, a headline value with an optional unit,
 *   a sub-line, and a coloured footer bar. The composite KPI Ribbon and the
 *   five atomic KPI widgets all render this exact component, so splitting a
 *   ribbon into atoms cannot drift the visuals.
 *
 *   When `children` is provided it replaces the value/unit/sub block, which is
 *   how the Active Engine card renders its multi-line stage / alias / model
 *   body inside the same shell.
 ***/

/***
 * MARK: KPI_CARD_ACCENTS
 * @description Per-accent class strings, kept verbatim from the original KPI
 *   ribbon so the composite stays pixel-identical after the split.
 ***/
const KPI_CARD_ACCENTS = new Map([
  [
    'emerald',
    {
      card: 'bg-gradient-to-b from-emerald-950/40 to-slate-900/90 border border-emerald-500/30',
      label: 'text-emerald-400',
      value: 'text-emerald-400',
      unit: 'text-[10px] font-mono font-bold text-emerald-300/80',
      bar: 'bg-emerald-500/50',
    },
  ],
  [
    'rose',
    {
      card: 'bg-gradient-to-b from-rose-950/40 to-slate-900/90 border border-rose-500/30',
      // WCAG 1.4.6 AAA (7:1): rose-400 measured 6.69-6.88:1 over this card's
      // gradient; the same-hue step to rose-300 holds 9.5:1+ and rose-200/80
      // 8.4:1+ for the dimmed unit line (locked by observabilityContrast.test.js).
      label: 'text-rose-300',
      value: 'text-rose-300',
      unit: 'text-[10px] font-mono font-bold text-rose-200/80',
      bar: 'bg-rose-500/50',
    },
  ],
  [
    'cyan',
    {
      card: 'bg-gradient-to-b from-cyan-950/40 to-slate-900/90 border border-cyan-500/30',
      label: 'text-cyan-400',
      value: 'text-cyan-400',
      unit: 'text-[10px] font-mono text-cyan-300/80',
      bar: 'bg-cyan-500/50',
    },
  ],
  [
    'amber',
    {
      card: 'bg-gradient-to-b from-amber-950/40 to-slate-900/90 border border-amber-500/30',
      label: 'text-amber-400',
      value: 'text-amber-400',
      unit: 'text-[10px] font-mono text-amber-300/80',
      bar: 'bg-amber-500/50',
    },
  ],
  [
    'indigo',
    {
      card: 'bg-gradient-to-b from-indigo-950/40 to-slate-900/90 border border-indigo-500/30',
      // WCAG 1.4.6 AAA (7:1): indigo-400 measured 6.00-6.08:1 over this card's
      // gradient (the regression the 2026-09-20 register fixed in the ribbon
      // and the atom split reintroduced); indigo-300 holds 9:1+ and
      // indigo-200/80 8:1+ for the dimmed unit line.
      label: 'text-indigo-300',
      value: 'text-indigo-300',
      unit: 'text-[10px] font-mono text-indigo-200/80',
      bar: 'bg-indigo-500/50',
    },
  ],
]);

/***
 * MARK: KpiCard
 * @description Renders one KPI card.
 * @example <KpiCard label="✓ Successes" value={7} unit="(87.5%)" sub="Completed tasks" icon="🏆" accent="emerald" testId="kpi-successes" />
 * @example <KpiCard label="⚙️ Active engine" icon="🤖" accent="indigo" testId="kpi-pipeline"><span>Build</span></KpiCard>
 * @param {Object} props - Card content and styling.
 * @param {string} props.label - Card label (rendered uppercase by CSS).
 * @param {number|string} [props.value] - Headline value.
 * @param {string} [props.unit] - Short unit / rate shown beside the value.
 * @param {string} [props.sub] - Truncated sub-line under the value.
 * @param {string} [props.icon] - Emoji shown opposite the label.
 * @param {'emerald'|'rose'|'cyan'|'amber'|'indigo'} [props.accent] - Colour theme.
 * @param {string} [props.testId] - DOM test id for this card.
 * @param {boolean} [props.footerBar] - Whether to render the coloured footer bar.
 * @param {string} [props.className] - Extra classes (e.g. grid column span).
 * @param {ReactNode} [props.children] - Custom body replacing value/unit/sub.
 * @returns {ReactElement} The card.
 ***/
export function KpiCard({
  label,
  value,
  unit,
  sub,
  icon,
  accent = 'emerald',
  testId,
  footerBar = true,
  className = '',
  children,
}) {
  const styles = KPI_CARD_ACCENTS.get(accent) || KPI_CARD_ACCENTS.get('emerald');
  return (
    <div
      data-testid={testId}
      className={`${styles.card} ${className} rounded-lg px-2 py-1 shadow-md relative overflow-hidden flex flex-col justify-center`}
    >
      <div className="flex items-center justify-between">
        <span className={`text-[9px] font-bold uppercase tracking-wider font-mono ${styles.label}`}>
          {label}
        </span>
        <span className="text-[10px]">{icon}</span>
      </div>

      {children ?? (
        <>
          <div className="flex items-baseline gap-1.5">
            <span className={`text-sm sm:text-base font-black font-mono ${styles.value}`}>
              {value}
            </span>
            {unit && <span className={styles.unit}>{unit}</span>}
          </div>
          <span className="text-[9px] text-slate-300 truncate">{sub}</span>
        </>
      )}

      {footerBar && <div className={`absolute bottom-0 left-0 right-0 h-0.5 ${styles.bar}`} />}
    </div>
  );
}

export default KpiCard;
