import { answers, MAX_QUESTION, MAX_QUESTION_BYTES, nextTopic, resolveAnswer } from "./portfolio.mjs";

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
let topic = "";
let busy = false;
let following = true;

export function createClientTransport(url, fetcher = globalThis.fetch) {
  return async (question, prior) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3_300);
    try {
      const response = await fetcher(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, topic: prior }),
        signal: controller.signal,
        credentials: "omit"
      });
      if (!response.ok) return null;
      const data = await response.json();
      return typeof data.id === "string" ? data.id : null;
    } finally {
      clearTimeout(timer);
    }
  };
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
  if (status.classList.contains("screen-reader")) return;
  status.classList.remove("ask-answer", "ask-empty");
  status.classList.add("screen-reader");
  statusMessage.textContent = "";
  input.removeAttribute("aria-invalid");
  input.removeAttribute("aria-describedby");
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
    const { id } = await resolveAnswer(question, topic);
    topic = nextTopic(id, topic, question);
    const answer = answers[id];
    appendTurn("Portfolio assistant", answer.text, { links: answer.links, delay: first ? 150 : 54 });
  } finally {
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
