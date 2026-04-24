export function trimJoin(lines: string[], sep: string): string {
  return lines.map((l) => l.replace(/\n{3,}/g, "\n\n").trim()).filter(Boolean).join(sep);
}
