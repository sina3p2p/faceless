/**
 * Minimal YAML frontmatter parse for `---\n ... \n---\n` skill markdown files.
 */
export type ParsedSkillMd = { body: string; id?: string };

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;

export function parseSkillMarkdown(raw: string): ParsedSkillMd {
  const m = raw.trim().match(FRONTMATTER_RE);
  if (!m) {
    return { body: raw.trim() };
  }
  const front = m[1];
  const body = m[2].trim();
  let id: string | undefined;
  for (const line of front.split("\n")) {
    const k = line.match(/^\s*id:\s*(.+)\s*$/);
    if (k) {
      id = k[1].replace(/^["']|["']$/g, "").trim();
      break;
    }
  }
  return { body, id };
}
