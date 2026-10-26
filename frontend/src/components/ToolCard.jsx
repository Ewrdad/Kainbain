import { CONSOLE_CHROME } from './logs/consoleStyles';

/***
 * MARK: formatToolCallArguments
 * @description Formats tool call arguments as `key=value` pairs joined by
 *   commas. Never throws: missing args report "no arguments", values that
 *   JSON cannot stringify (BigInt, circular objects) fall back to a plain
 *   string conversion so one exotic argument cannot break the log stream.
 * @example formatToolCallArguments({ args: { path: 'test.js' } }) // "path=\"test.js\""
 * @example formatToolCallArguments({}) // "no arguments"
 ***/
const formatToolCallArguments = ({ args } = {}) => {
  if (!args || Object.entries(args).length === 0) return 'no arguments';
  return Object.entries(args)
    .map(([argumentName, argumentValue]) => {
      let renderedValue;
      try {
        renderedValue = JSON.stringify(argumentValue);
      } catch {
        renderedValue = null;
      }
      if (typeof renderedValue !== 'string') {
        try {
          renderedValue = String(argumentValue);
        } catch {
          renderedValue = '[unrenderable]';
        }
      }
      return `${argumentName}=${renderedValue}`;
    })
    .join(', ');
};

/***
 * MARK: renderToolCallLogLine
 * @description Coerces one tool log line to displayable text. Backend log
 *   payloads are usually strings but can arrive as numbers, null, or objects;
 *   rendering them raw would crash React, so everything non-string is
 *   converted (objects via JSON with a plain-string fallback).
 * @example renderToolCallLogLine({ logLine: 'file read' }) // "file read"
 * @example renderToolCallLogLine({ logLine: null }) // "null"
 ***/
const renderToolCallLogLine = ({ logLine } = {}) => {
  if (typeof logLine === 'string') return logLine;
  try {
    const asJson = JSON.stringify(logLine);
    if (typeof asJson === 'string') return asJson;
  } catch {
    // Fall through to the plain-string conversion below.
  }
  try {
    return String(logLine);
  } catch {
    return '[unrenderable]';
  }
};

/***
 * MARK: ToolCard
 * @description ToolCard Component
 * Renders the visual representation of a tool execution. When the tool call
 * has not produced logs yet the body renders empty (nothing until output
 * arrives) instead of a stuck "Waiting for output..." placeholder. Missing
 * fields fail safe to empty text — a malformed tool call never crashes the
 * stream (backend payloads may omit `logs` or `id` for in-flight calls).
 * Frame colors come from the shared `CONSOLE_CHROME` so the card sits
 * naturally inside the dark `ActivityConsole` terminal.
 * @example <ToolCard toolCall={{ toolName: 'read', args: { path: 'test.js' }, logs: ['file read'], status: 'completed' }} />
 ***/
export const ToolCard = ({ toolCall = {} }) => {
  const { toolName = 'unknown tool', args, logs = [], status, id = '' } = toolCall || {};

  return (
    <div
      className={`my-4 p-4 ${CONSOLE_CHROME.headerBg} border ${CONSOLE_CHROME.headerBorder} border-l-4 border-l-emerald-500/60 rounded-tr-lg rounded-br-lg shadow-sm group transition-all`}
    >
      <div className="flex justify-between items-center mb-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-emerald-300 font-bold text-xs uppercase tracking-widest font-mono bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-full">
              AGENT 🛠️ {toolName}
            </span>
          </div>
          <div className="text-slate-500 text-[10px] font-mono italic opacity-70">
            {formatToolCallArguments({ args })}
          </div>
        </div>
        <span
          className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-tighter transition-colors border ${
            status === 'completed'
              ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/50'
              : 'bg-slate-800 text-slate-300 border-slate-700'
          }`}
        >
          {status === 'completed' ? 'Completed' : 'Executing...'}
        </span>
      </div>
      <div
        className={`bg-[#05070d] p-3 rounded-sm border ${CONSOLE_CHROME.headerBorder} overflow-x-auto max-h-64 whitespace-pre-wrap font-mono text-xs leading-relaxed`}
      >
        {(logs || []).length > 0
          ? (logs || []).map((log, i) => (
              <div key={i} className="text-slate-300 mb-1 last:mb-0">
                <span className="text-slate-500 mr-2">{i + 1}</span>
                {renderToolCallLogLine({ logLine: log })}
              </div>
            ))
          : null}
      </div>
      <div className="mt-2 flex justify-end">
        <span className="text-[9px] font-mono text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity">
          Tool execution trace {String(id).slice(0, 8)}
        </span>
      </div>
    </div>
  );
};
