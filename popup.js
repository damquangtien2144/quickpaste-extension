const $ = (id) => document.getElementById(id);
const i18n = globalThis.QuickPasteI18n;
const tr = (key, vars) => i18n.t(key, vars);
const controls = {
  enabled: $('enabled'), scope: $('scope'), mode: $('mode'), separator: $('separator'),
  feedback: $('feedback'), preventDuplicates: $('preventDuplicates'), duplicateWindowMs: $('duplicateWindowMs'),
  autoReconnect: $('autoReconnect'), rememberLastInSession: $('rememberLastInSession'), trimCopiedText: $('trimCopiedText'), oneShot: $('oneShot'),
  broadcastEnabled: $('broadcastEnabled'), websiteProfilesEnabled: $('websiteProfilesEnabled')
};
let currentState = null;
let toastTimer = null;
let refreshVersion = 0;
let validationVersion = 0;
let renameTargetId = null;

function updateLanguageButton() {
  const language = i18n.language;
  for (const option of document.querySelectorAll('#languageToggle [data-language]')) {
    option.classList.toggle('active', option.dataset.language === language);
  }
  $('languageToggle').title = tr('language.switch');
  $('languageToggle').setAttribute('aria-label', tr('language.switch'));
}

function applyLanguage() {
  i18n.translateDocument();
  updateLanguageButton();
  if (currentState) {
    renderTargets(currentState);
    renderSettings(currentState);
    renderActivity(currentState);
  }
  renderShortcuts();
}

function showToast(text, bad = false) {
  const toast = $('toast');
  toast.textContent = text || '';
  toast.className = `toast${text ? ' show' : ''}${bad ? ' bad' : ''}`;
  clearTimeout(toastTimer);
  if (text) toastTimer = setTimeout(() => {
    toast.textContent = '';
    toast.className = 'toast';
  }, bad ? 3600 : 2200);
}

function separatorToUI(value) {
  if (value === '\n') return '\\n';
  if (value === '\n\n') return '\\n\\n';
  if (value === '\t') return '\\t';
  return value ?? '';
}

function separatorFromUI(value) {
  if (value === '\\n') return '\n';
  if (value === '\\n\\n') return '\n\n';
  if (value === '\\t') return '\t';
  return value;
}

