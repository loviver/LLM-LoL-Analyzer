
export interface LiveGameData {
  currentTime?: number;
  currentGold?: number;
  currentSpentGoldByPlayer?: number;
  currentLevel?: number;
  current: {
    championName: string;
    items: Array<{
      slot: number;
      displayName: string;
    }>;
  };
  team: {
    players: Array<{
      championName: string;
      items: Array<{
        slot: number;
        displayName: string;
      }>;
    }>;
  };
  enemyTeam: {
    players: Array<{
      championName: string;
      items: Array<{
        slot: number;
        displayName: string;
      }>;
    }>;
  };
  currentItems?: Array<{
    slot: number;
    displayName: string;
  }>;
}