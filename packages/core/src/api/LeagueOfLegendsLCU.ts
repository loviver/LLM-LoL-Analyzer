import fs from "fs";
import path from "path";
import axios from 'axios';
import https from 'https';
import DataDragon from "./DataDragon";

type GameEvents = {
  championSelect: (data: any) => void;
  liveData: (data: any) => void;
  error: (error: Error) => void;
};

export interface IEvent {
  Assisters: string[];
  EventID: number;
  EventName: string;
  EventTime: number;
}

export interface IEventWithTurret extends IEvent {
  KillerName?: string;
  TurretKilled: string;
}

export interface IEventWithDragon extends IEvent {
  KillerName?: string;
  killer?: string;
  Stolen: string;
  DragonType: string;
}

class LCUListener {
  private lockfilePath: string;
  private currentGamePath: string;
  private httpsAgent: https.Agent;
  private intervalId: NodeJS.Timeout | null = null;
  private listeners: Partial<GameEvents> = {};
  private lastChampionData: any = null;
  private lastLiveData: any = null;

  constructor(
    lockfilePath: string,
    currentGameFolder: string
  ) {
    this.lockfilePath = lockfilePath;
    this.currentGamePath = currentGameFolder;
    this.httpsAgent = new https.Agent({ rejectUnauthorized: false });
  }

  on<T extends keyof GameEvents>(event: T, callback: GameEvents[T]) {
    this.listeners[event] = callback;
  }

  private emit<T extends keyof GameEvents>(event: T, data?: any) {
    const callback = this.listeners[event];
    if (callback) {
      try {
        (callback as any)(data);
      } catch (err) {
        this.emit('error', err as Error);
      }
    }
  }

