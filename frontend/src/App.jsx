import { useState, useEffect } from 'react'

function App() {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [documents, setDocuments] = useState([]);

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
    </div>
  )
}

export default App
