import { describe, it, expect } from "vitest";
import { al004 } from "../../src/rules/al004-skill-frontmatter.js";
import { fixturePath, loadFileContext, makeRuleContext } from "../helpers.js";

describe("AL004 skill-frontmatter", () => {
  it("produces no finding for the valid demo-skill fixture", async () => {
    const file = await loadFileContext(
      fixturePath("valid", ".claude", "skills", "demo-skill", "SKILL.md"),
      ".claude/skills/demo-skill/SKILL.md",
      "skill",
    );
    const findings = al004.check(makeRuleContext(file));
    expect(findings).toHaveLength(0);
  });

  it("detects invalid name pattern and missing description in bad-skill fixture", async () => {
    const file = await loadFileContext(
      fixturePath("broken", ".claude", "skills", "bad-skill", "SKILL.md"),
      ".claude/skills/bad-skill/SKILL.md",
      "skill",
    );
    const findings = al004.check(makeRuleContext(file));
    expect(findings.length).toBeGreaterThanOrEqual(2);
    expect(findings.every((f) => f.ruleId === "AL004")).toBe(true);
    expect(findings.some((f) => f.message.includes("^[a-z0-9]"))).toBe(true);
    expect(findings.some((f) => f.message.includes("description"))).toBe(true);
  });

  it("reports parent-directory mismatch as a warn-severity finding", async () => {
    const file = await loadFileContext(
      fixturePath("broken", ".claude", "skills", "bad-skill", "SKILL.md"),
      ".claude/skills/bad-skill/SKILL.md",
      "skill",
    );
    const findings = al004.check(makeRuleContext(file));
    const mismatch = findings.find((f) => f.message.includes("parent directory"));
    expect(mismatch).toBeDefined();
    expect(mismatch?.severity).toBe("warn");
  });

  it("reports error when frontmatter block is missing entirely", async () => {
    const file = await loadFileContext(
      fixturePath("valid", ".claude", "skills", "demo-skill", "SKILL.md"),
      ".claude/skills/demo-skill/SKILL.md",
      "skill",
    );
    const noFrontmatterFile = { ...file, frontmatter: { present: false, blockLineCount: 0 } };
    const findings = al004.check(makeRuleContext(noFrontmatterFile));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe("error");
    expect(findings[0]?.message).toContain("frontmatter");
  });

  it("reports error when frontmatter YAML fails to parse", async () => {
    const file = await loadFileContext(
      fixturePath("valid", ".claude", "skills", "demo-skill", "SKILL.md"),
      ".claude/skills/demo-skill/SKILL.md",
      "skill",
    );
    const badYamlFile = {
      ...file,
      frontmatter: { present: true, blockLineCount: 2, error: new Error("boom") },
    };
    const findings = al004.check(makeRuleContext(badYamlFile));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe("error");
    expect(findings[0]?.message).toContain("parse");
  });
});
