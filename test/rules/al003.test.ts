import { describe, it, expect } from "vitest";
import { al003, estimateTokens } from "../../src/rules/al003-token-budget.js";
import { fixturePath, loadFileContext, makeRuleContext } from "../helpers.js";

describe("AL003 token-budget", () => {
  it("estimates tokens as CJK count + ceil(other/4)", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcde")).toBe(2);
    expect(estimateTokens("あ")).toBe(1);
    expect(estimateTokens("漢字")).toBe(2);
  });

  it("produces no finding for the valid fixture", async () => {
    const file = await loadFileContext(
      fixturePath("valid", "AGENTS.md"),
      "AGENTS.md",
      "agents-md",
    );
    const findings = al003.check(makeRuleContext(file, { severity: "warn" }));
    expect(findings).toHaveLength(0);
  });

  it("produces a finding for the broken huge-skill fixture (over budget)", async () => {
    const file = await loadFileContext(
      fixturePath("broken", ".claude", "skills", "huge-skill", "SKILL.md"),
      ".claude/skills/huge-skill/SKILL.md",
      "skill",
    );
    const findings = al003.check(makeRuleContext(file, { severity: "warn" }));
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings[0]?.ruleId).toBe("AL003");
    expect(findings[0]?.severity).toBe("warn");
    expect(findings[0]?.message).toMatch(/近似/);
  });

  it("respects options.budget override", async () => {
    const file = await loadFileContext(
      fixturePath("valid", "AGENTS.md"),
      "AGENTS.md",
      "agents-md",
    );
    const findings = al003.check(
      makeRuleContext(file, { severity: "warn", ruleOptions: { budget: 1 } }),
    );
    expect(findings.length).toBeGreaterThanOrEqual(1);
  });
});
