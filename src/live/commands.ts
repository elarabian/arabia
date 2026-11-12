export type LiveActionKind = 'whip' | 'burial' | 'hell' | 'bomb';
export type LiveAction = { kind: LiveActionKind; targetId?: string };
export type NamedViewer = { id: string; name: string; handle?: string };

export function normalizeChat(value: string) {
  return value.toLocaleLowerCase('tr-TR').normalize('NFD')
    .replace(/\p{M}/gu, '').replace(/ı/g, 'i')
    .replace(/[^a-z0-9_.]+/g, ' ').trim();
}

const keywords: { kind: LiveActionKind; pattern: RegExp }[] = [
  { kind: 'whip', pattern: /\bkirbac[a-z]*\b/g },
  { kind: 'hell', pattern: /\bcehennem[a-z]*\b/g },
  { kind: 'burial', pattern: /\bgom(?:me|mek|un|sun|ulsun|eyim|elim|du|er|ecek)?[a-z]*\b/g },
  { kind: 'bomb', pattern: /\b(?:patlat[a-z]*|bomba[a-z]*)\b/g },
];

export function parseLiveAction(message: string, senderId: string, viewers: NamedViewer[]): LiveAction | null {
  const text = normalizeChat(message);
  let command: { kind: LiveActionKind; index: number } | null = null;
  for (const { kind, pattern } of keywords) {
    pattern.lastIndex = 0;
    const match = pattern.exec(text);
    if (match && (!command || match.index < command.index)) command = { kind, index: match.index };
  }
  if (!command) return null;
  if (command.kind === 'bomb') return { kind: 'bomb' };
  const paddedText = ` ${text} `;
  const named = viewers.flatMap(viewer => [viewer.name, viewer.handle ?? '', viewer.id]
    .map(value => ({ viewer, token: normalizeChat(value) })))
    .filter(candidate => candidate.token && paddedText.includes(` ${candidate.token} `))
    .sort((a, b) => b.token.length - a.token.length)[0];
  const targetId = named?.viewer.id ?? senderId;
  return { kind: command.kind, targetId };
}
