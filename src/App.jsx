import React, { useState } from 'react';
import ApplicantVKYC from './ApplicantVKYC';
import AgentVKYC from './AgentVKYC';

function App() {
  const [view, setView] = useState(null);

  if (view === 'applicant') return <ApplicantVKYC />;
  if (view === 'agent') return <AgentVKYC />;

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', height: '100vh', gap: '20px',
      fontFamily: 'sans-serif', background: '#f0f4f8'
    }}>
      <h2 style={{ color: '#074994' }}>V-CIP Demo Launcher</h2>
      <button onClick={() => setView('applicant')} style={{
        padding: '14px 40px', background: '#074994', color: '#fff',
        border: 'none', borderRadius: '8px', fontSize: '16px', cursor: 'pointer'
      }}>
        Launch Applicant Workflow
      </button>
      <button onClick={() => setView('agent')} style={{
        padding: '14px 40px', background: '#3067A6', color: '#fff',
        border: 'none', borderRadius: '8px', fontSize: '16px', cursor: 'pointer'
      }}>
        Launch Agent Workflow
      </button>
      <button onClick={() => setView(null)} style={{
        fontSize: '12px', color: '#6b7a99', background: 'none',
        border: 'none', cursor: 'pointer', marginTop: 8
      }}>
        ← Back to Launcher
      </button>
    </div>
  );
}

export default App;