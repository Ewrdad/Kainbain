/**
 * MARK: piExtensionUI
 * @description The pi-specific extension UI context. pi extensions call methods
 *   on `ctx.ui` (notify, select, confirm, …); in headless SDK mode the default
 *   context silently swallows them. This module provides the object KainBain
 *   binds into each pi session so extension output surfaces in the activity
 *   console. The METHOD SHAPE mirrors pi's ExtensionUIContext — that shape is
 *   pi detail, which is why this file lives under the pi harness.
 */

/***
 * MARK: createExtensionUIContext
 * @description Builds a UI context that forwards extension UI output (e.g.
 *   `ctx.ui.notify(...)` from loop-guard, command-timeout-monitor, etc.) to the
 *   event bridge so it surfaces in the KainBain activity console.
 *
 *   In headless SDK mode the default extension UI context is a no-op, so
 *   loop-guard's hits, stage terminations, and timeout alerts are silently
 *   swallowed. Binding this context into each session (via
 *   `session.bindExtensions`) routes those `notify` calls into a visible
 *   `[EXT]` / `[ERROR]` console line instead. It is fire-and-forget and does
 *   NOT touch the LLM context.
 * @param {Object} bridge - The EventBridge instance to forward to.
 * @param {string} [projectId] - The project id to tag forwarded logs with.
 * @returns {Object} An ExtensionUIContext-compatible object.
 **/
export function createExtensionUIContext(bridge, projectId = "") {
	// Map an extension's severity to a log tag. Error-level notifications are
	// surfaced as [ERROR]; everything else as [EXT].
	const levelFromNotifyType = (notifyType) => {
		if (notifyType === "error") return "error";
		if (notifyType === "warning") return "warn";
		return "info";
	};
	const logFromNotify = (message, type) => {
		const text = String(message ?? "").trim();
		if (!text) return;
		const level = levelFromNotifyType(type);
		const tag = level === "error" ? "[ERROR]" : "[EXT]";
		bridge?.emitSystemLog?.(projectId, `${tag} ${text}`, {
			projectId,
			tag,
			level,
		});
	};

	return {
		// ── Interactive methods that KainBain surfaces as console output ──
		notify: (message, type) => {
			logFromNotify(message, type);
		},
		// Everything below is a no-op in the headless context but must exist so
		// extensions that call these methods do not throw.
		select: async () => undefined,
		confirm: async () => false,
		input: async () => undefined,
		onTerminalInput: () => () => {},
		setStatus: () => {},
		setWorkingMessage: () => {},
		setWorkingVisible: () => {},
		setWorkingIndicator: () => {},
		setHiddenThinkingLabel: () => {},
		setWidget: () => {},
		setFooter: () => {},
		setHeader: () => {},
		setTitle: () => {},
		custom: async () => undefined,
		pasteToEditor: () => {},
		setEditorText: () => {},
		getEditorText: () => "",
		editor: async () => undefined,
		addAutocompleteProvider: () => {},
		setEditorComponent: () => {},
		getEditorComponent: () => undefined,
		getAllThemes: () => [],
		getTheme: () => undefined,
		setTheme: () => ({ success: false }),
		getToolsExpanded: () => false,
		setToolsExpanded: () => {},
	};
}