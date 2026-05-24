import hashlib
import json
import os
import time
from datetime import datetime

import chromadb
import requests
from chromadb.utils.embedding_functions import OllamaEmbeddingFunction
from pypdf import PdfReader

BASE_DIR = os.path.dirname(__file__)
CONFIG_PATH = os.path.join(BASE_DIR, "models.json")


def load_config():
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        config = json.load(f)
    if not config.get("models") and not config.get("gemini", {}).get("enabled"):
        raise ValueError("No models configured in models.json")
    return config


def resolve_path(base_dir, path_value):
    if os.path.isabs(path_value):
        return path_value
    return os.path.normpath(os.path.join(base_dir, path_value))


def read_pdf_pages(pdf_path):
    reader = PdfReader(pdf_path)
    pages = []
    for index, page in enumerate(reader.pages, start=1):
        text = (page.extract_text() or "").strip()
        if text:
            pages.append({"page": index, "text": text})
    return pages


def read_pdf_text(pages, max_chars=None):
    full_text = "\n".join(page["text"] for page in pages)
    if max_chars and len(full_text) > max_chars:
        return full_text[:max_chars]
    return full_text


def post_ollama_generate(ollama_url, model, prompt, timeout_seconds):
    resp = requests.post(
        f"{ollama_url}/api/generate",
        json={"model": model, "prompt": prompt, "stream": False},
        timeout=timeout_seconds,
    )
    if resp.status_code != 200:
        raise RuntimeError(f"Ollama error: {resp.text}")
    payload = resp.json()
    return payload.get("response", "").strip()


def fetch_gemini_models(api_key, timeout_seconds):
    resp = requests.get(
        f"https://generativelanguage.googleapis.com/v1beta/models?key={api_key}",
        timeout=timeout_seconds,
    )
    if resp.status_code != 200:
        raise RuntimeError(f"Gemini models error: {resp.text}")
    models_data = resp.json().get("models", [])
    return [
        m["name"]
        for m in models_data
        if "generateContent" in m.get("supportedGenerationMethods", [])
    ]


def choose_gemini_model(api_key, requested_model, timeout_seconds):
    valid_models = fetch_gemini_models(api_key, timeout_seconds)
    if not valid_models:
        raise RuntimeError("No generative Gemini models available for this API key.")
    if requested_model and requested_model in valid_models:
        return requested_model
    flash_models = [m for m in valid_models if "flash" in m]
    if flash_models:
        flash_models.sort(reverse=True)
        return flash_models[0]
    return valid_models[0]


def post_gemini_generate(api_key, requested_model, prompt, timeout_seconds):
    chosen_model = choose_gemini_model(api_key, requested_model, timeout_seconds)
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/"
        f"{chosen_model}:generateContent?key={api_key}"
    )
    payload = {"contents": [{"parts": [{"text": prompt}]}]}
    resp = requests.post(url, json=payload, timeout=timeout_seconds)
    if resp.status_code != 200:
        raise RuntimeError(f"Gemini API error: {resp.text}")
    result = resp.json()
    text = result["candidates"][0]["content"]["parts"][0]["text"].strip()
    return chosen_model, text


def build_summary_prompt(text):
    return (
        "Please provide a concise but comprehensive summary of the following text.\n"
        "Return only plain text. Do not use Markdown, headings, bullet lists, numbered lists, bold text, tables, code blocks, or special formatting characters.\n"
        "Write the summary in short, clear paragraphs.\n\n"
        f"Text:\n{text}\n\n"
        "Plain text summary:"
    )


def build_quiz_prompt(text):
    return (
        "You are Agent B (Examiner). Generate a quiz of exactly 5 unique multiple-choice questions based on the text below.\n"
        "Each question must have 4 answer options (A, B, C, D) and exactly one correct answer.\n"
        "You must answer STRICTLY with a single valid JSON string matching this structure:\n"
        "{\n"
        "  \"questions\": [\n"
        "    {\n"
        "      \"question\": \"Question text\",\n"
        "      \"options\": {\n"
        "        \"A\": \"Answer 1\",\n"
        "        \"B\": \"Answer 2\",\n"
        "        \"C\": \"Answer 3\",\n"
        "        \"D\": \"Answer 4\"\n"
        "      },\n"
        "      \"correct_answer\": \"A\",\n"
        "      \"explanation\": \"Detailed explanation\"\n"
        "    }\n"
        "  ]\n"
        "}\n\n"
        "Do not add any text before or after the JSON.\n\n"
        f"Text:\n{text}\n"
    )


def build_qa_prompt(text, question):
    if text.strip():
        return (
            "You are an intelligent tutor. Answer the student's question using ONLY the information from the course context below.\n"
            "If the answer is NOT strictly contained in the context, you MUST reply exactly: \"Nu am gasit aceasta informatie in curs\".\n\n"
            f"Course Context:\n{text}\n\n"
            f"Student Question: {question}\n\n"
            "Answer:"
        )
    return (
        "You are an intelligent tutor that answers ONLY using the course content.\n"
        "Since no course context is available, you must answer exactly: \"Nu am gasit aceasta informatie in curs\"."
    )


