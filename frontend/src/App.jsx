import { useState, useEffect, useRef } from 'react'
import PDFViewer from './PDFViewer'

const API_BASE = 'http://localhost:8000/api'

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
    background: '#ffffff',
    surface: '#f8f9fa',
    cardBg: '#ffffff',
    text: '#24292f',
    textSecondary: '#57606a',
    border: '#d1d9e0',
    primary: '#0969da',
    success: '#1f7a33',
    error: '#b12a2f',
    buttonDisabled: '#8c959f'
  },
  dark: {
    background: '#01070d',
    surface: '#0d1117',
    cardBg: '#161b22',
    text: '#c9d1d9',
    textSecondary: '#8b949e',
    border: '#30363d',
    primary: '#58a6ff',
    success: '#56d364',
    error: '#f85149',
    buttonDisabled: '#484f58'
  }
}

function App() {
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(localStorage.getItem('smartStudyHub-token') || '')
  const [authMode, setAuthMode] = useState('login') // 'login' or 'signup'
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError] = useState('')

  const [file, setFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState('')
  const [documents, setDocuments] = useState([])
  const [selectedDoc, setSelectedDoc] = useState('')
  const [summarizing, setSummarizing] = useState(false)
  const [summary, setSummary] = useState('')
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('smartStudyHub-darkMode')
    return saved ? JSON.parse(saved) : false
  })
  const [showPDFViewer, setShowPDFViewer] = useState(false)
  const [currentPDFUrl, setCurrentPDFUrl] = useState('')

  const [chatMessage, setChatMessage] = useState('')
  const [chatHistory, setChatHistory] = useState([])
  const [chatLoading, setChatLoading] = useState(false)
  const [selectedQADoc, setSelectedQADoc] = useState('')
  const [chatModelName, setChatModelName] = useState('Agent A')
  const [dynamicGeminiModel, setDynamicGeminiModel] = useState('Google Gemini')
  const chatEndRef = useRef(null)

  const [showQuiz, setShowQuiz] = useState(false)
  const [quizGenerating, setQuizGenerating] = useState(false)
  const [quizData, setQuizData] = useState(null)
  const [quizAnswers, setQuizAnswers] = useState({})
  const [quizSubmitted, setQuizSubmitted] = useState(false)

  const [useGemini, setUseGemini] = useState(() => {
    const saved = localStorage.getItem('smartStudyHub-useGemini')
    return saved ? JSON.parse(saved) : false
  })
  const [geminiApiKey, setGeminiApiKey] = useState(() => {
    return localStorage.getItem('smartStudyHub-geminiApiKey') || ''
  })
  const [localModel, setLocalModel] = useState(() => {
    return localStorage.getItem('smartStudyHub-localModel') || 'llama3'
  })
  const [showSettings, setShowSettings] = useState(false)

  const activeChatModelName = useGemini ? dynamicGeminiModel : chatModelName

  const currentTheme = darkMode ? theme.dark : theme.light

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const response = await fetch(`${API_BASE}/config`)
        if (response.ok) {
          const data = await response.json()
          if (data.chat_model) {
            // Capitalize first letter if you want, or just set it
            setChatModelName(data.chat_model)
          }
        }
      } catch (error) {
        console.error('Fetch config error', error)
      }
    }
    fetchConfig()
  }, [])

  useEffect(() => {
    if (token) {
      fetchMe()
    }
  }, [token])

  useEffect(() => {
    if (user) {
      fetchDocuments()
    }
  }, [user])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatHistory])

  useEffect(() => {
    localStorage.setItem('smartStudyHub-darkMode', JSON.stringify(darkMode))
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light')
    document.body.style.backgroundColor = currentTheme.background
    document.body.style.color = currentTheme.text
  }, [darkMode, currentTheme.background, currentTheme.text])

  useEffect(() => {
    localStorage.setItem('smartStudyHub-useGemini', JSON.stringify(useGemini))
    localStorage.setItem('smartStudyHub-geminiApiKey', geminiApiKey)
  }, [useGemini, geminiApiKey])

  useEffect(() => {
    localStorage.setItem('smartStudyHub-localModel', localModel)
  }, [localModel])

  const toggleDarkMode = () => {
    setDarkMode((prev) => !prev)
  }

  const fetchMe = async () => {
    try {
      const response = await fetch(`${API_BASE}/me`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (response.ok) {
        const data = await response.json()
        setUser(data.user)
      } else {
        setToken('')
        localStorage.removeItem('smartStudyHub-token')
      }
    } catch (error) {
      setToken('')
      localStorage.removeItem('smartStudyHub-token')
    }
  }

  const handleAuth = async (formData) => {
    setAuthLoading(true)
    setAuthError('')
    try {
      const endpoint = authMode === 'login' ? 'login' : 'signup'
      const response = await fetch(`${API_BASE}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })
      const data = await response.json()
      if (response.ok) {
        setToken(data.token)
        localStorage.setItem('smartStudyHub-token', data.token)
        setUser(data.user)
      } else {
        setAuthError(data.detail || 'Authentication failed')
      }
    } catch (error) {
      setAuthError('Network error. Please try again.')
    } finally {
      setAuthLoading(false)
    }
  }

  const handleLogout = async () => {
    try {
      await fetch(`${API_BASE}/logout`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
    } catch (error) {
      // Ignore logout errors
    }
    setToken('')
    setUser(null)
    setDocuments([])
    setSummary('')
    setSelectedDoc('')
    setShowPDFViewer(false)
    setCurrentPDFUrl('')
    setChatHistory([])
    localStorage.removeItem('smartStudyHub-token')
  }

  const handleChatSubmit = async (e) => {
    e.preventDefault()
    if (!chatMessage.trim()) return

    const messageToSend = chatMessage
    setChatMessage('')
    setChatHistory(prev => [...prev, { role: 'user', content: messageToSend }])
    
    // Initial empty message that will be filled by the backend stream
    setChatHistory(prev => [...prev, { role: 'agent', content: '', isStreaming: true }])
    setChatLoading(true)

    try {
      const payload = { 
        message: messageToSend,
        use_gemini: useGemini,
        gemini_api_key: geminiApiKey,
        local_model: localModel
      }
      if (selectedQADoc) {
        payload.filename = selectedQADoc
      }

      const res = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      })
      
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        setChatHistory(prev => {
          const newHistory = [...prev];
          newHistory[newHistory.length - 1] = { role: 'agent', content: `Eroare: ${errData.detail || 'Nu s-a putut comunica cu Agentul A.'}` };
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
          const lines = accumulatedBuffer.split('\n');
          accumulatedBuffer = lines.pop(); // Keep the last incomplete line in buffer

          let statusMsg = null;

          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const data = JSON.parse(line);
              if (data.type === 'status') {
                statusMsg = data.content;
              } else if (data.type === 'text') {
                accumulatedText += data.content;
              } else if (data.type === 'model_name') {
                setDynamicGeminiModel(data.content);
              }
            } catch (err) {
              console.error('Failed to parse JSON stream chunk:', line);
            }
          }
          
          setChatHistory(prev => {
            const newHistory = [...prev];
            const lastMsg = newHistory[newHistory.length - 1];
            if (lastMsg.role === 'agent' && lastMsg.isStreaming) {
              if (accumulatedText) {
                lastMsg.content = accumulatedText;
                lastMsg.status = null;
              } else if (statusMsg) {
                lastMsg.status = statusMsg;
              }
            }
            return newHistory;
          });
        }
      }

      // Mark streaming as complete
      setChatHistory(prev => {
        const newHistory = [...prev];
        const lastMsg = newHistory[newHistory.length - 1];
        if (lastMsg.role === 'agent') {
          lastMsg.isStreaming = false;
        }
        return newHistory;
      });

    } catch (err) {
      setChatHistory(prev => {
        const newHistory = [...prev];
        newHistory[newHistory.length - 1] = { role: 'agent', content: 'Eroare de rețea.' };
        return newHistory;
      });
    } finally {
      setChatLoading(false)
    }
  }

  const handleDeleteDocument = async (filename) => {
    if (!window.confirm(`Sunteți sigur că doriți să ștergeți documentul "${filename}"?`)) {
      return
    }

    try {
      const response = await fetch(`${API_BASE}/documents/${encodeURIComponent(filename)}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      })

      if (response.ok) {
        if (selectedDoc === filename) {
          setSelectedDoc('')
          setSummary('')
        }
        if (selectedQADoc === filename) setSelectedQADoc('')
        if (showPDFViewer && currentPDFUrl.includes(filename)) closePDFViewer()
        
        setMessage(`Documentul ${filename} a fost șters.`)
        await fetchDocuments()
      } else {
        const data = await response.json()
        setMessage(data.detail || 'Eroare la ștergerea documentului.')
      }
    } catch (error) {
      setMessage('Eroare rețea: ' + error.message)
    }
  }

  const fetchDocuments = async () => {
    try {
      const response = await fetch(`${API_BASE}/documents`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (response.ok) {
        const data = await response.json()
        setDocuments(data.documents)
      }
    } catch (error) {
      console.error('Fetch error', error)
      setMessage('Unable to load documents. Please check backend connectivity.')
    }
  }

  const handleFileChange = (event) => {
    const selectedFile = event.target.files?.[0] || null
    if (!selectedFile) {
      setFile(null)
      return
    }

    if (!selectedFile.name.toLowerCase().endsWith('.pdf')) {
      setMessage('Only PDF files are allowed.')
      setFile(null)
      return
    }

    if (selectedFile.size > 20 * 1024 * 1024) {
      setMessage('File exceeds the 20MB limit.')
      setFile(null)
      return
    }

    setFile(selectedFile)
    setMessage('')
  }

  const handleUpload = async () => {
    if (!file) return
    setUploading(true)
    setMessage('')

    const formData = new FormData()
    formData.append('file', file)

    try {
      const response = await fetch(`${API_BASE}/upload`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      })
      const data = await response.json()

      if (response.ok) {
        setMessage(data.message || 'Document uploaded successfully.')
        setFile(null)
        await fetchDocuments()
      } else {
        setMessage(data.detail || 'Upload failed. Please try again.')
      }
    } catch (error) {
      setMessage('Upload error: ' + error.message)
    } finally {
      setUploading(false)
    }
  }

  const summarizeDocument = async (filename) => {
    if (!filename) {
      setMessage('Please select a document to summarize.')
      return
    }

    const confirmContinue = window.confirm('Sumarizarea poate dura mai mult timp (până la câteva minute) în special pentru documentele mari. Doriți să continuați?');
    if (!confirmContinue) {
      return;
    }

    setSelectedDoc(filename)
    setSummary('')
    setSummarizing(true)
    setMessage('')

    try {
      const response = await fetch(`${API_BASE}/summarize/${encodeURIComponent(filename)}`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          use_gemini: useGemini,
          gemini_api_key: geminiApiKey
        })
      })
      const data = await response.json()

      if (response.ok) {
        setSummary(data.summary)
      } else {
        setMessage(data.detail || 'Summary generation failed.')
      }
    } catch (error) {
      setMessage('Error generating summary: ' + error.message)
    } finally {
      setSummarizing(false)
    }
  }

  const generateQuiz = async (filename) => {
    if (!filename) {
      setMessage('Please select a document to generate a quiz.')
      return
    }

    setShowQuiz(true)
    setQuizData(null)
    setQuizAnswers({})
    setQuizSubmitted(false)
    setQuizGenerating(true)
    setMessage('')

    try {
      const response = await fetch(`${API_BASE}/quiz/${encodeURIComponent(filename)}`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          use_gemini: useGemini,
          gemini_api_key: geminiApiKey
        })
      })
      const data = await response.json()

      if (response.ok) {
        setQuizData(data.quiz)
      } else {
        setMessage(data.detail || 'Quiz generation failed.')
      }
    } catch (error) {
      setMessage('Error during quiz generation: ' + error.message)
    } finally {
      setQuizGenerating(false)
    }
  }

  const handleQuizAnswer = (index, answer) => {
    if (quizSubmitted) return
    setQuizAnswers(prev => ({
      ...prev,
      [index]: answer
    }))
  }

  const submitQuiz = () => {
    if (Object.keys(quizAnswers).length < quizData?.questions?.length) {
      setMessage('Vă rugăm să răspundeți la toate întrebările.')
      return
    }
    setQuizSubmitted(true)
  }

  const handleCopySummary = async () => {
    if (!summary) return
    try {
      await navigator.clipboard.writeText(summary)
      setMessage('Summary copied to clipboard.')
    } catch (error) {
      setMessage('Unable to copy summary.')
    }
  }

  const handleDownloadSummary = () => {
    if (!summary) return
    const blob = new Blob([summary], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${selectedDoc || 'summary'}.txt`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const openPDFViewer = (document) => {
    // Use the backend API endpoint for serving PDFs
    const pdfUrl = `${API_BASE}/pdf/${document.filename}`
    setCurrentPDFUrl(pdfUrl)
    setShowPDFViewer(true)
  }

  const closePDFViewer = () => {
    setShowPDFViewer(false)
    setCurrentPDFUrl('')
  }

  if (!user) {
    return (
      <div style={{
        minHeight: '100vh',
        padding: '24px',
        maxWidth: '480px',
        margin: '0 auto',
        color: currentTheme.text,
        backgroundColor: currentTheme.background,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div style={{
          width: '100%',
          padding: '32px',
          borderRadius: '24px',
          backgroundColor: currentTheme.surface,
          border: `1px solid ${currentTheme.border}`,
          boxShadow: darkMode ? '0 20px 60px rgba(0,0,0,0.18)' : '0 20px 60px rgba(15, 23, 42, 0.08)'
        }}>
          <div style={{ textAlign: 'center', marginBottom: '32px' }}>
            <h1 style={{ margin: '0 0 8px', fontSize: '2rem', color: currentTheme.text }}>
              Smart Study Hub
            </h1>
            <p style={{ margin: 0, color: currentTheme.textSecondary }}>
              Studiază mai inteligent, nu mai greu
            </p>
          </div>

          <div style={{ marginBottom: '24px', textAlign: 'center' }}>
            <button
              onClick={() => setAuthMode('login')}
              style={{
                padding: '12px 24px',
                borderRadius: '12px',
                border: authMode === 'login' ? `2px solid ${currentTheme.primary}` : `1px solid ${currentTheme.border}`,
                backgroundColor: authMode === 'login' ? currentTheme.primary : currentTheme.surface,
                color: authMode === 'login' ? '#ffffff' : currentTheme.text,
                cursor: 'pointer',
                fontWeight: '700',
                marginRight: '12px'
              }}
            >
              Login
            </button>
            <button
              onClick={() => setAuthMode('signup')}
              style={{
                padding: '12px 24px',
                borderRadius: '12px',
                border: authMode === 'signup' ? `2px solid ${currentTheme.primary}` : `1px solid ${currentTheme.border}`,
                backgroundColor: authMode === 'signup' ? currentTheme.primary : currentTheme.surface,
                color: authMode === 'signup' ? '#ffffff' : currentTheme.text,
                cursor: 'pointer',
                fontWeight: '700'
              }}
            >
              Sign Up
            </button>
          </div>

          <form onSubmit={(e) => {
            e.preventDefault()
            const formData = new FormData(e.target)
            const data = Object.fromEntries(formData.entries())
            handleAuth(data)
          }}>
            <div style={{ display: 'grid', gap: '16px' }}>
              <input
                name="username"
                type="text"
                placeholder="Username"
                required
                style={{
                  padding: '14px 16px',
                  borderRadius: '12px',
                  border: `1px solid ${currentTheme.border}`,
                  backgroundColor: currentTheme.cardBg,
                  color: currentTheme.text,
                  fontSize: '1rem'
                }}
              />
              <input
                name="email"
                type="email"
                placeholder="Email"
                required
                style={{
                  padding: '14px 16px',
                  borderRadius: '12px',
                  border: `1px solid ${currentTheme.border}`,
                  backgroundColor: currentTheme.cardBg,
                  color: currentTheme.text,
                  fontSize: '1rem'
                }}
              />
              <input
                name="password"
                type="password"
                placeholder="Password"
                required
                style={{
                  padding: '14px 16px',
                  borderRadius: '12px',
                  border: `1px solid ${currentTheme.border}`,
                  backgroundColor: currentTheme.cardBg,
                  color: currentTheme.text,
                  fontSize: '1rem'
                }}
              />
              {authMode === 'signup' && (
                <input
                  name="developer_code"
                  type="password"
                  placeholder="Developer Code (optional)"
                  style={{
                    padding: '14px 16px',
                    borderRadius: '12px',
                    border: `1px solid ${currentTheme.border}`,
                    backgroundColor: currentTheme.cardBg,
                    color: currentTheme.text,
                    fontSize: '1rem'
                  }}
                />
              )}
              <button
                type="submit"
                disabled={authLoading}
                style={{
                  padding: '14px 16px',
                  borderRadius: '12px',
                  border: 'none',
                  backgroundColor: authLoading ? currentTheme.buttonDisabled : currentTheme.primary,
                  color: '#ffffff',
                  cursor: authLoading ? 'not-allowed' : 'pointer',
                  fontWeight: '700',
                  fontSize: '1rem'
                }}
              >
                {authLoading ? 'Processing...' : (authMode === 'login' ? 'Login' : 'Sign Up')}
              </button>
            </div>
          </form>

          {authError && (
            <div style={{
              marginTop: '16px',
              padding: '12px',
              borderRadius: '12px',
              backgroundColor: currentTheme.error,
              color: '#ffffff',
              textAlign: 'center'
            }}>
              {authError}
            </div>
          )}

          <div style={{ marginTop: '24px', textAlign: 'center' }}>
            <button
              onClick={toggleDarkMode}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                border: `1px solid ${currentTheme.border}`,
                backgroundColor: currentTheme.surface,
                color: currentTheme.text,
                cursor: 'pointer'
              }}
            >
              {darkMode ? '☀️ Light' : '🌙 Dark'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh',
      padding: '24px',
      maxWidth: showPDFViewer ? '1800px' : '1240px',
      margin: '0 auto',
      color: currentTheme.text,
      backgroundColor: currentTheme.background,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      display: 'flex',
      gap: showPDFViewer ? '24px' : '0',
      boxSizing: 'border-box'
    }}>
      <style>{shimmerStyles}</style>
      {/* Main Content */}
      <div style={{
        flex: showPDFViewer ? '1' : '1',
        width: showPDFViewer ? '50%' : '100%',
        transition: 'all 0.3s ease'
      }}>  <header style={{
        marginBottom: '34px',
        padding: '28px 24px',
        borderRadius: '24px',
        background: darkMode ? '#03121d' : '#f6f8fa',
        border: `1px solid ${currentTheme.border}`,
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        gap: '16px',
        alignItems: 'center'
      }}>
        <div>
          <p style={{
            margin: 0,
            color: currentTheme.primary,
            fontSize: '0.95rem',
            fontWeight: '700'
          }}>
            SmartStudyHub
          </p>
          <h1 style={{
            margin: '12px 0 8px 0',
            fontSize: '2.6rem',
            lineHeight: '1.05',
            color: currentTheme.text
          }}>
            Studiază mai inteligent, nu mai greu
          </h1>
          <p style={{
            margin: 0,
            color: currentTheme.textSecondary,
            fontSize: '1rem',
            maxWidth: '680px'
          }}>
            Încarcă PDF-uri, generează rezumate structurate și exportă notițele direct din browser. Interfața este optimizată pentru citire clară și productivitate.
          </p>
        </div>

        {/* User greeting and logout */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: '8px'
        }}>
          <p style={{
            margin: 0,
            color: currentTheme.primary,
            fontSize: '1.1rem',
            fontWeight: '600'
          }}>
            Salut, {user.username}!
          </p>
          <button
            onClick={() => {
              setToken('')
              localStorage.removeItem('smartStudyHub-token')
              setUser(null)
            }}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: `1px solid ${currentTheme.error}`,
              backgroundColor: 'transparent',
              color: currentTheme.error,
              cursor: 'pointer',
              fontSize: '0.9rem',
              fontWeight: '600',
              transition: 'all 0.2s ease'
            }}
            onMouseOver={(e) => {
              e.target.style.backgroundColor = currentTheme.error
              e.target.style.color = '#ffffff'
            }}
            onMouseOut={(e) => {
              e.target.style.backgroundColor = 'transparent'
              e.target.style.color = currentTheme.error
            }}
          >
            Logout
          </button>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={() => setShowSettings(!showSettings)}
            style={{
              padding: '12px 18px',
              borderRadius: '12px',
              border: `1px solid ${currentTheme.border}`,
              backgroundColor: currentTheme.surface,
              color: currentTheme.text,
              cursor: 'pointer',
              fontWeight: '700'
            }}
          >
            ⚙️ Setări Model
          </button>
          <button
            onClick={toggleDarkMode}
            style={{
              padding: '12px 18px',
              borderRadius: '12px',
              border: `1px solid ${currentTheme.border}`,
              backgroundColor: currentTheme.surface,
              color: currentTheme.text,
              cursor: 'pointer',
              fontWeight: '700'
            }}
          >
            {darkMode ? '🌙 Dark Mode' : '☀️ Light Mode'}
          </button>
        </div>
      </header>

      {showSettings && (
        <section style={{
          marginBottom: '28px',
          padding: '24px',
          borderRadius: '24px',
          backgroundColor: currentTheme.surface,
          border: `1px solid ${currentTheme.border}`,
          boxShadow: darkMode ? '0 10px 30px rgba(0,0,0,0.1)' : '0 10px 30px rgba(15, 23, 42, 0.05)'
        }}>
          <h2 style={{ margin: '0 0 16px', color: currentTheme.text, fontSize: '1.4rem' }}>
            Setări Model AI
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '500px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
              <input 
                type="checkbox" 
                checked={useGemini} 
                onChange={(e) => setUseGemini(e.target.checked)}
                style={{ width: '18px', height: '18px' }}
              />
              <span style={{ color: currentTheme.text, fontWeight: '600' }}>Folosește Google Gemini API în loc de modelul local (Ollama)</span>
            </label>
            
            {useGemini && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ color: currentTheme.textSecondary, fontSize: '0.9rem' }}>Gemini API Key</label>
                <input
                  type="text"
                  value={geminiApiKey}
                  onChange={(e) => setGeminiApiKey(e.target.value)}
                  placeholder="Introdu cheia ta Gemini API..."
                  style={{
                    padding: '12px 16px',
                    borderRadius: '12px',
                    border: `1px solid ${currentTheme.border}`,
                    backgroundColor: currentTheme.cardBg,
                    color: currentTheme.text,
                    fontSize: '1rem'
                  }}
                />
                <p style={{ margin: 0, fontSize: '0.85rem', color: currentTheme.textSecondary }}>
                  Cheia API este salvată local în browser și trimisă doar către backend-ul aplicației.
                </p>
              </div>
            )}
            {!useGemini && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ color: currentTheme.textSecondary, fontSize: '0.9rem' }}>Model local</label>
                <select
                  value={localModel}
                  onChange={(e) => setLocalModel(e.target.value)}
                  style={{
                    padding: '12px 16px',
                    borderRadius: '12px',
                    border: `1px solid ${currentTheme.border}`,
                    backgroundColor: currentTheme.cardBg,
                    color: currentTheme.text,
                    fontSize: '1rem'
                  }}
                >
                  <option value="llama3">llama3</option>
                  <option value="mistral">mistral</option>
                  <option value="qwen2.5">qwen2.5</option>
                </select>
              </div>
            )}
          </div>
        </section>
      )}

      <section style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
        gap: '24px',
        marginBottom: '28px'
      }}>
        <article style={{
          borderRadius: '24px',
          padding: '28px',
          backgroundColor: currentTheme.surface,
          border: `1px solid ${currentTheme.border}`,
          boxShadow: darkMode ? '0 20px 60px rgba(0,0,0,0.18)' : '0 20px 60px rgba(15, 23, 42, 0.08)'
        }}>
          <h2 style={{ margin: '0 0 16px', color: currentTheme.text, fontSize: '1.5rem' }}>
            Încarcă document
          </h2>
          <p style={{ margin: '0 0 24px', color: currentTheme.textSecondary }}>
            PDF-uri de maxim 20MB. Vom extrage textul și le vom stoca pentru a genera rezumate rapide.
          </p>

          <div style={{ display: 'grid', gap: '16px' }}>
            <label style={{ display: 'block', width: '100%' }}>
              <input
                type='file'
                accept='.pdf'
                onChange={handleFileChange}
                style={{
                  width: '100%',
                  padding: '14px 16px',
                  borderRadius: '16px',
                  border: `1px solid ${currentTheme.border}`,
                  backgroundColor: currentTheme.cardBg,
                  color: currentTheme.text,
                  fontSize: '0.95rem'
                }}
              />
            </label>
            <button
              onClick={handleUpload}
              disabled={!file || uploading}
              style={{
                width: 'fit-content',
                padding: '14px 18px',
                borderRadius: '16px',
                border: 'none',
                backgroundColor: !file || uploading ? currentTheme.buttonDisabled : currentTheme.success,
                color: '#ffffff',
                cursor: !file || uploading ? 'not-allowed' : 'pointer',
                fontWeight: '700'
              }}
            >
              {uploading ? 'Încarcare...' : 'Încarcă PDF'}
            </button>
          </div>

          {message && (
            <div style={{
              marginTop: '24px',
              padding: '16px',
              borderRadius: '16px',
              backgroundColor: currentTheme.primary,
              color: '#ffffff'
            }}>
              {message}
            </div>
          )}
        </article>

        <article style={{
          borderRadius: '24px',
          padding: '28px',
          backgroundColor: currentTheme.surface,
          border: `1px solid ${currentTheme.border}`,
          boxShadow: darkMode ? '0 20px 60px rgba(0,0,0,0.18)' : '0 20px 60px rgba(15, 23, 42, 0.08)'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '12px',
            flexWrap: 'wrap'
          }}>
            <div>
              <h2 style={{ margin: '0 0 8px', color: currentTheme.text, fontSize: '1.5rem' }}>
                Documente încărcate
              </h2>
              <p style={{ margin: 0, color: currentTheme.textSecondary }}>
                Selectează un fișier sau folosește butonul direct din listă.
              </p>
            </div>
            <span style={{ color: currentTheme.textSecondary, fontWeight: '700' }}>
              {documents.length} fișier{documents.length === 1 ? '' : 'e'}
            </span>
          </div>

          {documents.length === 0 ? (
            <p style={{ marginTop: '22px', color: currentTheme.textSecondary }}>
              Nu ai încă documente. Încarcă primul PDF pentru a începe.
            </p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: '22px 0 0', display: 'grid', gap: '16px' }}>
              {documents.map((doc, index) => {
                const active = doc.filename === selectedDoc
                return (
                  <li key={index} style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr auto',
                    gap: '16px',
                    alignItems: 'center',
                    padding: '18px',
                    borderRadius: '18px',
                    backgroundColor: active ? (darkMode ? '#112d4a' : '#e7f5ff') : currentTheme.cardBg,
                    border: `1px solid ${active ? currentTheme.primary : currentTheme.border}`
                  }}>
                    <div>
                      <div style={{ fontSize: '1rem', fontWeight: '700', color: currentTheme.text }}>
                        {doc.filename}
                      </div>
                      <div style={{ marginTop: '6px', color: currentTheme.textSecondary, fontSize: '0.92rem' }}>
                        Opțiuni: Rezumat & Quiz
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={() => openPDFViewer(doc)}
                        style={{
                          padding: '8px 12px',
                          borderRadius: '6px',
                          border: `1px solid ${currentTheme.primary}`,
                          backgroundColor: currentTheme.primary,
                          color: '#ffffff',
                          cursor: 'pointer',
                          fontWeight: '600',
                          fontSize: '0.85rem'
                        }}
                      >
                        Vezi PDF
                      </button>
                      <button
                        onClick={() => summarizeDocument(doc.filename)}
                        style={{
                          padding: '8px 12px',
                          borderRadius: '6px',
                          border: `1px solid ${currentTheme.primary}`,
                          backgroundColor: 'transparent',
                          color: currentTheme.primary,
                          cursor: 'pointer',
                          fontWeight: '600',
                          fontSize: '0.85rem'
                        }}
                      >
                        Summarize
                      </button>
                      <button
                        onClick={() => generateQuiz(doc.filename)}
                        style={{
                          padding: '8px 12px',
                          borderRadius: '6px',
                          border: `1px solid ${currentTheme.primary}`,
                          backgroundColor: 'transparent',
                          color: currentTheme.primary,
                          cursor: 'pointer',
                          fontWeight: '600',
                          fontSize: '0.85rem'
                        }}
                      >
                        Quiz
                      </button>
                      <button
                        onClick={() => handleDeleteDocument(doc.filename)}
                        style={{
                          padding: '8px 12px',
                          borderRadius: '6px',
                          border: `1px solid ${currentTheme.error}`,
                          backgroundColor: 'transparent',
                          color: currentTheme.error,
                          cursor: 'pointer',
                          fontWeight: '600',
                          fontSize: '0.85rem'
                        }}
                      >
                        Șterge
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </article>
      </section>

      <section style={{
        borderRadius: '24px',
        padding: '28px',
        backgroundColor: currentTheme.surface,
        border: `1px solid ${currentTheme.border}`,
        boxShadow: darkMode ? '0 20px 60px rgba(0,0,0,0.14)' : '0 20px 60px rgba(15, 23, 42, 0.07)'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
          marginBottom: '22px'
        }}>
          <div>
            <h2 style={{ margin: '0 0 8px', color: currentTheme.text, fontSize: '1.6rem' }}>
              Analiză & Examinare
            </h2>
            <p style={{ margin: 0, color: currentTheme.textSecondary }}>
              Alege documentul pentru a genera un rezumat structurat sau pentru a-ți testa cunoștințele printr-un quiz interactiv.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <select
              value={selectedDoc}
              onChange={(event) => setSelectedDoc(event.target.value)}
              style={{
                minWidth: '220px',
                padding: '12px 14px',
                borderRadius: '14px',
                border: `1px solid ${currentTheme.border}`,
                backgroundColor: currentTheme.cardBg,
                color: currentTheme.text,
                fontSize: '0.95rem'
              }}
            >
              <option value=''>Alege un document</option>
              {documents.map((doc, index) => (
                <option key={index} value={doc.filename}>{doc.filename}</option>
              ))}
            </select>
            <button
              onClick={() => summarizeDocument(selectedDoc)}
              disabled={!selectedDoc || summarizing}
              style={{
                padding: '12px 18px',
                borderRadius: '14px',
                border: 'none',
                backgroundColor: !selectedDoc || summarizing ? currentTheme.buttonDisabled : currentTheme.primary,
                color: '#ffffff',
                cursor: !selectedDoc || summarizing ? 'not-allowed' : 'pointer',
                fontWeight: '700'
              }}
            >
              {summarizing ? 'Generare…' : 'Generează rezumat'}
            </button>
            <button
              onClick={() => generateQuiz(selectedDoc)}
              disabled={!selectedDoc || quizGenerating}
              style={{
                padding: '12px 18px',
                borderRadius: '14px',
                border: 'none',
                backgroundColor: !selectedDoc || quizGenerating ? currentTheme.buttonDisabled : '#8a2be2',
                color: '#ffffff',
                cursor: !selectedDoc || quizGenerating ? 'not-allowed' : 'pointer',
                fontWeight: '700'
              }}
            >
              {quizGenerating ? 'Generare Quiz…' : 'Generează Quiz'}
            </button>
          </div>
        </div>

        {showQuiz ? (
          <div style={{
            backgroundColor: currentTheme.cardBg,
            border: `1px solid ${currentTheme.border}`,
            borderRadius: '22px',
            padding: '30px',
            paddingRight: '10px',
            boxShadow: '0 8px 30px rgba(0,0,0,0.06)',
            marginBottom: '30px',
            position: 'relative'
          }}>
            <button
              onClick={() => setShowQuiz(false)}
              style={{
                position: 'absolute',
                top: '20px',
                right: '25px',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: '8px',
                color: currentTheme.textSecondary,
                fontSize: '18px',
                zIndex: 2
              }}
            >
              ✖
            </button>
            <h2 style={{ color: currentTheme.text, marginTop: 0, marginBottom: '25px' }}>Quiz pe document</h2>
            
            <div style={{ maxHeight: '60vh', overflowY: 'auto', paddingRight: '15px' }}>
              {quizGenerating ? (
                <div style={{ textAlign: 'center', padding: '40px', color: currentTheme.textSecondary }}>
                  <div>Agentul B concepe întrebările (poate dura puțin)...</div>
                </div>
              ) : quizData ? (
                <>
                  {quizData.questions?.map((q, index) => (
                    <div key={index} style={{ marginBottom: '25px', padding: '20px', borderRadius: '12px', backgroundColor: currentTheme.surface }}>
                      <p style={{ fontWeight: '600', marginBottom: '15px', color: currentTheme.text }}>
                        {index + 1}. {q.question}
                      </p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {Object.entries(q.options).map(([key, value]) => {
                          const isSelected = quizAnswers[index] === key;
                          const showCorrect = quizSubmitted && q.correct_answer === key;
                          const showWrong = quizSubmitted && isSelected && q.correct_answer !== key;
                          
                          let bgColor = currentTheme.cardBg;
                          let bdColor = currentTheme.border;
                          if (showCorrect) {
                            bgColor = 'rgba(46, 160, 67, 0.1)';
                            bdColor = '#2ea043';
                          } else if (showWrong) {
                            bgColor = 'rgba(248, 81, 73, 0.1)';
                            bdColor = currentTheme.error;
                          } else if (isSelected) {
                            bdColor = currentTheme.primary;
                            bgColor = darkMode ? 'rgba(88, 166, 255, 0.1)' : '#f0f6fc';
                          }

                          return (
                            <label key={key} style={{
                              padding: '12px 15px',
                              borderRadius: '8px',
                              border: `1px solid ${bdColor}`,
                              backgroundColor: bgColor,
                              cursor: quizSubmitted ? 'default' : 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '10px',
                              color: currentTheme.text
                            }}>
                              <input 
                                type="radio" 
                                name={`question-${index}`} 
                                value={key}
                                checked={isSelected}
                                onChange={() => handleQuizAnswer(index, key)}
                                disabled={quizSubmitted}
                                style={{ margin: 0 }}
                              />
                              <strong>{key})</strong> {value}
                            </label>
                          )
                        })}
                      </div>
                      
                      {quizSubmitted && (
                        <div style={{ 
                          marginTop: '15px', 
                          padding: '15px', 
                          backgroundColor: q.correct_answer === quizAnswers[index] ? 'rgba(46, 160, 67, 0.1)' : 'rgba(248, 81, 73, 0.1)',
                          borderRadius: '8px',
                          color: currentTheme.text
                        }}>
                          {q.correct_answer === quizAnswers[index] ? 
                            <span style={{color: '#2ea043', fontWeight: 'bold'}}>✓ Corect!</span> : 
                            <span style={{color: currentTheme.error, fontWeight: 'bold'}}>✗ Greșit. Răspunsul corect era {q.correct_answer}.</span>
                          }
                          <p style={{ marginTop: '8px', fontSize: '0.9rem' }}>{q.explanation}</p>
                        </div>
                      )}
                    </div>
                  ))}

                  <div style={{ marginTop: '30px', textAlign: 'center' }}>
                    {quizSubmitted ? (
                      <div style={{ padding: '20px', borderRadius: '12px', border: `2px solid ${currentTheme.primary}`, color: currentTheme.text }}>
                        <h3>Scor Final: {Object.keys(quizAnswers).reduce((acc, curr) => acc + (quizAnswers[curr] === quizData.questions[curr].correct_answer ? 1 : 0), 0)} / {quizData.questions.length}</h3>
                        <button
                          onClick={() => generateQuiz(selectedDoc)}
                          style={{
                            padding: '10px 20px',
                            marginTop: '10px',
                            backgroundColor: currentTheme.primary,
                            color: 'white',
                            border: 'none',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontWeight: 'bold'
                          }}
                        >
                          Generează alt quiz
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={submitQuiz}
                        style={{
                          padding: '12px 30px',
                          backgroundColor: '#2ea043',
                          color: 'white',
                          border: 'none',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          fontWeight: 'bold',
                          fontSize: '16px'
                        }}
                      >
                        Trimite Răspunsurile
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <div style={{ color: currentTheme.error }}>A apărut o problemă la afișarea quiz-ului.</div>
              )}
            </div>
          </div>
        ) : summary ? (
          <div style={{
            backgroundColor: currentTheme.cardBg,
            border: `1px solid ${currentTheme.border}`,
            borderRadius: '22px',
            padding: '24px'
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '12px',
              marginBottom: '20px'
            }}>
              <div>
                <h3 style={{ margin: '0 0 6px', color: currentTheme.text, fontSize: '1.3rem' }}>
                  Rezumat pentru {selectedDoc || 'document'}
                </h3>
                <p style={{ margin: 0, color: currentTheme.textSecondary, fontSize: '0.95rem' }}>
                  Copiază sau exportă rezumatul pentru notițe.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <button
                  onClick={handleCopySummary}
                  style={{
                    padding: '12px 16px',
                    borderRadius: '14px',
                    border: 'none',
                    backgroundColor: currentTheme.primary,
                    color: '#ffffff',
                    cursor: 'pointer',
                    fontWeight: '700'
                  }}
                >
                  Copiază rezumatul
                </button>
                <button
                  onClick={handleDownloadSummary}
                  style={{
                    padding: '12px 16px',
                    borderRadius: '14px',
                    border: `1px solid ${currentTheme.border}`,
                    backgroundColor: currentTheme.surface,
                    color: currentTheme.text,
                    cursor: 'pointer',
                    fontWeight: '700'
                  }}
                >
                  Exportă text
                </button>
              </div>
            </div>
            <div style={{
              whiteSpace: 'pre-wrap',
              lineHeight: '1.8',
              color: currentTheme.text,
              fontSize: '1rem'
            }}>
              {summary}
            </div>
          </div>
        ) : (
          <div style={{
            padding: '24px',
            borderRadius: '22px',
            border: `1px dashed ${currentTheme.border}`,
            backgroundColor: currentTheme.cardBg,
            minHeight: '180px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: currentTheme.textSecondary
          }}>
            <p style={{ margin: 0 }}>
              Rezumatul tău va apărea aici după ce selectezi un document și apeși pe „Generează rezumat”.
            </p>
          </div>
        )}
      </section>

      {/* Q&A Section */}
      <section style={{
        marginTop: '28px',
        borderRadius: '24px',
        padding: '28px',
        backgroundColor: currentTheme.surface,
        border: `1px solid ${currentTheme.border}`,
        boxShadow: darkMode ? '0 20px 60px rgba(0,0,0,0.14)' : '0 20px 60px rgba(15, 23, 42, 0.07)'
      }}>
        <div style={{ marginBottom: '22px' }}>
          <h2 style={{ margin: '0 0 8px', color: currentTheme.text, fontSize: '1.6rem' }}>
            Q&A cu {activeChatModelName}
          </h2>
          <p style={{ margin: 0, color: currentTheme.textSecondary }}>
            Adresează întrebări despre conținutul cursurilor tale. {activeChatModelName} va răspunde folosind informațiile din documentele încărcate.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '22px' }}>
          <select
            value={selectedQADoc}
            onChange={(event) => setSelectedQADoc(event.target.value)}
            style={{
              padding: '12px 14px',
              borderRadius: '14px',
              border: `1px solid ${currentTheme.border}`,
              backgroundColor: currentTheme.cardBg,
              color: currentTheme.text,
              fontSize: '0.95rem'
            }}
          >
            <option value=''>Toate cursurile</option>
            {documents.map((doc, index) => (
              <option key={index} value={doc.filename}>{doc.filename}</option>
            ))}
          </select>
        </div>

        <div style={{
          backgroundColor: currentTheme.cardBg,
          border: `1px solid ${currentTheme.border}`,
          borderRadius: '22px',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          minHeight: '300px',
          maxHeight: '500px'
        }}>
          <div style={{
            flex: 1,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            marginBottom: '20px'
          }}>
            {chatHistory.length === 0 ? (
              <div style={{ textAlign: 'center', color: currentTheme.textSecondary, margin: 'auto' }}>
                Nu există mesaje. Începe o conversație!
              </div>
            ) : (
              chatHistory.map((msg, i) => (
                <div key={i} style={{
                  alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  backgroundColor: msg.role === 'user' ? currentTheme.primary : currentTheme.surface,
                  color: msg.role === 'user' ? '#fff' : currentTheme.text,
                  padding: '12px 18px',
                  borderRadius: '16px',
                  border: msg.role === 'user' ? 'none' : `1px solid ${currentTheme.border}`,
                  maxWidth: '80%',
                  lineHeight: '1.5',
                  whiteSpace: 'pre-wrap'
                }}>
                  <div style={{ fontSize: '0.85rem', opacity: 0.8, marginBottom: '4px' }}>
                    {msg.role === 'user' ? 'Tu' : activeChatModelName}
                  </div>
                  {msg.status && !msg.content && (
                    <div className={darkMode ? 'shimmer-text-dark' : 'shimmer-text-light'} style={{ fontStyle: 'italic' }}>
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
          <form onSubmit={handleChatSubmit} style={{ display: 'flex', gap: '12px' }}>
            <input
              type="text"
              value={chatMessage}
              onChange={(e) => setChatMessage(e.target.value)}
              placeholder="Întreabă ceva..."
              style={{
                flex: 1,
                padding: '14px 18px',
                borderRadius: '16px',
                border: `1px solid ${currentTheme.border}`,
                backgroundColor: currentTheme.surface,
                color: currentTheme.text,
                fontSize: '1rem'
              }}
            />
            <button
              type="submit"
              disabled={chatLoading || !chatMessage.trim()}
              style={{
                padding: '14px 24px',
                borderRadius: '16px',
                border: 'none',
                backgroundColor: chatLoading || !chatMessage.trim() ? currentTheme.buttonDisabled : currentTheme.primary,
                color: '#ffffff',
                cursor: chatLoading || !chatMessage.trim() ? 'not-allowed' : 'pointer',
                fontWeight: '700'
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
  )
}

export default App
