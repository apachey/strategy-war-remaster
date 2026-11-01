import type { RampName } from './palette';

/**
 * Surface kinds a model can use. The renderer writes each pixel's material id in one pass and its light level in
 * another; the pixel step turns (material, light) into a palette colour. Ids start at 1; 0 means empty.
 */
export interface MaterialDef {
  /**
   * 'team' and 'team2' are the side's main and secondary colours, 'team3' light in the secondary and 'chassis' the
   * third colour, of what carries the unit (palette.ts).
   */
  ramp: RampName | 'team' | 'team2' | 'team3' | 'chassis';
  /** Moves the light level up or down the ramp (in steps), to tell apart surfaces that share a ramp. */
  shift?: number;
  /** Ignores lighting and always uses the brightest step (lamps, muzzle flash). */
  emissive?: boolean;
  /** Gets a one-pixel outline only, for specks a full one would swallow (the drops trailing a walker's thorn). */
  thin?: boolean;
}

export const MATERIALS = {
  team: { ramp: 'team' },
  teamDark: { ramp: 'team', shift: -1 },
  teamLight: { ramp: 'team', shift: 1 },
  // The side's secondary colour: accents whose place depends on the race and the object.
  team2: { ramp: 'team2' },
  team2Dark: { ramp: 'team2', shift: -1 },
  team2Light: { ramp: 'team2', shift: 1 },
  // The side's third colour: tracks, tyres, walker legs and hover bellies.
  chassis: { ramp: 'chassis' },
  chassisDark: { ramp: 'chassis', shift: -1 },
  chassisLight: { ramp: 'chassis', shift: 1 },
  steel: { ramp: 'steel' },
  steelLight: { ramp: 'steel', shift: 1 },
  steelDark: { ramp: 'steel', shift: -1 },
  // The original draws tracks in the body colour, only darker.
  track: { ramp: 'team', shift: -2 },
  trackLight: { ramp: 'team', shift: -1 },
  glass: { ramp: 'cyan' },
  glassDark: { ramp: 'cyan', shift: -1 },
  lamp: { ramp: 'cyan', emissive: true },
  concrete: { ramp: 'concrete' },
  concreteDark: { ramp: 'concrete', shift: -1 },
  gold: { ramp: 'gold', shift: 1 },
  crystal: { ramp: 'gold', shift: -1 },
  signal: { ramp: 'signal', emissive: true },
  flash: { ramp: 'fire', emissive: true },
  // Orange of the humans' shots, lit, so it shades from orange into pale yellow.
  ember: { ramp: 'fire' },
  // The walkers' acid, always the same green-to-yellow whatever the side's colours: wet, a lighter tip, and a
  // hot yellow glow for muzzles.
  bile: { ramp: 'acid' },
  bileLight: { ramp: 'acid', shift: 1 },
  bileGlow: { ramp: 'acid', emissive: true },
  // The walkers' thorn: chitin in the main colour.
  thorn: { ramp: 'team', shift: 1 },
  // Drops of acid trailing a thorn, hot to cool.
  dropHot: { ramp: 'acid', emissive: true, thin: true },
  drop: { ramp: 'acid', shift: 1, thin: true },
  dropCool: { ramp: 'acid', thin: true },
  // The walkers' eyes, glowing neon in the secondary colour, and their white-hot core.
  eye: { ramp: 'team3', emissive: true },
  glowCore: { ramp: 'steel', emissive: true },
  // Ground heaped or broken round the crystals of a resource field: sand, forest soil and the hovers' plates.
  sand: { ramp: 'sand', shift: 1 },
  soil: { ramp: 'soil' },
  plate: { ramp: 'plate' },
  plateDark: { ramp: 'plate', shift: -1 },
  pine: { ramp: 'pine', shift: 1 },
  pineDark: { ramp: 'pine' },
  bark: { ramp: 'concrete', shift: -1 },
  burnt: { ramp: 'steel', shift: -1 },
} as const satisfies Record<string, MaterialDef>;

export type MaterialName = keyof typeof MATERIALS;

export const MATERIAL_NAMES = Object.keys(MATERIALS) as MaterialName[];

/** Id written into the material pass for each material; 0 is empty, GROUND marks the shadow-catching floor. */
export const materialId = (name: MaterialName): number => MATERIAL_NAMES.indexOf(name) + 1;
export const GROUND_ID = 255;
/**
 * Id of `ghost` meshes: geometry that is really part of a neighbour (the next wall's arm, the hull under a turret).
 * It hides what is behind it and stops the outline, so pieces drawn side by side in the game join without a seam,
 * but it is never drawn itself. Builders mark such meshes with `userData.ghost`.
 */
export const GHOST_ID = 254;

export const materialById = (id: number): MaterialDef | undefined => {
  const name = MATERIAL_NAMES[id - 1];
  return name ? MATERIALS[name] : undefined;
};
