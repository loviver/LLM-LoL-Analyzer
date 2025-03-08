
export interface ChampionSelectData {
  teams: {
    myTeam: Array<{
      isPlayer: boolean;
      position?: string;
      championId: number;
      completed: boolean;
      isInProgress: boolean;
      champion?: any;
    }>;
    enemyTeam: Array<{
      championId: number;
      completed: boolean;
    }>;
  };
}
