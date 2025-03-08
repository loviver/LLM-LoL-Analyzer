
import config from '../config';

export class ResponseCache {
  private cache: Map<string, { response: any, timestamp: number }> = new Map();
  private readonly TTL: number = config.cache.ttlMinutes * 60 * 1000;

  /**
   * Store a response in the cache
   */
  set(key: string, response: any): void {
    this.cache.set(key, {
      response,
      timestamp: Date.now()
    });
  }

  /**
   * Get a response from the cache if it exists and is valid
   */
  get(key: string): any | null {
    const cached = this.cache.get(key);
    if (!cached) return null;
    
    // Check if cache is still valid
    if (Date.now() - cached.timestamp > this.TTL) {
      this.cache.delete(key);
      return null;
    }
    
    return cached.response;
  }

  /**
   * Create a unique key based on game state
   */
  createKey(type: string, data: any): string {
    // Create a hash based on relevant data to use as cache key
    if (type === 'champion-select') {
      const teams = [...data.teams.myTeam, ...data.teams.enemyTeam]
        .filter((p: any) => p.championId !== 0)
        .map((p: any) => p.championId)
        .sort()
        .join(',');
      return `${type}-${teams}`;
    } else if (type === 'game-analysis') {
      // For in-game analysis, include game time to ensure freshness
      const gameTime = Math.floor((data.currentTime || 0) / 60); // Round to minutes
      return `${type}-${gameTime}-${JSON.stringify(data.resumeChanges || [])}`;
    }
    return `${type}-${Date.now()}`;
  }
}
