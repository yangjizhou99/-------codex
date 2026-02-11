import initJieba, { tag } from "https://cdn.jsdelivr.net/npm/jieba-wasm@2.4.0/pkg/web/jieba_rs_wasm.js";

const DB_NAME = "native-loop-db";
const DB_VERSION = 2;
const SETTINGS_KEY = "nativeLoop.settings";
const LAST_CONVO_KEY = "nativeLoop.lastConversationId";

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
  messages: [],
  analyses: new Map(),
  practice: [],
  isSending: false,
  isReanalyzing: false,
  isEnriching: false,
  cardTranslations: new Map(),
  recognition: null,
  micActive: false,
};

const el = (id) => document.getElementById(id);

const elements = {
  tabs: Array.from(document.querySelectorAll(".tab")),
  panels: {
    chat: el("panel-chat"),
    stats: el("panel-stats"),
    practice: el("panel-practice"),
    cards: el("panel-cards"),
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
  refreshStatsBtn: el("refreshStatsBtn"),
  reanalyzeBtn: el("reanalyzeBtn"),
  generatePracticeBtn: el("generatePracticeBtn"),
  practiceList: el("practiceList"),
  practiceMeta: el("practiceMeta"),
  cardLangSelect: el("cardLangSelect"),
  refreshCardsBtn: el("refreshCardsBtn"),
  enrichCardsBtn: el("enrichCardsBtn"),
  cardStatus: el("cardStatus"),
  vocabCards: el("vocabCards"),
  patternCards: el("patternCards"),
  statUtterances: el("statUtterances"),
  statAnalyzed: el("statAnalyzed"),
  statPractice: el("statPractice"),
  statVocab: el("statVocab"),
  statPatterns: el("statPatterns"),
};

let settings = loadSettings();

init();

async function init() {
  applySettingsToUI();
  bindEvents();
  await initSegmenter();
  await openDb();
  await loadConversation();
  renderMessages();
  await refreshStats();
  renderPractice();
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
  elements.saveSettingsBtn.addEventListener("click", saveSettingsFromUI);
  elements.newSessionBtn.addEventListener("click", handleNewSession);
  elements.exportBtn.addEventListener("click", exportData);
  elements.refreshStatsBtn.addEventListener("click", refreshStats);
  elements.reanalyzeBtn.addEventListener("click", handleReanalyzeAll);
  elements.generatePracticeBtn.addEventListener("click", handleGeneratePractice);
  elements.practiceList.addEventListener("click", handlePracticeAction);
  elements.refreshCardsBtn.addEventListener("click", () => {
    refreshCards();
  });
  elements.enrichCardsBtn.addEventListener("click", handleEnrichCards);
  elements.cardLangSelect.addEventListener("change", () => {
    renderCards();
  });
  elements.vocabCards.addEventListener("click", handleCardToggle);
  elements.patternCards.addEventListener("click", handleCardToggle);
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
    refreshCards();
  }
}

function openModal(show) {
  elements.settingsModal.classList.toggle("show", show);
  elements.settingsModal.setAttribute("aria-hidden", String(!show));
}

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY));
    if (saved && typeof saved === "object") {
      return { ...defaultSettings, ...saved };
    }
  } catch (error) {
    console.warn("设置加载失败", error);
  }
  return { ...defaultSettings };
}

function applySettingsToUI() {
  elements.apiKeyInput.value = settings.apiKey;
  elements.apiBaseInput.value = settings.apiBase;
  elements.modelSelect.value = settings.model;
  elements.autoAnalyzeToggle.checked = settings.autoAnalyze;
  elements.speechLangSelect.value = settings.speechLang;
  updateAnalysisStatus();
}

function saveSettingsFromUI() {
  settings = {
    apiKey: elements.apiKeyInput.value.trim(),
    apiBase: elements.apiBaseInput.value.trim() || defaultSettings.apiBase,
    model: elements.modelSelect.value,
    autoAnalyze: elements.autoAnalyzeToggle.checked,
    speechLang: elements.speechLangSelect.value,
  };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  applySettingsToUI();
  updateSpeechRecognitionLanguage();
  openModal(false);
}

function handleNewSession() {
  createConversation().then(async (conversation) => {
    state.conversationId = conversation.id;
    state.messages = [];
    localStorage.setItem(LAST_CONVO_KEY, conversation.id);
    renderMessages();
    refreshStats();
    renderPractice();
  });
}

async function loadConversation() {
  let conversation = null;
  const savedId = localStorage.getItem(LAST_CONVO_KEY);
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
  state.conversationId = conversation.id;
  localStorage.setItem(LAST_CONVO_KEY, conversation.id);
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
    const messages = await getAllRecords("messages");
    const userMessages = messages
      .filter((message) => message.role === "user" && message.text && message.text.trim())
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
    const [messages, analyses, practice] = await Promise.all([
      getAllRecords("messages"),
      getAllRecords("analyses"),
      getAllRecords("practice"),
    ]);
    const utterances = messages.filter((message) => message.role === "user").length;
    elements.statUtterances.textContent = String(utterances);
    const analysisList = dedupeAnalyses(analyses);
    elements.statAnalyzed.textContent = String(analysisList.length);
    elements.statPractice.textContent = String(practice.length);

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
  } catch (error) {
    console.error(error);
  }
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
  if (!elements.vocabCards || !elements.patternCards) {
    return;
  }
  try {
    const analyses = dedupeAnalyses(await getAllRecords("analyses"));
    const base = buildCardBase(analyses);
    const language = elements.cardLangSelect.value;
    renderCardSection(elements.vocabCards, base.vocabCards, language, "vocab");
    renderCardSection(elements.patternCards, base.patternCards, language, "pattern");
    updateCardStatusText(base);
  } catch (error) {
    console.error(error);
  }
}

