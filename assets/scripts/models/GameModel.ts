import {
    EconomyModel,
    ElevatorDirection,
    ElevatorModel,
    FloorType,
    GameSnapshot,
    LevelConfig,
    LevelResult,
    PassengerModel,
    PassengerBoardedEvent,
    PassengerDeliveredEvent,
    PassengerState,
    PassengerWarningEvent,
    ProgressModel,
    RushEventModel,
    RushWarningModel,
    TrafficSpawnRequest,
    UpgradeModel,
    UpgradeType,
} from './GameTypes';

export const START_TIME = 6 * 60;
export const TIME_SCALE = 1;
const SNAPSHOT_VERSION = 2;
const MIN_FLOOR = -2;
const INITIAL_UNLOCKED_FLOORS = 11;
const LEVEL_MAX_FLOOR = 5;
const DEFAULT_MAX_FLOOR = LEVEL_MAX_FLOOR;
const BOARDING_INTERVAL = 0.22;
const UNLOADING_INTERVAL = 0.28;
const PASSENGER_WAIT_SECONDS = 40;
const PATIENCE_RING_RATIO = 0.5;
const PATIENCE_WARNING_RATIO = 0.75;
const WARNING_SOUND_INTERVAL = 0.8;
const ELEVATOR_COUNT = 2;
const ELEVATOR_CAPACITY = 5;
const BASE_SCORE = 100;
const MIN_PATIENCE_FACTOR = 0.5;
const MIN_ROUTE_FACTOR = 0.3;
const MIN_TIME_FACTOR = 0.4;
const STOP_PENALTY_RATE = 0.15;
const TIME_PER_FLOOR = 5;
const STOP_TIME = 5;
const WAITING_PATIENCE_DECAY_RATE = 1;
const IN_ELEVATOR_PATIENCE_DECAY_RATE = 0.5;
const INTERMEDIATE_STOP_DECAY_PENALTY = 0.15;
const DETOUR_DECAY_PENALTY_PER_FLOOR = 0.05;
const MIN_RIDE_DECAY_RATE = 0.5;
const MAX_RIDE_DECAY_RATE = 1.5;

interface DifficultyConfig {
    maxLevel: number;
    timeScale: number;
    targetDeliveries: number;
    ambientFirstDelaySeconds: number;
    ambientMinIntervalSeconds: number;
    ambientMaxIntervalSeconds: number;
    ambientMin: number;
    ambientMax: number;
    smallQueueIntervalSeconds: number;
    smallQueueMin: number;
    smallQueueMax: number;
    rushCap: number;
    maxWaitingPassengers: number;
    parkingTrafficEnabled: boolean;
}

const DIFFICULTY_STAGES: DifficultyConfig[] = [
    { maxLevel: 6, timeScale: 1, targetDeliveries: 12, ambientFirstDelaySeconds: 3, ambientMinIntervalSeconds: 8, ambientMaxIntervalSeconds: 13, ambientMin: 1, ambientMax: 1, smallQueueIntervalSeconds: 45, smallQueueMin: 2, smallQueueMax: 3, rushCap: 5, maxWaitingPassengers: 16, parkingTrafficEnabled: false },
    { maxLevel: 12, timeScale: 1.5, targetDeliveries: 18, ambientFirstDelaySeconds: 3, ambientMinIntervalSeconds: 7, ambientMaxIntervalSeconds: 12, ambientMin: 1, ambientMax: 2, smallQueueIntervalSeconds: 45, smallQueueMin: 3, smallQueueMax: 4, rushCap: 8, maxWaitingPassengers: 20, parkingTrafficEnabled: false },
    { maxLevel: 18, timeScale: 2, targetDeliveries: 24, ambientFirstDelaySeconds: 2, ambientMinIntervalSeconds: 6, ambientMaxIntervalSeconds: 11, ambientMin: 1, ambientMax: 2, smallQueueIntervalSeconds: 40, smallQueueMin: 4, smallQueueMax: 5, rushCap: 10, maxWaitingPassengers: 24, parkingTrafficEnabled: false },
    { maxLevel: 24, timeScale: 2.5, targetDeliveries: 32, ambientFirstDelaySeconds: 2, ambientMinIntervalSeconds: 5, ambientMaxIntervalSeconds: 10, ambientMin: 2, ambientMax: 2, smallQueueIntervalSeconds: 40, smallQueueMin: 5, smallQueueMax: 6, rushCap: 14, maxWaitingPassengers: 30, parkingTrafficEnabled: false },
    { maxLevel: Number.MAX_SAFE_INTEGER, timeScale: 3, targetDeliveries: 42, ambientFirstDelaySeconds: 2, ambientMinIntervalSeconds: 4, ambientMaxIntervalSeconds: 9, ambientMin: 2, ambientMax: 3, smallQueueIntervalSeconds: 35, smallQueueMin: 6, smallQueueMax: 8, rushCap: 18, maxWaitingPassengers: 38, parkingTrafficEnabled: true },
];

const FLOOR_RUSH_CAPS = [
    { maxUnlockedFloors: 5, rushCap: 6 },
    { maxUnlockedFloors: 8, rushCap: 8 },
    { maxUnlockedFloors: 11, rushCap: 10 },
    { maxUnlockedFloors: 14, rushCap: 14 },
    { maxUnlockedFloors: 18, rushCap: 18 },
    { maxUnlockedFloors: Number.MAX_SAFE_INTEGER, rushCap: 24 },
];

const RUSH_ROUTE_MULTIPLIERS: Partial<Record<`${FloorType}-${FloorType}`, number>> = {
    'ground-office': 1,
    'parking-office': 0.8,
    'office-restaurant': 0.7,
    'restaurant-office': 0.7,
    'office-rest': 0.35,
    'rest-office': 0.35,
    'office-ground': 1,
    'office-parking': 0.8,
};

function spawnRules(
    ambientMinIntervalSeconds: number,
    ambientMaxIntervalSeconds: number,
    ambientMax: number,
    smallQueueIntervalSeconds: number,
    smallQueueMin: number,
    smallQueueMax: number,
    maxWaitingPassengers: number,
): LevelConfig['passengerSpawnRules'] {
    return {
        ambientFirstDelaySeconds: 2,
        ambientMinIntervalSeconds,
        ambientMaxIntervalSeconds,
        ambientMin: 1,
        ambientMax,
        smallQueueIntervalSeconds,
        smallQueueMin,
        smallQueueMax,
        maxWaitingPassengers,
    };
}

function officeFloorTypes(floors: number[], extras: Partial<Record<number, FloorType>> = {}): Partial<Record<number, FloorType>> {
    const floorTypes: Partial<Record<number, FloorType>> = {};
    floors.forEach((floor) => {
        floorTypes[floor] = floor === 0 ? 'ground' : 'office';
    });
    return { ...floorTypes, ...extras };
}

function rushEvent(
    time: number,
    fromType: FloorType,
    toType: FloorType,
    amount: number,
    label: string,
    warningLeadTime = 90,
): RushEventModel {
    return { time, warningLeadTime, fromType, toType, amount, label, triggered: false };
}

const BASIC_FLOORS_4 = [0, 1, 2, 3];
const BASIC_FLOORS_5 = [0, 1, 2, 3, 4];
const BASIC_FLOORS_6 = [0, 1, 2, 3, 4, 5];
const PARKING_FLOORS_6 = [-1, 0, 1, 2, 3, 4];
const TRANSFER_RANGES = [
    { min: 0, max: 3 },
    { min: 3, max: 5 },
];

