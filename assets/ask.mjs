import { answers, MAX_QUESTION, MAX_QUESTION_BYTES, nextTopic, resolveAnswer } from "./portfolio.mjs";

const form = document.getElementById("portfolio-ask-form");
const input = form.elements.question;
const submit = form.querySelector("button[type=submit]");
const card = document.getElementById("portfolio-answer");
const answerText = document.getElementById("portfolio-answer-text");
const links = document.getElementById("portfolio-answer-links");
const status = document.getElementById("portfolio-ask-status");
const endpoint = form.dataset.endpoint?.trim();
let topic = "";
let busy = false;

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

function showAnswer(id) {
  const answer = answers[id];
  const ancestors = answer.links.map(({ label, url }) => {
    const item = document.createElement("li");
    const link = document.createElement("a");
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = label;
    item.append(link);
    return item;
  });
  answerText.textContent = answer.text;
  links.replaceChildren(...ancestors);
  card.hidden = false;
  status.textContent = answer.text + (answer.links.length ? " Source links follow." : "");
}

const remote = endpoint ? createClientTransport(endpoint) : null;
async function submitQuestion() {
  if (busy) return;
  const question = input.value.trim();
  if (!question) return;
  if (question.length > MAX_QUESTION || new TextEncoder().encode(question).length > MAX_QUESTION_BYTES) {
    status.textContent = "Please shorten your question.";
    return;
  }
  busy = true;
  submit.disabled = true;
  submit.setAttribute("aria-busy", "true");
  try {
    const { id } = await resolveAnswer(question, topic, remote);
    topic = nextTopic(id, topic, question);
    showAnswer(id);
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
