import os
import shutil
import requests
import secrets
import hashlib
import sqlite3
import time
import uuid
from contextlib import asynccontextmanager
from fastapi import FastAPI, UploadFile, File, HTTPException, status, Header
from typing import Optional
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from pypdf import PdfReader
import chromadb
from chromadb.utils.embedding_functions import OllamaEmbeddingFunction
import ollama

# Configurations
MAX_FILE_SIZE_MB = 20
MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024
DB_DIR = "./local_db"
UPLOADS_DIR = "uploads"
EMBEDDING_MODEL = "nomic-embed-text"
GENERATION_MODEL = "mistral"  # For summarization and chat
OLLAMA_URL = "http://localhost:11434"

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
        
        for model in [EMBEDDING_MODEL, GENERATION_MODEL]:
            if not any(model in m for m in installed_models):
                print(f"Downloading model {model} (this may take a minute)...")
                pull_response = requests.post(f"{OLLAMA_URL}/api/pull", json={"name": model}, stream=False)
                if pull_response.status_code == 200:
                    print(f"Model {model} downloaded successfully!")
                else:
                    raise Exception(f"Error downloading model: {pull_response.text}")
                
    except requests.exceptions.ConnectionError:
        raise Exception("Ollama is not running. Please install and start Ollama.")

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

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup - don't block on model downloads
    yield
    # Shutdown
    pass

app = FastAPI(title="Smart Study Hub API", lifespan=lifespan)

# Allow requests from our Node.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # For production, restrict to frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files for PDF access
app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")

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

@app.post("/api/upload")
async def upload_document(file: UploadFile = File(...), authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header.")
    token = authorization.split(" ", 1)[1].strip()
    user = get_user_by_token(token)
    
    # Check Ollama and models before processing
    try:
        check_and_pull_ollama_model()
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Ollama service unavailable: {str(e)}")
    
    # 1. Validation: Only allow PDF
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail="Only PDF files are supported."
        )

    # 2. Validation: Max 20 MB size limit
    file_bytes = await file.read()
    if len(file_bytes) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File exceeds maximum size limit of {MAX_FILE_SIZE_MB}MB."
        )
    await file.seek(0)
    
    # 3. Save PDF to disk (User Story 6: View PDF in split pane)
    owner_id = user["id"]
    safe_filename = f"{owner_id}_{file.filename}"
    file_path = os.path.join(UPLOADS_DIR, safe_filename)
    with open(file_path, "wb") as buffer:
        buffer.write(file_bytes)
        
    # 4. Extract text and insert into ChromaDB
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
                    "file_path": file_path
                })
                ids.append(f"{owner_id}_{file.filename}_page_{i+1}")
                
        if documents:
            collection.upsert(
                documents=documents,
                metadatas=metadatas,
                ids=ids
            )
            save_document_record(owner_id, file.filename, file.filename, file_path)
            return {"message": "✅ Success! Document processed and saved.", "filename": file.filename, "pages": len(documents)}
        else:
            return {"message": "⚠️ Document uploaded, but no text could be extracted (might be scanned/image).", "filename": file.filename, "pages": 0}

    except Exception as e:
        # Cleanup file if error occurs
        if os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(status_code=500, detail=f"Error processing document: {str(e)}")