function relativeTime(ts) {
  if (!ts) return '';
  const seconds = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (seconds < 8) return tr('activity.justNow');
  if (seconds < 60) return tr('activity.seconds', { count: seconds });
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return tr('activity.minutes', { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return tr('activity.hours', { count: hours });
  return tr('activity.days', { count: Math.floor(hours / 24) });
}

function escapeText(text) {
  return String(text ?? '');
}

function targetSite(target) {
  try {
    const u = new URL(target?.pageUrl || target?.frameUrl || '');
    return u.hostname || u.protocol;
  } catch (_) {
    return tr('target.savedPage');
  }
}

async function api(message) {
  try { return await chrome.runtime.sendMessage(message) || { ok: false, error: tr('toast.noResponse') }; }
  catch (error) { return { ok: false, error: String(error?.message || error) }; }
}

function renderTargetStatus(state) {
  const dot = $('targetStatus');
  const text = $('targetStatusText');
  dot.className = 'status-dot';
  if (!state.activeTarget) {
    dot.classList.add('offline');
    text.textContent = tr('target.noTarget');
    return;
  }
  dot.classList.add('checking');
  text.textContent = tr('target.checking');
}

async function validateActiveTarget(expectedId) {
  const version = ++validationVersion;
  const result = await api({ type: 'QUICKPASTE_VALIDATE_TARGET' });
  if (version !== validationVersion || !currentState?.activeTarget || currentState.activeTarget.id !== expectedId) return;
  const dot = $('targetStatus');
  const text = $('targetStatusText');
  dot.className = `status-dot ${result.ok ? 'online' : 'offline'}`;
  text.textContent = result.ok
    ? (currentState.settings.enabled ? tr('target.connected') : tr('target.connectedPaused'))
    : tr('target.disconnected');
  if (!result.ok && result.error) $('targetMeta').title = result.error;
}

function renderTargets(state) {
  const select = $('targetSelect');
  select.innerHTML = '';
  $('targetCount').textContent = tr('target.count', { count: state.targets.length });
  $('pickTarget').textContent = tr(state.targets.length ? 'pick.more' : 'pick.first');

  if (!state.targets.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = tr('target.none');
    select.appendChild(option);
    select.disabled = true;
    $('targetMeta').textContent = tr('target.emptyHelp');
  } else {
    select.disabled = false;
    for (const target of state.targets) {
      const option = document.createElement('option');
      option.value = target.id;
      option.textContent = `${target.label || tr('target.default')} · ${targetSite(target)}`;
      select.appendChild(option);
    }
    select.value = state.activeTargetId || state.targets[0].id;
    const target = state.activeTarget;
    const frameNote = target && Number(target.frameId || 0) !== 0 ? tr('target.embedded') : '';
    $('targetMeta').textContent = target ? `${target.title || targetSite(target)}${frameNote}` : '';
    $('targetMeta').title = target?.pageUrl || '';
  }

  const hasTarget = Boolean(state.activeTarget);
  for (const id of ['focusTarget', 'renameTarget', 'removeTarget', 'test', 'undo']) $(id).disabled = !hasTarget;
  $('resend').disabled = !hasTarget || !state.hasLast;
  renderTargetStatus(state);
  if (hasTarget) validateActiveTarget(state.activeTarget.id);
}

function renderBroadcast(state) {
  const enabled = Boolean(state.settings.broadcastEnabled);
  controls.broadcastEnabled.checked = enabled;
  $('broadcastBody').hidden = !enabled;
  const list = $('broadcastList');
  list.innerHTML = '';
  const selected = new Set(state.broadcastTargetIds || []);
  $('broadcastSummary').textContent = tr('broadcast.selected', { count: selected.size });

  if (!state.targets.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = tr('broadcast.empty');
    list.appendChild(empty);
    return;
  }
  for (const target of state.targets) {
    const label = document.createElement('label');
    label.className = 'broadcast-item';
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.value = target.id;
    check.checked = selected.has(target.id);
    check.addEventListener('change', async () => {
      const ids = [...document.querySelectorAll('#broadcastList input:checked')].map(x => x.value);
      const result = await api({ type: 'QUICKPASTE_SET_BROADCAST_TARGETS', targetIds: ids });
      if (!result.ok) return showToast(result.error || tr('toast.saveSettingsFailed'), true);
      if (currentState) currentState.broadcastTargetIds = result.targetIds;
      $('broadcastSummary').textContent = tr('broadcast.selected', { count: result.targetIds.length });
    });
    const text = document.createElement('span');
    const strong = document.createElement('b');
    strong.textContent = target.label || tr('target.default');
    const small = document.createElement('small');
    small.textContent = targetSite(target);
    text.append(strong, small);
    label.append(check, text);
    list.appendChild(label);
  }
}

function renderSettings(state) {
  const s = state.settings;
  controls.enabled.checked = s.enabled !== false;
  controls.scope.value = s.scope || 'any';
  controls.mode.value = s.mode || 'cursor';
  controls.separator.value = separatorToUI(s.separator ?? '\n');
  controls.feedback.checked = s.feedback !== false;
  controls.preventDuplicates.checked = s.preventDuplicates !== false;
  controls.duplicateWindowMs.value = String(s.duplicateWindowMs || 900);
  controls.autoReconnect.checked = s.autoReconnect !== false;
  controls.rememberLastInSession.checked = s.rememberLastInSession !== false;
  controls.trimCopiedText.checked = Boolean(s.trimCopiedText);
  controls.oneShot.checked = Boolean(s.oneShot);
  controls.websiteProfilesEnabled.checked = s.websiteProfilesEnabled !== false;
  $('profileSummary').textContent = tr('profiles.count', { count: state.profileCount || 0 });
  $('quickActionHint').textContent = s.mode === 'replace'
    ? tr('quick.replaceHint')
    : tr('quick.hint');
  renderBroadcast(state);
  $('separatorRow').hidden = controls.mode.value !== 'append';
  $('duplicateWindowRow').hidden = !controls.preventDuplicates.checked;
}

function renderActivity(state) {
  const total = Number(state.stats?.transferCount || 0);
  $('statsText').textContent = tr('activity.count', { count: total });
  const list = $('activity');
  list.innerHTML = '';
  const activity = state.activity || [];
  if (!activity.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = tr('activity.empty');
    list.appendChild(empty);
    return;
  }
  for (const item of activity.slice(0, 5)) {
    const row = document.createElement('div');
    row.className = 'activity-item';
    const main = document.createElement('div');
    main.className = 'activity-main';
    const strong = document.createElement('b');
    strong.textContent = item.action === 'test' ? tr('activity.test') : item.action === 'replay' ? tr('activity.replay') : (item.sourceHost || tr('activity.source'));
    main.appendChild(strong);
    main.appendChild(document.createTextNode(` → ${escapeText(item.targetLabel || tr('target.default'))} · ${tr('activity.chars', { count: item.chars || 0 })}`));
    const side = document.createElement('div');
    side.className = 'activity-side';
    side.textContent = relativeTime(item.at);
    row.append(main, side);
    list.appendChild(row);
  }
}

async function renderShortcuts() {
  try {
    const commands = await chrome.commands.getAll();
    const pick = commands.find(c => c.name === 'pick-target');
    const toggle = commands.find(c => c.name === 'toggle-quickpaste');
    const cycle = commands.find(c => c.name === 'cycle-target');
    $('shortcutPick').textContent = pick?.shortcut || tr('shortcut.none');
    $('shortcutCycle').textContent = cycle?.shortcut || tr('shortcut.none');
    $('shortcutToggle').textContent = toggle?.shortcut || tr('shortcut.none');
  } catch (_) {}
}

async function refresh() {
  const version = ++refreshVersion;
  const state = await api({ type: 'QUICKPASTE_GET_STATE' });
  if (version !== refreshVersion) return;
  if (!state?.ok) {
    showToast(state?.error || tr('toast.readStateFailed'), true);
    return;
  }
  currentState = state;
  renderTargets(state);
  renderSettings(state);
  renderActivity(state);
}

async function updateSettings(patch, message = '') {
  const result = await api({ type: 'QUICKPASTE_UPDATE_SETTINGS', settings: patch });
  if (!result.ok) {
    showToast(result.error || tr('toast.saveSettingsFailed'), true);
    await refresh();
    return;
  }
  if (currentState) currentState.settings = result.settings;
  if (message) showToast(message);
}

$('pickTarget').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return showToast(tr('toast.currentTabFailed'), true);
  const result = await api({ type: 'QUICKPASTE_BEGIN_PICK', tabId: tab.id });
  if (!result.ok) return showToast(result.error || tr('toast.pickFailed'), true);
  window.close();
});

