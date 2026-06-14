import {
    Color,
    Graphics,
    Label,
    Layers,
    Node,
    resources,
    Sprite,
    SpriteFrame,
    UITransform,
    Vec3,
} from 'cc';
import { EventBus } from '../core/EventBus';
import { GameModel } from '../models/GameModel';
import {
    ElevatorDirection,
    PassengerDeliveredEvent,
    PassengerModel,
    PassengerState,
    UpgradeType,
} from '../models/GameTypes';

const INK = new Color(24, 25, 28, 255);
const PAPER = new Color(247, 243, 237, 255);
const MUTED = new Color(135, 139, 144, 255);
const BLUE = new Color(27, 105, 198, 255);
const GREEN = new Color(123, 181, 14, 255);
const GOLD = new Color(240, 151, 0, 255);
const DANGER = new Color(193, 92, 83, 255);
const RED = new Color(205, 42, 47, 255);
const PURPLE = new Color(106, 49, 164, 255);
const CYAN = new Color(22, 158, 181, 255);
const OFFICE_WALL = new Color(48, 50, 53, 245);
const OFFICE_WALL_ALT = new Color(57, 59, 62, 245);
const TOWER_BOTTOM = -355;
const TOWER_TOP = 415;
const FLOOR_GAP = 180;
const FLOOR_BASE_Y = -285;

export interface GameHitAreas {
    floorAt(position: Vec3): number | null;
    isCabin(position: Vec3): boolean;
    isBuildButton(position: Vec3): boolean;
    isMenuButton(position: Vec3): boolean;
    isRestartButton(position: Vec3): boolean;
    upgradeAt(position: Vec3): UpgradeType | null;
}

export class GameView implements GameHitAreas {
    readonly root: Node;
    private readonly graphics: Graphics;
    private readonly labels: Record<string, Label> = {};
    private readonly floorYs: number[] = [];
    private floorHitHalfHeight = 52;
    private cabinY = 0;
    private menuOpen = false;
    private interactionMessage = '';
    private towerScrollOffset = 0;
    private deliveryFeedback: (PassengerDeliveredEvent & { startedAt: number }) | null = null;

    constructor(parent: Node, events: EventBus) {
        this.root = new Node('GameView');
        this.root.layer = Layers.Enum.UI_2D;
        parent.addChild(this.root);
        this.root.addComponent(UITransform).setContentSize(720, 1280);

        const backgroundNode = new Node('OfficeBackground');
        backgroundNode.layer = Layers.Enum.UI_2D;
        this.root.addChild(backgroundNode);
        backgroundNode.addComponent(UITransform).setContentSize(720, 1280);
        const background = backgroundNode.addComponent(Sprite);
        background.sizeMode = Sprite.SizeMode.CUSTOM;
        background.color = new Color(255, 255, 255, 48);
        resources.load('art/backgrounds/office-main/spriteFrame', SpriteFrame, (error, spriteFrame) => {
            if (!error && spriteFrame) {
                background.spriteFrame = spriteFrame;
            }
        });

        const drawingNode = new Node('GameDrawing');
        drawingNode.layer = Layers.Enum.UI_2D;
        this.root.addChild(drawingNode);
        drawingNode.addComponent(UITransform).setContentSize(720, 1280);
        this.graphics = drawingNode.addComponent(Graphics);
        this.createLabels();
        events.on<PassengerDeliveredEvent>('passenger-delivered', (event) => {
            this.deliveryFeedback = { ...event, startedAt: Date.now() };
        });
    }

    toLocalPosition(uiX: number, uiY: number): Vec3 {
        return new Vec3(uiX - 360, uiY - 640, 0);
    }

    render(model: GameModel): void {
        this.graphics.clear();
        this.hidePassengerDestinationLabels();
        this.hideDynamicTowerLabels();
        this.drawBackground();
        this.drawTower(model);
        this.drawDeliveryFeedback(model);
        this.drawTowerViewportMasks();
        this.drawHeader(model);
        this.drawBuildButton(model);
        if (this.menuOpen) {
            this.drawMenu(model);
        } else {
            this.setMenuLabelsActive(false);
        }
        if (model.progress.completed) {
            this.drawCompletion(model);
        } else {
            this.labels.complete.node.active = false;
            this.setUpgradeLabelsActive(false);
        }
        if (model.progress.failed) {
            this.drawFailure(model);
        } else {
            this.labels.failure.node.active = false;
            this.labels.restart.node.active = false;
        }
    }

