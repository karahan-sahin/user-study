#!/usr/bin/env node
/**
 * Generates js/config.js and js/config.json by scanning assets/
 * Structure: assets/<experiment>/<language>/<annotation-type>/<task>/
 *
 * Recognised annotation-type folder names: "comparison", "scale"
 *
 * Usage: node generate-config.js
 */

const fs   = require("fs");
const path = require("path");

const ASSETS_DIR    = path.join(__dirname, "assets");
const OUT_FILE      = path.join(__dirname, "js", "config.js");
const OUT_JSON_FILE = path.join(__dirname, "js", "config.json");

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

// ── Static study metadata ─────────────────────────────────────────────────────
const META = {
  title:       "Duet — BSL Translation Study",
  institution: "Your Institution",
  signingLevels: [
    { id: "dont_know",    name: "None",    description: "I have no knowledge of sign language." },
    { id: "beginner",     name: "Beginner",      description: "I know a few basic signs and the manual alphabet." },
    { id: "intermediate", name: "Intermediate",  description: "I can hold conversations on familiar topics." },
    { id: "fluent",       name: "Fluent",        description: "I sign fluently with good grammar and expression." },
  ],
};

// ── Rating questions asked for EVERY video ────────────────────────────────────
// Each question is a 5-point scale; the labels map left-to-right to scores 1..5.
const QUESTIONS = [
  { id: "understand", text: "How easy is this signing to understand?",
    labels: ["Very Difficult", "Difficult", "Acceptable", "Easy", "Very Easy"] },
  { id: "meaning", text: "Does it convey the same meaning as the English text?",
    labels: ["Not at all", "Slightly", "Moderately", "Mostly", "Completely"] },
  { id: "quality", text: "How good is the translation in terms of sign language grammar and style?",
    labels: ["Very Poor", "Poor", "Acceptable", "Good", "Excellent"] },
  { id: "grammar", text: "Looking only at the grammar (sign order and sentence structure), how grammatical is this BSL? Ignore meaning, vocabulary and how the avatar looks.",
    labels: ["Very Ungrammatical", "Ungrammatical", "Acceptable", "Grammatical", "Very Grammatical"] },
  { id: "visual", text: "How good is the visual quality of the avatar (sharpness, artefacts, realism), ignoring the signing itself?",
    labels: ["Very Poor", "Poor", "Acceptable", "Good", "Excellent"] },
  { id: "natural", text: "How natural is the motion (smooth, human-like, not robotic)?",
    labels: ["Very Unnatural", "Unnatural", "Acceptable", "Natural", "Very Natural"] },
];

// ── Per-language human-readable metadata ─────────────────────────────────────
const LANG_META = {
  bsl: {
    label: "British Sign Language (BSL)",
    description:
      "You will now watch BSL translations of English sentences. " +
      "BSL is the sign language used by the Deaf community in the United Kingdom. " +
      "For each example, read the English text, watch the translation video, " +
      "and answer the six questions about it.",
  },
  dgs: {
    label: "Deutsche Gebärdensprache (DGS)",
    description:
      "You will now watch DGS translations of English sentences. " +
      "DGS is the sign language used by the Deaf community in Germany. " +
      "For each example, read the English text, watch the translation video, " +
      "and answer the six questions about it.",
  },
};

// ── Per-annotation-type metadata ──────────────────────────────────────────────
const ANNO_TYPE_META = {
  comparison: { label: "Rating", type: "rating" },
  rating:     { label: "Rating", type: "rating" },
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function readDirs(dir) {
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => e.name)
    .sort();
}

function readVideoFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isFile() && /\.(mp4|webm|mov|ogg)$/i.test(e.name))
    .map(e => e.name)
    .sort();
}

// ── Preserve manually-entered English text across regenerations ───────────────
// The English source sentence for each example is edited by hand in js/config.json
// (and js/config.js). Reading the previous generation back lets `node generate-config.js`
// keep those edits when you add/remove video files.
// Keyed by full path "exp/lang/anno/task" since task ids (e.g. "ex01") repeat across languages.
const priorEnglish = {};
try {
  const prev = JSON.parse(fs.readFileSync(OUT_JSON_FILE, "utf8"));
  (prev.experiments || []).forEach(e =>
    (e.languages || []).forEach(l =>
      (l.annotationTypes || []).forEach(a =>
        (a.tasks || []).forEach(t => {
          if (t.english) priorEnglish[`${e.id}/${l.id}/${a.id}/${t.id}`] = t.english;
        }))));
} catch { /* no previous config — start with empty English fields */ }

