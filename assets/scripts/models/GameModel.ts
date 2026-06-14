import {
    EconomyModel,
    ElevatorDirection,
    ElevatorModel,
    GameSnapshot,
    PassengerModel,
    PassengerBoardedEvent,
    PassengerState,
    ProgressModel,
    UpgradeModel,
    UpgradeType,
} from './GameTypes';

const MIN_FLOORS = 3;
const BOARDING_INTERVAL = 0.22;

export class GameModel {
    readonly passengers: PassengerModel[] = [];
    readonly elevator: ElevatorModel = {
        currentFloor: 0,
        targetFloor: null,
        position: 0,
        direction: ElevatorDirection.Idle,
        capacity: 6,
        passengers: [],
        queue: [],
        doorOpen: true,
    };
    readonly economy: EconomyModel = {
        coins: 20,
        stars: 0,
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
        completed: false,
    };
    readonly upgrades: UpgradeModel = {
        capacityLevel: 0,
        speedLevel: 0,
        patienceLevel: 0,
    };

    private nextPassengerId = 1;
    private readonly boardingQueue: number[] = [];
    private readonly boardedEvents: PassengerBoardedEvent[] = [];
    private boardingTimer = 0;

    restore(snapshot: GameSnapshot | null): void {
        if (!snapshot || snapshot.version !== 1) {
            return;
        }
        Object.assign(this.economy, snapshot.economy);
        Object.assign(this.progress, snapshot.progress);
        Object.assign(this.upgrades, snapshot.upgrades ?? {});
        this.applyUpgradeEffects();
        this.progress.completed = false;
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

    get elevatorOccupancy(): number {
        return this.elevator.passengers.length + this.boardingQueue.length;
    }

    get isElevatorFull(): boolean {
        return this.elevatorOccupancy >= this.elevator.capacity;
    }

    get isBoarding(): boolean {
        return this.boardingQueue.length > 0;
    }

    get isElevatorMoving(): boolean {
        return this.elevator.targetFloor !== null;
    }

    getFloorQueue(floor: number): PassengerModel[] {
        return this.passengers
            .filter((passenger) => {
                return passenger.originFloor === floor
                    && (passenger.state === PassengerState.Waiting || passenger.state === PassengerState.Boarding);
            })
            .sort((left, right) => left.id - right.id);
    }

    drainBoardedEvents(): PassengerBoardedEvent[] {
        return this.boardedEvents.splice(0);
    }

    queueFloor(floor: number): boolean {
        if (floor < 0 || floor >= this.progress.unlockedFloors) {
            return false;
        }
        if (this.elevator.targetFloor === null && floor === this.elevator.currentFloor) {
            this.elevator.doorOpen = true;
            return false;
        }
        return this.enqueueStops([floor]);
    }

    boardAtCurrentFloor(): number {
        return this.boardPassengersAtCurrentFloor(() => true);
    }

    update(deltaTime: number): void {
        if (this.progress.completed) {
            return;
        }
        this.progress.elapsedSeconds += deltaTime;
        this.updatePatience(deltaTime);
        this.updateBoarding(deltaTime);
        this.updateElevator(deltaTime);
        this.progress.completed = this.economy.delivered >= this.progress.targetDeliveries;
    }

    extendFloor(): boolean {
        const cost = this.floorExtensionCost;
        if (this.economy.coins < cost || this.progress.unlockedFloors >= 6) {
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

    private updatePatience(deltaTime: number): void {
        this.waitingPassengers.forEach((passenger) => {
            passenger.patience -= deltaTime;
            if (passenger.patience > 0) {
                return;
            }
            passenger.state = PassengerState.Lost;
            this.economy.lost += 1;
            this.economy.multiplier = 1;
            this.economy.multiplierProgress = 0;
        });
    }

    private updateElevator(deltaTime: number): void {
        const { elevator } = this;
        if (elevator.targetFloor === null) {
            this.startNextStop();
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
        this.deliverAtCurrentFloor();
        this.boardPassengersAtCurrentFloor((passenger) => {
            return Math.sign(passenger.destinationFloor - passenger.originFloor) === arrivalDirection;
        });
    }

    private updateBoarding(deltaTime: number): void {
        if (this.boardingQueue.length === 0) {
            this.boardingTimer = 0;
            return;
        }
        this.boardingTimer += deltaTime;
        while (this.boardingTimer >= BOARDING_INTERVAL && this.boardingQueue.length > 0) {
            this.boardingTimer -= BOARDING_INTERVAL;
            const passengerId = this.boardingQueue.shift();
            const passenger = passengerId === undefined ? undefined : this.getPassenger(passengerId);
            if (!passenger || passenger.state !== PassengerState.Boarding) {
                continue;
            }
            passenger.state = PassengerState.Riding;
            this.elevator.passengers.push(passenger.id);
            this.boardedEvents.push({
                passengerId: passenger.id,
                destinationFloor: passenger.destinationFloor,
            });
        }
    }

    private deliverAtCurrentFloor(): void {
        const { elevator, economy } = this;
        const deliveredIds = elevator.passengers.filter((id) => {
            return this.getPassenger(id)?.destinationFloor === elevator.currentFloor;
        });
        if (deliveredIds.length === 0) {
            return;
        }

        deliveredIds.forEach((id) => {
            const passenger = this.getPassenger(id);
            if (!passenger) {
                return;
            }
            passenger.state = PassengerState.Delivered;
            const patienceRatio = passenger.patience / passenger.maxPatience;
            economy.multiplierProgress += patienceRatio >= 0.6 ? 2 : 1;
            economy.delivered += 1;
            economy.coins += economy.multiplier;
        });
        elevator.passengers = elevator.passengers.filter((id) => !deliveredIds.includes(id));

        if (economy.multiplierProgress >= 8) {
            economy.multiplier = Math.min(3, economy.multiplier + 1);
            economy.multiplierProgress = 0;
        }
    }

    private get elevatorSpeed(): number {
        return 1.25 + this.upgrades.speedLevel * 0.18;
    }

    private applyUpgradeEffects(): void {
        this.elevator.capacity = 6 + this.upgrades.capacityLevel;
    }

    private boardPassengersAtCurrentFloor(predicate: (passenger: PassengerModel) => boolean): number {
        const { elevator } = this;
        if (!elevator.doorOpen) {
            return 0;
        }
        const room = elevator.capacity - this.elevatorOccupancy;
        if (room <= 0) {
            return 0;
        }
        const boarding: PassengerModel[] = [];
        const floorQueue = this.getFloorQueue(elevator.currentFloor);
        for (const passenger of floorQueue) {
            if (boarding.length >= room || passenger.state !== PassengerState.Waiting) {
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
            this.boardingQueue.push(passenger.id);
        });
        return boarding.length;
    }

    private enqueueStops(floors: number[]): boolean {
        const { elevator } = this;
        let added = false;
        floors.forEach((floor) => {
            if (floor < 0 || floor >= this.progress.unlockedFloors) {
                return;
            }
            if (elevator.targetFloor === floor || elevator.queue.includes(floor)) {
                return;
            }
            elevator.queue.push(floor);
            added = true;
        });
        this.startNextStop();
        return added;
    }

    private startNextStop(): void {
        const { elevator } = this;
        if (elevator.targetFloor !== null || this.boardingQueue.length > 0) {
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
        this.elevator.currentFloor = 0;
        this.elevator.targetFloor = null;
        this.elevator.position = 0;
        this.elevator.direction = ElevatorDirection.Idle;
        this.elevator.passengers = [];
        this.elevator.queue = [];
        this.elevator.doorOpen = true;
        this.boardingQueue.length = 0;
        this.boardedEvents.length = 0;
        this.boardingTimer = 0;
        this.progress.day += 1;
        this.progress.level += 1;
        this.progress.targetDeliveries += 6;
        this.progress.elapsedSeconds = 0;
        this.progress.completed = false;
        this.economy.delivered = 0;
        this.economy.lost = 0;
        this.economy.multiplier = 1;
        this.economy.multiplierProgress = 0;
    }
}
