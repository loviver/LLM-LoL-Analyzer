import fs from 'fs';
import path from 'path';

import config from '../config';

import GeminiAI from "../services/GeminiAI";
import Logger from "../utils/logger";
// import LCUListener from "./LeagueOfLegendsLCUold";
import LCUListener from './LCUListener';

import { ProgressiveAnalysisSystem } from "./ProgressiveAnalysisSystem";
import { WebSocketManager } from "./WebsocketManager";
import { ChampionSelectData, LiveGameData } from '../types';
import { diffBySlot, getTeamDiff } from '../utils/diff-by-slot';

import crypto from 'crypto';
import { DPM } from './DPM';
import { ChampionStatsDPM } from '../types/dmp-champion';

// Initialize logger
const logger = new Logger('main');
export class LeagueAssistant {
  private wsManager: WebSocketManager;

  private lolClient: LCUListener;
  
  private aiService: GeminiAI;
  private analysisSystem: ProgressiveAnalysisSystem;
  private dpm: DPM;
  private dataPath: string;
  
  // State tracking
  private liveGameData: any = null;
  private championSelectData: any = null;
  private currentGameResponse: any = null;
  
  constructor() {
    // Initialize services
    this.dataPath = path.resolve('../../data');
    
    // Ensure API key is available
    const geminiApiKey = process.env.GEMINI_API;
    if (!geminiApiKey) {
      logger.error('GEMINI_API key not found in environment variables');
      process.exit(1);
    }
    
    this.aiService = new GeminiAI(geminiApiKey);
    this.wsManager = new WebSocketManager(config.server.port, logger, this.aiService);
    this.dpm = new DPM();

    this.lolClient = new LCUListener(
      {
        pollingInterval: 5000,
        pollingIntervalChampionSelect: 1000,
        axiosTimeout: 6000,
        lockfilePath: `${process.env.PATH_LOL}\\lockfile`,
        gamePath: path.join(this.dataPath, 'current')
      }
    );
    
    this.analysisSystem = new ProgressiveAnalysisSystem(
      this.aiService, 
      this.dataPath
    );
    
    // Initialize data directory structure
    this.initializeDataDirectories();
    
    // Set up periodic game data broadcast
    setInterval(this.broadcastGameData.bind(this), config.broadcast.interval);
    
    setInterval(this.broadcastBuild.bind(this), config.broadcast.interval);
  }
  
  /**
   * Initialize directory structure for data storage
   */
  private initializeDataDirectories(): void {
    const dirs = [
      path.join(this.dataPath, 'current'),
      path.join(this.dataPath, 'history'),
      path.join(this.dataPath, 'static')
    ];
    
    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }
  
  /**
   * Start the application
   */
  start(): void {
    // Set up event listeners for League client
    this.lolClient.on('championSelect', this.handleChampionSelect.bind(this));
    this.lolClient.on('liveData', this.handleLiveData.bind(this));
    this.lolClient.on('error', this.handleError.bind(this));
    
    // Start listening to League client
    this.lolClient.start();
    
    logger.info('League Assistant started successfully');
  }
  
  /**
   * Stop the application
   */
  stop(): void {
    this.lolClient.stop();
    logger.info('League Assistant stopped');
  }
  
