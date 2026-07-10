import { describe, it, expect } from "vitest";
import { formatGithub } from "../src/report/github.js";
import type { Finding } from "../src/types.js";

describe("github format (workflow commands)", () => {
  it("emits ::error/::warning/::notice with escaped properties and a summary line", () => {
    const findings: Finding[] = [
      {
        ruleId: "AL001",
        ruleName: "broken-file-reference",
        severity: "error",
        file: "docs/A GENTS.md",
        line: 5,
        message: "リンク先ファイルが見つかりません: ./x.md\n(2 行目)",
      },
      {
        ruleId: "AL003",
        ruleName: "token-budget",
        severity: "warn",
        file: "CLAUDE.md",
        line: 1,
        message: "100% 超過",
      },
      {
        ruleId: "AL005",
        ruleName: "settings-schema",
        severity: "info",
        file: ".claude/settings.json",
        line: 1,
        message: "未知キー",
      },
    ];
    const out = formatGithub(findings, 3);
    const lines = out.split("\n");
    expect(lines[0]).toBe(
      "::error file=docs/A GENTS.md,line=5,title=agentslint AL001::リンク先ファイルが見つかりません: ./x.md%0A(2 行目)",
    );
    expect(lines[1]).toBe("::warning file=CLAUDE.md,line=1,title=agentslint AL003::100%25 超過");
    expect(lines[2]).toBe("::notice file=.claude/settings.json,line=1,title=agentslint AL005::未知キー");
    expect(lines[3]).toBe("1 errors, 1 warnings, 1 info / 3 files scanned");
  });

  it("emits only the summary line when there are no findings", () => {
    expect(formatGithub([], 0)).toBe("0 errors, 0 warnings, 0 info / 0 files scanned");
  });
});
