import {
  campaign,
  CAMPAIGN_FACTIONS,
  CELL,
  cleanFaction,
  ObjectType,
  TEAM_COLOR_NAMES,
  type CampaignMap,
  type Faction,
  type Race,
  type TeamColor,
} from '@sw/data';
import {
  canPlace,
  createSkirmish,
  createWorld,
  DEFAULT_SKIRMISH_MONEY,
  isUnit,
  isVisibleTo,
  issue,
  OPPONENTS,
  SKIRMISH_MONEY,
  step,
  UNIT_RULES,
  type BuildingType,
  type Command,
  type CommandResult,
  type Difficulty,
  type Entity,
  type Opponent,
  type Side,
  type UnitType,
  type World,
} from '@sw/sim';
import { t } from './text';

/** What is being played: a campaign mission, or a skirmish against the computer or a second person. */
export type Setup =
  | { kind: 'campaign'; mapIndex: number; missionIndex: number; difficulty: Difficulty }
  | {
      kind: 'skirmish';
      mapIndex: number;
      opponent: Opponent;
      money: number;
      /** The faction each side plays, [first, second]: race, name, symbol and colours. The main colours always differ. */
      factions: [Faction, Faction];
    };

/** The match both players share: the world, pause, speed and whether it has started. */
export class Game {
  world: World;
  readonly map: CampaignMap;
  paused = false;
  /** Game speed multiplier; `?speed=8` in the URL speeds things up for testing. */
  speed = 1;
  /** The briefing is shown first; the world only runs once the player starts. */
  started = false;
  /** Set when the world came from a save: the game then continues without a briefing. */
  readonly loaded: boolean;
  /** One per person at this Mac: the first side, plus the second in a two-player game. */
  readonly commanders: Commander[];

  constructor(
    public setup: Setup,
    saved?: World,
  ) {
    this.map = campaign.maps[setup.mapIndex]!;
    this.loaded = !!saved;
    this.world = saved ?? newWorld(setup);
    this.commanders = [new Commander(this, 'player')];
    if (this.twoPlayers) this.commanders.push(new Commander(this, 'enemy'));
  }

  get mapIndex(): number {
    return this.setup.mapIndex;
  }

  /** The campaign mission, or -1 in a skirmish. */
  get missionIndex(): number {
    return this.setup.kind === 'campaign' ? this.setup.missionIndex : -1;
  }

  get twoPlayers(): boolean {
    return this.setup.kind === 'skirmish' && this.setup.opponent === 'human';
  }

  get difficulty(): Difficulty {
    return this.world.difficulty;
  }

  /** Campaign difficulty can change on the briefing screen, before the world has run a single tick. */
  setDifficulty(difficulty: Difficulty): void {
    if (this.setup.kind !== 'campaign' || this.started || this.loaded || this.world.tick > 0) return;
    this.setup = { ...this.setup, difficulty };
    this.world = newWorld(this.setup);
  }

  step(): void {
    step(this.world);
    for (const c of this.commanders) c.afterStep();
  }
}

function newWorld(setup: Setup): World {
  if (setup.kind === 'campaign') return createWorld(campaign.maps[setup.mapIndex]!, setup.missionIndex, 1, { difficulty: setup.difficulty });
  const [a, b] = setup.factions;
  return createSkirmish(setup.mapIndex, {
    opponent: setup.opponent,
    money: setup.money,
    races: [a.race, b.race],
    colors: [a.color, b.color],
    colors2: [a.color2, b.color2],
    colors3: [a.color3, b.color3],
  });
}

/** HQ type of a side: the second side's HQ is the alien one, also when a person plays it. */
export const hqType = (side: Side) => (side === 'player' ? ObjectType.PlayerHQ : ObjectType.EnemyHQ);

/** One person's hold on the match: their side, selection, control groups, build placement and gamepad focus. */
export class Commander {
  selection: number[] = [];
  readonly groups = new Map<number, number[]>();
  /** Building waiting to be placed, and the HQ that will build it. */
  placing: { type: BuildingType; hqId: number } | null = null;
  /** A Move or Attack panel button waiting for its target: the next click on the map gives the order. */
  aiming: 'move' | 'attack' | null = null;
  /** Gamepad focus in the selection panel's buttons. */
  focus = 0;
  /** Where a gamepad player's cursor points, in map pixels; null for mouse players. */
  cursor: { x: number; y: number } | null = null;
  onToast: (text: string) => void = () => {};
  /** Feedback sounds for this person's own actions. */
  onSound: (name: 'select' | 'order' | 'error' | 'build_start' | 'self_destruct') => void = () => {};
  /** An order the units acknowledge in their own voice: `ids` are the units, `action` what they answer. */
  onOrder: (ids: number[], action: 'move' | 'attack' | 'harvest') => void = () => {};

