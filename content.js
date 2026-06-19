let sidebarBtn = null;
let sidebarIsReturn = false;
let videoIsolateState = { active: false, video: null };

const SVG_POPUP = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M19 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h6"/></svg>`;
const SVG_RETURN = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V3m0 4h4M3 7l3-3a7 7 0 0 1 11 5M21 17v4m0-4h-4m4 0-3 3a7 7 0 0 1-11-5"/></svg>`;

// ===== 侧边常驻按钮 =====
function createSidebarButton() {
  const btn = document.createElement('div');
  btn.id = '__video_sidebar_btn';
  btn.innerHTML = SVG_POPUP;
  btn.title = '飞雷神 · 弹出窗口播放';
  Object.assign(btn.style, {
    position: 'fixed', zIndex: '2147483647', width: '40px', height: '40px',
    borderRadius: '10px', background: 'rgba(0,0,0,0.3)', color: '#fff',
    border: '2px solid rgba(255,255,255,0.12)', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'opacity 0.2s ease, transform 0.2s ease, background 0.2s',
    transform: 'scale(0.9)', boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
    right: '16px', top: '50%', marginTop: '-20px',
  });
  btn.addEventListener('mouseenter', () => { btn.style.background = 'rgba(0,0,0,0.5)'; btn.style.transform = 'scale(1)'; });
  btn.addEventListener('mouseleave', () => { btn.style.background = sidebarIsReturn ? 'rgba(220,120,40,0.35)' : 'rgba(0,0,0,0.3)'; btn.style.transform = 'scale(0.9)'; });
  btn.addEventListener('click', (e) => { e.stopPropagation(); handleSidebarClick(); });
  document.body.appendChild(btn);
  return btn;
}

function setSidebarReturnMode() {
  sidebarIsReturn = true;
  updateOverlayButtonIcons();
  if (!sidebarBtn) return;
  sidebarBtn.innerHTML = SVG_RETURN;
  sidebarBtn.title = '飞雷神 · 返回原窗口';
  sidebarBtn.style.background = 'rgba(220,120,40,0.3)';
}

function setSidebarPopupMode() {
  sidebarIsReturn = false;
  updateOverlayButtonIcons();
  exitSiteFullscreen();
  videoIsolateState = { active: false, video: null };
  if (!sidebarBtn) return;
  sidebarBtn.innerHTML = SVG_POPUP;
  sidebarBtn.title = '飞雷神 · 弹出窗口播放';
  sidebarBtn.style.background = 'rgba(0,0,0,0.3)';
}

function updateOverlayButtonIcons() {
  const icon = sidebarIsReturn ? SVG_RETURN : SVG_POPUP;
  const title = sidebarIsReturn ? '飞雷神 · 返回原窗口' : '飞雷神 · 弹出窗口播放';
  document.querySelectorAll('.__video_overlay_btn').forEach(btn => {
    btn.innerHTML = icon;
    btn.title = title;
  });
}

function handleSidebarClick() {
  if (sidebarIsReturn) {
    setSidebarPopupMode();
    chrome.runtime.sendMessage({ action: 'returnTab' });
  } else {
    setSidebarReturnMode();
    chrome.runtime.sendMessage({ action: 'detachTab' });
  }
}

// ===== 视频浮层专用：弹出视频到异屏全屏 =====
function handleVideoPopout(video) {
  videoIsolateState = { active: true, video };
  setSidebarReturnMode();
  chrome.runtime.sendMessage({ action: 'detachTab', fullscreen: true });
  // 等标签页移到新窗口 + 浏览器窗口全屏后再触发站点原生全屏
  setTimeout(() => triggerSiteFullscreen(video), 800);
}

const FS_BTN_SELECTORS = [
  '.bpx-player-ctrl-full',              // B站 bpx 播放器
  '.bilibili-player-video-btn-fullscreen',
  '.ytp-fullscreen-button',             // YouTube
  '.vjs-fullscreen-control',            // video.js
  '.dplayer-full-icon',                 // DPlayer
  'button[aria-label*="全屏"]',
  'button[aria-label*="Full screen"]',
  'button[aria-label*="Fullscreen"]',
  'button[title*="全屏"]',
  'button[title*="Full screen"]',
];

function triggerSiteFullscreen(video) {
  // 找播放器根容器（video + 弹幕 + 控件的共同祖先）
  let container = video;
  for (let i = 0; i < 6; i++) {
    if (!container.parentElement || container.parentElement === document.body) break;
    container = container.parentElement;
  }

  // 在容器内查找站点的全屏按钮
  for (const sel of FS_BTN_SELECTORS) {
    try {
      const btn = container.querySelector(sel);
      if (btn) {
        btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        return;
      }
    } catch (e) { /* 选择器不合法，跳过 */ }
  }

  // 找不到按钮时 fallback：Fullscreen API 全屏
  try { container.requestFullscreen(); } catch (e) {
    try { video.requestFullscreen(); } catch (e2) {}
  }
}

