import { useState } from 'react';
import { Shield, Server, Key, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

const api = (window as any).electronAPI;

interface SetupWizardProps {
  onComplete: () => void;
}

const PRODUCTION_URL = 'https://api.overwatch.io/api/v1';

export default function SetupWizard({ onComplete }: SetupWizardProps) {
  const [step, setStep] = useState<'url' | 'code' | 'activating' | 'done'>('url');
  const [cloudUrl, setCloudUrl] = useState(PRODUCTION_URL);
  const [useCustom, setUseCustom] = useState(false);
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
      const url = useCustom ? cloudUrl : PRODUCTION_URL;
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
        {/* Logo */}
        <div className="text-center">
          <Shield className="w-14 h-14 text-teal-400 mx-auto mb-3" />
          <h1 className="text-2xl font-bold text-white">Overwatch Control</h1>
          <p className="text-gray-400 text-sm mt-1">First-time setup</p>
        </div>

        {/* Step indicators */}
        <div className="flex items-center justify-center gap-2">
          {['Server', 'Activate'].map((label, i) => {
            const active = (i === 0 && step === 'url') || (i === 1 && (step === 'code' || step === 'activating'));
            const done = (i === 0 && step !== 'url') || (i === 1 && step === 'done');
            return (
              <div key={label} className="flex items-center gap-1">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium border ${
                    done
                      ? 'bg-teal-400/20 border-teal-400 text-teal-400'
                      : active
                        ? 'border-teal-400 text-teal-400'
                        : 'border-gray-600 text-gray-500'
                  }`}
                >
                  {done ? <CheckCircle className="w-4 h-4" /> : i + 1}
                </div>
                <span className={`text-xs ${active || done ? 'text-gray-300' : 'text-gray-600'}`}>{label}</span>
                {i < 1 && <div className="w-8 h-px bg-gray-700 mx-1" />}
              </div>
            );
          })}
        </div>

        <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6 space-y-5">
          {error && (
            <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 text-red-400 rounded px-3 py-2 text-sm">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              {error}
            </div>
          )}

          {step === 'url' && (
            <>
              <div className="flex items-center gap-2 text-gray-300">
                <Server className="w-5 h-5 text-teal-400" />
                <h2 className="font-semibold">Cloud Server</h2>
              </div>

              <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useCustom}
                  onChange={(e) => setUseCustom(e.target.checked)}
                  className="rounded bg-[#1c2128] border-[#30363d] text-teal-400 focus:ring-teal-400/30"
                />
                Custom server URL
              </label>

              {useCustom && (
                <input
                  value={cloudUrl}
                  onChange={(e) => setCloudUrl(e.target.value)}
                  placeholder="https://your-server.com"
                  className="w-full px-3 py-2 bg-[#1c2128] border border-[#30363d] rounded text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-teal-400"
                />
              )}

              {!useCustom && (
                <p className="text-xs text-gray-500">
                  Connecting to: <span className="text-gray-400">{PRODUCTION_URL}</span>
                </p>
              )}

              <button
                onClick={() => setStep('code')}
                className="w-full py-2 bg-teal-400 text-[#0d1117] font-medium rounded text-sm hover:bg-teal-300 transition"
              >
                Continue
              </button>
            </>
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

              <div className="flex gap-2">
                <button
                  onClick={() => setStep('url')}
                  className="px-4 py-2 text-sm text-gray-400 hover:text-white transition"
                >
                  Back
                </button>
                <button
                  onClick={handleActivate}
                  disabled={code.replace(/-/g, '').length !== 8}
                  className="flex-1 py-2 bg-teal-400 text-[#0d1117] font-medium rounded text-sm hover:bg-teal-300 transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Activate
                </button>
              </div>
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