// ── Scan assets ───────────────────────────────────────────────────────────────
const experiments = readDirs(ASSETS_DIR).map(expFolder => {
  const expDir   = path.join(ASSETS_DIR, expFolder);
  const expId    = expFolder;
  const expLabel = expFolder.replace(/^(\w)/, c => c.toUpperCase()).replace(/_/g, " ");

  const languages = readDirs(expDir).map(langFolder => {
    const langDir  = path.join(expDir, langFolder);
    const langId   = langFolder;
    const langInfo = LANG_META[langId] || { label: langId.toUpperCase(), description: "" };

    const annotationTypes = readDirs(langDir).map(annoFolder => {
      const annoDir  = path.join(langDir, annoFolder);
      const annoInfo = ANNO_TYPE_META[annoFolder] || { label: annoFolder, type: "comparison" };

      const tasks = readDirs(annoDir).map((taskFolder, idx) => {
        const taskDir = path.join(annoDir, taskFolder);
        const files   = readVideoFiles(taskDir);
        // Video display label comes from the filename: <video_id>.<label>.mp4
        // (the dot-separated segment immediately before the extension).
        const videos  = files.map((file, i) => {
          const base  = file.replace(/\.(mp4|webm|mov|ogg)$/i, "");
          const dot   = base.lastIndexOf(".");
          const label = dot >= 0 ? base.slice(dot + 1) : base;
          return { id: LETTERS[i], file, label };
        });
        const englishKey = `${expId}/${langId}/${annoFolder}/${taskFolder}`;
        return { id: taskFolder, folder: taskFolder, label: `Example ${idx + 1}`,
                 english: priorEnglish[englishKey] || "", videos };
      });

      return { id: annoFolder, folder: annoFolder, type: annoInfo.type, label: annoInfo.label, tasks };
    });

    return { id: langId, folder: langFolder, label: langInfo.label, description: langInfo.description, annotationTypes };
  });

  return { id: expId, folder: `assets/${expFolder}`, label: expLabel, languages };
});

// ── Render to JS ──────────────────────────────────────────────────────────────
const experimentsJs = experiments.map(exp => {
  const langsJs = exp.languages.map(lang => {
    const annoTypesJs = lang.annotationTypes.map(anno => {
      const tasksJs = anno.tasks.map(task => {
        const videosJs = task.videos
          .map(v => `{ id: "${v.id}", file: "${v.file}", label: "${(v.label || "").replace(/"/g, '\\"')}" }`)
          .join(", ");
        const eng = task.english.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
        return `              { id: "${task.id}", folder: "${task.folder}", label: "${task.label}", english: "${eng}", videos: [ ${videosJs} ] }`;
      }).join(",\n");

      return `          {
            id: "${anno.id}",
            folder: "${anno.folder}",
            type: "${anno.type}",
            label: "${anno.label}",
            tasks: [\n${tasksJs}\n            ]
          }`;
    }).join(",\n");

    return `        {
          id: "${lang.id}",
          folder: "${lang.folder}",
          label: "${lang.label}",
          description: "${lang.description.replace(/"/g, '\\"')}",
          annotationTypes: [\n${annoTypesJs}\n          ]
        }`;
  }).join(",\n");

  return `    {
      id: "${exp.id}",
      folder: "${exp.folder}",
      label: "${exp.label}",
      languages: [\n${langsJs}\n      ]
    }`;
}).join(",\n");

const signingLevelsJs = META.signingLevels
  .map(l => `    { id: "${l.id}", name: "${l.name}", description: "${l.description}" }`)
  .join(",\n");

const questionsJs = QUESTIONS
  .map(q => `    { id: "${q.id}", text: "${q.text.replace(/"/g, '\\"')}", labels: [${q.labels.map(l => `"${l}"`).join(", ")}] }`)
  .join(",\n");

