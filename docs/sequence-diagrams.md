# Diagrame de secventa

Aceste diagrame arata fluxurile principale din aplicatie.

## 1. Incarcare document PDF

```mermaid
sequenceDiagram
    actor Student
    participant FE as React Frontend
    participant BE as FastAPI Backend
    participant FS as Folder uploads
    participant PDF as PDF Reader
    participant CDB as ChromaDB
    participant SQL as SQLite

    Student->>FE: Selecteaza PDF
    Student->>FE: Apasa Incarca PDF
    FE->>BE: POST /api/upload
    BE->>FS: Salveaza fisierul PDF
    BE->>PDF: Extrage textul din PDF
    BE->>CDB: Salveaza textul si embeddings
    BE->>SQL: Salveaza metadata documentului
    BE-->>FE: Raspuns cu status succes
    FE-->>Student: Documentul apare in lista
```

## 2. Generare rezumat

```mermaid
sequenceDiagram
    actor Student
    participant FE as React Frontend
    participant BE as FastAPI Backend
    participant CDB as ChromaDB
    participant LLM as Ollama sau Gemini

    Student->>FE: Alege documentul
    Student->>FE: Apasa Genereaza rezumat
    FE->>BE: POST /api/summarize/{filename}
    BE->>CDB: Citeste continutul documentului
    BE->>LLM: Trimite promptul de sumarizare
    LLM-->>BE: Returneaza rezumatul
    BE->>BE: Curata formatarea Markdown
    BE-->>FE: Returneaza rezumat plain text
    FE-->>Student: Afiseaza rezumatul
```

## 3. Generare quiz si actualizare dashboard

```mermaid
sequenceDiagram
    actor Student
    participant FE as React Frontend
    participant BE as FastAPI Backend
    participant CDB as ChromaDB
    participant LLM as Ollama sau Gemini
    participant SQL as SQLite

    Student->>FE: Alege documentul
    Student->>FE: Apasa Genereaza Quiz
    FE->>BE: POST /api/quiz/{filename}
    BE->>CDB: Citeste continutul documentului
    BE->>LLM: Cere quiz in format JSON
    LLM-->>BE: Returneaza intrebarile
    BE-->>FE: Trimite quiz-ul
    FE-->>Student: Afiseaza intrebarile

    Student->>FE: Completeaza raspunsurile
    Student->>FE: Apasa Trimite raspunsurile
    FE->>FE: Calculeaza scorul
    FE->>BE: POST /api/quiz-attempts
    BE->>SQL: Salveaza scorul
    FE->>BE: GET /api/dashboard
    BE->>SQL: Calculeaza numar fisiere si scor mediu
    BE-->>FE: Returneaza statisticile
    FE-->>Student: Actualizeaza dashboard-ul
```

## 4. Intrebare catre asistentul AI

```mermaid
sequenceDiagram
    actor Student
    participant FE as React Frontend
    participant BE as FastAPI Backend
    participant CDB as ChromaDB
    participant LLM as Ollama sau Gemini
    participant SQL as SQLite

    Student->>FE: Scrie o intrebare
    FE->>BE: POST /api/chat
    BE->>CDB: Cauta fragmente relevante din documente
    BE->>LLM: Trimite intrebarea si contextul gasit
    LLM-->>BE: Genereaza raspunsul
    BE-->>FE: Trimite raspunsul incremental
    BE->>SQL: Salveaza conversatia in istoric
    FE-->>Student: Afiseaza raspunsul asistentului
```