$('languageToggle').addEventListener('click', async () => {
  await i18n.setLanguage(i18n.language === 'vi' ? 'en' : 'vi');
  showToast(tr('language.changed'));
});

$('targetSelect').addEventListener('change', async () => {
  const result = await api({ type: 'QUICKPASTE_SET_ACTIVE_TARGET', targetId: $('targetSelect').value });
  if (!result.ok) showToast(result.error || tr('toast.switchTargetFailed'), true);
  await refresh();
});

$('focusTarget').addEventListener('click', async () => {
  const result = await api({ type: 'QUICKPASTE_FOCUS_TARGET' });
  if (!result.ok) return showToast(result.error || tr('toast.focusFailed'), true);
  window.close();
});

$('renameTarget').addEventListener('click', () => {
  if (!currentState?.activeTarget) return;
  renameTargetId = currentState.activeTarget.id;
  $('renameInput').value = currentState.activeTarget.label || '';
  $('renameRow').hidden = false;
  $('renameInput').focus();
  $('renameInput').select();
});

$('cancelRename').addEventListener('click', () => { $('renameRow').hidden = true; });
$('renameInput').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') $('saveRename').click();
  if (event.key === 'Escape') $('cancelRename').click();
});
$('saveRename').addEventListener('click', async () => {
  if (!renameTargetId) return;
  const result = await api({
    type: 'QUICKPASTE_RENAME_TARGET', targetId: renameTargetId, name: $('renameInput').value
  });
  if (!result.ok) return showToast(result.error || tr('toast.renameFailed'), true);
  $('renameRow').hidden = true;
  showToast(tr('toast.renamed'));
  await refresh();
});

$('removeTarget').addEventListener('click', async () => {
  const target = currentState?.activeTarget;
  if (!target) return;
  if (!confirm(tr('confirm.remove', { name: target.label || tr('target.default') }))) return;
  const result = await api({ type: 'QUICKPASTE_REMOVE_TARGET', targetId: target.id });
  if (!result.ok) return showToast(result.error || tr('toast.removeFailed'), true);
  showToast(tr('toast.removed'));
  await refresh();
});

$('clearProfiles').addEventListener('click', async () => {
  if (!(currentState?.profileCount > 0)) return showToast(tr('toast.noProfiles'));
  if (!confirm(tr('confirm.clearProfiles'))) return;
  const result = await api({ type: 'QUICKPASTE_CLEAR_PROFILES' });
  if (!result.ok) return showToast(result.error || tr('toast.clearProfilesFailed'), true);
  showToast(tr('toast.clearedProfiles'));
  await refresh();
});

$('clearAll').addEventListener('click', async () => {
  if (!currentState?.targets?.length) return showToast(tr('toast.noTargets'));
  if (!confirm(tr('confirm.clearAll'))) return;
  const result = await api({ type: 'QUICKPASTE_CLEAR_TARGETS' });
  if (!result.ok) return showToast(result.error || tr('toast.clearFailed'), true);
  showToast(tr('toast.clearedTargets'));
  await refresh();
});

$('test').addEventListener('click', async () => {
  const result = await api({ type: 'QUICKPASTE_TEST_TARGET' });
  showToast(result.ok ? tr('toast.testOk') : (result.error || tr('toast.testFailed')), !result.ok);
  if (result.ok) await refresh();
});

