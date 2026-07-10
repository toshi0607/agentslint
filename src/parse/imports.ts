import type { Root } from "mdast";
import { extractPlainText, resolveLineInSpan } from "./markdown.js";

export interface ImportToken {
  /** @ を除いたパス部分。例: "./docs/x.md", "docs/x.md", "../x.md" */
  path: string;
  /** ファイル内での 1 始まり行番号。 */
  line: number;
  /** マッチした元のトークン全体(@ を含む)。 */
  raw: string;
}

/**
 * @import トークンにマッチする正規表現。
 * 対象形式:
 *   (a) @./x.ext, @../x.ext   — 明示的な相対パスプレフィックス。拡張子は任意。
 *   (b) @name.ext             — プレフィックスなし単一セグメント。拡張子は doc 系のみ。
 *   (c) @dir/.../name.ext     — プレフィックスなし複数セグメント。拡張子は doc 系のみ。
 * "~/" 始まりや "*" を含むものは呼び出し側でスキップする。
 *
 * (b)(c) の拡張子を doc 系(.md/.mdx/.markdown/.txt)に絞っているのは、任意拡張子を許すと
 * npm scoped package(@scope/pkg.js 等)を import トークンとして誤検知するため
 * (誤検知ゼロを最優先する方針)。(c) はさらに、先頭セグメントが実在するディレクトリかどうかを
 * 呼び出し側(al001)で確認し、実在しない場合は npm scoped package と区別不能として黙って無視する。
 *
 * 左境界(`(?<=^|\s)`)も必須にしている。"foo@bar/baz.md" のように語の途中に現れる "@" は
 * メールアドレス断片等の可能性が高く、import トークンとして扱わない。
 */
const PATH_SEGMENT_CHARS = String.raw`[A-Za-z0-9_./-]`;
const DOC_EXT = String.raw`\.(?:md|mdx|markdown|txt)`;
const IMPORT_TOKEN_RE = new RegExp(
  String.raw`(?<=^|\s)@(` +
    String.raw`\.\.?/${PATH_SEGMENT_CHARS}*\.[A-Za-z0-9]{1,10}` + // (a)
    String.raw`|[A-Za-z0-9_-]+/${PATH_SEGMENT_CHARS}*${DOC_EXT}` + // (c)
    String.raw`|[A-Za-z0-9_-]+${DOC_EXT}` + // (b)
    `)`,
  "g",
);

/**
 * CLAUDE.md の本文(コードブロック外の text ノードのみ)から @import トークンを抽出する。
 * "~/" 始まりのホームディレクトリ参照と "*" を含む(glob 等)トークンはスキップする。
 */
export function extractImportTokens(tree: Root): ImportToken[] {
  const tokens: ImportToken[] = [];
  for (const span of extractPlainText(tree)) {
    for (const match of span.value.matchAll(IMPORT_TOKEN_RE)) {
      const path = match[1];
      if (path === undefined) continue;
      if (path.startsWith("~/")) continue;
      if (path.includes("*")) continue;
      const line = resolveLineInSpan(span, match.index ?? 0);
      tokens.push({ path, line, raw: match[0] });
    }
  }
  return tokens;
}
