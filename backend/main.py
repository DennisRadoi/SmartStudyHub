import hashlib
import os
import re
import secrets
import sqlite3
import time
import uuid
from contextlib import asynccontextmanager
from typing import Optional

import chromadb
import ollama
import requests
from chromadb.utils.embedding_functions import OllamaEmbeddingFunction
from fastapi import FastAPI, File, Header, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from pypdf import PdfReader

# Configurations
MAX_FILE_SIZE_MB = 20
MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024
DB_DIR = "./local_db"
UPLOADS_DIR = "uploads"
EMBEDDING_MODEL = "nomic-embed-text"
GENERATION_MODEL = "mistral"  # For summarization
CHAT_MODEL = "qwen2.5"           # Agent A (Tutor)
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
DEVELOPER_SIGNUP_CODE = "dev2026"  # Code for developer role signup

# Ensure upload directory exists
os.makedirs(UPLOADS_DIR, exist_ok=True)
os.makedirs(DB_DIR, exist_ok=True)

def check_and_pull_ollama_model():
    """Verify Ollama is running and download the model if needed."""
    try:
        response = requests.get(f"{OLLAMA_URL}/api/tags", timeout=3)
        if response.status_code != 200:
            raise Exception("Ollama is running but returned an error.")
            
        models_data = response.json().get("models", [])
        installed_models = [m.get("name") for m in models_data]
        
        for model in [EMBEDDING_MODEL, GENERATION_MODEL, CHAT_MODEL]:
            if not any(model in m for m in installed_models):
                print(f"Downloading model {model} (this may take a minute)...")
                pull_response = requests.post(f"{OLLAMA_URL}/api/pull", json={"name": model}, stream=False)
                if pull_response.status_code == 200:
                    print(f"Model {model} downloaded successfully!")
                else:
                    raise Exception(f"Error downloading model: {pull_response.text}")
                
    except requests.exceptions.ConnectionError:
        raise Exception("Ollama is not running. Please install and start Ollama.")

def strip_markdown_formatting(text: str) -> str:
    """Convert a model response to readable plain text."""
    text = re.sub(r"```(?:\w+)?\n?(.*?)```", r"\1", text, flags=re.DOTALL)
    text = re.sub(r"^\s{0,3}#{1,6}\s*", "", text, flags=re.MULTILINE)
    text = re.sub(r"^\s{0,3}>\s?", "", text, flags=re.MULTILINE)
    text = re.sub(r"^\s*[-*+]\s+", "", text, flags=re.MULTILINE)
    text = re.sub(r"^\s*\d+[\.)]\s+", "", text, flags=re.MULTILINE)
    text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)
    text = re.sub(r"[*_`~]+", "", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()

# Initialize Vector DB
def get_db_connection():
    conn = sqlite3.connect("auth.db")
    conn.row_factory = sqlite3.Row
    return conn

def get_db_collection():
    client = chromadb.PersistentClient(path=DB_DIR)
    ollama_ef = OllamaEmbeddingFunction(
        url=f"{OLLAMA_URL}/api/embeddings",
        model_name=EMBEDDING_MODEL,
    )
    return client.get_or_create_collection(
        name="cursuri_studenti",
        embedding_function=ollama_ef
    )

def create_access_token(user_id: str) -> str:
    token = secrets.token_urlsafe(32)
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, user_id, time.time()),
    )
    conn.commit()
    conn.close()
    return token

def get_user_by_token(token: str) -> dict:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT u.id, u.username, u.email, u.role FROM tokens t JOIN users u ON t.user_id = u.id WHERE t.token = ?",
        (token,),
    )
    row = cursor.fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=401, detail="Invalid or expired token.")
    return {"id": row["id"], "username": row["username"], "email": row["email"], "role": row["role"]}

def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 100_000)
    return f"{salt}${digest.hex()}"

def verify_password(password: str, password_hash: str) -> bool:
    if "$" not in password_hash:
        return False
    salt, digest = password_hash.split("$", 1)
    calculated = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 100_000).hex()
    return secrets.compare_digest(calculated, digest)

def authenticate_user(username: str, password: str) -> dict:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE username = ?", (username,))
    row = cursor.fetchone()
    conn.close()
    if not row or not verify_password(password, row["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid username or password.")
    return {"id": row["id"], "username": row["username"], "email": row["email"], "role": row["role"]}

def create_user(username: str, email: str, password: str, role: str = "student") -> dict:
    user_id = uuid.uuid4().hex
    password_hash = hash_password(password)
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "INSERT INTO users (id, username, email, password_hash, role) VALUES (?, ?, ?, ?, ?)",
            (user_id, username, email, password_hash, role),
        )
        conn.commit()
    except sqlite3.IntegrityError as exc:
        conn.close()
        message = str(exc).lower()
        if "username" in message:
            raise HTTPException(status_code=400, detail="Username already exists.")
        if "email" in message:
            raise HTTPException(status_code=400, detail="Email already exists.")
        raise HTTPException(status_code=400, detail="Unable to create user.")
    conn.close()
    return {"id": user_id, "username": username, "email": email, "role": role}

