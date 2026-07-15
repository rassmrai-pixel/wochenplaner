(() => {
  // ==================================================
  // CONFIG / CONSTANTS
  // ==================================================

  const days = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
  const slotsPerDay = 96;
  const storageKeyV2 = 'perfekte-woche-planer-v2';
  const storageKeyV1 = 'perfekte-woche-planer-v1';
  const authModeKey = 'perfekte-woche-auth-mode';
  const ICS_SYNC_TIMEOUT_MS = 60000;
  const ICS_AUTO_SYNC_INTERVAL_MS = 30 * 60 * 1000;
  const ICS_LAST_SUCCESS_KEY = 'perfekte-woche-ics-last-success';
  const MOBILE_SWIPE_MIN_DISTANCE = 52;
  const MOBILE_SWIPE_FAST_DISTANCE = 32;
  const MOBILE_SWIPE_VELOCITY = 0.42;
  const MOBILE_SWIPE_HORIZONTAL_RATIO = 1.55;
  const MOBILE_SWIPE_EDGE_GUARD = 24;
  const MOBILE_SWIPE_LOCK_MS = 280;
  const MOBILE_SWIPE_ANIMATION_MS = 190;
  const MAX_INVITE_ATTENDEES = 10;
  const DEFAULT_ICS_SOURCE_ID = 'default-ics';
  const ICS_SYNC_DEBUG_TEST_TITLE = 'ICS SYNC TEST 001';
  const SUPABASE_URL = 'https://uwynzmdsveplxfqgwzqp.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_zIKjzTf24k4BDsVrQAyeZQ_WALpNEkH';
  const supabaseClient = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY) : null;
  let cloudUser = null;
  let guestMode = localStorage.getItem(authModeKey) === 'guest';
  let cloudSaveTimer = null;
  let cloudLoading = false;
  let icsSyncing = false;
  let icsSyncProgress = 0;
  let icsSyncStatus = '';
  let icsAutoSyncTimer = null;
  let icsCalendarIntegrationInitialized = false;
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
    specialEventsDrawerOpen: false,
    mobileControlsOpen: false,
    mobileCalendarStartDay: null,
    drawerView: 'habit',
    openHeaderTodoDay: null,
    currentWeekStart: null,
    trackingView: 'week',
    trackingDate: null,
    trackingFilter: 'all',
    drawerHabitFilter: 'all',
    drawerTaskFilter: 'all',
    calendarFeed: {
      enabled: false,
      token: null,
      exportRoutines: true,
      exportTimedTodos: true,
      exportAllDayTodos: true,
      includeCompleted: true
    },
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
    todos: [],
    specialEvents: [],
    specialEventSuggestions: [],
    specialEventTypeFilter: 'all',
    specialEventRangeFilter: 'all',
    specialEventsSeenKeys: []
  };

  // ==================================================
  // STATE
  // ==================================================

  let state = loadState();
  let isDragging = false;
  let dragDay = null;
  let dragStart = null;
  let dragEnd = null;
  let movingEventId = null;
  let movingOverDay = null;
  let movingPointerOffsetY = 0;
  let movingOriginalStart = null;
  let movingOriginalEnd = null;
  let eventResizeState = null;
  let editingId = null;
  let editingCategoryId = null;
  let pendingTodoId = null;
  let presetSource = null;
  let lastAutoScrollKey = null;
  let currentTimeTimer = null;
  let currentTimeRenderDateKey = null;
  let editingDayTodoId = null;
  let editingSpecialEventId = null;
  let specialDatePickerMonth = null;
  let specialEventFocusDate = null;
  let drawerControlsCollapsed = true;
  let drawerTouchStartX = null;
  let drawerTouchStartY = null;
  let dayTodoDraftSubtasks = [];
  let eventDraftSubtasks = [];
  let inviteDraftAttendees = [];
  let invitePanelExpanded = false;
  let bulkSelectionMode = false;
  const selectedEventIds = new Set();
  let bulkActionType = null;
  let modalBlockTasksExpanded = false;
  const openCompactEventIds = new Set();

  // ==================================================
  // DOM REFERENCES
  // ==================================================

  const calendar = document.getElementById('calendar');
  const calendarWrap = document.getElementById('calendarWrap');
  const bulkSelectModeBtn = document.getElementById('bulkSelectModeBtn');
  const bulkActionBar = document.getElementById('bulkActionBar');
  const bulkSelectionCount = document.getElementById('bulkSelectionCount');
  const bulkInviteBtn = document.getElementById('bulkInviteBtn');
  const bulkCategoryBtn = document.getElementById('bulkCategoryBtn');
  const bulkMoveBtn = document.getElementById('bulkMoveBtn');
  const bulkStatusBtn = document.getElementById('bulkStatusBtn');
  const bulkDeleteBtn = document.getElementById('bulkDeleteBtn');
  const bulkClearBtn = document.getElementById('bulkClearBtn');
  const bulkExitBtn = document.getElementById('bulkExitBtn');
  const bulkActionModalBackdrop = document.getElementById('bulkActionModalBackdrop');
  const closeBulkActionModalBtn = document.getElementById('closeBulkActionModalBtn');
  const cancelBulkActionBtn = document.getElementById('cancelBulkActionBtn');
  const confirmBulkActionBtn = document.getElementById('confirmBulkActionBtn');
  const bulkActionTitle = document.getElementById('bulkActionTitle');
  const bulkActionSubtitle = document.getElementById('bulkActionSubtitle');
  const bulkInviteSection = document.getElementById('bulkInviteSection');
  const bulkInviteEmails = document.getElementById('bulkInviteEmails');
  const bulkInviteMessage = document.getElementById('bulkInviteMessage');
  const bulkCategorySection = document.getElementById('bulkCategorySection');
  const bulkCategorySelect = document.getElementById('bulkCategorySelect');
  const bulkMoveSection = document.getElementById('bulkMoveSection');
  const bulkMoveDaySelect = document.getElementById('bulkMoveDaySelect');
  const bulkMoveOffset = document.getElementById('bulkMoveOffset');
  const bulkStatusSection = document.getElementById('bulkStatusSection');
  const bulkStatusSelect = document.getElementById('bulkStatusSelect');
  const bulkActionStatus = document.getElementById('bulkActionStatus');
  const legend = document.getElementById('legend');
  const categoryToggleBtn = document.getElementById('categoryToggleBtn');
  const mobileControlsToggleBtn = document.getElementById('mobileControlsToggleBtn');
  const mobileControlsStatus = document.getElementById('mobileControlsStatus');
  const mobileControlsChevron = document.getElementById('mobileControlsChevron');
  const modalBackdrop = document.getElementById('modalBackdrop');
  const modalTitle = document.getElementById('modalTitle');
  const modalLabel = document.getElementById('modalLabel');
  const modalCategory = document.getElementById('modalCategory');
  const modalDay = document.getElementById('modalDay');
  const modalStart = document.getElementById('modalStart');
  const modalEnd = document.getElementById('modalEnd');
  const modalStackedInto = document.getElementById('modalStackedInto');
  const modalIntegratedEvents = document.getElementById('modalIntegratedEvents');
  const eventInvitePanel = document.getElementById('eventInvitePanel');
  const eventInviteToggle = document.getElementById('eventInviteToggle');
  const eventInviteContent = document.getElementById('eventInviteContent');
  const eventInviteReadonlyNote = document.getElementById('eventInviteReadonlyNote');
  const eventInviteSummary = document.getElementById('eventInviteSummary');
  const eventInviteEmailInput = document.getElementById('eventInviteEmailInput');
  const addInviteEmailBtn = document.getElementById('addInviteEmailBtn');
  const eventInviteChips = document.getElementById('eventInviteChips');
  const eventInviteMessage = document.getElementById('eventInviteMessage');
  const eventInviteStatus = document.getElementById('eventInviteStatus');
  const sendInviteBtn = document.getElementById('sendInviteBtn');
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
  const specialEventsBtn = document.getElementById('specialEventsBtn');
  const specialEventsBadge = document.getElementById('specialEventsBadge');
  const specialEventsDrawer = document.getElementById('specialEventsDrawer');
  const specialEventsSummary = document.getElementById('specialEventsSummary');
  const specialEventsModalBackdrop = document.getElementById('specialEventsModalBackdrop');
  const specialEventFormBackdrop = document.getElementById('specialEventFormBackdrop');
  const specialEventFormTitle = document.getElementById('specialEventFormTitle');
  const closeSpecialEventFormBtn = document.getElementById('closeSpecialEventFormBtn');
  const closeSpecialEventsModalBtn = document.getElementById('closeSpecialEventsModalBtn');
  const specialEventsList = document.getElementById('specialEventsList');
  const specialEventsOverview = document.getElementById('specialEventsOverview');
  const specialEventTypeFilter = document.getElementById('specialEventTypeFilter');
  const specialEventRangeFilter = document.getElementById('specialEventRangeFilter');
  const specialEventSuggestionsList = document.getElementById('specialEventSuggestionsList');
  const showSpecialEventFormBtn = document.getElementById('showSpecialEventFormBtn');
  const specialEventForm = document.getElementById('specialEventForm');
  const specialEventType = document.getElementById('specialEventType');
  const specialEventTitle = document.getElementById('specialEventTitle');
  const specialEventDate = document.getElementById('specialEventDate');
  const specialEventDatePickerBtn = document.getElementById('specialEventDatePickerBtn');
  const specialEventZodiacPreview = document.getElementById('specialEventZodiacPreview');
  const specialEventYear = document.getElementById('specialEventYear');
  const specialEventRepeats = document.getElementById('specialEventRepeats');
  const specialEventReminderDays = document.getElementById('specialEventReminderDays');
  const specialEventNote = document.getElementById('specialEventNote');
  const cancelSpecialEventBtn = document.getElementById('cancelSpecialEventBtn');
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
  const mobileWeekSummaryBtn = document.getElementById('mobileWeekSummaryBtn');
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
  const accountModalBackdrop = document.getElementById('accountModalBackdrop');
  const closeAccountModalBtn = document.getElementById('closeAccountModalBtn');
  const closeAccountModalFooterBtn = document.getElementById('closeAccountModalFooterBtn');
  const accountAvatar = document.getElementById('accountAvatar');
  const accountEmail = document.getElementById('accountEmail');
  const accountStatusBadge = document.getElementById('accountStatusBadge');
  const accountStatusText = document.getElementById('accountStatusText');
  const accountModeInfo = document.getElementById('accountModeInfo');
  const accountSyncInfo = document.getElementById('accountSyncInfo');
  const accountFeedInfo = document.getElementById('accountFeedInfo');
  const accountDetailText = document.getElementById('accountDetailText');
  const calendarFeedModalBackdrop = document.getElementById('calendarFeedModalBackdrop');
  const openCalendarFeedModalBtn = document.getElementById('openCalendarFeedModalBtn');
  const closeCalendarFeedModalBtn = document.getElementById('closeCalendarFeedModalBtn');
  const closeCalendarFeedModalFooterBtn = document.getElementById('closeCalendarFeedModalFooterBtn');
  const calendarFeedPanel = document.getElementById('calendarFeedPanel');
  const calendarFeedEnabled = document.getElementById('calendarFeedEnabled');
  const calendarFeedUrl = document.getElementById('calendarFeedUrl');
  const copyCalendarFeedBtn = document.getElementById('copyCalendarFeedBtn');
  const regenerateCalendarFeedTokenBtn = document.getElementById('regenerateCalendarFeedTokenBtn');
  const enableCalendarFeedBtn = document.getElementById('enableCalendarFeedBtn');
  const calendarFeedDisabledState = document.getElementById('calendarFeedDisabledState');
  const calendarFeedEnabledState = document.getElementById('calendarFeedEnabledState');
  const calendarFeedStatus = document.getElementById('calendarFeedStatus');
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
  const profileHelpBtn = document.getElementById('profileHelpBtn');
  const profileLogoutBtn = document.getElementById('profileLogoutBtn');
  const helpModalBackdrop = document.getElementById('helpModalBackdrop');
  const closeHelpModalBtn = document.getElementById('closeHelpModalBtn');
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
      if (rawV2) {
        const loaded = normalizeState(JSON.parse(rawV2));
        logIcsSyncAfterReload(loaded);
        return loaded;
      }
      const rawV1 = localStorage.getItem(storageKeyV1);
      if (rawV1) return migrateV1(JSON.parse(rawV1));
      return clone(defaults);
    } catch {
      return normalizeState({});
    }
  }

  function normalizeParticipant(att) {
    const email = normalizeInviteEmail(att?.email || att);
    if (!isValidInviteEmail(email)) return null;
    return {
      email,
      name: String(att?.name || '').trim(),
      status: att?.status || att?.invitationStatus || 'pending',
      invitationStatus: att?.invitationStatus || att?.status || 'pending',
      invitationError: att?.invitationError || null,
      invitationSentAt: att?.invitationSentAt || null
    };
  }

  function normalizeParticipantList(value) {
    const seen = new Set();
    const list = Array.isArray(value) ? value : [];
    return list.map(normalizeParticipant).filter(Boolean).filter(att => {
      if (seen.has(att.email)) return false;
      seen.add(att.email);
      return true;
    }).slice(0, MAX_INVITE_ATTENDEES);
  }

  function eventParticipantList(ev) {
    return normalizeParticipantList(Array.isArray(ev?.participants) ? ev.participants : ev?.attendees);
  }

  function syncParticipantsToEvent(ev, participants = inviteDraftAttendees) {
    if (!ev) return;
    const normalized = normalizeParticipantList(participants);
    ev.participants = normalized.map(att => ({ ...att }));
    ev.attendees = normalized.map(att => ({ ...att }));
  }

  function participantSignature(participants) {
    return normalizeParticipantList(participants)
      .map(att => `${att.email}|${att.name || ''}|${att.status || att.invitationStatus || 'pending'}`)
      .join('\n');
  }

  function normalizeState(input) {
    const shouldMigrateHomeView = input.uiHomeVersion !== 'calendar-main-v1';
    const s = { ...clone(defaults), ...input };
    s.uiHomeVersion = 'calendar-main-v1';
    s.categories = { ...clone(defaults).categories, ...(input.categories || {}) };
    Object.values(s.categories).forEach(cat => { if (cat.habit === undefined) cat.habit = true; });
    const incomingFeed = input.calendarFeed && typeof input.calendarFeed === 'object' ? input.calendarFeed : {};
    s.calendarFeed = { ...clone(defaults).calendarFeed, ...incomingFeed };
    s.calendarFeed.enabled = Boolean(s.calendarFeed.enabled);
    s.calendarFeed.token = typeof s.calendarFeed.token === 'string' && s.calendarFeed.token.length >= 32 ? s.calendarFeed.token : null;
    s.calendarFeed.exportRoutines = s.calendarFeed.exportRoutines !== false;
    s.calendarFeed.exportTimedTodos = s.calendarFeed.exportTimedTodos !== false;
    s.calendarFeed.exportAllDayTodos = true;
    s.calendarFeed.includeCompleted = s.calendarFeed.includeCompleted !== false;
    if (s.categories.neutral) {
      s.categories.orga = s.categories.orga || { label: 'Orga / To-dos', color: s.categories.neutral.color || '#94a3b8', habit: true };
      delete s.categories.neutral;
    }

    function normalizeEvent(ev, fallbackSource = 'routine') {
      const allDay = Boolean(ev.allDay);
      return {
        id: ev.id || id(),
        day: clamp(Number(ev.day), 0, 6),
        start: allDay ? null : clamp(Number(ev.start), 0, slotsPerDay - 1),
        end: allDay ? null : clamp(Number(ev.end), 1, slotsPerDay),
        allDay,
        date: ev.date || null,
        label: ev.label || 'Block',
        title: ev.title || ev.label || 'Block',
        categoryId: s.categories[ev.categoryId] ? ev.categoryId : 'orga',
        category: ev.category || null,
        done: Boolean(ev.done || ev.completed),
        missed: Boolean(ev.missed),
        completed: Boolean(ev.completed || ev.done),
        source: ['routine', 'extra'].includes(ev.source) ? ev.source : fallbackSource,
        templateEventId: ev.templateEventId || null,
        parentId: ev.parentId || null,
        stackedIntoId: ev.stackedIntoId || null,
        missingFromLastSync: Boolean(ev.missingFromLastSync),
        syncStatus: ev.syncStatus || null,
        location: ev.location || null,
        description: ev.description || null,
        duration: ev.duration ?? null,
        importSource: ev.importSource || null,
        provider: ev.provider || null,
        externalId: ev.externalId || null,
        externalCalendarId: ev.externalCalendarId || null,
        externalSourceId: ev.externalSourceId || ev.sourceId || ev.externalCalendarId || null,
        externalUid: ev.externalUid || ev.sourceUid || ev.uid || null,
        sourceUid: ev.sourceUid || ev.uid || ev.externalUid || null,
        sourceKey: ev.sourceKey || null,
        externalSourceKey: ev.externalSourceKey || ev.sourceKey || null,
        externalOriginal: ev.externalOriginal && typeof ev.externalOriginal === 'object' ? { ...ev.externalOriginal } : (ev.importSource === 'ics' || ev.provider === 'ics' || ev.isExternal ? externalOriginalFromEvent(ev) : null),
        localOverrides: normalizeExternalLocalOverrides(ev.localOverrides),
        externalLocalEditedAt: ev.externalLocalEditedAt || ev.localOverrides?.updatedAt || null,
        mirroredInExternalCalendar: Boolean(ev.mirroredInExternalCalendar),
        externalMirrorLastSeenAt: ev.externalMirrorLastSeenAt || null,
        externalMirrorLastMissingAt: ev.externalMirrorLastMissingAt || null,
        externalMirrorConflict: ev.externalMirrorConflict || null,
        organizerEmail: ev.organizerEmail || null,
        organizerName: ev.organizerName || null,
        recurrenceId: ev.recurrenceId || null,
        occurrenceStart: ev.occurrenceStart || null,
        originalStart: ev.originalStart || null,
        originalEnd: ev.originalEnd || null,
        displayDate: ev.displayDate || ev.date || null,
        splitFromMultiDay: Boolean(ev.splitFromMultiDay),
        importedFromIcs: Boolean(ev.importedFromIcs || ev.importSource === 'ics' || ev.provider === 'ics'),
        status: ev.status || null,
        sequence: ev.sequence || null,
        dtstamp: ev.dtstamp || null,
        lastModified: ev.lastModified || null,
        className: ev.className || null,
        transp: ev.transp || null,
        microsoftInstanceType: ev.microsoftInstanceType || null,
        sourceId: ev.sourceId || ev.externalCalendarId || ((ev.importSource === 'ics' || ev.provider === 'ics') ? DEFAULT_ICS_SOURCE_ID : null),
        editable: ev.editable ?? true,
        readOnly: ev.readOnly ?? false,
        isExternal: ev.isExternal ?? (ev.importSource === 'ics' || ev.provider === 'ics'),
        autoComplete: Boolean(ev.autoComplete || ev.autoCompleteFromSubtasks),
        autoCompleteFromSubtasks: Boolean(ev.autoCompleteFromSubtasks),
        participants: normalizeParticipantList(Array.isArray(ev.participants) ? ev.participants : ev.attendees),
        attendees: normalizeParticipantList(Array.isArray(ev.participants) ? ev.participants : ev.attendees),
        inviteMessage: ev.inviteMessage || '',
        invitationUid: ev.invitationUid || (!ev.importSource && !ev.provider && !ev.isExternal ? invitationUidForEvent(ev) : null),
        invitationSequence: Number.isInteger(Number(ev.invitationSequence)) ? Number(ev.invitationSequence) : 0,
        invitationSentAt: ev.invitationSentAt || null,
        invitationUpdatedAt: ev.invitationUpdatedAt || null,
        invitationStatus: ev.invitationStatus || 'not-sent',
        invitationError: ev.invitationError || null,
        subtasks: Array.isArray(ev.subtasks) ? ev.subtasks.map(sub => ({
          id: sub.id || id(),
          text: sub.text || 'Untertask',
          done: Boolean(sub.done),
          createdAt: sub.createdAt || new Date().toISOString()
        })) : [],
        createdAt: ev.createdAt || new Date().toISOString(),
        updatedAt: ev.updatedAt || ev.lastModified || ev.dtstamp || ev.createdAt || new Date().toISOString()
      };
    }

    const todayWeek = weekStartKey(new Date());
    const initialWeek = clampWeekKey(input.currentWeekStart || todayWeek);
    s.currentWeekStart = initialWeek;

    const legacyEvents = Array.isArray(input.events) ? input.events : [];
    const rawTemplateEvents = Array.isArray(input.templateEvents) ? input.templateEvents : legacyEvents;
    const rawWeekEvents = Array.isArray(input.weekEvents) ? input.weekEvents : [];

    s.templateEvents = rawTemplateEvents
      .map(ev => applyExternalLocalOverrides(normalizeEvent(ev, 'routine')))
      .map(ev => ({ ...ev, source: 'routine', done: false, templateEventId: null }))
      .filter(ev => ev.allDay || ev.end > ev.start);

    s.weekEventsByWeek = {};
    if (input.weekEventsByWeek && typeof input.weekEventsByWeek === 'object') {
      Object.entries(input.weekEventsByWeek).forEach(([weekKey, events]) => {
        const safeWeek = clampWeekKey(weekKey);
        if (!Array.isArray(events)) return;
        s.weekEventsByWeek[safeWeek] = events
          .map(ev => applyExternalLocalOverrides(normalizeEvent(ev, ev.source || 'extra')))
          .filter(ev => ev.allDay || ev.end > ev.start);
      });
    }

    if (rawWeekEvents.length && !s.weekEventsByWeek[initialWeek]) {
      s.weekEventsByWeek[initialWeek] = rawWeekEvents
        .map(ev => applyExternalLocalOverrides(normalizeEvent(ev, ev.source || 'extra')))
        .filter(ev => ev.allDay || ev.end > ev.start);
    }

    if (!s.weekEventsByWeek[s.currentWeekStart]) s.weekEventsByWeek[s.currentWeekStart] = [];
    s.weekEvents = s.weekEventsByWeek[s.currentWeekStart];
    s.events = s.templateEvents;

    function normalizeSpecialEvent(event) {
      const allowedTypes = ['birthday', 'anniversary', 'jubilee', 'reminder', 'other'];
      const rawDate = String(event?.date || '').slice(0, 10);
      const validDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : dateKey(new Date());
      const year = Number(event?.year);
      const title = String(event?.title || event?.personName || 'Besonderes Ereignis').trim() || 'Besonderes Ereignis';
      return {
        id: event?.id || `special-event-${id()}`,
        title,
        type: allowedTypes.includes(event?.type) ? event.type : 'other',
        date: validDate,
        year: Number.isInteger(year) && year > 0 ? year : null,
        repeatsYearly: event?.repeatsYearly !== false,
        personName: event?.personName || '',
        note: event?.note || '',
        reminderDaysBefore: Number.isFinite(Number(event?.reminderDaysBefore)) ? clamp(Number(event.reminderDaysBefore), 0, 365) : null,
        externalSourceKey: event?.externalSourceKey || null,
        externalUid: event?.externalUid || null,
        createdAt: event?.createdAt || new Date().toISOString(),
        updatedAt: event?.updatedAt || event?.createdAt || new Date().toISOString()
      };
    }

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
      createdAt: todo.createdAt || new Date().toISOString(),
      updatedAt: todo.updatedAt || todo.createdAt || new Date().toISOString()
    })).map(todo => syncTodoAutoComplete(todo)) : [];

    s.specialEvents = Array.isArray(input.specialEvents) ? input.specialEvents.map(normalizeSpecialEvent) : [];
    s.specialEventTypeFilter = ['all', 'birthday', 'anniversary', 'jubilee', 'reminder', 'other'].includes(input.specialEventTypeFilter) ? input.specialEventTypeFilter : 'all';
    s.specialEventRangeFilter = ['all', 'today', '7', '30'].includes(String(input.specialEventRangeFilter || '')) ? String(input.specialEventRangeFilter) : 'all';
    s.specialEventsSeenKeys = Array.isArray(input.specialEventsSeenKeys) ? input.specialEventsSeenKeys.map(String).slice(-300) : [];
    s.specialEventSuggestions = Array.isArray(input.specialEventSuggestions) ? input.specialEventSuggestions.map(item => ({
      id: item.id || `special-suggestion-${id()}`,
      key: item.key || item.sourceKey || item.externalUid || id(),
      title: item.title || 'Besonderes Ereignis',
      date: /^\d{4}-\d{2}-\d{2}$/.test(String(item.date || '')) ? item.date : dateKey(new Date()),
      recurrenceRule: item.recurrenceRule || '',
      recurrenceFrequency: item.recurrenceFrequency || '',
      externalUid: item.externalUid || null,
      sourceId: item.sourceId || DEFAULT_ICS_SOURCE_ID,
      sourceKey: item.sourceKey || null,
      suggestedType: ['birthday', 'anniversary', 'jubilee', 'reminder', 'other'].includes(item.suggestedType) ? item.suggestedType : 'other',
      status: ['pending', 'accepted', 'dismissed', 'ignored'].includes(item.status) ? item.status : 'pending',
      createdAt: item.createdAt || new Date().toISOString(),
      updatedAt: item.updatedAt || item.createdAt || new Date().toISOString()
    })) : [];

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
    s.specialEventsDrawerOpen = Boolean(s.specialEventsDrawerOpen);
    s.mobileControlsOpen = Boolean(s.mobileControlsOpen);
    s.mobileCalendarStartDay = Number.isInteger(Number(input.mobileCalendarStartDay)) ? clamp(Number(input.mobileCalendarStartDay), 0, 5) : null;
    if (s.todoDrawerOpen) s.specialEventsDrawerOpen = false;
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

  function isStorageQuotaError(error) {
    return error?.name === 'QuotaExceededError' ||
      error?.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      error?.code === 22 ||
      error?.code === 1014;
  }

  function serializedSizeInfo(value) {
    const json = JSON.stringify(value);
    const bytes = typeof Blob !== 'undefined' ? new Blob([json]).size : json.length;
    return { json, bytes, chars: json.length };
  }

  function saveState(next = state) {
    const { json, bytes, chars } = serializedSizeInfo(next);
    try {
      localStorage.setItem(storageKeyV2, json);
    } catch (error) {
      if (isStorageQuotaError(error)) {
        const mb = (bytes / (1024 * 1024)).toFixed(2);
        throw new Error(`Der ICS-Import ist zu groß für den lokalen Browser-Speicher. Aktueller Planner-State: ca. ${mb} MB.`);
      }
      throw error;
    }
    if (bytes > 3.5 * 1024 * 1024) {
      console.warn('[Storage] Planner-State wird groß', { bytes, chars });
    }
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
    renderCalendarFeedSettings();
  }

  function generateCalendarFeedToken() {
    const bytes = new Uint8Array(32);
    if (window.crypto?.getRandomValues) {
      window.crypto.getRandomValues(bytes);
      return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    }
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`.padEnd(43, 'x');
  }

  function ensureCalendarFeedSettings({ ensureToken = false } = {}) {
    if (!state.calendarFeed || typeof state.calendarFeed !== 'object') state.calendarFeed = clone(defaults.calendarFeed);
    state.calendarFeed = { ...clone(defaults.calendarFeed), ...state.calendarFeed };
    if (ensureToken && !state.calendarFeed.token) state.calendarFeed.token = generateCalendarFeedToken();
    return state.calendarFeed;
  }

  function calendarFeedLink() {
    const feed = ensureCalendarFeedSettings();
    if (!feed.token) return '';
    const configuredBaseUrl = String(window.WOCHENPLANER_APP_BASE_URL || '').replace(/\/$/, '');
    const origin = configuredBaseUrl || (window.location?.origin && window.location.origin !== 'null' ? window.location.origin : '');
    return `${origin}/api/calendar-feed?token=${encodeURIComponent(feed.token)}`;
  }

  function renderAccountModal() {
    if (!accountModalBackdrop) return;
    const signedIn = Boolean(cloudUser);
    const feed = ensureCalendarFeedSettings();
    const label = signedIn ? (cloudUser.email || 'Nutzer') : 'Lokaler Modus';
    if (accountAvatar) accountAvatar.textContent = signedIn ? profileInitials(label) : 'LO';
    if (accountEmail) accountEmail.textContent = label;
    if (accountStatusBadge) accountStatusBadge.textContent = signedIn ? 'Eingeloggt' : 'Lokal';
    if (accountStatusText) accountStatusText.textContent = signedIn ? 'Cloud Sync aktiv' : 'Nur lokale Speicherung';
    if (accountModeInfo) accountModeInfo.textContent = signedIn ? 'Aktiviert' : 'Lokaler Modus';
    if (accountSyncInfo) accountSyncInfo.textContent = signedIn ? 'Aktiv' : 'Inaktiv';
    if (accountFeedInfo) accountFeedInfo.textContent = feed.enabled ? 'Aktiv' : 'Inaktiv';
    if (accountDetailText) {
      accountDetailText.textContent = signedIn
        ? `Deine Planung wird mit Supabase synchronisiert.${feed.enabled ? ' Dein persönlicher Kalenderfeed ist aktiv.' : ' Der Kalenderfeed ist aktuell deaktiviert.'}`
        : 'Du nutzt die App lokal in diesem Browser. Für Cloud Sync und den serverseitigen Kalenderfeed musst du eingeloggt sein.';
    }
  }

  function openAccountModal() {
    profileMenu?.classList.remove('open');
    renderAccountModal();
    if (accountModalBackdrop) accountModalBackdrop.style.display = 'flex';
  }

  function closeAccountModal() {
    if (accountModalBackdrop) accountModalBackdrop.style.display = 'none';
  }

  function openCalendarFeedModal() {
    profileMenu?.classList.remove('open');
    renderCalendarFeedSettings();
    if (calendarFeedModalBackdrop) calendarFeedModalBackdrop.style.display = 'flex';
  }

  function closeCalendarFeedModal() {
    if (calendarFeedModalBackdrop) calendarFeedModalBackdrop.style.display = 'none';
  }

  function renderCalendarFeedSettings() {
    if (!calendarFeedPanel) return;
    const feed = ensureCalendarFeedSettings();
    const link = feed.enabled ? calendarFeedLink() : '';
    const signedIn = Boolean(cloudUser);
    calendarFeedEnabled.checked = Boolean(feed.enabled);
    calendarFeedEnabled.disabled = !signedIn;
    if (calendarFeedUrl) calendarFeedUrl.value = link;
    if (copyCalendarFeedBtn) copyCalendarFeedBtn.disabled = !link;
    if (enableCalendarFeedBtn) enableCalendarFeedBtn.disabled = !signedIn;
    if (regenerateCalendarFeedTokenBtn) regenerateCalendarFeedTokenBtn.disabled = !feed.enabled || !signedIn;
    if (calendarFeedDisabledState) calendarFeedDisabledState.style.display = feed.enabled ? 'none' : '';
    if (calendarFeedEnabledState) calendarFeedEnabledState.style.display = feed.enabled ? '' : 'none';
    if (calendarFeedStatus) {
      calendarFeedStatus.textContent = !signedIn
        ? 'Bitte einloggen, damit der Kalenderlink serverseitig gespeichert werden kann.'
        : (feed.enabled ? 'Freigabe aktiv' : 'Freigabe deaktiviert');
    }
  }

  function updateCalendarFeedOption(key, value) {
    const feed = ensureCalendarFeedSettings();
    feed[key] = value;
    if (feed.enabled) ensureCalendarFeedSettings({ ensureToken: true });
    saveState();
    renderCalendarFeedSettings();
  }

  function scheduleCloudSave(next = state) {
    if (!supabaseClient || !cloudUser || cloudLoading) return;
    clearTimeout(cloudSaveTimer);
    const snapshot = clone(next);
    cloudSaveTimer = setTimeout(() => saveCloudState(snapshot), 650);
  }

  async function saveCloudState(snapshot = state, { throwOnError = false } = {}) {
    if (!supabaseClient || !cloudUser || cloudLoading) return false;
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
      return true;
    } catch (err) {
      console.error('[ICS] saveCloudState failed', err);
      setCloudStatus(`Cloud-Fehler: ${err.message || err}`, 'error');
      if (throwOnError) throw err;
      return false;
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
        saveState(state);
        renderAll();
        setCloudStatus(`Eingeloggt als ${cloudUser.email || 'Nutzer'} · Cloud-Daten geladen.`, 'signed-in');
        requestIcsAutoSync('login');
      } else {
        await saveCloudState(state);
        setCloudStatus(`Eingeloggt als ${cloudUser.email || 'Nutzer'} · Lokale Daten in Cloud gespeichert.`, 'signed-in');
        requestIcsAutoSync('login');
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
  function touchEvent(ev) { if (ev) ev.updatedAt = new Date().toISOString(); }

  function isExternalIcsEvent(ev) {
    return Boolean(ev && (
      ev.importSource === 'ics' ||
      ev.provider === 'ics' ||
      ev.importedFromIcs ||
      ev.isExternal ||
      ev.externalId ||
      ev.externalCalendarId
    ));
  }

  function normalizeExternalLocalOverrides(overrides = {}) {
    const raw = overrides && typeof overrides === 'object' ? overrides : {};
    const numberOrNull = value => value === null || value === undefined || value === ''
      ? null
      : (Number.isFinite(Number(value)) ? Number(value) : null);
    return {
      title: typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : null,
      label: typeof raw.label === 'string' && raw.label.trim() ? raw.label.trim() : null,
      date: /^\d{4}-\d{2}-\d{2}$/.test(String(raw.date || '')) ? String(raw.date).slice(0, 10) : null,
      day: numberOrNull(raw.day),
      start: numberOrNull(raw.start),
      end: numberOrNull(raw.end),
      categoryId: typeof raw.categoryId === 'string' && raw.categoryId ? raw.categoryId : null,
      stackedIntoId: typeof raw.stackedIntoId === 'string' && raw.stackedIntoId ? raw.stackedIntoId : null,
      parentId: typeof raw.parentId === 'string' && raw.parentId ? raw.parentId : null,
      hidden: Boolean(raw.hidden),
      note: typeof raw.note === 'string' && raw.note.trim() ? raw.note.trim() : null,
      updatedAt: raw.updatedAt || null
    };
  }

  function externalOriginalFromEvent(ev = {}) {
    return {
      title: ev.externalOriginal?.title || ev.title || ev.label || 'Kalendertermin',
      label: ev.externalOriginal?.label || ev.label || ev.title || 'Kalendertermin',
      date: ev.externalOriginal?.date || ev.date || null,
      day: Number.isFinite(Number(ev.externalOriginal?.day)) ? Number(ev.externalOriginal.day) : (Number.isFinite(Number(ev.day)) ? Number(ev.day) : null),
      start: Number.isFinite(Number(ev.externalOriginal?.start)) ? Number(ev.externalOriginal.start) : (Number.isFinite(Number(ev.start)) ? Number(ev.start) : null),
      end: Number.isFinite(Number(ev.externalOriginal?.end)) ? Number(ev.externalOriginal.end) : (Number.isFinite(Number(ev.end)) ? Number(ev.end) : null),
      allDay: Boolean(ev.externalOriginal?.allDay ?? ev.allDay),
      categoryId: ev.externalOriginal?.categoryId || ev.categoryId || 'external',
      location: ev.externalOriginal?.location ?? ev.location ?? null,
      description: ev.externalOriginal?.description ?? ev.description ?? null,
      duration: ev.externalOriginal?.duration ?? ev.duration ?? null,
      sourceId: ev.externalOriginal?.sourceId || ev.sourceId || ev.externalCalendarId || DEFAULT_ICS_SOURCE_ID,
      externalId: ev.externalOriginal?.externalId || ev.externalId || null,
      externalUid: ev.externalOriginal?.externalUid || ev.externalUid || ev.sourceUid || null,
      sourceKey: ev.externalOriginal?.sourceKey || ev.sourceKey || null,
      organizerEmail: ev.externalOriginal?.organizerEmail || ev.organizerEmail || null,
      organizerName: ev.externalOriginal?.organizerName || ev.organizerName || null,
      importedAt: ev.externalOriginal?.importedAt || ev.createdAt || new Date().toISOString(),
      lastSeenAt: new Date().toISOString()
    };
  }

  function hasExternalLocalEdits(ev) {
    if (!isExternalIcsEvent(ev)) return false;
    const overrides = normalizeExternalLocalOverrides(ev.localOverrides);
    return Boolean(
      overrides.title || overrides.label || overrides.date || overrides.day !== null ||
      overrides.start !== null || overrides.end !== null || overrides.categoryId ||
      overrides.stackedIntoId || overrides.parentId || overrides.hidden || overrides.note ||
      (Array.isArray(ev.subtasks) && ev.subtasks.length) || ev.done || ev.completed || ev.missed ||
      ev.autoComplete || ev.autoCompleteFromSubtasks || ev.categoryId !== 'external'
    );
  }

  function applyExternalLocalOverrides(ev) {
    if (!isExternalIcsEvent(ev)) return ev;
    const overrides = normalizeExternalLocalOverrides(ev.localOverrides);
    ev.localOverrides = overrides;
    ev.externalOriginal = externalOriginalFromEvent(ev);
    const title = overrides.title || overrides.label;
    if (title) {
      ev.label = title;
      ev.title = title;
    }
    if (overrides.categoryId) ev.categoryId = overrides.categoryId;
    if (overrides.date) ev.date = overrides.date;
    if (overrides.day !== null) ev.day = clamp(Number(overrides.day), 0, 6);
    if (!ev.allDay) {
      if (overrides.start !== null) ev.start = clamp(Number(overrides.start), 0, slotsPerDay - 1);
      if (overrides.end !== null) ev.end = clamp(Number(overrides.end), 1, slotsPerDay);
      if (Number(ev.end) <= Number(ev.start)) ev.end = Math.min(Number(ev.start) + 1, slotsPerDay);
    }
    ev.stackedIntoId = overrides.stackedIntoId || ev.stackedIntoId || null;
    ev.parentId = overrides.parentId || ev.parentId || null;
    return ev;
  }

  function isEventLocallyHidden(ev) {
    return Boolean(isExternalIcsEvent(ev) && normalizeExternalLocalOverrides(ev.localOverrides).hidden);
  }

  function visibleEvents(events = currentEvents()) {
    return (events || []).filter(ev => !isEventLocallyHidden(ev));
  }

  function recordExternalLocalOverrides(ev, fields = {}) {
    if (!isExternalIcsEvent(ev)) return;
    const original = ev.externalOriginal || externalOriginalFromEvent(ev);
    const overrides = normalizeExternalLocalOverrides(ev.localOverrides);
    const same = (a, b) => String(a ?? '') === String(b ?? '');
    if ('label' in fields || 'title' in fields) {
      const title = String(fields.label ?? fields.title ?? '').trim();
      overrides.title = title && !same(title, original.title || original.label) ? title : null;
      overrides.label = overrides.title;
    }
    if ('categoryId' in fields) overrides.categoryId = fields.categoryId && fields.categoryId !== (original.categoryId || 'external') ? fields.categoryId : null;
    if ('date' in fields) overrides.date = fields.date && !same(fields.date, original.date) ? fields.date : null;
    if ('day' in fields) overrides.day = Number(fields.day) !== Number(original.day) ? Number(fields.day) : null;
    if ('start' in fields) overrides.start = Number(fields.start) !== Number(original.start) ? Number(fields.start) : null;
    if ('end' in fields) overrides.end = Number(fields.end) !== Number(original.end) ? Number(fields.end) : null;
    if ('stackedIntoId' in fields) overrides.stackedIntoId = fields.stackedIntoId || null;
    if ('parentId' in fields) overrides.parentId = fields.parentId || null;
    if ('hidden' in fields) overrides.hidden = Boolean(fields.hidden);
    overrides.updatedAt = new Date().toISOString();
    ev.localOverrides = overrides;
    ev.externalLocalEditedAt = overrides.updatedAt;
  }

  function canLocallyEditEvent(ev) {
    if (!ev) return false;
    if (ev.readOnly || ev.editable === false || ev.allDay) return false;
    return true;
  }

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

  function isExternalReadOnlyEvent(ev) {
    return Boolean(
      ev?.readOnly ||
      ev?.editable === false ||
      ev?.isExternal ||
      ev?.importSource === 'ics' ||
      ev?.provider === 'ics' ||
      ev?.externalReadOnly ||
      ev?.externalId ||
      ev?.externalCalendarId
    );
  }

  function isBulkSelectableEvent(ev) {
    return Boolean(ev && isWeekMode() && !isIntegratedChild(ev) && !ev.allDay && !isExternalReadOnlyEvent(ev));
  }

  function isBulkEditableEvent(ev) {
    return isBulkSelectableEvent(ev);
  }

  function selectedEvents() {
    const ids = new Set(selectedEventIds);
    return currentEvents().filter(ev => ids.has(ev.id));
  }

  function selectedEditableEvents() {
    return selectedEvents().filter(isBulkEditableEvent);
  }

  function selectedReadOnlyEvents() {
    return selectedEvents().filter(ev => !isBulkEditableEvent(ev));
  }

  function pruneBulkSelection() {
    const visibleIds = new Set(currentEvents().filter(isBulkSelectableEvent).map(ev => ev.id));
    Array.from(selectedEventIds).forEach(eventId => {
      if (!visibleIds.has(eventId)) selectedEventIds.delete(eventId);
    });
  }

  function setBulkSelectionMode(next, initialEventId = null) {
    bulkSelectionMode = Boolean(next) && isWeekMode();
    if (!bulkSelectionMode) selectedEventIds.clear();
    if (bulkSelectionMode && initialEventId) selectedEventIds.add(initialEventId);
    renderCalendar();
    renderBulkActionBar();
  }

  function toggleBulkEventSelection(eventId) {
    if (!bulkSelectionMode) bulkSelectionMode = true;
    if (selectedEventIds.has(eventId)) selectedEventIds.delete(eventId);
    else selectedEventIds.add(eventId);
    renderCalendar();
    renderBulkActionBar();
  }

  function renderBulkActionBar() {
    if (!bulkActionBar || !bulkSelectionCount) return;
    pruneBulkSelection();
    const selected = selectedEvents();
    const editable = selectedEditableEvents();
    const readOnly = selected.length - editable.length;
    if (bulkSelectModeBtn) {
      bulkSelectModeBtn.classList.toggle('active', bulkSelectionMode);
      bulkSelectModeBtn.textContent = '🖊️';
      bulkSelectModeBtn.setAttribute('aria-pressed', String(bulkSelectionMode));
      bulkSelectModeBtn.title = bulkSelectionMode ? 'Sammelbearbeitung beenden' : 'Sammelbearbeitung aktivieren';
      bulkSelectModeBtn.disabled = !isWeekMode();
    }
    bulkActionBar.hidden = !bulkSelectionMode || !selected.length;
    const suffix = readOnly ? ` · ${editable.length} bearbeitbar` : '';
    bulkSelectionCount.textContent = `${selected.length} ${selected.length === 1 ? 'Termin' : 'Termine'} ausgewählt${suffix}`;
    const hasEditable = editable.length > 0;
    [bulkInviteBtn, bulkDeleteBtn].forEach(btn => { if (btn) btn.disabled = !hasEditable; });
  }

  function parseBulkInviteEmails() {
    const raw = bulkInviteEmails?.value || '';
    const emails = raw.split(/[;,\n]+/).map(normalizeInviteEmail).filter(Boolean);
    const unique = [];
    for (const email of emails) {
      if (!isValidInviteEmail(email)) throw new Error(`Ungültige E-Mail-Adresse: ${email}`);
      if (!unique.includes(email)) unique.push(email);
    }
    if (!unique.length) throw new Error('Bitte mindestens eine E-Mail-Adresse eintragen.');
    return unique.slice(0, MAX_INVITE_ATTENDEES);
  }

  function setBulkActionStatus(message, mode = '') {
    if (!bulkActionStatus) return;
    bulkActionStatus.textContent = message || '';
    bulkActionStatus.className = `event-invite-status ${mode}`.trim();
  }

  function closeBulkActionModal() {
    if (bulkActionModalBackdrop) bulkActionModalBackdrop.style.display = 'none';
    bulkActionType = null;
    setBulkActionStatus('', '');
  }

  function fillBulkCategorySelect() {
    if (!bulkCategorySelect) return;
    bulkCategorySelect.innerHTML = '';
    Object.entries(state.categories).forEach(([catId, cat]) => {
      const option = document.createElement('option');
      option.value = catId;
      option.textContent = cat.label;
      bulkCategorySelect.appendChild(option);
    });
  }

  function fillBulkMoveDaySelect() {
    if (!bulkMoveDaySelect) return;
    bulkMoveDaySelect.innerHTML = '';
    days.forEach((day, index) => {
      const option = document.createElement('option');
      option.value = String(index);
      option.textContent = `${day} ${formatShortDate(getDayDate(index))}`;
      bulkMoveDaySelect.appendChild(option);
    });
    const first = selectedEditableEvents()[0];
    bulkMoveDaySelect.value = String(first?.day ?? state.activeHabitDay ?? 0);
  }

  function openBulkActionModal(type) {
    const editable = selectedEditableEvents();
    if (!editable.length) return alert('In der Auswahl gibt es keine bearbeitbaren Termine.');
    bulkActionType = type;
    [bulkInviteSection, bulkCategorySection, bulkMoveSection, bulkStatusSection].forEach(section => { if (section) section.style.display = 'none'; });
    if (type !== 'invite') return;
    setBulkActionStatus('', '');
    if (bulkActionSubtitle) bulkActionSubtitle.textContent = `${editable.length} von ${selectedEvents().length} ausgewählten Terminen können bearbeitet werden.`;
    if (bulkActionModalBackdrop) bulkActionModalBackdrop.style.display = 'flex';
    if (type === 'invite') {
      if (bulkActionTitle) bulkActionTitle.textContent = 'Termine gesammelt einladen';
      if (bulkInviteSection) bulkInviteSection.style.display = '';
      if (bulkInviteEmails) bulkInviteEmails.value = '';
      if (bulkInviteMessage) bulkInviteMessage.value = '';
      if (bulkActionSubtitle) bulkActionSubtitle.textContent = `Die Einladung wird für ${editable.length} einzelne Termine separat gesendet.`;
      setTimeout(() => bulkInviteEmails?.focus(), 50);
    } else if (type === 'category') {
      if (bulkActionTitle) bulkActionTitle.textContent = 'Kategorie ändern';
      if (bulkCategorySection) bulkCategorySection.style.display = '';
      fillBulkCategorySelect();
    } else if (type === 'move') {
      if (bulkActionTitle) bulkActionTitle.textContent = 'Termine verschieben';
      if (bulkMoveSection) bulkMoveSection.style.display = '';
      fillBulkMoveDaySelect();
      if (bulkMoveOffset) bulkMoveOffset.value = '0';
    } else if (type === 'status') {
      if (bulkActionTitle) bulkActionTitle.textContent = 'Status ändern';
      if (bulkStatusSection) bulkStatusSection.style.display = '';
      if (bulkStatusSelect) bulkStatusSelect.value = 'done';
    }
  }

  function applyBulkCategoryChange() {
    const editable = selectedEditableEvents();
    const categoryId = bulkCategorySelect?.value;
    if (!categoryId || !state.categories[categoryId]) throw new Error('Bitte eine gültige Kategorie wählen.');
    editable.forEach(ev => { ev.categoryId = categoryId; ev.updatedAt = new Date().toISOString(); });
    saveState();
    setBulkSelectionMode(false);
    renderAll();
    closeBulkActionModal();
  }

  function applyBulkMove() {
    const editable = selectedEditableEvents();
    const targetDay = Number(bulkMoveDaySelect?.value);
    const offsetSlots = Math.round((Number(bulkMoveOffset?.value || 0) || 0) / 15);
    let changed = 0;
    editable.forEach(ev => {
      const start = Number(ev.start) + offsetSlots;
      const end = Number(ev.end) + offsetSlots;
      if (!Number.isFinite(targetDay) || start < 0 || end > slotsPerDay || end <= start) return;
      ev.day = clamp(targetDay, 0, 6);
      ev.start = start;
      ev.end = end;
      ev.updatedAt = new Date().toISOString();
      changed += 1;
    });
    if (!changed) throw new Error('Keine Termine konnten mit dieser Zeitverschiebung verschoben werden.');
    saveState();
    setBulkSelectionMode(false);
    renderAll();
    closeBulkActionModal();
  }

  function applyBulkStatusChange() {
    const editable = selectedEditableEvents();
    const status = bulkStatusSelect?.value || 'open';
    editable.forEach(ev => {
      if (status === 'done') { setEventDoneStatus(ev, true); ev.missed = false; }
      else if (status === 'missed') { ev.missed = true; setEventDoneStatus(ev, false); }
      else { ev.missed = false; setEventDoneStatus(ev, false); }
      ev.updatedAt = new Date().toISOString();
    });
    saveState();
    setBulkSelectionMode(false);
    renderAll();
    closeBulkActionModal();
  }

  async function sendBulkInvitations() {
    const editable = selectedEditableEvents().filter(canInviteEvent);
    if (!editable.length) throw new Error('Keine ausgewählten Termine können eingeladen werden.');
    const emails = parseBulkInviteEmails();
    const message = bulkInviteMessage?.value || '';
    const routineEditable = editable.filter(routineParticipantScopeEligible);
    const applyFutureRoutines = routineEditable.length
      ? confirm(`${routineEditable.length} Routine-/Habit-Termine sind ausgewählt.\n\nOK = Teilnehmer zusätzlich für alle zukünftigen Termine dieser Routine übernehmen\nAbbrechen = Nur ausgewählte Instanzen einladen`)
      : false;
    if (!cloudUser || !supabaseClient) throw new Error('Bitte einloggen, um Einladungen zu senden.');
    editable.forEach(ev => {
      const participants = eventParticipantList(ev);
      const existing = new Set(participants.map(att => att.email));
      emails.forEach(email => { if (!existing.has(email)) participants.push({ email, name: '', status: 'pending', invitationStatus: 'pending' }); });
      syncParticipantsToEvent(ev, participants);
      ev.inviteMessage = message;
      if (!ev.invitationUid) ev.invitationUid = invitationUidForEvent(ev);
      if (!Number.isInteger(Number(ev.invitationSequence))) ev.invitationSequence = 0;
      ev.updatedAt = new Date().toISOString();
      if (applyFutureRoutines && routineParticipantScopeEligible(ev)) {
        const templateEv = state.templateEvents.find(item => item.id === ev.templateEventId);
        if (templateEv) {
          syncParticipantsToEvent(templateEv, eventParticipantList(ev));
          templateEv.inviteMessage = message;
          touchEvent(templateEv);
        }
      }
    });
    saveState();
    await saveCloudState(state, { throwOnError: true });
    const { data } = await supabaseClient.auth.getSession();
    const token = data?.session?.access_token;
    if (!token) throw new Error('Keine gültige Sitzung. Bitte erneut einloggen.');
    let ok = 0;
    const failed = [];
    for (const ev of editable) {
      try {
        const response = await fetch('/api/send-calendar-invitation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ eventId: ev.id, weekKey: state.currentWeekStart, method: 'REQUEST', message })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Versand fehlgeschlagen');
        ev.invitationUid = result.invitationUid || ev.invitationUid || invitationUidForEvent(ev);
        ev.invitationSequence = Number(result.sequence ?? ev.invitationSequence ?? 0);
        ev.organizerEmail = result.organizerEmail || ev.organizerEmail || null;
        ev.organizerName = result.organizerName || ev.organizerName || null;
        ev.invitationStatus = ev.invitationSentAt ? 'updated' : 'sent';
        ev.invitationSentAt = ev.invitationSentAt || new Date().toISOString();
        ev.invitationUpdatedAt = new Date().toISOString();
        ev.invitationError = null;
        ev.attendees = eventParticipantList(ev).map(att => emails.includes(att.email) ? { ...att, status: 'sent', invitationStatus: 'sent', invitationError: null, invitationSentAt: new Date().toISOString() } : att);
        ev.participants = ev.attendees.map(att => ({ ...att }));
        ok += 1;
      } catch (error) {
        ev.invitationStatus = 'failed';
        ev.invitationError = error.message || String(error);
        failed.push(ev.label || ev.id);
      }
    }
    saveState();
    renderAll();
    setBulkActionStatus(`${ok} erfolgreich gesendet${failed.length ? `, ${failed.length} fehlgeschlagen: ${failed.join(', ')}` : '.'}`, failed.length ? 'error' : 'success');
    if (!failed.length) {
      setBulkSelectionMode(false);
      window.setTimeout(closeBulkActionModal, 900);
    }
  }

  async function applyBulkAction() {
    try {
      if (confirmBulkActionBtn) confirmBulkActionBtn.disabled = true;
      if (bulkActionType === 'invite') await sendBulkInvitations();
      else if (bulkActionType === 'category') applyBulkCategoryChange();
      else if (bulkActionType === 'move') applyBulkMove();
      else if (bulkActionType === 'status') applyBulkStatusChange();
    } catch (error) {
      setBulkActionStatus(error.message || String(error), 'error');
    } finally {
      if (confirmBulkActionBtn) confirmBulkActionBtn.disabled = false;
    }
  }

  async function deleteBulkSelectedEvents() {
    const editable = selectedEditableEvents();
    if (!editable.length) return alert('In der Auswahl gibt es keine löschbaren Termine.');
    const readOnly = selectedReadOnlyEvents().length;
    if (!confirm(`Möchtest du wirklich ${editable.length} ${editable.length === 1 ? 'Termin' : 'Termine'} löschen?${readOnly ? ` ${readOnly} schreibgeschützte Termine bleiben erhalten.` : ''}`)) return;
    const invited = editable.filter(ev => eventParticipantList(ev).length && ev.invitationSentAt);
    if (invited.length) {
      const sendCancel = confirm(`${invited.length} Termine haben bereits versendete Einladungen. OK = Absagen senden und löschen. Abbrechen = nur in meiner App löschen oder im nächsten Dialog abbrechen.`);
      if (!sendCancel && !confirm('Nur in meiner App löschen?')) return;
      if (sendCancel) {
        const previousEditingId = editingId;
        const previousInviteDraftAttendees = inviteDraftAttendees.map(att => ({ ...att }));
        const previousInviteMessage = eventInviteMessage?.value || '';
        for (const ev of invited) {
          editingId = ev.id;
          inviteDraftAttendees = eventParticipantList(ev).map(att => ({ ...att }));
          if (eventInviteMessage) eventInviteMessage.value = ev.inviteMessage || '';
          await sendCalendarInvitationForCurrentEvent('CANCEL');
        }
        editingId = previousEditingId;
        inviteDraftAttendees = previousInviteDraftAttendees;
        if (eventInviteMessage) eventInviteMessage.value = previousInviteMessage;
      }
    }
    const routineLike = editable.filter(ev => ev.source === 'routine' || ev.rrule || ev.recurrenceId || ev.templateEventId);
    if (routineLike.length && !confirm(`${routineLike.length} Routine-/Serientermine werden nur als ausgewählte Instanzen gelöscht. Fortfahren?`)) return;
    const deleteIds = new Set(editable.map(ev => ev.id));
    currentEvents().forEach(ev => {
      if (deleteIds.has(ev.stackedIntoId)) ev.stackedIntoId = null;
      if (deleteIds.has(ev.parentId)) ev.parentId = null;
    });
    setCurrentEvents(currentEvents().filter(ev => !deleteIds.has(ev.id)));
    saveState();
    setBulkSelectionMode(false);
    renderAll();
  }



  function dayCompletionStats(dayIndex) {
  if (!isWeekMode()) return { total: 0, done: 0, missed: 0, open: 0, percent: 0 };

  const habitItems = visibleEvents(currentWeekEvents())
    .filter(ev => ev.day === dayIndex && !isIntegratedChild(ev) && state.categories[ev.categoryId]?.habit)
    .map(ev => syncEventAutoComplete(ev));

  const dayTodos = state.todos
    .map(syncTodoAutoComplete)
    .filter(todo =>
      todo.plannedWeekStart === state.currentWeekStart &&
      Number(todo.plannedDay) === Number(dayIndex) &&
      !todo.plannedEventId
    );

  const eventStats = habitItems.reduce((acc, ev) => {
    const progress = eventProgressStats(ev);
    acc.total += progress.total;
    acc.done += progress.done;
    acc.missed += progress.missed;
    return acc;
  }, { total: 0, done: 0, missed: 0 });

  const todoStats = dayTodos.reduce((acc, todo) => {
    const progress = todoFulfillmentStats(todo);
    acc.total += progress.total;
    acc.done += progress.done;
    acc.missed += progress.missed;
    return acc;
  }, { total: 0, done: 0, missed: 0 });

  const total = eventStats.total + todoStats.total;
  const done = eventStats.done + todoStats.done;
  const missed = eventStats.missed + todoStats.missed;
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




  function isEventDone(ev) {
    return Boolean(ev?.done || ev?.completed);
  }

  function setEventDoneStatus(ev, done) {
    if (!ev) return ev;
    const nextDone = Boolean(done);
    ev.done = nextDone;
    ev.completed = nextDone;
    if (nextDone) ev.missed = false;
    return ev;
  }

  function eventAutoCompleteEnabled(ev) {
    return Boolean(ev?.autoComplete || ev?.autoCompleteFromSubtasks);
  }

  function syncEventAutoComplete(ev, events = currentEvents()) {
    if (!ev) return ev;
    if (!Array.isArray(events)) events = currentEvents();
    if (!Array.isArray(ev.subtasks)) ev.subtasks = [];
    const integratedChildren = integratedEventsForEvent(ev.id, events);
    const autoItems = [
      ...ev.subtasks.map(sub => ({ done: Boolean(sub.done) })),
      ...integratedChildren.map(child => ({ done: isEventDone(child) }))
    ];
    if (eventAutoCompleteEnabled(ev) && autoItems.length) {
      setEventDoneStatus(ev, autoItems.every(item => item.done));
    }
    return ev;
  }

  function syncParentAutoCompleteForChild(child, events = currentEvents()) {
    const parentId = child?.stackedIntoId || child?.parentId;
    if (!parentId) return;
    const parent = events.find(ev => ev.id === parentId);
    if (parent) syncEventAutoComplete(parent, events);
  }

  function cloneEventSubtasks(ev) {
    return Array.isArray(ev?.subtasks) ? ev.subtasks.map(sub => ({
      id: sub.id || id(),
      text: sub.text || 'Untertask',
      done: Boolean(sub.done),
      missed: Boolean(sub.missed),
      createdAt: sub.createdAt || new Date().toISOString()
    })) : [];
  }

  function isTodoDone(todo) {
    syncTodoAutoComplete(todo);
    return Boolean(todo.done || todo.status === 'done');
  }

  function todoFulfillmentStats(todo) {
    if (!todo) return { total: 0, done: 0, missed: 0, open: 0, percent: 0 };
    syncTodoAutoComplete(todo);
    const subItems = Array.isArray(todo.subtasks)
      ? todo.subtasks.map(sub => ({ done: Boolean(sub.done), missed: Boolean(sub.missed) }))
      : [];
    const items = [{ done: isTodoDone(todo), missed: false }, ...subItems];
    const total = items.length;
    const done = items.filter(item => item.done && !item.missed).length;
    const missed = items.filter(item => item.missed && !item.done).length;
    return { total, done, missed, open: Math.max(0, total - done - missed), percent: makePercent(done, total) };
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

  function isoWeeksInYear(year) {
    return getISOWeekInfo(new Date(Number(year), 11, 28)).week;
  }

  function isoWeekStartDate(year, week) {
    const jan4 = new Date(Number(year), 0, 4);
    const monday = weekStartDate(jan4);
    return addDays(monday, (Number(week) - 1) * 7);
  }

  function weekPickerElement() {
    let picker = document.getElementById('weekPickerPopover');
    if (!picker) {
      picker = document.createElement('div');
      picker.id = 'weekPickerPopover';
      picker.className = 'week-picker-popover';
      picker.addEventListener('click', e => e.stopPropagation());
      document.body.appendChild(picker);
    }
    return picker;
  }

  let weekPickerYear = null;

  function renderWeekPicker() {
    const picker = weekPickerElement();
    const selectedInfo = getISOWeekInfo(getSelectedWeekStartDate());
    const todayInfo = getISOWeekInfo(new Date());
    const year = weekPickerYear || selectedInfo.year;
    weekPickerYear = year;
    const total = isoWeeksInYear(year);
    const weekButtons = Array.from({ length: total }, (_, i) => {
      const week = i + 1;
      const isSelected = year === selectedInfo.year && week === selectedInfo.week;
      const isToday = year === todayInfo.year && week === todayInfo.week;
      return `<button type="button" class="week-picker-week ${isSelected ? 'selected' : ''} ${isToday ? 'current' : ''}" data-year="${year}" data-week="${week}">KW ${week}</button>`;
    }).join('');
    picker.innerHTML = `
      <div class="week-picker-head">
        <button type="button" class="week-picker-prev" aria-label="Vorheriges Jahr">‹</button>
        <strong>${year}</strong>
        <button type="button" class="week-picker-next" aria-label="Nächstes Jahr">›</button>
      </div>
      <div class="week-picker-grid">${weekButtons}</div>`;
    picker.querySelector('.week-picker-prev')?.addEventListener('click', () => { weekPickerYear = year - 1; renderWeekPicker(); });
    picker.querySelector('.week-picker-next')?.addEventListener('click', () => { weekPickerYear = year + 1; renderWeekPicker(); });
    picker.querySelectorAll('.week-picker-week').forEach(btn => btn.addEventListener('click', () => {
      state.currentWeekStart = dateKey(isoWeekStartDate(Number(btn.dataset.year), Number(btn.dataset.week)));
      currentWeekEvents();
      closeWeekPicker();
      saveState();
      renderAll();
    }));
  }

  function positionWeekPicker(anchor = null) {
    const picker = weekPickerElement();
    const source = anchor || (isMobileViewport() && mobileWeekSummaryBtn ? mobileWeekSummaryBtn : weekLabel);
    const rect = source.getBoundingClientRect();
    picker.style.position = 'fixed';
    picker.style.width = 'min(360px, calc(100vw - 24px))';
    const left = Math.min(Math.max(12, rect.left), window.innerWidth - 372);
    const top = Math.min(rect.bottom + 8, window.innerHeight - 430);
    picker.style.left = `${Math.max(12, left)}px`;
    picker.style.top = `${Math.max(12, top)}px`;
  }

  function openWeekPicker(event = null) {
    if (event) { event.preventDefault(); event.stopPropagation(); }
    weekPickerYear = getISOWeekInfo(getSelectedWeekStartDate()).year;
    renderWeekPicker();
    positionWeekPicker(event?.currentTarget || null);
    weekPickerElement().classList.add('open');
  }

  function closeWeekPicker() {
    document.getElementById('weekPickerPopover')?.classList.remove('open');
  }

  const specialEventTypeLabels = {
    birthday: 'Geburtstag',
    anniversary: 'Jahrestag',
    jubilee: 'Jubiläum',
    reminder: 'Erinnerung',
    other: 'Sonstiges'
  };

  const specialEventTypeIcons = {
    birthday: '🎉',
    anniversary: '🗓️',
    jubilee: '⚜️',
    reminder: '❗️',
    other: '❓'
  };

  function specialEventTypeIcon(type) {
    return specialEventTypeIcons[type] || specialEventTypeIcons.other;
  }

  function specialEventTypeOptionLabel(type) {
    return `${specialEventTypeIcon(type)} ${specialEventTypeLabels[type] || 'Sonstiges'}`;
  }

  function parseDateParts(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
    if (!match) return null;
    return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  }

  function specialEventOccurrenceDate(event, year) {
    const parts = parseDateParts(event.date);
    if (!parts) return null;
    const occurrenceYear = event.repeatsYearly ? year : parts.year;
    return `${occurrenceYear}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
  }

  function specialEventYears(event, occurrenceDateKey) {
    const originYear = Number(event.year || parseDateParts(event.date)?.year);
    const occurrenceYear = Number(parseDateParts(occurrenceDateKey)?.year);
    const diff = occurrenceYear - originYear;
    return Number.isFinite(diff) && diff > 0 && diff < 150 ? diff : null;
  }

  function specialEventDisplayTitle(event, occurrenceDateKey) {
    const years = specialEventYears(event, occurrenceDateKey);
    const typeLabel = specialEventTypeLabels[event.type] || 'Ereignis';
    const baseTitle = event.type === 'birthday' && event.personName
      ? `Geburtstag von ${event.personName}`
      : event.title;
    const suffix = years ? ` – ${years} Jahre` : '';
    return `${event.type === 'reminder' ? 'Erinnerung: ' : ''}${baseTitle || typeLabel}${suffix}`;
  }

  function specialEventOccurrences(daysAhead = 30) {
    const today = toLocalDate(new Date());
    const start = dateKey(today);
    const end = dateKey(addDays(today, daysAhead));
    const years = [today.getFullYear(), today.getFullYear() + 1];
    return (state.specialEvents || [])
      .flatMap(event => years.map(year => ({ event, date: specialEventOccurrenceDate(event, year) })))
      .filter(item => item.date && item.date >= start && item.date <= end)
      .filter((item, index, list) => list.findIndex(other => other.event.id === item.event.id && other.date === item.date) === index)
      .sort((a, b) => a.date.localeCompare(b.date) || String(a.event.title).localeCompare(String(b.event.title)));
  }

  function specialEventsForDate(targetDateKey) {
    const target = parseDateParts(targetDateKey);
    if (!target) return [];
    return (state.specialEvents || [])
      .map(event => {
        const occurrence = event.repeatsYearly ? specialEventOccurrenceDate(event, target.year) : event.date;
        return { event, date: occurrence };
      })
      .filter(item => item.date === targetDateKey)
      .sort((a, b) => String(a.event.title).localeCompare(String(b.event.title)));
  }

  function zodiacForDate(dateValue) {
    const parts = parseDateParts(dateValue);
    if (!parts) return null;
    const md = (parts.month * 100) + parts.day;
    const signs = [
      { name: 'Steinbock', symbol: '♑', from: 1222, to: 119, wraps: true },
      { name: 'Wassermann', symbol: '♒', from: 120, to: 218 },
      { name: 'Fische', symbol: '♓', from: 219, to: 320 },
      { name: 'Widder', symbol: '♈', from: 321, to: 419 },
      { name: 'Stier', symbol: '♉', from: 420, to: 520 },
      { name: 'Zwillinge', symbol: '♊', from: 521, to: 620 },
      { name: 'Krebs', symbol: '♋', from: 621, to: 722 },
      { name: 'Löwe', symbol: '♌', from: 723, to: 822 },
      { name: 'Jungfrau', symbol: '♍', from: 823, to: 922 },
      { name: 'Waage', symbol: '♎', from: 923, to: 1022 },
      { name: 'Skorpion', symbol: '♏', from: 1023, to: 1121 },
      { name: 'Schütze', symbol: '♐', from: 1122, to: 1221 }
    ];
    const found = signs.find(sign => sign.wraps ? (md >= sign.from || md <= sign.to) : (md >= sign.from && md <= sign.to));
    return found ? `${found.name} ${found.symbol}` : null;
  }

  function daysUntilDate(targetKey) {
    const today = toLocalDate(new Date());
    const target = toLocalDate(targetKey);
    return Math.round((target - today) / (24 * 60 * 60 * 1000));
  }

  function specialEventNextOccurrence(event, fromDate = new Date()) {
    const from = toLocalDate(fromDate);
    const fromKey = dateKey(from);
    const parts = parseDateParts(event.date);
    if (!parts) return null;
    if (!event.repeatsYearly) return event.date >= fromKey ? event.date : null;
    const thisYear = specialEventOccurrenceDate(event, from.getFullYear());
    if (thisYear && thisYear >= fromKey) return thisYear;
    return specialEventOccurrenceDate(event, from.getFullYear() + 1);
  }

  function specialEventListItems(daysAhead = 370) {
    const maxDate = dateKey(addDays(new Date(), daysAhead));
    return (state.specialEvents || [])
      .map(event => ({ event, date: specialEventNextOccurrence(event) }))
      .filter(item => item.date && item.date <= maxDate)
      .map(item => ({ ...item, daysLeft: daysUntilDate(item.date) }))
      .sort((a, b) => a.daysLeft - b.daysLeft || String(a.event.title).localeCompare(String(b.event.title)));
  }

  function specialEventNoticeItems() {
    const todayKey = getTodayInfo().dateKey;
    const seen = new Set((state.specialEventsSeenKeys || []).map(String));
    const notices = [];
    specialEventListItems(370).forEach(({ event, date, daysLeft }) => {
      const reminder = Number(event.reminderDaysBefore);
      if (date === todayKey) notices.push({ key: `event-day:${event.id}:${date}`, event });
      if (Number.isFinite(reminder) && reminder > 0 && daysLeft === reminder) notices.push({ key: `reminder:${event.id}:${date}:${reminder}`, event });
    });
    pendingSpecialSuggestions().forEach(suggestion => notices.push({ key: `suggestion:${suggestion.key}`, suggestion }));
    return notices.filter(item => !seen.has(item.key));
  }

  function markSpecialNoticesSeen() {
    const keys = specialEventNoticeItems().map(item => item.key);
    if (!keys.length) return;
    state.specialEventsSeenKeys = [...new Set([...(state.specialEventsSeenKeys || []), ...keys])].slice(-300);
    saveState();
  }

  function renderSpecialEventsButton() {
    if (!specialEventsBtn) return;
    const count = specialEventNoticeItems().length;
    specialEventsBtn.classList.toggle('has-events', count > 0);
    if (specialEventsBadge) {
      specialEventsBadge.textContent = count ? String(count) : '';
      specialEventsBadge.style.display = count ? '' : 'none';
    }
  }

  function specialEventMetaText(event, date, daysLeft) {
    const years = specialEventYears(event, date);
    const parts = [];
    if (event.type === 'birthday') {
      if (years) parts.push(`wird ${years}`);
      const zodiac = zodiacForDate(event.date);
      if (zodiac) parts.push(zodiac);
    } else if (years) {
      parts.push(`${years} Jahre`);
    }
    const when = daysLeft === 0 ? 'heute' : (daysLeft === 1 ? 'morgen' : `in ${daysLeft} Tagen`);
    return `${specialEventTypeLabels[event.type] || 'Ereignis'} ${when}${parts.length ? ` · ${parts.join(' · ')}` : ''}`;
  }

  function renderSpecialEventList(container, items, emptyText) {
    if (!container) return;
    container.innerHTML = '';
    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'special-events-empty';
      empty.textContent = emptyText;
      container.appendChild(empty);
      return;
    }
    items.forEach(({ event, date, daysLeft }) => {
      const row = document.createElement('div');
      row.className = `special-event-card type-${event.type}`;
      const title = event.type === 'birthday' && event.personName ? event.personName : event.title;
      row.innerHTML = `
        <div class="special-event-card-icon" aria-hidden="true">${escapeHtml(specialEventTypeIcon(event.type))}</div>
        <div>
          <div class="special-event-card-title">${escapeHtml(title)}</div>
          <div class="special-event-card-meta">${escapeHtml(specialEventMetaText(event, date, daysLeft))}</div>
          <div class="special-event-card-date">${escapeHtml(formatLongDate(toLocalDate(date)))}</div>
          ${event.note ? `<div class="special-event-card-note">${escapeHtml(event.note)}</div>` : ''}
          <div class="special-event-card-actions">
            <button class="ghost edit-special-event" type="button" data-event-id="${event.id}">Bearbeiten</button>
            <button class="ghost delete-special-event" type="button" data-event-id="${event.id}">Löschen</button>
          </div>
        </div>`;
      container.appendChild(row);
    });
    container.querySelectorAll('.edit-special-event').forEach(btn => btn.addEventListener('click', e => {
      e.stopPropagation();
      editSpecialEvent(btn.dataset.eventId);
    }));
    container.querySelectorAll('.delete-special-event').forEach(btn => btn.addEventListener('click', e => {
      e.stopPropagation();
      deleteSpecialEvent(btn.dataset.eventId);
    }));
  }

  function specialDatePickerElement() {
    let picker = document.getElementById('specialDatePicker');
    if (!picker) {
      picker = document.createElement('div');
      picker.id = 'specialDatePicker';
      picker.className = 'special-date-picker';
      picker.addEventListener('click', e => e.stopPropagation());
      document.body.appendChild(picker);
    }
    return picker;
  }

  function selectedSpecialDate() {
    return /^\d{4}-\d{2}-\d{2}$/.test(specialEventDate?.value || '')
      ? toLocalDate(specialEventDate.value)
      : toLocalDate(new Date());
  }

  function renderSpecialDatePicker() {
    const picker = specialDatePickerElement();
    const selected = selectedSpecialDate();
    const monthDate = specialDatePickerMonth || new Date(selected.getFullYear(), selected.getMonth(), 1);
    specialDatePickerMonth = monthDate;
    const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
    const firstGridDay = addDays(monthStart, -((monthStart.getDay() + 6) % 7));
    const selectedKey = dateKey(selected);
    const todayKey = dateKey(new Date());
    const monthLabel = monthDate.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
    const daysHtml = Array.from({ length: 42 }, (_, index) => {
      const day = addDays(firstGridDay, index);
      const key = dateKey(day);
      const outside = day.getMonth() !== monthDate.getMonth();
      return `<button type="button" class="special-date-day ${outside ? 'outside' : ''} ${key === selectedKey ? 'selected' : ''} ${key === todayKey ? 'today' : ''}" data-date="${key}">${day.getDate()}</button>`;
    }).join('');
    picker.innerHTML = `
      <div class="special-date-picker-head">
        <button type="button" class="special-date-prev" aria-label="Vorheriger Monat">‹</button>
        <strong>${escapeHtml(monthLabel)}</strong>
        <button type="button" class="special-date-next" aria-label="Nächster Monat">›</button>
      </div>
      <div class="special-date-weekdays">${days.map(day => `<span>${day}</span>`).join('')}</div>
      <div class="special-date-grid">${daysHtml}</div>
      <div class="special-date-picker-actions">
        <button type="button" class="ghost special-date-today">Heute</button>
      </div>`;
    picker.querySelector('.special-date-prev')?.addEventListener('click', () => {
      specialDatePickerMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() - 1, 1);
      renderSpecialDatePicker();
    });
    picker.querySelector('.special-date-next')?.addEventListener('click', () => {
      specialDatePickerMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1);
      renderSpecialDatePicker();
    });
    picker.querySelector('.special-date-today')?.addEventListener('click', () => {
      if (specialEventDate) specialEventDate.value = dateKey(new Date());
      updateSpecialEventZodiacPreview();
      closeSpecialDatePicker();
    });
    picker.querySelectorAll('.special-date-day').forEach(button => {
      button.addEventListener('click', () => {
        if (specialEventDate) specialEventDate.value = button.dataset.date || '';
        updateSpecialEventZodiacPreview();
        closeSpecialDatePicker();
      });
    });
  }

  function positionSpecialDatePicker() {
    const picker = specialDatePickerElement();
    if (!specialEventDate) return;
    const rect = specialEventDate.getBoundingClientRect();
    const isMobile = window.matchMedia('(max-width: 700px)').matches;
    if (isMobile) {
      picker.style.position = 'fixed';
      picker.style.left = '12px';
      picker.style.right = '12px';
      picker.style.top = 'auto';
      picker.style.bottom = '12px';
      picker.style.width = 'auto';
      return;
    }
    picker.style.position = 'fixed';
    picker.style.width = '320px';
    picker.style.right = 'auto';
    picker.style.bottom = 'auto';
    const left = Math.min(Math.max(12, rect.left), window.innerWidth - 332);
    const top = Math.min(rect.bottom + 8, window.innerHeight - 390);
    picker.style.left = `${left}px`;
    picker.style.top = `${Math.max(12, top)}px`;
  }

  function openSpecialDatePicker(event = null) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    const selected = selectedSpecialDate();
    specialDatePickerMonth = new Date(selected.getFullYear(), selected.getMonth(), 1);
    renderSpecialDatePicker();
    positionSpecialDatePicker();
    specialDatePickerElement().classList.add('open');
  }

  function closeSpecialDatePicker() {
    const picker = document.getElementById('specialDatePicker');
    if (picker) picker.classList.remove('open');
  }

  function pendingSpecialSuggestions() {
    return (state.specialEventSuggestions || []).filter(item => item.status === 'pending');
  }

  function renderSpecialEventSuggestions() {
    if (!specialEventSuggestionsList) return;
    specialEventSuggestionsList.innerHTML = '';
    const suggestions = pendingSpecialSuggestions();
    if (!suggestions.length) {
      const empty = document.createElement('div');
      empty.className = 'special-events-empty';
      empty.textContent = 'Keine neuen Vorschläge aus externen Kalendern.';
      specialEventSuggestionsList.appendChild(empty);
      return;
    }
    suggestions.forEach(suggestion => {
      const card = document.createElement('div');
      card.className = 'special-suggestion-card';
      card.dataset.suggestionId = suggestion.id;
      card.innerHTML = `
        <div class="special-suggestion-main">
          <div class="special-event-card-title"><span class="special-event-title-icon" aria-hidden="true">${escapeHtml(specialEventTypeIcon(suggestion.suggestedType || 'other'))}</span>${escapeHtml(suggestion.title)}</div>
          <div class="special-event-card-meta">${escapeHtml(suggestion.recurrenceFrequency || 'Serie')} · ${formatShortDate(toLocalDate(suggestion.date))} · ${escapeHtml(suggestion.sourceId || 'Externer Kalender')}</div>
          <div class="special-suggestion-note">Dieses wiederkehrende Ereignis wurde im externen Kalender erkannt.</div>
        </div>
        <select class="special-suggestion-type" title="Typ wählen">
          ${Object.keys(specialEventTypeLabels).map(value => `<option value="${value}" ${suggestion.suggestedType === value ? 'selected' : ''}>${specialEventTypeOptionLabel(value)}</option>`).join('')}
        </select>
        <div class="special-suggestion-actions">
          <button class="primary accept-special-suggestion" type="button">Übernehmen</button>
          <button class="ghost later-special-suggestion" type="button">Später</button>
          <button class="ghost ignore-special-suggestion" type="button">Nicht mehr vorschlagen</button>
        </div>`;
      specialEventSuggestionsList.appendChild(card);
    });
    specialEventSuggestionsList.querySelectorAll('.special-suggestion-card').forEach(card => {
      const suggestion = state.specialEventSuggestions.find(item => item.id === card.dataset.suggestionId);
      if (!suggestion) return;
      card.querySelector('.special-suggestion-type')?.addEventListener('change', e => {
        suggestion.suggestedType = e.target.value;
        suggestion.updatedAt = new Date().toISOString();
        const titleIcon = card.querySelector('.special-event-title-icon');
        if (titleIcon) titleIcon.textContent = specialEventTypeIcon(suggestion.suggestedType);
        saveState();
      });
      card.querySelector('.accept-special-suggestion')?.addEventListener('click', () => acceptSpecialSuggestion(suggestion.id));
      card.querySelector('.later-special-suggestion')?.addEventListener('click', () => {
        renderSpecialEventsModal();
      });
      card.querySelector('.ignore-special-suggestion')?.addEventListener('click', () => updateSpecialSuggestionStatus(suggestion.id, 'ignored'));
    });
  }

  function updateSpecialSuggestionStatus(suggestionId, status) {
    const suggestion = (state.specialEventSuggestions || []).find(item => item.id === suggestionId);
    if (!suggestion) return;
    suggestion.status = status;
    suggestion.updatedAt = new Date().toISOString();
    saveState();
    renderSpecialEventsModal();
  }

  function showSpecialEventOverview() {
    closeSpecialDatePicker();
    if (specialEventFormBackdrop) specialEventFormBackdrop.style.display = 'none';
    if (specialEventForm) specialEventForm.style.display = 'none';
  }

  function showSpecialEventForm() {
    if (specialEventFormTitle) {
      const isSuggestion = String(editingSpecialEventId || '').startsWith('suggestion:');
      specialEventFormTitle.textContent = editingSpecialEventId
        ? (isSuggestion ? 'Ereignis übernehmen' : 'Besonderes Ereignis bearbeiten')
        : 'Besonderes Ereignis hinzufügen';
    }
    if (specialEventForm) specialEventForm.style.display = '';
    if (specialEventFormBackdrop) specialEventFormBackdrop.style.display = 'flex';
    updateSpecialEventZodiacPreview();
    setTimeout(() => specialEventTitle?.focus(), 50);
  }

  function acceptSpecialSuggestion(suggestionId) {
    const suggestion = (state.specialEventSuggestions || []).find(item => item.id === suggestionId);
    if (!suggestion) return;
    resetSpecialEventForm();
    editingSpecialEventId = `suggestion:${suggestion.id}`;
    if (specialEventType) specialEventType.value = suggestion.suggestedType || 'other';
    if (specialEventTitle) specialEventTitle.value = suggestion.title || '';
    if (specialEventDate) specialEventDate.value = suggestion.date || getTodayInfo().dateKey;
    if (specialEventYear) specialEventYear.value = parseDateParts(suggestion.date)?.year || '';
    if (specialEventRepeats) specialEventRepeats.checked = true;
    if (specialEventNote) specialEventNote.value = 'Aus externem Kalender übernommen.';
    showSpecialEventForm();
  }

  function filteredSpecialEventItems() {
    const typeFilter = state.specialEventTypeFilter || 'all';
    const rangeFilter = state.specialEventRangeFilter || 'all';
    if (specialEventFocusDate) {
      return specialEventsForDate(specialEventFocusDate)
        .map(item => ({ ...item, daysLeft: daysUntilDate(item.date) }))
        .filter(item => typeFilter === 'all' || item.event.type === typeFilter);
    }
    return specialEventListItems(370)
      .filter(item => typeFilter === 'all' || item.event.type === typeFilter)
      .filter(item => {
        if (rangeFilter === 'all') return true;
        if (rangeFilter === 'today') return item.daysLeft === 0;
        return item.daysLeft >= 0 && item.daysLeft <= Number(rangeFilter);
      });
  }

  function renderSpecialEventsModal() {
    if (specialEventRangeFilter) specialEventRangeFilter.disabled = Boolean(specialEventFocusDate);
    if (specialEventTypeFilter) specialEventTypeFilter.value = state.specialEventTypeFilter || 'all';
    if (specialEventRangeFilter) specialEventRangeFilter.value = state.specialEventRangeFilter || 'all';
    renderSpecialEventList(specialEventsList, filteredSpecialEventItems(), 'Keine besonderen Ereignisse im gewählten Filter.');
    renderSpecialEventSuggestions();
    renderSpecialEventsButton();
  }

  function renderSpecialEventsDrawer() {
    const isOpen = Boolean(state.specialEventsDrawerOpen);
    document.body.classList.toggle('special-events-drawer-open', isOpen);
    if (specialEventsBtn) {
      specialEventsBtn.classList.toggle('active', isOpen);
      specialEventsBtn.setAttribute('aria-expanded', String(isOpen));
    }
    if (specialEventsDrawer) specialEventsDrawer.setAttribute('aria-hidden', String(!isOpen));
    if (isOpen) {
      if (weekSettings) weekSettings.classList.remove('open');
      if (profileMenu) profileMenu.classList.remove('open');
      if (drawerHabitPanel) drawerHabitPanel.classList.remove('filter-open');
      state.todoDrawerOpen = false;
      document.body.classList.remove('todo-drawer-open');
      todoDrawerToggleBtn?.classList.remove('active');
      todoDrawerToggleBtn?.setAttribute('aria-expanded', 'false');
    }
    if (specialEventsSummary) {
      const todayCount = specialEventsForDate(getTodayInfo().dateKey).length;
      const upcoming = specialEventListItems(30);
      const next = upcoming[0];
      specialEventsSummary.textContent = todayCount
        ? `${todayCount} heute · ${upcoming.length} in den nächsten 30 Tagen`
        : (next ? `Nächstes Ereignis in ${Math.max(0, next.daysLeft)} Tagen` : 'Geburtstage, Jahrestage und Erinnerungen');
    }
  }

  function openSpecialEventsModal() {
    specialEventFocusDate = null;
    closeAllPopovers();
    showSpecialEventOverview();
    state.todoDrawerOpen = false;
    state.specialEventsDrawerOpen = true;
    renderTodoDrawer();
    renderSpecialEventsModal();
    renderSpecialEventsDrawer();
    markSpecialNoticesSeen();
    saveState();
    renderSpecialEventsButton();
  }

  function closeSpecialEventsModal() {
    closeSpecialDatePicker();
    showSpecialEventOverview();
    state.specialEventsDrawerOpen = false;
    saveState();
    renderSpecialEventsDrawer();
  }

  function resetSpecialEventForm() {
    editingSpecialEventId = null;
    if (specialEventType) specialEventType.value = 'birthday';
    if (specialEventTitle) specialEventTitle.value = '';
    if (specialEventDate) specialEventDate.value = getTodayInfo().dateKey;
    if (specialEventYear) specialEventYear.value = '';
    if (specialEventRepeats) specialEventRepeats.checked = true;
    if (specialEventReminderDays) specialEventReminderDays.value = '';
    if (specialEventNote) specialEventNote.value = '';
    updateSpecialEventZodiacPreview();
  }


  function updateSpecialEventZodiacPreview() {
    if (!specialEventZodiacPreview) return;
    const show = specialEventType?.value === 'birthday';
    const zodiac = show ? zodiacForDate(specialEventDate?.value || '') : null;
    specialEventZodiacPreview.textContent = zodiac ? zodiac : '';
    specialEventZodiacPreview.style.display = zodiac ? '' : 'none';
  }

  function editSpecialEvent(eventId) {
    const item = (state.specialEvents || []).find(event => event.id === eventId);
    if (!item) return;
    editingSpecialEventId = item.id;
    if (specialEventType) specialEventType.value = item.type || 'other';
    if (specialEventTitle) specialEventTitle.value = item.personName || item.title || '';
    if (specialEventDate) specialEventDate.value = item.date || getTodayInfo().dateKey;
    if (specialEventYear) specialEventYear.value = item.year || '';
    if (specialEventRepeats) specialEventRepeats.checked = item.repeatsYearly !== false;
    if (specialEventReminderDays) specialEventReminderDays.value = item.reminderDaysBefore ?? '';
    if (specialEventNote) specialEventNote.value = item.note || '';
    showSpecialEventForm();
  }

  function deleteSpecialEvent(eventId) {
    const item = (state.specialEvents || []).find(event => event.id === eventId);
    if (!item) return;
    if (!confirm(`Besonderes Ereignis „${item.title}“ löschen?`)) return;
    state.specialEvents = (state.specialEvents || []).filter(event => event.id !== eventId);
    saveState();
    renderAll();
    renderSpecialEventsModal();
  }

  function saveSpecialEventFromForm(event) {
    event.preventDefault();
    const title = (specialEventTitle?.value || '').trim();
    const type = specialEventType?.value || 'other';
    const date = specialEventDate?.value || '';
    if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    const yearValue = Number(specialEventYear?.value);
    const now = new Date().toISOString();
    const suggestionId = String(editingSpecialEventId || '').startsWith('suggestion:') ? String(editingSpecialEventId).slice('suggestion:'.length) : null;
    const sourceSuggestion = suggestionId ? (state.specialEventSuggestions || []).find(item => item.id === suggestionId) : null;
    const existing = editingSpecialEventId && !suggestionId ? (state.specialEvents || []).find(item => item.id === editingSpecialEventId) : null;
    const nextEvent = {
      ...(existing || {}),
      id: existing?.id || `special-event-${id()}`,
      title: type === 'birthday' && !/^geburtstag/i.test(title) ? `Geburtstag von ${title}` : title,
      type,
      date,
      year: Number.isInteger(yearValue) && yearValue > 0 ? yearValue : parseDateParts(date)?.year || null,
      repeatsYearly: Boolean(specialEventRepeats?.checked),
      personName: type === 'birthday' ? title : '',
      note: specialEventNote?.value || '',
      reminderDaysBefore: specialEventReminderDays?.value === '' ? null : clamp(Number(specialEventReminderDays?.value), 0, 365),
      externalSourceKey: existing?.externalSourceKey || sourceSuggestion?.sourceKey || sourceSuggestion?.key || null,
      externalUid: existing?.externalUid || sourceSuggestion?.externalUid || null,
      createdAt: existing?.createdAt || now,
      updatedAt: now
    };
    state.specialEvents = existing
      ? (state.specialEvents || []).map(item => item.id === existing.id ? nextEvent : item)
      : [...(state.specialEvents || []), nextEvent];
    if (sourceSuggestion) {
      sourceSuggestion.status = 'accepted';
      sourceSuggestion.updatedAt = now;
      removeImportedSeriesBySourceKey(sourceSuggestion.sourceKey, sourceSuggestion.externalUid);
    }
    saveState();
    resetSpecialEventForm();
    editingSpecialEventId = null;
    showSpecialEventOverview();
    renderSpecialEventsModal();
    renderSpecialEventsDrawer();
    renderCalendar();
  }

  function changeWeek(offset) {
    const next = addDays(getSelectedWeekStartDate(), offset * 7);
    state.currentWeekStart = clampWeekKey(next);
    state.mobileCalendarStartDay = null;
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

  function integratedEventsForEvent(eventId, events = currentEvents()) {
    if (!eventId) return [];
    return events
      .filter(ev => !isEventLocallyHidden(ev) && (ev.stackedIntoId === eventId || ev.parentId === eventId))
      .sort((a, b) => a.start - b.start || a.end - b.end || String(a.createdAt).localeCompare(String(b.createdAt)));
  }

  function isIntegratedChild(ev) {
    return Boolean(ev?.stackedIntoId || ev?.parentId);
  }

  function hasScheduledTime(ev) {
    const start = Number(ev?.start);
    const end = Number(ev?.end);
    return !ev?.allDay && Number.isFinite(start) && Number.isFinite(end) && end > start;
  }

  function scheduledIntegratedEventsForEvent(parent) {
    if (!parent || !hasScheduledTime(parent)) return [];
    return integratedEventsForEvent(parent.id)
      .filter(child =>
        hasScheduledTime(child) &&
        Number(child.day) === Number(parent.day) &&
        Number(child.start) >= Number(parent.start) &&
        Number(child.end) <= Number(parent.end)
      );
  }

  function layoutEmbeddedChildren(children) {
    const laidOut = [];
    const groups = [];
    let group = [];
    let groupEnd = -1;
    [...children].sort((a, b) => Number(a.start) - Number(b.start) || Number(a.end) - Number(b.end))
      .forEach(child => {
        if (!group.length || Number(child.start) < groupEnd) {
          group.push(child);
          groupEnd = Math.max(groupEnd, Number(child.end));
        } else {
          groups.push(group);
          group = [child];
          groupEnd = Number(child.end);
        }
      });
    if (group.length) groups.push(group);

    groups.forEach(items => {
      const lanes = [];
      items.forEach(child => {
        let lane = lanes.findIndex(end => end <= Number(child.start));
        if (lane === -1) {
          lane = lanes.length;
          lanes.push(Number(child.end));
        } else {
          lanes[lane] = Number(child.end);
        }
        laidOut.push({ ...child, _embeddedLane: lane, _embeddedLaneCount: lanes.length });
      });
      const laneCount = Math.max(1, lanes.length);
      laidOut.slice(-items.length).forEach(child => { child._embeddedLaneCount = laneCount; });
    });

    return laidOut;
  }

  function blockFulfillmentStats(ev, subtasksOverride = null, events = currentEvents()) {
    const parentItems = ev ? [{ done: isEventDone(ev), missed: Boolean(ev.missed) }] : [];
    const sourceSubtasks = Array.isArray(subtasksOverride) ? subtasksOverride : ev?.subtasks;
    const subItems = Array.isArray(sourceSubtasks)
      ? sourceSubtasks.map(sub => ({ done: Boolean(sub.done), missed: Boolean(sub.missed) }))
      : [];
    const childItems = integratedEventsForEvent(ev?.id, events)
      .map(child => ({ done: isEventDone(child), missed: Boolean(child.missed) }));
    const containedTotal = subItems.length + childItems.length;
    const items = [...parentItems, ...subItems, ...childItems];
    const total = items.length;
    const done = items.filter(item => item.done && !item.missed).length;
    const missed = items.filter(item => item.missed && !item.done).length;
    return {
      total,
      done,
      missed,
      containedTotal,
      open: Math.max(0, total - done - missed),
      score: total ? done / total : (isEventDone(ev) && !ev?.missed ? 1 : 0),
      percent: total ? makePercent(done, total) : (isEventDone(ev) && !ev?.missed ? 100 : 0)
    };
  }

  function eventProgressStats(ev, events = currentEvents()) {
    return blockFulfillmentStats(ev, null, events);
  }

  function eventTrackingScore(ev) {
    return eventProgressStats(ev).score;
  }

  function eventTrackingWeight(ev, events = currentEvents()) {
    const progress = eventProgressStats(ev, events);
    return {
      totalWeight: progress.total,
      doneWeight: progress.done,
      missedWeight: progress.missed,
      score: progress.score
    };
  }

  function formatScore(value) {
    return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, '');
  }

  function parentBlockCandidates(day, start, end, ownId = null) {
    return visibleEvents()
      .filter(ev =>
        ev.id !== ownId &&
        !isIntegratedChild(ev) &&
        ev.day === day &&
        ev.start <= start &&
        ev.end >= end
      )
      .sort((a, b) => a.start - b.start || b.end - a.end);
  }

  function fillModalStackedIntoSelect(ev = null, { preserveSelection = true } = {}) {
    if (!modalStackedInto) return;
    const day = Number(modalDay.value);
    const start = Number(modalStart.value);
    const end = Number(modalEnd.value);
    const selectedParentId = preserveSelection
      ? (modalStackedInto.value || ev?.stackedIntoId || ev?.parentId || '')
      : (ev?.stackedIntoId || ev?.parentId || '');
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
    const ev = eventId ? currentEvents().find(item => item.id === eventId) : null;
    const children = integratedEventsForEvent(eventId);
    const subtasks = eventId === editingId ? eventDraftSubtasks : cloneEventSubtasks(ev);
    const progress = blockFulfillmentStats(ev, subtasks);
    if (!eventId || !ev || !progress.containedTotal) {
      modalIntegratedEvents.innerHTML = '';
      modalIntegratedEvents.style.display = 'none';
      return;
    }
    modalIntegratedEvents.style.display = '';
    modalIntegratedEvents.innerHTML = `
      <button type="button" class="event-integrated-list-title" aria-expanded="${modalBlockTasksExpanded ? 'true' : 'false'}">
        <span>Aufgaben im Block</span>
        <strong>${progress.done}/${progress.total} · ${progress.percent}%</strong>
        <span class="event-integrated-chevron">${modalBlockTasksExpanded ? '⌃' : '⌄'}</span>
      </button>
      <div class="event-integrated-rows" ${modalBlockTasksExpanded ? '' : 'hidden'}>
        ${subtasks.map(sub => `
          <div class="event-integrated-row ${sub.done ? 'done' : ''}" data-subtask-id="${sub.id}">
            <input class="event-integrated-check" type="checkbox" ${sub.done ? 'checked' : ''} title="Erledigt" />
            <span>Ohne Zeit</span>
            <strong>${escapeHtml(sub.text)}</strong>
          </div>`).join('')}
        ${children.map(child => `
          <div class="event-integrated-row ${isEventDone(child) ? 'done' : ''} ${child.missed ? 'missed' : ''}" data-event-id="${child.id}">
            <input class="event-integrated-check" type="checkbox" ${isEventDone(child) ? 'checked' : ''} title="Erledigt" />
            <span>${hasScheduledTime(child) ? escapeHtml(eventTime(child)) : 'Ohne Zeit'}</span>
            <strong>${escapeHtml(child.label)}</strong>
            <button type="button" class="event-integrated-missed ${child.missed ? 'active' : ''}" title="Nicht eingehalten">!</button>
          </div>`).join('')}
      </div>`;
    modalIntegratedEvents.querySelector('.event-integrated-list-title')?.addEventListener('click', e => {
      e.preventDefault();
      modalBlockTasksExpanded = !modalBlockTasksExpanded;
      renderModalIntegratedEvents(eventId);
    });
    modalIntegratedEvents.querySelectorAll('[data-subtask-id]').forEach(row => {
      const sub = eventDraftSubtasks.find(item => item.id === row.dataset.subtaskId);
      const check = row.querySelector('.event-integrated-check');
      if (!sub || !check) return;
      check.addEventListener('click', e => e.stopPropagation());
      check.addEventListener('change', e => {
        e.stopPropagation();
        sub.done = Boolean(e.target.checked);
        const sourceEvent = currentEvents().find(item => item.id === eventId);
        const sourceSub = sourceEvent?.subtasks?.find(item => item.id === sub.id);
        if (sourceSub) {
          sourceSub.done = sub.done;
          if (sourceSub.done) sourceSub.missed = false;
          syncEventAutoComplete(sourceEvent);
          syncParentAutoCompleteForChild(sourceEvent);
          saveState();
          renderAll();
        }
        renderEventDraftSubtasks();
        renderModalIntegratedEvents(eventId);
      });
    });
    modalIntegratedEvents.querySelectorAll('.event-integrated-row').forEach(row => {
      if (!row.dataset.eventId) return;
      row.addEventListener('click', e => {
        e.preventDefault();
        openEditor(row.dataset.eventId);
      });
      const check = row.querySelector('.event-integrated-check');
      if (check) {
        check.addEventListener('click', e => e.stopPropagation());
        check.addEventListener('change', e => {
          e.stopPropagation();
          toggleDone(row.dataset.eventId, e.target.checked);
          renderModalIntegratedEvents(eventId);
        });
      }
      const missed = row.querySelector('.event-integrated-missed');
      if (missed) {
        missed.addEventListener('click', e => {
          e.preventDefault();
          e.stopPropagation();
          toggleMissed(row.dataset.eventId);
          renderModalIntegratedEvents(eventId);
        });
      }
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

    const addPill = document.createElement('button');
    addPill.type = 'button';
    addPill.className = 'pill add-category-pill';
    addPill.title = 'Neue Kategorie erstellen';
    addPill.textContent = '+';
    addPill.onclick = () => openCategoryEditor(null);
    legend.appendChild(addPill);
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


  function isMobileViewport() {
    return window.matchMedia('(max-width: 768px)').matches;
  }

  function mobileVisibleDayCount() {
    return window.matchMedia('(max-width: 349px)').matches ? 2 : 3;
  }

  function mobileCalendarStartDay() {
    const count = mobileVisibleDayCount();
    const maxStart = 7 - count;
    const today = getTodayInfo();
    let start = Number.isInteger(Number(state.mobileCalendarStartDay)) ? Number(state.mobileCalendarStartDay) : null;
    if (start === null) {
      start = state.currentWeekStart === today.weekKey ? today.dayIndex - Math.floor(count / 2) : 0;
    }
    start = clamp(start, 0, maxStart);
    state.mobileCalendarStartDay = start;
    return start;
  }

  function visibleCalendarDayIndexes() {
    if (!isMobileViewport() || !isWeekMode() || state.viewMode === 'tasks') return days.map((_, index) => index);
    const count = mobileVisibleDayCount();
    const start = mobileCalendarStartDay();
    return Array.from({ length: count }, (_, index) => start + index);
  }

  function shiftMobileCalendarDays(delta) {
    if (!isMobileViewport() || !isWeekMode() || state.viewMode === 'tasks' || isDragging) return;
    const count = mobileVisibleDayCount();
    const maxStart = 7 - count;
    let next = mobileCalendarStartDay() + delta;
    if (next < 0) {
      const previousWeek = addDays(getSelectedWeekStartDate(), -7);
      state.currentWeekStart = clampWeekKey(previousWeek);
      state.mobileCalendarStartDay = maxStart;
    } else if (next > maxStart) {
      const nextWeek = addDays(getSelectedWeekStartDate(), 7);
      state.currentWeekStart = clampWeekKey(nextWeek);
      state.mobileCalendarStartDay = 0;
    } else {
      state.mobileCalendarStartDay = next;
    }
    currentWeekEvents();
    saveState();
    renderAll();
  }

  function formatMobileWeekSummary() {
    const start = getSelectedWeekStartDate();
    const visible = visibleCalendarDayIndexes();
    const firstVisibleDate = getDayDate(visible[0] || 0);
    const info = getISOWeekInfo(start);
    const month = firstVisibleDate.toLocaleDateString('de-DE', { month: 'short' }).replace('.', '');
    return `${month} · KW ${info.week}`;
  }

  function renderMobileControls() {
    document.body.classList.toggle('mobile-controls-open', Boolean(state.mobileControlsOpen));
    if (mobileControlsToggleBtn) mobileControlsToggleBtn.setAttribute('aria-expanded', String(Boolean(state.mobileControlsOpen)));
    if (mobileControlsChevron) mobileControlsChevron.textContent = state.mobileControlsOpen ? '⌃' : '⌄';
    if (mobileWeekSummaryBtn) mobileWeekSummaryBtn.textContent = formatMobileWeekSummary();
    if (mobileControlsStatus) {
      const view = state.plannerMode === 'tracking' ? 'Tracking' : (state.plannerMode === 'template' ? 'Routine' : 'Kalender');
      mobileControlsStatus.textContent = `${view} · ${formatMobileWeekSummary()}`;
    }
  }

  function renderCalendar() {
    calendar.innerHTML = '';
    const today = getTodayInfo();
    const visibleDays = visibleCalendarDayIndexes();
    calendar.classList.toggle('mobile-calendar-grid', isMobileViewport() && isWeekMode() && state.viewMode !== 'tasks');
    calendar.style.setProperty('--visible-days', String(visibleDays.length));
    calendar.appendChild(headerCell('', 1));
    visibleDays.forEach((dayIndex, visibleIndex) => calendar.appendChild(headerCell(days[dayIndex], visibleIndex + 2, dayIndex)));

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

    visibleDays.forEach((d, visibleIndex) => {
      const gridColumn = String(visibleIndex + 2);
      const allDayCell = document.createElement('div');
      allDayCell.className = 'all-day-cell all-day-day';
      allDayCell.classList.toggle('expanded', state.openHeaderTodoDay === d);
      allDayCell.style.gridColumn = gridColumn;
      allDayCell.dataset.day = d;
      allDayCell.title = `${days[d]} ${formatShortDate(getDayDate(d))} · Tages-To-do ohne Uhrzeit erstellen`;
      allDayCell.addEventListener('click', () => openDayTodoModalForDay(d));
      renderAllDayTodosForDay(allDayCell, d);
      calendar.appendChild(allDayCell);

      const col = document.createElement('div');
      const dayDateKey = dateKey(getDayDate(d));
      col.className = `day-column ${isWeekMode() && dayDateKey === today.dateKey ? 'today' : ''}`;
      col.style.gridColumn = gridColumn;
      col.dataset.day = d;
      setupEventDayDropTarget(col, d);

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

      const rawDayEvents = currentEvents().filter(ev => Number(ev.day) === Number(d));
      rawDayEvents.filter(icsSyncDebugMatches).forEach(event => {
        const hidden = isEventLocallyHidden(event);
        const child = isIntegratedChild(event);
        const allDay = Boolean(event.allDay);
        const included = !hidden && !child && !allDay;
        const exclusionReason = hidden ? 'localOverrides.hidden' : (child ? 'integrated child parentId/stackedIntoId' : (allDay ? 'all-day header event' : null));
        console.log('[ICS SYNC DEBUG] visibility', {
          id: event.id,
          uid: event.uid || event.sourceUid || event.externalUid || null,
          title: event.title || event.label,
          source: event.source,
          importSource: event.importSource,
          date: event.date,
          day: event.day,
          renderedDay: d,
          stackedIntoId: event.stackedIntoId || null,
          parentId: event.parentId || null,
          hidden: event.localOverrides?.hidden || false,
          visibleDateRange: { weekStart: state.currentWeekStart, dayDate: dayDateKey },
          included,
          exclusionReason
        });
        console.log('[ICS SYNC DEBUG] visibility-json', JSON.stringify({
          id: event.id,
          uid: event.uid || event.sourceUid || event.externalUid || null,
          title: event.title || event.label,
          source: event.source,
          importSource: event.importSource,
          date: event.date,
          day: event.day,
          renderedDay: d,
          start: event.start,
          end: event.end,
          startTime: event.startTime || null,
          endTime: event.endTime || null,
          hidden: event.hidden || false,
          localHidden: event.localOverrides?.hidden || false,
          stackedIntoId: event.stackedIntoId || null,
          parentId: event.parentId || null,
          isSubtask: event.isSubtask || false,
          visibleDateRange: { weekStart: state.currentWeekStart, dayDate: dayDateKey },
          included,
          exclusionReason
        }, null, 2));
      });
      const events = visibleEvents().filter(ev => ev.day === d && !isIntegratedChild(ev) && !ev.allDay);
      layoutDayEvents(events).forEach(ev => {
        const element = eventEl(ev);
        col.appendChild(element);
        if (icsSyncDebugMatches(ev)) {
          const computed = window.getComputedStyle(element);
          const startMinutes = Number(ev.start) * 15;
          const endMinutes = Number(ev.end) * 15;
          console.log('[ICS SYNC DEBUG] block-render-json', JSON.stringify({
            id: ev.id,
            title: ev.title || ev.label,
            rendered: Boolean(element),
            dayKey: dayDateKey,
            renderedDay: d,
            eventDay: ev.day,
            startSlot: ev.start,
            endSlot: ev.end,
            startMinutes,
            endMinutes,
            durationMinutes: endMinutes - startMinutes,
            top: element?.style?.top || null,
            height: element?.style?.height || null,
            computedDisplay: computed.display,
            computedVisibility: computed.visibility,
            computedOpacity: computed.opacity,
            computedZIndex: computed.zIndex,
            className: element?.className || null,
            parentAttached: Boolean(element?.parentElement),
            parentClassName: element?.parentElement?.className || null
          }, null, 2));
        }
      });
      renderCurrentTimeLine(col, d, today);
      calendar.appendChild(col);
    });
    autoScrollCalendarToMorning();
    renderBulkActionBar();
  }

  function allDayTodosForDay(dayIndex) {
    if (!isWeekMode()) return [];
    return state.todos
      .map(syncTodoAutoComplete)
      .filter(todo => todo.plannedWeekStart === state.currentWeekStart && Number(todo.plannedDay) === Number(dayIndex) && !todo.plannedEventId);
  }

  function allDayEventsForDay(dayIndex) {
    if (!isWeekMode()) return [];
    return currentEvents()
      .filter(ev => ev.allDay && Number(ev.day) === Number(dayIndex) && !isIntegratedChild(ev) && !isEventLocallyHidden(ev));
  }

  function renderAllDayTodosForDay(cell, dayIndex) {
    const todos = allDayTodosForDay(dayIndex)
      .sort((a, b) => Number(isTodoDone(a)) - Number(isTodoDone(b)) || String(a.createdAt).localeCompare(String(b.createdAt)));
    const allDayEvents = allDayEventsForDay(dayIndex)
      .sort((a, b) => String(a.label).localeCompare(String(b.label)));
    currentEvents().filter(ev => Number(ev.day) === Number(dayIndex) && Boolean(ev.allDay) && icsSyncDebugMatches(ev)).forEach(event => {
      const hidden = isEventLocallyHidden(event);
      const child = isIntegratedChild(event);
      console.log('[ICS SYNC DEBUG] visibility', {
        id: event.id,
        uid: event.uid || event.sourceUid || event.externalUid || null,
        title: event.title || event.label,
        source: event.source,
        importSource: event.importSource,
        date: event.date,
        day: event.day,
        renderedDay: dayIndex,
        stackedIntoId: event.stackedIntoId || null,
        parentId: event.parentId || null,
        hidden: event.localOverrides?.hidden || false,
        visibleDateRange: { weekStart: state.currentWeekStart, dayDate: dateKey(getDayDate(dayIndex)) },
        included: !hidden && !child,
        exclusionReason: hidden ? 'localOverrides.hidden' : (child ? 'integrated child parentId/stackedIntoId' : null)
      });
    });
    const specialItems = specialEventsForDate(dateKey(getDayDate(dayIndex)));
    const headerItems = [
      ...specialItems.map(item => ({ type: 'special', item })),
      ...allDayEvents.map(event => ({ type: 'event', event })),
      ...todos.map(todo => ({ type: 'todo', todo }))
    ];
    const visible = headerItems.slice(0, 2);
    const isExpanded = state.openHeaderTodoDay === dayIndex;

    if (!isExpanded) {
      visible.forEach(headerItem => {
        if (headerItem.type === 'special') {
          const { event, date } = headerItem.item;
          const item = document.createElement('div');
          item.className = 'all-day-item special-all-day-item';
          item.title = specialEventDisplayTitle(event, date);
          item.innerHTML = `<span class="all-day-text">☝🏼 ${escapeHtml(specialEventDisplayTitle(event, date))}</span>`;
          item.addEventListener('click', e => {
            e.preventDefault();
            e.stopPropagation();
            openSpecialEventsModal();
          });
          cell.appendChild(item);
          return;
        }

        if (headerItem.type === 'event') {
          const ev = headerItem.event;
          const cat = state.categories[ev.categoryId] || state.categories.external || state.categories.orga;
          const item = document.createElement('div');
          item.className = 'all-day-item all-day-event';
          item.style.borderLeftColor = cat.color;
          item.title = `${ev.label} · Ganztag`;
          item.innerHTML = `<span class="all-day-text">Ganztag · ${escapeHtml(ev.label)}</span>`;
          item.addEventListener('click', e => {
            e.preventDefault();
            e.stopPropagation();
            openHeaderTodosForDay(dayIndex);
          });
          cell.appendChild(item);
          return;
        }

        const todo = headerItem.todo;
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

      if (headerItems.length > visible.length) {
        const more = document.createElement('div');
        more.className = 'all-day-more';
        more.textContent = `+${headerItems.length - visible.length} mehr`;
        more.addEventListener('click', e => openHeaderTodosForDay(dayIndex, e));
        cell.appendChild(more);
      }
    }

    if (isExpanded) renderAllDayTodoPopover(cell, dayIndex, todos, allDayEvents, specialItems);
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
    if (state.openHeaderTodoDay === null || state.openHeaderTodoDay === undefined) return;
    state.openHeaderTodoDay = null;
    saveState();
    renderAll();
  }

  function openTodoPlannerForDay(dayIndex, event = null) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (weekSettings) weekSettings.classList.remove('open');
    if (profileMenu) profileMenu.classList.remove('open');
    if (drawerHabitPanel) drawerHabitPanel.classList.remove('filter-open');
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
      const specialCount = specialEventsForDate(dateKey(getDayDate(dayIndex))).length;
      const specialIcon = specialCount ? `<button type="button" class="day-special-indicator" data-day="${dayIndex}" title="Besondere Ereignisse an diesem Tag">☝🏼${specialCount > 1 ? ` ${specialCount}` : ''}</button>` : '';
      div.innerHTML = `
        <div class="day-head-main"><span>${text}</span><span class="day-date">${formatShortDate(getDayDate(dayIndex))}${isToday ? ' · Heute' : ''}</span>${specialIcon}</div>
        <div class="day-progress-wrap" title="${stats.done}/${stats.total} erledigt">
          <div class="day-progress-track"><div class="day-progress-fill ${colorClass}" style="width:${stats.percent}%"></div></div>
          <div class="day-progress-meta">${progressLabel}</div>
        </div>`;
      div.querySelector('.day-special-indicator')?.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        specialEventFocusDate = dateKey(getDayDate(dayIndex));
        state.specialEventRangeFilter = 'all';
        state.specialEventTypeFilter = 'all';
        closeAllPopovers();
        showSpecialEventOverview();
        state.todoDrawerOpen = false;
        state.specialEventsDrawerOpen = true;
        renderTodoDrawer();
        renderSpecialEventsModal();
        renderSpecialEventsDrawer();
        markSpecialNoticesSeen();
        saveState();
        renderSpecialEventsButton();
      });
    }
    return div;
  }

  function renderAllDayTodoPopover(container, dayIndex, todos, allDayEvents = [], specialItems = []) {
    const panel = document.createElement('div');
    panel.className = 'all-day-popover';
    panel.addEventListener('click', e => e.stopPropagation());

    const specialRows = specialItems.map(({ event, date }) => `
        <div class="all-day-popover-row all-day-popover-special" data-special-id="${event.id}">
          <span class="all-day-popover-task">☝🏼 ${escapeHtml(specialEventDisplayTitle(event, date))}</span>
          <span class="all-day-popover-meta">${escapeHtml(specialEventTypeLabels[event.type] || 'Ereignis')}</span>
        </div>`).join('');

    const eventRows = allDayEvents.map(ev => {
      const cat = state.categories[ev.categoryId] || state.categories.external || state.categories.orga;
      return `
        <div class="all-day-popover-row all-day-popover-event" data-event-id="${ev.id}" style="border-left-color:${escapeHtml(cat.color)}">
          <span class="all-day-popover-task">Ganztag · ${escapeHtml(ev.label)}</span>
          <span class="all-day-popover-meta">Extern</span>
        </div>`;
    }).join('');

    const todoRows = todos.map(todo => {
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
        }).join('');
    const rows = specialRows || eventRows || todoRows
      ? `${specialRows}${eventRows}${todoRows}`
      : '<div class="all-day-popover-empty">Keine Tagesaufgaben oder Ganztagstermine.</div>';

    panel.innerHTML = `
      <div class="all-day-popover-head">
        <span>Ganztag</span>
        <button type="button" class="all-day-popover-close" title="Schließen">×</button>
      </div>
      <div class="all-day-popover-list">${rows}</div>
      <button type="button" class="all-day-popover-planner">Im To-do Planner öffnen</button>`;

    panel.querySelector('.all-day-popover-close').addEventListener('click', closeHeaderTodos);
    panel.querySelector('.all-day-popover-planner').addEventListener('click', e => openTodoPlannerForDay(dayIndex, e));
    panel.querySelectorAll('.all-day-popover-special').forEach(row => row.addEventListener('click', openSpecialEventsModal));
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

  function canMoveEventAcrossDays(ev) {
    return Boolean(ev)
      && isWeekMode()
      && !ev.allDay
      && !isIntegratedChild(ev)
      && hasScheduledTime(ev);
  }

  function clearMoveDayHighlight() {
    document.querySelectorAll('.day-column.move-target').forEach(col => col.classList.remove('move-target'));
    movingOverDay = null;
  }

  function resetEventMoveState() {
    movingEventId = null;
    movingPointerOffsetY = 0;
    movingOriginalStart = null;
    movingOriginalEnd = null;
    clearMoveDayHighlight();
  }

  function eventStartSlotFromDrop(dayColumn, event) {
    const rect = dayColumn.getBoundingClientRect();
    const measuredSlotHeight = rect.height / slotsPerDay;
    const pixelsPerSlot = Number.isFinite(measuredSlotHeight) && measuredSlotHeight > 0 ? measuredSlotHeight : cellHeight();
    const topEdgeY = event.clientY - movingPointerOffsetY;
    const rawSlot = (topEdgeY - rect.top) / pixelsPerSlot;
    return Math.round(rawSlot);
  }

  function moveEventToSlot(eventId, day, startSlot) {
    const ev = currentEvents().find(item => item.id === eventId);
    const nextDay = clamp(Number(day), 0, 6);
    if (!canMoveEventAcrossDays(ev)) return false;

    const originalStart = Number.isFinite(Number(movingOriginalStart)) ? Number(movingOriginalStart) : Number(ev.start);
    const originalEnd = Number.isFinite(Number(movingOriginalEnd)) ? Number(movingOriginalEnd) : Number(ev.end);
    const duration = originalEnd - originalStart;
    const nextStart = Number(startSlot);
    const nextEnd = nextStart + duration;
    if (!Number.isFinite(duration) || duration <= 0 || nextStart < 0 || nextEnd > slotsPerDay) return false;
    if (Number(ev.day) === nextDay && Number(ev.start) === nextStart && Number(ev.end) === nextEnd) return false;

    ev.day = nextDay;
    ev.start = nextStart;
    ev.end = nextEnd;
    ev.date = isTemplateMode() ? null : dateKey(getDayDate(nextDay));
    if (isExternalIcsEvent(ev)) recordExternalLocalOverrides(ev, { day: nextDay, start: nextStart, end: nextEnd, date: ev.date });
    if (ev.missingFromLastSync || isExternalIcsEvent(ev)) ev.syncStatus = ev.syncStatus || 'local-moved';
    touchEvent(ev);
    syncEventAutoComplete(ev);
    saveState();
    renderAll();
    return true;
  }

  function setupEventDayDropTarget(col, day) {
    col.addEventListener('dragover', event => {
      if (!movingEventId) return;
      event.preventDefault();
      if (movingOverDay !== day) {
        clearMoveDayHighlight();
        movingOverDay = day;
      }
      col.classList.add('move-target');
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    });

    col.addEventListener('dragleave', event => {
      if (!col.contains(event.relatedTarget)) col.classList.remove('move-target');
    });

    col.addEventListener('drop', event => {
      if (!movingEventId) return;
      event.preventDefault();
      const eventId = event.dataTransfer?.getData('text/plain') || movingEventId;
      const targetStart = eventStartSlotFromDrop(col, event);
      clearMoveDayHighlight();
      moveEventToSlot(eventId, day, targetStart);
      resetEventMoveState();
    });
  }
  function clearSelection() { document.querySelectorAll('.slot.selected').forEach(el => el.classList.remove('selected')); }


  let mobileEventTapState = null;

  function bindMobileEventDoubleTap(element, ev) {
    let touchStart = null;
    element.addEventListener('touchstart', e => {
      const touch = e.touches?.[0];
      if (!touch || e.target.closest('input, button, select, textarea, a')) {
        touchStart = null;
        return;
      }
      touchStart = { x: touch.clientX, y: touch.clientY, time: Date.now() };
    }, { passive: true });

    element.addEventListener('touchend', e => {
      if (element.dataset.bulkLongPressFired === '1') {
        element.dataset.bulkLongPressFired = '0';
        touchStart = null;
        return;
      }
      if (!touchStart || isDragging || e.target.closest('input, button, select, textarea, a')) {
        touchStart = null;
        return;
      }
      const touch = e.changedTouches?.[0];
      if (!touch) {
        touchStart = null;
        return;
      }
      const dx = touch.clientX - touchStart.x;
      const dy = touch.clientY - touchStart.y;
      const moved = Math.hypot(dx, dy);
      const now = Date.now();
      const previous = mobileEventTapState;
      touchStart = null;
      if (moved > 12) return;
      if (previous && previous.eventId === ev.id && now - previous.time <= 380) {
        mobileEventTapState = null;
        e.preventDefault();
        e.stopPropagation();
        if (ev.editable !== false) openEditor(ev.id);
        return;
      }
      mobileEventTapState = { eventId: ev.id, time: now };
    }, { passive: false });
  }



  function isDesktopResizePointer() {
    return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  }

  function canResizeEventDuration(ev) {
    return Boolean(ev)
      && isDesktopResizePointer()
      && ev.editable !== false
      && ev.importSource !== 'ics'
      && isWeekMode()
      && !ev.allDay
      && !isIntegratedChild(ev)
      && hasScheduledTime(ev);
  }

  function resizeSlotFromPointer(dayColumn, clientY) {
    const rect = dayColumn.getBoundingClientRect();
    const measuredSlotHeight = rect.height / slotsPerDay;
    const pixelsPerSlot = Number.isFinite(measuredSlotHeight) && measuredSlotHeight > 0 ? measuredSlotHeight : cellHeight();
    return Math.round((clientY - rect.top) / pixelsPerSlot);
  }

  function eventResizePreviewText(start, end) {
    return `${timeLabel(start)}–${timeLabel(end)}`;
  }

  function updateEventResizePreview(clientY) {
    if (!eventResizeState) return;
    const { edge, dayColumn, eventElement, originalStart, originalEnd, preview } = eventResizeState;
    let slot = resizeSlotFromPointer(dayColumn, clientY);
    let nextStart = originalStart;
    let nextEnd = originalEnd;
    if (edge === 'start') {
      nextStart = clamp(slot, 0, originalEnd - 1);
    } else {
      nextEnd = clamp(slot, originalStart + 1, slotsPerDay);
    }
    eventResizeState.nextStart = nextStart;
    eventResizeState.nextEnd = nextEnd;
    eventElement.style.top = `${nextStart * cellHeight() + 1}px`;
    eventElement.style.height = `${Math.max(16, (nextEnd - nextStart) * cellHeight() - 2)}px`;
    if (preview) preview.textContent = eventResizePreviewText(nextStart, nextEnd);
  }

  function startEventResize(ev, eventElement, edge, event) {
    if (!canResizeEventDuration(ev) || event.button !== 0) return;
    const dayColumn = eventElement.closest('.day-column');
    if (!dayColumn) return;
    event.preventDefault();
    event.stopPropagation();
    document.body.classList.add('event-resizing-active');
    const preview = eventElement.querySelector('.event-resize-preview');
    eventResizeState = {
      eventId: ev.id,
      edge,
      dayColumn,
      eventElement,
      originalStart: Number(ev.start),
      originalEnd: Number(ev.end),
      nextStart: Number(ev.start),
      nextEnd: Number(ev.end),
      preview
    };
    if (preview) preview.textContent = eventResizePreviewText(ev.start, ev.end);
    eventElement.classList.add('resizing');
    updateEventResizePreview(event.clientY);
  }

  function finishEventResize(commit) {
    if (!eventResizeState) return;
    const stateForResize = eventResizeState;
    eventResizeState = null;
    document.body.classList.remove('event-resizing-active');
    stateForResize.eventElement.classList.remove('resizing');
    const ev = currentEvents().find(item => item.id === stateForResize.eventId);
    if (!commit || !ev || !canResizeEventDuration(ev)) {
      renderCalendar();
      return;
    }
    const nextStart = clamp(Number(stateForResize.nextStart), 0, slotsPerDay - 1);
    const nextEnd = clamp(Number(stateForResize.nextEnd), nextStart + 1, slotsPerDay);
    if (nextStart === Number(ev.start) && nextEnd === Number(ev.end)) {
      renderCalendar();
      return;
    }
    ev.start = nextStart;
    ev.end = nextEnd;
    if (ev.missingFromLastSync) ev.syncStatus = ev.syncStatus || 'local-resized';
    touchEvent(ev);
    syncEventAutoComplete(ev);
    saveState();
    renderAll();
  }

  document.addEventListener('mousemove', event => {
    if (!eventResizeState) return;
    event.preventDefault();
    updateEventResizePreview(event.clientY);
  });

  document.addEventListener('mouseup', () => finishEventResize(true));

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

  function showEventTitlePopup(ev, anchor) {
    if (!isMobileViewport() || !anchor) return;
    document.querySelector('.event-title-popover')?.remove();
    const cat = state.categories[ev.categoryId] || state.categories.orga;
    const pop = document.createElement('div');
    pop.className = 'event-title-popover';
    pop.textContent = `${ev.label} · ${eventTime(ev)} · ${cat.label}`;
    document.body.appendChild(pop);
    const rect = anchor.getBoundingClientRect();
    pop.style.left = `${clamp(rect.left, 8, window.innerWidth - 240)}px`;
    pop.style.top = `${Math.max(8, rect.top - pop.offsetHeight - 8)}px`;
    window.setTimeout(() => pop.remove(), 2200);
  }

  function bindBulkLongPress(element, ev) {
    let press = null;
    const canStart = target => !bulkSelectionMode && isBulkEditableEvent(ev) && !target.closest('input, button, select, textarea, a, .event-resize-handle');
    const beginPress = (x, y, target) => {
      if (!canStart(target)) return;
      if (press) window.clearTimeout(press.timer);
      element.dataset.bulkLongPressFired = '0';
      press = { x, y, timer: null };
      press.timer = window.setTimeout(() => {
        element.dataset.bulkLongPressFired = '1';
        press = null;
        setBulkSelectionMode(true, ev.id);
      }, 520);
    };
    const movePress = (x, y) => {
      if (!press) return;
      if (Math.hypot(x - press.x, y - press.y) > 10) {
        window.clearTimeout(press.timer);
        press = null;
      }
    };
    const endPress = () => {
      if (press) window.clearTimeout(press.timer);
      press = null;
    };
    element.addEventListener('touchstart', e => {
      const touch = e.touches?.[0];
      if (touch) beginPress(touch.clientX, touch.clientY, e.target);
    }, { passive: true });
    element.addEventListener('touchmove', e => {
      const touch = e.touches?.[0];
      if (!touch) endPress();
      else movePress(touch.clientX, touch.clientY);
    }, { passive: true });
    ['touchend', 'touchcancel'].forEach(type => element.addEventListener(type, endPress, { passive: true }));
    element.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'touch') return;
      beginPress(e.clientX, e.clientY, e.target);
    }, { passive: true });
    element.addEventListener('pointermove', e => {
      if (e.pointerType !== 'touch') return;
      movePress(e.clientX, e.clientY);
    }, { passive: true });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(type => element.addEventListener(type, endPress, { passive: true }));
  }

  function eventEl(ev) {
    syncEventAutoComplete(ev);
    const cat = state.categories[ev.categoryId] || state.categories.orga;
    const bulkSelected = selectedEventIds.has(ev.id);
    const div = document.createElement('div');
    div.className = `event ${isEventDone(ev) ? 'done' : ''} ${ev.missed ? 'missed' : ''} ${ev.source === 'extra' ? 'extra-event' : ''} ${ev.importSource === 'ics' ? 'external-calendar-event' : ''} ${bulkSelectionMode && isBulkSelectableEvent(ev) ? 'bulk-selectable' : ''} ${bulkSelected ? 'bulk-selected' : ''}`;
    div.dataset.id = ev.id;
    if (canMoveEventAcrossDays(ev)) {
      div.draggable = true;
      div.classList.add('event-movable');
    }
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
    div.style.setProperty('--event-color', cat.color);
    div.title = `${days[ev.day]} ${isTemplateMode() ? '' : formatShortDate(getDayDate(ev.day)) + ' '}${eventTime(ev)} · ${ev.label}`;
    const integratedCount = integratedEventsForEvent(ev.id).length;
    const blockSubtasks = cloneEventSubtasks(ev);
    const fulfillment = blockFulfillmentStats(ev, blockSubtasks);
    const fulfillmentBadge = fulfillment.containedTotal ? `<div class="event-fulfillment-badge">${fulfillment.done}/${fulfillment.total}</div>` : '';
    const integratedBadge = integratedCount ? `<div class="event-integrated-badge">+${integratedCount} im Block</div>` : '';
    const scheduledChildren = layoutEmbeddedChildren(scheduledIntegratedEventsForEvent(ev));
    const sameStartChildren = scheduledChildren.filter(child => Number(child.start) === Number(ev.start));
    const hasStartAlignedChild = sameStartChildren.length > 0;
    const compactDetailsOpen = hasStartAlignedChild && openCompactEventIds.has(ev.id);
    if (hasStartAlignedChild) {
      div.classList.add('event-has-start-aligned-child', compactDetailsOpen ? 'details-open' : 'details-collapsed');
    }
    const embeddedChildren = scheduledChildren.length ? `
      <div class="event-embedded-children">
        ${scheduledChildren.map(child => {
          const slotHeight = cellHeight();
          const top = Math.max(0, Number(child.start) - Number(ev.start)) * slotHeight;
          const height = Math.max(18, (Number(child.end) - Number(child.start)) * slotHeight - 2);
          const laneCount = Math.max(1, Number(child._embeddedLaneCount) || 1);
          const lane = Math.max(0, Number(child._embeddedLane) || 0);
          const laneGap = laneCount > 1 ? 3 : 0;
          const width = 100 / laneCount;
          const left = lane * width;
          const childCat = state.categories[child.categoryId] || cat;
          return `
            <div
              class="event-embedded-child ${isEventDone(child) ? 'done' : ''} ${child.missed ? 'missed' : ''}"
              data-event-id="${child.id}"
              style="top:${top}px;height:${height}px;left:calc(${left}% + ${laneGap}px);right:auto;width:calc(${width}% - ${laneGap * 2}px);border-left-color:${escapeHtml(childCat.color)}"
              title="${escapeHtml(eventTime(child))} · ${escapeHtml(child.label)}"
            >
              <input class="event-embedded-check" type="checkbox" ${isEventDone(child) ? 'checked' : ''} title="Erledigt" />
              <span>${escapeHtml(timeLabel(child.start))}</span>
              <strong>${escapeHtml(child.label)}</strong>
              <button class="event-embedded-missed ${child.missed ? 'active' : ''}" type="button" title="Nicht eingehalten">!</button>
            </div>`;
        }).join('')}
      </div>` : '';
    const compactToggle = hasStartAlignedChild ? `
      <button
        class="event-compact-toggle"
        type="button"
        title="${compactDetailsOpen ? 'Details einklappen' : 'Details ausklappen'}"
        aria-expanded="${compactDetailsOpen ? 'true' : 'false'}"
      >&rsaquo;</button>` : '';
    const compactMeta = hasStartAlignedChild ? `<span class="event-compact-meta">${eventTime(ev)}${fulfillment.containedTotal ? ` · ${fulfillment.done}/${fulfillment.total}` : ''}</span>` : '';
    const eventHeight = Math.max(16, (Number(ev.end) - Number(ev.start)) * cellHeight() - 2);
    const subtaskListTop = eventHeight < 54 ? 4 : (hasStartAlignedChild ? 30 : Math.round((2 * cellHeight()) + 7));
    const subtaskListBottom = integratedCount ? 20 : 4;
    const reservedBottom = subtaskListBottom + 2;
    const subtaskRowHeight = 18;
    const subtaskAvailableHeight = Math.max(0, eventHeight - subtaskListTop - reservedBottom);
    const maxVisibleSubtasks = blockSubtasks.length
      ? Math.max(0, Math.floor(subtaskAvailableHeight / subtaskRowHeight))
      : 0;
    const visibleSubtasks = blockSubtasks.slice(0, maxVisibleSubtasks);
    const hiddenSubtaskCount = Math.max(0, blockSubtasks.length - visibleSubtasks.length);
    const blockSubtaskList = blockSubtasks.length ? `
      <div class="event-block-subtasks" style="top:${subtaskListTop}px;bottom:${subtaskListBottom}px">
        ${visibleSubtasks.map(sub => `
          <div class="event-block-subtask ${sub.done ? 'done' : ''} ${sub.missed ? 'missed' : ''}" data-subtask-id="${escapeHtml(sub.id)}" title="${escapeHtml(sub.text)}">
            <input class="event-block-subtask-check" type="checkbox" ${sub.done ? 'checked' : ''} title="Erledigt" />
            <span>Ohne Zeit</span>
            <strong>${escapeHtml(sub.text)}</strong>
            ${sub.missed ? '<em title="Nicht eingehalten">!</em>' : ''}
          </div>`).join('')}
        ${hiddenSubtaskCount ? `<div class="event-block-subtask-more">+${hiddenSubtaskCount} weitere</div>` : ''}
      </div>` : '';

    const trackable = isWeekMode() && Boolean(cat.habit);
    const resizeHandles = canResizeEventDuration(ev) ? `
  <button class="event-resize-handle event-resize-start" type="button" title="Startzeit ziehen" aria-label="Startzeit ändern"></button>
  <button class="event-resize-handle event-resize-end" type="button" title="Endzeit ziehen" aria-label="Endzeit ändern"></button>
  <div class="event-resize-preview" aria-hidden="true"></div>` : '';
    const bulkSelectButton = bulkSelectionMode && isBulkSelectableEvent(ev) ? `<button class="event-bulk-select ${bulkSelected ? 'selected' : ''}" type="button" aria-label="Termin auswählen" title="Termin auswählen">${bulkSelected ? '✓' : ''}</button>` : '';
    div.innerHTML = `${resizeHandles}${bulkSelectButton}
  <div class="event-main-row event-title-row ${hasStartAlignedChild ? 'event-main-overlay-bar' : ''}">
    ${trackable ? `<input class="event-check" type="checkbox" ${isEventDone(ev) ? 'checked' : ''} ${eventAutoCompleteEnabled(ev) && (Array.isArray(ev.subtasks) && ev.subtasks.length || integratedCount) ? 'disabled title="Automatisch: erledigt sich, sobald alle Untertasks erledigt sind"' : 'title="Erledigt"'} />` : ''}
    ${trackable ? `<button class="event-missed-btn ${ev.missed ? 'active' : ''}" type="button" title="Nicht eingehalten">!</button>` : ''}
    <span class="event-title">${escapeHtml(ev.label)}</span>
    ${compactMeta}
    ${compactToggle}
  </div>
  <div class="event-time">${eventTime(ev)}</div>
  ${embeddedChildren}
  ${blockSubtaskList}
  ${fulfillmentBadge}
  ${integratedBadge}`;
    div.querySelectorAll('input, button, select, textarea, a').forEach(control => {
      control.draggable = false;
    });
    div.querySelector('.event-bulk-select')?.addEventListener('click', e => {
      e.preventDefault();
      e.stopImmediatePropagation();
      toggleBulkEventSelection(ev.id);
    });
    div.querySelector('.event-title')?.addEventListener('click', e => {
      if (!isMobileViewport() || bulkSelectionMode) return;
      e.stopPropagation();
      showEventTitlePopup(ev, e.currentTarget);
    });
    div.addEventListener('click', e => {
      if (!bulkSelectionMode || !isBulkSelectableEvent(ev) || e.target.closest('input, button, select, textarea, a, .event-resize-handle')) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      toggleBulkEventSelection(ev.id);
    });
    div.querySelector('.event-resize-start')?.addEventListener('mousedown', e => startEventResize(ev, div, 'start', e));
    div.querySelector('.event-resize-end')?.addEventListener('mousedown', e => startEventResize(ev, div, 'end', e));
    div.querySelectorAll('.event-resize-handle').forEach(handle => {
      handle.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); });
      handle.addEventListener('dblclick', e => { e.preventDefault(); e.stopPropagation(); });
    });

    div.addEventListener('mousedown', e => e.stopPropagation());
    div.addEventListener('click', e => e.stopPropagation());
    div.addEventListener('dblclick', e => {
      e.preventDefault();
      e.stopPropagation();
      if (bulkSelectionMode) return;
      openEditor(ev.id);
    });
    bindMobileEventDoubleTap(div, ev);
    bindBulkLongPress(div, ev);
    div.addEventListener('dragstart', e => {
      if (bulkSelectionMode || !canMoveEventAcrossDays(ev) || e.target.closest('input, button, select, textarea, a, .event-resize-handle')) {
        e.preventDefault();
        return;
      }
      const rect = div.getBoundingClientRect();
      movingEventId = ev.id;
      movingPointerOffsetY = clamp(e.clientY - rect.top, 0, Math.max(rect.height, 0));
      movingOriginalStart = Number(ev.start);
      movingOriginalEnd = Number(ev.end);
      div.classList.add('dragging');
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', ev.id);
      }
    });
    div.addEventListener('dragend', () => {
      div.classList.remove('dragging');
      resetEventMoveState();
    });
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