function updateCardStatusText(base) {
  if (!elements.cardStatus) return;
  const total = base.vocabCards.length + base.patternCards.length;
  if (!total) {
    elements.cardStatus.textContent = "暂无卡片，先在对话中输入一些语句。";
    return;
  }
  elements.cardStatus.textContent = `共 ${total} 张卡片（词汇 ${base.vocabCards.length} / 句型 ${base.patternCards.length}）。`;
}

function buildCardBase(analyses) {
  const vocabMap = new Map();
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

  const vocabCards = Array.from(vocabMap.values())
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

  return { vocabCards, patternCards };
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
    cardEl.dataset.id = cardId(type, card.key);

    const header = document.createElement("div");
    header.className = "card-header";
    const key = document.createElement("div");
    key.className = "card-key";
    key.textContent = card.key;
    header.appendChild(key);
    if (type === "pattern" && card.usage) {
      const usage = document.createElement("div");
      usage.className = "card-usage";
      usage.textContent = `作用：${card.usage}`;
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
    translationTitle.textContent = `${CARD_LANG_LABELS[language]?.label || "目标语言"}表达`;
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
  const analysisRecords = Array.from(state.analyses.values())
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

  const records = [];
  for (const task of tasks) {
    const record = {
      id: makeId(),
      conversationId: state.conversationId,
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
  renderPractice();
  refreshStats();
}

async function handleEnrichCards() {
  if (state.isEnriching) return;
  if (!settings.apiKey) {
    setCardStatus("需要 API 才能补全卡片。");
    return;
  }
  state.isEnriching = true;
  elements.enrichCardsBtn.disabled = true;
  await loadCardTranslations();
  try {
    const analyses = dedupeAnalyses(await getAllRecords("analyses"));
    const base = buildCardBase(analyses);
    const language = elements.cardLangSelect.value;
    const missing = collectMissingCards(base, language);
    if (!missing.total) {
      setCardStatus("当前语言的卡片已全部补全。");
      return;
    }
    setCardStatus(`正在补全 ${missing.total} 张卡片...`);
    const result = await fetchCardEnrichment(missing, language);
    await applyCardEnrichment(result, language);
    await loadCardTranslations();
    renderCards();
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
    elements.enrichCardsBtn.disabled = false;
  }
}

function collectMissingCards(base, language) {
  const vocab = [];
  const patterns = [];
  let remaining = CARD_ENRICH_LIMIT;
  let totalMissing = 0;

  base.vocabCards.forEach((card) => {
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

  base.patternCards.forEach((card) => {
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
    patterns,
    total: Math.min(totalMissing, CARD_ENRICH_LIMIT),
    truncated: totalMissing > CARD_ENRICH_LIMIT,
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
          "你是学习卡片生成器。给定中文词汇和中文句型，请输出目标语言的翻译与例句。只输出严格 JSON，对应输入结构返回：{vocab:[{key, translation, example}], patterns:[{pattern, translation, example}] }。translation 为目标语言表达，patterns.translation 使用模板形式（如 I like A）。example 为目标语言例句。",
      },
      {
        role: "user",
        content: JSON.stringify({
          language: info.name,
          vocab: missing.vocab,
          patterns: missing.patterns,
        }),
      },
    ],
    temperature: 0.4,
    max_tokens: 900,
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
  const patterns = Array.isArray(result.patterns) ? result.patterns : [];

  for (const item of vocab) {
    if (!item || !item.key || !item.translation) continue;
    await saveCardTranslation("vocab", item.key, language, item.translation, item.example || "");
  }
  for (const item of patterns) {
    if (!item || !item.pattern || !item.translation) continue;
    await saveCardTranslation("pattern", item.pattern, language, item.translation, item.example || "");
  }
}

async function saveCardTranslation(type, key, language, text, example) {
  const id = cardId(type, key);
  const existing = state.cardTranslations.get(id) || (await getRecord("cards", id));
  const record = {
    id,
    type,
    key,
    translations: existing?.translations ? { ...existing.translations } : {},
    updatedAt: Date.now(),
  };
  record.translations[language] = { text, example };
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

function renderPractice() {
  elements.practiceList.innerHTML = "";
  if (!state.practice.length) {
    elements.practiceMeta.textContent = "暂无练习任务，可从你的语句生成。";
    return;
  }
  elements.practiceMeta.textContent = `已准备 ${state.practice.length} 个任务。`;
  const tasks = [...state.practice].sort((a, b) => b.createdAt - a.createdAt);
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

async function openDb() {
  if (openDb.promise) {
    return openDb.promise;
  }
  openDb.promise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
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
    };
  });
  return openDb.promise;
}

async function createConversation() {
  const conversation = {
    id: makeId(),
    title: `会话 ${new Date().toLocaleDateString()}`,
    createdAt: Date.now(),
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
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
