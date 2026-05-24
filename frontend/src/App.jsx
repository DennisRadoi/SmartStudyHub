import { useState, useEffect, useRef } from "react";
import PDFViewer from "./PDFViewer";

const API_BASE = "http://localhost:8000/api";

const shimmerStyles = `
  @keyframes shimmer-glow {
    0% { background-position: 200% center; }
    100% { background-position: -200% center; }
  }
  .shimmer-text-dark {
    background: linear-gradient(270deg, #c9d1d9 30%, #ffffff 50%, #c9d1d9 70%);
    background-size: 200% auto;
    color: transparent;
    -webkit-background-clip: text;
    background-clip: text;
    animation: shimmer-glow 1.5s linear infinite;
  }
  .shimmer-text-light {
    background: linear-gradient(270deg, #57606a 30%, #ffffff 50%, #57606a 70%);
    background-size: 200% auto;
    color: transparent;
    -webkit-background-clip: text;
    background-clip: text;
    animation: shimmer-glow 1.5s linear infinite;
  }
`;

const theme = {
  light: {
    background: "#ffffff",
    surface: "#f8f9fa",
    cardBg: "#ffffff",
    text: "#24292f",
    textSecondary: "#57606a",
    border: "#d1d9e0",
    primary: "#0969da",
    success: "#1f7a33",
    error: "#b12a2f",
    buttonDisabled: "#8c959f",
  },
  dark: {
    background: "#01070d",
    surface: "#0d1117",
    cardBg: "#161b22",
    text: "#c9d1d9",
    textSecondary: "#8b949e",
    border: "#30363d",
    primary: "#58a6ff",
    success: "#56d364",
    error: "#f85149",
    buttonDisabled: "#484f58",
  },
};

// ─────────────────────────────────────────────
// Reusable scope toggle: "📄 Document" | "📚 Curs"
// ─────────────────────────────────────────────
function ScopeToggle({ value, onChange, currentTheme }) {
  const base = {
    padding: "8px 18px",
    borderRadius: "10px",
    border: "none",
    cursor: "pointer",
    fontWeight: "700",
    fontSize: "0.9rem",
    transition: "all 0.15s ease",
  };
  return (
    <div
      style={{
        display: "inline-flex",
        borderRadius: "12px",
        border: `1px solid ${currentTheme.border}`,
        overflow: "hidden",
        backgroundColor: currentTheme.surface,
      }}
    >
      <button
        onClick={() => onChange("document")}
        style={{
          ...base,
          backgroundColor:
            value === "document" ? currentTheme.primary : "transparent",
          color: value === "document" ? "#fff" : currentTheme.textSecondary,
        }}
      >
        📄 Document
      </button>
      <button
        onClick={() => onChange("course")}
        style={{
          ...base,
          backgroundColor:
            value === "course" ? currentTheme.primary : "transparent",
          color: value === "course" ? "#fff" : currentTheme.textSecondary,
        }}
      >
        📚 Curs întreg
      </button>
    </div>
  );
}

