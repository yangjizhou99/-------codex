import initJieba, { tag } from "https://cdn.jsdelivr.net/npm/jieba-wasm@2.4.0/pkg/web/jieba_rs_wasm.js";

const DB_NAME = "native-loop-db";
const DB_VERSION = 3;
const SETTINGS_KEY = "nativeLoop.settings";
const LAST_CONVO_KEY = "nativeLoop.lastConversationId";
const META_SETTINGS_KEY = "settings";
const META_LAST_CONVO_KEY = "lastConversationId";
const META_DEEP_HABITS_KEY = "deepHabits";

const defaultSettings = {
  apiKey: "",
  apiBase: "https://api.deepseek.com/v1",
  model: "deepseek-chat",
  autoAnalyze: true,
  speechLang: "zh-CN",
};

const JIEBA_WASM_URL =
  "https://cdn.jsdelivr.net/npm/jieba-wasm@2.4.0/pkg/web/jieba_rs_wasm_bg.wasm";

const segmenter = {
  ready: false,
  mode: "jieba",
  initPromise: null,
  error: null,
};

const VOCAB_POS_PREFIX = ["n", "v", "a", "d", "t", "s", "l", "i", "r"];
const VOCAB_STOP_WORDS = new Set([
  "的",
  "了",
  "吗",
  "呢",
  "啊",
  "吧",
  "嘛",
  "呀",
  "哦",
  "就",
  "也",
  "都",
  "还",
  "和",
  "跟",
  "与",
  "及",
  "而",
  "而且",
  "但是",
  "所以",
  "因为",
  "如果",
  "然后",
  "只是",
  "不是",
  "没有",
  "不会",
  "把",
  "被",
]);
const VOCAB_SINGLE_KEEP = new Set([
  "想",
  "会",
  "要",
  "去",
  "说",
  "看",
  "做",
  "写",
  "吃",
  "喝",
  "买",
  "玩",
  "问",
  "答",
  "给",
  "来",
  "走",
  "开",
  "读",
  "听",
  "学",
  "住",
  "爱",
  "怕",
  "忙",
  "累",
  "好",
  "慢",
  "快",
  "大",
  "小",
]);
const PRONOUNS = new Set(["我", "你", "他", "她", "它", "我们", "你们", "他们", "她们", "它们"]);
const KEY_VERBS = new Set(["想", "喜欢", "需要", "可以", "会", "要", "打算", "准备", "觉得", "希望"]);

const PATTERN_RULES = [
  {
    test: /^(你好|您好|大家好|早上好|下午好|晚上好)/,
    pattern: "你好",
    usage: "用于问候",
  },
  {
    test: /^我想和/,
    pattern: "我想和某人 V",
    usage: "表达想与他人一起做某事",
  },
  {
    test: /^我想要/,
    pattern: "我想要 A",
    usage: "表达想要某物",
  },
  {
    test: /^我(很|非常|特别)?喜欢/,
    pattern: "我喜欢 A",
    usage: "表达喜好",
  },
  {
    test: /^我经常/,
    pattern: "我经常 V",
    usage: "表达习惯或频率",
  },
  {
    test: /^我正在/,
    pattern: "我正在 V",
    usage: "表达正在进行",
  },
  {
    test: /^我会/,
    pattern: "我会 V",
    usage: "表达能力或将来",
  },
  {
    test: /^我需要/,
    pattern: "我需要 A",
    usage: "表达需求",
  },
  {
    test: /^我可以/,
    pattern: "我可以 V",
    usage: "表达能力或许可",
  },
  {
    test: /^(我打算|我准备)/,
    pattern: "我打算 V",
    usage: "表达计划",
  },
  {
    test: /^我想/,
    pattern: "我想 V",
    usage: "表达意愿或计划",
  },
  {
    test: /^请/,
    pattern: "请 V",
    usage: "礼貌请求",
  },
  {
    test: /^可以.+吗$/,
    pattern: "可以 V 吗",
    usage: "礼貌请求或询问许可",
  },
  {
    test: /^能不能/,
    pattern: "能不能 V",
    usage: "礼貌请求",
  },
  {
    test: /^要不要/,
    pattern: "要不要 V",
    usage: "征询对方意愿",
  },
  {
    test: /^你觉得.+怎么样/,
    pattern: "你觉得 A 怎么样",
    usage: "征询看法",
  },
  {
    test: /^你喜欢.+吗$/,
    pattern: "你喜欢 A 吗",
    usage: "询问喜好",
  },
  {
    test: /^你可以.+吗$/,
    pattern: "你可以 V 吗",
    usage: "礼貌请求",
  },
  {
    test: /^你会.+吗$/,
    pattern: "你会 V 吗",
    usage: "询问能力",
  },
  {
    test: /^有没有/,
    pattern: "有没有 A",
    usage: "询问是否存在",
  },
  {
    test: /^如果.+(就|那)/,
    pattern: "如果 A, 就 B",
    usage: "表达条件关系",
  },
  {
    test: /^因为.+所以/,
    pattern: "因为 A, 所以 B",
    usage: "表达因果关系",
  },
  {
    test: /^虽然.+但是/,
    pattern: "虽然 A, 但是 B",
    usage: "表达转折对比",
  },
  {
    test: /^相比于/,
    pattern: "相比于 A, B 呢",
    usage: "进行对比提问",
  },
];

const CARD_SENTENCE_LIMIT = 2;
const CARD_ENRICH_LIMIT = 20;
const CARD_LANG_LABELS = {
  en: { name: "English", label: "英语" },
};

const state = {
  conversationId: null,
  conversationMeta: null,
  messages: [],
  conversations: [],
  conversationStats: new Map(),
  conversationPage: 1,
  imports: [],
  importPage: 1,
  analyses: new Map(),
  practice: [],
  isSending: false,
  isReanalyzing: false,
  isEnriching: false,
  isImporting: false,
  activeCardPanel: "vocab",
  cardTranslations: new Map(),
  deepHabitPatterns: [],
  cardSelection: new Set(),
  cardBaseSnapshot: { vocabCards: [], phraseCards: [], patternCards: [] },
  recognition: null,
  micActive: false,
};

const importState = {
  raw: "",
  mode: "auto",
  split: "line",
  detectedMode: "alternate",
  speakers: [],
  userSpeaker: null,
  firstRole: "user",
  directSwap: false,
  source: "",
  notice: "",
  fetching: false,
  fetchUrl: "",
  fetchedHtml: "",
  fetchError: "",
  parsed: [],
};

const IMPORT_PREVIEW_LIMIT = 30;
const IMPORT_PAGE_SIZE = 10;

const el = (id) => document.getElementById(id);

const elements = {
  tabs: Array.from(document.querySelectorAll(".tab")),
  panels: {
    chat: el("panel-chat"),
    stats: el("panel-stats"),
    practice: el("panel-practice"),
    cards: el("panel-cards"),
  },
  cardSubTabs: Array.from(document.querySelectorAll(".card-subtab")),
  cardSubPanels: {
    vocab: el("card-subpanel-vocab"),
    phrase: el("card-subpanel-phrase"),
    pattern: el("card-subpanel-pattern"),
  },
  chatWindow: el("chatWindow"),
  chatEmpty: el("chatEmpty"),
  chatInput: el("chatInput"),
  micBtn: el("micBtn"),
  micStatus: el("micStatus"),
  analysisStatus: el("analysisStatus"),
  sendBtn: el("sendBtn"),
  clearInput: el("clearInput"),
  settingsBtn: el("settingsBtn"),
  settingsModal: el("settingsModal"),
  closeSettingsBtn: el("closeSettingsBtn"),
  cancelSettingsBtn: el("cancelSettingsBtn"),
  saveSettingsBtn: el("saveSettingsBtn"),
  apiKeyInput: el("apiKeyInput"),
  apiBaseInput: el("apiBaseInput"),
  modelSelect: el("modelSelect"),
  autoAnalyzeToggle: el("autoAnalyzeToggle"),
  speechLangSelect: el("speechLangSelect"),
  newSessionBtn: el("newSessionBtn"),
  exportBtn: el("exportBtn"),
  importBtn: el("importBtn"),
  importModal: el("importModal"),
  closeImportBtn: el("closeImportBtn"),
  cancelImportBtn: el("cancelImportBtn"),
  confirmImportBtn: el("confirmImportBtn"),
  importInput: el("importInput"),
  importModeSelect: el("importModeSelect"),
  importSplitSelect: el("importSplitSelect"),
  importMapping: el("importMapping"),
  importMeta: el("importMeta"),
  importPreviewWindow: el("importPreviewWindow"),
  swapImportRolesBtn: el("swapImportRolesBtn"),
  refreshStatsBtn: el("refreshStatsBtn"),
  reanalyzeBtn: el("reanalyzeBtn"),
  generatePracticeBtn: el("generatePracticeBtn"),
  practiceList: el("practiceList"),
  practiceMeta: el("practiceMeta"),
  cardLangSelect: el("cardLangSelect"),
  refreshCardsBtn: el("refreshCardsBtn"),
  selectAllCardsBtn: el("selectAllCardsBtn"),
  generateSelectedCardsBtn: el("generateSelectedCardsBtn"),
  enrichCardsBtn: el("enrichCardsBtn"),
  cardStatus: el("cardStatus"),
  vocabCards: el("vocabCards"),
  phraseCards: el("phraseCards"),
  patternCards: el("patternCards"),
  statUtterances: el("statUtterances"),
  statAnalyzed: el("statAnalyzed"),
  statPractice: el("statPractice"),
  statVocab: el("statVocab"),
  statPatterns: el("statPatterns"),
  deepAnalysisBtn: el("deepAnalysisBtn"),
  statHabits: el("statHabits"),
  conversationCount: el("conversationCount"),
  conversationList: el("conversationList"),
  conversationEmpty: el("conversationEmpty"),
  conversationPagination: el("conversationPagination"),
  conversationPrevBtn: el("conversationPrevBtn"),
  conversationNextBtn: el("conversationNextBtn"),
  conversationPageInfo: el("conversationPageInfo"),
  importCount: el("importCount"),
  importList: el("importList"),
  importEmpty: el("importEmpty"),
  importPagination: el("importPagination"),
  importPrevBtn: el("importPrevBtn"),
  importNextBtn: el("importNextBtn"),
  importPageInfo: el("importPageInfo"),
  conversationDetailModal: el("conversationDetailModal"),
  closeConversationDetailBtn: el("closeConversationDetailBtn"),
  conversationDetailTitle: el("conversationDetailTitle"),
  conversationDetailMeta: el("conversationDetailMeta"),
  conversationDetailWindow: el("conversationDetailWindow"),
  importDetailModal: el("importDetailModal"),
  closeImportDetailBtn: el("closeImportDetailBtn"),
  importDetailTitle: el("importDetailTitle"),
  importDetailMeta: el("importDetailMeta"),
  importDetailWindow: el("importDetailWindow"),
};

let settings = { ...defaultSettings };

init();

async function init() {
  bindEvents();
  await openDb();
  settings = await loadSettings();
  applySettingsToUI();
  await loadDeepHabitsFromMeta();
  await initSegmenter();
  await loadConversation();
  renderMessages();
  await refreshStats();
  await refreshConversations({ page: 1 });
  await refreshImports();
  await renderPractice();
  await refreshCards();
  setupSpeechRecognition();
}

async function initSegmenter() {
  if (segmenter.initPromise) {
    await segmenter.initPromise;
    return;
  }
  updateAnalysisStatus({ initializing: true });
  segmenter.initPromise = (async () => {
    try {
      await initJieba(JIEBA_WASM_URL);
      segmenter.ready = true;
      segmenter.mode = "jieba";
      segmenter.error = null;
    } catch (error) {
      console.error("分词初始化失败，已降级", error);
      segmenter.ready = false;
      segmenter.mode = "fallback";
      segmenter.error = error;
    }
  })();
  await segmenter.initPromise;
  updateAnalysisStatus();
}

function bindEvents() {
  elements.tabs.forEach((tab) => {
    tab.addEventListener("click", () => switchPanel(tab.dataset.panel));
  });
  elements.cardSubTabs.forEach((tab) => {
    tab.addEventListener("click", () => switchCardSubPanel(tab.dataset.cardPanel));
  });
  switchCardSubPanel(state.activeCardPanel);

  elements.sendBtn.addEventListener("click", handleSend);
  elements.clearInput.addEventListener("click", () => {
    elements.chatInput.value = "";
    elements.chatInput.focus();
  });
  elements.chatInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  });

  elements.micBtn.addEventListener("click", toggleMic);
  elements.settingsBtn.addEventListener("click", () => openModal(true));
  elements.closeSettingsBtn.addEventListener("click", () => openModal(false));
  elements.cancelSettingsBtn.addEventListener("click", () => openModal(false));
  elements.saveSettingsBtn.addEventListener("click", () => {
    void saveSettingsFromUI();
  });
  elements.newSessionBtn.addEventListener("click", () => {
    void handleNewSession();
  });
  elements.exportBtn.addEventListener("click", () => {
    void exportData();
  });
  elements.importBtn.addEventListener("click", () => openImportModal(true));
  elements.closeImportBtn.addEventListener("click", () => openImportModal(false));
  elements.cancelImportBtn.addEventListener("click", () => openImportModal(false));
  elements.importInput.addEventListener("input", updateImportPreview);
  elements.importModeSelect.addEventListener("change", updateImportPreview);
  elements.importSplitSelect.addEventListener("change", updateImportPreview);
  elements.importMapping.addEventListener("change", handleImportMappingChange);
  elements.swapImportRolesBtn.addEventListener("click", handleSwapImportRoles);
  elements.confirmImportBtn.addEventListener("click", () => {
    void handleConfirmImport();
  });
  elements.refreshStatsBtn.addEventListener("click", () => {
    void refreshStats();
    void refreshConversations();
    void refreshImports();
  });
  if (elements.deepAnalysisBtn) {
    elements.deepAnalysisBtn.addEventListener("click", handleDeepAnalysis);
  }
  elements.reanalyzeBtn.addEventListener("click", handleReanalyzeAll);
  elements.generatePracticeBtn.addEventListener("click", handleGeneratePractice);
  elements.practiceList.addEventListener("click", handlePracticeAction);
  elements.refreshCardsBtn.addEventListener("click", () => {
    refreshCards();
  });
  if (elements.selectAllCardsBtn) {
    elements.selectAllCardsBtn.addEventListener("click", handleToggleSelectAllCards);
  }
  if (elements.generateSelectedCardsBtn) {
    elements.generateSelectedCardsBtn.addEventListener("click", handleEnrichSelectedCards);
  }
  elements.enrichCardsBtn.addEventListener("click", handleEnrichCards);
  elements.cardLangSelect.addEventListener("change", () => {
    renderCards();
  });
  [elements.vocabCards, elements.phraseCards, elements.patternCards].forEach((container) => {
    if (!container) return;
    container.addEventListener("click", handleCardToggle);
    container.addEventListener("change", handleCardSelectionChange);
  });
  if (elements.conversationList) {
    elements.conversationList.addEventListener("click", handleConversationListAction);
    elements.conversationList.addEventListener("change", handleRecordToggleChange);
  }
  if (elements.conversationPrevBtn) {
    elements.conversationPrevBtn.addEventListener("click", () => handleConversationPageChange(-1));
  }
  if (elements.conversationNextBtn) {
    elements.conversationNextBtn.addEventListener("click", () => handleConversationPageChange(1));
  }
  if (elements.closeConversationDetailBtn) {
    elements.closeConversationDetailBtn.addEventListener("click", () =>
      openConversationDetailModal(false)
    );
  }
  if (elements.importList) {
    elements.importList.addEventListener("click", handleImportListAction);
    elements.importList.addEventListener("change", handleRecordToggleChange);
  }
  if (elements.importPrevBtn) {
    elements.importPrevBtn.addEventListener("click", () => handleImportPageChange(-1));
  }
  if (elements.importNextBtn) {
    elements.importNextBtn.addEventListener("click", () => handleImportPageChange(1));
  }
  if (elements.closeImportDetailBtn) {
    elements.closeImportDetailBtn.addEventListener("click", () => openImportDetailModal(false));
  }
}

