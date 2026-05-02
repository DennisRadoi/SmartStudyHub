import { useState, useEffect } from 'react'

const API_BASE = 'http://localhost:8000/api'

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

  const currentTheme = darkMode ? theme.dark : theme.light

  useEffect(() => {
    fetchDocuments()
  }, [])

  useEffect(() => {
    localStorage.setItem('smartStudyHub-darkMode', JSON.stringify(darkMode))
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light')
    document.body.style.backgroundColor = currentTheme.background
    document.body.style.color = currentTheme.text
  }, [darkMode, currentTheme.background, currentTheme.text])

  const toggleDarkMode = () => {
    setDarkMode((prev) => !prev)
  }

  const fetchDocuments = async () => {
    try {
      const response = await fetch(`${API_BASE}/documents`)
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

    setSelectedDoc(filename)
    setSummary('')
    setSummarizing(true)
    setMessage('')

    try {
      const response = await fetch(`${API_BASE}/summarize/${encodeURIComponent(filename)}`, {
        method: 'POST'
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

  return (
    <div style={{
      minHeight: '100vh',
      padding: '24px',
      maxWidth: '1240px',
      margin: '0 auto',
      color: currentTheme.text,
      backgroundColor: currentTheme.background,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    }}>
      <header style={{
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
            GitHub-style Study Hub
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
      </header>

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
                        Rezumat structurat pe cerere.
                      </div>
                    </div>
                    <button
                      onClick={() => summarizeDocument(doc.filename)}
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
                      Summarize
                    </button>
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
              Rezumat structurat
            </h2>
            <p style={{ margin: 0, color: currentTheme.textSecondary }}>
              Alege documentul și generează un rezumat tip articol web, gata pentru notițele tale.
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
          </div>
        </div>

        {summary ? (
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
    </div>
  )
}

export default App
