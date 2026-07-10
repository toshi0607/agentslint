import type { Finding, Rule, RuleContext } from "../types.js";

const RULE_ID = "AL003";
const RULE_NAME = "token-budget";
const DEFAULT_BUDGET = 4000;

/**
 * CJK 文字判定。
 * U+3000-U+30FF(CJK 記号・かな)、U+3400-U+4DBF(CJK 統合漢字拡張 A)、
 * U+4E00-U+9FFF(CJK 統合漢字)、U+AC00-U+D7AF(ハングル音節)、
 * U+F900-U+FAFF(CJK 互換漢字)、U+FF00-U+FFEF(全角/半角形)。
 */
function isCjk(codePoint: number): boolean {
  return (
    (codePoint >= 0x3000 && codePoint <= 0x30ff) ||
    (codePoint >= 0x3400 && codePoint <= 0x4dbf) ||
    (codePoint >= 0x4e00 && codePoint <= 0x9fff) ||
    (codePoint >= 0xac00 && codePoint <= 0xd7af) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
    (codePoint >= 0xff00 && codePoint <= 0xffef)
  );
}

/** 概算トークン数を計算する: CJK 文字数 + ceil(その他文字数 / 4)。 */
export function estimateTokens(content: string): number {
  let cjkCount = 0;
  let otherCount = 0;
  for (const ch of content) {
    const codePoint = ch.codePointAt(0) ?? 0;
    if (isCjk(codePoint)) {
      cjkCount += 1;
    } else {
      otherCount += 1;
    }
  }
  return cjkCount + Math.ceil(otherCount / 4);
}

export const al003: Rule = {
  id: RULE_ID,
  name: RULE_NAME,
  defaultSeverity: "warn",
  appliesTo: ["agents-md", "claude-md", "skill"],
  check(ctx: RuleContext): Finding[] {
    const { file, config } = ctx;
    const budgetRaw = config.options["budget"];
    const budget = typeof budgetRaw === "number" && budgetRaw > 0 ? budgetRaw : DEFAULT_BUDGET;

    const estimated = estimateTokens(file.content);
    if (estimated <= budget) return [];

    return [
      {
        ruleId: RULE_ID,
        ruleName: RULE_NAME,
        severity: config.severity,
        file: file.relPath,
        line: 1,
        message: `Estimated token count exceeds the budget (~${estimated} tokens vs budget ${budget}; this is an approximation, not an exact count)`,
      },
    ];
  },
};
