import os
import shutil
import requests
from contextlib import asynccontextmanager
from fastapi import FastAPI, UploadFile, File, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pypdf import PdfReader
import chromadb
from chromadb.utils.embedding_functions import OllamaEmbeddingFunction

# Configurations
MAX_FILE_SIZE_MB = 20
MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024
DB_DIR = "./local_db"
UPLOADS_DIR = "uploads"
EMBEDDING_MODEL = "nomic-embed-text"
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
        
        if not any(EMBEDDING_MODEL in m for m in installed_models):
            print(f"Downloading model {EMBEDDING_MODEL} (this may take a minute)...")
            pull_response = requests.post(f"{OLLAMA_URL}/api/pull", json={"name": EMBEDDING_MODEL}, stream=False)
            if pull_response.status_code == 200:
                print(f"Model {EMBEDDING_MODEL} downloaded successfully!")
            else:
                raise Exception(f"Error downloading model: {pull_response.text}")
                
    except requests.exceptions.ConnectionError:
        raise Exception("Ollama is not running. Please install and start Ollama.")

# Initialize Vector DB
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

collection = get_db_collection()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    check_and_pull_ollama_model()
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


@app.post("/api/upload")
async def upload_document(file: UploadFile = File(...)):
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
    file_path = os.path.join(UPLOADS_DIR, file.filename)
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
                    "page": i + 1,
                    "file_path": file_path
                })
                ids.append(f"{file.filename}_page_{i+1}")
                
        if documents:
            collection.upsert(
                documents=documents,
                metadatas=metadatas,
                ids=ids
            )
            return {"message": "✅ Success! Document processed and saved.", "filename": file.filename, "pages": len(documents)}
        else:
            return {"message": "⚠️ Document uploaded, but no text could be extracted (might be scanned/image).", "filename": file.filename, "pages": 0}

    except Exception as e:
        # Cleanup file if error occurs
        if os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(status_code=500, detail=f"Error processing document: {str(e)}")

@app.get("/api/documents")
async def list_documents():
    db_data = collection.get(include=["metadatas"])
    if not db_data or not db_data["metadatas"]:
        return {"documents": []}
        
    unique_sources = {}
    for meta in db_data["metadatas"]:
        source = meta.get("source")
        if source:
            unique_sources[source] = {"filename": source, "path": meta.get("file_path", "")}
            
    return {"documents": list(unique_sources.values())}
