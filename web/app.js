const API = "https://study-app-1dga.onrender.com";

document.getElementById("ping").addEventListener("click", async () => {
  const out = document.getElementById("out");
  try {
    const res = await fetch(`${API}/health`);
    out.textContent = JSON.stringify(await res.json());
  } catch {
    out.textContent = "Backend not reachable";
  }
});

document.getElementById("generate").addEventListener("click", async () => {
  const text = document.getElementById("material").value.trim();
  const file = document.getElementById("file").files[0];
  const count = Number(document.getElementById("count").value) || 5;
  const box = document.getElementById("cards");
  if (!text && !file) return;
  box.textContent = "Generating...";
  try {
    let res;
    if (file) {
      const form = new FormData();
      form.append("file", file);
      form.append("count", count);
      res = await fetch(`${API}/flashcards/upload`, { method: "POST", headers: await authHeaders(), body: form });
    } else {
      res = await fetch(`${API}/flashcards`, {
        method: "POST",
        headers: await authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ text, count }),
      });
    }
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Request failed");
    const hid = addHistory({ type: "flashcards", title: makeTitle(text, file), data: data.cards });
    renderCards(data.cards, box, hid);
  } catch (e) {
    box.textContent = e.message || "Something went wrong";
  }
});

// ---- Tabs ----
document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b === btn));
    document.querySelectorAll(".tab-panel").forEach((p) => {
      p.hidden = p.id !== `tab-${btn.dataset.tab}`;
    });
  });
});

// ---- Quiz ----
document.getElementById("generate-quiz").addEventListener("click", async () => {
  const text = document.getElementById("material").value.trim();
  const file = document.getElementById("file").files[0];
  const count = Number(document.getElementById("qcount").value) || 5;
  const types = [...document.querySelectorAll(".qtype:checked")].map((c) => c.value);
  const box = document.getElementById("quiz");
  if (!text && !file) { box.textContent = "Add some material first."; return; }
  if (!types.length) { box.textContent = "Pick at least one question type."; return; }
  box.textContent = "Generating...";
  try {
    const form = new FormData();
    form.append("count", count);
    form.append("types", types.join(","));
    if (file) form.append("file", file);
    else form.append("text", text);
    const res = await fetch(`${API}/quiz`, { method: "POST", headers: await authHeaders(), body: form });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Request failed");
    const hid = addHistory({ type: "quiz", title: makeTitle(text, file), data: data.questions, attempts: [] });
    renderQuiz(data.questions, box, hid);
  } catch (e) {
    box.textContent = e.message || "Something went wrong";
  }
});

function renderQuiz(questions, box, historyId){
  box.innerHTML = "";
  if (!questions.length) { box.textContent = "No questions generated. Try again."; return; }
  let answered = 0, correct = 0;
  const results = [];
  let lastTick = Date.now();
  const score = document.createElement("div");
  score.className = "score";
  const updateScore = () => {
    score.textContent = answered === questions.length
      ? `Final score: ${correct} / ${questions.length}`
      : `Score: ${correct} correct, ${answered} of ${questions.length} answered`;
  };
  updateScore();
  box.appendChild(score);

  questions.forEach((q, i) => {
    const item = document.createElement("div");
    item.className = "q-item";
    const title = document.createElement("p");
    title.className = "q-text";
    title.textContent = `${i + 1}. ${q.question}`;
    item.appendChild(title);
    const note = document.createElement("p");
    note.className = "q-note";

    const finish = (isRight, picked) => {
      answered++;
      if (isRight) correct++;
      const seconds = Math.round((Date.now() - lastTick) / 1000);
      lastTick = Date.now();
      results.push({ q, i, picked, isRight, seconds });
      note.textContent = (isRight ? "Correct. " : `Wrong. Answer: ${q.answer}. `) + (q.explanation || "");
      note.classList.add(isRight ? "ok" : "bad");
      updateScore();
      if (answered === questions.length) showReport(results, box, historyId);
    };

    if (q.type === "fill") {
      const input = document.createElement("input");
      input.type = "text";
      input.placeholder = "Your answer";
      const check = document.createElement("button");
      check.textContent = "Check";
      check.addEventListener("click", () => {
        if (!input.value.trim()) return;
        input.disabled = check.disabled = true;
        finish(input.value.trim().toLowerCase() === q.answer.toLowerCase(), input.value.trim());
      });
      item.append(input, check);
    } else {
      const opts = document.createElement("div");
      opts.className = "q-options";
      q.options.forEach((opt) => {
        const b = document.createElement("button");
        b.className = "opt";
        b.textContent = opt;
        b.addEventListener("click", () => {
          opts.querySelectorAll("button").forEach((x) => {
            x.disabled = true;
            if (x.textContent === q.answer) x.classList.add("right");
          });
          if (opt !== q.answer) b.classList.add("wrong");
          finish(opt === q.answer, opt);
        });
        opts.appendChild(b);
      });
      item.appendChild(opts);
    }
    item.appendChild(note);
    box.appendChild(item);
  });
}

// ---- Notes ----
let lastNotes = null;

document.getElementById("generate-notes").addEventListener("click", async () => {
  const text = document.getElementById("material").value.trim();
  const file = document.getElementById("file").files[0];
  const level = document.getElementById("level").value;
  const box = document.getElementById("notes");
  const copyBtn = document.getElementById("copy-notes");
  copyBtn.hidden = true;
  if (!text && !file) { box.textContent = "Add some material first."; return; }
  box.textContent = "Generating...";
  try {
    const form = new FormData();
    form.append("level", level);
    if (file) form.append("file", file);
    else form.append("text", text);
    const res = await fetch(`${API}/notes`, { method: "POST", headers: await authHeaders(), body: form });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Request failed");
    lastNotes = data;
    addHistory({ type: "notes", title: makeTitle(text, file), data });
    renderNotes(data, box);
    copyBtn.hidden = !data.sections.length;
  } catch (e) {
    box.textContent = e.message || "Something went wrong";
  }
});