  constructor(
    readonly game: Game,
    readonly side: Side,
  ) {}

  get world(): World {
    return this.game.world;
  }

  get money(): number {
    return this.world.sides[this.side].money;
  }

  /** 1 or 2, as shown to the players. */
  get number(): number {
    return this.side === 'player' ? 1 : 2;
  }

  afterStep(): void {
    this.selection = this.selection.filter((id) => this.world.byId.has(id));
    if (this.placing && !this.world.byId.has(this.placing.hqId)) this.placing = null;
  }

  isOwn(e: Entity): boolean {
    return e.team === this.side;
  }

  isFoe(e: Entity): boolean {
    return e.team !== this.side && e.team !== 'neutral';
  }

  hq(): Entity | undefined {
    return this.world.entities.find((e) => e.type === hqType(this.side) && e.team === this.side);
  }

  selected(): Entity[] {
    return this.selection.map((id) => this.world.byId.get(id)).filter((e): e is Entity => !!e);
  }

  visible(e: Entity): boolean {
    return isVisibleTo(this.world, this.side, e);
  }

  /**
   * Topmost visible object under a map point: units first, then buildings, then fields. A building also answers
   * on its roof, which its sprite draws above its footprint.
   */
  pick(x: number, y: number, slack = 0): Entity | null {
    const roof = (e: Entity) => (isUnit(e.type) || e.type === ObjectType.ResourceField ? 0 : e.size * ROOF);
    const hits = this.world.entities.filter(
      (e) => !e.hidden && this.visible(e) && x >= e.x - slack && x < e.x + e.size + slack && y >= e.y - slack - roof(e) && y < e.y + e.size + slack,
    );
    hits.sort((a, b) => rank(a) - rank(b) || b.id - a.id);
    return hits[0] ?? null;
  }

  select(ids: number[], add = false): void {
    const own = ids.filter((id) => this.world.byId.get(id)?.team === this.side);
    // Clicking an enemy or a field shows its info without making it controllable.
    const list = own.length > 0 ? own : ids.slice(0, 1);
    this.selection = add ? [...new Set([...this.selection.filter((id) => this.world.byId.get(id)?.team === this.side), ...own])] : list;
    if (own.length > 0) this.onSound('select');
    this.placing = null;
    this.aiming = null;
    this.focus = 0;
  }

  selectBox(x0: number, y0: number, x1: number, y1: number, add: boolean): void {
    const [ax, bx] = [Math.min(x0, x1), Math.max(x0, x1)];
    const [ay, by] = [Math.min(y0, y1), Math.max(y0, y1)];
    const ids = this.world.entities
      .filter((e) => e.team === this.side && isUnit(e.type) && !e.hidden && e.x + e.size > ax && e.x < bx && e.y + e.size > ay && e.y < by)
      .map((e) => e.id);
    if (ids.length > 0 || !add) this.select(ids, add);
  }

  /** Double click: every unit of this side of the same type inside the map rectangle (what is on screen). */
  selectSameType(e: Entity, x0: number, y0: number, x1: number, y1: number, add: boolean): void {
    if (e.team !== this.side || !isUnit(e.type)) return this.select([e.id], add);
    const ids = this.world.entities
      .filter((o) => o.team === this.side && o.type === e.type && !o.hidden && o.x + o.size > x0 && o.x < x1 && o.y + o.size > y0 && o.y < y1)
      .map((o) => o.id);
    this.select(ids.includes(e.id) ? ids : [e.id, ...ids], add);
  }

  /** Every armed unit of this side: a quick way to grab the army with a gamepad. */
  selectArmy(): void {
    this.select(this.world.entities.filter((e) => e.team === this.side && isUnit(e.type) && UNIT_RULES[e.type as UnitType].weapon).map((e) => e.id));
  }

  /** HQ first; asked again, the factories in turn. */
  selectNextBase(): void {
    const own = (type: number) => this.world.entities.filter((e) => e.team === this.side && e.type === type);
    const cycle = [...own(hqType(this.side)), ...own(ObjectType.TankFactory)];
    if (cycle.length === 0) return;
    const at = this.selection.length === 1 ? cycle.findIndex((e) => e.id === this.selection[0]) : -1;
    this.select([cycle[(at + 1) % cycle.length]!.id]);
  }

  ownUnits(): Entity[] {
    return this.selected().filter((e) => e.team === this.side && isUnit(e.type));
  }

