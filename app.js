(() => {
  // ==================================================
  // CONFIG / CONSTANTS
  // ==================================================

  const days = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
  const slotsPerDay = 96;
  const storageKeyV2 = 'perfekte-woche-planer-v2';
  const storageKeyV1 = 'perfekte-woche-planer-v1';
  const authModeKey = 'perfekte-woche-auth-mode';
  const SUPABASE_URL = 'https://uwynzmdsveplxfqgwzqp.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_zIKjzTf24k4BDsVrQAyeZQ_WALpNEkH';
  const supabaseClient = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY) : null;
  let cloudUser = null;
  let guestMode = localStorage.getItem(authModeKey) === 'guest';
  let cloudSaveTimer = null;
  let cloudLoading = false;
  let icsSyncing = false;
  const cellHeight = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--cell-h')) || 18;

  // ==================================================
  // DEFAULTS
  // ==================================================

  const defaults = {
    selectedCategory: 'gym',
    habitOpen: false,
    activeHabitDay: 0,
    viewMode: 'calendar',
    plannerMode: 'week',
    uiHomeVersion: 'calendar-main-v1',
    todoDrawerOpen: false,
    drawerView: 'habit',
    openHeaderTodoDay: null,
    currentWeekStart: null,
    trackingView: 'week',
    trackingDate: null,
    trackingFilter: 'all',
    drawerHabitFilter: 'all',
    drawerTaskFilter: 'all',
    categories: {
      gym: { label: 'Gym / Sport', color: '#22c55e', habit: true },
      work: { label: 'Arbeit / Business', color: '#38bdf8', habit: true },
      sleep: { label: 'Schlaf', color: '#6366f1', habit: false },
      food: { label: 'Essen / Mealprep', color: '#f97316', habit: true },
      commute: { label: 'Fahrt / Wegzeit', color: '#64748b', habit: false },
      orga: { label: 'Orga / To-dos', color: '#94a3b8', habit: true },
      social: { label: 'Social / Dating', color: '#ec4899', habit: true },
      focus: { label: 'Deep Work', color: '#a855f7', habit: true },
      external: { label: 'Externer Kalender', color: '#2563eb', habit: true }
    },
    events: [],
    templateEvents: [],
    weekEvents: [],
    weekEventsByWeek: {},
    todos: []
  };

  // ==================================================
  // STATE
  // ==================================================

  let state = loadState();
  let isDragging = false;
  let dragDay = null;
  let dragStart = null;
  let dragEnd = null;
  let editingId = null;
  let editingCategoryId = null;
  let pendingTodoId = null;
  let presetSource = null;
  let lastAutoScrollKey = null;
  let currentTimeTimer = null;
  let currentTimeRenderDateKey = null;
  let editingDayTodoId = null;
  let drawerControlsCollapsed = true;
  let drawerTouchStartX = null;
  let drawerTouchStartY = null;
  let dayTodoDraftSubtasks = [];
  let eventDraftSubtasks = [];

  // ==================================================
  // DOM REFERENCES
  // ==================================================

  const calendar = document.getElementById('calendar');
  const calendarWrap = document.getElementById('calendarWrap');
  const legend = document.getElementById('legend');
  const categoryToggleBtn = document.getElementById('categoryToggleBtn');
  const modalBackdrop = document.getElementById('modalBackdrop');
  const modalTitle = document.getElementById('modalTitle');
  const modalLabel = document.getElementById('modalLabel');
  const modalCategory = document.getElementById('modalCategory');
  const modalDay = document.getElementById('modalDay');
  const modalStart = document.getElementById('modalStart');
  const modalEnd = document.getElementById('modalEnd');
  const modalStackedInto = document.getElementById('modalStackedInto');
  const modalIntegratedEvents = document.getElementById('modalIntegratedEvents');
  const modalInfo = document.getElementById('modalInfo');
  const modalAutoComplete = document.getElementById('modalAutoComplete');
  const modalSubtaskInput = document.getElementById('modalSubtaskInput');
  const modalAddSubtaskBtn = document.getElementById('modalAddSubtaskBtn');
  const modalSubtaskList = document.getElementById('modalSubtaskList');
  const deleteBlockBtn = document.getElementById('deleteBlockBtn');
  const drawerTitle = document.getElementById('drawerTitle');
  const drawerSwitch = document.getElementById('drawerSwitch');
  const drawerHabitBtn = document.getElementById('drawerHabitBtn');
  const drawerTodoBtn = document.getElementById('drawerTodoBtn');
  const drawerHabitLabel = document.getElementById('drawerHabitLabel');
  const drawerTodoLabel = document.getElementById('drawerTodoLabel');
  const drawerHabitPanel = document.getElementById('drawerHabitPanel');
  const drawerTodoPanel = document.getElementById('drawerTodoPanel');
  const dayTabs = document.getElementById('dayTabs');
  const habitList = document.getElementById('habitList');
  const calendarModeBtn = document.getElementById('calendarModeBtn');
  const taskModeBtn = document.getElementById('taskModeBtn');
  const taskDaySelect = document.getElementById('taskDaySelect');
  const drawerDaySelect = document.getElementById('drawerDaySelect');
  const drawerHabitFilter = document.getElementById('drawerHabitFilter');
  const drawerFilterMobileToggle = document.getElementById('drawerFilterMobileToggle');
  const drawerFilterMobileLabel = document.getElementById('drawerFilterMobileLabel');
  const drawerFilterRow = document.getElementById('drawerFilterRow');
  const drawerControlsPanel = document.getElementById('drawerControlsPanel');
  const drawerControlsSummary = document.getElementById('drawerControlsSummary');
  const drawerControlsToggleBtn = document.getElementById('drawerControlsToggleBtn');
  const drawerControlsSummaryText = document.getElementById('drawerControlsSummaryText');
  const drawerControlsSummaryAction = document.getElementById('drawerControlsSummaryAction');
  const drawerPrevDayBtn = document.getElementById('drawerPrevDayBtn');
  const drawerNextDayBtn = document.getElementById('drawerNextDayBtn');
  const drawerQuickAddBtn = document.getElementById('drawerQuickAddBtn');
  const drawerTaskFilter = document.getElementById('drawerTaskFilter');
  const drawerTaskFilterSelect = document.getElementById('drawerTaskFilterSelect');
  const drawerTaskAllBtn = document.getElementById('drawerTaskAllBtn');
  const drawerTaskTimedBtn = document.getElementById('drawerTaskTimedBtn');
  const drawerTaskUntimedBtn = document.getElementById('drawerTaskUntimedBtn');
  const drawerHabitProgress = document.getElementById('drawerHabitProgress');
  const drawerTodoProgress = document.getElementById('drawerTodoProgress');
  const drawerDayTodos = document.getElementById('drawerDayTodos');
  const dayTodoInput = document.getElementById('dayTodoInput');
  const dayTodoCategorySelect = document.getElementById('dayTodoCategorySelect');
  const addDayTodoBtn = document.getElementById('addDayTodoBtn');
  const dayTodoModalBackdrop = document.getElementById('dayTodoModalBackdrop');
  const dayTodoModalTitle = document.getElementById('dayTodoModalTitle');
  const dayTodoModalInfo = document.getElementById('dayTodoModalInfo');
  const dayTodoModalText = document.getElementById('dayTodoModalText');
  const dayTodoModalCategory = document.getElementById('dayTodoModalCategory');
  const dayTodoModalAuto = document.getElementById('dayTodoModalAuto');
  const dayTodoModalSubtaskInput = document.getElementById('dayTodoModalSubtaskInput');
  const dayTodoModalAddSubtaskBtn = document.getElementById('dayTodoModalAddSubtaskBtn');
  const dayTodoModalSubtaskList = document.getElementById('dayTodoModalSubtaskList');
  const cancelDayTodoModalBtn = document.getElementById('cancelDayTodoModalBtn');
  const saveDayTodoModalBtn = document.getElementById('saveDayTodoModalBtn');
  const deleteDayTodoModalBtn = document.getElementById('deleteDayTodoModalBtn');
  const dayTodoList = document.getElementById('dayTodoList');
  const dayTodoCount = document.getElementById('dayTodoCount');
  const taskView = document.getElementById('taskView');
  const taskTitle = document.getElementById('taskTitle');
  const taskProgress = document.getElementById('taskProgress');
  const taskList = document.getElementById('taskList');
  const todoInput = document.getElementById('todoInput');
  const todoCategorySelect = document.getElementById('todoCategorySelect');
  const todoList = document.getElementById('todoList');
  const todoSummary = document.getElementById('todoSummary');
  const todoDrawer = document.getElementById('todoDrawer');
  const todoDrawerBackdrop = document.getElementById('todoDrawerBackdrop');
  const todoDrawerToggleBtn = document.getElementById('todoDrawerToggleBtn');
  const closeTodoDrawerBtn = document.getElementById('closeTodoDrawerBtn');
  const templateModeBtn = document.getElementById('templateModeBtn');
  const weekModeBtn = document.getElementById('weekModeBtn');
  const trackingModeBtn = document.getElementById('trackingModeBtn');
  const applyTemplateBtn = document.getElementById('applyTemplateBtn');
  const plannerNote = document.getElementById('plannerNote');
  const weekNav = document.getElementById('weekNav');
  const prevWeekBtn = document.getElementById('prevWeekBtn');
  const todayWeekBtn = document.getElementById('todayWeekBtn');
  const nextWeekBtn = document.getElementById('nextWeekBtn');
  const weekDateInput = document.getElementById('weekDateInput');
  const weekLabel = document.getElementById('weekLabel');
  const weekRange = document.getElementById('weekRange');
  const weekSettings = document.getElementById('weekSettings');
  const weekSettingsBtn = document.getElementById('weekSettingsBtn');
  const weekSettingsMenu = document.getElementById('weekSettingsMenu');
  const trackingPanel = document.getElementById('trackingPanel');
  const routinePercent = document.getElementById('routinePercent');
  const routineSub = document.getElementById('routineSub');
  const routineFill = document.getElementById('routineFill');
  const extraPercent = document.getElementById('extraPercent');
  const extraSub = document.getElementById('extraSub');
  const extraFill = document.getElementById('extraFill');
  const totalPercent = document.getElementById('totalPercent');
  const totalSub = document.getElementById('totalSub');
  const totalFill = document.getElementById('totalFill');
  const trackingList = document.getElementById('trackingList');
  const trackingTitle = document.getElementById('trackingTitle');
  const trackingDescription = document.getElementById('trackingDescription');
  const trackingTodayBtn = document.getElementById('trackingTodayBtn');
  const trackingWeekBtn = document.getElementById('trackingWeekBtn');
  const trackingMonthBtn = document.getElementById('trackingMonthBtn');
  const trackingYearBtn = document.getElementById('trackingYearBtn');
  const trackingDateInput = document.getElementById('trackingDateInput');
  const trackingFilterSelect = document.getElementById('trackingFilterSelect');
  const routineTrackingLabel = document.getElementById('routineTrackingLabel');
  const extraTrackingLabel = document.getElementById('extraTrackingLabel');
  const totalTrackingLabel = document.getElementById('totalTrackingLabel');
  const trackingTimelineChart = document.getElementById('trackingTimelineChart');
  const trackingTimelineSub = document.getElementById('trackingTimelineSub');
  const trackingCategoryChart = document.getElementById('trackingCategoryChart');
  const trackingHeatmap = document.getElementById('trackingHeatmap');
  const trackingInsights = document.getElementById('trackingInsights');
  const cloudPanel = document.getElementById('cloudPanel');
  const cloudStatus = document.getElementById('cloudStatus');
  const authEmail = document.getElementById('authEmail');
  const authPassword = document.getElementById('authPassword');
  const loginBtn = document.getElementById('loginBtn');
  const signupBtn = document.getElementById('signupBtn');
  const magicLinkBtn = document.getElementById('magicLinkBtn');
  const skipLoginBtn = document.getElementById('skipLoginBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const profileMenu = document.getElementById('profileMenu');
  const profileButton = document.getElementById('profileButton');
  const profileAvatarLarge = document.getElementById('profileAvatarLarge');
  const profileName = document.getElementById('profileName');
  const profileSub = document.getElementById('profileSub');
  const profileAccountBtn = document.getElementById('profileAccountBtn');
  const profileLogoutBtn = document.getElementById('profileLogoutBtn');
  const categoryModalBackdrop = document.getElementById('categoryModalBackdrop');
  const categoryModalTitle = document.getElementById('categoryModalTitle');
  const categoryLabel = document.getElementById('categoryLabel');
  const categoryColor = document.getElementById('categoryColor');
  const categoryColorText = document.getElementById('categoryColorText');
  const categoryHabit = document.getElementById('categoryHabit');
  const categoryPreview = document.getElementById('categoryPreview');
  const deleteCategoryBtn = document.getElementById('deleteCategoryBtn');
  const cancelCategoryModalBtn = document.getElementById('cancelCategoryModalBtn');
  const saveCategoryBtn = document.getElementById('saveCategoryBtn');

  // ==================================================
  // STORAGE / MIGRATION
  // ==================================================

  function id() { return 'e-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8); }

  function loadState() {
    try {
      const rawV2 = localStorage.getItem(storageKeyV2);
      if (rawV2) return normalizeState(JSON.parse(rawV2));
      const rawV1 = localStorage.getItem(storageKeyV1);
      if (rawV1) return migrateV1(JSON.parse(rawV1));
      return clone(defaults);
    } catch {
      return normalizeState({});
    }
  }

  function normalizeState(input) {
    const shouldMigrateHomeView = input.uiHomeVersion !== 'calendar-main-v1';
    const s = { ...clone(defaults), ...input };
    s.uiHomeVersion = 'calendar-main-v1';
    s.categories = { ...clone(defaults).categories, ...(input.categories || {}) };
    Object.values(s.categories).forEach(cat => { if (cat.habit === undefined) cat.habit = true; });
    if (s.categories.neutral) {
      s.categories.orga = s.categories.orga || { label: 'Orga / To-dos', color: s.categories.neutral.color || '#94a3b8', habit: true };
      delete s.categories.neutral;
    }

    function normalizeEvent(ev, fallbackSource = 'routine') {
      return {
        id: ev.id || id(),
        day: clamp(Number(ev.day), 0, 6),
        start: clamp(Number(ev.start), 0, slotsPerDay - 1),
        end: clamp(Number(ev.end), 1, slotsPerDay),
        label: ev.label || 'Block',
        categoryId: s.categories[ev.categoryId] ? ev.categoryId : 'orga',
        done: Boolean(ev.done),
        missed: Boolean(ev.missed),
source: ['routine', 'extra'].includes(ev.source) ? ev.source : fallbackSource,
        templateEventId: ev.templateEventId || null,
        stackedIntoId: ev.stackedIntoId || null,
        importSource: ev.importSource || null,
        provider: ev.provider || null,
        externalId: ev.externalId || null,
        externalCalendarId: ev.externalCalendarId || null,
        sourceId: ev.sourceId || ev.externalCalendarId || ev.importSource || null,
        editable: ev.editable ?? true,
        readOnly: ev.readOnly ?? false,
        isExternal: ev.isExternal ?? (ev.importSource === 'ics' || ev.provider === 'ics'),
        autoComplete: Boolean(ev.autoComplete),
        subtasks: Array.isArray(ev.subtasks) ? ev.subtasks.map(sub => ({
          id: sub.id || id(),
          text: sub.text || 'Untertask',
          done: Boolean(sub.done),
          createdAt: sub.createdAt || new Date().toISOString()
        })) : [],
        createdAt: ev.createdAt || new Date().toISOString()
      };
    }

    const todayWeek = weekStartKey(new Date());
    const initialWeek = clampWeekKey(input.currentWeekStart || todayWeek);
    s.currentWeekStart = initialWeek;

    const legacyEvents = Array.isArray(input.events) ? input.events : [];
    const rawTemplateEvents = Array.isArray(input.templateEvents) ? input.templateEvents : legacyEvents;
    const rawWeekEvents = Array.isArray(input.weekEvents) ? input.weekEvents : [];

    s.templateEvents = rawTemplateEvents
      .map(ev => normalizeEvent(ev, 'routine'))
      .map(ev => ({ ...ev, source: 'routine', done: false, templateEventId: null }))
      .filter(ev => ev.end > ev.start);

    s.weekEventsByWeek = {};
    if (input.weekEventsByWeek && typeof input.weekEventsByWeek === 'object') {
      Object.entries(input.weekEventsByWeek).forEach(([weekKey, events]) => {
        const safeWeek = clampWeekKey(weekKey);
        if (!Array.isArray(events)) return;
        s.weekEventsByWeek[safeWeek] = events
          .map(ev => normalizeEvent(ev, ev.source || 'extra'))
          .filter(ev => ev.end > ev.start);
      });
    }

    if (rawWeekEvents.length && !s.weekEventsByWeek[initialWeek]) {
      s.weekEventsByWeek[initialWeek] = rawWeekEvents
        .map(ev => normalizeEvent(ev, ev.source || 'extra'))
        .filter(ev => ev.end > ev.start);
    }

    if (!s.weekEventsByWeek[s.currentWeekStart]) s.weekEventsByWeek[s.currentWeekStart] = [];
    s.weekEvents = s.weekEventsByWeek[s.currentWeekStart];
    s.events = s.templateEvents;

    s.todos = Array.isArray(input.todos) ? input.todos.map(todo => ({
      id: todo.id || id(),
      text: todo.text || 'To-do',
      categoryId: s.categories[todo.categoryId] ? todo.categoryId : 'orga',
      status: ['open', 'planned', 'done'].includes(todo.status) ? todo.status : 'open',
      done: Boolean(todo.done || todo.status === 'done'),
      plannedEventId: todo.plannedEventId || null,
      plannedWeekStart: todo.plannedWeekStart || null,
      plannedDay: todo.plannedDay === null || todo.plannedDay === undefined ? null : clamp(Number(todo.plannedDay), 0, 6),
      autoComplete: Boolean(todo.autoComplete),
      subtasks: Array.isArray(todo.subtasks) ? todo.subtasks.map(sub => ({
        id: sub.id || id(),
        text: sub.text || 'Untertask',
        done: Boolean(sub.done),
        createdAt: sub.createdAt || new Date().toISOString()
      })) : [],
      createdAt: todo.createdAt || new Date().toISOString()
    })).map(todo => syncTodoAutoComplete(todo)) : [];

    if (!s.categories[s.selectedCategory]) s.selectedCategory = 'gym';
    if (!['calendar', 'tasks'].includes(s.viewMode)) s.viewMode = 'calendar';
    if (!['template', 'week', 'tracking'].includes(s.plannerMode)) s.plannerMode = 'week';
    if (shouldMigrateHomeView && s.plannerMode === 'template') s.plannerMode = 'week';
    if (!['today', 'week', 'month', 'year'].includes(s.trackingView)) s.trackingView = 'week';
    if (!['all', 'open', 'done'].includes(s.trackingFilter)) s.trackingFilter = 'all';
    if (!['all', 'open', 'done', 'missed'].includes(s.drawerHabitFilter)) s.drawerHabitFilter = 'all';
    if (!['all', 'timed', 'untimed'].includes(s.drawerTaskFilter)) s.drawerTaskFilter = 'all';
    if (!s.trackingDate) s.trackingDate = dateKey(new Date());
    if (s.plannerMode !== 'week' && s.viewMode === 'tasks') s.viewMode = 'calendar';
    s.todoDrawerOpen = Boolean(s.todoDrawerOpen);
    if (!['habit', 'todo'].includes(s.drawerView)) s.drawerView = 'habit';
    const todayInfo = getTodayInfo();
    const isCurrentWeek = s.currentWeekStart === todayInfo.weekKey;
    s.activeHabitDay = isCurrentWeek ? todayInfo.dayIndex : clamp(Number(s.activeHabitDay), 0, 6);
    s.openHeaderTodoDay = s.openHeaderTodoDay === null || s.openHeaderTodoDay === undefined ? null : clamp(Number(s.openHeaderTodoDay), 0, 6);
    return s;
  }

  function migrateV1(old) {
    const s = clone(defaults);
    if (old.categories) {
      Object.entries(old.categories).forEach(([key, cat]) => {
        if (key === 'neutral') return;
        s.categories[key] = { ...cat, habit: !/schlaf|fahrt|wegzeit/i.test(cat.label || '') };
      });
    }
    const slots = old.slots || {};
    const visited = new Set();
    for (const k of Object.keys(slots)) {
      if (visited.has(k)) continue;
      const [dStr, stStr] = k.split('-');
      const day = Number(dStr), start = Number(stStr);
      const data = slots[k];
      let end = start + 1;
      visited.add(k);
      while (end < slotsPerDay) {
        const nextKey = `${day}-${end}`;
        const next = slots[nextKey];
        if (!next || next.categoryId !== data.categoryId || next.label !== data.label) break;
        visited.add(nextKey);
        end++;
      }
      let categoryId = data.categoryId === 'neutral' ? 'orga' : data.categoryId;
      if (!s.categories[categoryId]) categoryId = 'orga';
      s.templateEvents.push({
        id: id(),
        day,
        start,
        end,
        label: data.label || s.categories[categoryId].label,
        categoryId,
        done: false,
        source: 'routine',
        templateEventId: null,
        createdAt: new Date().toISOString()
      });
    }
    s.currentWeekStart = weekStartKey(new Date());
    s.weekEventsByWeek = { [s.currentWeekStart]: [] };
    s.weekEvents = s.weekEventsByWeek[s.currentWeekStart];
    s.events = s.templateEvents;
    s.selectedCategory = s.categories[old.selectedCategory] ? old.selectedCategory : 'gym';
    saveState(s);
    return s;
  }

  function saveState(next = state) {
    localStorage.setItem(storageKeyV2, JSON.stringify(next));
    scheduleCloudSave(next);
  }

  // ==================================================
  // AUTH / SUPABASE
  // ==================================================

  function setCloudStatus(message, mode = 'neutral') {
    if (!cloudStatus || !cloudPanel) return;
    cloudStatus.textContent = message;
    cloudPanel.classList.toggle('signed-in', mode === 'signed-in');
    cloudPanel.classList.toggle('error', mode === 'error');
  }




  function renderProfileMenu() {
    if (!profileMenu || !profileButton) return;
    const signedIn = Boolean(cloudUser);
    const visible = signedIn || guestMode;
    profileMenu.style.display = visible ? '' : 'none';
    if (!visible) {
      profileMenu.classList.remove('open');
      return;
    }
    const label = signedIn ? (cloudUser.email || 'Nutzer') : 'Lokaler Modus';
    const sub = signedIn ? 'Cloud Sync aktiv' : 'Nur lokale Speicherung';
    const initials = signedIn ? profileInitials(label) : 'LO';
    profileButton.textContent = initials;
    profileButton.classList.toggle('signed-in', signedIn);
    profileButton.classList.toggle('guest', !signedIn && guestMode);
    if (profileAvatarLarge) profileAvatarLarge.textContent = initials;
    if (profileName) profileName.textContent = label;
    if (profileSub) profileSub.textContent = sub;
    if (profileLogoutBtn) profileLogoutBtn.textContent = signedIn ? 'Ausloggen' : 'Zur Anmeldung';
  }

  function renderAuthUi() {
    const signedIn = Boolean(cloudUser);
    const locked = !signedIn && !guestMode;
    document.body.classList.toggle('cloud-signed-in', signedIn);
    document.body.classList.toggle('cloud-signed-out', locked);
    document.body.classList.toggle('cloud-guest', !signedIn && guestMode);

    loginBtn.style.display = signedIn ? 'none' : '';
    signupBtn.style.display = signedIn ? 'none' : '';
    magicLinkBtn.style.display = signedIn ? 'none' : '';
    skipLoginBtn.style.display = signedIn || guestMode ? 'none' : '';
    logoutBtn.style.display = signedIn ? '' : 'none';
    authEmail.style.display = signedIn ? 'none' : '';
    authPassword.style.display = signedIn ? 'none' : '';

    renderProfileMenu();

    const title = cloudPanel.querySelector('.cloud-title');
    if (title) title.textContent = signedIn ? 'Cloud Sync' : (guestMode ? 'Lokaler Modus' : 'Anmelden');

    if (signedIn) {
      setCloudStatus(`Eingeloggt als ${cloudUser.email || 'Nutzer'} · Cloud Sync aktiv.`, 'signed-in');
    } else if (guestMode) {
      setCloudStatus('Ohne Login aktiv · deine Daten werden nur lokal auf diesem Gerät gespeichert. Für Cloud Sync bitte einloggen.');
    } else {
      setCloudStatus('Bitte einloggen oder registrieren. Alternativ kannst du ohne Login lokal starten.');
    }
  }

  function scheduleCloudSave(next = state) {
    if (!supabaseClient || !cloudUser || cloudLoading) return;
    clearTimeout(cloudSaveTimer);
    const snapshot = clone(next);
    cloudSaveTimer = setTimeout(() => saveCloudState(snapshot), 650);
  }

  async function saveCloudState(snapshot = state) {
    if (!supabaseClient || !cloudUser || cloudLoading) return;
    try {
      console.log('[ICS] saveCloudState started');
      setCloudStatus(`Eingeloggt als ${cloudUser.email || 'Nutzer'} · Speichere in Supabase...`, 'signed-in');
      const savePromise = supabaseClient
        .from('planner_state')
        .upsert({
          user_id: cloudUser.id,
          data: snapshot,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });
      let cloudTimeoutId = null;
      const timeoutPromise = new Promise((_, reject) => {
        cloudTimeoutId = window.setTimeout(() => reject(new Error('ICS Sync fehlgeschlagen: Speichern in der Cloud nicht möglich.')), 20000);
      });
      const { error } = await Promise.race([savePromise, timeoutPromise]);
      if (cloudTimeoutId) window.clearTimeout(cloudTimeoutId);
      if (error) throw error;
      console.log('[ICS] saveCloudState finished');
      setCloudStatus(`Eingeloggt als ${cloudUser.email || 'Nutzer'} · Cloud Sync aktiv.`, 'signed-in');
    } catch (err) {
      console.error('[ICS] saveCloudState failed', err);
      setCloudStatus(`Cloud-Fehler: ${err.message || err}`, 'error');
    }
  }

  async function loadCloudState() {
    if (!supabaseClient || !cloudUser) return;
    cloudLoading = true;
    try {
      setCloudStatus('Lade Cloud-Daten aus Supabase...', 'signed-in');
      const { data, error } = await supabaseClient
        .from('planner_state')
        .select('data, updated_at')
        .eq('user_id', cloudUser.id)
        .maybeSingle();
      if (error) throw error;

      if (data && data.data) {
        state = normalizeState(data.data);
        localStorage.setItem(storageKeyV2, JSON.stringify(state));
        renderAll();
        setCloudStatus(`Eingeloggt als ${cloudUser.email || 'Nutzer'} · Cloud-Daten geladen.`, 'signed-in');
      } else {
        await saveCloudState(state);
        setCloudStatus(`Eingeloggt als ${cloudUser.email || 'Nutzer'} · Lokale Daten in Cloud gespeichert.`, 'signed-in');
      }
    } catch (err) {
      console.error(err);
      setCloudStatus(`Cloud-Fehler: ${err.message || err}`, 'error');
    } finally {
      cloudLoading = false;
    }
  }

  async function initCloudSync() {
    if (!supabaseClient) {
      setCloudStatus('Supabase konnte nicht geladen werden. Lokale Speicherung bleibt aktiv.', 'error');
      return;
    }
    renderAuthUi();
    const { data } = await supabaseClient.auth.getSession();
    cloudUser = data.session?.user || null;
    if (cloudUser) {
      guestMode = false;
      localStorage.removeItem(authModeKey);
    }
    renderAuthUi();
    if (cloudUser) await loadCloudState();

    supabaseClient.auth.onAuthStateChange(async (_event, session) => {
      cloudUser = session?.user || null;
      if (cloudUser) {
        guestMode = false;
        localStorage.removeItem(authModeKey);
      }
      renderAuthUi();
      if (cloudUser) await loadCloudState();
    });
  }

  async function signInWithPassword() {
    if (!supabaseClient) return;
    const email = authEmail.value.trim();
    const password = authPassword.value;
    if (!email || !password) return alert('Bitte E-Mail und Passwort eingeben.');
    setCloudStatus('Login läuft...');
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) return setCloudStatus(`Login-Fehler: ${error.message}`, 'error');
  }

  async function signUpWithPassword() {
    if (!supabaseClient) return;
    const email = authEmail.value.trim();
    const password = authPassword.value;
    if (!email || !password) return alert('Bitte E-Mail und Passwort eingeben.');
    if (password.length < 6) return alert('Nimm bitte mindestens 6 Zeichen als Passwort.');
    setCloudStatus('Registrierung läuft...');
    const { error } = await supabaseClient.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin + window.location.pathname }
    });
    if (error) return setCloudStatus(`Registrierungs-Fehler: ${error.message}`, 'error');
    setCloudStatus('Registrierung angelegt. Prüfe ggf. deine E-Mail zur Bestätigung.');
  }

  async function sendMagicLink() {
    if (!supabaseClient) return;
    const email = authEmail.value.trim();
    if (!email) return alert('Bitte E-Mail eingeben.');
    setCloudStatus('Magic Link wird gesendet...');
    const { error } = await supabaseClient.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin + window.location.pathname }
    });
    if (error) return setCloudStatus(`Magic-Link-Fehler: ${error.message}`, 'error');
    setCloudStatus('Magic Link gesendet. Öffne den Link in deiner E-Mail.');
  }

  async function signOut() {
    if (!supabaseClient) return;
    await supabaseClient.auth.signOut();
    cloudUser = null;
    guestMode = false;
    localStorage.removeItem(authModeKey);
    renderAuthUi();
  }

  function skipLoginLocal() {
    guestMode = true;
    localStorage.setItem(authModeKey, 'guest');
    renderAuthUi();
  }

  // ==================================================
  // DATE / TIME HELPERS
  // ==================================================

  function timeLabel(slot) {
    const clamped = clamp(slot, 0, slotsPerDay);
    const minutes = clamped * 15;
    const h = Math.floor(minutes / 60).toString().padStart(2, '0');
    const m = (minutes % 60).toString().padStart(2, '0');
    return `${h}:${m}`;
  }
  function eventTime(ev) { return `${timeLabel(ev.start)}–${timeLabel(ev.end)}`; }

  function currentWeekEvents() {
    if (!state.weekEventsByWeek) state.weekEventsByWeek = {};
    const key = clampWeekKey(state.currentWeekStart || weekStartKey(new Date()));
    state.currentWeekStart = key;
    if (!state.weekEventsByWeek[key]) state.weekEventsByWeek[key] = [];
    state.weekEvents = state.weekEventsByWeek[key];
    return state.weekEventsByWeek[key];
  }

  function setCurrentWeekEvents(nextEvents) {
    if (!state.weekEventsByWeek) state.weekEventsByWeek = {};
    const key = clampWeekKey(state.currentWeekStart || weekStartKey(new Date()));
    state.currentWeekStart = key;
    state.weekEventsByWeek[key] = nextEvents;
    state.weekEvents = state.weekEventsByWeek[key];
  }

  function currentEvents() {
    return state.plannerMode === 'week' ? currentWeekEvents() : state.templateEvents;
  }

  function setCurrentEvents(nextEvents) {
    if (state.plannerMode === 'week') setCurrentWeekEvents(nextEvents);
    else state.templateEvents = nextEvents;
    state.events = state.templateEvents;
  }

  function isWeekMode() { return state.plannerMode === 'week'; }
  function isTemplateMode() { return state.plannerMode === 'template'; }



  function dayCompletionStats(dayIndex) {
  if (!isWeekMode()) return { total: 0, done: 0, missed: 0, open: 0, percent: 0 };

  const habitItems = currentWeekEvents()
    .filter(ev => ev.day === dayIndex && state.categories[ev.categoryId]?.habit)
    .map(syncEventAutoComplete);

  const dayTodos = state.todos
    .map(syncTodoAutoComplete)
    .filter(todo =>
      todo.plannedWeekStart === state.currentWeekStart &&
      Number(todo.plannedDay) === Number(dayIndex) &&
      !todo.plannedEventId
    );

  const total = habitItems.length + dayTodos.length;
  const done = habitItems.filter(ev => ev.done).length + dayTodos.filter(todo => isTodoDone(todo)).length;
  const missed = habitItems.filter(ev => ev.missed).length;
  const open = Math.max(0, total - done - missed);

  return { total, done, missed, open, percent: makePercent(done, total) };
}

  function renderDrawerProgress(el, title, stats, subText) {
    if (!el) return;
    const colorClass = progressColorClass(stats.percent, stats.total);
    const value = stats.total ? `${stats.percent}%` : '0%';
    const progressWidth = stats.total ? stats.percent : 0;
    el.innerHTML = `
      <div class="drawer-progress-top">
        <div class="drawer-progress-title">${escapeHtml(title)}</div>
        <div class="drawer-progress-value">${value}</div>
      </div>
      <div class="day-progress-track"><div class="day-progress-fill ${colorClass}" style="width:${progressWidth}%"></div></div>
      <div class="drawer-progress-sub">${escapeHtml(subText)}</div>`;
  }


  function syncTodoAutoComplete(todo) {
    if (!todo) return todo;
    if (!Array.isArray(todo.subtasks)) todo.subtasks = [];
    if (todo.autoComplete && todo.subtasks.length) {
      const allDone = todo.subtasks.every(sub => sub.done);
      todo.done = allDone;
      todo.status = allDone ? 'done' : ((todo.plannedEventId || todo.plannedDay !== null && todo.plannedDay !== undefined) ? 'planned' : 'open');
    }
    return todo;
  }




  function syncEventAutoComplete(ev) {
    if (!ev) return ev;
    if (!Array.isArray(ev.subtasks)) ev.subtasks = [];
    if (ev.autoComplete && ev.subtasks.length) {
  ev.done = ev.subtasks.every(sub => sub.done);
  if (ev.done) ev.missed = false;
    }
    return ev;
  }

  function cloneEventSubtasks(ev) {
    return Array.isArray(ev?.subtasks) ? ev.subtasks.map(sub => ({
      id: sub.id || id(),
      text: sub.text || 'Untertask',
      done: Boolean(sub.done),
      createdAt: sub.createdAt || new Date().toISOString()
    })) : [];
  }

  function isTodoDone(todo) {
    syncTodoAutoComplete(todo);
    return Boolean(todo.done || todo.status === 'done');
  }

  function todoCompletionStats() {
    state.todos.forEach(syncTodoAutoComplete);
    const total = state.todos.length;
    const done = state.todos.filter(t => isTodoDone(t)).length;
    const open = state.todos.filter(t => !isTodoDone(t) && t.status === 'open').length;
    const planned = state.todos.filter(t => !isTodoDone(t) && t.status === 'planned').length;
    return { total, done, open, planned, percent: makePercent(done, total) };
  }


  function clampWeekKey(key) {
    const min = weekStartDate('2026-01-01');
    const candidate = weekStartDate(key || new Date());
    return dateKey(candidate < min ? min : candidate);
  }
  function getTodayInfo() {
    const today = toLocalDate(new Date());
    return {
      date: today,
      dateKey: dateKey(today),
      weekKey: weekStartKey(today),
      dayIndex: (today.getDay() + 6) % 7
    };
  }
  function getSelectedWeekStartDate() { return toLocalDate(clampWeekKey(state.currentWeekStart || new Date())); }
  function getDayDate(dayIndex) { return addDays(getSelectedWeekStartDate(), dayIndex); }
  function changeWeek(offset) {
    const next = addDays(getSelectedWeekStartDate(), offset * 7);
    state.currentWeekStart = clampWeekKey(next);
    currentWeekEvents();
    const today = getTodayInfo();
    if (state.currentWeekStart === today.weekKey) state.activeHabitDay = today.dayIndex;
    saveState();
    renderAll();
  }


  // ==================================================
  // CALENDAR
  // ==================================================

  function fillTimeSelect(select, includeEndOfDay = false) {
    select.innerHTML = '';
    const max = includeEndOfDay ? slotsPerDay : slotsPerDay - 1;
    for (let s = 0; s <= max; s++) {
      const option = document.createElement('option');
      option.value = String(s);
      option.textContent = timeLabel(s);
      select.appendChild(option);
    }
  }

  function fillDaySelect() {
    modalDay.innerHTML = '';
    days.forEach((day, index) => {
      const option = document.createElement('option');
      option.value = String(index);
      const dateText = isTemplateMode() ? '' : ` · ${formatShortDate(getDayDate(index))}`;
      option.textContent = `${day}${dateText}`;
      modalDay.appendChild(option);
    });
  }

  function integratedEventsForEvent(eventId) {
    if (!eventId) return [];
    return currentEvents()
      .filter(ev => ev.stackedIntoId === eventId)
      .sort((a, b) => a.start - b.start || a.end - b.end || String(a.createdAt).localeCompare(String(b.createdAt)));
  }

  function parentBlockCandidates(day, start, end, ownId = null) {
    return currentEvents()
      .filter(ev =>
        ev.id !== ownId &&
        !ev.stackedIntoId &&
        ev.day === day &&
        ev.start <= start &&
        ev.end >= end
      )
      .sort((a, b) => a.start - b.start || b.end - a.end);
  }

  function fillModalStackedIntoSelect(ev = null) {
    if (!modalStackedInto) return;
    const day = Number(modalDay.value);
    const start = Number(modalStart.value);
    const end = Number(modalEnd.value);
    const selectedParentId = modalStackedInto.value || ev?.stackedIntoId || '';
    const candidates = parentBlockCandidates(day, start, end, ev?.id || editingId || null);

    modalStackedInto.innerHTML = '';
    const ownOption = document.createElement('option');
    ownOption.value = '';
    ownOption.textContent = 'Als eigener Block anzeigen';
    modalStackedInto.appendChild(ownOption);

    candidates.forEach(parent => {
      const option = document.createElement('option');
      option.value = parent.id;
      option.textContent = `${eventTime(parent)} · ${parent.label}`;
      modalStackedInto.appendChild(option);
    });

    if (selectedParentId && !candidates.some(parent => parent.id === selectedParentId)) {
      const currentParent = currentEvents().find(parent => parent.id === selectedParentId);
      if (currentParent) {
        const option = document.createElement('option');
        option.value = currentParent.id;
        option.textContent = `${eventTime(currentParent)} · ${currentParent.label} · außerhalb aktueller Zeit`;
        modalStackedInto.appendChild(option);
      }
    }

    modalStackedInto.value = selectedParentId && Array.from(modalStackedInto.options).some(option => option.value === selectedParentId)
      ? selectedParentId
      : '';
  }

  function renderModalIntegratedEvents(eventId) {
    if (!modalIntegratedEvents) return;
    const children = integratedEventsForEvent(eventId);
    if (!eventId || !children.length) {
      modalIntegratedEvents.innerHTML = '';
      modalIntegratedEvents.style.display = 'none';
      return;
    }
    modalIntegratedEvents.style.display = '';
    modalIntegratedEvents.innerHTML = `
      <div class="event-integrated-list-title">${children.length} integrierte ${children.length === 1 ? 'Aufgabe' : 'Aufgaben'}</div>
      ${children.map(child => `
        <button type="button" class="event-integrated-row" data-event-id="${child.id}">
          <span>${escapeHtml(eventTime(child))}</span>
          <strong>${escapeHtml(child.label)}</strong>
        </button>`).join('')}`;
    modalIntegratedEvents.querySelectorAll('.event-integrated-row').forEach(row => {
      row.addEventListener('click', e => {
        e.preventDefault();
        openEditor(row.dataset.eventId);
      });
    });
  }

  // ==================================================
  // CATEGORIES
  // ==================================================

  function renderLegend() {
    legend.innerHTML = '';
    Object.entries(state.categories).forEach(([catId, cat]) => {
      const pill = document.createElement('div');
      pill.className = `pill ${state.selectedCategory === catId ? 'active' : ''}`;
      pill.title = 'Kategorie auswählen, bearbeiten oder löschen';
      pill.innerHTML = `<span class="dot" style="background:${cat.color}"></span>${escapeHtml(cat.label)}${cat.habit ? '' : ' · kein Habit'}`;
      pill.onclick = () => {
        state.selectedCategory = catId;
        saveState();
        renderLegend();
        openCategoryEditor(catId);
      };
      legend.appendChild(pill);
    });
  }


  function updateCategoryPreview() {
    const color = normalizeHexColor(categoryColorText.value || categoryColor.value, categoryColor.value || '#22c55e');
    const label = categoryLabel.value.trim() || 'Neue Kategorie';
    categoryColor.value = color;
    categoryColorText.value = color;
    categoryPreview.innerHTML = `<span class="dot" style="background:${color}"></span><span>${escapeHtml(label)}${categoryHabit.checked ? '' : ' · kein Habit'}</span>`;
  }

  function openCategoryEditor(catId = null) {
    editingCategoryId = catId;
    const cat = catId ? state.categories[catId] : null;
    categoryModalTitle.textContent = cat ? 'Kategorie bearbeiten' : 'Neue Kategorie';
    categoryLabel.value = cat?.label || '';
    categoryColor.value = normalizeHexColor(cat?.color || '#22c55e');
    categoryColorText.value = categoryColor.value;
    categoryHabit.checked = cat ? Boolean(cat.habit) : true;
    deleteCategoryBtn.style.display = cat ? '' : 'none';
    updateCategoryPreview();
    categoryModalBackdrop.style.display = 'flex';
    setTimeout(() => categoryLabel.focus(), 50);
  }

  function closeCategoryModal() {
    categoryModalBackdrop.style.display = 'none';
    editingCategoryId = null;
  }

  function createCategoryId(label) {
    const base = label.toLowerCase()
      .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-|-$/g, '') || 'kategorie';
    let candidate = base;
    let counter = 2;
    while (state.categories[candidate]) {
      candidate = `${base}-${counter}`;
      counter++;
    }
    return candidate;
  }

  function saveCategoryFromModal() {
    const label = categoryLabel.value.trim();
    if (!label) { alert('Bitte gib einen Namen für die Kategorie ein.'); return; }
    const color = normalizeHexColor(categoryColorText.value || categoryColor.value);
    const payload = { label, color, habit: Boolean(categoryHabit.checked) };

    const catId = editingCategoryId || createCategoryId(label);
    state.categories[catId] = payload;
    state.selectedCategory = catId;
    closeCategoryModal();
    saveState();
    renderAll();
  }

  function deleteCategoryFromModal() {
    const catId = editingCategoryId;
    if (!catId || !state.categories[catId]) return;
    const remainingIds = Object.keys(state.categories).filter(id => id !== catId);
    if (!remainingIds.length) {
      alert('Du brauchst mindestens eine Kategorie.');
      return;
    }
    const catLabel = state.categories[catId].label;
    const replacementId = remainingIds.includes('orga') ? 'orga' : remainingIds[0];
    const replacementLabel = state.categories[replacementId]?.label || 'eine andere Kategorie';
    if (!confirm(`Kategorie „${catLabel}“ wirklich löschen? Bestehende Blöcke und To-dos werden auf „${replacementLabel}“ umgestellt.`)) return;

    function replaceEventCategory(ev) {
      if (ev.categoryId === catId) ev.categoryId = replacementId;
      return ev;
    }
    state.templateEvents = (state.templateEvents || []).map(replaceEventCategory);
    if (state.weekEventsByWeek && typeof state.weekEventsByWeek === 'object') {
      Object.keys(state.weekEventsByWeek).forEach(weekKey => {
        state.weekEventsByWeek[weekKey] = (state.weekEventsByWeek[weekKey] || []).map(replaceEventCategory);
      });
    }
    state.todos = (state.todos || []).map(todo => {
      if (todo.categoryId === catId) todo.categoryId = replacementId;
      return todo;
    });
    delete state.categories[catId];
    if (state.selectedCategory === catId) state.selectedCategory = replacementId;
    currentWeekEvents();
    closeCategoryModal();
    saveState();
    renderAll();
  }

  // ==================================================
  // CALENDAR
  // ==================================================

  function autoScrollCalendarToMorning() {
    if (!calendarWrap || state.plannerMode === 'tracking' || state.viewMode === 'tasks') return;
    const key = `${state.plannerMode}|${state.viewMode}|${state.selectedWeekStart || ''}`;
    if (lastAutoScrollKey === key) return;
    lastAutoScrollKey = key;
    requestAnimationFrame(() => {
      calendarWrap.scrollTop = 24 * cellHeight(); // 06:00 Uhr, 24 Slots à 15 Minuten
    });
  }

  function currentTimeTop() {
    const now = new Date();
    const minutes = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
    return (minutes / 15) * cellHeight();
  }

  function updateCurrentTimeLine() {
    const today = getTodayInfo();
    if (currentTimeRenderDateKey && currentTimeRenderDateKey !== today.dateKey) {
      currentTimeRenderDateKey = today.dateKey;
      renderAll();
      return;
    }
    const line = calendar?.querySelector('.current-time-line');
    if (!line) return;
    line.style.top = `${currentTimeTop()}px`;
    line.title = `Jetzt · ${new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`;
  }

  function renderCurrentTimeLine(dayColumn, dayIndex, today) {
    if (!isWeekMode() || state.currentWeekStart !== today.weekKey || dayIndex !== today.dayIndex) return;
    const line = document.createElement('div');
    line.className = 'current-time-line';
    line.setAttribute('aria-hidden', 'true');
    line.style.top = `${currentTimeTop()}px`;
    line.title = `Jetzt · ${new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`;
    dayColumn.appendChild(line);
    currentTimeRenderDateKey = today.dateKey;
    updateCurrentTimeLine();
  }

  function startCurrentTimeTimer() {
    if (currentTimeTimer) return;
    currentTimeRenderDateKey = getTodayInfo().dateKey;
    currentTimeTimer = window.setInterval(updateCurrentTimeLine, 60000);
  }

  function renderCalendar() {
    calendar.innerHTML = '';
    const today = getTodayInfo();
    calendar.appendChild(headerCell('', 1));
    days.forEach((day, i) => calendar.appendChild(headerCell(day, i + 2, i)));

    const allDayLabel = document.createElement('div');
    allDayLabel.className = 'all-day-cell all-day-label';
    allDayLabel.textContent = 'Ganztag';
    allDayLabel.style.gridColumn = '1';
    calendar.appendChild(allDayLabel);

    const timeGrid = document.createElement('div');
    timeGrid.className = 'time-grid';
    for (let s = 0; s < slotsPerDay; s++) {
      const t = document.createElement('div');
      t.className = `time-cell ${s % 4 === 0 ? 'hour' : ''}`;
      t.textContent = s % 4 === 0 ? timeLabel(s) : '';
      timeGrid.appendChild(t);
    }
    calendar.appendChild(timeGrid);

    for (let d = 0; d < 7; d++) {
      const allDayCell = document.createElement('div');
      allDayCell.className = 'all-day-cell all-day-day';
      allDayCell.classList.toggle('expanded', state.openHeaderTodoDay === d);
      allDayCell.style.gridColumn = String(d + 2);
      allDayCell.dataset.day = d;
      allDayCell.title = `${days[d]} ${formatShortDate(getDayDate(d))} · Tages-To-do ohne Uhrzeit erstellen`;
      allDayCell.addEventListener('click', () => openDayTodoModalForDay(d));
      renderAllDayTodosForDay(allDayCell, d);
      calendar.appendChild(allDayCell);

      const col = document.createElement('div');
      const dayDateKey = dateKey(getDayDate(d));
      col.className = `day-column ${isWeekMode() && dayDateKey === today.dateKey ? 'today' : ''}`;
      col.style.gridColumn = String(d + 2);
      col.dataset.day = d;

      for (let s = 0; s < slotsPerDay; s++) {
        const slot = document.createElement('div');
        slot.className = `slot ${s % 4 === 0 ? 'hour' : ''}`;
        slot.style.top = `${s * cellHeight()}px`;
        slot.dataset.day = d;
        slot.dataset.slot = s;
        slot.title = `${days[d]} ${formatShortDate(getDayDate(d))} ${timeLabel(s)}-${timeLabel(s + 1)}`;
        slot.addEventListener('mousedown', (e) => startDrag(e, d, s));
        slot.addEventListener('mouseenter', () => moveDrag(d, s));
        slot.addEventListener('mouseup', () => finishDrag(d, s));
        col.appendChild(slot);
      }

      const events = currentEvents().filter(ev => ev.day === d && !ev.stackedIntoId);
      layoutDayEvents(events).forEach(ev => col.appendChild(eventEl(ev)));
      renderCurrentTimeLine(col, d, today);
      calendar.appendChild(col);
    }
    autoScrollCalendarToMorning();
  }

  function allDayTodosForDay(dayIndex) {
    if (!isWeekMode()) return [];
    return state.todos
      .map(syncTodoAutoComplete)
      .filter(todo => todo.plannedWeekStart === state.currentWeekStart && Number(todo.plannedDay) === Number(dayIndex) && !todo.plannedEventId);
  }

  function renderAllDayTodosForDay(cell, dayIndex) {
    const todos = allDayTodosForDay(dayIndex)
      .sort((a, b) => Number(isTodoDone(a)) - Number(isTodoDone(b)) || String(a.createdAt).localeCompare(String(b.createdAt)));
    const visible = todos.slice(0, 2);
    const isExpanded = state.openHeaderTodoDay === dayIndex;

    if (!isExpanded) {
      visible.forEach(todo => {
        const cat = state.categories[todo.categoryId] || state.categories.orga;
        const item = document.createElement('div');
        let clickTimer = null;
        item.className = `all-day-item ${isTodoDone(todo) ? 'done' : ''}`;
        item.style.borderLeftColor = cat.color;
        item.title = todo.text;
        item.innerHTML = `
          <input class="all-day-check" type="checkbox" ${isTodoDone(todo) ? 'checked' : ''} ${todo.autoComplete && Array.isArray(todo.subtasks) && todo.subtasks.length ? 'disabled title="Automatisch: erledigt sich, sobald alle Untertasks erledigt sind"' : ''} />
          <span class="all-day-text">${escapeHtml(todo.text)}</span>`;
        item.addEventListener('click', e => {
          e.preventDefault();
          e.stopPropagation();
          if (clickTimer) clearTimeout(clickTimer);
          clickTimer = setTimeout(() => {
            clickTimer = null;
            openHeaderTodosForDay(dayIndex);
          }, 220);
        });
        item.addEventListener('dblclick', e => {
          if (clickTimer) {
            clearTimeout(clickTimer);
            clickTimer = null;
          }
          openDayTodoEditor(todo, e);
        });
        item.querySelector('.all-day-check').addEventListener('click', e => e.stopPropagation());
        item.querySelector('.all-day-check').addEventListener('dblclick', e => e.stopPropagation());
        item.querySelector('.all-day-check').addEventListener('change', e => toggleDayTodoDone(todo, e.target.checked, e));
        cell.appendChild(item);
      });

      if (todos.length > visible.length) {
        const more = document.createElement('div');
        more.className = 'all-day-more';
        more.textContent = `+${todos.length - visible.length} mehr`;
        more.addEventListener('click', e => openHeaderTodosForDay(dayIndex, e));
        cell.appendChild(more);
      }
    }

    if (isExpanded) renderAllDayTodoPopover(cell, dayIndex, todos);
  }

  function openHeaderTodosForDay(dayIndex, event = null) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    state.activeHabitDay = clamp(Number(dayIndex), 0, 6);
    state.openHeaderTodoDay = state.activeHabitDay;
    saveState();
    renderAll();
  }

  function openExistingDayTodo(todo, event) {
    openHeaderTodosForDay(todo.plannedDay, event);
  }

  function closeHeaderTodos(event = null) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    state.openHeaderTodoDay = null;
    saveState();
    renderAll();
  }

  function openTodoPlannerForDay(dayIndex, event = null) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    state.activeHabitDay = clamp(Number(dayIndex), 0, 6);
    state.openHeaderTodoDay = null;
    state.todoDrawerOpen = true;
    state.drawerView = 'todo';
    saveState();
    renderAll();
  }

  function changeDrawerDay(offset) {
    const nextDay = clamp(Number(state.activeHabitDay) + offset, 0, 6);
    if (nextDay === state.activeHabitDay) return;
    state.activeHabitDay = nextDay;
    saveState();
    renderAll();
  }

  function deleteDayTodo(todo, event = null) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (!confirm('Dieses Tages-To-do löschen?')) return;
    state.todos = state.todos.filter(t => t.id !== todo.id);
    saveState();
    renderAll();
  }

  function toggleDayTodoDone(todo, done, event = null) {
    if (event) event.stopPropagation();
    if (todo.autoComplete && Array.isArray(todo.subtasks) && todo.subtasks.length) return;
    todo.done = Boolean(done);
    todo.status = todo.done ? 'done' : 'planned';
    saveState();
    renderAll();
  }

  function headerCell(text, col, dayIndex = null) {
    const div = document.createElement('div');
    const today = getTodayInfo();
    const isToday = isWeekMode() && dayIndex !== null && dateKey(getDayDate(dayIndex)) === today.dateKey;
    div.className = `head-cell ${isToday ? 'today' : ''}`;
    div.style.gridColumn = String(col);
    div.style.gridRow = '1';
    if (dayIndex === null) {
      div.textContent = text;
    } else if (isTemplateMode()) {
      div.textContent = text;
    } else {
      const stats = dayCompletionStats(dayIndex);
      const colorClass = progressColorClass(stats.percent, stats.total);
      const progressLabel = stats.total ? `${stats.percent}% · ${stats.done}/${stats.total}` : '0 Aufgaben';
      div.innerHTML = `
        <div>${text}<span class="day-date">${formatShortDate(getDayDate(dayIndex))}${isToday ? ' · Heute' : ''}</span></div>
        <div class="day-progress-wrap" title="${stats.done}/${stats.total} erledigt">
          <div class="day-progress-track"><div class="day-progress-fill ${colorClass}" style="width:${stats.percent}%"></div></div>
          <div class="day-progress-meta">${progressLabel}</div>
        </div>`;
    }
    return div;
  }

  function renderAllDayTodoPopover(container, dayIndex, todos) {
    const panel = document.createElement('div');
    panel.className = 'all-day-popover';
    panel.addEventListener('click', e => e.stopPropagation());

    const rows = todos.length
      ? todos.map(todo => {
          const doneState = isTodoDone(todo);
          const stats = subtaskStats(todo);
          const cat = state.categories[todo.categoryId] || state.categories.orga;
          const meta = stats.total ? `<span class="all-day-popover-meta">${stats.done}/${stats.total}</span>` : '';
          return `
            <div class="all-day-popover-row ${doneState ? 'done' : ''}" data-todo-id="${todo.id}" style="border-left-color:${escapeHtml(cat.color)}">
              <input class="all-day-popover-check" type="checkbox" ${doneState ? 'checked' : ''} ${todo.autoComplete && Array.isArray(todo.subtasks) && todo.subtasks.length ? 'disabled title="Automatisch: erledigt sich, sobald alle Untertasks erledigt sind"' : ''} />
              <button type="button" class="all-day-popover-task">${escapeHtml(todo.text)}</button>
              ${meta}
            </div>`;
        }).join('')
      : '<div class="all-day-popover-empty">Keine Tagesaufgaben.</div>';

    panel.innerHTML = `
      <div class="all-day-popover-head">
        <span>Tagesaufgaben</span>
        <button type="button" class="all-day-popover-close" title="Schließen">×</button>
      </div>
      <div class="all-day-popover-list">${rows}</div>
      <button type="button" class="all-day-popover-planner">Im To-do Planner öffnen</button>`;

    panel.querySelector('.all-day-popover-close').addEventListener('click', closeHeaderTodos);
    panel.querySelector('.all-day-popover-planner').addEventListener('click', e => openTodoPlannerForDay(dayIndex, e));
    panel.querySelectorAll('.all-day-popover-row').forEach(row => {
      const todo = todos.find(item => item.id === row.dataset.todoId);
      if (!todo) return;
      row.addEventListener('dblclick', e => openDayTodoEditor(todo, e));
      row.querySelector('.all-day-popover-check').addEventListener('change', e => toggleDayTodoDone(todo, e.target.checked, e));
      row.querySelector('.all-day-popover-check').addEventListener('click', e => e.stopPropagation());
      row.querySelector('.all-day-popover-check').addEventListener('dblclick', e => e.stopPropagation());
      row.querySelector('.all-day-popover-task').addEventListener('click', e => e.stopPropagation());
      row.querySelector('.all-day-popover-task').addEventListener('dblclick', e => openDayTodoEditor(todo, e));
    });
    container.appendChild(panel);
  }

  function startDrag(e, d, s) {
    if (e.button !== 0) return;
    e.preventDefault();
    isDragging = true;
    dragDay = d;
    dragStart = s;
    dragEnd = s;
    markSelection();
  }
  function moveDrag(d, s) {
    if (!isDragging || d !== dragDay) return;
    dragEnd = s;
    markSelection();
  }
  function finishDrag(d, s) {
    if (!isDragging || d !== dragDay) return;
    dragEnd = s;
    const start = Math.min(dragStart, dragEnd);
    const end = Math.max(dragStart, dragEnd) + 1;
    clearSelection();
    isDragging = false;
    if (end <= start) return;
    openEditor(null, { day: d, start, end, source: isTemplateMode() ? 'routine' : 'extra' });
  }
  document.addEventListener('mouseup', () => {
    if (!isDragging) return;
    clearSelection();
    isDragging = false;
  });
  function markSelection() {
    clearSelection();
    const a = Math.min(dragStart, dragEnd), b = Math.max(dragStart, dragEnd);
    document.querySelectorAll(`.slot[data-day="${dragDay}"]`).forEach(slot => {
      const s = Number(slot.dataset.slot);
      if (s >= a && s <= b) slot.classList.add('selected');
    });
  }
  function clearSelection() { document.querySelectorAll('.slot.selected').forEach(el => el.classList.remove('selected')); }

  function layoutDayEvents(events) {
    const sorted = [...events].sort((a, b) => a.start - b.start || b.end - a.end);
    const active = [];
    const groups = [];
    let group = [];
    let groupEnd = -1;

    sorted.forEach(ev => {
      if (!group.length || ev.start < groupEnd) {
        group.push(ev);
        groupEnd = Math.max(groupEnd, ev.end);
      } else {
        groups.push(group);
        group = [ev];
        groupEnd = ev.end;
      }
    });
    if (group.length) groups.push(group);

    const laidOut = [];
    groups.forEach(g => {
      const lanes = [];
      const byStart = [...g].sort((a, b) => a.start - b.start || a.end - b.end);
      byStart.forEach(ev => {
        let lane = lanes.findIndex(end => end <= ev.start);
        if (lane === -1) { lane = lanes.length; lanes.push(ev.end); }
        else lanes[lane] = ev.end;
        ev._lane = lane;
      });
      const laneCount = Math.max(1, lanes.length);
      byStart.forEach(ev => laidOut.push({ ...ev, _laneCount: laneCount }));
    });
    return laidOut;
  }

  function eventEl(ev) {
    syncEventAutoComplete(ev);
    const cat = state.categories[ev.categoryId] || state.categories.orga;
    const div = document.createElement('div');
    div.className = `event ${ev.done ? 'done' : ''} ${ev.missed ? 'missed' : ''} ${ev.source === 'extra' ? 'extra-event' : ''} ${ev.importSource === 'ics' ? 'external-calendar-event' : ''}`;
    div.dataset.id = ev.id;
    const gap = 3;
    const laneCount = ev._laneCount || 1;
    const totalGap = (laneCount - 1) * gap;
    const widthPercent = 100 / laneCount;
    const leftPercent = (ev._lane || 0) * widthPercent;
    const widthPxAdjustment = totalGap / laneCount;
    const leftPxAdjustment = (ev._lane || 0) * gap / laneCount;
    div.style.top = `${ev.start * cellHeight() + 1}px`;
    div.style.height = `${Math.max(16, (ev.end - ev.start) * cellHeight() - 2)}px`;
    div.style.left = `calc(${leftPercent}% + ${leftPxAdjustment}px)`;
    div.style.width = `calc(${widthPercent}% - ${widthPxAdjustment}px)`;
    div.style.background = cat.color;
    div.title = `${days[ev.day]} ${isTemplateMode() ? '' : formatShortDate(getDayDate(ev.day)) + ' '}${eventTime(ev)} · ${ev.label}`;
    const integratedCount = integratedEventsForEvent(ev.id).length;
    const integratedBadge = integratedCount ? `<div class="event-integrated-badge">+${integratedCount} im Block</div>` : '';

    const trackable = isWeekMode() && Boolean(cat.habit);
    div.innerHTML = `
  <div class="event-title-row">
    ${trackable ? `<input class="event-check" type="checkbox" ${ev.done ? 'checked' : ''} ${ev.autoComplete && Array.isArray(ev.subtasks) && ev.subtasks.length ? 'disabled title="Automatisch: erledigt sich, sobald alle Untertasks erledigt sind"' : 'title="Erledigt"'} />` : ''}
    ${trackable ? `<button class="event-missed-btn ${ev.missed ? 'active' : ''}" type="button" title="Nicht eingehalten">!</button>` : ''}
    <span class="event-title">${escapeHtml(ev.label)}</span>
  </div>
  <div class="event-time">${eventTime(ev)}</div>
  ${integratedBadge}`;

    div.addEventListener('mousedown', e => e.stopPropagation());
    div.addEventListener('click', e => e.stopPropagation());
    div.addEventListener('dblclick', e => { e.preventDefault(); e.stopPropagation(); if (ev.editable !== false) openEditor(ev.id); });
    const checkbox = div.querySelector('.event-check');
if (checkbox) {
  checkbox.addEventListener('click', e => {
    e.stopPropagation();
    toggleDone(ev.id, checkbox.checked);
  });
}

const missedBtn = div.querySelector('.event-missed-btn');
if (missedBtn) {
  missedBtn.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    toggleMissed(ev.id);
  });
}