$('resend').addEventListener('click', async () => {
  const result = await api({ type: 'QUICKPASTE_RESEND_LAST' });
  const failed = result.failedCount ? tr('toast.someNotReceived', { count: result.failedCount }) : '';
  showToast(result.ok ? tr('toast.resendOk', { count: result.deliveredCount || 1, failed }) : (result.error || tr('toast.resendFailed')), !result.ok || !!result.failedCount);
  if (result.ok) await refresh();
});

$('undo').addEventListener('click', async () => {
  const result = await api({ type: 'QUICKPASTE_UNDO_LAST' });
  const failed = result.failedCount ? tr('toast.someNotUndone', { count: result.failedCount }) : '';
  showToast(result.ok ? tr('toast.undoOk', { count: result.count || 1, failed }) : (result.error || tr('toast.undoFailed')), !result.ok || !!result.failedCount);
});

$('broadcastAll').addEventListener('click', async () => {
  const ids = (currentState?.targets || []).map(t => t.id);
  const result = await api({ type: 'QUICKPASTE_SET_BROADCAST_TARGETS', targetIds: ids });
  if (!result.ok) return showToast(result.error || tr('toast.selectAllFailed'), true);
  await refresh();
});

$('broadcastNone').addEventListener('click', async () => {
  const result = await api({ type: 'QUICKPASTE_SET_BROADCAST_TARGETS', targetIds: [] });
  if (!result.ok) return showToast(result.error || tr('toast.deselectFailed'), true);
  await refresh();
});

controls.broadcastEnabled.addEventListener('change', async () => {
  if (controls.broadcastEnabled.checked && !(currentState?.broadcastTargetIds?.length) && currentState?.activeTarget) {
    await api({ type: 'QUICKPASTE_SET_BROADCAST_TARGETS', targetIds: [currentState.activeTarget.id] });
  }
  await updateSettings({ broadcastEnabled: controls.broadcastEnabled.checked }, tr(controls.broadcastEnabled.checked ? 'toast.broadcastOn' : 'toast.broadcastOff'));
  await refresh();
});
controls.websiteProfilesEnabled.addEventListener('change', async () => {
  await updateSettings({ websiteProfilesEnabled: controls.websiteProfilesEnabled.checked }, tr(controls.websiteProfilesEnabled.checked ? 'toast.profilesOn' : 'toast.profilesOff'));
  await refresh();
});

controls.enabled.addEventListener('change', () => updateSettings({ enabled: controls.enabled.checked }, tr(controls.enabled.checked ? 'toast.autoOn' : 'toast.autoOff')));
controls.scope.addEventListener('change', () => updateSettings({ scope: controls.scope.value }, tr('toast.scopeChanged')));
controls.mode.addEventListener('change', async () => {
  $('separatorRow').hidden = controls.mode.value !== 'append';
  await updateSettings({ mode: controls.mode.value }, tr('toast.modeChanged'));
});
controls.separator.addEventListener('change', () => updateSettings({ separator: separatorFromUI(controls.separator.value) }, tr('toast.separatorChanged')));
controls.feedback.addEventListener('change', () => updateSettings({ feedback: controls.feedback.checked }));
controls.preventDuplicates.addEventListener('change', async () => {
  $('duplicateWindowRow').hidden = !controls.preventDuplicates.checked;
  await updateSettings({ preventDuplicates: controls.preventDuplicates.checked });
});
controls.duplicateWindowMs.addEventListener('change', () => updateSettings({ duplicateWindowMs: Number(controls.duplicateWindowMs.value) }));
controls.autoReconnect.addEventListener('change', () => updateSettings({ autoReconnect: controls.autoReconnect.checked }));
controls.rememberLastInSession.addEventListener('change', async () => {
  await updateSettings({ rememberLastInSession: controls.rememberLastInSession.checked });
  if (!controls.rememberLastInSession.checked) $('resend').disabled = true;
});
controls.trimCopiedText.addEventListener('change', () => updateSettings({ trimCopiedText: controls.trimCopiedText.checked }));
controls.oneShot.addEventListener('change', () => updateSettings({ oneShot: controls.oneShot.checked }));

let storageRefreshTimer = null;
chrome.storage.onChanged.addListener((changes, area) => {
  if (!['local', 'session'].includes(area) || !Object.keys(changes).some(key => key.startsWith('quickpaste'))) return;
  clearTimeout(storageRefreshTimer);
  storageRefreshTimer = setTimeout(refresh, 120);
});

i18n.onChange(applyLanguage);
i18n.load().then(async () => {
  applyLanguage();
  await refresh();
});
setInterval(() => {
  if (currentState?.activity?.length) renderActivity(currentState);
}, 30000);
