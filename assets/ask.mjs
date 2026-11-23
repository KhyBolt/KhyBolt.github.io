import { sources } from "./ask-claim-data.mjs?v=worker1";
import {
  isAnswerLink, isBoundedText, isRecordId, MAX_ANSWER_FACTS, MAX_FACT_BYTES, MAX_ANSWER_LINKS,
  MAX_ANSWER_SECTIONS, MAX_SECTION_FACTS, MAX_SUMMARY_FACTS,
  boundChatHistory, isChatAnswer, isShareableChatText, portfolioLinks,
  MAX_ASK_BODY_BYTES, MAX_CHAT_HISTORY_BYTES, MAX_CHAT_TURNS,
} from "./ask-protocol.mjs?v=career-chat6-livermore";
import { normalizeQuestion, MAX_QUESTION, MAX_QUESTION_BYTES } from "./portfolio.mjs?v=worker3";

const form = document.getElementById("portfolio-ask-form");
const input = form.elements.question;
const submit = form.querySelector("button[type=submit]");
const ask = document.getElementById("ask");
const masthead = ask.querySelector(".masthead");
const transcript = document.getElementById("portfolio-transcript");
const log = transcript.querySelector(".ask-log");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const status = document.getElementById("portfolio-ask-status");
const statusMessage = status.querySelector(".ask-status-text");
let history = [];
let busy = false;
let following = true;

// Set this to the exact reviewed Worker origin only when the route is approved.
const approvedAskOrigin = "https://portfolio-ask.khybolt.workers.dev";

function askEndpoint(value, current) {
  if (!value) return null;
  try {
    const candidate = new URL(value, current.href);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(current.hostname) &&
      candidate.origin === current.origin;
    const approved = current.origin === "https://khybolt.github.io" &&
      candidate.protocol === "https:" && candidate.origin === approvedAskOrigin;
    return (local || approved) && candidate.pathname === "/ask" &&
      !candidate.search && !candidate.hash && !candidate.username && !candidate.password
      ? candidate.href : null;
  } catch {
    return null;
  }
}

const endpoint = askEndpoint(form.dataset.endpoint, location);
const remote = endpoint ? createClientTransport(endpoint) : null;
let activeRequest;

function isAnswerFact(fact) {
  return isRecordId(fact?.id) && isBoundedText(fact.text, MAX_FACT_BYTES);
}

const approvedAnswerLinks = Object.values(portfolioLinks);

function isReleasedLink(link) {
  return isAnswerLink(link) &&
    approvedAnswerLinks.some(approved => approved.url === link.url && approved.label === link.label);
}

function answerLinks(links) {
  return Array.isArray(links) ? links.filter(isReleasedLink).slice(0, MAX_ANSWER_LINKS) : [];
}

function profileReply(data) {
  const { facts, partial, sections } = data;
  if (!Array.isArray(facts) || !facts.length || facts.length > MAX_ANSWER_FACTS ||
      !facts.every(isAnswerFact) ||
      new Set(facts.map(fact => fact.id)).size !== facts.length ||
      typeof partial !== "boolean") return null;
  if (sections !== undefined) {
    if (!Array.isArray(sections) || !sections.length || sections.length > MAX_ANSWER_SECTIONS ||
        !sections.every(parts => Array.isArray(parts) && parts.length > 0 &&
          parts.length <= MAX_SECTION_FACTS && parts.every(isAnswerFact))) return null;
    const parts = sections.flat();
    if (parts.length > MAX_SUMMARY_FACTS || new Set(parts.map(part => part.id)).size !== parts.length ||
        !facts.every(fact => parts.some(part => part.id === fact.id && part.text === fact.text))) return null;
  }
  return { status: "answer", facts, links: answerLinks(data.links), partial, sections };
}

