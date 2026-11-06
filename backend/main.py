import time
from datetime import datetime, timezone
from fastapi import Depends, Header
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import json
import requests
import io
from fastapi import File, Form, UploadFile
import random
from typing import Optional
import os
from dotenv import load_dotenv
import logging

log = logging.getLogger("studyapp")

load_dotenv()

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434/api/generate")
MODEL = os.getenv("OLLAMA_MODEL", "llama3.2:1b")
OLLAMA_API_KEY = os.getenv("OLLAMA_API_KEY", "")
HEADERS = {"Authorization": f"Bearer {OLLAMA_API_KEY}"} if OLLAMA_API_KEY else {}
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://127.0.0.1:5500").split(",")
MAX_UPLOAD = 10 * 1024 * 1024  # 10 MB
SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "")
DAILY_LIMIT = int(os.getenv("DAILY_LIMIT", "20"))
REQUIRE_LOGIN = os.getenv("REQUIRE_LOGIN", "true").lower() != "false"

class StudyRequest(BaseModel):
    text: str
    count: int = 5

app = FastAPI(title="Study App API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health():
    return {"status": "ok"}

SCHEMA = {
    "type": "object",
    "properties": {
        "cards": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"q": {"type": "string"}, "a": {"type": "string"}},
                "required": ["q", "a"],
            },
        }
    },
    "required": ["cards"],
}

THINK = "low" if MODEL.startswith("gpt-oss") else False

def parse_json(text):
    try:
        return json.loads(text)
    except ValueError:
        start, end = text.find("{"), text.rfind("}")  # strip code fences or extra text
        if start != -1 and end > start:
            try:
                return json.loads(text[start:end + 1])
            except ValueError:
                pass
    raise RuntimeError("The AI returned an unreadable answer. Please try again.")

def call_model(prompt, schema):
    prompt += (
        "\n\nReply with ONLY a JSON object that follows this JSON schema. "
        "No markdown, no code fences, no other text.\nSCHEMA: " + json.dumps(schema)
    )
    body = {
        "model": MODEL,
        "prompt": prompt,
        "stream": False,
        "format": schema,
        "options": {"temperature": 0.3, "num_ctx": 4096},
    }
    if OLLAMA_API_KEY:  # hosted models: limit how long the model "thinks"
        body["think"] = THINK

    last_error = None
    for attempt in range(2):  # one retry if the answer is unreadable
        try:
            r = requests.post(OLLAMA_URL, headers=HEADERS, json=body, timeout=300)
            if r.status_code == 400 and "think" in r.text.lower():
                body.pop("think", None)  # this model does not support the option
                r = requests.post(OLLAMA_URL, headers=HEADERS, json=body, timeout=300)
        except requests.exceptions.RequestException:
            raise RuntimeError("The AI service is unreachable right now. Please try again.")
        if r.status_code == 401:
            raise RuntimeError("The AI service rejected the API key. Check OLLAMA_API_KEY.")
        if r.status_code == 402:
            raise RuntimeError("The AI service has run out of credits.")
        if r.status_code == 429:
            raise RuntimeError("The AI service is busy. Please wait a moment and try again.")
        r.raise_for_status()
        try:
            return parse_json(r.json().get("response", ""))
        except RuntimeError as e:
            last_error = e
    raise last_error

def ask_ollama(text, n, avoid):
    prompt = (
        f"You are a study assistant. Write {n} flashcards from the material below.\n"
        "Rules:\n"
        "- Each question tests one idea and ends with a question mark.\n"
        "- Each answer is one short, complete sentence in your own words (max 25 words).\n"
        "- Do not copy long passages. Do not number the cards.\n"
        + (f"- Do not reuse these questions: {avoid}\n" if avoid else "")
        + f"\nMATERIAL:\n{text[:8000]}"
    )
    return call_model(prompt, SCHEMA).get("cards", [])
    
def extract_text(filename: str, data: bytes) -> str:
    name = filename.lower()
    if name.endswith(".pdf"):
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(data))
        return "\n".join(page.extract_text() or "" for page in reader.pages)
    if name.endswith(".docx"):
        from docx import Document
        doc = Document(io.BytesIO(data))
        return "\n".join(p.text for p in doc.paragraphs)
    if name.endswith((".txt", ".md")):
        return data.decode("utf-8", errors="ignore")
    raise ValueError("Unsupported file type. Use PDF, DOCX or TXT.")

