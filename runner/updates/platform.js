/***
 * MARK: updatePlatform
 * @description Platform/arch detection and canonical asset naming for the
 *   runner self-update channel (Option A, ADR 0012). v1 ships Linux and
 *   macOS on x64/arm64 only — Windows is deferred, so win32 answers
 *   unsupported instead of guessing an asset name.
 * @example assetNameFor({ version: '1.2.3', platform: 'linux', arch: 'x64' }) => 'kainbain-runner-1.2.3-linux-x64.tar.gz'
 ***/
export const SUPPORTED_UPDATE_PLATFORMS = ["linux", "darwin"];
export const SUPPORTED_UPDATE_ARCHES = ["x64", "arm64"];

const NODE_ARCH_ALIASES = { x64: "x64", arm64: "arm64" };

export const detectUpdatePlatform = ({ platform = process.platform, arch = process.arch } = {}) => {
	const plat = String(platform || "");
	const normalizedArch = NODE_ARCH_ALIASES[String(arch || "")] || null;
	if (!SUPPORTED_UPDATE_PLATFORMS.includes(plat) || !normalizedArch) {
		return { ok: false, platform: plat || null, arch: normalizedArch, reason: "UNSUPPORTED_PLATFORM" };
	}
	return { ok: true, platform: plat, arch: normalizedArch, key: `${plat}-${normalizedArch}` };
};

export const assetNameFor = ({ version, platform, arch }) => {
	const detected = detectUpdatePlatform({ platform, arch });
	if (!detected.ok) {
		const err = new Error(`Unsupported update platform: ${platform}/${arch} (v1: linux|darwin x x64|arm64).`);
		err.code = "UNSUPPORTED_PLATFORM";
		throw err;
	}
	const clean = String(version || "").trim().replace(/^v/, "");
	if (!clean) {
		const err = new Error("assetNameFor needs a version.");
		err.code = "INVALID_VERSION";
		throw err;
	}
	return `kainbain-runner-${clean}-${detected.platform}-${detected.arch}.tar.gz`;
};
