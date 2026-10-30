// Canonical implementations live in shared/ so the Runner bundle
// (runner/{runner,api,shared}) and the backend (api/ + shared/ siblings)
// execute the identical code — one copy, no drift.
export { formatPosture } from "../../shared/formatPosture.js";
export { servingModelFor } from "../../shared/servingModelFor.js";
