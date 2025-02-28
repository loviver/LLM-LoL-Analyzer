import fs from 'fs';

import LCUListener from './LeagueOfLegendsLCU';
import GeminiAI from './GeminiAI';
import DataDragon from './DataDragon';

// Obtiene el meta de objetos actual
const actualItems = DataDragon.getItems();

// Configurar el listener
const listener = new LCUListener(
    "D:\\Games\\Riot Games\\LOL\\League of Legends\\lockfile",
    './currentGame'
);

const api = new GeminiAI('AIzaSyDKxqLNgzybCsKNkUl8BUbQpI6KeE14bdg');

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
    if(championSelectData === data) {
      changed = false;
    }
  }

  const leftPlayers = [
    ...data.teams.myTeam,
    ...data.teams.enemyTeam
  ].filter((player: any) => player.completed === false);

  console.log(`leftPlayers`, leftPlayers);

  if(changed && leftPlayers.length < 2) {
    championSelectData = data;
    
    const jsonStructure = fs.readFileSync('data/modelChampionSelect.json', 'utf8');

    const respuesta = await api.askQuestion(
      `Te brindaré un JSON que tiene información de mi selección de campeones actual,
      En ella estarán los campeones que tiene mi equipo y los campeones que tiene el equipo enemigo.
      Los spells de mi equipo y los baneos hechos, debes analizar la composición que tiene mi equipo 
      hasta el momento y la del equipo enemigo y darme un análisis de la situación actual.
      Trata de utilizar un lenguaje facil de digerir, ser directo y conciso. 
      Quiero que me brindes
      la informacion en un JSON con la siguiente estructura: ${jsonStructure}`,
      data
    );
  
    console.log('Champion select updated:', {
      data, respuesta
    });
  }
});

listener.on('liveData', (data: any) => {

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
      catchLiveData.allyItems === deepData.allyItems
      && catchLiveData.enemyTeam === deepData.enemyTeam) {
      changed = false;
    }
  }

  if(changed) {
    console.log('Live game data updated:', data);

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
        path: error.path
      });
    }
  }
});

listener.start();

// listener.stop();