  /**
   * Handle champion select events
   */
  private async handleChampionSelect(data: ChampionSelectData): Promise<void> {
    try {
      // Check if data has changed
      let changed = true;
      if (this.championSelectData) {
        if (JSON.stringify(this.championSelectData) === JSON.stringify(data)) {
          changed = false;
        }
      }
      
      const readySelectedTeam = [
        ...data.teams.myTeam
      ].filter((player: any) => player.completed === true);

      
      const readySelectedEnemy = [
        ...data.teams.enemyTeam
      ].filter((player: any) => player.completed === true);

      const leftPlayers = [
        ...data.teams.myTeam,
        ...data.teams.enemyTeam
      ].filter((player: any) => player.completed === false);
      
      const playerPickData = data.teams.myTeam.find((player: any) => 
        player.isPlayer == true
      );

      const isYourTurn = data.teams.myTeam.some((player: any) => 
        player.isPlayer == true && player.isInProgress === true
      );

      const totalEnemyPicks = readySelectedEnemy.length;  // Número total de picks para el equipo enemigo
      const totalTeamPicks = readySelectedEnemy.length;   // Número total de picks para el equipo aliado
      let currentPickPosition = playerPickData && playerPickData.position ? 
        playerPickData.position : ""; // Posición del pick actual, ej. "MID", "TOP", "JUNGLE", etc.
      const importantPositions = ["MID", "JUNGLE", "ADC"]; // Posiciones críticas

      // Inicializamos la variable que indicará si se debe dar apoyo
      let canGetAnalysis = false;

      // Determinar si la posición actual es crítica
      const isImportantPickPosition = importantPositions.includes(currentPickPosition);

      // Lógica para decidir cuándo apoyar
      if (readySelectedEnemy.length >= 1 && readySelectedTeam.length >= 1) {
        if (isYourTurn) {
          // Si es el turno del jugador:
          // Dar apoyo si la posición es crítica o si es el último pick (o casi último) de tu equipo
          if (isImportantPickPosition || readySelectedTeam.length === totalTeamPicks - 1) {
            canGetAnalysis = true;
          }
        } else {
          // Si no es tu turno:
          // Dar análisis cuando ambos equipos ya casi han completado su selección
          if (readySelectedEnemy.length >= totalEnemyPicks - 1 && readySelectedTeam.length >= totalTeamPicks - 1) {
            canGetAnalysis = true;
          }
        }
      }

      if(playerPickData && playerPickData.completed === true) {
          
        await this.dpm.getBuild(
          playerPickData.champion.name,
          playerPickData.position,
          'silver',
          15.5
        ).then((build: ChampionStatsDPM) => {
          const simplifiedBuild = this.dpm.buildSimplified(build, playerPickData.position ?? "");
          
          const activeDirExists = fs.existsSync(path.join(this.dataPath, 'games/active'));

          if(activeDirExists) {
            fs.writeFileSync(path.join(this.dataPath, 'games/active/build.json'), JSON.stringify(simplifiedBuild, null, 2));
          }
        }).catch((error) => {
          console.log('Error al obtener la build', error);
        });    
      
      }
      
      // Only analyze if it's your turn or draft is complete
      if (changed && canGetAnalysis) {

        const activeDirExists = fs.existsSync(path.join(this.dataPath, 'games/active'));

        if(!activeDirExists) {
          fs.mkdirSync(path.join(this.dataPath, 'games/active'), { recursive: true });
        }

        const improvedPath = path.join(this.dataPath, 'games/active/champion-select.json');
        
        if(fs.existsSync(improvedPath)) {
          const currentData = JSON.parse(fs.readFileSync(improvedPath, 'utf8'));

          fs.writeFileSync(improvedPath, JSON.stringify({
            ...currentData,
            data: data
          }, null, 2));
        }
        else {
          fs.writeFileSync(improvedPath, JSON.stringify({
            hashGame: crypto.randomBytes(20).toString('hex'),
            time: new Date().toISOString(),
            data: data
          }, null, 2));
        }

        this.championSelectData = data;
        
        // Get analysis
        const response = await this.analysisSystem.analyzeChampionSelect(data);
        
        if (response) {
          // Broadcast to connected clients
          this.wsManager.broadcast({
            type: 'couch-response',
            data: response
          });
          
          logger.info('Champion select analysis updated');
        }
      }
    } catch (error) {
      logger.error('Error in champion select handler', error);
    }
  }

  
  /**
   * Handle live game data events
   */
  private async handleLiveData(data: LiveGameData): Promise<void> {
    try {
      // Extract and normalize item data for comparison
      const deepData = {
        currentItems: data.current.items.map((item: any) => ({
          slot: item.slot,
          displayName: item.displayName
        })),
        allyItems: data.team.players.map((player: any) => ({
          player: player.championName,
          items: player.items.map((item: any) => ({
            slot: item.slot,
            displayName: item.displayName
          }))
        })),
        enemyTeam: data.enemyTeam.players.map((player: any) => ({
          player: player.championName,
          items: player.items.map((item: any) => ({
            slot: item.slot,
            displayName: item.displayName
          }))
        }))
      };
      
      // Track changes since last update
      const resumeChanges: any[] = [];
      let changed = false;
      
      if (this.liveGameData) {
        // Compare current player items
        const currentChanges = diffBySlot(
          this.liveGameData.currentItems, 
          deepData.currentItems
        );
        
        // Compare ally team items
        const allyChanges = getTeamDiff(
          this.liveGameData.allyItems || [], 
          deepData.allyItems || []
        );
        
        // Compare enemy team items
        const enemyChanges = getTeamDiff(
          this.liveGameData.enemyTeam || [], 
          deepData.enemyTeam || []
        );
        
        // Check if any changes were detected
        const currentHashChanges =
          currentChanges.added.length > 0 ||
          currentChanges.removed.length > 0 ||
          currentChanges.updated.length > 0;
        
        const allyHasChanges = allyChanges.some(
          (change) =>
            change.diff.added.length > 0 ||
            change.diff.removed.length > 0 ||
            change.diff.updated.length > 0
        );
        
        const enemyHasChanges = enemyChanges.some(
          (change) =>
            change.diff.added.length > 0 ||
            change.diff.removed.length > 0 ||
            change.diff.updated.length > 0
        );
        
        // If changes detected, prepare detailed change list
        if (currentHashChanges || allyHasChanges || enemyHasChanges) {

          
          if (currentHashChanges) {
            resumeChanges.push({
              player: "current",
              diff: currentChanges
            });
          }
          
          if (allyHasChanges) {
            allyChanges.forEach(({ player, diff }) => {
              if (diff.added.length || diff.removed.length || diff.updated.length) {
                resumeChanges.push({
                  player: player,
                  team: "ally",
                  diff: diff
                });
              }
            });
          }
          
          if (enemyHasChanges) {
            enemyChanges.forEach(({ player, diff }) => {
              if (diff.added.length || diff.removed.length || diff.updated.length) {
                console.log(player, diff);
                
                changed = true;

                resumeChanges.push({
                  player: player,
                  team: "enemy",
                  diff: diff
                });
              }
            });
          }
        }
      } else {
        // First time receiving data
        changed = true;
      }
      
      const activeDirExists = fs.existsSync(path.join(this.dataPath, 'games/active'));
      if(activeDirExists) {
        const dataChampionSelect = JSON.parse(fs.readFileSync(path.join(this.dataPath, 'games/active/champion-select.json'), 'utf8'));
        
        const improvedLivePath = path.join(this.dataPath, 'games/active/live.json');

        if(fs.existsSync(improvedLivePath)) {
          const currentData = JSON.parse(fs.readFileSync(improvedLivePath, 'utf8'));
          fs.writeFileSync(improvedLivePath, JSON.stringify({
            ...currentData,
            data: data
          }, null, 2));
        }
        else {
          fs.writeFileSync(improvedLivePath, JSON.stringify({
            hashGame: dataChampionSelect.hashGame,
            time: new Date().toISOString(),
            data: data
          }, null, 2));
        }
      }
      
      // Always broadcast latest game data to clients
      this.wsManager.broadcast({
        type: 'game-data',
        data: data
      });
      
      // Get existing response if available
      let existingResponse = this.currentGameResponse;
      if (!existingResponse) {
        const filePath = path.join(this.dataPath, 'current/gameResponse.json');
        if (fs.existsSync(filePath)) {
          try {
            const fileData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            existingResponse = fileData.responseStructured || null;
          } catch (error) {
            logger.error('Error reading existing game response', error);
          }
        }
      }
      
      const shouldGetAnalysis = this.shouldPerformPeriodicUpdate(data);

      // console.log({shouldGetAnalysis, changed});

      // Analyze game state if changed or if periodic update is due
      if (changed || shouldGetAnalysis) {
        const response = await this.analysisSystem.analyzeLiveGame(
          data,
          resumeChanges,
          existingResponse
        );
        
        if (response) {
          this.currentGameResponse = response;
          
          // Broadcast to connected clients
          this.wsManager.broadcast({
            type: 'couch-response',
            data: response
          });
          
          logger.info(`Game analysis updated at ${new Date().toISOString()}`);
        }
      }
      
      // Update state tracking
      this.liveGameData = {
        gameTime: data.currentTime,
        // currentGold: data.currentGold,
        ...deepData
      };
    } catch (error) {
      logger.error('Error in live data handler', error);
    }
  }
  
