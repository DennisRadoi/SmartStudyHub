import os
import sqlite3
import uuid
import hashlib
import secrets
import time
import requests
from contextlib import asynccontextmanager
from typing import Optional
from fastapi import FastAPI, UploadFile, File, HTTPException, status, Header, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pypdf import PdfReader
import chromadb
from chromadb.utils.embedding_functions import OllamaEmbeddingFunction

# Configurations
MAX_FILE_SIZE_MB = 20
MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024
DB_DIR = "./local_db"
UPLOADS_DIR = "./uploads"
AUTH_DB = os.path.join(DB_DIR, "users.db")
EMBEDDING_MODEL = "nomic-embed-text"
GENERATION_MODEL = "mistral"
OLLAMA_URL = "http://localhost:11434"
DEVELOPER_SIGNUP_CODE = os.environ.get("DEVELOPER_SIGNUP_CODE", "dev-secret-code")

os.makedirs(UPLOADS_DIR, exist_ok=True)
os.makedirs(DB_DIR, exist_ok=True)

# --- Ollama helpers ---

def check_and_pull_ollama_model():
    try:
        response = requests.get(f"{OLLAMA_URL}/api/tags", timeout=5)
        if response.status_code != 200:
            raise Exception("Ollama responded with an unexpected status code.")

        models_data = response.json().get("models", [])
        installed_models = [m.get("name") for m in models_data if isinstance(m, dict)]

        for model in [EMBEDDING_MODEL, GENERATION_MODEL]:
            if model not in installed_models:
                pull_response = requests.post(f"{OLLAMA_URL}/api/pull", json={"name": model}, timeout=120)
                if pull_response.status_code != 200:
                    raise Exception(f"Unable to pull model {model}: {pull_response.text}")
    except requests.exceptions.RequestException as exc:
        raise Exception("Unable to reach Ollama service. Ensure Ollama is running at %s." % OLLAMA_URL) from exc

# --- Authentication helpers ---

def get_db_connection():
    conn = sqlite3.connect(AUTH_DB)
    conn.row_factory = sqlite3.Row
    return conn


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
            uploaded_at REAL NOT NULL,
            FOREIGN KEY(owner_id) REFERENCES users(id)
        )
        """
    )
    cursor.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_owner_filename ON documents(owner_id, filename)"
    )
    conn.commit()
    conn.close()


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


def authenticate_user(username: str, password: str) -> dict:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE username = ?", (username,))
    row = cursor.fetchone()
    conn.close()
    if not row or not verify_password(password, row["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid username or password.")
    return {"id": row["id"], "username": row["username"], "email": row["email"], "role": row["role"]}


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


def require_auth(authorization: Optional[str] = Header(None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header.")
    token = authorization.split(" ", 1)[1].strip()
    return get_user_by_token(token)


def require_developer(user: dict = Depends(require_auth)) -> dict:
    if user["role"] != "developer":
        raise HTTPException(status_code=403, detail="Developer access required.")
    return user

# Ensure auth database exists
init_auth_db()

# Initialize Vector DB

def get_db_collection():
    client = chromadb.PersistentClient(path=DB_DIR)
    ollama_ef = OllamaEmbeddingFunction(
        url=f"{OLLAMA_URL}/api/embeddings",
        model_name=EMBEDDING_MODEL,
    )
    return client.get_or_create_collection(
        name="cursuri_studenti",
        embedding_function=ollama_ef,
    )

collection = get_db_collection()

@asynccontextmanager
async def lifespan(app: FastAPI):
    yield

app = FastAPI(title="Smart Study Hub API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class SignupRequest(BaseModel):
    username: str
    email: str
    password: str
    developer_code: Optional[str] = None

class LoginRequest(BaseModel):
    username: str
    password: str

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
async def me(user: dict = Depends(require_auth)):
    return {"user": user}

@app.get("/api/admin/users")
async def admin_users(user: dict = Depends(require_developer)):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, username, email, role FROM users ORDER BY username")
    users = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return {"users": users}

@app.post("/api/upload")
async def upload_document(file: UploadFile = File(...), user: dict = Depends(require_auth)):
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
                documents.append(text)
                metadatas.append({
                    "source": file.filename,
                    "owner_id": owner_id,
                    "filename": file.filename,
                    "page": i + 1,
                    "file_path": file_path,
                })
                ids.append(f"{owner_id}_{file.filename}_page_{i+1}")
        if documents:
            collection.upsert(documents=documents, metadatas=metadatas, ids=ids)
            save_document_record(owner_id, file.filename, file.filename, file_path)
            return {"message": "✅ Success! Document processed and saved.", "filename": file.filename, "pages": len(documents)}
        return {"message": "⚠️ Document uploaded, but no text could be extracted (might be scanned/image).", "filename": file.filename, "pages": 0}
    except Exception as e:
        if os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(status_code=500, detail=f"Error processing document: {str(e)}")

@app.get("/api/documents")
async def list_documents(user: dict = Depends(require_auth)):
    conn = get_db_connection()
    cursor = conn.cursor()
    if user["role"] == "developer":
        cursor.execute("SELECT filename, owner_id FROM documents ORDER BY uploaded_at DESC")
    else:
        cursor.execute("SELECT filename, owner_id FROM documents WHERE owner_id = ? ORDER BY uploaded_at DESC", (user["id"],))
    rows = cursor.fetchall()
    conn.close()
    documents = [{"filename": row["filename"], "owner_id": row["owner_id"]} for row in rows]
    return {"documents": documents}

@app.post("/api/summarize/{filename}")
async def summarize_document(filename: str, user: dict = Depends(require_auth)):
    query = {"filename": filename, "owner_id": user["id"]}
    if user["role"] == "developer":
        query = {"filename": filename}
    db_data = collection.get(where=query, include=["documents", "metadatas"])
    if not db_data or not db_data["documents"]:
        raise HTTPException(status_code=404, detail="Document not found.")
    full_text = "\n".join(db_data["documents"])
    prompt = f"""Please provide a structured summary of the following text. Organize it into clear sections with headings, key points, and main concepts. Keep it concise but comprehensive.

Text:
{full_text}

Structured Summary:"""
    try:
        response = requests.post(
            f"{OLLAMA_URL}/api/generate",
            json={"model": GENERATION_MODEL, "prompt": prompt, "stream": False},
            timeout=60,
        )
        if response.status_code != 200:
            raise Exception(f"Ollama error: {response.text}")
        result = response.json()
        summary = result.get("response", "").strip()
        return {"summary": summary, "filename": filename}
    except requests.exceptions.Timeout:
        raise HTTPException(status_code=504, detail="Summarization timed out. Try with a shorter document.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating summary: {str(e)}")
