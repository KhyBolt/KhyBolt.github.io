import { sources } from "./ask-claim-data.mjs?v=worker1";
import {
  isAnswerLink, isBoundedText, isRecordId, MAX_ANSWER_FACTS, MAX_FACT_BYTES, MAX_ANSWER_LINKS,
  MAX_ANSWER_SECTIONS, MAX_SECTION_FACTS, MAX_SUMMARY_FACTS,
} from "./ask-protocol.mjs?v=work-history1";
import { isExcludedProfileQuestion, normalizeQuestion, MAX_QUESTION, MAX_QUESTION_BYTES } from "./portfolio.mjs?v=worker3";

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
let context = [];
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

function profileReply(data) {
  const { facts, links, partial, sections } = data;
  if (!Array.isArray(facts) || !facts.length || facts.length > MAX_ANSWER_FACTS ||
      !facts.every(isAnswerFact) ||
      new Set(facts.map(fact => fact.id)).size !== facts.length ||
      !Array.isArray(links) || links.length > MAX_ANSWER_LINKS || !links.every(isAnswerLink) ||
      typeof partial !== "boolean") return null;
  if (sections !== undefined) {
    if (!Array.isArray(sections) || !sections.length || sections.length > MAX_ANSWER_SECTIONS ||
        !sections.every(parts => Array.isArray(parts) && parts.length > 0 &&
          parts.length <= MAX_SECTION_FACTS && parts.every(isAnswerFact))) return null;
    const parts = sections.flat();
    if (parts.length > MAX_SUMMARY_FACTS || new Set(parts.map(part => part.id)).size !== parts.length ||
        !facts.every(fact => parts.some(part => part.id === fact.id && part.text === fact.text))) return null;
  }
  return { status: "answer", facts, links, partial, sections };
}

export function createClientTransport(url, fetcher = globalThis.fetch) {
  return async (question, prior, signal, previous = []) => {
    try {
      const response = await fetcher(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(previous.length ? { question, topic: prior, context: previous } : { question, topic: prior }),
        signal: AbortSignal.any([signal, AbortSignal.timeout(7500)]),
        credentials: "omit",
        cache: "no-store",
        redirect: "error",
      });
      if (!response.ok || !response.headers.get("Content-Type")?.startsWith("application/json")) return null;
      const data = await response.json();
      if (data?.status === "unknown") return { status: "unknown" };
      if (data?.status !== "answer") return null;
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
const unsupported = {
  text: "I don’t have that information in the reviewed portfolio.",
  links: [],
};
const projectShortcut = /^(?:open|show|view)(?: me)? (?:the )?projects[?.!]*$/u;
const resumeLink = { label: "Résumé PDF", url: "https://khybolt.github.io/assets/khy-bolt-resume.pdf" };
const linkedInLink = { label: "LinkedIn", url: "https://au.linkedin.com/in/khybolt" };
const professionalUrls = new Set([resumeLink.url, linkedInLink.url]);
const linkLead = /^(?:please )?(?:(?:can|could|would|may|will) (?:you|i) )?(?:please )?(?:send|share|show|give|provide|get|find|see|view|open|download|have|link)(?: me)? |^(?:what(?: is|'s)|where(?: is|'s| can i (?:find|get|see|download))|do you have|does (?:he|khy(?: bolt)?) have) /u;
const linkTarget = /^(?:(?:a|the|to|his|your|khy(?: bolt)?(?:'s)?|copy of|link to|link for|pdf of) )*(resume|cv|linkedin)(?: (?:pdf|profile|link|url|download|please))*[.!]*$/u;
const declinedLink = /\b(?:without|do not|don't|no|skip|hide|avoid|not)\s+(?:(?:show(?:ing)?|shar(?:e|ing)|include|including|send(?:ing)?|the|any|his|your|a)\s+)*(?:resume|cv|linkedin)\b/u;

function requestedProfessionalLinks(question) {
  const text = normalizeQuestion(question).normalize("NFKD").replace(/\p{M}/gu, "").replace(/’/gu, "'");
  if (declinedLink.test(text)) return { links: [], only: false };
  const clauses = text.split(/\s*(?:[?;]|,?\s+(?:and|or|&)\s+)\s*/u).filter(Boolean);
  const bareList = clauses.every(clause => linkTarget.test(clause));
  const requests = [];
  for (const clause of clauses) {
    const explicit = linkLead.test(clause);
    requests.push(explicit || bareList || requests.at(-1)
      ? linkTarget.exec(clause.replace(linkLead, ""))?.[1] : undefined);
  }
  const links = [...new Set(requests.filter(Boolean).map(target => target === "linkedin" ? linkedInLink : resumeLink))];
  return { links, only: links.length > 0 && requests.every(Boolean) };
}

function linksForTurn(links, requested) {
  return [...(links ?? []).filter(link => !professionalUrls.has(link.url)), ...requested];
}

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

function appendTurn(author, text, { links = [], delay = 0 } = {}) {
  const follow = nearEnd();
  const turn = document.createElement("li");
  const visitor = author === "You";
  turn.className = visitor ? "ask-turn visitor" : "ask-turn assistant";
  const speaker = document.createElement("span");
  speaker.className = "screen-reader";
  speaker.textContent = author + ": ";
  const message = document.createElement("p");
  message.textContent = text;
  turn.append(speaker, message);
  if (links.length) {
    const proof = document.createElement("ul");
    proof.className = "ask-proof";
    proof.setAttribute("aria-label", "Answer sources");
    for (const { label, url } of links) {
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
    let selectedContext = context;
    const requested = requestedProfessionalLinks(question);
    if (requested.only) {
      const text = requested.links.length === 2 ? "Khy’s résumé and LinkedIn profile."
        : requested.links[0] === resumeLink ? "Khy’s general résumé." : "Khy’s LinkedIn profile.";
      answer = { text };
    } else if (projectShortcut.test(normalizeQuestion(question))) {
      answer = { text: "Open the featured projects.", links: [sources.projects] };
    } else if (!remote && !isExcludedProfileQuestion(question)) {
      answer = serviceFallback;
    } else if (remote && !ask.inert && !isExcludedProfileQuestion(question)) {
      activeRequest = new AbortController();
      showPendingAnswer();
      const result = await remote(question, "", activeRequest.signal, context);
      if (activeRequest.signal.aborted || ask.inert) return;
      if (result?.status === "answer") {
        const paragraphs = result.sections
          ? result.sections.map(parts => parts.map(part => part.text).join(" "))
          : result.facts.map(fact => fact.text);
        if (result.partial) paragraphs.push("I don’t have reviewed information for the rest of that question.");
        answer = { text: paragraphs.join("\n\n"), links: result.links };
        selectedContext = result.facts.map(fact => fact.id);
      } else if (result?.status === "unknown") {
        selectedContext = [];
      } else {
        answer = serviceFallback;
      }
    }
    context = selectedContext;
    appendTurn("Portfolio assistant", answer.text, { links: linksForTurn(answer.links, requested.links), delay: first ? 150 : 54 });
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
