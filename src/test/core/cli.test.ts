import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { spawnSync } from "child_process";

const CLI_PATH = path.resolve(__dirname, "../../cli/index.js");
const FIXTURE_DIR = path.resolve(__dirname, "../../../fixtures/next-ddd");

type CliResult = ReturnType<typeof spawnSync>;

function runCli(args: string[], cwd?: string): CliResult {
  return spawnSync(process.execPath, [CLI_PATH, ...args], {
    cwd,
    encoding: "utf8",
  });
}

suite("CLI execution", () => {
  test("check emits JSON and exits non-zero when violations exist", () => {
    const result = runCli(["check", "--root", FIXTURE_DIR, "--format", "json"]);
    assert.ifError(result.error);
    assert.strictEqual(result.status, 1);
    assert.ok(result.stdout, "Expected JSON output on stdout");

    const stdout = typeof result.stdout === "string" ? result.stdout : result.stdout.toString("utf8");
    const report = JSON.parse(stdout);
    assert.ok(report.summary, "Expected report summary");
    assert.ok(report.summary.violations >= 1, "Expected at least one violation");
    assert.ok(report.summary.errors >= 1, "Expected at least one error");
    assert.ok(Array.isArray(report.violations), "Expected violations array");
  });

  test("check exits cleanly when no pickety.json exists", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pickety-cli-"));
    try {
      const result = runCli(["check", "--root", tempDir]);
      assert.ifError(result.error);
      assert.strictEqual(result.status, 0);
      assert.ok(result.stdout.includes("No pickety.json found. Skipping check."));
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
