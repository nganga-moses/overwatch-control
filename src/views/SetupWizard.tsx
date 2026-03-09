import { useState } from 'react';
import { Key, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import controlLogo from '../assets/control-logo.png';

const api = (window as any).electronAPI;

interface SetupWizardProps {
  onComplete: () => void;
}

const DEV_URL = 'http://localhost:8000';
const PROD_URL = 'https://overwatch.crysoftdynamics.com';
const isDev = import.meta.env.DEV;

export default function SetupWizard({ onComplete }: SetupWizardProps) {
  const [step, setStep] = useState<'code' | 'activating' | 'done'>('code');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ customerName: string } | null>(null);

  function formatCode(raw: string): string {
    const clean = raw.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 8);
    if (clean.length > 4) return clean.slice(0, 4) + '-' + clean.slice(4);
    return clean;
  }

  function handleCodeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/[^A-Z0-9-]/gi, '');
    setCode(formatCode(raw));
  }

  async function handleActivate() {
    setError('');
    setStep('activating');

    try {
      const url = isDev ? DEV_URL : PROD_URL;
      const cleanCode = code.replace(/-/g, '');
      const res = await api.auth.activate(url, cleanCode);
      setResult({ customerName: res.customerName });
      setStep('done');
    } catch (err: any) {
      setError(err.message ?? 'Activation failed');
      setStep('code');
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0d1117]">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <img src={controlLogo} alt="Overwatch Control" className="h-20 mx-auto mb-3" />
          <p className="text-gray-400 text-sm mt-1">First-time setup</p>
        </div>

        <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6 space-y-5">
          {error && (
            <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 text-red-400 rounded px-3 py-2 text-sm">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              {error}
            </div>
          )}

          {step === 'code' && (
            <>
              <div className="flex items-center gap-2 text-gray-300">
                <Key className="w-5 h-5 text-teal-400" />
                <h2 className="font-semibold">Activation Code</h2>
              </div>
              <p className="text-sm text-gray-400">
                Enter the 8-character code provided by your administrator.
              </p>

              <input
                value={code}
                onChange={handleCodeChange}
                maxLength={9}
                placeholder="XXXX-XXXX"
                className="w-full px-4 py-3 bg-[#1c2128] border border-[#30363d] rounded text-center text-xl font-mono tracking-[0.3em] text-white placeholder:text-gray-600 focus:outline-none focus:border-teal-400"
              />

              <button
                onClick={handleActivate}
                disabled={code.replace(/-/g, '').length !== 8}
                className="w-full py-2 bg-teal-400 text-[#0d1117] font-medium rounded text-sm hover:bg-teal-300 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Activate
              </button>

              {isDev && (
                <p className="text-[10px] text-gray-600 text-center">
                  DEV — {DEV_URL}
                </p>
              )}
            </>
          )}

          {step === 'activating' && (
            <div className="text-center py-8 space-y-3">
              <Loader2 className="w-8 h-8 text-teal-400 mx-auto animate-spin" />
              <p className="text-gray-400 text-sm">Activating workstation…</p>
            </div>
          )}

          {step === 'done' && result && (
            <div className="text-center py-6 space-y-4">
              <CheckCircle className="w-12 h-12 text-teal-400 mx-auto" />
              <div>
                <h2 className="font-semibold text-white text-lg">Activation Complete</h2>
                <p className="text-gray-400 text-sm mt-1">
                  Welcome to <span className="text-teal-400">{result.customerName}</span>
                </p>
              </div>
              <button
                onClick={onComplete}
                className="w-full py-2 bg-teal-400 text-[#0d1117] font-medium rounded text-sm hover:bg-teal-300 transition"
              >
                Continue to Login
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
