import { al001 } from "./al001-broken-file-reference.js";
import { al002 } from "./al002-stale-command.js";
import { al003 } from "./al003-token-budget.js";
import { al004 } from "./al004-skill-frontmatter.js";
import { al005 } from "./al005-settings-schema.js";
import type { Rule } from "../types.js";

export const rules: Rule[] = [al001, al002, al003, al004, al005];
