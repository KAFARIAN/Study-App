const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const authBox = document.getElementById("auth");
const authMsg = document.getElementById("auth-msg");

function showMsg(text, ok) {
  authMsg.textContent = text;
  authMsg.className = "auth-msg" + (ok ? " ok" : "");
}

let lastUserId = null;

function applySession(session) {
  const signedIn = !!session;
  authBox.hidden = signedIn;
  document.getElementById("account").hidden = !signedIn;
  document.getElementById("account-email").textContent = signedIn ? session.user.email : "";

  const uid = signedIn ? session.user.id : null;
  if (uid === lastUserId) return; // token refreshes also land here; nothing more to do
  lastUserId = uid;
  if (uid) {
    startHistory(uid);
  } else {
    stopHistory();
    ["cards", "quiz", "notes", "history-list"].forEach((id) => {
      document.getElementById(id).innerHTML = "";
    });
    askReset(); // clear the chat and any cached file text
    gameReset();
  }
}

// used in part 2, to prove to the backend who is asking
async function getToken() {
  const { data } = await sb.auth.getSession();
  return data.session ? data.session.access_token : null;
}

sb.auth.getSession().then(({ data }) => applySession(data.session));
sb.auth.onAuthStateChange((_event, session) => applySession(session));

function credentials() {
  const email = document.getElementById("auth-email").value.trim();
  const password = document.getElementById("auth-password").value;
  if (!email || !password) {
    showMsg("Enter your email and password.");
    return null;
  }
  return { email, password };
}

async function signIn() {
  const c = credentials();
  if (!c) return;
  showMsg("Signing in...", true);
  const { error } = await sb.auth.signInWithPassword(c);
  showMsg(error ? error.message : "", false);
}

document.getElementById("auth-signin").addEventListener("click", signIn);
document.getElementById("auth-password").addEventListener("keydown", (e) => {
  if (e.key === "Enter") signIn();
});

document.getElementById("auth-signup").addEventListener("click", async () => {
  const c = credentials();
  if (!c) return;
  showMsg("Creating account...", true);
  const { data, error } = await sb.auth.signUp(c);
  if (error) return showMsg(error.message);
  if (data.session) showMsg("", true); // signed in straight away
  else showMsg("Account created. Check your email for the confirmation link, then sign in.", true);
});

document.getElementById("signout").addEventListener("click", () => sb.auth.signOut());
