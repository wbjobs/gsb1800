# Animation Engine Demo

多动画时间线引擎：Web Animations API + Canvas + Web Worker，目标 60fps。

## 运行

```bash
# Worker 需要 http 协议（file:// 下会被浏览器拦截，引擎会自动降级为主线程计算）
python3 -m http.server 8080
# 打开 http://localhost:8080
```

## 架构

| 模块 | 职责 |
|---|---|
| `js/easing.js` | 10 种缓动函数 |
| `js/timeline.js` | Keyframe / Track / Timeline：插值、delay/loop/yoyo、additive 并发合成 |
| `js/engine.js` | MasterClock（暂停剔除）、Scheduler（rAF 调度）、PerformanceGuard（帧预算监控 + 自适应降级）、WaapiBridge |
| `js/particle-worker.js` | Web Worker 粒子物理积分，Transferable 回传，主线程零负担 |
| `js/main.js` | Demo 编排：Canvas 渲染、WAAPI 卡片、交互、HUD |

## 验收标准对照

- **复杂编排不掉帧**：粒子物理在 Worker 中积分；主线程仅渲染。PerformanceGuard 监控帧均耗时，超 17.5ms 自动降级（减粒子 → 关辉光），恢复后自动回升。
- **暂停恢复正确**：MasterClock 暂停期间不计时，恢复后从断点继续；WAAPI 动画通过 `pause()/play()` 同步；恢复时重置 `_lastTick` 防 dt 突跳。
- **并发动画不冲突**：多 Timeline 并行由调度器统一驱动；同属性按 priority 裁决，additive 轨道增量叠加（爆发冲击波不干扰主编排）。
- **60fps**：rAF 调度 + dt 上限 100ms 防切后台跳变；HUD 实时显示 FPS。
- **异常有降级**：Worker 创建/运行失败 → 主线程积分；WAAPI 不可用 → JS 时间线驱动 DOM；单条时间线异常仅移除该条；全局 error 兜底提示。

## 交互

- 移动指针：粒子被吸引
- 点击画布：冲击波（并发 additive 动画）
- 「并发爆发」：一次叠加 5 组时间线
- 拖动进度条：seek 编排（暂停时也可预览）
