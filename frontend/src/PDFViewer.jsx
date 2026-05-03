import { useState, useEffect, useRef } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/esm/Page/AnnotationLayer.css'
import 'react-pdf/dist/esm/Page/TextLayer.css'

// Set up PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`

function PDFViewer({ pdfUrl, token, onClose }) {
  const [numPages, setNumPages] = useState(null)
  const [pageNumber, setPageNumber] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [pageWidth, setPageWidth] = useState(null)
  const viewerRef = useRef(null)

  useEffect(() => {
    const updateWidth = () => {
      if (viewerRef.current) {
        const width = viewerRef.current.clientWidth - 40
        setPageWidth(width > 0 ? width : null)
      }
    }

    updateWidth()
    window.addEventListener('resize', updateWidth)
    return () => window.removeEventListener('resize', updateWidth)
  }, [])

  function onDocumentLoadSuccess({ numPages }) {
    setNumPages(numPages)
    setLoading(false)
    setError(null)
  }

  function onDocumentLoadError(error) {
    setError('Eroare la încărcarea PDF-ului')
    setLoading(false)
    console.error('PDF load error:', error)
  }

  function changePage(offset) {
    setPageNumber(prevPageNumber => prevPageNumber + offset)
  }

  function previousPage() {
    changePage(-1)
  }

  function nextPage() {
    changePage(1)
  }

  return (
    <div
      ref={viewerRef}
      style={{
        width: '50%',
        height: '100vh',
        backgroundColor: 'white',
        borderLeft: '1px solid #e1e4e8',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '-2px 0 8px rgba(0,0,0,0.1)',
        overflow: 'hidden'
      }}
    >
      {/* Header */}
      <div style={{
        padding: '16px 20px',
        borderBottom: '1px solid #e1e4e8',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: '#f6f8fa'
      }}>
        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>
          Vizualizator PDF
        </h3>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            fontSize: '20px',
            cursor: 'pointer',
            color: '#656d76',
            padding: '4px'
          }}
        >
          ×
        </button>
      </div>

      {/* PDF Content */}
      <div style={{
        flex: 1,
        overflow: 'auto',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center'
      }}>
        {loading && (
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <div>Se încarcă PDF-ul...</div>
          </div>
        )}

        {error && (
          <div style={{
            textAlign: 'center',
            padding: '40px',
            color: '#cf222e',
            backgroundColor: '#ffeef0',
            borderRadius: '6px',
            border: '1px solid #ffcece'
          }}>
            {error}
          </div>
        )}

        {!error && (
          <>
            <Document
              file={{
                url: pdfUrl,
                httpHeaders: {
                  Authorization: `Bearer ${token}`
                }
              }}
              onLoadSuccess={onDocumentLoadSuccess}
              onLoadError={onDocumentLoadError}
              loading="Se încarcă documentul..."
            >
              <Page
                pageNumber={pageNumber}
                scale={1.2}
                renderTextLayer={true}
                renderAnnotationLayer={true}
              />
            </Document>

            {/* Navigation */}
            <div style={{
              marginTop: '20px',
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
              padding: '12px 20px',
              backgroundColor: '#f6f8fa',
              borderRadius: '8px',
              border: '1px solid #d1d9e0'
            }}>
              <button
                disabled={pageNumber <= 1}
                onClick={previousPage}
                style={{
                  padding: '8px 12px',
                  border: '1px solid #d1d9e0',
                  borderRadius: '4px',
                  backgroundColor: pageNumber <= 1 ? '#f6f8fa' : 'white',
                  color: pageNumber <= 1 ? '#8c959f' : '#24292f',
                  cursor: pageNumber <= 1 ? 'not-allowed' : 'pointer'
                }}
              >
                ‹ Anterior
              </button>

              <span style={{ fontSize: '14px', color: '#656d76' }}>
                Pagina {pageNumber} din {numPages}
              </span>

              <button
                disabled={pageNumber >= numPages}
                onClick={nextPage}
                style={{
                  padding: '8px 12px',
                  border: '1px solid #d1d9e0',
                  borderRadius: '4px',
                  backgroundColor: pageNumber >= numPages ? '#f6f8fa' : 'white',
                  color: pageNumber >= numPages ? '#8c959f' : '#24292f',
                  cursor: pageNumber >= numPages ? 'not-allowed' : 'pointer'
                }}
              >
                Următor ›
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default PDFViewer