  start(interval: number = 10000) {
    this.intervalId = setInterval(async () => {
      await this.checkChampionSelect();
      await this.checkLiveGame();
    }, interval);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private async checkChampionSelect() {
    const pathName = `lol-champ-select/v1/session`;
    try {
      const lcuData = this.getLCUData();
      if (!lcuData) return;

      const { port, token } = lcuData;
      const response = await axios.get(
        `https://127.0.0.1:${port}/${pathName}`,
        {
          httpsAgent: this.httpsAgent,
          headers: {
            Authorization: `Basic ${Buffer.from(`riot:${token}`).toString("base64")}`
          }
        }
      );

      if (JSON.stringify(response.data) !== JSON.stringify(this.lastChampionData)) {
        this.lastChampionData = response.data;

        fs.writeFileSync(path.join(this.currentGamePath, 'championSelect.json'), JSON.stringify(response.data, null, 2));
        
        const actions: Record<number, any> = {};

        const pickActions = this.lastChampionData.actions
        .map((action: any) => action.filter((item: any) => item.type === 'pick'))
        .flat();
      
        //console.log(pickActions);
      

        pickActions.forEach((action: any) => {
          const actorId = Number(action.actorCellId);

          if (!Number.isInteger(actorId)) {
            console.warn("actorCellId inválido:", action.actorCellId);
            return;
          }

          actions[actorId] = {
            ...action,
            isPlayer: false
          };
        });
        
        const localPlayerCellId = Number(this.lastChampionData.localPlayerCellId);

        pickActions[localPlayerCellId].isPlayer = true;

        // Función auxiliar para formatear los datos de cada jugador
        const formatPlayer = (player: any) => {

          const champion = player.championId ? DataDragon.findChampionByKey(player.championId) as any : null;

          const spells = player.spell1Id && player.spell2Id ? [
            DataDragon.findSpellByKey(player.spell1Id),
            DataDragon.findSpellByKey(player.spell2Id)
          ].filter((item: any) => item).map((item: any) => {
            return item.name
          }) : [];

          return {
            isPlayer: pickActions[player.cellId] ? pickActions[player.cellId].isPlayer : false,
            pickTurn: pickActions[player.cellId] ? pickActions[player.cellId].pickTurn : null,
            completed: pickActions[player.cellId] ? pickActions[player.cellId].completed : null,
            isInProgress: pickActions[player.cellId] ? pickActions[player.cellId].isInProgress : null,
            spells: spells,
            champion: champion ? {
              name: champion.name,
              info: champion.info,
              tags: champion.tags,
              energyType: champion.partype,
              stats: champion.stats,
            } : null,
          }
        };

        // Mapear los jugadores de los equipos propio y enemigo utilizando la función auxiliar
        const myTeam = this.lastChampionData.myTeam.map(formatPlayer);
        const enemyTeam = this.lastChampionData.theirTeam.map(formatPlayer);

        const myTeamBans = (this.lastChampionData.bans.myTeamBans || []).map((championId: any) => {

          const champion = championId ? DataDragon.findChampionByKey(championId) as any : null;

          return champion.name;
        });
        const enemyTeamBans = (this.lastChampionData.bans.enemyBans || []).map((championId: any) => {

          const champion = championId ? DataDragon.findChampionByKey(championId) as any : null;

          return champion.name;
        });

        // Crear el objeto final con la información mejorada
        const improveJson = {
          teams: {
            myTeam,
            enemyTeam,
          },
          bans: {
            myTeamBans,
            enemyTeamBans
          }
        };
        
        fs.writeFileSync(path.join(this.currentGamePath, 'championSelectImproved.json'), JSON.stringify(improveJson, null, 2));

        this.emit('championSelect', improveJson);
      }
    } catch (error: any) {
      this.emit('error', {
        code: error.response?.status ?? error.errno,
        status: error.response?.statusText ?? error.code,
        path: pathName,
        raw: error
      });
    }
  }

  private async checkLiveGame() {
    const pathName = `liveclientdata/allgamedata`;
    try {
      const response = await axios.get(
        `https://127.0.0.1:2999/${pathName}`,
        { httpsAgent: this.httpsAgent }
      );

      var localPlayerScore = null;

      if (JSON.stringify(response.data) !== JSON.stringify(this.lastLiveData)) {
        this.lastLiveData = response.data;

        fs.writeFileSync(path.join(this.currentGamePath, 'liveData.json'), JSON.stringify(response.data, null, 2));


        // Obtener el jugador activo de allPlayers usando find
        const currentPlayer = this.lastLiveData.allPlayers.find(
          (player: any) => player.riotId === this.lastLiveData.activePlayer.riotId
        );

        if (!currentPlayer) {
          throw new Error("Jugador activo no encontrado");
        }

        /*
        if(!localPlayerScore) {
          const playerScoresQuery = await axios.get(
            `https://127.0.0.1:2999/liveclientdata/playerscores?riotId=${currentPlayer.riotId}`,
            { httpsAgent: this.httpsAgent }
          ) as any;
          
          console.log(`playerScoresQuery`, playerScoresQuery);
        }
        */

        // Función para formatear los datos de un jugador
        const formatPlayerData =  (player: any) => {

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
            team: player.team,
            directOponent: this.lastLiveData.allPlayers.find((p: any) => p.position === player.position && p.team !== player.team)?.championName,
            //goldSpent: player.items.reduce((acc: number, item: any) => acc + item.price, 0),
            goldSpent: player.items.reduce((acc: number, item: any) => {

              const itemData = DataDragon.findItemByKey(item.itemID);

              return acc + itemData.gold.total;
            }, 0),
            items: player.items.map((item: any) => {

              const itemData = DataDragon.findItemByKey(item.itemID);

              return {
                id: item.itemID,
                count: item.count,
                displayName: itemData.name,
                description: itemData.description,
                stats: itemData.stats,
                price: itemData.gold.total,
                slot: item.slot,
              }
            }),
            runes: Object.entries(player.runes).map((rune: any) => {
              return {
                type: rune[0],
                displayName: rune[1].displayName,
                id: rune[1].id,
              };
            }),
            spells: Object.entries(player.summonerSpells).map((spell: any) => {

              const getSummonerId = (spellName: string) => {

                const spliter = spellName.split('_');

                return spliter[spliter.length - 2] ? spliter[spliter.length - 2].replace('Upgrade', '') : null;
              };

              return {
                spellOrder: spell[0],
                id: getSummonerId(spell[1].rawDisplayName),
                displayName: spell[1].displayName,
              }
            }),
          }
        };

        // Filtrar y formatear jugadores del mismo equipo (excluyendo al jugador actual)
        const teamPlayers = this.lastLiveData.allPlayers
          .filter(
            (player: any) =>
              player.team === currentPlayer.team &&
              player.riotId !== currentPlayer.riotId
          )
          .map(formatPlayerData); 

        const getTeamByRiotId = (playerName: string) => {
          return this.lastLiveData.allPlayers.find((player: any) => player.playerNameGameName === playerName)?.team;
        };

        // Filtrar y formatear jugadores del equipo enemigo
        const enemyTeamPlayers = this.lastLiveData.allPlayers
          .filter((player: any) => player.team !== currentPlayer.team)
          .map(formatPlayerData);

        const getTurrets = (events: IEventWithTurret[], currentPlayerTeam: any, filterByEnemy: any) => {
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
                asisters: event.Assisters,
                killer: event.KillerName,
                lane: turretData?.lane,
                position: turretData?.position ? positionTranslate[turretData.position] : null,
                team: turretData?.team,
              };
            })
            .filter(turret => (filterByEnemy ? turret.team !== currentPlayerTeam : turret.team === currentPlayerTeam));
        };

