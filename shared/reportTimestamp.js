/***
 * MARK: parseReportTimestamp
 * @description Reads ISO dates and report filename dates. Dashed filename dates use
 * the writer's local time convention; compact dates ending in Z are UTC.
 * Invalid calendar dates return null instead of rolling into another month.
 * @example parseReportTimestamp('plan-20260101T000010Z.md') => '2026-01-01T00:00:10.000Z'
 ***/
export function parseReportTimestamp(value) {
 if (typeof value !== "string" || !value) return null;
 const match = value.match(
  /(?:^|-)(\d{4})(\d{2})(\d{2})([-T])(\d{2})(\d{2})(\d{2})(Z?)(?:\.md)?$/,
 );
 if (!match) {
  // Do not let Date.parse guess the meaning of arbitrary filenames/numbers.
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value)) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
 }
 const [, year, month, day, , hour, minute, second, zone] = match;
 const parts = [
  Number(year),
  Number(month) - 1,
  Number(day),
  Number(hour),
  Number(minute),
  Number(second),
 ];
 const date = zone ? new Date(Date.UTC(...parts)) : new Date(...parts);
 const actual = zone
  ? [
     date.getUTCFullYear(),
     date.getUTCMonth(),
     date.getUTCDate(),
     date.getUTCHours(),
     date.getUTCMinutes(),
     date.getUTCSeconds(),
    ]
  : [
     date.getFullYear(),
     date.getMonth(),
     date.getDate(),
     date.getHours(),
     date.getMinutes(),
     date.getSeconds(),
    ];
 return actual.every((part, index) => part === parts[index])
  ? date.toISOString()
  : null;
}

/***
 * MARK: reportCreatedAt
 * @description Prefers recoverable filename evidence over old task.updatedAt
 * placeholders. Keeps precise createdAt when it agrees with the filename second.
 * @example reportCreatedAt({ filename: 'plan-20260101T000010Z.md' }) => '2026-01-01T00:00:10.000Z'
 ***/
export function reportCreatedAt(report) {
 const filenameTime =
  parseReportTimestamp(report.filename) ||
  parseReportTimestamp(report.timestamp);
 const createdAt = parseReportTimestamp(report.createdAt);
 if (!filenameTime) return createdAt;
 if (
  createdAt &&
  Math.floor(Date.parse(createdAt) / 1000) ===
   Math.floor(Date.parse(filenameTime) / 1000)
 )
  return createdAt;
 return filenameTime;
}
