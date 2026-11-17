# Overflow fix — shared pattern note

## Pattern

`frontend/src/components/common/TruncatedText.jsx` is the single overflow-safe
label for user-controlled text on the Settings page: `min-w-0` (shrinkable flex
item) + `max-w-full` + `inline-block` (clip to the parent when reused outside
a flex row — a width cap has no effect on a plain inline span) + `truncate`
(single-line ellipsis) + `title` (full text on hover). Screen readers and
accessible-name queries still get the full text from the element content.
Optional `id` passthrough preserves `aria-labelledby` targets. Do not
hand-roll per-card truncation classes — reuse this helper.

Fail-safe contract (pinned in `TruncatedText.test.jsx`): nullish or empty
text renders an empty label with no tooltip (never the words
"undefined"/"null", never a crash); any other value renders as-is with its
string form as the tooltip; a non-string `className` is ignored so it can
never render as a literal "null" class.

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

Message lines (server errors, notices, success/warning text) that render names
or raw error text verbatim use `break-words` (prose) or `break-all` (mono
identifiers); checkbox labels pairing an input with a server-provided name use
`min-w-0` on the label + `break-all` on the name + `shrink-0` on the input.

## Applied to (audit disposition)

| File | Element | Fix |
|---|---|---|
| `settings/WorkflowManagementPanel.jsx` | `wf.name` header | `TruncatedText` + `min-w-0 flex-1` containers, `shrink-0` rename/badges |
| `settings/WorkflowManagementPanel.jsx` | action buttons | `flex-wrap max-w-full shrink-0` (wrap below the name on narrow screens) |
| `settings/WorkflowManagementPanel.jsx` | `stage.name` pills | `TruncatedText` + `min-w-0 max-w-full` pill, `shrink-0` number/type |
| `settings/WorkflowManagementPanel.jsx` | status message | `break-words` (names render inside it) |
| `settings/WorkflowManagementPanel.jsx` | template dropdown | `block w-full min-w-0` (was spilling 197px at 320px) |
| `settings/SkillsSection.jsx` | `skill.name` | `TruncatedText`; `break-words` on the invalid-error line |
| `settings/SkillsSection.jsx` | description / config keywords / messages / preview title | `title` on the truncated description; `break-all` on keyword keys, `break-words` on keyword descriptions; `break-words` on import error/success/warning, delete-error, load-error lines and the preview modal title |
| `settings/ModelAliasesSection.jsx` | expanded `Alias:` header | `TruncatedText` (+ `id` passthrough for `aria-labelledby`), `shrink-0` toggle/delete |
| `settings/ModelAliasesSection.jsx` | collapsed summary badge | `TruncatedText` inside a `min-w-0 max-w-full inline-flex` badge (embeds model refs) |
| `settings/ModelAliasesSection.jsx` | collapsed error badge + expanded error | `min-w-0 max-w-full` wrapper + `break-all` badge; `break-words` on the expanded `<p>` (messages embed names/refs) |
| `settings/ModelAliasesSection.jsx` | target validity line | `break-words` (messages embed harness ids/model refs) |
| `settings/ModelAliasesSection.jsx` | harness/model/reasoning dropdowns | `block w-full min-w-0` |
| `settings/ProjectSettings.jsx` | active-project dropdown | `block w-full min-w-0` (user project names) |
| `settings/AppLinkSection.jsx` | status dropdown | `block w-full min-w-0` (consistency hardening) |
| `settings/AppLinkSection.jsx` | error + probe-result lines | `break-words` (probe failures append raw error text) |
| `settings/ApiKeysSection.jsx` | `key.name` row | `TruncatedText` + `min-w-0` row; `break-words` on notice + secret-for lines (names render inside them) |
| `settings/ApiKeysSection.jsx` | roles/scopes meta + usage rows + scope checkboxes | `break-words` on the meta line and usage entries (routes are spaceless); `min-w-0` label + `break-all` name + `shrink-0` input on scope checkboxes |
| `settings/AccessUserList.jsx` | user name / email row | `TruncatedText` for both + `min-w-0` row; `break-words` on notice + project-roles lines |
| `settings/AccessUserList.jsx` | direct-role checkboxes | `min-w-0` label + `break-all` name + `shrink-0` input |
| `settings/AccessControlSection.jsx` | notice line | `break-words` (carries server error text) |
| `settings/FleetCatalogueSection.jsx` | notice + error lines | `break-words` (table itself scrolls via `overflow-x-auto`; model ids already `break-all`) |
| `settings/ImageGenSection.jsx` | provider label / description / messages | `TruncatedText` label + `shrink-0` status badge; `break-words` on descriptions, the status message, and the load-error line (`min-w-0` text + `shrink-0` Retry) |
| `settings/RunnerConfigurationSection.jsx` | directory-field errors | `break-words` (quote the rejected path) |
| `settings/PathsAndReposSection.jsx` | symlink-hint folder name | `break-all` on the inline `<code>` name |

Checked and clean: `AddressesSection` (delegates to `AppLinkSection`),
`ProjectBasicsSection` (form inputs clip natively; validation messages are
fixed strings that never embed user input), `ModelAliasesSection` collapsed
name (already `truncate` + `title`; `truncate`'s `overflow: hidden` zeroes the
flex minimum so it clips), `SystemSettingsContent` (already `truncate` +
`min-w-0`), `RunnerHarnessPanel`/`StorageSection` (backend-defined ids, paths
that wrap at `/`, and constants in block layouts), `UiPreferencesPanel`
(system-defined labels; UI prefs live on the System Settings route, outside
this task's scope), `ProjectSettingsForm`/`RetryTimeoutsSection`/
`RetryNumberField` validation messages (fixed strings, never embed input),
`PushNotificationsSection` (system-derived status labels),
`PromptLayoutSection` (system-defined tokens), `RunnerConfigurationSection`
build warnings and job labels (fixed strings).

## Proof

- `TruncatedText.test.jsx` (9, incl. null/undefined/empty/number/`id`/className
  edges), `WorkflowManagementPanel.overflow.test.jsx` (4),
  `SettingsCards.overflow.test.jsx` (8), plus containment cases in
  `ApiKeysSection.test.jsx` (3), `AccessControl.test.jsx` (2),
  `SkillsSection.test.jsx` (strengthened import/409/delete/preview/load flows
  + a delete-failure case), `AppLinkSection.test.jsx`, `FleetCatalogueSection.test.jsx`,
  `ImageGenSection.test.jsx`, `RunnerConfigurationSection.test.jsx`, and
  `PathsAndReposSection.test.jsx` — all pass; full frontend suite green.
- Headless Chromium check rendering the real components with 200-char
  spaceless names: zero visual spill at 320/768/1440px —
  `overflow-after-320.png`, `overflow-after-768.png`, `overflow-after-1440.png`.
