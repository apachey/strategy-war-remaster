import { campaign, CELL, ObjectType, type CampaignMap, type Mission } from '@sw/data';
import {
  canPlace,
  createWorld,
  isUnit,
  isVisibleTo,
  issue,
  step,
  UNIT_RULES,
  type BuildingType,
  type Command,
  type CommandResult,
  type Entity,
  type UnitType,
  type World,
} from '@sw/sim';
import { REASON_TEXT } from './text';

export const SIDE = 'player' as const;

/** Everything the player interacts with: the world plus selection, control groups and build placement. */
export class Game {
  world: World;
  readonly map: CampaignMap;
  readonly mission: Mission;
  selection: number[] = [];
  readonly groups = new Map<number, number[]>();
  /** Building waiting to be placed with the mouse, and the HQ that will build it. */
  placing: { type: BuildingType; hqId: number } | null = null;
  paused = false;
  /** Game speed multiplier; `?speed=8` in the URL speeds things up for testing. */
  speed = 1;
  /** The briefing is shown first; the world only runs once the player starts. */
  started = false;
  onToast: (text: string) => void = () => {};

  constructor(
    readonly mapIndex: number,
    readonly missionIndex: number,
  ) {
    this.map = campaign.maps[mapIndex]!;
    this.mission = this.map.missions[missionIndex]!;
    this.world = createWorld(this.map, missionIndex);
  }

  get money(): number {
    return this.world.sides[SIDE].money;
  }

  step(): void {
    step(this.world);
    this.selection = this.selection.filter((id) => this.world.byId.has(id));
    if (this.placing && !this.world.byId.has(this.placing.hqId)) this.placing = null;
  }

  selected(): Entity[] {
    return this.selection.map((id) => this.world.byId.get(id)).filter((e): e is Entity => !!e);
  }

  visible(e: Entity): boolean {
    return isVisibleTo(this.world, SIDE, e);
  }

  /** Topmost visible object under a map point: units first, then buildings, then fields. */
  pick(x: number, y: number): Entity | null {
    const hits = this.world.entities.filter(
      (e) => !e.hidden && this.visible(e) && x >= e.x && x < e.x + e.size && y >= e.y && y < e.y + e.size,
    );
    hits.sort((a, b) => rank(a) - rank(b) || b.id - a.id);
    return hits[0] ?? null;
  }

  select(ids: number[], add = false): void {
    const own = ids.filter((id) => this.world.byId.get(id)?.team === SIDE);
    // Clicking an enemy or a field shows its info without making it controllable.
    const list = own.length > 0 ? own : ids.slice(0, 1);
    this.selection = add ? [...new Set([...this.selection.filter((id) => this.world.byId.get(id)?.team === SIDE), ...own])] : list;
    this.placing = null;
  }

  selectBox(x0: number, y0: number, x1: number, y1: number, add: boolean): void {
    const [ax, bx] = [Math.min(x0, x1), Math.max(x0, x1)];
    const [ay, by] = [Math.min(y0, y1), Math.max(y0, y1)];
    const ids = this.world.entities
      .filter((e) => e.team === SIDE && isUnit(e.type) && !e.hidden && e.x + e.size > ax && e.x < bx && e.y + e.size > ay && e.y < by)
      .map((e) => e.id);
    if (ids.length > 0 || !add) this.select(ids, add);
  }

  ownUnits(): Entity[] {
    return this.selected().filter((e) => e.team === SIDE && isUnit(e.type));
  }

  run(cmd: Command): CommandResult {
    const result = issue(this.world, SIDE, cmd);
    if (!result.ok) this.onToast(REASON_TEXT[result.reason]);
    return result;
  }

  /** Right click: attack enemies, harvest fields, guard own objects, otherwise drive there. */
  order(x: number, y: number): string | null {
    const units = this.ownUnits();
    if (units.length === 0) return null;
    const ids = units.map((u) => u.id);
    const target = this.pick(x, y);
    const armed = units.filter((u) => UNIT_RULES[u.type as UnitType].weapon).map((u) => u.id);
    const harvesters = units.filter((u) => u.type === ObjectType.Harvester).map((u) => u.id);
    if (target && target.team === 'enemy' && armed.length > 0) {
      this.run({ kind: 'attack', ids: armed, targetId: target.id });
      return 'attack';
    }
    if (target && target.type === ObjectType.ResourceField && harvesters.length > 0) {
      this.run({ kind: 'harvest', ids: harvesters, fieldId: target.id });
      const rest = ids.filter((id) => !harvesters.includes(id));
      if (rest.length) this.run({ kind: 'move', ids: rest, x, y });
      return 'harvest';
    }
    if (target && target.team === SIDE && !ids.includes(target.id) && armed.length > 0 && !isUnit(target.type)) {
      this.run({ kind: 'defend', ids: armed, targetId: target.id });
      return 'defend';
    }
    this.run({ kind: 'move', ids, x, y });
    return 'move';
  }

  startPlacing(type: BuildingType): void {
    const hq = this.selected().find((e) => e.type === ObjectType.PlayerHQ && e.team === SIDE);
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
    return canPlace(this.world, SIDE, this.placing.type, cx, cy);
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

function rank(e: Entity): number {
  if (isUnit(e.type)) return 0;
  if (e.type === ObjectType.ResourceField) return 2;
  return 1;
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