@app.get("/api/documents")
async def list_documents(authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header.")
    token = authorization.split(" ", 1)[1].strip()
    user = get_user_by_token(token)
    
    # Get documents from ChromaDB for metadata
    db_data = collection.get(include=["metadatas"])
    
    # Get file paths from SQLite database
    conn = get_db_connection()
    cursor = conn.cursor()
    if user["role"] == "developer":
        cursor.execute("SELECT filename, file_path FROM documents ORDER BY uploaded_at DESC")
    else:
        cursor.execute("SELECT filename, file_path FROM documents WHERE owner_id = ? ORDER BY uploaded_at DESC", (user["id"],))
    db_files = {row["filename"]: row["file_path"] for row in cursor.fetchall()}
    conn.close()
    
    if not db_data or not db_data["metadatas"]:
        return {"documents": []}
        
    unique_sources = {}
    for meta in db_data["metadatas"]:
        source = meta.get("source")
        if source:
            # Check if user owns this document or is developer
            if user["role"] == "developer" or meta.get("owner_id") == user["id"]:
                file_path = db_files.get(source, "")
                # Convert absolute path to relative URL path
                relative_path = os.path.basename(file_path) if file_path else ""
                unique_sources[source] = {"filename": source, "file_path": relative_path}
            
    return {"documents": list(unique_sources.values())}

@app.post("/api/summarize/{filename}")
async def summarize_document(filename: str):
    # Check Ollama and models before processing
    try:
        check_and_pull_ollama_model()
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Ollama service unavailable: {str(e)}")
    
    # Retrieve all pages for the document
    db_data = collection.get(
        where={"source": filename},
        include=["documents", "metadatas"]
    )
    
    if not db_data or not db_data["documents"]:
        raise HTTPException(status_code=404, detail="Document not found.")
    
    # Concatenate all text from the document
    full_text = "\n".join(db_data["documents"])
    
    # Prepare summarization prompt
    prompt = f"""Please provide a structured summary of the following text. Organize it into clear sections with headings, key points, and main concepts. Keep it concise but comprehensive.

Text:
{full_text}

Structured Summary:"""
    
    # Call Ollama for summarization
    try:
        response = requests.post(
            f"{OLLAMA_URL}/api/generate",
            json={
                "model": GENERATION_MODEL,
                "prompt": prompt,
                "stream": False
            },
            timeout=60  # Allow up to 60 seconds for summarization
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

@app.post("/api/chat")
async def chat_with_ai(request: ChatRequest, authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header.")
    token = authorization.split(" ", 1)[1].strip()
    user = get_user_by_token(token)
    
    # Check Ollama and models before processing
    try:
        check_and_pull_ollama_model()
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Ollama service unavailable: {str(e)}")
    
    # Get relevant documents from ChromaDB
    query_results = collection.query(
        query_texts=[request.message],
        n_results=5,
        include=["documents", "metadatas"]
    )
    
    # Filter results by user ownership or developer role
    filtered_docs = []
    filtered_metas = []
    for doc, meta in zip(query_results["documents"][0], query_results["metadatas"][0]):
        if user["role"] == "developer" or meta.get("owner_id") == user["id"]:
            filtered_docs.append(doc)
            filtered_metas.append(meta)
    
    # Build context from filtered documents
    context = ""
    if filtered_docs:
        context = "\n\n".join([
            f"From {meta['source']} (page {meta['page']}): {doc}"
            for doc, meta in zip(filtered_docs, filtered_metas)
        ])
    
    # Create prompt with context
    if context:
        prompt = f"""You are a helpful AI assistant. Use the following context from the user's documents to answer their question. If the context doesn't contain relevant information, say so and answer based on your general knowledge.

Context:
{context}

Question: {request.message}

Answer:"""
    else:
        prompt = f"You are a helpful AI assistant. The user asked: {request.message}"
    
    # Get response from Ollama
    try:
        response = ollama.chat(
            model=GENERATION_MODEL,
            messages=[{"role": "user", "content": prompt}]
        )
        return {"response": response["message"]["content"]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error communicating with AI: {str(e)}")

@app.get("/api/pdf/{filename}")
async def get_pdf(filename: str, authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header.")
    token = authorization.split(" ", 1)[1].strip()
    user = get_user_by_token(token)
    
    # Find the document in the database
    conn = get_db_connection()
    cursor = conn.cursor()
    if user["role"] == "developer":
        cursor.execute("SELECT file_path FROM documents WHERE filename = ?", (filename,))
    else:
        cursor.execute("SELECT file_path FROM documents WHERE filename = ? AND owner_id = ?", (filename, user["id"]))
    row = cursor.fetchone()
    conn.close()
    
    if not row:
        raise HTTPException(status_code=404, detail="Document not found or access denied.")
    
    file_path = row["file_path"]
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found on disk.")
    
    return FileResponse(file_path, media_type="application/pdf", filename=filename)
