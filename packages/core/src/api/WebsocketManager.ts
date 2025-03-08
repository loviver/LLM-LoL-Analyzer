
import fs from 'fs';
import path from 'path';
import WebSocket, { WebSocketServer } from 'ws';

import Logger from "../utils/logger";
import { BroadcastMessage } from '../types';
import GeminiAI from '../services/GeminiAI';

export class WebSocketManager {
  private server: WebSocketServer;
  private aiService: GeminiAI;
  private loggerInstance: Logger | null = null;
  private clients: Set<WebSocket> = new Set();
  
  constructor(port: number, logger: Logger, aiService: GeminiAI) {
    this.server = new WebSocketServer({ port });

    this.loggerInstance = logger;

    this.aiService = aiService;
    
    this.server.on('connection', this.handleConnection.bind(this));
    
    this.logger('info', `WebSocket Server running on ws://localhost:${port}`);
  }

  private logger(type: string, text: string, data?: any): void {
    if(this.loggerInstance) {
      if(type === 'error') {
        this.loggerInstance.error(text, data);
      } else if(type === 'info') {
        this.loggerInstance.info(text, data);
      }
    }
  }
  
  private handleConnection(ws: WebSocket): void {
    this.logger('info', "New client connected");
    this.clients.add(ws);
    
    ws.on('message', (message: any) => {
      try {
        const data = JSON.parse(message.toString());
        this.handleClientMessage(ws, data);
      } catch (error) {
        this.logger('error', 'Error parsing client message', error);
      }
    });
    
    ws.on('close', () => {
      this.logger('info', "Client disconnected");
      this.clients.delete(ws);
    });
    
    ws.on('error', (error) => {
      this.logger('error', 'WebSocket error', error);
    });
  }
  
  private async handleClientMessage(ws: WebSocket, data: any): Promise<void> {
    // Handle client requests like preferences, manual refresh requests, etc.
    if (data.type === 'query') {

      const prompt = data.message;

      const activeGame = path.resolve('../../data/games/active/live.json');
      
      const contextChat = path.resolve('../../data/games/active/context-chat.json');
      
      console.log(activeGame);

      if(fs.existsSync(activeGame)) {

        const activeGameData = JSON.parse(fs.readFileSync(activeGame, 'utf-8'));
        console.log(activeGameData);

        // Leer el contexto anterior si existe
        let previousContextChat = [];
        if (fs.existsSync(contextChat)) {
          previousContextChat = JSON.parse(fs.readFileSync(contextChat, 'utf-8'));
        }

        // Agregar el mensaje actual al contexto
        previousContextChat.push({
          "user": data.message,
          "ia": null // El IA no ha respondido todavía en este paso
        });

        // Concatenar el contexto a la pregunta
        const conversationHistory = previousContextChat.map((item: any) => 
          `User: ${item.user}\nIA: ${item.ia || ""}`).join("\n");

        // Crear el nuevo prompt con el contexto
        const newPrompt = `${conversationHistory}\nUser: ${data.message}`;

        const response = await this.aiService.askQuestion(newPrompt, {
          currentGame: activeGameData
        });

        previousContextChat[previousContextChat.length - 1].ia = response;

        fs.writeFileSync(contextChat, JSON.stringify(previousContextChat), 'utf-8');

        this.broadcast({
          type: 'couch-response',
          data: {
            final_recommendation: response
          }
        });
      }
    }
  }
  
  broadcast(data: BroadcastMessage): void {
    const message = JSON.stringify(data);
    this.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }
}