const ASSET_VERSION = '20260408i';

const FALLBACK_NAVBAR_HTML = `
<nav class="nav">
  <div class="nav-inner">
      <a href="index.html" class="nav-logo" aria-label="Wytham home">
      <span class="brand-mark" aria-hidden="true">
        <img class="brand-logo-icon brand-logo-dark" src="wytham-logo-dark-nav.png?v=20260408i" alt="" />
        <img class="brand-logo-icon brand-logo-light" src="wytham-logo-light-nav.png?v=20260408i" alt="" />
      </span>
      <span class="brand-wordmark">Wytham</span>
    </a>
    <button class="nav-menu-btn" type="button" aria-label="Open menu" aria-expanded="false" data-action="toggle-mobile-nav">
      <i class="ph ph-caret-down nav-chevron icon-candidate" data-ph-fallback="▾" aria-hidden="true"></i>
    </button>
    <div class="nav-links">
      <a href="docs.html">docs</a>
      <a href="team.html">team</a>
      <a href="updates.html">updates</a>
      <a href="contact.html">contact</a>
    </div>
    <div class="nav-actions">
      <button class="btn-theme-toggle" type="button" data-action="toggle-theme" id="themeToggle" aria-label="Toggle theme">
        <i class="ph ph-sun theme-icon icon-candidate" id="themeIcon" data-ph-fallback-dark="☀" data-ph-fallback-light="☾" aria-hidden="true"></i>
      </button>
      <a href="#" class="btn-donate" data-action="open-donate"><i class="ph-fill ph-heart btn-donate-icon icon-candidate" data-ph-fallback="💙" aria-hidden="true"></i><span class="btn-donate-label"> donate</span></a>
      <button class="btn-download nav-cta" type="button" data-action="open-download">Join the beta <i class="ph ph-arrow-right" aria-hidden="true"></i></button>
    </div>
  </div>
</nav>`;

function replaceNodeFromMarkup(target, html, selector) {
  const parsed = new DOMParser().parseFromString(String(html || ''), 'text/html');
  const replacement = selector ? parsed.querySelector(selector) : parsed.body.firstElementChild;
  if (!replacement) {
    throw new Error('Expected replacement markup was not found.');
  }
  const adoptedNode = document.importNode(replacement, true);
  target.replaceWith(adoptedNode);
  return adoptedNode;
}

// Inject shared navbar from navbar.html into all pages
document.addEventListener('DOMContentLoaded', function() {
  const navPlaceholder = document.querySelector('nav.nav');
  
  // If no placeholder exists (user removed it), we create one at the top of body
  if (!navPlaceholder) {
    const newNav = document.createElement('nav');
    newNav.className = 'nav';
    document.body.prepend(newNav);
    loadNavbar(newNav);
  } else {
    loadNavbar(navPlaceholder);
  }

  function loadNavbar(target) {
    fetch(`navbar.html?v=${ASSET_VERSION}`)
      .then(response => {
        if (!response.ok) {
          throw new Error(`Navbar request failed with ${response.status}`);
        }
        return response.text();
      })
      .then(html => {
        replaceNodeFromMarkup(target, html, '.nav');
        // After injection, highlight the active link
        highlightActiveLink();
        // Re-apply theme to ensure the new toggle button shows the correct icon
        const isLight = document.body.classList.contains('light');
        applyTheme(isLight);
        schedulePhosphorFallback(1300);
      })
      .catch(err => {
        console.error('Failed to load navbar:', err);
        replaceNodeFromMarkup(target, FALLBACK_NAVBAR_HTML, '.nav');
        highlightActiveLink();
        const isLight = document.body.classList.contains('light');
        applyTheme(isLight);
        schedulePhosphorFallback(1300);
      });
  }

  function highlightActiveLink() {
    const path = window.location.pathname;
    const page = path.split("/").pop() || 'index.html';
    
    // Select all links in the injected navbar
    const links = document.querySelectorAll('.nav-links a');
    links.forEach(link => {
      link.classList.remove('active');
      const href = link.getAttribute('href');
      // Simple match: if href matches the current page name
      if (href === page) {
        link.classList.add('active');
      } else if (page === 'index.html' && href === 'index.html') {
        link.classList.add('active');
      }
    });
  }
});

function isPhosphorReady() {
  if (!document.fonts || typeof document.fonts.check !== 'function') return false;
  return document.fonts.check('16px "Phosphor"') || document.fonts.check('16px "Phosphor Fill"');
}

