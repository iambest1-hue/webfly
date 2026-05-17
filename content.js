let sidebarBtn = null;
let sidebarIsReturn = false;

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
    backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
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
    backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
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
    handleSidebarClick();
  });

  // 全屏切换时重新挂载按钮并更新位置
  document.addEventListener('fullscreenchange', () => {
    reparentIfNeeded();
    requestAnimationFrame(updatePos);
  });

  window.addEventListener('scroll', updatePos, { passive: true });
  window.addEventListener('resize', updatePos, { passive: true });
}

function initVideoOverlays() {
  document.querySelectorAll('video').forEach(createVideoOverlay);
  new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeName === 'VIDEO') createVideoOverlay(node);
        if (node.querySelectorAll) node.querySelectorAll('video').forEach(createVideoOverlay);
      }
    }
  }).observe(document.body, { childList: true, subtree: true });
}

// ===== 初始化 =====
sidebarBtn = createSidebarButton();
initVideoOverlays();
chrome.runtime.sendMessage({ action: 'checkDetachState' }, (resp) => {
  if (resp && resp.isDetached) setSidebarReturnMode();
});

