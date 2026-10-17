import { HOVER } from './hover';
import { HUMAN } from './human';
import { NATURE } from './nature';
import type { Builder } from './parts';
import { WALKER } from './walker';

export type { Builder } from './parts';

/** Every model in the catalog by sprite name: the three races' rosters, then what belongs to nobody. */
export const MODELS: Record<string, Builder> = { ...HUMAN, ...HOVER, ...WALKER, ...NATURE };
