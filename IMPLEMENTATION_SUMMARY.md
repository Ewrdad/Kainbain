# Reasoning Levels Feature Implementation Summary

## Overview
This document summarizes the implementation of adjustable reasoning levels for harnesses in KainBain, allowing models to specify reasoning levels as a 4th `::` segment in model IDs (e.g., `pi::ollama-cloud::glm-5.3-flash:cloud::high`).

## Implementation Status: ✅ COMPLETE

All requirements from the implementation plan have been met. The feature follows the "make the change easy, then make the change" principle with Phase A (seams) and Phase B (behavior) fully implemented.

## Changes Made

### 1. Grammar Seam (Phase A1) - ✅ DONE
**File:** `shared/modelKeys.js`

- ✅ `parseModelKey()` now returns `{ form: "harnessReasoning", harness, provider, id, reasoning }` for 4-part keys
- ✅ `splitReasoning(ref)` - Splits optional reasoning level from model reference
- ✅ `stripReasoning(ref)` - Removes reasoning level from 4-part reference
- ✅ `appendReasoning(ref, level)` - Adds/replaces reasoning level on harness-scoped references
- ✅ `validateModelRefShape()` returns `"harnessReasoning"` for 4-part keys
- ✅ Frontend mirror in `frontend/src/services/api.js` (already present)
- ✅ Comprehensive tests for all forms (1-4 parts) and malformed inputs

**Key Features:**
- Backward compatible: 1-3 part IDs work exactly as before
- 5+ segments remain malformed (null)
- Handles model IDs with single `:` characters (e.g., `glm-5.3-flash:cloud`)
- Strict validation: non-empty, trimmed, no `::`, case-sensitive

### 2. Capability Seam (Phase A2) - ✅ DONE
**File:** `api/agent/harnessRegistry.js`

- ✅ Added `harnessReasoningLevels(harnessOrName)` function
- ✅ All harnesses declare `reasoningLevels: string[] | null` property
- ✅ Harnesses with adjustable reasoning have arrays of supported levels
- ✅ Harnesses without adjustable reasoning have `null`

**Harness Configuration:**
- **pi**: `reasoningLevels: ["off", "minimal", "low", "medium", "high", "xhigh", "max"]`
- **antigravity**: `reasoningLevels: ["low", "medium", "high"]`
- **mock**: `reasoningLevels: ["low", "medium", "high"]`
- **codex**: `reasoningLevels: null` (no adjustable reasoning)
- **opencode**: `reasoningLevels: null` (no adjustable reasoning)
- **vibe**: `reasoningLevels: null` (no adjustable reasoning)
- **muse**: `reasoningLevels: null` (no adjustable reasoning)
- **custom**: `reasoningLevels: null` (no adjustable reasoning)

### 3. Resolution Seam (Phase A3) - ✅ DONE
**File:** `api/models.js` (re-exports from shared)

- ✅ `resolveModel()` and `resolveModelFromRegistry()` handle 4-part keys
- ✅ Model identity based on 3-part base (harness::provider::id)
- ✅ Reasoning level carried alongside model identity

### 4. Validation Seam (Phase A4) - ✅ DONE
**File:** `api/aliasTargets.js`

- ✅ Alias validation checks reasoning levels against harness capabilities
- ✅ Hard save-time errors for:
  - Malformed 4-part shape
  - Unknown harness
  - Level on non-reasoning harness
  - Level outside advertised set (harness-level or per-model)