const compactToggleBtn = div.querySelector('.event-compact-toggle');
if (compactToggleBtn) {
  compactToggleBtn.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    if (openCompactEventIds.has(ev.id)) openCompactEventIds.delete(ev.id);
    else openCompactEventIds.add(ev.id);
    renderAll();
  });
}

div.querySelectorAll('.event-block-subtask').forEach(row => {
  row.addEventListener('click', e => {
    if (e.target.closest('input, button, select, textarea, a')) return;
    e.preventDefault();
    e.stopPropagation();
    openEditor(ev.id);
  });
  const check = row.querySelector('.event-block-subtask-check');
  const sub = ev.subtasks?.find(item => item.id === row.dataset.subtaskId);
  if (check && sub) {
    check.addEventListener('click', e => e.stopPropagation());
    check.addEventListener('change', e => {
      e.stopPropagation();
      sub.done = Boolean(e.target.checked);
      if (sub.done) sub.missed = false;
      syncEventAutoComplete(ev);
      syncParentAutoCompleteForChild(ev);
      saveState();
      renderAll();
    });
  }
});

div.querySelector('.event-block-subtask-more')?.addEventListener('click', e => {
  e.preventDefault();
  e.stopPropagation();
  openEditor(ev.id);
});

div.querySelectorAll('.event-embedded-child').forEach(childBtn => {
  childBtn.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    openEditor(childBtn.dataset.eventId);
  });
  childBtn.addEventListener('dblclick', e => {
    e.preventDefault();
    e.stopPropagation();
    openEditor(childBtn.dataset.eventId);
  });
  const childCheck = childBtn.querySelector('.event-embedded-check');
  if (childCheck) {
    childCheck.addEventListener('click', e => e.stopPropagation());
    childCheck.addEventListener('change', e => {
      e.stopPropagation();
      toggleDone(childBtn.dataset.eventId, e.target.checked);
    });
  }
  const childMissed = childBtn.querySelector('.event-embedded-missed');
  if (childMissed) {
    childMissed.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      toggleMissed(childBtn.dataset.eventId);
    });
  }
});

