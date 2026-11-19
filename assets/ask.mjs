import { answers, MAX_QUESTION, MAX_QUESTION_BYTES, nextTopic, resolveAnswer } from "./portfolio.mjs";

const form = document.getElementById("portfolio-ask-form");
const input = form.querySelector("input");
const submit = form.querySelector("button[type=submit]");
const card = document.getElementById("portfolio-answer");
const answerText = document.getElementById("portfolio-answer-text");
const links = document.getElementById("portfolio-answer-links");
const status = document.getElementById("portfolio-ask-status");
const suggestions = document.getElementById("portfolio-ask-suggestions");
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
  submit.textContent = "Checking…";
  try {
    const { id } = await resolveAnswer(question, topic, remote);
    topic = nextTopic(id, topic, question);
    showAnswer(id);
  } finally {
    submit.disabled = false;
    submit.textContent = "Ask";
    busy = false;
  }
}

form.addEventListener("submit", event => {
  event.preventDefault();
  void submitQuestion();
});
if (form.hasAttribute("data-sandbox-preview")) {
  submit.addEventListener("click", event => {
    event.preventDefault();
    void submitQuestion();
  });
  input.addEventListener("keydown", event => {
    if (event.key !== "Enter" || event.isComposing) return;
    event.preventDefault();
    void submitQuestion();
  });
}
suggestions.addEventListener("click", event => {
  const button = event.target.closest("button[data-question]");
  if (!button || busy) return;
  input.value = button.dataset.question;
  void submitQuestion();
});
form.hidden = false;
suggestions.hidden = false;
