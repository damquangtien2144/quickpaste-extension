(() => {
  if (window.__quickPasteV2Loaded) return;
  window.__quickPasteV2Loaded = true;
  const tr = (key, vars) => globalThis.QuickPasteI18n?.t?.(key, vars) || key;
  globalThis.QuickPasteI18n?.load?.();

  let selecting = false;
  let overlay = null;
  let tooltip = null;
  let highlighted = null;
  const inputSelections = new WeakMap();
  const contentRanges = new WeakMap();
  const undoStacks = new WeakMap();
  const liveTargets = new Map();
  const completedTransfers = new Map();
  const flashStates = new WeakMap();
  const isTopFrame = window.top === window;
  const documentToken = (() => {
    try { return crypto.randomUUID(); } catch (_) { return `doc_${Date.now()}_${Math.random().toString(36).slice(2)}`; }
  })();

  const EDITABLE_SELECTOR = [
    'textarea', 'input',
    '[contenteditable=""]', '[contenteditable="true"]', '[contenteditable="plaintext-only"]',
    '.monaco-editor textarea.inputarea', '.CodeMirror textarea', '.ace_editor textarea.ace_text-input',
    '.cm-content[contenteditable="true"]', '.ql-editor[contenteditable="true"]', '.ProseMirror[contenteditable="true"]'
  ].join(',');

  function cssIdent(value) {
    if (window.CSS?.escape) return CSS.escape(String(value));
    return String(value).replace(/[^a-zA-Z0-9_-]/g, ch => `\\${ch}`);
  }

  function attrValue(value) {
    return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\n\r]/g, ' ');
  }

  function isPassword(el) {
    return el?.matches?.('input[type="password"]');
  }

  function hasExplicitContentEditable(el) {
    if (!el?.getAttribute) return false;
    const ce = el.getAttribute('contenteditable')?.toLowerCase();
    return ce === '' || ce === 'true' || ce === 'plaintext-only';
  }

  function isEditable(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE || isPassword(el)) return false;
    if (el.matches(':disabled') || el.closest('[inert]')) return false;
    if (el.matches('textarea')) return !el.disabled && !el.readOnly;
    if (el.matches('input')) {
      const type = (el.type || 'text').toLowerCase();
      return ['text', 'search', 'url', 'tel', 'email', 'number'].includes(type) && !el.disabled && !el.readOnly;
    }
    // Chỉ coi phần tử khai báo contenteditable là editor host thật.
    // Descendant bên trong contenteditable cũng có el.isContentEditable === true,
    // nhưng thường chỉ là span/div tạm và có thể bị framework re-render xóa đi.
    return hasExplicitContentEditable(el);
  }

  function editableAncestor(node) {
    let el = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
    while (el) {
      if (isEditable(el)) return el;
      if (el.getAttribute('contenteditable')?.toLowerCase() === 'false') return null;
      el = el.parentElement;
    }
    return null;
  }

  function adapterForElement(el) {
    if (!el?.closest) return null;
    const adapters = [
      ['.monaco-editor', 'textarea.inputarea', 'Monaco Editor'],
      ['.CodeMirror', 'textarea', 'CodeMirror Editor'],
      ['.ace_editor', 'textarea.ace_text-input', 'Ace Editor'],
      ['.cm-editor', '.cm-content[contenteditable="true"]', 'CodeMirror Editor'],
      ['.ql-container', '.ql-editor[contenteditable="true"]', 'Quill Editor'],
      ['.ProseMirror', '.ProseMirror[contenteditable="true"]', 'ProseMirror Editor']
    ];
    for (const [containerSelector, editableSelector, label] of adapters) {
      const container = el.closest(containerSelector);
      if (!container) continue;
      const editable = container.matches(editableSelector) ? container : container.querySelector(editableSelector);
      if (editable && isEditable(editable)) return { el: editable, visual: container, adapterLabel: label };
    }
    return null;
  }

  function targetFromEvent(event) {
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [event.target];
    const first = path[0];
    if (!editableAncestor(first) && first?.closest?.('[contenteditable="false"]')) return null;
    for (const node of path) {
      const editable = editableAncestor(node);
      if (editable) return { el: editable, visual: editable, adapterLabel: '' };
    }
    for (const node of path) {
      if (node?.nodeType !== Node.ELEMENT_NODE) continue;
      const adapter = adapterForElement(node);
      if (adapter) return adapter;
    }
    return null;
  }

  function queryCount(root, selector) {
    try { return root.querySelectorAll(selector).length; } catch (_) { return 0; }
  }

  function buildSelectorInRoot(el, root) {
    if (el.id) {
      const selector = `#${cssIdent(el.id)}`;
      if (queryCount(root, selector) === 1) return selector;
    }

    const stableAttrs = ['data-testid', 'data-test', 'data-qa', 'name', 'aria-label', 'placeholder', 'role'];
    for (const attr of stableAttrs) {
      const value = el.getAttribute?.(attr);
      if (!value || value.length > 160) continue;
      const selector = `${el.tagName.toLowerCase()}[${attr}="${attrValue(value)}"]`;
      if (queryCount(root, selector) === 1) return selector;
    }

    const classes = Array.from(el.classList || [])
      .filter(c => c.length <= 48 && !/\d{5,}/.test(c))
      .slice(0, 3);
    if (classes.length) {
      const selector = `${el.tagName.toLowerCase()}${classes.map(c => `.${cssIdent(c)}`).join('')}`;
      if (queryCount(root, selector) === 1) return selector;
    }

    const parts = [];
    let node = el;
    while (node && node.nodeType === Node.ELEMENT_NODE) {
      let part = node.tagName.toLowerCase();
      const usableClasses = Array.from(node.classList || [])
        .filter(c => c.length <= 40 && !/\d{5,}/.test(c))
        .slice(0, 2);
      if (usableClasses.length) part += usableClasses.map(c => `.${cssIdent(c)}`).join('');

      const parent = node.parentElement || (node.parentNode instanceof ShadowRoot ? node.parentNode : null);
      if (parent) {
        try {
          if (Array.from(parent.children).filter(child => child.matches(part)).length > 1) {
            const sameTag = Array.from(parent.children).filter(x => x.tagName === node.tagName);
            part = `${node.tagName.toLowerCase()}:nth-of-type(${sameTag.indexOf(node) + 1})`;
          }
        } catch (_) {
          const sameTag = Array.from(parent.children).filter(x => x.tagName === node.tagName);
          if (sameTag.length > 1) part = `${node.tagName.toLowerCase()}:nth-of-type(${sameTag.indexOf(node) + 1})`;
        }
      }
      parts.unshift(part);
      const candidate = parts.join(' > ');
      if (queryCount(root, candidate) === 1) return candidate;
      if (!parent) break;
      node = parent;
    }
    return parts.join(' > ');
  }

  function buildLocator(el) {
    const selectors = [];
    let node = el;
    while (node) {
      const root = node.getRootNode();
      selectors.push(buildSelectorInRoot(node, root));
      if (root instanceof ShadowRoot && root.host) node = root.host;
      else break;
    }
    return { selectors: selectors.reverse() };
  }

  function fingerprintElement(el) {
    const attrs = {};
    for (const attr of ['id', 'name', 'aria-label', 'placeholder', 'data-testid', 'data-test', 'data-qa', 'role']) {
      const value = el.getAttribute?.(attr);
      if (value && value.length <= 180) attrs[attr] = value;
    }
    let editableIndex = -1;
    try { editableIndex = collectEditableRoots(document).indexOf(el); } catch (_) {}
    return {
      tag: el.tagName?.toLowerCase() || '',
      type: el.getAttribute?.('type') || '',
      attrs,
      classes: Array.from(el.classList || []).filter(c => c.length <= 48 && !/\d{5,}/.test(c)).slice(0, 5),
      editableIndex
    };
  }

  function resolveLocator(locator) {
    if (!locator?.selectors?.length) return null;
    let root = document;
    let el = null;
    for (let i = 0; i < locator.selectors.length; i++) {
      try {
        const matches = root.querySelectorAll(locator.selectors[i]);
        if (matches.length !== 1) return null;
        el = matches[0];
      } catch (_) { return null; }
      if (!el) return null;
      if (i < locator.selectors.length - 1) {
        if (!el.shadowRoot) return null;
        root = el.shadowRoot;
      }
    }
    return el;
  }

  function collectEditableRoots(root, out = [], depth = 0) {
    if (!root || depth > 8) return out;
    try {
      for (const el of root.querySelectorAll(EDITABLE_SELECTOR)) {
        if (isEditable(el)) out.push(el);
      }
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) collectEditableRoots(el.shadowRoot, out, depth + 1);
      }
    } catch (_) {}
    return out;
  }

  function fingerprintScore(el, fp, candidateIndex = -1) {
    if (!fp || !el) return -1;
    if (!fingerprintCompatible(el, fp)) return -1;
    if (!Object.entries(fp.attrs || {}).some(([attr, value]) => el.getAttribute(attr) === value)) return -1;
    let score = 0;
    const tag = el.tagName?.toLowerCase() || '';
    if (fp.tag && tag === fp.tag) score += 2;
    else if (fp.tag) score -= 2;
    if (fp.type && el.getAttribute?.('type') === fp.type) score += 2;
    for (const [attr, value] of Object.entries(fp.attrs || {})) {
      if (el.getAttribute?.(attr) === value) {
        score += attr === 'id' ? 12 : (attr.startsWith('data-') ? 9 : 6);
      }
    }
    const classes = new Set(Array.from(el.classList || []));
    for (const c of fp.classes || []) if (classes.has(c)) score += 1;
    return score;
  }

  function fingerprintCompatible(el, fp) {
    if (!fp) return true;
    if (fp.tag && el.tagName.toLowerCase() !== fp.tag) return false;
    if (el.matches('input') && (el.type || 'text') !== (fp.type || 'text').toLowerCase()) return false;
    const attrs = fp.attrs || {};
    const stable = ['id', 'name', 'data-testid', 'data-test', 'data-qa'];
    const keys = stable.some(key => attrs[key]) ? stable : ['aria-label', 'placeholder', 'role'];
    return keys.every(key => !attrs[key] || el.getAttribute(key) === attrs[key]);
  }

  function findByFingerprint(fp) {
    if (!fp) return null;
    const candidates = collectEditableRoots(document);
    let best = null;
    let bestScore = -Infinity;
    let secondScore = -Infinity;
    for (let i = 0; i < candidates.length; i++) {
      const el = candidates[i];
      const score = fingerprintScore(el, fp, i);
      if (score > bestScore) {
        secondScore = bestScore;
        bestScore = score;
        best = el;
      } else if (score > secondScore) {
        secondScore = score;
      }
    }
    // Chỉ tự nhận diện khi ứng viên đủ mạnh và không hòa điểm với một ô khác.
    return bestScore >= 6 && bestScore > secondScore ? best : null;
  }

  function resolveTarget(locator, fingerprint, targetId = null) {
    if (targetId) {
      const live = liveTargets.get(targetId);
      if (live?.isConnected && isEditable(live)) {
        return { el: live, updatedLocator: null, updatedFingerprint: null };
      }
      if (live) liveTargets.delete(targetId);
    }

    let el = resolveLocator(locator);
    if (el && isEditable(el) && fingerprintCompatible(el, fingerprint)) {
      if (targetId) liveTargets.set(targetId, el);
      return { el, updatedLocator: null, updatedFingerprint: null };
    }

    el = findByFingerprint(fingerprint);
    if (!el || !isEditable(el)) return { el: null, updatedLocator: null, updatedFingerprint: null };
    if (targetId) liveTargets.set(targetId, el);
    return { el, updatedLocator: buildLocator(el), updatedFingerprint: fingerprintElement(el) };
  }

  function labelFor(el, adapterLabel = '') {
    if (adapterLabel) return adapterLabel;
    const label = el.labels?.[0]?.innerText?.trim();
    if (label) return label.slice(0, 80);
    for (const attr of ['aria-label', 'placeholder', 'name', 'data-testid']) {
      const value = el.getAttribute?.(attr)?.trim();
      if (value) return value.slice(0, 80);
    }
    if (el.closest?.('.monaco-editor')) return 'Monaco Editor';
    if (el.closest?.('.CodeMirror, .cm-editor')) return 'CodeMirror Editor';
    if (el.closest?.('.ace_editor')) return 'Ace Editor';
    if (el.closest?.('.ql-container')) return 'Quill Editor';
    if (el.closest?.('.ProseMirror')) return 'ProseMirror Editor';
    if (el.isContentEditable) return tr('page.editor');
    return tr(el.matches('textarea') ? 'page.textarea' : 'page.input');
  }

  function deepActiveElement() {
    let active = document.activeElement;
    while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
    return active;
  }

  function rememberCaret() {
    const active = deepActiveElement();
    if (active && active.matches?.('input, textarea') && !isPassword(active)) {
      const valueLength = (active.value || '').length;
      inputSelections.set(active, {
        start: typeof active.selectionStart === 'number' ? active.selectionStart : valueLength,
        end: typeof active.selectionEnd === 'number' ? active.selectionEnd : valueLength
      });
    }

    const sel = window.getSelection?.();
    if (sel?.rangeCount) {
      const range = sel.getRangeAt(0);
      const host = editableAncestor(range.commonAncestorContainer);
      if (host?.isContentEditable) {
        try { contentRanges.set(host, range.cloneRange()); } catch (_) {}
      }
    }
  }

  document.addEventListener('selectionchange', rememberCaret, true);
  document.addEventListener('keyup', rememberCaret, true);
  document.addEventListener('mouseup', rememberCaret, true);
  document.addEventListener('input', rememberCaret, true);
  document.addEventListener('focusin', rememberCaret, true);

  function dispatchInput(el, inputType = 'insertText', data = null) {
    try {
      el.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType, data }));
    } catch (_) {
      el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    }
    try { el.dispatchEvent(new Event('change', { bubbles: true, composed: true })); } catch (_) {}
  }

  function setNativeValue(el, value) {
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
    if (descriptor?.set) descriptor.set.call(el, value);
    else el.value = value;
  }

  function snapshot(el) {
    if (el.matches?.('input, textarea')) {
      return {
        type: 'input',
        value: el.value ?? '',
        start: typeof el.selectionStart === 'number' ? el.selectionStart : null,
        end: typeof el.selectionEnd === 'number' ? el.selectionEnd : null
      };
    }
    return { type: 'contenteditable', html: el.innerHTML };
  }

  function matchesSnapshot(el, snap) {
    if (!snap) return false;
    if (snap.type === 'input') return (el.value ?? '') === snap.value;
    return el.innerHTML === snap.html;
  }

  function pushUndo(el, before, after) {
    const stack = undoStacks.get(el) || [];
    stack.push({ before, after, at: Date.now() });
    if (stack.length > 10) stack.shift();
    undoStacks.set(el, stack);
  }

  function prepareInputSelection(el, mode) {
    const current = el.value ?? '';
    let start = current.length;
    let end = current.length;
    const remembered = inputSelections.get(el);
    if (mode === 'replace') {
      start = 0; end = current.length;
    } else if (mode === 'append') {
      start = current.length; end = current.length;
    } else if (typeof el.selectionStart === 'number') {
      start = el.selectionStart; end = el.selectionEnd;
    } else if (remembered) {
      start = remembered.start; end = remembered.end;
    }
    start = Math.min(current.length, Math.max(0, start));
    end = Math.min(current.length, Math.max(start, end));
    try { el.setSelectionRange(start, end); } catch (_) {}
    return { current, start, end };
  }

  function tryExecInsert(el, text) {
    try {
      el.focus({ preventScroll: true });
      return Boolean(document.execCommand?.('insertText', false, text));
    } catch (_) {
      return false;
    }
  }

  function insertIntoInput(el, text, mode, separator) {
    const before = snapshot(el);
    const prepared = prepareInputSelection(el, mode);
    const insertText = mode === 'append' && prepared.current && separator ? separator + text : text;
    const next = prepared.current.slice(0, prepared.start) + insertText + prepared.current.slice(prepared.end);
    // Validate before changing the live control: number fields sanitize invalid text to empty.
    const probe = el.cloneNode(false);
    setNativeValue(probe, next);
    if (el.type === 'number' && probe.value !== next) throw new Error(tr('page.numberInvalid'));
    if (el.maxLength >= 0 && probe.value.length > el.maxLength) throw new Error(tr('page.maxLength', { count: el.maxLength }));
    const expected = probe.value;
    const supportsSelection = typeof el.selectionStart === 'number';
    let inserted = supportsSelection && tryExecInsert(el, insertText);
    if (!inserted) {
      const caret = Math.min(expected.length, prepared.start + insertText.length);
      setNativeValue(el, expected);
      try { el.focus({ preventScroll: true }); } catch (_) { el.focus(); }
      try { el.setSelectionRange(caret, caret); } catch (_) {}
      dispatchInput(el, 'insertText', text);
    }
    if (el.value !== expected) throw new Error(tr('page.rejected'));

    rememberCaret();
    const after = snapshot(el);
    pushUndo(el, before, after);
  }

  function setContentRange(el, mode) {
    const sel = window.getSelection();
    if (!sel) return;
    sel.removeAllRanges();
    let range;
    if (mode === 'cursor') {
      const remembered = contentRanges.get(el);
      if (remembered && el.contains(remembered.commonAncestorContainer)) {
        try { range = remembered.cloneRange(); } catch (_) {}
      }
    }
    if (!range) {
      range = document.createRange();
      range.selectNodeContents(el);
      if (mode !== 'replace') range.collapse(false);
    }
    sel.addRange(range);
  }

  function fallbackContentInsert(el, text, mode, separator) {
    const sel = window.getSelection();
    let range = sel?.rangeCount ? sel.getRangeAt(0) : null;
    if (mode === 'replace') {
      el.textContent = text;
      placeCaretAtEnd(el);
      dispatchInput(el, 'insertText', text);
      return;
    }
    if (mode === 'append') {
      if (el.textContent && separator) el.appendChild(document.createTextNode(separator));
      el.appendChild(document.createTextNode(text));
      placeCaretAtEnd(el);
      dispatchInput(el, 'insertText', text);
      return;
    }
    if (!range || !el.contains(range.commonAncestorContainer)) {
      range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
    }
    range.deleteContents();
    const node = document.createTextNode(text);
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    sel?.removeAllRanges();
    sel?.addRange(range);
    try { contentRanges.set(el, range.cloneRange()); } catch (_) {}
    dispatchInput(el, 'insertText', text);
  }

  function insertIntoContentEditable(el, text, mode, separator) {
    const before = snapshot(el);
    try { el.focus({ preventScroll: true }); } catch (_) { el.focus(); }
    setContentRange(el, mode);
    const insertText = mode === 'append' && el.textContent && separator ? separator + text : text;
    const inserted = tryExecInsert(el, insertText);
    if (!inserted) fallbackContentInsert(el, text, mode, separator);
    rememberCaret();
    const after = snapshot(el);
    pushUndo(el, before, after);
  }

  function placeCaretAtEnd(el) {
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection?.();
    sel?.removeAllRanges();
    sel?.addRange(range);
    try { contentRanges.set(el, range.cloneRange()); } catch (_) {}
  }

  function undoLast(el) {
    const stack = undoStacks.get(el) || [];
    const item = stack[stack.length - 1];
    if (!item) return { ok: false, error: tr('page.noUndo') };
    if (!matchesSnapshot(el, item.after)) {
      return { ok: false, error: tr('page.undoChanged') };
    }

    try { el.focus({ preventScroll: true }); } catch (_) { el.focus(); }
    // Browser undo is document-wide and can undo typing in a different control.
    // Restore only the recorded target after checking it has not been edited.
    {
      if (item.before.type === 'input') {
        setNativeValue(el, item.before.value);
        try {
          if (item.before.start != null) el.setSelectionRange(item.before.start, item.before.end ?? item.before.start);
        } catch (_) {}
      } else {
        el.innerHTML = item.before.html;
        placeCaretAtEnd(el);
      }
      dispatchInput(el, 'historyUndo', null);
    }
    stack.pop();
    undoStacks.set(el, stack);
    rememberCaret();
    return { ok: true };
  }

  function flash(el, tone = 'success', scroll = false) {
    if (scroll) {
      try { el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' }); } catch (_) {}
    }
    const visual = adapterForElement(el)?.visual || el;
    const previous = flashStates.get(visual);
    if (previous) clearTimeout(previous.timer);
    const oldOutline = previous ? previous.oldOutline : visual.style.outline;
    const oldOffset = previous ? previous.oldOffset : visual.style.outlineOffset;
    const color = tone === 'error' ? '#ef4444' : '#22c55e';
    visual.style.outline = `3px solid ${color}`;
    visual.style.outlineOffset = '3px';
    const timer = setTimeout(() => {
      visual.style.outline = oldOutline;
      visual.style.outlineOffset = oldOffset;
      flashStates.delete(visual);
    }, 850);
    flashStates.set(visual, { timer, oldOutline, oldOffset });
  }

  let noticeTimer = null;
  let noticeRemovalTimer = null;
  function showNotice(text, tone = 'success') {
    if (!text) return;
    let box = document.getElementById('__quickpaste_notice');
    if (!box) {
      box = document.createElement('div');
      box.id = '__quickpaste_notice';
      box.style.cssText = [
        'position:fixed','right:16px','bottom:16px','z-index:2147483647',
        'max-width:min(360px,calc(100vw - 32px))','padding:10px 13px','border-radius:12px',
        'font:600 13px/1.35 system-ui,-apple-system,Segoe UI,sans-serif','color:white',
        'box-shadow:0 10px 30px rgba(0,0,0,.22)','pointer-events:none','transition:opacity .15s ease'
      ].join(';');
      document.documentElement.appendChild(box);
    }
    box.style.background = tone === 'error' ? '#b91c1c' : tone === 'neutral' ? '#475569' : '#15803d';
    box.style.opacity = '1';
    box.textContent = text;
    clearTimeout(noticeTimer);
    clearTimeout(noticeRemovalTimer);
    noticeTimer = setTimeout(() => {
      box.style.opacity = '0';
      noticeRemovalTimer = setTimeout(() => box.remove(), 180);
    }, tone === 'error' ? 3200 : 1700);
  }

  function getCopiedText(event) {
    const active = deepActiveElement();
    if (active && isPassword(active)) return { text: '', blocked: true, sourceEl: active };
    if (active?.matches?.('input, textarea') && typeof active.selectionStart === 'number') {
      const start = active.selectionStart;
      const end = active.selectionEnd;
      if (end > start) return { text: active.value.slice(start, end), blocked: false, sourceEl: active };
    }
    const selection = window.getSelection?.();
    const selected = selection?.toString() || '';
    if (selected) {
      let sourceEl = null;
      if (selection?.rangeCount) {
        try { sourceEl = editableAncestor(selection.getRangeAt(0).commonAncestorContainer); } catch (_) {}
      }
      return { text: selected, blocked: false, sourceEl };
    }
    const clipboardText = event.clipboardData?.getData?.('text/plain') || '';
    const eventEditable = targetFromEvent(event)?.el || null;
    return { text: clipboardText, blocked: false, sourceEl: eventEditable };
  }

  function captureCopyCut(event) {
    if (selecting || event.isTrusted === false) return;
    const copied = getCopiedText(event);
    if (copied.blocked || !copied.text) return;
    let sourceLocator = null;
    let sourceFingerprint = null;
    if (copied.sourceEl && isEditable(copied.sourceEl)) {
      try { sourceLocator = buildLocator(copied.sourceEl); } catch (_) {}
      try { sourceFingerprint = fingerprintElement(copied.sourceEl); } catch (_) {}
    }
    // An extension reload invalidates existing content scripts synchronously.
    try { chrome.runtime.sendMessage({
      type: 'QUICKPASTE_TEXT_CAPTURED',
      text: copied.text,
      action: event.type,
      sourceLocator,
      sourceFingerprint
    }).then(result => {
      if (!result?.showFeedback) return;
      if (result.ok) {
        const suffix = result.targetLabel ? ` → ${result.targetLabel}` : '';
        const partialNote = result.failedCount ? tr('page.partial', { count: result.failedCount }) : '';
        const pauseNote = result.pausedAfterSend ? tr('page.paused') : '';
        showNotice(tr('page.sentNotice', { count: result.chars || copied.text.length, target: suffix, partial: partialNote, paused: pauseNote }), result.failedCount ? 'neutral' : 'success');
      } else if (result.error) {
        showNotice(`QuickPaste: ${result.error}`, 'error');
      }
    }).catch(() => {}); } catch (_) {}
  }

  document.addEventListener('copy', captureCopyCut, true);
  document.addEventListener('cut', captureCopyCut, true);

  function createGuide() {
    overlay = document.createElement('div');
    overlay.id = '__quickpaste_overlay';
    overlay.style.cssText = [
      'position:fixed','inset:0','z-index:2147483645','pointer-events:none',
      'box-shadow:inset 0 0 0 3px rgba(37,99,235,.68)'
    ].join(';');
    document.documentElement.appendChild(overlay);

    if (isTopFrame) {
      tooltip = document.createElement('div');
      tooltip.id = '__quickpaste_tooltip';
      tooltip.style.cssText = [
        'position:fixed','top:16px','left:50%','transform:translateX(-50%)','z-index:2147483647',
        'background:#111827','color:white','font:600 14px/1.4 system-ui,-apple-system,Segoe UI,sans-serif',
        'padding:10px 14px','border-radius:12px','box-shadow:0 10px 30px rgba(0,0,0,.25)',
        'pointer-events:none','max-width:min(560px,calc(100vw - 32px))','text-align:center'
      ].join(';');
      tooltip.innerHTML = tr('page.pickIntro');
      document.documentElement.appendChild(tooltip);
    }
  }

  function restoreHighlight() {
    if (!highlighted) return;
    const { visual } = highlighted;
    if (visual) {
      visual.style.outline = highlighted.oldOutline || '';
      visual.style.outlineOffset = highlighted.oldOffset || '';
    }
    highlighted = null;
  }

  function cleanupSelection() {
    selecting = false;
    restoreHighlight();
    overlay?.remove();
    tooltip?.remove();
    overlay = null;
    tooltip = null;
    document.removeEventListener('mousemove', onSelectMove, true);
    document.removeEventListener('click', onSelectClick, true);
    document.removeEventListener('keydown', onSelectKey, true);
  }

  function highlight(target) {
    const visual = target?.visual || target?.el || null;
    if (highlighted?.visual === visual) return;
    restoreHighlight();
    if (!visual) return;
    highlighted = { visual, oldOutline: visual.style.outline, oldOffset: visual.style.outlineOffset };
    visual.style.outline = '3px solid #2563eb';
    visual.style.outlineOffset = '3px';
  }

  function onSelectMove(event) {
    const target = targetFromEvent(event);
    highlight(target);
    if (tooltip) {
      tooltip.innerHTML = target?.el
        ? tr('page.pickUse', { label: escapeHtml(labelFor(target.el, target.adapterLabel)) })
        : tr('page.pickMove');
    }
  }

  function onSelectClick(event) {
    const target = targetFromEvent(event);
    if (!target?.el) return;
    event.stopImmediatePropagation();
    const el = target.el;
    const payload = {
      type: 'QUICKPASTE_TARGET_SELECTED',
      locator: buildLocator(el),
      fingerprint: fingerprintElement(el),
      label: labelFor(el, target.adapterLabel),
      frameUrl: location.href,
      documentToken
    };
    cleanupSelection();
    chrome.runtime.sendMessage(payload).then(result => {
      if (result?.ok) {
        if (result.target?.id) liveTargets.set(result.target.id, el);
        flash(el, 'success');
        showNotice(tr('page.targetSaved'), 'success');
        setTimeout(rememberCaret, 0);
      } else {
        showNotice(result?.error || tr('page.saveTargetFailed'), 'error');
      }
    }).catch(() => showNotice(tr('page.saveTargetFailed'), 'error'));
  }

  function onSelectKey(event) {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    cleanupSelection();
    chrome.runtime.sendMessage({ type: 'QUICKPASTE_CANCEL_PICK' }).catch(() => {});
    if (isTopFrame) showNotice(tr('page.pickCancelled'), 'neutral');
  }

  function escapeHtml(text) {
    return String(text).replace(/[&<>'"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch]));
  }

  function startSelecting() {
    if (selecting) return;
    cleanupSelection();
    selecting = true;
    createGuide();
    document.addEventListener('mousemove', onSelectMove, true);
    document.addEventListener('click', onSelectClick, true);
    document.addEventListener('keydown', onSelectKey, true);
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.expectedDocumentToken && message.expectedDocumentToken !== documentToken) {
      sendResponse({ ok: false, error: tr('page.documentChanged') });
      return;
    }
    if (message?.type === 'QUICKPASTE_START_SELECTING') {
      startSelecting();
      sendResponse({ ok: true });
      return;
    }

    if (message?.type === 'QUICKPASTE_STOP_SELECTING') {
      cleanupSelection();
      sendResponse({ ok: true });
      return;
    }

    if (message?.type === 'QUICKPASTE_SHOW_NOTICE') {
      showNotice(message.text, message.tone || 'success');
      sendResponse({ ok: true });
      return;
    }

    if (message?.type === 'QUICKPASTE_INSERT_TEXT') {
      try {
        if (message.transferId && completedTransfers.has(message.transferId)) {
          sendResponse(completedTransfers.get(message.transferId));
          return;
        }
        if (typeof message.text !== 'string' || !message.text) return sendResponse({ ok: false, error: tr('page.invalidText') });
        const resolved = resolveTarget(message.locator, message.fingerprint, message.targetId || null);
        const el = resolved.el;
        if (!el) {
          sendResponse({ ok: false, error: tr('page.targetMissing') });
          return;
        }
        if (isPassword(el)) {
          sendResponse({ ok: false, error: tr('page.password') });
          return;
        }
        if (el.matches('input, textarea')) {
          insertIntoInput(el, message.text, message.mode || 'cursor', message.separator ?? '\n');
        } else {
          insertIntoContentEditable(el, message.text, message.mode || 'cursor', message.separator ?? '\n');
        }
        flash(el, 'success');
        const result = {
          ok: true,
          updatedLocator: resolved.updatedLocator,
          updatedFingerprint: resolved.updatedFingerprint,
          documentToken
        };
        if (message.transferId) {
          completedTransfers.set(message.transferId, result);
          if (completedTransfers.size > 200) completedTransfers.delete(completedTransfers.keys().next().value);
        }
        sendResponse(result);
      } catch (error) {
        sendResponse({ ok: false, error: String(error?.message || error) });
      }
      return true;
    }

    if (message?.type === 'QUICKPASTE_UNDO_LAST') {
      try {
        const resolved = resolveTarget(message.locator, message.fingerprint, message.targetId || null);
        if (!resolved.el) return sendResponse({ ok: false, error: tr('page.targetGone') });
        const result = undoLast(resolved.el);
        if (result.ok) flash(resolved.el, 'success');
        sendResponse(result);
      } catch (error) {
        sendResponse({ ok: false, error: String(error?.message || error) });
      }
      return;
    }

    if (message?.type === 'QUICKPASTE_FLASH_TARGET') {
      const resolved = resolveTarget(message.locator, message.fingerprint, message.targetId || null);
      if (!resolved.el) return sendResponse({ ok: false, error: tr('page.targetGone') });
      flash(resolved.el, 'success', true);
      try { resolved.el.focus({ preventScroll: true }); } catch (_) {}
      sendResponse({ ok: true, updatedLocator: resolved.updatedLocator, updatedFingerprint: resolved.updatedFingerprint, documentToken });
      return;
    }

    if (message?.type === 'QUICKPASTE_IDENTIFY_DOCUMENT') {
      sendResponse({ ok: true, documentToken, frameUrl: location.href });
      return;
    }

    if (message?.type === 'QUICKPASTE_PING_TARGET') {
      const resolved = resolveTarget(message.locator, message.fingerprint, message.targetId || null);
      sendResponse(resolved.el ? {
        ok: true,
        updatedLocator: resolved.updatedLocator,
        updatedFingerprint: resolved.updatedFingerprint,
        documentToken
      } : { ok: false, error: tr('page.targetNotFound'), documentToken });
      return;
    }
  });
})();
