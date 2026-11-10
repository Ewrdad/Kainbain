# Implementation Plan – Make the Task Inspector Panel Adjustable

## Source and Scope Inputs

- Task: **Make task panel adjustable**.
- Survey answers in `SURVEY.md`:
  - **Target:** task details view / right-hand task inspector (`TaskDetailOverlay`) rather than the survey Q&A side panel.
  - **Interaction:** drag the edge between the panel and the main workspace.
  - **Persistence:** remember the chosen width next time.
  - **Hiding:** resizing only; the existing close button remains the hide mechanism. Do not add collapse/expand behavior.
  - **Range:** allow almost full-screen widths.
- Existing prior art in the codebase:
  - `frontend/src/components/workflow/hooks/useActivityConsole.js` and `frontend/src/components/workflow/ActivityConsole.jsx` implement the same resizable-splitter pattern vertically for the Activity Console.
  - `frontend/src/context/useUiPreferences.js` persists and validates UI preferences, including `consoleHeight`.
- Image artifact: `assets/image.png` shows the fixed-width task inspector anchored to the right of the orchestrator canvas.

## Primary Target

The panel to make adjustable is:

```text
frontend/src/components/tasks/TaskDetailOverlayContent.jsx
```

rendered through:

```text
frontend/src/components/tasks/TaskDetailOverlay.jsx
```

and mounted in:

```text
frontend/src/components/OrchestratorView.jsx
```

Current static sizing is here:

```jsx
className={`... w-full md:w-[480px] lg:w-[560px] xl:w-[620px] flex-shrink-0 ...`}
```

These responsive fixed widths are the thing to replace with a persisted, user-adjustable width. The close button and the footer-reservation contract must remain unchanged.

## Principle: Make Change Easy, Then Make Change

### Phase 0 – Make the change easy

1. **Add a validated persisted preference for panel width.**
   - Add `taskInspectorWidth: 560` to `DEFAULT_UI_PREFERENCES`.
   - Add a validation branch in `isValidPreferenceValue`.
   - Add bounds constants.
   - Add sanitize, storage, and cross-tab behavior through the existing preference pipeline; no new storage layer.

2. **Extract a horizontal resize hook before touching the component.**
   - Mirror `useActivityConsole` because it already owns pointer drag, touch drag, keyboard nudging, bounds clamping, and preference persistence.
   - Create a small hook, e.g. `useTaskInspectorResize`, so `TaskDetailOverlayContent` does not inline drag state.
   - Refactor `useActivityConsole` first only if useful; prefer sharing pure helper functions, not coupling the two surfaces.

3. **Document the new preference before implementation.**
   - Add a short comment/help entry around `taskInspectorWidth`.
   - Add a backup/import note only if the settings panel enumerates keys.

4. **Add tests for the foundation before changing layout.**
   - Preference validation and persistence tests.
   - Hook drag calculation tests.
   - Only after those pass, change the overlay.

### Phase 1 – Make the change

1. **Consume the preference and hook in `TaskDetailOverlayContent`.**
2. **Replace fixed responsive widths with an inline style plus accessibility handle.**
3. **Update unit and E2E tests and documentation.**

## Proposed Preference Contract

Primary key:

```text
taskInspectorWidth
```

Default:

```text
560
```

Reason: `560px` is the current `lg` target and a sensible desktop default.

Bounds:

- `TASK_INSPECTOR_WIDTH_MIN = 320`
- `TASK_INSPECTOR_WIDTH_MAX = 2000`

`2000px` allows almost full-screen use on very wide monitors while still giving a finite validation boundary. The component also clamps to the live viewport:

```js
Math.max(MIN_WIDTH, Math.min(requestedWidth, window.innerWidth - 80))
```

The `80px` reserved margin keeps the main canvas visible when dragging almost full-screen, matching the survey answer.

Validation should mirror `consoleHeight`:

```js
if (key === 'taskInspectorWidth') {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= TASK_INSPECTOR_WIDTH_MIN &&
    value <= TASK_INSPECTOR_WIDTH_MAX
  );
}
```

No alias key is needed if the primary name is chosen consistently. Tests and documentation should use `taskInspectorWidth`.

## Proposed Component Contract

`TaskDetailOverlayContent` already calls `useKainBain()`, so it can read:

```js
const { uiPreferences, updateUiPreference } = useKainBain();
```

No prop changes are required in `OrchestratorView.jsx`. The `footerReserved` contract only governs vertical height and must remain untouched.

Hook shape:

```ts
useTaskInspectorResize({ uiPreferences, updateUiPreference }): {
  panelWidth: number;
  isDraggingInspector: boolean;
  handleResizeMouseDown: (e) => void;
  handleResizeTouchStart: (e) => void;
  handleResizeKeyDown: (e) => void;
}
```

Derived values:

```js
const requestedWidth = uiPreferences?.taskInspectorWidth ?? 560;
const [isDraggingInspector, setIsDraggingInspector] = useState(false);
const [panelWidth, setPanelWidth] = useState(requestedWidth);
```

Sync local state when preferences change outside the drag, but do not fight an in-progress drag.

