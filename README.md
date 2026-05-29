# 🧠 Smart Study Hub

Smart Study Hub is an intelligent, AI-powered local study assistant designed to help students seamlessly interact with their course materials. Built with privacy and performance in mind, it uses local Large Language Models (LLMs) via Ollama to act as your personalized tutor and examiner.

## ✨ Features

- **📄 Intelligent PDF interaction:** Upload your course materials (PDFs up to 20MB). The app automatically extracts and indexes the text for AI analysis.
- **🤖 Dedicated AI Tutor (Agent A):** Ask questions about your course materials. Using Retrieval-Augmented Generation (RAG), the tutor ensures answers are strictly based on the uploaded documents. (Expect fast responses, typically under 10 seconds with optimized models!).
- **📝 Automated Examiner (Agent B):** Test your knowledge with dynamically generated multiple-choice quizzes. Get graded instantly with detailed explanations for any incorrect answers.
- **📑 Smart Summarization:** Automatically generate structured, easy-to-read summaries of your chapters to save time during revision.
- **📖 Integrated PDF Viewer:** Read your original documents side-by-side while simultaneously chatting with the AI.
- **📊 Learning Progress Dashboard:** Track your study habits, view the number of files you've studied, and monitor your average quiz test scores.
- **💾 History & Export:** Access your past conversations with the AI and export valuable notes and answers into `.txt` or `.md` formats for offline reading.
- **⚙️ Pluggable LLMs (Local & Cloud):** Easily switch between local models or provide a **Google Gemini API Key** to bypass local models for blazing-fast summarization, Q&A, and quizzes directly from the settings.
- **🌙 Dark Mode:** An eye-friendly dark interface designed for long, late-night study sessions.

## 🏗️ System Architecture

Smart Study Hub operates as a multi-agent system powered entirely by local processing:
- **Vector Database:** Securely stores and retrieves embeddings mapped from your uploaded PDFs.
- **Ollama Backend:** Serves local LLMs ensuring your data never leaves your machine.
- **Multi-Agent Setup:** Splits contextual tasks between an empathetic "Tutor" module and a strict, analytical "Examiner" module.

## 🚀 Getting Started

### Quick Start with Docker (Recommended)
The easiest way to run the project is using Docker, which handles all dependencies automatically.

**For Linux/macOS:**
```bash
# Run the Docker startup script
./run-docker.sh
```

**For Windows:**
Double-click the `run-docker.bat` file, or run it from your command prompt:
```cmd
run-docker.bat
```

This will start the entire application stack including:
- React frontend on port 3000
- FastAPI backend on port 8000
- Ollama AI models on port 11434

**Manual Docker commands:**
```bash
# Build and start all services
docker-compose up --build -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### Traditional Startup
If you prefer to run without Docker, use the provided startup scripts. These scripts automatically start both the backend and frontend simultaneously.

**For Linux/macOS:**
It is recommended to run inside a venv.
```bash
# Make the script executable (only needed the first time)
chmod +x run.sh

# Run the app
./run.sh
```
*(Press `Ctrl+C` in the terminal to gracefully stop both servers).*

**For Windows:**
Simply double-click the `run.bat` file, or run it from your command prompt:
```cmd
run.bat
```
*(This will open two new terminal windows for the frontend and backend. To stop the application, just close those windows).*

---

### Manual Startup
If you prefer to start them manually, you will need two separate terminals:

### Prerequisites

- [Node.js](https://nodejs.org/) installed.
- [Python 3.9+](https://www.python.org/)
- [Ollama](https://ollama.ai/) installed and running locally.
- The backend will auto-pull `nomic-embed-text` when needed for PDF upload and indexing.
- `gemma3b` and `gemma3:4b` are only needed for local generation features and can be pulled manually if you want to use them.

### 1. Start the FastAPI Backend
Open a terminal and run the following commands:
```bash
# Activate your Python virtual environment (if you are using one)
source venv/bin/activate

# Install the backend dependencies
pip install -r requirements.txt

# Start the API server on localhost:8000
python -m uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

### 2. Start the React Frontend
Open a second terminal and run:
```bash
# Navigate to the frontend directory
cd frontend

# Install necessary npm/NodeJS dependencies
npm install

# Start the Vite development frontend server
npm run dev
```

## 🛠️ Built With
- **Frontend**: Node.js, React, Vite.
- **Backend**: Python, FastAPI, PyPDF.
- **AI Models**: Ollama (`nomic-embed-text` is auto-managed for uploads; `gemma3n` and `gemma3:4b` are optional/manual) & Google Gemini REST API.
- **Local Vector DB**: ChromaDB

## 🧪 Model Recommendations

- **Local models (Agent A):** `gemma3n` was the most reliable option without failures, with `mistral` close behind. If you want faster response times, `gemma2:2b`, `gemma3:1b`, and `gemma3:4b` have comparable results with eachother.
- **Gemini (Agent A):** `gemini-3.1-flash-lite` is recommended because the Gemini API offers generous free tokens, it is the fastest model tested, and response quality is comparable to higher-cost options (`gemini-2.5-flash`, `gemini-3.5-flash`).
- **Local models (Agent B, summarization):** `gemma3:1b` often returns acceptable summaries (short but usable), yet it can hallucinate. The recommended choice remains `gemma3:4b`, which produces very strong results, but averaged close to 2 minutes per run in tests.
- **Local models (Agent B, quizzes):** No local model produced consistently good quiz results, so the **Gemini API is recommended**.
- **Gemini (Agent B):** `gemini-3.1-flash-lite` remains the recommended choice.

## 🚀 Deployment & CI/CD

### Docker Deployment
The application is fully containerized and can be deployed using Docker:

1. **Build the image:**
   ```bash
   docker build -t smart-study-hub .
   ```

2. **Run with Docker Compose:**
   ```bash
   docker-compose up -d
   ```

3. **Access the application:**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:8000
   - API Docs: http://localhost:8000/docs

### CI/CD Pipeline
This project includes a GitHub Actions CI/CD pipeline that:
- Runs automated tests for both backend and frontend
- Performs code linting and quality checks
- Builds and pushes Docker images to Docker Hub
- Supports automated deployment to production

**Pipeline Features:**
- ✅ Backend testing with pytest and coverage
- ✅ Frontend testing with Jest
- ✅ Code linting with flake8
- ✅ Multi-stage Docker builds
- ✅ Automated Docker image publishing
- ✅ Health checks and validation


---
*Developed for a smarter, private, and more efficient studying experience.*
