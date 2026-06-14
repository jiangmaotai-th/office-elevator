# 微信小游戏发布

## 当前构建状态

- Cocos Creator：3.8.8
- 方向：竖屏
- 构建目录：`build/wechatgame`
- 当前正式模式构建体积：约 1.6 MB
- 引擎模块：2D、UI、Graphics、Tween、Audio 与 WebGL

## AppID

首次构建可能使用 Creator 环境中的默认测试 AppID。上传前必须在 Cocos Creator 的
`项目 > 构建发布 > 微信小游戏` 中填写项目自己的 AppID，再重新构建。

不要把测试 AppID、云环境 ID、广告位 ID 或后端密钥写入 TypeScript 源码。

## 发布前检查

1. 替换正式 AppID。
2. 在微信开发者工具中导入 `build/wechatgame`。
3. 开启真机调试，验证安全区域、触摸、前后台切换和本地存档。
4. 配置用户隐私保护指引。
5. 接入登录、广告、排行榜或云存档后，验证弱网与接口失败降级。
6. 上传体验版并检查不同尺寸的 iPhone 与 Android 设备。

## 资源策略

- 核心场景留在主包。
- 皮肤、活动、商城插画与后续高塔关卡使用 Asset Bundle。
- 远程资源配置版本号和 CDN 回退地址。
- 广告、排行榜和云存档只能通过 `IPlatformService` 进入业务层。