Drag calculation for a left-edge handle. Moving the pointer left increases width:

```js
const nextWidth = Math.min(
  dynamicMax,
  Math.max(MIN, Math.round(startWidth + (startX - currentX))),
);
updateUiPreference?.('taskInspectorWidth', nextWidth);
```

Keyboard:

- `ArrowLeft`: increase by 20px.
- `ArrowRight`: decrease by 20px.
- Clamp to bounds after each change.
- No Enter/Space collapse behavior because the survey rejected hiding via resize.

Touch:

- Use the same logic as `handleResizeTouchStart`.
- Clamp to `Math.min(dynamicMax, window.innerHeight * 0.9)` or viewport-derived value.
- Use `{ passive: true }` listeners.

Viewport:

- Add an effect to clamp `panelWidth` on `resize`.
- Do not persist the viewport-clamped value unless the user initiated a drag.

## Layout Changes

In `TaskDetailOverlayContent.jsx`, replace:

```jsx
w-full md:w-[480px] lg:w-[560px] xl:w-[620px]
```

with:

```jsx
w-full md:w-auto md:shrink-0 md:max-w-none
```

and add an inline style used only on desktop:

```jsx
style={{ width: isDesktop ? `${panelWidth}px` : undefined }}
```

A safer React approach is to keep `w-full` on mobile and use the inline width at all breakpoints only if mobile handling is preserved:

```jsx
style={{ width: isDesktop ? `${panelWidth}px` : undefined }}
className={`... ${isDraggingInspector ? 'select-none' : ''} ...`}
```

where `isDesktop` is derived from `window.matchMedia('(min-width: 768px)')` or left as `undefined` on mobile. Existing CSS already makes mobile full width; inline `width` should be conditional to avoid overriding mobile full width.

Add a vertical splitter at the left edge of the panel:

```jsx
<div
  role="separator"
  aria-orientation="vertical"
  aria-valuenow={panelWidth}
  aria-valuemin={TASK_INSPECTOR_WIDTH_MIN}
  aria-valuemax={TASK_INSPECTOR_WIDTH_MAX}
  aria-label="Resize Task Inspector"
  tabIndex={0}
  onMouseDown={handleResizeMouseDown}
  onTouchStart={handleResizeTouchStart}
  onKeyDown={handleResizeKeyDown}
  className="hidden md:flex absolute left-0 top-0 bottom-0 w-2 cursor-col-resize z-10 ..."
>
  <div className="w-1 h-10 rounded-full bg-text-muted/40 ..." />
</div>
```

The root `aside` needs `relative` so the handle can be absolutely positioned. The separator should be marked `select-none` only while dragging. It must not intercept close-button or content interactions except along the narrow edge.

Accessibility title/description, mirroring Activity Console:

```jsx
<InfoTooltip
  title="Task Inspector Splitter"
  description="Drag horizontally to resize the task inspector panel (320px to full-screen)."
  position="right"
>
```

Double-click behavior should not collapse because the survey explicitly said resizing only; double-click can reset to `560` or be omitted. Recommendation: double-click resets to default to provide an easy recovery path, while vertical Activity Console uses double-click to collapse/expand. Since no collapse is desired, resetting default is less surprising. Document this choice.

## Make Change Easy First: Files to Change

Phase 0:

1. `frontend/src/context/useUiPreferences.js`
   - Add `taskInspectorWidth: 560`.
   - Add constants `TASK_INSPECTOR_WIDTH_MIN`, `TASK_INSPECTOR_WIDTH_MAX`.
   - Add validation branch.
   - Export constants for tests and component.

2. New `frontend/src/components/tasks/hooks/useTaskInspectorResize.js` or `frontend/src/components/tasks/useTaskInspectorResize.js`
   - Horizontal mirror of the Activity Console resize logic.
   - Unit-testable without JSX.

3. `frontend/src/context/useUiPreferences.test.js` or adjacent tests
   - Test valid default, valid range, invalid string, out-of-range, sanitizer retaining current value.

Phase 1:

1. `frontend/src/components/tasks/TaskDetailOverlayContent.jsx`
   - Import hook/preference constants.
   - Replace fixed widths.
   - Add splitter and ARIA.
   - Keep footer reservation and focus trap untouched.

2. `frontend/src/components/tasks/TaskDetailOverlay*.test.jsx`
   - Add width and drag tests.

3. Settings/documentation locations if necessary.

## Edge Cases and Constraints

- The panel is mobile full-screen; resize handle should be `hidden md:flex`.
- The fixed `footerReserved` classes depend on height, not width; do not alter them.
- The slide-in animation should not override a user-set width during animation. Inline width plus Tailwind animation can coexist, but test visually.
- Drag state must be cleaned up on unmount; remove listeners in cleanup functions.
- During resize, disable text selection and expensive transitions.
- Sanitize corrupted preference values to `560`; do not allow `NaN` or strings.
- Cross-tab storage events should clamp and keep the current tab stable.
- Tests use `jsdom`; resize events do not change layout, but style assertions can still verify class/style.
- Existing tests assert `w-full` maybe. Update those intentionally and document.
- Do not collapse via separator Enter/Space; the user asked for resizing only and existing close options.
- The E2E locator `role complementary name "Task Inspector"` should remain valid. Adding a separator inside the aside must not remove the accessible name.