const LEVEL_CONFIGS: LevelConfig[] = [
    {
        id: '1-1',
        chapter: '第 1 章 基础调度',
        title: '1-1 第一台电梯',
        description: '点击楼层派出电梯，到达后点击轿厢让乘客上车。',
        floors: BASIC_FLOORS_4,
        elevators: 1,
        floorTypes: officeFloorTypes(BASIC_FLOORS_4),
        passengerSpawnRules: spawnRules(8, 12, 1, 55, 1, 2, 10),
        rushEvents: [],
        enabledSystems: [],
        winCondition: { type: 'score', value: 450 },
        failCondition: { type: 'lostPassengers', max: 999 },
    },
    {
        id: '1-2',
        chapter: '第 1 章 基础调度',
        title: '1-2 目的颜色',
        description: '乘客衣服颜色代表目的楼层，按颜色送到对应层。',
        floors: BASIC_FLOORS_5,
        elevators: 1,
        floorTypes: officeFloorTypes(BASIC_FLOORS_5),
        passengerSpawnRules: spawnRules(7, 11, 1, 50, 2, 2, 12),
        rushEvents: [],
        enabledSystems: [],
        winCondition: { type: 'score', value: 600 },
        failCondition: { type: 'lostPassengers', max: 999 },
    },
    {
        id: '1-3',
        chapter: '第 1 章 基础调度',
        title: '1-3 队列顺序',
        description: '乘客按先来后到排队，先处理队伍前排。',
        floors: BASIC_FLOORS_5,
        elevators: 1,
        floorTypes: officeFloorTypes(BASIC_FLOORS_5),
        passengerSpawnRules: spawnRules(6, 10, 1, 42, 2, 3, 14),
        rushEvents: [],
        enabledSystems: [],
        winCondition: { type: 'score', value: 750 },
        failCondition: { type: 'lostPassengers', max: 999 },
    },
    {
        id: '1-4',
        chapter: '第 1 章 基础调度',
        title: '1-4 容量限制',
        description: '电梯最多 5 人，满员后剩余乘客会继续排队。',
        floors: BASIC_FLOORS_6,
        elevators: 1,
        floorTypes: officeFloorTypes(BASIC_FLOORS_6),
        passengerSpawnRules: spawnRules(6, 9, 2, 38, 3, 4, 16),
        rushEvents: [],
        enabledSystems: [],
        winCondition: { type: 'score', value: 900 },
        failCondition: { type: 'lostPassengers', max: 999 },
    },
    {
        id: '1-5',
        chapter: '第 1 章 基础调度',
        title: '1-5 多次呼叫',
        description: '连续点击楼层，电梯会按点击顺序依次停靠。',
        floors: BASIC_FLOORS_6,
        elevators: 1,
        floorTypes: officeFloorTypes(BASIC_FLOORS_6),
        passengerSpawnRules: spawnRules(5, 8, 2, 34, 3, 4, 18),
        rushEvents: [],
        enabledSystems: [],
        winCondition: { type: 'score', value: 1050 },
        failCondition: { type: 'lostPassengers', max: 999 },
    },
    {
        id: '1-6',
        chapter: '第 1 章 基础调度',
        title: '1-6 基础小考',
        description: '综合练习：颜色、队列、容量和连续呼叫。',
        floors: BASIC_FLOORS_6,
        elevators: 1,
        floorTypes: officeFloorTypes(BASIC_FLOORS_6),
        passengerSpawnRules: spawnRules(5, 8, 2, 30, 4, 5, 20),
        rushEvents: [],
        enabledSystems: [],
        winCondition: { type: 'score', value: 1250 },
        failCondition: { type: 'lostPassengers', max: 999 },
    },
    {
        id: '2-1',
        chapter: '第 2 章 耐心评分',
        title: '2-1 等待耐心',
        description: '开启耐心系统，乘客等待过久会离开。',
        floors: BASIC_FLOORS_5,
        elevators: 1,
        floorTypes: officeFloorTypes(BASIC_FLOORS_5),
        passengerSpawnRules: spawnRules(7, 11, 1, 46, 2, 3, 14),
        rushEvents: [],
        enabledSystems: ['patience'],
        winCondition: { type: 'score', value: 750 },
        failCondition: { type: 'lostPassengers', max: 3 },
    },
    {
        id: '2-2',
        chapter: '第 2 章 耐心评分',
        title: '2-2 优先级',
        description: '优先处理快红圈的乘客，避免流失。',
        floors: BASIC_FLOORS_6,
        elevators: 1,
        floorTypes: officeFloorTypes(BASIC_FLOORS_6),
        passengerSpawnRules: spawnRules(6, 10, 1, 40, 3, 3, 16),
        rushEvents: [],
        enabledSystems: ['patience'],
        winCondition: { type: 'score', value: 950 },
        failCondition: { type: 'lostPassengers', max: 2 },
    },
    {
        id: '2-3',
        chapter: '第 2 章 耐心评分',
        title: '2-3 调度评分',
        description: '少绕路、少中停、高耐心送达可以获得高分。',
        floors: BASIC_FLOORS_6,
        elevators: 1,
        floorTypes: officeFloorTypes(BASIC_FLOORS_6),
        passengerSpawnRules: spawnRules(5, 9, 2, 38, 3, 4, 18),
        rushEvents: [],
        enabledSystems: ['patience', 'qualityScore'],
        winCondition: { type: 'score', value: 1200 },
        failCondition: { type: 'lostPassengers', max: 2 },
    },
    {
        id: '2-4',
        chapter: '第 2 章 耐心评分',
        title: '2-4 顺路搭载',
        description: '电梯朝乘客方向行驶时，同向乘客会自动上车。',
        floors: BASIC_FLOORS_6,
        elevators: 1,
        floorTypes: officeFloorTypes(BASIC_FLOORS_6),
        passengerSpawnRules: spawnRules(5, 8, 2, 34, 4, 4, 20),
        rushEvents: [],
        enabledSystems: ['patience', 'qualityScore'],
        winCondition: { type: 'score', value: 1450 },
        failCondition: { type: 'lostPassengers', max: 2 },
    },
    {
        id: '2-5',
        chapter: '第 2 章 耐心评分',
        title: '2-5 快速送达',
        description: '目标分提高，乱停每层会被调度评分惩罚。',
        floors: BASIC_FLOORS_6,
        elevators: 1,
        floorTypes: officeFloorTypes(BASIC_FLOORS_6),
        passengerSpawnRules: spawnRules(4, 7, 2, 30, 4, 5, 22),
        rushEvents: [],
        enabledSystems: ['patience', 'qualityScore'],
        winCondition: { type: 'score', value: 1700 },
        failCondition: { type: 'lostPassengers', max: 1 },
    },
    {
        id: '2-6',
        chapter: '第 2 章 耐心评分',
        title: '2-6 高分小考',
        description: '耐心、路线、停站都会影响最终分数。',
        floors: BASIC_FLOORS_6,
        elevators: 1,
        floorTypes: officeFloorTypes(BASIC_FLOORS_6),
        passengerSpawnRules: spawnRules(4, 7, 2, 28, 5, 6, 24),
        rushEvents: [],
        enabledSystems: ['patience', 'qualityScore'],
        winCondition: { type: 'score', value: 2000 },
        failCondition: { type: 'lostPassengers', max: 1 },
    },
    {
        id: '3-1',
        chapter: '第 3 章 双电梯',
        title: '3-1 第二台电梯',
        description: '两台电梯独立控制，分别追加停站指令。',
        floors: BASIC_FLOORS_6,
        elevators: 2,
        floorTypes: officeFloorTypes(BASIC_FLOORS_6),
        passengerSpawnRules: spawnRules(6, 9, 2, 36, 3, 4, 18),
        rushEvents: [],
        enabledSystems: ['patience', 'qualityScore', 'multiElevator'],
        winCondition: { type: 'score', value: 1500 },
        failCondition: { type: 'lostPassengers', max: 3 },
    },
    {
        id: '3-2',
        chapter: '第 3 章 双电梯',
        title: '3-2 分工调度',
        description: '尝试让一台负责低层，一台负责高层。',
        floors: BASIC_FLOORS_6,
        elevators: 2,
        floorTypes: officeFloorTypes(BASIC_FLOORS_6),
        passengerSpawnRules: spawnRules(5, 8, 2, 32, 4, 4, 20),
        rushEvents: [],
        enabledSystems: ['patience', 'qualityScore', 'multiElevator'],
        winCondition: { type: 'score', value: 1800 },
        failCondition: { type: 'lostPassengers', max: 3 },
    },
    {
        id: '3-3',
        chapter: '第 3 章 双电梯',
        title: '3-3 容量分流',
        description: '同层两台电梯时，第一台满了会把剩余乘客分给第二台。',
        floors: BASIC_FLOORS_6,
        elevators: 2,
        floorTypes: officeFloorTypes(BASIC_FLOORS_6),
        passengerSpawnRules: spawnRules(5, 8, 2, 28, 5, 6, 24),
        rushEvents: [],
        enabledSystems: ['patience', 'qualityScore', 'multiElevator'],
        winCondition: { type: 'score', value: 2100 },
        failCondition: { type: 'lostPassengers', max: 2 },
    },
    {
        id: '3-4',
        chapter: '第 3 章 双电梯',
        title: '3-4 双线排队',
        description: '多个楼层同时排队，快速切换 S1/S2。',
        floors: BASIC_FLOORS_6,
        elevators: 2,
        floorTypes: officeFloorTypes(BASIC_FLOORS_6),
        passengerSpawnRules: spawnRules(4, 7, 2, 26, 5, 7, 26),
        rushEvents: [],
        enabledSystems: ['patience', 'qualityScore', 'multiElevator'],
        winCondition: { type: 'score', value: 2400 },
        failCondition: { type: 'lostPassengers', max: 2 },
    },
    {
        id: '3-5',
        chapter: '第 3 章 双电梯',
        title: '3-5 双电梯评分',
        description: '并行调度减少等待，同时避免无关停站。',
        floors: BASIC_FLOORS_6,
        elevators: 2,
        floorTypes: officeFloorTypes(BASIC_FLOORS_6),
        passengerSpawnRules: spawnRules(4, 6, 3, 24, 6, 8, 28),
        rushEvents: [],
        enabledSystems: ['patience', 'qualityScore', 'multiElevator'],
        winCondition: { type: 'score', value: 2750 },
        failCondition: { type: 'lostPassengers', max: 1 },
    },
    {
        id: '3-6',
        chapter: '第 3 章 双电梯',
        title: '3-6 双梯小考',
        description: '中等客流综合挑战，不能只盯一台电梯。',
        floors: BASIC_FLOORS_6,
        elevators: 2,
        floorTypes: officeFloorTypes(BASIC_FLOORS_6),
        passengerSpawnRules: spawnRules(3, 6, 3, 22, 7, 9, 30),
        rushEvents: [],
        enabledSystems: ['patience', 'qualityScore', 'multiElevator'],
        winCondition: { type: 'score', value: 3200 },
        failCondition: { type: 'lostPassengers', max: 1 },
    },
    {
        id: '4-1',
        chapter: '第 4 章 中转电梯',
        title: '4-1 第一次换乘',
        description: '右侧低区电梯到 3F，中转后换乘左侧高区电梯。',
        floors: BASIC_FLOORS_6,
        elevators: 2,
        elevatorServiceRanges: TRANSFER_RANGES,
        transferFloor: 3,
        floorTypes: officeFloorTypes(BASIC_FLOORS_6, { 3: 'rest' }),
        passengerSpawnRules: spawnRules(7, 10, 1, 38, 2, 3, 18),
        rushEvents: [],
        enabledSystems: ['patience', 'qualityScore', 'multiElevator', 'transfer'],
        winCondition: { type: 'score', value: 1200 },
        failCondition: { type: 'lostPassengers', max: 3 },
    },
    {
        id: '4-2',
        chapter: '第 4 章 中转电梯',
        title: '4-2 连廊换乘',
        description: 'S2 在 3F 且有空位时，乘客会直接换乘进 S2。',
        floors: BASIC_FLOORS_6,
        elevators: 2,
        elevatorServiceRanges: TRANSFER_RANGES,
        transferFloor: 3,
        floorTypes: officeFloorTypes(BASIC_FLOORS_6, { 3: 'rest' }),
        passengerSpawnRules: spawnRules(6, 9, 2, 34, 3, 4, 20),
        rushEvents: [],
        enabledSystems: ['patience', 'qualityScore', 'multiElevator', 'transfer'],
        winCondition: { type: 'score', value: 1500 },
        failCondition: { type: 'lostPassengers', max: 3 },
    },
    {
        id: '4-3',
        chapter: '第 4 章 中转电梯',
        title: '4-3 中转容量',
        description: 'S2 满员时，乘客会落地到 3F 等待下一趟。',
        floors: BASIC_FLOORS_6,
        elevators: 2,
        elevatorServiceRanges: TRANSFER_RANGES,
        transferFloor: 3,
        floorTypes: officeFloorTypes(BASIC_FLOORS_6, { 3: 'rest' }),
        passengerSpawnRules: spawnRules(5, 8, 2, 30, 4, 5, 22),
        rushEvents: [],
        enabledSystems: ['patience', 'qualityScore', 'multiElevator', 'transfer'],
        winCondition: { type: 'score', value: 1800 },
        failCondition: { type: 'lostPassengers', max: 2 },
    },
    {
        id: '4-4',
        chapter: '第 4 章 中转电梯',
        title: '4-4 双向换乘',
        description: '高层回低区也要经过 3F，中转层会双向流动。',
        floors: BASIC_FLOORS_6,
        elevators: 2,
        elevatorServiceRanges: TRANSFER_RANGES,
        transferFloor: 3,
        floorTypes: officeFloorTypes(BASIC_FLOORS_6, { 3: 'rest' }),
        passengerSpawnRules: spawnRules(5, 7, 2, 28, 5, 6, 24),
        rushEvents: [],
        enabledSystems: ['patience', 'qualityScore', 'multiElevator', 'transfer'],
        winCondition: { type: 'score', value: 2150 },
        failCondition: { type: 'lostPassengers', max: 2 },
    },
    {
        id: '4-5',
        chapter: '第 4 章 中转电梯',
        title: '4-5 中转高峰',
        description: '3F 会短时间积压乘客，提前让两台电梯靠近中转层。',
        floors: BASIC_FLOORS_6,
        elevators: 2,
        elevatorServiceRanges: TRANSFER_RANGES,
        transferFloor: 3,
        floorTypes: officeFloorTypes(BASIC_FLOORS_6, { 3: 'rest' }),
        passengerSpawnRules: spawnRules(4, 7, 3, 25, 6, 8, 26),
        rushEvents: [
            rushEvent(7 * 60 + 20, 'ground', 'office', 5, '中转高峰：低区去高区', 80),
        ],
        enabledSystems: ['patience', 'qualityScore', 'multiElevator', 'transfer', 'rushWarning'],
        winCondition: { type: 'score', value: 2500 },
        failCondition: { type: 'lostPassengers', max: 1 },
    },
    {
        id: '4-6',
        chapter: '第 4 章 中转电梯',
        title: '4-6 中转小考',
        description: '容量、耐心、评分和双向换乘全部开启。',
        floors: BASIC_FLOORS_6,
        elevators: 2,
        elevatorServiceRanges: TRANSFER_RANGES,
        transferFloor: 3,
        floorTypes: officeFloorTypes(BASIC_FLOORS_6, { 3: 'rest' }),
        passengerSpawnRules: spawnRules(3, 6, 3, 22, 7, 9, 28),
        rushEvents: [
            rushEvent(7 * 60 + 15, 'ground', 'office', 5, '低区去高区', 75),
            rushEvent(7 * 60 + 45, 'office', 'ground', 5, '高区回低区', 75),
        ],
        enabledSystems: ['patience', 'qualityScore', 'multiElevator', 'transfer', 'rushWarning'],
        winCondition: { type: 'score', value: 3000 },
        failCondition: { type: 'lostPassengers', max: 1 },
    },
    {
        id: '5-1',
        chapter: '第 5 章 写字楼运营',
        title: '5-1 上班早高峰',
        description: '高峰预警出现后，提前把电梯布置到 G 层。',
        floors: BASIC_FLOORS_6,
        elevators: 2,
        floorTypes: officeFloorTypes(BASIC_FLOORS_6),
        passengerSpawnRules: spawnRules(6, 9, 2, 34, 3, 4, 20),
        rushEvents: [rushEvent(7 * 60 + 30, 'ground', 'office', 6, '上班早高峰：G层去办公层')],
        enabledSystems: ['patience', 'qualityScore', 'multiElevator', 'rushWarning'],
        winCondition: { type: 'score', value: 1700 },
        failCondition: { type: 'lostPassengers', max: 3 },
    },
    {
        id: '5-2',
        chapter: '第 5 章 写字楼运营',
        title: '5-2 午餐流动',
        description: '办公层和餐厅层之间会出现双向流动。',
        floors: BASIC_FLOORS_6,
        elevators: 2,
        floorTypes: officeFloorTypes(BASIC_FLOORS_6, { 1: 'restaurant' }),
        passengerSpawnRules: spawnRules(5, 8, 2, 30, 4, 5, 22),
        rushEvents: [
            rushEvent(7 * 60 + 25, 'office', 'restaurant', 5, '午餐高峰：办公层去餐厅'),
            rushEvent(7 * 60 + 50, 'restaurant', 'office', 5, '午餐返回：餐厅回办公层'),
        ],
        enabledSystems: ['patience', 'qualityScore', 'multiElevator', 'rushWarning', 'restaurant'],
        winCondition: { type: 'score', value: 2050 },
        failCondition: { type: 'lostPassengers', max: 2 },
    },
    {
        id: '5-3',
        chapter: '第 5 章 写字楼运营',
        title: '5-3 停车场入口',
        description: '加入 B1 停车场，开车上班的人从地下进入。',
        floors: PARKING_FLOORS_6,
        elevators: 2,
        floorTypes: officeFloorTypes(PARKING_FLOORS_6, { [-1]: 'parking', 0: 'ground' }),
        passengerSpawnRules: spawnRules(5, 8, 2, 28, 5, 6, 24),
        rushEvents: [rushEvent(7 * 60 + 30, 'parking', 'office', 6, '停车场去办公层')],
        enabledSystems: ['patience', 'qualityScore', 'multiElevator', 'rushWarning', 'parking'],
        winCondition: { type: 'score', value: 2350 },
        failCondition: { type: 'lostPassengers', max: 2 },
    },
    {
        id: '5-4',
        chapter: '第 5 章 写字楼运营',
        title: '5-4 下班高峰',
        description: '办公层乘客集中去 G 层和 B1 停车场。',
        floors: PARKING_FLOORS_6,
        elevators: 2,
        floorTypes: officeFloorTypes(PARKING_FLOORS_6, { [-1]: 'parking', 0: 'ground' }),
        passengerSpawnRules: spawnRules(4, 7, 3, 26, 5, 7, 26),
        rushEvents: [
            rushEvent(7 * 60 + 35, 'office', 'ground', 5, '下班高峰：办公层去大厅'),
            rushEvent(7 * 60 + 50, 'office', 'parking', 5, '下班高峰：办公层去停车场'),
        ],
        enabledSystems: ['patience', 'qualityScore', 'multiElevator', 'rushWarning', 'parking'],
        winCondition: { type: 'score', value: 2700 },
        failCondition: { type: 'lostPassengers', max: 2 },
    },
    {
        id: '5-5',
        chapter: '第 5 章 写字楼运营',
        title: '5-5 全天运营',
        description: '上班、午餐、下班连续出现，最多显示最近两个预警。',
        floors: PARKING_FLOORS_6,
        elevators: 2,
        floorTypes: officeFloorTypes(PARKING_FLOORS_6, { [-1]: 'parking', 0: 'ground', 1: 'restaurant' }),
        passengerSpawnRules: spawnRules(4, 7, 3, 24, 6, 8, 28),
        rushEvents: [
            rushEvent(7 * 60 + 20, 'ground', 'office', 5, '上班：大厅去办公层'),
            rushEvent(7 * 60 + 35, 'parking', 'office', 5, '上班：停车场去办公层'),
            rushEvent(8 * 60, 'office', 'restaurant', 5, '午餐：办公层去餐厅'),
            rushEvent(8 * 60 + 25, 'restaurant', 'office', 5, '午餐返回'),
            rushEvent(8 * 60 + 55, 'office', 'ground', 5, '下班：办公层去大厅'),
        ],
        enabledSystems: ['patience', 'qualityScore', 'multiElevator', 'rushWarning', 'parking', 'restaurant'],
        winCondition: { type: 'score', value: 3200 },
        failCondition: { type: 'lostPassengers', max: 1 },
    },
    {
        id: '5-6',
        chapter: '第 5 章 写字楼运营',
        title: '5-6 排行榜挑战',
        description: '全系统高压挑战，追求最高调度分。',
        floors: PARKING_FLOORS_6,
        elevators: 2,
        floorTypes: officeFloorTypes(PARKING_FLOORS_6, { [-1]: 'parking', 0: 'ground', 1: 'restaurant', 2: 'rest' }),
        passengerSpawnRules: spawnRules(3, 6, 3, 22, 7, 9, 30),
        rushEvents: [
            rushEvent(7 * 60 + 15, 'ground', 'office', 6, '上班：大厅去办公层'),
            rushEvent(7 * 60 + 30, 'parking', 'office', 6, '上班：停车场去办公层'),
            rushEvent(8 * 60, 'office', 'restaurant', 6, '午餐：办公层去餐厅'),
            rushEvent(8 * 60 + 25, 'restaurant', 'office', 6, '午餐返回'),
            rushEvent(8 * 60 + 45, 'office', 'rest', 4, '下午休息'),
            rushEvent(9 * 60, 'office', 'ground', 6, '下班：办公层去大厅'),
            rushEvent(9 * 60 + 15, 'office', 'parking', 6, '下班：办公层去停车场'),
        ],
        enabledSystems: ['patience', 'qualityScore', 'multiElevator', 'rushWarning', 'parking', 'restaurant', 'restFloor'],
        winCondition: { type: 'score', value: 3800 },
        failCondition: { type: 'lostPassengers', max: 1 },
    },
];