return div;
  }

  // ==================================================
  // MODALS
  // ==================================================

  function openEditor(eventId = null, preset = null) {
    editingId = eventId;
    presetSource = preset?.source || null;
    const ev = eventId ? currentEvents().find(x => x.id === eventId) : {
      id: null,
      day: preset.day,
      start: preset.start,
      end: preset.end,
      label: preset.label || state.categories[preset.categoryId || state.selectedCategory]?.label || 'Block',
      categoryId: preset.categoryId || state.selectedCategory,
      done: false,
      missed: false,
      source: preset?.source || (isTemplateMode() ? 'routine' : 'extra'),
      templateEventId: null,
      stackedIntoId: null,
      autoComplete: false,
      subtasks: []
    };
    if (!ev) return;

    modalTitle.textContent = eventId ? 'Block bearbeiten' : 'Neuen Block erstellen';
    eventDraftSubtasks = cloneEventSubtasks(ev);
    if (modalAutoComplete) modalAutoComplete.checked = Boolean(ev.autoComplete);
    if (modalSubtaskInput) modalSubtaskInput.value = '';
    renderEventDraftSubtasks();
    modalLabel.value = ev.label;
    modalCategory.innerHTML = '';
    Object.entries(state.categories).forEach(([catId, cat]) => {
      const option = document.createElement('option');
      option.value = catId;
      option.textContent = `${cat.label}${cat.habit ? '' : ' · kein Habit'}`;
      if (catId === ev.categoryId) option.selected = true;
      modalCategory.appendChild(option);
    });
    fillDaySelect();
    fillTimeSelect(modalStart, false);
    fillTimeSelect(modalEnd, true);
    modalDay.value = String(ev.day);
    modalStart.value = String(ev.start);
    modalEnd.value = String(ev.end);
    fillModalStackedIntoSelect(ev);
    renderModalIntegratedEvents(ev.id);
    deleteBlockBtn.style.display = eventId ? '' : 'none';
    updateModalInfo();
    modalBackdrop.style.display = 'flex';
  }

  function closeModal() { modalBackdrop.style.display = 'none'; editingId = null; pendingTodoId = null; presetSource = null; eventDraftSubtasks = []; }


  function renderEventDraftSubtasks() {
    if (!modalSubtaskList) return;
    modalSubtaskList.innerHTML = '';
    if (!eventDraftSubtasks.length) {
      modalSubtaskList.innerHTML = '<div class="category-modal-note">Noch keine Untertasks. Beispiel: aufstehen, Bett machen, Sport, Frühstück, duschen.</div>';
      return;
    }
    eventDraftSubtasks.forEach((sub, index) => {
      const row = document.createElement('div');
      row.className = 'day-todo-modal-subtask-item';
      row.innerHTML = `<span>${escapeHtml(sub.text)}</span><button class="small ghost" type="button">Entfernen</button>`;
      row.querySelector('button').onclick = () => {
        eventDraftSubtasks.splice(index, 1);
        renderEventDraftSubtasks();
      };
      modalSubtaskList.appendChild(row);
    });
  }

  function addEventDraftSubtask() {
    if (!modalSubtaskInput) return;
    const text = modalSubtaskInput.value.trim();
    if (!text) return;
    eventDraftSubtasks.push({ id: id(), text, done: false, createdAt: new Date().toISOString() });
    modalSubtaskInput.value = '';
    renderEventDraftSubtasks();
    modalSubtaskInput.focus();
  }

  function updateModalInfo() {
    const d = Number(modalDay.value), start = Number(modalStart.value), end = Number(modalEnd.value);
    const durationMinutes = Math.max(0, end - start) * 15;
    const hours = Math.floor(durationMinutes / 60), minutes = durationMinutes % 60;
    const durationText = hours ? `${hours}h ${minutes ? minutes + 'min' : ''}` : `${minutes}min`;
    const categoryId = modalCategory.value;
    const habitText = state.categories[categoryId]?.habit ? 'erscheint im Habit Tracker' : 'kein Habit Tracking';
    modalInfo.textContent = `${days[d] || ''}${isTemplateMode() ? '' : ' · ' + formatShortDate(getDayDate(d))} · ${timeLabel(start)}–${timeLabel(end)} · Dauer: ${durationText} · ${habitText} · ${isTemplateMode() ? 'Routine-Vorlage' : (presetSource === 'extra' ? 'Extra-To-do' : 'Kalenderwoche')}`;
  }

  function fillDrawerDaySelect() {
    if (!drawerDaySelect) return;
    drawerDaySelect.innerHTML = '';
    days.forEach((day, index) => {
      const option = document.createElement('option');
      option.value = String(index);
      option.textContent = `${day} ${formatShortDate(getDayDate(index))}`;
      drawerDaySelect.appendChild(option);
    });
    drawerDaySelect.value = String(state.activeHabitDay);
  }


  function updateDrawerFilterMobileLabel() {
    if (!drawerFilterMobileLabel || !drawerDaySelect || !drawerHabitFilter) return;

    const dayText = drawerDaySelect.options[drawerDaySelect.selectedIndex]?.textContent || 'Tag';
    const filterText = drawerHabitFilter.options[drawerHabitFilter.selectedIndex]?.textContent || 'Alle';

    drawerFilterMobileLabel.textContent = `${dayText} · ${filterText}`;
  }

  // ==================================================
  // HABITS
  // ==================================================

  function createDrawerEventItem(ev, type = 'routine') {
    syncEventAutoComplete(ev);
    const cat = state.categories[ev.categoryId] || state.categories.orga;
    const item = document.createElement('div');
    const stats = eventSubtaskStats(ev);
    const autoDisabled = ev.autoComplete && stats.total > 0;
    item.className = `habit-item ${type === 'scheduled' ? 'scheduled-todo-item' : 'routine-item'} ${ev.done ? 'done' : ''} ${ev.missed ? 'missed' : ''}`;
    const statusText = ev.missed ? ' · Nicht eingehalten' : (ev.done ? ' · Erledigt' : '');
    const subtasksHtml = stats.total ? `
      <div class="habit-subtasks">
        ${ev.subtasks.map(sub => `
          <div class="habit-subtask ${sub.done ? 'done' : ''}" data-subtask-id="${sub.id}">
            <input class="habit-subtask-check" type="checkbox" ${sub.done ? 'checked' : ''} />
            <span class="habit-subtask-text">${escapeHtml(sub.text)}</span>
            <button type="button" class="ghost habit-subtask-edit">Edit</button>
          </div>`).join('')}
      </div>` : '';
    const integratedChildren = integratedEventsForEvent(ev.id);
    const integratedHtml = integratedChildren.length ? `
      <div class="habit-integrated-list">
        <div class="habit-integrated-title">Im Block · ${integratedChildren.length}</div>
        ${integratedChildren.map(child => `
          <button type="button" class="habit-integrated-row" data-event-id="${child.id}">
            <span>${escapeHtml(eventTime(child))}</span>
            <strong>${escapeHtml(child.label)}</strong>
          </button>`).join('')}
      </div>` : '';
    item.innerHTML = `
      <input class="habit-main-check" type="checkbox" ${ev.done ? 'checked' : ''} ${autoDisabled ? 'disabled title="Automatisch: erledigt sich, sobald alle Untertasks erledigt sind"' : ''} />
      <div>
        <div class="habit-name">${escapeHtml(ev.label)}</div>
        <div class="habit-meta">${eventTime(ev)} · ${escapeHtml(cat.label)}${type === 'scheduled' ? ' · eingeplant' : ' · Routine'}${stats.total ? ` · Untertasks ${stats.done}/${stats.total}` : ''}${integratedChildren.length ? ` · ${integratedChildren.length} im Block` : ''}${ev.autoComplete ? ' · Auto' : ''}${statusText}</div>
        ${stats.total ? `<div class="habit-subtask-summary">${stats.done}/${stats.total} erledigt · ${stats.percent}%</div>` : ''}
      </div>
      <button type="button" class="small ghost habit-edit-btn">Bearbeiten</button>
      ${subtasksHtml}
      ${integratedHtml}
      <div class="habit-actions">
        <button type="button" class="small ghost habit-add-subtask-btn">+ Untertask</button>
        <button type="button" class="small ghost habit-auto-btn">${ev.autoComplete ? 'Auto aus' : 'Auto an'}</button>
        <button type="button" class="small danger habit-missed-btn ${ev.missed ? 'active' : ''}">${ev.missed ? 'Nicht eingehalten ✓' : 'Nicht eingehalten'}</button>
      </div>`;
    const cb = item.querySelector('.habit-main-check');
    cb.addEventListener('change', () => {
      if (ev.autoComplete && ev.subtasks.length) return;
      toggleDone(ev.id, cb.checked);
    });
    item.querySelector('.habit-edit-btn').addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); openEditor(ev.id); });
    item.querySelector('.habit-add-subtask-btn').addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation(); addSubtaskToEvent(ev);
    });
    item.querySelector('.habit-auto-btn').addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation(); ev.autoComplete = !ev.autoComplete; syncEventAutoComplete(ev); saveState(); renderAll();
    });
    item.querySelector('.habit-missed-btn').addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation(); toggleMissed(ev.id);
    });
    item.querySelectorAll('.habit-subtask').forEach(row => {
      const subId = row.dataset.subtaskId;
      const sub = ev.subtasks.find(x => x.id === subId);
      if (!sub) return;
      row.querySelector('.habit-subtask-check').addEventListener('change', e => {
        e.stopPropagation(); sub.done = e.target.checked; syncEventAutoComplete(ev); saveState(); renderAll();
      });
      row.querySelector('.habit-subtask-edit').addEventListener('click', e => {
        e.preventDefault(); e.stopPropagation();
        const next = prompt('Untertask bearbeiten:', sub.text);
        if (next === null) return;
        const clean = next.trim();
        if (!clean) return alert('Der Untertask braucht einen Namen.');
        sub.text = clean; saveState(); renderAll();
      });
    });
    item.querySelectorAll('.habit-integrated-row').forEach(row => {
      row.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        openEditor(row.dataset.eventId);
      });
    });
    return item;
  }

  function addSubtaskToEvent(ev) {
    const text = prompt('Untertask hinzufügen, z. B. Bett machen, Sport, Frühstück, duschen:');
    if (text === null) return;
    const clean = text.trim();
    if (!clean) return alert('Der Untertask braucht einen Namen.');
    if (!Array.isArray(ev.subtasks)) ev.subtasks = [];
    ev.subtasks.push({ id: id(), text: clean, done: false, createdAt: new Date().toISOString() });
    syncEventAutoComplete(ev);
    saveState();
    renderAll();
  }

  // ==================================================
  // TODOS
  // ==================================================

  function fillDayTodoModalCategorySelect() {
    if (!dayTodoModalCategory) return;
    dayTodoModalCategory.innerHTML = '';
    Object.entries(state.categories).forEach(([catId, cat]) => {
      const option = document.createElement('option');
      option.value = catId;
      option.textContent = cat.label;
      dayTodoModalCategory.appendChild(option);
    });
  }

  function renderDayTodoDraftSubtasks() {
    if (!dayTodoModalSubtaskList) return;
    dayTodoModalSubtaskList.innerHTML = '';
    if (!dayTodoDraftSubtasks.length) {
      dayTodoModalSubtaskList.innerHTML = '<div class="category-modal-note">Noch keine Untertasks. Du kannst sie jetzt hinzufügen oder später am To-do ergänzen.</div>';
      return;
    }
    dayTodoDraftSubtasks.forEach((subtask, index) => {
      const text = typeof subtask === 'string' ? subtask : subtask.text;
      const row = document.createElement('div');
      row.className = 'day-todo-modal-subtask-item';
      row.innerHTML = `<span>${escapeHtml(text)}</span><button class="small ghost" type="button">Entfernen</button>`;
      row.querySelector('button').onclick = () => {
        dayTodoDraftSubtasks.splice(index, 1);
        renderDayTodoDraftSubtasks();
      };
      dayTodoModalSubtaskList.appendChild(row);
    });
  }

  function addDayTodoDraftSubtask() {
    const text = dayTodoModalSubtaskInput.value.trim();
    if (!text) return;
    dayTodoDraftSubtasks.push({ id: id(), text, done: false, createdAt: new Date().toISOString() });
    dayTodoModalSubtaskInput.value = '';
    renderDayTodoDraftSubtasks();
    dayTodoModalSubtaskInput.focus();
  }

  function normalizeDayTodoDraftSubtasks() {
    return dayTodoDraftSubtasks.map(subtask => {
      if (typeof subtask === 'string') {
        return { id: id(), text: subtask, done: false, createdAt: new Date().toISOString() };
      }
      return {
        id: subtask.id || id(),
        text: subtask.text || 'Untertask',
        done: Boolean(subtask.done),
        createdAt: subtask.createdAt || new Date().toISOString()
      };
    });
  }

  function openDayTodoModal() {
    if (!isWeekMode()) return alert('Tages-To-dos kannst du in der Kalenderwoche hinzufügen.');
    fillDayTodoModalCategorySelect();
    editingDayTodoId = null;
    dayTodoDraftSubtasks = [];
    dayTodoModalTitle.textContent = 'Tages-To-do erstellen';
    dayTodoModalInfo.textContent = `${days[state.activeHabitDay]} ${formatShortDate(getDayDate(state.activeHabitDay))} · ohne feste Uhrzeit. Du kannst es später zeitlich einplanen.`;
    dayTodoModalText.value = '';
    dayTodoModalCategory.value = state.selectedCategory || 'orga';
    dayTodoModalAuto.checked = false;
    dayTodoModalSubtaskInput.value = '';
    if (deleteDayTodoModalBtn) deleteDayTodoModalBtn.style.display = 'none';
    if (saveDayTodoModalBtn) saveDayTodoModalBtn.textContent = 'Tages-To-do erstellen';
    renderDayTodoDraftSubtasks();
    dayTodoModalBackdrop.style.display = 'flex';
    setTimeout(() => dayTodoModalText.focus(), 50);
  }

  function openDayTodoModalForDay(dayIndex) {
    state.activeHabitDay = clamp(Number(dayIndex), 0, 6);
    openDayTodoModal();
  }

  function openDayTodoEditor(todo, event = null) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (!todo || !isWeekMode()) return;
    fillDayTodoModalCategorySelect();
    editingDayTodoId = todo.id;
    state.activeHabitDay = clamp(Number(todo.plannedDay), 0, 6);
    dayTodoDraftSubtasks = Array.isArray(todo.subtasks) ? clone(todo.subtasks) : [];
    dayTodoModalTitle.textContent = 'Tages-To-do bearbeiten';
    dayTodoModalInfo.textContent = `${days[state.activeHabitDay]} ${formatShortDate(getDayDate(state.activeHabitDay))} · Tagesaufgabe ohne feste Uhrzeit.`;
    dayTodoModalText.value = todo.text || '';
    dayTodoModalCategory.value = todo.categoryId || state.selectedCategory || 'orga';
    dayTodoModalAuto.checked = Boolean(todo.autoComplete);
    dayTodoModalSubtaskInput.value = '';
    if (deleteDayTodoModalBtn) deleteDayTodoModalBtn.style.display = '';
    if (saveDayTodoModalBtn) saveDayTodoModalBtn.textContent = 'Änderungen speichern';
    renderDayTodoDraftSubtasks();
    dayTodoModalBackdrop.style.display = 'flex';
    setTimeout(() => dayTodoModalText.focus(), 50);
  }

  function closeDayTodoModal() {
    editingDayTodoId = null;
    dayTodoModalBackdrop.style.display = 'none';
  }

  function saveDayTodoFromModal() {
    const text = dayTodoModalText.value.trim();
    if (!text) { alert('Bitte gib ein Tages-To-do ein.'); return; }
    const subtasks = normalizeDayTodoDraftSubtasks();
    if (editingDayTodoId) {
      const todo = state.todos.find(item => item.id === editingDayTodoId);
      if (todo) {
        todo.text = text;
        todo.categoryId = dayTodoModalCategory.value || 'orga';
        todo.autoComplete = Boolean(dayTodoModalAuto.checked);
        todo.subtasks = subtasks;
        todo.plannedWeekStart = todo.plannedWeekStart || state.currentWeekStart;
        if (todo.plannedDay === undefined || todo.plannedDay === null) todo.plannedDay = state.activeHabitDay;
        todo.plannedEventId = null;
        syncTodoAutoComplete(todo);
      }
      closeDayTodoModal();
      saveState();
      renderAll();
      return;
    }
    state.todos.push({
      id: id(),
      text,
      categoryId: dayTodoModalCategory.value || 'orga',
      status: 'planned',
      done: false,
      plannedEventId: null,
      plannedWeekStart: state.currentWeekStart,
      plannedDay: state.activeHabitDay,
      autoComplete: Boolean(dayTodoModalAuto.checked),
      subtasks,
      createdAt: new Date().toISOString()
    });
    closeDayTodoModal();
    saveState();
    renderAll();
  }

  function addDayTodoQuick() {
    openDayTodoModal();
  }

  function deleteDayTodoFromModal() {
    if (!editingDayTodoId) return;
    const todo = state.todos.find(item => item.id === editingDayTodoId);
    if (!todo) {
      closeDayTodoModal();
      return;
    }
    if (!confirm('Dieses Tages-To-do löschen?')) return;
    state.todos = state.todos.filter(item => item.id !== todo.id);
    closeDayTodoModal();
    saveState();
    renderAll();
  }

  // ==================================================
  // HABITS
  // ==================================================

  function renderHabits() {
    dayTabs.innerHTML = '';
    fillDrawerDaySelect();
    if (drawerHabitFilter) drawerHabitFilter.value = state.drawerHabitFilter || 'all';
    renderDrawerTaskFilter();
    updateDrawerFilterMobileLabel();

    if (state.plannerMode !== 'week') {
      if (drawerHabitPanel) {
        drawerHabitPanel.classList.remove('untimed-task-filter', 'timed-task-filter');
      }
      renderDrawerProgress(drawerHabitProgress, 'Tagesfortschritt', { total: 0, done: 0, percent: 0 }, 'Wechsle auf „Kalender“, um Tages-Habits zu tracken.');
      renderDrawerControlsSummary({ total: 0, done: 0, open: 0 }, state.drawerTaskFilter || 'all');
      if (drawerDayTodos?.parentElement === habitList) drawerDayTodos.remove();
      habitList.innerHTML = '<div class="habit-empty">Der Habit Tracker ist für die echte Kalenderwoche gedacht. Wechsle auf „Kalender“, um Tages-Habits abzuhaken.</div>';
      renderDayTodos();
      return;
    }

    days.forEach((day, d) => {
      const btn = document.createElement('button');
      btn.className = `day-tab ${state.activeHabitDay === d ? 'active' : ''}`;
      btn.textContent = day;
      btn.onclick = () => { state.activeHabitDay = d; saveState(); renderAll(); };
      dayTabs.appendChild(btn);
    });

    const filter = state.drawerHabitFilter || 'all';
    const dayEvents = currentWeekEvents()
      .filter(ev => ev.day === state.activeHabitDay)
      .filter(ev => !ev.stackedIntoId)
      .filter(ev => filter === 'all' || (filter === 'done' ? ev.done : (filter === 'missed' ? ev.missed : (!ev.done && !ev.missed))))
      .sort((a, b) => a.start - b.start || a.end - b.end);

    const taskFilter = state.drawerTaskFilter || 'all';
    const showTimed = taskFilter !== 'untimed';
    const showUntimed = taskFilter !== 'timed';
    if (drawerHabitPanel) {
      drawerHabitPanel.classList.toggle('untimed-task-filter', taskFilter === 'untimed');
      drawerHabitPanel.classList.toggle('timed-task-filter', taskFilter === 'timed');
    }
    const dayTodoItems = dayTodosForActiveDay();
    const stats = drawerTaskStats(dayEvents, dayTodoItems, taskFilter);
    renderDrawerProgress(
      drawerHabitProgress,
      `${days[state.activeHabitDay]} ${formatShortDate(getDayDate(state.activeHabitDay))}`,
      stats,
      stats.total ? `${stats.done}/${stats.total} erledigt · ${stats.missed || 0} nicht eingehalten · ${stats.open || 0} offen` : 'Für diesen Filter gibt es an diesem Tag noch keine Aufgaben.'
    );
    renderDrawerControlsSummary(stats, taskFilter);

    const routineList = dayEvents.filter(ev => ev.source !== 'extra' && state.categories[ev.categoryId]?.habit);
    const scheduledTodos = dayEvents.filter(ev => ev.source === 'extra');

    if (drawerDayTodos?.parentElement === habitList) drawerDayTodos.remove();
    habitList.innerHTML = '';
    if (showTimed) {
      const wrap = document.createElement('div');
      wrap.className = `drawer-day-sections ${taskFilter === 'timed' ? 'timed-only' : ''}`;

      const routineSection = document.createElement('section');
      routineSection.className = 'drawer-task-section';
      routineSection.innerHTML = `
        <div class="drawer-task-section-head">
          <span>Habits / Routine</span>
          <span class="drawer-section-badge">${routineList.filter(ev => ev.done).length}/${routineList.length} · ${routineList.filter(ev => ev.missed).length}!</span>
        </div>
        <div class="drawer-task-section-sub">Feste Bestandteile deiner Routine-Vorlage. Orange markiert.</div>`;
      if (!routineList.length) {
        const empty = document.createElement('div');
        empty.className = 'habit-empty';
        empty.textContent = 'Für diesen Filter gibt es keine Routine-Habits an diesem Tag.';
        routineSection.appendChild(empty);
      } else {
        routineList.forEach(ev => routineSection.appendChild(createDrawerEventItem(ev, 'routine')));
      }
      wrap.appendChild(routineSection);

      const scheduledSection = document.createElement('section');
      scheduledSection.className = 'drawer-task-section';
      scheduledSection.innerHTML = `
        <div class="drawer-task-section-head">
          <span>To-dos mit Uhrzeit</span>
          <span class="drawer-section-badge">${scheduledTodos.filter(ev => ev.done).length}/${scheduledTodos.length} · ${scheduledTodos.filter(ev => ev.missed).length}!</span>
        </div>
        <div class="drawer-task-section-sub">Spontane oder geplante Aufgaben, die schon als Kalenderblock eingeplant sind.</div>`;
      if (!scheduledTodos.length) {
        const empty = document.createElement('div');
        empty.className = 'habit-empty';
        empty.textContent = 'Keine zeitlich eingeplanten To-dos für diesen Filter.';
        scheduledSection.appendChild(empty);
      } else {
        scheduledTodos.forEach(ev => scheduledSection.appendChild(createDrawerEventItem(ev, 'scheduled')));
      }
      wrap.appendChild(scheduledSection);

      habitList.appendChild(wrap);
    }
    renderDayTodos({ show: showUntimed, full: taskFilter === 'untimed' });
  }

  function renderDrawerTaskFilter() {
    const filter = state.drawerTaskFilter || 'all';
    if (!drawerTaskFilter) return;
    drawerTaskFilter.classList.toggle('timed-active', filter === 'timed');
    drawerTaskFilter.classList.toggle('untimed-active', filter === 'untimed');
    drawerTaskAllBtn.classList.toggle('active', filter === 'all');
    drawerTaskTimedBtn.classList.toggle('active', filter === 'timed');
    drawerTaskUntimedBtn.classList.toggle('active', filter === 'untimed');
    if (drawerTaskFilterSelect) drawerTaskFilterSelect.value = filter;
  }

  function renderDrawerControlsSummary(stats, taskFilter) {
    if (!drawerControlsPanel || !drawerControlsSummaryText || !drawerControlsSummaryAction) return;
    const filterLabels = { all: 'Alle Tasks', timed: 'Mit Uhrzeit', untimed: 'Ohne Uhrzeit' };
    const collapsed = Boolean(drawerControlsCollapsed);
    drawerControlsPanel.classList.toggle('collapsed', collapsed);
    drawerControlsSummaryText.textContent = `${days[state.activeHabitDay]} ${formatShortDate(getDayDate(state.activeHabitDay))} • ${filterLabels[taskFilter] || 'Alle Tasks'} • ${stats.open || 0}/${stats.total || 0} offen`;
    drawerControlsSummaryAction.innerHTML = collapsed
      ? '<span class="drawer-chevron down" aria-hidden="true"></span>'
      : '<span class="drawer-chevron up" aria-hidden="true"></span>';
    if (drawerPrevDayBtn) drawerPrevDayBtn.disabled = state.activeHabitDay <= 0;
    if (drawerNextDayBtn) drawerNextDayBtn.disabled = state.activeHabitDay >= 6;
  }

  function drawerTaskStats(dayEvents, dayTodoItems, taskFilter) {
    const timedItems = taskFilter === 'untimed' ? [] : dayEvents;
    const untimedItems = taskFilter === 'timed' ? [] : dayTodoItems;
    const total = timedItems.length + untimedItems.length;
    const done = timedItems.filter(ev => ev.done).length + untimedItems.filter(todo => isTodoDone(todo)).length;
    const missed = timedItems.filter(ev => ev.missed).length;
    const open = Math.max(total - done, 0);
    return { total, done, missed, open, percent: makePercent(done, total) };
  }


  function fillDayTodoCategorySelect() {
    if (!dayTodoCategorySelect) return;
    dayTodoCategorySelect.innerHTML = '';
    Object.entries(state.categories).forEach(([catId, cat]) => {
      const option = document.createElement('option');
      option.value = catId;
      option.textContent = cat.label;
      if (catId === 'orga') option.selected = true;
      dayTodoCategorySelect.appendChild(option);
    });
  }

  function dayTodosForActiveDay() {
    if (!isWeekMode()) return [];
    return state.todos
      .map(syncTodoAutoComplete)
      .filter(todo => todo.plannedWeekStart === state.currentWeekStart && Number(todo.plannedDay) === Number(state.activeHabitDay) && !todo.plannedEventId);
  }

  function addSubtaskToTodo(todo) {
    const text = prompt('Untertask hinzufügen, z. B. saugen, Wäsche, lüften:');
    if (text === null) return;
    const clean = text.trim();
    if (!clean) return alert('Der Untertask braucht einen Namen.');
    if (!Array.isArray(todo.subtasks)) todo.subtasks = [];
    todo.subtasks.push({ id: id(), text: clean, done: false, createdAt: new Date().toISOString() });
    syncTodoAutoComplete(todo);
    saveState();
    renderAll();
  }

  function renameTodoGlobal(todo) {
    const nextText = prompt('To-do umbenennen:', todo.text);
    if (nextText === null) return;
    const clean = nextText.trim();
    if (!clean) return alert('Das To-do braucht einen Namen.');
    todo.text = clean;
    if (todo.plannedEventId) {
      Object.values(state.weekEventsByWeek || {}).forEach(list => {
        const ev = Array.isArray(list) ? list.find(x => x.id === todo.plannedEventId) : null;
        if (ev) ev.label = clean;
      });
    }
    saveState();
    renderAll();
  }

  function planTodoAsCalendarBlock(todo) {
    pendingTodoId = todo.id;
    state.plannerMode = 'week';
    state.viewMode = 'calendar';
    if (todo.plannedDay !== null && todo.plannedDay !== undefined) state.activeHabitDay = Number(todo.plannedDay);
    saveState();
    renderAll();
    const start = 36;
    openEditor(null, {
      day: state.activeHabitDay,
      start,
      end: start + 4,
      label: todo.text,
      categoryId: todo.categoryId,
      source: 'extra'
    });
  }

  function renderDayTodos(options = {}) {
    if (!dayTodoList || !dayTodoCount) return;
    const { show = true, full = false } = options;
    fillDayTodoCategorySelect();
    if (!isWeekMode() || !show) {
      if (drawerDayTodos) {
        drawerDayTodos.style.display = 'none';
        drawerDayTodos.remove();
      }
      return;
    }
    if (drawerDayTodos) {
      drawerDayTodos.style.display = '';
      drawerDayTodos.classList.toggle('full-list', Boolean(full));
      if (habitList && drawerDayTodos.parentElement !== habitList) {
        habitList.appendChild(drawerDayTodos);
      }
    }
    const filter = state.drawerHabitFilter || 'all';
    const all = dayTodosForActiveDay();
    const visible = all
      .filter(todo => filter === 'all' || (filter === 'done' ? isTodoDone(todo) : !isTodoDone(todo)))
      .sort((a, b) => Number(isTodoDone(a)) - Number(isTodoDone(b)) || String(a.createdAt).localeCompare(String(b.createdAt)));
    const done = all.filter(isTodoDone).length;
    dayTodoCount.textContent = `${done}/${all.length}`;
    dayTodoList.innerHTML = '';
    if (!visible.length) {
      dayTodoList.innerHTML = '<div class="todo-empty">Noch keine Tages-To-dos für diesen Filter.</div>';
      return;
    }
    visible.forEach(todo => {
      syncTodoAutoComplete(todo);
      const cat = state.categories[todo.categoryId] || state.categories.orga;
      const subStats = subtaskStats(todo);
      const doneState = isTodoDone(todo);
      const autoDisabled = todo.autoComplete && subStats.total > 0;
      const card = document.createElement('div');
      card.className = `day-todo-card unscheduled-todo-card ${doneState ? 'done' : ''}`;
      card.style.borderLeft = `5px solid ${cat.color}`;
      const subtasksHtml = subStats.total ? `
        <div class="day-todo-subtasks">
          ${todo.subtasks.map(sub => `
            <div class="day-todo-subtask ${sub.done ? 'done' : ''}" data-subtask-id="${sub.id}">
              <input class="day-subtask-check" type="checkbox" ${sub.done ? 'checked' : ''} />
              <span class="day-todo-subtask-text">${escapeHtml(sub.text)}</span>
              <button type="button" class="ghost day-subtask-edit">Edit</button>
            </div>`).join('')}
        </div>` : '';
      card.innerHTML = `
        <input class="day-todo-check" type="checkbox" ${doneState ? 'checked' : ''} ${autoDisabled ? 'disabled title="Automatisch: erledigt sich, sobald alle Untertasks erledigt sind"' : ''} />
        <div class="day-todo-main">
          <div class="day-todo-name">${escapeHtml(todo.text)}</div>
          <div class="day-todo-meta">${escapeHtml(cat.label)}${subStats.total ? ` · Untertasks ${subStats.done}/${subStats.total}` : ''}${todo.autoComplete ? ' · Auto' : ''}</div>
        </div>
        <span class="todo-status">${todoStatusLabel(todo)}</span>
        ${subtasksHtml}
        <div class="day-todo-actions">
          <button type="button" class="small ghost day-add-subtask-btn">+ Untertask</button>
          <button type="button" class="small ghost day-auto-btn">${todo.autoComplete ? 'Auto aus' : 'Auto an'}</button>
          <button type="button" class="small ghost day-plan-btn">Uhrzeit planen</button>
          <button type="button" class="small ghost day-edit-btn">Bearbeiten</button>
          <button type="button" class="small danger day-delete-btn">Löschen</button>
        </div>`;
      const mainCheck = card.querySelector('.day-todo-check');
      mainCheck.addEventListener('change', () => {
        if (todo.autoComplete && todo.subtasks.length) return;
        todo.done = mainCheck.checked;
        todo.status = mainCheck.checked ? 'done' : 'planned';
        saveState();
        renderAll();
      });
      card.querySelector('.day-add-subtask-btn').onclick = e => { e.preventDefault(); e.stopPropagation(); addSubtaskToTodo(todo); };
      card.querySelector('.day-auto-btn').onclick = e => { e.preventDefault(); e.stopPropagation(); todo.autoComplete = !todo.autoComplete; syncTodoAutoComplete(todo); saveState(); renderAll(); };
      card.querySelector('.day-plan-btn').onclick = e => { e.preventDefault(); e.stopPropagation(); planTodoAsCalendarBlock(todo); };
      card.querySelector('.day-edit-btn').onclick = e => { e.preventDefault(); e.stopPropagation(); renameTodoGlobal(todo); };
      card.querySelector('.day-delete-btn').onclick = e => deleteDayTodo(todo, e);
      card.querySelectorAll('.day-todo-subtask').forEach(row => {
        const subId = row.dataset.subtaskId;
        const sub = todo.subtasks.find(x => x.id === subId);
        if (!sub) return;
        row.querySelector('.day-subtask-check').addEventListener('change', e => {
          e.stopPropagation();
          sub.done = e.target.checked;
          syncTodoAutoComplete(todo);
          saveState(); renderAll();
        });
        row.querySelector('.day-subtask-edit').addEventListener('click', e => {
          e.preventDefault(); e.stopPropagation();
          const next = prompt('Untertask bearbeiten:', sub.text);
          if (next === null) return;
          const clean = next.trim();
          if (!clean) return alert('Der Untertask braucht einen Namen.');
          sub.text = clean;
          saveState(); renderAll();
        });
      });
      dayTodoList.appendChild(card);
    });
  }

  function renderViewMode() {
    document.body.classList.toggle('task-mode', state.viewMode === 'tasks');
    document.body.classList.toggle('calendar-mode', state.viewMode !== 'tasks');
    calendarModeBtn.classList.toggle('active', state.viewMode === 'calendar');
    taskModeBtn.classList.toggle('active', state.viewMode === 'tasks');
    taskView.classList.toggle('active', state.viewMode === 'tasks');
    taskDaySelect.value = String(state.activeHabitDay);
  }

  function fillTaskDaySelect() {
    taskDaySelect.innerHTML = '';
    days.forEach((day, index) => {
      const option = document.createElement('option');
      option.value = String(index);
      option.textContent = `${day} ${formatShortDate(getDayDate(index))}`;
      taskDaySelect.appendChild(option);
    });
  }

  function renderTaskView() {
    const d = state.activeHabitDay;
    taskTitle.textContent = `${days[d]} ${formatShortDate(getDayDate(d))} · Tages-Tasks`;
    const all = currentWeekEvents()
      .filter(ev => ev.day === d && state.categories[ev.categoryId]?.habit)
      .sort((a, b) => a.start - b.start || a.end - b.end);
    const done = all.filter(ev => ev.done).length;
    const missed = all.filter(ev => ev.missed).length;
    taskProgress.textContent = `${done}/${all.length} erledigt · ${missed} nicht eingehalten`;
    taskList.innerHTML = '';

    if (!all.length) {
      taskList.innerHTML = '<div class="task-empty">Für diesen Tag gibt es noch keine trackbaren Aufgaben. Fahrt/Wegzeit und Schlaf werden bewusst ausgeblendet.</div>';
      return;
    }

    all.forEach(ev => {
      const cat = state.categories[ev.categoryId] || state.categories.orga;
      const item = document.createElement('label');
      item.className = `task-card ${ev.done ? 'done' : ''} ${ev.missed ? 'missed' : ''}`;
      item.innerHTML = `
        <input type="checkbox" ${ev.done ? 'checked' : ''} />
        <div class="task-main">
          <div class="task-name">${escapeHtml(ev.label)}</div>
          <div class="task-meta">${escapeHtml(cat.label)}</div>
        </div>
        <div class="task-time">${eventTime(ev)}</div>
        <button type="button" class="small danger task-missed-btn" style="grid-column: 3; justify-self:end;">${ev.missed ? 'Nicht eingehalten ✓' : 'Nicht eingehalten'}</button>
        <button type="button" class="small ghost task-edit-btn" style="grid-column: 3; justify-self:end;">Bearbeiten</button>`;
      item.style.borderLeft = `5px solid ${cat.color}`;
      const cb = item.querySelector('input');
      cb.addEventListener('change', () => toggleDone(ev.id, cb.checked));
      item.querySelector('.task-missed-btn').addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); toggleMissed(ev.id); });
      item.querySelector('.task-edit-btn').addEventListener('click', e => { e.preventDefault(); openEditor(ev.id); });
      taskList.appendChild(item);
    });
  }


  // ==================================================
  // CALENDAR
  // ==================================================

  function renderPlannerMode() {
    const isTracking = state.plannerMode === 'tracking';
    const showCalendarArea = state.viewMode === 'calendar' && !isTracking;
    const weekInfo = getISOWeekInfo(getSelectedWeekStartDate());
    document.body.classList.toggle('planner-template', state.plannerMode === 'template');
    document.body.classList.toggle('planner-week', state.plannerMode === 'week');
    document.body.classList.toggle('planner-tracking', isTracking);

    templateModeBtn.classList.toggle('active', state.plannerMode === 'template');
    weekModeBtn.classList.toggle('active', state.plannerMode === 'week');
    trackingModeBtn.classList.toggle('active', isTracking);

    const clearBtn = document.getElementById('clearBtn');
    if (clearBtn) {
      clearBtn.textContent = state.plannerMode === 'template' ? 'Routine-Vorlage löschen' : 'Kalenderwoche löschen';
    }

    applyTemplateBtn.style.display = state.plannerMode === 'week' ? '' : 'none';
    trackingPanel.classList.toggle('active', isTracking);
    calendar.parentElement.style.display = showCalendarArea ? '' : 'none';
    document.querySelector('.footer-note').style.display = showCalendarArea ? '' : 'none';
    taskView.classList.toggle('active', state.viewMode === 'tasks' && state.plannerMode === 'week');
    weekNav.style.display = isTracking ? 'none' : '';
    const showWeekControls = state.plannerMode === 'week';
    prevWeekBtn.style.display = showWeekControls ? '' : 'none';
    todayWeekBtn.style.display = showWeekControls ? '' : 'none';
    nextWeekBtn.style.display = showWeekControls ? '' : 'none';
    weekDateInput.style.display = showWeekControls ? '' : 'none';
    weekLabel.style.display = showWeekControls ? '' : 'none';
    weekRange.style.display = showWeekControls ? '' : 'none';

    if (state.plannerMode !== 'week' && state.viewMode === 'tasks') state.viewMode = 'calendar';
    taskModeBtn.disabled = state.plannerMode !== 'week';
    taskDaySelect.disabled = state.plannerMode !== 'week';

    if (state.plannerMode === 'template') {
      plannerNote.textContent = 'Routine-Vorlage bearbeiten. Hier legst du deine ideale Standardwoche fest.';
    } else if (state.plannerMode === 'week') {
      plannerNote.textContent = `Kalender · KW ${weekInfo.week}/${weekInfo.year}`;
    } else {
      plannerNote.textContent = `Auswertung für KW ${weekInfo.week}/${weekInfo.year}: Routine und Extra-To-dos getrennt.`;
    }
  }

  // ==================================================
  // TRACKING
  // ==================================================

  function routineTrackingStats() {
    const trackableTemplate = state.templateEvents.filter(ev => state.categories[ev.categoryId]?.habit);
    const done = trackableTemplate.filter(templateEv => {
      const weekEv = currentWeekEvents().find(ev => ev.source === 'routine' && ev.templateEventId === templateEv.id);
      return Boolean(weekEv?.done);
    }).length;
    return { total: trackableTemplate.length, done, percent: makePercent(done, trackableTemplate.length) };
  }

  function extraTrackingStats() {
    const extras = currentWeekEvents().filter(ev => ev.source === 'extra' && state.categories[ev.categoryId]?.habit);
    const done = extras.filter(ev => ev.done).length;
    return { total: extras.length, done, percent: makePercent(done, extras.length) };
  }

  function trackingDateBase() {
    return toLocalDate(state.trackingDate || state.currentWeekStart || new Date());
  }

  function rangeForTrackingView() {
    const base = trackingDateBase();
    if (state.trackingView === 'today') {
      return { start: base, end: base, label: formatLongDate(base), title: 'Tages-Tracking' };
    }
    if (state.trackingView === 'month') {
      const start = new Date(base.getFullYear(), base.getMonth(), 1);
      const end = new Date(base.getFullYear(), base.getMonth() + 1, 0);
      return { start, end, label: base.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' }), title: 'Monats-Tracking' };
    }
    if (state.trackingView === 'year') {
      const start = new Date(base.getFullYear(), 0, 1);
      const end = new Date(base.getFullYear(), 11, 31);
      return { start, end, label: String(base.getFullYear()), title: 'Jahres-Tracking' };
    }
    const start = weekStartDate(base);
    const end = addDays(start, 6);
    const info = getISOWeekInfo(start);
    return { start, end, label: `KW ${info.week}/${info.year} · ${formatLongDate(start)} – ${formatLongDate(end)}`, title: 'Wochen-Tracking' };
  }


  function weekEventsForKey(weekKey) {
    if (!state.weekEventsByWeek) state.weekEventsByWeek = {};
    return Array.isArray(state.weekEventsByWeek[weekKey]) ? state.weekEventsByWeek[weekKey] : [];
  }

  function buildTrackingItems() {
    const range = rangeForTrackingView();
    const items = [];
    const today = toLocalDate(new Date());
    let end = toLocalDate(range.end);
    if (state.trackingView === 'month' || state.trackingView === 'year') {
      end = end > today ? today : end;
    }

    eachDateInRange(range.start, end).forEach(date => {
      const weekKey = weekStartKey(date);
      const dayIndex = (date.getDay() + 6) % 7;
      const weekEvents = weekEventsForKey(weekKey);
      state.templateEvents
        .filter(ev => ev.day === dayIndex && state.categories[ev.categoryId]?.habit)
        .forEach(templateEv => {
          const weekEv = weekEvents.find(ev => ev.source === 'routine' && ev.templateEventId === templateEv.id);
          items.push({
            type: 'routine',
            done: Boolean(weekEv?.done),
            label: templateEv.label,
            categoryId: templateEv.categoryId,
            day: dayIndex,
            date,
            start: templateEv.start,
            end: templateEv.end
          });
        });

      weekEvents
        .filter(ev => ev.day === dayIndex && ev.source === 'extra' && state.categories[ev.categoryId]?.habit)
        .forEach(ev => {
          items.push({
            type: 'extra',
            done: Boolean(ev.done),
            label: ev.label,
            categoryId: ev.categoryId,
            day: ev.day,
            date,
            start: ev.start,
            end: ev.end
          });
        });
    });
    return { range, items };
  }


  function renderTrackingTabs() {
    trackingTodayBtn.classList.toggle('active', state.trackingView === 'today');
    trackingWeekBtn.classList.toggle('active', state.trackingView === 'week');
    trackingMonthBtn.classList.toggle('active', state.trackingView === 'month');
    trackingYearBtn.classList.toggle('active', state.trackingView === 'year');
    trackingDateInput.value = dateKey(trackingDateBase());
    trackingFilterSelect.value = state.trackingFilter || 'all';
  }


  function dateLabelForTracking(date) {
    if (state.trackingView === 'year') return date.toLocaleDateString('de-DE', { month: 'short' });
    if (state.trackingView === 'month') return String(date.getDate()).padStart(2, '0');
    return days[(date.getDay() + 6) % 7];
  }

  function trackingEndForRange(range) {
    const today = toLocalDate(new Date());
    let end = toLocalDate(range.end);
    if (state.trackingView === 'month' || state.trackingView === 'year') end = end > today ? today : end;
    return end;
  }

  function buildTrackingBuckets(range, items) {
    const end = trackingEndForRange(range);
    const buckets = [];

    if (state.trackingView === 'year') {
      const base = trackingDateBase();
      const lastMonth = base.getFullYear() === new Date().getFullYear() ? new Date().getMonth() : 11;
      for (let month = 0; month <= lastMonth; month++) {
        const monthStart = new Date(base.getFullYear(), month, 1);
        const monthEnd = new Date(base.getFullYear(), month + 1, 0);
        const bucketItems = items.filter(item => item.date.getFullYear() === base.getFullYear() && item.date.getMonth() === month);
        buckets.push({
          key: `${base.getFullYear()}-${month}`,
          label: monthStart.toLocaleDateString('de-DE', { month: 'short' }),
          date: monthStart,
          routine: statsForItems(bucketItems, 'routine'),
          extra: statsForItems(bucketItems, 'extra'),
          total: statsForItems(bucketItems)
        });
      }
      return buckets;
    }

    eachDateInRange(range.start, end).forEach(date => {
      const key = dateKey(date);
      const bucketItems = items.filter(item => dateKey(item.date) === key);
      buckets.push({
        key,
        label: dateLabelForTracking(date),
        date,
        routine: statsForItems(bucketItems, 'routine'),
        extra: statsForItems(bucketItems, 'extra'),
        total: statsForItems(bucketItems)
      });
    });
    return buckets;
  }

  function renderTrackingTimeline(buckets) {
  if (!trackingTimelineChart) return;
  trackingTimelineChart.innerHTML = '';

  if (trackingTimelineSub) {
    trackingTimelineSub.textContent = state.trackingView === 'year'
      ? 'Jede Säule steht für einen Monat. Routine unten, Extra oben.'
      : 'Jede Säule steht für einen Tag. Routine unten, Extra oben.';
  }

  if (!buckets.length) {
    trackingTimelineChart.innerHTML = '<div class="tracking-row"><span>Keine Daten</span><strong>Noch keine trackbaren Einträge.</strong></div>';
    return;
  }

  const chart = document.createElement('div');
  chart.className = 'tracking-column-chart';

  buckets.forEach(bucket => {
    const column = document.createElement('div');
    column.className = `tracking-bucket-column ${bucket.total.total ? '' : 'empty'}`.trim();

    const title = state.trackingView === 'year'
      ? bucket.date.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })
      : formatLongDate(bucket.date);

    const totalItems = bucket.total.total || 0;

    const routineShare = totalItems
      ? Math.round((bucket.routine.done / totalItems) * 100)
      : 0;

    const extraShare = totalItems
      ? Math.round((bucket.extra.done / totalItems) * 100)
      : 0;

    const tooltip = `${title}: Routine ${bucket.routine.done}/${bucket.routine.total} · Extra ${bucket.extra.done}/${bucket.extra.total} · Gesamt ${bucket.total.done}/${bucket.total.total}`;

    column.title = tooltip;

    column.innerHTML = `
      <div class="tracking-bucket-bars stacked" aria-label="${escapeHtml(tooltip)}">
        <div class="tracking-stacked-bar" title="${escapeHtml(tooltip)}">
          <div class="tracking-stacked-fill extra" style="height:${extraShare}%"></div>
          <div class="tracking-stacked-fill routine" style="height:${routineShare}%"></div>
        </div>
      </div>
      <div class="tracking-bucket-value">${bucket.total.percent}%</div>
      <div class="tracking-bucket-label">${escapeHtml(bucket.label)}</div>
    `;

    chart.appendChild(column);
  });

  trackingTimelineChart.appendChild(chart);
}

  function renderTrackingCategories(items) {
    if (!trackingCategoryChart) return;
    trackingCategoryChart.innerHTML = '';
    const groups = new Map();
    items.forEach(item => {
      const key = item.categoryId || 'orga';
      if (!groups.has(key)) groups.set(key, { categoryId: key, total: 0, done: 0 });
      const group = groups.get(key);
      group.total += 1;
      if (item.done) group.done += 1;
    });

    const rows = Array.from(groups.values())
      .map(group => ({ ...group, percent: makePercent(group.done, group.total) }))
      .sort((a, b) => b.total - a.total || b.percent - a.percent)
      .slice(0, 8);

    if (!rows.length) {
      trackingCategoryChart.innerHTML = '<div class="tracking-row"><span>Keine Kategorien</span><strong>Noch keine trackbaren Aufgaben.</strong></div>';
      return;
    }

    rows.forEach(group => {
      const cat = state.categories[group.categoryId] || state.categories.orga;
      const row = document.createElement('div');
      row.className = 'tracking-category-row';
      row.innerHTML = `
        <div class="tracking-category-top">
          <span class="tracking-category-name">${escapeHtml(cat.label)}</span>
          <strong>${group.percent}% · ${group.done}/${group.total}</strong>
        </div>
        <div class="tracking-mini-bar"><div class="tracking-mini-fill total" style="width:${group.percent}%"></div></div>`;
      trackingCategoryChart.appendChild(row);
    });
  }


  function renderTrackingHeatmap(buckets) {
    if (!trackingHeatmap) return;
    trackingHeatmap.innerHTML = '';
    if (!buckets.length) {
      trackingHeatmap.innerHTML = '<div class="tracking-row"><span>Keine Daten</span></div>';
      return;
    }
    buckets.forEach(bucket => {
      const cell = document.createElement('div');
      cell.className = `tracking-heat-cell ${heatLevel(bucket.total.percent, bucket.total.total)}`;
      const title = state.trackingView === 'year'
        ? bucket.date.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })
        : formatLongDate(bucket.date);
      cell.title = `${title}: ${bucket.total.percent}% (${bucket.total.done}/${bucket.total.total})`;
      trackingHeatmap.appendChild(cell);
    });
  }


  function renderTrackingInsights(buckets, items) {
    if (!trackingInsights) return;
    const bucketsWithData = buckets.filter(bucket => bucket.total.total > 0);
    const bestBucket = bucketsWithData.slice().sort((a, b) => b.total.percent - a.total.percent)[0];
    const weakBucket = bucketsWithData.slice().sort((a, b) => a.total.percent - b.total.percent)[0];

    const categoryGroups = new Map();
    items.forEach(item => {
      const key = item.categoryId || 'orga';
      if (!categoryGroups.has(key)) categoryGroups.set(key, { categoryId: key, total: 0, done: 0 });
      const group = categoryGroups.get(key);
      group.total += 1;
      if (item.done) group.done += 1;
    });
    const catRows = Array.from(categoryGroups.values())
      .map(group => ({ ...group, percent: makePercent(group.done, group.total) }))
      .filter(group => group.total > 0)
      .sort((a, b) => b.percent - a.percent || b.total - a.total);
    const bestCat = catRows[0];
    const weakCat = catRows.slice().reverse()[0];
    const streak = bestStreakFromBuckets(buckets);

    const labelForBucket = bucket => !bucket ? '—' : (state.trackingView === 'year'
      ? bucket.date.toLocaleDateString('de-DE', { month: 'short' })
      : `${days[(bucket.date.getDay() + 6) % 7]} ${formatShortDate(bucket.date)}`);
    const catLabel = group => group ? (state.categories[group.categoryId]?.label || 'Kategorie') : '—';

    const cards = [
      { label: 'Bester Zeitraum', value: bestBucket ? `${labelForBucket(bestBucket)} · ${bestBucket.total.percent}%` : 'Noch keine Daten' },
      { label: 'Schwächster Zeitraum', value: weakBucket ? `${labelForBucket(weakBucket)} · ${weakBucket.total.percent}%` : 'Noch keine Daten' },
      { label: 'Stärkste Kategorie', value: bestCat ? `${catLabel(bestCat)} · ${bestCat.percent}%` : 'Noch keine Daten' },
      { label: 'Serie über 80%', value: streak ? `${streak} am Stück` : 'Noch keine Serie' }
    ];

    trackingInsights.innerHTML = cards.map(card => `
      <div class="tracking-insight-card">
        <div class="tracking-insight-label">${escapeHtml(card.label)}</div>
        <div class="tracking-insight-value">${escapeHtml(card.value)}</div>
      </div>`).join('');
  }

  function renderTracking() {
    renderTrackingTabs();
    const { range, items } = buildTrackingItems();
    const routine = statsForItems(items, 'routine');
    const extra = statsForItems(items, 'extra');
    const total = statsForItems(items);

    trackingTitle.textContent = `${range.title} · ${range.label}`;
    trackingDescription.textContent = 'Routine misst deine geplante Standardwoche. Extra misst zusätzliche To-dos aus der echten Kalenderwoche.';
    routineTrackingLabel.textContent = 'Routine-Erfolg';
    extraTrackingLabel.textContent = 'Extra-Erfolg';
    totalTrackingLabel.textContent = 'Gesamt';

    routinePercent.textContent = `${routine.percent}%`;
    routineSub.textContent = `${routine.done}/${routine.total} Routine-Blöcke erledigt`;
    routineFill.style.width = `${routine.percent}%`;

    extraPercent.textContent = `${extra.percent}%`;
    extraSub.textContent = `${extra.done}/${extra.total} Extra-To-dos erledigt`;
    extraFill.style.width = `${extra.percent}%`;

    totalPercent.textContent = `${total.percent}%`;
    totalSub.textContent = `${total.done}/${total.total} insgesamt erledigt`;
    totalFill.style.width = `${total.percent}%`;

    const buckets = buildTrackingBuckets(range, items);
    renderTrackingTimeline(buckets);
    renderTrackingCategories(items);
    renderTrackingHeatmap(buckets);
    renderTrackingInsights(buckets, items);

    const filter = state.trackingFilter || 'all';
    const visible = items
      .filter(item => filter === 'all' || (filter === 'done' ? item.done : !item.done))
      .sort((a, b) => a.date - b.date || a.start - b.start)
      .slice(0, 80);

    trackingList.innerHTML = '';
    if (!visible.length) {
      trackingList.innerHTML = '<div class="tracking-row"><span>Keine Einträge</span><strong>Für diesen Zeitraum und Filter gibt es keine trackbaren Aufgaben.</strong></div>';
      return;
    }

    visible.forEach(item => {
      const cat = state.categories[item.categoryId] || state.categories.orga;
      const row = document.createElement('div');
      row.className = 'tracking-row';
      row.innerHTML = `
        <span>${days[item.day]} · ${formatShortDate(item.date)} · ${eventTime(item)} · ${item.type === 'extra' ? 'Extra' : 'Routine'}</span>
        <strong>${escapeHtml(item.label)} · ${escapeHtml(cat.label)}</strong>
        <span class="tracking-status ${item.done ? 'done' : 'open'}">${item.done ? 'Erledigt' : 'Offen'}</span>`;
      trackingList.appendChild(row);
    });
  }

  function applyTemplateToWeek() {
    if (!state.templateEvents.length) {
      alert('Deine Routine-Vorlage ist noch leer. Lege zuerst Routine-Blöcke in der Vorlage an.');
      return;
    }
    const existing = currentWeekEvents();
    const weekInfo = getISOWeekInfo(getSelectedWeekStartDate());
    if (existing.length && !confirm(`Kalenderwoche KW ${weekInfo.week}/${weekInfo.year} überschreiben und die Routine-Vorlage neu übernehmen?`)) return;

    setCurrentWeekEvents(state.templateEvents.map(templateEv => ({
      id: id(),
      day: templateEv.day,
      start: templateEv.start,
      end: templateEv.end,
      label: templateEv.label,
      categoryId: templateEv.categoryId,
      done: false,
      source: 'routine',
      templateEventId: templateEv.id,
      autoComplete: Boolean(templateEv.autoComplete),
      subtasks: cloneEventSubtasks(templateEv).map(sub => ({ ...sub, done: false })),
      createdAt: new Date().toISOString()
    })));
    state.plannerMode = 'week';
    state.viewMode = 'calendar';
    saveState();
    renderAll();
  }


  function renderWeekControls() {
    const start = getSelectedWeekStartDate();
    const end = addDays(start, 6);
    const info = getISOWeekInfo(start);
    const today = getTodayInfo();
    weekDateInput.min = '2026-01-01';
    weekDateInput.value = dateKey(start);
    weekLabel.textContent = `KW ${info.week}/${info.year}`;
    weekRange.textContent = `${formatLongDate(start)} – ${formatLongDate(end)}`;
    fillTaskDaySelect();
    todayWeekBtn.classList.toggle('active', state.currentWeekStart === today.weekKey);
    const minWeek = weekStartDate('2026-01-01');
    prevWeekBtn.disabled = getSelectedWeekStartDate() <= minWeek;
  }


  function renderTodoDrawer() {
    const isOpen = Boolean(state.todoDrawerOpen);
    const view = state.drawerView === 'todo' ? 'todo' : 'habit';
    document.body.classList.toggle('todo-drawer-open', isOpen);
    todoDrawerToggleBtn.classList.toggle('active', isOpen);
    todoDrawerToggleBtn.setAttribute('aria-expanded', String(isOpen));

    drawerSwitch.classList.toggle('todo-active', view === 'todo');
    drawerHabitPanel.classList.toggle('active', view === 'habit');
    drawerTodoPanel.classList.toggle('active', view === 'todo');
    drawerHabitLabel.classList.toggle('active', view === 'habit');
    drawerTodoLabel.classList.toggle('active', view === 'todo');
    drawerTitle.textContent = view === 'habit' ? 'Tages-Habits' : 'To-do Planner';
  }


  function fillTodoCategorySelect() {
    todoCategorySelect.innerHTML = '';
    fillDayTodoCategorySelect();
    Object.entries(state.categories).forEach(([catId, cat]) => {
      const option = document.createElement('option');
      option.value = catId;
      option.textContent = cat.label;
      if (catId === 'orga') option.selected = true;
      todoCategorySelect.appendChild(option);
    });
  }

  function todoStatusLabel(todo) {
    syncTodoAutoComplete(todo);
    if (isTodoDone(todo)) return 'Erledigt';
    if (todo.plannedEventId) return 'Eingeplant';
    if (todo.plannedDay !== null && todo.plannedDay !== undefined) return 'Tages-To-do';
    if (todo.status === 'planned') return 'Geplant';
    return 'Offen';
  }

  function renderTodos() {
    state.todos.forEach(syncTodoAutoComplete);
    const open = state.todos.filter(t => !isTodoDone(t) && t.status === 'open').length;
    const planned = state.todos.filter(t => !isTodoDone(t) && t.status === 'planned').length;
    const done = state.todos.filter(t => isTodoDone(t)).length;
    todoSummary.textContent = `${open} offen · ${planned} geplant · ${done} erledigt`;
    const todoStats = todoCompletionStats();
    renderDrawerProgress(
      drawerTodoProgress,
      'To-do Fortschritt',
      todoStats,
      todoStats.total ? `${todoStats.done}/${todoStats.total} erledigt · ${todoStats.open} offen · ${todoStats.planned} geplant` : 'Noch keine To-dos angelegt.'
    );
    todoList.innerHTML = '';

    if (!state.todos.length) {
      todoList.innerHTML = '<div class="todo-empty">Noch keine To-dos. Sammle hier Aufgaben und plane sie danach als Kalenderblock ein.</div>';
      return;
    }

    const sorted = [...state.todos].sort((a, b) => {
      const order = { open: 0, planned: 1, done: 2 };
      const aStatus = isTodoDone(a) ? 'done' : a.status;
      const bStatus = isTodoDone(b) ? 'done' : b.status;
      return (order[aStatus] ?? 0) - (order[bStatus] ?? 0) || String(a.createdAt).localeCompare(String(b.createdAt));
    });

    sorted.forEach(todo => {
      syncTodoAutoComplete(todo);
      const cat = state.categories[todo.categoryId] || state.categories.orga;
      const subStats = subtaskStats(todo);
      const doneState = isTodoDone(todo);
      const autoDisabled = todo.autoComplete && subStats.total > 0;
      const item = document.createElement('div');
      item.className = `todo-item ${doneState ? 'done' : ''}`;
      item.style.borderLeft = `5px solid ${cat.color}`;
      const subtaskSummary = subStats.total
        ? `<div class="todo-subtask-summary">Untertasks: ${subStats.done}/${subStats.total} erledigt · ${subStats.percent}%</div>`
        : '<div class="todo-subtask-summary">Noch keine Untertasks</div>';
      const autoBadge = `<span class="todo-auto-badge ${todo.autoComplete ? 'active' : ''}">${todo.autoComplete ? 'Auto-Erledigen an' : 'Manuell abhaken'}</span>`;
      const subtasksHtml = subStats.total ? `
        <div class="todo-subtask-list">
          ${todo.subtasks.map(sub => `
            <div class="todo-subtask ${sub.done ? 'done' : ''}" data-subtask-id="${sub.id}">
              <input class="todo-subtask-check" type="checkbox" ${sub.done ? 'checked' : ''} />
              <div class="todo-subtask-text" title="${escapeHtml(sub.text)}">${escapeHtml(sub.text)}</div>
              <div class="todo-subtask-actions">
                <button type="button" class="ghost todo-subtask-edit">Edit</button>
                <button type="button" class="danger todo-subtask-delete">×</button>
              </div>
            </div>`).join('')}
        </div>` : '';

      item.innerHTML = `
        <input class="todo-main-check" type="checkbox" ${doneState ? 'checked' : ''} ${autoDisabled ? 'disabled title="Automatisch: erledigt sich, sobald alle Untertasks erledigt sind"' : ''} />
        <div class="todo-main">
          <div class="todo-name" title="Doppelklick zum Umbenennen">${escapeHtml(todo.text)}</div>
          <div class="todo-meta">${escapeHtml(cat.label)}</div>
          ${subtaskSummary}
        </div>
        <span class="todo-status">${todoStatusLabel(todo)}</span>
        <div class="todo-subtasks">
          <div class="todo-subtask-head">
            <span>${subStats.total ? `Untertasks · ${subStats.done}/${subStats.total}` : 'Untertasks hinzufügen'}</span>
            ${autoBadge}
          </div>
          ${subtasksHtml}
        </div>
        <div class="todo-actions">
          <button type="button" class="small ghost todo-add-subtask-btn">+ Untertask</button>
          <button type="button" class="small ghost todo-auto-btn">${todo.autoComplete ? 'Auto aus' : 'Auto an'}</button>
          <button type="button" class="small ghost todo-plan-btn">${todo.status === 'planned' ? 'Erneut planen' : 'Einplanen'}</button>
          <button type="button" class="small ghost todo-edit-btn">Umbenennen</button>
          <button type="button" class="small danger todo-delete-btn">Löschen</button>
        </div>`;

      const cb = item.querySelector('.todo-main-check');
      cb.addEventListener('change', () => {
        if (todo.autoComplete && todo.subtasks.length) return;
        todo.done = cb.checked;
        todo.status = cb.checked ? 'done' : (todo.plannedEventId ? 'planned' : 'open');
        saveState();
        renderAll();
      });

      const renameTodo = () => {
        const nextText = prompt('To-do umbenennen:', todo.text);
        if (nextText === null) return;
        const clean = nextText.trim();
        if (!clean) {
          alert('Das To-do braucht einen Namen.');
          return;
        }
        todo.text = clean;

        // Wenn das To-do schon als Extra-Block eingeplant ist, den Kalenderblock mit umbenennen.
        if (todo.plannedEventId) {
          Object.values(state.weekEventsByWeek || {}).forEach(list => {
            const ev = Array.isArray(list) ? list.find(x => x.id === todo.plannedEventId) : null;
            if (ev) ev.label = clean;
          });
        }

        saveState();
        renderAll();
      };

      item.querySelector('.todo-name').addEventListener('dblclick', e => {
        e.preventDefault();
        e.stopPropagation();
        renameTodo();
      });

      item.querySelector('.todo-add-subtask-btn').addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        const text = prompt('Untertask hinzufügen, z. B. saugen, Wäsche, lüften:');
        if (text === null) return;
        const clean = text.trim();
        if (!clean) return alert('Der Untertask braucht einen Namen.');
        if (!Array.isArray(todo.subtasks)) todo.subtasks = [];
        todo.subtasks.push({ id: id(), text: clean, done: false, createdAt: new Date().toISOString() });
        syncTodoAutoComplete(todo);
        saveState();
        renderAll();
      });

      item.querySelector('.todo-auto-btn').addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        todo.autoComplete = !todo.autoComplete;
        syncTodoAutoComplete(todo);
        saveState();
        renderAll();
      });

      item.querySelectorAll('.todo-subtask').forEach(row => {
        const subId = row.dataset.subtaskId;
        const sub = todo.subtasks.find(x => x.id === subId);
        if (!sub) return;
        row.querySelector('.todo-subtask-check').addEventListener('change', e => {
          e.stopPropagation();
          sub.done = e.target.checked;
          syncTodoAutoComplete(todo);
          saveState();
          renderAll();
        });
        row.querySelector('.todo-subtask-edit').addEventListener('click', e => {
          e.preventDefault();
          e.stopPropagation();
          const next = prompt('Untertask bearbeiten:', sub.text);
          if (next === null) return;
          const clean = next.trim();
          if (!clean) return alert('Der Untertask braucht einen Namen.');
          sub.text = clean;
          saveState();
          renderAll();
        });
        row.querySelector('.todo-subtask-delete').addEventListener('click', e => {
          e.preventDefault();
          e.stopPropagation();
          if (!confirm('Diesen Untertask löschen?')) return;
          todo.subtasks = todo.subtasks.filter(x => x.id !== subId);
          syncTodoAutoComplete(todo);
          saveState();
          renderAll();
        });
      });

      item.querySelector('.todo-edit-btn').addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        renameTodo();
      });

      item.querySelector('.todo-delete-btn').addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        const alsoDeleteEvent = todo.plannedEventId && confirm('Dieses To-do ist bereits eingeplant. Soll der dazugehörige Kalenderblock auch gelöscht werden?');
        if (alsoDeleteEvent) {
          Object.keys(state.weekEventsByWeek || {}).forEach(weekKey => {
            state.weekEventsByWeek[weekKey] = (state.weekEventsByWeek[weekKey] || []).filter(ev => ev.id !== todo.plannedEventId);
          });
        }
        state.todos = state.todos.filter(t => t.id !== todo.id);
        saveState();
        renderAll();
      });

      item.querySelector('.todo-plan-btn').addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        pendingTodoId = todo.id;
        state.plannerMode = 'week';
        state.viewMode = 'calendar';
        saveState();
        renderAll();
        const start = 36; // 09:00 Uhr als neutraler Vorschlag
        openEditor(null, {
          day: state.activeHabitDay,
          start,
          end: start + 4,
          label: todo.text,
          categoryId: todo.categoryId,
          source: 'extra'
        });
      });

      todoList.appendChild(item);
    });
  }

 function toggleDone(eventId, done) {
  const ev = currentEvents().find(x => x.id === eventId);
  if (!ev) return;

  ev.done = Boolean(done);

  // Wenn erledigt, dann nicht mehr als "nicht eingehalten" zählen
  if (ev.done) ev.missed = false;

  saveState();
  renderAll();
}