function applyPhosphorFallback() {
  const iconNodes = document.querySelectorAll('.icon-candidate');
  iconNodes.forEach((node) => {
    const fallback = node.getAttribute('data-ph-fallback');
    const fallbackDark = node.getAttribute('data-ph-fallback-dark');
    const fallbackLight = node.getAttribute('data-ph-fallback-light');
    const isThemeIcon = node.id === 'themeIcon';

    node.classList.remove('ph', 'ph-fill', 'ph-caret-down', 'ph-heart', 'ph-moon', 'ph-sun');
    node.classList.add('icon-fallback');
    node.setAttribute('data-fallback-active', 'true');

    if (isThemeIcon) {
      const isLight = document.body.classList.contains('light');
      node.textContent = isLight ? (fallbackLight || '☾') : (fallbackDark || '☀');
      return;
    }

    if (fallback) {
      node.textContent = fallback;
    }
  });
}

function schedulePhosphorFallback(timeoutMs) {
  window.setTimeout(() => {
    if (isPhosphorReady()) return;
    applyPhosphorFallback();
  }, timeoutMs);
}

/**
 * semora Common Scripts
 * Handles Navbar, Theme Toggling, Modals, and Form Logic across all pages.
 */

// ── Shared UI Observers ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in-view');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
  
  document.querySelectorAll('.fade-up').forEach(el => observer.observe(el));
});


// ── Mobile Nav ──────────────────────────────────────────────────────────
function toggleMobileNav(btn) {
  const links = document.querySelector('.nav-links');
  if (!links) return;
  const button = btn || document.querySelector('.nav-menu-btn');
  if (!button) return;
  const isOpen = links.classList.toggle('mobile-open');
  button.classList.toggle('is-open', isOpen);
  button.setAttribute('aria-label', isOpen ? 'Close menu' : 'Open menu');
  button.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
}

document.addEventListener('click', function(e) {
  if (!e.target.closest('.nav-inner')) {
    const links = document.querySelector('.nav-links');
    const btn = document.querySelector('.nav-menu-btn');
    if (links) links.classList.remove('mobile-open');
    if (btn) { 
      btn.classList.remove('is-open'); 
      btn.setAttribute('aria-label', 'Open menu'); 
      btn.setAttribute('aria-expanded','false'); 
    }
  }
});

// ── Theme Toggle ────────────────────────────────────────────────────────
function applyTheme(isLight) {
  document.body.classList.toggle('light', isLight);
  document.documentElement.style.colorScheme = isLight ? 'light' : 'dark';
  
  // Update logo colors based on theme
  const logoPrimary = document.querySelectorAll('.logo-primary');
  const logoAccent = document.querySelectorAll('.logo-accent');
  
  if (isLight) {
    // Light theme: black logo
    logoPrimary.forEach(el => el.setAttribute('fill', '#181818'));
    logoAccent.forEach(el => el.setAttribute('fill', '#636363'));
  } else {
    // Dark theme: white logo
    logoPrimary.forEach(el => el.setAttribute('fill', '#fff'));
    logoAccent.forEach(el => el.setAttribute('fill', '#ededed'));
  }
  
  const icon = document.getElementById('themeIcon');
  if (icon) {
    const fallbackActive = icon.getAttribute('data-fallback-active') === 'true';
    if (fallbackActive) {
      const fallbackDark = icon.getAttribute('data-ph-fallback-dark') || '☀';
      const fallbackLight = icon.getAttribute('data-ph-fallback-light') || '☾';
      icon.textContent = isLight ? fallbackLight : fallbackDark;
    } else {
      icon.className = isLight ? 'ph ph-moon theme-icon icon-candidate' : 'ph ph-sun theme-icon icon-candidate';
    }
  }
  const toggle = document.getElementById('themeToggle');
  if (toggle) {
    toggle.setAttribute('aria-label', isLight ? 'Switch to dark theme' : 'Switch to light theme');
    toggle.setAttribute('aria-pressed', isLight ? 'true' : 'false');
  }
}

function toggleTheme() {
  const isLight = !document.body.classList.contains('light');
  applyTheme(isLight);
  try {
    localStorage.setItem('theme', isLight ? 'light' : 'dark');
  } catch (_error) {
    // Ignore storage failures in hardened/privacy-restricted browsers.
  }
}