export class GameModel {
    readonly passengers: PassengerModel[] = [];
    readonly elevators: ElevatorModel[] = [
        {
            id: 'S1',
            currentFloor: 0,
            targetFloor: null,
            position: 0,
            direction: ElevatorDirection.Idle,
            capacity: ELEVATOR_CAPACITY,
            passengers: [],
            queue: [],
            doorOpen: true,
        },
        {
            id: 'S2',
            currentFloor: 0,
            targetFloor: null,
            position: 0,
            direction: ElevatorDirection.Idle,
            capacity: ELEVATOR_CAPACITY,
            passengers: [],
            queue: [],
            doorOpen: true,
        },
    ];
    get elevator(): ElevatorModel {
        return this.elevators[0];
    }
    readonly elevator2: ElevatorModel = this.elevators[1];
    readonly economy: EconomyModel = {
        coins: 20,
        stars: 0,
        score: 0,
        bestScore: 0,
        delivered: 0,
        lost: 0,
    };
    readonly progress: ProgressModel = {
        day: 1,
        level: 1,
        currentLevelId: '1-1',
        targetDeliveries: 12,
        unlockedFloors: INITIAL_UNLOCKED_FLOORS,
        elapsedSeconds: 0,
        gameTime: START_TIME,
        started: false,
        completed: false,
        failed: false,
    };
    readonly upgrades: UpgradeModel = {
        capacityLevel: 0,
        speedLevel: 0,
        patienceLevel: 0,
    };

