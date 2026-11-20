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