function renderNotes(data, box) {
  box.innerHTML = "";
  if (!data.sections.length) { box.textContent = "No notes generated. Try again."; return; }

  data.sections.forEach((s) => {
    const sec = document.createElement("div");
    sec.className = "note-section";
    const h = document.createElement("h3");
    h.textContent = s.heading;
    const ul = document.createElement("ul");
    s.points.forEach((p) => {
      const li = document.createElement("li");
      li.textContent = p;
      ul.appendChild(li);
    });
    sec.append(h, ul);
    box.appendChild(sec);
  });

  if (data.key_terms.length) {
    const sec = document.createElement("div");
    sec.className = "note-section";
    const h = document.createElement("h3");
    h.textContent = "Key terms";
    sec.appendChild(h);
    data.key_terms.forEach((t) => {
      const p = document.createElement("p");
      p.className = "term";
      const b = document.createElement("strong");
      b.textContent = t.term + ": ";
      p.append(b, document.createTextNode(t.meaning));
      sec.appendChild(p);
    });
    box.appendChild(sec);
  }
}

document.getElementById("copy-notes").addEventListener("click", async () => {
  if (!lastNotes) return;
  let out = "";
  lastNotes.sections.forEach((s) => {
    out += s.heading + "\n" + s.points.map((p) => "- " + p).join("\n") + "\n\n";
  });
  if (lastNotes.key_terms.length) {
    out += "Key terms\n" + lastNotes.key_terms.map((t) => `${t.term}: ${t.meaning}`).join("\n");
  }
  const btn = document.getElementById("copy-notes");
  try {
    await navigator.clipboard.writeText(out.trim());
    btn.textContent = "Copied";
  } catch {
    btn.textContent = "Copy failed";
  }
  setTimeout(() => (btn.textContent = "Copy notes"), 1500);
});

// ---- Layout helpers ----
const fileInput = document.getElementById("file");
const fileChip = document.getElementById("file-chip");
const noFile = document.getElementById("no-file");

// show the chosen file name, with an x to remove it
fileInput.addEventListener("change", () => {
  const f = fileInput.files[0];
  fileChip.hidden = !f;
  noFile.hidden = !!f;
  if (f) document.getElementById("file-name").textContent = f.name;
});
document.getElementById("file-remove").addEventListener("click", () => {
  fileInput.value = "";
  fileChip.hidden = true;
  noFile.hidden = false;
});

// Ctrl+Enter in the textarea runs the Generate button of the open section
document.getElementById("material").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    const gen = document.querySelector(".tab-panel:not([hidden]) .gen");
    if (gen) gen.click();
  }
});

// update the header when you switch sections
document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    const av = btn.querySelector(".avatar");
    const head = document.getElementById("head-avatar");
    head.className = av.className;
    head.textContent = av.textContent;
    document.getElementById("head-title").textContent = btn.querySelector(".name").textContent;
    document.getElementById("head-sub").textContent = btn.querySelector(".sub").textContent;
  });
});

