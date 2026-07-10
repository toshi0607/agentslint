import { describe, it, expect } from "vitest";
import { al005 } from "../../src/rules/al005-settings-schema.js";
import { fixturePath, loadFileContext, makeRuleContext } from "../helpers.js";

describe("AL005 settings-schema", () => {
  it("produces no finding for the valid settings.json fixture", async () => {
    const file = await loadFileContext(
      fixturePath("valid", ".claude", "settings.json"),
      ".claude/settings.json",
      "settings",
    );
    const findings = al005.check(makeRuleContext(file));
    expect(findings).toHaveLength(0);
  });

  it("detects type violations and unknown top-level key in broken fixture", async () => {
    const file = await loadFileContext(
      fixturePath("broken", ".claude", "settings.json"),
      ".claude/settings.json",
      "settings",
    );
    const findings = al005.check(makeRuleContext(file));
    expect(findings.length).toBeGreaterThanOrEqual(3);
    expect(findings.some((f) => f.message.includes("permissions.allow"))).toBe(true);
    expect(findings.some((f) => f.message.includes("model"))).toBe(true);
    const unknownKeyFinding = findings.find((f) => f.message.includes("futureFeatureFlag"));
    expect(unknownKeyFinding).toBeDefined();
    expect(unknownKeyFinding?.severity).toBe("info");
  });

  it("reports error for invalid JSON", async () => {
    const file = await loadFileContext(
      fixturePath("valid", ".claude", "settings.json"),
      ".claude/settings.json",
      "settings",
    );
    const brokenJsonFile = { ...file, content: "{ not valid json " };
    const findings = al005.check(makeRuleContext(brokenJsonFile));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe("error");
    expect(findings[0]?.message).toContain("JSON");
  });
});