  run(cmd: Command): CommandResult {
    const result = issue(this.world, this.side, cmd);
    if (!result.ok) {
      this.onToast(t().reason[result.reason]);
      this.onSound('error');
    } else if (cmd.kind === 'build') this.onSound('build_start');
    else if (cmd.kind === 'destruct') this.onSound('self_destruct');
    else if (cmd.kind === 'move' || cmd.kind === 'defend') this.onOrder(cmd.ids, 'move');
    else if (cmd.kind === 'attack' || cmd.kind === 'attackMove') this.onOrder(cmd.ids, 'attack');
    else if (cmd.kind === 'harvest') this.onOrder(cmd.ids, 'harvest');
    return result;
  }

  /**
   * Right click: attack enemies, harvest fields, guard own objects, otherwise drive there. `queue` (Shift) adds the
   * point to the units' route, `attack` (Option/Alt) makes it an attack-move. With only a factory selected it sets
   * the factory's rally point.
   */
  order(x: number, y: number, slack = 0, mods: { queue?: boolean; attack?: boolean } = {}): string | null {
    const units = this.ownUnits();
    if (units.length === 0) {
      const factory = this.selected().find((e) => e.team === this.side && e.type === ObjectType.TankFactory);
      if (!factory) return null;
      this.run({ kind: 'rally', factoryId: factory.id, x, y });
      this.onSound('order');
      return 'rally';
    }
    const ids = units.map((u) => u.id);
    const target = this.pick(x, y, slack);
    const armed = units.filter((u) => UNIT_RULES[u.type as UnitType].weapon).map((u) => u.id);
    const harvesters = units.filter((u) => u.type === ObjectType.Harvester).map((u) => u.id);
    if (mods.attack && armed.length > 0) {
      this.run({ kind: 'attackMove', ids: armed, x, y, queue: mods.queue });
      return 'attackMove';
    }
    if (target && this.isFoe(target) && armed.length > 0) {
      this.run({ kind: 'attack', ids: armed, targetId: target.id });
      return 'attack';
    }
    if (target && target.type === ObjectType.ResourceField && harvesters.length > 0) {
      this.run({ kind: 'harvest', ids: harvesters, fieldId: target.id });
      const rest = ids.filter((id) => !harvesters.includes(id));
      if (rest.length) this.run({ kind: 'move', ids: rest, x, y });
      return 'harvest';
    }
    if (target && target.team === this.side && !ids.includes(target.id) && armed.length > 0 && !isUnit(target.type)) {
      this.run({ kind: 'defend', ids: armed, targetId: target.id });
      return 'defend';
    }
    this.run({ kind: 'move', ids, x, y, queue: mods.queue });
    return 'move';
  }

  /**
   * The click after a Move or Attack button. Move drives there whatever is under the cursor; Attack fires on an enemy
   * it hits, or drives there fighting whatever comes into range on the way.
   */
  aim(x: number, y: number, slack = 0): void {
    const kind = this.aiming;
    this.aiming = null;
    const units = this.ownUnits();
    if (!kind || units.length === 0) return;
    const ids = units.map((u) => u.id);
    if (kind === 'move') {
      this.run({ kind: 'move', ids, x, y });
      return;
    }
    const armed = units.filter((u) => UNIT_RULES[u.type as UnitType].weapon).map((u) => u.id);
    if (armed.length === 0) return;
    const target = this.pick(x, y, slack);
    if (target && this.isFoe(target)) this.run({ kind: 'attack', ids: armed, targetId: target.id });
    else this.run({ kind: 'attackMove', ids: armed, x, y });
  }

  startPlacing(type: BuildingType): void {
    const hq = this.selected().find((e) => e.type === hqType(this.side) && e.team === this.side);
    if (hq) this.placing = { type, hqId: hq.id };
  }

  /** Top-left cell for a building centred under the cursor. */
  placementCell(x: number, y: number, type: BuildingType): { cx: number; cy: number } {
    const cells = type === ObjectType.Wall || type === ObjectType.Defender ? 1 : 2;
    return { cx: Math.floor(x / CELL - (cells - 1) / 2), cy: Math.floor(y / CELL - (cells - 1) / 2) };
  }

  canPlaceAt(x: number, y: number): boolean {
    if (!this.placing) return false;
    const { cx, cy } = this.placementCell(x, y, this.placing.type);
    return canPlace(this.world, this.side, this.placing.type, cx, cy);
  }

  /** Places the pending building. Walls stay in placement mode so a line can be drawn quickly. */
  place(x: number, y: number, keepPlacing = false): void {
    if (!this.placing) return;
    const { type, hqId } = this.placing;
    const { cx, cy } = this.placementCell(x, y, type);
    const result = this.run({ kind: 'build', hqId, building: type, cx, cy });
    if (result.ok && !(keepPlacing || type === ObjectType.Wall)) this.placing = null;
  }

  setGroup(n: number): void {
    const units = this.ownUnits();
    if (units.length > 0) this.groups.set(n, units.map((u) => u.id));
  }

