const base = "https://khybolt.github.io/";
const doppler = { label: "Doppler replay", url: base + "doppler/" };
const python = { label: "Aircraft Doppler source", url: "https://github.com/KhyBolt/aircraft-doppler" };
const seattle = { label: "Seattle worklist", url: base + "seattle/" };
const snapshot = { label: "Seattle source and checks", url: base + "seattle/#sources" };
const sdot = { label: "Seattle DOT public dataset", url: "https://services.arcgis.com/ZOyb2t4B0UYuYNYH/arcgis/rest/services/Pothole_Status/FeatureServer/0" };

export const answers = {
  projects: { topic: "", text: "The portfolio shows two projects. Doppler replays a synthetic aircraft-acoustics experiment. Seattle Pothole Worklist lets you explore a dated public work-order snapshot in your browser.", links: [doppler, seattle] },
  "doppler-audio": { topic: "doppler", text: "The audio and aircraft tracks in the Doppler replay are simulated. You can listen to excerpts from the synthetic recording and inspect a saved run. The browser demo does not process other recordings or look up real aircraft.", links: [doppler, python] },
  "doppler-method": { topic: "doppler", text: "The experiment looks for two falling tones in a synthetic recording. It compares those tones with predicted pitch curves from simulated tracks to estimate a stationary microphone’s position, allowing one shared clock offset.", links: [doppler, python] },
  "doppler-result": { topic: "doppler", text: "In the saved synthetic fixture the estimate was 14.2 m from the known position. That result applies to this fixture. A deliberately constructed equivalent-track case still produced a wrong result.", links: [doppler, python] },
  "doppler-run": { topic: "doppler", text: "The browser page replays the saved run. The source repository shows how to reproduce the experiment with Python 3.12 and pinned dependencies, using the synthetic WAV and supplied CSV files.", links: [doppler, python] },
  "seattle-data": { topic: "seattle", text: "The worklist uses the Seattle Department of Transportation’s public Pothole Status dataset. The snapshot was copied on November 18, 2026 at 16:47 UTC. The source was last edited that day at 15:07 UTC.", links: [snapshot, sdot] },
  "seattle-demo": { topic: "seattle", text: "Seattle Pothole Worklist is an independent browser demo built from a dated public work-order snapshot. It helps you inspect pending orders and historical closures. It does not show a live queue, dispatch repairs, or take reports.", links: [seattle, snapshot] },
  "seattle-method": { topic: "seattle", text: "The browser demo has four views: worklist, review capacity, repair closure history, and sources and checks. The worklist shows the source due date and a three-business-day comparison separately. The capacity view compares which orders to review first.", links: [seattle, snapshot] },
  "not-known": { topic: "", text: "I don’t have that information in the public portfolio. You can ask about the Doppler replay or the Seattle worklist.", links: [] },
  clarify: { topic: "", text: "Which project do you mean, the Doppler replay or the Seattle worklist?", links: [doppler, seattle] }
};

export const MAX_QUESTION = 240;
export const MAX_QUESTION_BYTES = 480;
export const topics = ["", "doppler", "seattle"];
export const labels = {
  projects: "compare or list the two projects",
  "doppler-audio": "simulation vs real audio or real aircraft; recording and tracks",
  "doppler-method": "estimate microphone location from pitch drops and tracks",
  "doppler-result": "accuracy, fixture result, clock offset or benchmark limitation",
  "doppler-run": "reproduce the experiment or see the Python source",
  "seattle-data": "origin, date or freshness of the public work-order snapshot",
  "seattle-demo": "independent demo; live status, report or dispatch capability",
  "seattle-method": "worklist, review capacity, history, and date comparison"
};

export function normalizeQuestion(question) {
  return question.normalize("NFKC").replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim().toLowerCase();
}