function toggleMissed(eventId) {
  const ev = currentEvents().find(x => x.id === eventId);
  if (!ev) return;

  ev.missed = !Boolean(ev.missed);

  // Wenn nicht eingehalten, dann nicht gleichzeitig erledigt
  if (ev.missed) ev.done = false;

  saveState();
  renderAll();
}

  // ==================================================
  // EVENT LISTENERS
  // ==================================================

  templateModeBtn.onclick = () => {
    state.plannerMode = 'template';
    state.viewMode = 'calendar';
    saveState();
    renderAll();
  };
  weekModeBtn.onclick = () => {
    state.plannerMode = 'week';
    state.viewMode = 'calendar';
    const today = getTodayInfo();
    if (state.currentWeekStart === today.weekKey) state.activeHabitDay = today.dayIndex;
    saveState();
    renderAll();
  };
  trackingModeBtn.onclick = () => {
    state.plannerMode = 'tracking';
    state.viewMode = 'calendar';
    saveState();
    renderAll();
  };
  applyTemplateBtn.onclick = applyTemplateToWeek;
  prevWeekBtn.onclick = () => changeWeek(-1);
  nextWeekBtn.onclick = () => changeWeek(1);
  todayWeekBtn.onclick = () => {
    const today = getTodayInfo();
    state.currentWeekStart = today.weekKey;
    state.activeHabitDay = today.dayIndex;
    state.plannerMode = state.plannerMode === 'template' ? 'week' : state.plannerMode;
    currentWeekEvents();
    saveState();
    renderAll();
  };
  weekDateInput.onchange = () => {
    if (!weekDateInput.value) return;
    state.currentWeekStart = clampWeekKey(weekDateInput.value);
    const today = getTodayInfo();
    if (state.currentWeekStart === today.weekKey) state.activeHabitDay = today.dayIndex;
    currentWeekEvents();
    saveState();
    renderAll();
  };

  if (weekSettingsBtn && weekSettings) {
    weekSettingsBtn.onclick = (e) => {
      e.stopPropagation();
      weekSettings.classList.toggle('open');
    };
  }
  if (weekSettingsMenu) {
    weekSettingsMenu.addEventListener('click', e => e.stopPropagation());
  }

  loginBtn.onclick = signInWithPassword;
  signupBtn.onclick = signUpWithPassword;
  magicLinkBtn.onclick = sendMagicLink;
  logoutBtn.onclick = signOut;
  if (profileButton) profileButton.onclick = (e) => {
    e.stopPropagation();
    profileMenu.classList.toggle('open');
  };
  if (profileLogoutBtn) profileLogoutBtn.onclick = signOut;
  if (profileAccountBtn) profileAccountBtn.onclick = () => {
    const signedIn = Boolean(cloudUser);
    alert(signedIn
      ? `Eingeloggt als ${cloudUser.email || 'Nutzer'}\nCloud Sync ist aktiv.`
      : 'Lokaler Modus aktiv. Deine Daten werden nur in diesem Browser gespeichert.');
  };
  document.addEventListener('click', (e) => {
    if (profileMenu && !profileMenu.contains(e.target)) profileMenu.classList.remove('open');
  });
  skipLoginBtn.onclick = skipLoginLocal;
  authPassword.addEventListener('keydown', e => { if (e.key === 'Enter') signInWithPassword(); });

  drawerHabitBtn.onclick = () => { state.drawerView = 'habit'; saveState(); renderTodoDrawer(); renderHabits(); };
  drawerTodoBtn.onclick = () => { state.drawerView = 'todo'; saveState(); renderTodoDrawer(); setTimeout(() => todoInput.focus(), 80); };
  if (drawerFilterMobileToggle && drawerHabitPanel) {
    drawerFilterMobileToggle.onclick = () => {
      drawerHabitPanel.classList.toggle('filter-open');
    };
  }
  if (drawerControlsToggleBtn) {
    drawerControlsToggleBtn.onclick = () => {
      drawerControlsCollapsed = !drawerControlsCollapsed;
      renderHabits();
    };
  }
  if (drawerPrevDayBtn) drawerPrevDayBtn.onclick = e => { e.preventDefault(); e.stopPropagation(); changeDrawerDay(-1); };
  if (drawerNextDayBtn) drawerNextDayBtn.onclick = e => { e.preventDefault(); e.stopPropagation(); changeDrawerDay(1); };
  if (drawerQuickAddBtn) {
    drawerQuickAddBtn.onclick = e => {
      e.preventDefault();
      e.stopPropagation();
      if (state.drawerView === 'todo') {
        state.todoDrawerOpen = true;
        state.drawerView = 'todo';
        saveState();
        renderAll();
        setTimeout(() => todoInput?.focus(), 80);
        return;
      }
      addDayTodoQuick();
    };
  }
  if (drawerHabitPanel) {
    drawerHabitPanel.addEventListener('touchstart', e => {
      if (e.target.closest('button,input,select,textarea,label,a')) return;
      const touch = e.touches[0];
      drawerTouchStartX = touch.clientX;
      drawerTouchStartY = touch.clientY;
    }, { passive: true });
    drawerHabitPanel.addEventListener('touchend', e => {
      if (drawerTouchStartX === null || drawerTouchStartY === null) return;
      if (e.target.closest('button,input,select,textarea,label,a')) {
        drawerTouchStartX = null;
        drawerTouchStartY = null;
        return;
      }
      const touch = e.changedTouches[0];
      const diffX = touch.clientX - drawerTouchStartX;
      const diffY = touch.clientY - drawerTouchStartY;
      drawerTouchStartX = null;
      drawerTouchStartY = null;
      if (Math.abs(diffX) <= 60 || Math.abs(diffX) <= Math.abs(diffY) * 1.5) return;
      changeDrawerDay(diffX > 0 ? -1 : 1);
    }, { passive: true });
  }
  drawerDaySelect.onchange = () => { state.activeHabitDay = Number(drawerDaySelect.value); updateDrawerFilterMobileLabel(); saveState(); renderAll(); };
  drawerHabitFilter.onchange = () => { state.drawerHabitFilter = drawerHabitFilter.value; updateDrawerFilterMobileLabel(); saveState(); renderHabits(); };
  if (drawerTaskAllBtn) drawerTaskAllBtn.onclick = () => { state.drawerTaskFilter = 'all'; saveState(); renderAll(); };
  if (drawerTaskTimedBtn) drawerTaskTimedBtn.onclick = () => { state.drawerTaskFilter = 'timed'; saveState(); renderAll(); };
  if (drawerTaskUntimedBtn) drawerTaskUntimedBtn.onclick = () => { state.drawerTaskFilter = 'untimed'; saveState(); renderAll(); };
  if (drawerTaskFilterSelect) drawerTaskFilterSelect.onchange = () => { state.drawerTaskFilter = drawerTaskFilterSelect.value; saveState(); renderAll(); };
  trackingTodayBtn.onclick = () => { state.trackingView = 'today'; saveState(); renderAll(); };
  trackingWeekBtn.onclick = () => { state.trackingView = 'week'; saveState(); renderAll(); };
  trackingMonthBtn.onclick = () => { state.trackingView = 'month'; saveState(); renderAll(); };
  trackingYearBtn.onclick = () => { state.trackingView = 'year'; saveState(); renderAll(); };
  trackingDateInput.onchange = () => { state.trackingDate = trackingDateInput.value || dateKey(new Date()); saveState(); renderAll(); };
  trackingFilterSelect.onchange = () => { state.trackingFilter = trackingFilterSelect.value; saveState(); renderTracking(); };
  calendarModeBtn.onclick = () => { state.viewMode = 'calendar'; saveState(); renderAll(); };
  taskModeBtn.onclick = () => { state.viewMode = 'tasks'; saveState(); renderAll(); };
  document.getElementById('taskBackToCalendarBtn').onclick = () => { state.viewMode = 'calendar'; saveState(); renderAll(); };
  taskDaySelect.onchange = () => { state.activeHabitDay = Number(taskDaySelect.value); saveState(); renderAll(); };
  todoDrawerToggleBtn.onclick = () => {
    const willOpen = !state.todoDrawerOpen;
    state.todoDrawerOpen = willOpen;
    if (willOpen) state.drawerView = 'habit';
    saveState();
    renderTodoDrawer();
  };
  closeTodoDrawerBtn.onclick = () => {
    state.todoDrawerOpen = false;
    saveState();
    renderTodoDrawer();
  };
  todoDrawerBackdrop.onclick = () => {
    state.todoDrawerOpen = false;
    saveState();
    renderTodoDrawer();
  };
  document.getElementById('addCategoryBtn').onclick = () => openCategoryEditor(null);

  cancelCategoryModalBtn.onclick = closeCategoryModal;
  saveCategoryBtn.onclick = saveCategoryFromModal;
  deleteCategoryBtn.onclick = deleteCategoryFromModal;
  categoryLabel.addEventListener('input', updateCategoryPreview);
  categoryColor.addEventListener('input', () => { categoryColorText.value = categoryColor.value; updateCategoryPreview(); });
  categoryColorText.addEventListener('input', updateCategoryPreview);
  categoryHabit.addEventListener('change', updateCategoryPreview);
  categoryModalBackdrop.addEventListener('click', e => { if (e.target === categoryModalBackdrop) closeCategoryModal(); });
  categoryLabel.addEventListener('keydown', e => { if (e.key === 'Enter') saveCategoryFromModal(); });



  if (addDayTodoBtn) addDayTodoBtn.onclick = openDayTodoModal;
  if (dayTodoInput) dayTodoInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') openDayTodoModal();
  });
  if (cancelDayTodoModalBtn) cancelDayTodoModalBtn.onclick = closeDayTodoModal;
  if (saveDayTodoModalBtn) saveDayTodoModalBtn.onclick = saveDayTodoFromModal;
  if (deleteDayTodoModalBtn) deleteDayTodoModalBtn.onclick = deleteDayTodoFromModal;
  if (dayTodoModalAddSubtaskBtn) dayTodoModalAddSubtaskBtn.onclick = addDayTodoDraftSubtask;
  if (dayTodoModalSubtaskInput) dayTodoModalSubtaskInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); addDayTodoDraftSubtask(); }
  });
  if (dayTodoModalText) dayTodoModalText.addEventListener('keydown', e => {
    if (e.key === 'Enter') saveDayTodoFromModal();
  });
  if (dayTodoModalBackdrop) dayTodoModalBackdrop.addEventListener('click', e => {
    if (e.target === dayTodoModalBackdrop) closeDayTodoModal();
  });

  document.getElementById('addTodoBtn').onclick = () => {
    const text = todoInput.value.trim();
    if (!text) { alert('Bitte gib ein To-do ein.'); return; }
    state.todos.push({
      id: id(),
      text,
      categoryId: todoCategorySelect.value || 'orga',
      status: 'open',
      done: false,
      plannedEventId: null,
      plannedWeekStart: null,
      plannedDay: null,
      autoComplete: false,
      subtasks: [],
      createdAt: new Date().toISOString()
    });
    todoInput.value = '';
    saveState();
    renderTodos();
  };
  todoInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('addTodoBtn').click();
  });
  document.getElementById('clearBtn').onclick = () => {
    if (confirm(state.plannerMode === 'week' ? 'Wirklich die aktuelle Kalenderwoche löschen? Kategorien und Routine-Vorlage bleiben erhalten.' : 'Wirklich die Routine-Vorlage löschen? Kategorien bleiben erhalten.')) {
      setCurrentEvents([]);
      saveState();
      renderAll();
    }
  };
  document.getElementById('exportBtn').onclick = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'perfekte-woche-plan.json';
    a.click();
    URL.revokeObjectURL(url);
  };
  document.getElementById('importBtn').onclick = () => document.getElementById('importFile').click();
  document.getElementById('importFile').onchange = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      const imported = JSON.parse(await file.text());
      state = imported.slots ? migrateV1(imported) : normalizeState(imported);
      saveState();
      renderAll();
    } catch (err) { alert('Import fehlgeschlagen: ' + err.message); }
  };
  if (modalAddSubtaskBtn) modalAddSubtaskBtn.onclick = addEventDraftSubtask;
  if (modalSubtaskInput) modalSubtaskInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addEventDraftSubtask(); } });
  document.getElementById('cancelModalBtn').onclick = closeModal;
  document.getElementById('saveModalBtn').onclick = () => {
    const categoryId = modalCategory.value;
    const label = modalLabel.value.trim() || state.categories[categoryId].label;
    const day = Number(modalDay.value);
    const start = Number(modalStart.value);
    const end = Number(modalEnd.value);
    const stackedIntoId = modalStackedInto?.value || null;
    if (Number.isNaN(day) || Number.isNaN(start) || Number.isNaN(end) || end <= start) {
      alert('Die Endzeit muss nach der Startzeit liegen.');
      return;
    }
    if (editingId) {
      const ev = currentEvents().find(x => x.id === editingId);
      if (ev) { Object.assign(ev, { day, start, end, label, categoryId, stackedIntoId, autoComplete: Boolean(modalAutoComplete?.checked), subtasks: cloneEventSubtasks({ subtasks: eventDraftSubtasks }) }); syncEventAutoComplete(ev); }
    } else {
  const newEventId = id();

  currentEvents().push({
    id: newEventId,
    day,
    start,
    end,
    label,
    categoryId,
    done: false,
    missed: false,
    source: (presetSource || (isTemplateMode() ? 'routine' : 'extra')),
    templateEventId: null,
    stackedIntoId,
    autoComplete: Boolean(modalAutoComplete?.checked),
    subtasks: cloneEventSubtasks({ subtasks: eventDraftSubtasks }),
    createdAt: new Date().toISOString()
  });

  if (pendingTodoId) {
    const todo = state.todos.find(t => t.id === pendingTodoId);
    if (todo) {
      todo.status = 'planned';
      todo.done = false;
      todo.plannedEventId = newEventId;
      todo.plannedWeekStart = state.currentWeekStart;
      todo.plannedDay = day;
    }
    pendingTodoId = null;
  }
}
    saveState();
    renderAll();
    closeModal();
  };
  document.getElementById('deleteBlockBtn').onclick = () => {
    if (!editingId) return;
    currentEvents().forEach(ev => {
      if (ev.stackedIntoId === editingId) ev.stackedIntoId = null;
    });
    setCurrentEvents(currentEvents().filter(ev => ev.id !== editingId));
    saveState();
    renderAll();
    closeModal();
  };
  if (categoryToggleBtn && legend) {
    categoryToggleBtn.addEventListener('click', () => {
      const isOpen = legend.classList.toggle('category-open');
      legend.classList.toggle('category-collapsed', !isOpen);
      categoryToggleBtn.textContent = isOpen ? 'Kategorien ausblenden ▴' : 'Kategorien anzeigen ▾';
    });
  }

  [modalDay, modalStart, modalEnd].forEach(el => el.addEventListener('change', () => {
    fillModalStackedIntoSelect(currentEvents().find(ev => ev.id === editingId) || null);
    updateModalInfo();
  }));
  modalCategory.addEventListener('change', updateModalInfo);
  modalBackdrop.addEventListener('click', (e) => { if (e.target === modalBackdrop) closeModal(); });
  document.addEventListener('click', () => {
    if (weekSettings) weekSettings.classList.remove('open');
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (modalBackdrop.style.display === 'flex') closeModal();
      else if (state.todoDrawerOpen) {
        state.todoDrawerOpen = false;
        saveState();
        renderTodoDrawer();
      }
    }
  });
  window.addEventListener('resize', renderCalendar);


  // ==================================================
  // ICS
  // ==================================================

  function timeValueToSlot(value, fallbackSlot = 36) {
    if (!value) return fallbackSlot;

    const raw = String(value).trim();
    let hours = null;
    let minutes = null;

    if (raw.includes('T')) {
      const parsed = new Date(raw);
      if (!Number.isNaN(parsed.getTime())) {
        hours = parsed.getHours();
        minutes = parsed.getMinutes();
      }
    } else {
      const match = raw.match(/(\d{1,2}):(\d{2})/);
      if (match) {
        hours = Number(match[1]);
        minutes = Number(match[2]);
      }
    }

    if (hours === null || minutes === null) return fallbackSlot;
    return clamp(Math.round(((hours * 60) + minutes) / 15), 0, slotsPerDay);
  }



  function ensureExternalCalendarCategory() {
  if (!state.categories) state.categories = {};

  if (!state.categories.external) {
    state.categories.external = {
      label: 'Externer Kalender',
      color: '#2563eb',
      habit: true
    };
    return;
  }

  state.categories.external.habit = true;
  state.categories.external.label = state.categories.external.label || 'Externer Kalender';
  state.categories.external.color = state.categories.external.color || '#2563eb';
}

  function isImportedIcsEvent(ev) {
  if (!ev) return false;

  return (
    ev.importSource === 'ics' ||
    ev.source === 'ics' ||
    ev.provider === 'outlook' ||
    ev.provider === 'google' ||
    Boolean(ev.externalId) ||
    Boolean(ev.externalCalendarId) ||
    String(ev.id || '').startsWith('ics_import_') ||
    String(ev.id || '').startsWith('ics_') ||
    ev.categoryId === 'external'
  );
}