    floorAt(position: Vec3): number | null {
        if (!this.isTowerViewport(position)) {
            return null;
        }
        for (let floor = 0; floor < this.floorYs.length; floor += 1) {
            if (
                Math.abs(position.y - this.floorYs[floor]) <= this.floorHitHalfHeight
                && position.x > -340
                && position.x < 340
            ) {
                return floor;
            }
        }
        return null;
    }

    isCabin(position: Vec3): boolean {
        return this.isTowerViewport(position)
            && position.x > 195
            && position.x < 340
            && Math.abs(position.y - this.cabinY) < 82;
    }

    isTowerViewport(position: Vec3): boolean {
        return position.x > -340 && position.x < 340 && position.y > TOWER_BOTTOM && position.y < TOWER_TOP;
    }

    scrollTowerBy(deltaY: number, floorCount: number): void {
        const naturalTop = FLOOR_BASE_Y + Math.max(0, floorCount - 1) * FLOOR_GAP;
        const minOffset = Math.min(0, TOWER_TOP - 80 - naturalTop);
        this.towerScrollOffset = Math.max(minOffset, Math.min(0, this.towerScrollOffset + deltaY));
    }

    resetTowerScroll(): void {
        this.towerScrollOffset = 0;
    }

    isBuildButton(position: Vec3): boolean {
        return position.x > -320 && position.x < -220 && position.y > -540 && position.y < -430;
    }

    isMenuButton(position: Vec3): boolean {
        return position.x > 230 && position.x < 330 && position.y > 500 && position.y < 590;
    }

    isRestartButton(position: Vec3): boolean {
        return position.x > -125 && position.x < 125 && position.y > -145 && position.y < -65;
    }

    upgradeAt(position: Vec3): UpgradeType | null {
        if (position.y < -75 || position.y > 35) {
            return null;
        }
        if (position.x > -290 && position.x < -100) {
            return UpgradeType.Capacity;
        }
        if (position.x > -95 && position.x < 95) {
            return UpgradeType.Speed;
        }
        if (position.x > 100 && position.x < 290) {
            return UpgradeType.Patience;
        }
        return null;
    }

    toggleMenu(): void {
        this.menuOpen = !this.menuOpen;
    }

    get isMenuOpen(): boolean {
        return this.menuOpen;
    }

    setInteractionMessage(message: string): void {
        this.interactionMessage = message;
    }

    private createLabels(): void {
        this.labels.time = this.createLabel('Time', 64, 180, new Vec3(-310, 555));
        this.labels.day = this.createLabel('Day', 22, 260, new Vec3(-310, 485));
        this.labels.stats = this.createLabel('Stats', 22, 290, new Vec3(80, 485));
        this.labels.floorHint = this.createLabel('Hint', 18, 260, new Vec3(-250, -390));
        this.labels.build = this.createLabel('Build', 20, 90, new Vec3(-312, -505));
        this.labels.build.node.getComponent(UITransform)?.setContentSize(92, 96);
        this.labels.build.horizontalAlign = Label.HorizontalAlign.CENTER;
        this.labels.menu = this.createLabel('Menu', 22, 96, new Vec3(240, 555));
        this.labels.notice = this.createLabel('Notice', 24, 610, new Vec3(-305, 390));
        this.labels.complete = this.createLabel('Complete', 34, 540, new Vec3(-270, 30));
        this.labels.complete.node.active = false;
        this.labels.failure = this.createLabel('Failure', 34, 540, new Vec3(-270, 30));
        this.labels.failure.node.getComponent(UITransform)?.setContentSize(540, 180);
        this.labels.failure.lineHeight = 46;
        this.labels.failure.node.active = false;
        this.labels.restart = this.createLabel('Restart', 26, 250, new Vec3(-125, -105));
        this.labels.restart.node.getComponent(UITransform)?.setContentSize(250, 80);
        this.labels.restart.horizontalAlign = Label.HorizontalAlign.CENTER;
        this.labels.restart.node.active = false;
    }

