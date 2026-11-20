export const MAX_ANSWER_FACTS = 3;
export const MAX_ANSWER_SECTIONS = 5;
export const MAX_SECTION_FACTS = 4;
export const MAX_SUMMARY_FACTS = 14;
export const MAX_FACT_BYTES = 300;
export const MAX_ANSWER_LINKS = 3;

const encoder = new TextEncoder();
const control = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u;
const recordId = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isRecordId(value) {
  return typeof value === "string" && value.length <= 32 && recordId.test(value);
}

export function isBoundedText(value, bytes) {
  return typeof value === "string" && value === value.trim() && value.length > 0 &&
    !control.test(value) && encoder.encode(value).byteLength <= bytes;
}

export function isAnswerLink(value) {
  if (!isBoundedText(value?.label, 80) || !isBoundedText(value?.url, 512) ||
      !value.url.startsWith("https://") || /[\s\\]/u.test(value.url)) return false;
  try {
    const url = new URL(value.url);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

export const MAX_CHAT_PARAGRAPHS = 8;
export const MAX_CHAT_ANSWER_BYTES = 2400;
export const MAX_CHAT_TURNS = 2;
export const MAX_CHAT_HISTORY_BYTES = 3000;

const privateText = /(?:[\w.+%-]+@[\w.-]+\.[a-z]{2,}|\b(?:https?:\/\/|www\.)|(?:^|[^a-z\d])\+?\d(?:[(). -]*\d){8,}(?!\d)|\b(?:api[-_ ]?key|bearer|password|secret|token)\s*[:=]|\b[a-z0-9_-]{32,}\b|<\||\|>|<\\?\/?(?:start|end)_of_turn>)/iu;

export function isShareableChatText(text) {
  return typeof text === "string" && !privateText.test(text.normalize("NFKC"));
}

export function isChatParagraph(value) {
  return isBoundedText(value, MAX_CHAT_ANSWER_BYTES) && isShareableChatText(value) && !/[<>]/u.test(value);
}

export function isChatAnswer(paragraphs) {
  return Array.isArray(paragraphs) && paragraphs.length > 0 && paragraphs.length <= MAX_CHAT_PARAGRAPHS &&
    paragraphs.every(isChatParagraph) && encoder.encode(paragraphs.join("\n\n")).byteLength <= MAX_CHAT_ANSWER_BYTES;
}

export function boundChatHistory(turns) {
  const recent = turns.slice(-MAX_CHAT_TURNS);
  while (encoder.encode(JSON.stringify(recent)).byteLength > MAX_CHAT_HISTORY_BYTES) recent.shift();
  return recent;
}
