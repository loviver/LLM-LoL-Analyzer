import { ChampionStatsDPM, SimplifiedBuild } from "../types/dmp-champion";
import DataDragon from "./DataDragon";

export class DPM {
  private baseUrl: string = 'https://dpm.lol/v1/builds';

  /**
   * Consulta la build de un campeón con los parámetros especificados.
   * @param champion Nombre del campeón (por defecto "Kayn").
   * @param lane Rol o línea (por defecto "jungle").
   * @param tier Tier (por defecto "silver").
   * @param timeframe Tiempo en minutos (por defecto 15.5).
   * @returns Promesa con los datos de la build en formato JSON.
   */
  async getBuild(
    champion: string = 'Kayn',
    lane: string = 'jungle',
    tier: string = 'silver',
    timeframe: number = 15.5
  ): Promise<ChampionStatsDPM> {
    const url = `${this.baseUrl}/${champion}?lane=${lane.toLowerCase()}&tier=${tier}&timeframe=${timeframe}`;
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Error al obtener los datos. Status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Error en la consulta al endpoint:', error);
      throw error;
    }
  }

  buildSimplified(championStats: ChampionStatsDPM, position: string): SimplifiedBuild {
    const coreBuild = Object.values(championStats.coreBuilds).flatMap((items: any) =>
      items.map((item: any) => ({
        itemIds: item.itemIds.slice(0, 10).map((item: any) => {
          const itemData = DataDragon.findItemByKey(item);
          return itemData ? { ...itemData, urlImage: `/data/static/items/${itemData.image.full}` } : null;
        }),
        winrate: item.winrate,
        pickrate: item.pickrate
      }))
    )
    .sort((a: any, b: any) => b.winrate - a.winrate)
    .slice(0, 10);

    const matchups = championStats.enemyMatchups[position.toUpperCase()] ?? [];

    const enemyMatchups = matchups.map((values: any) => {
      const champion = DataDragon.findChampionByName(values.championName) as any;
      return {
        champion: champion ? {
          ...champion,
          urlImage: `/data/static/champion/${champion.image.full}`
        } : null,
        winrate: values.winrate,
        csDiffAt15: values.csDiffAt15,
        goldDiffAt15: values.goldDiffAt15,
        xpDiffAt15: values.xpDiffAt15,
        firstToHitLevel2: values.firstToHitLevel2,
        count: values.count
      };
    }).filter((values) => values.champion);
    
    const simplified: SimplifiedBuild = {
      matchups: enemyMatchups,
      jungleRouteTime: championStats.jungleFullClearTimestamp,
      coreBuild: coreBuild,
      skills: championStats.skillLevelUp[0],
      runes: {
        primary: [
          ...championStats.runes.primaryRuneId,
          ...championStats.runes.primaryRuneId2,
          ...championStats.runes.primaryRuneId3,
          ...championStats.runes.primaryRuneId4,
        ],
        secondary: championStats.runes.secondaryRuneId,
        perks: [
          ...championStats.runes.perksStat1,
          ...championStats.runes.perksStat2,
          ...championStats.runes.perksStat3,
        ]
      }
    };

    return simplified;
  }
}