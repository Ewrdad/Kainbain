// Domain: The Work — task asset reference grammar (shared single owner).
// The upload allowlist, shared verbatim by the backend (upload validation,
// serve parity) and the frontend (pre-submit feedback validation) so the
// two sides can never disagree on which extensions count as images.

/***
 * MARK: IMAGE_EXTENSIONS
 * @description Allowed image file extensions (lowercase, without the dot).
 * @example IMAGE_EXTENSIONS.includes('png') => true
 ***/
export const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp"];
