import fs from 'fs';
import path from 'path';
import axios, { AxiosRequestConfig } from 'axios';
import https from 'https';
import DataDragon from "./DataDragon";
import { GameEvents, LCUListenerConfig, ObjectiveStatus } from '../types/LCUTypes';
import { IEventWithDragon, IEventWithTurret } from './LeagueOfLegendsLCUold';
import { ObjectiveStatusEnum } from '../enums/LCUenums';
import Logger from '../utils/logger';

class LCUListener {
  private config: LCUListenerConfig;
  private logger: Logger;
  private httpsAgent: https.Agent;
  private intervalIdChampionSelect: NodeJS.Timeout | null = null;
  private intervalId: NodeJS.Timeout | null = null;
  // Soporte para múltiples listeners por evento
  private listeners: { [K in keyof GameEvents]?: GameEvents[K][] } = {};
  private lastChampionData: any = null;
  private lastLiveData: any = null;
  // Caché simple para llamadas a DataDragon
  private dataDragonCache: Map<string, any> = new Map();

  constructor(config: LCUListenerConfig, logger?: Logger) {
    this.config = config;
    this.logger = logger || new Logger('LCUListener');
    this.httpsAgent = new https.Agent({ rejectUnauthorized: false });
  }

  on<T extends keyof GameEvents>(event: T, callback: GameEvents[T]) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event]?.push(callback);
  }

  private emit<T extends keyof GameEvents>(event: T, data?: any) {
    const callbacks = this.listeners[event];
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(data);
        } catch (err) {
          this.emit('error', err);
        }
      });
    }
  }

  start() {
    this.logger.info("Iniciando polling de LCUListener");
    this.intervalId = setInterval(async () => {
      await this.checkLiveGame();
    }, this.config.pollingInterval);

    this.intervalIdChampionSelect = setInterval(async () => {
      await this.checkChampionSelect();
    }, this.config.pollingIntervalChampionSelect);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      this.logger.info("[intervalId] Polling detenido");
    }
    
    if (this.intervalIdChampionSelect) {
      clearInterval(this.intervalIdChampionSelect);
      this.intervalIdChampionSelect = null;
      this.logger.info("[intervalIdChampionSelect] Polling detenido");
    }
  }

  private async checkChampionSelect() {
    const pathName = /*this.config.championSelectEndpoint*/'lol-champ-select/v1/session';
    try {
      const lcuData = this.getLCUData();
      if (!lcuData) {
        this.logger.warn("Datos de LCU no encontrados");
        return;
      }
      const axiosConfig: AxiosRequestConfig = {
        httpsAgent: this.httpsAgent,
        timeout: this.config.axiosTimeout,
        headers: {
          Authorization: `Basic ${Buffer.from(`riot:${lcuData.token}`).toString("base64")}`
        }
      };
      const response = await axios.get(`https://127.0.0.1:${lcuData.port}/${pathName}`, axiosConfig);
      
      if (JSON.stringify(response.data) !== JSON.stringify(this.lastChampionData)) {
        this.lastChampionData = response.data;
        const championSelectPath = path.join(this.config.gamePath, 'championSelect.json');
        fs.writeFileSync(championSelectPath, JSON.stringify(response.data, null, 2));
        
        const improvedData = this.transformChampionSelectData(response.data);
        
        this.emit('championSelect', improvedData);
      }
    } catch (error: any) {
      this.handleError(error, pathName);
    }
  }

  private transformChampionSelectData(data: any): any {
    // Validación de datos necesarios
    if (!data.actions || !data.myTeam || !data.theirTeam) {
      this.logger.warn("Datos incompletos en champion select");
      return data;
    }

    const actions: Record<number, any> = {};
    const pickActions = data.actions
      .map((action: any) => action.filter((item: any) => item.type === 'pick'))
      .flat();
    
    const banPicks = data.actions
      .map((action: any) => action.filter((item: any) => item.type === 'ban'))
      .flat()
      .reduce((acc: Map<number, any[]>, item: any) => {
        const key = Number(item.actorCellId);
        if (!acc.has(key)) {
          acc.set(key, []);
        }
        acc.get(key)!.push(item);
        return acc;
      }, new Map<number, any[]>());

  
    pickActions.forEach((action: any) => {
      const actorId = Number(action.actorCellId);
      if (!Number.isInteger(actorId)) {
        this.logger.warn(`actorCellId inválido: ${action.actorCellId}`);
        return;
      }
      pickActions[actorId] = { ...action, isPlayer: false };
    });
    
    const localPlayerCellId = Number(data.localPlayerCellId);
    if (pickActions[localPlayerCellId]) {
      pickActions[localPlayerCellId].isPlayer = true;
    }

    const formatPlayer = (player: any) => {
      const champion = player.championId ? this.cachedFindChampionByKey(player.championId) : null;

      const banData = banPicks.get(player.cellId);

      const banCompleted = banData ? banData.completed : null;
      let banChampion = null;

      //console.log(banCompleted, banPicks, player.cellId);

      if (banCompleted === true) {
        banChampion = banData.championId ? this.cachedFindChampionByKey(banData.championId) : null;
      }

      const spells = (player.spell1Id && player.spell2Id) ? [
        this.cachedFindSpellByKey(player.spell1Id),
        this.cachedFindSpellByKey(player.spell2Id)
      ].filter((item: any) => item).map((item: any) => item.name) : [];
      return {
        isPlayer: pickActions[player.cellId] ? pickActions[player.cellId].isPlayer : false,
        pickTurn: pickActions[player.cellId] ? pickActions[player.cellId].pickTurn : null,
        completed: pickActions[player.cellId] ? pickActions[player.cellId].completed : null,
        isInProgress: pickActions[player.cellId] ? pickActions[player.cellId].isInProgress : null,
        ban: banChampion,
        spells: spells,
        position: player.assignedPosition ?? null,
        champion: champion ? {
          name: champion.name,
          championImage: champion.image.full,
          info: champion.info,
          tags: champion.tags,
          energyType: champion.partype,
          stats: champion.stats,
        } : null,
      };
    };

    const myTeam = data.myTeam.map(formatPlayer);
    const enemyTeam = data.theirTeam.map(formatPlayer);
    
    const myTeamBans = (data.bans.myTeamBans || []).map((championId: any) => {
      const champion = championId ? this.cachedFindChampionByKey(championId) : null;
      return champion ? champion.name : null;
    }).filter((name: any) => name);
    
    const enemyTeamBans = (data.bans.enemyBans || []).map((championId: any) => {
      const champion = championId ? this.cachedFindChampionByKey(championId) : null;
      return champion ? champion.name : null;
    }).filter((name: any) => name);

    return {
      teams: {
        myTeam,
        enemyTeam,
      },
      bans: {
        myTeamBans,
        enemyTeamBans
      },
      banData: banPicks,
    };
  }

  private async checkLiveGame() {
    const pathName = /*this.config.// liveGameEndpoint*/'liveclientdata/allgamedata';
    try {
      const axiosConfig: AxiosRequestConfig = {
        httpsAgent: this.httpsAgent,
        timeout: this.config.axiosTimeout,
      };
      const response = await axios.get(`https://127.0.0.1:2999/${pathName}`, axiosConfig);
      
      if (JSON.stringify(response.data) !== JSON.stringify(this.lastLiveData)) {
        this.lastLiveData = response.data;
        const liveDataPath = path.join(this.config.gamePath, 'liveData.json');
        fs.writeFileSync(liveDataPath, JSON.stringify(response.data, null, 2));

        const improvedData = this.transformLiveGameData(response.data);

        this.emit('liveData', improvedData);
      }
    } catch (error: any) {
      this.handleError(error, pathName);
    }
  }

  private transformLiveGameData(data: any): any {
    // Función para transformar y dividir la lógica en métodos más pequeños
    const currentPlayer = data.allPlayers.find((player: any) => player.riotId === data.activePlayer.riotId);
    if (!currentPlayer) {
      throw new Error("Jugador activo no encontrado");
    }

    const formatPlayerData = (player: any): any => {
      const champion = player.championName ? this.cachedFindChampionByName(player.championName) : null;
      return {
        championName: player.championName,
        riotId: player.riotId,
        summonerName: player.summonerName,
        level: player.level,
        position: player.position,
        kills: player.scores.kills,
        creepScore: player.scores.creepScore,
        deaths: player.scores.deaths,
        assists: player.scores.assists,
        wardScore: player.scores.wardScore,
        currentGold: "unknown",
        team: player.team,
        champion: champion ? {
          name: champion.name,
          championImage: champion.image.full,
          info: champion.info,
          tags: champion.tags,
          energyType: champion.partype,
          stats: champion.stats,
        } : null,
        directOponent: data.allPlayers.find((p: any) => p.position === player.position && p.team !== player.team)?.championName,
        goldSpent: player.items.reduce((acc: number, item: any) => {
          const itemData = this.cachedFindItemByKey(item.itemID);
          return acc + (itemData ? itemData.gold.total : 0);
        }, 0),
        items: player.items.map((item: any) => {
          const itemData = this.cachedFindItemByKey(item.itemID);
          return {
            id: item.itemID,
            count: item.count,
            displayName: itemData?.name,
            description: itemData?.description,
            stats: itemData?.stats,
            price: itemData?.gold.total,
            slot: item.slot,
          };
        }),
        runes: Object.entries(player.runes).map(([key, rune]: [string, any]) => ({
          type: key,
          displayName: rune.displayName,
          id: rune.id,
        })),
        spells: Object.entries(player.summonerSpells).map(([order, spell]: [string, any]) => ({
          spellOrder: order,
          id: this.extractSummonerId(spell.rawDisplayName),
          displayName: spell.displayName,
        })),
      };
    };

    // Funciones utilitarias para extraer información de objetivos
    const getTurrets = (events: IEventWithTurret[], teamId: number, filterByEnemy: boolean) => {
      return events
        .filter(event => event.EventName === 'TurretKilled' || event.EventName === 'InhibKilled')
        .map(event => {
          const turretName = event.TurretKilled ? event.TurretKilled.split('_').slice(0, -1).join('_') : null;
          const turretData = turretName ? DataDragon.getTurretById(turretName) : null;
          const positionTranslate: any = {
            "TOP": "TOP",
            "JUNGLE": "JUNGLE",
            "MID": "MID",
            "BOT": "ADC",
            "UTILITY": "SUPPORT",
          };
          return {
            time: event.EventTime,
            assisters: event.Assisters,
            killer: event.KillerName,
            lane: turretData?.lane,
            position: turretData?.position ? positionTranslate[turretData.position] : null,
            team: turretData?.team,
          };
        })
        .filter(turret => filterByEnemy ? turret.team !== teamId : turret.team === teamId);
    };

    const getEpicMonsters = (events: IEventWithDragon[], teamId: number, filterByEnemy: boolean, keepFilter: boolean = true) => {
      return events
        .filter(event => ['DragonKill', 'HeraldKill', 'BaronKill', 'HordeKill'].includes(event.EventName))
        .map(event => {
          const type = event.DragonType ?? event.EventName;
          const dictionaryTypes: Record<string, string> = { "HordeKill": "Larvs" };
          const typeName = dictionaryTypes[type] ?? type;
          const monsterDictionary: Record<string, string> = {
            "DragonKill": "Dragon",
            "HeraldKill": "Herald",
            "BaronKill": "Baron",
            "HordeKill": "Larvs"
          };
          return {
            time: event.EventTime,
            assisters: event.Assisters,
            killer: event.KillerName,
            monster: event.EventName ? monsterDictionary[event.EventName] : null,
            type: typeName,
            team: getTeamByRiotId(data.allPlayers, event.killer ?? event.KillerName ?? "") === teamId ? "ally" : "enemy",
            stolen: event.Stolen === "true",
          };
        })
        .filter((monster: any) => keepFilter ? (filterByEnemy ? monster.team !== teamId : monster.team === teamId) : true);
    };

    const getTeamByRiotId = (players: any[], riotId: string): number | null => {
      const player = players.find(p => p.riotIdGameName === riotId);
      return player ? player.team : null;
    };

    const gameStart = data.events.Events.find((event: any) => event.EventName === 'GameStart');
    const gameTime = data.gameData.gameTime;
    const eventTime = gameStart?.EventTime;
    const gameCreation = new Date((eventTime || 0) - gameTime * 1000);

    // Extraer muertes de monstruos
    const getEpicMonsterKills = (monsterType: string, subType: string[] | undefined = undefined) => {
      const kills = getEpicMonsters(data.events.Events, currentPlayer.team, false, false)
        .filter((event: any) => {
          return event.monster === monsterType && (subType ? subType.includes(event.type) : true);
        })
        
        .sort((a, b) => b.time - a.time);
      return {
        all: kills,
        last: kills[0] || null
      };
    };

    const dragonKills = getEpicMonsterKills("Dragon", ['Air', 'Earth', 'Fire', 'Water']);
    const dragonSoulKills = getEpicMonsterKills("Dragon", ['Soul']);
    const heraldKills = getEpicMonsterKills("Herald");
    const baronKills = getEpicMonsterKills("Baron");
    const hordeKills = getEpicMonsterKills("Larvs");

    // Utilidad para determinar el estado de un objetivo usando enums
    const getObjectiveStatus = (
      gameTime: number,
      config: { initialSpawnTime?: number, respawnTime: number, maxSpawns?: number, maxTime?: number },
      lastKill: any,
      killCount = 0
    ): ObjectiveStatus => {
      let status: ObjectiveStatus = {
        isAlive: false,
        status: ObjectiveStatusEnum.NOT_SPAWNED,
        timeSinceSpawn: null,
        timeUntilSpawn: null,
        timeSinceLastSpawn: null,
        timeSinceExpiry: null,
      };
      
      if (config.maxSpawns !== undefined && killCount >= config.maxSpawns) {
        status.isAlive = false;
        status.status = ObjectiveStatusEnum.MAX_SPAWNS_REACHED;
        status.timeSinceLastSpawn = lastKill ? gameTime - lastKill.time : 0;
        return status;
      }
      
      if(config.initialSpawnTime) {
        if (gameTime < config.initialSpawnTime) {
          status.isAlive = false;
          status.status = ObjectiveStatusEnum.NOT_SPAWNED;
          status.timeUntilSpawn = config.initialSpawnTime - gameTime;
          return status;
        }
      }
      
      if (config.maxTime !== undefined && gameTime >= config.maxTime) {
        status.isAlive = false;
        status.status = ObjectiveStatusEnum.EXPIRED;
        status.timeSinceExpiry = gameTime - config.maxTime;
        return status;
      }
      
      if(config.initialSpawnTime) {
        if (!lastKill) {
          status.isAlive = true;
          status.status = ObjectiveStatusEnum.ALIVE;
          status.spawnedAt = config.initialSpawnTime;
          status.timeSinceSpawn = gameTime - config.initialSpawnTime;
          return status;
        }
      }
      
      const nextSpawnTime = lastKill.time + config.respawnTime;
      if (gameTime < nextSpawnTime) {
        status.isAlive = false;
        status.status = ObjectiveStatusEnum.RESPAWNING;
        status.timeUntilSpawn = nextSpawnTime - gameTime;
        return status;
      } else {
        status.isAlive = true;
        status.status = ObjectiveStatusEnum.ALIVE;
        status.spawnedAt = nextSpawnTime;
        status.timeSinceSpawn = gameTime - nextSpawnTime;
        return status;
      }
    };

    const dragonConfig = {
      initialSpawnTime: 300,
      respawnTime: 300,
      maxSpawns: 4
    };

    const heraldConfig = {
      initialSpawnTime: 690,
      respawnTime: 360,
      maxTime: 1200
    };

    const baronConfig = {
      initialSpawnTime: 1500,
      respawnTime: 360,
      maxSpawns: 1
    };

    const hordeConfig = {
      initialSpawnTime: 360,
      respawnTime: 300,
      maxSpawns: 2
    };

    let isDragonSoulAlive: ObjectiveStatus = {
      isAlive: false,
      status: ObjectiveStatusEnum.NOT_SPAWNED,
      timeSinceSpawn: null,
      timeUntilSpawn: null,
      timeSinceLastSpawn: null,
      timeSinceExpiry: null,
    };

    const isDragonAlive = getObjectiveStatus(gameTime, dragonConfig, dragonKills.last, dragonKills.all.length);
    const isHeraldAlive = getObjectiveStatus(gameTime, heraldConfig, heraldKills.last, heraldKills.all.length);
    const isBaronAlive = getObjectiveStatus(gameTime, baronConfig, baronKills.last);
    const isHordeAlive = getObjectiveStatus(gameTime, hordeConfig, hordeKills.last, hordeKills.all.length);

    if(dragonKills.all.length >= 4) {
      
      const dragonSoulConfig = {
        initialSpawnTime: undefined,
        respawnTime: 300,
        maxSpawns: 4
      };
      
      isDragonSoulAlive = getObjectiveStatus(gameTime, dragonSoulConfig, dragonSoulKills.last);
    }

    const teamPlayers = data.allPlayers
      .filter((player: any) => player.team === currentPlayer.team && player.riotId !== currentPlayer.riotId)
      .map(formatPlayerData);
    const enemyTeamPlayers = data.allPlayers
      .filter((player: any) => player.team !== currentPlayer.team)
      .map(formatPlayerData);

    const currentItemsCosts = currentPlayer.items.reduce((acc: number, item: any) => {
      const itemData = this.cachedFindItemByKey(item.itemID);
      return acc + (itemData ? itemData.gold.total : 0);
    }, 0);

    const teamItemsCosts = teamPlayers.reduce((acc: number, player: any) => acc + player.goldSpent, currentItemsCosts);
    const enemyItemsCosts = enemyTeamPlayers.reduce((acc: number, player: any) => acc + player.goldSpent, 0);
    const allBuildsCosts = [teamItemsCosts, enemyItemsCosts];
    const avgItemCosts = allBuildsCosts.reduce((sum: number, cost: number) => sum + cost, 0) / allBuildsCosts.length;
    const minutes = gameTime / 60;
    const allLevels = [currentPlayer.level, ...teamPlayers.map((p: any) => p.level), ...enemyTeamPlayers.map((p: any) => p.level)];
    const avgLevel = allLevels.reduce((sum: number, lvl: number) => sum + lvl, 0) / allLevels.length;

    let phase = 'early';
    if (minutes < 10 || avgLevel < 6 || avgItemCosts < 2000) {
      phase = 'early';
    } else if (minutes >= 20 && avgLevel < 12 && avgItemCosts < 5000) {
      phase = 'mid';
    } else {
      phase = 'late';
    }

    const getPlayerByRiotId = (players: any[], riotId: string): any => {
      return players.find((player: any) => player.riotId === riotId);
    };

    let firstBlood = data.events.Events.find((event: any) => event.EventName === 'FirstBlood');
    if (firstBlood) {

      const playerFirstBlood = getPlayerByRiotId([...teamPlayers, ...enemyTeamPlayers], firstBlood.Recipient) ?? null;

      firstBlood = {
        time: firstBlood.firstBloodTime,
        killer: playerFirstBlood ? playerFirstBlood.champion.name : null,
        team: getTeamByRiotId(data.allPlayers, firstBlood.Recipient) === currentPlayer.team ? "ally" : "enemy",
      };
    }

    // this.logger.info(`Fase del juego: ${phase} (avgLevel: ${avgLevel}, avgItemCosts: ${avgItemCosts})`);

    return {
      currentTime: gameTime,
      gameCreation: gameCreation,
      phase: phase,
      avgPlayersLevel: avgLevel,
      avgItemCosts: avgItemCosts,
      isDragonAlive: isDragonAlive,
      isDragonSoulAlive: isDragonSoulAlive,
      isHeraldAlive: isHeraldAlive,
      isBaronAlive: isBaronAlive,
      isLarvsAlive: isHordeAlive,
      mySkills: Object.entries(data.activePlayer.abilities)
        .map(([key, ability]: [string, any]) => ({
          abilityKey: key,
          displayName: ability.displayName,
          abilityLevel: ability.abilityLevel,
        }))
        .filter((ability: any) => ability.abilityLevel >= 0),
      current: {
        ...formatPlayerData(currentPlayer),
        currentGold: data.activePlayer.currentGold,
        goldSpent: currentItemsCosts,
      },
      firstBlood: firstBlood,
      team: {
        spentGold: teamItemsCosts,
        turrets: getTurrets(data.events.Events, currentPlayer.team, true),
        dragons: getEpicMonsters(data.events.Events, currentPlayer.team, true),
        players: teamPlayers
      },
      enemyTeam: {
        spentGold: enemyItemsCosts,
        turrets: getTurrets(data.events.Events, currentPlayer.team, false),
        dragons: getEpicMonsters(data.events.Events, currentPlayer.team, false),
        players: enemyTeamPlayers
      },
    };
  }

  // Métodos auxiliares para caching de DataDragon
  private cachedFindChampionByKey(key: number): any {
    const cacheKey = `champion_${key}`;
    if (this.dataDragonCache.has(cacheKey)) {
      return this.dataDragonCache.get(cacheKey);
    }
    const champion = DataDragon.findChampionByKey(key);
    this.dataDragonCache.set(cacheKey, champion);
    return champion;
  }

  private cachedFindChampionByName(name: string): any {
    const cacheKey = `championName_${name}`;
    if (this.dataDragonCache.has(cacheKey)) {
      return this.dataDragonCache.get(cacheKey);
    }
    const champion = DataDragon.findChampionByName(name);
    this.dataDragonCache.set(cacheKey, champion);
    return champion;
  }

  private cachedFindSpellByKey(key: number): any {
    const cacheKey = `spell_${key}`;
    if (this.dataDragonCache.has(cacheKey)) {
      return this.dataDragonCache.get(cacheKey);
    }
    const spell = DataDragon.findSpellByKey(key);
    this.dataDragonCache.set(cacheKey, spell);
    return spell;
  }

  private cachedFindItemByKey(key: number): any {
    const cacheKey = `item_${key}`;
    if (this.dataDragonCache.has(cacheKey)) {
      return this.dataDragonCache.get(cacheKey);
    }
    const item = DataDragon.findItemByKey(key);
    this.dataDragonCache.set(cacheKey, item);
    return item;
  }

  private extractSummonerId(rawDisplayName: string): string | null {
    const parts = rawDisplayName.split('_');
    return parts.length >= 2 ? parts[parts.length - 2].replace('Upgrade', '') : null;
  }

  // Lee y valida el lockfile
  private getLCUData(): { port: number, token: string } | null {
    if (!fs.existsSync(this.config.lockfilePath)) {
      this.logger.error("Lockfile no encontrado");
      return null;
    }
    try {
      const lockfileContent = fs.readFileSync(this.config.lockfilePath, "utf-8");
      const parts = lockfileContent.split(":");
      if(parts.length < 4) {
        throw new Error("Contenido del lockfile inválido");
      }
      const port = Number(parts[2]);
      const token = parts[3];

      //console.log(token, port);
      return { port, token };
    } catch (error: any) {
      this.logger.error("Error al leer el lockfile", error);
      this.emit('error', error);
      return null;
    }
  }

  // Maneja errores centralizadamente
  private handleError(error: any, pathName: string) {
    const errorInfo = {
      code: error.response?.status ?? error.errno,
      status: error.response?.statusText ?? error.code,
      path: pathName,
      raw: error
    };
    // this.logger.error(`Error en endpoint ${pathName}`, errorInfo);
    this.emit('error', errorInfo);
  }
}

export default LCUListener;