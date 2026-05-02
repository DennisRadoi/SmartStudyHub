import { useState, useEffect } from 'react'

function App() {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [documents, setDocuments] = useState([]);
  const [selectedDoc, setSelectedDoc] = useState('');
  const [summarizing, setSummarizing] = useState(false);
  const [summary, setSummary] = useState('');
  const [darkMode, setDarkMode] = useState(() => {
    // Check localStorage for saved preference, default to false (light mode)
    const saved = localStorage.getItem('smartStudyHub-darkMode');
    return saved ? JSON.parse(saved) : false;
  });

  useEffect(() => {
    fetchDocuments();
  }, []);

  useEffect(() => {
    // Save dark mode preference to localStorage
    localStorage.setItem('smartStudyHub-darkMode', JSON.stringify(darkMode));
    
    // Apply theme to document and page background
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
    document.body.style.backgroundColor = darkMode ? theme.dark.background : theme.light.background;
    document.body.style.color = darkMode ? theme.dark.text : theme.light.text;
  }, [darkMode]);

  const toggleDarkMode = () => {
    setDarkMode(!darkMode);
  };

  // Theme styles
  const theme = {
    light: {
      background: '#ffffff',
      surface: '#f8f9fa',
      cardBg: 'white',
      text: '#24292f',
      textSecondary: '#656d76',
      border: '#d1d9e0',
      primary: '#0969da',
      success: '#1f883d',
      error: '#d1242f',
      buttonDisabled: '#8c959f'
    },
    dark: {
      background: '#0d1117',
      surface: '#161b22',
      cardBg: '#21262d',
      text: '#f0f6fc',
      textSecondary: '#c9d1d9',
      border: '#30363d',
      primary: '#79c0ff',
      success: '#56d364',
      error: '#f85149',
      buttonDisabled: '#8c959f'
    }
  };

  const currentTheme = darkMode ? theme.dark : theme.light;

  const fetchDocuments = async () => {
    try {
      const response = await fetch('http://localhost:8000/api/documents');
      if (response.ok) {
        const data = await response.json();
        setDocuments(data.documents);
      }
    } catch (error) {
      console.error('Failed to fetch documents', error);
    }
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile && !selectedFile.name.endsWith('.pdf')) {
      setMessage('Error: Only PDF files are allowed');
      setFile(null);
      return;
    }
    if (selectedFile && selectedFile.size > 20 * 1024 * 1024) {
      setMessage('Error: File exceeds 20MB limit');
      setFile(null);
      return;
    }
    setFile(selectedFile);
    setMessage('');
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setMessage('');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('http://localhost:8000/api/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();

      if (response.ok) {
        setMessage(data.message || 'Success!');
        setFile(null);
        fetchDocuments();
      } else {
        setMessage('Error: ' + data.detail);
      }
    } catch (error) {
      setMessage('Error uploading file: ' + error.message);
    } finally {
      setUploading(false);
    }
  };

  const handleSummarize = async () => {
    if (!selectedDoc) return;
    setSummarizing(true);
    setSummary('');
    setMessage('');

    try {
      const response = await fetch(`http://localhost:8000/api/summarize/${encodeURIComponent(selectedDoc)}`, {
        method: 'POST',
      });
      const data = await response.json();

      if (response.ok) {
        setSummary(data.summary);
      } else {
        setMessage('Error: ' + data.detail);
      }
    } catch (error) {
      setMessage('Error generating summary: ' + error.message);
    } finally {
      setSummarizing(false);
    }
  };

  return (
    <div style={{
      maxWidth: '1200px',
      margin: '0 auto',
      padding: '20px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji"',
      lineHeight: '1.5',
      color: currentTheme.text,
      backgroundColor: currentTheme.background,
      minHeight: '100vh'
    }}>
      <header style={{
        textAlign: 'center',
        marginBottom: '40px',
        padding: '20px',
        borderBottom: `1px solid ${currentTheme.border}`,
        position: 'relative'
      }}>
        <button
          onClick={toggleDarkMode}
          style={{
            position: 'absolute',
            top: '20px',
            right: '20px',
            padding: '8px 12px',
            backgroundColor: currentTheme.surface,
            color: currentTheme.text,
            border: `1px solid ${currentTheme.border}`,
            borderRadius: '6px',
            fontSize: '0.9rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            transition: 'all 0.2s'
          }}
          title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        >
          {darkMode ? '☀️ Light' : '🌙 Dark'}
        </button>
        <h1 style={{
          fontSize: '2.5rem',
          fontWeight: '600',
          margin: '0 0 10px 0',
          color: currentTheme.text
        }}>
          🧠 Smart Study Hub
        </h1>
        <p style={{
          fontSize: '1.1rem',
          color: currentTheme.textSecondary,
          margin: '0'
        }}>
          Intelligent AI-powered study assistant for seamless document interaction
        </p>
      </header>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '30px',
        marginBottom: '30px'
      }}>
        <div style={{
          padding: '24px',
          border: `1px solid ${currentTheme.border}`,
          borderRadius: '12px',
          backgroundColor: currentTheme.surface
        }}>
          <h2 style={{
            fontSize: '1.5rem',
            fontWeight: '600',
            margin: '0 0 16px 0',
            color: currentTheme.text,
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            📄 Upload Document
          </h2>
          <p style={{
            color: currentTheme.textSecondary,
            margin: '0 0 20px 0',
            fontSize: '0.9rem'
          }}>
            Upload your course materials (PDF files up to 20MB)
          </p>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <input
              type="file"
              accept=".pdf"
              onChange={handleFileChange}
              style={{
                padding: '8px 12px',
                border: `1px solid ${currentTheme.border}`,
                borderRadius: '6px',
                backgroundColor: currentTheme.cardBg,
                color: currentTheme.text,
                fontSize: '0.9rem'
              }}
            />
            <button
              onClick={handleUpload}
              disabled={!file || uploading}
              style={{
                padding: '8px 16px',
                backgroundColor: !file || uploading ? currentTheme.buttonDisabled : currentTheme.success,
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '0.9rem',
                fontWeight: '500',
                cursor: !file || uploading ? 'not-allowed' : 'pointer',
                transition: 'background-color 0.2s'
              }}
            >
              {uploading ? 'Uploading...' : 'Upload'}
            </button>
          </div>
          {message && (
            <div style={{
              marginTop: '16px',
              padding: '12px',
              borderRadius: '6px',
              backgroundColor: message.startsWith('Error') ? '#ffebe9' : '#f0f9e7',
              border: `1px solid ${message.startsWith('Error') ? '#d1242f' : '#238636'}`,
              color: message.startsWith('Error') ? '#d1242f' : '#1f883d'
            }}>
              {message}
            </div>
          )}
        </div>

        <div style={{
          padding: '24px',
          border: `1px solid ${currentTheme.border}`,
          borderRadius: '12px',
          backgroundColor: currentTheme.surface
        }}>
          <h2 style={{
            fontSize: '1.5rem',
            fontWeight: '600',
            margin: '0 0 16px 0',
            color: currentTheme.text,
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            📚 Saved Documents
          </h2>
          {documents.length === 0 ? (
            <p style={{
              color: currentTheme.textSecondary,
              margin: '0',
              fontStyle: 'italic'
            }}>
              No documents uploaded yet
            </p>
          ) : (
            <ul style={{
              listStyle: 'none',
              padding: '0',
              margin: '0'
            }}>
              {documents.map((doc, index) => (
                <li key={index} style={{
                  padding: '8px 12px',
                  marginBottom: '4px',
                  backgroundColor: currentTheme.cardBg,
                  border: `1px solid ${currentTheme.border}`,
                  borderRadius: '6px',
                  fontSize: '0.9rem',
                  color: currentTheme.text
                }}>
                  📄 {doc.filename}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div style={{
        padding: '24px',
        border: `1px solid ${currentTheme.border}`,
        borderRadius: '12px',
        backgroundColor: currentTheme.surface
      }}>
        <h2 style={{
          fontSize: '1.5rem',
          fontWeight: '600',
          margin: '0 0 16px 0',
          color: currentTheme.text,
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          📑 Smart Summarization
        </h2>
        <p style={{
          color: currentTheme.textSecondary,
          margin: '0 0 20px 0',
          fontSize: '0.9rem'
        }}>
          Generate structured, easy-to-read summaries of your chapters to save time during revision
        </p>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '20px' }}>
          <select
            value={selectedDoc}
            onChange={(e) => setSelectedDoc(e.target.value)}
            style={{
              padding: '8px 12px',
              border: `1px solid ${currentTheme.border}`,
              borderRadius: '6px',
              backgroundColor: currentTheme.cardBg,
              color: currentTheme.text,
              fontSize: '0.9rem',
              minWidth: '200px'
            }}
          >
            <option value="">Select a document</option>
            {documents.map((doc, index) => (
              <option key={index} value={doc.filename}>{doc.filename}</option>
            ))}
          </select>
          <button
            onClick={handleSummarize}
            disabled={!selectedDoc || summarizing}
            style={{
              padding: '8px 16px',
              backgroundColor: !selectedDoc || summarizing ? currentTheme.buttonDisabled : currentTheme.primary,
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '0.9rem',
              fontWeight: '500',
              cursor: !selectedDoc || summarizing ? 'not-allowed' : 'pointer',
              transition: 'background-color 0.2s'
            }}
          >
            {summarizing ? 'Generating Summary...' : 'Summarize'}
          </button>
        </div>

        {summary && (
          <div style={{
            backgroundColor: currentTheme.cardBg,
            border: `1px solid ${currentTheme.border}`,
            borderRadius: '12px',
            padding: '24px',
            marginTop: '20px'
          }}>
            <h3 style={{
              fontSize: '1.25rem',
              fontWeight: '600',
              margin: '0 0 20px 0',
              color: currentTheme.text,
              borderBottom: `1px solid ${currentTheme.border}`,
              paddingBottom: '12px'
            }}>
              📖 Summary: {selectedDoc}
            </h3>
            <div style={{
              lineHeight: '1.7',
              fontSize: '1rem',
              color: currentTheme.text
            }}>
              {summary.split('\n').map((paragraph, index) => {
                if (paragraph.trim() === '') return null;

                // Check if it's a heading (starts with # or contains common heading patterns)
                if (paragraph.startsWith('#') ||
                    paragraph.toLowerCase().includes('introduction') ||
                    paragraph.toLowerCase().includes('conclusion') ||
                    paragraph.toLowerCase().includes('summary') ||
                    paragraph.toLowerCase().includes('key points') ||
                    paragraph.toLowerCase().includes('main concepts') ||
                    /^\d+\./.test(paragraph) || // numbered lists
                    /^[•\-*]/.test(paragraph) || // bullet points
                    paragraph.length < 100 && paragraph.includes(':')) { // short lines with colons

                  return (
                    <div key={index} style={{
                      marginBottom: '16px',
                      fontWeight: paragraph.startsWith('#') || paragraph.length < 100 ? '600' : 'normal',
                      fontSize: paragraph.startsWith('#') || paragraph.length < 100 ? '1.1rem' : '1rem',
                      color: paragraph.startsWith('#') || paragraph.length < 100 ? currentTheme.primary : currentTheme.text
                    }}>
                      {paragraph.startsWith('#') ? paragraph.substring(1).trim() : paragraph}
                    </div>
                  );
                }

                return (
                  <p key={index} style={{
                    margin: '0 0 16px 0',
                    textAlign: 'justify'
                  }}>
                    {paragraph}
                  </p>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