export function createClientTransport(url, fetcher = globalThis.fetch) {
  const encoder = new TextEncoder();
  return async (question, signal, history = []) => {
    const bodyFor = recent => JSON.stringify({ question, topic: "", history: recent });
    const recent = boundChatHistory(history, turns =>
      encoder.encode(JSON.stringify(turns)).byteLength <= MAX_CHAT_HISTORY_BYTES &&
      encoder.encode(bodyFor(turns)).byteLength <= MAX_ASK_BODY_BYTES
    );
    try {
      const response = await fetcher(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: bodyFor(recent),
        signal: AbortSignal.any([signal, AbortSignal.timeout(84000)]),
        credentials: "omit",
        cache: "no-store",
        redirect: "error",
      });
      const json = response.headers.get("Content-Type")?.startsWith("application/json");
      if (response.status === 429) {
        const data = json ? await response.json().catch(() => null) : null;
        return { status: "rate-limited", limit: data?.limit, retryAfter: Number(response.headers.get("Retry-After")) };
      }
      if (!json) return null;
      const data = await response.json();
      if (response.status === 502 && data?.status === "fallback" && data.reason === "truncated") {
        return { status: "truncated" };
      }
      if (!response.ok) return null;
      if (data?.status === "unknown") return { status: "unknown", reason: data.reason };
      if (data?.status !== "answer") return null;
      if (isChatAnswer(data.paragraphs)) {
        return { status: "answer", paragraphs: data.paragraphs, links: answerLinks(data.links), filtered: data.filtered === true };
      }
      return profileReply(data);
    } catch {
      return null;
    }
  };
}

function cancelRequest() {
  activeRequest?.abort();
}

new MutationObserver(() => {
  if (ask.inert) cancelRequest();
}).observe(ask, { attributes: true, attributeFilter: ["inert"] });
window.addEventListener("pagehide", cancelRequest);

const serviceFallback = {
  text: "The live answer is unavailable right now.",
  links: [],
};
function quotaMessage({ limit, retryAfter }) {
  if (limit === "provider-daily") {
    return "The assistant has reached its AI provider’s free allowance for today. Please try again after 00:00 UTC (10 am Brisbane time).";
  }
  if (limit === "daily") return "The portfolio assistant has reached today’s limit. Please try again after midnight UTC.";
  if (limit === "minute") {
    if (retryAfter === 1) return "Too many requests just now. Please try again in one second.";
    if (Number.isSafeInteger(retryAfter) && retryAfter >= 2 && retryAfter <= 60) {
      return "Too many requests just now. Please try again in " + retryAfter + " seconds.";
    }
    return "Too many requests just now. Please try again in a minute.";
  }
  return "The portfolio assistant is rate limited. Please try again later.";
}
const unsupported = {
  text: "I don’t have enough public information to answer that.",
  links: [],
};
const filteredAnswer = {
  text: "I couldn’t display the generated answer. Try asking about one part of the question.",
  links: [],
};
const truncatedAnswer = {
  text: "The answer reached its length limit. Try asking about one part at a time.",
  links: [],
};
const unshareableQuestion = {
  text: "Please remove links or sensitive details from your question and try again.",
  links: [],
};
const projectShortcut = /^(?:open|show|view)(?: me)? (?:the )?projects[?.!]*$/u;
const resumeLink = portfolioLinks.resume;

function nearEnd() {
  return transcript.scrollHeight - transcript.clientHeight - transcript.scrollTop <= 72;
}

function followEnd() {
  transcript.scrollTop = transcript.scrollHeight;
}

function updateViewport() {
  const viewport = window.visualViewport;
  const root = document.documentElement;
  root.style.setProperty("--ask-viewport-height", `${viewport?.height ?? window.innerHeight}px`);
  root.style.setProperty("--ask-viewport-top", `${viewport?.offsetTop ?? 0}px`);
  if (following && !ask.hidden && !ask.inert) followEnd();
}

