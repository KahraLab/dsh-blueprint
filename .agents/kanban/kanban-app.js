/**
 * ==============================================================================
 * Project Kanban App Engine
 * 驱动核心：轻量矢量看板渲染 + 动态明暗主题自适应 + 双语 i18n
 * ==============================================================================
 */

import { render, enableZoom } from 'https://esm.sh/pele';

export const I18N_LOCALES = {
  zh: {
    title: '项目看板',
    empty: '当前看板尚无任务数据',
    render_failed: '看板语法解析失败',
    btn_lang: '切换语言 (中 / EN)',
    btn_theme: '切换模式 (浅色 / 深色)',
    close: '关闭',
    lanes: {
      backlog: '待处理',
      todo: '待开发',
      in_progress: '进行中',
      ready_for_review: '待验收',
    },
    drawer: {
      priority_label: '优先级',
      assignee_label: '负责人',
      status_label: '当前阶段',
      history_title: '历史日志',
      created: '任务录入并在看板创建',
      created_desc: (id, lane) => `分配编号 ${id}，录入至 ${lane}`,
      started: 'AI 接单并开始处理',
      started_desc: (assignee) => `负责人: ${assignee}`,
      ready: '已做完并通过自测，等待确认',
      ready_desc: '开发与验证完成，等待用户检查确认',
      unassigned: '暂未分配',
      normal: '普通',
      high: '高',
      medium: '中',
      low: '低',
    },
  },
  en: {
    title: 'Project Kanban',
    empty: 'No tasks on the board yet',
    render_failed: 'Kanban syntax parse error',
    btn_lang: 'Switch Language (EN / 中)',
    btn_theme: 'Toggle Theme (Light / Dark)',
    close: 'Close',
    lanes: {
      backlog: 'Backlog',
      todo: 'Todo',
      in_progress: 'In Progress',
      ready_for_review: 'Ready for Review',
    },
    drawer: {
      priority_label: 'Priority',
      assignee_label: 'Assignee',
      status_label: 'Status',
      history_title: 'History',
      created: 'Task created on board',
      created_desc: (id, lane) => `Assigned ${id}, added to ${lane}`,
      started: 'AI claimed task and started work',
      started_desc: (assignee) => `Assignee: ${assignee}`,
      ready: 'Completed & tested, ready for review',
      ready_desc: 'Implementation & tests passed, awaiting review',
      unassigned: 'Unassigned',
      normal: 'Normal',
      high: 'High',
      medium: 'Medium',
      low: 'Low',
    },
  },
};

let activeDrawerCard = null;
let osInstance = null;

export async function getOverlayScrollbars() {
  if (typeof window !== 'undefined' && window.OverlayScrollbarsGlobal?.OverlayScrollbars) {
    return window.OverlayScrollbarsGlobal.OverlayScrollbars;
  }
  try {
    const mod = await import('https://cdn.jsdelivr.net/npm/overlayscrollbars@2.17.0/overlayscrollbars.esm.min.js');
    return mod.OverlayScrollbars;
  } catch (e) {
    console.warn('[Kanban] 无法加载 OverlayScrollbars:', e);
    return null;
  }
}

export async function initScrollbar() {
  const container = document.getElementById('kanban-scroll-container');
  if (!container) return;

  const OS = await getOverlayScrollbars();
  if (!OS) return;

  const currentTheme = getCurrentTheme();
  const osTheme = currentTheme === 'dark' ? 'os-theme-light' : 'os-theme-dark';

  if (osInstance) {
    osInstance.options({
      scrollbars: {
        theme: osTheme,
      },
    });
    osInstance.update();
    return;
  }

  osInstance = OS(container, {
    scrollbars: {
      theme: osTheme,
      autoHide: 'leave',
      autoHideDelay: 600,
    },
    overflow: {
      x: 'scroll',
      y: 'hidden',
    },
  });

  bindHorizontalWheel(container);
}