function clearImportedIcsEvents() {
  console.log('[ICS] Removing old ICS events');
  if (!state.weekEventsByWeek) state.weekEventsByWeek = {};

  Object.keys(state.weekEventsByWeek).forEach((weekKey) => {
    const events = Array.isArray(state.weekEventsByWeek[weekKey])
      ? state.weekEventsByWeek[weekKey]
      : [];

    state.weekEventsByWeek[weekKey] = events.filter(ev => !isImportedIcsEvent(ev));
  });

  currentWeekEvents();
  saveState();
  renderAll();
}

  function plannerEventFromIcsEvent(icsEvent, index) {
    const eventDateKey = icsEvent.date || dateKey(new Date());
    const weekKey = weekStartKey(dateKeyToLocalDate(eventDateKey));
    const day = clamp(dayIndexInWeek(eventDateKey, weekKey), 0, 6);

    const start = timeValueToSlot(icsEvent.startTime, 36);
    let end = timeValueToSlot(icsEvent.endTime, start + 4);
    if (end <= start) end = Math.min(start + 4, slotsPerDay);

    const externalId = icsEvent.id || icsEvent.uid || `ics_${index}_${eventDateKey}_${start}`;

    return {
  id: `ics_import_${externalId}`.replace(/[^a-zA-Z0-9_-]/g, '_'),
  day,
  start,
  end,
  label: icsEvent.title || 'Kalendertermin',
  categoryId: 'external',

  // wichtig: ICS-Termine sollen wie Planner-Events trackbar sein
  done: false,
  missed: false,
  source: 'extra',
  templateEventId: null,

  // Herkunft bleibt markiert
  importSource: 'ics',
  provider: icsEvent.provider || 'outlook',
  externalId,

  // true = Doppelklick öffnet Editor, falls du später Kategorie/Subtasks ändern willst
  editable: true,

  // gleiche Logik wie deine normalen Events
  autoComplete: false,
  subtasks: [],

     createdAt: new Date().toISOString()
  };
}

  function importIcsEventsIntoPlanner(icsEvents) {
  ensureExternalCalendarCategory();

  const existingByExternalId = {};

  if (!state.weekEventsByWeek) state.weekEventsByWeek = {};

  Object.keys(state.weekEventsByWeek).forEach((weekKey) => {
    const events = Array.isArray(state.weekEventsByWeek[weekKey]) ? state.weekEventsByWeek[weekKey] : [];

    events.forEach((ev) => {
      if (ev.importSource === 'ics' && ev.externalId) {
        existingByExternalId[ev.externalId] = {
          done: Boolean(ev.done),
          missed: Boolean(ev.missed),
          categoryId: ev.categoryId || 'external',
          subtasks: Array.isArray(ev.subtasks) ? ev.subtasks : [],
          autoComplete: Boolean(ev.autoComplete),
          editable: ev.editable !== false
        };
      }
    });
  });

  clearImportedIcsEvents();
  console.log('[ICS] Adding new ICS events');

  const importedExternalIds = new Set();

(icsEvents || []).forEach((icsEvent, index) => {
  const plannerEvent = plannerEventFromIcsEvent(icsEvent, index);

  if (!plannerEvent.externalId) return;

  // verhindert doppelte Termine direkt aus dem ICS-Feed
  if (importedExternalIds.has(plannerEvent.externalId)) return;
  importedExternalIds.add(plannerEvent.externalId);

  const previous = existingByExternalId[plannerEvent.externalId];

  if (previous) {
    plannerEvent.done = previous.done;
    plannerEvent.missed = previous.missed;
    plannerEvent.categoryId = previous.categoryId;
    plannerEvent.subtasks = previous.subtasks;
    plannerEvent.autoComplete = previous.autoComplete;
    plannerEvent.editable = previous.editable;
  }

  const weekKey = weekStartKey(dateKeyToLocalDate(icsEvent.date || dateKey(new Date())));

  if (!state.weekEventsByWeek[weekKey]) state.weekEventsByWeek[weekKey] = [];

  // letzter Schutz: in derselben Woche nicht nochmal denselben ICS-Termin pushen
  const alreadyExists = state.weekEventsByWeek[weekKey].some(ev =>
    isImportedIcsEvent(ev) && ev.externalId === plannerEvent.externalId
  );

  if (!alreadyExists) {
    state.weekEventsByWeek[weekKey].push(plannerEvent);
  }
});

  currentWeekEvents();
  console.log('[ICS] Saving state');
  saveState();
  console.log('[ICS] State saved locally; cloud save queued if enabled');
  renderAll();
}

  function setIcsStatus(message) {
    const status = document.getElementById('icsStatus');
    if (status) status.textContent = message || '';
  }

  function setIcsSyncing(syncing) {
    icsSyncing = Boolean(syncing);
    const syncBtn = document.getElementById('syncIcsBtn');
    const quickSyncBtn = document.getElementById('quickIcsSyncBtn');
    if (syncBtn) {
      syncBtn.disabled = icsSyncing;
      syncBtn.textContent = icsSyncing ? 'Synchronisiere...' : 'Synchronisieren';
    }
    if (quickSyncBtn) quickSyncBtn.disabled = icsSyncing;
  }

  async function syncIcsCalendarFromModal() {
    if (icsSyncing) return;
    const input = document.getElementById('icsUrlInput');
    const icsUrl = input ? input.value.trim() : '';

    if (!icsUrl) {
      setIcsStatus('Bitte füge zuerst einen ICS-Link ein.');
      return;
    }

    if (!icsUrl.startsWith('https://')) {
      setIcsStatus('Bitte nutze den HTTPS-ICS-Link aus Outlook.');
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 20000);

    try {
      console.log('[ICS] Sync started');
      console.log('[ICS] Fetching URL', icsUrl);
      setIcsSyncing(true);
      setIcsStatus('Kalender wird synchronisiert...');

      const response = await fetch('/api/ics-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ icsUrl }),
        signal: controller.signal
      });
      console.log('[ICS] Fetch response', response.status, response.ok);

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || 'ICS-Synchronisation fehlgeschlagen.');
      }

      console.log('[ICS] Parsed events', (data.events || []).length);
      importIcsEventsIntoPlanner(data.events || []);
      localStorage.setItem('perfekte-woche-ics-url', icsUrl);
      setIcsStatus(`${(data.events || []).length} Termine importiert.`);
      console.log('[ICS] Sync finished');
    } catch (error) {
      console.error('[ICS] Sync failed', error);
      const message = error.name === 'AbortError'
        ? 'ICS Sync Timeout: Die Kalender-URL antwortet nicht.'
        : (error.message || 'ICS Sync fehlgeschlagen: Kalender konnte nicht geladen werden.');
      setIcsStatus(message);
    } finally {
      window.clearTimeout(timeout);
      setIcsSyncing(false);
    }
  }
  
  function removeIcsCalendarEvents() {
  const confirmed = confirm('Alle importierten ICS-Termine aus dem Planner entfernen? Deine normalen Routinen und To-dos bleiben erhalten.');
  if (!confirmed) return;

  clearImportedIcsEvents();
  setIcsStatus('Importierte ICS-Termine wurden entfernt.');
}

