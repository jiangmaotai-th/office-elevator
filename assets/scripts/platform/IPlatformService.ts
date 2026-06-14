export interface CloudSavePayload {
    updatedAt: number;
    data: string;
}

export interface IPlatformService {
    readonly name: string;
    login(): Promise<void>;
    showRewardedAd(placement: string): Promise<boolean>;
    submitScore(score: number): Promise<void>;
    saveCloud(payload: CloudSavePayload): Promise<void>;
    loadCloud(): Promise<CloudSavePayload | null>;
}
