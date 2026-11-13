export type LiveActionKind = 'whip' | 'burial' | 'hell' | 'bomb' | 'camel';
export type LiveAction = { kind: LiveActionKind; targetId?: string };
export type NamedViewer = { id: string; name: string; handle?: string };

const foldName = (value: string) => value.normalize('NFKD').toLocaleLowerCase('tr-TR')
  .replace(/\p{M}/gu, '').replace(/ı/g, 'i').trim();

export function normalizeChat(value: string) {
  return foldName(value).replace(/[^\p{L}\p{N}_.]+/gu, ' ').trim();
}

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const matchesName = (message: string, token: string) => token !== '' && new RegExp(
  `(?:^|[^\\p{L}\\p{N}_.])${token.split(/\s+/).map(escapeRegex).join('\\s+')}(?=$|[^\\p{L}\\p{N}_.])`,
  'u',
).test(message);

const keywords: { kind: LiveActionKind; pattern: RegExp }[] = [
  { kind: 'whip', pattern: /\bkirbac[a-z]*\b/g },
  { kind: 'hell', pattern: /\bcehennem[a-z]*\b/g },
  { kind: 'burial', pattern: /\bgom(?:me|mek|un|sun|ulsun|eyim|elim|du|er|ecek)?[a-z]*\b/g },
  { kind: 'bomb', pattern: /\b(?:patlat[a-z]*|bomba[a-z]*)\b/g },
  { kind: 'camel', pattern: /\bdeve(?:ye\s*bin|\s+bin)[a-z]*\b/g },
];

export function parseLiveAction(message: string, senderId: string, viewers: NamedViewer[]): LiveAction | null {
  const foldedMessage = foldName(message);
  let command: { kind: LiveActionKind; index: number; end: number } | null = null;
  for (const { kind, pattern } of keywords) {
    pattern.lastIndex = 0;
    const match = pattern.exec(foldedMessage);
    if (match && (!command || match.index < command.index)) command = { kind, index: match.index, end: match.index + match[0].length };
  }
  if (!command) return null;
  if (command.kind === 'bomb') return { kind: 'bomb' };
  const findMention = (nickname: string) => viewers.flatMap(viewer => [viewer.name, viewer.handle ?? '', viewer.id]
    .flatMap(value => [
      { viewer, token: foldName(value), exact: true },
      { viewer, token: normalizeChat(value), exact: false },
    ]))
    .filter(candidate => matchesName(candidate.exact ? nickname : normalizeChat(nickname), candidate.token))
    // A shorter name must not steal a longer decorated nickname's match.
    .sort((a, b) => b.token.length - a.token.length || Number(b.exact) - Number(a.exact))[0];
  // Extract the argument after the command first; keep older "Ela'yı göm" phrasing working too.
  const named = findMention(foldedMessage.slice(command.end).trim())
    ?? findMention(foldedMessage.slice(0, command.index).trim());
  const targetId = named?.viewer.id ?? senderId;
  return { kind: command.kind, targetId };
}
