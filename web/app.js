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
  const labels = { flashcards: "Flashcards", quiz: "Quiz", notes: "Notes" };
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
    actions.append(open, del);

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

// refresh the list when the History tab opens, and hide the material box there
document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    const isHistory = btn.dataset.tab === "history";
    document.querySelector(".composer").hidden = isHistory;
    if (isHistory) renderHistory();
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