    private createLabel(name: string, fontSize: number, width: number, position: Vec3): Label {
        const node = new Node(name);
        node.layer = Layers.Enum.UI_2D;
        node.setPosition(position);
        this.root.addChild(node);
        const transform = node.addComponent(UITransform);
        transform.setAnchorPoint(0, 0.5);
        transform.setContentSize(width, fontSize * 1.6);
        const label = node.addComponent(Label);
        label.fontSize = fontSize;
        label.lineHeight = fontSize * 1.25;
        label.color = INK;
        label.horizontalAlign = Label.HorizontalAlign.LEFT;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        label.overflow = Label.Overflow.SHRINK;
        return label;
    }

    private drawBackground(): void {
        this.graphics.fillColor = new Color(247, 243, 237, 248);
        this.graphics.rect(-360, 430, 720, 210);
        this.graphics.fill();
        this.graphics.fillColor = new Color(24, 26, 29, 225);
        this.graphics.rect(-360, -640, 720, 1070);
        this.graphics.fill();
    }

    private drawHeader(model: GameModel): void {
        const minutes = Math.floor(model.progress.elapsedSeconds / 60);
        const seconds = Math.floor(model.progress.elapsedSeconds % 60);
        this.labels.time.string = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        this.labels.day.string = `第${model.progress.day}天    等级${model.progress.level}`;
        this.labels.stats.string = `${model.economy.delivered}  已送达    ${model.waitingPassengers.length}  等待中`;
        this.labels.menu.string = '菜单';
        this.labels.notice.string = this.interactionMessage || (model.economy.multiplier > 1
            ? `${model.economy.multiplier}X  连续高耐心送达`
            : '点击楼层呼叫 S1，到达后点击轿厢让上班族依次进入');

        this.strokeRect(230, 520, 100, 70, INK, 2);
        this.strokeRect(-320, 450, 640, 14, INK, 2);
        this.graphics.fillColor = INK;
        const progress = Math.min(1, model.economy.delivered / model.progress.targetDeliveries);
        this.graphics.rect(-317, 453, 634 * progress, 8);
        this.graphics.fill();
    }

    private drawTower(model: GameModel): void {
        const floorCount = model.progress.unlockedFloors;
        const floorGap = FLOOR_GAP;
        const bottomY = FLOOR_BASE_Y + this.towerScrollOffset;
        const towerLeft = -340;
        const towerRight = 340;
        const s2Left = 105;
        const s1Left = 220;
        const shaftWidth = 100;
        this.floorYs.length = 0;
        this.floorHitHalfHeight = floorGap * 0.48;

        for (let floor = 0; floor < floorCount; floor += 1) {
            const y = bottomY + floor * floorGap;
            this.floorYs.push(y);
            if (y + floorGap * 0.5 < TOWER_BOTTOM || y - floorGap * 0.5 > TOWER_TOP) {
                continue;
            }
            this.graphics.fillColor = floor % 2 === 0 ? OFFICE_WALL : OFFICE_WALL_ALT;
            this.graphics.rect(towerLeft, y - floorGap * 0.48, towerRight - towerLeft, floorGap * 0.96);
            this.graphics.fill();
            if (model.warningFloors.includes(floor)) {
                const pulse = (Math.sin(model.progress.elapsedSeconds * Math.PI * 5) + 1) * 0.5;
                this.graphics.fillColor = new Color(205, 42, 47, 35 + Math.round(pulse * 95));
                this.graphics.rect(towerLeft, y - floorGap * 0.48, towerRight - towerLeft, floorGap * 0.96);
                this.graphics.fill();
            }
            this.line(towerLeft, y - floorGap * 0.48, towerRight, y - floorGap * 0.48, new Color(12, 13, 15, 255), 3);
            this.drawFloorMarker(floor, y);
            this.drawOfficeDetails(floor, y, floorGap);
            this.drawPassengers(model, floor, y);
            this.drawEmptyShaft(s2Left, y, floorGap, 'S2');
            this.drawEmptyShaft(s1Left, y, floorGap, 'S1');
        }

        const elevatorY = bottomY + model.elevator.position * floorGap;
        this.cabinY = elevatorY;
        if (elevatorY > TOWER_BOTTOM - 70 && elevatorY < TOWER_TOP + 70) {
            this.drawCabin(model, s1Left, elevatorY, shaftWidth);
        }
    }