function switchPanel(panelName) {
  elements.tabs.forEach((tab) => {
    const isActive = tab.dataset.panel === panelName;
    tab.classList.toggle("active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
  });
  Object.entries(elements.panels).forEach(([key, panel]) => {
    panel.classList.toggle("active", key === panelName);
  });
  if (panelName === "cards") {
    switchCardSubPanel(state.activeCardPanel);
    refreshCards();
  }
  if (panelName === "stats") {
    void refreshStats();
    void refreshConversations();
    void refreshImports();
  }
}

function switchCardSubPanel(panelName) {
  const target = ["vocab", "phrase", "pattern"].includes(panelName) ? panelName : "vocab";
  state.activeCardPanel = target;
  elements.cardSubTabs.forEach((tab) => {
    const isActive = tab.dataset.cardPanel === target;
    tab.classList.toggle("active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
  });
  Object.entries(elements.cardSubPanels).forEach(([key, panel]) => {
    if (!panel) return;
    panel.classList.toggle("active", key === target);
  });
}

function openModal(show) {
  elements.settingsModal.classList.toggle("show", show);
  elements.settingsModal.setAttribute("aria-hidden", String(!show));
}

function openImportModal(show) {
  elements.importModal.classList.toggle("show", show);
  elements.importModal.setAttribute("aria-hidden", String(!show));
  if (show) {
    updateImportPreview();
    elements.importInput.focus();
  }
}

function openConversationDetailModal(show) {
  if (!elements.conversationDetailModal) return;
  elements.conversationDetailModal.classList.toggle("show", show);
  elements.conversationDetailModal.setAttribute("aria-hidden", String(!show));
}

function openImportDetailModal(show) {
  if (!elements.importDetailModal) return;
  elements.importDetailModal.classList.toggle("show", show);
  elements.importDetailModal.setAttribute("aria-hidden", String(!show));
}

async function loadSettings() {
  try {
    const saved = await getMetaValue(META_SETTINGS_KEY);
    if (saved && typeof saved === "object") {
      return { ...defaultSettings, ...saved };
    }
  } catch (error) {
    console.warn("设置加载失败", error);
  }
  const legacy = loadLegacySettings();
  if (legacy) {
    void setMetaValue(META_SETTINGS_KEY, legacy);
    return { ...defaultSettings, ...legacy };
  }
  return { ...defaultSettings };
}

function loadLegacySettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY));
    if (saved && typeof saved === "object") {
      return saved;
    }
  } catch (error) {
    console.warn("旧设置读取失败", error);
  }
  return null;
}

async function loadDeepHabitsFromMeta() {
  try {
    const saved = await getMetaValue(META_DEEP_HABITS_KEY);
    if (saved && Array.isArray(saved.patterns)) {
      state.deepHabitPatterns = sanitizeHabitPatterns(saved.patterns);
      return;
    }
  } catch (error) {
    console.warn("习惯挖掘缓存读取失败", error);
  }
  state.deepHabitPatterns = [];
}

async function loadLastConversationId() {
  try {
    const saved = await getMetaValue(META_LAST_CONVO_KEY);
    if (saved) {
      return saved;
    }
  } catch (error) {
    console.warn("会话标记加载失败", error);
  }
  const legacy = localStorage.getItem(LAST_CONVO_KEY);
  if (legacy) {
    void setMetaValue(META_LAST_CONVO_KEY, legacy);
    return legacy;
  }
  return null;
}

function applySettingsToUI() {
  elements.apiKeyInput.value = settings.apiKey;
  elements.apiBaseInput.value = settings.apiBase;
  elements.modelSelect.value = settings.model;
  elements.autoAnalyzeToggle.checked = settings.autoAnalyze;
  elements.speechLangSelect.value = settings.speechLang;
  updateAnalysisStatus();
}

async function saveSettingsFromUI() {
  settings = {
    apiKey: elements.apiKeyInput.value.trim(),
    apiBase: elements.apiBaseInput.value.trim() || defaultSettings.apiBase,
    model: elements.modelSelect.value,
    autoAnalyze: elements.autoAnalyzeToggle.checked,
    speechLang: elements.speechLangSelect.value,
  };
  try {
    await setMetaValue(META_SETTINGS_KEY, settings);
  } catch (error) {
    console.error("设置保存失败", error);
  }
  applySettingsToUI();
  updateSpeechRecognitionLanguage();
  openModal(false);
}

async function handleNewSession() {
  const conversation = await createConversation();
  state.conversationId = conversation.id;
  state.conversationMeta = conversation;
  state.messages = [];
  await setMetaValue(META_LAST_CONVO_KEY, conversation.id);
  renderMessages();
  await refreshStats();
  await refreshConversations();
  await renderPractice();
}

async function loadConversation() {
  let conversation = null;
  const savedId = await loadLastConversationId();
  if (savedId) {
    conversation = await getRecord("conversations", savedId);
  }
  if (!conversation) {
    const allConversations = await getAllRecords("conversations");
    if (allConversations.length) {
      allConversations.sort((a, b) => b.createdAt - a.createdAt);
      conversation = allConversations[0];
    }
  }
  if (!conversation) {
    conversation = await createConversation();
  }
  if (conversation.includeInStats == null) {
    conversation.includeInStats = true;
    await updateRecord("conversations", conversation);
  }
  state.conversationId = conversation.id;
  state.conversationMeta = conversation;
  await setMetaValue(META_LAST_CONVO_KEY, conversation.id);
  const messages = await getAllFromIndex("messages", "conversationId", conversation.id);
  messages.sort((a, b) => a.createdAt - b.createdAt);
  state.messages = messages;

  const analysisRecords = await getAllRecords("analyses");
  const analysisList = dedupeAnalyses(analysisRecords);
  analysisList.sort((a, b) => a.createdAt - b.createdAt);
  state.analyses = new Map();
  analysisList.forEach((record) => state.analyses.set(record.messageId, record));

  const practiceRecords = await getAllRecords("practice");
  practiceRecords.sort((a, b) => b.createdAt - a.createdAt);
  state.practice = practiceRecords;
}

async function handleSend() {
  if (state.isSending) {
    return;
  }
  const text = elements.chatInput.value.trim();
  if (!text) {
    return;
  }

  state.isSending = true;
  const userMessage = await addMessage("user", text);
  appendMessage(userMessage);
  elements.chatInput.value = "";
  updateChatEmpty();
  scrollChatToBottom();

  if (!settings.apiKey) {
    const assistantMessage = await addMessage(
      "assistant",
      "请在设置中填写 DeepSeek API 密钥，才能启用 AI 回复。"
    );
    appendMessage(assistantMessage);
    state.isSending = false;
    if (settings.autoAnalyze) {
      await analyzeAndSave(userMessage);
    }
    refreshStats();
    return;
  }

  const pendingEl = renderPendingMessage();
  scrollChatToBottom();
  try {
    const reply = await fetchChatResponse();
    pendingEl.remove();
    const assistantMessage = await addMessage("assistant", reply);
    appendMessage(assistantMessage);
  } catch (error) {
    console.error(error);
    pendingEl.classList.add("error");
    const detail = formatApiError(error);
    pendingEl.querySelector(".bubble").textContent =
      `无法获取回复，请检查设置或稍后重试。${detail ? `（${detail}）` : ""}`;
  } finally {
    state.isSending = false;
    if (settings.autoAnalyze) {
      await analyzeAndSave(userMessage);
    }
    refreshStats();
  }
  scrollChatToBottom();
}

function renderMessages() {
  elements.chatWindow.innerHTML = "";
  state.messages.forEach((message) => appendMessage(message));
  updateChatEmpty();
  scrollChatToBottom();
}

function appendMessage(message) {
  const messageEl = createMessageElement(message);
  elements.chatWindow.appendChild(messageEl);
}

function renderPendingMessage() {
  const message = {
    id: `pending-${Date.now()}`,
    role: "assistant",
    text: "思考中...",
    createdAt: Date.now(),
  };
  const messageEl = createMessageElement(message);
  messageEl.classList.add("pending");
  elements.chatWindow.appendChild(messageEl);
  return messageEl;
}

function createMessageElement(message) {
  const wrapper = document.createElement("div");
  wrapper.className = `message ${message.role}`;
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = message.text;
  const meta = document.createElement("div");
  meta.className = "meta";
  meta.textContent = formatTime(message.createdAt);
  wrapper.appendChild(bubble);
  wrapper.appendChild(meta);
  return wrapper;
}

function updateChatEmpty() {
  elements.chatEmpty.style.display = state.messages.length ? "none" : "block";
}

function scrollChatToBottom() {
  elements.chatWindow.scrollTop = elements.chatWindow.scrollHeight;
}

async function analyzeAndSave(userMessage) {
  updateAnalysisStatus({ running: true });
  try {
    const analysis = await computeAnalysis(userMessage.text);
    await saveAnalysisForMessage(userMessage, analysis);
    updateAnalysisStatus();
  } catch (error) {
    console.error(error);
    updateAnalysisStatus({ failed: true });
  }
}

async function saveAnalysisForMessage(message, analysis) {
  const existing = await getAllFromIndex("analyses", "messageId", message.id);
  const algoRecord = existing.find((record) => record.engine === "algo");
  const record = {
    id: algoRecord ? algoRecord.id : makeId(),
    conversationId: message.conversationId || state.conversationId,
    messageId: message.id,
    sourceText: message.text,
    data: analysis,
    engine: "algo",
    createdAt: Date.now(),
  };
  if (algoRecord) {
    await updateRecord("analyses", record);
  } else {
    await addRecord("analyses", record);
  }
  state.analyses.set(message.id, record);
}

async function handleReanalyzeAll() {
  if (state.isReanalyzing) {
    return;
  }
  state.isReanalyzing = true;
  elements.reanalyzeBtn.disabled = true;
  await initSegmenter();
  try {
    const [{ conversationIncludeMap, importIncludeMap }, messages, importMessages] =
      await Promise.all([
        loadIncludeMaps(),
        getAllRecords("messages"),
        getAllRecords("importMessages"),
      ]);
    const userMessages = [...messages, ...importMessages]
      .filter((message) => message.role === "user" && message.text && message.text.trim())
      .filter((message) => {
        if (message.importId || getImportIdFromConversationId(message.conversationId)) {
          return isImportIncluded(message.importId, importIncludeMap, message.conversationId);
        }
        return isConversationIncluded(message.conversationId, conversationIncludeMap);
      })
      .sort((a, b) => a.createdAt - b.createdAt);
    if (!userMessages.length) {
      elements.analysisStatus.textContent = "分析：暂无语句";
      return;
    }
    const total = userMessages.length;
    for (let i = 0; i < total; i += 1) {
      const message = userMessages[i];
      elements.analysisStatus.textContent = `分析：重建中 ${i + 1}/${total}`;
      const analysis = await computeAnalysis(message.text);
      await saveAnalysisForMessage(message, analysis);
      if (i % 5 === 0) {
        await delay(0);
      }
    }
    await refreshStats();
    refreshCards();
  } catch (error) {
    console.error(error);
    updateAnalysisStatus({ failed: true });
  } finally {
    state.isReanalyzing = false;
    elements.reanalyzeBtn.disabled = false;
    updateAnalysisStatus();
  }
}

function updateAnalysisStatus({ running = false, failed = false, initializing = false } = {}) {
  if (running) {
    elements.analysisStatus.textContent = "分析：进行中";
    return;
  }
  if (initializing) {
    elements.analysisStatus.textContent = "分析：初始化中";
    return;
  }
  if (failed) {
    elements.analysisStatus.textContent = "分析：失败";
    return;
  }
  if (!segmenter.ready && segmenter.mode === "fallback") {
    elements.analysisStatus.textContent = "分析：降级模式";
    return;
  }
  if (!segmenter.ready) {
    elements.analysisStatus.textContent = "分析：初始化中";
    return;
  }
  elements.analysisStatus.textContent = settings.autoAnalyze ? "分析：自动（算法）" : "分析：手动（算法）";
}

