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
- **⚙️ Pluggable Local LLMs:** Easily switch between different local models (like Llama 3, Phi-3, or Mistral) directly from the settings to test performance.
- **🌙 Dark Mode:** An eye-friendly dark interface designed for long, late-night study sessions.

## 🏗️ System Architecture

Smart Study Hub operates as a multi-agent system powered entirely by local processing:
- **Vector Database:** Securely stores and retrieves embeddings mapped from your uploaded PDFs.
- **Ollama Backend:** Serves local LLMs ensuring your data never leaves your machine.
- **Multi-Agent Setup:** Splits contextual tasks between an empathetic "Tutor" module and a strict, analytical "Examiner" module.

## 🚀 Getting Started

*(Instructions on how to set up the Python environment, install Ollama, and run the application will be added here as development progresses).*

### Prerequisites

- [Python 3.9+](https://www.python.org/)
- [Ollama](https://ollama.ai/) installed and running locally.

## 🛠️ Built With
- **Python**
- **Ollama** (Phi-3, Llama 3, Mistral)
- **Local Vector DB**

---
*Developed for a smarter, private, and more efficient studying experience.*