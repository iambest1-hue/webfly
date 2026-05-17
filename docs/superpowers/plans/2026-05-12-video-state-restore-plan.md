# 视频弹出窗口关闭后状态保持 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**目标：** 关闭视频弹出窗口后，在原窗口重建的标签页中恢复视频的播放/暂停状态、播放位置、音量、倍速。

**架构：**
- content.js 实时监听视频事件，将状态保存到 `chrome.storage.session`
- background.js 在 `onRemoved` 中将状态从 tabId 索引转存为 URL 索引
- 新标签页加载后 content.js 读取 URL 索引的状态并应用到视频元素

**修改文件：**
- `background.js` — 新增 `getTabId` 消息处理 + `onRemoved` 中搬运视频状态
- `content.js` — 新增视频状态追踪 + 页面加载后的状态恢复

---

### Task 1: background.js — 新增 `getTabId` 消息处理

**文件：** `background.js:14-19`（在 `checkDetachState` 分支之后插入）

- [ ] **Step 1: 添加 `getTabId` 消息处理**

在 `checkDetachState` 的 `if` 块之后新增：

```javascript
  if (message.action === 'getTabId') {
    sendResponse({ tabId: sender.tab.id });
    return true;
  }
```

- [ ] **Step 2: 验证语法正确**

运行：`npx eslint background.js` 或 Node 语法检查 `node --check background.js`
预期：无报错

---

### Task 2: background.js — onRemoved 中搬运视频状态

**文件：** `background.js:88-90`（`await chrome.storage.session.remove(key);` 之后插入）

- [ ] **Step 1: 添加视频状态搬运逻辑**

在 `await chrome.storage.session.remove(key);` 之后、重建标签页之前插入：

```javascript
  // 搬运视频状态（从 tabId 索引 → URL 索引）
  const stateKey = 'videoState_' + tabId;
  const stateResult = await chrome.storage.session.get(stateKey);
  const videoState = stateResult[stateKey];
  if (videoState) {
    const restoreKey = 'videoRestore_' + encodeURIComponent(info.url);
    await chrome.storage.session.set({ [restoreKey]: videoState });
    await chrome.storage.session.remove(stateKey);
  }
```

- [ ] **Step 2: 验证语法正确**

运行：`node --check background.js`
预期：无报错

---

### Task 3: content.js — 视频状态恢复逻辑

**文件：** `content.js` — 在文件末尾追加

- [ ] **Step 1: 添加恢复逻辑**

在 `content.js` 末尾追加：

```javascript
// ===== 视频状态恢复（页面重建后） =====
(function tryRestoreVideoState() {
  const url = window.location.href;
  const restoreKey = 'videoRestore_' + encodeURIComponent(url);
  chrome.storage.session.get(restoreKey, (result) => {
    const data = result[restoreKey];
    if (!data) return;
    chrome.storage.session.remove(restoreKey);

    // 时效检查：超过 3 秒不恢复（避免恢复过期状态）
    if (Date.now() - data.timestamp > 3000) return;

    waitForVideoAndRestore(data);
  });
})();

function waitForVideoAndRestore(data) {
  function apply(video) {
    const curSrc = video.src || video.currentSrc || '';
    // 双方都有 src 但不匹配 → 跳过
    if (data.src && curSrc && curSrc !== data.src) return false;

    // 等元数据加载后设置播放位置
    const setTime = () => { video.currentTime = data.currentTime || 0; };
    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
      setTime();
    } else {
      video.addEventListener('loadedmetadata', setTime, { once: true });
    }

    video.muted = data.muted || false;
    video.volume = data.volume ?? 1;
    video.playbackRate = data.playbackRate || 1;

    if (data.paused) {
      // 原来暂停 → 确保不自动播放（重试几次对抗页面 autoplay 逻辑）
      video.pause();
      setTimeout(() => video.pause(), 100);
      setTimeout(() => video.pause(), 500);
    } else {
      // 原来播放 → 尝试恢复（可能被浏览器策略阻止）
      video.play().catch(() => {});
    }
    return true;
  }

  // 1. 检查页面上已有的 video
  for (const v of document.querySelectorAll('video')) {
    if (apply(v)) return;
  }

  // 2. MutationObserver 等待动态添加的 video
  const observer = new MutationObserver(() => {
    for (const v of document.querySelectorAll('video')) {
      if (apply(v)) { observer.disconnect(); return; }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  // 5 秒超时
  setTimeout(() => observer.disconnect(), 5000);
}
```

