import { useState, useRef } from 'react';
import { Upload, FileText, Loader2, CheckCircle2, XCircle } from 'lucide-react';

interface FloorPlanUploadProps {
  venueId: string;
  onComplete: () => void;
  onCancel: () => void;
}

type Stage = 'select' | 'uploading' | 'processing' | 'done' | 'error';

export function FloorPlanUpload({ venueId, onComplete, onCancel }: FloorPlanUploadProps) {
  const [stage, setStage] = useState<Stage>('select');
  const [fileName, setFileName] = useState<string | null>(null);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ zoneCount?: number; perchPointCount?: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setStage('uploading');
    setProgress('Uploading to cloud...');

    try {
      const filePath = (file as any).path;
      if (!filePath) {
        throw new Error('Could not get file path. Try again.');
      }

      setStage('processing');
      setProgress('Uploading and processing floor plan...');

      const uploadResult = await window.electronAPI.venues.uploadFloorPlan(venueId, filePath);

      if (uploadResult.status === 'completed') {
        setProgress(`Found ${uploadResult.zoneCount ?? 0} zones and ${uploadResult.perchPointCount ?? 0} perch candidates`);

        setProgress('Syncing zones and perch points...');
        await window.electronAPI.venues.fetchIntelligence(venueId);

        setProgress('Caching floor plan locally...');
        await window.electronAPI.venues.pullFloorPlan(venueId);

        setResult({
          zoneCount: uploadResult.zoneCount,
          perchPointCount: uploadResult.perchPointCount,
        });
        setStage('done');
      } else if (uploadResult.status === 'failed') {
        throw new Error('Ingestion failed on the server');
      } else {
        await pollForCompletion(venueId, uploadResult.jobId);
      }
    } catch (err: any) {
      setError(err.message ?? 'Upload failed');
      setStage('error');
    }
  }

  async function pollForCompletion(vid: string, jobId: string) {
    const maxAttempts = 60;
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const status = await window.electronAPI.venues.pollIngestion(vid, jobId);

      if (status.status === 'completed') {
        setProgress('Syncing zones and perch points...');
        await window.electronAPI.venues.fetchIntelligence(vid);

        setProgress('Caching floor plan locally...');
        await window.electronAPI.venues.pullFloorPlan(vid);

        setResult({
          zoneCount: status.zoneCount,
          perchPointCount: status.perchPointCount,
        });
        setStage('done');
        return;
      }

      if (status.status === 'failed') {
        throw new Error(status.error ?? 'Ingestion failed');
      }

      setProgress(`Processing... ${status.zoneCount ?? '?'} zones found so far`);
    }

    throw new Error('Ingestion timed out');
  }

  return (
    <div className="mt-3 rounded border border-ow-border bg-ow-bg p-3">
      {stage === 'select' && (
        <div className="text-center py-4">
          <input
            ref={fileInputRef}
            type="file"
            accept=".dxf,.pdf,.png,.jpg,.jpeg"
            onChange={handleFileSelect}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded bg-ow-surface border border-ow-border text-xs text-ow-text hover:border-ow-accent/50 transition-colors"
          >
            <Upload size={14} />
            Choose file (.dxf, .pdf, .png, .jpg)
          </button>
        </div>
      )}

      {(stage === 'uploading' || stage === 'processing') && (
        <div className="flex items-center gap-3 py-2">
          <Loader2 size={16} className="animate-spin text-ow-accent" />
          <div>
            {fileName && <p className="text-[10px] text-ow-text font-medium">{fileName}</p>}
            <p className="text-[9px] text-ow-text-dim">{progress}</p>
          </div>
        </div>
      )}

      {stage === 'done' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-ow-safe">
            <CheckCircle2 size={16} />
            <span className="text-xs font-medium">Ingestion complete</span>
          </div>
          <p className="text-[10px] text-ow-text-muted">
            {result?.zoneCount ?? 0} zones and {result?.perchPointCount ?? 0} perch candidates created
          </p>
          <button
            onClick={onComplete}
            className="px-3 py-1.5 rounded text-xs font-medium bg-ow-accent text-ow-bg hover:brightness-110 transition-all"
          >
            Done
          </button>
        </div>
      )}

      {stage === 'error' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-ow-danger">
            <XCircle size={16} />
            <span className="text-xs font-medium">Upload failed</span>
          </div>
          <p className="text-[10px] text-ow-text-dim">{error}</p>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setStage('select');
                setError(null);
              }}
              className="px-3 py-1.5 rounded text-xs text-ow-text-muted border border-ow-border hover:bg-ow-surface-2 transition-colors"
            >
              Try again
            </button>
            <button
              onClick={onCancel}
              className="px-3 py-1.5 rounded text-xs text-ow-text-dim hover:text-ow-text transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
