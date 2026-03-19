import { useState, useEffect } from 'react'
import PatientCard from './components/PatientCard'
import ChatInput from './components/ChatInput'
import NoteReview from './components/NoteReview'
import SessionHistory from './components/SessionHistory'
import { getPatientProfile } from './api'

// We will use a hardcoded patient ID that matches the seed.py for the MVP
const DEFAULT_PATIENT_ID = "00000000-0000-0000-0000-000000000001";

function App() {
  const [currentPatient] = useState(DEFAULT_PATIENT_ID);
  const [profileData, setProfileData] = useState(null);
  const [view, setView] = useState('chat'); // 'chat' | 'review'
  const [currentNoteData, setCurrentNoteData] = useState(null);
  const [originalDictation, setOriginalDictation] = useState('');

  const loadProfile = async () => {
    try {
      if (!currentPatient) return;
      const data = await getPatientProfile(currentPatient);
      setProfileData(data);
    } catch (err) {
      console.error("Error loading profile", err);
    }
  };

  useEffect(() => {
    loadProfile();
  }, [currentPatient]);

  const handleNoteGenerated = (noteData, dictation) => {
    setCurrentNoteData(noteData);
    setOriginalDictation(dictation);
    setView('review');
  };

  const handleBackToChat = () => {
    setView('chat');
  };

  const handleNoteConfirmed = () => {
    setCurrentNoteData(null);
    setOriginalDictation('');
    setView('chat');
    loadProfile(); // Refresh profile factors and timeline
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200 font-sans flex text-base">
      
      {/* Sidebar Placeholder */}
      <aside className="w-64 bg-slate-950 border-r border-slate-800 p-6 hidden lg:flex flex-col">
        <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-teal-400 to-emerald-500 mb-10 flex items-center gap-2">
          <svg className="w-8 h-8 text-teal-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"></path></svg>
          PsicoAgente
        </h1>
        
        <div className="mb-6">
          <h3 className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-3">Tus Pacientes</h3>
          <ul>
            <li className="bg-slate-800 text-teal-400 hover:bg-slate-800 hover:text-teal-400 px-4 py-2 rounded cursor-pointer transition-colors border-l-2 border-teal-500">
              Juan Martínez
            </li>
            <li className="text-slate-400 hover:bg-slate-800 hover:text-slate-300 px-4 py-2 rounded cursor-pointer transition-colors border-l-2 border-transparent">
              María Silva
            </li>
            <li className="text-slate-400 hover:bg-slate-800 hover:text-slate-300 px-4 py-2 rounded cursor-pointer transition-colors border-l-2 border-transparent">
              Carlos Gómez
            </li>
          </ul>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        <div className="p-8 pb-4 border-b border-slate-800 bg-slate-900 z-10">
          <PatientCard patientId={currentPatient} profileData={profileData} />
        </div>
        
        <div className="flex-1 overflow-hidden flex flex-col lg:flex-row gap-6 p-8">
          <div className="flex-1 overflow-y-auto">
            {view === 'chat' ? (
              <ChatInput 
                patientId={currentPatient} 
                onNoteGenerated={handleNoteGenerated} 
              />
            ) : (
              <NoteReview 
                noteData={currentNoteData} 
                originalDictation={originalDictation}
                onConfirm={handleNoteConfirmed}
                onBack={handleBackToChat}
              />
            )}
          </div>
          <div className="lg:w-1/3 xl:w-96 flex-shrink-0 h-full overflow-hidden">
            <SessionHistory patientId={currentPatient} />
          </div>
        </div>
      </main>
      
    </div>
  )
}

export default App
