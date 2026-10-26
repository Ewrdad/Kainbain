import { expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Shared a11y scan helpers for the canary accessibility suite.
 *
 * Extracted (task ae49090e, Phase 1.2) so the view/state matrix can be
 * generated without duplicating the axe + contrast-walk invocation. Every
 * scanned surface runs BOTH instruments:
 * 1. axe-core at the wcag2a…wcag22aaa + best-practice tag set.
 * 2. A computed in-page AAA text-contrast walk (>= 7:1 normal / >= 4.5:1
 *    large text), skipping unmeasurable surfaces honestly.
 */

export const WCAG_TAGS = [
	"wcag2a",
	"wcag2aa",
	"wcag2aaa",
	"wcag21a",
	"wcag21aa",
	"wcag21aaa",
	"wcag22aa",
	"wcag22aaa",
	"best-practice",
];
// Why this exact list: it is the tag set the certificate (WCAG_CERTIFICATE_2026-10-25)
// was issued against. Adding or removing a tag changes what "clean" means for
// every scanned view, so a tag change must be followed by a full canary re-run
// (`npm run test:canary -- accessibility.spec.js`) and a register addendum —
// never edited as a drive-by.

/**
 * MARK: scanAxeViolations
 * @description Runs axe-core at the full WCAG 2.2 AAA tag set on the current
 *   page. Waits for fonts + the build badge to settle before measuring so a
 *   transient reflow does not produce a false overlap violation. Never throws
 *   on an empty page: axe returns zero violations and the caller asserts.
 * @example const axeViolations = await scanAxeViolations(page);
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Array>} axe violations
 */
export async function scanAxeViolations(page) {
	await page
		.evaluate(() => document.fonts?.ready)
		.catch(() => {});
	await page
		.getByTestId("build-badge")
		.waitFor({ state: "visible", timeout: 15000 })
		.catch(() => {});
	const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
	return results.violations ?? [];
}

/**
 * MARK: formatViolations
 * @description Compact violation descriptor for failure messages. Tolerates
 *   malformed axe output (missing nodes array, string targets) so a strange
 *   rule result still fails readably instead of crashing the formatter.
 * @example formatViolations(axeViolations) => [{ id, impact, help, nodes }]
 * @param {Array} violations
 * @returns {Array<{id:string,impact:string,help:string,nodes:Array}>}
 */
export function formatViolations(violations) {
	return (violations ?? []).map((violation) => ({
		id: violation?.id,
		impact: violation?.impact,
		help: violation?.help,
		nodes: (violation?.nodes ?? []).map((node) => ({
			target: Array.isArray(node?.target)
				? node.target.join(" ")
				: String(node?.target ?? ""),
			summary: node?.failureSummary,
		})),
	}));
}

/**
 * MARK: contrastViolations
 * @description In-page computed contrast audit. For every element holding a
 *   direct non-whitespace text node, composites the effective text colour and
 *   the effective background (alpha layers, bottom-up), then asserts WCAG
 *   1.4.6 AAA: >= 7:1 normal text, >= 4.5:1 large text (>= 24px, or >=
 *   18.66px bold). Skips elements that cannot be measured honestly: hidden/
 *   clipped (sr-only) nodes, disabled controls (exempt), gradient background
 *   or gradient text-clip, and zero-size nodes. Returning `null` from the
 *   background walk means "not measurable" and the node is skipped, never
 *   false-passed.
 * @example const badPairs = await contrastViolations(page);
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Array<{target:string,ratio:number,required:number}>>}
 */
export async function contrastViolations(page) {
	return page.evaluate(() => {
		const parseCssColor = (value) => {
			const match = String(value || "").match(/rgba?\(([^)]+)\)/);
			if (!match) return null;
			const parts = match[1].split(",").map((part) => parseFloat(part.trim()));
			if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) return null;
			return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
		};
		const linearizeChannel = (channel) => {
			const normalized = channel / 255;
			return normalized <= 0.03928
				? normalized / 12.92
				: Math.pow((normalized + 0.055) / 1.055, 2.4);
		};
		const luminance = ({ r, g, b }) =>
			0.2126 * linearizeChannel(r) +
			0.7152 * linearizeChannel(g) +
			0.0722 * linearizeChannel(b);
		const contrastRatio = (foreground, background) => {
			const lighter = Math.max(luminance(foreground), luminance(background));
			const darker = Math.min(luminance(foreground), luminance(background));
			return (lighter + 0.05) / (darker + 0.05);
		};
		const blendOver = (top, bottom) => ({
			r: top.r * top.a + bottom.r * (1 - top.a),
			g: top.g * top.a + bottom.g * (1 - top.a),
			b: top.b * top.a + bottom.b * (1 - top.a),
			a: 1,
		});

		// Composites the element's own background over each ancestor's, bottom-up.
		// Returns null when a gradient/image makes the true background unknowable.
		const effectiveBackground = (element) => {
			const layers = [];
			let ancestor = element;
			while (ancestor && ancestor.nodeType === 1) {
				const ancestorStyle = getComputedStyle(ancestor);
				if (ancestorStyle.backgroundImage && ancestorStyle.backgroundImage !== "none")
					return null;
				const backgroundColor = parseCssColor(ancestorStyle.backgroundColor);
				if (backgroundColor && backgroundColor.a > 0) {
					layers.push(backgroundColor);
					if (backgroundColor.a >= 0.999) break;
				}
				ancestor = ancestor.parentElement;
			}
			if (layers.length === 0) return { r: 255, g: 255, b: 255, a: 1 };
			if (ancestor === null || ancestor.nodeType !== 1) {
				// Reached the document root without an opaque layer: the canvas.
				layers.push({ r: 255, g: 255, b: 255, a: 1 });
			}
			let composited = layers[layers.length - 1];
			for (let i = layers.length - 2; i >= 0; i -= 1)
				composited = blendOver(layers[i], composited);
			return composited;
		};

		const hasDirectText = (element) =>
			Array.from(element.childNodes).some(
				(child) =>
					child.nodeType === 3 &&
					child.textContent &&
					child.textContent.trim().length > 0 &&
					// Incidental decoration: separator/drag-handle glyphs ("|", "⠿", "•")
					// carry no reading text, so WCAG 1.4.6's incidental-text exemption
					// applies. Require at least one letter or digit.
					/[A-Za-z0-9]/.test(child.textContent),
			);

		const isLargeText = (computedStyle) => {
			const size = parseFloat(computedStyle.fontSize);
			const weight = parseInt(computedStyle.fontWeight, 10) || 400;
			return size >= 24 || (size >= 18.66 && weight >= 700);
		};

		const describeElement = (element) => {
			const idPart = element.id ? `#${element.id}` : "";
			const classPart =
				typeof element.className === "string" && element.className.trim()
					? `.${element.className.trim().split(/\s+/).slice(0, 3).join(".")}`
					: "";
			return `${element.tagName.toLowerCase()}${idPart}${classPart}`;
		};

		const violations = [];
		for (const element of document.querySelectorAll("body *")) {
			if (!hasDirectText(element)) continue;
			if (element.closest('[aria-disabled="true"]')) continue;
			const computedStyle = getComputedStyle(element);
			if (computedStyle.visibility === "hidden" || computedStyle.display === "none")
				continue;
			if (parseFloat(computedStyle.opacity) === 0) continue;
			// Gradient text-clip (`bg-clip-text text-transparent`): unmeasurable.
			if (
				computedStyle.webkitTextFillColor &&
				parseCssColor(computedStyle.webkitTextFillColor)?.a === 0
			)
				continue;
			const rect = element.getBoundingClientRect();
			if (rect.width < 2 || rect.height < 2) continue; // sr-only / clipped
			// Disabled controls are exempt from WCAG contrast.
			if (element.closest("[disabled]")) continue;

			const foreground = parseCssColor(computedStyle.color);
			if (!foreground || foreground.a === 0) continue;
			const background = effectiveBackground(element);
			if (!background) continue;

			const compositedForeground =
				foreground.a >= 0.999 ? foreground : blendOver(foreground, background);
			const required = isLargeText(computedStyle) ? 4.5 : 7;
			const measured = contrastRatio(compositedForeground, background);
			if (measured + 1e-9 < required) {
				violations.push({
					target: describeElement(element),
					text: (element.textContent || "").trim().slice(0, 40),
					ratio: Math.round(measured * 100) / 100,
					required,
				});
			}
		}
		return violations;
	});
}

