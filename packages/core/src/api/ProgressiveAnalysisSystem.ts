
import fs from 'fs';
import path from 'path';

import Logger from '../utils/logger';
import GeminiAI from "../services/GeminiAI";
import { AIResponse, AnalysisRequest, ChampionSelectData, LiveGameData } from "../types";

import { ResponseCache } from "./ResponseCache";

const logger = new Logger('main');

export class ProgressiveAnalysisSystem {
  private aiService: GeminiAI;
  private dataPath: string;
  private cache: ResponseCache;
  private lastAnalysisTime: Map<string, number> = new Map();
  private analysisThrottleTime: Map<string, number> = new Map();
  
  constructor(aiService: GeminiAI, dataPath: string) {
    this.aiService = aiService;
    this.dataPath = dataPath;
    this.cache = new ResponseCache();
    
    // Set up default throttle times for different analysis types
    this.analysisThrottleTime.set('champion-select', 1000); // 1 seconds
    this.analysisThrottleTime.set('early-game', 15000);     // 15 seconds
    this.analysisThrottleTime.set('mid-game', 30000);       // 30 seconds
    this.analysisThrottleTime.set('late-game', 60000);      // 60 seconds
    this.analysisThrottleTime.set('enemy-item-change', 8000); // 8 seconds
  }
  
  async getPreviusContextChat() {
    const contextChat = path.resolve('../../data/games/active/context-chat.json');
    let previousContextChat = [];

    console.log(contextChat);
    
    if (fs.existsSync(contextChat)) {
      previousContextChat = JSON.parse(fs.readFileSync(contextChat, 'utf-8'));
    }
    return previousContextChat;
  }

  /**
   * Determines what type of analysis to perform based on game state
   */
  async analyzeChampionSelect(data: ChampionSelectData): Promise<AIResponse | null> {
    // Check throttle
    const now = Date.now();
    const lastTime = this.lastAnalysisTime.get('champion-select') || 0;
    const throttleTime = this.analysisThrottleTime.get('champion-select') || 5000;
    
    /*
    if (now - lastTime < throttleTime) {
      return null;
    }
    */
    
    // Check if we already have this analysis cached
    const cacheKey = this.cache.createKey('champion-select', data);
    const cachedResponse = this.cache.get(cacheKey);
    /*
    if (cachedResponse) {
      return cachedResponse;
    }
    */
    
    this.lastAnalysisTime.set('champion-select', now);
    
    try {
      const jsonStructure = fs.readFileSync(path.join(this.dataPath, 'static/modelChampionSelect.json'), 'utf8');
      
      const request: AnalysisRequest = {
        type: 'champion-select',
        prompt: `Estás actuando como un entrenador de League of Legends profesional.
        
        A continuación, te proporcionaré un JSON con la información de la selección actual de campeones:
        
        - Campeones seleccionados por mi equipo.
        - Campeones seleccionados por el equipo enemigo.
        - Hechizos (spells) de mi equipo.
        - Baneos realizados.
        
        Analiza la composición de ambos equipos y ofréceme de forma clara y concisa:
        1. Qué fortalezas y debilidades tiene nuestra composición
        2. Qué campeones podrían complementar bien nuestra selección actual
        3. Recomendaciones de runas específicas para el matchup
        4. Estrategia general recomendada para la fase de lanes
        
        Utiliza un lenguaje directo y fácil de entender. Si recomiendas elegir algún tipo de campeón, por favor incluye 2-3 ejemplos concretos.
        
        Devuélveme la respuesta en un JSON con la siguiente estructura: ${jsonStructure}`,
        data: data
      };
      
      const response = await this.aiService.askQuestion(request.prompt, {
        data: request.data,
        previusContextChat: await this.getPreviusContextChat()
      });
      
      // Cache the response
      this.cache.set(cacheKey, response);
      
      // Save to disk for audit/debug
      fs.writeFileSync(
        path.join(this.dataPath, 'current/championResponse.json'), 
        JSON.stringify(response, null, 2)
      );
      
      return response;
    } catch (error) {
      logger.error('Error analyzing champion select', error);
      return null;
    }
  }
  