- [ ] **Step 2: 验证语法**

运行：`node --check content.js`
预期：无报错

---

### Task 4: content.js — 视频状态追踪逻辑

**文件：** `content.js` — 在 Task 3 代码之后继续追加

- [ ] **Step 1: 添加状态追踪逻辑**

在 `tryRestoreVideoState` 代码之后追加：

```javascript
// ===== 视频状态追踪（实时保存到 storage） =====
let trackedTabId = null;

chrome.runtime.sendMessage({ action: 'getTabId' }, (resp) => {
  if (resp && resp.tabId) trackedTabId = resp.tabId;
});

function initVideoTracking() {
  // 追踪已有的 video
  document.querySelectorAll('video').forEach(setupTracking);

  // 追踪动态添加的 video
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeName === 'VIDEO') setupTracking(node);
        if (node.querySelectorAll) node.querySelectorAll('video').forEach(setupTracking);
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

function setupTracking(video) {
  if (video._videoTracked) return;
  video._videoTracked = true;

  const save = () => {
    if (!trackedTabId) return;
    chrome.storage.session.set({
      ['videoState_' + trackedTabId]: {
        paused: video.paused,
        currentTime: video.currentTime,
        volume: video.volume,
        muted: video.muted,
        playbackRate: video.playbackRate,
        src: video.src || video.currentSrc || '',
        timestamp: Date.now(),
      },
    });
  };

  // 监听所有相关事件
  video.addEventListener('play', save);
  video.addEventListener('pause', save);
  video.addEventListener('seeked', save);
  video.addEventListener('volumechange', save);
  video.addEventListener('ratechange', save);
  // 初始保存
  save();
}

initVideoTracking();
```

- [ ] **Step 2: 验证语法**

运行：`node --check content.js`
预期：无报错

---

### Task 5: 手动测试

- [ ] **Step 1: 加载扩展并测试基本弹出流程**

1. 在 Edge 中加载解压的扩展（edge://extensions → 开发人员模式 → 加载解压缩的扩展）
2. 打开一个包含视频的页面（如 B 站、YouTube）
3. 点击侧边栏按钮 → 确认视频弹出到新窗口，继续播放
4. 暂停视频，拖动进度条到中间位置
5. **关闭弹出窗口（点 X）** → 确认原窗口重建标签页
6. 验证：视频处于暂停状态、播放位置在之前拖到的位置

- [ ] **Step 2: 测试"原播放"场景**

1. 重新弹出同一视频
2. 让视频保持播放状态
3. **关闭弹出窗口（点 X）** → 确认原窗口重建标签页
4. 验证：视频正在播放（或至少不丢失进度）

- [ ] **Step 3: 测试正常导航不受影响**

1. 打开一个未弹出过的视频页面
2. 直接刷新页面
3. 验证：视频正常表现，没有尝试恢复（没有 restore 记录）

- [ ] **Step 4: 测试点击"返回"按钮路径不受影响**

1. 弹出视频到新窗口
2. 点击侧边栏的"返回"按钮
3. 验证：标签页正常移回，视频状态保持

- [ ] **Step 5: 测试内存清理**

1. 弹出后关闭窗口
2. 刷新页面后暂停并检查控制台：`chrome.storage.session.get(null)` 中不应残留 `videoRestore_*` 或旧的 `videoState_*` 记录
