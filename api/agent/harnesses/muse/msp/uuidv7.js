import crypto from "node:crypto";

let lastTimestamp = -1;
let seq = 0;

/***
 * MARK: generateUuidV7
 * @description Generates an RFC 9562 UUIDv7.
 *   - 48 bits: Unix timestamp in milliseconds
 *   - 4 bits: version 7 (0x70)
 *   - 12 bits: counter sequence for monotonicity under burst generation
 *   - 2 bits: variant 1 (0x80)
 *   - 62 bits: random bits
 *   Required by Muse MSP commandId (UUIDv4 is rejected by muse serve).
 * @returns {string} Formatted 36-char lowercase UUIDv7.
 ***/
export function generateUuidV7() {
	let now = Date.now();
	if (now <= lastTimestamp) {
		seq = (seq + 1) & 0xfff;
		if (seq === 0) {
			now = lastTimestamp + 1;
		}
	} else {
		seq = crypto.randomInt(0, 0x100);
	}
	lastTimestamp = now;

	const bytes = crypto.randomBytes(16);
	bytes.writeUIntBE(now, 0, 6);
	bytes[6] = 0x70 | ((seq >> 8) & 0x0f);
	bytes[7] = seq & 0xff;
	bytes[8] = (bytes[8] & 0x3f) | 0x80;

	return [
		bytes.toString("hex", 0, 4),
		bytes.toString("hex", 4, 6),
		bytes.toString("hex", 6, 8),
		bytes.toString("hex", 8, 10),
		bytes.toString("hex", 10, 16),
	].join("-");
}