function bindHorizontalWheel(container) {
  const viewport = osInstance?.elements().viewport || container;
  if (!viewport || viewport._wheelBound) return;
  viewport._wheelBound = true;

  viewport.addEventListener('wheel', (e) => {
    if (e.shiftKey) return;
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      if (viewport.scrollWidth > viewport.clientWidth) {
        e.preventDefault();
        viewport.scrollLeft += e.deltaY;
      }
    }
  }, { passive: false });
}

export function getCurrentLang() {
  const saved = localStorage.getItem('kanban_lang');
  if (saved && (saved === 'zh' || saved === 'en')) return saved;
  const navLang = (navigator.language || '').toLowerCase();
  return navLang.startsWith('zh') ? 'zh' : 'en';
}

export function toggleLang() {
  const current = getCurrentLang();
  const next = current === 'zh' ? 'en' : 'zh';
  localStorage.setItem('kanban_lang', next);
  applyI18n(next);
}

export function getCurrentTheme() {
  const saved = localStorage.getItem('kanban_theme');
  if (saved && (saved === 'dark' || saved === 'light')) return saved;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function toggleTheme() {
  const current = getCurrentTheme();
  const next = current === 'dark' ? 'light' : 'dark';
  localStorage.setItem('kanban_theme', next);
  applyTheme(next);
}

export function applyTheme(theme = getCurrentTheme()) {
  document.documentElement.setAttribute('data-theme', theme);
  document.body.setAttribute('data-theme', theme);
  updateThemeIcon(theme);
  updateFavicon(theme);

  if (osInstance) {
    osInstance.options({
      scrollbars: {
        theme: theme === 'dark' ? 'os-theme-light' : 'os-theme-dark',
      },
    });
  }
}

function updateThemeIcon(theme) {
  const btn = document.getElementById('btn-theme-toggle');
  if (!btn) return;
  btn.innerHTML = theme === 'dark'
    ? `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>`;
}

function updateFavicon(theme) {
  const favicon = document.getElementById('favicon');
  if (!favicon) return;
  const strokeColor = theme === 'dark' ? '%23ffffff' : '%231f2328';
  favicon.href = `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='${strokeColor}' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><rect width='18' height='18' x='3' y='3' rx='3'/><path d='M8 7v7'/><path d='M12 7v4'/><path d='M16 7v9'/></svg>`;
}

export function applyI18n(lang = getCurrentLang()) {
  const t = I18N_LOCALES[lang] || I18N_LOCALES.zh;
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';

  // 动态更新页面中所有挂载 data-i18n 的元素
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const val = getNestedValue(t, key);
    if (val !== undefined) el.textContent = val;
  });

  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.getAttribute('data-i18n-title');
    const val = getNestedValue(t, key);
    if (val !== undefined) el.setAttribute('title', val);
  });

  document.querySelectorAll('[data-i18n-aria]').forEach(el => {
    const key = el.getAttribute('data-i18n-aria');
    const val = getNestedValue(t, key);
    if (val !== undefined) el.setAttribute('aria-label', val);
  });

  document.title = t.title;

  initKanban({ lang });

  if (activeDrawerCard) {
    const rawMermaid = document.getElementById('kanban-source')?.textContent.trim() || '';
    openTaskDrawer(activeDrawerCard.id, activeDrawerCard.title, rawMermaid, lang);
  }
}

function getNestedValue(obj, path) {
  return path.split('.').reduce((acc, part) => (acc && acc[part] !== undefined ? acc[part] : undefined), obj);
}

function localizeMermaid(source, lang) {
  const lanes = (I18N_LOCALES[lang] || I18N_LOCALES.zh).lanes;
  let result = source;
  result = result.replace(/backlog\[[^\]]+\]/g, `backlog[${lanes.backlog}]`);
  result = result.replace(/todo\[[^\]]+\]/g, `todo[${lanes.todo}]`);
  result = result.replace(/in_progress\[[^\]]+\]/g, `in_progress[${lanes.in_progress}]`);
  result = result.replace(/ready_for_review\[[^\]]+\]/g, `ready_for_review[${lanes.ready_for_review}]`);
  return result;
}

