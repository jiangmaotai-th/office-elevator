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
    destinationColorIndex: number;
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
    multiplier: number;
    scoreGain: number;
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
    currentLevelId?: string;
    targetDeliveries: number;
    unlockedFloors: number;
    elapsedSeconds: number;
    gameTime: number;
    started: boolean;
    completed: boolean;
    failed: boolean;
}

export type FloorType = 'ground' | 'parking' | 'office' | 'restaurant' | 'rest';

export interface RushEventModel {
    time: number;
    warningLeadTime: number;
    fromType: FloorType;
    toType: FloorType;
    amount: number;
    label: string;
    triggered: boolean;
}

export type EnabledSystem =
    | 'patience'
    | 'multiplier'
    | 'rushWarning'
    | 'multiElevator'
    | 'transfer'
    | 'parking'
    | 'restaurant'
    | 'restFloor';

export interface PassengerSpawnRules {
    ambientFirstDelaySeconds: number;
    ambientMinIntervalSeconds: number;
    ambientMaxIntervalSeconds: number;
    ambientMin: number;
    ambientMax: number;
    smallQueueIntervalSeconds: number;
    smallQueueMin: number;
    smallQueueMax: number;
    maxWaitingPassengers: number;
}

export interface WinCondition {
    type: 'deliverCount' | 'score';
    value: number;
}

export interface FailCondition {
    type: 'lostPassengers';
    max: number;
}

export interface LevelConfig {
    id: string;
    chapter: string;
    title: string;
    description: string;
    floors: number[];
    elevators: number;
    floorTypes: Partial<Record<number, FloorType>>;
    passengerSpawnRules: PassengerSpawnRules;
    rushEvents: RushEventModel[];
    enabledSystems: EnabledSystem[];
    winCondition: WinCondition;
    failCondition: FailCondition;
}

export interface LevelResult {
    stars: number;
    delivered: number;
    lost: number;
    score: number;
}

export interface RushWarningModel extends RushEventModel {
    remainingMinutes: number;
}

export interface TrafficSpawnRequest {
    originFloor: number;
    destinationFloor: number;
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