    private drawTowerViewportMasks(): void {
        this.graphics.fillColor = new Color(24, 26, 29, 255);
        this.graphics.rect(-360, -640, 720, TOWER_BOTTOM + 640);
        this.graphics.fill();
        this.graphics.fillColor = new Color(247, 243, 237, 255);
        this.graphics.rect(-360, TOWER_TOP, 720, 640 - TOWER_TOP);
        this.graphics.fill();
        this.line(-340, TOWER_BOTTOM, 340, TOWER_BOTTOM, new Color(120, 122, 126, 180), 2);
        this.line(-340, TOWER_TOP, 340, TOWER_TOP, new Color(120, 122, 126, 180), 2);
    }

    private drawFloorMarker(floor: number, y: number): void {
        const floorLabel = String(floor).padStart(2, '0');
        const color = this.floorColor(floor);
        this.graphics.fillColor = color;
        this.graphics.rect(-340, y - 55, 76, 110);
        this.graphics.fill();
        this.drawText(`floor-${floor}`, floorLabel, -326, y + 23, 32, PAPER, 64);
        this.drawDestinationShape(floor, -302, y - 25, 15, PAPER);
    }

    private drawOfficeDetails(floor: number, y: number, floorGap: number): void {
        this.graphics.fillColor = new Color(27, 29, 31, 255);
        this.graphics.roundRect(-238, y - 34, 88, 68, 3);
        this.graphics.fill();
        this.strokeRect(-238, y - 34, 88, 68, new Color(96, 99, 103, 255), 2);
        this.line(-209, y - 31, -209, y + 31, new Color(118, 121, 125, 255), 2);

        const companyNames = ['大堂接待', '星火创意', '启明咨询', '智云数据', '未来科技', '国际会议'];
        this.graphics.fillColor = new Color(30, 31, 33, 255);
        this.graphics.roundRect(-135, y - 28, 150, 56, 3);
        this.graphics.fill();
        this.strokeRect(-135, y - 28, 150, 56, new Color(116, 118, 121, 255), 1);
        this.drawText(`company-${floor}`, companyNames[floor % companyNames.length], -112, y + 2, 17, PAPER, 120);
        this.graphics.fillColor = new Color(237, 232, 222, 90);
        this.graphics.circle(-222, y + floorGap * 0.34, 4);
        this.graphics.circle(-86, y + floorGap * 0.34, 4);
        this.graphics.fill();
    }

    private drawEmptyShaft(x: number, y: number, floorGap: number, name: string): void {
        const height = Math.min(112, floorGap * 0.72);
        this.graphics.fillColor = new Color(25, 27, 30, 255);
        this.graphics.roundRect(x, y - height * 0.5, 100, height, 5);
        this.graphics.fill();
        this.strokeRect(x, y - height * 0.5, 100, height, new Color(91, 95, 100, 255), 3);
        this.graphics.fillColor = new Color(12, 13, 15, 255);
        this.graphics.roundRect(x + 17, y + height * 0.5 - 2, 66, 24, 3);
        this.graphics.fill();
        this.drawText(`shaft-${name}-${Math.round(y)}`, name, x + 37, y + height * 0.5 + 10, 14, PAPER, 40);
        if (name === 'S2') {
            this.graphics.fillColor = new Color(12, 13, 15, 150);
            this.graphics.roundRect(x + 4, y - height * 0.5 + 4, 92, height - 8, 4);
            this.graphics.fill();
            this.drawText(`shaft-${name}-locked-${Math.round(y)}`, '未启用', x + 27, y, 13, MUTED, 54);
        }
    }