function showReport(rawResults, box, historyId) {
  if (historyId) {
    const r = rawResults.filter((x) => x.isRight).length;
    updateHistory(historyId, (it) => {
      (it.attempts = it.attempts || []).push({
        date: new Date().toISOString(), right: r, total: rawResults.length,
        pct: Math.round((r / rawResults.length) * 100),
      });
    });
  }
  const results = rawResults.slice().sort((a, b) => a.i - b.i);
  const total = results.length;
  const right = results.filter((r) => r.isRight).length;
  const wrong = total - right;
  const pct = Math.round((right / total) * 100);
  const avg = Math.round(results.reduce((s, r) => s + r.seconds, 0) / total);
  const names = { mcq: "Multiple choice", tf: "True / False", fill: "Fill in the blank" };

  // accuracy by question type
  const byType = {};
  results.forEach((r) => {
    const t = r.q.type;
    byType[t] = byType[t] || { right: 0, total: 0 };
    byType[t].total++;
    if (r.isRight) byType[t].right++;
  });
  const typeRows = Object.entries(byType).map(([t, v]) => ({
    name: names[t] || "Other", p: Math.round((v.right / v.total) * 100), right: v.right, total: v.total,
  }));

  // donut chart
  const R = 54, C = 2 * Math.PI * R;
  const donut = `
    <svg viewBox="0 0 140 140" class="donut">
      <circle cx="70" cy="70" r="${R}" fill="none" stroke="#e11d2e" stroke-width="16"/>
      <circle cx="70" cy="70" r="${R}" fill="none" stroke="#22c55e" stroke-width="16"
        stroke-dasharray="${(C * right) / total} ${C}" transform="rotate(-90 70 70)"/>
      <text x="70" y="68" text-anchor="middle" class="donut-pct">${pct}%</text>
      <text x="70" y="88" text-anchor="middle" class="donut-sub">${right} / ${total}</text>
    </svg>`;

  // accuracy by type bars
  const bars = typeRows.map((t) => `
    <div class="bar-row">
      <span class="bar-label">${t.name}</span>
      <div class="bar"><div class="bar-fill" style="width:${t.p}%"></div></div>
      <span class="bar-val">${t.p}% (${t.right}/${t.total})</span>
    </div>`).join("");

  // time per answer columns
  const maxT = Math.max(...results.map((r) => r.seconds), 1);
  const cols = results.map((r, i) => `
    <div class="col" title="Q${i + 1}: ${r.seconds}s, ${r.isRight ? "correct" : "wrong"}">
      <div class="col-bar ${r.isRight ? "ok" : "bad"}" style="height:${Math.max(6, (r.seconds / maxT) * 100)}%"></div>
      <span class="col-label">${i + 1}</span>
    </div>`).join("");

  // written insights
  const insights = [];
  const verdict = pct >= 80 ? "a strong result" : pct >= 50 ? "good progress with some gaps" : "a sign this material needs more review";
  insights.push(`You answered ${right} of ${total} correctly (${pct}%), which is ${verdict}.`);
  if (typeRows.length > 1) {
    const sorted = typeRows.slice().sort((a, b) => b.p - a.p);
    const best = sorted[0], worst = sorted[sorted.length - 1];
    if (best.p !== worst.p) {
      insights.push(`Your strongest question type was ${best.name} (${best.p}%) and your weakest was ${worst.name} (${worst.p}%).`);
    }
  }
  const avgOf = (arr) => (arr.length ? Math.round(arr.reduce((s, r) => s + r.seconds, 0) / arr.length) : null);
  const tRight = avgOf(results.filter((r) => r.isRight));
  const tWrong = avgOf(results.filter((r) => !r.isRight));
  if (tRight !== null && tWrong !== null) {
    insights.push(tWrong > tRight
      ? `You spent longer on wrong answers (${tWrong}s) than correct ones (${tRight}s), so those questions were harder for you, not rushed.`
      : `You answered wrong questions faster (${tWrong}s) than correct ones (${tRight}s), so slowing down a little may help.`);
  }
  insights.push("Time is measured between answers, so it is most accurate when you answer in order.");

  const report = document.createElement("div");
  report.className = "report";
  report.innerHTML = `
    <h3>Quiz report</h3>
    <div class="report-top">
      ${donut}
      <div class="kpis">
        <div class="kpi"><b>${pct}%</b><span>Accuracy</span></div>
        <div class="kpi"><b class="ok">${right}</b><span>Correct</span></div>
        <div class="kpi"><b class="bad">${wrong}</b><span>Wrong</span></div>
        <div class="kpi"><b>${avg}s</b><span>Avg time per answer</span></div>
      </div>
    </div>
    <div class="report-charts">
      <div class="chart"><h4>Accuracy by question type</h4>${bars}</div>
      <div class="chart"><h4>Time per answer (seconds)</h4><div class="cols">${cols}</div></div>
    </div>
    <h4>What this means</h4>
    <ul class="insights">${insights.map((s) => `<li>${s}</li>`).join("")}</ul>`;

  // missed questions review (built with textContent, since the text comes from the AI)
  const missed = results.filter((r) => !r.isRight);
  if (missed.length) {
    const h = document.createElement("h4");
    h.textContent = "Review the questions you missed";
    report.appendChild(h);
    missed.forEach((r) => {
      const p = document.createElement("p");
      p.className = "missed";
      const b = document.createElement("strong");
      b.textContent = r.q.question;
      p.append(b, document.createElement("br"),
        document.createTextNode(`You answered: ${r.picked || "(blank)"}  |  Correct: ${r.q.answer}`));
      report.appendChild(p);
    });
    const retry = document.createElement("button");
    retry.textContent = "Retry missed questions";
    retry.addEventListener("click", () => renderQuiz(missed.map((r) => r.q), box));
    report.appendChild(retry);
  }

  box.insertBefore(report, box.firstChild);
  box.scrollTo({ top: 0, behavior: "smooth" });
}
// ---- Flashcards: study mode ----
let cardState = { cards: [], historyId: null };

function progressText() {
  const k = cardState.cards.filter((c) => c.s === "known").length;
  const l = cardState.cards.filter((c) => c.s === "learning").length;
  return `Got it: ${k} · Still learning: ${l} · New: ${cardState.cards.length - k - l}`;
}

function updateProgress() {
  const bar = document.querySelector("#cards .progress");
  if (bar) bar.textContent = progressText();
}

function renderCards(cards, box, historyId) {
  if (cards !== undefined) cardState = { cards, historyId: historyId || null };
  box = box || document.getElementById("cards");
  box.innerHTML = "";
  if (!cardState.cards.length) return;

  const study = document.getElementById("study-mode").checked;
  const onlyLearning = document.getElementById("only-learning").checked;
  const rank = (c) => (c.s === "learning" ? 0 : c.s === "known" ? 2 : 1);

  const bar = document.createElement("div");
  bar.className = "progress";
  bar.textContent = progressText();
  box.appendChild(bar);

  const order = cardState.cards
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => !onlyLearning || c.s === "learning")
    .sort((a, b) => rank(a.c) - rank(b.c));

  if (!order.length) {
    const p = document.createElement("p");
    p.className = "empty";
    p.textContent = 'No cards are marked "still learning". Nice work.';
    box.appendChild(p);
    return;
  }
  order.forEach(({ c, i }) => box.appendChild(buildCard(c, i, study)));
}

function buildCard(c, i, study) {
  const el = document.createElement("div");
  el.className = "card" + (c.s ? " " + c.s : "");
  const q = document.createElement("strong");
  q.textContent = c.q;
  const a = document.createElement("p");
  a.textContent = c.a;
  el.append(q, a);
  if (!study) return el; // show-all mode: question and answer both visible

  el.classList.add("study");
  a.hidden = true;
  const hint = document.createElement("span");
  hint.className = "hint";
  hint.textContent = "Click to reveal the answer";
  const actions = document.createElement("div");
  actions.className = "card-actions";
  actions.hidden = true;
  const got = document.createElement("button");
  got.textContent = "Got it";
  const again = document.createElement("button");
  again.textContent = "Still learning";
  actions.append(got, again);
  el.append(hint, actions);

  // flip between question side and answer side
  el.addEventListener("click", () => {
    const back = a.hidden; // currently showing the question, so flip to the answer
    q.hidden = back;
    a.hidden = !back;
    hint.hidden = back;
    actions.hidden = !back;
  });

  const mark = (status) => (e) => {
    e.stopPropagation();
    cardState.cards[i].s = status;
    if (cardState.historyId) {
      updateHistory(cardState.historyId, (it) => { if (it.data[i]) it.data[i].s = status; });
    }
    el.classList.remove("known", "learning");
    el.classList.add(status);
    updateProgress();
  };
  got.addEventListener("click", mark("known"));
  again.addEventListener("click", mark("learning"));
  return el;
}

