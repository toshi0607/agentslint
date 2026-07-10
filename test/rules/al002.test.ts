import { describe, it, expect } from "vitest";
import { al002 } from "../../src/rules/al002-stale-command.js";
import { fixturePath, loadFileContext, makeRuleContext } from "../helpers.js";

describe("AL002 stale-command", () => {
  it("produces no finding for the valid AGENTS.md fixture (all npm scripts exist)", async () => {
    const file = await loadFileContext(fixturePath("valid", "AGENTS.md"), "AGENTS.md", "agents-md");
    const findings = al002.check(
      makeRuleContext(file, { severity: "warn", rootDir: fixturePath("valid") }),
    );
    expect(findings).toHaveLength(0);
  });

  it("detects a stale npm run command in the broken fixture", async () => {
    const file = await loadFileContext(fixturePath("broken", "AGENTS.md"), "AGENTS.md", "agents-md");
    const findings = al002.check(
      makeRuleContext(file, { severity: "warn", rootDir: fixturePath("broken") }),
    );
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings[0]?.ruleId).toBe("AL002");
    expect(findings[0]?.severity).toBe("warn");
    expect(findings.some((f) => f.message.includes("deploy-nonexistent"))).toBe(true);
  });

  it("skips npm run commands when no package.json is found upward", async () => {
    // rootDir と fileDir が同じ場所を指すが、package.json が存在しない一時的な状況を
    // 模すため、fixtures ルート直下(package.json なし)を使う。
    const file = await loadFileContext(
      fixturePath("broken", "AGENTS.md"),
      "AGENTS.md",
      "agents-md",
    );
    // rootDir を fixtures 直下(package.json が存在しない階層より上)にして、
    // findUpward の探索が package.json を見つけられないケースを確認する。
    const noManifestFile = { ...file, absPath: fixturePath("no-manifest-dir", "AGENTS.md") };
    const findings = al002.check(
      makeRuleContext(noManifestFile, { severity: "warn", rootDir: fixturePath() }),
    );
    // package.json が見つからない場合、npm/pnpm/yarn 系コマンドはスキップされ finding は出ない。
    expect(findings).toHaveLength(0);
  });
});