function formatTime(timestamp) {
  if (!timestamp) return "";
  return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDateTime(timestamp) {
  if (!timestamp) return "";
  return new Date(timestamp).toLocaleString([], {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function addMessage(role, text) {
  const message = {
    id: makeId(),
    conversationId: state.conversationId,
    role,
    text,
    createdAt: Date.now(),
  };
  await addRecord("messages", message);
  state.messages.push(message);
  return message;
}

function makeId() {
  if (crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function fetchChatResponse() {
  const payload = {
    model: settings.model,
    messages: buildChatMessages(),
    temperature: 0.7,
    max_tokens: 400,
  };
  const data = await callApiWithRetry(payload, { retries: 1, delayMs: 700 });
  const choice = data.choices && data.choices[0];
  if (!choice || !choice.message) {
    throw new Error("API 返回为空");
  }
  return choice.message.content.trim();
}

function buildChatMessages() {
  const systemPrompt =
    "你是一名语言教练。请先用英文回答，然后用中文括号给出简短翻译。保持简洁，优先回应用户的真实表达。";
  const history = state.messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .slice(-10)
    .map((message) => ({ role: message.role, content: message.text }));
  return [{ role: "system", content: systemPrompt }, ...history];
}

async function computeAnalysis(text) {
  const trimmed = text.trim();
  const clean = normalizeForMatch(trimmed);
  const tags = await getTaggedTokens(trimmed);
  const vocab = extractVocab(tags);
  const patterns = extractPatterns(clean, tags);
  return {
    vocab,
    patterns,
    english_variants: [],
  };
}

function normalizeForMatch(text) {
  return text
    .replace(/[\s\u3000]+/g, "")
    .replace(/[，。！？；：、“”‘’（）()【】《》<>\[\]]/g, "");
}

async function getTaggedTokens(text) {
  if (segmenter.initPromise) {
    await segmenter.initPromise;
  }
  if (segmenter.ready) {
    try {
      return tag(text) || [];
    } catch (error) {
      console.error("分词失败，已降级", error);
    }
  }
  return fallbackTag(text);
}

function fallbackTag(text) {
  const tokens = [];
  const matches = text.match(/[A-Za-z0-9]+|[\u4e00-\u9fa5]+/g) || [];
  matches.forEach((chunk) => {
    if (/^[A-Za-z0-9]+$/.test(chunk)) {
      tokens.push({ word: chunk, tag: "eng" });
      return;
    }
    Array.from(chunk).forEach((char) => {
      tokens.push({ word: char, tag: "x" });
    });
  });
  return tokens;
}

function extractVocab(tags) {
  const results = [];
  const seen = new Set();
  tags.forEach((item) => {
    const word = (item.word || "").trim();
    const pos = item.tag || "";
    if (!word) return;
    if (!isAllowedPos(pos)) return;
    if (VOCAB_STOP_WORDS.has(word)) return;
    if (word.length === 1 && !VOCAB_SINGLE_KEEP.has(word)) return;
    if (seen.has(word)) return;
    seen.add(word);
    results.push({ text: word, pos, gloss: "" });
  });
  return results;
}

function isAllowedPos(pos) {
  if (!pos) return false;
  if (pos === "eng") return true;
  return VOCAB_POS_PREFIX.some((prefix) => pos.startsWith(prefix));
}

function extractPatterns(cleanText, tags) {
  for (const rule of PATTERN_RULES) {
    if (rule.test.test(cleanText)) {
      return [{ pattern: rule.pattern, usage: rule.usage }];
    }
  }
  return [fallbackPattern(tags)];
}

function fallbackPattern(tags) {
  const subject = pickSubject(tags);
  const verbInfo = pickMainVerb(tags, subject.index + 1);
  const object = pickObject(tags, verbInfo.index + 1, verbInfo.word);
  const tokens = [subject.word, verbInfo.word || "V"];
  if (object) {
    tokens.push(object);
  }
  return {
    pattern: formatPatternTokens(tokens),
    usage: "表达日常行为或状态",
  };
}

function pickSubject(tags) {
  for (let i = 0; i < tags.length; i += 1) {
    const word = tags[i].word;
    if (PRONOUNS.has(word)) {
      return { word, index: i };
    }
  }
  return { word: "我", index: -1 };
}

function pickMainVerb(tags, startIndex) {
  for (let i = Math.max(startIndex, 0); i < tags.length; i += 1) {
    const word = tags[i].word;
    const pos = tags[i].tag || "";
    if (pos.startsWith("v")) {
      return { word: KEY_VERBS.has(word) ? word : "V", index: i };
    }
  }
  return { word: "", index: -1 };
}

function pickObject(tags, startIndex, verbWord) {
  const verbHints = {
    喜欢: "A",
    需要: "A",
    想要: "A",
    想: "V",
    会: "V",
    可以: "V",
    打算: "V",
    准备: "V",
    希望: "V",
  };
  if (verbHints[verbWord]) {
    return verbHints[verbWord];
  }
  for (let i = Math.max(startIndex, 0); i < tags.length; i += 1) {
    const pos = tags[i].tag || "";
    if (pos.startsWith("n") || pos.startsWith("a")) {
      return "A";
    }
    if (pos.startsWith("v")) {
      return "V";
    }
  }
  return "";
}

function formatPatternTokens(tokens) {
  const placeholders = new Set(["A", "B", "V"]);
  let result = "";
  let lastToken = "";
  tokens.forEach((token) => {
    if (!token) return;
    const needsSpace =
      result &&
      (placeholders.has(token) || placeholders.has(lastToken));
    if (needsSpace) {
      result += " ";
    }
    result += token;
    lastToken = token;
  });
  return result;
}

async function callApi(payload) {
  const response = await fetch(`${settings.apiBase}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${settings.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const text = await response.text();
    const error = new Error(`API error: ${response.status} ${text}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

async function callApiWithRetry(payload, { retries = 1, delayMs = 600 } = {}) {
  try {
    return await callApi(payload);
  } catch (error) {
    if (!isRetryable(error) || retries <= 0) {
      throw error;
    }
    await delay(delayMs);
    return callApiWithRetry(payload, { retries: retries - 1, delayMs: delayMs * 1.4 });
  }
}

function isRetryable(error) {
  if (!error) return false;
  if (error.name === "TypeError") return true;
  const status = error.status;
  return status === 429 || (status >= 500 && status <= 599);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeParseJson(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fenced && fenced[1]) {
      return JSON.parse(fenced[1]);
    }
    const arrayStart = text.indexOf("[");
    const arrayEnd = text.lastIndexOf("]");
    if (arrayStart !== -1 && arrayEnd !== -1) {
      return JSON.parse(text.slice(arrayStart, arrayEnd + 1));
    }
    const objStart = text.indexOf("{");
    const objEnd = text.lastIndexOf("}");
    if (objStart !== -1 && objEnd !== -1) {
      return JSON.parse(text.slice(objStart, objEnd + 1));
    }
    throw error;
  }
}

async function refreshStats() {
  try {
    const [{ conversationIncludeMap, importIncludeMap }, messages, importMessages, analyses, practice] =
      await Promise.all([
        loadIncludeMaps(),
        getAllRecords("messages"),
        getAllRecords("importMessages"),
        getAllRecords("analyses"),
        getAllRecords("practice"),
      ]);
    const filteredMessages = messages.filter((message) =>
      isConversationIncluded(message.conversationId, conversationIncludeMap)
    );
    const filteredImportMessages = importMessages.filter((message) =>
      isImportIncluded(message.importId, importIncludeMap, message.conversationId)
    );
    const utterances = [...filteredMessages, ...filteredImportMessages].filter(
      (message) => message.role === "user"
    ).length;
    elements.statUtterances.textContent = String(utterances);
    const analysisList = dedupeAnalyses(analyses).filter((record) =>
      isAnalysisIncluded(record, conversationIncludeMap, importIncludeMap)
    );
    elements.statAnalyzed.textContent = String(analysisList.length);
    const filteredPractice = practice.filter((record) => {
      const importId = getImportIdFromConversationId(record.conversationId);
      if (importId) {
        return isImportIncluded(importId, importIncludeMap, record.conversationId);
      }
      return isConversationIncluded(record.conversationId, conversationIncludeMap);
    });
    elements.statPractice.textContent = String(filteredPractice.length);

    const vocabCounts = new Map();
    const patternCounts = new Map();

    analysisList.forEach((record) => {
      const data = record.data || {};
      (data.vocab || []).forEach((item) => {
        const key = item.text || item;
        if (!key) return;
        vocabCounts.set(key, (vocabCounts.get(key) || 0) + 1);
      });
      (data.patterns || []).forEach((item) => {
        if (!item) return;
        const pattern = typeof item === "string" ? item : item.pattern;
        const usage = typeof item === "object" ? item.usage : "";
        if (!pattern) return;
        const current = patternCounts.get(pattern) || { count: 0, usage: "" };
        current.count += 1;
        if (!current.usage && usage) {
          current.usage = usage;
        }
        patternCounts.set(pattern, current);
      });
    });

    renderCountList(elements.statVocab, vocabCounts);
    renderPatternList(elements.statPatterns, patternCounts);
    if (elements.statHabits) {
      if (state.deepHabitPatterns.length) {
        renderHabitList(elements.statHabits, state.deepHabitPatterns);
      } else {
        elements.statHabits.innerHTML = "<li>点击“开始挖掘”分析你的口头禅与惯用句式。</li>";
      }
    }
  } catch (error) {
    console.error(error);
  }
}

async function loadSessionRecords() {
  const [conversations, imports] = await Promise.all([
    getAllRecords("conversations"),
    getAllRecords("imports"),
  ]);
  await ensureIncludeFlags(conversations, "conversations");
  await ensureIncludeFlags(imports, "imports");
  return { conversations, imports };
}

async function ensureIncludeFlags(records, storeName) {
  const updates = [];
  records.forEach((record) => {
    if (!record) return;
    if (record.includeInStats == null) {
      record.includeInStats = true;
      updates.push(updateRecord(storeName, record));
    }
  });
  if (!updates.length) return;
  try {
    await Promise.all(updates);
  } catch (error) {
    console.error("记录更新失败", error);
  }
}

async function loadIncludeMaps() {
  const { conversations, imports } = await loadSessionRecords();
  return buildIncludeMaps(conversations, imports);
}

function buildIncludeMaps(conversations, imports) {
  const conversationIncludeMap = new Map();
  conversations.forEach((record) => {
    if (!record || !record.id) return;
    conversationIncludeMap.set(record.id, record.includeInStats !== false);
  });
  const importIncludeMap = new Map();
  imports.forEach((record) => {
    if (!record || !record.id) return;
    importIncludeMap.set(record.id, record.includeInStats !== false);
  });
  return { conversationIncludeMap, importIncludeMap };
}

function isConversationIncluded(conversationId, includeMap) {
  if (!conversationId) return true;
  if (!includeMap || !includeMap.has(conversationId)) return true;
  return includeMap.get(conversationId);
}

function isImportIncluded(importId, includeMap, conversationId) {
  const resolvedId = importId || getImportIdFromConversationId(conversationId);
  if (!resolvedId) return true;
  if (!includeMap || !includeMap.has(resolvedId)) return true;
  return includeMap.get(resolvedId);
}

function isAnalysisIncluded(record, conversationIncludeMap, importIncludeMap) {
  if (!record) return true;
  const conversationId = record.conversationId;
  if (!conversationId) return true;
  const importId = getImportIdFromConversationId(conversationId);
  if (importId) {
    return isImportIncluded(importId, importIncludeMap, conversationId);
  }
  return isConversationIncluded(conversationId, conversationIncludeMap);
}

function getImportIdFromConversationId(conversationId) {
  if (!conversationId || typeof conversationId !== "string") return null;
  if (!conversationId.startsWith("import:")) return null;
  return conversationId.slice("import:".length);
}

async function refreshConversations({ page } = {}) {
  if (!elements.conversationList) return;
  try {
    const [{ conversations }, messages] = await Promise.all([
      loadSessionRecords(),
      getAllRecords("messages"),
    ]);
    const statsMap = buildConversationStats(messages);
    state.conversationStats = statsMap;
    conversations.sort((a, b) => b.createdAt - a.createdAt);
    state.conversations = conversations;
    const totalPages = Math.max(1, Math.ceil(conversations.length / IMPORT_PAGE_SIZE));
    const nextPage = Math.min(totalPages, Math.max(1, page || state.conversationPage));
    state.conversationPage = nextPage;
    renderConversationList();
  } catch (error) {
    console.error(error);
  }
}

function buildConversationStats(messages) {
  const statsMap = new Map();
  messages.forEach((message) => {
    const conversationId = message.conversationId;
    if (!conversationId) return;
    if (!statsMap.has(conversationId)) {
      statsMap.set(conversationId, { total: 0, user: 0, assistant: 0 });
    }
    const stats = statsMap.get(conversationId);
    stats.total += 1;
    if (message.role === "user") {
      stats.user += 1;
    } else if (message.role === "assistant") {
      stats.assistant += 1;
    }
  });
  return statsMap;
}

function renderConversationList() {
  if (!elements.conversationList || !elements.conversationEmpty || !elements.conversationPagination) {
    return;
  }
  const total = state.conversations.length;
  elements.conversationList.innerHTML = "";
  if (elements.conversationCount) {
    elements.conversationCount.textContent = total ? `共 ${total} 条` : "暂无记录";
  }
  if (!total) {
    elements.conversationEmpty.style.display = "block";
    elements.conversationPagination.style.display = "none";
    return;
  }
  elements.conversationEmpty.style.display = "none";
  const totalPages = Math.max(1, Math.ceil(total / IMPORT_PAGE_SIZE));
  const start = (state.conversationPage - 1) * IMPORT_PAGE_SIZE;
  const pageItems = state.conversations.slice(start, start + IMPORT_PAGE_SIZE);
  pageItems.forEach((record) => {
    const item = document.createElement("li");
    item.className = "import-item";

    const header = document.createElement("div");
    header.className = "import-item-header";
    const title = document.createElement("div");
    title.className = "import-item-title";
    title.textContent = record.title || "会话";
    const time = document.createElement("div");
    time.className = "import-item-time";
    time.textContent = formatDateTime(record.createdAt);
    header.appendChild(title);
    header.appendChild(time);

    const meta = document.createElement("div");
    meta.className = "import-item-meta";
    const metaParts = [];
    if (record.id === state.conversationId) {
      metaParts.push("当前会话");
    }
    const stats = state.conversationStats.get(record.id) || { total: 0, user: 0, assistant: 0 };
    if (stats.total) {
      metaParts.push(`消息 ${stats.total}`);
      metaParts.push(`用户 ${stats.user} / 对方 ${stats.assistant}`);
    } else {
      metaParts.push("暂无消息");
    }
    meta.textContent = metaParts.join(" · ");

    const actions = document.createElement("div");
    actions.className = "import-item-actions";
    const toggle = createIncludeToggle({
      type: "conversation",
      id: record.id,
      include: record.includeInStats,
    });
    const viewBtn = document.createElement("button");
    viewBtn.className = "ghost";
    viewBtn.type = "button";
    viewBtn.textContent = "查看";
    viewBtn.dataset.conversationAction = "view";
    viewBtn.dataset.conversationId = record.id;
    actions.appendChild(toggle);
    actions.appendChild(viewBtn);

    item.appendChild(header);
    item.appendChild(meta);
    item.appendChild(actions);
    elements.conversationList.appendChild(item);
  });

  elements.conversationPagination.style.display = totalPages > 1 ? "flex" : "none";
  if (elements.conversationPageInfo) {
    elements.conversationPageInfo.textContent = `${state.conversationPage} / ${totalPages}`;
  }
  if (elements.conversationPrevBtn) {
    elements.conversationPrevBtn.disabled = state.conversationPage <= 1;
  }
  if (elements.conversationNextBtn) {
    elements.conversationNextBtn.disabled = state.conversationPage >= totalPages;
  }
}

function handleConversationPageChange(delta) {
  const totalPages = Math.max(1, Math.ceil(state.conversations.length / IMPORT_PAGE_SIZE));
  const nextPage = Math.min(totalPages, Math.max(1, state.conversationPage + delta));
  if (nextPage === state.conversationPage) return;
  state.conversationPage = nextPage;
  renderConversationList();
}

function handleConversationListAction(event) {
  const actionTarget = event.target.closest("[data-conversation-action]");
  if (!actionTarget) return;
  const conversationId = actionTarget.dataset.conversationId;
  if (!conversationId) return;
  if (actionTarget.dataset.conversationAction === "view") {
    void openConversationDetail(conversationId);
  }
}

async function openConversationDetail(conversationId) {
  if (!elements.conversationDetailWindow) return;
  const record = state.conversations.find((item) => item.id === conversationId);
  if (!record) return;
  if (elements.conversationDetailTitle) {
    elements.conversationDetailTitle.textContent = record.title || "会话";
  }
  const stats = state.conversationStats.get(record.id) || { total: 0, user: 0, assistant: 0 };
  const metaParts = [];
  if (record.createdAt) metaParts.push(`时间：${formatDateTime(record.createdAt)}`);
  if (stats.total) {
    metaParts.push(`用户 ${stats.user} / 对方 ${stats.assistant}`);
    metaParts.push(`共 ${stats.total} 条`);
  }
  if (elements.conversationDetailMeta) {
    elements.conversationDetailMeta.textContent = metaParts.join(" · ");
  }

  const messages = await getAllFromIndex("messages", "conversationId", conversationId);
  messages.sort((a, b) => a.createdAt - b.createdAt);
  elements.conversationDetailWindow.innerHTML = "";
  if (!messages.length) {
    const empty = document.createElement("div");
    empty.className = "chat-empty";
    empty.textContent = "暂无内容";
    elements.conversationDetailWindow.appendChild(empty);
  } else {
    messages.forEach((message) => {
      elements.conversationDetailWindow.appendChild(createMessageElement(message));
    });
  }
  openConversationDetailModal(true);
}

async function refreshImports({ page } = {}) {
  if (!elements.importList) return;
  try {
    const { imports } = await loadSessionRecords();
    imports.sort((a, b) => b.createdAt - a.createdAt);
    state.imports = imports;
    const totalPages = Math.max(1, Math.ceil(imports.length / IMPORT_PAGE_SIZE));
    const nextPage = Math.min(totalPages, Math.max(1, page || state.importPage));
    state.importPage = nextPage;
    renderImportList();
  } catch (error) {
    console.error(error);
  }
}

function renderImportList() {
  if (!elements.importList || !elements.importEmpty || !elements.importPagination) return;
  const total = state.imports.length;
  elements.importList.innerHTML = "";
  if (elements.importCount) {
    elements.importCount.textContent = total ? `共 ${total} 条` : "暂无记录";
  }
  if (!total) {
    elements.importEmpty.style.display = "block";
    elements.importPagination.style.display = "none";
    return;
  }
  elements.importEmpty.style.display = "none";
  const totalPages = Math.max(1, Math.ceil(total / IMPORT_PAGE_SIZE));
  const start = (state.importPage - 1) * IMPORT_PAGE_SIZE;
  const pageItems = state.imports.slice(start, start + IMPORT_PAGE_SIZE);
  pageItems.forEach((record) => {
    const item = document.createElement("li");
    item.className = "import-item";

    const header = document.createElement("div");
    header.className = "import-item-header";
    const title = document.createElement("div");
    title.className = "import-item-title";
    title.textContent = record.title || "导入对话";
    const time = document.createElement("div");
    time.className = "import-item-time";
    time.textContent = formatDateTime(record.createdAt);
    header.appendChild(title);
    header.appendChild(time);

    const meta = document.createElement("div");
    meta.className = "import-item-meta";
    const sourceLabel = getImportSourceLabel(record.source);
    const metaParts = [];
    if (sourceLabel) metaParts.push(`来源：${sourceLabel}`);
    if (record.messageCount) metaParts.push(`消息 ${record.messageCount}`);
    if (record.userCount != null && record.assistantCount != null) {
      metaParts.push(`用户 ${record.userCount} / 对方 ${record.assistantCount}`);
    }
    meta.textContent = metaParts.join(" · ");

    const actions = document.createElement("div");
    actions.className = "import-item-actions";
    const toggle = createIncludeToggle({
      type: "import",
      id: record.id,
      include: record.includeInStats,
    });
    const viewBtn = document.createElement("button");
    viewBtn.className = "ghost";
    viewBtn.type = "button";
    viewBtn.textContent = "查看";
    viewBtn.dataset.importAction = "view";
    viewBtn.dataset.importId = record.id;
    actions.appendChild(toggle);
    actions.appendChild(viewBtn);

    item.appendChild(header);
    item.appendChild(meta);
    item.appendChild(actions);
    elements.importList.appendChild(item);
  });

  elements.importPagination.style.display = totalPages > 1 ? "flex" : "none";
  if (elements.importPageInfo) {
    elements.importPageInfo.textContent = `${state.importPage} / ${totalPages}`;
  }
  if (elements.importPrevBtn) {
    elements.importPrevBtn.disabled = state.importPage <= 1;
  }
  if (elements.importNextBtn) {
    elements.importNextBtn.disabled = state.importPage >= totalPages;
  }
}

function createIncludeToggle({ type, id, include }) {
  const label = document.createElement("label");
  label.className = "record-toggle";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = include !== false;
  input.dataset.recordToggle = "true";
  input.dataset.recordType = type;
  input.dataset.recordId = id;
  const text = document.createElement("span");
  text.textContent = "参与计算";
  label.appendChild(input);
  label.appendChild(text);
  return label;
}

async function handleRecordToggleChange(event) {
  try {
    const input = event.target.closest("input[data-record-toggle='true']");
    if (!input) return;
    const recordType = input.dataset.recordType;
    const recordId = input.dataset.recordId;
    if (!recordType || !recordId) return;
    const includeInStats = input.checked;

    if (recordType === "conversation") {
      const record = state.conversations.find((item) => item.id === recordId);
      if (!record) return;
      record.includeInStats = includeInStats;
      await updateRecord("conversations", record);
      if (recordId === state.conversationId && state.conversationMeta) {
        state.conversationMeta.includeInStats = includeInStats;
      }
    }

    if (recordType === "import") {
      const record = state.imports.find((item) => item.id === recordId);
      if (!record) return;
      record.includeInStats = includeInStats;
      await updateRecord("imports", record);
    }

    await refreshStats();
    await renderPractice();
    await refreshCards();
  } catch (error) {
    console.error(error);
  }
}

function handleImportPageChange(delta) {
  const totalPages = Math.max(1, Math.ceil(state.imports.length / IMPORT_PAGE_SIZE));
  const nextPage = Math.min(totalPages, Math.max(1, state.importPage + delta));
  if (nextPage === state.importPage) return;
  state.importPage = nextPage;
  renderImportList();
}

function handleImportListAction(event) {
  const actionTarget = event.target.closest("[data-import-action]");
  if (!actionTarget) return;
  const importId = actionTarget.dataset.importId;
  if (!importId) return;
  if (actionTarget.dataset.importAction === "view") {
    void openImportDetail(importId);
  }
}

function sanitizeHabitPatterns(patterns) {
  if (!Array.isArray(patterns)) return [];
  return patterns
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const template = String(item.template || "").trim();
      if (!template) return null;
      const count = Number(item.count || 0);
      const examples = Array.isArray(item.examples)
        ? item.examples.filter((value) => typeof value === "string" && value.trim()).slice(0, 3)
        : [];
      return {
        template,
        count: Number.isFinite(count) ? count : 0,
        examples,
        raw_pattern: Array.isArray(item.raw_pattern) ? item.raw_pattern : [],
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.count - a.count);
}

async function loadIncludedUserSentences() {
  const [{ conversationIncludeMap, importIncludeMap }, messages, importMessages] =
    await Promise.all([
      loadIncludeMaps(),
      getAllRecords("messages"),
      getAllRecords("importMessages"),
    ]);
  return [...messages, ...importMessages]
    .filter((msg) => msg.role === "user" && msg.text && msg.text.trim().length > 1)
    .filter((msg) => {
      if (msg.importId) {
        return isImportIncluded(msg.importId, importIncludeMap, msg.conversationId);
      }
      return isConversationIncluded(msg.conversationId, conversationIncludeMap);
    })
    .map((msg) => msg.text.trim());
}

async function handleDeepAnalysis() {
  if (!elements.statHabits) return;

  elements.deepAnalysisBtn.disabled = true;
  elements.statHabits.innerHTML = '<li class="loading">正在挖掘您的语言习惯...</li>';

  try {
    const userSentences = await loadIncludedUserSentences();
    if (userSentences.length < 5) {
      elements.statHabits.innerHTML = "<li>数据不足，请多聊几句再试。</li>";
      return;
    }

    const response = await fetch("/api/habit/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sentences: userSentences, min_support: 2 }),
    });
    if (!response.ok) {
      throw new Error(`服务异常: ${response.status}`);
    }

    const result = await response.json();
    const patterns = sanitizeHabitPatterns(result.patterns || []);
    state.deepHabitPatterns = patterns;
    await setMetaValue(META_DEEP_HABITS_KEY, {
      updatedAt: Date.now(),
      patterns,
    });
    renderHabitList(elements.statHabits, patterns);
    await refreshCards();
  } catch (error) {
    console.error("挖掘失败", error);
    elements.statHabits.innerHTML =
      `<li style="color:red">挖掘失败，请确保后台 Python 服务已启动 (Port 8006)。<br>错误: ${error.message}</li>`;
  } finally {
    elements.deepAnalysisBtn.disabled = false;
  }
}

function renderHabitList(target, patterns) {
  target.innerHTML = "";
  if (!patterns.length) {
    target.innerHTML = "<li>未发现显著的习惯模式。</li>";
    return;
  }

  // 取前 10 个最有意义的
  const topPatterns = patterns.slice(0, 10);

  topPatterns.forEach(p => {
    const li = document.createElement("li");

    const patternSpan = document.createElement("span");
    patternSpan.className = "pattern";
    patternSpan.textContent = p.template; // e.g. "我 经常 <verb>"

    const countSpan = document.createElement("span");
    countSpan.className = "count";
    countSpan.textContent = String(p.count);

    li.appendChild(patternSpan);
    li.appendChild(countSpan);

    // Optional: Add tooltip or expand for examples
    if (p.examples && p.examples.length) {
      li.title = "例句:\n" + p.examples.join("\n");
      li.style.cursor = "help";
    }

    target.appendChild(li);
  });
}

async function openImportDetail(importId) {
  if (!elements.importDetailWindow) return;
  const record = state.imports.find((item) => item.id === importId);
  if (!record) return;
  if (elements.importDetailTitle) {
    elements.importDetailTitle.textContent = record.title || "导入对话";
  }
  const metaParts = [];
  const sourceLabel = getImportSourceLabel(record.source);
  if (sourceLabel) metaParts.push(`来源：${sourceLabel}`);
  if (record.createdAt) metaParts.push(`时间：${formatDateTime(record.createdAt)}`);
  if (record.userCount != null && record.assistantCount != null) {
    metaParts.push(`用户 ${record.userCount} / 对方 ${record.assistantCount}`);
  }
  if (record.messageCount != null) metaParts.push(`共 ${record.messageCount} 条`);
  if (elements.importDetailMeta) {
    elements.importDetailMeta.textContent = metaParts.join(" · ");
  }

  const messages = await getAllFromIndex("importMessages", "importId", importId);
  messages.sort((a, b) => a.createdAt - b.createdAt);
  elements.importDetailWindow.innerHTML = "";
  if (!messages.length) {
    const empty = document.createElement("div");
    empty.className = "chat-empty";
    empty.textContent = "暂无内容";
    elements.importDetailWindow.appendChild(empty);
  } else {
    messages.forEach((message) => {
      elements.importDetailWindow.appendChild(createMessageElement(message));
    });
  }
  openImportDetailModal(true);
}

function dedupeAnalyses(analyses) {
  const byMessage = new Map();
  analyses.forEach((record) => {
    const existing = byMessage.get(record.messageId);
    if (!existing) {
      byMessage.set(record.messageId, record);
      return;
    }
    const preferAlgo = record.engine === "algo" && existing.engine !== "algo";
    const newer = record.createdAt > existing.createdAt;
    if (preferAlgo || newer) {
      byMessage.set(record.messageId, record);
    }
  });
  return Array.from(byMessage.values());
}

async function loadIncludedAnalyses() {
  const [{ conversationIncludeMap, importIncludeMap }, analyses] = await Promise.all([
    loadIncludeMaps(),
    getAllRecords("analyses"),
  ]);
  return dedupeAnalyses(analyses).filter((record) =>
    isAnalysisIncluded(record, conversationIncludeMap, importIncludeMap)
  );
}

function renderCountList(target, countMap) {
  const entries = Array.from(countMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8);
  target.innerHTML = "";
  if (!entries.length) {
    const item = document.createElement("li");
    item.textContent = "暂无数据";
    target.appendChild(item);
    return;
  }
  entries.forEach(([label, count]) => {
    const item = document.createElement("li");
    const name = document.createElement("span");
    name.textContent = label;
    const value = document.createElement("span");
    value.textContent = String(count);
    item.appendChild(name);
    item.appendChild(value);
    target.appendChild(item);
  });
}

function renderPatternList(target, patternMap) {
  const entries = Array.from(patternMap.entries())
    .map(([pattern, data]) => ({
      pattern,
      usage: data.usage,
      count: data.count,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
  target.innerHTML = "";
  if (!entries.length) {
    const item = document.createElement("li");
    item.textContent = "暂无数据";
    target.appendChild(item);
    return;
  }
  entries.forEach(({ pattern, usage, count }) => {
    const item = document.createElement("li");
    const name = document.createElement("span");
    name.textContent = formatPatternLabel(pattern, usage);
    const value = document.createElement("span");
    value.textContent = String(count);
    item.appendChild(name);
    item.appendChild(value);
    target.appendChild(item);
  });
}

function formatPatternLabel(pattern, usage) {
  if (!usage) return pattern;
  return `${pattern}（${usage}）`;
}

async function loadCardTranslations() {
  try {
    const records = await getAllRecords("cards");
    state.cardTranslations = new Map(records.map((record) => [record.id, record]));
  } catch (error) {
    console.error(error);
    state.cardTranslations = new Map();
  }
}

async function refreshCards() {
  await loadCardTranslations();
  await renderCards();
}

async function renderCards() {
  if (!elements.vocabCards || !elements.phraseCards || !elements.patternCards) {
    return;
  }
  try {
    const analyses = await loadIncludedAnalyses();
    const base = buildCardBase(analyses);
    state.cardBaseSnapshot = base;
    syncCardSelection(base);
    const language = elements.cardLangSelect.value;
    renderCardSection(elements.vocabCards, base.vocabCards, language, "vocab");
    renderCardSection(elements.phraseCards, base.phraseCards, language, "phrase");
    renderCardSection(elements.patternCards, base.patternCards, language, "pattern");
    updateCardStatusText(base);
    applyCardSelectionToDom();
  } catch (error) {
    console.error(error);
  }
}

function updateCardStatusText(base = state.cardBaseSnapshot) {
  if (!elements.cardStatus) return;
  const total = base.vocabCards.length + base.phraseCards.length + base.patternCards.length;
  if (!total) {
    elements.cardStatus.textContent = "暂无卡片，先在对话中输入一些语句并执行深度挖掘。";
    updateSelectAllButton(base);
    updateGenerateSelectedButton();
    return;
  }
  const selected = state.cardSelection.size;
  const selectionText = selected ? `，已选 ${selected} 张` : "";
  elements.cardStatus.textContent =
    `共 ${total} 张卡片（词汇 ${base.vocabCards.length} / 惯用表达 ${base.phraseCards.length} / 句型 ${base.patternCards.length}）${selectionText}。`;
  updateSelectAllButton(base);
  updateGenerateSelectedButton();
}

function buildCardBase(analyses) {
  const vocabMap = new Map();
  const phraseMap = new Map();
  const patternMap = new Map();

  analyses.forEach((record) => {
    const data = record.data || {};
    const sentence = record.sourceText || "";
    (data.vocab || []).forEach((item) => {
      const word = item.text || item;
      if (!word) return;
      const existing = vocabMap.get(word) || {
        key: word,
        sentences: new Set(),
        count: 0,
      };
      if (sentence) {
        existing.sentences.add(sentence);
      }
      existing.count += 1;
      vocabMap.set(word, existing);
    });
    (data.patterns || []).forEach((item) => {
      if (!item) return;
      const pattern = typeof item === "string" ? item : item.pattern;
      const usage = typeof item === "object" ? item.usage : "";
      if (!pattern) return;
      const existing = patternMap.get(pattern) || {
        key: pattern,
        usage: usage || "",
        sentences: new Set(),
        count: 0,
      };
      if (!existing.usage && usage) {
        existing.usage = usage;
      }
      if (sentence) {
        existing.sentences.add(sentence);
      }
      existing.count += 1;
      patternMap.set(pattern, existing);
    });
  });

  mergeDeepHabitsIntoCards(phraseMap, patternMap);

  const vocabCards = Array.from(vocabMap.values())
    .map((card) => ({
      ...card,
      sentences: Array.from(card.sentences),
    }))
    .sort((a, b) => b.count - a.count);

  const phraseCards = Array.from(phraseMap.values())
    .map((card) => ({
      ...card,
      sentences: Array.from(card.sentences),
    }))
    .sort((a, b) => b.count - a.count);

  const patternCards = Array.from(patternMap.values())
    .map((card) => ({
      ...card,
      sentences: Array.from(card.sentences),
    }))
    .sort((a, b) => b.count - a.count);

  return { vocabCards, phraseCards, patternCards };
}

function mergeDeepHabitsIntoCards(phraseMap, patternMap) {
  const habits = Array.isArray(state.deepHabitPatterns) ? state.deepHabitPatterns : [];
  habits.forEach((item) => {
    const template = normalizeHabitTemplate(item.template);
    if (!template) return;
    const examples = Array.isArray(item.examples)
      ? item.examples.filter((value) => typeof value === "string" && value.trim())
      : [];
    const score = Number(item.count || 0) || examples.length || 1;

    if (isAbstractHabitTemplate(template)) {
      const existing = patternMap.get(template) || {
        key: template,
        usage: "深度习惯挖掘句式",
        sentences: new Set(),
        count: 0,
      };
      examples.forEach((sentence) => existing.sentences.add(sentence));
      existing.count += score;
      patternMap.set(template, existing);
      return;
    }

    const existing = phraseMap.get(template) || {
      key: template,
      usage: "深度习惯表达",
      sentences: new Set(),
      count: 0,
    };
    examples.forEach((sentence) => existing.sentences.add(sentence));
    existing.count += score;
    phraseMap.set(template, existing);
  });
}

function normalizeHabitTemplate(template) {
  return String(template || "").replace(/\s+/g, " ").trim();
}

function isAbstractHabitTemplate(template) {
  return /<[^>]+>/.test(template);
}

function renderCardSection(container, cards, language, type) {
  container.innerHTML = "";
  if (!cards.length) {
    const empty = document.createElement("div");
    empty.className = "card-status";
    empty.textContent = "暂无卡片";
    container.appendChild(empty);
    return;
  }
  cards.forEach((card) => {
    const cardEl = document.createElement("div");
    cardEl.className = "learning-card";
    const id = cardId(type, card.key);
    cardEl.dataset.id = id;
    cardEl.classList.toggle("is-selected", state.cardSelection.has(id));

    const header = document.createElement("div");
    header.className = "card-header";
    const top = document.createElement("div");
    top.className = "card-top";
    const key = document.createElement("div");
    key.className = "card-key";
    key.textContent = card.key;
    top.appendChild(key);
    const select = document.createElement("label");
    select.className = "card-select-label";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.dataset.cardSelect = "true";
    checkbox.dataset.cardId = id;
    checkbox.checked = state.cardSelection.has(id);
    const selectText = document.createElement("span");
    selectText.textContent = "选中";
    select.appendChild(checkbox);
    select.appendChild(selectText);
    top.appendChild(select);
    header.appendChild(top);
    if (card.usage || card.count) {
      const usage = document.createElement("div");
      usage.className = "card-usage";
      const metaParts = [];
      if (card.usage) metaParts.push(card.usage);
      if (card.count) metaParts.push(`频次 ${card.count}`);
      usage.textContent = metaParts.join(" · ");
      header.appendChild(usage);
    }

    const sentenceBlock = document.createElement("div");
    const sentenceTitle = document.createElement("div");
    sentenceTitle.className = "card-subtitle";
    sentenceTitle.textContent = "对应语句";
    const list = document.createElement("ul");
    list.className = "sentence-list";
    const sentences = card.sentences || [];
    const hiddenCount = Math.max(0, sentences.length - CARD_SENTENCE_LIMIT);
    sentences.forEach((sentence, index) => {
      const item = document.createElement("li");
      item.textContent = sentence;
      if (index >= CARD_SENTENCE_LIMIT) {
        item.classList.add("is-hidden");
      }
      list.appendChild(item);
    });
    sentenceBlock.appendChild(sentenceTitle);
    sentenceBlock.appendChild(list);

    if (hiddenCount > 0) {
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "ghost sentence-toggle";
      toggle.dataset.action = "toggle-sentences";
      toggle.dataset.collapsed = "true";
      toggle.dataset.hiddenCount = String(hiddenCount);
      toggle.textContent = `展开 ${hiddenCount} 条`;
      sentenceBlock.appendChild(toggle);
    }

    const translationBlock = document.createElement("div");
    translationBlock.className = "card-translation";
    const translationTitle = document.createElement("div");
    translationTitle.className = "card-subtitle";
    translationTitle.textContent = buildCardTranslationTitle(type, language);
    translationBlock.appendChild(translationTitle);

    const translation = getCardTranslation(type, card.key, language);
    if (!translation || !translation.text) {
      const placeholder = document.createElement("div");
      placeholder.className = "card-placeholder";
      placeholder.textContent = "尚未补全";
      translationBlock.appendChild(placeholder);
    } else {
      const translationText = document.createElement("div");
      translationText.textContent = translation.text;
      translationBlock.appendChild(translationText);
      if (translation.example) {
        const exampleTitle = document.createElement("div");
        exampleTitle.className = "card-subtitle";
        exampleTitle.textContent = "例句";
        const example = document.createElement("div");
        example.className = "card-example";
        example.textContent = translation.example;
        translationBlock.appendChild(exampleTitle);
        translationBlock.appendChild(example);
      }
      if (type === "phrase" && translation.pattern) {
        const patternTitle = document.createElement("div");
        patternTitle.className = "card-subtitle";
        patternTitle.textContent = "背后句型";
        const patternText = document.createElement("div");
        patternText.className = "card-pattern-hint";
        patternText.textContent = translation.pattern;
        translationBlock.appendChild(patternTitle);
        translationBlock.appendChild(patternText);
      }
      if (type === "phrase" && translation.patternExample) {
        const patternExampleTitle = document.createElement("div");
        patternExampleTitle.className = "card-subtitle";
        patternExampleTitle.textContent = "句型例句";
        const patternExample = document.createElement("div");
        patternExample.className = "card-example";
        patternExample.textContent = translation.patternExample;
        translationBlock.appendChild(patternExampleTitle);
        translationBlock.appendChild(patternExample);
      }
    }

    cardEl.appendChild(header);
    cardEl.appendChild(sentenceBlock);
    cardEl.appendChild(translationBlock);
    container.appendChild(cardEl);
  });
}

function handleCardToggle(event) {
  const button = event.target.closest("[data-action='toggle-sentences']");
  if (!button) return;
  const card = button.closest(".learning-card");
  if (!card) return;
  const list = card.querySelector(".sentence-list");
  if (!list) return;
  const collapsed = button.dataset.collapsed === "true";
  const items = Array.from(list.querySelectorAll("li"));
  items.forEach((item, index) => {
    if (index >= CARD_SENTENCE_LIMIT) {
      item.classList.toggle("is-hidden", !collapsed);
    }
  });
  if (collapsed) {
    button.dataset.collapsed = "false";
    button.textContent = "收起";
  } else {
    button.dataset.collapsed = "true";
    const hiddenCount = Number(button.dataset.hiddenCount || 0);
    button.textContent = `展开 ${hiddenCount} 条`;
  }
}

function buildCardTranslationTitle(type, language) {
  const langLabel = CARD_LANG_LABELS[language]?.label || "目标语言";
  const typeLabelMap = {
    vocab: "词汇",
    phrase: "惯用表达",
    pattern: "句型",
  };
  return `${langLabel}${typeLabelMap[type] || ""}表达`;
}

function handleCardSelectionChange(event) {
  const input = event.target.closest("input[data-card-select='true']");
  if (!input) return;
  const id = input.dataset.cardId;
  if (!id) return;
  if (input.checked) {
    state.cardSelection.add(id);
  } else {
    state.cardSelection.delete(id);
  }
  const card = input.closest(".learning-card");
  if (card) {
    card.classList.toggle("is-selected", input.checked);
  }
  updateGenerateSelectedButton();
  updateCardStatusText();
}

function getAllCardIds(base = state.cardBaseSnapshot) {
  const ids = [];
  (base.vocabCards || []).forEach((card) => ids.push(cardId("vocab", card.key)));
  (base.phraseCards || []).forEach((card) => ids.push(cardId("phrase", card.key)));
  (base.patternCards || []).forEach((card) => ids.push(cardId("pattern", card.key)));
  return ids;
}

function syncCardSelection(base = state.cardBaseSnapshot) {
  const allIds = new Set(getAllCardIds(base));
  state.cardSelection.forEach((id) => {
    if (!allIds.has(id)) {
      state.cardSelection.delete(id);
    }
  });
}

function applyCardSelectionToDom() {
  const checkboxes = document.querySelectorAll("input[data-card-select='true']");
  checkboxes.forEach((checkbox) => {
    const id = checkbox.dataset.cardId;
    const checked = id ? state.cardSelection.has(id) : false;
    checkbox.checked = checked;
    const card = checkbox.closest(".learning-card");
    if (card) {
      card.classList.toggle("is-selected", checked);
    }
  });
  updateGenerateSelectedButton();
}

function updateSelectAllButton(base = state.cardBaseSnapshot) {
  if (!elements.selectAllCardsBtn) return;
  const ids = getAllCardIds(base);
  if (!ids.length) {
    elements.selectAllCardsBtn.disabled = true;
    elements.selectAllCardsBtn.textContent = "全选卡片";
    return;
  }
  elements.selectAllCardsBtn.disabled = false;
  const allSelected = ids.every((id) => state.cardSelection.has(id));
  elements.selectAllCardsBtn.textContent = allSelected ? "取消全选" : "全选卡片";
}

function handleToggleSelectAllCards() {
  const ids = getAllCardIds();
  if (!ids.length) return;
  const allSelected = ids.every((id) => state.cardSelection.has(id));
  if (allSelected) {
    state.cardSelection.clear();
  } else {
    ids.forEach((id) => state.cardSelection.add(id));
  }
  applyCardSelectionToDom();
  updateCardStatusText();
}

function syncCardSelectionFromDom() {
  const checkboxes = document.querySelectorAll("input[data-card-select='true']");
  if (!checkboxes.length) return;
  const domSelection = new Set();
  checkboxes.forEach((checkbox) => {
    if (!checkbox.checked) return;
    const id = checkbox.dataset.cardId;
    if (id) {
      domSelection.add(id);
    }
  });
  state.cardSelection = domSelection;
}

function updateGenerateSelectedButton() {
  if (!elements.generateSelectedCardsBtn) return;
  const count = state.cardSelection.size;
  elements.generateSelectedCardsBtn.textContent = count ? `生成选中 (${count})` : "生成选中";
}

function getCardTranslation(type, key, language) {
  const record = state.cardTranslations.get(cardId(type, key));
  if (!record || !record.translations) {
    return null;
  }
  return record.translations[language] || null;
}

function cardId(type, key) {
  return `${type}::${key}`;
}

async function handleGeneratePractice() {
  const analysisRecords = (await loadIncludedAnalyses())
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 6);
  if (!analysisRecords.length) {
    elements.practiceMeta.textContent = "先积累一些已分析的语句，再生成练习。";
    return;
  }

  let tasks = [];
  if (!settings.apiKey) {
    elements.practiceMeta.textContent = "需要 API 才能生成英文练习。";
    return;
  }
  try {
    tasks = await fetchPracticeTasks(analysisRecords);
  } catch (error) {
    console.error(error);
    tasks = buildLocalPractice(analysisRecords);
  }

  if (!tasks.length) {
    elements.practiceMeta.textContent = "暂时没有生成练习任务。";
    return;
  }

  const conversationMap = new Map(
    analysisRecords.map((record) => [record.messageId, record.conversationId])
  );
  const records = [];
  for (const task of tasks) {
    const mappedConversationId = task.sourceMessageId
      ? conversationMap.get(task.sourceMessageId)
      : null;
    const record = {
      id: makeId(),
      conversationId: mappedConversationId || state.conversationId,
      sourceMessageId: task.sourceMessageId || null,
      type: task.type || "recall",
      prompt: task.prompt,
      answer: task.answer,
      acceptable: task.acceptable || [],
      focus: task.focus || "",
      createdAt: Date.now(),
      attempts: 0,
      correct: 0,
    };
    await addRecord("practice", record);
    records.push(record);
  }
  state.practice = [...records, ...state.practice].sort((a, b) => b.createdAt - a.createdAt);
  await renderPractice();
  await refreshStats();
}

async function handleEnrichCards() {
  return runCardEnrichment({ selectedOnly: false });
}

async function handleEnrichSelectedCards() {
  return runCardEnrichment({ selectedOnly: true });
}

async function runCardEnrichment({ selectedOnly }) {
  if (state.isEnriching) return;
  if (selectedOnly) {
    syncCardSelectionFromDom();
    updateCardStatusText();
  }
  if (!settings.apiKey) {
    setCardStatus("需要 API 才能补全卡片。");
    return;
  }
  state.isEnriching = true;
  if (elements.generateSelectedCardsBtn) {
    elements.generateSelectedCardsBtn.disabled = true;
  }
  elements.enrichCardsBtn.disabled = true;
  await loadCardTranslations();
  try {
    const analyses = await loadIncludedAnalyses();
    const base = buildCardBase(analyses);
    state.cardBaseSnapshot = base;
    syncCardSelection(base);
    const language = elements.cardLangSelect.value;
    const missing = collectMissingCards(base, language, { selectedOnly });
    if (missing.noSelection) {
      setCardStatus("请先勾选要生成的卡片（支持多选）。");
      return;
    }
    if (!missing.total) {
      setCardStatus(selectedOnly ? "选中卡片已全部补全。" : "当前语言的卡片已全部补全。");
      return;
    }
    setCardStatus(`正在补全 ${missing.total} 张卡片...`);
    const result = await fetchCardEnrichment(missing, language);
    await applyCardEnrichment(result, language);
    await loadCardTranslations();
    await renderCards();
    if (missing.truncated) {
      setCardStatus("补全完成（已按数量限制截断）。");
    } else {
      setCardStatus("补全完成。");
    }
  } catch (error) {
    console.error(error);
    setCardStatus("补全失败，请稍后重试。");
  } finally {
    state.isEnriching = false;
    if (elements.generateSelectedCardsBtn) {
      elements.generateSelectedCardsBtn.disabled = false;
    }
    elements.enrichCardsBtn.disabled = false;
  }
}

function collectMissingCards(base, language, { selectedOnly = false } = {}) {
  const selectedIds = new Set(state.cardSelection);
  if (selectedOnly && !selectedIds.size) {
    return {
      vocab: [],
      phrases: [],
      patterns: [],
      total: 0,
      truncated: false,
      noSelection: true,
    };
  }
  const vocab = [];
  const phrases = [];
  const patterns = [];
  let remaining = CARD_ENRICH_LIMIT;
  let totalMissing = 0;

  const canInclude = (type, key) =>
    !selectedOnly || selectedIds.has(cardId(type, key));

  base.vocabCards.forEach((card) => {
    if (!canInclude("vocab", card.key)) return;
    const translation = getCardTranslation("vocab", card.key, language);
    if (translation && translation.text) {
      return;
    }
    totalMissing += 1;
    if (remaining <= 0) return;
    vocab.push({
      key: card.key,
      sentence: card.sentences[0] || "",
    });
    remaining -= 1;
  });

  base.phraseCards.forEach((card) => {
    if (!canInclude("phrase", card.key)) return;
    const translation = getCardTranslation("phrase", card.key, language);
    if (translation && translation.text && translation.pattern) {
      return;
    }
    totalMissing += 1;
    if (remaining <= 0) return;
    phrases.push({
      phrase: card.key,
      usage: card.usage || "",
      sentence: card.sentences[0] || "",
    });
    remaining -= 1;
  });

  base.patternCards.forEach((card) => {
    if (!canInclude("pattern", card.key)) return;
    const translation = getCardTranslation("pattern", card.key, language);
    if (translation && translation.text) {
      return;
    }
    totalMissing += 1;
    if (remaining <= 0) return;
    patterns.push({
      pattern: card.key,
      usage: card.usage || "",
      sentence: card.sentences[0] || "",
    });
    remaining -= 1;
  });

  return {
    vocab,
    phrases,
    patterns,
    total: Math.min(totalMissing, CARD_ENRICH_LIMIT),
    truncated: totalMissing > CARD_ENRICH_LIMIT,
    noSelection: false,
  };
}

async function fetchCardEnrichment(missing, language) {
  const info = CARD_LANG_LABELS[language] || { name: language, label: language };
  const payload = {
    model: settings.model,
    messages: [
      {
        role: "system",
        content:
          "你是学习卡片生成器。给定中文词汇、惯用表达和句型，输出目标语言表达。只输出严格 JSON：{vocab:[{key, translation, example}], phrases:[{phrase, translation, pattern, example, patternExample}], patterns:[{pattern, translation, example}] }。phrases.translation 是惯用表达译法，phrases.pattern 是该表达背后的通用句型模板，phrases.patternExample 是该句型例句。patterns.translation 使用模板形式（如 I like A），example 为目标语言例句。",
      },
      {
        role: "user",
        content: JSON.stringify({
          language: info.name,
          vocab: missing.vocab,
          phrases: missing.phrases,
          patterns: missing.patterns,
        }),
      },
    ],
    temperature: 0.4,
    max_tokens: 1200,
  };
  const data = await callApiWithRetry(payload, { retries: 1, delayMs: 700 });
  const choice = data.choices && data.choices[0];
  if (!choice || !choice.message) {
    throw new Error("卡片补全结果为空");
  }
  return safeParseJson(choice.message.content);
}

async function applyCardEnrichment(result, language) {
  if (!result || typeof result !== "object") {
    return;
  }
  const vocab = Array.isArray(result.vocab) ? result.vocab : [];
  const phrases = Array.isArray(result.phrases) ? result.phrases : [];
  const patterns = Array.isArray(result.patterns) ? result.patterns : [];

  for (const item of vocab) {
    if (!item || !item.key || !item.translation) continue;
    await saveCardTranslation("vocab", item.key, language, item.translation, item.example || "");
  }
  for (const item of phrases) {
    if (!item || !item.phrase || !item.translation) continue;
    await saveCardTranslation(
      "phrase",
      item.phrase,
      language,
      item.translation,
      item.example || "",
      {
        pattern: item.pattern || item.translation,
        patternExample: item.patternExample || "",
      }
    );
  }
  for (const item of patterns) {
    if (!item || !item.pattern || !item.translation) continue;
    await saveCardTranslation("pattern", item.pattern, language, item.translation, item.example || "");
  }
}

async function saveCardTranslation(type, key, language, text, example, extra = {}) {
  const id = cardId(type, key);
  const existing = state.cardTranslations.get(id) || (await getRecord("cards", id));
  const record = {
    id,
    type,
    key,
    translations: existing?.translations ? { ...existing.translations } : {},
    updatedAt: Date.now(),
  };
  const payload = { text, example };
  if (extra.pattern) {
    payload.pattern = extra.pattern;
  }
  if (extra.patternExample) {
    payload.patternExample = extra.patternExample;
  }
  record.translations[language] = payload;
  if (existing) {
    await updateRecord("cards", record);
  } else {
    await addRecord("cards", record);
  }
  state.cardTranslations.set(id, record);
}

function setCardStatus(text) {
  if (elements.cardStatus) {
    elements.cardStatus.textContent = text;
  }
}

async function renderPractice() {
  if (!elements.practiceList) return;
  elements.practiceList.innerHTML = "";
  const { conversationIncludeMap, importIncludeMap } = await loadIncludeMaps();
  const tasks = state.practice
    .filter((task) => {
      const importId = getImportIdFromConversationId(task.conversationId);
      if (importId) {
        return isImportIncluded(importId, importIncludeMap, task.conversationId);
      }
      return isConversationIncluded(task.conversationId, conversationIncludeMap);
    })
    .sort((a, b) => b.createdAt - a.createdAt);
  if (!tasks.length) {
    elements.practiceMeta.textContent = state.practice.length
      ? "已排除的会话不参与练习。"
      : "暂无练习任务，可从你的语句生成。";
    return;
  }
  elements.practiceMeta.textContent = `已准备 ${tasks.length} 个任务。`;
  tasks.forEach((task) => {
    const card = document.createElement("div");
    card.className = "practice-card";
    card.dataset.id = task.id;

    const type = document.createElement("div");
    type.className = "practice-type";
    type.textContent = formatPracticeType(task.type);

    const prompt = document.createElement("div");
    prompt.className = "practice-prompt";
    prompt.textContent = task.prompt;

    const input = document.createElement("textarea");
    input.placeholder = "用英文作答...";
    input.className = "practice-input";

    const actions = document.createElement("div");
    actions.className = "practice-actions";
    const revealBtn = document.createElement("button");
    revealBtn.className = "ghost";
    revealBtn.type = "button";
    revealBtn.dataset.action = "reveal";
    revealBtn.textContent = "显示答案";
    const checkBtn = document.createElement("button");
    checkBtn.className = "primary";
    checkBtn.type = "button";
    checkBtn.dataset.action = "check";
    checkBtn.textContent = "检查";
    actions.appendChild(revealBtn);
    actions.appendChild(checkBtn);

    const feedback = document.createElement("div");
    feedback.className = "practice-feedback";
    feedback.textContent = task.focus ? `要点：${task.focus}` : "要点：清晰、准确地表达。";

    card.appendChild(type);
    card.appendChild(prompt);
    card.appendChild(input);
    card.appendChild(actions);
    card.appendChild(feedback);
    elements.practiceList.appendChild(card);
  });
}

async function handlePracticeAction(event) {
  const action = event.target.dataset.action;
  if (!action) return;
  const card = event.target.closest(".practice-card");
  if (!card) return;
  const taskId = card.dataset.id;
  const task = state.practice.find((item) => item.id === taskId);
  if (!task) return;

  const input = card.querySelector(".practice-input");
  const feedback = card.querySelector(".practice-feedback");

  if (action === "reveal") {
    feedback.textContent = `答案：${task.answer}`;
    feedback.classList.remove("success", "error");
    return;
  }

  if (action === "check") {
    const answer = input.value.trim();
    const normalized = normalizeAnswer(answer);
    const acceptable = [task.answer, ...(task.acceptable || [])]
      .filter(Boolean)
      .map(normalizeAnswer);
    const isCorrect = acceptable.includes(normalized);
    task.attempts += 1;
    if (isCorrect) {
      task.correct += 1;
      feedback.textContent = "不错！你的表达匹配。";
      feedback.classList.add("success");
      feedback.classList.remove("error");
    } else {
      feedback.textContent = `还差一点，参考：${task.answer}`;
      feedback.classList.add("error");
      feedback.classList.remove("success");
    }
    task.lastTrainedAt = Date.now();
    await updateRecord("practice", task);
  }
}

function normalizeAnswer(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchPracticeTasks(analysisRecords) {
  const seed = analysisRecords.map((record) => ({
    source: record.sourceText,
    english_variants: record.data?.english_variants || [],
    patterns: record.data?.patterns || [],
  }));
  const payload = {
    model: settings.model,
    messages: [
      {
        role: "system",
        content:
          "请基于用户的中文语句生成任务型英语练习。只输出 JSON 数组。每项包含：type (recall|rewrite|scenario|substitution), prompt(中文), answer(英文), acceptable(英文数组), focus(中文要点)。prompt 要求学习者产出英文。patterns 字段为规范化句型，可能含 pattern/usage。生成 4 到 8 个任务。",
      },
      { role: "user", content: JSON.stringify(seed) },
    ],
    temperature: 0.5,
    max_tokens: 700,
  };
  const data = await callApiWithRetry(payload, { retries: 1, delayMs: 700 });
  const choice = data.choices && data.choices[0];
  if (!choice || !choice.message) {
    throw new Error("练习结果为空");
  }
  const tasks = safeParseJson(choice.message.content);
  if (!Array.isArray(tasks)) {
    throw new Error("练习结果格式错误");
  }
  return tasks;
}

function buildLocalPractice(analysisRecords) {
  const tasks = [];
  analysisRecords.forEach((record) => {
    const variants = record.data?.english_variants || [];
    if (!variants.length) return;
    tasks.push({
      type: "recall",
      prompt: `翻译成英文：${record.sourceText}`,
      answer: variants[0],
      acceptable: variants,
      focus: "回忆你最自然的表达方式。",
      sourceMessageId: record.messageId,
    });
    if (variants.length > 1) {
      tasks.push({
        type: "rewrite",
        prompt: `用不同说法改写：${record.sourceText}`,
        answer: variants[1],
        acceptable: variants,
        focus: "练习替换说法的灵活度。",
        sourceMessageId: record.messageId,
      });
    }
  });
  return tasks.slice(0, 8);
}

function setupSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    elements.micStatus.textContent = "麦克风不可用";
    elements.micBtn.disabled = true;
    return;
  }
  state.recognition = new SpeechRecognition();
  state.recognition.lang = settings.speechLang;
  state.recognition.interimResults = false;
  state.recognition.continuous = false;

  state.recognition.onstart = () => {
    state.micActive = true;
    elements.micBtn.setAttribute("aria-pressed", "true");
    elements.micStatus.textContent = "正在聆听...";
  };

  state.recognition.onend = () => {
    state.micActive = false;
    elements.micBtn.setAttribute("aria-pressed", "false");
    elements.micStatus.textContent = "麦克风空闲";
  };

  state.recognition.onerror = (event) => {
    elements.micStatus.textContent = `麦克风错误：${event.error}`;
  };

  state.recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    const current = elements.chatInput.value.trim();
    elements.chatInput.value = current ? `${current} ${transcript}` : transcript;
    elements.chatInput.focus();
  };
}

function updateSpeechRecognitionLanguage() {
  if (state.recognition) {
    state.recognition.lang = settings.speechLang;
  }
}

function toggleMic() {
  if (!state.recognition) return;
  if (state.micActive) {
    state.recognition.stop();
  } else {
    state.recognition.lang = settings.speechLang;
    state.recognition.start();
  }
}

async function exportData() {
  if (!state.conversationId) return;
  const [messages, analyses, practice] = await Promise.all([
    getAllFromIndex("messages", "conversationId", state.conversationId),
    getAllFromIndex("analyses", "conversationId", state.conversationId),
    getAllFromIndex("practice", "conversationId", state.conversationId),
  ]);
  const data = {
    conversationId: state.conversationId,
    exportedAt: new Date().toISOString(),
    messages,
    analyses,
    practice,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `native-loop-${Date.now()}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function updateImportPreview() {
  if (!elements.importInput) return;
  const inputValue = elements.importInput.value || "";
  const trimmedInput = inputValue.trim();
  importState.raw = inputValue;
  importState.mode = elements.importModeSelect.value;
  importState.split = elements.importSplitSelect.value;
  importState.notice = "";
  importState.source = "";
  const previousDirectSwap = importState.directSwap;

  const shareUrl = matchShareUrl(trimmedInput);
  if (shareUrl) {
    if (importState.fetchUrl !== shareUrl) {
      importState.fetchedHtml = "";
      importState.fetchError = "";
    }
    void ensureShareHtml(shareUrl);
    if (importState.fetchUrl === shareUrl && importState.fetchedHtml) {
      importState.raw = importState.fetchedHtml;
    }
    if (importState.fetching) {
      importState.notice = "正在抓取分享页...";
    } else if (importState.fetchError) {
      importState.notice = importState.fetchError;
    }
  } else {
    importState.fetchUrl = "";
    importState.fetchedHtml = "";
    importState.fetchError = "";
    importState.fetching = false;
  }

  const shareResult = parseShareImport(importState.raw);
  let result;
  if (shareResult) {
    importState.detectedMode = "direct";
    importState.parsed = shareResult.entries || [];
    importState.speakers = [];
    importState.userSpeaker = null;
    importState.source = shareResult.source || "";
    importState.notice = shareResult.notice || "";
    if (shareUrl) {
      if (importState.fetchError) {
        importState.notice = importState.fetchError;
      } else if (importState.fetching && !importState.fetchedHtml) {
        importState.notice = "正在抓取分享页...";
      }
    }
    importState.directSwap = previousDirectSwap;
    result = {
      mode: importState.detectedMode,
      speakers: importState.speakers,
      entries: importState.parsed,
      ignored: 0,
    };
  } else {
    result = parseImportText(importState.raw, {
      mode: importState.mode,
      split: importState.split,
    });

    importState.detectedMode = result.mode;
    importState.speakers = result.speakers;
    importState.parsed = result.entries;

    if (importState.detectedMode === "speaker") {
      if (!importState.userSpeaker || !importState.speakers.includes(importState.userSpeaker)) {
        importState.userSpeaker = importState.speakers[0] || null;
      }
    }

    if (importState.detectedMode === "alternate" && !importState.firstRole) {
      importState.firstRole = "user";
    }
  }

  renderImportMapping();
  const mapped = buildImportMessages();
  renderImportPreview(mapped);
  updateImportMeta(result, mapped);

  const canSwap =
    importState.detectedMode === "alternate" ||
    (importState.detectedMode === "speaker" && importState.speakers.length === 2) ||
    importState.detectedMode === "direct";
  elements.swapImportRolesBtn.disabled = !canSwap;
  elements.confirmImportBtn.disabled =
    mapped.length === 0 || state.isImporting || importState.fetching;
}

function renderImportMapping() {
  elements.importMapping.innerHTML = "";
  if (!importState.raw.trim()) {
    return;
  }

  if (importState.detectedMode === "direct") {
    const row = document.createElement("div");
    row.className = "mapping-row";
    const label = document.createElement("span");
    const sourceLabel = getImportSourceLabel(importState.source);
    if (importState.parsed.length) {
      label.textContent = sourceLabel ? `已识别分享页：${sourceLabel}` : "已识别对话角色";
    } else {
      label.textContent = importState.notice || "未识别到可导入的分享页内容。";
    }
    row.appendChild(label);
    elements.importMapping.appendChild(row);
    return;
  }

  if (importState.detectedMode === "speaker") {
    const row = document.createElement("div");
    row.className = "mapping-row";
    const label = document.createElement("span");
    label.textContent = "用户说话人";
    const select = document.createElement("select");
    select.id = "importUserSpeakerSelect";
    if (!importState.speakers.length) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "未识别到名字";
      select.appendChild(option);
      select.disabled = true;
    } else {
      importState.speakers.forEach((speaker) => {
        const option = document.createElement("option");
        option.value = speaker;
        option.textContent = speaker;
        option.selected = speaker === importState.userSpeaker;
        select.appendChild(option);
      });
    }
    row.appendChild(label);
    row.appendChild(select);
    elements.importMapping.appendChild(row);
    const hint = document.createElement("div");
    hint.className = "hint";
    hint.textContent = "未选中的说话人会归为「对方」。";
    elements.importMapping.appendChild(hint);
    return;
  }

  if (importState.detectedMode === "alternate") {
    const row = document.createElement("div");
    row.className = "mapping-row";
    const label = document.createElement("span");
    label.textContent = "第一句是谁说的";
    const segmented = document.createElement("div");
    segmented.className = "segmented";
    const options = [
      { value: "user", label: "我" },
      { value: "assistant", label: "对方" },
    ];
    options.forEach((option) => {
      const tag = document.createElement("label");
      const input = document.createElement("input");
      input.type = "radio";
      input.name = "importFirstRole";
      input.value = option.value;
      input.checked = importState.firstRole === option.value;
      tag.appendChild(input);
      tag.appendChild(document.createTextNode(option.label));
      segmented.appendChild(tag);
    });
    row.appendChild(label);
    row.appendChild(segmented);
    elements.importMapping.appendChild(row);
  }
}

function renderImportPreview(mapped) {
  elements.importPreviewWindow.innerHTML = "";
  if (!mapped.length) {
    const empty = document.createElement("div");
    empty.className = "chat-empty";
    empty.textContent = "粘贴对话后会显示识别预览。";
    elements.importPreviewWindow.appendChild(empty);
    return;
  }
  const preview = mapped.slice(0, IMPORT_PREVIEW_LIMIT).map((message, index) => ({
    id: `preview-${index}`,
    role: message.role,
    text: message.text,
    createdAt: null,
  }));
  preview.forEach((message) => {
    elements.importPreviewWindow.appendChild(createMessageElement(message));
  });
}

function updateImportMeta(result, mapped) {
  if (!importState.raw.trim()) {
    elements.importMeta.textContent = "粘贴对话后会显示识别结果。";
    return;
  }
  if (!mapped.length) {
    elements.importMeta.textContent =
      importState.notice || "未识别到可导入的消息，请调整识别方式或检查格式。";
    return;
  }
  const userCount = mapped.filter((message) => message.role === "user").length;
  const assistantCount = mapped.length - userCount;
  const modeLabel =
    importState.detectedMode === "direct"
      ? "分享页解析"
      : importState.detectedMode === "speaker"
        ? "按说话人"
        : "按行交替";
  const ignoredInfo = result.ignored ? ` · 已忽略 ${result.ignored} 行` : "";
  const speakerInfo = importState.speakers.length
    ? ` · 说话人：${importState.speakers.join("、")}`
    : "";
  const sourceLabel = getImportSourceLabel(importState.source);
  const sourceInfo = sourceLabel ? ` · 来源：${sourceLabel}` : "";
  const previewInfo =
    mapped.length > IMPORT_PREVIEW_LIMIT ? ` · 预览前 ${IMPORT_PREVIEW_LIMIT} 条` : "";
  const noticeInfo = importState.notice ? ` · ${importState.notice}` : "";
  elements.importMeta.textContent = `识别 ${mapped.length} 条：用户 ${userCount} / 对方 ${assistantCount} · ${modeLabel}${sourceInfo}${speakerInfo}${ignoredInfo}${previewInfo}${noticeInfo}`;
}

function handleImportMappingChange(event) {
  if (event.target.id === "importUserSpeakerSelect") {
    importState.userSpeaker = event.target.value;
    updateImportPreview();
    return;
  }
  if (event.target.name === "importFirstRole") {
    importState.firstRole = event.target.value;
    updateImportPreview();
  }
}

function handleSwapImportRoles() {
  if (importState.detectedMode === "direct") {
    importState.directSwap = !importState.directSwap;
    updateImportPreview();
    return;
  }
  if (importState.detectedMode === "alternate") {
    importState.firstRole = importState.firstRole === "user" ? "assistant" : "user";
    updateImportPreview();
    return;
  }
  if (importState.detectedMode === "speaker" && importState.speakers.length === 2) {
    const next = importState.speakers.find((speaker) => speaker !== importState.userSpeaker);
    if (next) {
      importState.userSpeaker = next;
      updateImportPreview();
    }
  }
}

async function handleConfirmImport() {
  if (state.isImporting) return;
  const mapped = buildImportMessages();
  if (!mapped.length) return;
  state.isImporting = true;
  elements.confirmImportBtn.disabled = true;
  const originalText = elements.confirmImportBtn.textContent;
  elements.confirmImportBtn.textContent = "导入中...";
  elements.importMeta.textContent = "正在保存导入内容...";
  await delay(0);
  try {
    await saveImportSession(mapped, {
      analyze: settings.autoAnalyze,
      onProgress: ({ saved, total }) => {
        elements.importMeta.textContent = `正在保存 ${saved}/${total} 条...`;
      },
    });
    elements.importInput.value = "";
    updateImportPreview();
    openImportModal(false);
  } catch (error) {
    console.error(error);
    elements.importMeta.textContent = "导入失败，请检查格式后重试。";
  } finally {
    state.isImporting = false;
    elements.confirmImportBtn.textContent = originalText;
  }
}

function buildImportMessages() {
  if (!importState.parsed.length) {
    return [];
  }
  if (importState.detectedMode === "direct") {
    return importState.parsed
      .filter((entry) => entry.text && entry.text.trim())
      .map((entry) => {
        const role = normalizeImportRole(entry.role, importState.directSwap);
        if (!role) return null;
        return { role, text: entry.text };
      })
      .filter(Boolean);
  }
  if (importState.detectedMode === "speaker") {
    const userSpeaker = importState.userSpeaker || importState.speakers[0];
    return importState.parsed
      .filter((entry) => entry.text && entry.text.trim())
      .map((entry) => ({
        role: entry.speaker === userSpeaker ? "user" : "assistant",
        text: entry.text,
      }));
  }
  const firstRole = importState.firstRole === "assistant" ? "assistant" : "user";
  return importState.parsed
    .filter((entry) => entry.text && entry.text.trim())
    .map((entry, index) => ({
      role: index % 2 === 0 ? firstRole : firstRole === "user" ? "assistant" : "user",
      text: entry.text,
    }));
}

async function saveImportSession(messages, { analyze = true, onProgress } = {}) {
  if (!messages.length) return;
  const createdAtBase = Date.now();
  const importId = makeId();
  const userCount = messages.filter((message) => message.role === "user").length;
  const assistantCount = messages.length - userCount;
  const source = importState.source || "";
  const session = {
    id: importId,
    title: buildImportTitle(source, createdAtBase),
    source,
    mode: importState.detectedMode,
    split: importState.split,
    createdAt: createdAtBase,
    messageCount: messages.length,
    userCount,
    assistantCount,
    includeInStats: true,
  };
  const records = messages.map((message, index) => ({
    id: makeId(),
    importId,
    conversationId: `import:${importId}`,
    role: message.role,
    text: message.text,
    createdAt: createdAtBase + index,
  }));
  await addRecord("imports", session);
  const total = records.length;
  let saved = 0;
  const batchSize = 50;
  onProgress?.({ saved, total });
  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    await addImportMessagesBatch(batch);
    saved += batch.length;
    onProgress?.({ saved, total });
    if (i % (batchSize * 2) === 0) {
      await delay(0);
    }
  }

  void refreshStats();
  void refreshImports({ page: 1 });
  void renderPractice();
  if (analyze) {
    void analyzeImportedMessages(records).then(async () => {
      await refreshStats();
      await refreshCards();
    });
  } else {
    void refreshCards();
  }
}

async function analyzeImportedMessages(records) {
  const userMessages = records.filter((record) => record.role === "user");
  if (!userMessages.length) {
    return;
  }
  updateAnalysisStatus({ running: true });
  try {
    const total = userMessages.length;
    for (let i = 0; i < total; i += 1) {
      const message = userMessages[i];
      elements.analysisStatus.textContent = `分析：导入 ${i + 1}/${total}`;
      const analysis = await computeAnalysis(message.text);
      await saveAnalysisForMessage(message, analysis);
      if (i % 5 === 0) {
        await delay(0);
      }
    }
  } catch (error) {
    console.error(error);
    updateAnalysisStatus({ failed: true });
    return;
  }
  updateAnalysisStatus();
}

function parseShareImport(raw) {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (looksLikeHtml(trimmed)) {
    const doubao = parseDoubaoShareHtml(trimmed);
    if (doubao) return doubao;
    const chatgpt = parseChatGptShareHtml(trimmed);
    if (chatgpt) return chatgpt;
    const gemini = parseGeminiShareHtml(trimmed);
    if (gemini) return gemini;
    return {
      source: "unknown",
      entries: [],
      notice: "检测到 HTML，但未识别分享页格式。",
    };
  }
  const shareUrl = matchShareUrl(trimmed);
  if (!shareUrl) return null;
  const source = detectShareSource(shareUrl);
  return {
    source,
    entries: [],
    notice: "检测到分享链接，正在尝试抓取页面内容。",
  };
}

async function ensureShareHtml(url) {
  if (importState.fetchUrl === url && importState.fetchedHtml) {
    return importState.fetchedHtml;
  }
  if (importState.fetching && importState.fetchUrl === url) {
    return null;
  }
  importState.fetching = true;
  importState.fetchUrl = url;
  importState.fetchError = "";
  try {
    const html = await fetchShareHtml(url);
    if (importState.fetchUrl !== url) {
      return null;
    }
    importState.fetchedHtml = html;
    importState.fetching = false;
    importState.fetchError = "";
    updateImportPreview();
    return html;
  } catch (error) {
    if (importState.fetchUrl !== url) {
      return null;
    }
    importState.fetching = false;
    importState.fetchedHtml = "";
    importState.fetchError = buildFetchErrorNotice(error);
    updateImportPreview();
    return null;
  }
}

async function fetchShareHtml(url) {
  const errors = [];
  if (!isFileOrigin()) {
    try {
      return await fetchViaProxy(url);
    } catch (error) {
      errors.push(error);
    }
  }
  try {
    return await fetchDirect(url);
  } catch (error) {
    errors.push(error);
  }
  throw errors[errors.length - 1] || new Error("fetch_failed");
}

async function fetchViaProxy(url) {
  const response = await fetch(`/proxy?url=${encodeURIComponent(url)}`);
  if (!response.ok) {
    const error = new Error("proxy_unavailable");
    error.status = response.status;
    throw error;
  }
  return response.text();
}

async function fetchDirect(url) {
  const response = await fetch(url, { mode: "cors", credentials: "omit" });
  if (!response.ok) {
    const error = new Error("direct_fetch_failed");
    error.status = response.status;
    throw error;
  }
  return response.text();
}

function buildFetchErrorNotice(error) {
  if (isFileOrigin()) {
    return "当前以文件方式打开，无法跨域抓取。请运行 `node server.js` 后访问 `http://localhost:4173`。";
  }
  if (error && error.status === 403) {
    return "抓取被拒绝，请确认链接可公开访问。";
  }
  return "自动抓取失败，可能是跨域限制。请运行 `node server.js` 后访问 `http://localhost:4173` 再试。";
}

function isFileOrigin() {
  return window.location.protocol === "file:";
}

function parseDoubaoShareHtml(html) {
  if (!/doubao\.com\/thread\//i.test(html)) return null;
  const args = findLargestDataFnArgs(html);
  if (!args) return { source: "doubao", entries: [], notice: "未找到可解析的数据。" };
  let parsed;
  try {
    parsed = safeParseJson(decodeHtmlEntities(args));
  } catch (error) {
    return { source: "doubao", entries: [], notice: "分享页数据解析失败。" };
  }
  const messageList = parsed?.[2]?.data?.message_snapshot?.message_list;
  if (!Array.isArray(messageList)) {
    return { source: "doubao", entries: [], notice: "未识别到对话内容。" };
  }
  const entries = messageList
    .map((item) => {
      let text = "";
      let content = item?.content;
      if (typeof content === "string") {
        try {
          content = safeParseJson(content);
        } catch (error) {
          content = null;
        }
      }
      if (content && typeof content === "object" && content.text) {
        text = String(content.text).trim();
      } else if (typeof item?.content === "string") {
        text = item.content.trim();
      }
      if (!text) return null;
      const role = item?.user_type === 1 ? "user" : "assistant";
      return { role, text, index: item?.index ?? 0 };
    })
    .filter(Boolean)
    .sort((a, b) => a.index - b.index)
    .map(({ role, text }) => ({ role, text }));
  if (!entries.length) {
    return { source: "doubao", entries: [], notice: "未识别到可导入的对话内容。" };
  }
  return { source: "doubao", entries };
}

function parseChatGptShareHtml(html) {
  if (!/(chatgpt\.com|chat\.openai\.com)\/share\//i.test(html)) return null;
  const pool = extractChatGptSharePool(html);
  if (!pool) {
    return { source: "chatgpt", entries: [], notice: "未找到对话数据。" };
  }
  const root = decodeReactRouterData(pool);
  const entries = extractChatGptMessages(root);
  if (!entries.length) {
    return { source: "chatgpt", entries: [], notice: "未识别到可导入的对话内容。" };
  }
  return { source: "chatgpt", entries };
}

function extractChatGptSharePool(html) {
  const regex = /streamController\.enqueue\("((?:\\.|[^"\\])*)"\)/g;
  let bestPool = null;
  let bestLength = 0;
  let match;
  while ((match = regex.exec(html))) {
    const decoded = decodeJsStringLiteral(match[1]);
    let parsed;
    try {
      parsed = JSON.parse(decoded);
    } catch (error) {
      continue;
    }
    if (!Array.isArray(parsed)) {
      continue;
    }
    if (decoded.length > bestLength) {
      bestLength = decoded.length;
      bestPool = parsed;
    }
  }
  return bestPool;
}

function parseGeminiShareHtml(html) {
  if (!/gemini\.google\.com\/share\//i.test(html)) return null;
  return {
    source: "gemini",
    entries: [],
    notice: "Gemini 分享页内容为动态加载，请使用“复制对话内容”后粘贴。",
  };
}

function extractChatGptMessages(root) {
  const mapping = root?.mapping;
  const currentNode = root?.current_node;
  if (!mapping || !currentNode) return [];
  const path = [];
  const seen = new Set();
  let nodeId = currentNode;
  while (nodeId && mapping[nodeId] && !seen.has(nodeId)) {
    seen.add(nodeId);
    path.push(mapping[nodeId]);
    nodeId = mapping[nodeId].parent;
  }
  path.reverse();
  const entries = [];
  path.forEach((node) => {
    const message = node?.message;
    if (!message) return;
    const role = message?.author?.role;
    if (role !== "user" && role !== "assistant") return;
    const metadata = message?.metadata || {};
    if (metadata.is_user_system_message || metadata.is_visually_hidden_from_conversation) {
      return;
    }
    const parts = message?.content?.parts;
    if (!Array.isArray(parts)) return;
    const text = parts.filter((part) => typeof part === "string").join("\n").trim();
    if (!text) return;
    entries.push({ role, text });
  });
  return entries;
}

function decodeReactRouterData(pool) {
  if (!Array.isArray(pool)) return null;
  const serverIndex = pool.indexOf("serverResponse");
  if (serverIndex === -1) return null;
  const memo = new Map();
  const inProgress = Symbol("inProgress");
  const decodeIndex = (idx) => {
    if (idx === -5 || idx == null || idx < 0 || idx >= pool.length) {
      return null;
    }
    if (memo.has(idx)) {
      const cached = memo.get(idx);
      return cached === inProgress ? null : cached;
    }
    const item = pool[idx];
    if (Array.isArray(item)) {
      memo.set(idx, inProgress);
      const result = item.map((entry) =>
        typeof entry === "number" ? decodeIndex(entry) : entry
      );
      memo.set(idx, result);
      return result;
    }
    if (item && typeof item === "object") {
      memo.set(idx, inProgress);
      const result = {};
      const keys = Object.keys(item);
      const isEncoded = keys.every((key) => key.startsWith("_"));
      keys.forEach((key) => {
        if (isEncoded) {
          const keyIndex = Number(key.slice(1));
          const keyName = pool[keyIndex];
          if (typeof keyName !== "string") return;
          const valueIndex = item[key];
          result[keyName] =
            typeof valueIndex === "number" ? decodeIndex(valueIndex) : valueIndex;
        } else {
          const value = item[key];
          result[key] = typeof value === "number" ? decodeIndex(value) : value;
        }
      });
      memo.set(idx, result);
      return result;
    }
    memo.set(idx, item);
    return item;
  };
  const wrapper = decodeIndex(serverIndex + 1);
  return wrapper?.data || null;
}

function decodeJsStringLiteral(raw) {
  let result = "";
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (ch !== "\\") {
      result += ch;
      continue;
    }
    const next = raw[i + 1];
    if (next === "u") {
      const code = raw.slice(i + 2, i + 6);
      if (/^[0-9a-fA-F]{4}$/.test(code)) {
        result += String.fromCharCode(parseInt(code, 16));
        i += 5;
        continue;
      }
    }
    const escapes = {
      n: "\n",
      r: "\r",
      t: "\t",
      b: "\b",
      f: "\f",
      '"': "\"",
      "\\": "\\",
    };
    if (escapes[next]) {
      result += escapes[next];
      i += 1;
      continue;
    }
    result += next || "";
    i += 1;
  }
  return result;
}

function decodeHtmlEntities(text) {
  if (typeof document === "undefined") return text;
  const textarea = document.createElement("textarea");
  textarea.innerHTML = text;
  return textarea.value;
}

function looksLikeHtml(text) {
  return /<!doctype html|<html\b|<head\b|<body\b|<script\b/i.test(text);
}

function matchShareUrl(text) {
  const trimmed = text.trim();
  const match = trimmed.match(/^https?:\/\/\S+$/);
  if (!match) return null;
  if (detectShareSource(trimmed) === "unknown") return null;
  return trimmed;
}

function detectShareSource(text) {
  if (/doubao\.com\/thread\//i.test(text)) return "doubao";
  if (/(chatgpt\.com|chat\.openai\.com)\/share\//i.test(text)) return "chatgpt";
  if (/gemini\.google\.com\/share\//i.test(text)) return "gemini";
  return "unknown";
}

function getImportSourceLabel(source) {
  const labels = {
    doubao: "豆包",
    chatgpt: "ChatGPT",
    gemini: "Gemini",
    unknown: "",
  };
  return labels[source] || source || "";
}

function buildImportTitle(source, timestamp) {
  const label = getImportSourceLabel(source);
  if (label) return `${label} 导入`;
  return `导入 ${new Date(timestamp).toLocaleDateString()}`;
}

function normalizeImportRole(role, swap) {
  let normalized = null;
  if (role === "user") normalized = "user";
  if (role === "assistant") normalized = "assistant";
  if (!normalized) return null;
  if (swap) {
    return normalized === "user" ? "assistant" : "user";
  }
  return normalized;
}

function findLargestDataFnArgs(html) {
  const regex = /data-fn-args=\"([^\"]+)\"/g;
  let best = "";
  let match;
  while ((match = regex.exec(html))) {
    if (match[1].length > best.length) {
      best = match[1];
    }
  }
  return best || null;
}

function parseImportText(raw, { mode = "auto", split = "line" } = {}) {
  const lines = raw.split(/\r?\n/).map(sanitizeImportLine);
  const stats = { ignored: 0 };
  const detection = detectImportMode(lines, mode);
  const parsedMode = detection.mode;
  let entries = [];
  if (parsedMode === "speaker") {
    entries = parseSpeakerLines(lines, stats);
  } else if (parsedMode === "alternate") {
    entries = parseAlternateLines(lines, split, stats);
  }
  const speakers = parsedMode === "speaker" ? collectSpeakers(entries) : detection.speakers;
  return {
    entries,
    mode: parsedMode,
    speakers,
    ignored: stats.ignored,
  };
}

function detectImportMode(lines, mode) {
  if (mode === "alternate") {
    return { mode: "alternate", speakers: [] };
  }

  const counts = new Map();
  let labeledCount = 0;
  let usableCount = 0;

  lines.forEach((line) => {
    if (!line) {
      return;
    }
    if (isSeparatorLine(line) || looksLikeTimestamp(line)) {
      return;
    }
    usableCount += 1;
    const labeled = matchSpeakerLabel(line) || matchSpeakerHeader(line);
    if (!labeled) {
      return;
    }
    labeledCount += 1;
    const speaker = labeled.speaker;
    counts.set(speaker, (counts.get(speaker) || 0) + 1);
  });

  const speakers = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([speaker]) => speaker);

  if (mode === "speaker") {
    return { mode: "speaker", speakers };
  }

  const distinctSpeakers = speakers.length;
  const ratio = usableCount ? labeledCount / usableCount : 0;
  const repeated = Array.from(counts.values()).filter((count) => count >= 2).length;
  const isSpeaker = distinctSpeakers >= 2 && (ratio >= 0.3 || repeated >= 1);
  return { mode: isSpeaker ? "speaker" : "alternate", speakers };
}

function parseSpeakerLines(lines, stats) {
  const entries = [];
  let current = null;
  let pendingSpeaker = null;

  lines.forEach((line) => {
    if (!line) {
      stats.ignored += 1;
      return;
    }
    if (isSeparatorLine(line) || looksLikeTimestamp(line)) {
      stats.ignored += 1;
      return;
    }
    const labeled = matchSpeakerLabel(line);
    if (labeled) {
      if (current) {
        entries.push(current);
      }
      current = { speaker: labeled.speaker, text: labeled.text };
      pendingSpeaker = null;
      return;
    }
    const header = matchSpeakerHeader(line);
    if (header) {
      if (current) {
        entries.push(current);
        current = null;
      }
      pendingSpeaker = header.speaker;
      return;
    }
    if (pendingSpeaker) {
      current = { speaker: pendingSpeaker, text: line };
      pendingSpeaker = null;
      return;
    }
    if (current) {
      current.text = `${current.text}\n${line}`;
      return;
    }
    stats.ignored += 1;
  });

  if (current) {
    entries.push(current);
  }
  return entries;
}

function parseAlternateLines(lines, splitMode, stats) {
  const entries = [];
  if (splitMode === "paragraph") {
    let buffer = [];
    lines.forEach((line) => {
      if (!line) {
        if (buffer.length) {
          entries.push({ text: buffer.join("\n") });
          buffer = [];
        }
        stats.ignored += 1;
        return;
      }
      if (isSeparatorLine(line) || looksLikeTimestamp(line)) {
        stats.ignored += 1;
        return;
      }
      buffer.push(line);
    });
    if (buffer.length) {
      entries.push({ text: buffer.join("\n") });
    }
    return entries;
  }

  lines.forEach((line) => {
    if (!line) {
      stats.ignored += 1;
      return;
    }
    if (isSeparatorLine(line) || looksLikeTimestamp(line)) {
      stats.ignored += 1;
      return;
    }
    entries.push({ text: line });
  });
  return entries;
}

function collectSpeakers(entries) {
  const counts = new Map();
  entries.forEach((entry) => {
    const speaker = entry.speaker;
    if (!speaker) return;
    counts.set(speaker, (counts.get(speaker) || 0) + 1);
  });
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([speaker]) => speaker);
}

function matchSpeakerLabel(line) {
  if (!line || looksLikeTimestamp(line)) return null;
  const patterns = [
    {
      regex:
        /^\s*(\d{4}[./-]\d{1,2}[./-]\d{1,2}(?:\s+\d{1,2}:\d{2}(?::\d{2})?\s*(?:[AP]M)?)?)\s*[-–—]?\s*(.+?)\s*[:：]\s*(.+)$/,
      speakerIndex: 2,
      textIndex: 3,
    },
    {
      regex:
        /^\s*\[?(?:\d{1,2}:\d{2}(?::\d{2})?\s*(?:[AP]M)?)\]?\s*[-–—]?\s*(.+?)\s*[:：]\s*(.+)$/,
      speakerIndex: 1,
      textIndex: 2,
    },
    {
      regex: /^\s*[\[【(（]\s*(.+?)\s*[\]】)）]\s*(.+)$/,
      speakerIndex: 1,
      textIndex: 2,
    },
    {
      regex: /^\s*(.+?)\s*[:：]\s*(.+)$/,
      speakerIndex: 1,
      textIndex: 2,
    },
    {
      regex: /^\s*(.+?)\s*[>»]\s*(.+)$/,
      speakerIndex: 1,
      textIndex: 2,
    },
  ];

  for (const pattern of patterns) {
    const match = line.match(pattern.regex);
    if (!match) continue;
    const speaker = normalizeSpeakerName(match[pattern.speakerIndex]);
    const text = (match[pattern.textIndex] || "").trim();
    if (!text) continue;
    if (!looksLikeSpeaker(speaker)) continue;
    if (looksLikeTimestamp(speaker)) continue;
    return { speaker, text };
  }
  return null;
}

function matchSpeakerHeader(line) {
  if (!line || looksLikeTimestamp(line)) return null;
  const timeOnly = line.match(/^(.+?)\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?$/i);
  if (timeOnly) {
    const speaker = normalizeSpeakerName(timeOnly[1]);
    if (looksLikeSpeaker(speaker)) {
      return { speaker };
    }
  }
  const dateTime = line.match(
    /^(.+?)\s+\d{4}[./-]\d{1,2}[./-]\d{1,2}(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/i
  );
  if (dateTime) {
    const speaker = normalizeSpeakerName(dateTime[1]);
    if (looksLikeSpeaker(speaker)) {
      return { speaker };
    }
  }
  const colonOnly = line.match(/^(.+?)\s*[:：]\s*$/);
  if (colonOnly) {
    const speaker = normalizeSpeakerName(colonOnly[1]);
    if (looksLikeSpeaker(speaker)) {
      return { speaker };
    }
  }
  return null;
}

function normalizeSpeakerName(name) {
  return (name || "")
    .replace(/^[\[\(（【]+/, "")
    .replace(/[\]\)）】]+$/, "")
    .trim();
}

function looksLikeSpeaker(name) {
  const trimmed = (name || "").trim();
  if (!trimmed) return false;
  if (trimmed.length > 24) return false;
  if (looksLikeTimestamp(trimmed)) return false;
  if (/https?:\/\//i.test(trimmed)) return false;
  if (/[。！？?!]/.test(trimmed)) return false;
  const words = trimmed.split(/\s+/);
  if (words.length > 4) return false;
  return true;
}

function isSeparatorLine(line) {
  return /^[-=*_·•]{3,}$/.test(line);
}

function looksLikeTimestamp(text) {
  if (!text) return false;
  if (/^\d{1,2}:\d{2}(:\d{2})?(\s*[AP]M)?$/i.test(text)) {
    return true;
  }
  if (/^(上午|下午|晚上|中午)\s*\d{1,2}:\d{2}$/.test(text)) {
    return true;
  }
  if (
    /^\d{4}[./-]\d{1,2}[./-]\d{1,2}(\s+\d{1,2}:\d{2}(:\d{2})?(\s*[AP]M)?)?$/i.test(
      text
    )
  ) {
    return true;
  }
  if (/^\d{4}年\d{1,2}月\d{1,2}日(\s+\d{1,2}:\d{2})?$/.test(text)) {
    return true;
  }
  return false;
}

function sanitizeImportLine(line) {
  return (line || "").replace(/\u200b/g, "").trim();
}

async function openDb() {
  if (openDb.promise) {
    return openDb.promise;
  }
  openDb.promise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onblocked = () => {
      console.warn("Database upgrade blocked. Please close other tabs.");
      alert("请关闭本应用的其他标签页以完成数据库更新，否则功能可能无法使用。");
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        console.warn("Database version changed. Connection closed.");
        alert("数据库版本已更新，请刷新页面。");
      };
      resolve(db);
    };
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("conversations")) {
        const store = db.createObjectStore("conversations", { keyPath: "id" });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }
      if (!db.objectStoreNames.contains("messages")) {
        const store = db.createObjectStore("messages", { keyPath: "id" });
        store.createIndex("conversationId", "conversationId", { unique: false });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }
      if (!db.objectStoreNames.contains("analyses")) {
        const store = db.createObjectStore("analyses", { keyPath: "id" });
        store.createIndex("conversationId", "conversationId", { unique: false });
        store.createIndex("messageId", "messageId", { unique: false });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }
      if (!db.objectStoreNames.contains("practice")) {
        const store = db.createObjectStore("practice", { keyPath: "id" });
        store.createIndex("conversationId", "conversationId", { unique: false });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }
      if (!db.objectStoreNames.contains("cards")) {
        const store = db.createObjectStore("cards", { keyPath: "id" });
        store.createIndex("type", "type", { unique: false });
        store.createIndex("updatedAt", "updatedAt", { unique: false });
      }
      if (!db.objectStoreNames.contains("appMeta")) {
        db.createObjectStore("appMeta", { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains("imports")) {
        const store = db.createObjectStore("imports", { keyPath: "id" });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }
      if (!db.objectStoreNames.contains("importMessages")) {
        const store = db.createObjectStore("importMessages", { keyPath: "id" });
        store.createIndex("importId", "importId", { unique: false });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }
    };
  });
  return openDb.promise;
}

async function createConversation() {
  const conversation = {
    id: makeId(),
    title: `会话 ${new Date().toLocaleDateString()}`,
    createdAt: Date.now(),
    includeInStats: true,
  };
  await addRecord("conversations", conversation);
  return conversation;
}

function formatPracticeType(type) {
  const labels = {
    recall: "回忆",
    rewrite: "改写",
    scenario: "情景",
    substitution: "替换",
  };
  return labels[type] || type || "练习";
}

function formatApiError(error) {
  if (!error) return "";
  if (error.status) {
    return `API 错误 ${error.status}`;
  }
  if (error.message) {
    const lower = error.message.toLowerCase();
    if (lower.includes("failed to fetch") || lower.includes("networkerror")) {
      return "网络连接失败";
    }
    return error.message.replace(/\s+/g, " ").slice(0, 120);
  }
  return "";
}

async function addRecord(storeName, record) {
  const db = await openDb();
  const tx = db.transaction(storeName, "readwrite");
  const store = tx.objectStore(storeName);
  store.add(record);
  await transactionDone(tx);
}

async function updateRecord(storeName, record) {
  const db = await openDb();
  const tx = db.transaction(storeName, "readwrite");
  const store = tx.objectStore(storeName);
  store.put(record);
  await transactionDone(tx);
}

async function addImportMessagesBatch(records) {
  const db = await openDb();
  const tx = db.transaction("importMessages", "readwrite");
  const messageStore = tx.objectStore("importMessages");
  records.forEach((record) => messageStore.add(record));
  await transactionDone(tx);
}

async function getRecord(storeName, key) {
  const db = await openDb();
  const tx = db.transaction(storeName, "readonly");
  const store = tx.objectStore(storeName);
  const request = store.get(key);
  const result = await requestToPromise(request);
  await transactionDone(tx);
  return result;
}

async function getAllRecords(storeName) {
  const db = await openDb();
  const tx = db.transaction(storeName, "readonly");
  const store = tx.objectStore(storeName);
  const request = store.getAll();
  const result = await requestToPromise(request);
  await transactionDone(tx);
  return result || [];
}

async function getAllFromIndex(storeName, indexName, query) {
  const db = await openDb();
  const tx = db.transaction(storeName, "readonly");
  const store = tx.objectStore(storeName);
  const index = store.index(indexName);
  const request = index.getAll(query);
  const result = await requestToPromise(request);
  await transactionDone(tx);
  return result || [];
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => {
      console.error("[DB] Transaction error", tx.error);
      reject(tx.error);
    };
    tx.onabort = () => {
      console.error("[DB] Transaction aborted", tx.error);
      reject(tx.error);
    };
  });
}

async function getMetaValue(key) {
  const record = await getRecord("appMeta", key);
  return record ? record.value : null;
}

async function setMetaValue(key, value) {
  await updateRecord("appMeta", { key, value });
}
