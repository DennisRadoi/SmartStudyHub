import streamlit as st
import os
from pypdf import PdfReader
import chromadb

from chromadb.utils.embedding_functions import OllamaEmbeddingFunction

# Configurații
MAX_FILE_SIZE_MB = 20
MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024
DB_DIR = "./local_db"

st.set_page_config(page_title="Smart Study Hub", page_icon="🧠", layout="wide")

# Inițializare Vector Database (ChromaDB)
@st.cache_resource
def get_db():
    client = chromadb.PersistentClient(path=DB_DIR)
    
    # Configurăm embedding-ul să se facă prin Ollama local cu nomic-embed-text
    ollama_ef = OllamaEmbeddingFunction(
        url="http://localhost:11434/api/embeddings",
        model_name="nomic-embed-text",
    )
    
    collection = client.get_or_create_collection(
        name="cursuri_studenti",
        embedding_function=ollama_ef
    )
    return collection

collection = get_db()

# State management pentru navigare între pagini
if "page" not in st.session_state:
    st.session_state.page = "upload"

def set_page(page_name):
    st.session_state.page = page_name

# Meniu lateral
st.sidebar.title("Meniu")
if st.sidebar.button("📚 Încărcare Documente", use_container_width=True):
    set_page("upload")
if st.sidebar.button("📂 Gestionare Documente", use_container_width=True):
    set_page("manage")

st.title("🧠 Smart Study Hub")

# ------------- PAGINA: ÎNCĂRCARE DOCUMENTE -------------
if st.session_state.page == "upload":
    st.subheader("📚 Încărcare Documente (PDF)")
    
    # Buton superior de navigare
    st.button("Mergi la Gestionare Documente ➡️", on_click=set_page, args=("manage",))

    uploaded_file = st.file_uploader("Încarcă un curs în format PDF (Max 20MB)", type=["pdf"])

    if uploaded_file is not None:
        if uploaded_file.size > MAX_FILE_SIZE_BYTES:
            st.error(f"❌ Eroare: Fișierul depășește limita maximă de {MAX_FILE_SIZE_MB} MB. Are {uploaded_file.size / (1024*1024):.2f} MB.")
        else:
            with st.spinner("Se procesează documentul..."):
                try:
                    pdf_reader = PdfReader(uploaded_file)
                    extracted_text = ""
                    documents = []
                    metadatas = []
                    ids = []
                    
                    for i, page in enumerate(pdf_reader.pages):
                        text = page.extract_text()
                        if text.strip():
                            extracted_text += text + "\n"
                            documents.append(text)
                            metadatas.append({"source": uploaded_file.name, "page": i + 1})
                            ids.append(f"{uploaded_file.name}_page_{i+1}")

                    if documents:
                        # Salvăm direct utilizând funcția upsert pentru a nu dubla intrările dacă încărcăm din nou același nume
                        collection.upsert(
                            documents=documents,
                            metadatas=metadatas,
                            ids=ids
                        )
                        
                        st.success(f"✅ Succes! Fișierul '{uploaded_file.name}' a fost procesat și salvat în baza de date locală.")
                        with st.expander("Vezi o scurtă previzualizare a textului"):
                            st.write(extracted_text[:1000] + "...")
                        
                        st.button("Vezi lista tuturor documentelor salvate", on_click=set_page, args=("manage",), key="btn_success_manage")
                        
                    else:
                        st.warning("⚠️ Fișierul PDF a fost încărcat, dar nu s-a putut extrage text din el (poate fi un PDF scanat/imagine).")

                except Exception as e:
                    st.error(f"❌ A apărut o eroare la procesarea fișierului PDF: {str(e)}")

# ------------- PAGINA: GESTIONARE DOCUMENTE -------------
elif st.session_state.page == "manage":
    st.subheader("📂 Documente Salvate")
    st.button("⬅️ Înapoi la Încărcare", on_click=set_page, args=("upload",))
    
    # Preluare toate datele din baza de date din ChromaDB
    db_data = collection.get(include=["metadatas", "documents"])
    
    if not db_data or not db_data["metadatas"]:
        st.info("Niciun document salvat în baza de date momentan.")
    else:
        # Găsim unicele PDF-uri încărcate pe bază de sursă
        unique_sources = list(set([meta["source"] for meta in db_data["metadatas"] if meta and "source" in meta]))
        
        if not unique_sources:
             st.info("Niciun document valid a fost găsit în baza de date momentan.")
        else:
            if (len(unique_sources) == 1):
                st.write(f"S-a găsit un document salvat:")
            else:
                st.write(f"S-au găsit **{len(unique_sources)}** documente salvate:")
            
            for source in unique_sources:
                with st.expander(f"📄 {source}"):
                    # Găsim paginile/extrasele aferente acestui fișier fix
                    source_ids_idx = [i for i, meta in enumerate(db_data["metadatas"]) if meta and meta.get("source") == source]
                    st.write(f"Sursă: `{source}`")
                    st.write(f"Bucăți indexate de model (Pagini): **{len(source_ids_idx)}**")
                    
                    # Butonul de Ștergere care elimină fișierele cu `doc_source == source`
                    if st.button("🗑️ Șterge document din memorie", key=f"del_{source}", type="primary"):
                        collection.delete(where={"source": source})
                        st.success(f"Documentul `{source}` a fost șters! Te rog reîncarcă pagina pentru actualizare listă.")
                        # Ne forțăm să refacem componenta (Streamlit va re-rula script-ul on click funcție curată la re-refresh)

                    # Am extras textul ca să-l putem vizualiza în întregime
                    if st.checkbox(f"Afișează integral documentul salvat", key=f"check_{source}"):
                        st.caption(f"Textul complet indexat pentru `{source}` ({len(source_ids_idx)} pagini):")
                        full_text = "\n\n--- PAGINĂ URMĂTOARE ---\n\n".join([db_data["documents"][idx] for idx in source_ids_idx])
                        st.text_area("Conținut document", full_text, height=400, disabled=True, label_visibility="collapsed")