    private nextPassengerId = 1;
    private readonly boardingQueues: number[][] = Array.from({ length: ELEVATOR_COUNT }, () => []);
    private readonly unloadingQueues: number[][] = Array.from({ length: ELEVATOR_COUNT }, () => []);
    private readonly boardedEvents: PassengerBoardedEvent[] = [];
    private readonly deliveredEvents: PassengerDeliveredEvent[] = [];
    private readonly warningEvents: PassengerWarningEvent[] = [];
    private readonly boardingTimers: number[] = Array.from({ length: ELEVATOR_COUNT }, () => 0);
    private readonly unloadingTimers: number[] = Array.from({ length: ELEVATOR_COUNT }, () => 0);
    private warningTimer = 0;
    private readonly pendingArrivalDirections: Array<ElevatorDirection | null> = Array.from(
        { length: ELEVATOR_COUNT },
        () => null,
    );
    private readonly stopDeliveredCounts: number[] = Array.from({ length: ELEVATOR_COUNT }, () => 0);
    private readonly trafficSpawnRequests: TrafficSpawnRequest[] = [];
    private ambientTrafficTimer = 0;
    private nextAmbientTrafficDelaySeconds = DIFFICULTY_STAGES[0].ambientFirstDelaySeconds;
    private smallQueueTimer = 0;
    private readonly levelResults = new Map<string, LevelResult>();
    private readonly floorTypeOverrides = new Map<number, FloorType>([
        [-2, 'parking'],
        [-1, 'parking'],
        [0, 'ground'],
        [1, 'restaurant'],
        [2, 'rest'],
    ]);
    readonly rushEvents: RushEventModel[] = [
        {
            time: 9 * 60,
            warningLeadTime: 180,
            fromType: 'ground',
            toType: 'office',
            amount: 1,
            label: '上班高峰：大厅去办公层',
            triggered: false,
        },
        {
            time: 9 * 60 + 40,
            warningLeadTime: 180,
            fromType: 'parking',
            toType: 'office',
            amount: 1,
            label: '上班高峰：停车场去办公层',
            triggered: false,
        },
        {
            time: 11 * 60 + 50,
            warningLeadTime: 120,
            fromType: 'office',
            toType: 'restaurant',
            amount: 1,
            label: '午餐高峰：办公层去餐厅',
            triggered: false,
        },
        {
            time: 12 * 60 + 40,
            warningLeadTime: 120,
            fromType: 'restaurant',
            toType: 'office',
            amount: 1,
            label: '午餐返回：餐厅回办公层',
            triggered: false,
        },
        {
            time: 15 * 60,
            warningLeadTime: 120,
            fromType: 'office',
            toType: 'rest',
            amount: 1,
            label: '下午休息：办公层去休息层',
            triggered: false,
        },
        {
            time: 15 * 60 + 40,
            warningLeadTime: 120,
            fromType: 'rest',
            toType: 'office',
            amount: 1,
            label: '休息返回：休息层回办公层',
            triggered: false,
        },
        {
            time: 17 * 60 + 30,
            warningLeadTime: 180,
            fromType: 'office',
            toType: 'ground',
            amount: 1,
            label: '下班高峰：办公层去大厅',
            triggered: false,
        },
        {
            time: 17 * 60 + 45,
            warningLeadTime: 180,
            fromType: 'office',
            toType: 'parking',
            amount: 1,
            label: '下班高峰：办公层去停车场',
            triggered: false,
        },
    ];

    constructor() {
        this.applyLevelConfig(this.currentLevelConfig);
    }

    restore(snapshot: GameSnapshot | null): void {
        if (!snapshot || snapshot.version !== SNAPSHOT_VERSION) {
            return;
        }
        Object.assign(this.economy, snapshot.economy);
        Object.assign(this.progress, snapshot.progress);
        Object.assign(this.upgrades, snapshot.upgrades ?? {});
        this.economy.score ??= 0;
        this.economy.bestScore ??= this.economy.score;
        this.progress.started ??= false;
        this.progress.currentLevelId ??= '1-1';
        this.progress.gameTime ??= START_TIME;
        this.applyLevelConfig(this.currentLevelConfig);
        this.applyUpgradeEffects();
        this.passengers.length = 0;
        this.resetElevatorAndQueues();
        this.resetTraffic();
        this.progress.elapsedSeconds = 0;
        this.progress.gameTime = START_TIME;
        this.progress.started = false;
        this.progress.completed = false;
        this.progress.failed = false;
    }

    snapshot(): GameSnapshot {
        return {
            version: SNAPSHOT_VERSION,
            economy: { ...this.economy },
            progress: { ...this.progress },
            upgrades: { ...this.upgrades },
        };
    }

    createPassenger(originFloor: number, destinationFloor: number): PassengerModel {
        const maxPatience = this.maxPassengerPatience;
        const finalDestinationFloor = destinationFloor;
        const transferFloor = this.getRequiredTransferFloor(originFloor, destinationFloor);
        const firstLegDestination = transferFloor ?? destinationFloor;
        const passenger: PassengerModel = {
            id: this.nextPassengerId++,
            originFloor,
            destinationFloor: firstLegDestination,
            finalDestinationFloor,
            transferFloor,
            destinationColorIndex: this.getFloorColorIndex(finalDestinationFloor),
            actualRideDistance: 0,
            intermediateStops: 0,
            frustration: 0,
            waitElapsed: 0,
            patience: maxPatience,
            maxPatience,
            state: PassengerState.Waiting,
        };
        this.passengers.push(passenger);
        return passenger;
    }

    getPassenger(id: number): PassengerModel | undefined {
        return this.passengers.find((passenger) => passenger.id === id);
    }

    get waitingPassengers(): PassengerModel[] {
        return this.passengers.filter((passenger) => passenger.state === PassengerState.Waiting);
    }

    get warningFloors(): number[] {
        const waitingWarningFloors = this.waitingPassengers
            .filter((passenger) => passenger.waitElapsed / passenger.maxPatience >= PATIENCE_WARNING_RATIO)
            .map((passenger) => passenger.originFloor);
        const elevatorWarningFloors = this.elevators
            .filter((elevator) => {
                return elevator.passengers.some((id) => {
                    const passenger = this.getPassenger(id);
                    return !!passenger
                        && passenger.waitElapsed / passenger.maxPatience >= PATIENCE_WARNING_RATIO;
                });
            })
            .map((elevator) => elevator.currentFloor);
        return [...new Set([...waitingWarningFloors, ...elevatorWarningFloors])];
    }

    getPassengerWaitProgress(passenger: PassengerModel): number {
        return Math.max(0, Math.min(1, passenger.waitElapsed / passenger.maxPatience));
    }

    shouldShowPassengerTimer(passenger: PassengerModel): boolean {
        return passenger.waitElapsed / passenger.maxPatience >= PATIENCE_RING_RATIO;
    }

    get elevatorOccupancy(): number {
        return this.elevatorOccupancyAt(0);
    }

    get isElevatorFull(): boolean {
        return this.isElevatorFullAt(0);
    }

    get isBoarding(): boolean {
        return this.boardingQueues.some((queue) => queue.length > 0);
    }

    get isUnloading(): boolean {
        return this.unloadingQueues.some((queue) => queue.length > 0);
    }

    get isElevatorMoving(): boolean {
        return this.elevators.some((elevator) => elevator.targetFloor !== null);
    }

