import { describe, it, expect } from "vitest";
import { al001 } from "../../src/rules/al001-broken-file-reference.js";
import { fixturePath, loadFileContext, makeRuleContext } from "../helpers.js";

describe("AL001 broken-file-reference", () => {
  it("produces no finding for the valid AGENTS.md fixture", async () => {
    const file = await loadFileContext(fixturePath("valid", "AGENTS.md"), "AGENTS.md", "agents-md");
    const findings = al001.check(makeRuleContext(file));
    expect(findings).toHaveLength(0);
  });

  it("produces no finding for the valid CLAUDE.md fixture (@import resolves)", async () => {
    const file = await loadFileContext(fixturePath("valid", "CLAUDE.md"), "CLAUDE.md", "claude-md");
    const findings = al001.check(makeRuleContext(file));
    expect(findings).toHaveLength(0);
  });

  it("detects a broken relative markdown link in AGENTS.md", async () => {
    const file = await loadFileContext(fixturePath("broken", "AGENTS.md"), "AGENTS.md", "agents-md");
    const findings = al001.check(makeRuleContext(file));
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings[0]?.ruleId).toBe("AL001");
    expect(findings[0]?.severity).toBe("error");
    expect(findings.some((f) => f.message.includes("does-not-exist.md"))).toBe(true);
  });

  it("detects a broken @import target in CLAUDE.md", async () => {
    const file = await loadFileContext(fixturePath("broken", "CLAUDE.md"), "CLAUDE.md", "claude-md");
    const findings = al001.check(makeRuleContext(file));
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings.some((f) => f.message.includes("does-not-exist-either.md"))).toBe(true);
  });

  it("skips http/https/mailto/anchor links", async () => {
    const file = await loadFileContext(fixturePath("valid", "AGENTS.md"), "AGENTS.md", "agents-md");
    // valid/AGENTS.md contains an https:// link and a #anchor link; neither should be flagged.
    const findings = al001.check(makeRuleContext(file));
    expect(findings).toHaveLength(0);
  });
});
