// Vite includes generated clips automatically in development and production builds.
export const dialogueAssets = import.meta.glob(['../../sounds/*.mp3', '!../../sounds/*background.mp3', '!../../sounds/hero.mp3', '!../../sounds/bomb.mp3', '!../../sounds/*-preview.mp3', '!../../sounds/voice-comparison.mp3'], {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string,string>;
