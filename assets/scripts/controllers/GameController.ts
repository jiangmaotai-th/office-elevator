import { EventMouse, EventTouch, input, Input } from 'cc';
import { GameManager } from '../managers/GameManager';
import { GameView } from '../views/GameView';

const PASSENGER_APPEAR_INTERVAL = 0.18;

interface PendingPassengerSpawn {
    origin: number;
    destination: number;
}

export class GameController {
    private passengerAppearTimer = 0;
    private readonly pendingPassengerSpawns: PendingPassengerSpawn[] = [];
    private activeElevatorIndex = 0;
    private pointerDown = false;
    private pointerDragged = false;
    private pointerStartX = 0;
    private pointerStartY = 0;
    private pointerLastY = 0;
    private activePointerSource: 'touch' | 'mouse' | null = null;
    private ignoreMouseUntil = 0;
    private lastPointerTime = -Infinity;
    private lastPointerX = 0;
    private lastPointerY = 0;

    constructor(
        private readonly manager: GameManager,
        private readonly view: GameView,
    ) {}

    start(): void {
        input.on(Input.EventType.TOUCH_START, this.onTouchStart, this);
        input.on(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
        input.on(Input.EventType.TOUCH_END, this.onTouchEnd, this);
        input.on(Input.EventType.MOUSE_DOWN, this.onMouseDown, this);
        input.on(Input.EventType.MOUSE_MOVE, this.onMouseMove, this);
        input.on(Input.EventType.MOUSE_UP, this.onMouseUp, this);
        this.view.render(this.manager.model);
    }

    update(deltaTime: number): void {
        this.updatePendingPassengerSpawns(deltaTime);
        this.manager.update(deltaTime);
        const model = this.manager.model;
        this.enqueueTrafficSpawnRequests();
        if (!model.progress.started || model.progress.completed || model.progress.failed) {
            this.view.render(model);
            return;
        }
        this.view.render(model);
    }

    dispose(): void {
        input.off(Input.EventType.TOUCH_START, this.onTouchStart, this);
        input.off(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
        input.off(Input.EventType.TOUCH_END, this.onTouchEnd, this);
        input.off(Input.EventType.MOUSE_DOWN, this.onMouseDown, this);
        input.off(Input.EventType.MOUSE_MOVE, this.onMouseMove, this);
        input.off(Input.EventType.MOUSE_UP, this.onMouseUp, this);
        this.manager.saveNow();
    }

    private onTouchStart(event: EventTouch): void {
        this.ignoreMouseUntil = Date.now() + 250;
        this.activePointerSource = 'touch';
        const location = event.getUILocation();
        this.beginPointer(location.x, location.y);
    }

    private onTouchMove(event: EventTouch): void {
        if (this.activePointerSource !== 'touch') {
            return;
        }
        const location = event.getUILocation();
        this.movePointer(location.x, location.y);
    }

    private onTouchEnd(event: EventTouch): void {
        if (this.activePointerSource !== 'touch') {
            return;
        }
        const location = event.getUILocation();
        this.endPointer(location.x, location.y);
        this.activePointerSource = null;
        this.ignoreMouseUntil = Date.now() + 250;
    }

    private onMouseDown(event: EventMouse): void {
        if (Date.now() < this.ignoreMouseUntil) {
            return;
        }
        this.activePointerSource = 'mouse';
        const location = event.getUILocation();
        this.beginPointer(location.x, location.y);
    }

    private onMouseMove(event: EventMouse): void {
        if (this.activePointerSource !== 'mouse' || Date.now() < this.ignoreMouseUntil) {
            return;
        }
        const location = event.getUILocation();
        this.movePointer(location.x, location.y);
    }

    private onMouseUp(event: EventMouse): void {
        if (this.activePointerSource !== 'mouse' || Date.now() < this.ignoreMouseUntil) {
            return;
        }
        const location = event.getUILocation();
        this.endPointer(location.x, location.y);
        this.activePointerSource = null;
    }

    private beginPointer(x: number, y: number): void {
        this.pointerDown = true;
        this.pointerDragged = false;
        this.pointerStartX = x;
        this.pointerStartY = y;
        this.pointerLastY = y;
    }

    private movePointer(x: number, y: number): void {
        if (!this.pointerDown || this.manager.model.progress.failed || this.manager.model.progress.completed) {
            return;
        }
        const startPosition = this.view.toLocalPosition(this.pointerStartX, this.pointerStartY);
        if (!this.view.isTowerViewport(startPosition)) {
            return;
        }
        if (Math.abs(x - this.pointerStartX) + Math.abs(y - this.pointerStartY) > 8) {
            this.pointerDragged = true;
        }
        if (this.pointerDragged) {
            this.view.scrollTowerBy(y - this.pointerLastY, this.manager.model.getRenderableFloors().length);
        }
        this.pointerLastY = y;
    }

    private endPointer(x: number, y: number): void {
        if (!this.pointerDown) {
            return;
        }
        const wasDragged = this.pointerDragged;
        this.pointerDown = false;
        this.pointerDragged = false;
        if (wasDragged) {
            return;
        }
        this.handlePointerOnce(x, y);
    }

    private handlePointerOnce(x: number, y: number): void {
        const now = Date.now();
        const isDuplicate = now - this.lastPointerTime < 120
            && Math.abs(x - this.lastPointerX) < 2
            && Math.abs(y - this.lastPointerY) < 2;
        if (isDuplicate) {
            return;
        }
        this.lastPointerTime = now;
        this.lastPointerX = x;
        this.lastPointerY = y;
        this.handlePointer(x, y);
    }

    private handlePointer(x: number, y: number): void {
        const position = this.view.toLocalPosition(x, y);

        if (this.manager.model.progress.failed) {
            if (this.view.isRestartButton(position)) {
                this.startNewGame();
            }
            return;
        }
        if (this.manager.model.progress.completed) {
            if (this.view.isRestartButton(position)) {
                const levels = this.manager.model.levelConfigs;
                const currentLevelId = this.manager.model.currentLevelConfig.id;
                const currentIndex = levels.findIndex((level) => level.id === currentLevelId);
                const nextLevel = currentIndex >= 0 ? levels[currentIndex + 1] : null;
                this.manager.model.loadLevel(nextLevel?.id ?? currentLevelId);
                this.activeElevatorIndex = 0;
                this.view.setActiveElevator(0);
                this.view.resetTowerScroll();
                this.passengerAppearTimer = 0;
                this.pendingPassengerSpawns.length = 0;
                this.manager.saveNow();
                this.view.setInteractionMessage(nextLevel ? '已进入下一关，阅读教学后点确定开始' : '已返回选关，点击关卡查看教学');
            }
            return;
        }
        if (!this.manager.model.progress.started) {
            const selectedChapter = this.view.chapterAt(position, this.manager.model);
            if (selectedChapter !== null) {
                this.view.selectChapter(selectedChapter);
                this.view.setInteractionMessage('已切换章节，选择关卡后点击开始运营');
                return;
            }
            const selectedLevel = this.view.levelAt(position, this.manager.model);
            if (selectedLevel) {
                this.manager.model.loadLevel(selectedLevel);
                this.activeElevatorIndex = 0;
                this.view.setActiveElevator(0);
                this.view.resetTowerScroll();
                this.pendingPassengerSpawns.length = 0;
                this.passengerAppearTimer = 0;
                this.view.setInteractionMessage('关卡已切换，阅读教学后点确定开始');
                this.manager.saveNow();
                return;
            }
            if (this.view.isStartButton(position)) {
                this.manager.model.startRun();
                this.passengerAppearTimer = 0;
                this.pendingPassengerSpawns.length = 0;
                this.view.setInteractionMessage('运营开始，点击楼层给当前电梯追加停站指令');
                this.manager.saveNow();
            } else if (this.view.isBuildButton(position)) {
                this.view.setInteractionMessage('当前是关卡制，楼层由关卡配置控制');
            } else {
                this.view.setInteractionMessage('先阅读教学说明，点确定开始后乘客才会出现');
            }
            return;
        }
        if (this.view.isMenuButton(position)) {
            this.manager.saveNow();
            this.view.toggleMenu();
            this.view.setInteractionMessage(this.view.isMenuOpen ? '已打开运营菜单' : '继续运营');
            return;
        }
        if (this.view.isMenuOpen) {
            if (this.view.isNewGameButton(position)) {
                this.startNewGame();
                this.view.toggleMenu();
            }
            return;
        }
        const model = this.manager.model;
        const cabinIndex = this.view.cabinAt(position);
        const floor = this.view.floorAt(position);
        const cabinElevator = cabinIndex === null ? null : model.elevators[cabinIndex];
        const isExplicitCabinTap = cabinIndex !== null
            && cabinElevator !== undefined
            && floor === cabinElevator.currentFloor;
        if (cabinIndex !== null && isExplicitCabinTap) {
            if (cabinIndex >= this.manager.model.activeElevatorCount) {
                this.view.setInteractionMessage('这一关还没有解锁第二台电梯');
                return;
            }
            this.activeElevatorIndex = cabinIndex;
            this.view.setActiveElevator(cabinIndex);
            const elevator = model.elevators[cabinIndex];
            const boarded = model.boardAtElevator(cabinIndex);
            const message = boarded > 0
                ? `${elevator.id}：${boarded} 名乘客正在依次上车`
                : elevator.targetFloor !== null
                    ? `${elevator.id} 正在前往 ${elevator.targetFloor} 层`
                    : model.isBoarding
                        ? '乘客正在依次进入，请点击目标楼层排队'
                        : model.isElevatorFullAt(cabinIndex)
                    ? `${elevator.id} 已满，剩余乘客会继续排队等另一部电梯`
                    : `已选中 ${elevator.id}，点击楼层给它追加指令`;
            this.view.setInteractionMessage(message);
            return;
        }
        if (this.view.isBuildButton(position)) {
            this.view.setInteractionMessage('当前是关卡制，楼层由关卡配置控制');
            return;
        }
        if (floor !== null) {
            const elevatorIndex = this.activeElevatorIndex >= model.activeElevatorCount ? 0 : this.activeElevatorIndex;
            if (elevatorIndex !== this.activeElevatorIndex) {
                this.activeElevatorIndex = elevatorIndex;
                this.view.setActiveElevator(elevatorIndex);
            }
            const elevator = model.elevators[elevatorIndex];
            const queued = model.queueFloorForElevator(floor, elevatorIndex);
            if (!queued && elevator.targetFloor === null && floor === elevator.currentFloor) {
                this.view.setInteractionMessage(`${elevator.id} 已在 ${floor} 层`);
            } else if (!queued) {
                this.view.setInteractionMessage(`无法加入 ${floor} 层指令`);
            } else if (model.isBoarding) {
                this.view.setInteractionMessage(`${elevator.id} 已加入 ${floor} 层，等待乘客依次上车后出发`);
            } else {
                const pending = elevator.queue.length;
                this.view.setInteractionMessage(
                    pending > 0
                        ? `${elevator.id} 已追加 ${floor} 层，前方还有 ${pending} 个停站指令`
                        : `${elevator.id} 正在前往 ${floor} 层`,
                );
            }
            return;
        }
        this.view.setInteractionMessage('请点击楼层区域或电梯轿厢');
    }

    private enqueueTrafficSpawnRequests(): void {
        const requests = this.manager.model.drainTrafficSpawnRequests();
        if (requests.length === 0) {
            return;
        }
        const waitingCount = this.manager.model.waitingPassengers.length + this.pendingPassengerSpawns.length;
        const maxWaitingPassengers = this.manager.model.currentWaitingPassengerLimit;
        if (waitingCount >= maxWaitingPassengers) {
            return;
        }
        const room = maxWaitingPassengers - waitingCount;
        const accepted = requests.slice(0, room);
        const countsByOrigin = new Map<number, number>();
        accepted.forEach((request) => {
            this.pendingPassengerSpawns.push({
                origin: request.originFloor,
                destination: request.destinationFloor,
            });
            countsByOrigin.set(request.originFloor, (countsByOrigin.get(request.originFloor) ?? 0) + 1);
        });
        for (const [origin, count] of countsByOrigin.entries()) {
            this.view.showQueueIncrease(origin, count);
        }
    }

    private startNewGame(): void {
        this.manager.startNewGame();
        this.passengerAppearTimer = 0;
        this.pendingPassengerSpawns.length = 0;
        this.view.resetTowerScroll();
        this.view.setInteractionMessage('已全新开始，阅读教学后点确定开始');
    }

    private updatePendingPassengerSpawns(deltaTime: number): void {
        if (!this.manager.model.progress.started || this.pendingPassengerSpawns.length === 0) {
            this.passengerAppearTimer = 0;
            return;
        }
        this.passengerAppearTimer += deltaTime;
        while (this.pendingPassengerSpawns.length > 0) {
            const interval = this.manager.model.waitingPassengers.length === 0 ? 0 : PASSENGER_APPEAR_INTERVAL;
            if (this.passengerAppearTimer < interval) {
                return;
            }
            this.passengerAppearTimer = interval === 0 ? 0 : this.passengerAppearTimer - interval;
            const spawn = this.pendingPassengerSpawns.shift();
            if (!spawn) {
                return;
            }
            this.manager.model.createPassenger(spawn.origin, spawn.destination);
        }
    }

}
