import dotenv from 'dotenv';
import WebSocket, { WebSocketServer } from 'ws';

import fs from 'fs';
import { diff } from "json-diff-ts";

import LCUListener from './api/LeagueOfLegendsLCU';
import GeminiAI from './services/GeminiAI';
import DataDragon from './api/DataDragon';
import { formatDiff } from './utils/format-diff';
import { diffBySlot, getTeamDiff } from './utils/diff-by-slot';

// Obtiene el meta de objetos actual
const actualItems = DataDragon.getItems();

// Configurar el listener
const listener = new LCUListener(
    `${process.env.PATH_LOL}\\lockfile`,
    './data/current'
);

console.log(process.env.PATH_LOL)

const api = new GeminiAI(process.env.GEMINI_API ?? "");

// Establecer contexto global (el meta de objetos)
/*
api.setContext({
  patchItems: actualItems.data
});
*/


const PORT = 8080;
const wss = new WebSocketServer({ port: PORT });

console.log(`✅ WebSocket Server running on ws://localhost:${PORT}`);

const clients = new Set<WebSocket>();

setInterval(() => {

  const readImprovedData = JSON.parse(fs.readFileSync('./data/current/liveDataImproved.json', 'utf8'));

  broadcast({
    type: 'game-data',
    data: readImprovedData
  });
}, 5000);

wss.on('connection', (ws) => {
  console.log("🔌 Nuevo cliente conectado");
  clients.add(ws);

  ws.on('close', () => {
    console.log("❌ Cliente desconectado");
    clients.delete(ws);
  });
});

// Función para enviar datos a los clientes
const broadcast = (data: any) => {
  const message = JSON.stringify(data);
  clients.forEach(client => {
    if (client.readyState === client.OPEN) {
      client.send(message);
    }
  });
};

var catchLiveData: any = null;
var championSelectData: any = null;

// Escuchar eventos
listener.on('championSelect', async (data: any) => {

  let changed = true;

  if (championSelectData) {
    // Comparar el contenido en lugar de la referencia en memoria
    if (JSON.stringify(championSelectData) === JSON.stringify(data)) {
      changed = false;
    }
  }

  const leftPlayers = [
    ...data.teams.myTeam,
    ...data.teams.enemyTeam
  ].filter((player: any) => player.completed === false);

  const isYourTurn = data.teams.myTeam.some((player: any) => player.isInProgress === true);

  if(changed && (isYourTurn || leftPlayers.length == 0)) {
    championSelectData = data;
    
    const jsonStructure = fs.readFileSync('data/static/modelChampionSelect.json', 'utf8');

    const respuesta = await api.askQuestion(
      `A continuación, te proporcionaré un JSON con la información de la selección actual de campeones:
      
      - Campeones seleccionados por mi equipo.
      - Campeones seleccionados por el equipo enemigo.
      - Hechizos (spells) de mi equipo.
      - Baneos realizados.
      
      Analiza la composición de ambos equipos y 
      ofréceme de forma clara y concisa qué nos haría falta o si hay runas específicas para el matchup,
      así como cualquier otra recomendación que consideres necesaria. 
      Utiliza un lenguaje sencillo, directo y fácil de entender. 

      Si recomiendas elegir algún tipo de campeón, por favor incluye ejemplos concretos.
      
      Devuélveme la respuesta en un JSON con la siguiente estructura: ${jsonStructure}`,
      data
    );

    broadcast({
      type: 'couch-response',
      data: respuesta
    });

    fs.writeFileSync('./data/current/championResponse.json', JSON.stringify(respuesta, null, 2));
    console.log(`championResponseUpdate`);
  }
});

