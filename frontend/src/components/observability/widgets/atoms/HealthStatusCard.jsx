import { healthStatusDotClass, healthStatusLabel } from '../healthStatus';

/***
 * MARK: HealthStatusCard
 * @description The one subsystem health card atom every health widget is built
 *   from: a bordered card with a title, a coloured status dot, a headline with
 *   a note, and a truncating message. The composite System Health widget and
 *   the five atomic health widgets all render this exact component, so the
 *   split cannot drift the visuals.
 ***/

/***
 * MARK: HealthStatusCard
 * @description Renders one subsystem status card.
 * @example <HealthStatusCard title="LiteLLM Proxy" status="ok" headline="35 ms" headlineNote="Response Latency" message="LiteLLM reachable" testId="health-litellm" />
 * @param {Object} props - Card content.
 * @param {string} props.title - Uppercase subsystem title.
 * @param {string} [props.status] - Raw status driving the dot colour.
 * @param {string} [props.neutral] - Dot colour for unknown statuses.
 * @param {string} [props.headline] - Large headline value.
 * @param {string} [props.headlineNote] - Small note beside the headline.
 * @param {string} [props.message] - Truncated explanatory line.
 * @param {string} [props.testId] - DOM test id for this card.
 * @param {string} [props.headlineClassName] - Extra headline classes (e.g. `capitalize`).
 * @param {string} [props.className] - Extra classes (e.g. `flex-1` to fill a widget body).
 * @returns {ReactElement} The card.
 ***/
export function HealthStatusCard({
  title,
  status,
  neutral,
  headline,
  headlineNote,
  headlineClassName = '',
  message,
  testId,
  className = '',
}) {
  return (
    <div
      data-testid={testId}
      className={`p-3 bg-slate-900/90 rounded-md border border-slate-800 flex flex-col justify-between ${className}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase text-slate-400">{title}</span>
        {/* The dot is colour-only (1.4.1); its word carries the same state to
            every user, visually hidden so the card's design is unchanged. */}
        <span className="flex items-center gap-1.5">
          <span className="sr-only">Status: {healthStatusLabel(status)}</span>
          <span
            aria-hidden="true"
            className={`w-2.5 h-2.5 rounded-full ${healthStatusDotClass(status, neutral)}`}
          />
        </span>
      </div>
      <div className="mt-2 flex items-baseline justify-between">
        <span className={`text-lg font-bold text-slate-100 ${headlineClassName}`}>{headline}</span>
        <span className="text-[10px] text-slate-400">{headlineNote}</span>
      </div>
      <p className="text-[10px] text-slate-400 mt-1 truncate">{message}</p>
    </div>
  );
}

export default HealthStatusCard;
