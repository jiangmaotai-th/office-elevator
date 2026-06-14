import { sys } from 'cc';
import { GameSnapshot } from '../models/GameTypes';

const SAVE_KEY = 'elevator-mall-save-v1';

export class StorageManager {
    load(): GameSnapshot | null {
        const raw = sys.localStorage.getItem(SAVE_KEY);
        if (!raw) {
            return null;
        }
        try {
            return JSON.parse(raw) as GameSnapshot;
        } catch {
            return null;
        }
    }

    save(snapshot: GameSnapshot): void {
        sys.localStorage.setItem(SAVE_KEY, JSON.stringify(snapshot));
    }

    clear(): void {
        sys.localStorage.removeItem(SAVE_KEY);
    }
}