const outsideScope = /\b(?:ignore (?:all |the |your )?(?:prior|previous|above|earlier|instructions|rules)|system (?:prompt|message|instructions)|developer (?:prompt|message|instructions)|reveal (?:your|the) instructions|jailbreak|pretend|disregard|passwords?|secrets?|unpublished|private (?:info(?:rmation)?|data|messages?|facts?|chats?|details?|address)|(?:home|personal) address|(?:personal|phone) number|salary|employer|résumé|resume|contact (?:him|khy)|hobbies|interests?)\b/;
const dopplerTerms = /\b(?:doppler|fly[- ]?overs?|microphone|pitch drops?|tone ridges?|synthetic wav|aircraft|recordings?|acoustic[s]?)\b/;
const seattleTerms = /\b(?:seattle|potholes?|work ?list|street repairs?|work orders?|dispatch|review capacity)\b/;
const generalFollowUp = /^(?:(?:and|but)\s+)?(?:how (?:does|did) (?:it|that) work|what (?:data|source|dataset|inputs?) (?:did|does|was) (?:it|that) (?:use|using|based on)|(?:is|was) (?:it|that) (?:real|live|simulated)|where (?:does|did) (?:it|that|the data) come from)\s*[?.!]*$/;
const hasReference = /\b(?:it|that|this|the demo|the project|the source|the data)\b/;
const capability = /\b(?:report|submit|dispatch|repair|file a complaint|real time|real-time|live|updated automatically)\b/;
const questionsAboutProjects = /^(?:what (?:projects|work) (?:are (?:there|featured)|(?:did|has) (?:you|khy) (?:build|done))|what (?:did you|did khy) build|what (?:do you|does khy) (?:work on|build)|show (?:me )?(?:your|khy'?s|the) (?:projects|work)|(?:tell me about|compare) (?:your |the |both )?projects)\s*[?.!]*$/;

export function routeQuestion(question, prior = "") {
  const q = normalizeQuestion(question);
  if (outsideScope.test(q)) return { direct: "not-known", candidates: [] };
  if (questionsAboutProjects.test(q)) return { direct: "projects", candidates: [] };
  const d = dopplerTerms.test(q);
  const s = seattleTerms.test(q);
  const topic = d !== s ? (d ? "doppler" : "seattle") : (
    !d && hasReference.test(q) && topics.includes(prior) ? prior : ""
  );
  if (d && s && /\b(?:compare|different|difference|both|built)\b/.test(q)) {
    return { direct: "projects", candidates: [] };
  }
  if (!topic && (generalFollowUp.test(q) || (d && s))) {
    return { direct: "clarify", candidates: [] };
  }
  if (!topic) return { direct: "not-known", candidates: [] };

  if (topic === "doppler") {
    if (/\b(?:real|simulated|synthetic|actual|recorded|real-world|live|raw audio)\b/.test(q) &&
        /\b(?:audio|tracks?|recordings?|planes?|fly[- ]?overs?|aircraft|wav|it|that|doppler)\b/.test(q) &&
        !/\b(?:accuracy|accurate|error|distance|how close|validat\w*|benchmark|field recordings?|other recordings?)\b/.test(q)) {
      return { direct: "doppler-audio", candidates: [] };
    }
    if (/\b(?:upload|other|my own)\b/.test(q) &&
        /\b(?:audio|wav|recordings?)\b/.test(q)) {
      return { direct: "doppler-audio", candidates: [] };
    }
    if (/\b(?:accuracy|accurate|errors?|how close|14\.2|how far off|limitation|validat\w*|benchmark)\b/.test(q)) {
      return { direct: "doppler-result", candidates: [] };
    }
    if (/\b(?:run|reproduce|recreate)\b/.test(q) && /\b(?:source|locally|python|replay|case|experiment)\b/.test(q)) {
      return { direct: "doppler-run", candidates: [] };
    }
    if (generalFollowUp.test(q) && /\b(?:data|source|dataset|inputs?)\b/.test(q)) {
      return { direct: "doppler-audio", candidates: [] };
    }
    if (generalFollowUp.test(q) || /^(?:what (?:is|does) (?:the )?doppler(?: (?:demo|replay|project))?(?: do)?|how does (?:the )?doppler(?: (?:demo|replay|project))? work)\s*[?.!]*$/.test(q)) {
      return { direct: "doppler-method", candidates: [] };
    }
  }

  if (topic === "seattle") {
    if (/\b(?:personal|civic addresses?|contact details?|identif(?:y|iers?) residents?|staff ids?|coordinates?)\b/.test(q)) {
      return { direct: "not-known", candidates: [] };
    }
    if (capability.test(q) && /^(?:is|does|can|do|will|how (?:can|do))\b/.test(q) &&
        !/\b(?:history|closures?|capacity|due dates?)\b/.test(q)) {
      return { direct: "seattle-demo", candidates: [] };
    }
    if (/\b(?:data|dataset|snapshot|source)\b/.test(q) &&
        /\b(?:where|what data|when|which|how old|as of|what date|last updated)\b/.test(q) &&
        !/\b(?:due dates?|capacity|review|closures?)\b/.test(q)) {
      return { direct: "seattle-data", candidates: [] };
    }
    if (/\b(?:review capacity|closure history|repair history|three.business.day)\b/.test(q) &&
        /\b(?:what|how|where|show|compare)\b/.test(q)) {
      return { direct: "seattle-method", candidates: [] };
    }
    if (generalFollowUp.test(q) || /^(?:what (?:is|does) (?:the )?seattle (?:pothole )?work ?list(?: do)?|how does (?:the )?seattle (?:pothole )?work ?list work)\s*[?.!]*$/.test(q)) {
      return { direct: "seattle-method", candidates: [] };
    }
  }

  return { direct: "", candidates: Object.keys(labels).filter(id => answers[id].topic === topic) };
}

export function nextTopic(id, prior, question = "") {
  if (id === "projects" || id === "clarify") return "";
  const q = normalizeQuestion(question);
  if (id === "not-known" && (!hasReference.test(q) || dopplerTerms.test(q) || seattleTerms.test(q))) return "";
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
      // The local answer and project links are available after an API failure.
    }
  }
  return { id: "not-known", service: false };
}