    elevatorOccupancyAt(elevatorIndex: number): number {
        const elevator = this.elevators[elevatorIndex];
        if (!elevator) {
            return 0;
        }
        return elevator.passengers.length + this.boardingQueues[elevatorIndex].length;
    }

    isElevatorFullAt(elevatorIndex: number): boolean {
        const elevator = this.elevators[elevatorIndex];
        return !!elevator && this.elevatorOccupancyAt(elevatorIndex) >= elevator.capacity;
    }

    getFloorQueue(floor: number): PassengerModel[] {
        return this.passengers
            .filter((passenger) => {
                return passenger.originFloor === floor
                    && passenger.state === PassengerState.Waiting;
            })
            .sort((left, right) => left.id - right.id);
    }

    getFloorLine(floor: number): PassengerModel[] {
        return this.passengers
            .filter((passenger) => {
                return passenger.originFloor === floor
                    && (passenger.state === PassengerState.Waiting || passenger.state === PassengerState.Boarding);
            })
            .sort((left, right) => left.id - right.id);
    }

    getPassengerBoardingElevatorIndex(passenger: PassengerModel): number | null {
        if (passenger.state !== PassengerState.Boarding) {
            return null;
        }
        const index = this.boardingQueues.findIndex((queue) => queue.includes(passenger.id));
        return index < 0 ? null : index;
    }

    getPassengerBoardingProgress(passenger: PassengerModel): number {
        const elevatorIndex = this.getPassengerBoardingElevatorIndex(passenger);
        if (elevatorIndex === null || this.boardingQueues[elevatorIndex][0] !== passenger.id) {
            return 0;
        }
        return Math.max(0, Math.min(1, this.boardingTimers[elevatorIndex] / BOARDING_INTERVAL));
    }

    drainBoardedEvents(): PassengerBoardedEvent[] {
        return this.boardedEvents.splice(0);
    }

    drainDeliveredEvents(): PassengerDeliveredEvent[] {
        return this.deliveredEvents.splice(0);
    }

    drainWarningEvents(): PassengerWarningEvent[] {
        return this.warningEvents.splice(0);
    }

    drainTrafficSpawnRequests(): TrafficSpawnRequest[] {
        return this.trafficSpawnRequests.splice(0);
    }

    get minFloor(): number {
        return Math.min(...this.currentLevelConfig.floors);
    }

    get maxUnlockedFloor(): number {
        return Math.max(...this.currentLevelConfig.floors);
    }

    get currentTimeScale(): number {
        return this.currentDifficulty.timeScale;
    }

    get currentWaitingPassengerLimit(): number {
        return this.currentLevelConfig.passengerSpawnRules.maxWaitingPassengers;
    }

    get activeElevatorCount(): number {
        return this.currentLevelConfig.elevators;
    }

    get currentLevelConfig(): LevelConfig {
        return LEVEL_CONFIGS.find((config) => config.id === this.progress.currentLevelId) ?? LEVEL_CONFIGS[0];
    }

    get levelConfigs(): LevelConfig[] {
        return LEVEL_CONFIGS;
    }

    getLevelStars(levelId: string): number {
        return this.levelResults.get(levelId)?.stars ?? 0;
    }

    isSystemEnabled(system: LevelConfig['enabledSystems'][number]): boolean {
        return this.currentLevelConfig.enabledSystems.includes(system);
    }

    getRenderableFloors(): number[] {
        const levelFloors = this.currentLevelConfig.floors;
        const minFloor = Math.min(...levelFloors);
        const maxLevelFloor = Math.max(...levelFloors);
        const maxFloor = Math.min(
            LEVEL_MAX_FLOOR,
            Math.max(maxLevelFloor, this.currentLevelConfig.floors.length < 7 ? maxLevelFloor : DEFAULT_MAX_FLOOR),
        );
        const floors: number[] = [];
        for (let floor = minFloor; floor <= maxFloor; floor += 1) {
            floors.push(floor);
        }
        return floors;
    }

    getFloorColorIndex(floor: number): number {
        const levelIndex = this.currentLevelConfig.floors.indexOf(floor);
        if (levelIndex >= 0) {
            return levelIndex;
        }
        const renderIndex = this.getRenderableFloors().indexOf(floor);
        return Math.max(0, renderIndex);
    }

    isFloorUnlocked(floor: number): boolean {
        return floor <= LEVEL_MAX_FLOOR && this.currentLevelConfig.floors.includes(floor);
    }

    getFloorType(floor: number): FloorType {
        return this.floorTypeOverrides.get(floor) ?? 'office';
    }

    getFloorsByType(type: FloorType): number[] {
        return this.getRenderableFloors()
            .filter((floor) => this.isFloorUnlocked(floor) && this.getFloorType(floor) === type);
    }

    private canElevatorServeFloor(elevator: ElevatorModel, floor: number): boolean {
        const min = elevator.serviceMinFloor;
        const max = elevator.serviceMaxFloor;
        if (min === undefined || max === undefined) {
            return true;
        }
        return floor >= min && floor <= max;
    }

    private getRequiredTransferFloor(originFloor: number, destinationFloor: number): number | undefined {
        const transferFloor = this.currentLevelConfig.transferFloor;
        if (!this.isSystemEnabled('transfer') || transferFloor === undefined) {
            return undefined;
        }
        if (originFloor === transferFloor || destinationFloor === transferFloor) {
            return undefined;
        }
        const activeElevators = this.elevators.slice(0, this.activeElevatorCount);
        const hasDirectElevator = activeElevators.some((elevator) => {
            return this.canElevatorServeFloor(elevator, originFloor)
                && this.canElevatorServeFloor(elevator, destinationFloor);
        });
        if (hasDirectElevator) {
            return undefined;
        }
        const canReachTransfer = activeElevators.some((elevator) => {
            return this.canElevatorServeFloor(elevator, originFloor)
                && this.canElevatorServeFloor(elevator, transferFloor);
        });
        const transferCanReachDestination = activeElevators.some((elevator) => {
            return this.canElevatorServeFloor(elevator, transferFloor)
                && this.canElevatorServeFloor(elevator, destinationFloor);
        });
        return canReachTransfer && transferCanReachDestination ? transferFloor : undefined;
    }

    private continuePassengerAfterTransfer(passenger: PassengerModel, currentFloor: number): boolean {
        if (passenger.transferFloor === undefined || currentFloor !== passenger.transferFloor) {
            return false;
        }
        passenger.state = PassengerState.Waiting;
        passenger.originFloor = currentFloor;
        passenger.destinationFloor = passenger.finalDestinationFloor;
        passenger.transferFloor = undefined;
        passenger.boardFloor = undefined;
        passenger.boardGameTime = undefined;
        passenger.actualRideDistance = 0;
        passenger.intermediateStops = 0;
        passenger.frustration = 0;
        passenger.lastElevatorFloor = undefined;
        this.resetPassengerPatience(passenger);
        return true;
    }

    private transferPassengerDirectly(
        passenger: PassengerModel,
        fromElevatorIndex: number,
        currentFloor: number,
    ): boolean {
        if (passenger.transferFloor === undefined || currentFloor !== passenger.transferFloor) {
            return false;
        }
        const targetElevatorIndex = this.elevators.findIndex((elevator, index) => {
            return index !== fromElevatorIndex
                && index < this.activeElevatorCount
                && elevator.currentFloor === currentFloor
                && Math.abs(elevator.position - currentFloor) < 0.001
                && elevator.targetFloor === null
                && elevator.doorOpen
                && this.unloadingQueues[index].length === 0
                && this.boardingQueues[index].length === 0
                && !this.isElevatorFullAt(index)
                && this.canElevatorServeFloor(elevator, passenger.finalDestinationFloor);
        });
        if (targetElevatorIndex < 0) {
            return false;
        }

        const targetElevator = this.elevators[targetElevatorIndex];
        passenger.originFloor = currentFloor;
        passenger.destinationFloor = passenger.finalDestinationFloor;
        passenger.transferFloor = undefined;
        passenger.state = PassengerState.Riding;
        this.resetPassengerPatience(passenger);
        passenger.boardFloor = currentFloor;
        passenger.boardGameTime = this.progress.gameTime;
        passenger.actualRideDistance = 0;
        passenger.intermediateStops = 0;
        passenger.frustration = 0;
        passenger.lastElevatorFloor = currentFloor;
        targetElevator.passengers.push(passenger.id);
        this.boardedEvents.push({
            passengerId: passenger.id,
            destinationFloor: passenger.destinationFloor,
            elevatorIndex: targetElevatorIndex,
        });
        return true;
    }

    getUpcomingRushEvents(limit = 2): RushWarningModel[] {
        if (!this.isSystemEnabled('rushWarning')) {
            return [];
        }
        return this.rushEvents
            .filter((event) => !event.triggered)
            .filter((event) => this.getRushAmount(event) > 0)
            .map((event) => ({
                ...event,
                remainingMinutes: event.time - this.progress.gameTime,
            }))
            .filter((event) => event.remainingMinutes >= 0 && event.remainingMinutes <= event.warningLeadTime)
            .sort((left, right) => left.remainingMinutes - right.remainingMinutes)
            .slice(0, limit);
    }

    queueFloor(floor: number): boolean {
        return this.queueFloorForElevator(floor, 0);
    }

    queueFloorForElevator(floor: number, elevatorIndex: number): boolean {
        const elevator = this.elevators[elevatorIndex];
        if (elevatorIndex >= this.activeElevatorCount) {
            return false;
        }
        if (!this.isFloorUnlocked(floor)) {
            return false;
        }
        if (!elevator) {
            return false;
        }
        if (!this.canElevatorServeFloor(elevator, floor)) {
            return false;
        }
        if (elevator.targetFloor === null && floor === elevator.currentFloor) {
            elevator.doorOpen = true;
            return false;
        }
        return this.enqueueStops([floor], elevatorIndex);
    }

