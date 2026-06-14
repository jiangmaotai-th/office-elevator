import { sys } from 'cc';
import { IPlatformService } from '../platform/IPlatformService';
import { LocalPlatformService } from '../platform/LocalPlatformService';
import { WeChatPlatformService } from '../platform/WeChatPlatformService';

export class PlatformManager {
    readonly service: IPlatformService;

    constructor() {
        this.service = sys.platform === sys.Platform.WECHAT_GAME
            ? new WeChatPlatformService()
            : new LocalPlatformService();
    }
}
