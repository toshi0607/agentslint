import { describe, it, expect } from "vitest";
import { al001 } from "../src/rules/al001-broken-file-reference.js";
import { al002 } from "../src/rules/al002-stale-command.js";
import { al004 } from "../src/rules/al004-skill-frontmatter.js";
import { estimateTokens } from "../src/rules/al003-token-budget.js";
import { matchesIgnoreGlob } from "../src/config.js";
import { fixturePath, loadFileContext, makeRuleContext } from "./helpers.js";

// コードレビュー指摘(H1/H2/M1/M2/L1/L2/L3)の再現ケースを固定する回帰テスト。
describe("regression: review findings", () => {
  describe("H1: AL001 must not flag percent-encoded links to existing files", () => {
    it("accepts ./docs/my%20file.md pointing at a real 'my file.md'", async () => {
      const file = await loadFileContext(
        fixturePath("regression", "percent", "AGENTS.md"),
        "AGENTS.md",
        "agents-md",
      );
      const findings = al001.check(makeRuleContext(file));
      expect(findings).toHaveLength(0);
    });
  });

  describe("H2: AL001 @import must not fire on prose / scoped packages / mid-word '@'", () => {
    it("reports nothing for scoped packages, mid-word '@', and email-like tokens", async () => {
      const file = await loadFileContext(
        fixturePath("regression", "prose", "CLAUDE.md"),
        "CLAUDE.md",
        "claude-md",
      );
      const findings = al001.check(makeRuleContext(file));
      expect(findings).toHaveLength(0);
    });

    it("still reports @./x, @dir/x (existing dir), and @single-segment.md imports", async () => {
      const file = await loadFileContext(
        fixturePath("regression", "imports", "CLAUDE.md"),
        "CLAUDE.md",
        "claude-md",
      );
      const findings = al001.check(makeRuleContext(file));
      const messages = findings.map((f) => f.message);
      expect(messages.some((m) => m.includes("@./missing.md"))).toBe(true);
      expect(messages.some((m) => m.includes("@docs/missing.md"))).toBe(true);
      expect(messages.some((m) => m.includes("@AGENTS.md"))).toBe(true);
      expect(findings).toHaveLength(3);
    });
  });

  describe("M1: AL002 must only match at command position", () => {
    it("skips shell comments and string literals, keeps real commands", async () => {
      const file = await loadFileContext(
        fixturePath("regression", "commands", "AGENTS.md"),
        "AGENTS.md",
        "agents-md",
      );
      const findings = al002.check(makeRuleContext(file, { severity: "warn" }));
      const messages = findings.map((f) => f.message);
      expect(messages.some((m) => m.includes("definitely-missing"))).toBe(true);
      expect(messages.some((m) => m.includes("also-missing"))).toBe(true);
      expect(messages.some((m) => m.includes('"npm run deploy"'))).toBe(false);
      expect(findings).toHaveLength(2);
    });
  });

  describe("M2: ignore glob matching must be linear (no ReDoS)", () => {
    it("returns quickly on many '**/' segments vs a deep non-matching path", () => {
      // 旧実装(regex 連結)ではこの組み合わせが約 86 秒かかった。
      // vitest のデフォルトタイムアウト内に完了すること自体が回帰テスト。
      const pattern = "**/**/**/**/**/**/**/**/x";
      const deepPath = `${"a/".repeat(30)}y`;
      expect(matchesIgnoreGlob(deepPath, pattern)).toBe(false);
    });

    it("keeps glob semantics", () => {
      expect(matchesIgnoreGlob("fixtures/valid/AGENTS.md", "fixtures/**")).toBe(true);
      expect(matchesIgnoreGlob(".claude/settings.json", "**/settings.json")).toBe(true);
      expect(matchesIgnoreGlob("a/b/settings.json", "**/settings.json")).toBe(true);
      expect(matchesIgnoreGlob("README.md", "*.md")).toBe(true);
      expect(matchesIgnoreGlob("docs/README.md", "*.md")).toBe(false);
      expect(matchesIgnoreGlob("docs/a.md", "docs/*")).toBe(true);
      expect(matchesIgnoreGlob("docs/sub/a.md", "docs/*")).toBe(false);
      expect(matchesIgnoreGlob("anything/at/all.txt", "**")).toBe(true);
    });
  });

  describe("L1: AL004 must reject non-string name/description with dedicated errors", () => {
    it("reports type errors for name: true and description: [array]", async () => {
      const skillPath = fixturePath(
        "regression",
        "skills",
        ".claude",
        "skills",
        "type-check",
        "SKILL.md",
      );
      const file = await loadFileContext(skillPath, ".claude/skills/type-check/SKILL.md", "skill");
      const findings = al004.check(makeRuleContext(file));
      const typeErrors = findings.filter((f) => f.message.includes("must be a string"));
      expect(typeErrors).toHaveLength(2);
      expect(typeErrors.every((f) => f.severity === "error")).toBe(true);
    });
  });

  describe("L2: AL003 token estimate counts Hangul and CJK Ext-A as CJK", () => {
    it("counts each Hangul/Ext-A character as one token", () => {
      expect(estimateTokens("가나다")).toBe(3);
      expect(estimateTokens("㐀㐁")).toBe(2);
      expect(estimateTokens("abcd")).toBe(1);
    });
  });

  describe("L3: AL001 checks reference-style link definitions", () => {
    it("reports a broken [ref]: ./missing.md definition", async () => {
      const file = await loadFileContext(
        fixturePath("regression", "reflinks", "AGENTS.md"),
        "AGENTS.md",
        "agents-md",
      );
      const findings = al001.check(makeRuleContext(file));
      expect(findings).toHaveLength(1);
      expect(findings[0]?.message).toContain("missing-ref-target.md");
      expect(findings[0]?.line).toBe(5);
    });
  });
});

describe("AL005: real-world settings keys must not be flagged as unknown", () => {
  it("accepts official schema keys without any finding", async () => {
    const { al005 } = await import("../src/rules/al005-settings-schema.js");
    const content = JSON.stringify({
      $schema: "https://www.schemastore.org/claude-code-settings.json",
      model: "claude-sonnet-5",
      includeCoAuthoredBy: false,
      cleanupPeriodDays: 30,
      statusLine: { type: "command", command: "echo hi" },
      permissions: { allow: ["Bash(npm run:*)"] },
      env: { NODE_ENV: "test" },
      enableAllProjectMcpServers: true,
    });
    const file = {
      kind: "settings" as const,
      relPath: ".claude/settings.json",
      absPath: "/tmp/x/.claude/settings.json",
      content,
    };
    const findings = al005.check(makeRuleContext(file));
    expect(findings).toHaveLength(0);
  });
});