  /**
   * Analyzes live game data with progressive depth based on game state
   */
  async analyzeLiveGame(
    data: LiveGameData,
    changes: any[], 
    previousResponse: any = null
  ): Promise<AIResponse | null> {
    // Determine game phase based on time
    let gamePhase = 'early-game';
    const gameTimeMinutes = (data.currentTime || 0) / 60;
    
    if (gameTimeMinutes >= 25) {
      gamePhase = 'late-game';
    } else if (gameTimeMinutes >= 15) {
      gamePhase = 'mid-game';
    }
    
    // Check if there are enemy item changes (those are high priority)
    const hasEnemyItemChanges = changes.some(change => change.team === 'enemy');
    const analysisType = hasEnemyItemChanges ? 'enemy-item-change' : gamePhase;
    
    // Check throttle
    const now = Date.now();
    const lastTime = this.lastAnalysisTime.get(analysisType) || 0;
    const throttleTime = this.analysisThrottleTime.get(analysisType) || 30000;
    
    if (now - lastTime < throttleTime) {
      return null;
    }
    
    // If no meaningful changes and not enough time has passed, skip analysis
    if (changes.length === 0 && now - lastTime < throttleTime * 2) {
      return null;
    }
    
    // Check if we already have this analysis cached
    const cacheKey = this.cache.createKey('game-analysis', {
      gameTime: data.currentTime,
      resumeChanges: changes
    });
    
    const cachedResponse = this.cache.get(cacheKey);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    this.lastAnalysisTime.set(analysisType, now);
    
    try {
      const jsonStructure = fs.readFileSync(path.join(this.dataPath, 'static/modelStructure.json'), 'utf8');
      
      // Build context based on game phase
      let contextDetail = 'básico';
      let focusArea = '';
      
      if (gamePhase === 'early-game') {
        contextDetail = 'detallado';
        focusArea = 'Enfócate principalmente en la fase de línea, CS, y primeras compras.';
      } else if (gamePhase === 'mid-game') {
        contextDetail = 'detallado';
        focusArea = 'Enfócate en objetivos, agrupamientos y construcción de objetos core.';
      } else if (gamePhase === 'late-game') {
        contextDetail = 'completo';
        focusArea = 'Analiza condiciones de victoria, posicionamiento en teamfights y objetos definitivos.';
      }
      
      if (hasEnemyItemChanges) {
        focusArea += ' Prioriza el análisis de los cambios recientes en items enemigos y cómo contrarrestarlos.';
      }
      
      const currentContext = {
        structure: jsonStructure,
        currentGame: data,
        actualItems: data.currentItems,
        resumeChanges: changes,
        history_couch: previousResponse || {},
        gamePhase: gamePhase,
        gameTimeMinutes: gameTimeMinutes
      };
      
      const request: AnalysisRequest = {
        type: 'game-analysis',
        prompt: `Estás actuando como un analista profesional de League of Legends en tiempo real.
        
        Se te proporcionan los siguientes datos:
          1. "actualItems": lista de items actuales del jugador.
          2. "currentGame": estadísticas completas de la partida actual.
          3. "resumeChanges": cambios recientes en items de todos los jugadores.
          4. "history_couch": tus recomendaciones previas (evita repetirlas).
          5. "gamePhase": ${gamePhase} (${gameTimeMinutes.toFixed(1)} minutos).
        
        Proporciona un análisis ${contextDetail} de la situación actual. ${focusArea}
        
        Analiza específicamente:
          - Items necesarios para contrarrestar al enemigo o aprovechar ventajas.
          - Estadísticas clave (CS, oro, K/D/A) y su impacto en la partida.
          - Win conditions y jugadores clave (aliados o enemigos).
          - Si el jugador es jungla, rutas eficientes para limpiar y gankear.
        
        NO REPITAS consejos ya dados en "history_couch". Si no hay nada nuevo que añadir a una sección, déjala vacía.
        La recomendación final debe ser concisa y en texto plano, enfocada en las 1-2 acciones más importantes a realizar ahora.
        
        Responde utilizando el formato JSON especificado en "structure".`,
        data: currentContext
      };
      
      const response = await this.aiService.askQuestion(request.prompt, {
        data: request.data,
        previusContextChat: await this.getPreviusContextChat()
      });
      
      // Merge with previous response to build comprehensive advice
      const mergedResponse = this.mergeWithPreviousResponse(response, previousResponse);
      
      // Cache the merged response
      this.cache.set(cacheKey, mergedResponse);
      
      // Save to disk
      fs.writeFileSync(
        path.join(this.dataPath, 'current/gameResponse.json'), 
        JSON.stringify({
          responseStructured: mergedResponse,
          rawResponse: response,
          gameState: {
            phase: gamePhase,
            time: gameTimeMinutes
          }
        }, null, 2)
      );
      
      return mergedResponse;
    } catch (error) {
      logger.error('Error analyzing live game', error);
      return null;
    }
  }
  
  /**
   * Merges new response with previous one to build comprehensive advice
   */
  private mergeWithPreviousResponse(newResponse: any, previousResponse: any): any {
    if (!previousResponse) return newResponse;
    
    // Create a deep copy of the previous response
    const merged = JSON.parse(JSON.stringify(previousResponse));
    
    // Only add new tips/recommendations (avoid duplicates)
    const mergeArrayField = (fieldName: string) => {
      if (!newResponse[fieldName] || newResponse[fieldName].length === 0) return;
      
      if (!merged[fieldName]) {
        merged[fieldName] = [];
      }
      
      // Add only unique new tips
      for (const tip of newResponse[fieldName]) {
        if (!merged[fieldName].includes(tip)) {
          merged[fieldName].push(tip);
        }
      }
    };
    
    // Merge array fields
    ['role_tips', 'feedback_mybuild', 'feedback_update_builds_notify', 'item_build_counter_tips']
      .forEach(mergeArrayField);
    
    // Always update these fields with latest values
    ['matchVs', 'final_recommendation', 'item_build_core']
      .forEach(field => {
        if (newResponse[field]) {
          merged[field] = newResponse[field];
        }
      });
    
    return merged;
  }
}
