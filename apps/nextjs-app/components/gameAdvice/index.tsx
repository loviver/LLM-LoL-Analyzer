"use client";

import { useState, useEffect, useRef } from 'react';
import ReactTimeAgo from 'react-time-ago';
import styles from './index.module.css';
import clsx from 'clsx';
import ItemBuild from '../ItemBuild';

interface Advice {
  id: number;
  text: string;
  type: string;
  timestamp: number;
  author: string;  // Añadido el campo author
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
  setAdvices: any;  // Añadido para actualizar advices
  buildRecomendation?: any;
  sendQuery?: any;
}

export function GameAdvice({ gameData, advices, setAdvices, buildRecomendation, sendQuery }: GameAdviceProps) {
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Estado para preguntas y respuestas
  const [userQuestion, setUserQuestion] = useState('');
  
  useEffect(() => {
    // Auto-scroll to the bottom when new advice is added
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [advices?.length]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (userQuestion.trim()) {
      // Simular respuesta de ChatGPT (esto puede ser una API real de ChatGPT)
      const newAnswer = `${userQuestion}`; // Puedes sustituirlo por una respuesta de la API

      // Agregar la pregunta y respuesta a la lista de advices
      setAdvices((prevAdvices: any) => [
        ...prevAdvices,
        {
          author: "Jugador",  // El autor será "jugador"
          id: prevAdvices.length + 1,
          type: 'phase',  // Puedes cambiar el tipo si es necesario
          timestamp: new Date(),
          text: newAnswer
        }
      ]);

      sendQuery(userQuestion); // Enviar la pregunta al servidor

      setUserQuestion(''); // Limpiar el campo de entrada
    }
  };

  if (!gameData) {
    return null;
  }

  return (
    <div className={styles.card}>
      <div className={styles["card-header"]}>
        <h2 className={styles["card-title"]}>Consejos de Juego</h2>
      </div>
      <div className={styles["card-content"]}>
        
        {/* Sección para preguntas y respuestas */}
        <div className={styles["chat-section"]} style={{ marginBottom: '1rem' }}>
          
          <form onSubmit={handleSubmit} className="mt-4">
            <input
              type="text"
              value={userQuestion}
              onChange={(e) => setUserQuestion(e.target.value)}
              placeholder="Escribe tu pregunta..."
              className="w-full p-2 border border-gray-300 rounded-md"
            />
            <button
              type="submit"
              className="mt-2 w-full bg-blue-500 text-white p-2 rounded-md"
            >
              Enviar
            </button>
          </form>
        </div>

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
                      {advice.author}
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
