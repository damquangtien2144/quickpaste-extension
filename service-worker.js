if (typeof importScripts === 'function') importScripts('i18n.js');
const languageReady = globalThis.QuickPasteI18n?.load?.() || Promise.resolve('vi');
const tr = (key, vars) => globalThis.QuickPasteI18n?.t?.(key, vars) || key;

const DEFAULT_SETTINGS = {
  enabled: true,
  scope: 'any',                 // any | same | cross
  mode: 'cursor',               // cursor | append | replace
  separator: '\n',
  feedback: true,
  preventDuplicates: true,
  duplicateWindowMs: 900,
  autoReconnect: true,
  rememberLastInSession: true,
  trimCopiedText: false,
  oneShot: false,
  broadcastEnabled: false,
  websiteProfilesEnabled: true
};

const MAX_TARGETS = 20;
const MAX_ACTIVITY = 8;
const MAX_SESSION_REPLAY_CHARS = 250000;
let operationQueue = Promise.resolve();

// Storage read/modify/write operations must share one queue, including UI actions.
function enqueueOperation(task) {
  const result = operationQueue.catch(() => {}).then(async () => {
    await languageReady;
    return task();
  });
  operationQueue = result.catch(() => {});
  return result;
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function id() {
  try { return crypto.randomUUID(); } catch (_) {
    return `qp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  }
}

function normalizeUrl(raw = '') {
  try {
    const url = new URL(raw);
    url.hash = '';
    return url.href;
  } catch (_) {
    return raw || '';
  }
}

function urlOriginPath(raw = '') {
  try {
    const url = new URL(raw);
    return `${url.origin}${url.pathname}${url.search}`;
  } catch (_) {
    return raw || '';
  }
}

function sameOrigin(a = '', b = '') {
  try { return new URL(a).origin === new URL(b).origin; }
  catch (_) { return false; }
}

function hostOf(raw = '') {
  try { return new URL(raw).hostname || new URL(raw).protocol; }
  catch (_) { return ''; }
}

function siteKeyFromUrl(raw = '') {
  try {
    const url = new URL(raw);
    if (!/^https?:$/.test(url.protocol)) return '';
    return url.origin;
  } catch (_) { return ''; }
}

function locatorKey(locator) {
  try { return JSON.stringify(locator || null); }
  catch (_) { return String(locator || ''); }
}

function strongFingerprintKey(fp) {
  if (!fp) return '';
  const attrs = fp.attrs || {};
  for (const attr of ['id', 'data-testid', 'data-test', 'data-qa']) {
    if (attrs[attr]) return `${fp.tag || ''}|${attr}|${attrs[attr]}`;
  }
  return '';
}

function hashText(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function isSupportedPageUrl(url = '') {
  return /^(https?:|file:)/i.test(url);
}

async function migrateLegacyIfNeeded() {
  const data = await chrome.storage.local.get([
    'quickpasteTargets', 'quickpasteActiveTargetId', 'quickpasteTarget',
    'quickpasteSettings', 'quickpasteStats', 'quickpasteActivity',
    'quickpasteBroadcastTargetIds', 'quickpasteSiteProfiles'
  ]);

  const writes = {};
  if (!Array.isArray(data.quickpasteTargets)) {
    const targets = [];
    if (data.quickpasteTarget?.selector) {
      const legacy = data.quickpasteTarget;
      const pageUrl = normalizeUrl(legacy.url || '');
      const migrated = {
        id: id(),
        tabId: legacy.tabId,
        frameId: 0,
        locator: { selectors: [legacy.selector] },
        fingerprint: null,
        label: legacy.label || tr('worker.selectedInput'),
        pageUrl,
        frameUrl: pageUrl,
        profileKey: siteKeyFromUrl(pageUrl),
        documentToken: null,
        title: legacy.title || '',
        createdAt: legacy.savedAt || Date.now(),
        updatedAt: Date.now(),
        lastUsedAt: legacy.savedAt || Date.now()
      };
      targets.push(migrated);
      writes.quickpasteActiveTargetId = migrated.id;
    }
    writes.quickpasteTargets = targets;
  }

  if (!data.quickpasteSettings) writes.quickpasteSettings = DEFAULT_SETTINGS;
  if (!data.quickpasteStats) {
    writes.quickpasteStats = {
      transferCount: 0,
      lastTransferAt: 0,
      lastChars: 0,
      lastTargetLabel: '',
      lastSourceHost: '',
      lastError: '',
      lastErrorAt: 0
    };
  }
  if (!Array.isArray(data.quickpasteActivity)) writes.quickpasteActivity = [];
  if (!Array.isArray(data.quickpasteBroadcastTargetIds)) writes.quickpasteBroadcastTargetIds = [];

  // Nâng cấp 2.0.x → 2.1: tạo Profile cho các đích đã lưu sẵn đúng một lần.
  // Nếu người dùng chủ động xóa Profile, storage sẽ là {} nên không tự tạo lại.
  if (data.quickpasteSiteProfiles == null) {
    const baseTargets = Array.isArray(writes.quickpasteTargets)
      ? writes.quickpasteTargets
      : (Array.isArray(data.quickpasteTargets) ? data.quickpasteTargets : []);
    let changed = false;
    const upgradedTargets = baseTargets.map(t => {
      if (Object.prototype.hasOwnProperty.call(t, 'profileKey')) return t;
      changed = true;
      return { ...t, profileKey: siteKeyFromUrl(t.pageUrl || t.frameUrl || '') };
    });
    if (changed) writes.quickpasteTargets = upgradedTargets;
    const profiles = {};
    for (const target of [...upgradedTargets].sort((a, b) => (a.lastUsedAt || a.updatedAt || 0) - (b.lastUsedAt || b.updatedAt || 0))) {
      const key = target.profileKey || siteKeyFromUrl(target.pageUrl || target.frameUrl || '');
      if (!key) continue;
      profiles[key] = {
        key,
        targetId: target.id,
        label: target.label || tr('target.default'),
        locator: target.locator,
        fingerprint: target.fingerprint || null,
        frameUrl: target.frameUrl || '',
        frameId: Number(target.frameId || 0),
        title: target.title || '',
        updatedAt: target.updatedAt || target.lastUsedAt || Date.now()
      };
    }
    writes.quickpasteSiteProfiles = profiles;
  } else if (typeof data.quickpasteSiteProfiles !== 'object' || Array.isArray(data.quickpasteSiteProfiles)) {
    writes.quickpasteSiteProfiles = {};
  }

  if (Object.keys(writes).length) await chrome.storage.local.set(writes);
  if (data.quickpasteTarget) await chrome.storage.local.remove('quickpasteTarget');
}

async function getState() {
  await migrateLegacyIfNeeded();
  const data = await chrome.storage.local.get([
    'quickpasteTargets', 'quickpasteActiveTargetId', 'quickpasteSettings',
    'quickpasteStats', 'quickpasteActivity', 'quickpasteBroadcastTargetIds',
    'quickpasteSiteProfiles'
  ]);
  const targets = Array.isArray(data.quickpasteTargets) ? data.quickpasteTargets : [];
  const targetIds = new Set(targets.map(t => t.id));
  let activeTargetId = data.quickpasteActiveTargetId || null;
  if (activeTargetId && !targetIds.has(activeTargetId)) activeTargetId = null;
  if (!activeTargetId && targets.length) activeTargetId = targets[0].id;

  const rawBroadcast = Array.isArray(data.quickpasteBroadcastTargetIds) ? data.quickpasteBroadcastTargetIds : [];
  const broadcastTargetIds = [...new Set(rawBroadcast.filter(x => targetIds.has(x)))];
  const siteProfiles = data.quickpasteSiteProfiles && typeof data.quickpasteSiteProfiles === 'object' && !Array.isArray(data.quickpasteSiteProfiles)
    ? data.quickpasteSiteProfiles : {};

  const writes = {};
  if (activeTargetId !== data.quickpasteActiveTargetId) writes.quickpasteActiveTargetId = activeTargetId;
  if (broadcastTargetIds.length !== rawBroadcast.length || broadcastTargetIds.some((x, i) => x !== rawBroadcast[i])) {
    writes.quickpasteBroadcastTargetIds = broadcastTargetIds;
  }
  if (Object.keys(writes).length) await chrome.storage.local.set(writes);

  const settings = { ...DEFAULT_SETTINGS, ...(data.quickpasteSettings || {}) };
  const activeTarget = targets.find(t => t.id === activeTargetId) || null;
  return {
    targets,
    activeTargetId,
    activeTarget,
    broadcastTargetIds,
    siteProfiles,
    settings,
    stats: data.quickpasteStats || {},
    activity: Array.isArray(data.quickpasteActivity) ? data.quickpasteActivity : []
  };
}

async function saveTargets(targets, activeTargetId) {
  const targetIds = new Set(targets.map(t => t.id));
  const data = await chrome.storage.local.get(['quickpasteBroadcastTargetIds', 'quickpasteSiteProfiles']);
  const broadcastTargetIds = (Array.isArray(data.quickpasteBroadcastTargetIds) ? data.quickpasteBroadcastTargetIds : [])
    .filter(x => targetIds.has(x));
  const profiles = data.quickpasteSiteProfiles && typeof data.quickpasteSiteProfiles === 'object' ? { ...data.quickpasteSiteProfiles } : {};
  for (const [key, profile] of Object.entries(profiles)) {
    if (!profile?.targetId || !targetIds.has(profile.targetId)) delete profiles[key];
  }
  await chrome.storage.local.set({
    quickpasteTargets: targets,
    quickpasteActiveTargetId: activeTargetId || null,
    quickpasteBroadcastTargetIds: broadcastTargetIds,
    quickpasteSiteProfiles: profiles
  });
  await updateBadge();
}

async function patchTarget(targetId, patch) {
  const state = await getState();
  const targets = state.targets.map(t => t.id === targetId ? { ...t, ...patch, updatedAt: Date.now() } : t);
  const updated = targets.find(t => t.id === targetId) || null;
  const writes = { quickpasteTargets: targets };
  if (updated?.profileKey && state.siteProfiles?.[updated.profileKey]?.targetId === updated.id) {
    writes.quickpasteSiteProfiles = {
      ...state.siteProfiles,
      [updated.profileKey]: {
        ...state.siteProfiles[updated.profileKey],
        targetId: updated.id,
        label: updated.label,
        locator: updated.locator,
        fingerprint: updated.fingerprint || null,
        frameUrl: updated.frameUrl || '',
        frameId: Number(updated.frameId || 0),
        title: updated.title || '',
        updatedAt: Date.now()
      }
    };
  }
  await chrome.storage.local.set(writes);
  return updated;
}

async function markActivity({ sourceUrl, target, text, action = 'copy' }) {
  const state = await getState();
  const now = Date.now();
  const nextStats = {
    ...(state.stats || {}),
    transferCount: Number(state.stats?.transferCount || 0) + 1,
    lastTransferAt: now,
    lastChars: text.length,
    lastTargetLabel: target?.label || '',
    lastSourceHost: hostOf(sourceUrl),
    lastError: '',
    lastErrorAt: 0
  };
  const item = {
    id: id(),
    at: now,
    sourceHost: hostOf(sourceUrl) || tr('activity.source'),
    targetLabel: target?.label || tr('target.default'),
    chars: text.length,
    action
  };
  const activity = [item, ...(state.activity || [])].slice(0, MAX_ACTIVITY);
  await chrome.storage.local.set({ quickpasteStats: nextStats, quickpasteActivity: activity });
}

async function markError(error) {
  const state = await getState();
  await chrome.storage.local.set({
    quickpasteStats: {
      ...(state.stats || {}),
      lastError: String(error || tr('worker.unknownError')),
      lastErrorAt: Date.now()
    }
  });
}

async function updateBadge() {
  try {
    const state = await getState();
    if (!state.settings.enabled) {
      await chrome.action.setBadgeText({ text: 'OFF' });
      await chrome.action.setBadgeBackgroundColor({ color: '#6b7280' });
      await chrome.action.setTitle({ title: tr('worker.badgePaused') });
      return;
    }
    if (state.settings.broadcastEnabled) {
      const count = state.broadcastTargetIds.length;
      await chrome.action.setBadgeText({ text: count ? `B${count}` : 'B0' });
      await chrome.action.setBadgeBackgroundColor({ color: count ? '#7c3aed' : '#f59e0b' });
      await chrome.action.setTitle({ title: count ? tr('worker.badgeBroadcast', { count }) : tr('worker.badgeBroadcastEmpty') });
      return;
    }
    if (!state.activeTarget) {
      await chrome.action.setBadgeText({ text: '!' });
      await chrome.action.setBadgeBackgroundColor({ color: '#f59e0b' });
      await chrome.action.setTitle({ title: tr('worker.badgeNoTarget') });
      return;
    }
    await chrome.action.setBadgeText({ text: 'ON' });
    await chrome.action.setBadgeBackgroundColor({ color: '#16a34a' });
    await chrome.action.setTitle({ title: tr('worker.badgeTarget', { target: state.activeTarget.label || tr('target.default') }) });
  } catch (_) {}
}

async function createContextMenus() {
  try { await chrome.contextMenus.removeAll(); } catch (_) {}
  chrome.contextMenus.create({
    id: 'quickpaste-send-selection',
    title: tr('menu.sendSelection'),
    contexts: ['selection']
  });
  chrome.contextMenus.create({
    id: 'quickpaste-pick-target',
    title: tr('menu.pickTarget'),
    contexts: ['page', 'editable']
  });
}

async function frameCandidates(tabId) {
  try {
    const frames = await chrome.webNavigation.getAllFrames({ tabId });
    return Array.isArray(frames) ? frames : [];
  } catch (_) {
    return [];
  }
}

async function sendToFrame(tabId, frameId, message) {
  return chrome.tabs.sendMessage(tabId, message, { frameId });
}

async function broadcastToFrames(tabId, message) {
  const frames = await frameCandidates(tabId);
  const frameIds = frames.length ? frames.map(f => f.frameId) : [0];
  const results = await Promise.allSettled(frameIds.map(frameId => sendToFrame(tabId, frameId, message)));
  return results.some(r => r.status === 'fulfilled' && r.value?.ok === true);
}

async function startSelectingInTab(tabId) {
  let tab;
  try { tab = await chrome.tabs.get(tabId); } catch (_) {}
  if (!tab?.id || !isSupportedPageUrl(tab.url || '')) {
    return { ok: false, error: tr('worker.unsupportedPage') };
  }
  const ok = await broadcastToFrames(tabId, { type: 'QUICKPASTE_START_SELECTING' });
  return ok
    ? { ok: true }
    : { ok: false, error: tr('worker.pageNotConnected') };
}

async function stopSelectingInTab(tabId) {
  try { await broadcastToFrames(tabId, { type: 'QUICKPASTE_STOP_SELECTING' }); } catch (_) {}
}

function sameTargetSource(target, source) {
  const sameFrame = source?.tabId === target?.tabId &&
    Number(source?.frameId ?? 0) === Number(target?.frameId ?? 0);
  if (!sameFrame) return false;
  return Boolean(source?.sourceLocator && locatorKey(source.sourceLocator) === locatorKey(target.locator));
}

async function findReconnectTab(target, settings = DEFAULT_SETTINGS) {
  const tabs = await chrome.tabs.query({});
  const targetUrl = normalizeUrl(target.pageUrl || '');
  const targetPath = urlOriginPath(target.pageUrl || '');
  const exact = tabs.filter(t => normalizeUrl(t.url || '') === targetUrl);
  if (exact.length === 1) return { tab: exact[0], ambiguous: false };
  if (exact.length > 1) return { tab: null, ambiguous: true };
  const pathMatches = tabs.filter(t => urlOriginPath(t.url || '') === targetPath);
  if (pathMatches.length === 1) return { tab: pathMatches[0], ambiguous: false };
  if (pathMatches.length > 1) return { tab: null, ambiguous: true };

  if (settings.websiteProfilesEnabled !== false && target.profileKey) {
    const siteMatches = tabs.filter(t => siteKeyFromUrl(t.url || '') === target.profileKey);
    if (siteMatches.length === 1) return { tab: siteMatches[0], ambiguous: false, viaProfile: true };
    if (siteMatches.length > 1) return { tab: null, ambiguous: true };
  }
  return { tab: null, ambiguous: false };
}

async function resolveFrameForTarget(tabId, target) {
  if (Number(target.frameId || 0) === 0) return 0;
  const frames = await frameCandidates(tabId);
  const matches = frames.filter(f => f.frameId !== 0 && normalizeUrl(f.url || '') === normalizeUrl(target.frameUrl || ''));
  // Frame IDs are only meaningful in their original tab.
  const original = tabId === target.tabId && matches.find(f => f.frameId === target.frameId);
  if (original) return original.frameId;
  if (matches.length === 1) return matches[0].frameId;
  if (target.documentToken) {
    for (const frame of frames.filter(f => f.frameId !== 0)) {
      try {
        const ident = await sendToFrame(tabId, frame.frameId, { type: 'QUICKPASTE_IDENTIFY_DOCUMENT' });
        if (ident?.documentToken === target.documentToken) return frame.frameId;
      } catch (_) {}
    }
  }
  return null;
}

async function resolveTarget(target, settings = DEFAULT_SETTINGS) {
  if (!target) return { ok: false, error: tr('worker.noTarget') };
  let tab = null;
  try { tab = await chrome.tabs.get(target.tabId); } catch (_) {}

  // Nếu URL đổi nhưng vẫn là cùng document (SPA), giữ đích. Nếu là document khác thì không paste nhầm.
  if (tab && target.pageUrl && normalizeUrl(tab.url || '') !== normalizeUrl(target.pageUrl)) {
    let sameDocument = false;
    if (target.documentToken && sameOrigin(tab.url || '', target.pageUrl || '')) {
      try {
        const candidateFrameId = await resolveFrameForTarget(tab.id, target);
        if (candidateFrameId == null) throw new Error(tr('worker.frameUnknown'));
        const ident = await sendToFrame(tab.id, candidateFrameId, { type: 'QUICKPASTE_IDENTIFY_DOCUMENT' });
        sameDocument = ident?.documentToken === target.documentToken;
        if (sameDocument) {
          const patch = { pageUrl: normalizeUrl(tab.url || ''), frameId: candidateFrameId };
          if (candidateFrameId === 0) patch.frameUrl = normalizeUrl(tab.url || '');
          target = await patchTarget(target.id, patch) || { ...target, ...patch };
        }
      } catch (_) {}
    }
    if (!sameDocument) tab = null;
  }

  if (!tab && settings.autoReconnect) {
    const reconnect = await findReconnectTab(target, settings);
    if (reconnect.ambiguous) {
      return { ok: false, error: tr('worker.ambiguousTabs') };
    }
    tab = reconnect.tab;
  }
  if (!tab) return { ok: false, error: tr('worker.pageMissing') };

  const frameId = await resolveFrameForTarget(tab.id, target);
  if (frameId == null) return { ok: false, error: tr('worker.frameUnknown') };
  if (tab.id !== target.tabId || frameId !== target.frameId) {
    target = await patchTarget(target.id, { tabId: tab.id, frameId }) || { ...target, tabId: tab.id, frameId };
  }
  return { ok: true, target, tab, frameId };
}

async function sendTargetMessage(target, settings, message, retries = 2) {
  const resolved = await resolveTarget(target, settings);
  if (!resolved.ok) return resolved;
  message = { ...message, locator: resolved.target.locator, fingerprint: resolved.target.fingerprint };
  let lastError = null;
  // Pin all retries to the same document so navigation cannot redirect a paste.
  try {
    const ident = await sendToFrame(resolved.tab.id, resolved.frameId, { type: 'QUICKPASTE_IDENTIFY_DOCUMENT' });
    if (ident?.ok !== true) return { ok: false, error: tr('worker.noConnectionAck') };
    message.expectedDocumentToken = ident.documentToken;
  } catch (error) {
    return { ok: false, error: tr('worker.cannotContact', { error: error.message || error }) };
  }
  for (let attempt = 0; attempt <= retries; attempt++) {
    let result;
    try {
      result = await sendToFrame(resolved.tab.id, resolved.frameId, message);
      if (!result || typeof result.ok !== 'boolean') throw new Error(tr('worker.noResultAck'));
    } catch (error) {
      lastError = error;
      if (attempt < retries) await sleep(140 * (attempt + 1));
      continue;
    }
    // A storage failure after insertion must never resend the insertion.
    if (result.ok && target?.id) {
      try {
        const patch = {
          tabId: resolved.tab.id,
          frameId: resolved.frameId,
          pageUrl: normalizeUrl(resolved.tab.url || resolved.target.pageUrl || '')
        };
        if (resolved.frameId === 0) patch.frameUrl = patch.pageUrl;
        if (result.updatedLocator) patch.locator = result.updatedLocator;
        if (result.updatedFingerprint) patch.fingerprint = result.updatedFingerprint;
        if (result.documentToken) patch.documentToken = result.documentToken;
        if (Object.entries(patch).some(([key, value]) => JSON.stringify(value) !== JSON.stringify(resolved.target[key]))) {
          const updated = await patchTarget(target.id, patch);
          if (updated) resolved.target = updated;
        }
      } catch (_) {}
    }
    return { ...resolved, ok: result.ok === true, result };
  }
  return { ok: false, error: tr('worker.cannotContact', { error: String(lastError?.message || lastError || '') }).trim() };
}

function duplicateFingerprint(text, targetId) {
  return `${targetId}:${hashText(text)}:${text.length}`;
}

async function shouldSuppressDuplicate(text, targetId, settings) {
  if (!settings.preventDuplicates) return false;
  const fingerprint = duplicateFingerprint(text, targetId);
  const now = Date.now();
  try {
    const data = await chrome.storage.session.get(['quickpasteDedupByTarget', 'quickpasteDedup']);
    const entry = data.quickpasteDedupByTarget?.[targetId];
    if (entry) return entry.fingerprint === fingerprint && now - entry.at <= settings.duplicateWindowMs;
    // Tương thích dữ liệu phiên của bản cũ.
    const legacy = data.quickpasteDedup;
    return legacy?.fingerprint === fingerprint && now - legacy.at <= settings.duplicateWindowMs;
  } catch (_) { return false; }
}

async function rememberSuccessfulDelivery(text, targetId, settings) {
  if (!settings.preventDuplicates) return;
  try {
    const { quickpasteDedupByTarget } = await chrome.storage.session.get('quickpasteDedupByTarget');
    const map = quickpasteDedupByTarget && typeof quickpasteDedupByTarget === 'object' ? { ...quickpasteDedupByTarget } : {};
    map[targetId] = { fingerprint: duplicateFingerprint(text, targetId), at: Date.now() };
    const cutoff = Date.now() - Math.max(15000, settings.duplicateWindowMs * 5);
    for (const [key, value] of Object.entries(map)) if (!value?.at || value.at < cutoff) delete map[key];
    await chrome.storage.session.set({ quickpasteDedupByTarget: map });
  } catch (_) {}
}

async function storeLastText(text, meta, settings) {
  if (!settings.rememberLastInSession || text.length > MAX_SESSION_REPLAY_CHARS) {
    try { await chrome.storage.session.remove('quickpasteLastText'); } catch (_) {}
    return;
  }
  try {
    await chrome.storage.session.set({
      quickpasteLastText: { text, at: Date.now(), meta: meta || {} }
    });
  } catch (_) {}
}

function targetsForTransfer(state, options = {}) {
  if (Array.isArray(options.targets)) return options.targets.filter(Boolean);
  if (Array.isArray(options.targetIds)) {
    const wanted = new Set(options.targetIds);
    return state.targets.filter(t => wanted.has(t.id));
  }
  if (options.target) return [options.target];
  if (state.settings.broadcastEnabled && !options.forceSingle) {
    const wanted = new Set(state.broadcastTargetIds || []);
    return state.targets.filter(t => wanted.has(t.id));
  }
  return state.activeTarget ? [state.activeTarget] : [];
}

async function processTransfer(rawText, source = {}, options = {}) {
  const state = await getState();
  const settings = state.settings;

  if (!options.explicit && !settings.enabled) {
    return { ok: false, ignored: true, reason: 'disabled', showFeedback: false };
  }

  let text = typeof rawText === 'string' ? rawText : '';
  if (settings.trimCopiedText) text = text.trim();
  if (!text) return { ok: false, ignored: true, reason: 'empty', showFeedback: false };

  const targets = targetsForTransfer(state, options);
  if (!targets.length) {
    const error = settings.broadcastEnabled && !options.forceSingle
      ? tr('worker.noBroadcastTargets')
      : tr('worker.noActiveTarget');
    return { ok: false, error, showFeedback: settings.feedback };
  }

  const successes = [];
  const failures = [];
  let ignoredCount = 0;

  for (let target of targets) {
    const resolved = await resolveTarget(target, settings);
    if (!resolved.ok) {
      failures.push({ target, error: resolved.error });
      continue;
    }
    target = resolved.target;
    const sameTab = source.tabId != null && source.tabId === target.tabId;
    if (!options.explicit) {
      if (settings.scope === 'cross' && sameTab) { ignoredCount++; continue; }
      if (settings.scope === 'same' && !sameTab) { ignoredCount++; continue; }
      if (sameTargetSource(target, source)) { ignoredCount++; continue; }
      if (await shouldSuppressDuplicate(text, target.id, settings)) { ignoredCount++; continue; }
    }

    const message = {
      type: 'QUICKPASTE_INSERT_TEXT',
      text,
      targetId: target.id,
      locator: target.locator,
      fingerprint: target.fingerprint || null,
      mode: settings.mode,
      separator: settings.separator,
      transferId: id()
    };
    const delivered = await sendTargetMessage(target, settings, message, 3);
    if (!delivered.ok || delivered.result?.ok === false) {
      failures.push({ target, error: delivered.result?.error || delivered.error || tr('worker.cannotInsert') });
      continue;
    }

    const resolvedTarget = delivered.target || target;
    await patchTarget(resolvedTarget.id, {
      lastUsedAt: Date.now(),
      tabId: delivered.tab?.id ?? resolvedTarget.tabId,
      frameId: delivered.frameId ?? resolvedTarget.frameId
    });
    if (!options.explicit) await rememberSuccessfulDelivery(text, resolvedTarget.id, settings);
    await markActivity({ sourceUrl: source.sourceUrl || '', target: resolvedTarget, text, action: source.action || 'copy' });
    successes.push(resolvedTarget);
  }

  if (!successes.length) {
    if (failures.length) {
      const error = failures.length === 1
        ? failures[0].error
        : tr('worker.multiFailed', { count: failures.length, error: failures[0].error });
      await markError(error);
      return { ok: false, error, showFeedback: settings.feedback, failedCount: failures.length };
    }
    return { ok: false, ignored: true, reason: ignoredCount ? 'scope-or-duplicate' : 'no-target', showFeedback: false };
  }

  const successfulIds = successes.map(t => t.id);
  if (!options.noReplayStore) {
    await storeLastText(text, { action: source.action || 'copy', targetIds: successfulIds }, settings);
  }
  try {
    await chrome.storage.session.set({ quickpasteLastBatch: { targetIds: successfulIds, at: Date.now() } });
  } catch (_) {}

  if (failures.length) {
    await markError(tr('worker.partial', { success: successes.length, total: targets.length, failed: failures.length }));
  }

  let pausedAfterSend = false;
  if (!options.explicit && settings.oneShot) {
    const nextSettings = { ...settings, enabled: false };
    await chrome.storage.local.set({ quickpasteSettings: nextSettings });
    await updateBadge();
    pausedAfterSend = true;
  }

  return {
    ok: true,
    chars: text.length,
    targetLabel: successes.length === 1 ? successes[0].label : tr('worker.multiTargetLabel', { count: successes.length }),
    deliveredCount: successes.length,
    failedCount: failures.length,
    showFeedback: settings.feedback,
    pausedAfterSend
  };
}

async function getPopupState() {
  const state = await getState();
  let hasLast = false;
  try {
    const x = await chrome.storage.session.get('quickpasteLastText');
    hasLast = state.settings.rememberLastInSession !== false && Boolean(x.quickpasteLastText?.text);
  } catch (_) {}
  let activeTargetOnline = false;
  if (state.activeTarget) {
    try { activeTargetOnline = Boolean(await chrome.tabs.get(state.activeTarget.tabId)); } catch (_) {}
  }
  return {
    ...state,
    profileCount: Object.keys(state.siteProfiles || {}).length,
    hasLast,
    activeTargetOnline
  };
}

async function saveSelectedTarget(message, sender) {
  const tabId = sender.tab?.id;
  if (tabId == null) return { ok: false, error: tr('worker.targetTabUnknown') };
  const frameId = sender.frameId ?? 0;
  const frameUrl = normalizeUrl(message.frameUrl || sender.url || '');
  const pageUrl = normalizeUrl(sender.tab?.url || frameUrl);
  const profileKey = siteKeyFromUrl(pageUrl);
  const state = await getState();
  const selectedStrongKey = strongFingerprintKey(message.fingerprint);

  let existing = state.targets.find(t => {
    if (t.tabId === tabId && Number(t.frameId || 0) === Number(frameId || 0)) {
      if (locatorKey(t.locator) === locatorKey(message.locator)) return true;
    }
    return false;
  });

  // Một website có một profile tự khôi phục. Khi chọn ô khác trên cùng website,
  // profile chuyển sang ô mới nhưng các đích thủ công khác vẫn có thể tồn tại.
  const profileExistingId = profileKey ? state.siteProfiles?.[profileKey]?.targetId : null;
  if (!existing && profileExistingId && state.settings.websiteProfilesEnabled !== false) {
    const candidate = state.targets.find(t => t.id === profileExistingId) || null;
    let candidateTab = null;
    if (candidate) { try { candidateTab = await chrome.tabs.get(candidate.tabId); } catch (_) {} }
    if (candidate && !candidateTab && normalizeUrl(candidate.frameUrl) === frameUrl &&
        (Number(candidate.frameId || 0) === 0) === (frameId === 0)) {
      const candidateStrongKey = strongFingerprintKey(candidate.fingerprint);
      const sameLocator = locatorKey(candidate.locator) === locatorKey(message.locator);
      const sameRoot = locatorKey(candidate.locator?.selectors?.slice(0, -1)) === locatorKey(message.locator?.selectors?.slice(0, -1));
      const sameStrong = Boolean(sameRoot && selectedStrongKey && candidateStrongKey && selectedStrongKey === candidateStrongKey);
      if (sameLocator || sameStrong) existing = candidate;
    }
  }

  let target;
  if (existing) {
    target = {
      ...existing,
      tabId,
      frameId,
      locator: message.locator,
      fingerprint: message.fingerprint || existing.fingerprint || null,
      label: message.label || existing.label,
      pageUrl,
      frameUrl,
      profileKey: state.settings.websiteProfilesEnabled !== false ? profileKey : (existing.profileKey || ''),
      documentToken: message.documentToken || existing.documentToken || null,
      title: sender.tab?.title || existing.title || '',
      updatedAt: Date.now(),
      lastUsedAt: Date.now()
    };
  } else {
    target = {
      id: id(),
      tabId,
      frameId,
      locator: message.locator,
      fingerprint: message.fingerprint || null,
      label: message.label || tr('worker.selectedInput'),
      pageUrl,
      frameUrl,
      profileKey: state.settings.websiteProfilesEnabled !== false ? profileKey : '',
      documentToken: message.documentToken || null,
      title: sender.tab?.title || '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      lastUsedAt: Date.now()
    };
  }

  let targets = existing
    ? state.targets.map(t => t.id === existing.id ? target : t)
    : [target, ...state.targets];

  if (targets.length > MAX_TARGETS) {
    targets = targets
      .sort((a, b) => (b.lastUsedAt || b.createdAt || 0) - (a.lastUsedAt || a.createdAt || 0))
      .slice(0, MAX_TARGETS);
  }

  const writes = {
    quickpasteTargets: targets,
    quickpasteActiveTargetId: target.id
  };
  const ids = new Set(targets.map(t => t.id));
  let broadcastIds = (state.broadcastTargetIds || []).filter(x => ids.has(x));
  if (state.settings.broadcastEnabled && !broadcastIds.includes(target.id)) broadcastIds.push(target.id);
  writes.quickpasteBroadcastTargetIds = broadcastIds;

  if (state.settings.websiteProfilesEnabled !== false && profileKey) {
    writes.quickpasteSiteProfiles = {
      ...(state.siteProfiles || {}),
      [profileKey]: {
        key: profileKey,
        targetId: target.id,
        label: target.label,
        locator: target.locator,
        fingerprint: target.fingerprint || null,
        frameUrl: target.frameUrl || '',
        frameId: Number(target.frameId || 0),
        title: target.title || '',
        updatedAt: Date.now()
      }
    };
  }
  const profiles = writes.quickpasteSiteProfiles || { ...state.siteProfiles };
  for (const [key, profile] of Object.entries(profiles)) if (!ids.has(profile?.targetId)) delete profiles[key];
  writes.quickpasteSiteProfiles = profiles;

  await chrome.storage.local.set(writes);
  await updateBadge();
  await stopSelectingInTab(tabId);
  return { ok: true, target };
}

async function rebindProfileForTab(tabOrId) {
  let tab = typeof tabOrId === 'object' ? tabOrId : null;
  if (!tab) { try { tab = await chrome.tabs.get(tabOrId); } catch (_) {} }
  if (!tab?.id || !isSupportedPageUrl(tab.url || '')) return false;

  const state = await getState();
  if (state.settings.websiteProfilesEnabled === false || !state.settings.autoReconnect) return false;
  const key = siteKeyFromUrl(tab.url || '');
  const profile = key ? state.siteProfiles?.[key] : null;
  if (!profile?.targetId) return false;
  const target = state.targets.find(t => t.id === profile.targetId);
  if (!target) return false;

  let currentTab = null;
  try { currentTab = await chrome.tabs.get(target.tabId); } catch (_) {}
  if (currentTab?.id && currentTab.id !== tab.id && siteKeyFromUrl(currentTab.url || '') === key) {
    return false;
  }

  if (!currentTab || currentTab.id !== tab.id) {
    const sameSiteTabs = (await chrome.tabs.query({})).filter(t => siteKeyFromUrl(t.url || '') === key);
    if (sameSiteTabs.length !== 1) return false; // không đoán nếu cùng website mở nhiều tab
  }

  const template = {
    ...target,
    frameUrl: profile.frameUrl || target.frameUrl,
    frameId: Number(profile.frameId ?? target.frameId ?? 0)
  };
  const frameId = await resolveFrameForTarget(tab.id, template);
  if (frameId == null) return false;
  const patch = {
    tabId: tab.id,
    frameId,
    pageUrl: normalizeUrl(tab.url || target.pageUrl || ''),
    frameUrl: frameId === 0 ? normalizeUrl(tab.url || '') : (profile.frameUrl || target.frameUrl),
    profileKey: key,
    title: tab.title || target.title || ''
  };

  // Content script có thể cần một nhịp sau khi trang vừa load.
  let ping = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      ping = await sendToFrame(tab.id, frameId, {
        type: 'QUICKPASTE_PING_TARGET',
        targetId: target.id,
        locator: profile.locator || target.locator,
        fingerprint: profile.fingerprint || target.fingerprint
      });
      if (ping?.ok) break;
    } catch (_) {}
    await sleep(180 * (attempt + 1));
  }
  if (ping?.ok) {
    if (ping.updatedLocator) patch.locator = ping.updatedLocator;
    if (ping.updatedFingerprint) patch.fingerprint = ping.updatedFingerprint;
    if (ping.documentToken) patch.documentToken = ping.documentToken;
  } else {
    return false;
  }
  await patchTarget(target.id, patch);
  return true;
}

async function syncOpenTabsToProfiles() {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    try { await rebindProfileForTab(tab); } catch (_) {}
  }
}

chrome.runtime.onInstalled.addListener(() => enqueueOperation(async () => {
  await migrateLegacyIfNeeded();
  await createContextMenus();
  await syncOpenTabsToProfiles();
  await updateBadge();
}).catch(() => {}));

chrome.runtime.onStartup.addListener(() => enqueueOperation(async () => {
  await migrateLegacyIfNeeded();
  await syncOpenTabsToProfiles();
  await updateBadge();
}).catch(() => {}));

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab?.id) return;
  if (info.menuItemId === 'quickpaste-pick-target') {
    startSelectingInTab(tab.id).catch(() => {});
    return;
  }
  if (info.menuItemId === 'quickpaste-send-selection' && typeof info.selectionText === 'string') {
    const delivery = enqueueOperation(() => processTransfer(info.selectionText, {
      tabId: tab.id,
      frameId: info.frameId ?? 0,
      sourceUrl: info.frameUrl || info.pageUrl || tab.url || '',
      action: 'send-selection'
    }, { explicit: true }));
    delivery.then(async result => {
      try {
        await sendToFrame(tab.id, info.frameId ?? 0, {
          type: 'QUICKPASTE_SHOW_NOTICE',
          text: result?.ok ? tr('worker.sentSelection', { count: result.chars || info.selectionText.length }) : `QuickPaste: ${result?.error || tr('worker.sendFailed')}`,
          tone: result?.ok ? 'success' : 'error'
        });
      } catch (_) {}
    }).catch(() => {});
  }
});

chrome.commands.onCommand.addListener((command, tab) => enqueueOperation(async () => {
  if (command === 'toggle-quickpaste') {
    const state = await getState();
    const next = { ...state.settings, enabled: !state.settings.enabled };
    await chrome.storage.local.set({ quickpasteSettings: next });
    await updateBadge();
    if (tab?.id) {
      try {
        await chrome.tabs.sendMessage(tab.id, {
          type: 'QUICKPASTE_SHOW_NOTICE',
          text: tr(next.enabled ? 'worker.enabled' : 'worker.paused'),
          tone: next.enabled ? 'success' : 'neutral'
        });
      } catch (_) {}
    }
  }
  if (command === 'pick-target' && tab?.id) {
    const result = await startSelectingInTab(tab.id);
    if (!result.ok) {
      try { await chrome.tabs.sendMessage(tab.id, { type: 'QUICKPASTE_SHOW_NOTICE', text: result.error, tone: 'error' }); } catch (_) {}
    }
  }
  if (command === 'cycle-target') {
    const state = await getState();
    if (!state.targets.length) {
      if (tab?.id) { try { await chrome.tabs.sendMessage(tab.id, { type: 'QUICKPASTE_SHOW_NOTICE', text: tr('worker.noTargetToCycle'), tone: 'error' }); } catch (_) {} }
      return;
    }
    const index = Math.max(0, state.targets.findIndex(t => t.id === state.activeTargetId));
    const next = state.targets[(index + 1) % state.targets.length];
    await saveTargets(state.targets, next.id);
    if (tab?.id) {
      try { await chrome.tabs.sendMessage(tab.id, { type: 'QUICKPASTE_SHOW_NOTICE', text: tr('worker.badgeTarget', { target: next.label || tr('target.default') }), tone: 'neutral' }); } catch (_) {}
    }
  }
}).catch(() => {}));

chrome.tabs.onRemoved.addListener(() => enqueueOperation(updateBadge).catch(() => {}));
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' || changeInfo.url) {
    enqueueOperation(() => rebindProfileForTab(tab || tabId)).catch(() => {});
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.quickpasteLanguage) return;
  globalThis.QuickPasteI18n?.setCurrent?.(changes.quickpasteLanguage.newValue, false);
  enqueueOperation(async () => {
    await createContextMenus();
    await updateBadge();
  }).catch(() => {});
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  enqueueOperation(async () => {
    if (message?.type === 'QUICKPASTE_TARGET_SELECTED') {
      sendResponse(await saveSelectedTarget(message, sender));
      return;
    }

    if (message?.type === 'QUICKPASTE_TEXT_CAPTURED') {
      const source = {
        tabId: sender.tab?.id,
        frameId: sender.frameId ?? 0,
        sourceLocator: message.sourceLocator || null,
        sourceFingerprint: message.sourceFingerprint || null,
        sourceUrl: sender.url || sender.tab?.url || '',
        action: message.action || 'copy'
      };
      sendResponse(await processTransfer(message.text, source));
      return;
    }

    if (message?.type === 'QUICKPASTE_GET_STATE') {
      sendResponse({ ok: true, ...(await getPopupState()) });
      return;
    }

    if (message?.type === 'QUICKPASTE_BEGIN_PICK') {
      sendResponse(await startSelectingInTab(message.tabId));
      return;
    }

    if (message?.type === 'QUICKPASTE_CANCEL_PICK') {
      const tabId = sender.tab?.id;
      if (tabId != null) await stopSelectingInTab(tabId);
      sendResponse({ ok: true });
      return;
    }

    if (message?.type === 'QUICKPASTE_SET_ACTIVE_TARGET') {
      const state = await getState();
      const found = state.targets.find(t => t.id === message.targetId);
      if (!found) return sendResponse({ ok: false, error: tr('worker.targetNotFound') });
      await saveTargets(state.targets, found.id);
      sendResponse({ ok: true, target: found });
      return;
    }

    if (message?.type === 'QUICKPASTE_SET_BROADCAST_TARGETS') {
      const state = await getState();
      const valid = new Set(state.targets.map(t => t.id));
      const ids = [...new Set((Array.isArray(message.targetIds) ? message.targetIds : []).filter(x => valid.has(x)))];
      await chrome.storage.local.set({ quickpasteBroadcastTargetIds: ids });
      await updateBadge();
      sendResponse({ ok: true, targetIds: ids });
      return;
    }

    if (message?.type === 'QUICKPASTE_CLEAR_PROFILES') {
      const state = await getState();
      const targets = state.targets.map(t => ({ ...t, profileKey: '' }));
      await chrome.storage.local.set({ quickpasteSiteProfiles: {}, quickpasteTargets: targets });
      sendResponse({ ok: true });
      return;
    }

    if (message?.type === 'QUICKPASTE_RENAME_TARGET') {
      const name = String(message.name || '').trim().slice(0, 80);
      if (!name) return sendResponse({ ok: false, error: tr('worker.nameRequired') });
      const updated = await patchTarget(message.targetId, { label: name });
      sendResponse(updated ? { ok: true, target: updated } : { ok: false, error: tr('worker.targetNotFound') });
      return;
    }

    if (message?.type === 'QUICKPASTE_REMOVE_TARGET') {
      const state = await getState();
      const targets = state.targets.filter(t => t.id !== message.targetId);
      const active = state.activeTargetId === message.targetId ? (targets[0]?.id || null) : state.activeTargetId;
      const profiles = { ...(state.siteProfiles || {}) };
      for (const [key, profile] of Object.entries(profiles)) if (profile?.targetId === message.targetId) delete profiles[key];
      const broadcastIds = state.broadcastTargetIds.filter(x => x !== message.targetId);
      await chrome.storage.local.set({
        quickpasteTargets: targets, quickpasteActiveTargetId: active,
        quickpasteBroadcastTargetIds: broadcastIds, quickpasteSiteProfiles: profiles
      });
      await updateBadge();
      sendResponse({ ok: true });
      return;
    }

    if (message?.type === 'QUICKPASTE_CLEAR_TARGETS') {
      await chrome.storage.local.set({
        quickpasteTargets: [], quickpasteActiveTargetId: null,
        quickpasteBroadcastTargetIds: [], quickpasteSiteProfiles: {}
      });
      await updateBadge();
      sendResponse({ ok: true });
      return;
    }

    if (message?.type === 'QUICKPASTE_UPDATE_SETTINGS') {
      const state = await getState();
      const next = { ...state.settings, ...(message.settings || {}) };
      if (!['any', 'same', 'cross'].includes(next.scope)) next.scope = 'any';
      if (!['cursor', 'append', 'replace'].includes(next.mode)) next.mode = 'cursor';
      next.duplicateWindowMs = Math.min(5000, Math.max(250, Number(next.duplicateWindowMs || 900)));
      await chrome.storage.local.set({ quickpasteSettings: next });
      if (message.settings && message.settings.rememberLastInSession === false) {
        try { await chrome.storage.session.remove('quickpasteLastText'); } catch (_) {}
      }
      await updateBadge();
      sendResponse({ ok: true, settings: next });
      return;
    }

    if (message?.type === 'QUICKPASTE_TEST_TARGET') {
      const state = await getState();
      if (!state.activeTarget) return sendResponse({ ok: false, error: tr('worker.chooseTargetFirst') });
      sendResponse(await processTransfer('QuickPaste ✓', { action: 'test' }, { explicit: true, noReplayStore: true, target: state.activeTarget, forceSingle: true }));
      return;
    }

    if (message?.type === 'QUICKPASTE_RESEND_LAST') {
      const state = await getState();
      if (!state.settings.rememberLastInSession) return sendResponse({ ok: false, error: tr('worker.replayDisabled') });
      let last = null;
      try { last = (await chrome.storage.session.get('quickpasteLastText')).quickpasteLastText; } catch (_) {}
      if (!last?.text) return sendResponse({ ok: false, error: tr('worker.replayEmpty') });
      const targetIds = Array.isArray(last.meta?.targetIds) ? last.meta.targetIds : null;
      sendResponse(await processTransfer(last.text, { action: 'replay' }, { explicit: true, noReplayStore: true, targetIds }));
      return;
    }

    if (message?.type === 'QUICKPASTE_UNDO_LAST') {
      const state = await getState();
      let batchIds = [];
      try { batchIds = (await chrome.storage.session.get('quickpasteLastBatch')).quickpasteLastBatch?.targetIds || []; } catch (_) {}
      const wanted = new Set(batchIds.length ? batchIds : (state.activeTarget ? [state.activeTarget.id] : []));
      const targets = state.targets.filter(t => wanted.has(t.id));
      if (!targets.length) return sendResponse({ ok: false, error: tr('worker.noUndo') });
      let okCount = 0;
      const errors = [];
      for (const target of targets) {
        const delivered = await sendTargetMessage(target, state.settings, {
          type: 'QUICKPASTE_UNDO_LAST', targetId: target.id, locator: target.locator, fingerprint: target.fingerprint
        }, 0);
        const result = delivered.result || delivered;
        if (result?.ok) okCount++; else errors.push(result?.error || delivered.error || tr('worker.cannotUndo'));
      }
      sendResponse(okCount ? { ok: true, count: okCount, failedCount: errors.length } : { ok: false, error: errors[0] || tr('worker.cannotUndo') });
      return;
    }

    if (message?.type === 'QUICKPASTE_FOCUS_TARGET') {
      const state = await getState();
      if (!state.activeTarget) return sendResponse({ ok: false, error: tr('worker.noTarget') });
      const resolved = await resolveTarget(state.activeTarget, state.settings);
      if (!resolved.ok) return sendResponse(resolved);
      try {
        if (resolved.tab.windowId != null) await chrome.windows.update(resolved.tab.windowId, { focused: true });
        await chrome.tabs.update(resolved.tab.id, { active: true });
        const result = await sendToFrame(resolved.tab.id, resolved.frameId, {
          type: 'QUICKPASTE_FLASH_TARGET', targetId: resolved.target.id, locator: resolved.target.locator, fingerprint: resolved.target.fingerprint
        });
        sendResponse(result?.ok === true ? { ok: true } : { ok: false, error: result?.error || tr('worker.targetNotFound') });
      } catch (error) {
        sendResponse({ ok: false, error: String(error?.message || error) });
      }
      return;
    }

    if (message?.type === 'QUICKPASTE_VALIDATE_TARGET') {
      const state = await getState();
      if (!state.activeTarget) return sendResponse({ ok: false, error: tr('worker.noTarget') });
      const delivered = await sendTargetMessage(state.activeTarget, state.settings, {
        type: 'QUICKPASTE_PING_TARGET', targetId: state.activeTarget.id, locator: state.activeTarget.locator, fingerprint: state.activeTarget.fingerprint
      }, 1);
      const result = delivered.result || delivered;
      sendResponse(result?.ok ? { ok: true } : { ok: false, error: result?.error || delivered.error || tr('worker.targetNotFound') });
      return;
    }

    sendResponse({ ok: false, error: tr('worker.unsupportedRequest') });
  }).catch(error => sendResponse({ ok: false, error: String(error?.message || error) }));
  return true;
});

enqueueOperation(updateBadge).catch(() => {});