// Apply saved preference immediately
(function() {
  let savedTheme = null;
  try {
    savedTheme = localStorage.getItem('theme');
  } catch (_error) {
    savedTheme = null;
  }
  applyTheme(savedTheme === 'light');
})();

// ── Modal Helpers ───────────────────────────────────────────────────────
function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.remove('is-open');
    document.body.style.overflow = '';
  }
}

function openDownloadModal(version) {
  openModal('downloadModal');
  if (version) {
    const sel = document.getElementById('su_version');
    if (sel) sel.value = version;
  }
}

function closeDownloadModal() {
  closeModal('downloadModal');
  resetForm('signupForm', 'signupMsg', 'signupBtn');
}

function openDonateModal() {
  openModal('donateModal');
}

function closeDonateModal() {
  closeModal('donateModal');
  resetForm('donateForm', 'donateMsg', 'donateBtn');
}

function runAction(node) {
  if (!node) return false;
  const action = node.getAttribute('data-action');
  if (!action) return false;

  switch (action) {
    case 'toggle-mobile-nav':
      toggleMobileNav(node);
      return true;
    case 'toggle-theme':
      toggleTheme();
      return true;
    case 'open-download':
      openDownloadModal(node.getAttribute('data-version') || '');
      return true;
    case 'open-donate':
      openDonateModal();
      return true;
    case 'close-modal':
      closeModal(node.getAttribute('data-modal') || '');
      return true;
    case 'team-scroll':
      teamScroll(Number(node.getAttribute('data-direction')) || 0);
      return true;
    case 'toggle-docs-sidebar': {
      const sidebar = document.getElementById('docsSidebar');
      if (sidebar) {
        sidebar.classList.toggle('docs-sidebar-open');
      }
      return true;
    }
    default:
      return false;
  }
}

document.addEventListener('click', (e) => {
  const overlay = e.target.closest('.modal-overlay[data-close-on-overlay="true"]');
  if (overlay && e.target === overlay) {
    closeModal(overlay.id);
    return;
  }

  const actionNode = e.target.closest('[data-action]');
  if (!actionNode) return;
  e.preventDefault();
  runAction(actionNode);
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeModal('downloadModal');
    closeModal('donateModal');
    return;
  }

  const actionNode = e.target.closest('[data-key-activate="true"][data-action]');
  if (!actionNode) return;
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    runAction(actionNode);
  }
});

// ── Form Helpers ────────────────────────────────────────────────────────
function resetForm(formId, msgId, btnId) {
  const form = document.getElementById(formId);
  const msg  = document.getElementById(msgId);
  const btn  = document.getElementById(btnId);
  if (form) form.reset();
  if (msg)  { msg.textContent = ''; msg.className = 'form-msg'; }
  if (btn)  btn.disabled = false;
}

function setLoading(btnId, loading) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled = loading;
  btn.classList.toggle('is-loading', loading);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isSafeActionUrl(value) {
  try {
    const url = new URL(String(value || ''), window.location.href);
    return url.protocol === 'https:' || url.origin === window.location.origin;
  } catch (_error) {
    return false;
  }
}

function showMsg(msgId, text, isError, action) {
  const el = document.getElementById(msgId);
  if (!el) return;
  el.textContent = '';
  if (text) {
    el.appendChild(document.createTextNode(String(text)));
  }
  if (action && action.url && isSafeActionUrl(action.url)) {
    if (text) {
      el.appendChild(document.createTextNode(' '));
    }
    const link = document.createElement('a');
    link.className = 'form-msg-action';
    link.href = action.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = action.label || 'Open';
    el.appendChild(link);
  }
  el.className = 'form-msg ' + (isError ? 'form-msg--error' : 'form-msg--success');
}