/**
 * MARK: assertViewClean
 * @description Runs both instruments (axe + AAA contrast walk) on the current
 *   page state and asserts zero violations. Fails with a full JSON dump of
 *   any violation so the failure is actionable.
 * @example await assertViewClean(page, "retrospective");
 * @param {import('@playwright/test').Page} page
 * @param {string} label - Human-readable surface label for failure messages.
 */
export async function assertViewClean(page, label) {
	const axeViolations = await scanAxeViolations(page);
	expect(
		axeViolations,
		`${label}: axe ${JSON.stringify(formatViolations(axeViolations), null, 2)}`,
	).toEqual([]);
	const contrast = await contrastViolations(page);
	expect(
		contrast,
		`${label}: AAA text contrast ${JSON.stringify(contrast, null, 2)}`,
	).toEqual([]);
}

/**
 * MARK: scanState
 * @description Named wrapper around assertViewClean for the modal/state
 *   matrix. Identical behavior; the name documents intent when the call
 *   site is a state variant (e.g. "orchestrator / waiting_human") rather
 *   than a bare view.
 * @example await scanState(page, "system-settings / models");
 * @param {import('@playwright/test').Page} page
 * @param {string} label - Surface + state label, e.g. "system-settings / models".
 */
export async function scanState(page, label) {
	await assertViewClean(page, label);
}
