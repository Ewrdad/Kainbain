/***
 * MARK: taskAssetRefs (shared)
 * @description Single source of truth for the task-asset reference grammar,
 *   shared verbatim by backend prompt curation (missing-asset warnings) and
 *   the frontend viewer (asset URL resolution). One file per function plus
 *   this single front file, following the shared/stageVerdict layout.
 ***/
export * from "./normalizeAssetSrc.js";
export * from "./extractAssetRefs.js";
export * from "./imageExtensions.js";
export * from "./isAllowedImageExt.js";
export * from "./sanitizeImageName.js";
