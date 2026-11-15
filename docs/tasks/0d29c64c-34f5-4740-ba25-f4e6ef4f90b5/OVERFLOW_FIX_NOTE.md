# Overflow fix — shared pattern note

## Pattern

`frontend/src/components/common/TruncatedText.jsx` is the single overflow-safe
label for user-controlled text on the Settings page: `min-w-0` (shrinkable flex
item) + `truncate` (single-line ellipsis) + `title` (full text on hover).
Screen readers and accessible-name queries still get the full text from the
element content. Optional `id` passthrough preserves `aria-labelledby` targets.
Do not hand-roll per-card truncation classes — reuse this helper.

Two companion guards, applied at usage sites (not in the helper):

- Flex containers holding a `TruncatedText` need `min-w-0` (+ `flex-1` where the
  label should take free space); badges, icons, and buttons beside it need
  `shrink-0` so the label absorbs the shrink instead of its neighbours.
- `SelectDropdown` defaults to an `inline-block` container whose shrink-to-fit
  width is defeated by the `nowrap` inside its own truncated label (min-content
  becomes the full label length). Every in-flow usage on the Settings page
  passes `className="block w-full min-w-0"` so the dropdown fills its cell and
  its inner label clips. The component default is unchanged (other app layouts
  rely on `inline-block`).

## Applied to (audit disposition)

| File | Element | Fix |
|---|---|---|
| `settings/WorkflowManagementPanel.jsx` | `wf.name` header | `TruncatedText` + `min-w-0 flex-1` containers, `shrink-0` rename/badges |
| `settings/WorkflowManagementPanel.jsx` | action buttons | `flex-wrap max-w-full shrink-0` (wrap below the name on narrow screens) |
| `settings/WorkflowManagementPanel.jsx` | `stage.name` pills | `TruncatedText` + `min-w-0 max-w-full` pill, `shrink-0` number/type |
| `settings/WorkflowManagementPanel.jsx` | status message | `break-words` (names render inside it) |
| `settings/WorkflowManagementPanel.jsx` | template dropdown | `block w-full min-w-0` (was spilling 197px at 320px) |
| `settings/SkillsSection.jsx` | `skill.name` | `TruncatedText`; `break-words` on the invalid-error line |
| `settings/ModelAliasesSection.jsx` | expanded `Alias:` header | `TruncatedText` (+ `id` passthrough for `aria-labelledby`), `shrink-0` toggle/delete |
| `settings/ModelAliasesSection.jsx` | harness/model/reasoning dropdowns | `block w-full min-w-0` |
| `settings/ProjectSettings.jsx` | active-project dropdown | `block w-full min-w-0` (user project names) |
| `settings/AppLinkSection.jsx` | status dropdown | `block w-full min-w-0` (consistency hardening) |

Checked and clean (no user-controlled text in flex headers): `AddressesSection`,
`PathsAndReposSection`, `ProjectBasicsSection` (form inputs clip natively),
`FleetCatalogueSection` (`break-all`), `ModelAliasesSection` collapsed header
(already `truncate` + `title`), `SystemSettingsContent` (already
`truncate` + `min-w-0`), `RunnerHarnessPanel`/`StorageSection`/
`UiPreferencesPanel` (system-defined labels in block layouts; UI prefs live on
the System Settings route, outside this task's scope).

## Proof

- `TruncatedText.test.jsx` (3), `WorkflowManagementPanel.overflow.test.jsx`
  (4), `SettingsCards.overflow.test.jsx` (2) — all pass; full frontend suite
  green (349 files / 4736 tests).
- Headless Chromium check rendering the real components with 200-char
  spaceless names: zero visual spill at 320/768/1440px —
  `overflow-after-320.png`, `overflow-after-768.png`, `overflow-after-1440.png`.
