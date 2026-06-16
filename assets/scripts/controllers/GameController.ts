import { EventMouse, EventTouch, input, Input } from 'cc';
import { GameManager } from '../managers/GameManager';
import { GameView } from '../views/GameView';

const MAX_WAITING_PASSENGERS = 18;

export class GameController {
    private spawnTimer = 0;
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
        this.manager.update(deltaTime);
        const model = this.manager.model;
        if (!model.progress.started || model.progress.completed || model.progress.failed) {
            this.view.render(model);
            return;
        }
        this.spawnTimer += deltaTime;
        if (
            this.spawnTimer >= 3.2
        ) {
            this.spawnTimer = 0;
            this.spawnPassenger();
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
            this.view.scrollTowerBy(y - this.pointerLastY, this.manager.model.progress.unlockedFloors);
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
                this.manager.model.restartGame();
                this.spawnTimer = 0;
                this.view.resetTowerScroll();
                this.view.setInteractionMessage('准备重新开始，点击开始运营');
                this.manager.saveNow();
            }
            return;
        }
        if (this.manager.model.progress.completed) {
            const upgrade = this.view.upgradeAt(position);
            if (upgrade) {
                this.manager.model.chooseUpgrade(upgrade);
                this.manager.saveNow();
                this.view.setInteractionMessage('升级完成，点击开始下一天');
            }
            return;
        }
        if (!this.manager.model.progress.started) {
            if (this.view.isStartButton(position)) {
                this.manager.model.startRun();
                this.spawnTimer = 0;
                this.seedPassengers();
                this.view.setInteractionMessage('运营开始，先选择 S1 或 S2 再点击楼层');
                this.manager.saveNow();
            } else if (this.view.isBuildButton(position)) {
                const built = this.manager.model.extendFloor();
                this.view.setInteractionMessage(built ? '新楼层已解锁，可上下拖动浏览' : '金币不足');
            } else {
                this.view.setInteractionMessage('点击开始运营后，乘客才会出现和倒计时');
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
            return;
        }
        const cabinIndex = this.view.cabinAt(position);
        if (cabinIndex !== null) {
            const model = this.manager.model;
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
            const built = this.manager.model.extendFloor();
            this.view.setInteractionMessage(built ? '新楼层已解锁，可上下拖动浏览' : '金币不足');
            return;
        }
        const floor = this.view.floorAt(position);
        if (floor !== null) {
            const model = this.manager.model;
            const elevatorIndex = this.activeElevatorIndex;
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

    private seedPassengers(): void {
        if (this.manager.model.waitingPassengers.length > 0) {
            return;
        }
        this.createPassengerBatch(0, 4);
        this.createPassengerBatch(1, 1);
        this.createPassengerBatch(2, 1);
    }

    private spawnPassenger(): void {
        const waitingCount = this.manager.model.waitingPassengers.length;
        if (waitingCount >= MAX_WAITING_PASSENGERS) {
            return;
        }
        const origin = this.pickPassengerOrigin();
        const room = MAX_WAITING_PASSENGERS - waitingCount;
        const requestedCount = origin === 0 ? 2 + Math.floor(Math.random() * 3) : 1;
        this.createPassengerBatch(origin, Math.min(room, requestedCount));
    }

    private createPassengerBatch(origin: number, count: number): number {
        const floorCount = this.manager.model.progress.unlockedFloors;
        let created = 0;
        for (let index = 0; index < count; index += 1) {
            let destination = Math.floor(Math.random() * floorCount);
            while (destination === origin) {
                destination = Math.floor(Math.random() * floorCount);
            }
            this.manager.model.createPassenger(origin, destination);
            created += 1;
        }
        this.view.showQueueIncrease(origin, created);
        return created;
    }

    private pickPassengerOrigin(): number {
        const floorCount = this.manager.model.progress.unlockedFloors;
        if (floorCount <= 1) {
            return 0;
        }
        if (Math.random() < 0.55) {
            return 0;
        }
        return 1 + Math.floor(Math.random() * (floorCount - 1));
    }
}
