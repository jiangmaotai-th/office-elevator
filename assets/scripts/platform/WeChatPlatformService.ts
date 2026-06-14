import { CloudSavePayload, IPlatformService } from './IPlatformService';

declare const wx: {
    login(options: { success: () => void; fail: () => void }): void;
    setUserCloudStorage(options: {
        KVDataList: Array<{ key: string; value: string }>;
        success?: () => void;
        fail?: () => void;
    }): void;
};

export class WeChatPlatformService implements IPlatformService {
    readonly name = 'wechat';

    login(): Promise<void> {
        return new Promise((resolve, reject) => {
            wx.login({ success: resolve, fail: reject });
        });
    }

    async showRewardedAd(_placement: string): Promise<boolean> {
        // Ad unit IDs are injected by release configuration, never hard-coded here.
        return false;
    }

    submitScore(score: number): Promise<void> {
        return new Promise((resolve, reject) => {
            wx.setUserCloudStorage({
                KVDataList: [{ key: 'best_deliveries', value: String(score) }],
                success: resolve,
                fail: reject,
            });
        });
    }

    async saveCloud(_payload: CloudSavePayload): Promise<void> {
        // Reserved for WeChat Cloud Development or the project's own backend.
    }

    async loadCloud(): Promise<CloudSavePayload | null> {
        return null;
    }
}
