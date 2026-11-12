// Domain: Access — sign-in and access-control HTTP endpoints.
import { buildAuthRoutes } from "../auth/index.js";

/***
 * MARK: authRoutes
 * @description Thin Fastify registrar for the `/auth/*` endpoints (sign-in
 *   flow plus user, group-mapping, and settings administration). All auth
 *   logic lives in `api/auth/`; this file only connects it to the server.
 *   Without an auth service in deps the routes stay unregistered.
 * @example app.register(authRoutes, { deps })
 ***/
export default async function authRoutes(app, { deps } = {}) {
	if (!deps?.authService) return;
	await buildAuthRoutes({ authService: deps.authService })(app);
}