document.getElementById("study-mode").addEventListener("change", () => renderCards());
document.getElementById("only-learning").addEventListener("change", () => renderCards());

// ---- History ----
function historySummary(h) {
  if (h.type === "flashcards") {
    const known = h.data.filter((c) => c.s === "known").length;
    const learning = h.data.filter((c) => c.s === "learning").length;
    return `${h.data.length} cards` + (known || learning ? `, ${known} got it, ${learning} still learning` : "");
  }
  if (h.type === "quiz") {
    const best = (h.attempts || []).reduce((m, a) => Math.max(m, a.pct), -1);
    return `${h.data.length} questions` + (best >= 0 ? `, best score ${best}%` : ", not taken yet");
  }
  if (h.type === "ask") {
    const n = Math.ceil(h.data.length / 2);
    return `${n} question${n === 1 ? "" : "s"}`;
  }
  return `${h.data.sections.length} sections`;
}

function renderHistory() {
  const box = document.getElementById("history-list");
  const filter = document.getElementById("history-filter").value;
  const items = loadHistory().filter((h) => filter === "all" || h.type === filter);
    const labels = { flashcards: "Flashcards", quiz: "Quiz", notes: "Notes", ask: "Ask" };
  box.innerHTML = "";
  if (!items.length) {
    box.textContent = "Nothing here yet. Generate flashcards, a quiz or notes and they will be saved here.";
    return;
  }
  items.forEach((h) => {
    const row = document.createElement("div");
    row.className = "h-item";

    const info = document.createElement("div");
    info.className = "h-info";
    const title = document.createElement("strong");
    title.textContent = h.title;
    const meta = document.createElement("span");
    meta.className = "h-meta";
    meta.textContent = `${labels[h.type] || h.type} · ${historySummary(h)} · ${new Date(h.date).toLocaleString()}`;
    info.append(title, meta);

    const actions = document.createElement("div");
    actions.className = "h-actions";
    const open = document.createElement("button");
    open.textContent = "Open";
    open.addEventListener("click", () => openHistory(h));
    const del = document.createElement("button");
    del.textContent = "Delete";
    del.addEventListener("click", () => { deleteHistory(h.id); renderHistory(); });
    actions.append(open, ...exportButtons(h), del);

    row.append(info, actions);
    box.appendChild(row);
  });
}

function openHistory(h) {
  document.querySelector(`.tab[data-tab="${h.type}"]`).click();
  if (h.type === "flashcards") {
    renderCards(h.data, document.getElementById("cards"), h.id);
  } else if (h.type === "quiz") {
    renderQuiz(h.data, document.getElementById("quiz"), h.id);
  } else if (h.type === "ask") {
    loadChat(h);
  } else {
    lastNotes = h.data;
    renderNotes(h.data, document.getElementById("notes"));
    document.getElementById("copy-notes").hidden = false;
  }
}

document.getElementById("history-filter").addEventListener("change", renderHistory);
document.getElementById("clear-history").addEventListener("click", () => {
  if (confirm("Delete all history? This cannot be undone.")) {
    clearHistory();
    renderHistory();
  }
});

// refresh lists when History, Games or Progress opens, and hide the material box there
document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    const t = btn.dataset.tab;
    document.querySelector(".composer").hidden = ["history", "games", "progress"].includes(t);
    if (t === "history") renderHistory();
    if (t === "games") fillGameSources();
    if (t === "progress") renderProgress();
  });
});