function exitSiteFullscreen() {
  // 双保险退出全屏
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  // 尝试再次点击全屏按钮 toggle 退出（用于纯 CSS 全屏）
  const video = videoIsolateState.video;
  if (video) {
    let container = video;
    for (let i = 0; i < 6; i++) {
      if (!container.parentElement || container.parentElement === document.body) break;
      container = container.parentElement;
    }
    for (const sel of FS_BTN_SELECTORS) {
      try {
        const btn = container.querySelector(sel);
        if (btn) { btn.dispatchEvent(new MouseEvent('click', { bubbles: true })); return; }
      } catch (e) {}
    }
  }
}

// ===== 视频浮层按钮（右 1/5 区域悬停浮现） =====
function createVideoOverlay(video) {
  if (video._hasOverlay) return;
  video._hasOverlay = true;

  const btn = document.createElement('div');
  btn.className = '__video_overlay_btn';
  btn.innerHTML = SVG_POPUP;
  btn.title = '飞雷神 · 弹出窗口播放';
  Object.assign(btn.style, {
    position: 'fixed', zIndex: '2147483647', width: '36px', height: '36px',
    borderRadius: '8px', background: 'rgba(0,0,0,0.35)', color: '#fff',
    border: '2px solid rgba(255,255,255,0.12)', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'opacity 0.15s ease, transform 0.15s ease',
    opacity: '0', pointerEvents: 'none', transform: 'scale(0.85)',
    boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
  });
  document.body.appendChild(btn);

  function updatePos() {
    const rect = video.getBoundingClientRect();
    if (rect.width < 50 || rect.height < 50) return;
    btn.style.top = (rect.top + rect.height / 2 - 18) + 'px';
    btn.style.left = (rect.right - 44) + 'px';
  }

  // 全屏时将按钮移入全屏元素，退出时移回 body
  function reparentIfNeeded() {
    const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
    if (fsEl && fsEl.contains(video)) {
      if (btn.parentNode !== fsEl) fsEl.appendChild(btn);
    } else {
      if (btn.parentNode !== document.body) document.body.appendChild(btn);
    }
  }

  let visible = false;
  let rafId = null;
  let hideTimer = null;

  video.addEventListener('mousemove', (e) => {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      rafId = null;
      const rect = video.getBoundingClientRect();
      if (rect.width < 50) return;
      const relX = e.clientX - rect.left;
      if (relX > rect.width * 0.8) {
        if (!visible) { visible = true; updatePos(); btn.style.opacity = '1'; btn.style.pointerEvents = 'auto'; btn.style.transform = 'scale(1)'; }
      } else {
        if (visible) { visible = false; btn.style.opacity = '0'; btn.style.pointerEvents = 'none'; btn.style.transform = 'scale(0.85)'; }
      }
    });
  });

  video.addEventListener('mouseleave', () => {
    if (rafId) cancelAnimationFrame(rafId);
    if (visible) {
      hideTimer = setTimeout(() => {
        if (visible) { visible = false; btn.style.opacity = '0'; btn.style.pointerEvents = 'none'; btn.style.transform = 'scale(0.85)'; }
      }, 200);
    }
  });

  btn.addEventListener('mouseenter', () => {
    if (hideTimer) clearTimeout(hideTimer);
    if (!visible) {
      visible = true;
      updatePos();
      btn.style.opacity = '1';
      btn.style.pointerEvents = 'auto';
      btn.style.transform = 'scale(1)';
    }
  });

  btn.addEventListener('mouseleave', () => {
    if (visible) {
      visible = false;
      btn.style.opacity = '0';
      btn.style.pointerEvents = 'none';
      btn.style.transform = 'scale(0.85)';
    }
  });

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (sidebarIsReturn) {
      handleSidebarClick();
    } else {
      handleVideoPopout(video);
    }
  });

  // 全屏切换时重新挂载按钮并更新位置
  document.addEventListener('fullscreenchange', () => {
    reparentIfNeeded();
    requestAnimationFrame(updatePos);
  });

  let posRafId = null;
  function throttledUpdatePos() {
    if (!posRafId) {
      posRafId = requestAnimationFrame(() => { posRafId = null; updatePos(); });
    }
  }
  window.addEventListener('scroll', throttledUpdatePos, { passive: true });
  window.addEventListener('resize', throttledUpdatePos, { passive: true });
}

function initVideoOverlays() {
  document.querySelectorAll('video').forEach(createVideoOverlay);
  let moRafId = null;
  const pendingNodes = [];
  new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.nodeName === 'VIDEO') { createVideoOverlay(node); continue; }
        if (node.children && node.children.length > 0) pendingNodes.push(node);
      }
    }
    if (pendingNodes.length && !moRafId) {
      moRafId = requestAnimationFrame(() => {
        moRafId = null;
        const nodes = pendingNodes.splice(0);
        for (const node of nodes) {
          if (node.isConnected) node.querySelectorAll('video').forEach(createVideoOverlay);
        }
      });
    }
  }).observe(document.body, { childList: true, subtree: true });
}

// ===== 初始化 =====
sidebarBtn = createSidebarButton();
initVideoOverlays();
chrome.runtime.sendMessage({ action: 'checkDetachState' }, (resp) => {
  if (resp && resp.isDetached) setSidebarReturnMode();
});

