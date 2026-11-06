// History: a fast local copy that is also saved to the user's account in the background.
const LEGACY_KEY = "studyapp_history_v1";
let historyUserId = null; // set when someone signs in

function historyKey() {
  return historyUserId ? `${LEGACY_KEY}_${historyUserId}` : LEGACY_KEY;
}

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(historyKey())) || [];
  } catch {
    return [];
  }
}

function saveHistory(list) {
  try {
    localStorage.setItem(historyKey(), JSON.stringify(list));
    return true;
  } catch {
    return false; // storage full or blocked
  }
}

function toRow(item) {
  return {
    user_id: historyUserId,
    id: item.id,
    type: item.type,
    title: item.title || "",
    data: item.data,
    attempts: item.attempts || [],
    created_at: item.date,
    updated_at: new Date().toISOString(),
  };
}

function fromRow(r) {
  return { id: r.id, type: r.type, title: r.title, data: r.data, attempts: r.attempts || [], date: r.created_at };
}

function cloudSave(item) {
  if (!historyUserId) return;
  sb.from("history")
    .upsert(toRow(item), { onConflict: "user_id,id" })
    .then(({ error }) => { if (error) console.warn("History sync failed:", error.message); });
}

function addHistory(item) {
  const list = loadHistory();
  const entry = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    date: new Date().toISOString(),
    ...item,
  };
  list.unshift(entry);
  saveHistory(list.slice(0, 200)); // keep the newest 200
  cloudSave(entry);
  return entry.id;
}

function updateHistory(id, change) {
  const list = loadHistory();
  const item = list.find((x) => x.id === id);
  if (item) {
    change(item);
    saveHistory(list);
    cloudSave(item);
  }
}

function deleteHistory(id) {
  saveHistory(loadHistory().filter((x) => x.id !== id));
  if (historyUserId) {
    sb.from("history").delete().eq("user_id", historyUserId).eq("id", id)
      .then(({ error }) => { if (error) console.warn("History delete failed:", error.message); });
  }
}

function clearHistory() {
  saveHistory([]);
  if (historyUserId) {
    sb.from("history").delete().eq("user_id", historyUserId)
      .then(({ error }) => { if (error) console.warn("History delete failed:", error.message); });
  }
}

function makeTitle(text, file) {
  if (file) return file.name;
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > 60 ? t.slice(0, 60) + "..." : t;
}

// Called when someone signs in: load their history from the account.
async function startHistory(userId) {
  historyUserId = userId;

  // history saved on this browser before accounts existed
  let legacy = [];
  try {
    legacy = JSON.parse(localStorage.getItem(LEGACY_KEY)) || [];
  } catch {}

  const { data, error } = await sb
    .from("history").select("*").order("created_at", { ascending: false }).limit(200);
  if (error) {
    console.warn("History sync failed:", error.message);
    return; // keep whatever is stored locally
  }

  const cloud = data.map(fromRow);
  const have = new Set(cloud.map((x) => x.id));
  const migrated = legacy.filter((x) => !have.has(x.id));
  migrated.forEach(cloudSave); // move old local history into the account, once
  if (legacy.length) localStorage.removeItem(LEGACY_KEY);

  const merged = cloud.concat(migrated).sort((a, b) => new Date(b.date) - new Date(a.date));
  saveHistory(merged.slice(0, 200));

  const panel = document.getElementById("tab-history");
  if (panel && !panel.hidden) renderHistory();
}

// Called when someone signs out: remove their local copy so the next person cannot see it.
function stopHistory() {
  if (historyUserId) {
    try { localStorage.removeItem(historyKey()); } catch {}
  }
  historyUserId = null;
}