import dotenv from 'dotenv';
import fs from 'fs';
import { diff } from "json-diff-ts";

import LCUListener from './LeagueOfLegendsLCU';
import GeminiAI from './GeminiAI';
import DataDragon from './DataDragon';

// Obtiene el meta de objetos actual
const actualItems = DataDragon.getItems();

// Configurar el listener
const listener = new LCUListener(
    `${process.env.PATH_LOL}\\lockfile`,
    './currentGame'
);

console.log(process.env.PATH_LOL)

const api = new GeminiAI(process.env.GEMINI_API ?? "");

// Establecer contexto global (el meta de objetos)
api.setContext({
  patchItems: actualItems.data
});

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

  //console.log(`leftPlayers`, leftPlayers);

  if(changed/* && leftPlayers.length == 0*/) {
    championSelectData = data;
    
    const jsonStructure = fs.readFileSync('data/modelChampionSelect.json', 'utf8');

    const respuesta = await api.askQuestion(
      `A continuación, te proporcionaré un JSON con la información de la selección actual de campeones:
      
      - Campeones seleccionados por mi equipo.
      - Campeones seleccionados por el equipo enemigo.
      - Hechizos (spells) de mi equipo.
      - Baneos realizados.
      
      Analiza la composición de ambos equipos y ofréceme un análisis claro y conciso de la situación actual. Utiliza un lenguaje sencillo, directo y fácil de entender. 
      
      Si recomiendas elegir algún tipo de campeón, por favor incluye ejemplos concretos.
      
      Devuélveme la respuesta en un JSON con la siguiente estructura: ${jsonStructure}`,
      data
    );
    

    fs.writeFileSync('./currentGame/championResponse.json', JSON.stringify(respuesta, null, 2));
    console.log(`championResponseUpdate`);
  }
});

listener.on('liveData', async (data: any) => {
  const deepData = {
    currentItems: data.currentItems,
    allyItems: data.team.players.map((player: any) =>
      player.items.map((item: any) => item.displayName)
    ),
    enemyTeam: data.enemyTeam.players.map((player: any) =>
      player.items.map((item: any) => item.displayName)
    )
  };
  
  let changed = true;
  
  if (catchLiveData) {
    // Comparar arrays usando json-diff-ts
    const allyDiff = diff(catchLiveData.allyItems, deepData.allyItems);
    const enemyDiff = diff(catchLiveData.enemyTeam, deepData.enemyTeam);

    const allyHasChanges = allyDiff && Object.keys(allyDiff).length > 0;
    const enemyHasChanges = enemyDiff && Object.keys(enemyDiff).length > 0;
  
    if (allyHasChanges || enemyHasChanges) {
      console.log("Se detectaron cambios en los ítems:");
      if (allyDiff) console.log("Cambios en aliados:", {
        allyDiff
      });
      if (enemyDiff) console.log("Cambios en enemigos:", {
        enemyDiff
      });
    } else {
      changed = false;
    }
  }

  if (changed) {
    const jsonStructure = fs.readFileSync('data/modelStructure.json', 'utf8');

    const respuesta = await api.askQuestion(
      `
      Se te proporcionan dos JSON:
        1. "actualItems": lista de items actuales (mantén los nombres tal cual).
        2. "currentGame": estadísticas de la partida, donde "current" corresponde al jugador a ayudar y se incluye información del enemigo en la misma posición.
    
      Analiza lo siguiente:
        - Identifica los items necesarios para hacer counter/ganar ventaja.
        - Evalúa estadísticas clave: cs, oro, kills (aliadas y enemigas) y torretas.
        - Determina si hay un win condition o un carry (ya sea aliado o enemigo) que deba focalizarse.
        - Si el jugador a ayudar es jungla, brindale las rutas mas eficientes para limpiar y gankear.
    
      Responde de forma clara, concisa y técnica utilizando el formato JSON especificado en "structure".
      `,
      {
        structure: jsonStructure,
        currentGame: data,
        actualItems: data.currentItems
      }
    );

    fs.writeFileSync('./currentGame/gameResponse.json', JSON.stringify(respuesta, null, 2));
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