import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import controlLogo from '../assets/control-logo.png';

const api = (window as any).electronAPI;

interface OperatorLoginProps {
  onLogin: (operator: { id: string; name: string; role: string }) => void;
}

const LOCKOUT_DURATION_MS = 60_000;
const MAX_ATTEMPTS = 3;

export default function OperatorLogin({ onLogin }: OperatorLoginProps) {
  const [step, setStep] = useState<'identify' | 'challenge'>('identify');
  const [callSign, setCallSign] = useState('');
  const [operator, setOperator] = useState<{ id: string; name: string; role: string } | null>(null);
  const [challengePositions, setChallengePositions] = useState<number[]>([]);
  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [lockoutEnd, setLockoutEnd] = useState<number | null>(null);
  const [lockoutRemaining, setLockoutRemaining] = useState(0);
  const [shake, setShake] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const callSignRef = useRef<HTMLInputElement>(null);
  const prevPositionsRef = useRef<number[]>([]);

  useEffect(() => {
    api.auth.getCustomerName().then((name: string) => setCustomerName(name ?? ''));
    callSignRef.current?.focus();
  }, []);

  async function handleSync() {
    setSyncing(true);
    setSyncMessage('');
    setError('');
    try {
      await api.sync.triggerSync();
      setSyncMessage('Synced');
      setTimeout(() => setSyncMessage(''), 3000);
    } catch {
      setSyncMessage('Sync failed — offline?');
      setTimeout(() => setSyncMessage(''), 5000);
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    if (!lockoutEnd) return;
    const interval = setInterval(() => {
      const rem = Math.max(0, lockoutEnd - Date.now());
      setLockoutRemaining(rem);
      if (rem <= 0) {
        setLockoutEnd(null);
        setAttempts(0);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [lockoutEnd]);

  async function handleIdentify(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = callSign.trim();
    if (!trimmed) return;

    setError('');
    setLoading(true);

    try {
      const found = await api.auth.findOperator(trimmed);
      if (!found) {
        setError('Operator not found');
        return;
      }

      setOperator(found);
      const positions = await api.auth.getChallengePositions(prevPositionsRef.current);
      setChallengePositions(positions);
      prevPositionsRef.current = positions;
      setStep('challenge');

      setTimeout(() => inputRefs.current[positions[0]]?.focus(), 50);
    } finally {
      setLoading(false);
    }
  }

  function handleBack() {
    setStep('identify');
    setOperator(null);
    setError('');
    setDigits(['', '', '', '', '', '']);
    setAttempts(0);
    setTimeout(() => callSignRef.current?.focus(), 50);
  }

  function handleDigitChange(position: number, value: string) {
    if (!/^\d?$/.test(value)) return;
    const next = [...digits];
    next[position] = value;
    setDigits(next);

    if (value && challengePositions.includes(position)) {
      const currentIdx = challengePositions.indexOf(position);
      const nextPos = challengePositions[currentIdx + 1];
      if (nextPos !== undefined) {
        inputRefs.current[nextPos]?.focus();
      }
    }
  }

  function handleKeyDown(position: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !digits[position]) {
      const currentIdx = challengePositions.indexOf(position);
      const prevPos = challengePositions[currentIdx - 1];
      if (prevPos !== undefined) {
        inputRefs.current[prevPos]?.focus();
      }
    }
    if (e.key === 'Enter') {
      handleSubmit();
    }
  }

  async function handleSubmit() {
    if (!operator) return;
    if (lockoutEnd && Date.now() < lockoutEnd) return;

    const enteredDigits = challengePositions.map((p) => digits[p]);
    if (enteredDigits.some((d) => d === '')) {
      setError('Enter all requested digits');
      return;
    }

    const valid = await api.auth.validatePin(operator.id, challengePositions, enteredDigits);

    if (valid) {
      await api.auth.writeAuditLog({
        operatorId: operator.id,
        action: 'login',
        detail: `Partial PIN challenge positions: ${challengePositions.map((p) => p + 1).join(', ')}`,
      });
      onLogin({ id: operator.id, name: operator.name, role: operator.role });
    } else {
      const newAttempts = attempts + 1;
      setAttempts(newAttempts);
      setShake(true);
      setTimeout(() => setShake(false), 500);

      if (newAttempts >= MAX_ATTEMPTS) {
        setLockoutEnd(Date.now() + LOCKOUT_DURATION_MS);
        setError('Too many attempts. Locked out for 60 seconds.');
      } else {
        setError(`Incorrect PIN (${MAX_ATTEMPTS - newAttempts} attempts remaining)`);
      }

      setDigits(['', '', '', '', '', '']);
      const positions = await api.auth.getChallengePositions(prevPositionsRef.current);
      setChallengePositions(positions);
      prevPositionsRef.current = positions;
      setTimeout(() => inputRefs.current[positions[0]]?.focus(), 50);
    }
  }

  const isLockedOut = lockoutEnd !== null && Date.now() < lockoutEnd;

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0d1117]">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <img src={controlLogo} alt="Overwatch Control" className="h-16 mx-auto mb-2" />
          {customerName && <p className="text-xs text-gray-500">{customerName}</p>}
        </div>

        <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6 space-y-5">
          {error && (
            <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 text-red-400 rounded px-3 py-2 text-sm">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {step === 'identify' && (
            <form onSubmit={handleIdentify} className="space-y-4">
              <div className="text-center">
                <h2 className="text-base font-semibold text-white">Operator Sign In</h2>
                <p className="text-gray-400 text-sm mt-1">Enter your call sign</p>
              </div>

              <input
                ref={callSignRef}
                type="text"
                value={callSign}
                onChange={(e) => setCallSign(e.target.value)}
                placeholder="Call sign"
                autoFocus
                className="w-full px-4 py-3 bg-[#1c2128] border border-[#30363d] rounded text-white text-sm placeholder:text-gray-600 focus:outline-none focus:border-teal-400"
              />

              <button
                type="submit"
                disabled={!callSign.trim() || loading}
                className="w-full py-2.5 bg-teal-400 text-[#0d1117] font-medium rounded text-sm hover:bg-teal-300 transition disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1.5"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                {loading ? 'Looking up…' : 'Continue'}
              </button>
            </form>
          )}

          {step === 'challenge' && operator && (
            <div className={`space-y-5 ${shake ? 'animate-[shake_0.5s_ease-in-out]' : ''}`}>
              <div className="text-center">
                <h2 className="text-base font-semibold text-white">{operator.name}</h2>
                <p className="text-gray-400 text-sm mt-1">
                  Enter digits{' '}
                  <span className="text-teal-400 font-mono">
                    {challengePositions.map((p) => p + 1).join(', ')}
                  </span>{' '}
                  of your PIN
                </p>
              </div>

              {isLockedOut && (
                <div className="text-center text-sm text-gray-500">
                  Retry in{' '}
                  <span className="text-amber-400 font-mono">
                    {Math.ceil(lockoutRemaining / 1000)}s
                  </span>
                </div>
              )}

              <div className="flex justify-center gap-2">
                {[0, 1, 2, 3, 4, 5].map((pos) => {
                  const isActive = challengePositions.includes(pos);
                  return (
                    <div key={pos} className="flex flex-col items-center gap-1">
                      <span className="text-[10px] text-gray-600 font-mono">{pos + 1}</span>
                      <input
                        ref={(el) => { inputRefs.current[pos] = el; }}
                        type="password"
                        maxLength={1}
                        value={digits[pos]}
                        onChange={(e) => handleDigitChange(pos, e.target.value)}
                        onKeyDown={(e) => handleKeyDown(pos, e)}
                        disabled={!isActive || isLockedOut}
                        className={`w-11 h-14 text-center text-xl font-mono rounded border transition ${
                          isActive
                            ? 'bg-[#1c2128] border-teal-400/40 text-white focus:border-teal-400 focus:outline-none cursor-text'
                            : 'bg-[#0d1117] border-[#1c2128] text-gray-700 cursor-not-allowed'
                        } ${isLockedOut ? 'opacity-40' : ''}`}
                      />
                    </div>
                  );
                })}
              </div>

              <button
                onClick={handleSubmit}
                disabled={isLockedOut}
                className="w-full py-2.5 bg-teal-400 text-[#0d1117] font-medium rounded text-sm hover:bg-teal-300 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Sign In
              </button>

              <button
                onClick={handleBack}
                disabled={isLockedOut}
                className="w-full text-sm text-gray-500 hover:text-gray-300 transition disabled:opacity-40"
              >
                Not you? Go back
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center justify-center gap-2 text-xs">
          <button
            onClick={handleSync}
            disabled={syncing}
            className="text-gray-500 hover:text-teal-400 transition disabled:opacity-50 inline-flex items-center gap-1"
          >
            <RefreshCw className={`w-3 h-3 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing…' : 'Sync'}
          </button>
          {syncMessage && (
            <span className={syncMessage === 'Synced' ? 'text-teal-400' : 'text-amber-400'}>
              {syncMessage}
            </span>
          )}
        </div>
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-4px); }
          20%, 40%, 60%, 80% { transform: translateX(4px); }
        }
      `}</style>
    </div>
  );
}