async function authHeaders(extra) {
  const token = await getToken();
  return { ...(extra || {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}
// ---- Ask / Explain ----
let askSource = "";    // describes the material the current conversation is about
let askLog = [];          // the full conversation, saved to History
let askHistoryId = null;  // which History item this conversation belongs to
let askResumed = false;   // true right after opening a saved chat
let askHistory = [];   // [{ role: "user" | "assistant", content }]
const fileCache = {};  // file key -> extracted text, so a file is only read once
const chatBox = document.getElementById("chat");

function chatHint() {
  chatBox.innerHTML = "";
  const p = document.createElement("p");
  p.className = "chat-hint";
  p.textContent = "Add your material above, then ask a question about it.";
  chatBox.appendChild(p);
}
chatHint();

function askReset() {
  askHistory = [];
  askLog = [];
  askHistoryId = null;
  askResumed = false;
  askSource = "";
  Object.keys(fileCache).forEach((k) => delete fileCache[k]);
  chatHint();
}

function saveChat(question, file) {
  const exists = askHistoryId && loadHistory().some((x) => x.id === askHistoryId);
  if (exists) {
    updateHistory(askHistoryId, (it) => { it.data = askLog.slice(); });
  } else {
    // new chat, or the saved one was deleted: start fresh from this exchange
    askLog = askLog.slice(-2);
    askHistoryId = addHistory({ type: "ask", title: makeTitle(question, file), data: askLog.slice() });
  }
}

function loadChat(h) {
  chatBox.innerHTML = "";
  h.data.forEach((m) => addMsg(m.role === "user" ? "user" : "bot", m.content));
  addMsg("note", "Saved conversation. To keep asking, paste or attach the same material above.");
  askLog = h.data.map((m) => ({ ...m }));
  askHistory = askLog.slice(-8);
  askHistoryId = h.id;
  askResumed = true;
  askSource = "";
}

function addMsg(kind, text) {
  const hint = chatBox.querySelector(".chat-hint");
  if (hint) hint.remove();
  const el = document.createElement("div");
  el.className = `msg ${kind}`;
  el.textContent = text;
  chatBox.appendChild(el);
  chatBox.scrollTop = chatBox.scrollHeight;
  return el;
}

async function getAskMaterial() {
  const file = document.getElementById("file").files[0];
  if (file) {
    const key = `f:${file.name}:${file.size}:${file.lastModified}`;
    if (!fileCache[key]) {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${API}/extract`, { method: "POST", headers: await authHeaders(), body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Could not read the file.");
      fileCache[key] = data.text;
    }
    return { key, text: fileCache[key] };
  }
  const text = document.getElementById("material").value.trim();
  return { key: "t:" + text, text };
}

async function sendAsk() {
  const input = document.getElementById("ask-input");
  const btn = document.getElementById("ask-send");
  const question = input.value.trim();
  if (!question) return;
  if (!document.getElementById("material").value.trim() && !document.getElementById("file").files[0]) {
    addMsg("err", "Add some material first: paste text above or attach a file.");
    return;
  }
  input.value = "";
  btn.disabled = true;
  addMsg("user", question);
  const pending = addMsg("bot pending", "Thinking...");
  try {
    const m = await getAskMaterial();
    if (m.key !== askSource) {
      if (askResumed) {
        askResumed = false;   // continuing a saved chat with the material added again
      } else {
        askHistory = [];      // new material means a new conversation
        askLog = [];
        askHistoryId = null;
      }
      askSource = m.key;
    }
    const res = await fetch(`${API}/ask`, {
      method: "POST",
      headers: await authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        question,
        material: m.text,
        history: askHistory,
        general: document.getElementById("ask-general").checked,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Request failed");
    pending.className = "msg bot";
    pending.textContent = data.answer;
    askHistory.push({ role: "user", content: question }, { role: "assistant", content: data.answer });
    askHistory = askHistory.slice(-8);
    askLog.push({ role: "user", content: question }, { role: "assistant", content: data.answer });
    if (askLog.length > 60) askLog = askLog.slice(-60);
    saveChat(question, document.getElementById("file").files[0]);
  } catch (e) {
    pending.className = "msg err";
    pending.textContent = e.message || "Something went wrong";
  } finally {
    btn.disabled = false;
    input.focus();
  }
}

document.getElementById("ask-send").addEventListener("click", sendAsk);
document.getElementById("ask-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    sendAsk();
  }
});
document.getElementById("ask-clear").addEventListener("click", askReset);

// ---- Games: matching ----
const gameBox = document.getElementById("game");
let matchGame = null;
let gameTimer = null;

function shuffle(a) {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

function gameHint(text) {
  gameBox.innerHTML = "";
  const p = document.createElement("p");
  p.className = "game-hint";
  p.textContent = text || "Pick a flashcard set below and press Start.";
  gameBox.appendChild(p);
}
gameHint();

function gameReset() {
  clearInterval(gameTimer);
  matchGame = null;
  gameHint();
}

function flashcardSets() {
  return loadHistory().filter((h) => h.type === "flashcards" && Array.isArray(h.data) && h.data.length >= 3);
}

function fillGameSources() {
  const sel = document.getElementById("game-source");
  const sets = flashcardSets();
  sel.innerHTML = "";
  if (!sets.length) {
    const o = document.createElement("option");
    o.value = "";
    o.textContent = "No flashcard sets yet";
    sel.appendChild(o);
    return;
  }
  sets.forEach((h) => {
    const o = document.createElement("option");
    o.value = h.id;
    o.textContent = `${h.title} (${h.data.length} cards)`;
    sel.appendChild(o);
  });
}

function makeRounds(pool, size) {
  const rounds = [];
  for (let i = 0; i < pool.length; i += size) rounds.push(pool.slice(i, i + size));
  if (rounds.length > 1 && rounds[rounds.length - 1].length < 3) {
    const last = rounds.pop(); // a tiny last round is merged into the one before it
    rounds[rounds.length - 1] = rounds[rounds.length - 1].concat(last);
  }
  return rounds;
}

function startMatch() {
  clearInterval(gameTimer);
  const set = flashcardSets().find((h) => h.id === document.getElementById("game-source").value);
  if (!set) {
    gameHint("Generate some flashcards first (a set needs at least 3 cards), then come back to play.");
    return;
  }
  const size = Number(document.getElementById("game-size").value) || 6;
  const learningOnly = document.getElementById("game-learning").checked;
  const cards = set.data
    .filter((c) => !learningOnly || c.s === "learning")
    .map((c) => ({ q: c.q, a: c.a }));
  if (cards.length < 3) {
    gameHint('Not enough cards marked "still learning" in this set. Mark some in the Flashcards study mode first.');
    return;
  }
  matchGame = { rounds: makeRounds(shuffle(cards), size), round: 0, totalTime: 0, totalMistakes: 0, totalPairs: 0 };
  startRound();
}

function startRound() {
  clearInterval(gameTimer);
  const g = matchGame;
  g.pairs = g.rounds[g.round].map((c, i) => ({ id: String(i), q: c.q, a: c.a }));
  g.matched = 0;
  g.mistakes = 0;
  g.selected = null;
  g.start = Date.now();

  gameBox.innerHTML = "";
  const stats = document.createElement("div");
  stats.className = "game-stats";
  stats.innerHTML = `<span>Round <b>${g.round + 1}</b> of <b>${g.rounds.length}</b></span>
    <span>Matched <b id="game-progress">0/${g.pairs.length}</b></span>
    <span>Time <b id="game-time">0s</b></span>
    <span>Mistakes <b id="game-mistakes">0</b></span>`;
  const hint = document.createElement("p");
  hint.className = "game-hint";
  hint.style.margin = "0 0 14px";
  hint.style.textAlign = "left";
  hint.textContent = "Tap a question, then tap the answer that belongs to it.";

  const board = document.createElement("div");
  board.className = "board";
  const makeCol = (side, items) => {
    const col = document.createElement("div");
    col.className = "col-tiles";
    items.forEach((p) => {
      const t = document.createElement("button");
      t.className = "tile";
      t.dataset.id = p.id;
      t.dataset.side = side;
      t.textContent = side === "q" ? p.q : p.a;
      t.addEventListener("click", () => onTile(t));
      col.appendChild(t);
    });
    return col;
  };
  board.append(makeCol("q", shuffle(g.pairs)), makeCol("a", shuffle(g.pairs)));
  gameBox.append(stats, hint, board);
  gameTimer = setInterval(updateStats, 1000);
}

function updateStats() {
  const g = matchGame;
  if (!g) return;
  const t = document.getElementById("game-time");
  const m = document.getElementById("game-mistakes");
  const p = document.getElementById("game-progress");
  if (t) t.textContent = Math.round((Date.now() - g.start) / 1000) + "s";
  if (m) m.textContent = g.mistakes;
  if (p) p.textContent = `${g.matched}/${g.pairs.length}`;
}

function onTile(el) {
  const g = matchGame;
  if (!g || el.classList.contains("done")) return;
  if (!g.selected) {
    g.selected = el;
    el.classList.add("sel");
    return;
  }
  if (g.selected.dataset.side === el.dataset.side) { // same column: just change the selection
    g.selected.classList.remove("sel");
    g.selected = el;
    el.classList.add("sel");
    return;
  }
  const first = g.selected;
  g.selected = null;
  first.classList.remove("sel");
  if (first.dataset.id === el.dataset.id) {
    first.classList.add("done");
    el.classList.add("done");
    g.matched++;
    updateStats();
    if (g.matched === g.pairs.length) endRound();
  } else {
    g.mistakes++;
    updateStats();
    first.classList.add("bad");
    el.classList.add("bad");
    setTimeout(() => {
      first.classList.remove("bad");
      el.classList.remove("bad");
    }, 450);
  }
}

function endRound() {
  const g = matchGame;
  clearInterval(gameTimer);
  const secs = Math.round((Date.now() - g.start) / 1000);
  g.totalTime += secs;
  g.totalMistakes += g.mistakes;
  g.totalPairs += g.pairs.length;
  const last = g.round === g.rounds.length - 1;
  const pct = (pairs, mistakes) => Math.round((pairs / (pairs + mistakes)) * 100);

  const box = document.createElement("div");
  box.className = "game-result";
  const h = document.createElement("h3");
  h.textContent = last ? "Game complete" : `Round ${g.round + 1} complete`;
  const p1 = document.createElement("p");
  p1.textContent = `This round: ${secs}s, ${g.mistakes} mistake${g.mistakes === 1 ? "" : "s"}, ${pct(g.pairs.length, g.mistakes)}% accuracy.`;
  box.append(h, p1);
  if (last && g.rounds.length > 1) {
    const p2 = document.createElement("p");
    p2.textContent = `Overall: ${g.totalTime}s, ${g.totalMistakes} mistake${g.totalMistakes === 1 ? "" : "s"}, ${pct(g.totalPairs, g.totalMistakes)}% accuracy.`;
    box.appendChild(p2);
  }
  const btn = document.createElement("button");
  btn.textContent = last ? "Play again" : "Next round";
  btn.addEventListener("click", () => {
    if (last) {
      startMatch();
    } else {
      g.round++;
      startRound();
    }
  });
  box.appendChild(btn);
  gameBox.appendChild(box);
  box.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

document.getElementById("game-start").addEventListener("click", startMatch);
// ---- Export ----
const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function safeName(title) {
  return (title || "study").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").slice(0, 40) || "study";
}

function downloadFile(name, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// opens the browser's print window; choose "Save as PDF" there
function printHtml(title, bodyHtml) {
  const f = document.createElement("iframe");
  f.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  document.body.appendChild(f);
  const doc = f.contentWindow.document;
  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
    <style>
      body { font-family: Arial, sans-serif; color: #111; margin: 24px; line-height: 1.45; }
      h1 { font-size: 20px; margin-bottom: 4px; } h2 { font-size: 16px; margin-top: 20px; }
      .q { margin: 14px 0; } .opt { margin-left: 18px; } .key { page-break-before: always; }
      th, td { text-align: left; vertical-align: top; }
    </style></head><body>${bodyHtml}</body></html>`);
  doc.close();
  f.contentWindow.focus();
  setTimeout(() => {
    f.contentWindow.print();
    setTimeout(() => f.remove(), 60000);
  }, 300);
}

function csvCell(v) {
  let s = String(v);
  if (/^[=+@]|^-[^\d.]/.test(s)) s = "'" + s; // stops spreadsheets running a cell as a formula
  return `"${s.replace(/"/g, '""')}"`;
}

function flashcardsCsv(cards) {
  return "\uFEFF" + cards.map((c) => `${csvCell(c.q)},${csvCell(c.a)}`).join("\r\n");
}

function flashcardsHtml(h) {
  const rows = h.data
    .map((c, i) => `<tr><td>${i + 1}</td><td>${esc(c.q)}</td><td>${esc(c.a)}</td></tr>`)
    .join("");
  return `<h1>${esc(h.title)}</h1><p>Flashcards</p>
    <table border="1" cellspacing="0" cellpadding="8" style="border-collapse:collapse;width:100%">
    <tr><th>#</th><th>Question</th><th>Answer</th></tr>${rows}</table>`;
}

function quizHtml(h) {
  const letters = "ABCDEFGH";
  const qs = h.data
    .map((q, i) => {
      let body;
      if (q.type === "mcq") body = q.options.map((o, k) => `<div class="opt">${letters[k]}. ${esc(o)}</div>`).join("");
      else if (q.type === "tf") body = `<div class="opt">True &nbsp;&nbsp;&nbsp; False</div>`;
      else body = `<div class="opt">Answer: ____________________</div>`;
      return `<div class="q"><b>${i + 1}.</b> ${esc(q.question)}${body}</div>`;
    })
    .join("");
  const key = h.data
    .map((q, i) => `<div class="q"><b>${i + 1}.</b> ${esc(q.answer)}${q.explanation ? " &ndash; " + esc(q.explanation) : ""}</div>`)
    .join("");
  return `<h1>${esc(h.title)}</h1><p>Quiz</p>${qs}<div class="key"><h2>Answer key</h2>${key}</div>`;
}

function notesText(d) {
  let out = "";
  d.sections.forEach((s) => {
    out += s.heading + "\n" + s.points.map((p) => "- " + p).join("\n") + "\n\n";
  });
  if (d.key_terms.length) out += "Key terms\n" + d.key_terms.map((t) => `${t.term}: ${t.meaning}`).join("\n") + "\n";
  return out.trim() + "\n";
}

function notesHtml(h) {
  const secs = h.data.sections
    .map((s) => `<h2>${esc(s.heading)}</h2><ul>${s.points.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>`)
    .join("");
  const terms = h.data.key_terms.length
    ? "<h2>Key terms</h2>" + h.data.key_terms.map((t) => `<p><b>${esc(t.term)}:</b> ${esc(t.meaning)}</p>`).join("")
    : "";
  return `<h1>${esc(h.title)}</h1><p>Study notes</p>${secs}${terms}`;
}

function chatText(msgs) {
  return msgs.map((m) => (m.role === "user" ? "Student: " : "Tutor: ") + m.content).join("\n\n") + "\n";
}

function exportButtons(h) {
  const make = (label, fn) => {
    const b = document.createElement("button");
    b.textContent = label;
    b.addEventListener("click", fn);
    return b;
  };
  const name = safeName(h.title);
  if (h.type === "flashcards") {
    return [
      make("Print/PDF", () => printHtml(h.title, flashcardsHtml(h))),
    ];
  }
  if (h.type === "quiz") {
    return [make("Print/PDF", () => printHtml(h.title, quizHtml(h)))];
  }
  if (h.type === "notes") {
    return [
      make(".txt", () => downloadFile(`${name}-notes.txt`, notesText(h.data), "text/plain;charset=utf-8")),
      make("Print/PDF", () => printHtml(h.title, notesHtml(h))),
    ];
  }
  if (h.type === "ask") {
    return [make(".txt", () => downloadFile(`${name}-chat.txt`, chatText(h.data), "text/plain;charset=utf-8"))];
  }
  return [];
}
// ---- Progress dashboard ----
const dayKey = (d) => new Date(d).toLocaleDateString("en-CA"); // YYYY-MM-DD in the user's own time zone

function lineChart(points) {
  const W = 600, H = 220, L = 36, R = 12, T = 12, B = 28;
  const n = points.length;
  const x = (i) => L + (n === 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (n - 1));
  const y = (v) => T + ((100 - v) * (H - T - B)) / 100;
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.pct).toFixed(1)}`).join(" ");
  const dots = points.map((p, i) =>
    `<circle cx="${x(i).toFixed(1)}" cy="${y(p.pct).toFixed(1)}" r="4" fill="#e11d2e">` +
    `<title>${esc(p.title)}: ${p.pct}% on ${esc(new Date(p.ts).toLocaleDateString())}</title></circle>`).join("");
  const grid = [0, 50, 100].map((v) =>
    `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="#2a2a2a"/>` +
    `<text x="${L - 6}" y="${y(v) + 4}" text-anchor="end" fill="#8a8a8a" font-size="11">${v}%</text>`).join("");
  const first = new Date(points[0].ts).toLocaleDateString();
  const last = new Date(points[n - 1].ts).toLocaleDateString();
  return `<svg viewBox="0 0 ${W} ${H}" class="line-chart">${grid}
    <path d="${path}" fill="none" stroke="#e11d2e" stroke-width="2"/>${dots}
    <text x="${L}" y="${H - 8}" fill="#8a8a8a" font-size="11">${esc(first)}</text>
    <text x="${W - R}" y="${H - 8}" text-anchor="end" fill="#8a8a8a" font-size="11">${esc(last)}</text></svg>`;
}

function masteryDonut(known, learning, fresh) {
  const total = known + learning + fresh;
  const R = 54, C = 2 * Math.PI * R;
  let offset = 0;
  const seg = (n, color) => {
    const len = (C * n) / total;
    const s = `<circle cx="70" cy="70" r="${R}" fill="none" stroke="${color}" stroke-width="16"
      stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-offset}" transform="rotate(-90 70 70)"/>`;
    offset += len;
    return s;
  };
  const pct = Math.round((known / total) * 100);
  return `<svg viewBox="0 0 140 140" class="donut">${seg(known, "#22c55e")}${seg(learning, "#f59e0b")}${seg(fresh, "#3a3a3a")}
    <text x="70" y="68" text-anchor="middle" class="donut-pct">${pct}%</text>
    <text x="70" y="88" text-anchor="middle" class="donut-sub">mastered</text></svg>`;
}

