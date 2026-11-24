import { evidence, sources } from "./ask-claim-data.mjs?v=3";

function fromEvidence(topic, ...ids) {
  const records = ids.map(id => evidence[id]);
  const sourceIds = new Set(records.flatMap(record => record.sourceIds));
  return Object.freeze({
    topic,
    text: records.map(record => record.text).join(" "),
    links: Object.freeze(Array.from(sourceIds, id => sources[id])),
  });
}

export const answers = Object.freeze({
  projects: fromEvidence("", "about"),
  pond: fromEvidence("pond", "pond-gallery"),
  "doppler-audio": fromEvidence("doppler", "d-inputs"),
  "doppler-method": fromEvidence("doppler", "d-method", "d-clock"),
  "doppler-result": Object.freeze({
    topic: "doppler",
    text: "In the automatic Livermore replay, the study’s aircraft pair ranked first out of 12,215. The best fit was about 405 m from the study’s phone location.",
    links: Object.freeze([Object.freeze({ label: "Livermore case study", url: new URL("../doppler/#livermore", import.meta.url).href })]),
  }),
  "doppler-synthetic": fromEvidence("doppler", "d-result"),
  "doppler-run": fromEvidence("doppler", "d-run"),
  "doppler-repo": Object.freeze({
    topic: "doppler",
    text: "The Python tool is on GitHub.",
    links: Object.freeze([Object.freeze({ label: "Aircraft Doppler on GitHub", url: "https://github.com/KhyBolt/aircraft-doppler" })]),
  }),
  "doppler-own-recording": Object.freeze({
    topic: "doppler",
    text: "For your own recordings, the Python CLI needs local ADS-B tracks, a search area, and an approximate UTC start time. The Livermore replay uses a separate benchmark script.",
    links: Object.freeze([Object.freeze({ label: "Run it on your own recordings", url: "https://github.com/KhyBolt/aircraft-doppler#analyze-a-local-recording" })]),
  }),
  "field-outcome": fromEvidence("field", "f-outcome", "f-checks"),
  "field-data": fromEvidence("field", "f-data", "f-outcome"),
  "field-diagnostic": fromEvidence("field", "f-diagnostic"),
  "not-known": Object.freeze({
    topic: "", text: "I don’t have that information in the featured portfolio. You can ask about the aircraft replay or Corner Pond.", links: Object.freeze([]),
  }),
  clarify: Object.freeze({
    topic: "", text: "Which project do you mean, Aircraft Geolocation with Audio or Corner Pond?", links: Object.freeze([sources.projects]),
  }),
});

export const MAX_QUESTION = 240;
export const MAX_QUESTION_BYTES = 480;
export const topics = ["", "doppler", "field", "pond"];
export const labels = Object.freeze(Object.fromEntries(
  Object.entries(answers)
    .filter(([, answer]) => answer.topic)
    .map(([id, answer]) => [id, answer.text])
));

export function normalizeQuestion(question) {
  return question.normalize("NFKC").replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim().toLowerCase();
}

