import {
  LEVELS,
  LEVEL_LABELS,
  STORAGE_KEY,
  LEGACY_STORAGE_KEY,
  applyImport,
  applySharePlan,
  buildExport,
  buildRoadmap,
  clampHours,
  currentPhase,
  effectiveStatus,
  emptyState,
  emptyTrackState,
  ensureTrack,
  formatDuration,
  isReady,
  moveId,
  naturalStatus,
  newId,
  normalizeState,
  projectPlanStats,
  quizScore,
  roadmapStats,
  setTopicStatus,
  sharePlanFromTrack,
  stateFromLegacyStorage,
  validateTrack,
  visibleProjects,
} from './model.js';
import { decodePlan, encodePlan, planFromHash } from './share.js';
import { drawRoadmap, roadmapLines, roadmapMarkdown, textPdf } from './files.js';
import { initPlanScreen } from './plan-screen.js';
import { planMarkdown } from './plan.js';

const KIND_LABEL = {
  leitura: 'Leitura',
  curso: 'Curso',
  documentacao: 'Documentação',
  pratica: 'Prática',
  video: 'Vídeo',
};

const LEVEL_COPY = {
  iniciante: 'Estou começando ou vi pouco disso na faculdade.',
  intermediario: 'Já programo e entendo o básico da área.',
  avancado: 'Já fiz projetos e quero o que ainda não domino.',
};

const HOUR_PRESETS = [4, 8, 12, 20];

const $ = (id) => document.getElementById(id);

let tracks = [];
let state = emptyState();
let pendingPlan = null;
let editingTopicId = null;
let editingProjectId = null;

const session = {
  search: '',
  filter: 'all',
  openNotes: {},
  openPhaseNotes: {},
  onboarding: { step: 1, trackId: null, level: null, hours: null, mode: 'create' },
};

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function safeUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') return parsed.href;
  } catch {
    return '';
  }
  return '';
}

function icon(name) {
  const paths = {
    frontend: '<path d="M4 7h16M4 12h10M4 17h16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    backend: '<path d="M8 8l-3 4 3 4M16 8l3 4-3 4M13 7l-2 10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
    fullstack: '<path d="M12 4l7 4v8l-7 4-7-4V8l7-4z" stroke="currentColor" stroke-width="1.8" fill="none"/>',
    dados: '<path d="M5 16V8M10 18V6M15 14V10M19 17V7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    mobile: '<rect x="8" y="3" width="8" height="18" rx="2" stroke="currentColor" stroke-width="1.8" fill="none"/><path d="M11 18h2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    devops: '<path d="M12 3v4M12 17v4M4.9 6.5l2.8 2.8M16.3 14.7l2.8 2.8M3 12h4M17 12h4M4.9 17.5l2.8-2.8M16.3 9.3l2.8-2.8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  };
  return `<svg class="w-7 h-7" viewBox="0 0 24 24" fill="none" aria-hidden="true">${paths[name] || paths.fullstack}</svg>`;
}

function toast(message, type = 'success') {
  const el = document.createElement('div');
  const tone = type === 'error'
    ? 'bg-rose-950 text-rose-100 border-rose-500/50'
    : 'bg-slate-900 text-white border-emerald-500/40';
  el.className = `pointer-events-auto px-4 py-3 rounded-xl border shadow-xl text-sm ${tone}`;
  el.textContent = message;
  $('toastContainer').appendChild(el);
  setTimeout(() => el.remove(), 3600);
}

