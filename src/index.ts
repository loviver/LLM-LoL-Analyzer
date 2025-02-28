import dotenv from 'dotenv';
import fs from 'fs';

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

const api = new GeminiAI(process.env.GEMINI_API ?? "");

// Establecer contexto global (el meta de objetos)
api.setContext({
  patchItems: actualItems.data
});

var catchLiveData: any = null;
var championSelectData: any = null;

// Escuchar eventos
listener.on('championSelect', async (data: any) => {

  var changed = true;

  if(championSelectData) {
    if(championSelectData !== data) {
      changed = false;
    }
  }

  const leftPlayers = [
    ...data.teams.myTeam,
    ...data.teams.enemyTeam
  ].filter((player: any) => player.completed === false);

  console.log(`leftPlayers`, leftPlayers);

  if(changed && leftPlayers.length == 0) {
    championSelectData = data;
    
    const jsonStructure = fs.readFileSync('data/modelChampionSelect.json', 'utf8');

    const respuesta = await api.askQuestion(
      `Te brindaré un JSON que tiene información de mi selección de campeones actual,
      En ella estarán los campeones que tiene mi equipo y los campeones que tiene el equipo enemigo.
      Los spells de mi equipo y los baneos hechos, debes analizar la composición que tiene mi equipo 
      hasta el momento y la del equipo enemigo y darme un análisis de la situación actual.
      Trata de utilizar un lenguaje facil de digerir, ser directo y conciso. 

      Si brindas alguna recomendacion de que tipo de campeon pickear, da ejemplos,
      Quiero que me brindes
      la informacion en un JSON con la siguiente estructura: ${jsonStructure}`,
      data
    );

    fs.writeFileSync('./currentGame/championResponse.json', JSON.stringify(data, null, 2));
    console.log(`championResponseUpdate`);
  }
});

listener.on('liveData', async (data: any) => {

  const deepData = {
    currentItems: data.currentItems,
    allyItems: data.team.players.map((player: any) => {
      return player.items;
    }),
    enemyTeam: data.enemyTeam.players.map((player: any) => {
      return player.items;
    })
  };

  let changed = true;

  if(catchLiveData) {
    if(
      !(catchLiveData.allyItems === deepData.allyItems
        && catchLiveData.enemyTeam === deepData.enemyTeam)) {
      changed = false;
    }
  }

  if(changed) {
    // console.log('Live game data updated:', data);

    const jsonStructure = fs.readFileSync('data/modelStructure.json', 'utf8');
    
    const respuesta = await api.askQuestion(
      `Respondeme en un JSON bien estructurado de la siguiente forma ${JSON.stringify(jsonStructure)}.
      Te brindare un JSON con los items actuales del juego y otro json con algunos stats de la partida actual
      para que puedas determinar la respuesta considera
      los items mas raros y dificiles de counterear o mas fuertes.
      Se claro y conciso en tu respuesta, si es sabes quien es el win condition, el carry aliado o enemigo y hay
      que enfocarse en el dilo,
      Analiza en base a los cs actuales, el oro, kills aliadas y enemigas, torretas.
      Ten en cuenta que el indice 'current' contiene los stats del jugador a ayudar,
      ten en cuenta para comparar con el rol enemigo de la misma posicion.
      Los nombres de los items, usa tal cual te los brindo.`,
      {
        currentGame: data,
        actualItems: actualItems
      }
    );

    fs.writeFileSync('./currentGame/gameResponse.json', JSON.stringify(respuesta, null, 2));
    console.log(`gameResponseUpdate`);

    const fileName = `${respuesta.champion.name}+${Date.now()}.json`;

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