def make_cards(text, count):
    # Split long documents into chunks so cards cover the whole file, not just page 1
    count = max(1, min(count, 20))
    size = 6000
    chunks = [text[i:i + size] for i in range(0, len(text), size)] or [text]
    if len(chunks) > 6:  # cap the number of model calls, pick evenly spaced chunks
        step = len(chunks) / 6
        chunks = [chunks[int(i * step)] for i in range(6)]
    per = -(-count // len(chunks))  # cards per chunk, rounded up

    cards, seen = [], set()
    for _ in range(3):  # extra rounds top up if the model returns too few
        for chunk in chunks:
            need = count - len(cards)
            if need <= 0:
                return cards
            for c in ask_ollama(chunk, min(per, need), [x["q"] for x in cards]):
                q = str(c.get("q", "")).strip()
                a = str(c.get("a", "")).strip()
                if q and a and q.lower() not in seen:
                    seen.add(q.lower())
                    cards.append({"q": q, "a": a})
    return cards[:count]

def read_upload(file: UploadFile) -> str:
    data = file.file.read(MAX_UPLOAD + 1)
    if len(data) > MAX_UPLOAD:
        raise ValueError("File too large (max 10 MB).")
    return extract_text(file.filename, data)

_token_cache = {}  # token -> (user_id, expires_at); avoids asking Supabase on every request

def current_user(authorization: Optional[str] = Header(None)):
    if not REQUIRE_LOGIN:
        return {"id": "dev", "token": None}
    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        raise HTTPException(status_code=500, detail="Login is not configured on the server.")
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Please sign in to continue.")
    token = authorization.split(" ", 1)[1].strip()

    hit = _token_cache.get(token)
    if hit and hit[1] > time.time():
        return {"id": hit[0], "token": token}
    try:
        r = requests.get(
            f"{SUPABASE_URL}/auth/v1/user",
            headers={"apikey": SUPABASE_ANON_KEY, "Authorization": f"Bearer {token}"},
            timeout=10,
        )
    except requests.exceptions.RequestException:
        raise HTTPException(status_code=503, detail="Could not verify your login. Please try again.")
    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="Your session has expired. Please sign in again.")
    if len(_token_cache) > 1000:
        _token_cache.clear()
    uid = r.json().get("id")
    _token_cache[token] = (uid, time.time() + 60)
    return {"id": uid, "token": token}

def check_and_count(user, kind):
    if not user["token"]:
        return  # login switched off for local testing
    base = {"apikey": SUPABASE_ANON_KEY, "Authorization": f"Bearer {user['token']}"}
    start = datetime.now(timezone.utc).strftime("%Y-%m-%dT00:00:00Z")
    try:
        r = requests.get(f"{SUPABASE_URL}/rest/v1/usage", headers=base, timeout=10,
                         params={"select": "id", "created_at": f"gte.{start}"})
        r.raise_for_status()
        if len(r.json()) >= DAILY_LIMIT:
            raise HTTPException(
                status_code=429,
                detail=f"Daily limit reached ({DAILY_LIMIT} generations). Please try again tomorrow.",
            )
        requests.post(f"{SUPABASE_URL}/rest/v1/usage",
                      headers={**base, "Content-Type": "application/json", "Prefer": "return=minimal"},
                      json={"kind": kind}, timeout=10).raise_for_status()
    except HTTPException:
        raise
    except requests.exceptions.RequestException:
        raise HTTPException(status_code=503, detail="Could not check your daily limit. Please try again.")

def server_error(e):
    if isinstance(e, RuntimeError):  # our own friendly messages, such as "AI service is busy"
        return HTTPException(status_code=502, detail=str(e))
    log.exception("Unexpected error")  # the real details go to the server log only
    return HTTPException(status_code=500, detail="Something went wrong on our side. Please try again.")

@app.post("/flashcards")
def flashcards(req: StudyRequest, user: dict = Depends(current_user)):
    check_and_count(user, "flashcards")
    try:
        return {"cards": make_cards(req.text, req.count)}
    except Exception as e:
        raise server_error(e)

@app.post("/flashcards/upload")
def flashcards_upload(file: UploadFile = File(...), count: int = Form(5), user: dict = Depends(current_user)):
    check_and_count(user, "flashcards")
    try:
        text = read_upload(file).strip()
        if not text:
            raise ValueError("No readable text found. Scanned PDFs need OCR.")
        return {"cards": make_cards(text, count)}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    
#Quiz setup
QUIZ_SCHEMA = {
    "type": "object",
    "properties": {
        "questions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "question": {"type": "string"},
                    "options": {"type": "array", "items": {"type": "string"}},
                    "answer": {"type": "string"},
                    "explanation": {"type": "string"},
                },
                "required": ["question", "options", "answer", "explanation"],
            },
        }
    },
    "required": ["questions"],
}

TYPE_RULES = {
    "mcq": "Multiple choice. Give exactly 4 options in 'options'. 'answer' must be copied exactly from one of the options.",
    "tf": "True/false statements. 'question' is a statement. 'options' must be [\"True\", \"False\"]. 'answer' is \"True\" or \"False\".",
    "fill": "Fill in the blank. 'question' is a sentence with the missing key term replaced by _____. 'options' must be an empty list. 'answer' is the missing word or short phrase.",
}

def ask_quiz(text, qtype, n, avoid):
    prompt = (
        f"You are a study assistant. Write {n} quiz questions from the material below.\n"
        f"Question type: {TYPE_RULES[qtype]}\n"
        "Keep questions short and based only on the material. 'explanation' is one short sentence.\n"
        + (f"Do not reuse these questions: {avoid}\n" if avoid else "")
        + f"\nMATERIAL:\n{text[:8000]}"
    )
    return call_model(prompt, QUIZ_SCHEMA).get("questions", [])