return div;
  }


  function normalizeInviteEmail(value) {
    return String(value || '').trim().toLowerCase();
  }

  function isValidInviteEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeInviteEmail(value));
  }

  function canManageParticipants(ev) {
    return Boolean(ev && !ev.allDay && hasScheduledTime(ev) && !isExternalIcsEvent(ev) && !isExternalReadOnlyEvent(ev));
  }

  function canInviteEvent(ev) {
    return Boolean(ev && isWeekMode() && canManageParticipants(ev));
  }

  function routineParticipantScopeEligible(ev) {
    return Boolean(ev?.source === 'routine' && ev.templateEventId && !isTemplateMode());
  }

  function applyParticipantsToRoutineTemplate(instanceEv) {
    if (!routineParticipantScopeEligible(instanceEv)) return false;
    const templateEv = state.templateEvents.find(item => item.id === instanceEv.templateEventId);
    if (!templateEv) return false;
    syncParticipantsToEvent(templateEv, inviteDraftAttendees);
    templateEv.inviteMessage = eventInviteMessage?.value || '';
    touchEvent(templateEv);
    return true;
  }

  function renderInvitePanelState() {
    if (!eventInvitePanel || !eventInviteToggle) return;
    eventInvitePanel.classList.toggle('collapsed', !invitePanelExpanded);
    eventInvitePanel.classList.toggle('expanded', invitePanelExpanded);
    eventInviteToggle.setAttribute('aria-expanded', String(invitePanelExpanded));
    const icon = eventInviteToggle.querySelector('.event-invite-toggle-icon');
    if (icon) icon.textContent = invitePanelExpanded ? '▼' : '▶';
    if (eventInviteContent) eventInviteContent.hidden = !invitePanelExpanded;
  }

  function invitationUidDomainCandidates() {
    const host = (window.location?.host || '').replace(/[^a-zA-Z0-9.-]/g, '');
    return [host, 'project-qk691.vercel.app']
      .map(value => String(value || '').trim())
      .filter((value, index, list) => value && list.indexOf(value) === index);
  }

  function invitationUidForEvent(ev, domainOverride = null) {
    const domain = String(domainOverride || invitationUidDomainCandidates()[0] || 'project-qk691.vercel.app').replace(/[^a-zA-Z0-9.-]/g, '') || 'project-qk691.vercel.app';
    const safeId = String(ev?.id || id()).replace(/[^a-zA-Z0-9_.-]/g, '-');
    return `${safeId}@${domain}`;
  }

  function ensureOwnEventInvitationUid(ev) {
    if (!ev || isExternalIcsEvent(ev)) return ev;
    if (!ev.invitationUid) ev.invitationUid = invitationUidForEvent(ev);
    if (!Number.isInteger(Number(ev.invitationSequence))) ev.invitationSequence = 0;
    if (!ev.invitationStatus) ev.invitationStatus = 'not-sent';
    return ev;
  }

  function setInviteStatus(message, mode = '') {
    if (!eventInviteStatus) return;
    eventInviteStatus.textContent = message || '';
    eventInviteStatus.className = `event-invite-status ${mode}`.trim();
  }

  function renderInviteAttendees(ev = currentEvents().find(item => item.id === editingId)) {
    if (!eventInviteChips) return;
    const inviteAllowed = ev ? canManageParticipants(ev) : isWeekMode();
    const readOnlyExternal = Boolean(ev && isExternalReadOnlyEvent(ev));
    eventInviteChips.innerHTML = '';
    inviteDraftAttendees.forEach((att, index) => {
      const chip = document.createElement('span');
      chip.className = `event-invite-chip status-${att.invitationStatus || att.status || 'pending'}`;
      const label = att.name ? `${att.name} · ${att.email}` : att.email;
      chip.innerHTML = `<span>${escapeHtml(label)}</span>${inviteAllowed ? '<button type="button" title="Entfernen" aria-label="Teilnehmer entfernen">×</button>' : ''}`;
      const removeBtn = chip.querySelector('button');
      if (removeBtn) {
        removeBtn.onclick = () => {
          inviteDraftAttendees.splice(index, 1);
          setInviteStatus('', '');
          renderInviteAttendees(ev);
        };
      }
      eventInviteChips.appendChild(chip);
    });
    if (eventInviteSummary) {
      const count = inviteDraftAttendees.length;
      eventInviteSummary.textContent = count ? `${count} Teilnehmer` : 'Noch keine Teilnehmer';
    }
    if (eventInviteReadonlyNote) {
      eventInviteReadonlyNote.hidden = !readOnlyExternal;
      eventInviteReadonlyNote.textContent = readOnlyExternal
        ? 'Teilnehmer können für importierte Kalender nicht bearbeitet werden.'
        : '';
    }
    if (eventInviteEmailInput) {
      eventInviteEmailInput.disabled = !inviteAllowed;
      eventInviteEmailInput.parentElement.style.display = inviteAllowed ? '' : 'none';
    }
    if (addInviteEmailBtn) addInviteEmailBtn.disabled = !inviteAllowed;
    if (eventInviteMessage) {
      eventInviteMessage.disabled = !inviteAllowed;
      eventInviteMessage.previousElementSibling.style.display = inviteAllowed ? '' : 'none';
      eventInviteMessage.style.display = inviteAllowed ? '' : 'none';
    }
    if (sendInviteBtn) {
      sendInviteBtn.textContent = ev?.invitationSentAt ? 'Aktualisierung senden' : 'Einladung senden';
      sendInviteBtn.disabled = !editingId || !canInviteEvent(ev) || !inviteDraftAttendees.length;
      sendInviteBtn.parentElement.style.display = inviteAllowed ? '' : 'none';
    }
    renderInvitePanelState();
  }


  function addInviteEmailFromInput() {
    if (!eventInviteEmailInput) return true;
    const parts = String(eventInviteEmailInput.value || '').split(/[;,\n]+/).map(normalizeInviteEmail).filter(Boolean);
    if (!parts.length) return true;
    for (const email of parts) {
      if (!isValidInviteEmail(email)) {
        setInviteStatus(`Ungültige E-Mail-Adresse: ${email}`, 'error');
        return false;
      }
      if (inviteDraftAttendees.some(att => att.email === email)) {
        setInviteStatus(`Diese Adresse ist bereits hinzugefügt: ${email}`, 'error');
        if (eventInviteEmailInput) eventInviteEmailInput.value = '';
        return false;
      }
      if (inviteDraftAttendees.length >= MAX_INVITE_ATTENDEES) {
        setInviteStatus(`Maximal ${MAX_INVITE_ATTENDEES} Teilnehmer pro Termin.`, 'error');
        return false;
      }
      inviteDraftAttendees.push({ email, name: '', status: 'pending', invitationStatus: 'pending' });
    }
    eventInviteEmailInput.value = '';
    setInviteStatus('', '');
    renderInviteAttendees();
    return true;
  }

  function invitationSummary(ev) {
    if (!eventParticipantList(ev).length) return 'Noch nicht gesendet';
    if (ev.invitationStatus === 'cancelled') return 'Absage gesendet';
    if (ev.invitationStatus === 'sent' && ev.invitationSentAt) return `Einladung gesendet am ${new Date(ev.invitationSentAt).toLocaleString('de-DE')}`;
    if (ev.invitationStatus === 'updated' && ev.invitationUpdatedAt) return `Aktualisierte Einladung gesendet am ${new Date(ev.invitationUpdatedAt).toLocaleString('de-DE')}`;
    if (ev.invitationStatus === 'failed') return `Versand fehlgeschlagen: ${ev.invitationError || 'Bitte erneut versuchen.'}`;
    return 'Noch nicht gesendet';
  }

  function applyInviteDraftToEvent(ev) {
    syncParticipantsToEvent(ev, inviteDraftAttendees);
    ev.inviteMessage = eventInviteMessage?.value || '';
    ensureOwnEventInvitationUid(ev);
  }


  async function sendCalendarInvitationForCurrentEvent(method = 'REQUEST') {
    if (!editingId) { setInviteStatus('Bitte speichere den Termin zuerst.', 'error'); return false; }
    if (!addInviteEmailFromInput()) return false;
    const ev = currentEvents().find(item => item.id === editingId);
    if (!ev) { setInviteStatus('Termin nicht gefunden.', 'error'); return false; }
    if (!canInviteEvent(ev)) { setInviteStatus(isExternalReadOnlyEvent(ev) ? 'Teilnehmer können für importierte Kalender nicht bearbeitet werden.' : 'Einladungen sind für eigene Termine mit Uhrzeit verfügbar.', 'error'); return false; }
    applyInviteDraftToEvent(ev);
    if (!eventParticipantList(ev).length) { setInviteStatus('Bitte mindestens einen Teilnehmer hinzufügen.', 'error'); return false; }
    if (!cloudUser || !supabaseClient) { setInviteStatus('Bitte einloggen, um Einladungen zu senden.', 'error'); return false; }
    saveState();
    try {
      await saveCloudState(state, { throwOnError: true });
    } catch (error) {
      setInviteStatus(`Termin gespeichert, aber Cloud-Speicherung fehlgeschlagen: ${error.message || error}`, 'error');
      return false;
    }
    const { data } = await supabaseClient.auth.getSession();
    const token = data?.session?.access_token;
    if (!token) { setInviteStatus('Keine gültige Sitzung. Bitte erneut einloggen.', 'error'); return false; }
    if (sendInviteBtn) sendInviteBtn.disabled = true;
    setInviteStatus(method === 'CANCEL' ? 'Absage wird gesendet...' : 'Einladung wird gesendet...', 'pending');
    try {
      const response = await fetch('/api/send-calendar-invitation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ eventId: ev.id, weekKey: state.currentWeekStart, method, message: ev.inviteMessage })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Einladung konnte nicht gesendet werden.');
      ev.invitationUid = result.invitationUid || ev.invitationUid || invitationUidForEvent(ev);
      ev.invitationSequence = Number(result.sequence ?? ev.invitationSequence ?? 0);
      ev.organizerEmail = result.organizerEmail || ev.organizerEmail || null;
      ev.organizerName = result.organizerName || ev.organizerName || null;
      ev.invitationStatus = method === 'CANCEL' ? 'cancelled' : (ev.invitationSentAt ? 'updated' : 'sent');
      ev.invitationSentAt = method === 'CANCEL' ? ev.invitationSentAt : (ev.invitationSentAt || new Date().toISOString());
      ev.invitationUpdatedAt = new Date().toISOString();
      ev.invitationError = null;
      ev.attendees = eventParticipantList(ev).map(att => ({ ...att, status: method === 'CANCEL' ? 'cancelled' : 'sent', invitationStatus: method === 'CANCEL' ? 'cancelled' : 'sent', invitationError: null, invitationSentAt: new Date().toISOString() }));
      ev.participants = ev.attendees.map(att => ({ ...att }));
      inviteDraftAttendees = ev.participants.map(att => ({ ...att }));
      saveState();
      renderInviteAttendees(ev);
      setInviteStatus(method === 'CANCEL' ? 'Absage gesendet.' : 'Einladung gesendet.', 'success');
      return true;
    } catch (error) {
      ev.invitationStatus = 'failed';
      ev.invitationError = error.message || String(error);
      saveState();
      setInviteStatus(`Einladung konnte nicht gesendet werden. Termin wurde gespeichert. ${ev.invitationError}`, 'error');
      return false;
    } finally {
      renderInviteAttendees(ev);
    }
  }

  // ==================================================
  // MODALS
  // ==================================================

  function openEditor(eventId = null, preset = null) {
    editingId = eventId;
    modalBlockTasksExpanded = false;
    invitePanelExpanded = false;
    presetSource = preset?.source || null;
    const ev = eventId ? currentEvents().find(x => x.id === eventId) : {
      id: null,
      day: preset.day,
      start: preset.start,
      end: preset.end,
      label: preset.label || state.categories[preset.categoryId || state.selectedCategory]?.label || 'Block',
      categoryId: preset.categoryId || state.selectedCategory,
      done: false,
      completed: false,
      missed: false,
      source: preset?.source || (isTemplateMode() ? 'routine' : 'extra'),
      templateEventId: null,
      stackedIntoId: null,
      autoComplete: false,
      participants: [],
      attendees: [],
      inviteMessage: '',
      subtasks: []
    };
    if (!ev) return;

    const externalEvent = Boolean(eventId && isExternalIcsEvent(ev));
    const readOnlyEvent = Boolean(eventId && !canLocallyEditEvent(ev));
    modalTitle.textContent = readOnlyEvent ? 'Block ansehen' : (externalEvent ? 'Externen Termin lokal bearbeiten' : (eventId ? 'Block bearbeiten' : 'Neuen Block erstellen'));
    eventDraftSubtasks = cloneEventSubtasks(ev);
    if (modalAutoComplete) modalAutoComplete.checked = Boolean(ev.autoComplete);
    if (modalSubtaskInput) modalSubtaskInput.value = '';
    inviteDraftAttendees = eventParticipantList(ev).map(att => ({ ...att }));
    if (eventInviteEmailInput) eventInviteEmailInput.value = '';
    if (eventInviteMessage) eventInviteMessage.value = ev.inviteMessage || '';
    const inviteAllowed = canManageParticipants(ev) || !eventId;
    setInviteStatus(inviteAllowed ? invitationSummary(ev) : 'Teilnehmer können für importierte Kalender nicht bearbeitet werden.', inviteAllowed ? '' : 'error');
    renderInviteAttendees(ev);
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
    fillModalStackedIntoSelect(ev, { preserveSelection: false });
    renderModalIntegratedEvents(ev.id);
    [modalLabel, modalCategory, modalDay, modalStart, modalEnd, modalStackedInto, modalAutoComplete, modalSubtaskInput].forEach(control => {
      if (control) control.disabled = readOnlyEvent;
    });
    if (modalAddSubtaskBtn) modalAddSubtaskBtn.disabled = readOnlyEvent;
    const saveModalBtn = document.getElementById('saveModalBtn');
    if (saveModalBtn) saveModalBtn.disabled = readOnlyEvent;
    deleteBlockBtn.style.display = eventId && !readOnlyEvent ? '' : 'none';
    if (deleteBlockBtn) deleteBlockBtn.textContent = externalEvent ? 'In dieser App ausblenden' : 'Block löschen';
    updateModalInfo();
    modalBackdrop.style.display = 'flex';
  }

  function closeModal() { modalBackdrop.style.display = 'none'; editingId = null; pendingTodoId = null; presetSource = null; eventDraftSubtasks = []; inviteDraftAttendees = []; invitePanelExpanded = false; setInviteStatus('', ''); renderInvitePanelState(); }

  function openHelpModal() {
    if (!helpModalBackdrop) return;
    profileMenu?.classList.remove('open');
    helpModalBackdrop.style.display = 'flex';
  }

  function closeHelpModal() {
    if (helpModalBackdrop) helpModalBackdrop.style.display = 'none';
  }

  function closeAllPopovers() {
    if (weekSettings) weekSettings.classList.remove('open');
    if (profileMenu) profileMenu.classList.remove('open');
    if (drawerHabitPanel) drawerHabitPanel.classList.remove('filter-open');
    if (weekDateInput) weekDateInput.blur();
    closeHeaderTodos();
  }


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
        if (editingId) renderModalIntegratedEvents(editingId);
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
    if (editingId) renderModalIntegratedEvents(editingId);
    modalSubtaskInput.focus();
  }

  function updateModalInfo() {
    const d = Number(modalDay.value), start = Number(modalStart.value), end = Number(modalEnd.value);
    const durationMinutes = Math.max(0, end - start) * 15;
    const hours = Math.floor(durationMinutes / 60), minutes = durationMinutes % 60;
    const durationText = hours ? `${hours}h ${minutes ? minutes + 'min' : ''}` : `${minutes}min`;
    const categoryId = modalCategory.value;
    const habitText = state.categories[categoryId]?.habit ? 'erscheint im Habit Tracker' : 'kein Habit Tracking';
    const ev = editingId ? currentEvents().find(item => item.id === editingId) : null;
    const externalPrefix = isExternalIcsEvent(ev) ? 'Externer Kalendertermin · Lokale Änderungen werden nicht zurück in den externen Kalender übertragen. · ' : '';
    modalInfo.textContent = `${externalPrefix}${days[d] || ''}${isTemplateMode() ? '' : ' · ' + formatShortDate(getDayDate(d))} · ${timeLabel(start)}–${timeLabel(end)} · Dauer: ${durationText} · ${habitText} · ${isTemplateMode() ? 'Routine-Vorlage' : (presetSource === 'extra' ? 'Extra-To-do' : 'Kalenderwoche')}`;
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
    const autoDisabled = eventAutoCompleteEnabled(ev) && stats.total > 0;
    item.className = `habit-item ${type === 'scheduled' ? 'scheduled-todo-item' : 'routine-item'} ${isEventDone(ev) ? 'done' : ''} ${ev.missed ? 'missed' : ''}`;
    const statusText = ev.missed ? ' · Nicht eingehalten' : (isEventDone(ev) ? ' · Erledigt' : '');
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
      <input class="habit-main-check" type="checkbox" ${isEventDone(ev) ? 'checked' : ''} ${autoDisabled ? 'disabled title="Automatisch: erledigt sich, sobald alle Untertasks erledigt sind"' : ''} />
      <div>
        <div class="habit-name">${escapeHtml(ev.label)}</div>
        <div class="habit-meta">${eventTime(ev)} · ${escapeHtml(cat.label)}${type === 'scheduled' ? ' · eingeplant' : ' · Routine'}${stats.total ? ` · Untertasks ${stats.done}/${stats.total}` : ''}${integratedChildren.length ? ` · ${integratedChildren.length} im Block` : ''}${eventAutoCompleteEnabled(ev) ? ' · Auto' : ''}${statusText}</div>
        ${stats.total ? `<div class="habit-subtask-summary">${stats.done}/${stats.total} erledigt · ${stats.percent}%</div>` : ''}
      </div>
      <button type="button" class="small ghost habit-edit-btn">Bearbeiten</button>
      ${subtasksHtml}
      ${integratedHtml}
      <div class="habit-actions">
        <button type="button" class="small ghost habit-add-subtask-btn">+ Untertask</button>
        <button type="button" class="small ghost habit-auto-btn">${eventAutoCompleteEnabled(ev) ? 'Auto aus' : 'Auto an'}</button>
        <button type="button" class="small danger habit-missed-btn ${ev.missed ? 'active' : ''}">${ev.missed ? 'Nicht eingehalten ✓' : 'Nicht eingehalten'}</button>
      </div>`;
    const cb = item.querySelector('.habit-main-check');
    cb.addEventListener('change', () => {
      if (eventAutoCompleteEnabled(ev) && (ev.subtasks.length || integratedChildren.length)) return;
      toggleDone(ev.id, cb.checked);
    });
    item.querySelector('.habit-edit-btn').addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); openEditor(ev.id); });
    item.querySelector('.habit-add-subtask-btn').addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation(); addSubtaskToEvent(ev);
    });
    item.querySelector('.habit-auto-btn').addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation();
      const autoComplete = !eventAutoCompleteEnabled(ev);
      ev.autoComplete = autoComplete;
      ev.autoCompleteFromSubtasks = autoComplete;
      syncEventAutoComplete(ev);
      syncParentAutoCompleteForChild(ev);
      saveState();
      renderAll();
    });
    item.querySelector('.habit-missed-btn').addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation(); toggleMissed(ev.id);
    });
    item.querySelectorAll('.habit-subtask').forEach(row => {
      const subId = row.dataset.subtaskId;
      const sub = ev.subtasks.find(x => x.id === subId);
      if (!sub) return;
      row.querySelector('.habit-subtask-check').addEventListener('change', e => {
        e.stopPropagation();
        sub.done = e.target.checked;
        syncEventAutoComplete(ev);
        syncParentAutoCompleteForChild(ev);
        saveState();
        renderAll();
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
    touchEvent(ev);
    syncEventAutoComplete(ev);
    syncParentAutoCompleteForChild(ev);
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
        todo.updatedAt = new Date().toISOString();
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
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
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
    const dayEvents = visibleEvents(currentWeekEvents())
      .filter(ev => ev.day === state.activeHabitDay)
      .filter(ev => !isIntegratedChild(ev))
      .filter(ev => filter === 'all' || (filter === 'done' ? isEventDone(ev) : (filter === 'missed' ? ev.missed : (!isEventDone(ev) && !ev.missed))))
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
    const routineStats = eventListProgressStats(routineList);
    const scheduledStats = eventListProgressStats(scheduledTodos);

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
          <span class="drawer-section-badge">${routineStats.done}/${routineStats.total} · ${routineStats.missed}!</span>
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
          <span class="drawer-section-badge">${scheduledStats.done}/${scheduledStats.total} · ${scheduledStats.missed}!</span>
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
    const eventStats = timedItems.reduce((acc, ev) => {
      const progress = eventProgressStats(ev);
      acc.total += progress.total;
      acc.done += progress.done;
      acc.missed += progress.missed;
      return acc;
    }, { total: 0, done: 0, missed: 0 });
    const todoStats = untimedItems.reduce((acc, todo) => {
      const progress = todoFulfillmentStats(todo);
      acc.total += progress.total;
      acc.done += progress.done;
      acc.missed += progress.missed;
      return acc;
    }, { total: 0, done: 0, missed: 0 });
    const total = eventStats.total + todoStats.total;
    const done = eventStats.done + todoStats.done;
    const missed = eventStats.missed + todoStats.missed;
    const open = Math.max(total - done - missed, 0);
    return { total, done, missed, open, percent: makePercent(done, total) };
  }

  function eventListProgressStats(events) {
    return events.reduce((acc, ev) => {
      const progress = eventProgressStats(ev);
      acc.total += progress.total;
      acc.done += progress.done;
      acc.missed += progress.missed;
      return acc;
    }, { total: 0, done: 0, missed: 0 });
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
    const all = visibleEvents(currentWeekEvents())
      .filter(ev => ev.day === d && !isIntegratedChild(ev) && state.categories[ev.categoryId]?.habit)
      .sort((a, b) => a.start - b.start || a.end - b.end);
    const stats = all.reduce((acc, ev) => {
      const progress = eventProgressStats(ev);
      acc.total += progress.total;
      acc.done += progress.done;
      acc.missed += progress.missed;
      return acc;
    }, { total: 0, done: 0, missed: 0 });
    taskProgress.textContent = `${stats.done}/${stats.total} erledigt · ${stats.missed} nicht eingehalten`;
    taskList.innerHTML = '';

    if (!all.length) {
      taskList.innerHTML = '<div class="task-empty">Für diesen Tag gibt es noch keine trackbaren Aufgaben. Fahrt/Wegzeit und Schlaf werden bewusst ausgeblendet.</div>';
      return;
    }

    all.forEach(ev => {
      const cat = state.categories[ev.categoryId] || state.categories.orga;
      const item = document.createElement('label');
      item.className = `task-card ${isEventDone(ev) ? 'done' : ''} ${ev.missed ? 'missed' : ''}`;
      item.innerHTML = `
        <input type="checkbox" ${isEventDone(ev) ? 'checked' : ''} />
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

    const activeMainTab = isTracking ? 'tracking' : (state.plannerMode === 'template' ? 'template' : 'week');
    [
      [weekModeBtn, 'week'],
      [trackingModeBtn, 'tracking'],
      [templateModeBtn, 'template']
    ].forEach(([button, tab]) => {
      const isActive = activeMainTab === tab;
      button.classList.toggle('active', isActive);
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-pressed', String(isActive));
    });

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
    const trackableTemplate = state.templateEvents.filter(ev => !isIntegratedChild(ev) && state.categories[ev.categoryId]?.habit);
    const weekEvents = currentWeekEvents();
    const stats = trackableTemplate.reduce((acc, templateEv) => {
      const weekEv = weekEvents.find(ev => ev.source === 'routine' && ev.templateEventId === templateEv.id);
      const templateProgress = eventProgressStats(templateEv, state.templateEvents);
      const progress = weekEv ? eventProgressStats(weekEv, weekEvents) : { total: templateProgress.total, done: 0 };
      acc.total += progress.total;
      acc.done += progress.done;
      return acc;
    }, { total: 0, done: 0 });
    return { total: stats.total, done: stats.done, percent: makePercent(stats.done, stats.total) };
  }

  function extraTrackingStats() {
    const extras = visibleEvents(currentWeekEvents()).filter(ev => ev.source === 'extra' && !isIntegratedChild(ev) && state.categories[ev.categoryId]?.habit);
    const stats = extras.reduce((acc, ev) => {
      const progress = eventProgressStats(ev);
      acc.total += progress.total;
      acc.done += progress.done;
      return acc;
    }, { total: 0, done: 0 });
    return { total: stats.total, done: stats.done, percent: makePercent(stats.done, stats.total) };
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
      const weekEvents = visibleEvents(weekEventsForKey(weekKey));
      state.templateEvents
        .filter(ev => ev.day === dayIndex && !isIntegratedChild(ev) && state.categories[ev.categoryId]?.habit)
        .forEach(templateEv => {
          const weekEv = weekEvents.find(ev => ev.source === 'routine' && ev.templateEventId === templateEv.id);
          const scoreSource = weekEv || templateEv;
          const templateProgress = eventProgressStats(templateEv, state.templateEvents);
          const weights = weekEv
            ? eventTrackingWeight(scoreSource, weekEvents)
            : { totalWeight: templateProgress.total, doneWeight: 0, missedWeight: 0, score: 0 };
          items.push({
            type: 'routine',
            done: isEventDone(weekEv),
            score: weights.score,
            totalWeight: weights.totalWeight,
            doneWeight: weights.doneWeight,
            missedWeight: weights.missedWeight,
            label: templateEv.label,
            categoryId: templateEv.categoryId,
            day: dayIndex,
            date,
            start: templateEv.start,
            end: templateEv.end
          });
        });

      weekEvents
        .filter(ev => ev.day === dayIndex && ev.source === 'extra' && !isIntegratedChild(ev) && state.categories[ev.categoryId]?.habit)
        .forEach(ev => {
          const weights = eventTrackingWeight(ev, weekEvents);
          items.push({
            type: 'extra',
            done: isEventDone(ev),
            score: weights.score,
            totalWeight: weights.totalWeight,
            doneWeight: weights.doneWeight,
            missedWeight: weights.missedWeight,
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
      const weight = Number.isFinite(item.totalWeight) ? item.totalWeight : 1;
      group.total += weight;
      group.done += Number.isFinite(item.doneWeight)
        ? item.doneWeight
        : (Number.isFinite(item.score) ? Math.max(0, Math.min(1, item.score)) * weight : (item.done ? 1 : 0));
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
          <strong>${group.percent}% · ${formatScore(group.done)}/${group.total}</strong>
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
      const weight = Number.isFinite(item.totalWeight) ? item.totalWeight : 1;
      group.total += weight;
      group.done += Number.isFinite(item.doneWeight)
        ? item.doneWeight
        : (Number.isFinite(item.score) ? Math.max(0, Math.min(1, item.score)) * weight : (item.done ? 1 : 0));
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
    routineSub.textContent = `${formatScore(routine.done)}/${routine.total} Routine-Blöcke erfüllt`;
    routineFill.style.width = `${routine.percent}%`;

    extraPercent.textContent = `${extra.percent}%`;
    extraSub.textContent = `${formatScore(extra.done)}/${extra.total} Extra-To-dos erfüllt`;
    extraFill.style.width = `${extra.percent}%`;

    totalPercent.textContent = `${total.percent}%`;
    totalSub.textContent = `${formatScore(total.done)}/${total.total} insgesamt erfüllt`;
    totalFill.style.width = `${total.percent}%`;

    const buckets = buildTrackingBuckets(range, items);
    renderTrackingTimeline(buckets);
    renderTrackingCategories(items);
    renderTrackingHeatmap(buckets);
    renderTrackingInsights(buckets, items);

    const filter = state.trackingFilter || 'all';
    const visible = items
      .filter(item => filter === 'all' || (filter === 'done' ? item.score >= 1 : item.score < 1))
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
        <span class="tracking-status ${item.score >= 1 ? 'done' : 'open'}">${item.score >= 1 ? 'Erledigt' : `${makePercent(item.score, 1)}% erfüllt`}</span>`;
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
    const isAppliedTemplateRoutine = ev => ev?.source === 'routine' && Boolean(ev.templateEventId);
    const existingTemplateRoutineCount = existing.filter(isAppliedTemplateRoutine).length;
    if (existingTemplateRoutineCount && !confirm(`Routine-Blöcke aus der Vorlage für KW ${weekInfo.week}/${weekInfo.year} ersetzen? ICS-Termine, manuelle Termine und Ganztagstermine bleiben erhalten.`)) return;

    const preservedEvents = existing.filter(ev => !isAppliedTemplateRoutine(ev));
    const appliedTemplateEvents = state.templateEvents.map(templateEv => {
      const instanceId = id();
      return {
      id: instanceId,
      day: templateEv.day,
      start: templateEv.start,
      end: templateEv.end,
      allDay: Boolean(templateEv.allDay),
      date: templateEv.date || null,
      label: templateEv.label,
      title: templateEv.title || templateEv.label,
      categoryId: templateEv.categoryId,
      done: false,
      completed: false,
      missed: false,
      source: 'routine',
      templateEventId: templateEv.id,
      stackedIntoId: null,
      parentId: null,
      autoComplete: Boolean(templateEv.autoComplete),
      autoCompleteFromSubtasks: Boolean(templateEv.autoCompleteFromSubtasks || templateEv.autoComplete),
      subtasks: cloneEventSubtasks(templateEv).map(sub => ({ ...sub, done: false })),
      participants: eventParticipantList(templateEv),
      attendees: eventParticipantList(templateEv),
      inviteMessage: templateEv.inviteMessage || '',
      invitationUid: invitationUidForEvent({ id: instanceId }),
      invitationSequence: 0,
      invitationStatus: 'not-sent',
      invitationError: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    });

    setCurrentWeekEvents([...preservedEvents, ...appliedTemplateEvents]);
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
    weekLabel.classList.add('week-label-clickable');
    weekLabel.title = 'Kalenderwoche auswählen';
    weekLabel.setAttribute('role', 'button');
    weekLabel.tabIndex = 0;
    weekRange.textContent = `${formatLongDate(start)} – ${formatLongDate(end)}`;
    renderMobileControls();
    fillTaskDaySelect();
    todayWeekBtn.classList.toggle('active', state.currentWeekStart === today.weekKey);
    const minWeek = weekStartDate('2026-01-01');
    prevWeekBtn.disabled = getSelectedWeekStartDate() <= minWeek;
  }


  function renderTodoDrawer() {
    const isOpen = Boolean(state.todoDrawerOpen);
    const view = state.drawerView === 'todo' ? 'todo' : 'habit';
    if (isOpen) {
      state.specialEventsDrawerOpen = false;
      document.body.classList.remove('special-events-drawer-open');
      specialEventsBtn?.classList.remove('active');
      specialEventsBtn?.setAttribute('aria-expanded', 'false');
      showSpecialEventOverview();
      if (weekSettings) weekSettings.classList.remove('open');
      if (profileMenu) profileMenu.classList.remove('open');
      if (drawerHabitPanel) drawerHabitPanel.classList.remove('filter-open');
      if (weekDateInput) weekDateInput.blur();
      state.openHeaderTodoDay = null;
    }
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

  setEventDoneStatus(ev, done);
  touchEvent(ev);
  syncParentAutoCompleteForChild(ev);

  saveState();
  renderAll();
}

function toggleMissed(eventId) {
  const ev = currentEvents().find(x => x.id === eventId);
  if (!ev) return;

  ev.missed = !Boolean(ev.missed);

  // Wenn nicht eingehalten, dann nicht gleichzeitig erledigt
  if (ev.missed) setEventDoneStatus(ev, false);
  touchEvent(ev);
  syncParentAutoCompleteForChild(ev);

  saveState();
  renderAll();
}

  // ==================================================
  // EVENT LISTENERS
  // ==================================================

  templateModeBtn.onclick = () => {
    closeAllPopovers();
    state.todoDrawerOpen = false;
    state.plannerMode = 'template';
    state.viewMode = 'calendar';
    saveState();
    renderAll();
  };
  weekModeBtn.onclick = () => {
    closeAllPopovers();
    state.todoDrawerOpen = false;
    state.plannerMode = 'week';
    state.viewMode = 'calendar';
    const today = getTodayInfo();
    if (state.currentWeekStart === today.weekKey) state.activeHabitDay = today.dayIndex;
    saveState();
    renderAll();
  };
  trackingModeBtn.onclick = () => {
    closeAllPopovers();
    state.todoDrawerOpen = false;
    state.plannerMode = 'tracking';
    state.viewMode = 'calendar';
    saveState();
    renderAll();
  };
  async function persistCalendarFeedChange(previousFeed, successMessage) {
    saveState();
    renderCalendarFeedSettings();
    if (!cloudUser) {
      state.calendarFeed = previousFeed;
      saveState();
      renderCalendarFeedSettings();
      if (calendarFeedStatus) calendarFeedStatus.textContent = 'Bitte einloggen, damit der Kalenderlink serverseitig gespeichert werden kann.';
      return false;
    }
    if (calendarFeedStatus) calendarFeedStatus.textContent = 'Speichere Kalenderfreigabe...';
    try {
      await saveCloudState(clone(state), { throwOnError: true });
      renderCalendarFeedSettings();
      if (calendarFeedStatus) calendarFeedStatus.textContent = successMessage || 'Kalenderfreigabe gespeichert.';
      return true;
    } catch (err) {
      state.calendarFeed = previousFeed;
      saveState();
      renderCalendarFeedSettings();
      if (calendarFeedStatus) calendarFeedStatus.textContent = `Kalenderfreigabe konnte nicht gespeichert werden: ${err.message || err}`;
      return false;
    }
  }

  if (calendarFeedEnabled) {
    calendarFeedEnabled.addEventListener('change', async () => {
      const previousFeed = clone(ensureCalendarFeedSettings());
      const feed = ensureCalendarFeedSettings({ ensureToken: calendarFeedEnabled.checked });
      feed.enabled = calendarFeedEnabled.checked;
      if (feed.enabled) ensureCalendarFeedSettings({ ensureToken: true });
      await persistCalendarFeedChange(previousFeed, feed.enabled ? 'Freigabe aktiv und gespeichert.' : 'Freigabe deaktiviert und gespeichert.');
    });
  }
  if (enableCalendarFeedBtn) {
    enableCalendarFeedBtn.addEventListener('click', async () => {
      const previousFeed = clone(ensureCalendarFeedSettings());
      const feed = ensureCalendarFeedSettings({ ensureToken: true });
      feed.enabled = true;
      await persistCalendarFeedChange(previousFeed, 'Freigabe aktiv und gespeichert.');
    });
  }
  if (regenerateCalendarFeedTokenBtn) {
    regenerateCalendarFeedTokenBtn.addEventListener('click', async () => {
      if (!confirm('Neuen Kalenderfeed-Token erstellen? Der bisherige Link funktioniert danach nicht mehr.')) return;
      const previousFeed = clone(ensureCalendarFeedSettings());
      const feed = ensureCalendarFeedSettings();
      feed.token = generateCalendarFeedToken();
      feed.enabled = true;
      await persistCalendarFeedChange(previousFeed, 'Neuer Kalenderlink aktiv und gespeichert.');
    });
  }
  if (copyCalendarFeedBtn) {
    copyCalendarFeedBtn.addEventListener('click', async () => {
      const link = calendarFeedLink();
      if (!link) return;
      try {
        await navigator.clipboard.writeText(link);
        calendarFeedStatus.textContent = 'Kalenderlink kopiert. Ein neuer Token macht den alten Link ungültig.';
      } catch {
        calendarFeedUrl.focus();
        calendarFeedUrl.select();
        document.execCommand('copy');
        calendarFeedStatus.textContent = 'Kalenderlink kopiert.';
      }
    });
  }
  if (specialEventsBtn) {
    specialEventsBtn.addEventListener('click', () => {
      if (state.specialEventsDrawerOpen) closeSpecialEventsModal();
      else openSpecialEventsModal();
    });
  }
  if (closeSpecialEventsModalBtn) closeSpecialEventsModalBtn.addEventListener('click', closeSpecialEventsModal);
  if (specialEventsModalBackdrop) {
    specialEventsModalBackdrop.addEventListener('click', e => {
      if (e.target === specialEventsModalBackdrop) closeSpecialEventsModal();
    });
  }
  if (specialEventFormBackdrop) {
    specialEventFormBackdrop.addEventListener('click', e => {
      if (e.target === specialEventFormBackdrop) { showSpecialEventOverview(); renderSpecialEventsModal(); }
    });
  }
  if (showSpecialEventFormBtn) {
    showSpecialEventFormBtn.addEventListener('click', () => {
      resetSpecialEventForm();
      showSpecialEventForm();
    });
  }
  if (closeSpecialEventFormBtn) closeSpecialEventFormBtn.addEventListener('click', () => { showSpecialEventOverview(); renderSpecialEventsModal(); });
  if (cancelSpecialEventBtn) cancelSpecialEventBtn.addEventListener('click', () => { showSpecialEventOverview(); renderSpecialEventsModal(); });
  if (specialEventTypeFilter) specialEventTypeFilter.addEventListener('change', () => { state.specialEventTypeFilter = specialEventTypeFilter.value; saveState(); renderSpecialEventsModal(); });
  if (specialEventRangeFilter) specialEventRangeFilter.addEventListener('change', () => { state.specialEventRangeFilter = specialEventRangeFilter.value; saveState(); renderSpecialEventsModal(); });
  if (specialEventForm) specialEventForm.addEventListener('submit', saveSpecialEventFromForm);
  if (specialEventType) specialEventType.addEventListener('change', updateSpecialEventZodiacPreview);
  if (specialEventDate) specialEventDate.addEventListener('click', openSpecialDatePicker);
  if (specialEventDatePickerBtn) specialEventDatePickerBtn.addEventListener('click', openSpecialDatePicker);

  applyTemplateBtn.onclick = applyTemplateToWeek;
  prevWeekBtn.onclick = () => changeWeek(-1);
  nextWeekBtn.onclick = () => changeWeek(1);
  todayWeekBtn.onclick = () => {
    const today = getTodayInfo();
    state.currentWeekStart = today.weekKey;
    state.mobileCalendarStartDay = null;
    state.activeHabitDay = today.dayIndex;
    state.plannerMode = state.plannerMode === 'template' ? 'week' : state.plannerMode;
    currentWeekEvents();
    saveState();
    renderAll();
  };
  if (weekLabel) {
    weekLabel.addEventListener('click', openWeekPicker);
    weekLabel.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') openWeekPicker(e); });
  }
  if (mobileWeekSummaryBtn) {
    mobileWeekSummaryBtn.addEventListener('click', openWeekPicker);
    mobileWeekSummaryBtn.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') openWeekPicker(e); });
  }
  if (mobileControlsToggleBtn) {
    mobileControlsToggleBtn.addEventListener('click', () => {
      state.mobileControlsOpen = !state.mobileControlsOpen;
      saveState();
      renderMobileControls();
    });
  }

  weekDateInput.onchange = () => {
    if (!weekDateInput.value) return;
    state.currentWeekStart = clampWeekKey(weekDateInput.value);
    state.mobileCalendarStartDay = null;
    const today = getTodayInfo();
    if (state.currentWeekStart === today.weekKey) state.activeHabitDay = today.dayIndex;
    currentWeekEvents();
    saveState();
    renderAll();
  };

  if (weekSettingsBtn && weekSettings) {
    weekSettingsBtn.onclick = (e) => {
      e.stopPropagation();
      if (profileMenu) profileMenu.classList.remove('open');
      if (drawerHabitPanel) drawerHabitPanel.classList.remove('filter-open');
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
    if (weekSettings) weekSettings.classList.remove('open');
    if (drawerHabitPanel) drawerHabitPanel.classList.remove('filter-open');
    profileMenu.classList.toggle('open');
  };
  if (profileLogoutBtn) profileLogoutBtn.onclick = signOut;
  if (profileAccountBtn) profileAccountBtn.onclick = openAccountModal;
  if (openCalendarFeedModalBtn) openCalendarFeedModalBtn.onclick = openCalendarFeedModal;
  if (closeAccountModalBtn) closeAccountModalBtn.onclick = closeAccountModal;
  if (closeAccountModalFooterBtn) closeAccountModalFooterBtn.onclick = closeAccountModal;
  if (accountModalBackdrop) accountModalBackdrop.addEventListener('click', e => { if (e.target === accountModalBackdrop) closeAccountModal(); });
  if (closeCalendarFeedModalBtn) closeCalendarFeedModalBtn.onclick = closeCalendarFeedModal;
  if (closeCalendarFeedModalFooterBtn) closeCalendarFeedModalFooterBtn.onclick = closeCalendarFeedModal;
  if (calendarFeedModalBackdrop) calendarFeedModalBackdrop.addEventListener('click', e => { if (e.target === calendarFeedModalBackdrop) closeCalendarFeedModal(); });
  if (profileHelpBtn) profileHelpBtn.onclick = openHelpModal;
  if (closeHelpModalBtn) closeHelpModalBtn.onclick = closeHelpModal;
  if (helpModalBackdrop) helpModalBackdrop.addEventListener('click', e => {
    if (e.target === helpModalBackdrop) closeHelpModal();
  });
  document.addEventListener('click', (e) => {
    if (profileMenu && !profileMenu.contains(e.target)) profileMenu.classList.remove('open');
  });
  skipLoginBtn.onclick = skipLoginLocal;
  authPassword.addEventListener('keydown', e => { if (e.key === 'Enter') signInWithPassword(); });

  drawerHabitBtn.onclick = () => { closeAllPopovers(); state.drawerView = 'habit'; saveState(); renderTodoDrawer(); renderHabits(); };
  drawerTodoBtn.onclick = () => { closeAllPopovers(); state.drawerView = 'todo'; saveState(); renderTodoDrawer(); setTimeout(() => todoInput.focus(), 80); };
  if (drawerFilterMobileToggle && drawerHabitPanel) {
    drawerFilterMobileToggle.onclick = () => {
      if (weekSettings) weekSettings.classList.remove('open');
      if (profileMenu) profileMenu.classList.remove('open');
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
      closeAllPopovers();
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
  drawerDaySelect.onchange = () => { closeAllPopovers(); state.activeHabitDay = Number(drawerDaySelect.value); updateDrawerFilterMobileLabel(); saveState(); renderAll(); };
  drawerHabitFilter.onchange = () => { state.drawerHabitFilter = drawerHabitFilter.value; updateDrawerFilterMobileLabel(); saveState(); renderHabits(); };
  if (drawerTaskAllBtn) drawerTaskAllBtn.onclick = () => { closeAllPopovers(); state.drawerTaskFilter = 'all'; saveState(); renderAll(); };
  if (drawerTaskTimedBtn) drawerTaskTimedBtn.onclick = () => { closeAllPopovers(); state.drawerTaskFilter = 'timed'; saveState(); renderAll(); };
  if (drawerTaskUntimedBtn) drawerTaskUntimedBtn.onclick = () => { closeAllPopovers(); state.drawerTaskFilter = 'untimed'; saveState(); renderAll(); };
  if (drawerTaskFilterSelect) drawerTaskFilterSelect.onchange = () => { closeAllPopovers(); state.drawerTaskFilter = drawerTaskFilterSelect.value; saveState(); renderAll(); };
  trackingTodayBtn.onclick = () => { state.trackingView = 'today'; saveState(); renderAll(); };
  trackingWeekBtn.onclick = () => { state.trackingView = 'week'; saveState(); renderAll(); };
  trackingMonthBtn.onclick = () => { state.trackingView = 'month'; saveState(); renderAll(); };
  trackingYearBtn.onclick = () => { state.trackingView = 'year'; saveState(); renderAll(); };
  trackingDateInput.onchange = () => { state.trackingDate = trackingDateInput.value || dateKey(new Date()); saveState(); renderAll(); };
  trackingFilterSelect.onchange = () => { state.trackingFilter = trackingFilterSelect.value; saveState(); renderTracking(); };
  calendarModeBtn.onclick = () => { state.viewMode = 'calendar'; saveState(); renderAll(); };
  taskModeBtn.onclick = () => { closeAllPopovers(); state.viewMode = 'tasks'; saveState(); renderAll(); };
  document.getElementById('taskBackToCalendarBtn').onclick = () => { state.viewMode = 'calendar'; saveState(); renderAll(); };
  taskDaySelect.onchange = () => { state.activeHabitDay = Number(taskDaySelect.value); saveState(); renderAll(); };
  todoDrawerToggleBtn.onclick = () => {
    closeAllPopovers();
    const willOpen = !state.todoDrawerOpen;
    state.todoDrawerOpen = willOpen;
    if (willOpen) {
      state.drawerView = 'habit';
      state.specialEventsDrawerOpen = false;
      showSpecialEventOverview();
    }
    saveState();
    renderTodoDrawer();
    renderSpecialEventsDrawer();
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
  if (todoDrawer) {
    todoDrawer.addEventListener('scroll', () => {
      if (weekSettings) weekSettings.classList.remove('open');
      if (profileMenu) profileMenu.classList.remove('open');
      if (drawerHabitPanel) drawerHabitPanel.classList.remove('filter-open');
    }, { passive: true });
  }
  if (specialEventsDrawer) {
    specialEventsDrawer.addEventListener('scroll', () => {
      if (weekSettings) weekSettings.classList.remove('open');
      if (profileMenu) profileMenu.classList.remove('open');
      closeSpecialDatePicker();
    }, { passive: true });
  }
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
  if (bulkSelectModeBtn) bulkSelectModeBtn.onclick = () => setBulkSelectionMode(!bulkSelectionMode);
  if (bulkClearBtn) bulkClearBtn.onclick = () => { selectedEventIds.clear(); renderCalendar(); renderBulkActionBar(); };
  if (bulkExitBtn) bulkExitBtn.onclick = () => setBulkSelectionMode(false);
  if (bulkInviteBtn) bulkInviteBtn.onclick = () => openBulkActionModal('invite');
  if (bulkDeleteBtn) bulkDeleteBtn.onclick = deleteBulkSelectedEvents;
  if (closeBulkActionModalBtn) closeBulkActionModalBtn.onclick = closeBulkActionModal;
  if (cancelBulkActionBtn) cancelBulkActionBtn.onclick = closeBulkActionModal;
  if (confirmBulkActionBtn) confirmBulkActionBtn.onclick = applyBulkAction;
  if (bulkActionModalBackdrop) bulkActionModalBackdrop.addEventListener('click', e => { if (e.target === bulkActionModalBackdrop) closeBulkActionModal(); });
  if (eventInviteToggle) eventInviteToggle.onclick = () => { invitePanelExpanded = !invitePanelExpanded; renderInvitePanelState(); };
  if (addInviteEmailBtn) addInviteEmailBtn.onclick = addInviteEmailFromInput;
  if (eventInviteEmailInput) eventInviteEmailInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addInviteEmailFromInput();
    }
  });
  if (sendInviteBtn) sendInviteBtn.onclick = () => sendCalendarInvitationForCurrentEvent('REQUEST');
  document.getElementById('cancelModalBtn').onclick = closeModal;
  document.getElementById('saveModalBtn').onclick = () => {
    const categoryId = modalCategory.value;
    const label = modalLabel.value.trim() || state.categories[categoryId].label;
    const day = Number(modalDay.value);
    const start = Number(modalStart.value);
    const end = Number(modalEnd.value);
    const selectedStackedIntoId = modalStackedInto?.value || null;
    const stackedIntoId = selectedStackedIntoId && selectedStackedIntoId !== editingId ? selectedStackedIntoId : null;
    if (Number.isNaN(day) || Number.isNaN(start) || Number.isNaN(end) || end <= start) {
      alert('Die Endzeit muss nach der Startzeit liegen.');
      return;
    }
    if (!addInviteEmailFromInput()) return;
    if (editingId) {
      const ev = currentEvents().find(x => x.id === editingId);
      if (ev) {
        const participantsBefore = participantSignature(eventParticipantList(ev));
        const participantDraftChanged = participantSignature(inviteDraftAttendees) !== participantsBefore;
        if (!canManageParticipants(ev) && participantDraftChanged) {
          alert('Teilnehmer können für importierte Kalender nicht bearbeitet werden.');
          return;
        }
        const autoComplete = Boolean(modalAutoComplete?.checked);
        Object.assign(ev, {
          day,
          start,
          end,
          label,
          categoryId,
          stackedIntoId,
          parentId: null,
          autoComplete,
          autoCompleteFromSubtasks: autoComplete,
          subtasks: cloneEventSubtasks({ subtasks: eventDraftSubtasks }),
          updatedAt: new Date().toISOString()
        });
        if (isExternalIcsEvent(ev)) {
          ev.date = isTemplateMode() ? null : dateKey(getDayDate(day));
          recordExternalLocalOverrides(ev, { label, categoryId, day, start, end, date: ev.date, stackedIntoId, parentId: null });
        } else {
          applyInviteDraftToEvent(ev);
        }
        const participantsAfter = participantSignature(eventParticipantList(ev));
        if (participantsBefore !== participantsAfter && routineParticipantScopeEligible(ev)) {
          const applyFuture = confirm('Diese Teilnehmeränderung gilt für:\n\nOK = Alle zukünftigen Termine dieser Routine\nAbbrechen = Nur diesen Termin');
          if (applyFuture) applyParticipantsToRoutineTemplate(ev);
        }
        syncEventAutoComplete(ev);
        syncParentAutoCompleteForChild(ev);
      }
    } else {
  const newEventId = id();

  const newEvent = {
    id: newEventId,
    day,
    start,
    end,
    label,
    categoryId,
    done: false,
    completed: false,
    missed: false,
    source: (presetSource || (isTemplateMode() ? 'routine' : 'extra')),
    templateEventId: null,
    stackedIntoId,
    autoComplete: Boolean(modalAutoComplete?.checked),
    autoCompleteFromSubtasks: Boolean(modalAutoComplete?.checked),
    subtasks: cloneEventSubtasks({ subtasks: eventDraftSubtasks }),
    participants: [],
    attendees: [],
    inviteMessage: '',
    invitationUid: invitationUidForEvent({ id: newEventId }),
    invitationSequence: 0,
    invitationStatus: 'not-sent',
    invitationError: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  applyInviteDraftToEvent(newEvent);
  currentEvents().push(newEvent);

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
  document.getElementById('deleteBlockBtn').onclick = async () => {
    if (!editingId) return;
    const ev = currentEvents().find(item => item.id === editingId);
    if (isExternalIcsEvent(ev)) {
      if (!confirm('Diesen externen Termin nur in dieser App ausblenden?\n\nDer Termin bleibt im externen Kalender bestehen.')) return;
      recordExternalLocalOverrides(ev, { hidden: true });
      ev.syncStatus = 'local-hidden';
      currentEvents().forEach(item => {
        if (item.stackedIntoId === editingId) item.stackedIntoId = null;
        if (item.parentId === editingId) item.parentId = null;
      });
      touchEvent(ev);
      saveState();
      renderAll();
      closeModal();
      return;
    }
    if (eventParticipantList(ev).length && ev.invitationSentAt) {
      const sendCancel = confirm('Für diesen Termin wurden Einladungen gesendet. Auch eine Absage an die Teilnehmer senden?');
      if (sendCancel) {
        const sent = await sendCalendarInvitationForCurrentEvent('CANCEL');
        if (!sent && !confirm('Absage konnte nicht gesendet werden. Termin trotzdem nur in deiner App löschen?')) return;
      } else if (!confirm('Termin nur in deiner App löschen?')) {
        return;
      }
    }
    currentEvents().forEach(item => {
      if (item.stackedIntoId === editingId) item.stackedIntoId = null;
      if (item.parentId === editingId) item.parentId = null;
    });
    setCurrentEvents(currentEvents().filter(item => item.id !== editingId));
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
      if (bulkActionModalBackdrop?.style.display === 'flex') { closeBulkActionModal(); return; }
      if (bulkSelectionMode) { setBulkSelectionMode(false); return; }
      const icsModal = document.getElementById('icsModal');
      if (icsModal && !icsModal.classList.contains('hidden')) icsModal.classList.add('hidden');
      else if (specialEventFormBackdrop?.style.display === 'flex') { showSpecialEventOverview(); renderSpecialEventsModal(); }
      else if (calendarFeedModalBackdrop?.style.display === 'flex') closeCalendarFeedModal();
      else if (accountModalBackdrop?.style.display === 'flex') closeAccountModal();
      else if (helpModalBackdrop?.style.display === 'flex') closeHelpModal();
      else if (modalBackdrop.style.display === 'flex') closeModal();
      else if (state.specialEventsDrawerOpen) closeSpecialEventsModal();
      else if (state.todoDrawerOpen) {
        state.todoDrawerOpen = false;
        saveState();
        renderTodoDrawer();
      }
    }
  });
  window.addEventListener('resize', () => {
    renderCalendar();
    renderMobileControls();
    if (document.getElementById('specialDatePicker')?.classList.contains('open')) positionSpecialDatePicker();
    if (document.getElementById('weekPickerPopover')?.classList.contains('open')) positionWeekPicker();
  });


  let mobileSwipeStart = null;
  let mobileSwipeLockUntil = 0;

  function mobileSwipeTransformTargets() {
    if (!calendar) return [];
    return Array.from(calendar.querySelectorAll(':scope > .head-cell:not(:first-child), :scope > .all-day-day, :scope > .day-column'));
  }

  function setMobileSwipeTransform(value = '', animate = false) {
    if (!calendar) return;
    calendar.classList.toggle('mobile-swipe-animating', animate);
    mobileSwipeTransformTargets().forEach(el => { el.style.transform = value; });
    if (animate) window.setTimeout(() => calendar.classList.remove('mobile-swipe-animating'), MOBILE_SWIPE_ANIMATION_MS + 40);
  }

  function resetMobileSwipeVisual(animate = true) {
    setMobileSwipeTransform('', animate);
  }

  function isBlockingMobileCalendarSwipe(target) {
    if (!isMobileViewport() || isDragging || eventResizeState || Date.now() < mobileSwipeLockUntil) return true;
    if (state.todoDrawerOpen || state.specialEventsDrawerOpen) return true;
    if (target?.closest?.('.event, .event-resize-handle, .modal, .ics-modal-card, .todo-drawer, .special-events-drawer, .profile-menu, button, input, select, textarea, [data-horizontal-scroll]')) return true;
    const icsModal = document.getElementById('icsModal');
    return Boolean(
      (icsModal && !icsModal.classList.contains('hidden')) ||
      modalBackdrop?.style.display === 'flex' ||
      calendarFeedModalBackdrop?.style.display === 'flex' ||
      accountModalBackdrop?.style.display === 'flex' ||
      helpModalBackdrop?.style.display === 'flex' ||
      specialEventFormBackdrop?.style.display === 'flex'
    );
  }

  if (calendarWrap) {
    calendarWrap.addEventListener('pointerdown', e => {
      if (!['touch', 'pen'].includes(e.pointerType)) return;
      if (isBlockingMobileCalendarSwipe(e.target) || e.clientX < MOBILE_SWIPE_EDGE_GUARD) {
        mobileSwipeStart = null;
        return;
      }
      mobileSwipeStart = {
        pointerId: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        lastX: e.clientX,
        lastY: e.clientY,
        time: Date.now(),
        horizontal: false,
        cancelled: false,
        navigated: false
      };
      try { calendarWrap.setPointerCapture?.(e.pointerId); } catch {}
      if (calendar) calendar.classList.remove('mobile-swipe-animating');
    });

    calendarWrap.addEventListener('pointermove', e => {
      if (!mobileSwipeStart || e.pointerId !== mobileSwipeStart.pointerId) return;
      if (isBlockingMobileCalendarSwipe(e.target)) {
        mobileSwipeStart = null;
        resetMobileSwipeVisual();
        return;
      }
      const dx = e.clientX - mobileSwipeStart.x;
      const dy = e.clientY - mobileSwipeStart.y;
      mobileSwipeStart.lastX = e.clientX;
      mobileSwipeStart.lastY = e.clientY;
      if (!mobileSwipeStart.horizontal) {
        if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx) * 1.15) {
          mobileSwipeStart.cancelled = true;
          resetMobileSwipeVisual(false);
          return;
        }
        if (Math.abs(dx) < 14 || Math.abs(dx) < Math.abs(dy) * 1.45) return;
        mobileSwipeStart.horizontal = true;
      }
      if (!mobileSwipeStart.horizontal || mobileSwipeStart.cancelled) return;
      e.preventDefault();
      const previewX = clamp(dx * 0.32, -46, 46);
      setMobileSwipeTransform(`translateX(${previewX}px)`);
    });

    const finishPointerSwipe = e => {
      if (!mobileSwipeStart || e.pointerId !== mobileSwipeStart.pointerId) return;
      const swipe = mobileSwipeStart;
      mobileSwipeStart = null;
      try { calendarWrap.releasePointerCapture?.(swipe.pointerId); } catch {}
      if (swipe.cancelled || swipe.navigated || isBlockingMobileCalendarSwipe(e.target)) {
        resetMobileSwipeVisual();
        return;
      }
      const dx = e.clientX - swipe.x;
      const dy = e.clientY - swipe.y;
      const elapsed = Math.max(1, Date.now() - swipe.time);
      const velocity = Math.abs(dx) / elapsed;
      const clearHorizontal = Math.abs(dx) >= Math.abs(dy) * MOBILE_SWIPE_HORIZONTAL_RATIO;
      const passesDistance = Math.abs(dx) >= MOBILE_SWIPE_MIN_DISTANCE;
      const passesVelocity = Math.abs(dx) >= MOBILE_SWIPE_FAST_DISTANCE && velocity >= MOBILE_SWIPE_VELOCITY;
      if (!swipe.horizontal || !clearHorizontal || (!passesDistance && !passesVelocity)) {
        resetMobileSwipeVisual();
        return;
      }
      e.preventDefault();
      mobileSwipeLockUntil = Date.now() + MOBILE_SWIPE_LOCK_MS;
      swipe.navigated = true;
      if (calendar) {
        setMobileSwipeTransform(`translateX(${dx < 0 ? -72 : 72}px)`, true);
      }
      window.setTimeout(() => {
        resetMobileSwipeVisual(false);
        shiftMobileCalendarDays(dx < 0 ? 1 : -1);
      }, MOBILE_SWIPE_ANIMATION_MS);
    };

    calendarWrap.addEventListener('pointerup', finishPointerSwipe);
    calendarWrap.addEventListener('pointercancel', e => {
      if (mobileSwipeStart?.pointerId === e.pointerId) {
        mobileSwipeStart = null;
        resetMobileSwipeVisual();
      }
    });
  }
  document.addEventListener('click', e => {
    const picker = document.getElementById('specialDatePicker');
    if (!picker?.classList.contains('open')) return;
    if (picker.contains(e.target) || specialEventDate?.contains(e.target) || specialEventDatePickerBtn?.contains(e.target)) return;
    closeSpecialDatePicker();
  });
  document.addEventListener('click', e => {
    const picker = document.getElementById('weekPickerPopover');
    if (!picker?.classList.contains('open')) return;
    if (picker.contains(e.target) || weekLabel?.contains(e.target) || mobileWeekSummaryBtn?.contains(e.target)) return;
    closeWeekPicker();
  });


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

function icsSyncDebugMatches(value) {
  return String(value?.title || value?.label || value?.summary || '').includes(ICS_SYNC_DEBUG_TEST_TITLE);
}

function logIcsSyncAfterReload(loadedState) {
  const events = Object.values(loadedState?.weekEventsByWeek || {}).flatMap(weekEvents => Array.isArray(weekEvents) ? weekEvents : []);
  console.log('[ICS SYNC DEBUG] after-reload', {
    totalEvents: events.length,
    icsEvents: events.filter(isImportedIcsEvent).length,
    testEvents: events
      .filter(icsSyncDebugMatches)
      .map(event => ({
        id: event.id,
        uid: event.uid || event.sourceUid || event.externalUid || null,
        title: event.title || event.label,
        date: event.date,
        day: event.day,
        start: event.start,
        end: event.end,
        source: event.source,
        importSource: event.importSource,
        stackedIntoId: event.stackedIntoId || null,
        parentId: event.parentId || null,
        hidden: event.localOverrides?.hidden || false
      }))
  });
}

function icsExternalKey(sourceId, externalId) {
  if (!sourceId || !externalId) return null;
  return `${String(sourceId)}:${String(externalId)}`;
}

function icsExternalIdAliases(externalId) {
  if (!externalId) return [];
  const raw = String(externalId);
  const aliases = new Set([raw]);
  if (raw.startsWith('ics_')) aliases.add(raw.slice(4));
  else aliases.add(`ics_${raw}`);
  return [...aliases].filter(Boolean);
}

function specialSuggestionKeyFromIcsEvent(icsEvent) {
  const uid = icsEvent.sourceUid || icsEvent.uid || icsEvent.externalId || icsEvent.id || '';
  const sourceId = icsEvent.sourceId || icsEvent.externalCalendarId || DEFAULT_ICS_SOURCE_ID;
  const start = icsEvent.occurrenceStart || icsEvent.date || '';
  const rule = icsEvent.recurrenceRule || icsEvent.recurrenceFrequency || '';
  const title = icsEvent.title || icsEvent.summary || '';
  return [sourceId, uid, start, rule, title].map(value => String(value).trim()).join('|');
}

function inferSpecialEventType(title) {
  const text = String(title || '').toLowerCase();
  if (text.includes('geburtstag') || text.includes('birthday')) return 'birthday';
  if (text.includes('jahrestag') || text.includes('hochzeitstag') || text.includes('anniversary')) return 'anniversary';
  if (text.includes('jubiläum') || text.includes('jubilaeum') || text.includes('jubilee')) return 'jubilee';
  if (text.includes('erinnerung') || text.includes('reminder')) return 'reminder';
  return 'other';
}

function isSpecialEventSeriesCandidate(icsEvent) {
  const frequency = String(icsEvent.recurrenceFrequency || '').toUpperCase();
  if (!icsEvent?.recurringSeries) return false;
  return frequency === 'YEARLY' || frequency === 'MONTHLY' || frequency === 'RDATE';
}

function acceptedExternalSpecialKeys() {
  const acceptedSuggestions = (state.specialEventSuggestions || [])
    .filter(item => item.status === 'accepted')
    .flatMap(item => [item.sourceKey, item.key, item.externalUid && `uid:${item.sourceId || DEFAULT_ICS_SOURCE_ID}:${item.externalUid}`]);
  const acceptedEvents = (state.specialEvents || [])
    .flatMap(item => [item.externalSourceKey, item.externalUid && `uid:${DEFAULT_ICS_SOURCE_ID}:${item.externalUid}`]);
  return new Set([...acceptedSuggestions, ...acceptedEvents].filter(Boolean));
}

function isAcceptedSpecialExternalSeries(icsEvent) {
  const keys = acceptedExternalSpecialKeys();
  const uidKey = (icsEvent.sourceUid || icsEvent.uid) ? `uid:${icsEvent.sourceId || DEFAULT_ICS_SOURCE_ID}:${icsEvent.sourceUid || icsEvent.uid}` : null;
  return keys.has(icsEvent.sourceKey) || keys.has(specialSuggestionKeyFromIcsEvent(icsEvent)) || (uidKey && keys.has(uidKey));
}

function collectSpecialEventSuggestions(icsEvents) {
  if (!state.specialEventSuggestions) state.specialEventSuggestions = [];
  const known = new Map(state.specialEventSuggestions.map(item => [item.key, item]));
  let created = 0;
  (icsEvents || []).forEach(icsEvent => {
    if (!isSpecialEventSeriesCandidate(icsEvent)) return;
    const key = specialSuggestionKeyFromIcsEvent(icsEvent);
    if (!key || known.has(key)) return;
    const now = new Date().toISOString();
    const suggestion = {
      id: `special-suggestion-${id()}`,
      key,
      title: icsEvent.title || icsEvent.summary || 'Besonderes Ereignis',
      date: icsEvent.date || dateKey(new Date()),
      recurrenceRule: icsEvent.recurrenceRule || '',
      recurrenceFrequency: icsEvent.recurrenceFrequency || '',
      externalUid: icsEvent.sourceUid || icsEvent.uid || null,
      sourceId: icsEvent.sourceId || DEFAULT_ICS_SOURCE_ID,
      sourceKey: icsEvent.sourceKey || key,
      suggestedType: inferSpecialEventType(icsEvent.title || icsEvent.summary),
      status: 'pending',
      createdAt: now,
      updatedAt: now
    };
    state.specialEventSuggestions.push(suggestion);
    known.set(key, suggestion);
    created++;
  });
  return created;
}

function normalizeRoundtripText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizeRoundtripEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function eventInviteUidCandidates(ev) {
  const candidates = [ev?.invitationUid, ev?.sourceUid, ev?.externalUid, ev?.uid];
  if (ev?.id && !isImportedIcsEvent(ev)) {
    invitationUidDomainCandidates().forEach(domain => candidates.push(invitationUidForEvent(ev, domain)));
  }
  return candidates
    .map(value => String(value || '').trim().toLowerCase())
    .filter((value, index, list) => Boolean(value) && list.indexOf(value) === index);
}

function ownRoundtripCandidateEvents() {
  const events = [];
  Object.values(state.weekEventsByWeek || {}).forEach(weekEvents => {
    (Array.isArray(weekEvents) ? weekEvents : []).forEach(ev => {
      if (!ev || isImportedIcsEvent(ev) || isIntegratedChild(ev)) return;
      events.push(ev);
    });
  });
  return events;
}

function buildOwnInvitationUidIndex() {
  const byUid = new Map();
  ownRoundtripCandidateEvents().forEach(ev => {
    eventInviteUidCandidates(ev).forEach(uid => {
      if (!byUid.has(uid)) byUid.set(uid, ev);
    });
  });
  return byUid;
}

function participantEmailsForEvent(ev) {
  const raw = Array.isArray(ev?.participants) ? ev.participants : ev?.attendees;
  return (Array.isArray(raw) ? raw : [])
    .map(att => normalizeRoundtripEmail(att?.email || att))
    .filter(Boolean);
}

function externalAttendeeEmails(icsEvent) {
  const raw = Array.isArray(icsEvent?.attendees) ? icsEvent.attendees : [];
  return raw.map(att => normalizeRoundtripEmail(att?.email || att)).filter(Boolean);
}

function hasEmailOverlap(a, b) {
  const set = new Set(a.filter(Boolean));
  return b.some(email => set.has(email));
}

function titleForRoundtrip(ev) {
  return normalizeRoundtripText(ev?.label || ev?.title || ev?.summary || '');
}

function dateKeyForLocalRoundtripEvent(localEv) {
  if (localEv?.date || localEv?.displayDate) return localEv.date || localEv.displayDate;
  for (const [weekKey, weekEvents] of Object.entries(state.weekEventsByWeek || {})) {
    if (!Array.isArray(weekEvents)) continue;
    if (weekEvents.some(ev => ev === localEv || ev.id === localEv?.id)) {
      return dateForWeekDay(weekKey, localEv.day);
    }
  }
  return '';
}

function roundtripTimesMatch(localEv, plannerEvent) {
  if (Boolean(localEv?.allDay) !== Boolean(plannerEvent?.allDay)) return false;
  if (String(dateKeyForLocalRoundtripEvent(localEv) || '') !== String(plannerEvent?.date || '')) return false;
  if (localEv?.allDay) return true;
  return Number(localEv?.start) === Number(plannerEvent?.start)
    && Number(localEv?.end) === Number(plannerEvent?.end);
}

function roundtripFallbackEvidence(localEv, plannerEvent, icsEvent) {
  let score = 0;
  const titleMatches = Boolean(titleForRoundtrip(localEv) && titleForRoundtrip(localEv) === titleForRoundtrip(plannerEvent));
  const timeMatches = roundtripTimesMatch(localEv, plannerEvent);
  if (titleMatches) score += 2;
  if (timeMatches) score += 3;
  const localOrganizer = normalizeRoundtripEmail(localEv.organizerEmail || '');
  const externalOrganizer = normalizeRoundtripEmail(icsEvent.organizerEmail || plannerEvent.organizerEmail || '');
  const organizerMatches = Boolean(localOrganizer && externalOrganizer && localOrganizer === externalOrganizer);
  if (organizerMatches) score += 2;
  const localParticipants = participantEmailsForEvent(localEv);
  const externalParticipants = externalAttendeeEmails(icsEvent);
  const participantMatches = Boolean(localParticipants.length && externalParticipants.length && hasEmailOverlap(localParticipants, externalParticipants));
  if (participantMatches) score += 2;
  const localLocation = normalizeRoundtripText(localEv.location || '');
  const externalLocation = normalizeRoundtripText(plannerEvent.location || icsEvent.location || '');
  const locationMatches = Boolean(localLocation && externalLocation && localLocation === externalLocation);
  if (locationMatches) score += 1;
  return { score, titleMatches, timeMatches, organizerMatches, participantMatches, locationMatches };
}

function findRoundtripLocalEvent(plannerEvent, icsEvent, invitationUidIndex) {
  const uid = String(plannerEvent.sourceUid || plannerEvent.externalUid || icsEvent.sourceUid || icsEvent.uid || '').trim().toLowerCase();
  if (uid && invitationUidIndex.has(uid)) return { event: invitationUidIndex.get(uid), reason: 'uid' };

  return null;
}

function markLocalEventMirrored(localEv, plannerEvent, icsEvent, reason) {
  if (!localEv) return;
  const now = new Date().toISOString();
  localEv.source = localEv.source || 'local';
  localEv.mirroredInExternalCalendar = true;
  localEv.externalUid = plannerEvent.sourceUid || plannerEvent.externalUid || icsEvent.sourceUid || icsEvent.uid || localEv.externalUid || null;
  localEv.externalSourceId = plannerEvent.sourceId || plannerEvent.externalCalendarId || DEFAULT_ICS_SOURCE_ID;
  localEv.externalSourceKey = plannerEvent.sourceKey || localEv.externalSourceKey || null;
  localEv.externalMirrorLastSeenAt = now;
  localEv.externalMirrorReason = reason;
  const conflict = !roundtripTimesMatch(localEv, plannerEvent)
    || (titleForRoundtrip(localEv) && titleForRoundtrip(plannerEvent) && titleForRoundtrip(localEv) !== titleForRoundtrip(plannerEvent));
  localEv.externalMirrorConflict = conflict ? {
    detectedAt: now,
    externalTitle: plannerEvent.label || plannerEvent.title || null,
    externalDate: plannerEvent.date || null,
    externalStart: plannerEvent.start,
    externalEnd: plannerEvent.end
  } : null;
  touchEvent(localEv);
}

function removeExistingIcsMirror(existingEntry) {
  if (!existingEntry?.ev || !existingEntry.weekKey) return false;
  const events = state.weekEventsByWeek[existingEntry.weekKey] || [];
  const next = events.filter(ev => ev.id !== existingEntry.ev.id);
  const removed = next.length !== events.length;
  if (removed) state.weekEventsByWeek[existingEntry.weekKey] = next;
  return removed;
}

function removeImportedSeriesBySourceKey(sourceKey, externalUid = null) {
  if ((!sourceKey && !externalUid) || !state.weekEventsByWeek) return;
  Object.keys(state.weekEventsByWeek).forEach(weekKey => {
    state.weekEventsByWeek[weekKey] = (state.weekEventsByWeek[weekKey] || []).filter(ev => {
      if (sourceKey && ev.sourceKey === sourceKey) return false;
      if (externalUid && (ev.sourceUid === externalUid || ev.uid === externalUid)) return false;
      return true;
    });
  });
  currentWeekEvents();
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

function summarizeIcsSkipReasons(skippedEvents) {
  return (skippedEvents || []).reduce((summary, item) => {
    const reason = item.reason || 'unknown parser error';
    summary[reason] = (summary[reason] || 0) + 1;
    return summary;
  }, {});
}

function cleanIcsStoredText(value, maxLength = 240) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function compactIcsPlannerEvent(plannerEvent, existing = null) {
  const keepExisting = (field, fallback) => existing && existing[field] !== undefined ? existing[field] : fallback;
  const externalOriginal = externalOriginalFromEvent({ ...plannerEvent, externalOriginal: existing?.externalOriginal });
  externalOriginal.title = plannerEvent.title || plannerEvent.label || externalOriginal.title;
  externalOriginal.label = plannerEvent.label || plannerEvent.title || externalOriginal.label;
  externalOriginal.date = plannerEvent.date || externalOriginal.date;
  externalOriginal.day = plannerEvent.day;
  externalOriginal.start = plannerEvent.start;
  externalOriginal.end = plannerEvent.end;
  externalOriginal.allDay = plannerEvent.allDay;
  externalOriginal.categoryId = 'external';
  externalOriginal.location = cleanIcsStoredText(plannerEvent.location, 160);
  externalOriginal.description = plannerEvent.description || null;
  externalOriginal.duration = plannerEvent.duration;
  externalOriginal.sourceId = plannerEvent.sourceId;
  externalOriginal.externalId = plannerEvent.externalId;
  externalOriginal.externalUid = plannerEvent.externalUid || plannerEvent.sourceUid || null;
  externalOriginal.sourceKey = plannerEvent.sourceKey || null;
  externalOriginal.organizerEmail = plannerEvent.organizerEmail || null;
  externalOriginal.organizerName = plannerEvent.organizerName || null;
  externalOriginal.lastSeenAt = new Date().toISOString();

  const localOverrides = normalizeExternalLocalOverrides(existing?.localOverrides);
  const localTitle = localOverrides.title || localOverrides.label;
  const displayDate = localOverrides.date || plannerEvent.date;
  const displayDay = localOverrides.day !== null ? clamp(Number(localOverrides.day), 0, 6) : plannerEvent.day;
  const displayStart = localOverrides.start !== null ? clamp(Number(localOverrides.start), 0, slotsPerDay - 1) : plannerEvent.start;
  const displayEnd = localOverrides.end !== null ? clamp(Number(localOverrides.end), 1, slotsPerDay) : plannerEvent.end;
  const displayCategory = localOverrides.categoryId && state.categories[localOverrides.categoryId]
    ? localOverrides.categoryId
    : keepExisting('categoryId', plannerEvent.categoryId);

  return {
    id: keepExisting('id', plannerEvent.id),
    day: displayDay,
    start: displayStart,
    end: displayEnd,
    date: displayDate,
    allDay: plannerEvent.allDay,
    label: localTitle || plannerEvent.label,
    title: localTitle || plannerEvent.title,
    categoryId: displayCategory,
    location: externalOriginal.location,
    description: null,
    duration: plannerEvent.duration,
    completed: keepExisting('completed', false),
    done: keepExisting('done', false),
    missed: keepExisting('missed', false),
    source: 'extra',
    templateEventId: null,
    importSource: 'ics',
    provider: plannerEvent.provider || 'ics',
    externalId: plannerEvent.externalId,
    externalCalendarId: plannerEvent.externalCalendarId,
    sourceId: plannerEvent.sourceId,
    externalSourceId: plannerEvent.externalSourceId || plannerEvent.sourceId || plannerEvent.externalCalendarId,
    externalUid: plannerEvent.externalUid || plannerEvent.sourceUid || null,
    sourceUid: plannerEvent.sourceUid,
    sourceKey: plannerEvent.sourceKey,
    externalSourceKey: plannerEvent.externalSourceKey || plannerEvent.sourceKey || null,
    externalOriginal,
    localOverrides,
    externalLocalEditedAt: existing?.externalLocalEditedAt || localOverrides.updatedAt || null,
    organizerEmail: plannerEvent.organizerEmail || null,
    organizerName: plannerEvent.organizerName || null,
    attendees: Array.isArray(plannerEvent.attendees) ? plannerEvent.attendees : [],
    recurrenceId: plannerEvent.recurrenceId,
    occurrenceStart: plannerEvent.occurrenceStart,
    originalStart: plannerEvent.originalStart,
    originalEnd: plannerEvent.originalEnd,
    displayDate: plannerEvent.displayDate,
    splitFromMultiDay: plannerEvent.splitFromMultiDay,
    importedFromIcs: true,
    isExternal: true,
    missingFromLastSync: false,
    syncStatus: localOverrides.hidden ? 'local-hidden' : (plannerEvent.syncStatus || 'synced'),
    readOnly: plannerEvent.readOnly,
    editable: keepExisting('editable', plannerEvent.editable),
    parentId: localOverrides.parentId || keepExisting('parentId', null),
    stackedIntoId: localOverrides.stackedIntoId || keepExisting('stackedIntoId', null),
    category: keepExisting('category', null),
    subtasks: Array.isArray(existing?.subtasks) ? existing.subtasks : [],
    autoComplete: keepExisting('autoComplete', false),
    autoCompleteFromSubtasks: keepExisting('autoCompleteFromSubtasks', false),
    createdAt: keepExisting('createdAt', plannerEvent.createdAt || new Date().toISOString()),
    updatedAt: new Date().toISOString()
  };
}

  function plannerEventFromIcsEvent(icsEvent, index) {
    const eventDateKey = icsEvent.date || dateKey(new Date());
    const weekKey = weekStartKey(dateKeyToLocalDate(eventDateKey));
    const day = clamp(dayIndexInWeek(eventDateKey, weekKey), 0, 6);
    const isAllDay = Boolean(icsEvent.allDay);

    const start = isAllDay ? null : timeValueToSlot(icsEvent.startTime, 36);
    let end = isAllDay ? null : timeValueToSlot(icsEvent.endTime, start + 4);
    if (!isAllDay && end <= start) end = Math.min(start + 4, slotsPerDay);

    const externalId = icsEvent.externalId || icsEvent.uid || icsEvent.id || `ics_${index}_${eventDateKey}_${isAllDay ? 'all-day' : start}`;
    const sourceId = icsEvent.sourceId || icsEvent.externalCalendarId || DEFAULT_ICS_SOURCE_ID;
    const duration = isAllDay ? null : Math.max(0, end - start);
    const stableId = icsEvent.id || `ics_import_${externalId}`;

    return {
  id: String(stableId).replace(/[^a-zA-Z0-9_-]/g, '_'),
  day,
  start,
  end,
  date: eventDateKey,
  allDay: isAllDay,
  label: icsEvent.title || 'Kalendertermin',
  title: icsEvent.title || 'Kalendertermin',
  categoryId: 'external',
  location: cleanIcsStoredText(icsEvent.location, 160),
  description: null,
  duration,

  // wichtig: ICS-Termine sollen wie Planner-Events trackbar sein
  completed: false,
  done: false,
  missed: false,
  source: 'extra',
  templateEventId: null,

  // Herkunft bleibt markiert
  importSource: 'ics',
  provider: icsEvent.provider || 'ics',
  externalId,
  externalCalendarId: icsEvent.externalCalendarId || sourceId,
  sourceId,
  externalSourceId: sourceId,
  externalUid: icsEvent.sourceUid || icsEvent.uid || null,
  sourceUid: icsEvent.sourceUid || icsEvent.uid || null,
  sourceKey: icsEvent.sourceKey || null,
  externalSourceKey: icsEvent.sourceKey || null,
  organizerEmail: icsEvent.organizerEmail || null,
  organizerName: icsEvent.organizerName || null,
  attendees: Array.isArray(icsEvent.attendees) ? icsEvent.attendees : [],
  recurrenceRule: icsEvent.recurrenceRule || null,
  recurrenceFrequency: icsEvent.recurrenceFrequency || null,
  recurringSeries: Boolean(icsEvent.recurringSeries),
  rdateCount: icsEvent.rdateCount || 0,
  recurrenceId: icsEvent.recurrenceId || null,
  occurrenceStart: icsEvent.occurrenceStart || null,
  originalStart: icsEvent.originalStart || null,
  originalEnd: icsEvent.originalEnd || null,
  displayDate: icsEvent.displayDate || eventDateKey,
  splitFromMultiDay: Boolean(icsEvent.splitFromMultiDay),
  importedFromIcs: true,
  isExternal: true,
  missingFromLastSync: false,
  syncStatus: 'synced',
  readOnly: isAllDay,

  // true = Doppelklick öffnet Editor, falls du später Kategorie/Subtasks ändern willst
  editable: !isAllDay,
  externalOriginal: null,
  localOverrides: normalizeExternalLocalOverrides(),
  externalLocalEditedAt: null,

  // gleiche Logik wie deine normalen Events
  autoComplete: false,
  subtasks: [],

     createdAt: new Date().toISOString()
  };
}

  function importIcsEventsIntoPlanner(icsEvents) {
  ensureExternalCalendarCategory();
  const createdSuggestions = collectSpecialEventSuggestions(icsEvents);

  const existingByExternalKey = new Map();
  const existingIcsEvents = [];
  const previousWeekEventsByWeek = clone(state.weekEventsByWeek || {});
  const beforeSize = serializedSizeInfo(state);

  if (!state.weekEventsByWeek) state.weekEventsByWeek = {};

  Object.keys(state.weekEventsByWeek).forEach((weekKey) => {
    const events = Array.isArray(state.weekEventsByWeek[weekKey]) ? state.weekEventsByWeek[weekKey] : [];

    events.forEach((ev) => {
      if (ev.importSource === 'ics' && ev.externalId) {
        const entry = { ev, weekKey };
        existingIcsEvents.push(entry);
        icsExternalIdAliases(ev.externalId).forEach((externalIdAlias) => {
          [
            icsExternalKey(ev.sourceId || DEFAULT_ICS_SOURCE_ID, externalIdAlias),
            icsExternalKey(DEFAULT_ICS_SOURCE_ID, externalIdAlias),
            icsExternalKey(ev.externalCalendarId, externalIdAlias),
            icsExternalKey(ev.importSource, externalIdAlias)
          ].filter(Boolean).forEach(key => {
            if (!existingByExternalKey.has(key)) existingByExternalKey.set(key, entry);
          });
        });
      }
    });
  });

  console.log('[ICS] Upserting ICS events');
  const totalBefore = Object.values(state.weekEventsByWeek || {}).reduce((total, weekEvents) => total + (Array.isArray(weekEvents) ? weekEvents.length : 0), 0);

  const invitationUidIndex = buildOwnInvitationUidIndex();
  const importedExternalIds = new Set();
  const skippedEvents = [];
  const processedKeys = new Set();
  let processedCount = 0;
  let createdCount = 0;
  let updatedCount = 0;
  const seenRoundtripLocalEventIds = new Set();

(icsEvents || []).forEach((icsEvent, index) => {
  if (isAcceptedSpecialExternalSeries(icsEvent)) {
    if (icsSyncDebugMatches(icsEvent)) {
      console.log('[ICS SYNC DEBUG] duplicate-check', {
        uid: icsEvent.sourceUid || icsEvent.uid || null,
        title: icsEvent.title || icsEvent.summary || null,
        existingMatch: true,
        matchedEventId: null,
        matchedSource: 'special-events',
        decision: 'skip',
        reason: 'accepted special external series'
      });
    }
    return;
  }
  const plannerEvent = plannerEventFromIcsEvent(icsEvent, index);
  if (icsSyncDebugMatches(plannerEvent) || icsSyncDebugMatches(icsEvent)) {
    console.log('[ICS SYNC DEBUG] transform', {
      parsedEvent: {
        uid: icsEvent.uid || icsEvent.sourceUid || null,
        title: icsEvent.title || icsEvent.summary || null,
        date: icsEvent.date || null,
        start: icsEvent.startTime || null,
        end: icsEvent.endTime || null,
        source: icsEvent.source || null,
        importSource: icsEvent.importSource || null
      },
      internalEvent: {
        id: plannerEvent.id,
        uid: plannerEvent.uid || plannerEvent.sourceUid || plannerEvent.externalUid || null,
        title: plannerEvent.title,
        date: plannerEvent.date,
        start: plannerEvent.start,
        end: plannerEvent.end,
        source: plannerEvent.source,
        type: plannerEvent.type || null,
        stackedIntoId: plannerEvent.stackedIntoId || null,
        parentId: plannerEvent.parentId || null,
        hidden: plannerEvent.localOverrides?.hidden || false
      }
    });
  }
  const externalKey = icsExternalKey(plannerEvent.sourceId, plannerEvent.externalId);

  if (!externalKey) {
    skippedEvents.push({
      reason: 'missing externalId/sourceId',
      title: icsEvent.title || icsEvent.summary || 'Kalendertermin',
      externalId: plannerEvent.externalId || null,
      sourceId: plannerEvent.sourceId || null
    });
    return;
  }

  // verhindert doppelte Termine direkt aus dem ICS-Feed
  if (importedExternalIds.has(externalKey)) {
    if (icsSyncDebugMatches(plannerEvent)) {
      console.log('[ICS SYNC DEBUG] duplicate-check', {
        uid: plannerEvent.sourceUid || plannerEvent.externalUid || null,
        title: plannerEvent.title,
        existingMatch: true,
        matchedEventId: null,
        matchedSource: 'current sync batch',
        decision: 'skip',
        reason: 'duplicate externalId/sourceId',
        externalKey
      });
    }
    skippedEvents.push({
      reason: 'duplicate externalId/sourceId',
      title: icsEvent.title || icsEvent.summary || 'Kalendertermin',
      externalId: plannerEvent.externalId,
      sourceId: plannerEvent.sourceId
    });
    return;
  }
  importedExternalIds.add(externalKey);
  processedKeys.add(externalKey);
  processedCount++;

  const weekKey = weekStartKey(dateKeyToLocalDate(icsEvent.date || dateKey(new Date())));

  if (!state.weekEventsByWeek[weekKey]) state.weekEventsByWeek[weekKey] = [];

  const existingEntry = existingByExternalKey.get(externalKey)
    || existingByExternalKey.get(icsExternalKey(DEFAULT_ICS_SOURCE_ID, plannerEvent.externalId));

  const roundtripMatch = findRoundtripLocalEvent(plannerEvent, icsEvent, invitationUidIndex);
  if (icsSyncDebugMatches(plannerEvent)) {
    console.log('[ICS SYNC DEBUG] duplicate-check', {
      uid: plannerEvent.sourceUid || plannerEvent.externalUid || null,
      title: plannerEvent.title,
      existingMatch: Boolean(roundtripMatch?.event || existingEntry?.ev),
      matchedEventId: roundtripMatch?.event?.id || existingEntry?.ev?.id || null,
      matchedSource: roundtripMatch?.event ? 'local invitation uid' : (existingEntry?.ev ? 'existing imported ics' : null),
      decision: roundtripMatch?.event ? 'skip' : (existingEntry?.ev ? 'update' : 'import'),
      reason: roundtripMatch?.event ? `roundtrip mirror ${roundtripMatch.reason}` : (existingEntry?.ev ? 'existing external event' : 'new external event'),
      externalKey
    });
  }
  if (roundtripMatch?.event) {
    markLocalEventMirrored(roundtripMatch.event, plannerEvent, icsEvent, roundtripMatch.reason);
    seenRoundtripLocalEventIds.add(roundtripMatch.event.id);
    if (existingEntry) removeExistingIcsMirror(existingEntry);
    skippedEvents.push({
      reason: `roundtrip mirror ${roundtripMatch.reason}`,
      title: plannerEvent.title || plannerEvent.label || icsEvent.title || icsEvent.summary || 'Kalendertermin',
      externalId: plannerEvent.externalId,
      sourceId: plannerEvent.sourceId,
      matchedEventId: roundtripMatch.event.id
    });
    return;
  }

  if (existingEntry) {
    const existing = existingEntry.ev;
    const updatedEvent = compactIcsPlannerEvent({ ...plannerEvent, syncStatus: 'updated' }, existing);

    const targetWeekKey = weekStartKey(dateKeyToLocalDate(updatedEvent.date || icsEvent.date || dateKey(new Date())));
    if (!state.weekEventsByWeek[targetWeekKey]) state.weekEventsByWeek[targetWeekKey] = [];
    if (existingEntry.weekKey === targetWeekKey) {
      const existingIndex = state.weekEventsByWeek[targetWeekKey].findIndex(ev => ev.id === existing.id);
      if (existingIndex >= 0) state.weekEventsByWeek[targetWeekKey][existingIndex] = updatedEvent;
      else state.weekEventsByWeek[targetWeekKey].push(updatedEvent);
    } else {
      state.weekEventsByWeek[existingEntry.weekKey] = (state.weekEventsByWeek[existingEntry.weekKey] || [])
        .filter(ev => ev.id !== existing.id);
      state.weekEventsByWeek[targetWeekKey].push(updatedEvent);
    }
    updatedCount++;
  } else {
    plannerEvent.syncStatus = 'new';
    state.weekEventsByWeek[weekKey].push(compactIcsPlannerEvent(plannerEvent));
    createdCount++;
  }
});

  ownRoundtripCandidateEvents().forEach(localEv => {
    if (!localEv.mirroredInExternalCalendar || seenRoundtripLocalEventIds.has(localEv.id)) return;
    localEv.mirroredInExternalCalendar = false;
    localEv.externalMirrorLastMissingAt = new Date().toISOString();
    touchEvent(localEv);
  });

  let missingCount = 0;
  existingIcsEvents.forEach(({ ev }) => {
    const wasProcessed = icsExternalIdAliases(ev.externalId).some((externalIdAlias) => (
      processedKeys.has(icsExternalKey(ev.sourceId || DEFAULT_ICS_SOURCE_ID, externalIdAlias))
      || processedKeys.has(icsExternalKey(DEFAULT_ICS_SOURCE_ID, externalIdAlias))
    ));
    if (wasProcessed) return;
    if (hasExternalLocalEdits(ev)) {
      ev.missingFromLastSync = true;
      ev.syncStatus = normalizeExternalLocalOverrides(ev.localOverrides).hidden ? 'local-hidden-missing' : 'external-missing-local-kept';
      touchEvent(ev);
    } else {
      Object.keys(state.weekEventsByWeek).forEach((weekKey) => {
        state.weekEventsByWeek[weekKey] = (state.weekEventsByWeek[weekKey] || []).filter(item => item.id !== ev.id);
      });
    }
    missingCount++;
  });

  currentWeekEvents();
  const importedDebugEvents = Object.values(state.weekEventsByWeek || {}).flatMap(weekEvents => Array.isArray(weekEvents) ? weekEvents : []).filter(isImportedIcsEvent);
  console.log('[ICS SYNC DEBUG] before-save', {
    importedCount: processedCount,
    totalBefore,
    importedEvents: importedDebugEvents
      .filter(icsSyncDebugMatches)
      .map(event => ({
        id: event.id,
        uid: event.uid || event.sourceUid || event.externalUid || null,
        title: event.title || event.label,
        date: event.date,
        day: event.day,
        start: event.start,
        end: event.end,
        source: event.source,
        importSource: event.importSource,
        stackedIntoId: event.stackedIntoId || null,
        parentId: event.parentId || null,
        hidden: event.localOverrides?.hidden || false
      }))
  });
  const afterSize = serializedSizeInfo(state);
  console.log('[ICS] State size before import', {
    bytes: beforeSize.bytes,
    mb: (beforeSize.bytes / (1024 * 1024)).toFixed(2)
  });
  console.log('[ICS] State size after import', {
    bytes: afterSize.bytes,
    mb: (afterSize.bytes / (1024 * 1024)).toFixed(2),
    importedEvents: processedCount,
    averageBytesPerImportedEvent: processedCount ? Math.round((afterSize.bytes - beforeSize.bytes) / processedCount) : 0
  });
  console.log('[ICS] Saving state');
  try {
    saveState();
  } catch (error) {
    state.weekEventsByWeek = previousWeekEventsByWeek;
    currentWeekEvents();
    console.error('[ICS] Saving state failed; import rolled back', error);
    throw error;
  }
  console.log('[ICS] State saved locally; cloud save queued if enabled');
  const savedIcsEvents = Object.values(state.weekEventsByWeek || {}).flatMap(weekEvents => Array.isArray(weekEvents) ? weekEvents : []).filter(isImportedIcsEvent);
  console.log('[ICS SYNC DEBUG] after-save', {
    totalAfter: Object.values(state.weekEventsByWeek || {}).reduce((total, weekEvents) => total + (Array.isArray(weekEvents) ? weekEvents.length : 0), 0),
    savedIcsCount: savedIcsEvents.length,
    testEventSaved: savedIcsEvents
      .filter(icsSyncDebugMatches)
      .map(event => ({
        id: event.id,
        uid: event.uid || event.sourceUid || event.externalUid || null,
        title: event.title || event.label,
        date: event.date,
        day: event.day,
        start: event.start,
        end: event.end,
        stackedIntoId: event.stackedIntoId || null,
        parentId: event.parentId || null,
        hidden: event.localOverrides?.hidden || false
      }))
  });
  renderAll();
  const allImportedStateEvents = Object.entries(state.weekEventsByWeek || {})
    .flatMap(([weekKey, events]) => (events || []).filter(isImportedIcsEvent).map(ev => ({ weekKey, ev })));
  const visibleImportedStateEvents = currentEvents().filter(isImportedIcsEvent);
  const allDayImportedCount = allImportedStateEvents.filter(({ ev }) => ev.allDay).length;
  const skipReasonsSummary = summarizeIcsSkipReasons(skippedEvents);

  console.log('[ICS] Client processed events:', processedCount);
  console.log('[ICS] Client updated events:', updatedCount);
  console.log('[ICS] Client new events:', createdCount);
  console.log('[ICS] Client missing events:', missingCount);
  console.log('[ICS] Client skipped events:', skippedEvents.length);
  console.table(skipReasonsSummary);
  const hiddenImportedCount = allImportedStateEvents.filter(({ ev }) => isEventLocallyHidden(ev)).length;
  const currentWeekImportedCount = allImportedStateEvents.filter(({ weekKey }) => weekKey === state.currentWeekStart).length;
  const currentWeekHiddenImportedCount = allImportedStateEvents.filter(({ weekKey, ev }) => weekKey === state.currentWeekStart && isEventLocallyHidden(ev)).length;
  console.log('[ICS] Imported ICS state events:', allImportedStateEvents.length);
  console.log('[ICS] Visible ICS events in current week:', visibleImportedStateEvents.length);
  console.log('[ICS] Current visible week:', state.currentWeekStart);
  console.log('[ICS] External visibility diagnostics', {
    importedTotal: allImportedStateEvents.length,
    importedCurrentWeek: currentWeekImportedCount,
    visibleCurrentWeek: visibleImportedStateEvents.length,
    hiddenTotal: hiddenImportedCount,
    hiddenCurrentWeek: currentWeekHiddenImportedCount
  });

  return {
    importedCount: createdCount,
    processedCount,
    updatedCount,
    createdCount,
    missingCount,
    skippedEvents,
    skippedCount: skippedEvents.length,
    skipReasonsSummary,
    allDayImportedCount,
    stateImportedCount: allImportedStateEvents.length,
    visibleImportedCount: visibleImportedStateEvents.length,
    specialSuggestionsCreated: createdSuggestions,
    currentWeekStart: state.currentWeekStart
  };
}

  function formatIcsLastSync(value) {
    if (!value) return 'Noch nicht synchronisiert';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Noch nicht synchronisiert';
    const today = dateKey(new Date());
    const prefix = dateKey(date) === today ? 'heute' : date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `${prefix}, ${date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr`;
  }

  function updateIcsAutoSyncMeta(statusText = null) {
    const status = document.getElementById('icsAutoSyncStatus');
    const lastSync = document.getElementById('icsLastSyncText');
    if (status) status.textContent = statusText || (icsSyncing ? 'Synchronisiere ...' : (icsSyncStatus || 'Bereit'));
    if (lastSync) lastSync.textContent = formatIcsLastSync(localStorage.getItem(ICS_LAST_SUCCESS_KEY));
  }

  function setIcsStatus(message) {
    icsSyncStatus = message || '';
    const status = document.getElementById('icsStatus');
    const progressText = document.getElementById('icsProgressText');
    if (status) status.textContent = icsSyncStatus;
    if (progressText) progressText.textContent = icsSyncStatus || 'Bereit';
    updateIcsAutoSyncMeta();
  }

  function setIcsSyncProgress(progress, message = '') {
    icsSyncProgress = clamp(Number(progress), 0, 100);
    if (message) icsSyncStatus = message;

    const progressFill = document.getElementById('icsProgressFill');
    const progressPercent = document.getElementById('icsProgressPercent');
    const progressText = document.getElementById('icsProgressText');

    if (progressFill) progressFill.style.width = `${icsSyncProgress}%`;
    if (progressPercent) progressPercent.textContent = `${icsSyncProgress}%`;
    if (progressText) progressText.textContent = icsSyncStatus || 'Bereit';
    setIcsStatus(icsSyncStatus);
  }

  function setIcsSyncing(syncing) {
    icsSyncing = Boolean(syncing);
    const syncBtn = document.getElementById('syncIcsBtn');
    const quickSyncBtn = document.getElementById('quickIcsSyncBtn');
    const modal = document.getElementById('icsModal');
    if (syncBtn) {
      syncBtn.disabled = icsSyncing;
      syncBtn.textContent = icsSyncing ? 'Synchronisiere...' : 'Synchronisieren';
    }
    if (quickSyncBtn) quickSyncBtn.disabled = icsSyncing;
    if (modal) modal.classList.toggle('syncing', icsSyncing);
    updateIcsAutoSyncMeta(icsSyncing ? 'Synchronisiere ...' : null);
  }

  async function syncIcsCalendarFromModal({ silent = false } = {}) {
    if (icsSyncing) return false;
    const input = document.getElementById('icsUrlInput');
    const icsUrl = input ? input.value.trim() : '';

    if (!icsUrl) {
      if (!silent) setIcsSyncProgress(0, 'Bitte füge zuerst einen ICS-Link ein.');
      else updateIcsAutoSyncMeta('Bereit');
      return false;
    }

    if (!icsUrl.startsWith('https://')) {
      if (!silent) setIcsSyncProgress(0, 'Bitte nutze den HTTPS-ICS-Link aus Outlook.');
      else updateIcsAutoSyncMeta('Fehler beim Aktualisieren');
      return false;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), ICS_SYNC_TIMEOUT_MS);

    try {
      console.log('[ICS] Sync started');
      console.log('[ICS] Fetching saved ICS URL', { host: (() => { try { return new URL(icsUrl).host; } catch { return 'invalid-url'; } })() });
      setIcsSyncing(true);
      setIcsSyncProgress(10, 'Verbindung wird aufgebaut...');

      setIcsSyncProgress(25, 'Kalenderdatei wird geladen...');
      const response = await fetch('/api/ics-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ icsUrl }),
        signal: controller.signal
      });
      console.log('[ICS] Fetch response', response.status, response.ok);

      setIcsSyncProgress(45, 'Kalenderdaten werden gelesen...');
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || 'ICS-Synchronisation fehlgeschlagen.');
      }

      const events = data.events || [];
      const totalVevents = Number(data.totalVevents) || events.length;
      const serverSkippedEvents = Array.isArray(data.skippedEvents) ? data.skippedEvents : [];
      const serverSkipReasonsSummary = data.skipReasonsSummary || {};
      const recurringSkipped = Number(data.recurringSkipped) || 0;
      const allDaySkipped = Number(data.allDaySkipped) || 0;
      const allDayImported = Number(data.allDayImported) || events.filter(event => event.allDay).length;
      console.log('[ICS] Parsed events', events.length);
      console.log('[ICS] Total VEVENT blocks:', totalVevents);
      console.log('[ICS] Imported events:', events.length);
      console.log('[ICS] Skipped events:', serverSkippedEvents.length);
      console.log('[ICS] Import range:', data.rangeStart ?? null, data.rangeEnd ?? null);
      console.table(serverSkipReasonsSummary);
      if (recurringSkipped) console.warn('[ICS] Recurring events skipped', recurringSkipped);

      setIcsSyncProgress(65, 'Termine werden verarbeitet...');
      setIcsSyncProgress(80, 'Bestehende ICS-Termine werden aktualisiert...');
      const importDiagnostics = importIcsEventsIntoPlanner(events);
      setIcsSyncProgress(90, 'Daten werden gespeichert...');
      try {
        localStorage.setItem('perfekte-woche-ics-url', icsUrl);
      } catch (error) {
        if (isStorageQuotaError(error)) console.warn('[ICS] ICS-URL konnte nicht lokal gespeichert werden, Importdaten sind aber gespeichert.');
        else throw error;
      }
      const clientSkippedEvents = importDiagnostics.skippedEvents || [];
      const totalSkipped = serverSkippedEvents.length + clientSkippedEvents.length;
      const detailParts = [];
      if (recurringSkipped) detailParts.push(`${recurringSkipped} wiederkehrend`);
      if (allDaySkipped) detailParts.push(`${allDaySkipped} ganztägig`);
      if (clientSkippedEvents.length) detailParts.push(`${clientSkippedEvents.length} Duplikate`);
      if (importDiagnostics.specialSuggestionsCreated) detailParts.push(`${importDiagnostics.specialSuggestionsCreated} Vorschläge`);
      const detailText = detailParts.length ? ` · Übersprungen: ${detailParts.join(', ')}` : '';
      const allDayText = allDayImported ? ` · davon ${allDayImported} ganztägig` : '';
      localStorage.setItem(ICS_LAST_SUCCESS_KEY, new Date().toISOString());
      setIcsSyncProgress(100, `Sync abgeschlossen · ${importDiagnostics.processedCount} verarbeitet · ${importDiagnostics.updatedCount} aktualisiert · ${importDiagnostics.createdCount} neu · ${importDiagnostics.missingCount} nicht mehr gefunden · ${totalSkipped} übersprungen${allDayText}${detailText}`);
      console.log('[ICS] Sync diagnostics', {
        totalVevents,
        serverImported: events.length,
        clientProcessed: importDiagnostics.processedCount,
        clientUpdated: importDiagnostics.updatedCount,
        clientCreated: importDiagnostics.createdCount,
        clientMissing: importDiagnostics.missingCount,
        allDayImported,
        serverSkipped: serverSkippedEvents.length,
        clientSkipped: clientSkippedEvents.length,
        stateImportedCount: importDiagnostics.stateImportedCount,
        visibleImportedCount: importDiagnostics.visibleImportedCount,
        currentWeekStart: importDiagnostics.currentWeekStart
      });
      console.log('[ICS] Sync finished');
      updateIcsAutoSyncMeta('Erfolgreich aktualisiert');
      return true;
    } catch (error) {
      console.error('[ICS] Sync failed', error);
      const message = error.name === 'AbortError'
        ? 'ICS Sync Timeout: Kalender antwortet nicht rechtzeitig. Bitte später erneut versuchen.'
        : (error.message || 'ICS Sync fehlgeschlagen: Kalender konnte nicht geladen werden.');
      if (silent) {
        icsSyncStatus = 'Fehler beim Aktualisieren';
        updateIcsAutoSyncMeta('Fehler beim Aktualisieren');
      } else {
        setIcsSyncProgress(100, `Fehler: ${message}`);
      }
      return false;
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

async function syncSavedIcsCalendar({ silent = false } = {}) {
  const savedUrl = localStorage.getItem('perfekte-woche-ics-url') || '';
  const input = document.getElementById('icsUrlInput');
  const modal = document.getElementById('icsModal');

  if (input) input.value = savedUrl;

  if (!savedUrl) {
    if (!silent && modal) {
      modal.classList.remove('hidden');
      setIcsSyncProgress(0, 'Bitte füge zuerst deinen ICS-Link ein.');
      setTimeout(() => input?.focus(), 50);
    }
    updateIcsAutoSyncMeta('Bereit');
    return false;
  }

  return syncIcsCalendarFromModal({ silent });
}

function lastSuccessfulIcsSyncTime() {
  const value = localStorage.getItem(ICS_LAST_SUCCESS_KEY);
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

function shouldRunIcsAutoSync() {
  if (icsSyncing) return false;
  if (!localStorage.getItem('perfekte-woche-ics-url')) return false;
  if (document.hidden) return false;
  if (navigator.onLine === false) return false;
  return Date.now() - lastSuccessfulIcsSyncTime() >= ICS_AUTO_SYNC_INTERVAL_MS;
}

function requestIcsAutoSync(reason = 'auto') {
  if (!shouldRunIcsAutoSync()) {
    updateIcsAutoSyncMeta();
    return;
  }
  console.log('[ICS] Auto sync requested', reason);
  syncSavedIcsCalendar({ silent: true });
}

function startIcsAutoSync() {
  if (icsAutoSyncTimer) return;
  updateIcsAutoSyncMeta();
  window.setTimeout(() => requestIcsAutoSync('startup'), 1500);
  icsAutoSyncTimer = window.setInterval(() => requestIcsAutoSync('interval'), ICS_AUTO_SYNC_INTERVAL_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) requestIcsAutoSync('visible'); });
  window.addEventListener('focus', () => requestIcsAutoSync('focus'));
  window.addEventListener('online', () => requestIcsAutoSync('online'));
}
  
  function initIcsCalendarIntegration() {
    const openBtn = document.getElementById('openIcsModalBtn');
    const closeBtn = document.getElementById('closeIcsModalBtn');
    const closeXBtn = document.getElementById('closeIcsModalXBtn');
    const syncBtn = document.getElementById('syncIcsBtn');
    const quickSyncBtn = document.getElementById('quickIcsSyncBtn');
    const removeBtn = document.getElementById('removeIcsBtn');
    const modal = document.getElementById('icsModal');
    const input = document.getElementById('icsUrlInput');

    if (icsCalendarIntegrationInitialized) return;
    if (!modal || (!openBtn && !quickSyncBtn)) return;
    icsCalendarIntegrationInitialized = true;

    if (input) input.value = localStorage.getItem('perfekte-woche-ics-url') || '';

    const openIcsModal = () => {
      if (!modal) return;
      console.log('[ICS UI] Opening ICS modal');
      profileMenu?.classList.remove('open');
      modal.classList.remove('hidden');
      console.log('[ICS UI] Modal open state:', !modal.classList.contains('hidden'));
      if (!icsSyncing) setIcsSyncProgress(0, 'Bereit');
      setTimeout(() => input?.focus(), 50);
    };

    if (openBtn && modal) {
      openBtn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        console.log('[ICS UI] ICS button clicked');
        openIcsModal();
      });
    }

    const closeIcsModal = () => modal?.classList.add('hidden');

    if (closeBtn && modal) closeBtn.addEventListener('click', closeIcsModal);
    if (closeXBtn && modal) closeXBtn.addEventListener('click', closeIcsModal);

    if (modal) {
      modal.addEventListener('click', (event) => {
        if (event.target === modal) closeIcsModal();
      });
    }

    if (syncBtn) {
  syncBtn.addEventListener('click', syncIcsCalendarFromModal);
}

if (quickSyncBtn) {
  quickSyncBtn.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    console.log('[ICS UI] ICS button clicked');
    openIcsModal();
  });
}

if (removeBtn) {
  removeBtn.addEventListener('click', removeIcsCalendarEvents);
}
}


  // ==================================================
  // INIT
  // ==================================================

function renderAll() { currentWeekEvents(); renderLegend(); fillTodoCategorySelect(); renderTodos(); renderWeekControls(); renderCalendar(); renderHabits(); renderTaskView(); renderTracking(); renderViewMode(); renderPlannerMode(); renderTodoDrawer(); renderCalendarFeedSettings(); renderSpecialEventsButton(); renderSpecialEventsModal(); renderSpecialEventsDrawer(); renderMobileControls(); renderBulkActionBar(); updateIcsAutoSyncMeta(); }
  fillTaskDaySelect();
  renderAll();
  renderAll();
startCurrentTimeTimer();
window.addEventListener('beforeunload', () => {
  if (currentTimeTimer) window.clearInterval(currentTimeTimer);
});
initCloudSync();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initIcsCalendarIntegration, { once: true });
} else {
  initIcsCalendarIntegration();
}
startIcsAutoSync();
})();
