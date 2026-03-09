import { useState } from 'react';
import { Clock, Cloud, Radio, ShieldCheck, Loader2, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import type { BriefingData } from '../BriefingWizard';

interface WeatherConditions {
  temperature_c: number;
  wind_speed_ms: number;
  wind_gust_ms: number | null;
  humidity_percent: number | null;
  precipitation_mm: number;
  precipitation_type: string;
  visibility_m: number;
  cloud_cover_percent: number | null;
}

interface GoNoGoResult {
  tier1_go: boolean;
  tier2_go: boolean;
  tier1_reason: string;
  tier2_reason: string;
  overall_go: boolean;
}

interface WeatherResponse {
  conditions: WeatherConditions;
  go_no_go: GoNoGoResult;
}

interface Props {
  data: BriefingData;
  onChange: (patch: Partial<BriefingData>) => void;
}

const AUTONOMY_LEVELS = [
  { value: 'inform',    label: 'Inform Only',         desc: 'Operator makes all decisions' },
  { value: 'recommend', label: 'Recommend Actions',   desc: 'Operator confirms recommendations' },
  { value: 'act',       label: 'Act Autonomously',    desc: 'Operator monitors, system acts' },
] as const;

const ENVIRONMENTS = [
  { value: 'indoor',  label: 'Indoor' },
  { value: 'outdoor', label: 'Outdoor' },
  { value: 'mixed',   label: 'Mixed' },
] as const;

export function OperationalParamsStep({ data, onChange }: Props) {
  const [weather, setWeather] = useState<WeatherResponse | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState<string | null>(null);

  const showWeather = data.environment === 'outdoor' || data.environment === 'mixed';

  async function checkWeather() {
    if (data.venueLat == null || data.venueLng == null) {
      setWeatherError('Venue has no coordinates configured');
      return;
    }
    setWeatherLoading(true);
    setWeatherError(null);
    try {
      const result = await window.electronAPI.weather.getCurrent(data.venueLat, data.venueLng);
      setWeather(result);
    } catch (err: any) {
      setWeatherError(err?.message ?? 'Failed to fetch weather data');
    } finally {
      setWeatherLoading(false);
    }
  }

  function updateHitl(key: keyof BriefingData['hitlRules'], value: boolean) {
    onChange({ hitlRules: { ...data.hitlRules, [key]: value } });
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-ow-text mb-1">Step 6: Operational Parameters</h2>
        <p className="text-[11px] text-ow-text-dim">Configure timing, environment, autonomy, and escalation rules.</p>
      </div>

      {/* Time Window */}
      <div className="bg-ow-surface rounded-lg border border-ow-border p-4 space-y-3">
        <h3 className="text-[9px] font-bold uppercase tracking-wider text-ow-text-dim flex items-center gap-1.5">
          <Clock size={12} /> Operation Time Window
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[9px] text-ow-text-dim mb-0.5">Planned Start</label>
            <input
              type="datetime-local"
              value={data.plannedStart}
              onChange={(e) => onChange({ plannedStart: e.target.value })}
              className="w-full bg-ow-bg border border-ow-border rounded px-3 py-1.5 text-xs text-ow-text focus:outline-none focus:border-ow-accent"
            />
          </div>
          <div>
            <label className="block text-[9px] text-ow-text-dim mb-0.5">Planned End</label>
            <input
              type="datetime-local"
              value={data.plannedEnd}
              onChange={(e) => onChange({ plannedEnd: e.target.value })}
              className="w-full bg-ow-bg border border-ow-border rounded px-3 py-1.5 text-xs text-ow-text focus:outline-none focus:border-ow-accent"
            />
          </div>
        </div>
      </div>

      {/* Environment */}
      <div className="bg-ow-surface rounded-lg border border-ow-border p-4 space-y-3">
        <h3 className="text-[9px] font-bold uppercase tracking-wider text-ow-text-dim flex items-center gap-1.5">
          <Cloud size={12} /> Environment
        </h3>
        <p className="text-[9px] text-ow-text-dim">
          Auto-detected from venue type ({data.venueType}). Override if needed.
        </p>
        <div className="flex gap-2">
          {ENVIRONMENTS.map((env) => (
            <label
              key={env.value}
              className="flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-all"
              style={{
                background: data.environment === env.value ? '#2dd4bf10' : '#0d1117',
                border: `1px solid ${data.environment === env.value ? '#2dd4bf40' : '#30363d'}`,
              }}
            >
              <input
                type="radio"
                name="environment"
                value={env.value}
                checked={data.environment === env.value}
                onChange={(e) => onChange({ environment: e.target.value })}
                className="sr-only"
              />
              <span className={`text-xs font-medium ${data.environment === env.value ? 'text-ow-accent' : 'text-ow-text-dim'}`}>
                {env.label}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Weather Check (outdoor/mixed only) */}
      {showWeather && (
        <div className="bg-ow-surface rounded-lg border border-ow-border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-[9px] font-bold uppercase tracking-wider text-ow-text-dim flex items-center gap-1.5">
              <Cloud size={12} /> Weather Assessment
            </h3>
            <button
              onClick={checkWeather}
              disabled={weatherLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[10px] font-medium bg-ow-accent text-ow-bg hover:brightness-110 disabled:opacity-50 transition-all"
            >
              {weatherLoading ? <Loader2 size={12} className="animate-spin" /> : <Cloud size={12} />}
              {weatherLoading ? 'Checking...' : 'Check Weather'}
            </button>
          </div>

          {weatherError && (
            <div className="flex items-center gap-1.5 text-[10px] text-ow-danger">
              <AlertTriangle size={12} />
              <span>{weatherError}</span>
            </div>
          )}

          {weather && (
            <div className="space-y-3">
              {/* Conditions grid */}
              <div className="grid grid-cols-5 gap-2">
                <ConditionCard label="Temp" value={`${weather.conditions.temperature_c.toFixed(1)}°C`} />
                <ConditionCard label="Wind" value={`${weather.conditions.wind_speed_ms.toFixed(1)} m/s`} />
                <ConditionCard
                  label="Gusts"
                  value={weather.conditions.wind_gust_ms != null ? `${weather.conditions.wind_gust_ms.toFixed(1)} m/s` : '—'}
                />
                <ConditionCard
                  label="Precip"
                  value={`${weather.conditions.precipitation_mm.toFixed(1)} mm`}
                  sub={weather.conditions.precipitation_type !== 'none' ? weather.conditions.precipitation_type : undefined}
                />
                <ConditionCard
                  label="Visibility"
                  value={weather.conditions.visibility_m >= 1000
                    ? `${(weather.conditions.visibility_m / 1000).toFixed(1)} km`
                    : `${weather.conditions.visibility_m.toFixed(0)} m`}
                />
              </div>

              {/* Go/No-Go */}
              <div className="grid grid-cols-2 gap-2">
                <GoNoGoCard
                  tier="Tier 1 (Indoor)"
                  go={weather.go_no_go.tier1_go}
                  reason={weather.go_no_go.tier1_reason}
                />
                <GoNoGoCard
                  tier="Tier 2 (Outdoor)"
                  go={weather.go_no_go.tier2_go}
                  reason={weather.go_no_go.tier2_reason}
                />
              </div>
            </div>
          )}

          {!weather && !weatherError && !weatherLoading && (
            <p className="text-[9px] text-ow-text-dim">
              Check current weather conditions at the venue to assess drone flight viability.
            </p>
          )}
        </div>
      )}

      {/* Autonomy Level */}
      <div className="bg-ow-surface rounded-lg border border-ow-border p-4 space-y-3">
        <h3 className="text-[9px] font-bold uppercase tracking-wider text-ow-text-dim flex items-center gap-1.5">
          <Radio size={12} /> Autonomy Level
        </h3>
        <div className="space-y-2">
          {AUTONOMY_LEVELS.map((level) => (
            <label
              key={level.value}
              className="flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all"
              style={{
                background: data.autonomyLevel === level.value ? '#2dd4bf10' : '#0d1117',
                border: `1px solid ${data.autonomyLevel === level.value ? '#2dd4bf40' : '#30363d'}`,
              }}
            >
              <input
                type="radio"
                name="autonomyLevel"
                value={level.value}
                checked={data.autonomyLevel === level.value}
                onChange={(e) => onChange({ autonomyLevel: e.target.value })}
                className="sr-only"
              />
              <div className="w-3 h-3 rounded-full border-2 flex items-center justify-center shrink-0"
                style={{ borderColor: data.autonomyLevel === level.value ? '#2dd4bf' : '#30363d' }}
              >
                {data.autonomyLevel === level.value && (
                  <div className="w-1.5 h-1.5 rounded-full bg-ow-accent" />
                )}
              </div>
              <div>
                <div className={`text-xs font-medium ${data.autonomyLevel === level.value ? 'text-ow-accent' : 'text-ow-text'}`}>
                  {level.label}
                </div>
                <div className="text-[9px] text-ow-text-dim">{level.desc}</div>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* HITL Escalation Rules */}
      <div className="bg-ow-surface rounded-lg border border-ow-border p-4 space-y-3">
        <h3 className="text-[9px] font-bold uppercase tracking-wider text-ow-text-dim flex items-center gap-1.5">
          <ShieldCheck size={12} /> Human-in-the-Loop Escalation
        </h3>
        <p className="text-[9px] text-ow-text-dim">
          Select which alert severities require human confirmation before action.
        </p>
        <div className="space-y-2">
          <HitlCheckbox
            label="Critical Alerts"
            description="High-severity threats and breaches"
            checked={data.hitlRules.critical}
            onChange={(v) => updateHitl('critical', v)}
            color="text-ow-danger"
          />
          <HitlCheckbox
            label="Warning Alerts"
            description="Anomalies and potential threats"
            checked={data.hitlRules.warning}
            onChange={(v) => updateHitl('warning', v)}
            color="text-ow-warning"
          />
          <HitlCheckbox
            label="Info Alerts"
            description="Routine observations and status changes"
            checked={data.hitlRules.info}
            onChange={(v) => updateHitl('info', v)}
            color="text-ow-info"
          />
        </div>
      </div>
    </div>
  );
}

function ConditionCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-ow-bg rounded p-2 text-center">
      <div className="text-[8px] uppercase tracking-wider text-ow-text-dim mb-1">{label}</div>
      <div className="text-xs font-mono font-medium text-ow-text">{value}</div>
      {sub && <div className="text-[8px] text-ow-text-dim mt-0.5">{sub}</div>}
    </div>
  );
}

function GoNoGoCard({ tier, go, reason }: { tier: string; go: boolean; reason: string }) {
  return (
    <div
      className="rounded-lg p-3"
      style={{
        background: go ? '#3fb95010' : '#f8514910',
        border: `1px solid ${go ? '#3fb95040' : '#f8514940'}`,
      }}
    >
      <div className="flex items-center gap-2 mb-1">
        {go ? <CheckCircle2 size={14} className="text-ow-safe" /> : <XCircle size={14} className="text-ow-danger" />}
        <span className={`text-[11px] font-bold ${go ? 'text-ow-safe' : 'text-ow-danger'}`}>
          {go ? 'GO' : 'NO-GO'}
        </span>
        <span className="text-[9px] text-ow-text-dim">{tier}</span>
      </div>
      <p className="text-[9px] text-ow-text-dim">{reason}</p>
    </div>
  );
}

function HitlCheckbox({
  label,
  description,
  checked,
  onChange,
  color,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  color: string;
}) {
  return (
    <label
      className="flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-all"
      style={{
        background: checked ? '#161b22' : '#0d1117',
        border: `1px solid ${checked ? '#30363d' : '#21262d'}`,
      }}
    >
      <div
        className="w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors"
        style={{
          borderColor: checked ? '#2dd4bf' : '#30363d',
          background: checked ? '#2dd4bf' : 'transparent',
        }}
      >
        {checked && (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M2 5L4 7L8 3" stroke="#0d1117" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>
      <div className="flex-1">
        <div className={`text-xs font-medium ${color}`}>{label}</div>
        <div className="text-[9px] text-ow-text-dim">{description}</div>
      </div>
    </label>
  );
}