  recallGroup(n: number): boolean {
    const ids = (this.groups.get(n) ?? []).filter((id) => this.world.byId.has(id));
    if (ids.length === 0) return false;
    this.select(ids);
    return true;
  }
}

/** How far a building's sprite reaches above its footprint, as a share of the footprint (the factory crane, the HQ towers). */
const ROOF = 0.3;

function rank(e: Entity): number {
  if (isUnit(e.type)) return 0;
  if (e.type === ObjectType.ResourceField) return 2;
  return 1;
}

/**
 * The setup an URL asks for: `?m=6.2` a campaign mission, `?s=4&vs=hard&money=3000` a skirmish on map 4, with
 * `&r=walker,hover&c=blue,red&c2=white,black` for the two sides' races, colours and secondary colours.
 */
export function parseSetup(search: string, difficulty: Difficulty): Setup {
  const params = new URLSearchParams(search);
  const skirmish = params.get('s');
  if (skirmish !== null) {
    const mapIndex = Math.min(campaign.maps.length - 1, Math.max(0, (Number.parseInt(skirmish, 10) || 1) - 1));
    const vs = params.get('vs') as Opponent | null;
    const money = Number(params.get('money'));
    return {
      kind: 'skirmish',
      mapIndex,
      opponent: vs && OPPONENTS.includes(vs) ? vs : 'normal',
      money: (SKIRMISH_MONEY as readonly number[]).includes(money) ? money : DEFAULT_SKIRMISH_MONEY,
      factions: skirmishFactions(
        [0, 1].map((i) => {
          const at = (key: string) => params.get(key)?.split(',')[i];
          return { race: at('r'), color: at('c'), color2: at('c2'), color3: at('c3'), symbol: at('sym'), name: params.get(`n${i + 1}`) ?? '' };
        }),
      ),
    };
  }
  return { kind: 'campaign', ...parseMission(search), difficulty };
}

/** The URL query for a setup. */
export function setupQuery(setup: Setup): Record<string, string> {
  if (setup.kind === 'campaign') return { m: `${setup.mapIndex + 1}.${setup.missionIndex + 1}` };
  const f = setup.factions;
  const list = (key: keyof Faction) => f.map((x) => x[key]).join(',');
  const q: Record<string, string> = { s: String(setup.mapIndex + 1), vs: setup.opponent, money: String(setup.money), r: list('race'), c: list('color'), c2: list('color2'), c3: list('color3'), sym: list('symbol') };
  f.forEach((x, i) => x.name && (q[`n${i + 1}`] = x.name));
  return q;
}

/**
 * The two factions of a skirmish from untrusted input (URL, stored settings): unknown fields fall back to the
 * campaign's sides, and a second side wearing the first side's main colour takes the next free one.
 */
export function skirmishFactions(raw?: readonly unknown[]): [Faction, Faction] {
  const first = cleanFaction(raw?.[0], CAMPAIGN_FACTIONS[0]);
  const second = cleanFaction(raw?.[1], CAMPAIGN_FACTIONS[1]);
  if (second.color === first.color) second.color = nextColor(first.color, 1, first.color);
  return [first, second];
}

/** The colour `step` places after `from` in the list, skipping `taken` (the other side's). */
export function nextColor(from: TeamColor, step: number, taken: TeamColor): TeamColor {
  const n = TEAM_COLOR_NAMES.length;
  let i = TEAM_COLOR_NAMES.indexOf(from);
  do i = (((i + step) % n) + n) % n;
  while (TEAM_COLOR_NAMES[i] === taken);
  return TEAM_COLOR_NAMES[i]!;
}

export function parseMission(search: string): { mapIndex: number; missionIndex: number } {
  // ?m=6.2 opens map 6, mission 2 (1-based, as in the original menus).
  const raw = new URLSearchParams(search).get('m') ?? '1.1';
  const [m, n] = raw.split('.').map((v) => Number.parseInt(v, 10));
  const mapIndex = Math.min(campaign.maps.length - 1, Math.max(0, (m || 1) - 1));
  const missions = campaign.maps[mapIndex]!.missions.length;
  return { mapIndex, missionIndex: Math.min(missions - 1, Math.max(0, (n || 1) - 1)) };
}

/** The mission after this one, or null after the last. */
export function nextMission(mapIndex: number, missionIndex: number): { mapIndex: number; missionIndex: number } | null {
  if (missionIndex + 1 < campaign.maps[mapIndex]!.missions.length) return { mapIndex, missionIndex: missionIndex + 1 };
  if (mapIndex + 1 < campaign.maps.length) return { mapIndex: mapIndex + 1, missionIndex: 0 };
  return null;
}
