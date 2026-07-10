import path from "node:path";
import type { Finding, Rule, RuleContext, Severity } from "../types.js";

const RULE_ID = "AL004";
const RULE_NAME = "skill-frontmatter";

const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const NAME_MAX_LENGTH = 64;
const DESCRIPTION_MAX_LENGTH = 1024;

function makeFinding(severity: Severity, relPath: string, line: number, message: string): Finding {
  return { ruleId: RULE_ID, ruleName: RULE_NAME, severity, file: relPath, line, message };
}

export const al004: Rule = {
  id: RULE_ID,
  name: RULE_NAME,
  defaultSeverity: "error",
  appliesTo: ["skill"],
  check(ctx: RuleContext): Finding[] {
    const { file, config } = ctx;
    const severity = config.severity;
    const findings: Finding[] = [];

    const fm = file.frontmatter;
    if (!fm || !fm.present) {
      return [makeFinding(severity, file.relPath, 1, "Missing frontmatter (leading --- ... --- block)")];
    }
    if (fm.error) {
      return [
        makeFinding(
          severity,
          file.relPath,
          1,
          `Failed to parse frontmatter YAML: ${fm.error.message}`,
        ),
      ];
    }

    const data = fm.data ?? {};
    // frontmatter ブロックの直後(--- の次の行)を本文開始行として使う。
    // frontmatter 自体のフィールドはこの近辺として 1 行目にまとめて報告する
    // (YAML の各キーの正確な行番号は取得していないため)。
    const line = 1;

    // name
    const nameRaw = data["name"];
    if (nameRaw === undefined || nameRaw === null || nameRaw === "") {
      findings.push(makeFinding(severity, file.relPath, line, 'frontmatter "name" is required'));
    } else if (typeof nameRaw !== "string") {
      findings.push(
        makeFinding(
          severity,
          file.relPath,
          line,
          `frontmatter "name" must be a string (got: ${typeof nameRaw})`,
        ),
      );
    } else {
      const name = nameRaw;
      if (!NAME_RE.test(name)) {
        findings.push(
          makeFinding(
            severity,
            file.relPath,
            line,
            `frontmatter "name" ("${name}") must match ^[a-z0-9]+(-[a-z0-9]+)*$`,
          ),
        );
      }
      if (name.length > NAME_MAX_LENGTH) {
        findings.push(
          makeFinding(
            severity,
            file.relPath,
            line,
            `frontmatter "name" exceeds ${NAME_MAX_LENGTH} characters (${name.length})`,
          ),
        );
      }
      const parentDirName = path.basename(path.dirname(file.absPath));
      if (name !== parentDirName) {
        findings.push(
          makeFinding(
            "warn",
            file.relPath,
            line,
            `frontmatter "name" ("${name}") does not match the parent directory name ("${parentDirName}")`,
          ),
        );
      }
    }

    // description
    const descRaw = data["description"];
    if (descRaw === undefined || descRaw === null) {
      findings.push(makeFinding(severity, file.relPath, line, 'frontmatter "description" is required'));
    } else if (typeof descRaw !== "string") {
      findings.push(
        makeFinding(
          severity,
          file.relPath,
          line,
          `frontmatter "description" must be a string (got: ${typeof descRaw})`,
        ),
      );
    } else if (descRaw.trim() === "") {
      findings.push(makeFinding(severity, file.relPath, line, 'frontmatter "description" is required'));
    } else {
      const description = descRaw;
      if (description.length > DESCRIPTION_MAX_LENGTH) {
        findings.push(
          makeFinding(
            severity,
            file.relPath,
            line,
            `frontmatter "description" exceeds ${DESCRIPTION_MAX_LENGTH} characters (${description.length})`,
          ),
        );
      }
    }

    return findings;
  },
};
