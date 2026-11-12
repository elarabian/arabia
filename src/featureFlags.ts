export const featureFlags = {
  tiktokEnabled: import.meta.env?.VITE_TIKTOK_ENABLED !== 'false',
} as const;