  /**
   * Determine if a periodic update should be performed based on game time
   */
  private shouldPerformPeriodicUpdate(data: LiveGameData): boolean {
    if (!data.currentTime) return false;

    const gameTimeMinutes = data.currentTime / 60;
    
    // Define key game phases where we want to check regardless of item changes
    const keyPhases = [
      5,    // Early laning phase
      10,   // Mid laning phase
      15,   // Early-mid game transition
      20,   // Mid game
      25,   // Mid-late game transition
      30,   // Late game
      35,   // Very late game
    ];
    
    // Check if we're within 30 seconds of a key phase
    for (const phase of keyPhases) {
      const minPhase = phase - 0.5;  // 30 seconds before
      const maxPhase = phase + 0.5;  // 30 seconds after

      // console.log({gameTimeMinutes, minPhase, maxPhase})
      
      if (gameTimeMinutes >= minPhase && gameTimeMinutes <= maxPhase) {
        // Check if we've already analyzed this phase
        const lastUpdateTime = this.liveGameData?.currentTime || 0;
        const lastUpdateMinutes = lastUpdateTime / 60;
        
        // Only update if we haven't already analyzed this phase
        if (lastUpdateMinutes < minPhase || lastUpdateMinutes > maxPhase) {
          return true;
        }
      }
    }
    
    return false;
  }