function persist() {
  const payload = {
    version: 2,
    theme: state.theme,
    strikethrough: state.strikethrough,
    activeTrackId: state.activeTrackId,
    profile: state.profile,
    tracks: state.tracks,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function loadState() {
  try {
    const current = localStorage.getItem(STORAGE_KEY);
    if (current) {
      state = normalizeState(JSON.parse(current));
      return;
    }
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy) {
      state = stateFromLegacyStorage(JSON.parse(legacy));
      persist();
    }
  } catch (error) {
    console.warn(error);
    state = emptyState();
  }
}

function trackById(id) {
  return tracks.find((track) => track.id === id) || null;
}

function activeTrack() {
  return trackById(state.activeTrackId);
}

function activeTrackState() {
  if (!state.activeTrackId) return null;
  return state.tracks[state.activeTrackId] || null;
}

function showScreen(name) {
  for (const id of ['loading', 'loadError', 'onboarding', 'app']) {
    $(id).hidden = id !== name;
  }
  const plan = $('planScreen');
  if (plan && name !== 'app') plan.hidden = true;
}

function applyTheme() {
  document.documentElement.classList.toggle('dark', state.theme !== 'light');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = state.theme === 'light' ? '#f8fafc' : '#090d16';
  $('themeLabel').textContent = state.theme === 'light' ? 'Tema escuro' : 'Tema claro';
  $('themeIcon').textContent = state.theme === 'light' ? '☾' : '☀';
  $('onbThemeBtn').textContent = state.theme === 'light' ? 'Tema escuro' : 'Tema claro';
}

function toggleTheme() {
  state.theme = state.theme === 'light' ? 'dark' : 'light';
  persist();
  applyTheme();
}

function fillLevelSelect(select, selected) {
  select.innerHTML = LEVELS.map((level) => (
    `<option value="${level}" ${level === selected ? 'selected' : ''}>${LEVEL_LABELS[level]}</option>`
  )).join('');
}

function fillPhaseSelect(select, selected) {
  const track = activeTrack();
  select.innerHTML = (track?.phases || []).map((phase) => (
    `<option value="${escapeHtml(phase.id)}" ${phase.id === selected ? 'selected' : ''}>${escapeHtml(`Etapa ${phase.number}: ${phase.title}`)}</option>`
  )).join('');
}

function captureFocus() {
  const el = document.activeElement;
  if (!el || !el.dataset || !el.dataset.action) return null;
  return {
    action: el.dataset.action,
    itemId: el.dataset.itemId || '',
    phaseId: el.dataset.phaseId || '',
    projectId: el.dataset.projectId || '',
  };
}

function restoreFocus(token) {
  if (!token) return;
  const selector = [
    `[data-action="${CSS.escape(token.action)}"]`,
    token.itemId ? `[data-item-id="${CSS.escape(token.itemId)}"]` : '',
    token.phaseId ? `[data-phase-id="${CSS.escape(token.phaseId)}"]` : '',
    token.projectId ? `[data-project-id="${CSS.escape(token.projectId)}"]` : '',
  ].join('');
  document.querySelector(selector)?.focus();
}

function topicMatches(topic, query) {
  if (!query) return true;
  const blob = [
    topic.title,
    topic.description,
    topic.note || '',
    ...(topic.tags || []),
    ...(topic.resources || []).map((resource) => resource.title),
  ].join(' ').toLowerCase();
  return blob.includes(query);
}

function projectMatches(project, query) {
  if (!query) return true;
  return `${project.title} ${project.description}`.toLowerCase().includes(query);
}

function checkbox(checked, attrs, label) {
  return `<button type="button" role="checkbox" aria-checked="${checked}" aria-label="${escapeHtml(label)}" ${attrs} class="mt-0.5 w-6 h-6 rounded-lg flex items-center justify-center shrink-0 border-2 ${checked ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-950'}">${checked ? '✓' : ''}</button>`;
}

function miniButton(label, attrs, extra = '') {
  return `<button type="button" ${attrs} class="px-2 py-1 rounded-lg text-[11px] font-medium border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 ${extra}">${label}</button>`;
}

function renderTopic(topic, phase, index, total, titleById, doneIds) {
  const strike = topic.done && state.strikethrough ? 'line-through opacity-70' : '';
  const optional = topic.status === 'optional';
  const hidden = topic.status === 'hidden';
  const noteOpen = !!session.openNotes[topic.id];
  const tags = (topic.tags || []).map((tag) => `<span class="px-2 py-0.5 text-[11px] font-mono rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">${escapeHtml(tag)}</span>`).join('');
  const resources = (topic.resources || []).map((resource) => {
    const href = safeUrl(resource.url);
    if (!href) return '';
    const kind = KIND_LABEL[resource.kind] || 'Leitura';
    const lang = resource.lang === 'en' ? 'EN' : 'PT';
    return `<li><a class="underline decoration-emerald-500/50 underline-offset-2" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(resource.title)}</a> <span class="font-mono text-[10px] text-slate-500">${lang} · ${kind}</span></li>`;
  }).join('');
  const prereq = (topic.prerequisites || []).map((id) => {
    const name = titleById.get(id);
    if (!name) return '';
    const pending = !doneIds.has(id);
    return `${escapeHtml(name)}${pending ? ' (ainda não concluído)' : ''}`;
  }).filter(Boolean).join(', ');
  const natural = naturalStatus(topic, activeTrackState());
  const optionalLabel = optional
    ? (natural === 'optional' && !activeTrackState().overrides[topic.id] ? 'Opcional · abaixo do seu nível' : 'Opcional')
    : '';
  const statusButtons = hidden
    ? miniButton('Restaurar', `data-action="restore-topic" data-item-id="${topic.id}"`)
    : [
      miniButton(optional ? 'Tornar obrigatório' : 'Marcar como opcional', `data-action="toggle-optional" data-item-id="${topic.id}"`),
      miniButton('Ocultar', `data-action="hide-topic" data-item-id="${topic.id}"`),
      miniButton('Subir', `data-action="move-topic" data-item-id="${topic.id}" data-phase-id="${phase.id}" data-dir="-1" ${index === 0 ? 'disabled' : ''}`),
      miniButton('Descer', `data-action="move-topic" data-item-id="${topic.id}" data-phase-id="${phase.id}" data-dir="1" ${index === total - 1 ? 'disabled' : ''}`),
      topic.custom ? miniButton('Editar', `data-action="edit-topic" data-item-id="${topic.id}"`) : '',
      topic.custom ? miniButton('Excluir', `data-action="delete-topic" data-item-id="${topic.id}"`, 'text-rose-600') : '',
      (topic.quiz || []).length ? miniButton(quizScore(topic.quiz, activeTrackState().quizAnswers).needsReview ? 'Revisar' : 'Quiz', `data-action="open-quiz" data-quiz-scope="topic" data-item-id="${topic.id}"`) : '',
    ].join('');

  return `
    <article class="p-4 sm:px-5 sm:py-4 ${topic.done ? 'bg-emerald-500/[0.04]' : ''} ${optional ? 'border-l-4 border-l-amber-400' : ''}">
      <div class="flex items-start gap-3">
        ${checkbox(topic.done, `data-action="toggle-item" data-item-id="${topic.id}"`, `${topic.done ? 'Desmarcar' : 'Concluir'} ${topic.title}`)}
        <div class="min-w-0 flex-1">
          <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
            <h3 class="text-sm sm:text-[15px] font-semibold ${strike}">${escapeHtml(topic.title)}</h3>
            <button type="button" data-action="toggle-note" data-item-id="${topic.id}" class="self-start px-2.5 py-1 rounded-lg text-xs border ${topic.note || noteOpen ? 'border-amber-500/40 text-amber-700 dark:text-amber-300' : 'border-transparent bg-slate-100 dark:bg-slate-800'}">${topic.note ? 'Anotações' : 'Anotar'}</button>
          </div>
          <p class="mt-1 text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed ${topic.done && state.strikethrough ? 'opacity-70' : ''}">${escapeHtml(topic.description)}</p>
          <div class="mt-2 flex flex-wrap gap-1.5 text-[11px]">
            <span class="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 font-mono">${LEVEL_LABELS[topic.level] || topic.level}</span>
            <span class="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 font-mono">${Number(topic.hours) || 0} h</span>
            ${optionalLabel ? `<span class="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-800 dark:text-amber-200">${optionalLabel}</span>` : ''}
            ${topic.custom ? '<span class="px-2 py-0.5 rounded-md bg-cyan-500/10 text-cyan-700 dark:text-cyan-300">Seu tópico</span>' : ''}
            ${tags}
          </div>
          ${prereq ? `<p class="mt-2 text-xs text-slate-500">Antes: ${prereq}</p>` : ''}
          ${resources ? `<ul class="mt-2 space-y-1 text-xs">${resources}</ul>` : ''}
          <div class="mt-2 flex flex-wrap gap-1.5">${statusButtons}</div>
          ${noteOpen ? `
            <label class="block mt-3 text-[11px] font-mono uppercase tracking-wider text-slate-500" for="note-${topic.id}">Anotações pessoais</label>
            <textarea id="note-${topic.id}" data-action="edit-note" data-item-id="${topic.id}" rows="3" class="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 p-2 text-sm">${escapeHtml(topic.note || '')}</textarea>
          ` : ''}
        </div>
      </div>
    </article>`;
}

function renderGuide(project) {
  const steps = project.steps || [];
  const criteria = project.definitionOfDone || [];
  if (!steps.length && !criteria.length) return '';
  const checks = (activeTrackState().guideChecks || {})[project.id] || { steps: {}, criteria: {} };
  const line = (group, text, index) => `
    <label class="flex gap-2 text-xs text-slate-600 dark:text-slate-300">
      <input type="checkbox" data-action="guide-check" data-project-id="${project.id}" data-guide-group="${group}" data-index="${index}" ${checks[group]?.[index] ? 'checked' : ''} />
      <span>${escapeHtml(text)}</span>
    </label>`;
  return `
    <details class="mt-2">
      <summary class="text-xs font-semibold">Roteiro e definição de pronto</summary>
      ${steps.length ? `<ol class="mt-2 space-y-1 list-decimal pl-4">${steps.map((step, index) => `<li>${line('steps', step, index)}</li>`).join('')}</ol>` : ''}
      ${criteria.length ? `<p class="mt-2 text-[11px] font-mono uppercase text-slate-500">Definição de pronto</p><div class="space-y-1">${criteria.map((item, index) => line('criteria', item, index)).join('')}</div>` : ''}
    </details>`;
}

function renderProject(project) {
  const strike = project.done && state.strikethrough ? 'line-through opacity-70' : '';
  const actions = project.custom
    ? `${miniButton('Editar', `data-action="edit-project" data-project-id="${project.id}"`)}${miniButton('Excluir', `data-action="delete-project" data-project-id="${project.id}"`, 'text-rose-600')}`
    : '';
  return `
    <li class="flex items-start gap-3 py-3">
      ${checkbox(project.done, `data-action="toggle-project" data-project-id="${project.id}"`, `${project.done ? 'Desmarcar projeto' : 'Concluir projeto'} ${project.title}`)}
      <div class="min-w-0">
        <p class="text-sm font-semibold ${strike}">${escapeHtml(project.title)}</p>
        <p class="text-xs text-slate-600 dark:text-slate-400 mt-1">${escapeHtml(project.description)}</p>
        <p class="mt-1 text-[11px] font-mono text-slate-500">${LEVEL_LABELS[project.level]} · ${Number(project.hours) || 0} h${project.custom ? ' · sua ideia' : ''}</p>
        ${renderGuide(project)}
        <div class="mt-1 flex gap-1.5">${actions}</div>
      </div>
    </li>`;
}

function renderPhase(phase, query, phaseHit) {
  const trackState = activeTrackState();
  const progress = phase.progress;
  const collapsed = !!trackState.collapsedPhases[phase.id];
  const requiredHours = phase.topics
    .filter((topic) => topic.status === 'required')
    .reduce((sum, topic) => sum + (Number(topic.hours) || 0), 0);
  const duration = requiredHours
    ? formatDuration(requiredHours, trackState.weeklyHours)
    : 'Sem tópicos obrigatórios neste nível';
  const topics = phase.topics.filter((topic) => {
    if (session.filter === 'hidden') return topic.status === 'hidden' && (phaseHit || topicMatches(topic, query));
    if (topic.status === 'hidden') return false;
    if (session.filter === 'pending' && topic.done) return false;
    if (session.filter === 'completed' && !topic.done) return false;
    if (session.filter === 'optional' && topic.status !== 'optional') return false;
    if (query && !phaseHit && !topicMatches(topic, query)) return false;
    return true;
  });
  const levelProjects = visibleProjects(phase.projects, trackState.level, trackState.showAllProjectLevels);
  const projects = levelProjects.filter((project) => {
    if (session.filter === 'hidden' || session.filter === 'optional') return false;
    if (session.filter === 'pending' && project.done) return false;
    if (session.filter === 'completed' && !project.done) return false;
    if (query && !phaseHit && !projectMatches(project, query)) return false;
    return true;
  });
  if (!topics.length && !projects.length) return '';

  const titleById = new Map();
  const doneIds = new Set();
  buildRoadmap(activeTrack(), trackState).phases.forEach((item) => {
    item.topics.forEach((topic) => {
      titleById.set(topic.id, topic.title);
      if (topic.done) doneIds.add(topic.id);
    });
  });
  const noteHit = query && phase.note.toLowerCase().includes(query);
  const notesKnown = Object.prototype.hasOwnProperty.call(session.openPhaseNotes, phase.id);
  const notesOpen = noteHit || (notesKnown ? session.openPhaseNotes[phase.id] : phase.note.trim().length > 0);
  const allIndexes = phase.topics;
  const items = topics.map((topic) => renderTopic(
    topic,
    phase,
    allIndexes.findIndex((item) => item.id === topic.id),
    allIndexes.length,
    titleById,
    doneIds,
  )).join('');
  const otherLevels = phase.projects.some((project) => project.level !== trackState.level);
  const projectHint = trackState.showAllProjectLevels
    ? 'Mostrando todos os níveis.'
    : `Mostrando ideias de nível ${LEVEL_LABELS[trackState.level]}.`;
  const emptyProjects = !projects.length
    ? `<p class="text-xs text-slate-500">${session.filter === 'pending' ? 'Nenhum projeto pendente nesta etapa.' : `Nenhuma ideia de nível ${LEVEL_LABELS[trackState.level]} nesta etapa.`}</p>${otherLevels && !trackState.showAllProjectLevels ? '<button type="button" data-action="show-all-projects" class="mt-2 text-xs underline">Ver outros níveis</button>' : ''}`
    : `<ul class="divide-y divide-slate-200 dark:divide-slate-800">${projects.map(renderProject).join('')}</ul>`;

  return `
    <section class="rounded-2xl bg-white dark:bg-slate-900/90 border ${progress.complete ? 'border-emerald-500/40' : 'border-slate-200 dark:border-slate-800'} overflow-hidden">
      <div class="p-4 sm:p-5 border-b border-slate-200/80 dark:border-slate-800">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <button type="button" data-action="toggle-phase" data-phase-id="${phase.id}" aria-expanded="${!collapsed}" class="flex items-center gap-3 text-left">
            <span class="w-8 h-8 rounded-xl flex items-center justify-center font-mono text-xs font-bold ${progress.complete ? 'bg-emerald-500 text-white' : 'bg-slate-200 dark:bg-slate-800'}">${String(phase.number).padStart(2, '0')}</span>
            <span>
              <span class="block text-base sm:text-lg font-bold">Etapa ${phase.number}: ${escapeHtml(phase.title)}</span>
              <span class="block text-xs text-slate-500 font-mono">${escapeHtml(duration)}${phase.note.trim() ? ' · com observações' : ''}</span>
            </span>
          </button>
          <div class="flex flex-wrap items-center gap-2 pl-11 sm:pl-0">
            <span class="px-2.5 py-1 rounded-lg text-xs font-mono ${progress.complete ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-slate-100 dark:bg-slate-800'}">${progress.done}/${progress.total}</span>
            ${(phase.quiz || []).length ? miniButton(quizScore(phase.quiz, trackState.quizAnswers).needsReview ? 'Revisar' : 'Autoavaliação', `data-action="open-quiz" data-quiz-scope="phase" data-phase-id="${phase.id}"`) : ''}
            ${miniButton(progress.complete ? 'Desmarcar etapa' : 'Concluir etapa', `data-action="toggle-phase-done" data-phase-id="${phase.id}"`)}
            ${miniButton('Subir etapa', `data-action="move-phase" data-phase-id="${phase.id}" data-dir="-1"`)}
            ${miniButton('Descer etapa', `data-action="move-phase" data-phase-id="${phase.id}" data-dir="1"`)}
            <button type="button" data-action="toggle-phase" data-phase-id="${phase.id}" aria-label="${collapsed ? 'Expandir etapa' : 'Recolher etapa'}" class="px-2 py-1">${collapsed ? '▸' : '▾'}</button>
          </div>
        </div>
        <div class="mt-3 h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
          <div class="h-full bg-emerald-500" style="width:${progress.percent}%"></div>
        </div>
      </div>
      ${collapsed ? '' : `
        <div class="divide-y divide-slate-200 dark:divide-slate-800">${items}</div>
        <div class="p-4 sm:px-5 border-t border-slate-200 dark:border-slate-800">
          <div class="flex items-center justify-between gap-2">
            <h3 class="text-sm font-bold">Ideias de projeto</h3>
            <button type="button" data-action="add-project" data-phase-id="${phase.id}" class="text-xs font-semibold text-emerald-700 dark:text-emerald-300">Adicionar ideia</button>
          </div>
          <p class="mt-1 text-xs text-slate-500">${projectHint}</p>
          ${session.filter === 'optional' || session.filter === 'hidden' ? '<p class="mt-2 text-xs text-slate-500">As ideias de projeto ficam de fora deste filtro.</p>' : `<div class="mt-2">${emptyProjects}</div>`}
          <details class="mt-4" data-phase-notes data-phase-id="${phase.id}" ${notesOpen ? 'open' : ''}>
            <summary class="text-sm font-semibold">Observações${phase.note.trim() ? ' · texto salvo' : ''}</summary>
            <label class="sr-only" for="obs-${phase.id}">Observações desta etapa</label>
            <textarea id="obs-${phase.id}" data-action="edit-phase-note" data-phase-id="${phase.id}" rows="3" class="mt-2 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 p-2 text-sm" placeholder="O que você quer lembrar desta etapa">${escapeHtml(phase.note)}</textarea>
          </details>
        </div>
      `}
    </section>`;
}

function renderRoadmap() {
  const track = activeTrack();
  const trackState = activeTrackState();
  const container = $('conteudo');
  const focus = captureFocus();
  const y = window.scrollY;
  const view = buildRoadmap(track, trackState);
  const query = session.search.trim().toLowerCase();
  const html = view.phases.map((phase) => {
    const phaseHit = !!query && `${phase.title} ${phase.badgeTitle} ${phase.note}`.toLowerCase().includes(query);
    return renderPhase(phase, query, phaseHit);
  }).join('');
  container.innerHTML = html;
  $('emptyState').hidden = html.trim().length > 0;
  const orphans = $('orphans');
  if (view.orphans.length) {
    orphans.hidden = false;
    orphans.innerHTML = `
      <section class="rounded-2xl border border-amber-500/30 p-4">
        <h2 class="font-bold">Ideias sem etapa</h2>
        <ul>${view.orphans.map(renderProject).join('')}</ul>
      </section>`;
  } else {
    orphans.hidden = true;
    orphans.innerHTML = '';
  }
  window.scrollTo(0, y);
  restoreFocus(focus);
}

function updateDashboard() {
  const track = activeTrack();
  const trackState = activeTrackState();
  const view = buildRoadmap(track, trackState);
  const stats = roadmapStats(view.phases);
  const projects = projectPlanStats(view.phases, trackState.level);
  const focus = currentPhase(view.phases);
  $('overallPercent').textContent = `${stats.percent}%`;
  $('overallCounter').textContent = `${stats.requiredDone} de ${stats.required} tópicos do plano`;
  $('overallProgressBar').style.width = `${stats.percent}%`;
  $('overallStatusTag').textContent = stats.percent === 0 ? 'Pronto para começar' : stats.percent === 100 ? 'Plano concluído' : 'Em andamento';
  $('planEstimate').textContent = stats.hours
    ? `Plano de ${formatDuration(stats.hours, trackState.weeklyHours)}. Restam ${formatDuration(stats.hoursLeft, trackState.weeklyHours)}.`
    : 'Nenhum tópico obrigatório neste nível. Os opcionais continuam na lista.';
  const optionalText = stats.optional ? ` ${stats.optional} opcionais fora da conta.` : '';
  $('planEstimate').textContent += optionalText;
  $('projectCounter').textContent = `Projetos deste nível: ${projects.done} de ${projects.total}${projects.hours ? ` · cerca de ${projects.hours} h, à parte do plano` : ''}`;
  $('currentPhaseName').textContent = focus ? `Etapa ${focus.number}: ${focus.title}` : 'Você concluiu os tópicos obrigatórios desta trilha.';
  $('currentPhaseSub').textContent = focus
    ? `${focus.progress.requiredDone}/${focus.progress.requiredTotal} tópicos obrigatórios nesta etapa`
    : 'As ideias de projeto e os tópicos opcionais continuam disponíveis.';
  $('levelLabel').textContent = `Nível ${LEVEL_LABELS[trackState.level]} · ${track.name}`;
  $('optionalHint').textContent = stats.optional
    ? `Há ${stats.optional} tópico(s) abaixo do nível ${LEVEL_LABELS[trackState.level]}.`
    : 'Nada abaixo do seu nível ficou de fora.';
  const hours = $('weeklyHoursInput');
  if (document.activeElement !== hours) hours.value = trackState.weeklyHours;
  $('includeBelowLevel').checked = trackState.includeBelowLevel;
  $('allProjectLevels').checked = trackState.showAllProjectLevels;
  $('strikethroughToggle').checked = state.strikethrough;
  $('badgesUnlockedCounter').textContent = `${stats.badges}/${view.phases.length} desbloqueadas`;
  $('badgesContainer').innerHTML = view.phases.map((phase) => `
    <div class="flex items-center gap-2 p-2.5 rounded-xl border ${phase.progress.complete ? 'border-emerald-500/40 bg-emerald-500/10 animate-badge-glow' : 'border-slate-200 dark:border-slate-800 opacity-80'}" title="${escapeHtml(phase.badgeTitle)}">
      <span class="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold ${phase.progress.complete ? 'bg-emerald-500 text-white' : 'bg-slate-200 dark:bg-slate-800'}">${phase.progress.complete ? '✓' : phase.number}</span>
      <span class="min-w-0"><span class="block text-[11px] font-bold truncate">${escapeHtml(phase.badgeTitle)}</span><span class="text-[10px] font-mono">${phase.progress.done}/${phase.progress.total}</span></span>
    </div>`).join('');
  $('footerStats').textContent = `${view.phases.length} etapas · ${stats.required} tópicos no plano · ${projects.total} projetos deste nível`;
  const allCollapsed = view.phases.every((phase) => trackState.collapsedPhases[phase.id]);
  $('toggleAllPhasesLabel').textContent = allCollapsed ? 'Expandir todas' : 'Recolher todas';
  document.querySelectorAll('.filter-btn').forEach((button) => {
    const active = button.dataset.filter === session.filter;
    button.className = `filter-btn px-3 py-1.5 rounded-lg text-xs sm:text-sm ${active ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-slate-600 dark:text-slate-400'}`;
    button.setAttribute('aria-pressed', String(active));
  });
}

function updateHeader() {
  const track = activeTrack();
  $('trackBadge').textContent = track.name;
  $('trackTagline').textContent = track.description;
  $('trackIcon').innerHTML = icon(track.id);
  document.title = `Trilha de Estudos — ${track.name}`;
}

function refresh() {
  applyTheme();
  if (!isReady(state) || !activeTrack()) {
    openOnboarding(state.profile.onboarded ? 'retake' : 'create');
    return;
  }
  showScreen('app');
  updateHeader();
  updateDashboard();
  renderRoadmap();
}

function choiceCard(name, value, title, text, selected) {
  return `<label class="choice-card ${selected ? 'is-selected' : ''}" data-choice="${escapeHtml(name)}" data-value="${escapeHtml(value)}">
    <input class="sr-only" type="radio" name="${escapeHtml(name)}" value="${escapeHtml(value)}" ${selected ? 'checked' : ''} />
    <span class="block font-semibold">${escapeHtml(title)}</span>
    <span class="block mt-1 text-xs text-slate-500">${escapeHtml(text)}</span>
  </label>`;
}

function paintChoices() {
  document.querySelectorAll('.choice-card').forEach((card) => {
    const input = card.querySelector('input');
    card.classList.toggle('is-selected', input.checked);
  });
}

function renderOnboardingChoices() {
  const draft = session.onboarding;
  $('onbTrackGrid').innerHTML = tracks.map((track) => choiceCard(
    'track',
    track.id,
    track.name,
    track.tagline,
    draft.trackId === track.id,
  )).join('');
  $('onbStep2').innerHTML = `<legend class="sr-only">Nível atual</legend>${LEVELS.map((level) => choiceCard(
    'level',
    level,
    LEVEL_LABELS[level],
    LEVEL_COPY[level],
    draft.level === level,
  )).join('')}`;
  $('hourChoices').innerHTML = HOUR_PRESETS.map((hours) => choiceCard(
    'hours',
    String(hours),
    `${hours} h`,
    'por semana',
    draft.hours === hours,
  )).join('') + choiceCard('hours', 'custom', 'Outro', 'informar horas', draft.hours && !HOUR_PRESETS.includes(draft.hours));
  if (draft.hours && !HOUR_PRESETS.includes(draft.hours)) $('hoursCustom').value = draft.hours;
}

const STEP_COPY = [
  ['Qual é a sua área?', 'Escolha a trilha. Dá para trocar depois sem perder o que você já marcou em cada uma.'],
  ['Qual é o seu nível hoje?', 'Tópicos abaixo desse nível entram como opcionais. Eles continuam visíveis.'],
  ['Quantas horas por semana você consegue estudar?', 'A estimativa de cada etapa usa esse ritmo. Dá para ajustar depois.'],
  ['Seu plano', 'Confira as etapas antes de começar. O progresso fica salvo neste navegador.'],
];

function goToStep(step) {
  session.onboarding.step = step;
  for (let index = 1; index <= 4; index += 1) $(`onbStep${index}`).hidden = index !== step;
  const [heading, lead] = STEP_COPY[step - 1];
  $('onbStepLabel').textContent = `Passo ${step} de 4`;
  $('onbHeading').textContent = heading;
  $('onbLead').textContent = session.onboarding.mode === 'retake' && step === 4
    ? 'Progresso, anotações, observações e ideias criadas por você continuam. Opcionais e ocultos desta trilha voltam para a recomendação do novo nível.'
    : lead;
  $('onbBack').hidden = step === 1;
  $('onbNext').hidden = step === 4;
  $('onbStart').hidden = step !== 4;
  $('onbStart').textContent = session.onboarding.mode === 'retake' ? 'Atualizar trilha' : 'Começar trilha';
  if (step === 4) renderPreview();
}

function selectedRadio(name) {
  return document.querySelector(`input[name="${name}"]:checked`)?.value || null;
}

function selectedHours() {
  const picked = selectedRadio('hours');
  if (!picked) return null;
  if (picked === 'custom') return clampHours($('hoursCustom').value);
  return clampHours(picked);
}

function renderPreview() {
  const track = trackById(session.onboarding.trackId);
  const level = session.onboarding.level;
  const hours = session.onboarding.hours;
  if (!track || !level || !hours) {
    $('planPreview').textContent = 'Faltou alguma resposta. Volte um passo.';
    return;
  }
  const temp = emptyTrackState();
  temp.level = level;
  temp.weeklyHours = hours;
  const existing = state.tracks[track.id];
  if (existing) {
    temp.customTopics = existing.customTopics;
    temp.customProjects = existing.customProjects;
  }
  const view = buildRoadmap(track, temp);
  const stats = roadmapStats(view.phases);
  const projects = projectPlanStats(view.phases, level);
  const phases = view.phases.map((phase) => {
    const phaseHours = phase.topics
      .filter((topic) => topic.status === 'required')
      .reduce((sum, topic) => sum + (Number(topic.hours) || 0), 0);
    return `<li class="flex justify-between gap-3 py-2 border-t border-slate-200 dark:border-slate-800"><span>Etapa ${phase.number}: ${escapeHtml(phase.title)}</span><span class="font-mono text-xs shrink-0">${escapeHtml(phaseHours ? formatDuration(phaseHours, hours) : 'opcional')}</span></li>`;
  }).join('');
  $('planPreview').innerHTML = `
    <p class="font-semibold">${escapeHtml(track.name)} · ${LEVEL_LABELS[level]} · ${hours} h/semana</p>
    <p class="mt-2 text-sm text-slate-600 dark:text-slate-300">${stats.required} tópicos obrigatórios, ${stats.optional} opcionais e ${projects.total} ideias de projeto neste nível. ${escapeHtml(formatDuration(stats.hours, hours))} no ritmo escolhido.</p>
    <ol class="mt-3 text-sm">${phases}</ol>`;
}

function openOnboarding(mode) {
  session.onboarding.mode = mode;
  const current = activeTrackState();
  session.onboarding.trackId = mode === 'retake' ? state.activeTrackId : session.onboarding.trackId;
  session.onboarding.level = mode === 'retake' ? current?.level : session.onboarding.level;
  session.onboarding.hours = mode === 'retake' ? current?.weeklyHours : session.onboarding.hours;
  renderOnboardingChoices();
  showScreen('onboarding');
  goToStep(1);
}

function confirmOnboarding() {
  const { trackId, level, hours } = session.onboarding;
  const existing = state.tracks[trackId];
  const kept = existing
    ? {
      completed: existing.completed,
      notes: existing.notes,
      phaseNotes: existing.phaseNotes,
      completedProjects: existing.completedProjects,
      customTopics: existing.customTopics,
      customProjects: existing.customProjects,
      phaseOrder: existing.phaseOrder,
      topicOrder: existing.topicOrder,
      collapsedPhases: existing.collapsedPhases,
      showAllProjectLevels: existing.showAllProjectLevels,
      quizAnswers: existing.quizAnswers,
      guideChecks: existing.guideChecks,
      studyPlan: existing.studyPlan,
    }
    : null;
  const track = ensureTrack(state, trackId);
  if (kept) Object.assign(track, kept);
  track.level = level;
  track.weeklyHours = hours;
  track.includeBelowLevel = false;
  track.overrides = {};
  state.activeTrackId = trackId;
  state.profile.onboarded = true;
  persist();
  toast(session.onboarding.mode === 'retake' ? 'Trilha atualizada. Seu progresso continua salvo.' : 'Trilha pronta. Bom estudo.');
  refresh();
}

function findTopic(topicId) {
  const view = buildRoadmap(activeTrack(), activeTrackState());
  for (const phase of view.phases) {
    const topic = phase.topics.find((item) => item.id === topicId);
    if (topic) return { phase, topic };
  }
  return null;
}

function poolOf(phase) {
  const required = phase.topics.filter((topic) => topic.status === 'required');
  return required.length ? required : phase.topics.filter((topic) => topic.status !== 'hidden');
}

async function askConfirm({ title, body, confirmLabel, danger = true }) {
  $('confirmTitle').textContent = title;
  $('confirmBody').textContent = body;
  $('confirmAccept').textContent = confirmLabel;
  $('confirmAccept').className = `px-4 py-2 rounded-xl text-sm font-semibold text-white ${danger ? 'bg-rose-600' : 'bg-emerald-600'}`;
  const dialog = $('confirmDialog');
  const result = await new Promise((resolve) => {
    const onClose = () => {
      dialog.removeEventListener('close', onClose);
      resolve(dialog.returnValue === 'confirm');
    };
    dialog.addEventListener('close', onClose);
    dialog.showModal();
  });
  return result;
}

function openTopicDialog(topic) {
  editingTopicId = topic?.id || null;
  $('topicDialogTitle').textContent = topic ? 'Editar tópico' : 'Novo tópico';
  fillPhaseSelect($('topicPhase'), topic?.phaseId || activeTrack().phases[0].id);
  $('topicTitle').value = topic?.title || '';
  $('topicDescription').value = topic?.description || '';
  fillLevelSelect($('topicLevel'), topic?.level || activeTrackState().level);
  $('topicHours').value = topic?.hours || 4;
  $('topicTags').value = (topic?.tags || []).join(', ');
  $('topicResourceTitle').value = topic?.resources?.[0]?.title || '';
  $('topicResourceUrl').value = topic?.resources?.[0]?.url || '';
  $('topicDialog').showModal();
}

function openProjectDialog(phaseId, project) {
  editingProjectId = project?.id || null;
  $('projectDialogTitle').textContent = project ? 'Editar ideia' : 'Nova ideia de projeto';
  fillPhaseSelect($('projectPhase'), project?.phaseId || phaseId);
  $('projectTitle').value = project?.title || '';
  $('projectDescription').value = project?.description || '';
  fillLevelSelect($('projectLevel'), project?.level || activeTrackState().level);
  $('projectHours').value = project?.hours || 6;
  $('projectDialog').showModal();
}

function saveTopic(event) {
  event.preventDefault();
  const trackState = activeTrackState();
  const title = $('topicTitle').value.trim();
  if (title.length < 2) {
    toast('Dê um título para o tópico.', 'error');
    return;
  }
  const resourceTitle = $('topicResourceTitle').value.trim();
  const resourceUrl = $('topicResourceUrl').value.trim();
  const resources = resourceTitle && safeUrl(resourceUrl)
    ? [{ title: resourceTitle, url: resourceUrl, lang: 'pt', kind: 'leitura' }]
    : [];
  const data = {
    id: editingTopicId || newId('topico'),
    phaseId: $('topicPhase').value,
    title,
    description: $('topicDescription').value.trim(),
    level: $('topicLevel').value,
    hours: clampHours($('topicHours').value) || 4,
    tags: $('topicTags').value.split(',').map((tag) => tag.trim()).filter(Boolean),
    prerequisites: [],
    resources,
    custom: true,
  };
  trackState.customTopics = trackState.customTopics.filter((topic) => topic.id !== data.id);
  trackState.customTopics.push(data);
  $('topicDialog').close();
  persist();
  refresh();
  toast('Tópico salvo nesta trilha.');
}

function saveProject(event) {
  event.preventDefault();
  const trackState = activeTrackState();
  const title = $('projectTitle').value.trim();
  if (title.length < 2) {
    toast('Dê um título para a ideia.', 'error');
    return;
  }
  const data = {
    id: editingProjectId || newId('projeto'),
    phaseId: $('projectPhase').value,
    title,
    description: $('projectDescription').value.trim(),
    level: $('projectLevel').value,
    hours: clampHours($('projectHours').value) || 4,
    custom: true,
  };
  trackState.customProjects = trackState.customProjects.filter((project) => project.id !== data.id);
  trackState.customProjects.push(data);
  $('projectDialog').close();
  persist();
  refresh();
  toast('Ideia de projeto salva nesta trilha.');
}

function exportJson() {
  const blob = new Blob([JSON.stringify(buildExport(state), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `trilha-estudos-backup-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
  toast('Backup JSON exportado.');
}

function importJson(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result));
      const result = applyImport(state, parsed);
      if (state.activeTrackId && !trackById(state.activeTrackId)) {
        state.activeTrackId = tracks[0].id;
      }
      if (!activeTrackState()?.level) state.profile.onboarded = false;
      persist();
      refresh();
      toast(result.kind === 'legacy'
        ? 'Backup antigo do Full-Stack restaurado. Suas observações já salvas foram mantidas.'
        : 'Backup restaurado.');
    } catch (error) {
      toast('Arquivo JSON inválido. Verifique o formato.', 'error');
    }
  };
  reader.readAsText(file);
}

async function openShare() {
  const plan = sharePlanFromTrack(state, state.activeTrackId);
  const token = await encodePlan(plan);
  const url = `${location.origin}${location.pathname}${location.search}#plano=${encodeURIComponent(token)}`;
  if (url.length > 12000) {
    toast('Esse plano ficou grande para um link. Use o JSON.', 'error');
    return;
  }
  $('shareUrl').value = url;
  $('shareDialog').showModal();
  $('shareUrl').focus();
  $('shareUrl').select();
}

async function readIncomingPlan() {
  const token = planFromHash(location.hash);
  if (!token) return;
  history.replaceState(null, '', `${location.pathname}${location.search}`);
  try {
    const plan = await decodePlan(token);
    if (!trackById(plan.t)) throw new Error('Trilha ausente');
    if (!isReady(state)) {
      applySharePlan(state, plan);
      persist();
      toast('Plano compartilhado aplicado. O progresso continua só neste navegador.');
    } else {
      pendingPlan = plan;
      const track = trackById(plan.t);
      $('sharedBody').textContent = `${track.name}, nível ${LEVEL_LABELS[plan.l] || plan.l}, ${plan.h} h por semana. Isso substitui opcionais, ordem e ideias criadas nesta trilha. Progresso, anotações e observações são mantidos.`;
      $('sharedDialog').showModal();
    }
  } catch (error) {
    toast('Não foi possível ler o plano deste link.', 'error');
  }
}

function onRoadmapClick(event) {
  const el = event.target.closest('[data-action]');
  if (!el) return;
  const trackState = activeTrackState();
  const action = el.dataset.action;
  if (action === 'toggle-phase') {
    const id = el.dataset.phaseId;
    if (trackState.collapsedPhases[id]) delete trackState.collapsedPhases[id];
    else trackState.collapsedPhases[id] = true;
    persist();
    refresh();
    return;
  }
  if (action === 'toggle-note') {
    const id = el.dataset.itemId;
    if (session.openNotes[id]) delete session.openNotes[id];
    else session.openNotes[id] = true;
    renderRoadmap();
    if (session.openNotes[id]) document.getElementById(`note-${id}`)?.focus();
    return;
  }
  if (action === 'toggle-item') {
    const located = findTopic(el.dataset.itemId);
    if (!located) return;
    const wasDone = located.topic.done;
    if (wasDone) delete trackState.completed[located.topic.id];
    else trackState.completed[located.topic.id] = true;
    const after = buildRoadmap(activeTrack(), trackState);
    const phase = after.phases.find((item) => item.id === located.phase.id);
    if (!wasDone && phase.progress.complete) toast(`Etapa concluída: ${phase.badgeTitle}.`);
    persist();
    refresh();
    return;
  }
  if (action === 'toggle-phase-done') {
    const view = buildRoadmap(activeTrack(), trackState);
    const phase = view.phases.find((item) => item.id === el.dataset.phaseId);
    const pool = poolOf(phase);
    const allDone = pool.every((topic) => topic.done);
    pool.forEach((topic) => {
      if (allDone) delete trackState.completed[topic.id];
      else trackState.completed[topic.id] = true;
    });
    if (!allDone) toast(`Etapa ${phase.number} concluída.`);
    persist();
    refresh();
    return;
  }
  if (action === 'toggle-optional' || action === 'hide-topic' || action === 'restore-topic') {
    const located = findTopic(el.dataset.itemId);
    if (!located) return;
    if (action === 'hide-topic') setTopicStatus(trackState, located.topic, 'hidden');
    else if (action === 'restore-topic') setTopicStatus(trackState, located.topic, naturalStatus(located.topic, trackState));
    else setTopicStatus(trackState, located.topic, located.topic.status === 'optional' ? 'required' : 'optional');
    persist();
    refresh();
    if (action === 'hide-topic') toast('Tópico oculto. Você pode restaurá-lo no filtro Ocultos.');
    return;
  }
  if (action === 'move-topic') {
    const view = buildRoadmap(activeTrack(), trackState);
    const phase = view.phases.find((item) => item.id === el.dataset.phaseId);
    trackState.topicOrder[phase.id] = moveId(phase.topics.map((topic) => topic.id), el.dataset.itemId, Number(el.dataset.dir));
    persist();
    refresh();
    return;
  }
  if (action === 'move-phase') {
    const view = buildRoadmap(activeTrack(), trackState);
    trackState.phaseOrder = moveId(view.phases.map((phase) => phase.id), el.dataset.phaseId, Number(el.dataset.dir));
    persist();
    refresh();
    return;
  }
  if (action === 'edit-topic') {
    const custom = trackState.customTopics.find((topic) => topic.id === el.dataset.itemId);
    if (custom) openTopicDialog(custom);
    return;
  }
  if (action === 'delete-topic') {
    const id = el.dataset.itemId;
    askConfirm({
      title: 'Excluir este tópico?',
      body: 'A anotação e o progresso dele também saem. Isso vale só para tópicos que você criou.',
      confirmLabel: 'Excluir tópico',
    }).then((ok) => {
      if (!ok) return;
      trackState.customTopics = trackState.customTopics.filter((topic) => topic.id !== id);
      delete trackState.completed[id];
      delete trackState.notes[id];
      delete trackState.overrides[id];
      persist();
      refresh();
    }, () => {
      toast('Não foi possível confirmar a exclusão.', 'error');
    });
    return;
  }
  if (action === 'toggle-project') {
    const id = el.dataset.projectId;
    if (trackState.completedProjects[id]) delete trackState.completedProjects[id];
    else trackState.completedProjects[id] = true;
    persist();
    refresh();
    return;
  }
  if (action === 'add-project') {
    openProjectDialog(el.dataset.phaseId);
    return;
  }
  if (action === 'edit-project') {
    const project = trackState.customProjects.find((item) => item.id === el.dataset.projectId);
    if (project) openProjectDialog(project.phaseId, project);
    return;
  }
  if (action === 'delete-project') {
    const id = el.dataset.projectId;
    askConfirm({
      title: 'Excluir esta ideia?',
      body: 'A marcação de concluída também sai. Ideias que já vêm na trilha não são apagadas.',
      confirmLabel: 'Excluir ideia',
    }).then((ok) => {
      if (!ok) return;
      trackState.customProjects = trackState.customProjects.filter((project) => project.id !== id);
      delete trackState.completedProjects[id];
      persist();
      refresh();
    }, () => {
      toast('Não foi possível confirmar a exclusão.', 'error');
    });
    return;
  }
  if (action === 'show-all-projects') {
    trackState.showAllProjectLevels = true;
    persist();
    refresh();
    return;
  }
  if (action === 'open-quiz') {
    openQuiz(el.dataset.quizScope, el.dataset.quizScope === 'phase' ? el.dataset.phaseId : el.dataset.itemId);
    return;
  }
  if (action === 'guide-check') {
    const projectId = el.dataset.projectId;
    const group = el.dataset.guideGroup === 'criteria' ? 'criteria' : 'steps';
    const index = String(Number(el.dataset.index));
    const current = trackState.guideChecks[projectId] || { steps: {}, criteria: {} };
    if (!current[group]) current[group] = {};
    if (el.checked) current[group][index] = true;
    else delete current[group][index];
    trackState.guideChecks[projectId] = current;
    persist();
  }
}

function onRoadmapInput(event) {
  const el = event.target;
  const trackState = activeTrackState();
  if (!trackState) return;
  if (el.dataset.action === 'edit-note') {
    const value = el.value.slice(0, 20000);
    if (value.trim()) trackState.notes[el.dataset.itemId] = value;
    else delete trackState.notes[el.dataset.itemId];
    persist();
  }
  if (el.dataset.action === 'edit-phase-note') {
    const value = el.value.slice(0, 20000);
    if (value.trim()) trackState.phaseNotes[el.dataset.phaseId] = value;
    else delete trackState.phaseNotes[el.dataset.phaseId];
    persist();
  }
}

function bind() {
  $('themeToggleBtn').addEventListener('click', toggleTheme);
  $('onbThemeBtn').addEventListener('click', toggleTheme);
  $('retakeBtn').addEventListener('click', () => openOnboarding('retake'));
  $('shareBtn').addEventListener('click', () => { openShare().catch(() => toast('Não foi possível gerar o link.', 'error')); });
  $('copyShareBtn').addEventListener('click', async () => {
    const value = $('shareUrl').value;
    try {
      await navigator.clipboard.writeText(value);
      toast('Link copiado.');
    } catch {
      $('shareUrl').select();
      toast('Selecione o link e copie manualmente.', 'error');
    }
  });
  $('applyShareBtn').addEventListener('click', () => {
    if (!pendingPlan) return;
    applySharePlan(state, pendingPlan);
    pendingPlan = null;
    $('sharedDialog').close();
    persist();
    refresh();
    toast('Plano aplicado. Progresso e observações foram mantidos.');
  });
  $('searchInput').addEventListener('input', (event) => {
    session.search = event.target.value;
    renderRoadmap();
    updateDashboard();
  });
  document.querySelectorAll('.filter-btn').forEach((button) => {
    button.addEventListener('click', () => {
      session.filter = button.dataset.filter;
      updateDashboard();
      renderRoadmap();
    });
  });
  $('resetFiltersBtn').addEventListener('click', () => {
    session.search = '';
    session.filter = 'all';
    $('searchInput').value = '';
    updateDashboard();
    renderRoadmap();
  });
  $('toggleAllPhasesBtn').addEventListener('click', () => {
    const trackState = activeTrackState();
    const view = buildRoadmap(activeTrack(), trackState);
    const allCollapsed = view.phases.every((phase) => trackState.collapsedPhases[phase.id]);
    trackState.collapsedPhases = {};
    if (!allCollapsed) view.phases.forEach((phase) => { trackState.collapsedPhases[phase.id] = true; });
    persist();
    refresh();
  });
  $('strikethroughToggle').addEventListener('change', (event) => {
    state.strikethrough = event.target.checked;
    persist();
    renderRoadmap();
  });
  $('allProjectLevels').addEventListener('change', (event) => {
    activeTrackState().showAllProjectLevels = event.target.checked;
    persist();
    refresh();
  });
  $('includeBelowLevel').addEventListener('change', (event) => {
    activeTrackState().includeBelowLevel = event.target.checked;
    persist();
    refresh();
  });
  $('weeklyHoursInput').addEventListener('change', (event) => {
    const hours = clampHours(event.target.value);
    if (!hours) {
      toast('Use entre 1 e 60 horas por semana.', 'error');
      event.target.value = activeTrackState().weeklyHours;
      return;
    }
    activeTrackState().weeklyHours = hours;
    persist();
    refresh();
  });
  $('addTopicBtn').addEventListener('click', () => openTopicDialog());
  $('topicCancel').addEventListener('click', () => $('topicDialog').close());
  $('projectCancel').addEventListener('click', () => $('projectDialog').close());
  $('topicForm').addEventListener('submit', saveTopic);
  $('projectForm').addEventListener('submit', saveProject);
  $('exportJsonBtn').addEventListener('click', exportJson);
  $('importJsonBtn').addEventListener('click', () => $('importFileInput').click());
  $('importFileInput').addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) importJson(file);
  });
  $('resetProgressBtn').addEventListener('click', async () => {
    const ok = await askConfirm({
      title: 'Resetar o progresso desta trilha?',
      body: 'Isso desmarca tópicos e projetos e apaga anotações e observações desta trilha. Tópicos e ideias que você criou continuam na lista. As outras trilhas não mudam.',
      confirmLabel: 'Resetar esta trilha',
    });
    if (!ok) return;
    const trackState = activeTrackState();
    trackState.completed = {};
    trackState.notes = {};
    trackState.phaseNotes = {};
    trackState.completedProjects = {};
    session.openNotes = {};
    session.openPhaseNotes = {};
    persist();
    refresh();
    toast('Progresso desta trilha foi resetado.');
  });
  $('conteudo').addEventListener('click', onRoadmapClick);
  $('orphans').addEventListener('click', onRoadmapClick);
  $('conteudo').addEventListener('input', onRoadmapInput);
  $('conteudo').addEventListener('toggle', (event) => {
    const details = event.target;
    if (details instanceof HTMLDetailsElement && details.dataset.phaseId) {
      session.openPhaseNotes[details.dataset.phaseId] = details.open;
    }
  }, true);
  document.addEventListener('change', (event) => {
    if (event.target instanceof HTMLInputElement && event.target.type === 'radio') paintChoices();
  });
  $('hoursCustom').addEventListener('input', () => {
    const custom = document.querySelector('input[name="hours"][value="custom"]');
    if (custom) custom.checked = true;
    paintChoices();
  });
  $('onbBack').addEventListener('click', () => goToStep(Math.max(1, session.onboarding.step - 1)));
  $('onbNext').addEventListener('click', () => {
    const step = session.onboarding.step;
    if (step === 1) {
      session.onboarding.trackId = selectedRadio('track');
      if (!session.onboarding.trackId) return toast('Escolha uma área.', 'error');
    }
    if (step === 2) {
      session.onboarding.level = selectedRadio('level');
      if (!session.onboarding.level) return toast('Escolha um nível.', 'error');
    }
    if (step === 3) {
      session.onboarding.hours = selectedHours();
      if (!session.onboarding.hours) return toast('Informe entre 1 e 60 horas por semana.', 'error');
    }
    goToStep(step + 1);
  });
  $('onbStart').addEventListener('click', confirmOnboarding);
  $('exportMdBtn').addEventListener('click', () => {
    const view = buildRoadmap(activeTrack(), activeTrackState());
    downloadFile(`trilha-${activeTrack().id}.md`, roadmapMarkdown(activeTrack(), view), 'text/markdown');
  });
  $('exportPdfBtn').addEventListener('click', () => {
    const view = buildRoadmap(activeTrack(), activeTrackState());
    downloadFile(`trilha-${activeTrack().id}.pdf`, textPdf(roadmapLines(activeTrack(), view)), 'application/pdf');
  });
  $('exportPngBtn').addEventListener('click', async () => {
    await document.fonts.ready;
    const canvas = document.createElement('canvas');
    drawRoadmap(canvas, activeTrack(), buildRoadmap(activeTrack(), activeTrackState()));
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `trilha-${activeTrack().id}.png`;
    link.click();
    URL.revokeObjectURL(url);
  });
  initPlanScreen({
    track: activeTrack,
    trackState: activeTrackState,
    view: () => buildRoadmap(activeTrack(), activeTrackState()),
    persist,
    toast,
    escapeHtml,
    showApp: () => { $('app').hidden = false; },
    hideApp: () => { $('app').hidden = true; },
    download: downloadFile,
    downloadPdf: (sessions) => downloadFile(`plano-de-estudo-${activeTrack().id}.pdf`, textPdf(planMarkdown(activeTrack().name, sessions).split('\n')), 'application/pdf'),
  });
  $('quizDialog').addEventListener('close', () => {
    if (!$('app').hidden) refresh();
  });
  $('quizDialog').addEventListener('change', onQuizChange);
  $('quizDialog').addEventListener('click', (event) => {
    const button = event.target.closest('[data-review-topic]');
    if (!button) return;
    $('quizDialog').close();
    focusTopic(button.dataset.reviewTopic);
  });
}

function downloadFile(name, content, type) {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function focusTopic(topicId) {
  const located = findTopic(topicId);
  if (!located) return;
  delete activeTrackState().collapsedPhases[located.phase.id];
  session.filter = 'all';
  session.search = '';
  $('searchInput').value = '';
  refresh();
  document.querySelector(`[data-item-id="${CSS.escape(topicId)}"]`)?.scrollIntoView({ block: 'center' });
}

function openQuiz(scope, id) {
  const trackState = activeTrackState();
  const view = buildRoadmap(activeTrack(), trackState);
  let questions = [];
  let title = 'Autoavaliação';
  if (scope === 'phase') {
    const phase = view.phases.find((item) => item.id === id);
    if (!phase) return;
    questions = phase.quiz || [];
    title = `Autoavaliação · Etapa ${phase.number}`;
  } else {
    const located = findTopic(id);
    if (!located) return;
    questions = located.topic.quiz || [];
    title = `Autoavaliação · ${located.topic.title}`;
  }
  $('quizTitle').textContent = title;
  $('quizBody').innerHTML = questions.map((question) => {
    const picked = trackState.quizAnswers[question.id];
    const choices = question.choices.map((choice) => {
      const selected = picked === choice.id;
      const tone = !selected ? '' : choice.correct ? 'border-emerald-500' : 'border-rose-500';
      return `<label class="flex gap-2 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 ${tone}">
        <input type="radio" name="quiz-${question.id}" data-question="${question.id}" value="${choice.id}" ${selected ? 'checked' : ''} />
        <span><span>${escapeHtml(choice.text)}</span>${selected ? `<span class="block mt-1 text-xs text-slate-500">${escapeHtml(choice.explanation)}</span>` : ''}</span>
      </label>`;
    }).join('');
    const pickedChoice = question.choices.find((choice) => choice.id === picked);
    const review = pickedChoice && !pickedChoice.correct
      ? `<button type="button" class="mt-2 text-xs underline" data-review-topic="${question.reviewTopicId}">Rever este tópico</button>`
      : '';
    return `<fieldset><legend class="font-semibold text-sm">${escapeHtml(question.prompt)}</legend><div class="mt-2 space-y-2">${choices}</div>${review}</fieldset>`;
  }).join('');
  if (!$('quizDialog').open) $('quizDialog').showModal();
}

function onQuizChange(event) {
  const input = event.target;
  if (!input.dataset.question) return;
  activeTrackState().quizAnswers[input.dataset.question] = input.value;
  persist();
  const questionId = input.dataset.question;
  const view = buildRoadmap(activeTrack(), activeTrackState());
  let questions = [];
  let quizScope = 'topic';
  let ownerId = '';
  for (const phase of view.phases) {
    if ((phase.quiz || []).some((question) => question.id === questionId)) {
      questions = phase.quiz;
      quizScope = 'phase';
      ownerId = phase.id;
    }
    for (const topic of phase.topics) {
      if ((topic.quiz || []).some((question) => question.id === questionId)) {
        questions = topic.quiz;
        quizScope = 'topic';
        ownerId = topic.id;
      }
    }
  }
  openQuiz(quizScope, ownerId);
  if (quizScore(questions, activeTrackState().quizAnswers).needsReview) {
    toast('Vale revisar antes de seguir. Isso não é uma nota.');
  }
}

async function loadTracks() {
  const base = new URL('../data/tracks/', import.meta.url);
  const manifest = await fetch(new URL('index.json', base)).then((response) => {
    if (!response.ok) throw new Error('Manifesto das trilhas indisponível.');
    return response.json();
  });
  const loaded = [];
  for (const entry of manifest.tracks) {
    const response = await fetch(new URL(entry.file, base));
    if (!response.ok) throw new Error(`Não encontrei ${entry.file}.`);
    const data = await response.json();
    const errors = validateTrack(data);
    if (errors.length) throw new Error(`${entry.file}: ${errors[0]}`);
    loaded.push(data);
  }
  tracks = loaded;
}

async function boot() {
  bind();
  loadState();
  applyTheme();
  try {
    await loadTracks();
  } catch (error) {
    $('loadErrorText').textContent = `${error.message} Use um servidor local, por exemplo python3 -m http.server, ou abra a página publicada. O arquivo solto no navegador bloqueia a leitura dos dados.`;
    showScreen('loadError');
    return;
  }
  await readIncomingPlan();
  if (!isReady(state) || !activeTrack()) openOnboarding('create');
  else refresh();
}

await boot();
