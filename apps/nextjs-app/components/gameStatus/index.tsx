"use client";

import { Shield, Sword, Clock, Trophy } from 'lucide-react';

import styles from './index.module.css'
import ProgressBar from '../ProgressBar';
import { getChampionImage } from '../../utils/get-champion-image';

interface GameStatusProps {
  gameData: any;
}

export function GameStatus({ gameData }: GameStatusProps) {
  if (!gameData) {
    return (
      <div className={styles.card}>
        <div>
          <div>Estado de la Partida</div>
        </div>
        <div>
          <p className="text-gray-400">Esperando datos del juego...</p>
        </div>
      </div>
    );
  }
  
  // Format game time
  const minutes = Math.floor(gameData.currentTime / 60);
  const seconds = Math.round(gameData.currentTime % 60);
  const formattedTime = `${minutes}:${seconds.toString().padStart(2, '0')}`;
  
  const phasesStyles: any = {
    early: 'text-green-400',
    mid: 'text-yellow-400',
    late: 'text-red-400'
  };

  // Determine game phase color
  const phaseColor = gameData.phase ? phasesStyles[gameData.phase] : '';
  
  // Calculate win probability (simplified example)
  const scoreDiff = gameData.teamScore - gameData.enemyScore;
  let winProbability = 50; // Base 50%
  
  if (scoreDiff !== 0) {
    // Adjust by 5% per kill difference, capped between 10% and 90%
    winProbability = Math.min(90, Math.max(10, 50 + (scoreDiff * 5)));
  }
  
  return (
    <div className={styles.card}>
      <div className={styles["card-header"]}>
        <div className={styles["card-title"]}>Estado de la Partida</div>
      </div>
      <div className={styles["card-content"]}>
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <Clock className="mr-2 h-5 w-5 text-blue-400" />
            <span className="text-lg font-medium">Tiempo</span>
          </div>
          <span className="text-lg">{formattedTime}</span>
        </div>
        
        <div>
          <div className="mb-1 flex items-center">
            <span className="text-sm">Fase de juego: </span>
            <span className={`ml-2 text-sm font-medium capitalize ${phaseColor}`}>
              {gameData.phase}
            </span>
          </div>
          <ProgressBar
            value={gameData.phase === 'early' ? 33 : gameData.phase === 'mid' ? 66 : 100}
            max={100}
          />
        </div>
        
        <div style={{ margin: '1.2rem 0' }}>
          <h3 className="mb-2 text-lg font-medium">Enfrentamiento</h3>
          <div className="rounded-lg bg-gray-900 p-3">
            <div className="mb-2 flex items-center justify-between">
              <div>
                <span className="text-sm text-gray-400">Tú</span>
                <div>
                  <img src={getChampionImage(gameData.current.championName)} alt="" />
                </div>
                <p className="font-medium">{gameData.champion}</p>
              </div>
              <span className="text-lg">vs</span>
              <div className="text-right">
                <span className="text-sm text-gray-400">Oponente</span>
                <div>
                  <img src={getChampionImage(gameData.current.directOponent)} alt="" />
                </div>
                <p className="font-medium">{gameData.opponent}</p>
              </div>
            </div>
            <div className="text-sm text-gray-400">
              Carril: <span className="capitalize">{gameData.current.position}</span>
            </div>
          </div>
        </div>
        
        <div>
          <div className="mb-1 flex items-center justify-between">
            <div className="flex items-center">
              <Trophy className="mr-2 h-5 w-5 text-yellow-400" />
              <span>Probabilidad de victoria</span>
            </div>
            <span className="font-medium">{winProbability}%</span>
          </div>
          <ProgressBar 
            value={winProbability} 
            max={100}
          />
          
          {/*
            indicatorClassName={winProbability > 50 ? "bg-green-500" : "bg-red-500"}*/}

        </div>
      </div>
    </div>
  );
}