- ✅ Per-model `supportedReasoning` override support
- ✅ Soft catalog-membership warnings (doesn't block saves)

### 5. Dispatch Seam (Phase A5) - ✅ DONE
**Files:** Harness implementations

#### Pi Harness (`api/agent/harnesses/pi/piHarness.js`)
- ✅ Parses reasoning level from model ref
- ✅ Validates level against `reasoningLevels` array
- ✅ Calls `session.setThinkingLevel(level)` SDK method
- ✅ Defense-in-depth: strips unsupported levels with warning
- ✅ Handles per-model variation via `thinkingLevelMap`

#### Antigravity Harness (`api/agent/harnesses/antigravity/agyHarness.js`)
- ✅ Parses `effort` suffix from model ref
- ✅ Validates against `reasoningLevels` array
- ✅ Passes `--effort <level>` to CLI
- ✅ Defense-in-depth: strips unsupported effort levels

#### Mock Harness (`api/agent/harnesses/mock/mockHarness.js`)
- ✅ Records reasoning level in session
- ✅ Uses `session.activeReasoningLevel` property
- ✅ Records level on `activeModel` for testing
- ✅ Allows testing without real AI credentials

### 6. Model List Advertisement (Q10) - ✅ DONE
**Files:** `api/models.js`, `api/routes/harnesses.js`

- ✅ `/compute/models` includes `supportedReasoning` per model
- ✅ `/harnesses/:id/models` includes `supportedReasoning` per model
- ✅ `/harnesses` route now includes `reasoningLevels` per harness (added in this review)
- ✅ Frontend can display available reasoning levels to users

## Key Design Decisions (From Implementation Plan)

✅ **Q1**: 4th `::` part syntax: `harness::provider::id::level`
✅ **Q2**: Per-harness allowed levels (no global enum)
✅ **Q3**: Save-time rejection + runtime ignore (defense-in-depth)
✅ **Q4**: Reasoning lives inside alias target's model ID string
✅ **Q5**: NO stage-level reasoning override - alias owns its level
✅ **Q6**: Reject levels for harnesses without adjustable reasoning
✅ **Q7**: Backward compatible - old IDs work without migration
✅ **Q8**: No project/harness-wide default level
✅ **Q9**: User-facing term is "Reasoning"
✅ **Q10**: Model lists advertise supported levels per model/harness

## Safety Mechanisms

1. **Defense-in-Depth**: Save-time validation + runtime stripping
2. **Backward Compatibility**: 1-3 part IDs work exactly as before
3. **Strict Validation**: Non-empty, trimmed, no `::`, case-sensitive
4. **Null Safety**: Harnesses without reasoning have `null` (not undefined)
5. **Per-Model Override**: Models can override supported levels
6. **Catalog Drift Tolerance**: Soft warnings for offline discovery

## Testing

✅ All unit tests pass
✅ All integration tests pass
✅ All linting passes
✅ All harness self-tests pass
✅ Grammar parsing tests verify all forms
✅ Validation tests cover error cases
✅ Runtime tests verify level application

## Files Modified in This Review

1. **api/routes/harnesses.js**
   - Added `reasoningLevels` field to `/harnesses` route response schema
   - Added `reasoningLevels` to harness entries in the response
   - Ensures UI can discover which harnesses support reasoning levels

## Verification Checklist

- [x] Grammar seam implemented (parseModelKey, helpers)
- [x] Capability seam implemented (harnessReasoningLevels, harness configs)
- [x] Resolution seam implemented (model resolution handles 4 parts)
- [x] Validation seam implemented (aliasTargets validates reasoning)
- [x] Dispatch seam implemented (harnesses handle reasoning levels)
- [x] Model list advertisement (supportedReasoning in model lists)
- [x] Harness route advertisement (reasoningLevels in /harnesses)
- [x] All harnesses configured appropriately
- [x] Backward compatibility maintained
- [x] Safety mechanisms in place
- [x] Tests pass
- [x] No interference with live operations

## Usage Examples

### Model Reference with Reasoning Level
```
pi::ollama-cloud::glm-5.3-flash:cloud::high
```

### Alias Target
```json
{
  "name": "fast-model",
  "harness": "pi",
  "model": "google::gemini-2.5-flash::low"
}
```

### Validation
- Save will be rejected if:
  - Harness doesn't support reasoning (e.g., `codex::provider::model::high`)
  - Level not in harness's `reasoningLevels` array
  - Malformed 4-part shape

### Runtime Behavior
- Harness applies the reasoning level to the session
- If harness doesn't support the level, it's stripped with a WARN log
- Stage continues normally (never fails due to level issues alone)

## Conclusion

The reasoning levels feature is fully implemented according to the specification. All requirements have been met, safety mechanisms are in place, backward compatibility is maintained, and tests pass. The feature is ready for integration.
