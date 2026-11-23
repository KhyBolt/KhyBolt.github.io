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

export const MAX_CHAT_PARAGRAPHS = 24;
export const MAX_CHAT_ANSWER_BYTES = 8192;
export const MAX_CHAT_TURNS = 2;
export const MAX_CHAT_HISTORY_BYTES = 3000;
export const MAX_ASK_BODY_BYTES = 4096;

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

const fitsHistoryBudget = value => encoder.encode(JSON.stringify(value)).byteLength <= MAX_CHAT_HISTORY_BYTES;

function clipHistoryParagraph(characters, width) {
  if (characters.length <= width) return characters.join("");
  const head = Math.ceil((width - 3) / 2);
  const tail = width - 3 - head;
  return characters.slice(0, head).join("").trimEnd() + " … " +
    characters.slice(-tail).join("").trimStart();
}

export function boundChatHistory(turns, fits = fitsHistoryBudget) {
  const recent = turns.slice(-MAX_CHAT_TURNS);
  if (!recent.length || fits(recent)) return recent;

  // Keep both sides of long paragraphs and give each recent exchange room.
  const prepared = recent.map(({ question, answer }) => ({
    question,
    answer: answer.map(paragraph => Array.from(paragraph))
  }));
  for (let first = 0; first < prepared.length; first++) {
    const selected = prepared.slice(first);
    let low = 8;
    let high = Math.max(...selected.flatMap(turn => turn.answer.map(paragraph => paragraph.length)));
    let best = [];
    while (low <= high) {
      const width = Math.floor((low + high) / 2);
      const candidate = selected.map(({ question, answer }) => ({
        question,
        answer: answer.map(paragraph => clipHistoryParagraph(paragraph, width))
      }));
      if (candidate.every(turn => isChatAnswer(turn.answer)) && fits(candidate)) {
        best = candidate;
        low = width + 1;
      } else {
        high = width - 1;
      }
    }
    if (best.length) return best;
  }
  return [];
}

export const portfolioLinks = Object.freeze({
  resume: Object.freeze({ label: "Résumé PDF", url: "https://khybolt.github.io/assets/khy-bolt-resume.pdf" }),
  linkedin: Object.freeze({ label: "LinkedIn", url: "https://au.linkedin.com/in/khybolt" }),
  projects: Object.freeze({ label: "Featured projects", url: "https://khybolt.github.io/#projects" }),
  "livermore-assisted": Object.freeze({
    label: "Livermore assisted replay",
    url: "https://khybolt.github.io/doppler/#livermore",
  }),
  "livermore-archive": Object.freeze({
    label: "Livermore adsb.lol archive search",
    url: "https://khybolt.github.io/doppler/#livermore-archive",
  }),
  "ascii-sharks": Object.freeze({
    label: "ASCII shark animation source",
    url: "https://github.com/stackedlol/ascii-sharks",
  }),
  "colsto-video": Object.freeze({
    label: "Colsto’s aircraft geolocation video",
    url: "https://www.youtube.com/watch?v=UytYrhYLOKI",
  }),
});