function startConversation() {
  if (ask.hasAttribute("data-conversation")) return false;
  const moving = !reducedMotion.matches && typeof form.animate === "function";
  const elements = [masthead, form];
  const before = moving ? elements.map(node => node.getBoundingClientRect()) : [];
  ask.setAttribute("data-conversation", "");
  transcript.hidden = false;
  updateViewport();
  window.scrollTo(0, 0);
  window.addEventListener("resize", updateViewport, { passive: true });
  window.visualViewport?.addEventListener("resize", updateViewport, { passive: true });
  window.visualViewport?.addEventListener("scroll", updateViewport, { passive: true });
  if ("ResizeObserver" in window) {
    const observer = new ResizeObserver(() => {
      if (following && !ask.hidden && !ask.inert) followEnd();
    });
    observer.observe(transcript);
  }

  if (moving) {
    const animations = elements.map((node, index) => {
      const after = node.getBoundingClientRect();
      const start = before[index];
      const travel = `translate(${start.left - after.left}px, ${start.top - after.top}px)`;
      return node.animate([{ transform: travel }, { transform: "none" }], {
        duration: 340, easing: "cubic-bezier(.22,.75,.26,1)"
      });
    });
    animations.push(transcript.animate([{ opacity: 0 }, { opacity: 1 }], {
      delay: 75, duration: 200, fill: "backwards", easing: "ease-out"
    }));
    const applyMotionPreference = () => {
      if (reducedMotion.matches) animations.forEach(animation => animation.cancel());
    };
    reducedMotion.addEventListener("change", applyMotionPreference);
    Promise.allSettled(animations.map(animation => animation.finished)).then(() => {
      reducedMotion.removeEventListener("change", applyMotionPreference);
    });
  }
  return true;
}

const arrivingTurns = new Set();
reducedMotion.addEventListener("change", event => {
  if (event.matches) arrivingTurns.forEach(animation => animation.cancel());
});

function animateTurn(turn, visitor, delay) {
  if (reducedMotion.matches || typeof turn.animate !== "function") return;
  const direction = visitor ? 1 : -1;
  const animation = turn.animate([
    { opacity: .26, transform: `translateX(${8 * direction}px) scale(.986)` },
    { opacity: 1, transform: `translateX(${1 * direction}px) scale(.998)`, offset: .77 },
    { opacity: 1, transform: "none" }
  ], {
    delay, duration: 208, easing: "cubic-bezier(.22,.72,.32,1)", fill: "backwards"
  });
  arrivingTurns.add(animation);
  const release = () => arrivingTurns.delete(animation);
  animation.finished.then(release, release);
}

function appendAnswerLinks(turn, links) {
  if (links.some(({ url }) => url === resumeLink.url)) {
    const card = document.createElement("div");
    card.className = "ask-resume";
    card.setAttribute("role", "group");
    card.setAttribute("aria-label", resumeLink.label);

    const open = document.createElement("a");
    open.href = resumeLink.url;
    open.target = "_blank";
    open.rel = "noopener";
    open.textContent = "Open PDF";
    open.setAttribute("aria-label", "Open PDF in a new tab");

    const download = document.createElement("a");
    download.href = resumeLink.url;
    download.download = "Khy-Bolt-Resume.pdf";
    download.textContent = "Download";
    download.setAttribute("aria-label", "Download résumé PDF");

    card.append(open, download);
    turn.append(card);
  }

  const otherLinks = links.filter(({ url }) => url !== resumeLink.url);
  if (!otherLinks.length) return;
  const proof = document.createElement("ul");
  proof.className = "ask-proof";
  proof.setAttribute("aria-label", "Answer sources");
  for (const { label, url } of otherLinks) {
    const item = document.createElement("li");
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.target = "_blank";
    anchor.rel = "noopener";
    anchor.textContent = label;
    item.append(anchor);
    proof.append(item);
  }
  turn.append(proof);
}

function appendParagraph(turn, text, bold = false) {
  const paragraph = document.createElement("p");
  if (bold) appendInlineBold(paragraph, text);
  else paragraph.textContent = text;
  turn.append(paragraph);
}

const listLine = /^ {0,3}(?:([*+•-])|(\d{1,3})[.)])[ \t]+(\S[^\r\n]*)\r?$/u;
const thematicBreak = /^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,})\r?$/u;
const fenceLine = /^ {0,3}(\x60{3,}|~{3,})([^\r\n]*)\r?$/u;

function advanceFence(fence, delimiter) {
  if (!delimiter) return fence;
  if (!fence) return delimiter[1];
  return delimiter[1].startsWith(fence) && !delimiter[2].trim() ? null : fence;
}

