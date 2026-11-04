import { QueueOrderList } from './QueueOrderList';

/***
 * MARK: QueueOrderWidget
 * @description Thin wrapper around `QueueOrderList` for the monitor dashboard.
 * Accepts the historical `scheduledQueue` prop (plus `engineState` and
 * `schedulerRunning`) and maps it onto the presentational list's `items`.
 * The shared `QueueOrderList` is the single source for the queue rendering,
 * so this widget never forks its markup.
 * @example <QueueOrderWidget scheduledQueue={queue} engineState={engineState} schedulerRunning={true} />
 ***/
export function QueueOrderWidget(props) {
  const items = Array.isArray(props?.scheduledQueue) ? props.scheduledQueue : props?.items;
  return (
    <QueueOrderList
      {...props}
      items={items}
      scheduledQueue={items}
    />
  );
}

export { QueueOrderList } from './QueueOrderList';

export default QueueOrderWidget;
