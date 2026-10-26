export function stripAnsi(text) {
	if (typeof text !== "string" || !text) return "";
	// eslint-disable-next-line no-control-regex -- matching escape bytes is the whole job
	return text.replace(/\u001b(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "");
}
