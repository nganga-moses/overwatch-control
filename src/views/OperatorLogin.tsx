import { useEffect, useRef, useState } from 'react';
import { Shield, User, Lock, AlertCircle } from 'lucide-react';

const api = (window as any).electronAPI;

interface Operator {
  id: string;
  name: string;
  role: string;
}

interface OperatorLoginProps {
  onLogin: (operator: { id: string; name: string; role: string }) => void;
}

const LOCKOUT_DURATION_MS = 60_000;
const MAX_ATTEMPTS = 3;

export default function OperatorLogin({ onLogin }: OperatorLoginProps) {
  const [operators, setOperators] = useState<Operator[]>([]);
  const [selected, setSelected] = useState<Operator | null>(null);
  const [challengePositions, setChallengePositions] = useState<number[]>([]);
  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [lockoutEnd, setLockoutEnd] = useState<number | null>(null);
  const [lockoutRemaining, setLockoutRemaining] = useState(0);
  const [shake, setShake] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const prevPositionsRef = useRef<number[]>([]);

  useEffect(() => {
    api.auth.getOperators().then(setOperators);
    api.auth.getCustomerName().then((name: string) => setCustomerName(name ?? ''));
  }, []);

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

  async function selectOperator(op: Operator) {
    setSelected(op);
    setError('');
    setDigits(['', '', '', '', '', '']);
    const positions = await api.auth.getChallengePositions(prevPositionsRef.current);
    setChallengePositions(positions);
    prevPositionsRef.current = positions;

    setTimeout(() => {
      const firstActive = positions[0];
      inputRefs.current[firstActive]?.focus();
    }, 50);
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
    if (!selected) return;
    if (lockoutEnd && Date.now() < lockoutEnd) return;

    const enteredDigits = challengePositions.map((p) => digits[p]);
    if (enteredDigits.some((d) => d === '')) {
      setError('Enter all requested digits');
      return;
    }

    const valid = await api.auth.validatePin(selected.id, challengePositions, enteredDigits);

    if (valid) {
      await api.auth.writeAuditLog({
        operatorId: selected.id,
        action: 'login',
        detail: `Partial PIN challenge positions: ${challengePositions.map((p) => p + 1).join(', ')}`,
      });
      onLogin({ id: selected.id, name: selected.name, role: selected.role });
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

  const roleBadge = (role: string) => {
    const colors: Record<string, string> = {
      admin: 'bg-amber-400/20 text-amber-400',
      operator: 'bg-teal-400/20 text-teal-400',
      viewer: 'bg-gray-400/20 text-gray-400',
    };
    return colors[role] ?? colors.operator;
  };

  return (
    <div className="min-h-screen flex bg-[#0d1117]">
      {/* Left: operator list */}
      <div className="w-72 bg-[#161b22] border-r border-[#30363d] flex flex-col">
        <div className="p-4 border-b border-[#30363d]">
          <div className="flex items-center gap-2 mb-1">
            <Shield className="w-5 h-5 text-teal-400" />
            <span className="font-semibold text-white text-sm">Overwatch Control</span>
          </div>
          {customerName && <p className="text-xs text-gray-500 ml-7">{customerName}</p>}
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {operators.map((op) => (
            <button
              key={op.id}
              onClick={() => !isLockedOut && selectOperator(op)}
              disabled={isLockedOut}
              className={`w-full text-left px-3 py-2.5 rounded transition flex items-center gap-2 ${
                selected?.id === op.id
                  ? 'bg-teal-400/10 border border-teal-400/30'
                  : 'hover:bg-[#1c2128] border border-transparent'
              } ${isLockedOut ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <User className="w-4 h-4 text-gray-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-white truncate">{op.name}</div>
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${roleBadge(op.role)}`}>
                  {op.role}
                </span>
              </div>
            </button>
          ))}

          {operators.length === 0 && (
            <p className="text-gray-600 text-xs text-center py-4">No operators found</p>
          )}
        </div>
      </div>

      {/* Right: PIN challenge */}
      <div className="flex-1 flex items-center justify-center">
        {!selected ? (
          <div className="text-center space-y-3">
            <Lock className="w-12 h-12 text-gray-700 mx-auto" />
            <p className="text-gray-500 text-sm">Select an operator to sign in</p>
          </div>
        ) : (
          <div className={`w-full max-w-sm space-y-6 ${shake ? 'animate-[shake_0.5s_ease-in-out]' : ''}`}>
            <div className="text-center">
              <h2 className="text-lg font-semibold text-white">{selected.name}</h2>
              <p className="text-gray-400 text-sm mt-1">
                Enter digits{' '}
                <span className="text-teal-400 font-mono">
                  {challengePositions.map((p) => p + 1).join(', ')}
                </span>{' '}
                of your PIN
              </p>
            </div>

            {error && (
              <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 text-red-400 rounded px-3 py-2 text-sm">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {isLockedOut && (
              <div className="text-center text-sm text-gray-500">
                Retry in{' '}
                <span className="text-amber-400 font-mono">
                  {Math.ceil(lockoutRemaining / 1000)}s
                </span>
              </div>
            )}

            {/* PIN boxes */}
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
          </div>
        )}
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
