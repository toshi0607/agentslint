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
      return [makeFinding(severity, file.relPath, 1, "frontmatter(先頭の --- ... ---)が見つかりません")];
    }
    if (fm.error) {
      return [
        makeFinding(
          severity,
          file.relPath,
          1,
          `frontmatter の YAML パースに失敗しました: ${fm.error.message}`,
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
      findings.push(makeFinding(severity, file.relPath, line, "frontmatter に name が必須です"));
    } else if (typeof nameRaw !== "string") {
      findings.push(
        makeFinding(
          severity,
          file.relPath,
          line,
          `frontmatter の name は文字列である必要があります(実際の型: ${typeof nameRaw})`,
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
            `frontmatter の name "${name}" は ^[a-z0-9]+(-[a-z0-9]+)*$ 形式である必要があります`,
          ),
        );
      }
      if (name.length > NAME_MAX_LENGTH) {
        findings.push(
          makeFinding(
            severity,
            file.relPath,
            line,
            `frontmatter の name が ${NAME_MAX_LENGTH} 文字を超えています(${name.length} 文字)`,
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
            `frontmatter の name "${name}" が親ディレクトリ名 "${parentDirName}" と一致しません`,
          ),
        );
      }
    }

    // description
    const descRaw = data["description"];
    if (descRaw === undefined || descRaw === null) {
      findings.push(makeFinding(severity, file.relPath, line, "frontmatter に description が必須です"));
    } else if (typeof descRaw !== "string") {
      findings.push(
        makeFinding(
          severity,
          file.relPath,
          line,
          `frontmatter の description は文字列である必要があります(実際の型: ${typeof descRaw})`,
        ),
      );
    } else if (descRaw.trim() === "") {
      findings.push(makeFinding(severity, file.relPath, line, "frontmatter に description が必須です"));
    } else {
      const description = descRaw;
      if (description.length > DESCRIPTION_MAX_LENGTH) {
        findings.push(
          makeFinding(
            severity,
            file.relPath,
            line,
            `frontmatter の description が ${DESCRIPTION_MAX_LENGTH} 文字を超えています(${description.length} 文字)`,
          ),
        );
      }
    }

    return findings;
  },
};