listener.on('liveData', async (data: any) => {
  const deepData = {
    currentItems: data.current.items.map((item: any) => ({
      slot: item.slot,
      displayName: item.displayName
    })),
    allyItems: data.team.players.map((player: any) => {
      return {
        player: player.championName,
        items: player.items.map((item: any) => ({
          slot: item.slot,
          displayName: item.displayName
        }))
      }
    }),
    enemyTeam: data.enemyTeam.players.map((player: any) => {
      return {
        player: player.championName,
        items: player.items.map((item: any) => ({
          slot: item.slot,
          displayName: item.displayName
        }))
      }
    })
  };
  
  let changed = true;
  
  const showChanges = (obj: any) => {
      
    /*
    if (obj.added.length > 0) {
      console.log("    ➕ Agregados:", obj.added);
    }
    if (obj.removed.length > 0) {
      console.log("    ❌ Quitados:", obj.removed);
    }
    if (obj.updated.length > 0) {
      console.log("    🔄 Sustituidos:", obj.updated);
    }
    */
  };

  const resumeChanges = [];

  if (catchLiveData) {
    // Comparar arrays usando json-diff-ts
    const currentChanges = diffBySlot(catchLiveData.currentItems, deepData.currentItems);

    const allyChanges = getTeamDiff(catchLiveData.allyItems || [], deepData.allyItems || []);

    const enemyChanges = getTeamDiff(catchLiveData.enemyTeam || [], deepData.enemyTeam || []);

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

    if (/*currentHashChanges || allyHasChanges || */enemyHasChanges) {
      console.log("Se detectaron cambios en los ítems:");
      
      if (currentHashChanges) {
        console.log("Cambios del jugador actual:");

        resumeChanges.push({
          "player": "current",
          "diff": currentChanges
        });
        
        showChanges(diff);

      }

      if (allyHasChanges) {
        console.log("🟢 Cambios en aliados:");
      
        allyChanges.forEach(({ player, diff }) => {
          if (diff.added.length || diff.removed.length || diff.updated.length) {
            console.log(`  🎭 ${player}:`);

            resumeChanges.push({
              "player": player,
              "team": "ally",
              "diff": diff
            });
            
            showChanges(diff);
          }
        });
      }
    
      if (enemyHasChanges) {
        console.log("🔴 Cambios en enemigos:");
        enemyChanges.forEach(({ player, diff }) => {
          if (diff.added.length || diff.removed.length || diff.updated.length) {
            console.log(`  😈 ${player}:`);
            
            resumeChanges.push({
              "player": player,
              "team": "enemy",
              "diff": diff
            });
            
            showChanges(diff);
          }
        });
      }
    } else {
      changed = false;
    }
  }

  broadcast({
    type: 'game-data',
    data: data
  });

  if (changed) {
    
    let existingData: any = {};
    const filePath = './data/current/gameResponse.json';
    
    if (fs.existsSync(filePath)) {
      try {
        existingData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      } catch (error) {
      }
    }

    const jsonStructure = fs.readFileSync('data/static/modelStructure.json', 'utf8');

    const currentContext = {
      structure: jsonStructure,
      currentGame: data,
      actualItems: data.currentItems,
      resumeChanges: resumeChanges,
      history_couch: existingData ? existingData.responseStructured : {}
    };

    const respuesta = await api.askQuestion(
      `
      Se te proporcionan los JSON:
        1. "actualItems": lista de items actuales (mantén los nombres tal cual).
        2. "currentGame": estadísticas de la partida, donde "current" corresponde al jugador a ayudar y se incluye información del enemigo en la misma posición.
        3. "resumeChanges": contiene cambios recientes en la build de los jugadores.
        4. "history_couch": contiene la informacion que ya has brindado o conoce el jugador, evita repetir algo que ya conoce, si no tienes nada nuevo para aportar devuelve vacio el campo.

      Analiza lo siguiente:
        - Identifica los items necesarios para hacer counter/ganar ventaja.
        - Evalúa estadísticas clave: cs, oro, kills (aliadas y enemigas) y torretas.
        - Determina si hay un win condition o un carry (ya sea aliado o enemigo) que deba focalizarse.
        - Si el jugador a ayudar es jungla, brindale las rutas mas eficientes para limpiar y gankear.
        - "final_recommendation" debe ir en texto plano
    
      Responde de forma clara, concisa y técnica utilizando el formato JSON especificado en "structure".
      `,
      currentContext
    );

    broadcast({
      type: 'couch-response',
      data: respuesta
    });

    const newData = {
      responseStructured: {
        champion: data.current.championName,
        matchVs: respuesta.matchVs,
        final_recommendation: respuesta.final_recommendation,
        role_tips: Array.from(
            new Set([
                ...(existingData.responseStructured?.role_tips || []),
                ...respuesta.role_tips,
            ])
        ),
        feedback_mybuild: Array.from(
            new Set([
                ...(existingData.responseStructured?.feedback_mybuild || []),
                ...respuesta.feedback_mybuild,
            ])
        ),
        feedback_update_builds_notify: Array.from(
            new Set([
                ...(existingData.responseStructured?.feedback_update_builds_notify || []),
                ...respuesta.feedback_update_builds_notify,
            ])
        ),
        item_build_core: respuesta.item_build_core,
        item_build_counter_tips: Array.from(
          new Set([
              ...(existingData.responseStructured?.item_build_counter_tips || []),
              ...respuesta.item_build_counter_tips,
          ])
      ),
      },
      respuesta,
      prompt: currentContext
    };
    
    fs.writeFileSync(filePath, JSON.stringify(newData, null, 2));

    console.log(`gameResponseUpdate ${Date.now()}`);

    catchLiveData = {
      currentGold: data.currentGold,
      ...deepData
    };
  }
});

listener.on('error', (error: any) => {
  if(!error.code) {
    console.error('Error:', error);
  }
  else {
    if(![404, -4078].includes(error.code)) {
      console.error('Error:', {
        code: error.code,
        status: error.status,
        path: error.path,
        raw: error.raw.response.data
      });
    }
  }
});

listener.start();

// listener.stop();