import { useState } from 'react';
import {
  Upload, Loader2, CheckCircle2, XCircle,
  FileText, Layers, FileInput,
} from 'lucide-react';

interface FloorPlanUploadProps {
  venueId: string;
  onComplete: () => void;
  onCancel: () => void;
}

type Stage = 'select' | 'review' | 'uploading' | 'processing' | 'done' | 'error';
type PageMode = 'all' | 'single';

export function FloorPlanUpload({ venueId, onComplete, onCancel }: FloorPlanUploadProps) {
  const [stage, setStage] = useState<Stage>('select');
  const [fileName, setFileName] = useState<string | null>(null);
  const [filePath, setFilePath] = useState<string | null>(null);
  const [isPdf, setIsPdf] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    zoneCount?: number;
    perchPointCount?: number;
    pagesProcessed?: number;
  } | null>(null);
  const [pageMode, setPageMode] = useState<PageMode>('all');
  const [selectedPage, setSelectedPage] = useState(1);
  const [floorLevel, setFloorLevel] = useState(0);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [detectingPages, setDetectingPages] = useState(false);

  async function handlePickFile() {
    const fp: string | null = await window.electronAPI.venues.pickFloorPlanFile();
    if (!fp) return;

    const name = fp.split('/').pop() ?? fp;
    const ext = name.split('.').pop()?.toLowerCase() ?? '';
    setFileName(name);
    setFilePath(fp);
    setIsPdf(ext === 'pdf');

    if (ext === 'pdf') {
      setStage('review');
    } else {
      runIngestion(fp, {});
    }
  }

  async function handleReviewConfirm() {
    if (!filePath) return;
    const opts: { floorLevel?: number; pageNumber?: number } = {
      floorLevel,
    };
    if (pageMode === 'single') {
      opts.pageNumber = selectedPage;
    }
    await runIngestion(filePath, opts);
  }

  async function runIngestion(
    fp: string,
    opts: { floorLevel?: number; pageNumber?: number },
  ) {
    setStage('uploading');
    setProgress('Uploading to cloud...');

    try {
      setStage('processing');
      setProgress('Uploading and processing floor plan...');

      const uploadResult = await window.electronAPI.venues.uploadFloorPlan(venueId, fp, opts);

      if (uploadResult.status === 'completed') {
        const pages = uploadResult.pagesProcessed ?? 1;
        setProgress(
          `Found ${uploadResult.zoneCount ?? 0} zones and ${uploadResult.perchPointCount ?? 0} perch candidates` +
          (pages > 1 ? ` across ${pages} floors` : ''),
        );

        setProgress('Syncing zones and perch points...');
        await window.electronAPI.venues.fetchIntelligence(venueId);

        setProgress('Caching floor plan locally...');
        await window.electronAPI.venues.pullFloorPlan(venueId);

        setResult({
          zoneCount: uploadResult.zoneCount,
          perchPointCount: uploadResult.perchPointCount,
          pagesProcessed: pages,
        });
        setStage('done');
      } else if (uploadResult.status === 'failed') {
        throw new Error('Ingestion failed on the server');
      } else {
        await pollForCompletion(venueId, uploadResult.jobId);
      }
    } catch (err: any) {
      console.error('[FloorPlanUpload] Upload failed:', err);
      setError(err.message || String(err) || 'Upload failed');
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

  async function handleDetectPages() {
    if (!filePath) return;
    setDetectingPages(true);
    try {
      const ext = fileName?.split('.').pop()?.toLowerCase() ?? '';
      const blobKey = `venues/${venueId}/floorplan.${ext}`;

      const urlResp = await window.electronAPI.venues.uploadFloorPlan(venueId, filePath, {});
      void urlResp;

      const count = await window.electronAPI.venues.getPageCount(venueId, blobKey);
      setPageCount(count);
    } catch {
      setPageCount(1);
    } finally {
      setDetectingPages(false);
    }
  }

  return (
    <div className="mt-3 rounded border border-ow-border bg-ow-bg p-3">
      {/* File selection */}
      {stage === 'select' && (
        <div className="text-center py-4">
          <button
            onClick={handlePickFile}
            className="inline-flex items-center gap-2 px-4 py-2 rounded bg-ow-surface border border-ow-border text-xs text-ow-text hover:border-ow-accent/50 transition-colors"
          >
            <Upload size={14} />
            Choose file (.dxf, .pdf, .png, .jpg)
          </button>
        </div>
      )}

      {/* PDF review step */}
      {stage === 'review' && isPdf && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <FileText size={14} className="text-ow-accent" />
            <span className="text-[11px] font-medium text-ow-text">{fileName}</span>
            <span className="text-[9px] text-ow-text-dim">(PDF)</span>
          </div>

          <div className="space-y-2">
            <label className="block text-[9px] uppercase tracking-wider text-ow-text-dim">
              Page handling
            </label>

            <div className="flex gap-2">
              <button
                onClick={() => setPageMode('all')}
                className="flex-1 flex items-center gap-1.5 px-2.5 py-2 rounded text-[10px] transition-colors"
                style={{
                  background: pageMode === 'all' ? '#2dd4bf15' : '#0d1117',
                  color: pageMode === 'all' ? '#2dd4bf' : '#6e7681',
                  border: `1px solid ${pageMode === 'all' ? '#2dd4bf30' : '#30363d'}`,
                }}
              >
                <Layers size={12} />
                <div className="text-left">
                  <div className="font-bold">All pages</div>
                  <div className="text-[8px] opacity-70">Each page = one floor</div>
                </div>
              </button>

              <button
                onClick={() => setPageMode('single')}
                className="flex-1 flex items-center gap-1.5 px-2.5 py-2 rounded text-[10px] transition-colors"
                style={{
                  background: pageMode === 'single' ? '#2dd4bf15' : '#0d1117',
                  color: pageMode === 'single' ? '#2dd4bf' : '#6e7681',
                  border: `1px solid ${pageMode === 'single' ? '#2dd4bf30' : '#30363d'}`,
                }}
              >
                <FileInput size={12} />
                <div className="text-left">
                  <div className="font-bold">Single page</div>
                  <div className="text-[8px] opacity-70">Pick page + floor</div>
                </div>
              </button>
            </div>
          </div>

          {pageMode === 'all' && (
            <div>
              <label className="block text-[9px] uppercase tracking-wider text-ow-text-dim mb-0.5">
                Starting floor level
              </label>
              <input
                type="number"
                value={floorLevel}
                onChange={(e) => setFloorLevel(parseInt(e.target.value, 10) || 0)}
                className="w-24 bg-ow-surface border border-ow-border rounded px-2 py-1 text-[10px] text-ow-text focus:outline-none focus:border-ow-accent"
              />
              <p className="text-[8px] text-ow-text-dim mt-0.5">
                Page 1 = floor {floorLevel}, page 2 = floor {floorLevel + 1}, etc.
              </p>
            </div>
          )}

          {pageMode === 'single' && (
            <div className="flex gap-3">
              <div>
                <label className="block text-[9px] uppercase tracking-wider text-ow-text-dim mb-0.5">
                  Page number
                </label>
                <input
                  type="number"
                  min={1}
                  value={selectedPage}
                  onChange={(e) => setSelectedPage(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  className="w-20 bg-ow-surface border border-ow-border rounded px-2 py-1 text-[10px] text-ow-text focus:outline-none focus:border-ow-accent"
                />
              </div>
              <div>
                <label className="block text-[9px] uppercase tracking-wider text-ow-text-dim mb-0.5">
                  Floor level
                </label>
                <input
                  type="number"
                  value={floorLevel}
                  onChange={(e) => setFloorLevel(parseInt(e.target.value, 10) || 0)}
                  className="w-20 bg-ow-surface border border-ow-border rounded px-2 py-1 text-[10px] text-ow-text focus:outline-none focus:border-ow-accent"
                />
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-1">
            <button
              onClick={onCancel}
              className="px-2.5 py-1 rounded text-[10px] text-ow-text-dim hover:text-ow-text border border-ow-border"
            >
              Cancel
            </button>
            <button
              onClick={handleReviewConfirm}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-ow-accent text-ow-bg hover:brightness-110 transition-all"
            >
              <Upload size={12} />
              {pageMode === 'all' ? 'Process all floors' : `Process page ${selectedPage}`}
            </button>
          </div>
        </div>
      )}

      {/* Progress */}
      {(stage === 'uploading' || stage === 'processing') && (
        <div className="flex items-center gap-3 py-2">
          <Loader2 size={16} className="animate-spin text-ow-accent" />
          <div>
            {fileName && <p className="text-[10px] text-ow-text font-medium">{fileName}</p>}
            <p className="text-[9px] text-ow-text-dim">{progress}</p>
          </div>
        </div>
      )}

      {/* Done */}
      {stage === 'done' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-ow-safe">
            <CheckCircle2 size={16} />
            <span className="text-xs font-medium">Ingestion complete</span>
          </div>
          <p className="text-[10px] text-ow-text-muted">
            {result?.zoneCount ?? 0} zones and {result?.perchPointCount ?? 0} perch candidates
            {(result?.pagesProcessed ?? 1) > 1 && ` across ${result?.pagesProcessed} floors`}
          </p>
          <button
            onClick={onComplete}
            className="px-3 py-1.5 rounded text-xs font-medium bg-ow-accent text-ow-bg hover:brightness-110 transition-all"
          >
            Done
          </button>
        </div>
      )}

      {/* Error */}
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
                setFileName(null);
                setFilePath(null);
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
