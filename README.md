# 写字楼电梯

使用 **Cocos Creator 3.8.8 + TypeScript** 开发的竖屏写字楼电梯调度经营游戏原型。

## 当前可玩内容

- 点击楼层呼叫电梯。
- 电梯到达后点击轿厢，让当前楼层乘客上车。
- 玩家点击楼层决定轿厢的下一站。
- 左侧楼层色牌代表目的地，上班族的衣服颜色代表其目标楼层。
- 乘客拥有耐心值，圆环变红后应优先处理。
- 高耐心连续送达可获得 2X / 3X 金币倍率。
- 左下角按钮可消耗金币延伸楼层。
- 达到送达目标后可选择扩容、提速或增加乘客耐心，并进入下一天。
- 每 5 秒自动保存经营进度。

## 打开方式

1. 启动 Cocos Creator 3.8.8。
2. 导入本目录 `/Users/jiangtianhong/Documents/电梯商场`。
3. 打开 `assets/scenes/main.scene`。
4. 使用浏览器预览，设计分辨率为 720 x 1280。

首次打开写字楼版本时，请等待资源管理器完成
`assets/resources/art/backgrounds/office-main.png` 的自动导入；若图片旁尚未出现
`.meta`，在 Cocos 资源管理器中右键 `assets` 并选择“刷新资源数据库”。

遇到空白场景或缓存错误时，参见
[如何打开游戏.md](如何打开游戏.md)。

微信构建已验证可生成到 `build/wechatgame`。正式发布前需要在 Cocos 构建面板替换为项目自己的微信小游戏 AppID。

## 发布原则

- 首要发布平台：微信小游戏。
- 同一 TypeScript 业务层支持 Android 与 iOS 原生构建。
- 首包只包含核心场景和代码，活动、皮肤、商城资源应放入 Asset Bundle。
- 微信 API 只允许通过 `IPlatformService` 接口进入业务层。
- 广告位 ID、云环境 ID 和支付配置必须由发布配置注入。

详细架构见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。

微信发布流程见 [docs/WECHAT_RELEASE.md](docs/WECHAT_RELEASE.md)。

第一版美术资源的可用性与拆分要求见
[docs/ART_ASSET_AUDIT.md](docs/ART_ASSET_AUDIT.md)。

演示视频与玩法说明确认后的核心规则见
[docs/GAMEPLAY_RULES.md](docs/GAMEPLAY_RULES.md)。
