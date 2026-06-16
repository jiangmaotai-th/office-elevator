import {
    EconomyModel,
    ElevatorDirection,
    ElevatorModel,
    GameSnapshot,
    PassengerModel,
    PassengerBoardedEvent,
    PassengerDeliveredEvent,
    PassengerState,
    PassengerWarningEvent,
    ProgressModel,
    UpgradeModel,
    UpgradeType,
} from './GameTypes';

const MIN_FLOORS = 3;
const BOARDING_INTERVAL = 0.22;
const UNLOADING_INTERVAL = 0.28;
const PATIENCE_WARNING_RATIO = 0.25;
const WARNING_SOUND_INTERVAL = 0.8;
const ELEVATOR_COUNT = 2;
const DELIVERY_SCORE_BASE = 10;

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
        unlockedFloors: MIN_FLOORS,
        elapsedSeconds: 0,
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
        const maxPatience = 20 + this.upgrades.patienceLevel * 4 + Math.random() * 12;
        const passenger: PassengerModel = {
            id: this.nextPassengerId++,
            originFloor,
            destinationFloor,
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
                .filter((passenger) => passenger.patience / passenger.maxPatience <= PATIENCE_WARNING_RATIO)
                .map((passenger) => passenger.originFloor),
        )];
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

    drainBoardedEvents(): PassengerBoardedEvent[] {
        return this.boardedEvents.splice(0);
    }

    drainDeliveredEvents(): PassengerDeliveredEvent[] {
        return this.deliveredEvents.splice(0);
    }

    drainWarningEvents(): PassengerWarningEvent[] {
        return this.warningEvents.splice(0);
    }

    queueFloor(floor: number): boolean {
        return this.queueFloorForElevator(floor, 0);
    }

    queueFloorForElevator(floor: number, elevatorIndex: number): boolean {
        const elevator = this.elevators[elevatorIndex];
        if (floor < 0 || floor >= this.progress.unlockedFloors) {
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
        this.updatePatience(deltaTime);
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
        return 10 + (this.progress.unlockedFloors - MIN_FLOORS) * 10;
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
        this.progress.started = false;
        this.progress.completed = false;
        this.progress.failed = false;
        this.applyUpgradeEffects();
    }

    private updatePatience(deltaTime: number): void {
        for (const passenger of this.waitingPassengers) {
            passenger.patience -= deltaTime;
            if (passenger.patience > 0) {
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
            this.economy.multiplierProgress += patienceRatio >= 0.6 ? 2 : 1;
            this.economy.delivered += 1;
            this.economy.coins += this.economy.multiplier;
            const quickDeliveryBonus = patienceRatio >= 0.6 ? 1.5 : 1;
            const scoreGain = Math.round(DELIVERY_SCORE_BASE * this.economy.multiplier * quickDeliveryBonus);
            this.economy.score += scoreGain;
            this.economy.bestScore = Math.max(this.economy.bestScore, this.economy.score);
            this.stopDeliveredCounts[elevatorIndex] += 1;
            this.deliveredEvents.push({
                passengerId: passenger.id,
                floor: elevator.currentFloor,
                stopDeliveredCount: this.stopDeliveredCounts[elevatorIndex],
                totalDelivered: this.economy.delivered,
                elevatorIndex,
            });
        }

        if (this.economy.multiplierProgress >= 8) {
            this.economy.multiplier = Math.min(3, this.economy.multiplier + 1);
            this.economy.multiplierProgress = 0;
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
            if (floor < 0 || floor >= this.progress.unlockedFloors) {
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
        this.progress.started = false;
        this.progress.completed = false;
        this.progress.failed = false;
        this.economy.delivered = 0;
        this.economy.lost = 0;
        this.economy.score = 0;
        this.economy.multiplier = 1;
        this.economy.multiplierProgress = 0;
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