function appendInlineBold(container, text) {
  const pairedBold = /(?<![\\*])\*\*(?![\s*])((?:[^*\r\n]|\*(?!\*))+?)(?<![\s\\])\*\*(?!\*)/gu;
  let cursor = 0;
  let offset = 0;
  let fence = null;
  for (const line of text.split("\n")) {
    const delimiter = fenceLine.exec(line);
    if (!fence && !delimiter) {
      for (const match of line.matchAll(pairedBold)) {
        const start = offset + match.index;
        if (start > cursor) container.append(document.createTextNode(text.slice(cursor, start)));
        const strong = document.createElement("strong");
        strong.append(document.createTextNode(match[1]));
        container.append(strong);
        cursor = start + match[0].length;
      }
    }
    fence = advanceFence(fence, delimiter);
    offset += line.length + 1;
  }
  if (cursor < text.length) container.append(document.createTextNode(text.slice(cursor)));
}

function appendAnswerText(turn, text) {
  let prose = [];
  let list = null;
  let fence = null;
  for (const line of text.split("\n")) {
    fence = advanceFence(fence, fenceLine.exec(line));

    const marker = !fence && !thematicBreak.test(line) && listLine.exec(line);
    if (!marker) {
      if (list && !line.trim()) continue;
      list = null;
      prose.push(line);
      continue;
    }

    if (prose.length) {
      const paragraph = prose.join("\n").trimEnd();
      if (paragraph) appendParagraph(turn, paragraph, true);
      prose = [];
    }
    const tag = marker[2] === undefined ? "ul" : "ol";
    if (!list || list.localName !== tag) {
      list = document.createElement(tag);
      list.className = "ask-answer-list";
      if (tag === "ol") list.start = Number(marker[2]);
      turn.append(list);
    }
    const item = document.createElement("li");
    if (tag === "ol") item.value = Number(marker[2]);
    appendInlineBold(item, marker[3]);
    list.append(item);
  }
  if (prose.length) appendParagraph(turn, prose.join("\n"), true);
}

function appendTurn(author, text, { links = [], notice, delay = 0 } = {}) {
  const visitor = author === "You";
  const follow = visitor || nearEnd();
  const turn = document.createElement("li");
  turn.className = visitor ? "ask-turn visitor" : "ask-turn assistant";
  const speaker = document.createElement("span");
  speaker.className = "screen-reader";
  speaker.textContent = author + ": ";
  turn.append(speaker);
  if (visitor) appendParagraph(turn, text);
  else appendAnswerText(turn, text);
  if (notice) appendParagraph(turn, notice);
  if (links.length) appendAnswerLinks(turn, links);
  log.append(turn);
  following = follow;
  if (follow) followEnd();
  animateTurn(turn, visitor, delay);
}

transcript.addEventListener("scroll", () => {
  if (!ask.hidden && !ask.inert) following = nearEnd();
}, { passive: true });

function showValidationError(message, style) {
  status.classList.remove("screen-reader", "ask-answer", "ask-empty");
  status.classList.add(style);
  if (statusMessage.textContent !== message) statusMessage.textContent = message;
  input.setAttribute("aria-invalid", "true");
  input.setAttribute("aria-describedby", status.id);
}

function clearValidationError() {
  if (!input.hasAttribute("aria-invalid")) return;
  status.classList.remove("ask-answer", "ask-empty");
  status.classList.add("screen-reader");
  statusMessage.textContent = "";
  input.removeAttribute("aria-invalid");
  input.removeAttribute("aria-describedby");
}

function showPendingAnswer() {
  status.classList.replace("screen-reader", "ask-pending");
  statusMessage.textContent = "Waiting for an answer…";
}

function clearPendingAnswer() {
  if (status.classList.replace("ask-pending", "screen-reader")) statusMessage.textContent = "";
}

function rememberReply(question, answer) {
  history = [...history, { question, answer }].slice(-MAX_CHAT_TURNS);
}

