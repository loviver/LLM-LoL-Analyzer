
export default {
  server: {
    port: 8080
  },
  cache: {
    ttlMinutes: 5  // Cache TTL in minutes
  },
  broadcast: {
    interval: 5000  // Broadcast interval in ms
  },
  analysis: {
    // Minimum time between analysis requests by phase (ms)
    throttle: {
      championSelect: 5000,
      earlyGame: (60 + 15) * 1000,
      midGame: (60) * 1000,
      lateGame: 45 * 1000,
      enemyItemChange: 30 * 1000
    }
  }
};