export function initKanban(options = {}) {
  const sourceId = options.sourceId || 'kanban-source';
  const mountId = options.mountId || 'kanban-mount';
  const lang = options.lang || getCurrentLang();
  const t = I18N_LOCALES[lang] || I18N_LOCALES.zh;

  const sourceEl = document.getElementById(sourceId);
  const mountEl = document.getElementById(mountId);
  if (!sourceEl || !mountEl) return;

  const rawMermaid = sourceEl.textContent.trim();
  if (!rawMermaid) {
    mountEl.innerHTML = `<div style="padding:3rem;color:var(--text-muted);font-size:0.875rem;">${t.empty}</div>`;
    return;
  }

  try {
    const localizedMermaid = localizeMermaid(rawMermaid, lang);
    const result = render(localizedMermaid, { fontSize: 13, fontFamily: "'Figtree', -apple-system, sans-serif" });
    mountEl.innerHTML = result.svg;

    enableZoom(mountEl, {
      controls: true,
      maxScale: 3,
    });

    bindCardClickEvents(mountEl, rawMermaid, lang);
    initScrollbar();
  } catch (error) {
    console.error('[Kanban] 渲染失败:', error);
    mountEl.innerHTML = `
      <div style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.25);color:#fca5a5;padding:1rem;border-radius:6px;font-size:0.8125rem;">
        <strong>${t.render_failed}:</strong> ${error.message || error}
      </div>
    `;
  }
}

function bindCardClickEvents(mountEl, rawMermaid, lang) {
  const cards = mountEl.querySelectorAll('.pele-card');
  cards.forEach(card => {
    card.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = card.getAttribute('data-id');
      const textNode = card.querySelector('text');
      const title = textNode ? textNode.textContent.trim() : id;
      openTaskDrawer(id, title, rawMermaid, lang);
    });
  });
}

function openTaskDrawer(cardId, cardTitle, rawMermaid, lang) {
  const backdrop = document.getElementById('drawer-backdrop');
  if (!backdrop) return;

  activeDrawerCard = { id: cardId, title: cardTitle };
  const t = I18N_LOCALES[lang] || I18N_LOCALES.zh;

  let priorityText = t.drawer.normal;
  let assigned = t.drawer.unassigned;
  let lane = t.lanes.todo;

  const cardRegex = new RegExp(`${cardId}\\[[^\\]]+\\](?:@\\{([^\\}]+)\\})?`, 'i');
  const match = rawMermaid.match(cardRegex);
  if (match && match[1]) {
    const attrs = match[1];
    if (attrs.includes('priority: "High"')) priorityText = t.drawer.high;
    else if (attrs.includes('priority: "Medium"')) priorityText = t.drawer.medium;
    else if (attrs.includes('priority: "Low"')) priorityText = t.drawer.low;
    if (attrs.includes('assigned: "AI"')) assigned = 'AI Agent';
  }

  if (rawMermaid.indexOf(cardId) !== -1) {
    const index = rawMermaid.indexOf(cardId);
    const before = rawMermaid.slice(0, index);
    if (before.includes('ready_for_review')) lane = t.lanes.ready_for_review;
    else if (before.includes('in_progress')) lane = t.lanes.in_progress;
    else if (before.includes('todo')) lane = t.lanes.todo;
    else if (before.includes('backlog')) lane = t.lanes.backlog;
  }

  const labelPri = document.getElementById('label-priority');
  if (labelPri) labelPri.textContent = t.drawer.priority_label;
  const labelAss = document.getElementById('label-assignee');
  if (labelAss) labelAss.textContent = t.drawer.assignee_label;
  const labelSta = document.getElementById('label-status');
  if (labelSta) labelSta.textContent = t.drawer.status_label;

  const titleSec = document.getElementById('drawer-timeline-title');
  if (titleSec) titleSec.textContent = t.drawer.history_title;

  document.getElementById('drawer-task-id-text').textContent = cardId.toUpperCase();
  document.getElementById('drawer-task-title-text').textContent = cardTitle;

  document.getElementById('drawer-prop-priority').textContent = priorityText;
  document.getElementById('drawer-prop-assignee').textContent = assigned;
  document.getElementById('drawer-prop-lane').textContent = lane;

  const timelineEl = document.getElementById('drawer-timeline');
  timelineEl.innerHTML = `
    <div class="timeline-event">
      <span class="timeline-dot"></span>
      <div class="timeline-event-header">
        <span class="timeline-event-title">${t.drawer.created}</span>
        <span class="timeline-event-time">2025-10-30</span>
      </div>
      <div class="timeline-event-desc">${t.drawer.created_desc(cardId.toUpperCase(), lane)}</div>
    </div>
    ${lane === t.lanes.in_progress || lane === t.lanes.ready_for_review ? `
    <div class="timeline-event">
      <span class="timeline-dot"></span>
      <div class="timeline-event-header">
        <span class="timeline-event-title">${t.drawer.started}</span>
        <span class="timeline-event-time">${lane}</span>
      </div>
      <div class="timeline-event-desc">${t.drawer.started_desc(assigned)}</div>
    </div>` : ''}
    ${lane === t.lanes.ready_for_review ? `
    <div class="timeline-event">
      <span class="timeline-dot" style="border-color:#10b981;"></span>
      <div class="timeline-event-header">
        <span class="timeline-event-title" style="color:#10b981;">${t.drawer.ready}</span>
        <span class="timeline-event-time">${lane}</span>
      </div>
      <div class="timeline-event-desc">${t.drawer.ready_desc}</div>
    </div>` : ''}
  `;

  backdrop.classList.add('active');
}

