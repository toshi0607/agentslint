import type { Finding, Rule, RuleContext, Severity } from "../types.js";
import { KNOWN_SETTINGS_KEYS } from "./claude-settings-keys.js";

const RULE_ID = "AL005";
const RULE_NAME = "settings-schema";

const KNOWN_TOP_LEVEL_KEYS = new Set(KNOWN_SETTINGS_KEYS);
const PERMISSION_LIST_KEYS = ["allow", "deny", "ask"] as const;

function makeFinding(severity: Severity, relPath: string, line: number, message: string): Finding {
  return { ruleId: RULE_ID, ruleName: RULE_NAME, severity, file: relPath, line, message };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export const al005: Rule = {
  id: RULE_ID,
  name: RULE_NAME,
  defaultSeverity: "error",
  appliesTo: ["settings"],
  check(ctx: RuleContext): Finding[] {
    const { file, config } = ctx;
    const severity = config.severity;
    const findings: Finding[] = [];

    let parsed: unknown;
    try {
      parsed = JSON.parse(file.content);
    } catch (err) {
      return [
        makeFinding(severity, file.relPath, 1, `Failed to parse JSON: ${(err as Error).message}`),
      ];
    }

    if (!isPlainObject(parsed)) {
      return [makeFinding(severity, file.relPath, 1, "settings.json must be a JSON object")];
    }

    // permissions: object でその中の allow/deny/ask は string 配列
    if ("permissions" in parsed) {
      const permissions = parsed["permissions"];
      if (!isPlainObject(permissions)) {
        findings.push(makeFinding(severity, file.relPath, 1, "permissions must be an object"));
      } else {
        for (const key of PERMISSION_LIST_KEYS) {
          if (key in permissions && !isStringArray(permissions[key])) {
            findings.push(
              makeFinding(
                severity,
                file.relPath,
                1,
                `permissions.${key} must be an array of strings`,
              ),
            );
          }
        }
      }
    }

    // env: 値がすべて string の object
    if ("env" in parsed) {
      const env = parsed["env"];
      if (!isPlainObject(env)) {
        findings.push(makeFinding(severity, file.relPath, 1, "env must be an object"));
      } else {
        const nonStringKeys = Object.entries(env)
          .filter(([, value]) => typeof value !== "string")
          .map(([key]) => key);
        if (nonStringKeys.length > 0) {
          findings.push(
            makeFinding(
              severity,
              file.relPath,
              1,
              `env values must all be strings (offending keys: ${nonStringKeys.join(", ")})`,
            ),
          );
        }
      }
    }

    // model: string
    if ("model" in parsed) {
      if (typeof parsed["model"] !== "string") {
        findings.push(makeFinding(severity, file.relPath, 1, "model must be a string"));
      }
    }

    // hooks: object
    if ("hooks" in parsed) {
      if (!isPlainObject(parsed["hooks"])) {
        findings.push(makeFinding(severity, file.relPath, 1, "hooks must be an object"));
      }
    }

    // 未知のトップレベルキー → info
    for (const key of Object.keys(parsed)) {
      if (!KNOWN_TOP_LEVEL_KEYS.has(key)) {
        findings.push(
          makeFinding(
            "info",
            file.relPath,
            1,
            `Unknown top-level key "${key}" (it may be from a newer version)`,
          ),
        );
      }
    }

    return findings;
  },
};
