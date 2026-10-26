import { describe, it, expect, beforeEach, vi } from "vitest";
import { diffFiles, diffFilePatch, diffCommitList, revCount, resolveSha } from "./reviewDiff.js";
import { git } from "./git.js";

vi.mock("./git.js", async () => {
	const actual = await vi.importActual("./git.js");
	return {
		...actual,
		git: vi.fn(),
	};
});

describe("reviewDiff", () => {
	const cwd = "/tmp/repo";
	const base = "main";
	const head = "kb/task-1";

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("diffFiles should parse numstat output correctly", async () => {
		git.mockImplementation((cwd, args) => {
			if (args.includes("--name-status")) {
				return Promise.resolve({
					stdout: "M\tsrc/app.js\nA\tnewfile.js\nD\tdeleted.js\nR100\told.js\tnew_renamed.js",
					stderr: "",
					code: 0
				});
			}
			if (args.includes("--numstat")) {
				return Promise.resolve({
					stdout: "10\t5\tsrc/app.js\n2\t0\tnewfile.js\n0\t3\tdeleted.js\n5\t2\told.js => new_renamed.js\n-\t-\tbinary.bin",
					stderr: "",
					code: 0
				});
			}
			return Promise.resolve({ stdout: "", stderr: "", code: 0 });
		});

		const files = await diffFiles(cwd, base, head);
		
		expect(files).toHaveLength(5);
		expect(files[0]).toEqual({ path: "src/app.js", oldPath: null, status: "modified", additions: 10, deletions: 5, binary: false });
		expect(files[1]).toEqual({ path: "newfile.js", oldPath: null, status: "added", additions: 2, deletions: 0, binary: false });
		expect(files[2]).toEqual({ path: "deleted.js", oldPath: null, status: "deleted", additions: 0, deletions: 3, binary: false });
		expect(files[3]).toEqual({ path: "new_renamed.js", oldPath: "old.js", status: "renamed", additions: 5, deletions: 2, binary: false });
		expect(files[4]).toEqual({ path: "binary.bin", oldPath: null, status: "modified", additions: 0, deletions: 0, binary: true });
	});

	it("diffFilePatch should call git diff with correct args", async () => {
		git.mockResolvedValue({ stdout: "diff patch content", stderr: "", code: 0 });
		const patch = await diffFilePatch(cwd, base, head, "src/app.js");
		
		expect(patch).toBe("diff patch content");
		expect(git).toHaveBeenCalledWith(cwd, ["diff", "--unified=3", "--no-color", `${base}...${head}`, "--", "src/app.js"]);
	});

	it("diffCommitList should parse log output correctly", async () => {
		git.mockResolvedValue({
			stdout: "sha2|Bob|2023-01-02|Second commit\nsha1|Alice|2023-01-01|First commit",
			stderr: "",
			code: 0
		});

		const commits = await diffCommitList(cwd, base, head);
		
		expect(commits).toHaveLength(2);
		expect(commits[0]).toEqual({ sha: "sha2", author: "Bob", date: "2023-01-02", message: "Second commit" });
		expect(commits[1]).toEqual({ sha: "sha1", author: "Alice", date: "2023-01-01", message: "First commit" });
	});

	it("revCount should parse counts correctly", async () => {
		git.mockResolvedValue({
			stdout: "3\t12",
			stderr: "",
			code: 0
		});

		const counts = await revCount(cwd, base, head);
		expect(counts).toEqual({ behind: 3, ahead: 12 });
	});

	it("resolveSha should resolve ref to sha", async () => {
		git.mockResolvedValue({ stdout: "abc123def", stderr: "", code: 0 });
		const sha = await resolveSha(cwd, "main");
		expect(sha).toBe("abc123def");
	});
});
