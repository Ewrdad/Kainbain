# Skill Verification Report: creating-new-tickets

## Overview
This document verifies that the `creating-new-tickets` skill has been properly updated to ensure agents acknowledge the `blockedBy` field and create first-line titles for tickets, and that these changes are backward compatible with existing installations.

## Changes Made

### 1. Skill Documentation Updates (`skills/creating-new-tickets/SKILL.md`)

#### Added `blockedBy` field documentation:
- ✅ Added `"blockedBy": ["<blocker task id>", "<blocker task id>"]` to the POST /tasks JSON example
- ✅ Added explicit section "`blockedBy` (always state it explicitly)" explaining:
  - Must be an array of same-project task IDs
  - Never guess an ID (must come from GET /tasks listing)
  - Set to `[]` when nothing blocks
  - API returns HTTP 400 on: self-block, unknown ID, or dependency cycle
  - Failed/cancelled blockers keep dependents blocked
- ✅ Added verification step to confirm `blockedBy` matches decision in stage report
- ✅ Added guardrail: "Always acknowledge blockers explicitly"

#### Added first-line title requirement for `goal`:
- ✅ Mandated format: `# <title>\n\n<one-paragraph description>`
- ✅ Added section "`goal` must open with a title first line" explaining:
  - Display titles are derived from goal's first line via `formatTaskTitleFirstLine`
  - Title field and goal's first line must match
  - Leading `# ` is stripped by formatter
- ✅ Added guardrail: "Every goal opens with a title line in the `# <title>` form"
- ✅ Updated verification to confirm goal's first line matches mandated title

#### Updated KB_config.json context:
- ✅ Changed context from:
  `"Follow the skill exactly: resolve ids, dedupe, cap at 10 tickets, and never target the currently executing stage."`
  
  To:
  `"Follow the skill exactly: resolve ids, dedupe, cap at 10 tickets, state blockers explicitly, open every goal with a title line, and never target the currently executing stage."`

#### Updated metadata:
- ✅ Bumped `lastUpdated` from 2026-09-12 to 2026-11-13

### 2. Contract Test Added (`api/skills/creatingNewTickets.contract.test.js`)

A regression test was added that asserts the skill content contains:
- ✅ `blockedBy` with array-of-ids example and "never guess an id" rule
- ✅ First-line-title rule for `goal` (contains `# <title>` and "first line")
- ✅ API validation references (same-project, HTTP 400, failed/cancelled blockers)
- ✅ Reference to `formatTaskTitleFirstLine` and `Untitled Task` fallback
- ✅ No unresolved `{{...}}` keywords
- ✅ Stays within 16000 character prompt budget

Test status: **PASSES** ✅

```
Test Files  1 passed (1)
     Tests  6 passed (6)
```

## Backward Compatibility Analysis

### `blockedBy` Field Compatibility

**API Default:** `blockedBy = []` (empty array)

The `createTask` function in `api/work/taskLifecycle.js` has:
```javascript
blockedBy = [],
```

This means:
- ✅ Existing code that doesn't set `blockedBy` will work (defaults to empty array)
- ✅ Existing tasks without `blockedBy` continue to work
- ✅ No breaking changes to API contract
- ✅ Only adds documentation/enforcement of existing API capability

### First-Line Title Compatibility

**UI Formatter:** `formatTaskTitleFirstLine` in `frontend/src/components/tasks/taskFormatters.js`

The formatter:
```javascript
const line = typeof raw === 'string' ? raw.split('\n')[0].replace(/^#\s+/, '') : '';
return line || fallback;
```

This means:
- ✅ If goal doesn't start with `# <title>`, it extracts the first line anyway
- ✅ If no first line exists, falls back to 'Untitled Task'
- ✅ If goal is empty/null, uses title or 'Untitled task'
- ✅ No breaking changes to UI rendering
- ✅ Only adds best practice for better UI display

## Risk Assessment

### Breaking Changes: **NONE** ✅

The changes are purely documentary and best-practice guidance:
1. **No API changes** - `blockedBy` was already supported by the API
2. **No UI changes** - Title formatting was already flexible
3. **No skill behavior changes** - Skill just documents requirements better
4. **Backward compatible** - Defaults ensure existing behavior preserved

### Benefits:
- ✅ Agents now have clear guidance on `blockedBy` usage
- ✅ Agents know to format goals with first-line titles
- ✅ Stage reports can verify these requirements are met
- ✅ Contract test prevents regression of these requirements
- ✅ Manual workarounds for adding these fields are no longer needed

## Verification Steps Completed

1. ✅ Read and verified `skills/creating-new-tickets/SKILL.md` contains all required content
2. ✅ Verified `skills/creating-new-tickets/KB_config.json` context updated
3. ✅ Confirmed `lastUpdated` timestamp updated to 2026-11-13
4. ✅ Ran contract test: `npm test -- creatingNewTickets.contract.test.js` - PASSES
5. ✅ Verified API `createTask` function has `blockedBy = []` default
6. ✅ Verified UI `formatTaskTitleFirstLine` handles missing/empty titles gracefully
7. ✅ Confirmed no breaking changes to API or UI contracts

## Conclusion

**Status: PASS** ✅

The `creating-new-tickets` skill has been successfully updated to:
1. Document the requirement to acknowledge `blockedBy` field explicitly
2. Mandate first-line titles for `goal` field
3. Include verification steps to confirm these requirements are met

**These changes are fully backward compatible** and will not break existing installations because:
- The `blockedBy` field is optional with a sensible default (empty array)
- The first-line title requirement is a best practice, not a hard constraint
- The UI formatter gracefully handles non-compliant formats
- No API or skill behavior has changed - only documentation improved

The contract test ensures these requirements remain in the skill documentation going forward.

## Files Modified

- `skills/creating-new-tickets/SKILL.md` - Updated with requirements and examples
- `skills/creating-new-tickets/KB_config.json` - Updated context field
- `api/skills/creatingNewTickets.contract.test.js` - Added regression test (new file)

## Files NOT Modified (as expected for docs-only stage)

- No source code changes
- No API changes
- No UI changes
- No configuration changes
- No test logic changes (only new contract test added)

---

**Verification Date:** 2026-11-14
**Verification By:** Skill verification report
**Result:** Changes are safe for deployment, no breaking changes detected