function initPointerPathTrail() {
  const anyFinePointer = window.matchMedia('(any-pointer: fine)');
  const anyHover = window.matchMedia('(any-hover: hover)');
  const hover = window.matchMedia('(hover: hover)');
  const anyCoarsePointer = window.matchMedia('(any-pointer: coarse)');
  const coarseOnly =
    anyCoarsePointer.matches &&
    !anyFinePointer.matches &&
    !anyHover.matches &&
    !hover.matches;

  if (coarseOnly) return;

  document.documentElement.classList.remove('has-pointer-jelly');
  document.documentElement.classList.add('has-pointer-web');

  const canvas = document.createElement('canvas');
  canvas.className = 'cursor-path-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.appendChild(canvas);

  const clearButton = document.createElement('button');
  clearButton.type = 'button';
  clearButton.className = 'cursor-path-clear';
  clearButton.textContent = 'clear web';
  clearButton.setAttribute('aria-label', 'Clear cursor path web');
  clearButton.setAttribute('data-pointer-native', 'true');
  document.body.appendChild(clearButton);

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    canvas.remove();
    clearButton.remove();
    return;
  }

  const state = {
    dpr: 1,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    pointerVisible: false,
    pointerClient: { x: window.innerWidth / 2, y: window.innerHeight / 2 },
    hoverInteractive: false,
    idleTimer: 0,
    anchors: [],
    segments: [],
    activeAnchorIndex: -1,
    sawPointerEvent: false,
  };

  const cursorRadius = 11;
  const anchorRadius = 8;
  const idleThreshold = 220;
  const minAnchorDistance = 54;
  const minLineDistance = 20;
  const nativeCursorSelector = [
    'a[href]',
    'button',
    'summary',
    '[role="button"]',
    'input[type="button"]',
    'input[type="submit"]',
    'input[type="reset"]',
    'label[for]',
    '[data-pointer-native]',
  ].join(', ');

  const distanceBetween = (from, to) => Math.hypot(to.x - from.x, to.y - from.y);
  const getScroll = () => ({ x: window.scrollX || 0, y: window.scrollY || 0 });
  const toViewportPoint = (point) => {
    const scroll = getScroll();
    return {
      x: point.x - scroll.x,
      y: point.y - scroll.y,
    };
  };
  const clearIdleTimer = () => {
    if (state.idleTimer) {
      window.clearTimeout(state.idleTimer);
      state.idleTimer = 0;
    }
  };

  const isNativeCursorTarget = (target) =>
    target instanceof Element && Boolean(target.closest(nativeCursorSelector));

  const getPalette = () => {
    if (document.body.classList.contains('light')) {
      return {
        ring: '19, 24, 30',
        anchor: '56, 121, 190',
        path: '78, 145, 255',
        live: '198, 145, 82',
        glow: '131, 195, 255',
      };
    }

    return {
      ring: '244, 241, 233',
      anchor: '236, 186, 130',
      path: '131, 195, 255',
      live: '236, 186, 130',
      glow: '131, 195, 255',
    };
  };

  const resizeCanvas = () => {
    state.dpr = Math.min(window.devicePixelRatio || 1, 2);
    state.viewportWidth = window.innerWidth;
    state.viewportHeight = window.innerHeight;
    canvas.width = Math.round(state.viewportWidth * state.dpr);
    canvas.height = Math.round(state.viewportHeight * state.dpr);
    canvas.style.width = `${state.viewportWidth}px`;
    canvas.style.height = `${state.viewportHeight}px`;
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    redraw();
  };

  const updateCanvasVisibility = () => {
    const hasGraph = state.anchors.length > 0 || state.segments.length > 0;
    const showCursor = state.pointerVisible && !state.hoverInteractive;
    canvas.classList.toggle('is-active', hasGraph || showCursor);
    clearButton.classList.toggle('is-visible', hasGraph);
  };

  const drawAnchor = (anchor, palette) => {
    const glow = ctx.createRadialGradient(anchor.x, anchor.y, 0, anchor.x, anchor.y, 24);
    glow.addColorStop(0, `rgba(${palette.glow}, 0.18)`);
    glow.addColorStop(0.38, `rgba(${palette.anchor}, 0.12)`);
    glow.addColorStop(1, `rgba(${palette.anchor}, 0)`);

    ctx.save();
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(anchor.x, anchor.y, 24, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = `rgba(${palette.ring}, 0.9)`;
    ctx.lineWidth = 1.45;
    ctx.beginPath();
    ctx.arc(anchor.x, anchor.y, anchorRadius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = `rgba(${palette.anchor}, 0.8)`;
    ctx.beginPath();
    ctx.arc(anchor.x, anchor.y, 2.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  const drawArrow = (from, to, palette, { live = false } = {}) => {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const distance = Math.hypot(dx, dy);
    const startOffset = anchorRadius + 6;
    const endOffset = live ? cursorRadius + 7 : anchorRadius + 9;

    if (distance <= startOffset + endOffset + minLineDistance) {
      return;
    }

    const angle = Math.atan2(dy, dx);
    const startX = from.x + Math.cos(angle) * startOffset;
    const startY = from.y + Math.sin(angle) * startOffset;
    const endX = to.x - Math.cos(angle) * endOffset;
    const endY = to.y - Math.sin(angle) * endOffset;
    const lineColor = live ? palette.live : palette.path;
    const opacity = live ? 0.72 : 0.58;
    const headSize = live ? 8 : 9;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.strokeStyle = `rgba(${palette.glow}, ${live ? 0.1 : 0.06})`;
    ctx.lineWidth = live ? 3 : 2.5;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    ctx.strokeStyle = `rgba(${lineColor}, ${opacity})`;
    ctx.lineWidth = live ? 1.15 : 1.25;
    if (live) {
      ctx.setLineDash([7, 10]);
    }
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = `rgba(${lineColor}, ${live ? 0.84 : 0.74})`;
    ctx.beginPath();
    ctx.moveTo(endX, endY);
    ctx.lineTo(
      endX - Math.cos(angle) * headSize + Math.sin(angle) * (headSize * 0.46),
      endY - Math.sin(angle) * headSize - Math.cos(angle) * (headSize * 0.46)
    );
    ctx.lineTo(
      endX - Math.cos(angle) * headSize - Math.sin(angle) * (headSize * 0.46),
      endY - Math.sin(angle) * headSize + Math.cos(angle) * (headSize * 0.46)
    );
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };

  const drawLeader = (palette) => {
    const pointer = state.pointerClient;
    const halo = ctx.createRadialGradient(
      pointer.x,
      pointer.y,
      0,
      pointer.x,
      pointer.y,
      34
    );
    halo.addColorStop(0, `rgba(${palette.glow}, 0.16)`);
    halo.addColorStop(0.42, `rgba(${palette.path}, 0.08)`);
    halo.addColorStop(1, `rgba(${palette.glow}, 0)`);

    ctx.save();
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(pointer.x, pointer.y, 34, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = `rgba(${palette.ring}, 0.96)`;
    ctx.lineWidth = 1.7;
    ctx.beginPath();
    ctx.arc(pointer.x, pointer.y, cursorRadius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = `rgba(${palette.path}, 0.62)`;
    ctx.beginPath();
    ctx.arc(pointer.x, pointer.y, 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  const redraw = () => {
    ctx.clearRect(0, 0, state.viewportWidth, state.viewportHeight);

    const palette = getPalette();
    state.segments.forEach((segment) => {
      const from = state.anchors[segment.fromIndex];
      const to = state.anchors[segment.toIndex];
      if (from && to) {
        drawArrow(toViewportPoint(from), toViewportPoint(to), palette);
      }
    });

    if (state.activeAnchorIndex >= 0 && state.pointerVisible && !state.hoverInteractive) {
      const activeAnchor = state.anchors[state.activeAnchorIndex];
      const pointerDoc = {
        x: state.pointerClient.x + getScroll().x,
        y: state.pointerClient.y + getScroll().y,
      };
      if (activeAnchor && distanceBetween(activeAnchor, pointerDoc) >= minLineDistance) {
        drawArrow(toViewportPoint(activeAnchor), state.pointerClient, palette, { live: true });
      }
    }

    state.anchors.forEach((anchor) => drawAnchor(toViewportPoint(anchor), palette));

    if (state.pointerVisible && !state.hoverInteractive) {
      drawLeader(palette);
    }

    updateCanvasVisibility();
  };

  const commitAnchor = () => {
    if (!state.pointerVisible || state.hoverInteractive) return;

    const scroll = getScroll();
    const nextAnchor = {
      x: state.pointerClient.x + scroll.x,
      y: state.pointerClient.y + scroll.y,
    };
    const activeAnchor =
      state.activeAnchorIndex >= 0 ? state.anchors[state.activeAnchorIndex] : null;

    if (activeAnchor && distanceBetween(activeAnchor, nextAnchor) < minAnchorDistance) {
      redraw();
      return;
    }

    const nextIndex = state.anchors.length;
    state.anchors.push(nextAnchor);

    if (activeAnchor) {
      state.segments.push({
        fromIndex: state.activeAnchorIndex,
        toIndex: nextIndex,
      });
    }

    state.activeAnchorIndex = nextIndex;
    redraw();
  };

  const scheduleIdleCommit = () => {
    clearIdleTimer();
    if (!state.pointerVisible || state.hoverInteractive) {
      redraw();
      return;
    }

    state.idleTimer = window.setTimeout(() => {
      state.idleTimer = 0;
      commitAnchor();
    }, idleThreshold);
  };

  const handleMoveInput = (clientX, clientY, target) => {
    const point = { x: clientX, y: clientY };
    state.pointerVisible = true;
    state.pointerClient = point;
    state.hoverInteractive = isNativeCursorTarget(target);
    scheduleIdleCommit();
    redraw();
  };

  const handlePointerMove = (event) => {
    state.sawPointerEvent = true;
    if (event.pointerType && event.pointerType !== 'mouse' && event.pointerType !== 'pen') return;
    handleMoveInput(event.clientX, event.clientY, event.target);
  };

  const handleMouseMove = (event) => {
    if ('PointerEvent' in window && state.sawPointerEvent) return;
    handleMoveInput(event.clientX, event.clientY, event.target);
  };

  const handlePointerLeave = () => {
    state.pointerVisible = false;
    state.hoverInteractive = false;
    clearIdleTimer();
    redraw();
  };

  const handleScroll = () => {
    clearIdleTimer();
    redraw();
  };

  clearButton.addEventListener('click', () => {
    state.anchors = [];
    state.segments = [];
    state.activeAnchorIndex = -1;
    clearIdleTimer();
    redraw();
  });

  resizeCanvas();
  redraw();

  window.addEventListener('resize', resizeCanvas, { passive: true });
  window.addEventListener('pointermove', handlePointerMove, { passive: true });
  window.addEventListener('pointerdown', handlePointerMove, { passive: true });
  window.addEventListener('pointercancel', handlePointerLeave, { passive: true });
  window.addEventListener('mousemove', handleMouseMove, { passive: true });
  window.addEventListener('mousedown', handleMouseMove, { passive: true });
  window.addEventListener('scroll', handleScroll, { passive: true });
  window.addEventListener('mouseout', (event) => {
    if (!event.relatedTarget) {
      handlePointerLeave();
    }
  }, { passive: true });
  window.addEventListener('blur', handlePointerLeave, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      handlePointerLeave();
    }
  });

  const themeObserver = new MutationObserver(() => redraw());
  themeObserver.observe(document.body, {
    attributes: true,
    attributeFilter: ['class'],
  });
}

const API_BASE = (() => {
  if (window.location.protocol === 'file:') {
    return 'http://127.0.0.1:8787';
  }
  if (window.location.port === '3402') {
    return 'http://127.0.0.1:8787';
  }
  return window.location.origin.replace(/\/+$/, '');
})();

async function submitForm(e, action) {
  e.preventDefault();
  const form    = e.target;
  const isSignup = action === 'signup';
  const btnId   = isSignup ? 'signupBtn'  : 'donateBtn';
  const msgId   = isSignup ? 'signupMsg'  : 'donateMsg';

  setLoading(btnId, true);
  showMsg(msgId, '', false);

  const data = Object.fromEntries(new FormData(form).entries());
  if (isSignup) {
    const countryInput = form.querySelector('#su_country');
    if (countryInput && countryInput.hasAttribute('required') && !countryInput.value.trim()) {
      countryInput.setCustomValidity('Please select a country');
      countryInput.reportValidity();
      setLoading(btnId, false);
      return;
    }
    data.sourcePage = window.location.pathname || '/';
    data.sourceTitle = document.title || 'Wytham';
  }

  try {
    const res = await fetch(`${API_BASE}/api/${action}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      cache: 'no-store',
      body:    JSON.stringify(data)
    });
    const json = await res.json();

    if (json.success) {
      showMsg(msgId, json.message || 'Done!', false);
      form.reset();
      setTimeout(() => closeModal(isSignup ? 'downloadModal' : 'donateModal'), 3000);
    } else {
      showMsg(msgId, json.error || 'Something went wrong. Please try again.', true);
      setLoading(btnId, false);
    }
  } catch {
    showMsg(msgId, 'Network error. Please check your connection and try again.', true);
    setLoading(btnId, false);
  }
}

document.addEventListener('submit', (e) => {
  const form = e.target;
  if (!(form instanceof HTMLFormElement)) return;
  if (form.id === 'signupForm') {
    submitForm(e, 'signup');
  } else if (form.id === 'donateForm') {
    submitForm(e, 'donate');
  }
});

function initDocsPage() {
  const layout = document.querySelector('.docs-layout');
  const sidebar = document.getElementById('docsSidebar');

  if (!layout || !sidebar) return;

  const links = Array.from(document.querySelectorAll('.docs-toc-link'));
  const sections = links
    .map((link) => {
      const href = link.getAttribute('href') || '';
      const id = href.replace(/^#/, '');
      const el = id ? document.getElementById(id) : null;
      return el ? { el, link } : null;
    })
    .filter(Boolean);

  if (sections.length) {
    const onScroll = () => {
      let active = sections[0];
      sections.forEach((item) => {
        if (item.el.getBoundingClientRect().top <= 120) {
          active = item;
        }
      });
      links.forEach((link) => link.classList.remove('docs-toc-active'));
      if (active) {
        active.link.classList.add('docs-toc-active');
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  if (!layout.querySelector('.docs-sidebar-toggle')) {
    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'docs-sidebar-toggle';
    toggleBtn.setAttribute('aria-label', 'Toggle sidebar');
    toggleBtn.setAttribute('data-action', 'toggle-docs-sidebar');

    const icon = document.createElement('i');
    icon.className = 'ph ph-list icon-candidate';
    icon.setAttribute('data-ph-fallback', '≡');
    icon.setAttribute('aria-hidden', 'true');
    toggleBtn.appendChild(icon);

    layout.insertBefore(toggleBtn, layout.firstChild);
    schedulePhosphorFallback(1300);
  }
}

// ── Searchable Dropdowns ────────────────────────────────────────────────
const ALL_COUNTRIES = [
  "Afghanistan", "Albania", "Algeria", "Andorra", "Angola", "Argentina", "Armenia", "Australia", "Austria", "Azerbaijan",
  "Bahamas", "Bahrain", "Bangladesh", "Barbados", "Belarus", "Belgium", "Belize", "Benin", "Bhutan", "Bolivia", "Bosnia and Herzegovina", "Botswana", "Brazil", "Brunei", "Bulgaria", "Burkina Faso", "Burundi",
  "Cambodia", "Cameroon", "Canada", "Cape Verde", "Central African Republic", "Chad", "Chile", "China", "Colombia", "Comoros", "Congo", "Costa Rica", "Croatia", "Cuba", "Cyprus", "Czech Republic",
  "Denmark", "Djibouti", "Dominica", "Dominican Republic",
  "Ecuador", "Egypt", "El Salvador", "Equatorial Guinea", "Eritrea", "Estonia", "Eswatini", "Ethiopia",
  "Fiji", "Finland", "France",
  "Gabon", "Gambia", "Georgia", "Germany", "Ghana", "Greece", "Grenada", "Guatemala", "Guinea", "Guinea-Bissau", "Guyana",
  "Haiti", "Honduras", "Hungary",
  "Iceland", "India", "Indonesia", "Iran", "Iraq", "Ireland", "Israel", "Italy", "Ivory Coast",
  "Jamaica", "Japan", "Jordan",
  "Kazakhstan", "Kenya", "Kiribati", "Kosovo", "Kuwait", "Kyrgyzstan",
  "Laos", "Latvia", "Lebanon", "Lesotho", "Liberia", "Libya", "Liechtenstein", "Lithuania", "Luxembourg",
  "Madagascar", "Malawi", "Malaysia", "Maldives", "Mali", "Malta", "Marshall Islands", "Mauritania", "Mauritius", "Mexico", "Micronesia", "Moldova", "Monaco", "Mongolia", "Montenegro", "Morocco", "Mozambique", "Myanmar",
  "Namibia", "Nauru", "Nepal", "Netherlands", "New Zealand", "Nicaragua", "Niger", "Nigeria", "North Korea", "North Macedonia", "Norway",
  "Oman",
  "Pakistan", "Palau", "Palestine", "Panama", "Papua New Guinea", "Paraguay", "Peru", "Philippines", "Poland", "Portugal",
  "Qatar",
  "Romania", "Russia", "Rwanda",
  "Saint Kitts and Nevis", "Saint Lucia", "Saint Vincent and the Grenadines", "Samoa", "San Marino", "Sao Tome and Principe", "Saudi Arabia", "Senegal", "Serbia", "Seychelles", "Sierra Leone", "Singapore", "Slovakia", "Slovenia", "Solomon Islands", "Somalia", "South Africa", "South Korea", "South Sudan", "Spain", "Sri Lanka", "Sudan", "Suriname", "Sweden", "Switzerland", "Syria",
  "Taiwan", "Tajikistan", "Tanzania", "Thailand", "Timor-Leste", "Togo", "Tonga", "Trinidad and Tobago", "Tunisia", "Turkey", "Turkmenistan", "Tuvalu",
  "Uganda", "Ukraine", "United Arab Emirates", "United Kingdom", "United States", "Uruguay", "Uzbekistan",
  "Vanuatu", "Vatican City", "Venezuela", "Vietnam",
  "Yemen",
  "Zambia", "Zimbabwe",
  "Other"
];

function initSearchableDropdowns() {
  const dropdowns = document.querySelectorAll('.searchable-select');
  dropdowns.forEach(dropdown => {
    const input = dropdown.querySelector('.searchable-input');
    const optionsContainer = dropdown.querySelector('.searchable-options');
    const dropdownMenu = dropdown.querySelector('.searchable-dropdown');
    if (!input || !optionsContainer || !dropdownMenu) return;

    ALL_COUNTRIES.forEach(country => {
      const option = document.createElement('div');
      option.className = 'searchable-option';
      option.textContent = country;
      option.dataset.value = country;
      option.addEventListener('click', (e) => {
        e.stopPropagation();
        input.value = country;
        input.dataset.selectedValue = country;
        dropdownMenu.style.display = 'none';
        if (input.hasAttribute('required') && country) input.setCustomValidity('');
      });
      optionsContainer.appendChild(option);
    });

    input.addEventListener('input', (e) => {
      const searchTerm = e.target.value.toLowerCase();
      if (input.hasAttribute('required')) {
        input.setCustomValidity('');
      }
      const options = optionsContainer.querySelectorAll('.searchable-option');
      let hasVisibleOptions = false;
      options.forEach(option => {
        const matches = option.dataset.value.toLowerCase().includes(searchTerm);
        option.classList.toggle('searchable-option-hidden', !matches);
        if (matches) hasVisibleOptions = true;
      });
      dropdownMenu.style.display = (hasVisibleOptions || searchTerm.length === 0) ? 'block' : 'none';
    });

    input.addEventListener('focus', () => { dropdownMenu.style.display = 'block'; });
    
    input.addEventListener('keydown', (e) => {
      const options = Array.from(optionsContainer.querySelectorAll('.searchable-option:not(.searchable-option-hidden)'));
      const highlightedIndex = options.findIndex(opt => opt.classList.contains('highlight'));
      if (!options.length) {
        if (e.key === 'Escape') {
          dropdownMenu.style.display = 'none';
        }
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const nextIndex = highlightedIndex + 1 < options.length ? highlightedIndex + 1 : 0;
        options.forEach(opt => opt.classList.remove('highlight'));
        options[nextIndex].classList.add('highlight');
        options[nextIndex].scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prevIndex = highlightedIndex > 0 ? highlightedIndex - 1 : options.length - 1;
        options.forEach(opt => opt.classList.remove('highlight'));
        options[prevIndex].classList.add('highlight');
        options[prevIndex].scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (highlightedIndex >= 0) options[highlightedIndex].click();
      } else if (e.key === 'Escape') {
        dropdownMenu.style.display = 'none';
      }
    });
  });
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('.searchable-select')) {
    document.querySelectorAll('.searchable-dropdown').forEach(dd => { dd.style.display = 'none'; });
  }
});

// Team section horizontal slider controls on index page.
function updateTeamArrowState() {
  const row = document.getElementById('teamRow');
  const prev = document.getElementById('tPrev');
  const next = document.getElementById('tNext');
  if (!row || !prev || !next) return;

  const maxLeft = Math.max(0, row.scrollWidth - row.clientWidth - 1);
  prev.disabled = row.scrollLeft <= 1;
  next.disabled = row.scrollLeft >= maxLeft;
}

function teamScroll(direction) {
  const row = document.getElementById('teamRow');
  if (!row) return;

  const firstCard = row.querySelector('.team-card');
  const step = firstCard
    ? firstCard.getBoundingClientRect().width + 20
    : Math.max(240, row.clientWidth * 0.8);

  row.scrollBy({ left: direction * step, behavior: 'smooth' });
  setTimeout(updateTeamArrowState, 140);
  setTimeout(updateTeamArrowState, 460);
}

// Setup Initializers
document.addEventListener('DOMContentLoaded', () => {
  initSearchableDropdowns();
  initDocsPage();
  initPointerPathTrail();
  const teamRow = document.getElementById('teamRow');
  if (teamRow) {
    teamRow.addEventListener('scroll', updateTeamArrowState, { passive: true });
    window.addEventListener('resize', updateTeamArrowState);
    updateTeamArrowState();
  }
});

