import type { GameEngine } from './game/gameEngine';
import { soundEngine } from './game/audio';
import { defaultBackgroundTrack, isAvailableBackgroundTrack } from './game/backgroundTracks';
import { isWorldMap, type WorldMap } from './game/worldMaps';

export const CONTROL_STORAGE_KEY = 'arabia.control.v1';
export const CONTROL_CHANNEL = 'arabia.control.v1';

export type ControlScene = 'WHIP' | 'BOMB' | 'BURIAL' | 'HELL' | 'TASBIH' | 'CAMEL' | 'PHARAOH' | 'NOAH';
export type ControlMap = WorldMap;

export interface ControlSnapshot {
  map: ControlMap;
  scene: ControlScene;
  username: string;
  rapidWhip: boolean;
  rapidWhipSpeed: number;
  soundVolume: number;
  backgroundTrack: string;
  screenShake: boolean;
  screenShakeStrength: number;
  bloodIntensity: number;
  rainEffect: boolean;
}

const bounded = (value: unknown, fallback: number, min: number, max: number) =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.max(min, Math.min(max, value)) : fallback;

export function parseControlSnapshot(value: unknown): ControlSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const data = value as Partial<ControlSnapshot>;
  return {
      map: isWorldMap(data.map) ? data.map : 'DESERT',
      scene: data.scene === 'BOMB' || data.scene === 'BURIAL' || data.scene === 'HELL' || data.scene === 'TASBIH' || data.scene === 'CAMEL' || data.scene === 'PHARAOH' || data.scene === 'NOAH'
        ? data.scene : 'WHIP',
      username: typeof data.username === 'string' ? data.username.trim().replace(/^@/, '') : '',
      rapidWhip: data.rapidWhip === true,
      rapidWhipSpeed: bounded(data.rapidWhipSpeed, 1, .1, 2),
      soundVolume: bounded(data.soundVolume, .8, 0, 1),
      backgroundTrack: typeof data.backgroundTrack === 'string' && isAvailableBackgroundTrack(data.backgroundTrack)
        ? data.backgroundTrack : defaultBackgroundTrack,
      screenShake: data.screenShake !== false,
      screenShakeStrength: bounded(data.screenShakeStrength, .2, 0, 1),
      bloodIntensity: bounded(data.bloodIntensity, 2, 0, 2),
      rainEffect: data.rainEffect === true,
  };
}

export function readControlSnapshot(): ControlSnapshot | null {
  try {
    const stored = localStorage.getItem(CONTROL_STORAGE_KEY);
    return stored ? parseControlSnapshot(JSON.parse(stored) as unknown) : null;
  } catch {
    return null;
  }
}

export function captureControlSnapshot(
  engine: GameEngine, map: ControlMap, username: string,
): ControlSnapshot {
  return {
    map,
    scene: engine.noahSceneEnabled ? 'NOAH' : engine.pharaohSceneEnabled ? 'PHARAOH' : engine.camelSceneEnabled ? 'CAMEL' : engine.tasbihMode ? 'TASBIH' : engine.hellSceneEnabled ? 'HELL' : engine.burialSceneEnabled ? 'BURIAL'
      : engine.bombSceneEnabled ? 'BOMB' : 'WHIP',
    username,
    rapidWhip: engine.rapidWhip,
    rapidWhipSpeed: engine.rapidWhipSpeed,
    soundVolume: engine.settings.soundVolume,
    backgroundTrack: soundEngine.getBackgroundTrack(),
    screenShake: engine.settings.screenShake,
    screenShakeStrength: engine.settings.screenShakeStrength,
    bloodIntensity: engine.settings.bloodIntensity,
    rainEffect: engine.settings.rainEffect,
  };
}

export function applyControlSnapshot(engine: GameEngine, snapshot: ControlSnapshot): void {
  const currentScene = engine.noahSceneEnabled ? 'NOAH' : engine.pharaohSceneEnabled ? 'PHARAOH' : engine.camelSceneEnabled ? 'CAMEL' : engine.tasbihMode ? 'TASBIH' : engine.hellSceneEnabled ? 'HELL' : engine.burialSceneEnabled ? 'BURIAL'
    : engine.bombSceneEnabled ? 'BOMB' : 'WHIP';
  if (currentScene !== snapshot.scene) {
    engine.cancelLiveTasks();
    engine.setTasbihMode(snapshot.scene === 'TASBIH');
    if (snapshot.scene === 'NOAH') engine.setNoahScene(true);
    else if (snapshot.scene === 'PHARAOH') engine.setPharaohScene(true);
    else if (snapshot.scene === 'CAMEL') engine.setCamelScene(true);
    else if (snapshot.scene === 'BOMB') engine.setBombScene(true);
    else if (snapshot.scene === 'BURIAL') engine.setBurialScene(true);
    else if (snapshot.scene === 'HELL') engine.setHellScene(true);
    else if (engine.noahSceneEnabled) engine.setNoahScene(false);
    else if (engine.pharaohSceneEnabled) engine.setPharaohScene(false);
    else if (engine.camelSceneEnabled) engine.setCamelScene(false);
    else if (engine.hellSceneEnabled) engine.setHellScene(false);
    else if (engine.burialSceneEnabled) engine.setBurialScene(false);
    else engine.setBombScene(false);
  }
  engine.setRapidWhip(snapshot.rapidWhip);
  engine.setRapidWhipSpeed(snapshot.rapidWhipSpeed);
  engine.settings.soundVolume = snapshot.soundVolume;
  engine.settings.screenShake = snapshot.screenShake;
  engine.settings.screenShakeStrength = snapshot.screenShakeStrength;
  engine.settings.bloodIntensity = snapshot.bloodIntensity;
  engine.settings.rainEffect = snapshot.rainEffect;
  soundEngine.setVolume(snapshot.soundVolume);
  soundEngine.setBackgroundTrack(snapshot.backgroundTrack);
}
