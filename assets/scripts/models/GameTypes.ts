export enum PassengerState {
    Waiting = 'waiting',
    Boarding = 'boarding',
    Riding = 'riding',
    Exiting = 'exiting',
    Delivered = 'delivered',
    Lost = 'lost',
}

export enum ElevatorDirection {
    Down = -1,
    Idle = 0,
    Up = 1,
}

export interface PassengerModel {
    id: number;
    originFloor: number;
    destinationFloor: number;
    waitElapsed: number;
    patience: number;
    maxPatience: number;
    state: PassengerState;
}

export interface PassengerBoardedEvent {
    passengerId: number;
    destinationFloor: number;
    elevatorIndex?: number;
}

export interface PassengerDeliveredEvent {
    passengerId: number;
    floor: number;
    stopDeliveredCount: number;
    totalDelivered: number;
    elevatorIndex?: number;
}

export interface PassengerWarningEvent {
    floor: number;
}

export interface ElevatorModel {
    id: string;
    currentFloor: number;
    targetFloor: number | null;
    position: number;
    direction: ElevatorDirection;
    capacity: number;
    passengers: number[];
    queue: number[];
    doorOpen: boolean;
}

export interface EconomyModel {
    coins: number;
    stars: number;
    score: number;
    bestScore: number;
    delivered: number;
    lost: number;
    multiplier: number;
    multiplierProgress: number;
}

export interface ProgressModel {
    day: number;
    level: number;
    targetDeliveries: number;
    unlockedFloors: number;
    elapsedSeconds: number;
    started: boolean;
    completed: boolean;
    failed: boolean;
}

export enum UpgradeType {
    Capacity = 'capacity',
    Speed = 'speed',
    Patience = 'patience',
}

export interface UpgradeModel {
    capacityLevel: number;
    speedLevel: number;
    patienceLevel: number;
}

export interface GameSnapshot {
    version: number;
    economy: EconomyModel;
    progress: ProgressModel;
    upgrades?: UpgradeModel;
}
