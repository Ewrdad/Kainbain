const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const TEMP_PROJECT = path.join("/tmp", `kainbain-git-test-${Date.now()}`);
const PROJECT_ROOT = TEMP_PROJECT;

async function run() {
    try {
        console.log(`Creating temp project at ${TEMP_PROJECT}...`);
        fs.mkdirSync(TEMP_PROJECT, { recursive: true });

        process.chdir(PROJECT_ROOT);

        console.log("Initializing git...");
        execSync("git init -b main"); // Explicitly use main
        execSync('git config user.email "test@test.com"');
        execSync('git config user.name "Test User"');

        console.log("Creating main branch with initial file...");
        fs.writeFileSync("hello.txt", "Hello World\n");
        execSync("git add .");
        execSync('git commit -m "initial commit"');

        console.log("Creating task branch kb/test-task...");
        execSync("git checkout -b kb/test-task");

        console.log("Agent makes changes...");
        fs.appendFileSync("hello.txt", "Agent added this line.\n");
        fs.writeFileSync("newfile.txt", "I am a new file\n");

        console.log("Working tree is now dirty...");

        console.log(
            "Verifying: can commit all if needed (like commitAllIfNeeded)",
        );
        execSync("git add -A");
        execSync('git commit -m "KainBain: checkpoint commit"');

        console.log("Verifying: diff between main and kb/test-task");
        const diff = execSync("git diff main...kb/test-task").toString();
        console.log("Diff output:\n" + diff);
        if (!diff.includes("Agent added this line"))
            throw new Error("Diff missing agent changes");

        console.log("Verifying: merge kb/test-task into main");
        execSync("git checkout main");
        execSync("git merge --no-edit kb/test-task");

        const content = fs.readFileSync("hello.txt", "utf8");
        if (!content.includes("Agent added this line"))
            throw new Error("Merge failed to bring in changes");

        console.log("SUCCESS: Git foundation verified.");
    } catch (e) {
        console.error("FAILURE:", e);
        process.exit(1);
    }
}

run();
