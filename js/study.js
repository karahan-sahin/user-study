const STORAGE_KEY = "sign_study_session";

const Study = (() => {

  function getState() {
    try { return JSON.parse(sessionStorage.getItem(STORAGE_KEY)) || {}; }
    catch { return {}; }
  }

  function setState(patch) {
    const s = { ...getState(), ...patch };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    return s;
  }

  function clearState() { sessionStorage.removeItem(STORAGE_KEY); }

  function goto(page) { window.location.href = page; }

  function renderProgress(currentStep, totalSteps) {
    const fill  = document.getElementById("progress-fill");
    const label = document.getElementById("progress-label");
    if (!fill || !label) return;
    fill.style.width = Math.round((currentStep / totalSteps) * 100) + "%";
    label.textContent = currentStep + " / " + totalSteps;
  }

  function ensureParticipantId() {
    if (!getState().participantId) {
      setState({ participantId: "P" + Date.now().toString(36).toUpperCase() });
    }
  }

  function buildResults() {
    const s = getState();
    return {
      participantId: s.participantId || "unknown",
      signingLevel:  s.signingLevel  || null,
      responses:     s.responses     || {},
      completedAt:   new Date().toISOString()
    };
  }

  async function saveResults() {
    const data = buildResults();
    const res  = await fetch(`/api/results`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(data)
    });
    if (!res.ok) throw new Error("Server returned " + res.status);
  }

  function submitResponse(task, ratings, videoFiles) {
    const s    = getState();
    const blob = new Blob([JSON.stringify({
      participantId: s.participantId || "unknown",
      signingLevel:  s.signingLevel  || null,
      expId:    task.expId,
      langId:   task.langId,
      annoId:   task.annoId,
      taskId:   task.taskId,
      ratings,            // { videoId: { understand, meaning, quality } }
      videoFiles,
      submittedAt: new Date().toISOString(),
    })], { type: "application/json" });
    navigator.sendBeacon("/api/response", blob);
  }

  return { getState, setState, clearState, goto, renderProgress, ensureParticipantId, buildResults, saveResults, submitResponse };
})();
