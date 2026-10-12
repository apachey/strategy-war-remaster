import type { RampName } from './palette';

/**
 * Surface kinds a model can use. The renderer writes each pixel's material id in one pass and its light level in
 * another; the pixel step turns (material, light) into a palette colour. Ids start at 1; 0 means empty.
 */
export interface MaterialDef {
  /** 'team' is replaced by the team's ramp when the sprite is coloured. */
  ramp: RampName | 'team';
  /** Moves the light level up or down the ramp (in steps), to tell apart surfaces that share a ramp. */
  shift?: number;
  /** Ignores lighting and always uses the brightest step (lamps, muzzle flash). */
  emissive?: boolean;
}

export const MATERIALS = {
  team: { ramp: 'team' },
  teamDark: { ramp: 'team', shift: -1 },
  teamLight: { ramp: 'team', shift: 1 },
  steel: { ramp: 'steel' },
  steelDark: { ramp: 'steel', shift: -1 },
  track: { ramp: 'steel', shift: -2 },
  trackLight: { ramp: 'steel', shift: -1 },
  glass: { ramp: 'cyan' },
  lamp: { ramp: 'cyan', emissive: true },
  concrete: { ramp: 'concrete' },
  concreteDark: { ramp: 'concrete', shift: -1 },
  gold: { ramp: 'gold', shift: 1 },
  flash: { ramp: 'fire', emissive: true },
  burnt: { ramp: 'steel', shift: -1 },
} as const satisfies Record<string, MaterialDef>;

export type MaterialName = keyof typeof MATERIALS;

export const MATERIAL_NAMES = Object.keys(MATERIALS) as MaterialName[];

/** Id written into the material pass for each material; 0 is empty, GROUND marks the shadow-catching floor. */
export const materialId = (name: MaterialName): number => MATERIAL_NAMES.indexOf(name) + 1;
export const GROUND_ID = 255;

export const materialById = (id: number): MaterialDef | undefined => {
  const name = MATERIAL_NAMES[id - 1];
  return name ? MATERIALS[name] : undefined;
};
