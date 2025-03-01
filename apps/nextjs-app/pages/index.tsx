import { useEffect, useState } from 'react';
import { GameAdvice } from '../components/gameAdvice';
import { ToastContainer, toast } from 'react-toastify';
import { GameStatus } from '../components/gameStatus';

import React from 'react'

import TimeAgo from 'javascript-time-ago'

import en from 'javascript-time-ago/locale/en'
import es from 'javascript-time-ago/locale/es'

TimeAgo.addDefaultLocale(en)
TimeAgo.addLocale(es)

interface GameData {
  champion: string,
  gameTime: number,
  phase: string,
  lane: string,
  opponent: string,
  teamScore: number,
  enemyScore: number
}

export default function Home() {
  const [connected, setConnected] = useState(false);
  const [gameActive, setGameActive] = useState(false);
  const [selectedChampion, setSelectedChampion] = useState('');
  const [gameData, setGameData] = useState<GameData>({
    champion: "",
    gameTime: 0,
    phase: 'early',
    lane: 'mid',
    opponent: 'Zed',
    teamScore: 0,
    enemyScore: 0
  });

  const [advices, setAdvices] = useState<any[]>([]);

  useEffect(() => {
    const ws = new WebSocket('ws://localhost:8080');

    ws.onopen = () => {
      setConnected(true);
      toast("Conectado al servidor de consejos");
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      console.log('ws-message', data);

      if(data.type == 'game-data') {

        const responseData = data.data;
        
        const updatedGameData = {
          ...gameData,
          champion: responseData.current.championName
        };
        setGameData(updatedGameData);
      }

      if(data.type == 'couch-response') {
        const couchData = data.data;
        if(couchData.final_recommendation) {

          setAdvices(prevAdvices => [
            ...prevAdvices, // <-- Usa el estado más reciente
            {
              id: prevAdvices.length + 1,
              type: 'phase',
              timestamp: new Date(),
              text: couchData.final_recommendation
            }
          ]);
        }
      }
    };

    ws.onerror = () => {
      toast.error("Error en la conexión WebSocket");
    };

    ws.onclose = () => {
      setConnected(false);
      toast("Desconectado del servidor");
    };

    return () => {
      ws.close();
    };
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black text-white">
      <div className="container mx-auto px-4 py-8">
        <h1 className="mb-8 text-3xl font-bold">LoL Coach - Consejos en Tiempo Real</h1>
        
        <div className="mb-6 rounded-lg bg-gray-800 p-4">
          <div className="flex items-center">
            <div className={`mr-2 h-3 w-3 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`}></div>
            <span>{connected ? 'Conectado al servidor' : 'Desconectado'}</span>
          </div>
        </div>
        
        {connected && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <GameAdvice gameData={gameData} advices={advices} />
            </div>
            <div>
              <GameStatus gameData={gameData} />
            </div>
          </div>
        )}
      </div>
      <ToastContainer/>
    </div>
  );
}