const outsideScope = /\b(?:ignore (?:all |the |your )?(?:prior|previous|above|earlier|instructions|rules)|system (?:prompt|message|instructions)|developer (?:prompt|message|instructions)|reveal (?:your|the) instructions|jailbreak|pretend|disregard|passwords?|secrets?|unpublished|private (?:info(?:rmation)?|data|messages?|facts?|chats?|details?|address|e-?mail)|(?:home|personal) address|(?:personal|phone) number|personal e-?mail|salary|hobbies)\b/;
const demoOnly = /\b(?:employer|résumé|resume|contact (?:him|khy)|interests?)\b/;
const retiredTopic = /\b(?:seattle|potholes?|work[ -]?list|street repairs?|work orders?|review capacity)\b/;
const dopplerTerms = /\b(?:doppler|fly[- ]?overs?|microphone|pitch drops?|tone ridges?|synthetic (?:wav|benchmarks?|fixtures?|tests?|results?)|14\.2\s*m|aircraft|recordings?|acoustic[s]?)\b/;
const dopplerResultTerms = /\b(?:results?|outcomes?|accuracy|accurate|errors?|how close|14\.2|how far(?: off)?|how well|limitations?|validat\w*|benchmarks?|rank\w*|best fit|verified|verification)\b|^(?:what happened\b|what did\b.*\bfind\b|did\b.*\bwork[?.!]*$)/;
const fieldTerms = /\b(?:field (?:test|trial|replay|result|benchmark|recording|audio)s?|eclipse soundscapes|dayton|395\s*m)\b/;
const fieldRecording = /\b(?:real|actual) recordings?\b/;
const recordingUpload = /\b(?:upload|my own|new|another)\b/;
const pondTerms = /\b(?:corner pond|idle fishing|pocket pond|coral cove|star sturgeon|tackle shop)\b/;
const hasReference = /\b(?:it|that|this|there|then|the demo|the project|the source|the data|try it)\b/;
const generalFollowUp = /^(?:(?:and|but)\s+)?(?:how (?:does|did) (?:it|that) work|what (?:data|source|dataset|inputs?) (?:did|does|was) (?:it|that) (?:use|using|based on)|(?:is|was) (?:it|that) (?:real|live|simulated)|where (?:does|did) (?:it|that|the data) come from)\s*[?.!]*$/;
const questionsAboutProjects = /^(?:what (?:projects|work) (?:are (?:there|featured)|(?:did|has) (?:you|khy) (?:build|done))|what (?:did you|did khy) build|what (?:do you|does khy) (?:work on|build)|show (?:me )?(?:your|khy'?s|the) (?:projects|work)|(?:tell me about|compare) (?:your |the |both )?projects)\s*[?.!]*$/;

function explicitTopics(q) {
  const doppler = dopplerTerms.test(q);
  const field = fieldTerms.test(q) || (!doppler && fieldRecording.test(q) && !recordingUpload.test(q));
  return [
    pondTerms.test(q) && "pond",
    field && "field",
    !field && doppler && "doppler",
  ].filter(Boolean);
}

function direct(id) {
  return { direct: id, candidates: [] };
}

function dopplerResource(q) {
  if (/\b(?:github|repositor(?:y|ies)|repos?|source code)\b/.test(q)) return "doppler-repo";
  if (/\b(?:reproduce|recreate|rerun|install|set up)\b|^run\b|\b(?:i|we|to) run\b|\brun (?:it )?locally\b/.test(q) ||
      /\b(?:my own|new|another) (?:audio|clips?|recordings?)\b/.test(q)) return "doppler-own-recording";
  return "";
}

export function isExcludedProfileQuestion(question) {
  const q = normalizeQuestion(question);
  return outsideScope.test(q) || retiredTopic.test(q);
}

export function isExcludedQuestion(question) {
  return isExcludedProfileQuestion(question) || demoOnly.test(normalizeQuestion(question));
}

export function routeQuestion(question, prior = "") {
  const q = normalizeQuestion(question);
  if (isExcludedQuestion(q)) return direct("not-known");
  const resource = dopplerResource(q);
  if (/\blivermore\b/.test(q)) return direct(resource || "doppler-result");
  if (questionsAboutProjects.test(q)) return direct("projects");
  const matching = explicitTopics(q);
  if (matching.length > 1) return direct("projects");
  const followsUp = hasReference.test(q) || (prior === "doppler" && (resource || dopplerResultTerms.test(q)));
  const topic = matching[0] || (followsUp && topics.includes(prior) ? prior : "");
  if (!topic) return direct(generalFollowUp.test(q) ? "clarify" : "not-known");

  if (topic === "pond") {
    if (/\b(?:when|date|price|platforms?|steam|download|multiplayer|release|ownership|owns|owned|authorship|authored|developer|built it)\b/.test(q) &&
        !/\b(?:coming soon|released|is it out|available)\b/.test(q)) return direct("not-known");
    return direct("pond");
  }

  if (topic === "field") {
    if (/\b(?:395|distance|residual|how close|how far|accura\w*|errors?|precis\w*)\b/.test(q)) return direct("field-diagnostic");
    if (/\b(?:data|dataset|source|where|inputs?|ads-b|soundscapes)\b/.test(q)) return direct("field-data");
    return direct("field-outcome");
  }

  if (/\b(?:run|reproduce|recreate)\b/.test(q) && /\bsynthetic\b/.test(q)) return direct("doppler-run");
  if (resource) return direct(resource);
  if (dopplerResultTerms.test(q)) return direct(/\b(?:synthetic|14\.2)\b/.test(q) ? "doppler-synthetic" : "doppler-result");
  if (/\b(?:real|simulated|synthetic|actual|recorded|live|raw audio|upload|other|my own|data|source|dataset|inputs?)\b/.test(q) &&
      /\b(?:audio|tracks?|recordings?|planes?|fly[- ]?overs?|aircraft|wav|it|that|doppler)\b/.test(q)) return direct("doppler-audio");
  if (generalFollowUp.test(q) || /\b(?:how|method|clock|estimate|tones?)\b/.test(q) || /^(?:what (?:is|does) (?:the )?doppler(?: (?:demo|replay|project))?(?: do)?)\s*[?.!]*$/.test(q)) return direct("doppler-method");

  return { direct: "", candidates: Object.keys(labels).filter(id => answers[id].topic === topic) };
}

export function nextTopic(id, prior, question = "") {
  if (id === "projects" || id === "clarify") return "";
  const q = normalizeQuestion(question);
  if (id === "not-known" && (!hasReference.test(q) || isExcludedQuestion(q) || explicitTopics(q).length)) return "";
  return answers[id]?.topic || (topics.includes(prior) ? prior : "");
}

export async function resolveAnswer(question, prior, remote) {
  const route = routeQuestion(question, prior);
  if (route.direct) return { id: route.direct, service: false };
  if (remote) {
    try {
      const id = await remote(question, prior);
      if (route.candidates.includes(id) || id === "not-known" || id === "clarify") {
        return { id, service: true };
      }
    } catch {
      // Keep the local Ask fallback available when the remote service fails.
    }
  }
  return { id: "not-known", service: false };
}