function App() {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(
    localStorage.getItem("smartStudyHub-token") || ""
  );
  const [authMode, setAuthMode] = useState("login");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");

  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [documents, setDocuments] = useState([]);
  const [dashboardStats, setDashboardStats] = useState({
    studied_files: 0,
    average_quiz_score: 0,
    quiz_attempts: 0,
  });
  const [courses, setCourses] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState("");
  const [newCourseTitle, setNewCourseTitle] = useState("");
  const [newCourseDescription, setNewCourseDescription] = useState("");

  // Summary section
  const [selectedDoc, setSelectedDoc] = useState("");
  const [summaryScopeMode, setSummaryScopeMode] = useState("document"); // 'document' | 'course'
  const [selectedSummarizeCourse, setSelectedSummarizeCourse] = useState("");
  const [summarizing, setSummarizing] = useState(false);
  const [summary, setSummary] = useState("");
  const [summaryLabel, setSummaryLabel] = useState("");

  // Quiz section
  const [quizScopeMode, setQuizScopeMode] = useState("document");
  const [selectedQuizDoc, setSelectedQuizDoc] = useState("");
  const [selectedQuizCourse, setSelectedQuizCourse] = useState("");
  const [showQuiz, setShowQuiz] = useState(false);
  const [quizGenerating, setQuizGenerating] = useState(false);
  const [quizData, setQuizData] = useState(null);
  const [quizAnswers, setQuizAnswers] = useState({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [quizLabel, setQuizLabel] = useState("");

  // Q&A section
  const [qaScopeMode, setQAScopeMode] = useState("document");
  const [selectedQADoc, setSelectedQADoc] = useState("");
  const [selectedQACourse, setSelectedQACourse] = useState("");
  const [chatMessage, setChatMessage] = useState("");
  const [chatHistory, setChatHistory] = useState([]);
  const [chatLoading, setChatLoading] = useState(false);

  const [darkMode, setDarkMode] = useState(() => {
    try {
      const saved = localStorage.getItem("smartStudyHub-darkMode");
      return saved && saved !== "undefined" ? JSON.parse(saved) : false;
    } catch (e) {
      return false;
    }
  });

  const [showPDFViewer, setShowPDFViewer] = useState(false);
  const [currentPDFUrl, setCurrentPDFUrl] = useState("");

  const [localModelAgentA, setLocalModelAgentA] = useState(() => {
    return localStorage.getItem("smartStudyHub-localModelAgentA") || "";
  });
  const [localModelAgentB, setLocalModelAgentB] = useState(() => {
    return localStorage.getItem("smartStudyHub-localModelAgentB") || "";
  });
  const [geminiModelAgentA, setGeminiModelAgentA] = useState(() => {
    return localStorage.getItem("smartStudyHub-geminiModelAgentA") || "";
  });
  const [geminiModelAgentB, setGeminiModelAgentB] = useState(() => {
    return localStorage.getItem("smartStudyHub-geminiModelAgentB") || "";
  });
  const [geminiModels, setGeminiModels] = useState([]);
  const [geminiModelsLoading, setGeminiModelsLoading] = useState(false);
  const [geminiModelsError, setGeminiModelsError] = useState("");
  const [ollamaModels, setOllamaModels] = useState([]);
  const [ollamaModelsLoading, setOllamaModelsLoading] = useState(false);
  const [ollamaModelsError, setOllamaModelsError] = useState("");
  const [ollamaModelToAdd, setOllamaModelToAdd] = useState("");
  const [ollamaPullProgress, setOllamaPullProgress] = useState(null);
  const [ollamaPullStatus, setOllamaPullStatus] = useState("");
  const [ollamaPulling, setOllamaPulling] = useState(false);
  const ollamaPullControllerRef = useRef(null);
  const [agentAModelSelection, setAgentAModelSelection] = useState(() => {
    return localStorage.getItem("smartStudyHub-agentAModelSelection") || "";
  });
  const [agentBModelSelection, setAgentBModelSelection] = useState(() => {
    return localStorage.getItem("smartStudyHub-agentBModelSelection") || "";
  });
  const chatEndRef = useRef(null);

  const [useGemini, setUseGemini] = useState(() => {
    try {
      const saved = localStorage.getItem("smartStudyHub-useGemini");
      return saved && saved !== "undefined" ? JSON.parse(saved) : false;
    } catch (e) {
      return false;
    }
  });

  const [geminiApiKey, setGeminiApiKey] = useState(() => {
    return localStorage.getItem("smartStudyHub-geminiApiKey") || "";
  });
  const [showSettings, setShowSettings] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [globalChatHistory, setGlobalChatHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const getGeminiDisplayName = (modelName) => {
    if (!modelName) return "Google Gemini";
    return modelName.split("/").pop();
  };
  const parseModelSelection = (value) => {
    if (!value) return { source: null, model: "" };
    if (value.startsWith("gemini:"))
      return { source: "gemini", model: value.slice("gemini:".length) };
    if (value.startsWith("ollama:"))
      return { source: "ollama", model: value.slice("ollama:".length) };
    return { source: null, model: value };
  };
  const agentASelection = parseModelSelection(agentAModelSelection);
  const agentBSelection = parseModelSelection(agentBModelSelection);
  const activeAgentAModelName =
    agentASelection.source === "gemini"
      ? getGeminiDisplayName(agentASelection.model)
      : agentASelection.model || "Agent A";
  const activeAgentBModelName =
    agentBSelection.source === "gemini"
      ? getGeminiDisplayName(agentBSelection.model)
      : agentBSelection.model || "Agent B";
  const currentTheme = darkMode ? theme.dark : theme.light;

  const fetchChatHistory = async () => {
    setLoadingHistory(true);
    try {
      const res = await fetch(`${API_BASE}/chat/history`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setGlobalChatHistory(data.history || []);
      }
    } catch (e) {
      console.error("Failed to fetch chat history", e);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Helper: get course title by id
  const getCourseTitle = (courseId) => {
    const c = courses.find((c) => c.id === courseId);
    return c ? c.title : courseId;
  };

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const response = await fetch(`${API_BASE}/config`);
        if (response.ok) {
          const data = await response.json();
          setLocalModelAgentA((prev) => prev || data.chat_model || "llama3");
          setLocalModelAgentB(
            (prev) => prev || data.generation_model || "mistral"
          );
        }
      } catch (error) {
        console.error("Fetch config error", error);
      }
    };
    fetchConfig();
  }, []);

  const fetchOllamaModels = async () => {
    if (!token) return;
    setOllamaModelsLoading(true);
    setOllamaModelsError("");
    try {
      const response = await fetch(`${API_BASE}/ollama/models`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok)
        throw new Error("Nu s-au putut prelua modelele Ollama.");
      const data = await response.json();
      setOllamaModels(data.models || []);
    } catch (error) {
      setOllamaModelsError(
        error.message || "Eroare la incarcarea modelelor Ollama."
      );
    } finally {
      setOllamaModelsLoading(false);
    }
  };

  useEffect(() => {
    if (token) fetchOllamaModels();
  }, [token]);

  useEffect(() => {
    if (!ollamaModels.length) return;
    setLocalModelAgentA((prev) =>
      ollamaModels.includes(prev) ? prev : ollamaModels[0]
    );
    setLocalModelAgentB((prev) =>
      ollamaModels.includes(prev) ? prev : ollamaModels[0]
    );
  }, [ollamaModels]);

  useEffect(() => {
    const ollamaOptions = ollamaModels.map((model) => `ollama:${model}`);
    const geminiOptions = useGemini
      ? geminiModels.map((model) => `gemini:${model}`)
      : [];
    const combinedOptions = [...ollamaOptions, ...geminiOptions];
    if (!combinedOptions.length) return;
    setAgentAModelSelection((prev) => {
      if (combinedOptions.includes(prev)) return prev;
      if (useGemini && geminiOptions.length) return geminiOptions[0];
      return ollamaOptions[0] || prev;
    });
    setAgentBModelSelection((prev) => {
      if (combinedOptions.includes(prev)) return prev;
      if (useGemini && geminiOptions.length) return geminiOptions[0];
      return ollamaOptions[0] || prev;
    });
  }, [ollamaModels, geminiModels, useGemini]);

  useEffect(() => {
    if (!useGemini || !geminiApiKey) {
      setGeminiModels([]);
      setGeminiModelsError("");
      return;
    }
    const controller = new AbortController();
    let isActive = true;
    const fetchGeminiModels = async () => {
      setGeminiModelsLoading(true);
      setGeminiModelsError("");
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${geminiApiKey}`,
          { signal: controller.signal }
        );
        if (!response.ok)
          throw new Error("Nu s-au putut prelua modelele Gemini.");
        const data = await response.json();
        const models = (data.models || [])
          .filter((model) =>
            (model.supportedGenerationMethods || []).includes("generateContent")
          )
          .map((model) => model.name);
        if (!models.length)
          throw new Error(
            "Nu exista modele Gemini disponibile pentru acest key."
          );
        if (!isActive) return;
        setGeminiModels(models);
        setGeminiModelAgentA((prev) =>
          models.includes(prev) ? prev : models[0]
        );
        setGeminiModelAgentB((prev) =>
          models.includes(prev) ? prev : models[0]
        );
      } catch (error) {
        if (!isActive || error.name === "AbortError") return;
        setGeminiModelsError(
          error.message || "Eroare la incarcarea modelelor Gemini."
        );
      } finally {
        if (isActive) setGeminiModelsLoading(false);
      }
    };
    fetchGeminiModels();
    return () => {
      isActive = false;
      controller.abort();
    };
  }, [useGemini, geminiApiKey]);

  useEffect(() => {
    if (token) fetchMe();
  }, [token]);

  useEffect(() => {
    if (user) {
      fetchDocuments();
      fetchDashboard();
      fetchCourses();
      fetchChatHistory();
    }
  }, [user]);

  const fetchDashboard = async () => {
    try {
      const response = await fetch(`${API_BASE}/dashboard`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setDashboardStats({
          studied_files: data.studied_files || 0,
          average_quiz_score: data.average_quiz_score || 0,
          quiz_attempts: data.quiz_attempts || 0,
        });
      }
    } catch (error) {
      console.error("Failed to load dashboard", error);
    }
  };

  const fetchCourses = async () => {
    try {
      const response = await fetch(`${API_BASE}/courses`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setCourses(data.courses || []);
      }
    } catch (error) {
      console.error("Failed to load courses", error);
    }
  };

  const handleCreateCourse = async () => {
    if (!newCourseTitle.trim()) return;
    try {
      const response = await fetch(`${API_BASE}/courses`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: newCourseTitle,
          description: newCourseDescription,
        }),
      });
      if (response.ok) {
        setNewCourseTitle("");
        setNewCourseDescription("");
        fetchCourses();
      }
    } catch (err) {
      console.error("Create course error", err);
    }
  };

  const handleDeleteCourse = async (courseId, courseTitle) => {
    if (
      !window.confirm(
        `Ștergi cursul "${courseTitle}"? Documentele rămân, dar nu vor mai fi asociate cu cursul.`
      )
    )
      return;
    try {
      const response = await fetch(`${API_BASE}/courses/${courseId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        if (selectedCourse === courseId) setSelectedCourse("");
        if (selectedSummarizeCourse === courseId)
          setSelectedSummarizeCourse("");
        if (selectedQuizCourse === courseId) setSelectedQuizCourse("");
        if (selectedQACourse === courseId) setSelectedQACourse("");
        fetchCourses();
        fetchDocuments();
      }
    } catch (err) {
      console.error("Delete course error", err);
    }
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory]);

  useEffect(() => {
    localStorage.setItem("smartStudyHub-darkMode", JSON.stringify(darkMode));
    document.documentElement.setAttribute(
      "data-theme",
      darkMode ? "dark" : "light"
    );
    document.body.style.backgroundColor = currentTheme.background;
    document.body.style.color = currentTheme.text;
  }, [darkMode, currentTheme.background, currentTheme.text]);

  useEffect(() => {
    localStorage.setItem("smartStudyHub-useGemini", JSON.stringify(useGemini));
    localStorage.setItem("smartStudyHub-geminiApiKey", geminiApiKey);
  }, [useGemini, geminiApiKey]);

  useEffect(() => {
    localStorage.setItem("smartStudyHub-localModelAgentA", localModelAgentA);
    localStorage.setItem("smartStudyHub-localModelAgentB", localModelAgentB);
  }, [localModelAgentA, localModelAgentB]);

  useEffect(() => {
    localStorage.setItem("smartStudyHub-geminiModelAgentA", geminiModelAgentA);
    localStorage.setItem("smartStudyHub-geminiModelAgentB", geminiModelAgentB);
  }, [geminiModelAgentA, geminiModelAgentB]);

  useEffect(() => {
    localStorage.setItem(
      "smartStudyHub-agentAModelSelection",
      agentAModelSelection
    );
    localStorage.setItem(
      "smartStudyHub-agentBModelSelection",
      agentBModelSelection
    );
  }, [agentAModelSelection, agentBModelSelection]);

  useEffect(() => {
    if (agentASelection.source === "gemini")
      setGeminiModelAgentA(agentASelection.model);
    else if (agentASelection.source === "ollama")
      setLocalModelAgentA(agentASelection.model);
  }, [agentASelection.source, agentASelection.model]);

  useEffect(() => {
    if (agentBSelection.source === "gemini")
      setGeminiModelAgentB(agentBSelection.model);
    else if (agentBSelection.source === "ollama")
      setLocalModelAgentB(agentBSelection.model);
  }, [agentBSelection.source, agentBSelection.model]);

  const toggleDarkMode = () => setDarkMode((prev) => !prev);

  const fetchMe = async () => {
    try {
      const response = await fetch(`${API_BASE}/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
      } else {
        setToken("");
        localStorage.removeItem("smartStudyHub-token");
      }
    } catch (error) {
      setToken("");
      localStorage.removeItem("smartStudyHub-token");
    }
  };

  const handleAuth = async (formData) => {
    setAuthLoading(true);
    setAuthError("");
    try {
      const endpoint = authMode === "login" ? "login" : "signup";
      const response = await fetch(`${API_BASE}/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const data = await response.json();
      if (response.ok) {
        setToken(data.token);
        localStorage.setItem("smartStudyHub-token", data.token);
        setUser(data.user);
      } else {
        setAuthError(data.detail || "Authentication failed");
      }
    } catch (error) {
      setAuthError("Network error. Please try again.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch(`${API_BASE}/logout`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (error) {}
    setToken("");
    setUser(null);
    setDocuments([]);
    setDashboardStats({
      studied_files: 0,
      average_quiz_score: 0,
      quiz_attempts: 0,
    });
    setSummary("");
    setSelectedDoc("");
    setShowPDFViewer(false);
    setCurrentPDFUrl("");
    setChatHistory([]);
    localStorage.removeItem("smartStudyHub-token");
  };

  const handlePullOllamaModel = async () => {
    if (!ollamaModelToAdd.trim() || !token) return;
    if (ollamaPullControllerRef.current)
      ollamaPullControllerRef.current.abort();
    const controller = new AbortController();
    ollamaPullControllerRef.current = controller;
    setOllamaPulling(true);
    setOllamaPullProgress(null);
    setOllamaPullStatus("Pornesc descarcarea...");
    try {
      const response = await fetch(`${API_BASE}/ollama/pull`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: ollamaModelToAdd.trim() }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body)
        throw new Error("Nu s-a putut porni descarcarea modelului.");
      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      let done = false;
      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop();
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const data = JSON.parse(line);
              if (data.type === "progress") {
                const completed = data.completed || 0;
                const total = data.total || 0;
                const percent =
                  total > 0 ? Math.round((completed / total) * 100) : 0;
                setOllamaPullProgress(percent);
                setOllamaPullStatus(data.status || "Descarcare in progres...");
              } else if (data.type === "error") {
                setOllamaPullStatus(data.message || "Eroare la descarcare.");
              } else if (data.type === "done") {
                setOllamaPullProgress(100);
                setOllamaPullStatus("Model instalat.");
              }
            } catch (err) {}
          }
        }
      }
      await fetchOllamaModels();
      setOllamaModelToAdd("");
    } catch (error) {
      if (error.name === "AbortError")
        setOllamaPullStatus("Descarcare anulata.");
      else setOllamaPullStatus(error.message || "Eroare la descarcare.");
    } finally {
      setOllamaPulling(false);
      ollamaPullControllerRef.current = null;
      setTimeout(() => {
        setOllamaPullProgress(null);
        setOllamaPullStatus("");
      }, 1500);
    }
  };

  const handleCancelOllamaPull = () => {
    if (ollamaPullControllerRef.current)
      ollamaPullControllerRef.current.abort();
  };

  // ─────────────────────────────────────────────
  // CHAT SUBMIT — supports course_id or filename
  // ─────────────────────────────────────────────
  const handleChatSubmit = async (e) => {
    e.preventDefault();
    if (!chatMessage.trim()) return;

    const messageToSend = chatMessage;
    setChatMessage("");
    setChatHistory((prev) => [
      ...prev,
      { role: "user", content: messageToSend },
      { role: "agent", content: "", isStreaming: true },
    ]);
    setChatLoading(true);

    try {
      const payload = {
        message: messageToSend,
        use_gemini: agentASelection.source === "gemini",
        gemini_api_key: geminiApiKey,
        local_model:
          agentASelection.source === "ollama" ? agentASelection.model : null,
        gemini_model:
          agentASelection.source === "gemini" ? agentASelection.model : null,
      };

      // Attach scope: course or document
      if (qaScopeMode === "course" && selectedQACourse) {
        payload.course_id = selectedQACourse;
      } else if (qaScopeMode === "document" && selectedQADoc) {
        payload.filename = selectedQADoc;
      }

      const res = await fetch(`${API_BASE}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        setChatHistory((prev) => {
          const newHistory = [...prev];
          newHistory[newHistory.length - 1] = {
            role: "agent",
            content: `Eroare: ${
              errData.detail || "Nu s-a putut comunica cu Agentul A."
            }`,
          };
          return newHistory;
        });
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let accumulatedText = "";
      let accumulatedBuffer = "";
      let done = false;

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          accumulatedBuffer += decoder.decode(value, { stream: true });
          const lines = accumulatedBuffer.split("\n");
          accumulatedBuffer = lines.pop();
          let statusMsg = null;
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const data = JSON.parse(line);
              if (data.type === "status") statusMsg = data.content;
              else if (data.type === "text") accumulatedText += data.content;
              else if (data.type === "model_name") {
                if (agentASelection.source === "gemini")
                  setGeminiModelAgentA((prev) => prev || data.content);
                else if (agentASelection.source === "ollama")
                  setLocalModelAgentA((prev) => prev || data.content);
              }
            } catch (err) {}
          }
          setChatHistory((prev) => {
            const newHistory = [...prev];
            const lastMsg = newHistory[newHistory.length - 1];
            if (lastMsg.role === "agent" && lastMsg.isStreaming) {
              if (accumulatedText) {
                lastMsg.content = accumulatedText;
                lastMsg.status = null;
              } else if (statusMsg) lastMsg.status = statusMsg;
            }
            return newHistory;
          });
        }
      }

      setChatHistory((prev) => {
        const newHistory = [...prev];
        const lastMsg = newHistory[newHistory.length - 1];
        if (lastMsg.role === "agent") lastMsg.isStreaming = false;
        return newHistory;
      });
    } catch (err) {
      setChatHistory((prev) => {
        const newHistory = [...prev];
        newHistory[newHistory.length - 1] = {
          role: "agent",
          content: "Eroare de rețea.",
        };
        return newHistory;
      });
    } finally {
      setChatLoading(false);
      setTimeout(fetchChatHistory, 500);
    }
  };

  const handleDeleteDocument = async (filename) => {
    if (
      !window.confirm(
        `Sunteți sigur că doriți să ștergeți documentul "${filename}"?`
      )
    )
      return;
    try {
      const response = await fetch(
        `${API_BASE}/documents/${encodeURIComponent(filename)}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      if (response.ok) {
        if (selectedDoc === filename) {
          setSelectedDoc("");
          setSummary("");
        }
        if (selectedQADoc === filename) setSelectedQADoc("");
        if (selectedQuizDoc === filename) setSelectedQuizDoc("");
        if (showPDFViewer && currentPDFUrl.includes(filename)) closePDFViewer();
        setMessage(`Documentul ${filename} a fost șters.`);
        await fetchDocuments();
        await fetchDashboard();
      } else {
        const data = await response.json();
        setMessage(data.detail || "Eroare la ștergerea documentului.");
      }
    } catch (error) {
      setMessage("Eroare rețea: " + error.message);
    }
  };

  const fetchDocuments = async () => {
    try {
      const response = await fetch(`${API_BASE}/documents`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setDocuments(data.documents);
      }
    } catch (error) {
      setMessage(
        "Unable to load documents. Please check backend connectivity."
      );
    }
  };

  const handleFileChange = (event) => {
    const selectedFile = event.target.files?.[0] || null;
    if (!selectedFile) {
      setFile(null);
      return;
    }
    if (!selectedFile.name.toLowerCase().endsWith(".pdf")) {
      setMessage("Only PDF files are allowed.");
      setFile(null);
      return;
    }
    if (selectedFile.size > 20 * 1024 * 1024) {
      setMessage("File exceeds the 20MB limit.");
      setFile(null);
      return;
    }
    setFile(selectedFile);
    setMessage("");
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setMessage("");
    const formData = new FormData();
    formData.append("file", file);
    try {
      const uploadUrl = selectedCourse
        ? `${API_BASE}/upload?course_id=${selectedCourse}`
        : `${API_BASE}/upload`;
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await response.json();
      if (response.ok) {
        setMessage(data.message || "Document uploaded successfully.");
        setFile(null);
        await fetchDocuments();
        await fetchDashboard();
      } else {
        setMessage(data.detail || "Upload failed. Please try again.");
      }
    } catch (error) {
      setMessage("Upload error: " + error.message);
    } finally {
      setUploading(false);
    }
  };

  // ─────────────────────────────────────────────
  // SUMMARIZE — handles both single doc & course
  // ─────────────────────────────────────────────
  const summarizeDocument = async (filename, courseId = null) => {
    const label = courseId
      ? `cursul "${getCourseTitle(courseId)}"`
      : `"${filename}"`;

    if (!filename && !courseId) {
      setMessage("Selectează un document sau curs pentru sumarizare.");
      return;
    }
    if (
      !window.confirm(
        `Sumarizarea ${label} poate dura mai mult timp. Doriți să continuați?`
      )
    )
      return;

    setSelectedDoc(filename || "");
    setSummaryLabel(label);
    setSummary("");
    setSummarizing(true);
    setMessage("");

    try {
      const endpoint = courseId
        ? `${API_BASE}/summarize-course/${courseId}`
        : `${API_BASE}/summarize/${encodeURIComponent(filename)}`;

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          use_gemini: agentBSelection.source === "gemini",
          gemini_api_key: geminiApiKey,
          local_model:
            agentBSelection.source === "ollama" ? agentBSelection.model : null,
          gemini_model:
            agentBSelection.source === "gemini" ? agentBSelection.model : null,
        }),
      });
      const data = await response.json();
      if (response.ok) {
        setSummary(data.summary);
      } else {
        setMessage(data.detail || "Summary generation failed.");
      }
    } catch (error) {
      setMessage("Error generating summary: " + error.message);
    } finally {
      setSummarizing(false);
    }
  };

  // ─────────────────────────────────────────────
  // QUIZ — handles both single doc & course
  // ─────────────────────────────────────────────
  const generateQuiz = async (filename, courseId = null) => {
    const label = courseId
      ? `cursul "${getCourseTitle(courseId)}"`
      : `"${filename}"`;

    if (!filename && !courseId) {
      setMessage("Selectează un document sau curs pentru quiz.");
      return;
    }

    setSelectedDoc(filename || "");
    setQuizLabel(label);
    setShowQuiz(true);
    setQuizData(null);
    setQuizAnswers({});
    setQuizSubmitted(false);
    setQuizGenerating(true);
    setMessage("");

    try {
      const endpoint = courseId
        ? `${API_BASE}/quiz-course/${courseId}`
        : `${API_BASE}/quiz/${encodeURIComponent(filename)}`;

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          use_gemini: agentBSelection.source === "gemini",
          gemini_api_key: geminiApiKey,
          local_model:
            agentBSelection.source === "ollama" ? agentBSelection.model : null,
          gemini_model:
            agentBSelection.source === "gemini" ? agentBSelection.model : null,
        }),
      });
      const data = await response.json();
      if (response.ok) {
        setQuizData(data.quiz);
      } else {
        setMessage(data.detail || "Quiz generation failed.");
      }
    } catch (error) {
      setMessage("Error during quiz generation: " + error.message);
    } finally {
      setQuizGenerating(false);
    }
  };

  const handleQuizAnswer = (index, answer) => {
    if (quizSubmitted) return;
    setQuizAnswers((prev) => ({ ...prev, [index]: answer }));
  };

  const calculateQuizScore = () => {
    if (!quizData?.questions?.length) return 0;
    return quizData.questions.reduce(
      (score, question, index) =>
        score + (quizAnswers[index] === question.correct_answer ? 1 : 0),
      0
    );
  };

  const submitQuiz = async () => {
    if (Object.keys(quizAnswers).length < quizData?.questions?.length) {
      setMessage("Vă rugăm să răspundeți la toate întrebările.");
      return;
    }
    const score = calculateQuizScore();
    setQuizSubmitted(true);

    // Save attempt only if we have a single doc reference (course quizzes save by course label)
    if (selectedDoc) {
      try {
        const response = await fetch(`${API_BASE}/quiz-attempts`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            filename: selectedDoc,
            score,
            total_questions: quizData.questions.length,
          }),
        });
        if (response.ok) await fetchDashboard();
      } catch (error) {
        console.error("Failed to save quiz attempt", error);
      }
    }
  };

  const handleCopySummary = async () => {
    if (!summary) return;
    try {
      await navigator.clipboard.writeText(summary);
      setMessage("Summary copied to clipboard.");
    } catch (error) {
      setMessage("Unable to copy summary.");
    }
  };

  const handleDownloadSummary = () => {
    if (!summary) return;
    const blob = new Blob([summary], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${summaryLabel || selectedDoc || "summary"}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const openPDFViewer = (document) => {
    setCurrentPDFUrl(`${API_BASE}/pdf/${document.filename}`);
    setShowPDFViewer(true);
  };

  const closePDFViewer = () => {
    setShowPDFViewer(false);
    setCurrentPDFUrl("");
  };

  // ── Documents filtered per course for quick-action buttons ──────────
  const docsByCourse = (courseId) =>
    documents.filter((d) => d.course_id === courseId);
  const docsWithoutCourse = documents.filter((d) => !d.course_id);

  // ── Auth screen ──────────────────────────────────────────────────────
  if (!user) {
    return (
      <div
        style={{
          minHeight: "100vh",
          padding: "24px",
          maxWidth: "480px",
          margin: "0 auto",
          color: currentTheme.text,
          backgroundColor: currentTheme.background,
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: "100%",
            padding: "32px",
            borderRadius: "24px",
            backgroundColor: currentTheme.surface,
            border: `1px solid ${currentTheme.border}`,
            boxShadow: darkMode
              ? "0 20px 60px rgba(0,0,0,0.18)"
              : "0 20px 60px rgba(15, 23, 42, 0.08)",
          }}
        >
          <div style={{ textAlign: "center", marginBottom: "32px" }}>
            <h1
              style={{
                margin: "0 0 8px",
                fontSize: "2rem",
                color: currentTheme.text,
              }}
            >
              Smart Study Hub
            </h1>
            <p style={{ margin: 0, color: currentTheme.textSecondary }}>
              Studiază mai inteligent, nu mai greu
            </p>
          </div>
          <div style={{ marginBottom: "24px", textAlign: "center" }}>
            {["login", "signup"].map((mode) => (
              <button
                key={mode}
                onClick={() => setAuthMode(mode)}
                style={{
                  padding: "12px 24px",
                  borderRadius: "12px",
                  border:
                    authMode === mode
                      ? `2px solid ${currentTheme.primary}`
                      : `1px solid ${currentTheme.border}`,
                  backgroundColor:
                    authMode === mode
                      ? currentTheme.primary
                      : currentTheme.surface,
                  color: authMode === mode ? "#ffffff" : currentTheme.text,
                  cursor: "pointer",
                  fontWeight: "700",
                  marginRight: mode === "login" ? "12px" : 0,
                }}
              >
                {mode === "login" ? "Login" : "Sign Up"}
              </button>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const data = Object.fromEntries(new FormData(e.target).entries());
              handleAuth(data);
            }}
          >
            <div style={{ display: "grid", gap: "16px" }}>
              {["username", "email", "password"].map((field) => (
                <input
                  key={field}
                  name={field}
                  type={
                    field === "password"
                      ? "password"
                      : field === "email"
                      ? "email"
                      : "text"
                  }
                  placeholder={field.charAt(0).toUpperCase() + field.slice(1)}
                  required
                  style={{
                    padding: "14px 16px",
                    borderRadius: "12px",
                    border: `1px solid ${currentTheme.border}`,
                    backgroundColor: currentTheme.cardBg,
                    color: currentTheme.text,
                    fontSize: "1rem",
                  }}
                />
              ))}
              {authMode === "signup" && (
                <input
                  name="developer_code"
                  type="password"
                  placeholder="Developer Code (optional)"
                  style={{
                    padding: "14px 16px",
                    borderRadius: "12px",
                    border: `1px solid ${currentTheme.border}`,
                    backgroundColor: currentTheme.cardBg,
                    color: currentTheme.text,
                    fontSize: "1rem",
                  }}
                />
              )}
              <button
                type="submit"
                disabled={authLoading}
                style={{
                  padding: "14px 16px",
                  borderRadius: "12px",
                  border: "none",
                  backgroundColor: authLoading
                    ? currentTheme.buttonDisabled
                    : currentTheme.primary,
                  color: "#ffffff",
                  cursor: authLoading ? "not-allowed" : "pointer",
                  fontWeight: "700",
                  fontSize: "1rem",
                }}
              >
                {authLoading
                  ? "Processing..."
                  : authMode === "login"
                  ? "Login"
                  : "Sign Up"}
              </button>
            </div>
          </form>
          {authError && (
            <div
              style={{
                marginTop: "16px",
                padding: "12px",
                borderRadius: "12px",
                backgroundColor: currentTheme.error,
                color: "#ffffff",
                textAlign: "center",
              }}
            >
              {authError}
            </div>
          )}
          <div style={{ marginTop: "24px", textAlign: "center" }}>
            <button
              onClick={toggleDarkMode}
              style={{
                padding: "8px 16px",
                borderRadius: "8px",
                border: `1px solid ${currentTheme.border}`,
                backgroundColor: currentTheme.surface,
                color: currentTheme.text,
                cursor: "pointer",
              }}
            >
              {darkMode ? "☀️ Light" : "🌙 Dark"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Main app ─────────────────────────────────────────────────────────
  return (
    <div
      style={{
        display: "flex",
        width: "100vw",
        minHeight: "100vh",
        overflowX: "hidden",
        color: currentTheme.text,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <style>{shimmerStyles}</style>

      {/* Chat-history sidebar */}
      <div
        style={{
          width: sidebarOpen ? "320px" : "0px",
          opacity: sidebarOpen ? 1 : 0,
          visibility: sidebarOpen ? "visible" : "hidden",
          backgroundColor: currentTheme.surface,
          borderRight: sidebarOpen
            ? `1px solid ${currentTheme.border}`
            : "none",
          transition: "width 0.3s ease, opacity 0.3s ease",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
          zIndex: 10,
        }}
      >
        {sidebarOpen && (
          <div
            style={{
              padding: "24px",
              flex: 1,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "16px",
              }}
            >
              <h2 style={{ fontSize: "1.2rem", margin: 0, fontWeight: "600" }}>
                Istoric Q&amp;A
              </h2>
              <button
                onClick={() => setSidebarOpen(false)}
                style={{
                  background: "none",
                  border: "none",
                  color: currentTheme.text,
                  cursor: "pointer",
                  fontSize: "1.2rem",
                }}
              >
                ✕
              </button>
            </div>
            {loadingHistory ? (
              <p style={{ color: currentTheme.textSecondary }}>
                Se încarcă istoricul...
              </p>
            ) : globalChatHistory.length === 0 ? (
              <p
                style={{
                  color: currentTheme.textSecondary,
                  fontSize: "0.9rem",
                }}
              >
                Nu există istoric.
              </p>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                }}
              >
                {globalChatHistory.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      backgroundColor: currentTheme.cardBg,
                      border: `1px solid ${currentTheme.border}`,
                      borderRadius: "8px",
                      padding: "12px",
                      fontSize: "0.9rem",
                    }}
                  >
                    <div
                      style={{
                        color: currentTheme.textSecondary,
                        marginBottom: "6px",
                        display: "flex",
                        justifyContent: "space-between",
                      }}
                    >
                      <strong>{item.filename || "General"}</strong>
                      <span style={{ fontSize: "0.75rem" }}>
                        {new Date(item.created_at * 1000).toLocaleDateString()}
                      </span>
                    </div>
                    <div style={{ fontWeight: "500", marginBottom: "8px" }}>
                      Q: {item.message}
                    </div>
                    <div
                      style={{
                        color: currentTheme.textSecondary,
                        maxHeight: "100px",
                        overflowY: "auto",
                      }}
                    >
                      A: {item.response}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div
        style={{
          flex: 1,
          minHeight: "100vh",
          padding: "24px",
          maxWidth: showPDFViewer ? "1800px" : "1240px",
          margin: "0 auto",
          color: currentTheme.text,
          backgroundColor: currentTheme.background,
          display: "flex",
          gap: showPDFViewer ? "24px" : "0",
          boxSizing: "border-box",
        }}
      >
        {/* Main content */}
        <div
          style={{
            flex: 1,
            width: showPDFViewer ? "50%" : "100%",
            transition: "all 0.3s ease",
          }}
        >
          {/* ── Header ── */}
          <header
            style={{
              marginBottom: "34px",
              padding: "28px 24px",
              borderRadius: "24px",
              background: darkMode ? "#03121d" : "#f6f8fa",
              border: `1px solid ${currentTheme.border}`,
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "space-between",
              gap: "16px",
              alignItems: "center",
            }}
          >
            <div>
              <div
                style={{ display: "flex", alignItems: "center", gap: "12px" }}
              >
                {!sidebarOpen && (
                  <button
                    onClick={() => setSidebarOpen(true)}
                    title="Deschide Istoricul de Conversații"
                    style={{
                      background: "none",
                      border: "none",
                      fontSize: "1.5rem",
                      cursor: "pointer",
                      color: currentTheme.text,
                      padding: "4px",
                      display: "flex",
                      alignItems: "center",
                    }}
                  >
                    ☰
                  </button>
                )}
                <p
                  style={{
                    margin: 0,
                    color: currentTheme.primary,
                    fontSize: "0.95rem",
                    fontWeight: "700",
                  }}
                >
                  SmartStudyHub
                </p>
              </div>
              <h1
                style={{
                  margin: "12px 0 8px 0",
                  fontSize: "2.6rem",
                  lineHeight: "1.05",
                  color: currentTheme.text,
                }}
              >
                Studiază mai inteligent, nu mai greu
              </h1>
              <p
                style={{
                  margin: 0,
                  color: currentTheme.textSecondary,
                  fontSize: "1rem",
                  maxWidth: "680px",
                }}
              >
                Încarcă PDF-uri, generează rezumate structurate și exportă
                notițele direct din browser.
              </p>
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-end",
                gap: "8px",
              }}
            >
              <p
                style={{
                  margin: 0,
                  color: currentTheme.primary,
                  fontSize: "1.1rem",
                  fontWeight: "600",
                }}
              >
                Salut, {user.username}!
              </p>
              <button
                onClick={handleLogout}
                style={{
                  padding: "8px 16px",
                  borderRadius: "8px",
                  border: `1px solid ${currentTheme.error}`,
                  backgroundColor: "transparent",
                  color: currentTheme.error,
                  cursor: "pointer",
                  fontSize: "0.9rem",
                  fontWeight: "600",
                }}
                onMouseOver={(e) => {
                  e.target.style.backgroundColor = currentTheme.error;
                  e.target.style.color = "#ffffff";
                }}
                onMouseOut={(e) => {
                  e.target.style.backgroundColor = "transparent";
                  e.target.style.color = currentTheme.error;
                }}
              >
                Logout
              </button>
            </div>
            <div style={{ display: "flex", gap: "12px" }}>
              <button
                onClick={() => setShowSettings(!showSettings)}
                style={{
                  padding: "12px 18px",
                  borderRadius: "12px",
                  border: `1px solid ${currentTheme.border}`,
                  backgroundColor: currentTheme.surface,
                  color: currentTheme.text,
                  cursor: "pointer",
                  fontWeight: "700",
                }}
              >
                ⚙️ Setări Model
              </button>
              <button
                onClick={toggleDarkMode}
                style={{
                  padding: "12px 18px",
                  borderRadius: "12px",
                  border: `1px solid ${currentTheme.border}`,
                  backgroundColor: currentTheme.surface,
                  color: currentTheme.text,
                  cursor: "pointer",
                  fontWeight: "700",
                }}
              >
                {darkMode ? "🌙 Dark Mode" : "☀️ Light Mode"}
              </button>
            </div>
          </header>

          {/* ── Settings panel ── */}
          {showSettings && (
            <section
              style={{
                marginBottom: "28px",
                padding: "24px",
                borderRadius: "24px",
                backgroundColor: currentTheme.surface,
                border: `1px solid ${currentTheme.border}`,
              }}
            >
              <h2
                style={{
                  margin: "0 0 16px",
                  color: currentTheme.text,
                  fontSize: "1.4rem",
                }}
              >
                Setări Model AI
              </h2>
              <div
                style={{
                  display: "flex",
                  gap: "12px",
                  alignItems: "flex-start",
                  flexWrap: "wrap",
                  rowGap: "20px",
                }}
              >
                <div
                  style={{
                    flex: "0 0 calc(50% - 6px)",
                    maxWidth: "calc(50% - 6px)",
                  }}
                >
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      cursor: "pointer",
                      marginBottom: "12px",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={useGemini}
                      onChange={(e) => setUseGemini(e.target.checked)}
                      style={{ width: "18px", height: "18px" }}
                    />
                    <span
                      style={{ color: currentTheme.text, fontWeight: "600" }}
                    >
                      Foloseste Google Gemini API
                    </span>
                  </label>
                  {useGemini && (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "8px",
                        marginBottom: "16px",
                      }}
                    >
                      <label
                        style={{
                          color: currentTheme.textSecondary,
                          fontSize: "0.9rem",
                        }}
                      >
                        Gemini API Key
                      </label>
                      <input
                        type="text"
                        value={geminiApiKey}
                        onChange={(e) => setGeminiApiKey(e.target.value)}
                        placeholder="Introdu cheia ta Gemini API..."
                        style={{
                          padding: "12px 16px",
                          borderRadius: "12px",
                          border: `1px solid ${currentTheme.border}`,
                          backgroundColor: currentTheme.cardBg,
                          color: currentTheme.text,
                          fontSize: "1rem",
                        }}
                      />
                      {geminiModelsLoading && (
                        <p
                          style={{
                            margin: 0,
                            fontSize: "0.85rem",
                            color: currentTheme.textSecondary,
                          }}
                        >
                          Se incarca modelele Gemini...
                        </p>
                      )}
                      {geminiModelsError && (
                        <p
                          style={{
                            margin: 0,
                            fontSize: "0.85rem",
                            color: currentTheme.error,
                          }}
                        >
                          {geminiModelsError}
                        </p>
                      )}
                    </div>
                  )}
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "8px",
                    }}
                  >
                    <label
                      style={{
                        color: currentTheme.textSecondary,
                        fontSize: "0.9rem",
                      }}
                    >
                      Adauga model Ollama
                    </label>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <input
                        type="text"
                        value={ollamaModelToAdd}
                        onChange={(e) => setOllamaModelToAdd(e.target.value)}
                        placeholder="Ex: llama3.1:8b"
                        style={{
                          flex: 1,
                          padding: "12px 16px",
                          borderRadius: "12px",
                          border: `1px solid ${currentTheme.border}`,
                          backgroundColor: currentTheme.cardBg,
                          color: currentTheme.text,
                          fontSize: "1rem",
                        }}
                      />
                      <button
                        onClick={handlePullOllamaModel}
                        disabled={ollamaPulling || !ollamaModelToAdd.trim()}
                        style={{
                          padding: "12px 16px",
                          borderRadius: "12px",
                          border: "none",
                          backgroundColor: ollamaPulling
                            ? currentTheme.buttonDisabled
                            : currentTheme.primary,
                          color: "#ffffff",
                          cursor: ollamaPulling ? "not-allowed" : "pointer",
                          fontWeight: "700",
                        }}
                      >
                        Adauga
                      </button>
                      <button
                        onClick={handleCancelOllamaPull}
                        disabled={!ollamaPulling}
                        style={{
                          padding: "12px 16px",
                          borderRadius: "12px",
                          border: `1px solid ${currentTheme.border}`,
                          backgroundColor: "transparent",
                          color: currentTheme.text,
                          cursor: ollamaPulling ? "pointer" : "not-allowed",
                          fontWeight: "700",
                        }}
                      >
                        Anuleaza
                      </button>
                    </div>
                    {ollamaPullStatus && (
                      <p
                        style={{
                          margin: 0,
                          fontSize: "0.85rem",
                          color: currentTheme.textSecondary,
                        }}
                      >
                        {ollamaPullStatus}
                      </p>
                    )}
                    {ollamaPullProgress !== null && (
                      <div
                        style={{
                          height: "8px",
                          borderRadius: "999px",
                          backgroundColor: currentTheme.border,
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            width: `${ollamaPullProgress}%`,
                            height: "100%",
                            backgroundColor: currentTheme.primary,
                            transition: "width 0.2s ease",
                          }}
                        />
                      </div>
                    )}
                  </div>
                </div>
                <div
                  style={{
                    flex: "0 0 calc(50% - 6px)",
                    maxWidth: "calc(50% - 6px)",
                  }}
                >
                  {[
                    [
                      "Model Agent A",
                      agentAModelSelection,
                      setAgentAModelSelection,
                    ],
                    [
                      "Model Agent B",
                      agentBModelSelection,
                      setAgentBModelSelection,
                    ],
                  ].map(([label, val, setter], i) => (
                    <div key={i}>
                      <label
                        style={{
                          color: currentTheme.textSecondary,
                          fontSize: "0.9rem",
                          display: "block",
                          marginTop: i > 0 ? "12px" : 0,
                        }}
                      >
                        {label}
                      </label>
                      <select
                        value={val}
                        onChange={(e) => setter(e.target.value)}
                        disabled={
                          !ollamaModels.length &&
                          (!useGemini || !geminiModels.length)
                        }
                        style={{
                          padding: "12px 16px",
                          borderRadius: "12px",
                          border: `1px solid ${currentTheme.border}`,
                          backgroundColor: currentTheme.cardBg,
                          color: currentTheme.text,
                          fontSize: "1rem",
                          width: "100%",
                        }}
                      >
                        {ollamaModels.map((model) => (
                          <option
                            key={`ollama:${model}`}
                            value={`ollama:${model}`}
                          >
                            {model}
                          </option>
                        ))}
                        {useGemini &&
                          geminiModels.map((model) => (
                            <option
                              key={`gemini:${model}`}
                              value={`gemini:${model}`}
                            >
                              {getGeminiDisplayName(model)}
                            </option>
                          ))}
                      </select>
                    </div>
                  ))}
                  {ollamaModelsLoading && (
                    <p
                      style={{
                        margin: 0,
                        fontSize: "0.85rem",
                        color: currentTheme.textSecondary,
                      }}
                    >
                      Se incarca modelele Ollama...
                    </p>
                  )}
                  {ollamaModelsError && (
                    <p
                      style={{
                        margin: 0,
                        fontSize: "0.85rem",
                        color: currentTheme.error,
                      }}
                    >
                      {ollamaModelsError}
                    </p>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* ── Dashboard stats ── */}
          <section
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "16px",
              marginBottom: "28px",
            }}
          >
            {[
              ["Fișiere studiate", dashboardStats.studied_files, null],
              [
                "Scor mediu quiz-uri",
                dashboardStats.quiz_attempts > 0
                  ? `${dashboardStats.average_quiz_score}%`
                  : "N/A",
                `${dashboardStats.quiz_attempts} quiz${
                  dashboardStats.quiz_attempts === 1 ? "" : "-uri"
                } finalizate`,
              ],
            ].map(([label, val, sub], i) => (
              <article
                key={i}
                style={{
                  padding: "22px",
                  borderRadius: "16px",
                  backgroundColor: currentTheme.surface,
                  border: `1px solid ${currentTheme.border}`,
                }}
              >
                <p
                  style={{
                    margin: "0 0 10px",
                    color: currentTheme.textSecondary,
                    fontSize: "0.95rem",
                    fontWeight: "700",
                  }}
                >
                  {label}
                </p>
                <div
                  style={{
                    color: currentTheme.text,
                    fontSize: "2.2rem",
                    lineHeight: 1,
                    fontWeight: "800",
                  }}
                >
                  {val}
                </div>
                {sub && (
                  <p
                    style={{
                      margin: "10px 0 0",
                      color: currentTheme.textSecondary,
                      fontSize: "0.9rem",
                    }}
                  >
                    {sub}
                  </p>
                )}
              </article>
            ))}
          </section>

          {/* ── Courses management ── */}
          <section
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "24px",
              marginBottom: "28px",
            }}
          >
            <article
              style={{
                borderRadius: "24px",
                padding: "28px",
                backgroundColor: currentTheme.surface,
                border: `1px solid ${currentTheme.border}`,
              }}
            >
              <h2 style={{ marginBottom: "16px", margin: "0 0 16px" }}>
                📚 Cursurile mele
              </h2>
              <p
                style={{
                  margin: "0 0 16px",
                  color: currentTheme.textSecondary,
                  fontSize: "0.95rem",
                }}
              >
                Creează cursuri pentru a organiza PDF-urile pe materii. Poți
                analiza sau chestiona întregul curs dintr-o dată.
              </p>

              {/* Create course form */}
              <div
                style={{
                  display: "flex",
                  gap: "12px",
                  marginBottom: "20px",
                  flexWrap: "wrap",
                }}
              >
                <input
                  placeholder="Titlu curs (ex: MDS, BD, SO)"
                  value={newCourseTitle}
                  onChange={(e) => setNewCourseTitle(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreateCourse()}
                  style={{
                    flex: 1,
                    minWidth: "160px",
                    padding: "12px",
                    borderRadius: "12px",
                    border: `1px solid ${currentTheme.border}`,
                    backgroundColor: currentTheme.cardBg,
                    color: currentTheme.text,
                  }}
                />
                <input
                  placeholder="Descriere (opțional)"
                  value={newCourseDescription}
                  onChange={(e) => setNewCourseDescription(e.target.value)}
                  style={{
                    flex: 2,
                    minWidth: "200px",
                    padding: "12px",
                    borderRadius: "12px",
                    border: `1px solid ${currentTheme.border}`,
                    backgroundColor: currentTheme.cardBg,
                    color: currentTheme.text,
                  }}
                />
                <button
                  onClick={handleCreateCourse}
                  disabled={!newCourseTitle.trim()}
                  style={{
                    padding: "12px 20px",
                    borderRadius: "12px",
                    border: "none",
                    backgroundColor: newCourseTitle.trim()
                      ? currentTheme.primary
                      : currentTheme.buttonDisabled,
                    color: "#fff",
                    fontWeight: "700",
                    cursor: newCourseTitle.trim() ? "pointer" : "not-allowed",
                  }}
                >
                  + Creează curs
                </button>
              </div>

              {/* Course cards */}
              {courses.length === 0 ? (
                <p
                  style={{
                    color: currentTheme.textSecondary,
                    fontSize: "0.9rem",
                  }}
                >
                  Nu ai cursuri. Creează primul curs pentru a organiza
                  documentele.
                </p>
              ) : (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px",
                  }}
                >
                  {courses.map((c) => {
                    const courseDocs = docsByCourse(c.id);
                    return (
                      <div
                        key={c.id}
                        style={{
                          borderRadius: "16px",
                          border: `1px solid ${
                            selectedCourse === c.id
                              ? currentTheme.primary
                              : currentTheme.border
                          }`,
                          backgroundColor:
                            selectedCourse === c.id
                              ? darkMode
                                ? "#112d4a"
                                : "#e7f5ff"
                              : currentTheme.cardBg,
                          padding: "16px 20px",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "flex-start",
                            flexWrap: "wrap",
                            gap: "8px",
                          }}
                        >
                          <div style={{ flex: 1 }}>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "10px",
                                marginBottom: "4px",
                              }}
                            >
                              <span
                                style={{
                                  fontWeight: "700",
                                  fontSize: "1.05rem",
                                  color: currentTheme.text,
                                }}
                              >
                                📘 {c.title}
                              </span>
                              <span
                                style={{
                                  fontSize: "0.8rem",
                                  color: currentTheme.textSecondary,
                                  backgroundColor: currentTheme.surface,
                                  padding: "2px 8px",
                                  borderRadius: "999px",
                                  border: `1px solid ${currentTheme.border}`,
                                }}
                              >
                                {courseDocs.length} fișier
                                {courseDocs.length !== 1 ? "e" : ""}
                              </span>
                            </div>
                            {c.description && (
                              <p
                                style={{
                                  margin: 0,
                                  color: currentTheme.textSecondary,
                                  fontSize: "0.9rem",
                                }}
                              >
                                {c.description}
                              </p>
                            )}
                            {/* Files in this course */}
                            {courseDocs.length > 0 && (
                              <div
                                style={{
                                  marginTop: "8px",
                                  display: "flex",
                                  flexWrap: "wrap",
                                  gap: "6px",
                                }}
                              >
                                {courseDocs.map((d) => (
                                  <span
                                    key={d.filename}
                                    style={{
                                      fontSize: "0.8rem",
                                      padding: "3px 10px",
                                      borderRadius: "8px",
                                      backgroundColor: currentTheme.surface,
                                      border: `1px solid ${currentTheme.border}`,
                                      color: currentTheme.textSecondary,
                                    }}
                                  >
                                    📄 {d.filename}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          <div
                            style={{
                              display: "flex",
                              gap: "8px",
                              flexShrink: 0,
                            }}
                          >
                            <button
                              onClick={() =>
                                setSelectedCourse(
                                  selectedCourse === c.id ? "" : c.id
                                )
                              }
                              style={{
                                padding: "7px 14px",
                                borderRadius: "8px",
                                border: `1px solid ${currentTheme.primary}`,
                                backgroundColor:
                                  selectedCourse === c.id
                                    ? currentTheme.primary
                                    : "transparent",
                                color:
                                  selectedCourse === c.id
                                    ? "#fff"
                                    : currentTheme.primary,
                                cursor: "pointer",
                                fontWeight: "600",
                                fontSize: "0.85rem",
                              }}
                            >
                              {selectedCourse === c.id
                                ? "✓ Selectat"
                                : "Selectează"}
                            </button>
                            <button
                              onClick={() => handleDeleteCourse(c.id, c.title)}
                              style={{
                                padding: "7px 14px",
                                borderRadius: "8px",
                                border: `1px solid ${currentTheme.error}`,
                                backgroundColor: "transparent",
                                color: currentTheme.error,
                                cursor: "pointer",
                                fontWeight: "600",
                                fontSize: "0.85rem",
                              }}
                            >
                              Șterge
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </article>

            {/* ── Upload section ── */}
            <article
              style={{
                borderRadius: "24px",
                padding: "28px",
                backgroundColor: currentTheme.surface,
                border: `1px solid ${currentTheme.border}`,
                boxShadow: darkMode
                  ? "0 20px 60px rgba(0,0,0,0.18)"
                  : "0 20px 60px rgba(15, 23, 42, 0.08)",
              }}
            >
              <h2
                style={{
                  margin: "0 0 16px",
                  color: currentTheme.text,
                  fontSize: "1.5rem",
                }}
              >
                Încarcă document
              </h2>
              <div style={{ marginBottom: "16px" }}>
                <label
                  style={{
                    color: currentTheme.textSecondary,
                    fontSize: "0.9rem",
                    display: "block",
                    marginBottom: "6px",
                  }}
                >
                  Asociază cu un curs (opțional)
                </label>
                <select
                  value={selectedCourse}
                  onChange={(e) => setSelectedCourse(e.target.value)}
                  style={{
                    padding: "12px 16px",
                    borderRadius: "12px",
                    border: `1px solid ${currentTheme.border}`,
                    backgroundColor: currentTheme.cardBg,
                    color: currentTheme.text,
                    fontSize: "1rem",
                    minWidth: "220px",
                  }}
                >
                  <option value="">Fără curs</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
                {selectedCourse && (
                  <span
                    style={{
                      marginLeft: "12px",
                      fontSize: "0.9rem",
                      color: currentTheme.primary,
                      fontWeight: "600",
                    }}
                  >
                    → {getCourseTitle(selectedCourse)}
                  </span>
                )}
              </div>
              <p
                style={{
                  margin: "0 0 24px",
                  color: currentTheme.textSecondary,
                }}
              >
                PDF-uri de maxim 20MB. Vom extrage textul și le vom stoca pentru
                a genera rezumate rapide.
              </p>
              <div style={{ display: "grid", gap: "16px" }}>
                <input
                  type="file"
                  accept=".pdf"
                  onChange={handleFileChange}
                  style={{
                    width: "100%",
                    padding: "14px 16px",
                    borderRadius: "16px",
                    border: `1px solid ${currentTheme.border}`,
                    backgroundColor: currentTheme.cardBg,
                    color: currentTheme.text,
                    fontSize: "0.95rem",
                  }}
                />
                <button
                  onClick={handleUpload}
                  disabled={!file || uploading}
                  style={{
                    width: "fit-content",
                    padding: "14px 18px",
                    borderRadius: "16px",
                    border: "none",
                    backgroundColor:
                      !file || uploading
                        ? currentTheme.buttonDisabled
                        : currentTheme.success,
                    color: "#ffffff",
                    cursor: !file || uploading ? "not-allowed" : "pointer",
                    fontWeight: "700",
                  }}
                >
                  {uploading ? "Încarcare..." : "Încarcă PDF"}
                </button>
              </div>
              {message && (
                <div
                  style={{
                    marginTop: "24px",
                    padding: "16px",
                    borderRadius: "16px",
                    backgroundColor: currentTheme.primary,
                    color: "#ffffff",
                  }}
                >
                  {message}
                </div>
              )}
            </article>

            {/* ── Documents list ── */}
            <article
              style={{
                borderRadius: "24px",
                padding: "28px",
                backgroundColor: currentTheme.surface,
                border: `1px solid ${currentTheme.border}`,
                boxShadow: darkMode
                  ? "0 20px 60px rgba(0,0,0,0.18)"
                  : "0 20px 60px rgba(15, 23, 42, 0.08)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "12px",
                  flexWrap: "wrap",
                  marginBottom: "20px",
                }}
              >
                <div>
                  <h2
                    style={{
                      margin: "0 0 8px",
                      color: currentTheme.text,
                      fontSize: "1.5rem",
                    }}
                  >
                    Documente încărcate
                  </h2>
                  <p style={{ margin: 0, color: currentTheme.textSecondary }}>
                    Selectează un fișier sau folosește butonul direct din listă.
                  </p>
                </div>
                <span
                  style={{
                    color: currentTheme.textSecondary,
                    fontWeight: "700",
                  }}
                >
                  {documents.length} fișier{documents.length === 1 ? "" : "e"}
                </span>
              </div>

              {documents.length === 0 ? (
                <p style={{ color: currentTheme.textSecondary }}>
                  Nu ai încă documente. Încarcă primul PDF pentru a începe.
                </p>
              ) : (
                <ul
                  style={{
                    listStyle: "none",
                    padding: 0,
                    margin: 0,
                    display: "grid",
                    gap: "12px",
                  }}
                >
                  {documents.map((doc, index) => {
                    const courseName = doc.course_id
                      ? getCourseTitle(doc.course_id)
                      : null;
                    return (
                      <li
                        key={index}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr auto",
                          gap: "16px",
                          alignItems: "center",
                          padding: "16px 18px",
                          borderRadius: "16px",
                          backgroundColor: currentTheme.cardBg,
                          border: `1px solid ${currentTheme.border}`,
                        }}
                      >
                        <div>
                          <div
                            style={{
                              fontSize: "1rem",
                              fontWeight: "700",
                              color: currentTheme.text,
                            }}
                          >
                            📄 {doc.filename}
                          </div>
                          {courseName && (
                            <div
                              style={{
                                marginTop: "4px",
                                fontSize: "0.82rem",
                                color: currentTheme.primary,
                                fontWeight: "600",
                              }}
                            >
                              📘 {courseName}
                            </div>
                          )}
                        </div>
                        <div
                          style={{
                            display: "flex",
                            gap: "6px",
                            flexWrap: "wrap",
                          }}
                        >
                          <button
                            onClick={() => openPDFViewer(doc)}
                            style={{
                              padding: "7px 11px",
                              borderRadius: "6px",
                              border: `1px solid ${currentTheme.primary}`,
                              backgroundColor: currentTheme.primary,
                              color: "#ffffff",
                              cursor: "pointer",
                              fontWeight: "600",
                              fontSize: "0.82rem",
                            }}
                          >
                            PDF
                          </button>
                          <button
                            onClick={() => summarizeDocument(doc.filename)}
                            style={{
                              padding: "7px 11px",
                              borderRadius: "6px",
                              border: `1px solid ${currentTheme.primary}`,
                              backgroundColor: "transparent",
                              color: currentTheme.primary,
                              cursor: "pointer",
                              fontWeight: "600",
                              fontSize: "0.82rem",
                            }}
                          >
                            Rezumat
                          </button>
                          <button
                            onClick={() => generateQuiz(doc.filename)}
                            style={{
                              padding: "7px 11px",
                              borderRadius: "6px",
                              border: `1px solid #8a2be2`,
                              backgroundColor: "transparent",
                              color: "#8a2be2",
                              cursor: "pointer",
                              fontWeight: "600",
                              fontSize: "0.82rem",
                            }}
                          >
                            Quiz
                          </button>
                          <button
                            onClick={() => handleDeleteDocument(doc.filename)}
                            style={{
                              padding: "7px 11px",
                              borderRadius: "6px",
                              border: `1px solid ${currentTheme.error}`,
                              backgroundColor: "transparent",
                              color: currentTheme.error,
                              cursor: "pointer",
                              fontWeight: "600",
                              fontSize: "0.82rem",
                            }}
                          >
                            Șterge
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </article>
          </section>

          {/* ── Analysis & Quiz section ── */}
          <section
            style={{
              borderRadius: "24px",
              padding: "28px",
              backgroundColor: currentTheme.surface,
              border: `1px solid ${currentTheme.border}`,
              boxShadow: darkMode
                ? "0 20px 60px rgba(0,0,0,0.14)"
                : "0 20px 60px rgba(15, 23, 42, 0.07)",
              marginBottom: "28px",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                flexWrap: "wrap",
                gap: "16px",
                marginBottom: "22px",
              }}
            >
              <div>
                <h2
                  style={{
                    margin: "0 0 8px",
                    color: currentTheme.text,
                    fontSize: "1.6rem",
                  }}
                >
                  Analiză & Examinare cu {activeAgentBModelName}
                </h2>
                <p style={{ margin: 0, color: currentTheme.textSecondary }}>
                  Alege un document individual sau un curs întreg pentru rezumat
                  sau quiz.
                </p>
              </div>
            </div>

            {/* ── Summarize ── */}
            <div
              style={{
                marginBottom: "24px",
                padding: "20px",
                borderRadius: "16px",
                backgroundColor: currentTheme.cardBg,
                border: `1px solid ${currentTheme.border}`,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "16px",
                  marginBottom: "14px",
                  flexWrap: "wrap",
                }}
              >
                <h3
                  style={{
                    margin: 0,
                    fontSize: "1.1rem",
                    color: currentTheme.text,
                  }}
                >
                  📝 Rezumat
                </h3>
                <ScopeToggle
                  value={summaryScopeMode}
                  onChange={setSummaryScopeMode}
                  currentTheme={currentTheme}
                />
              </div>
              <div
                style={{
                  display: "flex",
                  gap: "12px",
                  flexWrap: "wrap",
                  alignItems: "center",
                }}
              >
                {summaryScopeMode === "document" ? (
                  <select
                    value={selectedDoc}
                    onChange={(e) => setSelectedDoc(e.target.value)}
                    style={{
                      flex: 1,
                      minWidth: "200px",
                      padding: "11px 14px",
                      borderRadius: "12px",
                      border: `1px solid ${currentTheme.border}`,
                      backgroundColor: currentTheme.surface,
                      color: currentTheme.text,
                      fontSize: "0.95rem",
                    }}
                  >
                    <option value="">— Alege un document —</option>
                    {documents.map((doc, i) => (
                      <option key={i} value={doc.filename}>
                        {doc.filename}
                        {doc.course_id
                          ? ` [${getCourseTitle(doc.course_id)}]`
                          : ""}
                      </option>
                    ))}
                  </select>
                ) : (
                  <select
                    value={selectedSummarizeCourse}
                    onChange={(e) => setSelectedSummarizeCourse(e.target.value)}
                    style={{
                      flex: 1,
                      minWidth: "200px",
                      padding: "11px 14px",
                      borderRadius: "12px",
                      border: `1px solid ${currentTheme.border}`,
                      backgroundColor: currentTheme.surface,
                      color: currentTheme.text,
                      fontSize: "0.95rem",
                    }}
                  >
                    <option value="">— Alege un curs —</option>
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title} ({docsByCourse(c.id).length} fișiere)
                      </option>
                    ))}
                  </select>
                )}
                <button
                  onClick={() =>
                    summaryScopeMode === "course"
                      ? summarizeDocument(null, selectedSummarizeCourse)
                      : summarizeDocument(selectedDoc)
                  }
                  disabled={
                    summarizing ||
                    (summaryScopeMode === "document"
                      ? !selectedDoc
                      : !selectedSummarizeCourse)
                  }
                  style={{
                    padding: "11px 20px",
                    borderRadius: "12px",
                    border: "none",
                    backgroundColor:
                      summarizing ||
                      (summaryScopeMode === "document"
                        ? !selectedDoc
                        : !selectedSummarizeCourse)
                        ? currentTheme.buttonDisabled
                        : currentTheme.primary,
                    color: "#ffffff",
                    cursor: "pointer",
                    fontWeight: "700",
                    whiteSpace: "nowrap",
                  }}
                >
                  {summarizing ? "Generare…" : "Generează rezumat"}
                </button>
              </div>
            </div>

            {/* ── Quiz ── */}
            <div
              style={{
                padding: "20px",
                borderRadius: "16px",
                backgroundColor: currentTheme.cardBg,
                border: `1px solid ${currentTheme.border}`,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "16px",
                  marginBottom: "14px",
                  flexWrap: "wrap",
                }}
              >
                <h3
                  style={{
                    margin: 0,
                    fontSize: "1.1rem",
                    color: currentTheme.text,
                  }}
                >
                  🎯 Quiz
                </h3>
                <ScopeToggle
                  value={quizScopeMode}
                  onChange={setQuizScopeMode}
                  currentTheme={currentTheme}
                />
              </div>
              <div
                style={{
                  display: "flex",
                  gap: "12px",
                  flexWrap: "wrap",
                  alignItems: "center",
                }}
              >
                {quizScopeMode === "document" ? (
                  <select
                    value={selectedQuizDoc}
                    onChange={(e) => setSelectedQuizDoc(e.target.value)}
                    style={{
                      flex: 1,
                      minWidth: "200px",
                      padding: "11px 14px",
                      borderRadius: "12px",
                      border: `1px solid ${currentTheme.border}`,
                      backgroundColor: currentTheme.surface,
                      color: currentTheme.text,
                      fontSize: "0.95rem",
                    }}
                  >
                    <option value="">— Alege un document —</option>
                    {documents.map((doc, i) => (
                      <option key={i} value={doc.filename}>
                        {doc.filename}
                        {doc.course_id
                          ? ` [${getCourseTitle(doc.course_id)}]`
                          : ""}
                      </option>
                    ))}
                  </select>
                ) : (
                  <select
                    value={selectedQuizCourse}
                    onChange={(e) => setSelectedQuizCourse(e.target.value)}
                    style={{
                      flex: 1,
                      minWidth: "200px",
                      padding: "11px 14px",
                      borderRadius: "12px",
                      border: `1px solid ${currentTheme.border}`,
                      backgroundColor: currentTheme.surface,
                      color: currentTheme.text,
                      fontSize: "0.95rem",
                    }}
                  >
                    <option value="">— Alege un curs —</option>
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title} ({docsByCourse(c.id).length} fișiere)
                      </option>
                    ))}
                  </select>
                )}
                <button
                  onClick={() =>
                    quizScopeMode === "course"
                      ? generateQuiz(null, selectedQuizCourse)
                      : generateQuiz(selectedQuizDoc)
                  }
                  disabled={
                    quizGenerating ||
                    (quizScopeMode === "document"
                      ? !selectedQuizDoc
                      : !selectedQuizCourse)
                  }
                  style={{
                    padding: "11px 20px",
                    borderRadius: "12px",
                    border: "none",
                    backgroundColor:
                      quizGenerating ||
                      (quizScopeMode === "document"
                        ? !selectedQuizDoc
                        : !selectedQuizCourse)
                        ? currentTheme.buttonDisabled
                        : "#8a2be2",
                    color: "#ffffff",
                    cursor: "pointer",
                    fontWeight: "700",
                    whiteSpace: "nowrap",
                  }}
                >
                  {quizGenerating ? "Generare Quiz…" : "Generează Quiz"}
                </button>
              </div>
            </div>

            {/* ── Summary display ── */}
            {!showQuiz && summary && (
              <div
                style={{
                  marginTop: "24px",
                  backgroundColor: currentTheme.cardBg,
                  border: `1px solid ${currentTheme.border}`,
                  borderRadius: "22px",
                  padding: "24px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "12px",
                    marginBottom: "20px",
                  }}
                >
                  <div>
                    <h3
                      style={{
                        margin: "0 0 6px",
                        color: currentTheme.text,
                        fontSize: "1.3rem",
                      }}
                    >
                      Rezumat — {summaryLabel}
                    </h3>
                    <p
                      style={{
                        margin: 0,
                        color: currentTheme.textSecondary,
                        fontSize: "0.95rem",
                      }}
                    >
                      Copiază sau exportă rezumatul pentru notițe.
                    </p>
                  </div>
                  <div
                    style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}
                  >
                    <button
                      onClick={handleCopySummary}
                      style={{
                        padding: "12px 16px",
                        borderRadius: "14px",
                        border: "none",
                        backgroundColor: currentTheme.primary,
                        color: "#ffffff",
                        cursor: "pointer",
                        fontWeight: "700",
                      }}
                    >
                      Copiază rezumatul
                    </button>
                    <button
                      onClick={handleDownloadSummary}
                      style={{
                        padding: "12px 16px",
                        borderRadius: "14px",
                        border: `1px solid ${currentTheme.border}`,
                        backgroundColor: currentTheme.surface,
                        color: currentTheme.text,
                        cursor: "pointer",
                        fontWeight: "700",
                      }}
                    >
                      Exportă text
                    </button>
                  </div>
                </div>
                <div
                  style={{
                    whiteSpace: "pre-wrap",
                    lineHeight: "1.8",
                    color: currentTheme.text,
                    fontSize: "1rem",
                  }}
                >
                  {summary}
                </div>
              </div>
            )}

            {/* ── Quiz display ── */}
            {showQuiz && (
              <div
                style={{
                  marginTop: "24px",
                  backgroundColor: currentTheme.cardBg,
                  border: `1px solid ${currentTheme.border}`,
                  borderRadius: "22px",
                  padding: "30px",
                  paddingRight: "10px",
                  position: "relative",
                }}
              >
                <button
                  onClick={() => setShowQuiz(false)}
                  style={{
                    position: "absolute",
                    top: "20px",
                    right: "25px",
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    color: currentTheme.textSecondary,
                    fontSize: "18px",
                  }}
                >
                  ✖
                </button>
                <h2
                  style={{
                    color: currentTheme.text,
                    marginTop: 0,
                    marginBottom: "6px",
                  }}
                >
                  Quiz — {quizLabel}
                </h2>
                <div
                  style={{
                    maxHeight: "60vh",
                    overflowY: "auto",
                    paddingRight: "15px",
                  }}
                >
                  {quizGenerating ? (
                    <div
                      style={{
                        textAlign: "center",
                        padding: "40px",
                        color: currentTheme.textSecondary,
                      }}
                    >
                      <div>
                        Agentul B concepe întrebările
                        {quizScopeMode === "course" ? " din întregul curs" : ""}{" "}
                        (poate dura puțin)...
                      </div>
                    </div>
                  ) : quizData ? (
                    <>
                      {quizData.questions?.map((q, index) => (
                        <div
                          key={index}
                          style={{
                            marginBottom: "25px",
                            padding: "20px",
                            borderRadius: "12px",
                            backgroundColor: currentTheme.surface,
                          }}
                        >
                          <p
                            style={{
                              fontWeight: "600",
                              marginBottom: "15px",
                              color: currentTheme.text,
                            }}
                          >
                            {index + 1}. {q.question}
                          </p>
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: "10px",
                            }}
                          >
                            {Object.entries(q.options).map(([key, value]) => {
                              const isSelected = quizAnswers[index] === key;
                              const showCorrect =
                                quizSubmitted && q.correct_answer === key;
                              const showWrong =
                                quizSubmitted &&
                                isSelected &&
                                q.correct_answer !== key;
                              let bgColor = currentTheme.cardBg,
                                bdColor = currentTheme.border;
                              if (showCorrect) {
                                bgColor = "rgba(46, 160, 67, 0.1)";
                                bdColor = "#2ea043";
                              } else if (showWrong) {
                                bgColor = "rgba(248, 81, 73, 0.1)";
                                bdColor = currentTheme.error;
                              } else if (isSelected) {
                                bdColor = currentTheme.primary;
                                bgColor = darkMode
                                  ? "rgba(88, 166, 255, 0.1)"
                                  : "#f0f6fc";
                              }
                              return (
                                <label
                                  key={key}
                                  style={{
                                    padding: "12px 15px",
                                    borderRadius: "8px",
                                    border: `1px solid ${bdColor}`,
                                    backgroundColor: bgColor,
                                    cursor: quizSubmitted
                                      ? "default"
                                      : "pointer",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "10px",
                                    color: currentTheme.text,
                                  }}
                                >
                                  <input
                                    type="radio"
                                    name={`question-${index}`}
                                    value={key}
                                    checked={isSelected}
                                    onChange={() =>
                                      handleQuizAnswer(index, key)
                                    }
                                    disabled={quizSubmitted}
                                    style={{ margin: 0 }}
                                  />
                                  <strong>{key})</strong> {value}
                                </label>
                              );
                            })}
                          </div>
                          {quizSubmitted && (
                            <div
                              style={{
                                marginTop: "15px",
                                padding: "15px",
                                backgroundColor:
                                  q.correct_answer === quizAnswers[index]
                                    ? "rgba(46, 160, 67, 0.1)"
                                    : "rgba(248, 81, 73, 0.1)",
                                borderRadius: "8px",
                                color: currentTheme.text,
                              }}
                            >
                              {q.correct_answer === quizAnswers[index] ? (
                                <span
                                  style={{
                                    color: "#2ea043",
                                    fontWeight: "bold",
                                  }}
                                >
                                  ✓ Corect!
                                </span>
                              ) : (
                                <span
                                  style={{
                                    color: currentTheme.error,
                                    fontWeight: "bold",
                                  }}
                                >
                                  ✗ Greșit. Răspunsul corect era{" "}
                                  {q.correct_answer}.
                                </span>
                              )}
                              <p
                                style={{ marginTop: "8px", fontSize: "0.9rem" }}
                              >
                                {q.explanation}
                              </p>
                            </div>
                          )}
                        </div>
                      ))}
                      <div style={{ marginTop: "30px", textAlign: "center" }}>
                        {quizSubmitted ? (
                          <div
                            style={{
                              padding: "20px",
                              borderRadius: "12px",
                              border: `2px solid ${currentTheme.primary}`,
                              color: currentTheme.text,
                            }}
                          >
                            <h3>
                              Scor Final: {calculateQuizScore()} /{" "}
                              {quizData.questions.length}
                            </h3>
                            <button
                              onClick={() =>
                                quizScopeMode === "course"
                                  ? generateQuiz(null, selectedQuizCourse)
                                  : generateQuiz(selectedQuizDoc)
                              }
                              style={{
                                padding: "10px 20px",
                                marginTop: "10px",
                                backgroundColor: currentTheme.primary,
                                color: "white",
                                border: "none",
                                borderRadius: "8px",
                                cursor: "pointer",
                                fontWeight: "bold",
                              }}
                            >
                              Generează alt quiz
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={submitQuiz}
                            style={{
                              padding: "12px 30px",
                              backgroundColor: "#2ea043",
                              color: "white",
                              border: "none",
                              borderRadius: "8px",
                              cursor: "pointer",
                              fontWeight: "bold",
                              fontSize: "16px",
                            }}
                          >
                            Trimite Răspunsurile
                          </button>
                        )}
                      </div>
                    </>
                  ) : (
                    <div style={{ color: currentTheme.error }}>
                      A apărut o problemă la afișarea quiz-ului.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Empty state for neither summary nor quiz showing */}
            {!showQuiz && !summary && !summarizing && (
              <div
                style={{
                  marginTop: "24px",
                  padding: "24px",
                  borderRadius: "22px",
                  border: `1px dashed ${currentTheme.border}`,
                  backgroundColor: currentTheme.cardBg,
                  minHeight: "120px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: currentTheme.textSecondary,
                }}
              >
                <p style={{ margin: 0 }}>
                  Selectează un document sau un curs, apoi generează un rezumat
                  sau quiz.
                </p>
              </div>
            )}
          </section>

          {/* ── Q&A Section ── */}
          <section
            style={{
              marginTop: "28px",
              borderRadius: "24px",
              padding: "28px",
              backgroundColor: currentTheme.surface,
              border: `1px solid ${currentTheme.border}`,
              boxShadow: darkMode
                ? "0 20px 60px rgba(0,0,0,0.14)"
                : "0 20px 60px rgba(15, 23, 42, 0.07)",
            }}
          >
            <div style={{ marginBottom: "22px" }}>
              <h2
                style={{
                  margin: "0 0 8px",
                  color: currentTheme.text,
                  fontSize: "1.6rem",
                }}
              >
                Q&amp;A cu {activeAgentAModelName}
              </h2>
              <p style={{ margin: 0, color: currentTheme.textSecondary }}>
                Adresează întrebări despre un document specific sau despre tot
                conținutul unui curs.
              </p>
            </div>

            {/* Scope toggle + selector */}
            <div
              style={{
                display: "flex",
                gap: "16px",
                flexWrap: "wrap",
                alignItems: "center",
                marginBottom: "22px",
              }}
            >
              <ScopeToggle
                value={qaScopeMode}
                onChange={(v) => {
                  setQAScopeMode(v);
                  setChatHistory([]);
                }}
                currentTheme={currentTheme}
              />
              {qaScopeMode === "document" ? (
                <select
                  value={selectedQADoc}
                  onChange={(e) => setSelectedQADoc(e.target.value)}
                  style={{
                    padding: "11px 14px",
                    borderRadius: "14px",
                    border: `1px solid ${currentTheme.border}`,
                    backgroundColor: currentTheme.cardBg,
                    color: currentTheme.text,
                    fontSize: "0.95rem",
                    minWidth: "220px",
                  }}
                >
                  <option value="">Toate documentele mele</option>
                  {documents.map((doc, i) => (
                    <option key={i} value={doc.filename}>
                      {doc.filename}
                      {doc.course_id
                        ? ` [${getCourseTitle(doc.course_id)}]`
                        : ""}
                    </option>
                  ))}
                </select>
              ) : (
                <select
                  value={selectedQACourse}
                  onChange={(e) => {
                    setSelectedQACourse(e.target.value);
                    setChatHistory([]);
                  }}
                  style={{
                    padding: "11px 14px",
                    borderRadius: "14px",
                    border: `1px solid ${currentTheme.border}`,
                    backgroundColor: currentTheme.cardBg,
                    color: currentTheme.text,
                    fontSize: "0.95rem",
                    minWidth: "220px",
                  }}
                >
                  <option value="">— Alege un curs —</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title} ({docsByCourse(c.id).length} fișiere)
                    </option>
                  ))}
                </select>
              )}
              {qaScopeMode === "course" && selectedQACourse && (
                <span
                  style={{
                    fontSize: "0.85rem",
                    color: currentTheme.textSecondary,
                  }}
                >
                  Caută în {docsByCourse(selectedQACourse).length} fișiere din
                  cursul „{getCourseTitle(selectedQACourse)}"
                </span>
              )}
            </div>

            {/* Chat window */}
            <div
              style={{
                backgroundColor: currentTheme.cardBg,
                border: `1px solid ${currentTheme.border}`,
                borderRadius: "22px",
                padding: "24px",
                display: "flex",
                flexDirection: "column",
                minHeight: "300px",
                maxHeight: "500px",
              }}
            >
              <div
                style={{
                  flex: 1,
                  overflowY: "auto",
                  display: "flex",
                  flexDirection: "column",
                  gap: "16px",
                  marginBottom: "20px",
                }}
              >
                {chatHistory.length === 0 ? (
                  <div
                    style={{
                      textAlign: "center",
                      color: currentTheme.textSecondary,
                      margin: "auto",
                    }}
                  >
                    {qaScopeMode === "course" && !selectedQACourse
                      ? "Selectează un curs pentru a începe conversația."
                      : "Nu există mesaje. Începe o conversație!"}
                  </div>
                ) : (
                  chatHistory.map((msg, i) => (
                    <div
                      key={i}
                      style={{
                        alignSelf:
                          msg.role === "user" ? "flex-end" : "flex-start",
                        backgroundColor:
                          msg.role === "user"
                            ? currentTheme.primary
                            : currentTheme.surface,
                        color: msg.role === "user" ? "#fff" : currentTheme.text,
                        padding: "12px 18px",
                        borderRadius: "16px",
                        border:
                          msg.role === "user"
                            ? "none"
                            : `1px solid ${currentTheme.border}`,
                        maxWidth: "80%",
                        lineHeight: "1.5",
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      <div
                        style={{
                          fontSize: "0.85rem",
                          opacity: 0.8,
                          marginBottom: "4px",
                        }}
                      >
                        {msg.role === "user" ? "Tu" : activeAgentAModelName}
                      </div>
                      {msg.status && !msg.content && (
                        <div
                          className={
                            darkMode
                              ? "shimmer-text-dark"
                              : "shimmer-text-light"
                          }
                          style={{ fontStyle: "italic" }}
                        >
                          {msg.status}
                        </div>
                      )}
                      {msg.content && (
                        <div style={{ opacity: msg.isStreaming ? 0.9 : 1 }}>
                          {msg.content}
                        </div>
                      )}
                    </div>
                  ))
                )}
                <div ref={chatEndRef} />
              </div>
              <form
                onSubmit={handleChatSubmit}
                style={{ display: "flex", gap: "12px" }}
              >
                <input
                  type="text"
                  value={chatMessage}
                  onChange={(e) => setChatMessage(e.target.value)}
                  placeholder={
                    qaScopeMode === "course" && selectedQACourse
                      ? `Întreabă despre cursul "${getCourseTitle(
                          selectedQACourse
                        )}"...`
                      : "Întreabă ceva..."
                  }
                  disabled={qaScopeMode === "course" && !selectedQACourse}
                  style={{
                    flex: 1,
                    padding: "14px 18px",
                    borderRadius: "16px",
                    border: `1px solid ${currentTheme.border}`,
                    backgroundColor: currentTheme.surface,
                    color: currentTheme.text,
                    fontSize: "1rem",
                  }}
                />
                <button
                  type="submit"
                  disabled={
                    chatLoading ||
                    !chatMessage.trim() ||
                    (qaScopeMode === "course" && !selectedQACourse)
                  }
                  style={{
                    padding: "14px 24px",
                    borderRadius: "16px",
                    border: "none",
                    backgroundColor:
                      chatLoading ||
                      !chatMessage.trim() ||
                      (qaScopeMode === "course" && !selectedQACourse)
                        ? currentTheme.buttonDisabled
                        : currentTheme.primary,
                    color: "#ffffff",
                    cursor: "pointer",
                    fontWeight: "700",
                  }}
                >
                  Trimite
                </button>
              </form>
            </div>
          </section>
        </div>

        {/* PDF Viewer Side Panel */}
        {showPDFViewer && (
          <PDFViewer
            pdfUrl={currentPDFUrl}
            token={token}
            onClose={closePDFViewer}
            currentTheme={currentTheme}
            darkMode={darkMode}
          />
        )}
      </div>
    </div>
  );
}

export default App;