export function closeTaskDrawer() {
  const backdrop = document.getElementById('drawer-backdrop');
  if (backdrop) backdrop.classList.remove('active');
  activeDrawerCard = null;
}

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    const langBtn = document.getElementById('btn-lang-toggle');
    if (langBtn) langBtn.addEventListener('click', toggleLang);

    const themeBtn = document.getElementById('btn-theme-toggle');
    if (themeBtn) themeBtn.addEventListener('click', toggleTheme);

    const closeBtn = document.getElementById('btn-drawer-close');
    if (closeBtn) closeBtn.addEventListener('click', closeTaskDrawer);

    const backdrop = document.getElementById('drawer-backdrop');
    if (backdrop) {
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) closeTaskDrawer();
      });
    }

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeTaskDrawer();
    });

    applyTheme();
    applyI18n();
    setupLiveReload();
  });

  if (import.meta && import.meta.hot) {
    import.meta.hot.accept(() => {
      applyTheme();
      applyI18n();
    });
  }
}

/**
 * 本地自动同步：检测 kanban.html 变动并实时更新画板
 * 1. 修改了卡片任务 -> 原地无感重绘，不白屏、不丢缩放状态；
 * 2. 修改了页面结构 -> 刷新页面。
 */
function setupLiveReload() {
  if (typeof window === 'undefined') return;
  const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  if (!isLocal || !window.location.protocol.startsWith('http')) return;

  let lastMermaid = document.getElementById('kanban-source')?.textContent.trim() || '';
  let lastHtml = '';
  let isChecking = false;

  setInterval(async () => {
    if (isChecking) return;
    isChecking = true;
    try {
      const res = await fetch(`kanban.html?_t=${Date.now()}`, { cache: 'no-cache' });
      if (!res.ok) return;
      const htmlText = await res.text();

      // 提取最新的 Mermaid 代码块
      const match = htmlText.match(/<script type="text\/mermaid" id="kanban-source">([\s\S]*?)<\/script>/);
      const newMermaid = match ? match[1].trim() : '';

      if (newMermaid && newMermaid !== lastMermaid) {
        lastMermaid = newMermaid;
        lastHtml = htmlText;
        const sourceEl = document.getElementById('kanban-source');
        if (sourceEl) {
          sourceEl.textContent = newMermaid;
          const currentLang = getCurrentLang();
          initKanban({ lang: currentLang });
        }
      } else if (lastHtml && htmlText !== lastHtml) {
        // 如果 HTML 其他结构（样式表、标题等）变动，平滑重载页面
        window.location.reload();
      } else if (!lastHtml) {
        lastHtml = htmlText;
      }
    } catch {
      // 忽略服务中断或网络波动
    } finally {
      isChecking = false;
    }
  }, 1000);
}
