import { ObjectiveStatusEnum } from "../enums/LCUenums";

// Interfaz de configuración
export interface LCUListenerConfig {
  pollingInterval: number;
  pollingIntervalChampionSelect: number
  // championSelectEndpoint: string;
  // liveGameEndpoint: string;
  // region: string;
  gamePath: string;
  lockfilePath: string;
  axiosTimeout: number;
}

export interface ObjectiveStatus {
  isAlive: boolean;
  status: ObjectiveStatusEnum | string;
  timeUntilSpawn: number | null;
  timeSinceSpawn: number | null;
  spawnedAt?: number;
  timeSinceLastSpawn: number | null;
  timeSinceExpiry: number | null;
}


// Tipos de eventos
export type GameEvents = {
  championSelect: (data: any) => void;
  liveData: (data: any) => void;
  error: (error: Error) => void;
};

// Interfaces para eventos
export interface IEvent {
  Assisters: string[];
  EventID: number;
  EventName: string;
  EventTime: number;
}

export interface IEventWithTurret extends IEvent {
  KillerName?: string;
  TurretKilled: string;
}

export interface IEventWithDragon extends IEvent {
  KillerName?: string;
  killer?: string;
  Stolen: string;
  DragonType: string;
}
