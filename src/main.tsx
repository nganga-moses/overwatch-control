import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

type DataMode = 'simulation' | 'live';

function Root() {
  const [mode, setMode] = useState<DataMode>('simulation');

  const isElectron = typeof window !== 'undefined' && 'electronAPI' in window;

  return (
    <App
      mode={mode}
      onModeChange={setMode}
      isElectron={isElectron}
    />
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
