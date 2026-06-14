# 架构说明

## 分层

- `models/`：纯游戏状态与规则，不持有 Cocos 节点。
- `views/`：只负责节点、文本和 Graphics 绘制。
- `controllers/`：把触摸输入转换为模型操作。
- `managers/`：生命周期、存档和平台服务。
- `platform/`：微信、Android、iOS、本地预览的能力适配层。
- `bootstrap/`：场景入口和依赖组装。

## 当前成长循环

- 每天拥有独立送达目标。
- 完成目标后从容量、速度、耐心三项运营升级中选择一项。
- 升级永久写入版本化存档，下一天目标提高并保留金币与楼层。
- 该升级池后续可由远端活动配置追加限时能力。

## 后续系统接入点

| 系统 | 接入位置 |
| --- | --- |
| 微信广告 | `IPlatformService.showRewardedAd` |
| 排行榜 | `IPlatformService.submitScore` 与开放数据域 |
| 云存档 | `saveCloud` / `loadCloud` |
| 签到 | 新建 `SignInManager`，奖励写入经济模型 |
| 皮肤 | Asset Bundle + `SkinManager` |
| 活动 | 远端配置 + `ActivityManager` |
| 商城 | 商品配置、库存模型和平台支付适配 |

## 微信小游戏约束

- 禁止业务代码直接访问全局 `wx`，仅平台适配器可访问。
- 非首局必需资源使用远程 Asset Bundle。
- UI 以 720 x 1280 竖屏设计，运行时使用固定高度适配。
- 高频刷新内容使用单个 `Graphics` 批量绘制，减少节点和 DrawCall。
- 存档使用版本号，云存档合并时以 `updatedAt` 解决冲突。
- 仓库不保存正式 AppID、广告位 ID、云环境 ID 或任何平台密钥。