    startRun(): void {
        if (this.progress.completed || this.progress.failed) {
            return;
        }
        this.progress.started = true;
    }

    boardAtCurrentFloor(): number {
        return this.boardAtElevator(0);
    }

    boardAtElevator(elevatorIndex: number): number {
        if (elevatorIndex >= this.activeElevatorCount) {
            return 0;
        }
        const boarded = this.boardPassengersAtCurrentFloor(elevatorIndex, () => true);
        const elevator = this.elevators[elevatorIndex];
        if (!elevator || this.elevatorOccupancyAt(elevatorIndex) < elevator.capacity) {
            return boarded;
        }

        const overflowIndex = this.elevators.findIndex((other, index) => {
            return index !== elevatorIndex
                && index < this.activeElevatorCount
                && other.currentFloor === elevator.currentFloor
                && Math.abs(other.position - elevator.position) < 0.001
                && other.doorOpen
                && this.unloadingQueues[index].length === 0
                && !this.isElevatorFullAt(index);
        });
        if (overflowIndex < 0) {
            return boarded;
        }
        return boarded + this.boardPassengersAtCurrentFloor(overflowIndex, () => true);
    }

    update(deltaTime: number): void {
        if (!this.progress.started || this.progress.completed || this.progress.failed) {
            return;
        }
        this.progress.elapsedSeconds += deltaTime;
        const gameMinutes = deltaTime * this.currentTimeScale;
        this.progress.gameTime += gameMinutes;
        this.updateTraffic(gameMinutes, deltaTime);
        if (this.isSystemEnabled('patience')) {
            this.updatePatience(deltaTime, PassengerState.Waiting);
            this.updatePatience(deltaTime, PassengerState.Riding);
            this.updatePatience(deltaTime, PassengerState.Exiting);
            if (this.progress.failed) {
                return;
            }
            this.updatePatienceWarnings(deltaTime);
        }
        this.elevators.slice(0, this.activeElevatorCount).forEach((_elevator, index) => {
            this.updateUnloading(deltaTime, index);
            this.updateBoarding(deltaTime, index);
            this.updateElevator(deltaTime, index);
        });
        const justCompleted = this.isWinConditionMet()
            && this.unloadingQueues.every((queue) => queue.length === 0);
        if (justCompleted && !this.progress.completed) {
            this.recordLevelResult();
        }
        this.progress.completed = justCompleted;
    }

    extendFloor(): boolean {
        const cost = this.floorExtensionCost;
        if (this.economy.coins < cost) {
            return false;
        }
        this.economy.coins -= cost;
        this.progress.unlockedFloors += 1;
        return true;
    }

    get floorExtensionCost(): number {
        return 10 + (this.progress.unlockedFloors - INITIAL_UNLOCKED_FLOORS) * 10;
    }

    chooseUpgrade(type: UpgradeType): void {
        if (!this.progress.completed) {
            return;
        }
        if (type === UpgradeType.Capacity) {
            this.upgrades.capacityLevel += 1;
        } else if (type === UpgradeType.Speed) {
            this.upgrades.speedLevel += 1;
        } else {
            this.upgrades.patienceLevel += 1;
        }
        this.economy.stars += 1;
        this.economy.coins += 10 + this.progress.level * 2;
        this.applyUpgradeEffects();
        this.startNextDay();
    }

    loadLevel(levelId: string): boolean {
        const level = LEVEL_CONFIGS.find((config) => config.id === levelId);
        if (!level) {
            return false;
        }
        this.progress.currentLevelId = level.id;
        this.progress.level = LEVEL_CONFIGS.findIndex((config) => config.id === level.id) + 1;
        this.passengers.length = 0;
        this.applyLevelConfig(level);
        this.resetElevatorAndQueues();
        this.nextPassengerId = 1;
        this.economy.score = 0;
        this.economy.delivered = 0;
        this.economy.lost = 0;
        this.progress.elapsedSeconds = 0;
        this.progress.gameTime = START_TIME;
        this.progress.started = false;
        this.progress.completed = false;
        this.progress.failed = false;
        this.resetTraffic();
        this.applyUpgradeEffects();
        return true;
    }

    restartGame(): void {
        this.passengers.length = 0;
        this.resetElevatorAndQueues();
        this.nextPassengerId = 1;
        this.economy.delivered = 0;
        this.economy.lost = 0;
        this.economy.score = 0;
        this.progress.elapsedSeconds = 0;
        this.progress.gameTime = START_TIME;
        this.progress.started = false;
        this.progress.completed = false;
        this.progress.failed = false;
        this.resetTraffic();
        this.applyUpgradeEffects();
    }

    startNewGame(): void {
        this.passengers.length = 0;
        this.nextPassengerId = 1;
        this.economy.coins = 20;
        this.economy.stars = 0;
        this.economy.score = 0;
        this.economy.bestScore = 0;
        this.economy.delivered = 0;
        this.economy.lost = 0;
        this.progress.day = 1;
        this.progress.level = 1;
        this.progress.currentLevelId = '1-1';
        this.applyLevelConfig(this.currentLevelConfig);
        this.resetElevatorAndQueues();
        this.progress.targetDeliveries = this.currentLevelConfig.winCondition.value;
        this.progress.elapsedSeconds = 0;
        this.progress.gameTime = START_TIME;
        this.progress.started = false;
        this.progress.completed = false;
        this.progress.failed = false;
        this.upgrades.capacityLevel = 0;
        this.upgrades.speedLevel = 0;
        this.upgrades.patienceLevel = 0;
        this.resetTraffic();
        this.applyUpgradeEffects();
    }

    private updatePatience(deltaTime: number, state: PassengerState): void {
        for (const passenger of this.passengers.filter((candidate) => candidate.state === state)) {
            const decayRate = this.getPatienceDecayRate(passenger, state);
            passenger.waitElapsed += deltaTime * decayRate;
            passenger.patience = Math.max(0, passenger.maxPatience - passenger.waitElapsed);
            if (passenger.waitElapsed < passenger.maxPatience) {
                continue;
            }
            passenger.patience = 0;
            passenger.state = PassengerState.Lost;
            this.economy.lost += 1;
            this.progress.failed = this.economy.lost > this.currentLevelConfig.failCondition.max;
            return;
        }
    }

    private updateTraffic(gameMinutes: number, deltaTime: number): void {
        let spawnedRush = false;
        this.rushEvents.forEach((event) => {
            if (event.triggered || this.progress.gameTime < event.time) {
                return;
            }
            this.enqueueTrafficPassengers(event.fromType, event.toType, this.getRushAmount(event));
            event.triggered = true;
            spawnedRush = true;
        });

        const spawnRules = this.currentLevelConfig.passengerSpawnRules;
        if (spawnedRush) {
            this.smallQueueTimer = 0;
            return;
        }

        this.ambientTrafficTimer += deltaTime;
        if (this.ambientTrafficTimer >= this.nextAmbientTrafficDelaySeconds) {
            this.ambientTrafficTimer = 0;
            this.nextAmbientTrafficDelaySeconds = this.rollAmbientTrafficDelaySeconds(spawnRules);
            this.enqueueRandomLowTrafficPassengers(this.rollAmount(spawnRules.ambientMin, spawnRules.ambientMax));
        }

        this.smallQueueTimer += deltaTime;
        if (this.smallQueueTimer >= spawnRules.smallQueueIntervalSeconds) {
            this.smallQueueTimer %= spawnRules.smallQueueIntervalSeconds;
            this.enqueueRandomLowTrafficPassengers(this.rollAmount(spawnRules.smallQueueMin, spawnRules.smallQueueMax));
        }
    }

    private rollAmbientTrafficDelaySeconds(spawnRules: LevelConfig['passengerSpawnRules']): number {
        const range = spawnRules.ambientMaxIntervalSeconds - spawnRules.ambientMinIntervalSeconds;
        return spawnRules.ambientMinIntervalSeconds + Math.random() * Math.max(0, range);
    }

    private rollAmount(min: number, max: number): number {
        return min + Math.floor(Math.random() * (max - min + 1));
    }

    private get currentDifficulty(): DifficultyConfig {
        return DIFFICULTY_STAGES.find((stage) => this.progress.level <= stage.maxLevel)
            ?? DIFFICULTY_STAGES[DIFFICULTY_STAGES.length - 1];
    }

    private get floorRushCap(): number {
        const floorCap = FLOOR_RUSH_CAPS.find((entry) => this.progress.unlockedFloors <= entry.maxUnlockedFloors);
        return floorCap?.rushCap ?? FLOOR_RUSH_CAPS[FLOOR_RUSH_CAPS.length - 1].rushCap;
    }

    private getRushAmount(event: RushEventModel): number {
        const difficulty = this.currentDifficulty;
        if (!difficulty.parkingTrafficEnabled && (event.fromType === 'parking' || event.toType === 'parking')) {
            return 0;
        }
        const routeKey = `${event.fromType}-${event.toType}` as `${FloorType}-${FloorType}`;
        const multiplier = RUSH_ROUTE_MULTIPLIERS[routeKey] ?? 0.6;
        const cap = Math.min(difficulty.rushCap, this.floorRushCap);
        const amount = Math.round(cap * multiplier);
        return Math.max(0, Math.min(cap, amount));
    }

