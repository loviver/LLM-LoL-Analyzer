"use client";

import { useEffect, useRef } from 'react';

import ReactTimeAgo from 'react-time-ago'

import styles from './index.module.css';
import clsx from 'clsx';

interface Advice {
  id: number;
  text: string;
  type: string;
  timestamp: number;
}

interface GameData {
  champion: string;
  gameTime: number;
  phase: string;
  lane: string;
  opponent: string;
  teamScore: number;
  enemyScore: number;
}

interface GameAdviceProps {
  gameData: GameData | null;
  advices: Advice[];
}

export function GameAdvice({ gameData, advices }: GameAdviceProps) {
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    // Auto-scroll to the bottom when new advice is added
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [advices?.length]);

  if (!gameData) {
    return null;
  }
  
  return (
    <div className={styles.card}>
      <div className={styles["card-header"]}>
        <h2 className={styles["card-title"]}>Consejos de Juego</h2>
      </div>
      <div className={styles["card-content"]}>
        <div className={styles["scroll-area"]} ref={scrollAreaRef}>
          <div className={styles["advice-list"]}>
            {advices.length === 0 ? (
              <p className={styles["no-advice"]}>Los consejos aparecerán aquí durante la partida...</p>
            ) : (
              advices.slice().reverse().map((advice) => (
                <div key={advice.id} className={styles["advice-item"]}>
                  <div className={styles["advice-header"]}>
                  <span className={clsx(
                    styles.badge,
                    { 
                      'badge-phase': advice.type === 'phase', 
                      'badge-default': advice.type !== 'phase' 
                    }
                  )}>
                      {advice.type === "phase" ? "Fase de juego" : "Consejo"}
                    </span>
                    <span className={styles["timestamp"]}>
                      <ReactTimeAgo date={advice.timestamp} locale="es-ES" timeStyle="twitter"/>
                    </span>
                  </div>
                  <p className={styles["advice-text"]}>{advice.text}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}