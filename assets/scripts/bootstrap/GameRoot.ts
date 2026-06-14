import {
    _decorator,
    Camera,
    Canvas,
    Component,
    Director,
    director,
    game,
    Layers,
    Node,
    ResolutionPolicy,
    UITransform,
    view,
} from 'cc';
import { GameController } from '../controllers/GameController';
import { AudioManager } from '../managers/AudioManager';
import { GameManager } from '../managers/GameManager';
import { GameView } from '../views/GameView';

const { ccclass } = _decorator;

@ccclass('GameRoot')
export class GameRoot extends Component {
    private controller: GameController | null = null;
    private audioManager: AudioManager | null = null;

    onLoad(): void {
        // Keep both elevator shafts visible on narrow preview windows and phones.
        view.setDesignResolutionSize(720, 1280, ResolutionPolicy.SHOW_ALL);
        game.frameRate = 60;

        const canvasNode = new Node('Canvas');
        canvasNode.layer = Layers.Enum.UI_2D;
        this.node.addChild(canvasNode);
        canvasNode.addComponent(UITransform).setContentSize(720, 1280);

        const cameraNode = new Node('UICamera');
        cameraNode.layer = Layers.Enum.UI_2D;
        cameraNode.setPosition(0, 0, 1000);
        canvasNode.addChild(cameraNode);
        const camera = cameraNode.addComponent(Camera);
        camera.projection = Camera.ProjectionType.ORTHO;
        camera.orthoHeight = 640;
        camera.visibility = Layers.Enum.UI_2D;

        const canvas = canvasNode.addComponent(Canvas);
        canvas.cameraComponent = camera;

        const manager = new GameManager();
        manager.initialize();
        this.audioManager = new AudioManager(canvasNode);
        this.audioManager.initialize(manager.events);
        const gameView = new GameView(canvasNode, manager.events);
        this.controller = new GameController(manager, gameView);
        this.controller.start();

        director.on(Director.EVENT_BEFORE_SCENE_LAUNCH, manager.saveNow, manager);
    }

    update(deltaTime: number): void {
        this.controller?.update(Math.min(deltaTime, 0.1));
    }

    onDestroy(): void {
        this.controller?.dispose();
        this.controller = null;
        this.audioManager?.dispose();
        this.audioManager = null;
    }
}