    private enqueueTrafficPassengers(fromType: FloorType, toType: FloorType, amount: number): void {
        const fromFloors = this.getFloorsByType(fromType);
        const toFloors = this.getFloorsByType(toType);
        if (fromFloors.length === 0 || toFloors.length === 0) {
            return;
        }
        for (let index = 0; index < amount; index += 1) {
            const originFloor = fromFloors.length === 1
                ? fromFloors[0]
                : fromFloors[index % fromFloors.length];
            let destinationFloor = toFloors[Math.floor(Math.random() * toFloors.length)];
            if (destinationFloor === originFloor && toFloors.length > 1) {
                destinationFloor = toFloors[(toFloors.indexOf(destinationFloor) + 1) % toFloors.length];
            }
            if (destinationFloor === originFloor) {
                continue;
            }
            this.trafficSpawnRequests.push({ originFloor, destinationFloor });
        }
    }

    private enqueueRandomLowTrafficPassengers(amount: number): void {
        const floors = this.getRenderableFloors().filter((floor) => this.isFloorUnlocked(floor));
        if (floors.length < 2) {
            return;
        }
        for (let index = 0; index < amount; index += 1) {
            const originFloor = floors[Math.floor(Math.random() * floors.length)];
            let destinationFloor = floors[Math.floor(Math.random() * floors.length)];
            if (destinationFloor === originFloor) {
                destinationFloor = floors[(floors.indexOf(originFloor) + 1) % floors.length];
            }
            this.trafficSpawnRequests.push({ originFloor, destinationFloor });
        }
    }

    private updatePatienceWarnings(deltaTime: number): void {
        const warningFloors = this.warningFloors;
        if (warningFloors.length === 0) {
            this.warningTimer = 0;
            return;
        }
        this.warningTimer += deltaTime;
        if (this.warningTimer < WARNING_SOUND_INTERVAL) {
            return;
        }
        this.warningTimer %= WARNING_SOUND_INTERVAL;
        warningFloors.forEach((floor) => this.warningEvents.push({ floor }));
    }

    private updateElevator(deltaTime: number, elevatorIndex: number): void {
        const elevator = this.elevators[elevatorIndex];
        if (elevator.targetFloor === null) {
            this.startNextStop(elevatorIndex);
            return;
        }

        const difference = elevator.targetFloor - elevator.position;
        const step = Math.sign(difference) * deltaTime * this.elevatorSpeed;
        if (Math.abs(difference) > Math.abs(step)) {
            elevator.position += step;
            elevator.doorOpen = false;
            this.accumulateRideDistance(elevatorIndex);
            return;
        }

        const arrivalDirection = elevator.direction;
        elevator.position = elevator.targetFloor;
        this.accumulateRideDistance(elevatorIndex);
        elevator.currentFloor = elevator.targetFloor;
        elevator.targetFloor = null;
        elevator.direction = ElevatorDirection.Idle;
        elevator.doorOpen = true;
        this.recordIntermediateStop(elevatorIndex);
        if (!this.beginUnloadingAtCurrentFloor(elevatorIndex, arrivalDirection)) {
            this.boardForOnwardDirection(elevatorIndex);
        }
    }

    private updateBoarding(deltaTime: number, elevatorIndex: number): void {
        const boardingQueue = this.boardingQueues[elevatorIndex];
        if (boardingQueue.length === 0) {
            this.boardingTimers[elevatorIndex] = 0;
            return;
        }
        this.boardingTimers[elevatorIndex] += deltaTime;
        while (this.boardingTimers[elevatorIndex] >= BOARDING_INTERVAL && boardingQueue.length > 0) {
            this.boardingTimers[elevatorIndex] -= BOARDING_INTERVAL;
            const passengerId = boardingQueue.shift();
            const passenger = passengerId === undefined ? undefined : this.getPassenger(passengerId);
            if (!passenger || passenger.state !== PassengerState.Boarding) {
                continue;
            }
            passenger.state = PassengerState.Riding;
            this.resetPassengerPatience(passenger);
            const elevator = this.elevators[elevatorIndex];
            passenger.boardFloor = passenger.originFloor;
            passenger.boardGameTime = this.progress.gameTime;
            passenger.actualRideDistance = 0;
            passenger.intermediateStops = 0;
            passenger.frustration = 0;
            passenger.lastElevatorFloor = elevator.currentFloor;
            elevator.passengers.push(passenger.id);
            this.boardedEvents.push({
                passengerId: passenger.id,
                destinationFloor: passenger.destinationFloor,
                elevatorIndex,
            });
        }
    }

    private beginUnloadingAtCurrentFloor(elevatorIndex: number, arrivalDirection: ElevatorDirection): boolean {
        const elevator = this.elevators[elevatorIndex];
        const unloadingQueue = this.unloadingQueues[elevatorIndex];
        const deliveredIds = elevator.passengers.filter((id) => {
            return this.getPassenger(id)?.destinationFloor === elevator.currentFloor;
        });
        if (deliveredIds.length === 0) {
            return false;
        }

        deliveredIds.forEach((id) => {
            const passenger = this.getPassenger(id);
            if (passenger) {
                passenger.state = PassengerState.Exiting;
                unloadingQueue.push(id);
            }
        });
        this.pendingArrivalDirections[elevatorIndex] = arrivalDirection;
        this.stopDeliveredCounts[elevatorIndex] = 0;
        this.unloadingTimers[elevatorIndex] = 0;
        return unloadingQueue.length > 0;
    }

    private updateUnloading(deltaTime: number, elevatorIndex: number): void {
        const unloadingQueue = this.unloadingQueues[elevatorIndex];
        if (unloadingQueue.length === 0) {
            this.unloadingTimers[elevatorIndex] = 0;
            return;
        }
        this.unloadingTimers[elevatorIndex] += deltaTime;
        while (this.unloadingTimers[elevatorIndex] >= UNLOADING_INTERVAL && unloadingQueue.length > 0) {
            this.unloadingTimers[elevatorIndex] -= UNLOADING_INTERVAL;
            const passengerId = unloadingQueue.shift();
            const passenger = passengerId === undefined ? undefined : this.getPassenger(passengerId);
            if (!passenger || passenger.state !== PassengerState.Exiting) {
                continue;
            }
            const elevator = this.elevators[elevatorIndex];
            elevator.passengers = elevator.passengers.filter((id) => id !== passenger.id);
            if (this.transferPassengerDirectly(passenger, elevatorIndex, elevator.currentFloor)) {
                continue;
            }
            if (this.continuePassengerAfterTransfer(passenger, elevator.currentFloor)) {
                continue;
            }
            passenger.state = PassengerState.Delivered;
            const quality = this.calculatePassengerQualityScore(passenger);
            this.economy.delivered += 1;
            this.economy.coins += Math.max(1, Math.round(quality.score / 50));
            const scoreGain = quality.score;
            this.economy.score += scoreGain;
            this.economy.bestScore = Math.max(this.economy.bestScore, this.economy.score);
            this.stopDeliveredCounts[elevatorIndex] += 1;
            this.deliveredEvents.push({
                passengerId: passenger.id,
                floor: elevator.currentFloor,
                scoreGain,
                qualityLabel: quality.label,
                stopDeliveredCount: this.stopDeliveredCounts[elevatorIndex],
                totalDelivered: this.economy.delivered,
                elevatorIndex,
            });
        }

        if (unloadingQueue.length === 0 && this.pendingArrivalDirections[elevatorIndex] !== null) {
            this.pendingArrivalDirections[elevatorIndex] = null;
            this.boardForOnwardDirection(elevatorIndex);
        }
    }

    private boardForOnwardDirection(elevatorIndex: number): void {
        const direction = this.getOnwardDirection(elevatorIndex);
        if (direction === ElevatorDirection.Idle) {
            return;
        }
        this.boardPassengersAtCurrentFloor(elevatorIndex, (passenger) => {
            return Math.sign(passenger.destinationFloor - passenger.originFloor) === direction;
        });
    }

    private accumulateRideDistance(elevatorIndex: number): void {
        const elevator = this.elevators[elevatorIndex];
        elevator.passengers.forEach((id) => {
            const passenger = this.getPassenger(id);
            if (!passenger || passenger.state !== PassengerState.Riding) {
                return;
            }
            passenger.lastElevatorFloor ??= elevator.currentFloor;
            if (elevator.direction === ElevatorDirection.Up) {
                const crossedFloor = Math.floor(elevator.position);
                while ((passenger.lastElevatorFloor ?? elevator.currentFloor) < crossedFloor) {
                    passenger.lastElevatorFloor = (passenger.lastElevatorFloor ?? elevator.currentFloor) + 1;
                    passenger.actualRideDistance += 1;
                }
            } else if (elevator.direction === ElevatorDirection.Down) {
                const crossedFloor = Math.ceil(elevator.position);
                while ((passenger.lastElevatorFloor ?? elevator.currentFloor) > crossedFloor) {
                    passenger.lastElevatorFloor = (passenger.lastElevatorFloor ?? elevator.currentFloor) - 1;
                    passenger.actualRideDistance += 1;
                }
            }
        });
    }

    private recordIntermediateStop(elevatorIndex: number): void {
        const elevator = this.elevators[elevatorIndex];
        elevator.passengers.forEach((id) => {
            const passenger = this.getPassenger(id);
            if (!passenger || passenger.state !== PassengerState.Riding) {
                return;
            }
            if (elevator.currentFloor === passenger.destinationFloor || elevator.currentFloor === passenger.boardFloor) {
                return;
            }
            passenger.intermediateStops += 1;
            passenger.frustration += 1;
        });
    }