SKIP_OLLAMA_INIT = os.getenv("SMART_STUDY_HUB_SKIP_OLLAMA", "").lower() in {"1", "true", "yes"}
collection = None
if not SKIP_OLLAMA_INIT:
    collection = get_db_collection()

def init_auth_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL
        )
        """
    )
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS tokens (
            token TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            created_at REAL NOT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
        """
    )
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS documents (
            id TEXT PRIMARY KEY,
            owner_id TEXT NOT NULL,
            filename TEXT NOT NULL,
            source TEXT NOT NULL,
            file_path TEXT NOT NULL,
            course_id TEXT,
            uploaded_at REAL NOT NULL,
            FOREIGN KEY(owner_id) REFERENCES users(id),
            FOREIGN KEY(course_id) REFERENCES courses(id)
        )
        """
    )
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS courses (
            id TEXT PRIMARY KEY,
            owner_id TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            created_at REAL NOT NULL,
            FOREIGN KEY(owner_id) REFERENCES users(id)
        )
        """
    )
    cursor.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_owner_filename ON documents(owner_id, filename)"
    )
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS chat_history (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            filename TEXT,
            message TEXT NOT NULL,
            response TEXT NOT NULL,
            created_at REAL NOT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
        """
    )
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS quiz_attempts (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            filename TEXT NOT NULL,
            score INTEGER NOT NULL,
            total_questions INTEGER NOT NULL,
            created_at REAL NOT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
        """
    )
    conn.commit()
    conn.close()

# Ensure auth database exists
init_auth_db()

def save_document_record(owner_id: str, filename: str, source: str, file_path: str) -> None:
    conn = get_db_connection()
    cursor = conn.cursor()
    document_id = uuid.uuid4().hex
    cursor.execute(
        "INSERT OR REPLACE INTO documents (id, owner_id, filename, source, file_path, uploaded_at) VALUES (?, ?, ?, ?, ?, ?)",
        (document_id, owner_id, filename, source, file_path, time.time()),
    )
    conn.commit()
    conn.close()

# ─────────────────────────────────────────────
# NEW HELPER: get all filenames for a course
# ─────────────────────────────────────────────
def get_course_filenames(course_id: str, user: dict) -> list:
    """Return list of filenames belonging to a course, respecting user permissions."""
    conn = get_db_connection()
    cursor = conn.cursor()
    if user["role"] == "developer":
        cursor.execute(
            "SELECT filename FROM documents WHERE course_id = ?",
            (course_id,)
        )
    else:
        cursor.execute(
            "SELECT filename FROM documents WHERE course_id = ? AND owner_id = ?",
            (course_id, user["id"])
        )
    filenames = [row["filename"] for row in cursor.fetchall()]
    conn.close()
    return filenames


def get_chroma_docs_for_filenames(filenames: list) -> dict:
    """Fetch all ChromaDB documents for a list of filenames."""
    if not filenames:
        return {"documents": [], "metadatas": []}
    if len(filenames) == 1:
        return collection.get(
            where={"source": filenames[0]},
            include=["documents", "metadatas"]
        )
    return collection.get(
        where={"source": {"$in": filenames}},
        include=["documents", "metadatas"]
    )


class SignupRequest(BaseModel):
    username: str
    email: str
    password: str
    developer_code: Optional[str] = None

class LoginRequest(BaseModel):
    username: str
    password: str

class ChatRequest(BaseModel):
    message: str
    filename: Optional[str] = None
    course_id: Optional[str] = None          # ← NEW: query entire course
    use_gemini: bool = False
    gemini_api_key: Optional[str] = None
    gemini_model: Optional[str] = None
    local_model: Optional[str] = None

class QuizAttemptRequest(BaseModel):
    filename: str
    score: int
    total_questions: int


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield

app = FastAPI(title="Smart Study Hub API", lifespan=lifespan)

# --- Courses API Models ---
class CourseCreateRequest(BaseModel):
    title: str
    description: Optional[str] = None


# ─────────────────────────────────────────────
# COURSES ENDPOINTS
# ─────────────────────────────────────────────
@app.post("/api/courses")
async def create_course(payload: CourseCreateRequest, authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header.")
    token = authorization.split(" ", 1)[1].strip()
    user = get_user_by_token(token)

    course_id = uuid.uuid4().hex
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO courses (id, owner_id, title, description, created_at) VALUES (?, ?, ?, ?, ?)",
        (course_id, user["id"], payload.title, payload.description, time.time())
    )
    conn.commit()
    conn.close()
    return {"id": course_id, "title": payload.title, "description": payload.description}


