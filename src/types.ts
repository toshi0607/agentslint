import type { Root } from "mdast";

/** Finding の重大度。SARIF の level・終了コード判定に使う。 */
export type Severity = "error" | "warn" | "info";

/** 対象ファイルの種別。ルールの appliesTo と discover の分類に使う。 */
export type FileKind =
  | "agents-md"
  | "claude-md"
  | "skill"
  | "settings";

/** 1 件の検知結果。 */
export interface Finding {
  ruleId: string;
  ruleName: string;
  severity: Severity;
  /** discover 時のルート(cwd)からの相対パス。常に POSIX 区切り(/)。 */
  file: string;
  /** 1 始まりの行番号。不明な場合は 1。 */
  line: number;
  message: string;
}

/** frontmatter のパース結果。存在しない/パース失敗時は undefined。 */
export interface FrontmatterResult {
  /** パース成功時の値。失敗時は undefined。 */
  data?: Record<string, unknown>;
  /** frontmatter ブロック自体が存在したか。 */
  present: boolean;
  /** YAML パースに失敗した場合のエラー。 */
  error?: Error;
  /** frontmatter ブロックが本文中で占める行数(--- を含む)。本文の開始行算出に使う。 */
  blockLineCount: number;
}

/** 1 ファイル分のコンテキスト。ルールの check() に渡す。 */
export interface FileContext {
  kind: FileKind;
  /** discover ルート(cwd)からの相対パス。POSIX 区切り。 */
  relPath: string;
  /** 絶対パス。ファイル参照の解決に使う。 */
  absPath: string;
  content: string;
  /** markdown ファイルの場合の remark AST。settings.json は undefined。 */
  md?: Root;
  frontmatter?: FrontmatterResult;
}

/** ルール個別の設定。off で無効化、severity で上書き、options はルール固有。 */
export type RuleConfigEntry =
  | "off"
  | "error"
  | "warn"
  | "info"
  | {
      severity?: Severity;
      options?: Record<string, unknown>;
    };

/** .agentslintrc.json のスキーマ。 */
export interface AgentslintConfig {
  rules?: Record<string, RuleConfigEntry>;
  ignore?: string[];
}

/** 解決済みのルール設定。ルールの check() から参照する。 */
export interface ResolvedRuleConfig {
  enabled: boolean;
  severity: Severity;
  options: Record<string, unknown>;
}

/** ルールが check() 実行時に利用できるコンテキスト。 */
export interface RuleContext {
  file: FileContext;
  /** このルールの解決済み設定(有効/severity/options)。 */
  config: ResolvedRuleConfig;
  /**
   * discover 済みの全対象ファイル一覧(絶対パス)。
   * AL002 のマニフェスト探索など、対象ファイル群全体を見る必要があるルール向け。
   */
  allFiles: FileContext[];
  /** discover のルートディレクトリ(絶対パス)。 */
  rootDir: string;
}

/** ルールのプラグイン契約。DESIGN.md §5 の interface に対応。 */
export interface Rule {
  id: string;
  name: string;
  defaultSeverity: Severity;
  appliesTo: FileKind[];
  check(ctx: RuleContext): Finding[];
}
