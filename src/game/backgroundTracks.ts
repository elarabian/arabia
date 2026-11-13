const files = import.meta.glob('../../sounds/{background,bacgkround}*.mp3', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

export const backgroundTracks = Object.entries(files).flatMap(([path, url]) => {
  const file = path.split('/').pop() ?? '';
  const match = /^(?:background|bacgkround)(?:_(\d+))?\.mp3$/i.exec(file);
  if (!match) return [];
  const number = Number(match[1] ?? 1);
  if (number < 1 || number > 6) return [];
  return [{ id: number === 1 ? 'background' : `background_${number}`, number, file, url }];
}).sort((a, b) => a.number - b.number || a.file.localeCompare(b.file));

export const defaultBackgroundTrack = 'background';

export function isAvailableBackgroundTrack(id: string): boolean {
  return backgroundTracks.some(track => track.id === id);
}
