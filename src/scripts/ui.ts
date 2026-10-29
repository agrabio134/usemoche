/**
 * Small progressive-enhancement layer. The site is fully readable without JS;
 * these add copy-to-clipboard, tabs, sheets and the header scroll state.
 */

/* ---------- Header scroll state ---------- */
function initHeader() {
  const header = document.querySelector<HTMLElement>('[data-header]');
  if (!header) return;
  const update = () => header.classList.toggle('is-scrolled', window.scrollY > 4);
  update();
  window.addEventListener('scroll', update, { passive: true });
}

/* ---------- Copy to clipboard ---------- */
async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to legacy path */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

function selectText(el: Element | null) {
  if (!el) return;
  const range = document.createRange();
  range.selectNodeContents(el);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
}

function initCopy() {
  document.addEventListener('click', async (e) => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('[data-copy]');
    if (!btn) return;
    const text = btn.dataset.copy ?? '';
    const label = btn.querySelector<HTMLElement>('[data-copy-label]');
    const status = btn.querySelector<HTMLElement>('[data-copy-status]');
    const original = btn.dataset.copyIdle ?? label?.textContent ?? 'Copy';
    btn.dataset.copyIdle = original;

    const ok = await writeClipboard(text);
    btn.dataset.state = ok ? 'copied' : 'error';
    if (label) label.textContent = ok ? 'Copied' : 'Press Ctrl+C';
    if (status) status.textContent = ok ? `Copied ${text} to clipboard` : `Couldn't copy automatically. The command is selected, copy it manually.`;
    if (!ok) {
      const target = btn.dataset.copyTarget ? document.getElementById(btn.dataset.copyTarget) : null;
      selectText(target);
    }
    window.clearTimeout(Number(btn.dataset.timer));
    btn.dataset.timer = String(
      window.setTimeout(() => {
        btn.dataset.state = '';
        if (label) label.textContent = original;
        if (status) status.textContent = '';
      }, 2200),
    );
  });
}

/* ---------- Tabs (WAI-ARIA tabs pattern, automatic activation) ---------- */
function initTabs() {
  document.querySelectorAll<HTMLElement>('[data-tabs]').forEach((root) => {
    const tabs = Array.from(root.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    const activate = (tab: HTMLButtonElement, focus = false) => {
      tabs.forEach((t) => {
        const selected = t === tab;
        t.setAttribute('aria-selected', String(selected));
        t.tabIndex = selected ? 0 : -1;
        const panelIds = (t.getAttribute('aria-controls') ?? '').split(' ');
        panelIds.forEach((id) => {
          const p = document.getElementById(id);
          if (p) p.hidden = !selected;
        });
      });
      // Optional linked command copy button
      const cmd = tab.dataset.command;
      if (cmd) {
        root.querySelectorAll<HTMLElement>('[data-tab-command]').forEach((el) => (el.textContent = cmd));
        root.querySelectorAll<HTMLButtonElement>('[data-tab-copy]').forEach((b) => {
          b.dataset.copy = cmd;
          b.setAttribute('aria-label', `Copy command ${cmd}`);
        });
      }
      if (focus) tab.focus();
    };
    tabs.forEach((tab, i) => {
      tab.addEventListener('click', () => activate(tab));
      tab.addEventListener('keydown', (e) => {
        let next = -1;
        if (e.key === 'ArrowRight') next = (i + 1) % tabs.length;
        if (e.key === 'ArrowLeft') next = (i - 1 + tabs.length) % tabs.length;
        if (e.key === 'Home') next = 0;
        if (e.key === 'End') next = tabs.length - 1;
        if (next > -1) {
          e.preventDefault();
          activate(tabs[next], true);
        }
      });
    });
  });
}

/* ---------- Sheets (native <dialog>, bottom sheet on mobile) ---------- */
function initSheets() {
  const open = (dlg: HTMLDialogElement, opener: HTMLElement | null) => {
    if (dlg.open) return;
    (dlg as any)._opener = opener;
    dlg.showModal();
    document.documentElement.classList.add('has-sheet');
  };
  const close = (dlg: HTMLDialogElement) => {
    if (!dlg.open) return;
    dlg.close();
  };

  document.addEventListener('click', (e) => {
    const target = e.target as Element;
    const opener = target.closest<HTMLElement>('[data-sheet-open], [data-menu-open]');
    if (opener) {
      const id = opener.dataset.sheetOpen ?? 'site-menu';
      const dlg = document.getElementById(id) as HTMLDialogElement | null;
      if (dlg) {
        e.preventDefault();
        open(dlg, opener);
      }
      return;
    }
    const closer = target.closest<HTMLElement>('[data-sheet-close]');
    if (closer) {
      const dlg = closer.closest('dialog');
      if (dlg) close(dlg);
    }
  });

  document.querySelectorAll<HTMLDialogElement>('dialog[data-sheet]').forEach((dlg) => {
    // Click on backdrop closes
    dlg.addEventListener('click', (e) => {
      if (e.target === dlg) close(dlg);
    });
    dlg.addEventListener('close', () => {
      document.documentElement.classList.remove('has-sheet');
      const opener = (dlg as any)._opener as HTMLElement | undefined;
      opener?.focus?.();
    });
  });

  // Close menu if viewport grows past breakpoint
  const mq = window.matchMedia('(min-width: 1120px)');
  mq.addEventListener?.('change', (ev) => {
    if (ev.matches) {
      const menu = document.getElementById('site-menu') as HTMLDialogElement | null;
      if (menu?.open) menu.close();
    }
  });
}

/* ---------- Generic toggle groups (illustrative previews only) ---------- */
function initPreviewControls() {
  document.querySelectorAll<HTMLElement>('[data-segment]').forEach((group) => {
    const buttons = Array.from(group.querySelectorAll<HTMLButtonElement>('button[data-value]'));
    const targetSel = group.dataset.segment!;
    buttons.forEach((b) =>
      b.addEventListener('click', () => {
        buttons.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        document.querySelectorAll<HTMLElement>(`[data-segment-panel="${targetSel}"]`).forEach((p) => {
          p.hidden = p.dataset.value !== b.dataset.value;
        });
      }),
    );
  });
}

initHeader();
initCopy();
initTabs();
initSheets();
initPreviewControls();
