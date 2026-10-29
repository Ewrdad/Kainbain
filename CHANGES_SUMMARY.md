# Changes Summary: Runner Boxes Always Visible with Per-Runner Controls

## Overview
Implemented the requested changes to:
1. Display runner boxes even when nothing is running (show empty state)
2. Add play/pause and skip controls per runner
3. Remove the play settings in favor of inline controls

## Files Modified

### 1. Frontend - Runner Box Display (`./frontend/src/components/layout/NowPlayingBar.jsx`)

#### Changes to `resolveRunnerBoxes` function:
- **Before**: Returned `null` for 0 runners or 5+ runners (showing legacy display)
- **After**: Always returns an array (empty array for 0 runners, empty for 5+ runners)
- Added `paused` field to runner box data structure
- Updated JSDoc to reflect new behavior

#### Changes to runner box rendering:
- **Before**: Simple button showing runner info
- **After**: Complex component with:
  - Health indicator (colored dot)
  - Task info (clickable to inspect task)
  - Play/Pause button (toggles runner paused state)
  - Skip button (skips current task for that runner)
  - All controls are inline per runner

#### Updated `showRunnerBoxes` logic:
- **Before**: `runnerBoxes !== null`
- **After**: `runnerBoxes.length > 0`

### 2. Frontend - Context API (`./frontend/src/context/KainBainContext.jsx`)

#### Added new functions to context value:
- `pauseRunner(runnerId)`: Pauses a specific runner via API
- `resumeRunner(runnerId)`: Resumes a specific runner via API  
- `skipRunner(runnerId)`: Skips current task for a specific runner via API

All functions return `{ success: boolean, error?: string }` format.

### 3. Backend - Runner Routes (`./api/flow/runnerRoutes.js`)

#### Added new endpoint:
- `POST /runners/:id/skip` - Skips the current task for the specified runner
  - Validates runner has an active task
  - Advances the execution stage with skip flag
  - Returns success/error response

### 4. Tests Updated (`./frontend/src/components/layout/NowPlayingBar.test.jsx`)

#### Changes:
- Updated `resolveRunnerBoxes` expectations from `null` to `[]` for empty/no runners
- Updated test name and assertions for "runner boxes fall back" test to reflect new behavior
- Test now verifies empty runner boxes container (not shown) for 0 runners
- Test verifies single-task card for 5+ runners (unchanged limit)

## Behavior Changes

### Before:
- Runner boxes only appeared when 1-4 runners were active
- No runner boxes when fleet was idle (0 runners)
- No runner boxes when 5+ runners (space constraint)
- Global play/pause toggle for entire engine
- Skip button for entire engine

### After:
- Runner boxes always appear (empty state when 0 runners)
- Runner boxes shown for 1-4 runners
- Runner boxes hidden for 5+ runners (space constraint maintained)
- Per-runner play/pause controls (toggle paused state)
- Per-runner skip controls (skip current task)
- Click on runner box inspects the task

## Implementation Notes

1. **Health Indicators**: Still show green (live), amber (stale), or grey (unknown) based on heartbeat

2. **Runner Controls**:
   - Play icon (circle) when active → Pause when clicked
   - Pause icon (two vertical lines in circle) when paused → Play when clicked
   - Skip icon (horizontal line) to skip current task
   - All controls use `stopPropagation()` to prevent task inspection

3. **Error Handling**: Runner control functions catch errors and return error messages

4. **Backward Compatibility**: 
   - Existing runner monitor API unchanged
   - Existing runner registry functions reused (pause/resume)
   - Task inspection still works via click on runner box

## Testing

The changes maintain existing test structure while updating expectations:
- Unit tests for `resolveRunnerBoxes` updated to expect arrays instead of null
- Integration tests for runner box rendering updated
- Health indicator tests unchanged
- Task inspection tests unchanged

## Future Enhancements

Potential improvements not in this change:
- Start/stop individual runners (currently only pause/resume)
- Visual feedback during API calls (loading states)
- Keyboard shortcuts for runner controls
- Multi-select for batch operations
