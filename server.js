const express = require("express");
const fs      = require("fs");
const https   = require("https");
const net     = require("net");
const path    = require("path");

const app     = express();
const RESULTS = path.join(__dirname, "results");

app.use(express.json());

// Serve server-port.js without caching so the browser always gets the current port
app.get("/js/server-port.js", (req, res) => {
  res.set("Cache-Control", "no-store");
  res.sendFile(path.join(__dirname, "js", "server-port.js"));
});

// Only serve what the study pages need. NOT the project root: that would expose
// key.pem, server.js, results/*.csv (participant data) and node_modules to the internet.
["css", "js", "assets"].forEach(d => app.use("/" + d, express.static(path.join(__dirname, d))));
["index", "assessment", "instructions", "language-intro", "experiment", "complete"].forEach(n =>
  app.get(["/" + n + ".html", ...(n === "index" ? ["/"] : [])], (req, res) => res.sendFile(path.join(__dirname, n + ".html"))));

// Serve video files without .mp4 extension to bypass proxies that block by URL pattern.
// Browser requests /vid/assets/experiment1/.../filename  → serves filename.mp4
app.get("/vid/*", (req, res) => {
  const filePath = path.join(__dirname, req.params[0] + ".mp4");
  if (!filePath.startsWith(path.join(__dirname, "assets") + path.sep) || !fs.existsSync(filePath)) {
    return res.status(404).end();
  }
  res.set("Content-Type", "application/octet-stream");
  res.sendFile(filePath);
});

// System label parsed from the filename: <video_id>.<label>.mp4 (segment before the extension)
function getLabel(filename) {
  const base = filename.replace(/\.(mp4|webm|mov|ogg)$/i, "");
  const dot  = base.lastIndexOf(".");
  return dot >= 0 ? base.slice(dot + 1) : base;
}

// Remove all existing rows for participantId+taskId, then append newRows.
// taskId=null removes all rows for the participant (used by the bulk /api/results endpoint).
function appendCSV(csvPath, header, newRows, participantId, taskId = null) {
  const block = newRows.join("\n") + "\n";
  if (!fs.existsSync(csvPath)) {
    fs.writeFileSync(csvPath, header + block, "utf8");
    return;
  }
  let lines = fs.readFileSync(csvPath, "utf8").split("\n");
  // Migrate an older file that predates the "grammar" column: insert an empty value before submitted_at.
  if (lines[0] && !lines[0].includes("grammar")) {
    lines = lines.map((line, i) => {
      if (i === 0) return header.trim();
      if (line === "") return line;
      const cols = line.split(",");
      cols.splice(cols.length - 1 - 2, 0, '""');   // after quality (…quality,visual,natural,submitted_at → before visual)
      return cols.join(",");
    });
  }
  const kept  = lines.filter(line => {
    if (line === "" || line.startsWith("participant_id")) return true;
    const cols = line.split(",");
    if (cols[0] !== `"${participantId}"`) return true;       // different participant — keep
    if (taskId === null) return false;                        // bulk mode — drop all for this participant
    return cols[4] !== `"${taskId}"`;                        // per-task mode — only drop matching task
  });
  fs.writeFileSync(csvPath, kept.join("\n").replace(/\n+$/, "") + "\n" + block, "utf8");
}

const CSV_HEADER =
  "participant_id,signing_level,language,anno_type,example_id,label,understand,meaning,quality,grammar,visual,natural,submitted_at\n";

// Build one CSV row per rated video from a nested { videoId: { understand, meaning, quality, visual, natural } } object
function ratingRows(ratings, files, participantId, signingLevel, langId, annoId, taskId, timestamp) {
  return Object.entries(ratings || {}).map(([videoId, scores]) => {
    const file = files[videoId] || videoId;
    const s = scores || {};
    return `"${participantId}","${signingLevel || ""}","${langId}","${annoId}","${taskId}","${getLabel(file)}",` +
           `"${s.understand ?? ""}","${s.meaning ?? ""}","${s.quality ?? ""}","${s.grammar ?? ""}","${s.visual ?? ""}","${s.natural ?? ""}","${timestamp}"`;
  });
}

// Per-example endpoint — called on every Next click
app.post("/api/response", (req, res) => {
  const { participantId, signingLevel, expId, langId, annoId, taskId, ratings, videoFiles, submittedAt } = req.body;

  if (!participantId || !expId || !taskId) {
    return res.status(400).json({ error: "Missing required fields." });
  }

  fs.mkdirSync(RESULTS, { recursive: true });

  try {
    const rows = ratingRows(ratings, videoFiles || {}, participantId, signingLevel, langId, annoId, taskId, submittedAt);

    if (rows.length) {
      appendCSV(
        path.join(RESULTS, `${expId}.csv`),
        CSV_HEADER,
        rows,
        participantId,
        taskId
      );
    }
    res.json({ ok: true });
  } catch (err) {
    console.error("Failed to write response:", err);
    res.status(500).json({ error: "Failed to save response." });
  }
});

app.post("/api/results", (req, res) => {
  const { participantId, signingLevel, responses, completedAt } = req.body;

  if (!participantId || !responses) {
    return res.status(400).json({ error: "Missing required fields." });
  }

  fs.mkdirSync(RESULTS, { recursive: true });

  try {
    // responses shape: { [expId]: { [langId]: { [annoId]: { [taskId]: { ratings, videoFiles } } } } }
    // ratings: { [videoId]: { understand, meaning, quality, visual, natural } }
    Object.entries(responses).forEach(([expId, languages]) => {
      const rows = [];

      Object.entries(languages).forEach(([langId, annoTypes]) => {
        Object.entries(annoTypes).forEach(([annoId, tasks]) => {
          Object.entries(tasks).forEach(([taskId, value]) => {
            const ratings    = value && value.ratings    ? value.ratings    : {};
            const videoFiles = value && value.videoFiles ? value.videoFiles : {};
            rows.push(...ratingRows(ratings, videoFiles, participantId, signingLevel, langId, annoId, taskId, completedAt));
          });
        });
      });

      if (rows.length) {
        appendCSV(
          path.join(RESULTS, `${expId}.csv`),
          CSV_HEADER,
          rows,
          participantId
        );
      }
    });

    res.json({ ok: true });
  } catch (err) {
    console.error("Failed to write results:", err);
    res.status(500).json({ error: "Failed to save results." });
  }
});

function findFreePort(preferred, cb) {
  const s = net.createServer();
  s.once("error", () => findFreePort(preferred + 1, cb));
  s.once("listening", () => s.close(() => cb(preferred)));
  s.listen(preferred);
}

const sslKey  = path.join(__dirname, "key.pem");
const sslCert = path.join(__dirname, "cert.pem");
const useHttps = fs.existsSync(sslKey) && fs.existsSync(sslCert);

findFreePort(4242, httpPort => {
  fs.writeFileSync(
    path.join(__dirname, "js", "server-port.js"),
    `const SERVER_PORT = ${httpPort};\n`,
    "utf8"
  );

  app.listen(httpPort, () => {
    console.log(`Study server (HTTP)  → http://localhost:${httpPort}`);
  });

  if (useHttps) {
    findFreePort(httpPort + 1, httpsPort => {
      const creds = { key: fs.readFileSync(sslKey), cert: fs.readFileSync(sslCert) };
      https.createServer(creds, app).listen(httpsPort, () => {
        console.log(`Study server (HTTPS) → https://localhost:${httpsPort}`);
      });
    });
  }
});
