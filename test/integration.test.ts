import { describe, it, expect } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const CLI_PATH = path.join(REPO_ROOT, "dist", "cli.js");
const VALID_FIXTURE_DIR = path.join(REPO_ROOT, "fixtures", "valid");
const BROKEN_FIXTURE_DIR = path.join(REPO_ROOT, "fixtures", "broken");

interface CliResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * ビルド済み CLI をサブプロセスとして実行する。
 * cwd を fixture ディレクトリ自体にすることで、リポジトリルートの
 * .agentslintrc.json({"ignore": ["fixtures/**"]})の影響を受けないようにする。
 */
async function runCli(args: string[], cwd: string): Promise<CliResult> {
  try {
    const { stdout, stderr } = await execFileAsync("node", [CLI_PATH, ...args], { cwd });
    return { stdout, stderr, exitCode: 0 };
  } catch (err) {
    const execErr = err as { stdout?: string; stderr?: string; code?: number };
    return {
      stdout: execErr.stdout ?? "",
      stderr: execErr.stderr ?? "",
      exitCode: execErr.code ?? 1,
    };
  }
}

describe("integration: discover -> lint -> format", () => {
  it("valid fixture: pretty format reports zero findings and exit code 0", async () => {
    const result = await runCli([], VALID_FIXTURE_DIR);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("No findings");
    expect(result.stdout).toContain("0 errors, 0 warnings, 0 info");
  });

  it("broken fixture: pretty format reports findings for all of AL001-AL005 and exit code 1", async () => {
    const result = await runCli([], BROKEN_FIXTURE_DIR);
    expect(result.exitCode).toBe(1);
    for (const ruleId of ["AL001", "AL002", "AL003", "AL004", "AL005"]) {
      expect(result.stdout).toContain(ruleId);
    }
  });

  it("broken fixture: json format produces valid JSON with findings and summary", async () => {
    const result = await runCli(["--format", "json"], BROKEN_FIXTURE_DIR);
    expect(result.exitCode).toBe(1);
    const parsed = JSON.parse(result.stdout) as {
      findings: unknown[];
      summary: { errors: number; warnings: number; info: number; filesScanned: number };
    };
    expect(Array.isArray(parsed.findings)).toBe(true);
    expect(parsed.findings.length).toBeGreaterThan(0);
    expect(parsed.summary.errors).toBeGreaterThan(0);
    expect(parsed.summary.filesScanned).toBeGreaterThan(0);
  });

  it("valid fixture: json format produces zero findings", async () => {
    const result = await runCli(["--format", "json"], VALID_FIXTURE_DIR);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as { findings: unknown[] };
    expect(parsed.findings).toHaveLength(0);
  });

  it("broken fixture: sarif format produces valid SARIF 2.1.0 JSON", async () => {
    const result = await runCli(["--format", "sarif"], BROKEN_FIXTURE_DIR);
    expect(result.exitCode).toBe(1);
    const parsed = JSON.parse(result.stdout) as {
      version: string;
      runs: Array<{
        tool: { driver: { name: string; rules: unknown[] } };
        results: Array<{
          ruleId: string;
          level: string;
          message: { text: string };
          locations: Array<{
            physicalLocation: { artifactLocation: { uri: string }; region: { startLine: number } };
          }>;
        }>;
      }>;
    };
    expect(parsed.version).toBe("2.1.0");
    expect(parsed.runs[0]?.tool.driver.name).toBe("agentslint");
    expect(parsed.runs[0]?.tool.driver.rules.length).toBe(5);
    expect(parsed.runs[0]?.results.length).toBeGreaterThan(0);
    const firstResult = parsed.runs[0]?.results[0];
    expect(firstResult?.ruleId).toMatch(/^AL00[1-5]$/);
    expect(["error", "warning", "note"]).toContain(firstResult?.level);
    expect(firstResult?.locations[0]?.physicalLocation.artifactLocation.uri).toBeTruthy();
    expect(firstResult?.locations[0]?.physicalLocation.region.startLine).toBeGreaterThanOrEqual(1);
  });

  it("reports 'no target files' on stderr with exit 0 when nothing is found", async () => {
    const result = await runCli([], path.join(REPO_ROOT, "fixtures", "valid", "docs"));
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain("No target files found");
  });

  it("exits 2 on a broken --config file", async () => {
    const result = await runCli(["--config", "does-not-exist.json"], VALID_FIXTURE_DIR);
    expect(result.exitCode).toBe(2);
  });

  it("exits 2 on an invalid --format value", async () => {
    const result = await runCli(["--format", "yaml"], VALID_FIXTURE_DIR);
    expect(result.exitCode).toBe(2);
  });
});
