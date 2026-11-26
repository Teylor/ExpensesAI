import { execFileSync } from "node:child_process";

const mode = process.argv[2] === "push" ? "pushes" : "commits";
const branch = execFileSync("git", ["branch", "--show-current"], {
  encoding: "utf8",
}).trim();

if (branch === "main") {
  console.error(
    `Blocked: direct ${mode} to 'main' are not allowed. Create a branch and open a Pull Request.`,
  );
  process.exit(1);
}
