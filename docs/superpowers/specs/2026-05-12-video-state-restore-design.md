# 视频弹出窗口关闭后状态保持

## 问题

用户关掉视频弹出窗口（点 X）后，标签页被销毁并在原窗口通过 `chrome.tabs.create` 重建。重建页面后视频从头开始自动播放，丢失了原有的播放/暂停状态、播放位置、音量、倍速等信息。

## 方案

通过 content script 实时保存视频状态到 `chrome.storage.session`，在重建标签页时读取状态并恢复到视频元素上。

## 架构

```
content.js (原标签页)              background.js                  content.js (新标签页)
┌────────────────────┐     ┌─────────────────────┐     ┌─────────────────────┐
│ 监听视频事件       │     │ onRemoved 触发      │     │ 页面加载后检查      │
│ 实时保存状态到     │────→│ 读取 videoState_N   │────→│ videoRestore_url    │
│ chrome.storage     │     │ 转存为              │     │ 匹配则应用到视频    │
│ key: videoState_N  │     │ videoRestore_url     │     │ 清理 restore 记录    │
└────────────────────┘     └─────────────────────┘     └─────────────────────┘
```

## 影响范围

- `content.js` — 新增视频事件监听 + 页面加载后的状态恢复逻辑
- `background.js` — `onRemoved` 中增加状态搬运

## 详细设计

### content.js 新增：视频状态追踪

**初始化时机**：content script 注入后（`document_end`），遍历页面所有 `<video>` 元素挂载事件。

**监听事件**：

| 事件 | 对应保存字段 |
|---|---|
| `play` | `paused: false` |
| `pause` | `paused: true` |
| `seeked` | `currentTime` |
| `volumechange` | `volume`, `muted` |
| `ratechange` | `playbackRate` |
| `loadedmetadata` | `currentTime`（初始位置） |

**保存格式**：

```json
{
  "paused": true,
  "currentTime": 42.5,
  "volume": 0.8,
  "muted": false,
  "playbackRate": 1.0,
  "src": "https://example.com/video.mp4",
  "timestamp": 1747065600000
}
```

key 为 `videoState_<tabId>`。每次状态变化时更新 `timestamp`。

**需要从 background 获取 tabId**：content script 发消息给 background 询问当前 tabId（或通过 `chrome.runtime.sendMessage` 获取）。

### background.js 新增：状态搬运

在 `chrome.tabs.onRemoved` 处理函数中，读取 `detach_<tabId>` 后，再读取 `videoState_<tabId>`。若存在，则：

1. 读取 `videoState_<tabId>` 获得状态数据
2. 将状态写入 `videoRestore_<页面URL>`（URL 从 `detach_<tabId>` 中获取的 `info.url`）
3. 清理 `videoState_<tabId>`

### content.js 新增：状态恢复

新标签页加载后，content script 执行：

1. 用当前页面 URL 查 `chrome.storage.session.get('videoRestore_' + url)`
2. 若不存在 → 不处理
3. 若存在但时间戳超过 3 秒 → 清理记录，跳过（防止恢复过期状态）
4. 若存在且在 3 秒内 → 等待 `<video>` 元素出现（MutationObserver）
5. 找到视频后：
   - 检查 `video.src` 是否匹配记录中的 `src`（防止页面视频变更）
   - 不匹配 → 跳过恢复
   - 匹配 → 应用状态：
     - `video.currentTime = data.currentTime`（在 `loadedmetadata` 中设置）
     - `video.muted = data.muted`
     - `video.volume = data.volume`
     - `video.playbackRate = data.playbackRate`
     - 如原暂停 → `video.pause()` 确保不自动播放
     - 如原播放 → `video.play()`（可能被浏览器策略阻止，已知限制）
6. 清理 `videoRestore_<url>`

## 边界情况

| 场景 | 处理 |
|---|---|
| 页面无视频 | 有 restore 记录但找不到 `<video>`，清理记录 |
| 视频 src 不匹配 | 页面内容已变，跳过恢复 |
| 恢复记录过期（>3s） | 不恢复，清理过期记录 |
| 多个视频元素 | 按 src 匹配，只恢复匹配的第一个 |
| 浏览器阻止自动播放 | 停到暂停状态可靠；复原播放可能被拦截 |
| 正常导航（非重建） | 没有 restore 记录，不做任何特殊处理 |

## 安全性

- 所有数据存放在 `chrome.storage.session`（仅当前 session 可见，关闭浏览器自动清除）
- 不涉及密钥或用户敏感信息
- 仅恢复与页面 URL 精确匹配的状态
