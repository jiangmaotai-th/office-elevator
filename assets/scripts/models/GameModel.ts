import {
    EconomyModel,
    ElevatorDirection,
    ElevatorModel,
    FloorType,
    GameSnapshot,
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

export const START_TIME = 7 * 60;
export const TIME_SCALE = 10;
const MIN_FLOOR = -2;
const INITIAL_UNLOCKED_FLOORS = 11;
const DEFAULT_MAX_FLOOR = 10;
const BOARDING_INTERVAL = 0.22;
const UNLOADING_INTERVAL = 0.28;
const PASSENGER_WAIT_MINUTES = 40;
const PATIENCE_RING_RATIO = 0.5;
const PATIENCE_WARNING_RATIO = 0.75;
const WARNING_SOUND_INTERVAL = 0.8;
const ELEVATOR_COUNT = 2;
const DELIVERY_SCORE_BASE = 10;
const LOW_TRAFFIC_INTERVAL_MINUTES = 25;

export class GameModel {
    readonly passengers: PassengerModel[] = [];
    readonly elevators: ElevatorModel[] = [
        {
            id: 'S1',
            currentFloor: 0,
            targetFloor: null,
            position: 0,
            direction: ElevatorDirection.Idle,
            capacity: 6,
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
            capacity: 6,
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
        multiplier: 1,
        multiplierProgress: 0,
    };
    readonly progress: ProgressModel = {
        day: 1,
        level: 1,
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
    private lowTrafficTimer = 0;
    private readonly floorTypeOverrides = new Map<number, FloorType>([
        [-2, 'parking'],
        [-1, 'parking'],
        [0, 'ground'],
        [1, 'restaurant'],
        [2, 'rest'],
    ]);
    readonly rushEvents: RushEventModel[] = [
        {
            time: 8 * 60,
            warningLeadTime: 180,
            fromType: 'ground',
            toType: 'office',
            amount: 12,
            label: '上班高峰：大厅去办公层',
            triggered: false,
        },
        {
            time: 8 * 60 + 20,
            warningLeadTime: 180,
            fromType: 'parking',
            toType: 'office',
            amount: 10,
            label: '上班高峰：停车场去办公层',
            triggered: false,
        },
        {
            time: 11 * 60 + 50,
            warningLeadTime: 120,
            fromType: 'office',
            toType: 'restaurant',
            amount: 14,
            label: '午餐高峰：办公层去餐厅',
            triggered: false,
        },
        {
            time: 12 * 60 + 40,
            warningLeadTime: 120,
            fromType: 'restaurant',
            toType: 'office',
            amount: 14,
            label: '午餐返回：餐厅回办公层',
            triggered: false,
        },
        {
            time: 15 * 60,
            warningLeadTime: 120,
            fromType: 'office',
            toType: 'rest',
            amount: 6,
            label: '下午休息：办公层去休息层',
            triggered: false,
        },
        {
            time: 15 * 60 + 40,
            warningLeadTime: 120,
            fromType: 'rest',
            toType: 'office',
            amount: 6,
            label: '休息返回：休息层回办公层',
            triggered: false,
        },
        {
            time: 17 * 60 + 30,
            warningLeadTime: 180,
            fromType: 'office',
            toType: 'ground',
            amount: 12,
            label: '下班高峰：办公层去大厅',
            triggered: false,
        },
        {
            time: 17 * 60 + 45,
            warningLeadTime: 180,
            fromType: 'office',
            toType: 'parking',
            amount: 12,
            label: '下班高峰：办公层去停车场',
            triggered: false,
        },
    ];

    restore(snapshot: GameSnapshot | null): void {
        if (!snapshot || snapshot.version !== 1) {
            return;
        }
        Object.assign(this.economy, snapshot.economy);
        Object.assign(this.progress, snapshot.progress);
        Object.assign(this.upgrades, snapshot.upgrades ?? {});
        this.economy.score ??= 0;
        this.economy.bestScore ??= this.economy.score;
        this.progress.started ??= false;
        this.progress.gameTime ??= START_TIME;
        this.progress.unlockedFloors = Math.max(this.progress.unlockedFloors, INITIAL_UNLOCKED_FLOORS);
        this.applyUpgradeEffects();
        this.progress.completed = false;
        this.progress.failed = false;
    }

    snapshot(): GameSnapshot {
        return {
            version: 1,
            economy: { ...this.economy },
            progress: { ...this.progress },
            upgrades: { ...this.upgrades },
        };
    }

    createPassenger(originFloor: number, destinationFloor: number): PassengerModel {
        const maxPatience = PASSENGER_WAIT_MINUTES + this.upgrades.patienceLevel * 4;
        const passenger: PassengerModel = {
            id: this.nextPassengerId++,
            originFloor,
            destinationFloor,
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
        return [...new Set(
            this.waitingPassengers
                .filter((passenger) => passenger.waitElapsed / passenger.maxPatience >= PATIENCE_WARNING_RATIO)
                .map((passenger) => passenger.originFloor),
        )];
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
        return MIN_FLOOR;
    }

    get maxUnlockedFloor(): number {
        return this.progress.unlockedFloors - 1;
    }

    getRenderableFloors(): number[] {
        const maxFloor = Math.max(DEFAULT_MAX_FLOOR, this.maxUnlockedFloor);
        const floors: number[] = [];
        for (let floor = MIN_FLOOR; floor <= maxFloor; floor += 1) {
            floors.push(floor);
        }
        return floors;
    }

    isFloorUnlocked(floor: number): boolean {
        return floor >= MIN_FLOOR && floor <= this.maxUnlockedFloor;
    }

    getFloorType(floor: number): FloorType {
        return this.floorTypeOverrides.get(floor) ?? 'office';
    }

    getFloorsByType(type: FloorType): number[] {
        return this.getRenderableFloors()
            .filter((floor) => this.isFloorUnlocked(floor) && this.getFloorType(floor) === type);
    }

    getUpcomingRushEvents(limit = 2): RushWarningModel[] {
        return this.rushEvents
            .filter((event) => !event.triggered)
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
        if (!this.isFloorUnlocked(floor)) {
            return false;
        }
        if (!elevator) {
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
        const boarded = this.boardPassengersAtCurrentFloor(elevatorIndex, () => true);
        const elevator = this.elevators[elevatorIndex];
        if (!elevator || this.elevatorOccupancyAt(elevatorIndex) < elevator.capacity) {
            return boarded;
        }

        const overflowIndex = this.elevators.findIndex((other, index) => {
            return index !== elevatorIndex
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
        const gameMinutes = deltaTime * TIME_SCALE;
        this.progress.gameTime += gameMinutes;
        this.updateTraffic(gameMinutes);
        this.updatePatience(gameMinutes, PassengerState.Waiting, 1);
        this.updatePatience(gameMinutes, PassengerState.Boarding, 0.5);
        this.updatePatience(gameMinutes, PassengerState.Riding, 0.5);
        this.updatePatience(gameMinutes, PassengerState.Exiting, 0.5);
        if (this.progress.failed) {
            return;
        }
        this.updatePatienceWarnings(deltaTime);
        this.elevators.forEach((_elevator, index) => {
            this.updateUnloading(deltaTime, index);
            this.updateBoarding(deltaTime, index);
            this.updateElevator(deltaTime, index);
        });
        this.progress.completed = this.economy.delivered >= this.progress.targetDeliveries
            && this.unloadingQueues.every((queue) => queue.length === 0);
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

    restartGame(): void {
        this.passengers.length = 0;
        this.resetElevatorAndQueues();
        this.nextPassengerId = 1;
        this.economy.delivered = 0;
        this.economy.lost = 0;
        this.economy.score = 0;
        this.economy.multiplier = 1;
        this.economy.multiplierProgress = 0;
        this.progress.elapsedSeconds = 0;
        this.progress.gameTime = START_TIME;
        this.progress.started = false;
        this.progress.completed = false;
        this.progress.failed = false;
        this.resetTraffic();
        this.applyUpgradeEffects();
    }

    private updatePatience(gameMinutes: number, state: PassengerState, rate: number): void {
        for (const passenger of this.passengers.filter((candidate) => candidate.state === state)) {
            passenger.waitElapsed += gameMinutes * rate;
            passenger.patience = Math.max(0, passenger.maxPatience - passenger.waitElapsed);
            if (passenger.waitElapsed < passenger.maxPatience) {
                continue;
            }
            passenger.patience = 0;
            passenger.state = PassengerState.Lost;
            this.economy.lost += 1;
            this.economy.multiplier = 1;
            this.economy.multiplierProgress = 0;
            this.progress.failed = true;
            return;
        }
    }

    private updateTraffic(gameMinutes: number): void {
        this.rushEvents.forEach((event) => {
            if (event.triggered || this.progress.gameTime < event.time) {
                return;
            }
            this.enqueueTrafficPassengers(event.fromType, event.toType, event.amount);
            event.triggered = true;
        });

        this.lowTrafficTimer += gameMinutes;
        if (this.lowTrafficTimer < LOW_TRAFFIC_INTERVAL_MINUTES) {
            return;
        }
        this.lowTrafficTimer %= LOW_TRAFFIC_INTERVAL_MINUTES;
        const routes: Array<[FloorType, FloorType]> = [
            ['ground', 'office'],
            ['parking', 'office'],
            ['office', 'ground'],
            ['office', 'parking'],
            ['office', 'restaurant'],
            ['office', 'rest'],
        ];
        const route = routes[Math.floor(Math.random() * routes.length)];
        this.enqueueTrafficPassengers(route[0], route[1], 1 + Math.floor(Math.random() * 2));
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
            return;
        }

        const arrivalDirection = elevator.direction;
        elevator.position = elevator.targetFloor;
        elevator.currentFloor = elevator.targetFloor;
        elevator.targetFloor = null;
        elevator.direction = ElevatorDirection.Idle;
        elevator.doorOpen = true;
        if (!this.beginUnloadingAtCurrentFloor(elevatorIndex, arrivalDirection)) {
            this.boardForArrivalDirection(elevatorIndex, arrivalDirection);
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
            this.elevators[elevatorIndex].passengers.push(passenger.id);
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
            passenger.state = PassengerState.Delivered;
            const elevator = this.elevators[elevatorIndex];
            elevator.passengers = elevator.passengers.filter((id) => id !== passenger.id);
            const patienceRatio = passenger.patience / passenger.maxPatience;
            const deliveryMultiplier = patienceRatio >= 0.8
                ? 3
                : patienceRatio >= 0.5
                    ? 2
                    : 1;
            this.economy.multiplier = deliveryMultiplier;
            this.economy.multiplierProgress = 0;
            this.economy.delivered += 1;
            this.economy.coins += deliveryMultiplier;
            const scoreGain = DELIVERY_SCORE_BASE * deliveryMultiplier;
            this.economy.score += scoreGain;
            this.economy.bestScore = Math.max(this.economy.bestScore, this.economy.score);
            this.stopDeliveredCounts[elevatorIndex] += 1;
            this.deliveredEvents.push({
                passengerId: passenger.id,
                floor: elevator.currentFloor,
                multiplier: deliveryMultiplier,
                stopDeliveredCount: this.stopDeliveredCounts[elevatorIndex],
                totalDelivered: this.economy.delivered,
                elevatorIndex,
            });
        }

        if (unloadingQueue.length === 0 && this.pendingArrivalDirections[elevatorIndex] !== null) {
            const arrivalDirection = this.pendingArrivalDirections[elevatorIndex];
            this.pendingArrivalDirections[elevatorIndex] = null;
            this.boardForArrivalDirection(elevatorIndex, arrivalDirection);
        }
    }

    private boardForArrivalDirection(elevatorIndex: number, arrivalDirection: ElevatorDirection): void {
        this.boardPassengersAtCurrentFloor(elevatorIndex, (passenger) => {
            return Math.sign(passenger.destinationFloor - passenger.originFloor) === arrivalDirection;
        });
    }

    private get elevatorSpeed(): number {
        return 1.25 + this.upgrades.speedLevel * 0.18;
    }

    private applyUpgradeEffects(): void {
        this.elevators.forEach((elevator) => {
            elevator.capacity = 6 + this.upgrades.capacityLevel;
        });
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
        this.progress.targetDeliveries += 6;
        this.progress.elapsedSeconds = 0;
        this.progress.gameTime = START_TIME;
        this.progress.started = false;
        this.progress.completed = false;
        this.progress.failed = false;
        this.economy.delivered = 0;
        this.economy.lost = 0;
        this.economy.score = 0;
        this.economy.multiplier = 1;
        this.economy.multiplierProgress = 0;
        this.resetTraffic();
    }

    private resetTraffic(): void {
        this.rushEvents.forEach((event) => {
            event.triggered = false;
        });
        this.trafficSpawnRequests.length = 0;
        this.lowTrafficTimer = 0;
    }

    private resetElevatorAndQueues(): void {
        this.elevators.forEach((elevator) => {
            elevator.currentFloor = 0;
            elevator.targetFloor = null;
            elevator.position = 0;
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