function renderProgress() {
  const box = document.getElementById("progress-box");
  const range = document.getElementById("progress-range").value;
  const items = loadHistory();
  const cutoff = range === "all" ? 0 : Date.now() - Number(range) * 86400000;
  const avgOf = (arr) => Math.round(arr.reduce((s, a) => s + a.pct, 0) / arr.length);

  // every quiz attempt, with the title of its quiz
  const attempts = [];
  items.filter((h) => h.type === "quiz").forEach((h) => {
    (h.attempts || []).forEach((a) => attempts.push({ ...a, title: h.title, ts: new Date(a.date).getTime() }));
  });
  attempts.sort((a, b) => a.ts - b.ts);
  const shown = attempts.filter((a) => a.ts >= cutoff);

  // days with activity: things created plus quiz attempts
  const activity = {};
  const mark = (iso) => { const k = dayKey(iso); activity[k] = (activity[k] || 0) + 1; };
  items.forEach((h) => mark(h.date));
  attempts.forEach((a) => mark(a.date));
  let streak = 0;
  const d = new Date();
  if (!activity[dayKey(d)]) d.setDate(d.getDate() - 1); // no activity yet today does not break the streak
  while (activity[dayKey(d)]) { streak++; d.setDate(d.getDate() - 1); }

  // average score by quiz
  const byQuiz = {};
  shown.forEach((a) => { (byQuiz[a.title] = byQuiz[a.title] || []).push(a); });
  const rows = Object.entries(byQuiz)
    .map(([title, arr]) => ({ title, avg: avgOf(arr), n: arr.length, last: arr[arr.length - 1].ts }))
    .sort((a, b) => b.last - a.last)
    .slice(0, 8);
  const bars = rows.map((r) => `
    <div class="bar-row">
      <span class="bar-label" title="${esc(r.title)}">${esc(r.title)}</span>
      <div class="bar"><div class="bar-fill" style="width:${r.avg}%"></div></div>
      <span class="bar-val">${r.avg}% (${r.n}x)</span>
    </div>`).join("");

  // flashcard mastery across all sets (card marks have no dates, so this ignores the range)
  let known = 0, learning = 0, fresh = 0;
  items.filter((h) => h.type === "flashcards" && Array.isArray(h.data)).forEach((h) => {
    h.data.forEach((c) => { if (c.s === "known") known++; else if (c.s === "learning") learning++; else fresh++; });
  });

  // activity for the last 14 days
  const days = [];
  for (let i = 13; i >= 0; i--) { const dd = new Date(); dd.setDate(dd.getDate() - i); days.push(dayKey(dd)); }
  const maxA = Math.max(...days.map((k) => activity[k] || 0), 1);
  const cols = days.map((k) => `
    <div class="col" title="${esc(k)}: ${activity[k] || 0}">
      <div class="col-bar ok" style="height:${Math.max(4, ((activity[k] || 0) / maxA) * 100)}%"></div>
      <span class="col-label">${esc(k.slice(8))}</span>
    </div>`).join("");

  // written insights
  const insights = [];
  if (shown.length >= 4) {
    const half = Math.floor(shown.length / 2);
    const early = avgOf(shown.slice(0, half)), late = avgOf(shown.slice(half));
    insights.push(late > early
      ? `Your scores are improving: about ${early}% earlier and ${late}% more recently.`
      : late < early
        ? `Your recent scores (${late}%) are lower than your earlier ones (${early}%). Reviewing the cards you find hard may help.`
        : `Your scores are steady at about ${late}%.`);
  } else if (shown.length) {
    insights.push("Take a few more quizzes to see a trend.");
  } else {
    insights.push("No quiz results in this period yet. Open a saved quiz from History and take it to start tracking.");
  }
  if (rows.length > 1) {
    const sorted = rows.slice().sort((a, b) => b.avg - a.avg);
    if (sorted[0].avg !== sorted[sorted.length - 1].avg) {
      insights.push(`Your strongest quiz is "${esc(sorted[0].title)}" (${sorted[0].avg}%) and your weakest is "${esc(sorted[sorted.length - 1].title)}" (${sorted[sorted.length - 1].avg}%).`);
    }
  }
  if (learning > 0) {
    insights.push(`You have ${learning} flashcard${learning === 1 ? "" : "s"} marked "still learning". Try the matching game with only those cards.`);
  }
  if (streak >= 2) insights.push(`You have been active ${streak} days in a row. Keep it going!`);

  box.innerHTML = `
    <div class="report">
      <h3>Your progress</h3>
      <div class="kpis kpis-4">
        <div class="kpi"><b>${shown.length}</b><span>Quiz attempts</span></div>
        <div class="kpi"><b>${shown.length ? avgOf(shown) + "%" : "-"}</b><span>Average score</span></div>
        <div class="kpi"><b>${shown.length ? Math.max(...shown.map((a) => a.pct)) + "%" : "-"}</b><span>Best score</span></div>
        <div class="kpi"><b>${streak}</b><span>Day streak</span></div>
      </div>
      <div class="report-charts">
        <div class="chart"><h4>Quiz scores over time</h4>${shown.length ? lineChart(shown.slice(-30)) : "<p class='empty'>No quiz attempts yet.</p>"}</div>
        <div class="chart"><h4>Average score by quiz</h4>${bars || "<p class='empty'>No quiz attempts yet.</p>"}</div>
        <div class="chart"><h4>Flashcard mastery</h4>${known + learning + fresh
          ? `<div class="mastery">${masteryDonut(known, learning, fresh)}<div class="legend">
              <span><i style="background:#22c55e"></i>Got it: ${known}</span>
              <span><i style="background:#f59e0b"></i>Still learning: ${learning}</span>
              <span><i style="background:#3a3a3a"></i>New: ${fresh}</span></div></div>`
          : "<p class='empty'>No flashcard sets yet.</p>"}</div>
        <div class="chart"><h4>Activity, last 14 days</h4><div class="cols">${cols}</div></div>
      </div>
      <h4>What this means</h4>
      <ul class="insights">${insights.map((s) => `<li>${s}</li>`).join("")}</ul>
    </div>`;
}

document.getElementById("progress-range").addEventListener("change", renderProgress);
