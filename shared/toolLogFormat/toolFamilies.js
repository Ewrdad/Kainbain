const BASH_TOOL_NAMES = new Set([
	"bash",
	"sh",
	"shell",
	"exec",
	"cmd",
	"powershell",
	"run_command",
	"runcommand",
]);

const FILE_TOOL_NAMES = new Set([
	"read",
	"read_file",
	"readfile",
	"write",
	"write_file",
	"writefile",
	"edit",
	"edit_file",
	"editfile",
	"apply_patch",
	"create_file",
	"delete_file",
	"save_file",
]);

const COMMAND_ARG_KEYS = ["command", "cmd"];
const PATH_ARG_KEYS = ["path", "file", "filePath", "filename"];

export function toolFamily(toolName) {
	const name = String(toolName || "").toLowerCase();
	if (!name) return "unknown";
	if (BASH_TOOL_NAMES.has(name) || name.includes("bash") || name.includes("shell")) {
		return "bash";
	}
	if (FILE_TOOL_NAMES.has(name) || name.endsWith("_file")) return "file";
	return "unknown";
}

export { BASH_TOOL_NAMES, FILE_TOOL_NAMES, COMMAND_ARG_KEYS, PATH_ARG_KEYS };
