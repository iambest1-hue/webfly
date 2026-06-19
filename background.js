chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'detachTab') {
    detachToOtherScreen(sender.tab.id, sender.tab.windowId, message.fullscreen);
    sendResponse({ ok: true });
    return true;
  }
  if (message.action === 'returnTab') {
    // 异步执行，不阻塞响应
    returnToOriginAndClose(sender.tab.id, sender.tab.windowId);
    sendResponse({ ok: true });
    return true;
  }
  if (message.action === 'checkDetachState') {
    const key = 'detach_' + sender.tab.id;
    chrome.storage.session.get(key, (result) => {
      sendResponse({ isDetached: !!result[key] });
    });
    return true; // 异步响应
  }
});

async function detachToOtherScreen(tabId, sourceWinId, fullscreen = false) {
  // 1. 保存 tab 信息（用于重建兜底）
  const tab = await chrome.tabs.get(tabId);
  const store = { originWinId: sourceWinId, url: tab.url || '', pinned: tab.pinned, index: tab.index };
  await chrome.storage.session.set({ ['detach_' + tabId]: store });

  // 2. 获取目标屏幕坐标
  const displays = await chrome.system.display.getInfo();
  const sourceWin = await chrome.windows.get(sourceWinId);
  const sourceDisplay = findDisplayByWindow(displays, sourceWin);
  const targetDisplay = displays.find(d => d.id !== sourceDisplay.id) || sourceDisplay;
  const { left, top, width, height } = targetDisplay.workArea;

  // 3. 创建新窗口 + 移入标签页，然后全屏/最大化
  try {
    const win = await chrome.windows.create({
      tabId: tabId,
      type: 'normal',
      left, top,
      focused: true,
    });
    // 等待窗口就绪后再设置 state，提高兼容性
    await new Promise(r => setTimeout(r, 150));
    await chrome.windows.update(win.id, { state: fullscreen ? 'fullscreen' : 'maximized' });
  } catch (e) {
    console.warn('detachToOtherScreen error:', e);
  }
}

async function returnToOriginAndClose(tabId, currentWinId) {
  const key = 'detach_' + tabId;
  const result = await chrome.storage.session.get(key);
  const info = result[key];
  if (!info) return;
  await chrome.storage.session.remove(key);

  // 将标签页移回原窗口
  try {
    await chrome.windows.get(info.originWinId);
    // 退出全屏后再移动标签页
    try { await chrome.windows.update(currentWinId, { state: 'normal' }); } catch (e) {}
    // 原窗口还在：把 tab 移回去
    await chrome.tabs.move(tabId, { windowId: info.originWinId, index: info.index });
    await chrome.tabs.update(tabId, { pinned: info.pinned, active: true });
    await chrome.windows.update(info.originWinId, { focused: true });
    // 关闭空的 detach 窗口
    chrome.windows.remove(currentWinId);
  } catch (e) {
    // 原窗口已关闭：创建新窗口
    chrome.windows.create({ tabId, type: 'normal', focused: true });
  }
}

function findDisplayByWindow(displays, win) {
  const cx = (win.left || 0) + (win.width || 0) / 2;
  const cy = (win.top || 0) + (win.height || 0) / 2;
  for (const d of displays) {
    if (cx >= d.workArea.left && cx <= d.workArea.left + d.workArea.width &&
        cy >= d.workArea.top && cy <= d.workArea.top + d.workArea.height) {
      return d;
    }
  }
  return displays[0];
}

// ===== 监听 tab 关闭：若是被 detach 的 tab，直接清理 =====
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const key = 'detach_' + tabId;
  const result = await chrome.storage.session.get(key);
  if (!result[key]) return;
  await chrome.storage.session.remove(key);

  // 清理视频状态
  const stateKey = 'videoState_' + tabId;
  await chrome.storage.session.remove(stateKey);
});