    private drawPassengers(model: GameModel, floor: number, y: number): void {
        const passengers = model.getFloorQueue(floor).slice(0, 8);
        passengers.forEach((passenger, index) => {
            // The oldest passenger is closest to the elevator on the right.
            const x = 75 - index * 40;
            const patienceRatio = passenger.patience / passenger.maxPatience;
            this.drawPassenger(passenger, x, y, patienceRatio);
        });
    }

    private drawPassenger(passenger: PassengerModel, x: number, y: number, patienceRatio: number): void {
        if (passenger.state === PassengerState.Boarding) {
            x += 34;
        }
        const clothingColor = this.floorColor(passenger.destinationFloor);
        const female = passenger.id % 2 === 0;
        this.graphics.fillColor = new Color(238, 199, 165, 255);
        this.graphics.circle(x, y + 13, 9);
        this.graphics.fill();
        this.graphics.fillColor = new Color(55, 37, 30, 255);
        this.graphics.arc(x, y + 16, 10, 0, Math.PI, false);
        this.graphics.fill();
        this.graphics.fillColor = clothingColor;
        this.graphics.roundRect(x - 10, y - 10, 20, 20, 4);
        this.graphics.fill();
        this.graphics.fillColor = INK;
        if (female) {
            this.graphics.moveTo(x - 10, y - 8);
            this.graphics.lineTo(x + 10, y - 8);
            this.graphics.lineTo(x + 13, y - 20);
            this.graphics.lineTo(x - 13, y - 20);
            this.graphics.close();
            this.graphics.fill();
        } else {
            this.graphics.rect(x - 9, y - 20, 7, 11);
            this.graphics.rect(x + 2, y - 20, 7, 11);
            this.graphics.fill();
        }

        const elapsedRatio = Math.max(0, Math.min(1, 1 - patienceRatio));
        if (elapsedRatio < 0.5) {
            return;
        }
        this.graphics.strokeColor = patienceRatio <= 0.25 ? DANGER : new Color(225, 220, 211, 170);
        this.graphics.lineWidth = 2;
        this.graphics.arc(x, y, 25, Math.PI / 2, Math.PI / 2 + Math.PI * 2 * elapsedRatio, false);
        this.graphics.stroke();
    }

    private drawCabin(model: GameModel, x: number, y: number, width: number): void {
        this.graphics.fillColor = new Color(194, 199, 203, 255);
        this.graphics.strokeColor = new Color(15, 16, 18, 255);
        this.graphics.lineWidth = 3;
        this.graphics.roundRect(x + 5, y - 50, width - 10, 100, 5);
        this.graphics.fill();
        this.graphics.stroke();
        this.graphics.fillColor = new Color(71, 75, 80, 255);
        this.graphics.rect(x + 11, y - 43, width - 22, 86);
        this.graphics.fill();
        this.line(x + width * 0.5, y - 42, x + width * 0.5, y + 42, MUTED, 2);

        const target = model.elevator.targetFloor;
        const direction = model.elevator.direction === ElevatorDirection.Up
            ? '↑'
            : model.elevator.direction === ElevatorDirection.Down
                ? '↓'
                : '';
        this.graphics.fillColor = INK;
        this.graphics.rect(x + 17, y + 54, width - 34, 25);
        this.graphics.fill();
        this.drawText('cabin-target', target === null ? 'S1' : `${direction}${target}`, x + 37, y + 66, 14, PAPER, 48);

        model.elevator.passengers.slice(0, model.elevator.capacity).forEach((id, index) => {
            const passenger = model.getPassenger(id);
            if (passenger) {
                const column = index % 3;
                const row = Math.floor(index / 3);
                this.graphics.fillColor = this.floorColor(passenger.destinationFloor);
                this.graphics.roundRect(x + 17 + column * 22, y - 7 - row * 23, 14, 18, 3);
                this.graphics.fill();
            }
        });
    }

