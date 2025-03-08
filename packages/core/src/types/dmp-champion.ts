export interface Summoner {
  summonerId1: number;
  summonerId2: number;
  winrate: number;
  pickrate: number;
}

export interface SkillLevelUp {
  skillLevelUp1: number;
  skillLevelUp2: number;
  skillLevelUp3: number;
  winrate: number;
  pickrate: number;
}

export interface StartItem {
  startItems: number[];
  winrate: number;
  pickrate: number;
}

export interface TimeValue {
  time: number;
  value: number;
}

export interface Boot {
  itemId: number;
  winrate: number;
  pickrate: number;
}

export interface RuneStat {
  Id: number;
  winrate: number;
  pickrate: number;
}

export interface Runes {
  primaryRuneId: RuneStat[];
  primaryRuneId2: RuneStat[];
  primaryRuneId3: RuneStat[];
  primaryRuneId4: RuneStat[];
  secondaryRuneId: RuneStat[];
  perksStat1: RuneStat[];
  perksStat2: RuneStat[];
  perksStat3: RuneStat[];
}

export interface ItemStat {
  Id: number;
  winrate: number;
  pickrate: number;
}

export interface Items {
  item1: ItemStat[];
  item2: ItemStat[];
  item3: ItemStat[];
  item4: ItemStat[];
  item5: ItemStat[];
}

export interface CoreBuild {
  itemIds: number[];
  winrate: number;
  pickrate: number;
}

export interface CoreBuilds {
  coreItem2: CoreBuild[];
  coreItem3: CoreBuild[];
  coreItem4: CoreBuild[];
  coreItem5: CoreBuild[];
}

export interface DragonSouls {
  Mountain: number;
  Cloud: number;
  Infernal: number;
  Hextech: number;
  Ocean: number;
  Chemtech: number;
}

export interface Matchup {
  championName: string;
  winrate: number;
  csDiffAt15: number;
  goldDiffAt15: number;
  xpDiffAt15: number;
  firstToHitLevel2: number;
  count: number;
}

export interface RoleMatchups {
  [role: string]: Matchup[];
}

export interface ChampionStatsDPM {
  summoners: Summoner[];
  skillLevelUp: SkillLevelUp[];
  startItems: StartItem[];
  winrateOverTime: TimeValue[];
  boots: Boot[];
  runes: Runes;
  items: Items;
  coreBuilds: CoreBuilds;
  jungleFullClearTimestamp: number;
  csDiffAt15: number;
  goldDiffAt15: number;
  xpDiffAt15: number;
  isFirstToHitLevel2: number;
  dragonSouls: DragonSouls;
  winrateOverDays: TimeValue[];
  pickrateOverDays: TimeValue[];
  banrateOverDays: TimeValue[];
  enemyMatchups: RoleMatchups;
  allyMatchups: RoleMatchups;
}

export interface SimplifiedBuild {
  // Matchups relevantes (por ejemplo, del enemigo)
  matchups: any;
  // Tiempo de ruta o clear completo de la jungla
  jungleRouteTime: number;
  // Build principal (podrías seleccionar la de mayor winrate, por ejemplo)
  coreBuild: any;
  // Orden de habilidades (o skills) relevante
  skills: SkillLevelUp;
  // Runes, simplificando la estructura (por ejemplo, agrupando primarias y secundarias)
  runes: {
    primary: RuneStat[]; // combinación de primaryRuneId, primaryRuneId2, etc.
    secondary: RuneStat[];
    perks: RuneStat[]; // combinación de perksStat1, perksStat2, perksStat3
  };
}
