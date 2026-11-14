# Update Safety Assessment: Pretty Tasks API Changes

## Assessment Date
2026-11-14

## Assessment Type
No-code (docs-only) stage - Update safety verification

## Proposed Changes Summary

The task proposes two changes to the KainBain task creation API:

A) Accept nice-looking markdown tasks including:
- Code blocks with syntax highlighting
- Mermaid diagrams
- Image references (local and remote)
- Structured headings and lists

B) Re-structure the skill to:
- Recommend writing each task as its own MARKDOWN file in a `drafts/` directory
- Send markdown files across to the API
- Maintain existing behavior (first line title, blocking behavior)
- Use two-stage execution for better readability

## Current State Analysis

### 1. API Already Supports Markdown Goals

The POST /tasks endpoint already accepts and stores markdown in the goal field.

Evidence:
- API schema includes goal: { type: "string" } field
- taskMarkdownGoal.test.js demonstrates rich markdown goals with:
  - Headings (## Context, ## Steps)
  - Code blocks with syntax highlighting
  - Mermaid diagrams
  - Image references
- Tests verify markdown is stored byte-identically

Conclusion: The API already supports all requested markdown features.

### 2. Existing Two-Stage Pattern Already Implemented

The creating-new-tickets skill already implements the two-stage approach.

Evidence:
- Explicitly states "The flow is deliberately two-stage so tickets land as readable markdown documents"
- Instructions for Stage 1 - Draft each ticket as its own markdown file under drafts/
- Provides a markdown template with:
  - # imperative title as first line
  - ## Context section
  - ## Steps numbered list
  - ## Acceptance criteria bullet list
  - ## Notes / examples section for code, tables, mermaid, images
- Documents that the skill enables beautiful, readable tasks with:
  - Headings
  - Bullet and numbered lists
  - Fenced code blocks
  - Mermaid diagrams
  - Tables
  - Images
  - Formatting

Conclusion: The two-stage pattern with markdown draft files is already implemented.

### 3. API Schema Already Includes markdown Field

Evidence:
- taskWorkRoutes.js line 295: markdown: { type: "string" } in POST /tasks schema
- This field exists but is currently unused

Implications:
- Adding support for markdown field would be backward compatible
- Existing clients using goal field would continue to work

### 4. Backward Compatibility Analysis

Existing Behavior Preserved:
- Title extraction from first line of markdown works
- Blocking behavior via blockedBy field works
- First line title behavior works
- Task storage in docs/tasks/<taskId>/task.md works
- All existing API fields remain unchanged

Potential Breaking Changes:
None identified. Proposed changes are additive only.

## Risk Assessment

Risk Level: MINIMAL

Reasons:
1. All proposed functionality already exists in codebase
2. No existing API contracts are modified
3. markdown field in schema is unused (no breaking change to add support)
4. goal field already accepts and stores markdown
5. Existing clients continue to work unchanged
6. New functionality is purely additive

## Conclusion

The proposed changes will not break existing installations because:

1. All markdown functionality already exists and is tested
2. The two-stage draft file approach is already implemented
3. Changes are purely additive and backward compatible
4. No existing API contracts are modified
5. The task.md storage format remains unchanged

KAINBAIN_VERDICT: PASS
