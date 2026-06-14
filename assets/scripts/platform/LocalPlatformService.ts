import { CloudSavePayload, IPlatformService } from './IPlatformService';

export class LocalPlatformService implements IPlatformService {
    readonly name = 'local';

    async login(): Promise<void> {}

    async showRewardedAd(_placement: string): Promise<boolean> {
        return false;
    }

    async submitScore(_score: number): Promise<void> {}

    async saveCloud(_payload: CloudSavePayload): Promise<void> {}

    async loadCloud(): Promise<CloudSavePayload | null> {
        return null;
    }
}