    private drawDeliveryFeedback(model: GameModel): void {
        const feedback = this.deliveryFeedback;
        const label = this.labels.deliveryCount;
        if (!feedback || Date.now() - feedback.startedAt > 650) {
            if (label) {
                label.node.active = false;
            }
            return;
        }
        const floorY = this.floorYs[feedback.floor];
        const passenger = model.getPassenger(feedback.passengerId);
        if (
            floorY === undefined
            || floorY < TOWER_BOTTOM
            || floorY > TOWER_TOP
            || !passenger
        ) {
            if (label) {
                label.node.active = false;
            }
            return;
        }
        const progress = Math.min(1, (Date.now() - feedback.startedAt) / 650);
        this.drawPassenger(passenger, 205 - progress * 62, floorY, 1);
        this.graphics.fillColor = new Color(22, 23, 25, 230);
        this.graphics.roundRect(95, floorY + 29, 94, 34, 6);
        this.graphics.fill();
        this.drawText(
            'deliveryCount',
            `+1  ${feedback.stopDeliveredCount}`,
            111,
            floorY + 46,
            17,
            PAPER,
            68,
        );
    }

    private drawBuildButton(model: GameModel): void {
        this.graphics.fillColor = INK;
        this.graphics.rect(-320, -540, 100, 110);
        this.graphics.fill();
        this.labels.build.color = PAPER;
        this.labels.build.string = `增层\n${model.floorExtensionCost}`;
        const occupancy = model.elevatorOccupancy;
        const capacityState = model.isElevatorFull ? ' 已满' : '';
        this.labels.floorHint.string = `金币 ${model.economy.coins}    星星 ${model.economy.stars}    载客 ${occupancy}/${model.elevator.capacity}${capacityState}`;
    }

    private drawCompletion(model: GameModel): void {
        this.graphics.fillColor = new Color(247, 242, 234, 235);
        this.graphics.rect(-320, -180, 640, 360);
        this.graphics.fill();
        this.strokeRect(-320, -180, 640, 360, INK, 3);
        this.labels.complete.node.active = true;
        this.labels.complete.node.setPosition(-275, 105);
        this.labels.complete.string = `运营升级 · 选择一项`;
        this.drawUpgradeCard(-290, UpgradeType.Capacity, '扩容', `轿厢容量 +1\n当前 ${model.elevator.capacity}`);
        this.drawUpgradeCard(-95, UpgradeType.Speed, '提速', `运行速度 +15%\n等级 ${model.upgrades.speedLevel}`);
        this.drawUpgradeCard(100, UpgradeType.Patience, '安抚', `耐心上限 +4秒\n等级 ${model.upgrades.patienceLevel}`);
    }

    private drawFailure(model: GameModel): void {
        this.graphics.fillColor = new Color(24, 25, 28, 225);
        this.graphics.rect(-320, -180, 640, 360);
        this.graphics.fill();
        this.strokeRect(-320, -180, 640, 360, DANGER, 4);
        this.labels.failure.node.active = true;
        this.labels.failure.color = PAPER;
        this.labels.failure.node.setPosition(-265, 65);
        this.labels.failure.string = `本次运营失败\n有乘客等待超时离开\n已送达 ${model.economy.delivered} 人`;
        this.graphics.fillColor = PAPER;
        this.graphics.roundRect(-125, -145, 250, 80, 5);
        this.graphics.fill();
        this.labels.restart.node.active = true;
        this.labels.restart.color = INK;
        this.labels.restart.string = '重新开始';
    }

    private drawUpgradeCard(x: number, key: UpgradeType, title: string, description: string): void {
        this.strokeRect(x, -75, 190, 110, INK, 2);
        this.drawText(`upgrade-${key}-title`, title, x + 16, -5, 25, INK);
        this.drawText(`upgrade-${key}-desc`, description, x + 16, -45, 17, MUTED);
    }

    private setUpgradeLabelsActive(active: boolean): void {
        [UpgradeType.Capacity, UpgradeType.Speed, UpgradeType.Patience].forEach((key) => {
            [`upgrade-${key}-title`, `upgrade-${key}-desc`].forEach((labelKey) => {
                if (this.labels[labelKey]) {
                    this.labels[labelKey].node.active = active;
                }
            });
        });
    }

