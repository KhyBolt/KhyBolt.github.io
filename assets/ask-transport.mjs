import { evidence, sources } from "./ask-claim-data.mjs?v=3";
import {
  boundChatHistory, isAnswerLink, isBoundedText, isChatAnswer, isRecordId, isShareableChatText,
  MAX_ANSWER_FACTS, MAX_ANSWER_LINKS, MAX_ANSWER_SECTIONS, MAX_ASK_BODY_BYTES, MAX_CHAT_HISTORY_BYTES,
  MAX_FACT_BYTES, MAX_SECTION_FACTS, MAX_SUMMARY_FACTS, portfolioLinks,
} from "./ask-protocol.mjs?v=career-chat7";
import { isExcludedProfileQuestion, MAX_QUESTION, MAX_QUESTION_BYTES } from "./portfolio.mjs?v=7";

const encoder = new TextEncoder();
const approvedLinks = [...Object.values(portfolioLinks), ...Object.values(sources)];

export function isReleasedLink(link) {
  return isAnswerLink(link) && approvedLinks.some(approved => approved.url === link.url && approved.label === link.label);
}

function answerLinks(links) {
  if (!Array.isArray(links)) return [];
  const unique = new Map();
  for (const link of links) {
    if (isReleasedLink(link) && !unique.has(link.url)) unique.set(link.url, { label: link.label, url: link.url });
    if (unique.size === MAX_ANSWER_LINKS) break;
  }
  return [...unique.values()];
}

function isAnswerFact(fact) {
  return isRecordId(fact?.id) && isBoundedText(fact.text, MAX_FACT_BYTES);
}

function profileReply(data) {
  const { facts, partial, sections } = data;
  if (!Array.isArray(facts) || !facts.length || facts.length > MAX_ANSWER_FACTS ||
      !facts.every(isAnswerFact) || new Set(facts.map(fact => fact.id)).size !== facts.length ||
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

function requestBody(question, history) {
  const bodyFor = recent => JSON.stringify({ question, topic: "", history: recent });
  const shareable = history.filter(turn =>
    isShareableChatText(turn?.question) && !isExcludedProfileQuestion(turn.question) &&
    turn.question.trim() && turn.question.length <= MAX_QUESTION &&
    encoder.encode(turn.question).byteLength <= MAX_QUESTION_BYTES && isChatAnswer(turn.answer)
  ).map(({ question, answer }) => ({ question, answer }));
  return bodyFor(boundChatHistory(shareable, turns =>
    encoder.encode(JSON.stringify(turns)).byteLength <= MAX_CHAT_HISTORY_BYTES &&
    encoder.encode(bodyFor(turns)).byteLength <= MAX_ASK_BODY_BYTES
  ));
}

export function createClientTransport(url, fetcher = globalThis.fetch, timeoutMs = 84000) {
  return async (question, signal, history = []) => {
    if (signal?.aborted) return null;
    if (!isShareableChatText(question)) return { status: "unshareable" };
    if (!question.trim() || question.length > MAX_QUESTION ||
        encoder.encode(question).byteLength > MAX_QUESTION_BYTES) return null;

    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener("abort", abort, { once: true });
    const timeout = setTimeout(abort, timeoutMs);
    try {
      const response = await fetcher(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: requestBody(question, history),
        signal: controller.signal,
        credentials: "omit",
        cache: "no-store",
        redirect: "error",
      });
      if (controller.signal.aborted) return null;
      const json = response.headers.get("Content-Type")?.split(";", 1)[0].trim().toLowerCase() === "application/json";
      const data = json ? await response.json().catch(() => null) : null;
      if (controller.signal.aborted) return null;
      if (response.status === 429) {
        return { status: "rate-limited", limit: data?.limit, retryAfter: Number(response.headers.get("Retry-After")) };
      }
      if (response.status === 502 && data?.status === "fallback" && data.reason === "truncated") {
        return { status: "truncated" };
      }
      if (!response.ok) return null;
      if (data?.status === "unknown") return { status: "unknown", reason: data.reason };
      if (data?.status !== "answer") return null;
      if (Object.hasOwn(data, "paragraphs")) {
        return isChatAnswer(data.paragraphs)
          ? { status: "answer", paragraphs: data.paragraphs, links: answerLinks(data.links), filtered: data.filtered === true }
          : null;
      }
      if (typeof data.id === "string" && Object.hasOwn(evidence, data.id)) return { status: "answer", id: data.id };
      return profileReply(data);
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
    }
  };
}
