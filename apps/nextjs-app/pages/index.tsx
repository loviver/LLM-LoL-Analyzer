import { useEffect, useState } from 'react';
import { GameAdvice } from '../components/gameAdvice';
import { ToastContainer, toast } from 'react-toastify';
import { GameStatus } from '../components/gameStatus';

import React from 'react'

import TimeAgo from 'javascript-time-ago'

import en from 'javascript-time-ago/locale/en'
import es from 'javascript-time-ago/locale/es'
import MatchCard from '../components/MatchCard';
import ItemBuild from '../components/ItemBuild';

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
  const [gameData, setGameData] = useState<any>(null);
  const [buldRecomedation, setBuldRecomedation] = useState<any>(null);
  const [advices, setAdvices] = useState<any[]>([]);

  const [ws, setWs] = useState<WebSocket | null>(null); // WebSocket en estado

  useEffect(() => {
    const websocket = new WebSocket('ws://localhost:8080');
    setWs(websocket);

    websocket.onopen = () => {
      setConnected(true);
      toast("Conectado al servidor de consejos");
    };

    websocket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      console.log('ws-message', data);

      if (data.type === 'game-data') {
        const responseData = data.data;
        const updatedGameData = {
          ...gameData,
          ...responseData
        };
        setGameData(updatedGameData);
      }

      if (data.type === 'build-recomendation') {
        setBuldRecomedation(data.data.coreBuild);
      }

      if (data.type === 'couch-response') {
        const couchData = data.data;
        if (couchData.final_recommendation) {
          setAdvices(prevAdvices => [
            ...prevAdvices,
            {
              author: "couch",
              id: prevAdvices.length + 1,
              type: 'phase',
              timestamp: new Date(),
              text: couchData.final_recommendation
            }
          ]);
        }
      }
    };

    websocket.onerror = () => {
      toast.error("Error en la conexión WebSocket");
    };

    websocket.onclose = () => {
      setConnected(false);
      toast("Desconectado del servidor");
    };

    // Limpiar la conexión WebSocket cuando el componente se desmonta
    return () => {
      websocket.close();
    };
  }, []); // Solo se ejecuta una vez cuando el componente se monta

  // Función para enviar el mensaje de consulta al servidor
  const sendQuery = (message: string) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'query', message }));
    } else {
      toast.error("WebSocket no está conectado");
    }
  };

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
        
        {connected && gameData && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <MatchCard match={gameData} />

              {buldRecomedation && (
                <ItemBuild builds={buldRecomedation} />
              )}
            </div>
            <div style={{
              gap: '1rem',
              display: 'flex',
              flexDirection: 'column',
            }}>
              <GameStatus gameData={gameData} />
              <GameAdvice gameData={gameData} advices={advices} setAdvices={setAdvices} sendQuery={sendQuery} />
            </div>
          </div>
        )}
      </div>
      <ToastContainer />
    </div>
  );
}