async function syncSavedIcsCalendar() {
  const savedUrl = localStorage.getItem('perfekte-woche-ics-url') || '';
  const input = document.getElementById('icsUrlInput');
  const modal = document.getElementById('icsModal');

  if (input) input.value = savedUrl;

  // Wenn noch kein ICS-Link gespeichert ist, Modal öffnen
  if (!savedUrl) {
    if (modal) {
      modal.classList.remove('hidden');
      setIcsStatus('Bitte füge zuerst deinen ICS-Link ein.');
      setTimeout(() => input?.focus(), 50);
    }
    return;
  }

  // Wenn Link gespeichert ist, direkt synchronisieren
  await syncIcsCalendarFromModal();
}
  
  function initIcsCalendarIntegration() {
    const openBtn = document.getElementById('openIcsModalBtn');
    const closeBtn = document.getElementById('closeIcsModalBtn');
    const syncBtn = document.getElementById('syncIcsBtn');
    const quickSyncBtn = document.getElementById('quickIcsSyncBtn');
    const removeBtn = document.getElementById('removeIcsBtn');
    const modal = document.getElementById('icsModal');
    const input = document.getElementById('icsUrlInput');

    if (input) input.value = localStorage.getItem('perfekte-woche-ics-url') || '';

    if (openBtn && modal) {
      openBtn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        profileMenu?.classList.remove('open');
        modal.classList.remove('hidden');
        setIcsStatus('');
        setTimeout(() => input?.focus(), 50);
      });
    }

    if (closeBtn && modal) {
      closeBtn.addEventListener('click', () => modal.classList.add('hidden'));
    }

    if (modal) {
      modal.addEventListener('click', (event) => {
        if (event.target === modal) modal.classList.add('hidden');
      });
    }

    if (syncBtn) {
  syncBtn.addEventListener('click', syncIcsCalendarFromModal);
}

if (quickSyncBtn) {
  quickSyncBtn.addEventListener('click', syncSavedIcsCalendar);
}

if (removeBtn) {
  removeBtn.addEventListener('click', removeIcsCalendarEvents);
}
}


  // ==================================================
  // INIT
  // ==================================================

function renderAll() { currentWeekEvents(); renderLegend(); fillTodoCategorySelect(); renderTodos(); renderWeekControls(); renderCalendar(); renderHabits(); renderTaskView(); renderTracking(); renderViewMode(); renderPlannerMode(); renderTodoDrawer(); }
  fillTaskDaySelect();
  renderAll();
  renderAll();
startCurrentTimeTimer();
window.addEventListener('beforeunload', () => {
  if (currentTimeTimer) window.clearInterval(currentTimeTimer);
});
initCloudSync();

document.addEventListener('DOMContentLoaded', initIcsCalendarIntegration);
})();