def build_eval_collection(config, pdf_path, pages):
    chroma_dir = config.get("chroma_dir", "evals/chroma_db")
    embedding_model = config.get("embedding_model", "nomic-embed-text")
    ollama_url = config.get("ollama_url", "http://localhost:11434")
    chroma_path = resolve_path(BASE_DIR, chroma_dir)

    client = chromadb.PersistentClient(path=chroma_path)
    ollama_ef = OllamaEmbeddingFunction(
        url=f"{ollama_url}/api/embeddings",
        model_name=embedding_model,
    )

    digest = hashlib.sha256(os.path.abspath(pdf_path).encode("utf-8")).hexdigest()[:16]
    collection_name = f"evals_{digest}"
    collection = client.get_or_create_collection(
        name=collection_name,
        embedding_function=ollama_ef,
    )

    documents = []
    metadatas = []
    ids = []
    for page in pages:
        documents.append(page["text"])
        metadatas.append(
            {
                "source": os.path.basename(pdf_path),
                "page": page["page"],
                "file_path": pdf_path,
            }
        )
        ids.append(f"{digest}_page_{page['page']}")

    if documents:
        collection.upsert(documents=documents, metadatas=metadatas, ids=ids)

    return collection


def build_qa_context(collection, question, top_k):
    if not collection:
        return ""
    results = collection.query(
        query_texts=[question],
        n_results=top_k,
        include=["documents", "metadatas"],
    )
    docs = results.get("documents", [[]])[0]
    metas = results.get("metadatas", [[]])[0]
    if not docs:
        return ""
    parts = []
    for doc, meta in zip(docs, metas):
        source = meta.get("source", "")
        page = meta.get("page", "?")
        parts.append(f"From {source} (page {page}): {doc}")
    return "\n\n".join(parts)


def write_result(output_path, result):
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "a", encoding="utf-8") as f:
        f.write(json.dumps(result, ensure_ascii=True) + "\n")


def progress_tick(state, pdf_name, provider, model, task, question=None):
    state["current"] += 1
    total = state["total"]
    question_info = f" question={question}" if question else ""
    print(
        f"[{state['current']}/{total}] pdf={pdf_name} provider={provider} model={model} "
        f"task={task}{question_info}"
    )


def run_eval_for_model_pdf(
    config,
    model,
    pdf_path,
    text,
    pages,
    provider,
    gemini_api_key=None,
    progress_state=None,
):
    results = []
    timeout_seconds = config.get("timeout_seconds", 300)
    ollama_url = config.get("ollama_url", "http://localhost:11434")
    tasks = config.get("tasks", {})
    qa_cfg = tasks.get("qa", {})
    qa_use_embeddings = config.get("qa_use_embeddings", True)
    qa_top_k = config.get("qa_top_k", 5)

    collection = None
    if qa_cfg.get("enabled") and qa_use_embeddings and pages:
        collection = build_eval_collection(config, pdf_path, pages)

    if tasks.get("summarize"):
        if progress_state is not None:
            progress_tick(
                progress_state,
                os.path.basename(pdf_path),
                provider,
                model or "auto",
                "summarize",
            )
        prompt = build_summary_prompt(text)
        start = time.perf_counter()
        try:
            if provider == "gemini":
                used_model, response = post_gemini_generate(
                    gemini_api_key, model, prompt, timeout_seconds
                )
            else:
                used_model = model
                response = post_ollama_generate(ollama_url, model, prompt, timeout_seconds)
            ok = True
            error = None
        except Exception as exc:
            used_model = model
            response = ""
            ok = False
            error = str(exc)
        duration = time.perf_counter() - start
        results.append(
            {
                "task": "summarize",
                "response": response,
                "ok": ok,
                "error": error,
                "duration_s": round(duration, 3),
                "provider": provider,
                "used_model": used_model,
            }
        )

    if tasks.get("quiz"):
        if progress_state is not None:
            progress_tick(
                progress_state,
                os.path.basename(pdf_path),
                provider,
                model or "auto",
                "quiz",
            )
        prompt = build_quiz_prompt(text)
        start = time.perf_counter()
        try:
            if provider == "gemini":
                used_model, response = post_gemini_generate(
                    gemini_api_key, model, prompt, timeout_seconds
                )
            else:
                used_model = model
                response = post_ollama_generate(ollama_url, model, prompt, timeout_seconds)
            ok = True
            error = None
        except Exception as exc:
            used_model = model
            response = ""
            ok = False
            error = str(exc)
        duration = time.perf_counter() - start
        results.append(
            {
                "task": "quiz",
                "response": response,
                "ok": ok,
                "error": error,
                "duration_s": round(duration, 3),
                "provider": provider,
                "used_model": used_model,
            }
        )

    if qa_cfg.get("enabled"):
        for question in qa_cfg.get("questions", []):
            if progress_state is not None:
                progress_tick(
                    progress_state,
                    os.path.basename(pdf_path),
                    provider,
                    model or "auto",
                    "qa",
                    question=question,
                )
            context = ""
            if qa_use_embeddings:
                context = build_qa_context(collection, question, qa_top_k)
            prompt = build_qa_prompt(context or text, question)
            start = time.perf_counter()
            try:
                if provider == "gemini":
                    used_model, response = post_gemini_generate(
                        gemini_api_key, model, prompt, timeout_seconds
                    )
                else:
                    used_model = model
                    response = post_ollama_generate(ollama_url, model, prompt, timeout_seconds)
                ok = True
                error = None
            except Exception as exc:
                used_model = model
                response = ""
                ok = False
                error = str(exc)
            duration = time.perf_counter() - start
            results.append(
                {
                    "task": "qa",
                    "question": question,
                    "response": response,
                    "ok": ok,
                    "error": error,
                    "duration_s": round(duration, 3),
                    "provider": provider,
                    "used_model": used_model,
                }
            )

    return results