// Condition slots (file-name prefix <k>_), full 2x2x2 design (gloss x motion x appearance):
//   0 O    LLM   + ChronoSign + Ours          4 B    Lemma + Interp    + Ours
//   1 G1   Lemma + ChronoSign + Ours          5 M1A1 LLM   + Interp    + Stable Signer
//   2 M1   LLM   + Interp     + Ours          6 L1   Lemma + ChronoSign + Stable Signer
//   3 A1   LLM   + ChronoSign + Stable Signer 7 L2   Lemma + Interp    + Stable Signer
const CONDITION_SLOTS = 8;
// Each participant answers PAGES_PER_PARTICIPANT pages: a seeded random subset of the sentences,
// in random order. Page i is shown in condition slot pattern[i], where pattern is a seeded
// shuffle of CONDITION_PATTERN. Every slot appears exactly twice, so every participant sees
// exactly 2 videos per condition => LLM 8 / Lemma 8, ChronoSign 8 / Interp 8, Ours 8 / Stable Signer 8.
const PAGES_PER_PARTICIPANT = 16;
const CONDITION_PATTERN = [0, 1, 2, 3, 4, 5, 6, 7, 0, 1, 2, 3, 4, 5, 6, 7];

const output = `/**
 * STUDY CONFIGURATION  —  auto-generated by generate-config.js
 * Do not edit by hand, EXCEPT the per-example "english" fields (the English source
 * sentence shown with each example). Those are preserved when you re-run the generator.
 * Regenerate with:  node generate-config.js
 *
 * Structure:  experiments → languages → annotationTypes → tasks(examples) → videos
 * Each example shows an English sentence; the participant answers the 6 questions
 * below for every video. Place files under  assets/<experiment>/<language>/<annotationType>/<example>/
 */

const STUDY_CONFIG = {

  conditionSlots: ${CONDITION_SLOTS},
  conditionPattern: ${JSON.stringify(CONDITION_PATTERN)},
  pagesPerParticipant: ${PAGES_PER_PARTICIPANT},

  title: "${META.title}",
  institution: "${META.institution}",

  // Questions asked for every video (each a 5-point scale, labels map to scores 1..5)
  questions: [
${questionsJs}
  ],

  signingLevels: [
${signingLevelsJs}
  ],

  experiments: [
${experimentsJs}
    // Add more experiments by adding folders under assets/
  ]
};

// Flat page list for sequential navigation (do not edit).
// One page PER EXAMPLE (sentence). Each example folder holds one video per condition
// (files sorted by name: 0_*, 1_*, ...). The client shows exactly ONE of them to each
// participant, rotated by (example index + participant group) so every participant sees
// every condition about equally often and every sentence is seen in all conditions
// across participants.
STUDY_CONFIG._flatTasks = STUDY_CONFIG.experiments.flatMap(exp =>
  exp.languages.flatMap(lang =>
    lang.annotationTypes.flatMap(anno =>
      anno.tasks.map(task => ({
          expId:     exp.id,
          expLabel:  exp.label,
          langId:    lang.id,
          langLabel: lang.label,
          langDesc:  lang.description,
          annoId:    anno.id,
          annoType:  anno.type,
          taskId:    task.id,
          taskLabel: task.label,
          english:   task.english,
          videos:    task.videos,
          videoPath: exp.folder + "/" + lang.folder + "/" + anno.folder + "/" + task.folder
      }))
    )
  )
);

// Mark the first task of each language group so navigation knows when to show the intro page
STUDY_CONFIG._flatTasks.forEach((t, i) => {
  t.isFirstInLanguage = i === 0 || t.langId !== STUDY_CONFIG._flatTasks[i - 1].langId;
});
`;

fs.writeFileSync(OUT_FILE, output, "utf8");
console.log(`Written ${OUT_FILE}`);

const configJson = { ...META, experiments };
fs.writeFileSync(OUT_JSON_FILE, JSON.stringify(configJson, null, 2), "utf8");
console.log(`Written ${OUT_JSON_FILE}`);

console.log(`  ${experiments.length} experiment(s)`);
experiments.forEach(exp => {
  exp.languages.forEach(lang => {
    lang.annotationTypes.forEach(anno => {
      const totalVideos = anno.tasks.reduce((s, t) => s + t.videos.length, 0);
      console.log(`  ${exp.id}/${lang.id}/${anno.id}: ${anno.tasks.length} tasks, ${totalVideos} videos`);
    });
  });
});
