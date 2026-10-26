import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/***
 * MARK: isWindows
 * @description Returns true if the target platform is Windows (win32).
 * @param {string} [targetPlatform=process.platform]
 * @returns {boolean}
 ***/
export function isWindows(targetPlatform = process.platform) {
	return targetPlatform === "win32";
}

/***
 * MARK: resolveShell
 * @description Returns the platform-aware shell binary and initial arguments prefix.
 * @param {string} [targetPlatform=process.platform]
 * @param {Object} [env=process.env]
 * @returns {{ file: string, argsPrefix: Array<string> }}
 ***/
export function resolveShell(targetPlatform = process.platform, env = process.env) {
	if (isWindows(targetPlatform)) {
		return {
			file: env.COMSPEC || "cmd.exe",
			argsPrefix: ["/d", "/s", "/c"],
		};
	}
	return {
		file: env.SHELL || "/bin/sh",
		argsPrefix: ["-c"],
	};
}

/***
 * MARK: buildStageEnv
 * @description Constructs a sanitized execution environment for command stages across platforms.
 *   Derives HOME, USER, and tmpdir/runtime dir safely without hardcoded Linux-literal paths.
 * @param {string} execCwd
 * @param {string} taskId
 * @param {string} [targetPlatform=process.platform]
 * @param {Object} [env=process.env]
 * @returns {Object}
 ***/
export function buildStageEnv(execCwd, taskId, targetPlatform = process.platform, env = process.env) {
	const onWindows = isWindows(targetPlatform);

	// Resolve USER
	let osUser;
	try {
		osUser = os.userInfo()?.username;
	} catch {
		// e.g. minimal container with no /etc/passwd
	}
	// Final fallback is a generic app identity — never a host-specific login.
	const user = env.USER || env.USERNAME || osUser || "kainbain";

	// Resolve HOME
	let osHome;
	try {
		osHome = os.homedir();
	} catch {
		// e.g. HOME unset or invalid
	}
	const home = env.HOME || env.USERPROFILE || osHome || os.tmpdir();

	// Resolve PATH
	const defaultPath = onWindows
		? "C:\\Windows\\system32;C:\\Windows"
		: "/usr/local/bin:/usr/bin:/bin";
	const sysPath = env.PATH || defaultPath;

	const sanitizedEnv = {
		PATH: sysPath,
		HOME: home,
		USER: user,
		LANG: env.LANG || "en_US.UTF-8",
		NODE_ENV: env.NODE_ENV || "development",
		PROJECT_CWD: execCwd,
		TASK_ID: taskId,
	};

	// Linux-only runtime dirs (meaningless on macOS/Windows).
	if (targetPlatform === "linux") {
		const runtimeDir =
			env.XDG_RUNTIME_DIR ||
			(typeof process.getuid === "function"
				? `/run/user/${process.getuid()}`
				: undefined);
		if (runtimeDir) {
			sanitizedEnv.XDG_RUNTIME_DIR = runtimeDir;
			sanitizedEnv.DBUS_SESSION_BUS_ADDRESS =
				env.DBUS_SESSION_BUS_ADDRESS || `unix:path=${runtimeDir}/bus`;
		}
	}

	return sanitizedEnv;
}

/***
 * MARK: findOnPath
 * @description Locates an executable binary by name on PATH, respecting PATHEXT on Windows.
 * @param {string} name
 * @param {string} [targetPlatform=process.platform]
 * @param {Object} [env=process.env]
 * @returns {string|null} Absolute path to executable if found, null otherwise.
 ***/
export function findOnPath(name, targetPlatform = process.platform, env = process.env) {
	if (!name) return null;
	if (path.isAbsolute(name)) {
		try {
			// eslint-disable-next-line security/detect-non-literal-fs-filename -- existence probe of the caller-supplied absolute candidate
			if (fs.existsSync(name)) {
				if (!isWindows(targetPlatform)) {
					fs.accessSync(name, fs.constants.X_OK);
				}
				return name;
			}
		} catch {
			return null;
		}
		return null;
	}

	const onWindows = isWindows(targetPlatform);
	const pathSep = onWindows ? ";" : ":";
	const rawPath = env.PATH || (onWindows ? "C:\\Windows\\system32;C:\\Windows" : "/usr/local/bin:/usr/bin:/bin");
	const dirs = rawPath.split(pathSep).map((d) => d.trim()).filter(Boolean);

	const extensions = onWindows
		? ["", ...(env.PATHEXT || ".COM;.EXE;.BAT;.CMD").split(";").map((e) => e.trim().toLowerCase())]
		: [""];

	for (const dir of dirs) {
		for (const ext of extensions) {
			const candidateName = onWindows && !name.toLowerCase().endsWith(ext)
				? `${name}${ext}`
				: name;
			const fullPath = path.join(dir, candidateName);
			try {
				// eslint-disable-next-line security/detect-non-literal-fs-filename -- PATH-search probe built from PATH dirs, read-only
				if (fs.existsSync(fullPath)) {
					// eslint-disable-next-line security/detect-non-literal-fs-filename -- same PATH-search probe, read-only stat
					const stat = fs.statSync(fullPath);
					if (!stat.isFile()) continue;
					// POSIX matches `command -v` semantics: the file must be
					// executable, not merely present. On Windows, existence
					// under a PATHEXT extension implies executability.
					if (!onWindows) {
						fs.accessSync(fullPath, fs.constants.X_OK);
					}
					return fullPath;
				}
			} catch {
				// probe next
			}
		}
	}

	return null;
}