def main():
    config = load_config()
    pdf_dir = resolve_path(BASE_DIR, config.get("pdf_dir", "evals/inputs/pdfs"))
    output_path = resolve_path(BASE_DIR, config.get("output_file", "evals/outputs/results.jsonl"))
    max_input_chars = config.get("max_input_chars")
    gemini_cfg = config.get("gemini", {})
    gemini_enabled = gemini_cfg.get("enabled", False)
    gemini_api_key = gemini_cfg.get("api_key", "").strip()
    gemini_models = gemini_cfg.get("models", [])

    if not os.path.isdir(pdf_dir):
        raise RuntimeError(f"PDF directory not found: {pdf_dir}")

    pdf_files = [
        os.path.join(pdf_dir, name)
        for name in os.listdir(pdf_dir)
        if name.lower().endswith(".pdf")
    ]

    if not pdf_files:
        raise RuntimeError(f"No PDF files found in: {pdf_dir}")

    qa_cfg = config.get("tasks", {}).get("qa", {})
    task_count = 0
    if config.get("tasks", {}).get("summarize"):
        task_count += 1
    if config.get("tasks", {}).get("quiz"):
        task_count += 1
    if qa_cfg.get("enabled"):
        task_count += len(qa_cfg.get("questions", []))

    ollama_models = len(config.get("models", []))
    gemini_models_count = 0
    if gemini_enabled:
        gemini_models_count = len(gemini_models) if gemini_models else 1

    total_runs = len(pdf_files) * (ollama_models + gemini_models_count) * task_count
    if total_runs == 0:
        print("No tasks to run. Check models and tasks configuration.")
        return

    progress_state = {"current": 0, "total": total_runs}

    for pdf_path in pdf_files:
        print(f"\nProcessing PDF: {os.path.basename(pdf_path)}")
        pages = read_pdf_pages(pdf_path)
        text = read_pdf_text(pages, max_input_chars)
        for model in config.get("models", []):
            eval_results = run_eval_for_model_pdf(
                config,
                model,
                pdf_path,
                text,
                pages,
                provider="ollama",
                progress_state=progress_state,
            )
            for item in eval_results:
                record = {
                    "timestamp": datetime.utcnow().isoformat() + "Z",
                    "pdf": os.path.basename(pdf_path),
                    "model": item.get("used_model", model),
                    "provider": item.get("provider", "ollama"),
                    "task": item["task"],
                    "question": item.get("question"),
                    "duration_s": item["duration_s"],
                    "ok": item["ok"],
                    "error": item["error"],
                    "response": item["response"],
                }
                write_result(output_path, record)

        if gemini_enabled:
            if not gemini_api_key:
                raise RuntimeError("Gemini is enabled but api_key is missing in models.json")
            gemini_model_list = gemini_models if gemini_models else [None]
            for model in gemini_model_list:
                eval_results = run_eval_for_model_pdf(
                    config,
                    model,
                    pdf_path,
                    text,
                    pages,
                    provider="gemini",
                    gemini_api_key=gemini_api_key,
                    progress_state=progress_state,
                )
                for item in eval_results:
                    record = {
                        "timestamp": datetime.utcnow().isoformat() + "Z",
                        "pdf": os.path.basename(pdf_path),
                        "model": item.get("used_model", model),
                        "provider": item.get("provider", "gemini"),
                        "task": item["task"],
                        "question": item.get("question"),
                        "duration_s": item["duration_s"],
                        "ok": item["ok"],
                        "error": item["error"],
                        "response": item["response"],
                    }
                    write_result(output_path, record)


if __name__ == "__main__":
    main()