async function submitQuestion() {
  if (busy) return;
  const question = input.value.trim();
  if (!question) {
    input.focus();
    showValidationError("Enter a question to send.", "ask-empty");
    return;
  }
  const overCharacterLimit = question.length > MAX_QUESTION;
  if (overCharacterLimit || new TextEncoder().encode(question).length > MAX_QUESTION_BYTES) {
    const message = overCharacterLimit
      ? `Shorten your question to ${MAX_QUESTION} characters or fewer and try again.`
      : `Shorten your question further and try again. Some characters use more than one byte, and the limit is ${MAX_QUESTION_BYTES} bytes.`;
    showValidationError(message, "ask-answer");
    return;
  }
  clearValidationError();
  busy = true;
  submit.disabled = true;
  submit.setAttribute("aria-busy", "true");
  try {
    const first = startConversation();
    appendTurn("You", question, { delay: first ? 90 : 0 });
    input.value = "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    let answer = unsupported;
    if (projectShortcut.test(normalizeQuestion(question))) {
      answer = { text: "Open the featured projects.", links: [sources.projects] };
    } else if (!isShareableChatText(question)) {
      answer = unshareableQuestion;
    } else if (!remote) {
      answer = serviceFallback;
    } else if (!ask.inert) {
      activeRequest = new AbortController();
      showPendingAnswer();
      const result = await remote(question, activeRequest.signal, history);
      if (activeRequest.signal.aborted || ask.inert) return;
      if (result?.status === "answer") {
        const paragraphs = result.paragraphs ?? (result.sections
          ? result.sections.map(parts => parts.map(part => part.text).join(" "))
          : result.facts.map(fact => fact.text));
        if (result.partial) paragraphs.push("I don’t have reviewed information for the rest of that question.");
        answer = {
          text: paragraphs.join("\n\n"),
          links: result.links,
          notice: result.filtered ? "Some parts of the generated answer could not be displayed." : undefined,
        };
        if (isChatAnswer(paragraphs)) rememberReply(question, paragraphs);
      } else if (result?.status === "rate-limited") {
        answer = { text: quotaMessage(result) };
      } else if (result?.status === "truncated") {
        answer = truncatedAnswer;
      } else if (result?.status === "unknown") {
        answer = result.reason === "filtered" ? filteredAnswer : unsupported;
      } else {
        answer = serviceFallback;
      }
    }
    appendTurn("Portfolio assistant", answer.text, { links: answer.links, notice: answer.notice, delay: first ? 150 : 54 });
  } finally {
    clearPendingAnswer();
    activeRequest = undefined;
    submit.disabled = false;
    submit.removeAttribute("aria-busy");
    busy = false;
  }
}

// Text inputs can match :focus-visible after a pointer click.
form.addEventListener("pointerdown", event => {
  if (event.target === input) form.dataset.pointerFocus = "";
});
input.addEventListener("blur", () => delete form.dataset.pointerFocus);
input.addEventListener("input", clearValidationError);

form.addEventListener("submit", event => {
  event.preventDefault();
  void submitQuestion();
});
if (form.hasAttribute("data-sandbox-preview")) {
  submit.addEventListener("click", event => {
    event.preventDefault();
    void submitQuestion();
  });
}
let composing = false;
input.addEventListener("compositionstart", () => { composing = true; });
input.addEventListener("compositionend", () => { composing = false; });
input.addEventListener("keydown", event => {
  if (event.key !== "Enter" || event.shiftKey || composing || event.isComposing || event.keyCode === 229) return;
  event.preventDefault();
  form.requestSubmit();
});
const compactPlaceholder = input.dataset.compactPlaceholder;
if (compactPlaceholder) {
  const fullPlaceholder = input.placeholder;
  const narrowViewport = window.matchMedia("(max-width: 425px)");
  const updatePlaceholder = () => {
    input.placeholder = narrowViewport.matches ? compactPlaceholder : fullPlaceholder;
  };
  updatePlaceholder();
  narrowViewport.addEventListener("change", updatePlaceholder);
}
form.hidden = false;

if (input instanceof HTMLTextAreaElement && !CSS.supports("field-sizing", "content")) {
  const fitComposer = () => {
    const previousScroll = input.scrollTop;
    input.style.overflowY = "hidden";
    input.style.height = "auto";
    input.style.height = `${input.scrollHeight}px`;
    input.style.overflowY = "auto";
    input.scrollTop = previousScroll;
  };
  fitComposer();
  input.addEventListener("input", fitComposer);
  window.addEventListener("resize", fitComposer);
}

if (input instanceof HTMLTextAreaElement) {
  input.addEventListener("input", () => {
    const end = input.value.length;
    if (input.selectionStart === end && input.selectionEnd === end && input.scrollHeight > input.clientHeight) {
      input.scrollTop = input.scrollHeight;
    }
  });
}
