// Global teardown: release the host-wide canary mutex acquired at config
// load (see canary-lock.js). Runs after the suite even on failure, so the
// next queued suite starts immediately. A SIGKILLed run skips teardown —
// the next acquirer detects the dead holder PID and proceeds.
const { releaseCanaryLock } = require("./canary-lock");

async function globalTeardown() {
	releaseCanaryLock();
}

module.exports = globalTeardown;