    private drawMenu(model: GameModel): void {
        this.graphics.fillColor = new Color(247, 242, 234, 245);
        this.graphics.rect(-300, -180, 600, 360);
        this.graphics.fill();
        this.strokeRect(-300, -180, 600, 360, INK, 3);
        this.drawText('menu-title', '运营菜单', -245, 105, 38, INK);
        this.drawText('menu-progress', `第 ${model.progress.day} 天 · 等级 ${model.progress.level}`, -245, 40, 24, MUTED);
        this.drawText('menu-save', '进度已自动保存', -245, -25, 24, INK);
        this.drawText('menu-close', '再次点击右上角菜单继续', -245, -105, 22, MUTED);
    }

    private setMenuLabelsActive(active: boolean): void {
        ['menu-title', 'menu-progress', 'menu-save', 'menu-close'].forEach((key) => {
            if (this.labels[key]) {
                this.labels[key].node.active = active;
            }
        });
    }

    private hidePassengerDestinationLabels(): void {
        Object.entries(this.labels).forEach(([key, label]) => {
            if (key.startsWith('passenger-destination-')) {
                label.node.active = false;
            }
        });
    }

    private hideDynamicTowerLabels(): void {
        Object.entries(this.labels).forEach(([key, label]) => {
            if (
                key.startsWith('shaft-')
                || key.startsWith('floor-')
                || key.startsWith('company-')
                || key === 'cabin-target'
                || key === 'deliveryCount'
            ) {
                label.node.active = false;
            }
        });
    }

    private floorColor(floor: number): Color {
        return [PURPLE, GOLD, GREEN, BLUE, RED, CYAN][floor % 6];
    }

    private drawDestinationShape(floor: number, x: number, y: number, radius: number, color?: Color): void {
        this.graphics.fillColor = color ?? this.floorColor(floor);
        const shape = floor % 6;
        if (shape === 0) {
            this.graphics.moveTo(x, y + radius);
            this.graphics.lineTo(x - radius, y - radius);
            this.graphics.lineTo(x + radius, y - radius);
            this.graphics.close();
        } else if (shape === 1) {
            this.graphics.moveTo(x, y + radius);
            this.graphics.lineTo(x - radius, y);
            this.graphics.lineTo(x, y - radius);
            this.graphics.lineTo(x + radius, y);
            this.graphics.close();
        } else if (shape === 2) {
            this.graphics.rect(x - radius, y - radius, radius * 2, radius * 2);
        } else if (shape === 3) {
            this.graphics.circle(x, y, radius);
        } else if (shape === 4) {
            this.graphics.roundRect(x - radius, y - radius, radius * 2, radius * 2, radius * 0.45);
        } else {
            this.graphics.moveTo(x, y + radius);
            this.graphics.lineTo(x - radius, y + radius * 0.3);
            this.graphics.lineTo(x - radius * 0.65, y - radius);
            this.graphics.lineTo(x + radius * 0.65, y - radius);
            this.graphics.lineTo(x + radius, y + radius * 0.3);
            this.graphics.close();
        }
        this.graphics.fill();
    }

    private drawText(
        key: string,
        text: string,
        x: number,
        y: number,
        size: number,
        color: Color,
        width = 220,
    ): void {
        let label = this.labels[key];
        if (!label) {
            label = this.createLabel(key, size, width, new Vec3(x, y));
            this.labels[key] = label;
        }
        label.node.active = true;
        label.color = color;
        label.string = text;
        label.node.setPosition(x, y);
    }

    private strokeRect(x: number, y: number, width: number, height: number, color: Color, lineWidth: number): void {
        this.graphics.strokeColor = color;
        this.graphics.lineWidth = lineWidth;
        this.graphics.rect(x, y, width, height);
        this.graphics.stroke();
    }

    private line(x1: number, y1: number, x2: number, y2: number, color: Color, lineWidth: number): void {
        this.graphics.strokeColor = color;
        this.graphics.lineWidth = lineWidth;
        this.graphics.moveTo(x1, y1);
        this.graphics.lineTo(x2, y2);
        this.graphics.stroke();
    }
}