    private getPatienceDecayRate(passenger: PassengerModel, state: PassengerState): number {
        if (state === PassengerState.Waiting || state === PassengerState.Boarding) {
            return WAITING_PATIENCE_DECAY_RATE;
        }
        if (state === PassengerState.Riding || state === PassengerState.Exiting) {
            const boardFloor = passenger.boardFloor ?? passenger.originFloor;
            const shortestDistance = Math.abs(passenger.destinationFloor - boardFloor);
            const extraDistance = Math.max(0, passenger.actualRideDistance - shortestDistance);
            const detourPenalty = extraDistance * DETOUR_DECAY_PENALTY_PER_FLOOR;
            const rideDecayRate = IN_ELEVATOR_PATIENCE_DECAY_RATE
                + passenger.intermediateStops * INTERMEDIATE_STOP_DECAY_PENALTY
                + detourPenalty;
            return this.clamp(rideDecayRate, MIN_RIDE_DECAY_RATE, MAX_RIDE_DECAY_RATE);
        }
        return WAITING_PATIENCE_DECAY_RATE;
    }

    private calculatePassengerQualityScore(passenger: PassengerModel): { score: number; label: string } {
        const boardFloor = passenger.boardFloor ?? passenger.originFloor;
        const boardGameTime = passenger.boardGameTime ?? this.progress.gameTime;
        const shortestDistance = Math.abs(passenger.finalDestinationFloor - boardFloor);
        const actualRideTime = Math.max(this.progress.gameTime - boardGameTime, 0);
        const patienceRatio = this.clamp(passenger.patience / passenger.maxPatience, 0, 1);
        const patienceFactor = MIN_PATIENCE_FACTOR + (1 - MIN_PATIENCE_FACTOR) * patienceRatio;
        const safeActualDistance = Math.max(passenger.actualRideDistance, shortestDistance, 1);
        const routeEfficiencyFactor = this.clamp(shortestDistance / safeActualDistance, MIN_ROUTE_FACTOR, 1);
        const idealRideTime = shortestDistance * TIME_PER_FLOOR + STOP_TIME;
        const safeActualRideTime = Math.max(actualRideTime, idealRideTime, 1);
        const timeEfficiencyFactor = this.clamp(idealRideTime / safeActualRideTime, MIN_TIME_FACTOR, 1);
        const stopFactor = 1 / (1 + passenger.intermediateStops * STOP_PENALTY_RATE);
        const score = Math.round(
            BASE_SCORE
            * patienceFactor
            * routeEfficiencyFactor
            * timeEfficiencyFactor
            * stopFactor,
        );
        return {
            score,
            label: this.qualityLabelForScore(score),
        };
    }

    private qualityLabelForScore(score: number): string {
        if (score >= 90) {
            return 'Perfect';
        }
        if (score >= 70) {
            return 'Good';
        }
        if (score >= 40) {
            return 'Slow';
        }
        return 'okey';
    }

    private clamp(value: number, min: number, max: number): number {
        return Math.max(min, Math.min(max, value));
    }

    private getOnwardDirection(elevatorIndex: number): ElevatorDirection {
        const elevator = this.elevators[elevatorIndex];
        const nextStop = elevator.queue.find((floor) => floor !== elevator.currentFloor);
        if (nextStop === undefined) {
            return ElevatorDirection.Idle;
        }
        return nextStop > elevator.currentFloor ? ElevatorDirection.Up : ElevatorDirection.Down;
    }

    private get elevatorSpeed(): number {
        return 1.25 + this.upgrades.speedLevel * 0.18;
    }

    private applyUpgradeEffects(): void {
        this.elevators.forEach((elevator) => {
            elevator.capacity = ELEVATOR_CAPACITY;
        });
    }

    private get maxPassengerPatience(): number {
        return PASSENGER_WAIT_SECONDS + this.upgrades.patienceLevel * 4;
    }

    private resetPassengerPatience(passenger: PassengerModel): void {
        passenger.maxPatience = this.maxPassengerPatience;
        passenger.waitElapsed = 0;
        passenger.patience = passenger.maxPatience;
    }

    private isWinConditionMet(): boolean {
        const condition = this.currentLevelConfig.winCondition;
        if (condition.type === 'score') {
            return this.economy.score >= condition.value;
        }
        return this.economy.delivered >= condition.value;
    }

    private recordLevelResult(): void {
        const stars = this.calculateLevelStars();
        const previous = this.levelResults.get(this.currentLevelConfig.id);
        if (previous && previous.stars >= stars) {
            return;
        }
        this.levelResults.set(this.currentLevelConfig.id, {
            stars,
            delivered: this.economy.delivered,
            lost: this.economy.lost,
            score: this.economy.score,
        });
    }

    private calculateLevelStars(): number {
        const perfectScoreTarget = this.currentLevelConfig.winCondition.value;
        if (this.economy.lost === 0 && this.economy.score >= perfectScoreTarget) {
            return 3;
        }
        if (this.economy.lost <= Math.max(1, Math.floor(this.currentLevelConfig.failCondition.max * 0.5))) {
            return 2;
        }
        return 1;
    }

    private applyLevelConfig(level: LevelConfig): void {
        this.floorTypeOverrides.clear();
        Object.entries(level.floorTypes).forEach(([floor, type]) => {
            if (type) {
                this.floorTypeOverrides.set(Number(floor), type);
            }
        });
        this.progress.currentLevelId = level.id;
        this.progress.targetDeliveries = level.winCondition.value;
        this.progress.unlockedFloors = level.floors.length;
        this.elevators.forEach((elevator, index) => {
            const range = level.elevatorServiceRanges?.[index];
            elevator.serviceMinFloor = range?.min;
            elevator.serviceMaxFloor = range?.max;
        });
        this.rushEvents.length = 0;
        level.rushEvents.forEach((event) => this.rushEvents.push({ ...event, triggered: false }));
    }

    private boardPassengersAtCurrentFloor(
        elevatorIndex: number,
        predicate: (passenger: PassengerModel) => boolean,
    ): number {
        const elevator = this.elevators[elevatorIndex];
        if (!elevator || !elevator.doorOpen || this.unloadingQueues[elevatorIndex].length > 0) {
            return 0;
        }
        const room = elevator.capacity - this.elevatorOccupancyAt(elevatorIndex);
        if (room <= 0) {
            return 0;
        }
        const boarding: PassengerModel[] = [];
        const floorQueue = this.getFloorQueue(elevator.currentFloor);
        for (const passenger of floorQueue) {
            if (boarding.length >= room) {
                break;
            }
            // A strict FIFO queue cannot skip a passenger whose direction is incompatible.
            if (!predicate(passenger)) {
                break;
            }
            if (!this.canElevatorServeFloor(elevator, passenger.destinationFloor)) {
                break;
            }
            boarding.push(passenger);
        }
        boarding.forEach((passenger) => {
            passenger.state = PassengerState.Boarding;
            this.boardingQueues[elevatorIndex].push(passenger.id);
        });
        return boarding.length;
    }

    private enqueueStops(floors: number[], elevatorIndex: number): boolean {
        const elevator = this.elevators[elevatorIndex];
        let added = false;
        floors.forEach((floor) => {
            if (!this.isFloorUnlocked(floor)) {
                return;
            }
            elevator.queue.push(floor);
            added = true;
        });
        this.startNextStop(elevatorIndex);
        return added;
    }

    private startNextStop(elevatorIndex: number): void {
        const elevator = this.elevators[elevatorIndex];
        if (
            elevator.targetFloor !== null
            || this.boardingQueues[elevatorIndex].length > 0
            || this.unloadingQueues[elevatorIndex].length > 0
        ) {
            return;
        }
        while (elevator.queue.length > 0) {
            const next = elevator.queue.shift();
            if (next === undefined) {
                return;
            }
            if (next === elevator.currentFloor) {
                elevator.doorOpen = true;
                continue;
            }
            elevator.targetFloor = next;
            elevator.direction = next > elevator.currentFloor
                ? ElevatorDirection.Up
                : ElevatorDirection.Down;
            elevator.doorOpen = false;
            return;
        }
        elevator.direction = ElevatorDirection.Idle;
    }

    private startNextDay(): void {
        this.passengers.length = 0;
        this.resetElevatorAndQueues();
        this.progress.day += 1;
        this.progress.level += 1;
        this.progress.targetDeliveries = this.currentDifficulty.targetDeliveries;
        this.progress.elapsedSeconds = 0;
        this.progress.gameTime = START_TIME;
        this.progress.started = false;
        this.progress.completed = false;
        this.progress.failed = false;
        this.economy.delivered = 0;
        this.economy.lost = 0;
        this.economy.score = 0;
        this.resetTraffic();
    }

    private resetTraffic(): void {
        this.rushEvents.forEach((event) => {
            event.triggered = false;
        });
        this.trafficSpawnRequests.length = 0;
        this.ambientTrafficTimer = 0;
        this.nextAmbientTrafficDelaySeconds = this.currentLevelConfig.passengerSpawnRules.ambientFirstDelaySeconds;
        this.smallQueueTimer = 0;
    }

    private resetElevatorAndQueues(): void {
        this.elevators.forEach((elevator) => {
            const startFloor = elevator.serviceMinFloor ?? 0;
            elevator.currentFloor = startFloor;
            elevator.targetFloor = null;
            elevator.position = startFloor;
            elevator.direction = ElevatorDirection.Idle;
            elevator.passengers = [];
            elevator.queue = [];
            elevator.doorOpen = true;
        });
        this.boardingQueues.forEach((queue) => {
            queue.length = 0;
        });
        this.unloadingQueues.forEach((queue) => {
            queue.length = 0;
        });
        this.boardedEvents.length = 0;
        this.deliveredEvents.length = 0;
        this.warningEvents.length = 0;
        this.boardingTimers.fill(0);
        this.unloadingTimers.fill(0);
        this.warningTimer = 0;
        this.pendingArrivalDirections.fill(null);
        this.stopDeliveredCounts.fill(0);
    }
}