  private markGameAsEnded(): void {
    const activeDir = path.join(this.dataPath, 'games/active');

    if (fs.existsSync(activeDir)) {
      const improvedPath = path.join(activeDir, 'live.json');
      const championSelectionData = JSON.parse(fs.readFileSync(improvedPath, 'utf8'));
      
      if (championSelectionData && championSelectionData.hashGame) {
        const newDir = path.join(this.dataPath, 'games', championSelectionData.hashGame);
  
        console.log(`Renombrando ${activeDir} a ${newDir}`);
        fs.renameSync(activeDir, newDir);
  
        const newPath = path.join(newDir, 'live.json');
  
        fs.writeFileSync(newPath, JSON.stringify({
          endGame: true,
          ...championSelectionData
        }, null, 2));
      }
    }
  }
  
  /**
   * Handle errors from League client
   */
  private handleError(error: any): void {
    if (!error.code) {
      logger.error('LCU Error:', error);
    } else {
      if (error.status == "ECONNREFUSED" && error.path == "liveclientdata/allgamedata") {
        // Verificar si el cliente de League sigue activo comprobando el lockfile
        
        this.markGameAsEnded();
      }
      else if(error.code === -4078 && error.path == "lol-champ-select/v1/session") {
        const activeDirExists = fs.existsSync(path.join(this.dataPath, 'games/active'));
        if(activeDirExists) {
          const improvedPath = path.join(this.dataPath, 'games/active/champion-select.json');
          const liveGameData = path.join(this.dataPath, 'games/active/live.json');
  
          const championSelectionData = JSON.parse(fs.readFileSync(improvedPath, 'utf8'));
  
          if(!liveGameData) {
            console.log(`Deleted ${improvedPath}`);
            fs.unlinkSync(improvedPath);
          }
        }
      }
  
      // Ignorar errores no críticos
      if (![404, -4078].includes(error.code) && error.status !== 'ECONNRESET') {
        logger.error('LCU Error:', {
          code: error.code,
          status: error.status,
          path: error.path,
          response: error.raw?.response?.data
        });
      }
    }
  }
  
  /**
   * Periodically broadcast current game data to clients
   */
  private broadcastGameData(): void {
    try {
      const filePath = path.join(this.dataPath, 'games/active/live.json');

      if (fs.existsSync(filePath)) {
        const liveGame = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        this.wsManager.broadcast({
          type: 'game-data',
          data: liveGame.data
        });
      }
    } catch (error) {
      logger.error('Error broadcasting game data', error);
    }
  }
  
  private broadcastBuild(): void {
    try {
      const filePath = path.join(this.dataPath, 'games/active/build.json');

      if (fs.existsSync(filePath)) {
        const liveGame = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        this.wsManager.broadcast({
          type: 'build-recomendation',
          data: liveGame
        });
      }
    } catch (error) {
      logger.error('Error broadcasting game data', error);
    }
  }
}