        const getDragon = (events: IEventWithDragon[], currentPlayerTeam: any, filterByEnemy: any) => {

          return events
            .filter(event => event.EventName === 'DragonKill' || event.EventName === 'HeraldKill' || event.EventName === 'BaronKill')
            .map(event => {
              return {
                time: event.EventTime,
                asisters: event.Assisters,
                killer: event.KillerName,
                type: event.DragonType ?? event.EventName,
                team: getTeamByRiotId(event.killer ?? event.KillerName ?? "") == currentPlayerTeam ? "ally" : "enemy",
                stolen: event.Stolen == "true" ? true : false,
              };
            })
            .filter(turret => (filterByEnemy ? turret.team !== currentPlayerTeam : turret.team === currentPlayerTeam));
        };

        let firstBlood = this.lastLiveData.events.Events.find((event: any) => event.EventName === 'FirstBlood');
        
        if(firstBlood) {
          firstBlood = {
            time: firstBlood.firstBloodTime,
            killer: firstBlood.Recipient,
            team: getTeamByRiotId(firstBlood.Recipient) == currentPlayer.team ? "ally" : "enemy",
          };
        }

        // Crear el objeto final con la información requerida
        const improveJson = {
          currentTime: this.lastLiveData.gameData.gameTime,
          gameCreation: new Date(),
          phase: "early",
          avgPlayersLevel: 1,
          mySkills: Object.entries(this.lastLiveData.activePlayer.abilities)
            .map((ability: any) => ({
              abilityKey: ability[0],
              displayName: ability[1].displayName,
              abilityLevel: ability[1].abilityLevel,
            }))
            .filter((ability: any) => ability.abilityLevel >= 0),
          currentGold: this.lastLiveData.activePlayer.currentGold,
          currentSpentGoldByPlayer: 0,
          currentLevel: this.lastLiveData.activePlayer.level,
          current: formatPlayerData(currentPlayer),
          firstBlood: firstBlood,
          team: {
            spentGold: 0,
            turrets: getTurrets(this.lastLiveData.events.Events, currentPlayer.team, true),
            dragons: getDragon(this.lastLiveData.events.Events, currentPlayer.team, true),
            players: teamPlayers
          },
          enemyTeam: {
            spentGold: 0,
            turrets: getTurrets(this.lastLiveData.events.Events, currentPlayer.team, false),
            dragons: getDragon(this.lastLiveData.events.Events, currentPlayer.team, false),
            players: enemyTeamPlayers
          },
        };

        const gameTime = improveJson.currentTime; // tiempo de juego en segundos
        const minutes = gameTime / 60;
      
        // Niveles de los jugadores
        const currentLevel = improveJson.current.level;
        const teamLevels = improveJson.team.players.map((p: any) => p.level);
        const enemyLevels = improveJson.enemyTeam.players.map((p: any) => p.level);
        const allLevels = [currentLevel, ...teamLevels, ...enemyLevels];
        const avgLevel = allLevels.reduce((sum: number, lvl: number) => sum + lvl, 0) / allLevels.length;
      
        const currentItemsCosts = improveJson.current.items.reduce((total: number, item: any) => total + item.price, 0);
        const teamItemsCosts = improveJson.team.players.map((p: any) => p.items.reduce((total: number, item: any) => total + item.price, 0));
        const enemyItemsCosts = improveJson.enemyTeam.players.map((p: any) => p.items.reduce((total: number, item: any) => total + item.price, 0));
        const allBuildsCosts = [currentItemsCosts, ...teamItemsCosts, ...enemyItemsCosts];
        const avgItemCosts = allLevels.reduce((sum: number, lvl: number) => sum + lvl, 0) / allBuildsCosts.length;

        // Se definen umbrales aproximados para early, mid y late
        if (minutes < 10 || avgLevel < 6 || avgItemCosts < 2000) {
          improveJson.phase = 'early';
        } else if (minutes >= 20 || avgLevel < 12 || avgItemCosts < 5000) {
          improveJson.phase = 'mid';
        } else {
          improveJson.phase = 'late';
        }
        
        improveJson.avgPlayersLevel = avgLevel;

        improveJson.currentSpentGoldByPlayer = currentItemsCosts;
        improveJson.team.spentGold = teamItemsCosts.reduce((acc: number, item: number) => acc + item, 0); 
        improveJson.enemyTeam.spentGold = enemyItemsCosts.reduce((acc: number, item: number) => acc + item, 0); 

        fs.writeFileSync(path.join(this.currentGamePath, 'liveDataImproved.json'), JSON.stringify(improveJson, null, 2));

        this.emit('liveData', improveJson);
      }
    } catch (error: any) {
      this.emit('error', {
        code: error.response?.status ?? error.errno,
        status: error.response?.statusText ?? error.code,
        path: pathName,
        raw: error
      });
    }
  }

  private getLCUData() {
    if (!fs.existsSync(this.lockfilePath)) {
      // this.emit('error', new Error('Lockfile not found'));
      return null;
    }

    try {
      const lockfileContent = fs.readFileSync(this.lockfilePath, "utf-8");
      const [,, port, token] = lockfileContent.split(":");
      return { port: Number(port), token };
    } catch (error: any) {
      this.emit('error', error);
      return null;
    }
  }
}

export default LCUListener;