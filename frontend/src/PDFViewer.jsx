import { useState, useEffect, useRef, useMemo } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/esm/Page/AnnotationLayer.css'
import 'react-pdf/dist/esm/Page/TextLayer.css'

// Set up PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`

function PDFViewer({ pdfUrl, token, onClose, currentTheme, darkMode }) {
  const [numPages, setNumPages] = useState(null)
  const [pageNumber, setPageNumber] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [pageWidth, setPageWidth] = useState(null)
  const [customScale, setCustomScale] = useState(1.0)
  const [userHasScaled, setUserHasScaled] = useState(false)
  const [minViewerHeight, setMinViewerHeight] = useState(0)
  const [pageDimensions, setPageDimensions] = useState(null)
  const viewerRef = useRef(null)

  const memoizedFile = useMemo(() => ({
    url: pdfUrl,
    httpHeaders: { Authorization: `Bearer ${token}` }
  }), [pdfUrl, token])

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

  function onPageLoadSuccess(page) {
    setMinViewerHeight(0) // Deblocăm înălțimea când pagina nouă s-a încărcat
    
    const viewport = page.getViewport({ scale: 1 })
    setPageDimensions(prev => {
      // Dacă dimensiunile nu s-au schimbat, returnăm referința veche pt a preveni re-render în buclă
      if (prev && prev.width === viewport.width && prev.height === viewport.height) return prev;
      return { width: viewport.width, height: viewport.height }
    })

    if (!userHasScaled && pageWidth) {
      const viewport = page.getViewport({ scale: 1 })
      
      // Auto-scale width to fit 50% container
      const widthScale = (pageWidth - 40) / viewport.width
      // Auto-scale height to avoid white gaps underneath
      const heightScale = (window.innerHeight - 150) / viewport.height
      
      // We take the minimum of width or height to ensure the WHOLE page fits, 
      // preventing the massive whitespace if a landscape doc is scaled by width alone
      const calculatedScale = Math.min(widthScale, heightScale, 2.5) 
      setCustomScale(calculatedScale)
    }
  }

  function changePage(offset) {
    if (viewerRef.current) {
      // Înghețăm vizual înălțimea curentă înainte de a cere o pagină nouă
      setMinViewerHeight(viewerRef.current.offsetHeight)
    }
    setPageNumber(prevPageNumber => prevPageNumber + offset)
  }

  function previousPage() {
    changePage(-1)
  }

  function nextPage() {
    changePage(1)
  }

  // Păstrăm proporțiile la 50% pentru flexbox, ca originalul
  const containerWidth = '50%'

  return (
    <div
      ref={viewerRef}
      style={{
        width: containerWidth,
        height: 'fit-content',
        minHeight: minViewerHeight ? `${minViewerHeight}px` : 'auto',
        maxHeight: '100vh',
        alignSelf: 'start',
        backgroundColor: currentTheme.surface,
        borderLeft: `1px solid ${currentTheme.border}`,
        display: 'flex',
        flexDirection: 'column',
        boxShadow: darkMode ? '0 20px 60px rgba(0,0,0,0.18)' : '-2px 0 8px rgba(0,0,0,0.1)',
        overflow: 'hidden'
      }}
    >
      {/* Header */}
      <div style={{
        padding: '16px 20px',
        borderBottom: `1px solid ${currentTheme.border}`,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: currentTheme.background
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: currentTheme.text }}>
            Vizualizator PDF
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: currentTheme.cardBg, border: `1px solid ${currentTheme.border}`, borderRadius: '4px', padding: '2px 4px' }}>
            <button 
              onClick={() => { setCustomScale(prev => Math.max(0.5, prev - 0.15)); setUserHasScaled(true); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 8px', fontSize: '16px', color: currentTheme.text }}
              title="Micșorează"
            >−</button>
            <span style={{ fontSize: '14px', width: '45px', textAlign: 'center', userSelect: 'none', color: currentTheme.text }}>
              {Math.round(customScale * 100)}%
            </span>
            <button 
              onClick={() => { setCustomScale(prev => Math.min(3.0, prev + 0.15)); setUserHasScaled(true); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 8px', fontSize: '16px', color: currentTheme.text }}
              title="Mărește"
            >+</button>
          </div>
          {/* Navigation in Top Bar */}
          {!loading && !error && numPages > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginLeft: '16px' }}>
              <button
                disabled={pageNumber <= 1}
                onClick={previousPage}
                style={{
                  padding: '4px 8px',
                  border: `1px solid ${currentTheme.border}`,
                  borderRadius: '4px',
                  backgroundColor: pageNumber <= 1 ? currentTheme.surface : currentTheme.cardBg,
                  color: pageNumber <= 1 ? currentTheme.buttonDisabled : currentTheme.text,
                  cursor: pageNumber <= 1 ? 'not-allowed' : 'pointer',
                  fontSize: '13px'
                }}
              >
                ‹ Ant
              </button>

              <span style={{ fontSize: '14px', color: currentTheme.textSecondary, whiteSpace: 'nowrap' }}>
                {pageNumber} / {numPages}
              </span>

              <button
                disabled={pageNumber >= numPages}
                onClick={nextPage}
                style={{
                  padding: '4px 8px',
                  border: `1px solid ${currentTheme.border}`,
                  borderRadius: '4px',
                  backgroundColor: pageNumber >= numPages ? currentTheme.surface : currentTheme.cardBg,
                  color: pageNumber >= numPages ? currentTheme.buttonDisabled : currentTheme.text,
                  cursor: pageNumber >= numPages ? 'not-allowed' : 'pointer',
                  fontSize: '13px'
                }}
              >
                Urm ›
              </button>
            </div>
          )}
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            fontSize: '20px',
            cursor: 'pointer',
            color: currentTheme.textSecondary,
            padding: '4px'
          }}
        >
          ×
        </button>
      </div>

      {/* PDF Content */}
      <div style={{
        overflow: 'auto',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center'
      }}>
        {loading && (
          <div style={{ textAlign: 'center', padding: '40px', color: currentTheme.textSecondary }}>
            <div>Se încarcă PDF-ul...</div>
          </div>
        )}

        {error && (
          <div style={{
            textAlign: 'center',
            padding: '40px',
            color: currentTheme.error,
            backgroundColor: darkMode ? 'rgba(177, 42, 47, 0.1)' : '#ffeef0',
            borderRadius: '6px',
            border: `1px solid ${darkMode ? 'rgba(177, 42, 47, 0.4)' : '#ffcece'}`
          }}>
            {error}
          </div>
        )}

        {!error && (
          <>
            <Document
              file={memoizedFile}
              onLoadSuccess={onDocumentLoadSuccess}
              onLoadError={onDocumentLoadError}
              loading="Se încarcă documentul..."
            >
              <Page
                pageNumber={pageNumber}
                scale={customScale}
                onLoadSuccess={onPageLoadSuccess}
                renderTextLayer={true}
                renderAnnotationLayer={true}
                loading={
                  pageDimensions ? (
                    <div style={{
                      width: pageDimensions.width * customScale,
                      height: pageDimensions.height * customScale,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: currentTheme.textSecondary,
                      backgroundColor: currentTheme.cardBg
                    }}>
                      Se încarcă pagina...
                    </div>
                  ) : <div style={{ color: currentTheme.textSecondary }}>Se încarcă pagina...</div>
                }
              />
            </Document>
          </>
        )}
      </div>
    </div>
  )
}

export default PDFViewer