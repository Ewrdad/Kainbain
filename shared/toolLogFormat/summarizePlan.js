import { truncateAtWord } from "./truncateAtWord.js";

export function summarizePlan(record) {
	const event = record && typeof record === "object" ? record : {};
	const steps = Array.isArray(event.steps) ? event.steps : [];
	if (steps.length === 0) return "[PLAN] updated";
	const titles = steps
		.slice(0, 4)
		.map((step) => {
			if (typeof step === "string") return step;
			const title =
				step && typeof step.title === "string" && step.title
					? step.title
					: "step";
			return title;
		})
		.map((title) => truncateAtWord(title, 60));
	const more = steps.length > 4 ? ` (+${steps.length - 4} more)` : "";
	return `[PLAN] ${steps.length} steps: ${titles.join(" — ")}${more}`;
}
