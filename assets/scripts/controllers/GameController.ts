import { EventMouse, EventTouch, input, Input } from 'cc';
import { GameManager } from '../managers/GameManager';
import { GameView } from '../views/GameView';

export class GameController {
    private spawnTimer = 0;
    private lastPointerTime = -Infinity;
    private lastPointerX = 0;
    private lastPointerY = 0;

    constructor(
        private readonly manager: GameManager,
        private readonly view: GameView,
    ) {}

    start(): void {
        input.on(Input.EventType.TOUCH_END, this.onTouchEnd, this);
        input.on(Input.EventType.MOUSE_UP, this.onMouseUp, this);
        this.seedPassengers();
        this.view.render(this.manager.model);
    }

    update(deltaTime: number): void {
        this.manager.update(deltaTime);
        this.spawnTimer += deltaTime;
        if (
            this.spawnTimer >= 3.2
            && !this.manager.model.progress.completed
            && !this.manager.model.progress.failed
        ) {
            this.spawnTimer = 0;
            this.spawnPassenger();
        }
        this.view.render(this.manager.model);
    }

    dispose(): void {
        input.off(Input.EventType.TOUCH_END, this.onTouchEnd, this);
        input.off(Input.EventType.MOUSE_UP, this.onMouseUp, this);
        this.manager.saveNow();
    }

    private onTouchEnd(event: EventTouch): void {
        const location = event.getUILocation();
        this.handlePointerOnce(location.x, location.y);
    }

    private onMouseUp(event: EventMouse): void {
        const location = event.getUILocation();
        this.handlePointerOnce(location.x, location.y);
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
                this.seedPassengers();
                this.view.setInteractionMessage('重新开始运营');
                this.manager.saveNow();
            }
            return;
        }
        if (this.manager.model.progress.completed) {
            const upgrade = this.view.upgradeAt(position);
            if (upgrade) {
                this.manager.model.chooseUpgrade(upgrade);
                this.seedPassengers();
                this.manager.saveNow();
                this.view.setInteractionMessage('升级完成，进入下一天');
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
        if (this.view.isCabin(position)) {
            const model = this.manager.model;
            const boarded = model.boardAtCurrentFloor();
            const message = boarded > 0
                ? `${boarded} 名乘客正在依次上车`
                : model.isElevatorMoving
                    ? `S1 正在前往 ${model.elevator.targetFloor} 层`
                    : model.isBoarding
                        ? '乘客正在依次进入，请点击目标楼层排队'
                        : model.isElevatorFull
                    ? '电梯已满，剩余乘客继续排队等待'
                    : '当前层没有乘客；请点击左侧楼层色牌让 S1 移动';
            this.view.setInteractionMessage(message);
            return;
        }
        if (this.view.isBuildButton(position)) {
            const built = this.manager.model.extendFloor();
            this.view.setInteractionMessage(built ? '新楼层已解锁' : '金币不足或已达到最高楼层');
            return;
        }
        const floor = this.view.floorAt(position);
        if (floor !== null) {
            const model = this.manager.model;
            const queued = model.queueFloor(floor);
            if (!queued && model.elevator.targetFloor === null && floor === model.elevator.currentFloor) {
                this.view.setInteractionMessage(`S1 已在 ${floor} 层`);
            } else if (!queued) {
                this.view.setInteractionMessage(`${floor} 层已在 S1 停靠队列中`);
            } else if (model.isBoarding) {
                this.view.setInteractionMessage(`已加入 ${floor} 层，等待乘客依次上车后出发`);
            } else {
                this.view.setInteractionMessage(`S1 正在前往 ${floor} 层`);
            }
            return;
        }
        this.view.setInteractionMessage('请点击楼层区域或电梯轿厢');
    }

    private seedPassengers(): void {
        if (this.manager.model.waitingPassengers.length > 0) {
            return;
        }
        this.manager.model.createPassenger(0, 2);
        this.manager.model.createPassenger(1, 0);
        this.manager.model.createPassenger(2, 1);
    }

    private spawnPassenger(): void {
        const floorCount = this.manager.model.progress.unlockedFloors;
        if (this.manager.model.waitingPassengers.length >= 14) {
            return;
        }
        const origin = Math.floor(Math.random() * floorCount);
        let destination = Math.floor(Math.random() * floorCount);
        while (destination === origin) {
            destination = Math.floor(Math.random() * floorCount);
        }
        this.manager.model.createPassenger(origin, destination);
    }
}