def clean_question(q, qtype):
    question = str(q.get("question", "")).strip()
    answer = str(q.get("answer", "")).strip()
    explanation = str(q.get("explanation", "")).strip()
    options = [str(o).strip() for o in q.get("options", []) if str(o).strip()]
    if not question or not answer:
        return None
    if qtype == "mcq":
        match = next((o for o in options if o.lower() == answer.lower()), None)
        if len(options) < 3 or match is None:
            return None  # drop broken questions from the small model
        answer = match
        random.shuffle(options)
    elif qtype == "tf":
        answer = answer.capitalize()
        if answer not in ("True", "False"):
            return None
        options = ["True", "False"]
    else:  # fill
        options = []
    return {"type": qtype, "question": question, "options": options,
            "answer": answer, "explanation": explanation}

def make_quiz(text, count, types):
    count = max(1, min(count, 20))
    size = 6000
    chunks = [text[i:i + size] for i in range(0, len(text), size)] or [text]
    base, extra = divmod(count, len(types))
    targets = {t: base + (1 if i < extra else 0) for i, t in enumerate(types)}

    questions, seen = [], set()
    for t in types:
        got = 0
        for _ in range(3):  # a few attempts per type
            if got >= targets[t]:
                break
            chunk = random.choice(chunks)
            for raw in ask_quiz(chunk, t, targets[t] - got, [x["question"] for x in questions]):
                item = clean_question(raw, t)
                if item and item["question"].lower() not in seen:
                    seen.add(item["question"].lower())
                    questions.append(item)
                    got += 1
                    if got >= targets[t]:
                        break
    random.shuffle(questions)
    return questions

@app.post("/quiz")
def quiz(
    count: int = Form(5),
    types: str = Form("mcq"),
    text: str = Form(""),
    file: Optional[UploadFile] = File(None),
    user: dict = Depends(current_user),
):
    check_and_count(user, "quiz")
    try:
        if file is not None and file.filename:
            text = read_upload(file)
        text = text.strip()
        if not text:
            raise ValueError("Add some material first (paste text or upload a file).")
        chosen = [t for t in types.split(",") if t in TYPE_RULES]
        if not chosen:
            raise ValueError("Pick at least one question type.")
        return {"questions": make_quiz(text, count, chosen)}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

NOTES_SCHEMA = {
    "type": "object",
    "properties": {
        "heading": {"type": "string"},
        "points": {"type": "array", "items": {"type": "string"}},
        "key_terms": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"term": {"type": "string"}, "meaning": {"type": "string"}},
                "required": ["term", "meaning"],
            },
        },
    },
    "required": ["heading", "points", "key_terms"],
}

LEVELS = {"brief": 3, "standard": 5, "detailed": 8}

def ask_notes(text, level):
    n = LEVELS[level]
    prompt = (
        "You are a study assistant. Write study notes for the material below.\n"
        "Rules:\n"
        "- 'heading': a short title for this part (max 8 words).\n"
        f"- 'points': about {n} bullet points, each one short sentence in your own words, "
        "covering the most important ideas.\n"
        "- 'key_terms': up to 4 important terms, each with a short meaning.\n"
        "- Use only the material. Do not copy long passages.\n"
        f"\nMATERIAL:\n{text[:8000]}"
    )
    return call_model(prompt, NOTES_SCHEMA)
    
def make_notes(text, level):
    size = 6000
    chunks = [text[i:i + size] for i in range(0, len(text), size)] or [text]
    if len(chunks) > 8:  # cap model calls, keep evenly spaced chunks in order
        step = len(chunks) / 8
        chunks = [chunks[int(i * step)] for i in range(8)]

    sections, terms, seen = [], [], set()
    for chunk in chunks:
        data = ask_notes(chunk, level)
        points = [str(p).strip() for p in data.get("points", []) if str(p).strip()]
        if points:
            heading = str(data.get("heading", "")).strip() or "Notes"
            sections.append({"heading": heading, "points": points})
        for t in data.get("key_terms", []):
            term = str(t.get("term", "")).strip()
            meaning = str(t.get("meaning", "")).strip()
            if term and meaning and term.lower() not in seen:
                seen.add(term.lower())
                terms.append({"term": term, "meaning": meaning})
    return {"sections": sections, "key_terms": terms}

@app.post("/notes")
def notes(
    level: str = Form("standard"),
    text: str = Form(""),
    file: Optional[UploadFile] = File(None),
    user: dict = Depends(current_user),
):
    check_and_count(user, "notes")
    try:
        if file is not None and file.filename:
            text = read_upload(file)
        text = text.strip()
        if not text:
            raise ValueError("Add some material first (paste text or upload a file).")
        if level not in LEVELS:
            level = "standard"
        return make_notes(text, level)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))