@app.get("/api/courses")
async def list_courses(authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header.")
    token = authorization.split(" ", 1)[1].strip()
    user = get_user_by_token(token)

    conn = get_db_connection()
    cursor = conn.cursor()
    if user["role"] == "developer":
        cursor.execute("SELECT * FROM courses ORDER BY created_at DESC")
    else:
        cursor.execute("SELECT * FROM courses WHERE owner_id = ? ORDER BY created_at DESC", (user["id"],))
    courses = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return {"courses": courses}


@app.delete("/api/courses/{course_id}")
async def delete_course(course_id: str, authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header.")
    token = authorization.split(" ", 1)[1].strip()
    user = get_user_by_token(token)

    conn = get_db_connection()
    cursor = conn.cursor()
    if user["role"] == "developer":
        cursor.execute("DELETE FROM courses WHERE id = ?", (course_id,))
    else:
        cursor.execute("DELETE FROM courses WHERE id = ? AND owner_id = ?", (course_id, user["id"]))
    conn.commit()
    conn.close()
    return {"message": "Course deleted"}


# ─────────────────────────────────────────────
# NEW: List documents for a specific course
# ─────────────────────────────────────────────
@app.get("/api/courses/{course_id}/documents")
async def get_course_documents(course_id: str, authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header.")
    token = authorization.split(" ", 1)[1].strip()
    user = get_user_by_token(token)

    conn = get_db_connection()
    cursor = conn.cursor()
    if user["role"] == "developer":
        cursor.execute(
            "SELECT d.filename, d.file_path, d.uploaded_at FROM documents d WHERE d.course_id = ? ORDER BY d.uploaded_at ASC",
            (course_id,)
        )
    else:
        cursor.execute(
            "SELECT d.filename, d.file_path, d.uploaded_at FROM documents d WHERE d.course_id = ? AND d.owner_id = ? ORDER BY d.uploaded_at ASC",
            (course_id, user["id"])
        )
    docs = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return {"documents": docs, "course_id": course_id, "count": len(docs)}


# Allow requests from our Node.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files for PDF access
app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")

@app.get("/api/config")
async def get_config():
    return {"chat_model": CHAT_MODEL, "generation_model": GENERATION_MODEL}

class OllamaPullRequest(BaseModel):
    name: str

@app.get("/api/ollama/models")
async def list_ollama_models(authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header.")
    token = authorization.split(" ", 1)[1].strip()
    get_user_by_token(token)
    try:
        response = requests.get(f"{OLLAMA_URL}/api/tags", timeout=5)
        if response.status_code != 200:
            raise HTTPException(status_code=502, detail=f"Ollama error: {response.text}")
        models_data = response.json().get("models", [])
        models = [m.get("name") for m in models_data if m.get("name")]
        return {"models": models}
    except requests.exceptions.ConnectionError:
        raise HTTPException(status_code=503, detail="Ollama is not running.")

@app.post("/api/ollama/pull")
async def pull_ollama_model(payload: OllamaPullRequest, authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header.")
    token = authorization.split(" ", 1)[1].strip()
    get_user_by_token(token)
    if not payload.name.strip():
        raise HTTPException(status_code=400, detail="Model name is required.")

    def generate():
        import json
        try:
            with requests.post(
                f"{OLLAMA_URL}/api/pull",
                json={"name": payload.name.strip()},
                stream=True,
                timeout=60,
            ) as resp:
                if resp.status_code != 200:
                    yield json.dumps({"type": "error", "message": resp.text}) + "\n"
                    return
                for line in resp.iter_lines():
                    if not line:
                        continue
                    try:
                        data = json.loads(line.decode("utf-8"))
                        payload_out = {
                            "type": "progress",
                            "status": data.get("status"),
                            "completed": data.get("completed"),
                            "total": data.get("total"),
                        }
                        yield json.dumps(payload_out) + "\n"
                    except Exception:
                        continue
                yield json.dumps({"type": "done"}) + "\n"
        except requests.exceptions.ConnectionError:
            yield json.dumps({"type": "error", "message": "Ollama is not running."}) + "\n"

    return StreamingResponse(generate(), media_type="application/x-ndjson")

@app.post("/api/signup")
async def signup(payload: SignupRequest):
    role = "student"
    if payload.developer_code and payload.developer_code == DEVELOPER_SIGNUP_CODE:
        role = "developer"
    user = create_user(payload.username, payload.email, payload.password, role)
    token = create_access_token(user["id"])
    return {"token": token, "user": user}

@app.post("/api/login")
async def login(payload: LoginRequest):
    user = authenticate_user(payload.username, payload.password)
    token = create_access_token(user["id"])
    return {"token": token, "user": user}

@app.get("/api/logout")
async def logout(authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header.")
    token = authorization.split(" ", 1)[1].strip()
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM tokens WHERE token = ?", (token,))
    conn.commit()
    conn.close()
    return {"message": "Logged out successfully."}

@app.get("/api/me")
async def me(authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header.")
    token = authorization.split(" ", 1)[1].strip()
    user = get_user_by_token(token)
    return {"user": user}

@app.get("/api/admin/users")
async def admin_users(authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header.")
    token = authorization.split(" ", 1)[1].strip()
    user = get_user_by_token(token)
    if user["role"] != "developer":
        raise HTTPException(status_code=403, detail="Developer access required.")
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, username, email, role FROM users ORDER BY username")
    users = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return {"users": users}

@app.get("/api/chat/history")
async def get_chat_history(authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header.")
    token = authorization.split(" ", 1)[1].strip()
    user = get_user_by_token(token)
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id, filename, message, response, created_at FROM chat_history WHERE user_id = ? ORDER BY created_at ASC",
        (user["id"],)
    )
    history = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return {"history": history}

@app.post("/api/upload")
async def upload_document(file: UploadFile = File(...), course_id: Optional[str] = None, authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header.")
    token = authorization.split(" ", 1)[1].strip()
    user = get_user_by_token(token)
    
    try:
        check_and_pull_ollama_model()
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Ollama service unavailable: {str(e)}")
    
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only PDF files are supported.")

    file_bytes = await file.read()
    if len(file_bytes) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"File exceeds maximum size limit of {MAX_FILE_SIZE_MB}MB.")
    await file.seek(0)
    
    owner_id = user["id"]
    safe_filename = f"{owner_id}_{file.filename}"
    file_path = os.path.join(UPLOADS_DIR, safe_filename)
    with open(file_path, "wb") as buffer:
        buffer.write(file_bytes)
        
    try:
        pdf_reader = PdfReader(file_path)
        documents = []
        metadatas = []
        ids = []

        for i, page in enumerate(pdf_reader.pages):
            text = page.extract_text()
            if text and text.strip():
                documents.append(text.strip())
                metadatas.append({
                    "source": file.filename,
                    "owner_id": owner_id,
                    "filename": file.filename,
                    "page": i + 1,
                    "file_path": file_path
                })
                ids.append(f"{owner_id}_{file.filename}_page_{i+1}")
                
        if documents:
            collection.upsert(documents=documents, metadatas=metadatas, ids=ids)
            save_document_record(owner_id, file.filename, file.filename, file_path)
            if course_id:
                conn = get_db_connection()
                cursor = conn.cursor()
                cursor.execute(
                    "UPDATE documents SET course_id = ? WHERE owner_id = ? AND filename = ?",
                    (course_id, owner_id, file.filename)
                )
                conn.commit()
                conn.close()
            return {"message": "✅ Success! Document processed and saved.", "filename": file.filename, "pages": len(documents)}
        else:
            return {"message": "⚠️ Document uploaded, but no text could be extracted (might be scanned/image).", "filename": file.filename, "pages": 0}

    except Exception as e:
        if os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(status_code=500, detail=f"Error processing document: {str(e)}")

@app.get("/api/documents")
async def list_documents(authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header.")
    token = authorization.split(" ", 1)[1].strip()
    user = get_user_by_token(token)
    
    db_data = collection.get(include=["metadatas"])
    
    conn = get_db_connection()
    cursor = conn.cursor()
    if user["role"] == "developer":
        cursor.execute("SELECT filename, file_path, course_id FROM documents ORDER BY uploaded_at DESC")
    else:
        cursor.execute("SELECT filename, file_path, course_id FROM documents WHERE owner_id = ? ORDER BY uploaded_at DESC", (user["id"],))
    db_files = {row["filename"]: {"file_path": row["file_path"], "course_id": row["course_id"]} for row in cursor.fetchall()}
    conn.close()
    
    if not db_data or not db_data["metadatas"]:
        return {"documents": []}
        
    unique_sources = {}
    for meta in db_data["metadatas"]:
        source = meta.get("source")
        if source:
            if user["role"] == "developer" or meta.get("owner_id") == user["id"]:
                file_info = db_files.get(source, {})
                file_path = file_info.get("file_path", "")
                relative_path = os.path.basename(file_path) if file_path else ""
                unique_sources[source] = {
                    "filename": source,
                    "file_path": relative_path,
                    "course_id": file_info.get("course_id"),
                }
    return {"documents": list(unique_sources.values())}

@app.get("/api/dashboard")
async def get_dashboard(authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header.")
    token = authorization.split(" ", 1)[1].strip()
    user = get_user_by_token(token)

    conn = get_db_connection()
    cursor = conn.cursor()

    if user["role"] == "developer":
        cursor.execute("SELECT COUNT(*) AS count FROM documents")
    else:
        cursor.execute("SELECT COUNT(*) AS count FROM documents WHERE owner_id = ?", (user["id"],))
    studied_files = cursor.fetchone()["count"]

    if user["role"] == "developer":
        cursor.execute(
            "SELECT COUNT(*) AS attempts, AVG(CASE WHEN total_questions > 0 THEN (score * 100.0 / total_questions) END) AS average_score FROM quiz_attempts"
        )
    else:
        cursor.execute(
            "SELECT COUNT(*) AS attempts, AVG(CASE WHEN total_questions > 0 THEN (score * 100.0 / total_questions) END) AS average_score FROM quiz_attempts WHERE user_id = ?",
            (user["id"],),
        )
    quiz_stats = cursor.fetchone()
    conn.close()

    return {
        "studied_files": studied_files,
        "average_quiz_score": round(quiz_stats["average_score"] or 0, 1),
        "quiz_attempts": quiz_stats["attempts"],
    }

@app.post("/api/quiz-attempts")
async def save_quiz_attempt(payload: QuizAttemptRequest, authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header.")
    token = authorization.split(" ", 1)[1].strip()
    user = get_user_by_token(token)

    if payload.total_questions <= 0:
        raise HTTPException(status_code=400, detail="Quiz must include at least one question.")
    if payload.score < 0 or payload.score > payload.total_questions:
        raise HTTPException(status_code=400, detail="Invalid quiz score.")

    conn = get_db_connection()
    cursor = conn.cursor()

    if user["role"] == "developer":
        cursor.execute("SELECT 1 FROM documents WHERE filename = ? LIMIT 1", (payload.filename,))
    else:
        cursor.execute("SELECT 1 FROM documents WHERE filename = ? AND owner_id = ? LIMIT 1", (payload.filename, user["id"]))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Document not found.")

    cursor.execute(
        "INSERT INTO quiz_attempts (id, user_id, filename, score, total_questions, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        (uuid.uuid4().hex, user["id"], payload.filename, payload.score, payload.total_questions, time.time()),
    )
    conn.commit()
    conn.close()
    return {"message": "Quiz attempt saved."}

@app.get("/api/pdf/{filename}")
async def get_pdf(filename: str, authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header.")
    token = authorization.split(" ", 1)[1].strip()
    user = get_user_by_token(token)

    conn = get_db_connection()
    cursor = conn.cursor()
    if user["role"] == "developer":
        cursor.execute("SELECT file_path FROM documents WHERE filename = ?", (filename,))
    else:
        cursor.execute("SELECT file_path FROM documents WHERE owner_id = ? AND filename = ?", (user["id"], filename))
    row = cursor.fetchone()
    conn.close()
    
    if not row:
        raise HTTPException(status_code=404, detail="Document not found or unauthorized.")
    file_path = row["file_path"]
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File missing on disk.")
    return FileResponse(file_path, media_type="application/pdf", filename=filename)

@app.delete("/api/documents/{filename}")
async def delete_document(filename: str, authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header.")
    token = authorization.split(" ", 1)[1].strip()
    user = get_user_by_token(token)
    
    conn = get_db_connection()
    cursor = conn.cursor()
    if user["role"] == "developer":
        cursor.execute("SELECT file_path, owner_id FROM documents WHERE filename = ?", (filename,))
    else:
        cursor.execute("SELECT file_path, owner_id FROM documents WHERE filename = ? AND owner_id = ?", (filename, user["id"]))
    row = cursor.fetchone()
    if row:
        file_path = row["file_path"]
        owner_id = row["owner_id"]
        if os.path.exists(file_path):
            try:
                os.remove(file_path)
            except Exception as e:
                print(f"Error deleting file: {e}")
        if user["role"] == "developer":
            cursor.execute("DELETE FROM documents WHERE filename = ?", (filename,))
            cursor.execute("DELETE FROM quiz_attempts WHERE filename = ?", (filename,))
        else:
            cursor.execute("DELETE FROM documents WHERE filename = ? AND owner_id = ?", (filename, user["id"]))
            cursor.execute("DELETE FROM quiz_attempts WHERE filename = ? AND user_id = ?", (filename, user["id"]))
        conn.commit()
    else:
        owner_id = user["id"]
    conn.close()
    
    try:
        results = collection.get(where={"filename": filename}, include=["metadatas"])
        if results and results.get("ids"):
            ids_to_delete = [
                doc_id for doc_id, meta in zip(results["ids"], results["metadatas"])
                if user["role"] == "developer" or meta.get("owner_id") == owner_id
            ]
            if ids_to_delete:
                collection.delete(ids=ids_to_delete)
    except Exception as e:
        print(f"Error deleting from ChromaDB: {e}")

    return {"message": "Document deleted successfully."}


# ─────────────────────────────────────────────
# SUMMARIZE — single document (unchanged) + course variant
# ─────────────────────────────────────────────
class SummarizeRequest(BaseModel):
    use_gemini: bool = False
    gemini_api_key: Optional[str] = None
    gemini_model: Optional[str] = None
    local_model: Optional[str] = None


async def _run_summarize(full_text: str, payload: SummarizeRequest) -> str:
    """Core summarization logic shared by single-doc and course endpoints."""
    prompt = f"""Please provide a concise but comprehensive summary of the following text.
Return only plain text. Do not use Markdown, headings, bullet lists, numbered lists, bold text, tables, code blocks, or special formatting characters.
Write the summary in short, clear paragraphs.

Text:
{full_text}

Plain text summary:"""

    if payload.use_gemini and payload.gemini_api_key:
        import httpx
        async with httpx.AsyncClient(timeout=10.0) as http_client:
            models_resp = await http_client.get(f"https://generativelanguage.googleapis.com/v1beta/models?key={payload.gemini_api_key}")
            if models_resp.status_code != 200:
                raise Exception(f"Failed to list models: {models_resp.text}")
            models_data = models_resp.json().get("models", [])
            valid_models = [m["name"] for m in models_data if "generateContent" in m.get("supportedGenerationMethods", [])]
            if not valid_models:
                raise Exception("No generative models available for this API key.")
            chosen_model = None
            if payload.gemini_model and payload.gemini_model in valid_models:
                chosen_model = payload.gemini_model
            if not chosen_model:
                chosen_model = valid_models[0]
                flash_models = [m for m in valid_models if "flash" in m]
                if flash_models:
                    flash_models.sort(reverse=True)
                    chosen_model = flash_models[0]

        gemini_url = f"https://generativelanguage.googleapis.com/v1beta/{chosen_model}:generateContent?key={payload.gemini_api_key}"
        async with httpx.AsyncClient(timeout=300.0) as client:
            resp = await client.post(gemini_url, json={"contents": [{"parts": [{"text": prompt}]}]})
        if resp.status_code != 200:
            raise Exception(f"Gemini API error: {resp.text}")
        result = resp.json()
        summary = result["candidates"][0]["content"]["parts"][0]["text"].strip()
    else:
        response = requests.post(
            f"{OLLAMA_URL}/api/generate",
            json={"model": payload.local_model if payload.local_model else GENERATION_MODEL, "prompt": prompt, "stream": False},
            timeout=300
        )
        if response.status_code != 200:
            raise Exception(f"Ollama error: {response.text}")
        summary = response.json().get("response", "").strip()

    return strip_markdown_formatting(summary)


@app.post("/api/summarize/{filename}")
async def summarize_document(filename: str, payload: SummarizeRequest, authorization: Optional[str] = Header(None)):
    if not payload.use_gemini:
        try:
            check_and_pull_ollama_model()
        except Exception as e:
            raise HTTPException(status_code=503, detail=f"Ollama service unavailable: {str(e)}")
    
    db_data = collection.get(where={"source": filename}, include=["documents", "metadatas"])
    if not db_data or not db_data["documents"]:
        raise HTTPException(status_code=404, detail="Document not found.")
    
    full_text = "\n".join(db_data["documents"])
    
    try:
        summary = await _run_summarize(full_text, payload)
        return {"summary": summary, "filename": filename}
    except requests.exceptions.Timeout:
        raise HTTPException(status_code=504, detail="Summarization timed out. Try with a shorter document.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating summary: {str(e)}")


# ─────────────────────────────────────────────
# NEW: Summarize an entire course
# ─────────────────────────────────────────────
@app.post("/api/summarize-course/{course_id}")
async def summarize_course(course_id: str, payload: SummarizeRequest, authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header.")
    token = authorization.split(" ", 1)[1].strip()
    user = get_user_by_token(token)

    if not payload.use_gemini:
        try:
            check_and_pull_ollama_model()
        except Exception as e:
            raise HTTPException(status_code=503, detail=f"Ollama service unavailable: {str(e)}")

    filenames = get_course_filenames(course_id, user)
    if not filenames:
        raise HTTPException(status_code=404, detail="No documents found for this course.")

    db_data = get_chroma_docs_for_filenames(filenames)
    if not db_data or not db_data["documents"]:
        raise HTTPException(status_code=404, detail="No content found for this course.")

    full_text = "\n\n".join(db_data["documents"])

    # Fetch course title for labeling
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT title FROM courses WHERE id = ?", (course_id,))
    course_row = cursor.fetchone()
    conn.close()
    course_title = course_row["title"] if course_row else course_id

    try:
        summary = await _run_summarize(full_text, payload)
        return {
            "summary": summary,
            "course_id": course_id,
            "course_title": course_title,
            "filenames": filenames,
        }
    except requests.exceptions.Timeout:
        raise HTTPException(status_code=504, detail="Summarization timed out.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating summary: {str(e)}")


# ─────────────────────────────────────────────
# QUIZ — single document (unchanged) + course variant
# ─────────────────────────────────────────────
class QuizRequest(BaseModel):
    use_gemini: bool = False
    gemini_api_key: Optional[str] = None
    gemini_model: Optional[str] = None
    local_model: Optional[str] = None


async def _run_quiz(full_text: str, payload: QuizRequest) -> dict:
    """Core quiz generation logic shared by single-doc and course endpoints."""
    import json, re as _re

    prompt = f"""Ești Agentul B (Examinatorul). Generează un quiz format din fix 5 întrebări grilă unice baza pe textul de mai jos.
Fiecare întrebare trebuie să aibă 4 variante de răspuns (A, B, C, D) și o singură variantă corectă.
Trebuie să răspunzi STRICT cu un singur string JSON valid, care respectă următoarea structură:
{{
  "questions": [
    {{
      "question": "Textul întrebării",
      "options": {{
        "A": "Răspuns 1",
        "B": "Răspuns 2",
        "C": "Răspuns 3",
        "D": "Răspuns 4"
      }},
      "correct_answer": "A",
      "explanation": "Explicația detaliată"
    }}
  ]
}}

Nu adăuga niciun text înainte sau după JSON. Doar JSON-ul valid!

Text:
{full_text}
"""

    if payload.use_gemini and payload.gemini_api_key:
        import httpx
        async with httpx.AsyncClient(timeout=10.0) as http_client:
            models_resp = await http_client.get(f"https://generativelanguage.googleapis.com/v1beta/models?key={payload.gemini_api_key}")
            if models_resp.status_code != 200:
                raise Exception(f"Failed to list models: {models_resp.text}")
            models_data = models_resp.json().get("models", [])
            valid_models = [m["name"] for m in models_data if "generateContent" in m.get("supportedGenerationMethods", [])]
            if not valid_models:
                raise Exception("No generative models available for this API key.")
            chosen_model = None
            if payload.gemini_model and payload.gemini_model in valid_models:
                chosen_model = payload.gemini_model
            if not chosen_model:
                chosen_model = valid_models[0]
                flash_models = [m for m in valid_models if "flash" in m]
                if flash_models:
                    flash_models.sort(reverse=True)
                    chosen_model = flash_models[0]

        gemini_url = f"https://generativelanguage.googleapis.com/v1beta/{chosen_model}:generateContent?key={payload.gemini_api_key}"
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(gemini_url, json={"contents": [{"parts": [{"text": prompt}]}]})
        if resp.status_code != 200:
            raise Exception(f"Gemini API error: {resp.text}")
        result = resp.json()
        quiz_text = result["candidates"][0]["content"]["parts"][0]["text"].strip()
    else:
        response = requests.post(
            f"{OLLAMA_URL}/api/generate",
            json={"model": payload.local_model if payload.local_model else CHAT_MODEL, "prompt": prompt, "stream": False},
            timeout=120
        )
        if response.status_code != 200:
            raise Exception(f"Ollama error: {response.text}")
        quiz_text = response.json().get("response", "").strip()

    quiz_text = _re.sub(r"```json\s*", "", quiz_text)
    quiz_text = _re.sub(r"```\s*", "", quiz_text)
    return json.loads(quiz_text.strip())


@app.post("/api/quiz/{filename}")
async def generate_quiz(filename: str, payload: QuizRequest):
    if not payload.use_gemini:
        try:
            check_and_pull_ollama_model()
        except Exception as e:
            raise HTTPException(status_code=503, detail=f"Ollama service unavailable: {str(e)}")
    
    db_data = collection.get(where={"source": filename}, include=["documents", "metadatas"])
    if not db_data or not db_data["documents"]:
        raise HTTPException(status_code=404, detail="Document not found.")
    
    full_text = "\n".join(db_data["documents"])
    
    try:
        quiz_data = await _run_quiz(full_text, payload)
        return {"quiz": quiz_data, "filename": filename}
    except Exception as e:
        import json
        if isinstance(e, json.JSONDecodeError):
            raise HTTPException(status_code=500, detail="Modelul nu a returnat un JSON valid pentru quiz. Mai încercați o dată.")
        raise HTTPException(status_code=500, detail=f"Eroare generare quiz: {str(e)}")


# ─────────────────────────────────────────────
# NEW: Quiz for an entire course
# ─────────────────────────────────────────────
@app.post("/api/quiz-course/{course_id}")
async def generate_quiz_course(course_id: str, payload: QuizRequest, authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header.")
    token = authorization.split(" ", 1)[1].strip()
    user = get_user_by_token(token)

    if not payload.use_gemini:
        try:
            check_and_pull_ollama_model()
        except Exception as e:
            raise HTTPException(status_code=503, detail=f"Ollama service unavailable: {str(e)}")

    filenames = get_course_filenames(course_id, user)
    if not filenames:
        raise HTTPException(status_code=404, detail="No documents found for this course.")

    db_data = get_chroma_docs_for_filenames(filenames)
    if not db_data or not db_data["documents"]:
        raise HTTPException(status_code=404, detail="No content found for this course.")

    full_text = "\n\n".join(db_data["documents"])

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT title FROM courses WHERE id = ?", (course_id,))
    course_row = cursor.fetchone()
    conn.close()
    course_title = course_row["title"] if course_row else course_id

    try:
        quiz_data = await _run_quiz(full_text, payload)
        return {
            "quiz": quiz_data,
            "course_id": course_id,
            "course_title": course_title,
            "filenames": filenames,
        }
    except Exception as e:
        import json
        if isinstance(e, json.JSONDecodeError):
            raise HTTPException(status_code=500, detail="Modelul nu a returnat un JSON valid pentru quiz. Mai încercați o dată.")
        raise HTTPException(status_code=500, detail=f"Eroare generare quiz: {str(e)}")


# ─────────────────────────────────────────────
# CHAT — updated to support course_id
# ─────────────────────────────────────────────
@app.post("/api/chat")
async def chat_with_ai(request: ChatRequest, authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header.")
    token = authorization.split(" ", 1)[1].strip()
    user = get_user_by_token(token)
    
    async def generate():
        import asyncio
        import json
        
        yield json.dumps({"type": "status", "content": "Caut informații relevante în documente..."}) + "\n"
        await asyncio.sleep(0.1)
        
        if not request.use_gemini:
            try:
                models_to_check = [EMBEDDING_MODEL, GENERATION_MODEL]
                selected_model = request.local_model if request.local_model else CHAT_MODEL
                models_to_check.append(selected_model)
                response = requests.get(f"{OLLAMA_URL}/api/tags", timeout=3)
                if response.status_code != 200:
                    raise Exception("Ollama responded with an error.")
                installed_models = [m.get("name") for m in response.json().get("models", [])]
                for model in models_to_check:
                    if not any(model in m for m in installed_models):
                        yield json.dumps({"type": "status", "content": f"Se descarcă modelul {model}..."}) + "\n"
                        requests.post(f"{OLLAMA_URL}/api/pull", json={"name": model})
            except Exception as e:
                yield json.dumps({"type": "status", "content": f"Serviciul Ollama indisponibil: {str(e)}"}) + "\n"
                return
        
        # ── Build ChromaDB query ──────────────────────────
        # Priority: course_id > filename > all user docs
        if request.course_id:
            course_filenames = get_course_filenames(request.course_id, user)
            if not course_filenames:
                yield json.dumps({"type": "status", "content": "Nu am găsit documente pentru acest curs."}) + "\n"
                yield json.dumps({"type": "text", "content": "Nu am găsit această informație în curs"}) + "\n"
                return

            query_kwargs = {
                "query_texts": [request.message],
                "n_results": min(10, len(course_filenames) * 3),
                "include": ["documents", "metadatas"],
            }
            if len(course_filenames) == 1:
                query_kwargs["where"] = {"source": course_filenames[0]}
            else:
                query_kwargs["where"] = {"source": {"$in": course_filenames}}
        elif request.filename:
            query_kwargs = {
                "query_texts": [request.message],
                "n_results": 5,
                "include": ["documents", "metadatas"],
                "where": {"source": request.filename},
            }
        else:
            query_kwargs = {
                "query_texts": [request.message],
                "n_results": 5,
                "include": ["documents", "metadatas"],
            }
            
        query_results = collection.query(**query_kwargs)
        
        filtered_docs = []
        filtered_metas = []
        for doc, meta in zip(query_results["documents"][0], query_results["metadatas"][0]):
            if user["role"] == "developer" or meta.get("owner_id") == user["id"]:
                filtered_docs.append(doc)
                filtered_metas.append(meta)
        
        scope_label = "curs" if request.course_id else "document"
        yield json.dumps({"type": "status", "content": f"Găsite {len(filtered_docs)} secțiuni relevante din {scope_label}. Formulez răspunsul..."}) + "\n"
        await asyncio.sleep(0.1)
        
        context = ""
        if filtered_docs:
            context = "\n\n".join([
                f"From {meta['source']} (page {meta['page']}): {doc}"
                for doc, meta in zip(filtered_docs, filtered_metas)
            ])
        
        if context:
            prompt = f"""You are an intelligent tutor. Answer the student's question using **ONLY** the information from the course context provided below.
If the answer is NOT strictly contained in the context, you **MUST** reply with exactly: "Nu am găsit această informație în curs".

Course Context:
{context}

Student Question: {request.message}

Answer:"""
        else:
            prompt = """You are an intelligent tutor that answers ONLY using the course content.
Since no course context is available, you must answer exactly: "Nu am găsit această informație în curs"."""
        
        full_response = ""
        try:
            if request.use_gemini and request.gemini_api_key:
                import httpx
                async with httpx.AsyncClient(timeout=10.0) as http_client:
                    models_resp = await http_client.get(f"https://generativelanguage.googleapis.com/v1beta/models?key={request.gemini_api_key}")
                    models_data = models_resp.json().get("models", [])
                    valid_models = [m["name"] for m in models_data if "generateContent" in m.get("supportedGenerationMethods", [])]
                    chosen_model = None
                    if request.gemini_model and request.gemini_model in valid_models:
                        chosen_model = request.gemini_model
                    if not chosen_model:
                        chosen_model = valid_models[0]
                        flash_models = [m for m in valid_models if "flash" in m]
                        if flash_models:
                            flash_models.sort(reverse=True)
                            chosen_model = flash_models[0]

                yield json.dumps({"type": "model_name", "content": chosen_model}) + "\n"
                await asyncio.sleep(0.1)

                gemini_url = f"https://generativelanguage.googleapis.com/v1beta/{chosen_model}:streamGenerateContent?alt=sse&key={request.gemini_api_key}"
                async with httpx.AsyncClient() as client:
                    async with client.stream("POST", gemini_url, json={"contents": [{"parts": [{"text": prompt}]}]}) as resp:
                        async for line in resp.aiter_lines():
                            if line.startswith("data: "):
                                data_str = line[len("data: "):].strip()
                                if data_str == "[DONE]":
                                    continue
                                try:
                                    data_json = json.loads(data_str)
                                    text_chunk = data_json["candidates"][0]["content"]["parts"][0]["text"]
                                    full_response += text_chunk
                                    yield json.dumps({"type": "text", "content": text_chunk}) + "\n"
                                except:
                                    pass
            else:
                client = ollama.AsyncClient(host=OLLAMA_URL)
                yield json.dumps({
                    "type": "model_name",
                    "content": request.local_model if request.local_model else CHAT_MODEL
                }) + "\n"

                stream = await client.chat(
                    model=request.local_model if request.local_model else CHAT_MODEL,
                    messages=[{"role": "user", "content": prompt}],
                    stream=True
                )

                async for chunk in stream:
                    chunk_text = chunk["message"]["content"]
                    full_response += chunk_text
                    yield json.dumps({"type": "text", "content": chunk_text}) + "\n"

            if full_response.strip():
                def _save_history():
                    try:
                        conn_h = sqlite3.connect("auth.db")
                        cur_h = conn_h.cursor()
                        label = request.course_id or request.filename
                        cur_h.execute(
                            "INSERT INTO chat_history (id, user_id, filename, message, response, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                            (uuid.uuid4().hex, user["id"], label, request.message, full_response, time.time())
                        )
                        conn_h.commit()
                        conn_h.close()
                    except Exception as he:
                        print("Failed to save chat history:", he)
                import threading
                threading.Thread(target=_save_history).start()

        except Exception as e:
            yield json.dumps({"type": "status", "content": f"Eroare model: {str(e)}"}) + "\n"

    return StreamingResponse(generate(), media_type="application/x-ndjson")