## Testing and Verification Plan

### Automated unit tests

Preference:
- Extend `frontend/src/context/useUiPreferences.test.js` or use the existing preference test file.
- Cases:
  - Default includes `taskInspectorWidth: 560`.
  - Valid `320` and `2000` accepted.
  - `NaN`, `"400"`, booleans, `undefined`-handled behavior consistent with console height.
  - Out-of-range values fall back to default.
  - Cross-tab sanitizer keeps current state for invalid values.

Hook:
- New `useTaskInspectorResize.test` using the Activity Console hook test style.
- Cases:
  - `handleResizeMouseDown` starts drag and calls update with increased width for leftward movement.
  - `handleResizeTouchStart` works for touch movement.
  - `handleResizeKeyDown` ArrowLeft increases, ArrowRight decreases, clamp at min/max.
  - Invalid preference yields default.

Component:
- In `TaskDetailOverlay.test.jsx`, add tests:
  - Renders `role="separator"` with name `/Resize Task Inspector/i`.
  - `aria-valuemin`, `aria-valuemax`, `aria-valuenow` match bounds/default.
  - Inline width style reflects `uiPreferences.taskInspectorWidth`.
  - Drag calls `updateUiPreference('taskInspectorWidth', ...)`.
  - Mobile classes retain `w-full`.
- Run targeted tests:
  ```bash
  npm run test:unit -- frontend/src/components/tasks/TaskDetailOverlay.test.jsx
  npm run test:unit -- frontend/src/context/useUiPreferences.test.js
  ```

### Automated integration/regression tests

- Existing TaskDetailOverlay tests must still pass after replacing width classes.
- Run:
  ```bash
  npm run test:unit -- frontend/src/components/workflow/WorkflowCanvas.console.test.jsx
  npm run test:unit
  ```
- Verify no test relies on `lg:w-[560px]` except intentionally updated ones.

### Visual/manual verification

- Use headless screenshot tool or component rendering, not long-lived dev servers.
- Confirm:
  - Resized panel retains readability.
  - Close button remains visible and above content.
  - Footer reservation remains correct on desktop.
  - Mobile width remains full-screen.
- If Playwright E2E is used, add or update a task-inspector spec to drag the splitter and assert a changed CSS width, similar to the Activity Console console test.

### Accessibility checks

- Separator has correct role, orientation, label, tabindex, min, max, and value.
- Keyboard users can resize in 20px increments.
- Focus returns to close button behavior should be unchanged.
- Escape still closes.
- No collapse state is introduced.

## Documentation Plan

- Add inline comments at:
  - preference default and validator.
  - hook public contract.
  - overlay splitter markup.
- Update `docs` or settings help text if the UI enumerates preferences:
  - Mention that task inspector width is persisted and can be reset by double-click if implemented.
- Update `canary-e2e` README or add a note in task-inspector spec if drag assertions are added.
- Record in `CHANGELOG.md` optional entry:
  - "Resizable task inspector panel with persisted width."

## Risks and Mitigations

- **Width transition causes jitter during drag.** Mitigation: only apply CSS transition when not dragging (`transition-all duration-150` maybe removed or guarded).
- **Dynamic Tailwind classes cannot be generated.** Mitigation: use inline `style`, not `w-[${width}px]`.
- **Preference max is finite but "almost full-screen" could exceed max.** Mitigation: component uses viewport-derived max even when preference max is finite; if needed increase `TASK_INSPECTOR_WIDTH_MAX` to `4096`.
- **Hidden mobile scroll issues.** Mitigation: handle is hidden below `md`.
- **Breaking existing tests.** Mitigation: update only class assertions that correspond to intentionally changed layout and document them in the change.
- **Focus trapping interaction.** Mitigation: separator is focusable but outside the focus management effect's aggressive trapping is not expanded; verify manually.

## Acceptance Criteria

- A drag handle exists on the left edge of the task inspector on desktop widths.
- Dragging it changes the inspector width within `320px` and near full-screen.
- Touch and keyboard input can resize.
- Width persists in `kainbain_ui_preferences` under `taskInspectorWidth`.
- Corrupted or out-of-range values fall back to `560px`.
- Existing close behavior and footer reservation remain.
- Unit tests cover preference validation, hook calculations, and render behavior.
- No collapse/expand behavior is introduced, per survey.
- Documentation comments and changelog are updated.

## Suggested Commit Sequence

1. `feat(ui-preferences): add taskInspectorWidth preference`
2. `feat(task-inspector): add horizontal resize hook`
3. `test(task-inspector): pin resize rendering and drag behavior`
4. `feat(task-inspector): replace fixed width with adjustable panel`
5. `docs(task-inspector): document adjustable panel behavior`

This sequence preserves "make change easy then make change" and yields small reviewable commits.

## Stage Status

This stage scoped only to planning. No implementation changes are included yet.
KAINBAIN_VERDICT: PASS
