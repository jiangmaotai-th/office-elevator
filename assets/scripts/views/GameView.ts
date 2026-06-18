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
    view,
} from 'cc';
import { EventBus } from '../core/EventBus';
import { GameModel } from '../models/GameModel';
import {
    ElevatorDirection,
    ElevatorModel,
    FloorType,
    LevelConfig,
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
const FLOOR_TYPE_COLORS: Record<FloorType, Color> = {
    ground: PURPLE,
    parking: CYAN,
    office: BLUE,
    restaurant: GOLD,
    rest: GREEN,
};
const FLOOR_COLORS = [
    new Color(24, 154, 181, 255),
    new Color(75, 124, 214, 255),
    new Color(106, 49, 164, 255),
    new Color(240, 151, 0, 255),
    new Color(123, 181, 14, 255),
    new Color(27, 105, 198, 255),
    new Color(205, 42, 47, 255),
    new Color(231, 92, 137, 255),
    new Color(64, 131, 102, 255),
    new Color(224, 104, 50, 255),
    new Color(80, 82, 190, 255),
    new Color(142, 89, 42, 255),
    new Color(38, 165, 135, 255),
    new Color(84, 128, 63, 255),
    new Color(177, 74, 54, 255),
    new Color(58, 142, 196, 255),
];
const OFFICE_WALL = new Color(48, 50, 53, 245);
const OFFICE_WALL_ALT = new Color(57, 59, 62, 245);
const TOWER_BOTTOM = -425;
const TOWER_TOP = 430;
const FLOOR_GAP = 138;
const FLOOR_BASE_Y = -350;
const MIN_VISIBLE_FLOORS = 6;
const ELEVATOR_SHAFT_WIDTH = 100;
const S2_SHAFT_LEFT = 105;
const S1_SHAFT_LEFT = 220;
const ELEVATOR_SHAFTS = [
    { index: 1, name: 'S2', x: S2_SHAFT_LEFT },
    { index: 0, name: 'S1', x: S1_SHAFT_LEFT },
];
const ELEVATOR_XS = [S1_SHAFT_LEFT, S2_SHAFT_LEFT];

export interface ElevatorShaftFloorHit {
    floor: number;
    elevatorIndex: number;
}

export interface GameHitAreas {
    floorAt(position: Vec3): number | null;
    shaftFloorAt(position: Vec3, model: GameModel): ElevatorShaftFloorHit | null;
    isCabin(position: Vec3): boolean;
    isBuildButton(position: Vec3): boolean;
    isStartButton(position: Vec3): boolean;
    isMenuButton(position: Vec3): boolean;
    isRestartButton(position: Vec3): boolean;
    isNewGameButton(position: Vec3): boolean;
    chapterAt(position: Vec3, model: GameModel): number | null;
    levelAt(position: Vec3, model: GameModel): string | null;
    upgradeAt(position: Vec3): UpgradeType | null;
}

export class GameView implements GameHitAreas {
    readonly root: Node;
    private readonly graphics: Graphics;
    private readonly labels: Record<string, Label> = {};
    private readonly floorYs = new Map<number, number>();
    private readonly clickableFloorValues: number[] = [];
    private floorHitHalfHeight = 52;
    private clickableFloors = 0;
    private readonly cabinHitAreas: Array<{ index: number; x: number; y: number; width: number; height: number }> = [];
    private activeElevatorIndex = 0;
    private menuOpen = false;
    private selectedChapterIndex = 0;
    private lastSyncedLevelId = '';
    private interactionMessage = '';
    private towerScrollOffset = 0;
    private deliveryFeedback: (PassengerDeliveredEvent & { startedAt: number }) | null = null;
    private readonly queueIncreaseFeedbacks: Array<{ floor: number; count: number; startedAt: number }> = [];

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
        const visibleSize = view.getVisibleSize();
        return new Vec3(uiX - visibleSize.width * 0.5, uiY - visibleSize.height * 0.5, 0);
    }

    render(model: GameModel): void {
        this.graphics.clear();
        this.hidePassengerDestinationLabels();
        this.hideDynamicTowerLabels();
        this.drawBackground();
        this.drawTower(model);
        this.drawQueueIncreaseFeedbacks();
        this.drawDeliveryFeedback(model);
        this.drawTowerViewportMasks();
        this.drawOffscreenPassengerArrows(model);
        this.drawHeader(model);
        this.drawBuildButton(model);
        if (this.menuOpen) {
            this.drawMenu(model);
        } else {
            this.setMenuLabelsActive(false);
        }
        if (!model.progress.started && !model.progress.failed && !model.progress.completed) {
            this.drawLevelSelect(model);
            this.drawStartPrompt(model);
        } else {
            this.labels.start.node.active = false;
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
            if (!model.progress.completed) {
                this.labels.restart.node.active = false;
            }
        }
    }

    floorAt(position: Vec3): number | null {
        if (!this.isTowerViewport(position)) {
            return null;
        }
        return this.floorAtY(position);
    }

    shaftFloorAt(position: Vec3, model: GameModel): ElevatorShaftFloorHit | null {
        if (!this.isTowerViewport(position)) {
            return null;
        }
        const shaft = ELEVATOR_SHAFTS.find((slot) => {
            return position.x > slot.x && position.x < slot.x + ELEVATOR_SHAFT_WIDTH;
        });
        if (!shaft || shaft.index >= model.activeElevatorCount) {
            return null;
        }
        const floor = this.floorAtY(position);
        return floor === null ? null : { floor, elevatorIndex: shaft.index };
    }

    private floorAtY(position: Vec3): number | null {
        for (const floor of this.clickableFloorValues) {
            const floorY = this.floorYs.get(floor);
            if (floorY === undefined) {
                continue;
            }
            if (
                Math.abs(position.y - floorY) <= this.floorHitHalfHeight
            ) {
                return floor;
            }
        }
        return null;
    }

    isCabin(position: Vec3): boolean {
        return this.cabinAt(position) !== null;
    }

    cabinAt(position: Vec3): number | null {
        if (!this.isTowerViewport(position)) {
            return null;
        }
        const hit = this.cabinHitAreas.find((area) => {
            return position.x > area.x
                && position.x < area.x + area.width
                && Math.abs(position.y - area.y) < area.height * 0.5;
        });
        return hit?.index ?? null;
    }

    isTowerViewport(position: Vec3): boolean {
        return position.x > -340 && position.x < 340 && position.y > TOWER_BOTTOM && position.y < TOWER_TOP;
    }

    levelAt(position: Vec3, model: GameModel): string | null {
        if (model.progress.started || model.progress.completed || model.progress.failed) {
            return null;
        }
        this.syncSelectedChapterToCurrentLevel(model);
        const levels = this.levelsForSelectedChapter(model);
        for (let index = 0; index < levels.length; index += 1) {
            const y = 245 - index * 44;
            if (position.x > -310 && position.x < 310 && position.y > y - 19 && position.y < y + 19) {
                return levels[index].id;
            }
        }
        return null;
    }

    chapterAt(position: Vec3, model: GameModel): number | null {
        if (model.progress.started || model.progress.completed || model.progress.failed) {
            return null;
        }
        const chapters = this.chapterTitles(model);
        for (let index = 0; index < chapters.length; index += 1) {
            const x = -310 + index * 126;
            if (position.x > x && position.x < x + 116 && position.y > 284 && position.y < 318) {
                return index;
            }
        }
        return null;
    }

    selectChapter(index: number): void {
        this.selectedChapterIndex = Math.max(0, index);
    }

    scrollTowerBy(deltaY: number, floorCount: number): void {
        this.towerScrollOffset = this.clampTowerScroll(this.towerScrollOffset + deltaY, floorCount);
    }

    resetTowerScroll(): void {
        this.towerScrollOffset = 0;
    }

    setActiveElevator(index: number): void {
        this.activeElevatorIndex = index;
    }

    isBuildButton(position: Vec3): boolean {
        return position.x > -320 && position.x < -220 && position.y > -540 && position.y < -430;
    }

    isStartButton(position: Vec3): boolean {
        return position.x > -105 && position.x < 135 && position.y > -255 && position.y < -185;
    }

    isMenuButton(position: Vec3): boolean {
        return position.x > 230 && position.x < 330 && position.y > 500 && position.y < 590;
    }

    isRestartButton(position: Vec3): boolean {
        return position.x > -125 && position.x < 125 && position.y > -145 && position.y < -65;
    }

    isNewGameButton(position: Vec3): boolean {
        return this.menuOpen && position.x > -125 && position.x < 125 && position.y > -105 && position.y < -35;
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

    showQueueIncrease(floor: number, count: number): void {
        if (count <= 0) {
            return;
        }
        this.queueIncreaseFeedbacks.push({ floor, count, startedAt: Date.now() });
        if (this.queueIncreaseFeedbacks.length > 8) {
            this.queueIncreaseFeedbacks.shift();
        }
    }

    private createLabels(): void {
        this.labels.time = this.createLabel('Time', 52, 150, new Vec3(-310, 570));
        this.labels.day = this.createLabel('Day', 19, 260, new Vec3(-310, 508));
        this.labels.stats = this.createLabel('Stats', 20, 290, new Vec3(80, 508));
        this.labels.floorHint = this.createLabel('Hint', 18, 260, new Vec3(-250, -390));
        this.labels.scoreHud = this.createLabel('ScoreHud', 24, 170, new Vec3(-190, -503));
        this.labels.scoreBonus = this.createLabel('ScoreBonus', 24, 150, new Vec3(-30, -503));
        this.labels.scoreBonus.node.active = false;
        this.labels.build = this.createLabel('Build', 20, 90, new Vec3(-312, -505));
        this.labels.build.node.getComponent(UITransform)?.setContentSize(92, 96);
        this.labels.build.horizontalAlign = Label.HorizontalAlign.CENTER;
        this.labels.menu = this.createLabel('Menu', 20, 96, new Vec3(240, 570));
        this.labels.notice = this.createLabel('Notice', 20, 610, new Vec3(-305, 455));
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
        this.labels.start = this.createLabel('Start', 26, 240, new Vec3(-100, -520));
        this.labels.start.node.getComponent(UITransform)?.setContentSize(240, 80);
        this.labels.start.horizontalAlign = Label.HorizontalAlign.CENTER;
        this.labels.start.node.active = false;
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
        this.labels.time.string = this.formatGameTime(model.progress.gameTime);
        this.labels.day.string = `第${model.progress.day}天    等级${model.progress.level}`;
        this.labels.stats.string = `${model.economy.delivered}  已送达    ${model.waitingPassengers.length}  等待中`;
        this.labels.menu.string = '菜单';
        this.labels.notice.string = this.interactionMessage || (!model.progress.started
            ? '阅读教学说明，点确定开始后乘客才会出现'
            : '少绕路、少中停、高耐心送达，单个乘客评分会更高');
        this.drawRushWarnings(model);

        this.strokeRect(230, 520, 100, 70, INK, 2);
        this.strokeRect(-320, 450, 640, 14, INK, 2);
        this.graphics.fillColor = INK;
        const progress = Math.min(1, model.economy.delivered / model.progress.targetDeliveries);
        this.graphics.rect(-317, 453, 634 * progress, 8);
        this.graphics.fill();
    }

    private drawRushWarnings(model: GameModel): void {
        const warnings = model.getUpcomingRushEvents(2);
        warnings.forEach((warning, index) => {
            const y = 560 - index * 34;
            const x = -65;
            const fromColor = FLOOR_TYPE_COLORS[warning.fromType];
            const toColor = FLOOR_TYPE_COLORS[warning.toType];
            this.graphics.fillColor = fromColor;
            this.graphics.circle(x, y, 8);
            this.graphics.fill();
            this.graphics.fillColor = toColor;
            this.graphics.rect(x + 38, y - 8, 16, 16);
            this.graphics.fill();
            this.drawText(
                `rush-warning-${index}`,
                `${this.formatRushCountdown(warning.remainingMinutes)}  ${this.floorTypeLabel(warning.fromType)} → ${this.floorTypeLabel(warning.toType)}`,
                x + 66,
                y,
                17,
                INK,
                250,
            );
        });
    }

    private drawTower(model: GameModel): void {
        const floors = model.getRenderableFloors();
        const floorCount = Math.max(MIN_VISIBLE_FLOORS, floors.length);
        const floorGap = FLOOR_GAP;
        const bottomY = FLOOR_BASE_Y + this.towerScrollOffset;
        const towerLeft = -340;
        const towerRight = 340;
        this.clickableFloors = model.progress.unlockedFloors;
        this.floorYs.clear();
        this.clickableFloorValues.length = 0;
        this.cabinHitAreas.length = 0;
        this.floorHitHalfHeight = floorGap * 0.48;

        for (let index = 0; index < floorCount; index += 1) {
            const floor = floors[index] ?? (model.minFloor + index);
            const y = bottomY + index * floorGap;
            const unlocked = model.isFloorUnlocked(floor);
            this.floorYs.set(floor, y);
            if (unlocked) {
                this.clickableFloorValues.push(floor);
            }
            if (y + floorGap * 0.5 < TOWER_BOTTOM || y - floorGap * 0.5 > TOWER_TOP) {
                continue;
            }
            this.graphics.fillColor = index % 2 === 0 ? OFFICE_WALL : OFFICE_WALL_ALT;
            this.graphics.rect(towerLeft, y - floorGap * 0.48, towerRight - towerLeft, floorGap * 0.96);
            this.graphics.fill();
            if (model.warningFloors.includes(floor)) {
                const pulse = (Math.sin(model.progress.elapsedSeconds * Math.PI * 5) + 1) * 0.5;
                this.graphics.fillColor = new Color(205, 42, 47, 35 + Math.round(pulse * 95));
                this.graphics.rect(towerLeft, y - floorGap * 0.48, towerRight - towerLeft, floorGap * 0.96);
                this.graphics.fill();
            }
            this.line(towerLeft, y - floorGap * 0.48, towerRight, y - floorGap * 0.48, new Color(12, 13, 15, 255), 3);
            this.drawFloorMarker(model, floor, y, unlocked);
            this.drawOfficeDetails(model, floor, y, floorGap, unlocked);
            if (unlocked) {
                this.drawPassengers(model, floor, y);
            }
            ELEVATOR_SHAFTS.forEach((slot) => {
                const elevator = model.elevators[slot.index];
                if (slot.index < model.activeElevatorCount && this.elevatorServesFloor(elevator, floor)) {
                    this.drawEmptyShaft(slot.x, y, floorGap, slot.name);
                } else if (slot.index < model.activeElevatorCount && this.isBelowElevatorService(elevator, floor)) {
                    this.drawFoundation(slot.x, y, floorGap);
                }
            });
        }

        model.elevators.slice(0, model.activeElevatorCount).forEach((elevator, index) => {
            const elevatorY = bottomY + (elevator.position - model.minFloor) * floorGap;
            if (elevatorY > TOWER_BOTTOM - 70 && elevatorY < TOWER_TOP + 70) {
                this.drawCabin(model, elevator, index, ELEVATOR_XS[index], elevatorY, ELEVATOR_SHAFT_WIDTH);
            }
        });
    }

    private clampTowerScroll(offset: number, floorCount: number): number {
        const visibleFloors = Math.max(MIN_VISIBLE_FLOORS, floorCount);
        const naturalTop = FLOOR_BASE_Y + Math.max(0, visibleFloors - 1) * FLOOR_GAP;
        const minOffset = Math.min(0, TOWER_TOP - FLOOR_GAP * 0.55 - naturalTop);
        return Math.max(minOffset, Math.min(0, offset));
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

    private drawOffscreenPassengerArrows(model: GameModel): void {
        if (!model.progress.started || model.progress.completed || model.progress.failed) {
            return;
        }
        let hasAbove = false;
        let hasBelow = false;
        const waitingFloors = new Set(model.waitingPassengers.map((passenger) => passenger.originFloor));
        waitingFloors.forEach((floor) => {
            const y = this.floorYs.get(floor);
            if (y === undefined) {
                return;
            }
            if (y > TOWER_TOP) {
                hasAbove = true;
            } else if (y < TOWER_BOTTOM) {
                hasBelow = true;
            }
        });
        const pulse = (Math.sin(model.progress.elapsedSeconds * Math.PI * 4) + 1) * 0.5;
        const color = new Color(247, 243, 237, 150 + Math.round(pulse * 105));
        if (hasAbove) {
            this.drawOffscreenArrow(0, TOWER_TOP - 32, true, color);
        }
        if (hasBelow) {
            this.drawOffscreenArrow(0, TOWER_BOTTOM + 32, false, color);
        }
    }

    private drawOffscreenArrow(x: number, y: number, up: boolean, color: Color): void {
        this.graphics.fillColor = new Color(20, 21, 24, color.a);
        this.graphics.roundRect(x - 54, y - 23, 108, 46, 23);
        this.graphics.fill();
        this.graphics.fillColor = color;
        if (up) {
            this.graphics.moveTo(x, y + 15);
            this.graphics.lineTo(x - 20, y - 9);
            this.graphics.lineTo(x - 8, y - 9);
            this.graphics.lineTo(x - 8, y - 17);
            this.graphics.lineTo(x + 8, y - 17);
            this.graphics.lineTo(x + 8, y - 9);
            this.graphics.lineTo(x + 20, y - 9);
        } else {
            this.graphics.moveTo(x, y - 15);
            this.graphics.lineTo(x - 20, y + 9);
            this.graphics.lineTo(x - 8, y + 9);
            this.graphics.lineTo(x - 8, y + 17);
            this.graphics.lineTo(x + 8, y + 17);
            this.graphics.lineTo(x + 8, y + 9);
            this.graphics.lineTo(x + 20, y + 9);
        }
        this.graphics.close();
        this.graphics.fill();
    }

    private drawFloorMarker(model: GameModel, floor: number, y: number, unlocked: boolean): void {
        const floorLabel = this.formatFloorLabel(floor);
        const color = this.floorColor(model, floor);
        this.graphics.fillColor = unlocked ? color : new Color(76, 78, 82, 210);
        this.graphics.rect(-340, y - 55, 76, 110);
        this.graphics.fill();
        this.drawText(`floor-${floor}`, floorLabel, -326, y + 23, 32, unlocked ? PAPER : MUTED, 64);
    }

    private drawOfficeDetails(model: GameModel, floor: number, y: number, floorGap: number, unlocked: boolean): void {
        this.graphics.fillColor = new Color(27, 29, 31, 255);
        this.graphics.roundRect(-238, y - 34, 88, 68, 3);
        this.graphics.fill();
        this.strokeRect(-238, y - 34, 88, 68, new Color(96, 99, 103, 255), 2);
        this.line(-209, y - 31, -209, y + 31, new Color(118, 121, 125, 255), 2);

        const companyNames = ['星火创意', '启明咨询', '智云数据', '未来科技', '国际会议', '云帆金融'];
        const typeNames: Record<FloorType, string> = {
            ground: '大堂接待',
            parking: '地下停车',
            restaurant: '员工餐厅',
            rest: '空中休息',
            office: companyNames[Math.abs(floor) % companyNames.length],
        };
        this.graphics.fillColor = new Color(30, 31, 33, 255);
        this.graphics.roundRect(-135, y - 28, 150, 56, 3);
        this.graphics.fill();
        this.strokeRect(-135, y - 28, 150, 56, new Color(116, 118, 121, 255), 1);
        this.drawText(
            `company-${floor}`,
            unlocked ? typeNames[model.getFloorType(floor)] : '待招商楼层',
            -112,
            y + 2,
            17,
            unlocked ? PAPER : MUTED,
            120,
        );
        this.graphics.fillColor = new Color(237, 232, 222, 90);
        this.graphics.circle(-222, y + floorGap * 0.34, 4);
        this.graphics.circle(-86, y + floorGap * 0.34, 4);
        this.graphics.fill();
    }

    private elevatorServesFloor(elevator: ElevatorModel | undefined, floor: number): boolean {
        if (!elevator) {
            return false;
        }
        if (elevator.serviceMinFloor === undefined || elevator.serviceMaxFloor === undefined) {
            return true;
        }
        return floor >= elevator.serviceMinFloor && floor <= elevator.serviceMaxFloor;
    }

    private isBelowElevatorService(elevator: ElevatorModel | undefined, floor: number): boolean {
        if (!elevator || elevator.serviceMinFloor === undefined) {
            return false;
        }
        return floor < elevator.serviceMinFloor;
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
    }

    private drawFoundation(x: number, y: number, floorGap: number): void {
        const height = Math.min(112, floorGap * 0.72);
        this.graphics.fillColor = new Color(31, 32, 34, 255);
        this.graphics.roundRect(x, y - height * 0.5, 100, height, 4);
        this.graphics.fill();
        this.strokeRect(x, y - height * 0.5, 100, height, new Color(72, 74, 78, 255), 2);
        this.graphics.fillColor = new Color(88, 90, 94, 125);
        for (let stripe = -36; stripe <= 58; stripe += 18) {
            this.line(x + stripe, y - height * 0.5 + 6, x + stripe + 42, y + height * 0.5 - 6, new Color(92, 94, 99, 165), 3);
        }
        this.graphics.fillColor = new Color(16, 17, 19, 170);
        this.graphics.roundRect(x + 12, y - 18, 76, 36, 4);
        this.graphics.fill();
        this.drawText(`foundation-${Math.round(x)}-${Math.round(y)}`, '地基', x + 35, y, 14, MUTED, 42);
    }

    private drawPassengers(model: GameModel, floor: number, y: number): void {
        const passengers = model.getFloorLine(floor).slice(0, 8);
        passengers.forEach((passenger, index) => {
            // The oldest passenger is closest to the elevator on the right.
            const x = 75 - index * 40;
            this.drawPassenger(
                model,
                passenger,
                this.getPassengerX(model, passenger, x),
                y,
                model.getPassengerWaitProgress(passenger),
                model.shouldShowPassengerTimer(passenger),
            );
        });
    }

    private getPassengerX(model: GameModel, passenger: PassengerModel, queueX: number): number {
        const elevatorIndex = model.getPassengerBoardingElevatorIndex(passenger);
        if (elevatorIndex === null) {
            return queueX;
        }
        const progress = model.getPassengerBoardingProgress(passenger);
        const cabinDoorX = elevatorIndex === 0 ? 230 : 115;
        return queueX + (cabinDoorX - queueX) * progress;
    }

    private drawPassenger(
        model: GameModel,
        passenger: PassengerModel,
        x: number,
        y: number,
        waitProgress: number,
        showTimer: boolean,
    ): void {
        const clothingColor = this.passengerColor(model, passenger);
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

        if (!showTimer) {
            return;
        }
        this.graphics.strokeColor = waitProgress >= 0.75 ? DANGER : new Color(225, 220, 211, 170);
        this.graphics.lineWidth = 2;
        this.graphics.arc(x, y, 25, Math.PI / 2, Math.PI / 2 + Math.PI * 2 * waitProgress, false);
        this.graphics.stroke();
    }

    private drawCabin(
        model: GameModel,
        elevator: ElevatorModel,
        elevatorIndex: number,
        x: number,
        y: number,
        width: number,
    ): void {
        this.cabinHitAreas.push({ index: elevatorIndex, x, y, width, height: 164 });
        const selected = elevatorIndex === this.activeElevatorIndex;
        if (selected) {
            this.strokeRect(x, y - 62, width, 136, GOLD, 4);
        }
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

        const target = elevator.targetFloor;
        const direction = elevator.direction === ElevatorDirection.Up
            ? '↑'
            : elevator.direction === ElevatorDirection.Down
                ? '↓'
                : '';
        this.graphics.fillColor = INK;
        this.graphics.rect(x + 17, y + 54, width - 34, 25);
        this.graphics.fill();
        this.drawText(
            `cabin-target-${elevatorIndex}`,
            target === null ? `${selected ? '●' : ''}${elevator.id}` : `${direction}${this.formatFloorLabel(target)}`,
            x + 37,
            y + 66,
            14,
            PAPER,
            48,
        );

        elevator.passengers.slice(0, elevator.capacity).forEach((id, index) => {
            const passenger = model.getPassenger(id);
            if (passenger) {
                const column = index % 3;
                const row = Math.floor(index / 3);
                const iconX = x + 17 + column * 22;
                const iconY = y - 7 - row * 23;
                this.graphics.fillColor = this.passengerColor(model, passenger);
                this.graphics.roundRect(iconX, iconY, 14, 18, 3);
                this.graphics.fill();
                if (model.shouldShowPassengerTimer(passenger)) {
                    const waitProgress = model.getPassengerWaitProgress(passenger);
                    this.graphics.strokeColor = waitProgress >= 0.75 ? DANGER : new Color(225, 220, 211, 180);
                    this.graphics.lineWidth = 2;
                    this.graphics.arc(
                        iconX + 7,
                        iconY + 9,
                        13,
                        Math.PI / 2,
                        Math.PI / 2 + Math.PI * 2 * waitProgress,
                        false,
                    );
                    this.graphics.stroke();
                }
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
            if (this.labels.deliveryMultiplier) {
                this.labels.deliveryMultiplier.node.active = false;
            }
            return;
        }
        const floorY = this.floorYs.get(feedback.floor);
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
            if (this.labels.deliveryMultiplier) {
                this.labels.deliveryMultiplier.node.active = false;
            }
            return;
        }
        const progress = Math.min(1, (Date.now() - feedback.startedAt) / 650);
        this.drawPassenger(model, passenger, 205 - progress * 62, floorY, 1, false);
        this.graphics.fillColor = new Color(22, 23, 25, 230);
        this.graphics.roundRect(95, floorY + 29, 94, 34, 6);
        this.graphics.fill();
        this.drawText(
            'deliveryCount',
            `+${feedback.scoreGain}`,
            112,
            floorY + 46,
            20,
            PAPER,
            68,
        );
        if (!model.isSystemEnabled('qualityScore')) {
            if (this.labels.deliveryMultiplier) {
                this.labels.deliveryMultiplier.node.active = false;
            }
            return;
        }
        const elevatorIndex = feedback.elevatorIndex ?? 0;
        const badgeX = elevatorIndex === 0 ? 225 : 110;
        this.graphics.fillColor = new Color(22, 23, 25, 230);
        this.graphics.roundRect(badgeX, floorY + 78, 84, 32, 6);
        this.graphics.fill();
        this.drawText(
            'deliveryMultiplier',
            feedback.qualityLabel,
            badgeX + 10,
            floorY + 94,
            17,
            this.qualityColor(feedback.scoreGain),
            64,
        );
    }

    private drawScoreBonusFeedback(model: GameModel): void {
        const label = this.labels.scoreBonus;
        const feedback = this.deliveryFeedback;
        if (!label || !feedback) {
            if (label) {
                label.node.active = false;
            }
            return;
        }
        const elapsed = Date.now() - feedback.startedAt;
        if (elapsed > 1000) {
            label.node.active = false;
            return;
        }
        const progress = Math.min(1, elapsed / 1000);
        label.node.active = true;
        label.color = this.qualityColor(feedback.scoreGain);
        label.node.setPosition(new Vec3(-30, -503 + progress * 22));
        label.string = model.isSystemEnabled('qualityScore')
            ? `+${feedback.scoreGain} ${feedback.qualityLabel}`
            : `+${feedback.scoreGain}`;
    }

    private drawBuildButton(model: GameModel): void {
        this.graphics.fillColor = INK;
        this.graphics.rect(-320, -540, 100, 110);
        this.graphics.fill();
        this.labels.build.color = PAPER;
        this.labels.build.string = `关卡\n${model.currentLevelConfig.id}`;
        const activeElevators = model.elevators.slice(0, model.activeElevatorCount);
        const occupancy = activeElevators.reduce((sum, _elevator, index) => {
            return sum + model.elevatorOccupancyAt(index);
        }, 0);
        const capacity = activeElevators.reduce((sum, elevator) => sum + elevator.capacity, 0);
        this.labels.scoreHud.color = PAPER;
        this.labels.scoreHud.string = `分数 ${model.economy.score}`;
        this.drawScoreBonusFeedback(model);
        this.labels.floorHint.string = `金币 ${model.economy.coins}    载客 ${occupancy}/${capacity}`;
    }

    private drawLevelSelect(model: GameModel): void {
        this.syncSelectedChapterToCurrentLevel(model);
        this.graphics.fillColor = new Color(24, 26, 29, 232);
        this.graphics.roundRect(-330, 45, 660, 348, 10);
        this.graphics.fill();
        this.strokeRect(-330, 45, 660, 348, new Color(247, 242, 234, 170), 2);
        this.drawText('level-select-title', '选择关卡', -300, 360, 28, PAPER, 240);
        this.drawText('level-select-desc', '每章 6 关，从简单机制到小考逐步升级。', -300, 328, 18, new Color(225, 220, 211, 230), 600);
        this.drawChapterTabs(model);
        const levels = this.levelsForSelectedChapter(model);
        levels.forEach((level, index) => {
            const y = 245 - index * 44;
            const selected = level.id === model.currentLevelConfig.id;
            this.graphics.fillColor = selected
                ? new Color(247, 242, 234, 238)
                : new Color(247, 242, 234, 185);
            this.graphics.roundRect(-310, y - 19, 620, 38, 7);
            this.graphics.fill();
            this.strokeRect(-310, y - 19, 620, 38, selected ? GOLD : new Color(110, 108, 102, 210), selected ? 3 : 2);
            this.drawText(`level-card-id-${level.id}`, level.id, -286, y + 6, 17, selected ? INK : MUTED, 62);
            this.drawText(`level-card-title-${level.id}`, level.title.replace(/^\d-\d\s*/, ''), -222, y + 6, 17, INK, 180);
            this.drawText(`level-card-desc-${level.id}`, level.description, -42, y + 3, 12, MUTED, 245);
            const stars = model.getLevelStars(level.id);
            this.drawText(
                `level-card-stars-${level.id}`,
                stars > 0 ? '★'.repeat(stars) : '未通关',
                210,
                y,
                15,
                stars > 0 ? GOLD : MUTED,
                90,
            );
        });
    }

    private chapterTitles(model: GameModel): string[] {
        return [...new Set(model.levelConfigs.map((level) => level.chapter))];
    }

    private levelsForSelectedChapter(model: GameModel): LevelConfig[] {
        const chapters = this.chapterTitles(model);
        const chapter = chapters[this.selectedChapterIndex] ?? chapters[0];
        return model.levelConfigs.filter((level) => level.chapter === chapter);
    }

    private syncSelectedChapterToCurrentLevel(model: GameModel): void {
        if (this.lastSyncedLevelId === model.currentLevelConfig.id) {
            return;
        }
        const chapters = this.chapterTitles(model);
        const currentIndex = chapters.indexOf(model.currentLevelConfig.chapter);
        if (currentIndex >= 0) {
            this.selectedChapterIndex = currentIndex;
            this.lastSyncedLevelId = model.currentLevelConfig.id;
        }
    }

    private drawChapterTabs(model: GameModel): void {
        const chapters = this.chapterTitles(model);
        chapters.forEach((chapter, index) => {
            const x = -310 + index * 126;
            const selected = index === this.selectedChapterIndex;
            this.graphics.fillColor = selected ? GOLD : new Color(247, 242, 234, 175);
            this.graphics.roundRect(x, 284, 116, 34, 6);
            this.graphics.fill();
            this.drawText(
                `chapter-tab-${index}`,
                chapter.replace(/^第\s*(\d)\s*章.*/, '第$1章'),
                x + 21,
                301,
                15,
                selected ? INK : MUTED,
                78,
            );
        });
    }

    private drawStartPrompt(model: GameModel): void {
        this.graphics.fillColor = new Color(12, 13, 15, 165);
        this.graphics.rect(-360, -640, 720, 1280);
        this.graphics.fill();
        this.graphics.fillColor = new Color(247, 242, 234, 246);
        this.graphics.roundRect(-310, -305, 620, 340, 12);
        this.graphics.fill();
        this.strokeRect(-310, -305, 620, 340, INK, 3);
        this.drawText('start-title', `教学说明：${model.currentLevelConfig.title}`, -275, -20, 27, INK, 540);
        this.drawText(
            'start-desc',
            `${model.currentLevelConfig.tutorialText ?? model.currentLevelConfig.description}\n\n先从少量乘客热身，随后关卡会刷出本关主题事件。\n目标：达到 ${model.progress.targetDeliveries} 分 · 电梯 ${model.activeElevatorCount} 台`,
            -275,
            -125,
            19,
            MUTED,
            540,
        );
        this.graphics.fillColor = INK;
        this.graphics.roundRect(-105, -255, 240, 70, 6);
        this.graphics.fill();
        this.labels.start.node.active = true;
        this.labels.start.color = PAPER;
        this.labels.start.node.setPosition(new Vec3(-100, -220));
        this.labels.start.string = '确定开始';
    }

    private drawQueueIncreaseFeedbacks(): void {
        const now = Date.now();
        for (let index = this.queueIncreaseFeedbacks.length - 1; index >= 0; index -= 1) {
            const feedback = this.queueIncreaseFeedbacks[index];
            const age = now - feedback.startedAt;
            if (age > 900) {
                this.queueIncreaseFeedbacks.splice(index, 1);
                continue;
            }
            const floorY = this.floorYs.get(feedback.floor);
            if (floorY === undefined || floorY < TOWER_BOTTOM || floorY > TOWER_TOP) {
                continue;
            }
            const progress = age / 900;
            const alpha = 255 - Math.round(progress * 200);
            this.drawText(
                `queue-increase-${index}`,
                `+${feedback.count}`,
                96,
                floorY + 34 + progress * 26,
                23,
                new Color(247, 243, 237, alpha),
                58,
            );
        }
    }

    private drawCompletion(model: GameModel): void {
        this.setUpgradeLabelsActive(false);
        this.graphics.fillColor = new Color(247, 242, 234, 235);
        this.graphics.rect(-320, -180, 640, 360);
        this.graphics.fill();
        this.strokeRect(-320, -180, 640, 360, INK, 3);
        const stars = model.getLevelStars(model.currentLevelConfig.id);
        this.labels.complete.node.active = true;
        this.labels.complete.node.setPosition(-255, 95);
        this.labels.complete.string = `关卡完成 · ${'★'.repeat(Math.max(1, stars))}`;
        this.drawText('settlement-level', model.currentLevelConfig.title, -235, 35, 26, INK, 470);
        this.drawText(
            'settlement-score',
            `分数 ${model.economy.score} · 送达 ${model.economy.delivered} 人 · 流失 ${model.economy.lost} 人`,
            -235,
            -18,
            21,
            MUTED,
            470,
        );
        this.graphics.fillColor = INK;
        this.graphics.roundRect(-125, -145, 250, 80, 5);
        this.graphics.fill();
        this.labels.restart.node.active = true;
        this.labels.restart.color = PAPER;
        const levelIds = model.levelConfigs.map((level) => level.id);
        const hasNextLevel = levelIds.indexOf(model.currentLevelConfig.id) >= 0
            && levelIds.indexOf(model.currentLevelConfig.id) < levelIds.length - 1;
        this.labels.restart.string = hasNextLevel ? '下一关' : '返回选关';
    }

    private drawFailure(model: GameModel): void {
        this.graphics.fillColor = new Color(24, 25, 28, 225);
        this.graphics.rect(-320, -180, 640, 360);
        this.graphics.fill();
        this.strokeRect(-320, -180, 640, 360, DANGER, 4);
        this.labels.failure.node.active = true;
        this.labels.failure.color = PAPER;
        this.labels.failure.node.setPosition(-265, 65);
        this.labels.failure.string = `本次运营失败\n有乘客等待超时离开\n分数 ${model.economy.score} · 已送达 ${model.economy.delivered} 人`;
        this.graphics.fillColor = PAPER;
        this.graphics.roundRect(-125, -145, 250, 80, 5);
        this.graphics.fill();
        this.labels.restart.node.active = true;
        this.labels.restart.color = INK;
        this.labels.restart.string = '全新开始';
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
        this.graphics.fillColor = INK;
        this.graphics.roundRect(-125, -105, 250, 70, 5);
        this.graphics.fill();
        this.drawText('menu-new-game', '全新开始', -55, -70, 24, PAPER, 120);
        this.drawText('menu-close', '再次点击右上角菜单继续', -245, -135, 20, MUTED);
    }

    private setMenuLabelsActive(active: boolean): void {
        ['menu-title', 'menu-progress', 'menu-save', 'menu-new-game', 'menu-close'].forEach((key) => {
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
                || key.startsWith('cabin-target-')
                || key.startsWith('cabin-passenger-')
                || key.startsWith('queue-increase-')
                || key.startsWith('rush-warning-')
                || key.startsWith('start-')
                || key.startsWith('level-')
                || key.startsWith('settlement-')
                || key === 'deliveryCount'
                || key === 'deliveryMultiplier'
            ) {
                label.node.active = false;
            }
        });
    }

    private qualityColor(score: number): Color {
        if (score >= 90) {
            return GOLD;
        }
        if (score >= 70) {
            return GREEN;
        }
        if (score >= 40) {
            return BLUE;
        }
        return MUTED;
    }

    private floorColor(model: GameModel, floor: number): Color {
        const index = model.getFloorColorIndex(floor);
        return FLOOR_COLORS[Math.max(0, index) % FLOOR_COLORS.length];
    }

    private passengerColor(model: GameModel, passenger: PassengerModel): Color {
        const index = passenger.destinationColorIndex ?? model.getFloorColorIndex(passenger.destinationFloor);
        return FLOOR_COLORS[Math.max(0, index) % FLOOR_COLORS.length];
    }

    private formatFloorLabel(floor: number): string {
        if (floor < 0) {
            return `B${Math.abs(floor)}`;
        }
        return floor === 0 ? 'G' : String(floor).padStart(2, '0');
    }

    private formatGameTime(gameMinutes: number): string {
        const normalized = Math.max(0, Math.floor(gameMinutes));
        const hours = Math.floor(normalized / 60) % 24;
        const minutes = normalized % 60;
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }

    private formatRushCountdown(remainingMinutes: number): string {
        const minutes = Math.ceil(Math.max(0, remainingMinutes));
        if (minutes <= 10) {
            return '即将到来';
        }
        const hours = Math.floor(minutes / 60);
        const rest = minutes % 60;
        if (hours <= 0) {
            return `${minutes}分钟后`;
        }
        if (rest === 0) {
            return `${hours}小时后`;
        }
        return `${hours}小时${rest}分后`;
    }

    private floorTypeLabel(type: FloorType): string {
        const labels: Record<FloorType, string> = {
            ground: 'G层',
            parking: '停车场',
            office: '办公层',
            restaurant: '餐厅层',
            rest: '休息层',
        };
        return labels[type];
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
