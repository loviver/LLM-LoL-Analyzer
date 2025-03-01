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
            items: player.items.map((item: any) => {

              const itemData = DataDragon.findItemByKey(item.itemID);

              return {
                id: item.itemID,
                count: item.count,
                displayName: item.displayName,
                description: itemData.description,
                stats: itemData.stats,
                price: item.price,
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
              return {
                spellOrder: spell[0],
                id: spell[1].id,
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

        // Filtrar y formatear jugadores del equipo enemigo
        const enemyTeamPlayers = this.lastLiveData.allPlayers
          .filter((player: any) => player.team !== currentPlayer.team)
          .map(formatPlayerData);

        // Crear el objeto final con la información requerida
        const improveJson = {
          currentTime: this.lastLiveData.gameData.gameTime,
          mySkills: Object.entries(this.lastLiveData.activePlayer.abilities)
            .map((ability: any) => ({
              abilityKey: ability[0],
              displayName: ability[1].displayName,
              abilityLevel: ability[1].abilityLevel,
            }))
            .filter((ability: any) => ability.abilityLevel >= 0),
          currentGold: this.lastLiveData.activePlayer.currentGold,
          currentLevel: this.lastLiveData.activePlayer.level,
          current: formatPlayerData(currentPlayer),
          team: {
            turrets: this.lastLiveData.events.Events
              .filter((event: any) => event.EventName === 'TurretKilled').map((event: any) => {

                const turretName = event.TurretKilled.split('_').slice(0, -1).join('_');

                const turretData = DataDragon.getTurretById(turretName);
                
                return {
                  time: event.EventTime,
                  asisters: event.Assisters,
                  killer: event.KillerName,
                  lane: turretData?.lane,
                  position: turretData?.position,
                  team: turretData?.team,
                }
              })
              .filter((turret: any) => turret.team !== currentPlayer.team),
            players: teamPlayers
          },
          enemyTeam: {
            turrets: this.lastLiveData.events.Events
              .filter((event: any) => event.EventName === 'TurretKilled').map((event: any) => {

                const turretName = event.TurretKilled.split('_').slice(0, -1).join('_');

                const turretData = DataDragon.getTurretById(turretName);

                return {
                  time: event.EventTime,
                  asisters: event.Assisters,
                  killer: event.KillerName,
                  lane: turretData?.lane,
                  position: turretData?.position,
                  team: turretData?.team,
                }
              })
              .filter((turret: any) => turret.team === currentPlayer.team),
            players: enemyTeamPlayers
          },
        };

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