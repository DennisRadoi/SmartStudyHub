# Diagrame proiect Smart Study Hub

Acest document contine diagrame UML, arhitectura componentelor si workflow-uri pentru aplicatia Smart Study Hub.

## 1. Diagrama Use Case

Arata functionalitatile principale disponibile pentru un student.

```mermaid
flowchart LR
    Student((Student))

    Login[Autentificare]
    Upload[Incarca document PDF]
    ViewPDF[Vizualizeaza PDF]
    Summary[Genereaza rezumat]
    Quiz[Genereaza quiz]
    SubmitQuiz[Trimite raspunsuri quiz]
    Dashboard[Vizualizeaza dashboard]
    Chat[Intreaba asistentul AI]
    Courses[Gestioneaza cursuri]

    Student --> Login
    Student --> Upload
    Student --> ViewPDF
    Student --> Summary
    Student --> Quiz
    Student --> SubmitQuiz
    Student --> Dashboard
    Student --> Chat
    Student --> Courses
```

## 2. Arhitectura componentelor

Arata componentele tehnice principale si modul in care comunica intre ele.

```mermaid
flowchart TB
    User[Student in browser]
    Frontend[React + Vite Frontend]
    Backend[FastAPI Backend]
    SQLite[(SQLite auth.db)]
    Chroma[(ChromaDB Vector DB)]
    Uploads[(PDF uploads)]
    Ollama[Ollama local models]
    Gemini[Google Gemini API optional]

    User --> Frontend
    Frontend -->|HTTP REST API| Backend
    Backend --> SQLite
    Backend --> Chroma
    Backend --> Uploads
    Backend -->|Local LLM calls| Ollama
    Backend -->|Cloud LLM calls optional| Gemini
```

## 3. Workflow incarcare document PDF

Arata pasii prin care un PDF este incarcat, procesat si salvat pentru cautare ulterioara.

```mermaid
sequenceDiagram
    actor Student
    participant FE as React Frontend
    participant BE as FastAPI Backend
    participant FS as Uploads Folder
    participant PDF as PDF Reader
    participant CDB as ChromaDB
    participant SQL as SQLite

    Student->>FE: Selecteaza PDF si apasa Incarca
    FE->>BE: POST /api/upload
    BE->>FS: Salveaza fisierul PDF
    BE->>PDF: Extrage textul din pagini
    BE->>CDB: Salveaza text + embeddings
    BE->>SQL: Salveaza metadata document
    BE-->>FE: Returneaza mesaj de succes
    FE-->>Student: Afiseaza documentul in lista
```

## 4. Workflow generare rezumat

Arata cum este generat rezumatul pentru un document incarcat.

```mermaid
sequenceDiagram
    actor Student
    participant FE as React Frontend
    participant BE as FastAPI Backend
    participant CDB as ChromaDB
    participant LLM as Ollama sau Gemini

    Student->>FE: Alege document si apasa Genereaza rezumat
    FE->>BE: POST /api/summarize/{filename}
    BE->>CDB: Citeste textul documentului
    BE->>LLM: Trimite prompt de sumarizare
    LLM-->>BE: Returneaza rezumat
    BE->>BE: Curata formatarea Markdown
    BE-->>FE: Returneaza rezumat plain text
    FE-->>Student: Afiseaza rezumatul
```

## 5. Workflow quiz si dashboard

Arata cum se genereaza un quiz, cum este salvat scorul si cum se actualizeaza dashboard-ul.

```mermaid
sequenceDiagram
    actor Student
    participant FE as React Frontend
    participant BE as FastAPI Backend
    participant CDB as ChromaDB
    participant LLM as Ollama sau Gemini
    participant SQL as SQLite

    Student->>FE: Apasa Genereaza Quiz
    FE->>BE: POST /api/quiz/{filename}
    BE->>CDB: Citeste continutul documentului
    BE->>LLM: Cere 5 intrebari grila in JSON
    LLM-->>BE: Returneaza quiz JSON
    BE-->>FE: Trimite quiz-ul
    FE-->>Student: Afiseaza intrebarile

    Student->>FE: Trimite raspunsurile
    FE->>FE: Calculeaza scorul
    FE->>BE: POST /api/quiz-attempts
    BE->>SQL: Salveaza scorul
    FE->>BE: GET /api/dashboard
    BE->>SQL: Calculeaza fisiere studiate si scor mediu
    BE-->>FE: Returneaza statistici
    FE-->>Student: Actualizeaza dashboard-ul
```

## 6. Model simplificat de date

Arata entitatile principale persistate in SQLite.

```mermaid
erDiagram
    USERS ||--o{ TOKENS : has
    USERS ||--o{ DOCUMENTS : owns
    USERS ||--o{ COURSES : creates
    USERS ||--o{ CHAT_HISTORY : has
    USERS ||--o{ QUIZ_ATTEMPTS : completes
    COURSES ||--o{ DOCUMENTS : groups

    USERS {
        string id PK
        string username
        string email
        string password_hash
        string role
    }

    DOCUMENTS {
        string id PK
        string owner_id FK
        string filename
        string source
        string file_path
        string course_id FK
        float uploaded_at
    }

    COURSES {
        string id PK
        string owner_id FK
        string title
        string description
        float created_at
    }

    QUIZ_ATTEMPTS {
        string id PK
        string user_id FK
        string filename
        int score
        int total_questions
        float created_at
    }

    CHAT_HISTORY {
        string id PK
        string user_id FK
        string filename
        string message
        string response
        float created_at
    }

    TOKENS {
        string token PK
        string user_id FK
        float created_at
    }
```
