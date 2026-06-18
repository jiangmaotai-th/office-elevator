import { EventBus } from '../core/EventBus';
import { GameModel } from '../models/GameModel';
import { PlatformManager } from './PlatformManager';
import { StorageManager } from './StorageManager';

export class GameManager {
    readonly events = new EventBus();
    readonly model = new GameModel();
    readonly storage = new StorageManager();
    readonly platform = new PlatformManager();

    private saveTimer = 0;

    initialize(): void {
        this.model.restore(this.storage.load());
        void this.platform.service.login().catch(() => undefined);
    }

    update(deltaTime: number): void {
        this.model.update(deltaTime);
        this.model.drainBoardedEvents().forEach((event) => {
            this.events.emit('passenger-boarded', event);
        });
        this.model.drainDeliveredEvents().forEach((event) => {
            this.events.emit('passenger-delivered', event);
        });
        this.model.drainWarningEvents().forEach((event) => {
            this.events.emit('passenger-warning', event);
        });
        this.saveTimer += deltaTime;
        if (this.saveTimer >= 5) {
            this.saveTimer = 0;
            this.storage.save(this.model.snapshot());
        }
    }

    saveNow(): void {
        this.storage.save(this.model.snapshot());
    }

    startNewGame(): void {
        this.model.startNewGame();
        this.storage.clear();
        this.saveTimer = 0;
    }
}
