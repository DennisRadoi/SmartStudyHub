import { useState, useEffect } from 'react'

function App() {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [documents, setDocuments] = useState([]);
  const [selectedDoc, setSelectedDoc] = useState('');
  const [summarizing, setSummarizing] = useState(false);
  const [summary, setSummary] = useState('');

  useEffect(() => {
    fetchDocuments();
  }, []);

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
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '20px', fontFamily: 'sans-serif' }}>
      <h1>🧠 Smart Study Hub</h1>
      <div style={{ marginBottom: '20px', padding: '20px', border: '1px solid #ccc', borderRadius: '8px' }}>
        <h2>Upload Document (PDF, Max 20MB)</h2>
        <input type="file" accept=".pdf" onChange={handleFileChange} />
        <button onClick={handleUpload} disabled={!file || uploading} style={{ marginLeft: '10px' }}>
          {uploading ? 'Uploading...' : 'Upload'}
        </button>
        {message && <p style={{ marginTop: '10px', color: message.startsWith('Error') ? 'red' : 'green' }}>{message}</p>}
      </div>

      <div style={{ padding: '20px', border: '1px solid #ccc', borderRadius: '8px' }}>
        <h2>Saved Documents</h2>
        {documents.length === 0 ? (
          <p>No documents found.</p>
        ) : (
          <ul>
            {documents.map((doc, index) => (
              <li key={index}>{doc.filename}</li>
            ))}
          </ul>
        )}
      </div>

      <div style={{ padding: '20px', border: '1px solid #ccc', borderRadius: '8px', marginTop: '20px' }}>
        <h2>📑 Smart Summarization</h2>
        <p>Generate a structured summary of an uploaded chapter to save time during revision.</p>
        <select 
          value={selectedDoc} 
          onChange={(e) => setSelectedDoc(e.target.value)}
          style={{ marginRight: '10px', padding: '5px' }}
        >
          <option value="">Select a document</option>
          {documents.map((doc, index) => (
            <option key={index} value={doc.filename}>{doc.filename}</option>
          ))}
        </select>
        <button onClick={handleSummarize} disabled={!selectedDoc || summarizing}>
          {summarizing ? 'Generating Summary...' : 'Summarize'}
        </button>
        {message && <p style={{ marginTop: '10px', color: message.startsWith('Error') ? 'red' : 'green' }}>{message}</p>}
        {summary && (
          <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#f9f9f9', borderRadius: '5px' }}>
            <h3>Summary of {selectedDoc}</h3>
            <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>{summary}</pre>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
