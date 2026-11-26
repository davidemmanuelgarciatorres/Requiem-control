import { useId, useRef, useState, type DragEvent } from 'react';
import { FileSpreadsheet, Upload } from 'lucide-react';
import { usePreferences } from '../../app/preferences';

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = '.csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Selector de archivo con arrastrar y soltar. Las validaciones de aquí son de cortesía: el servidor valida de nuevo. */
export function UploadDropzone({ onFile, busy, disabled }: { onFile: (file: File) => void; busy: boolean; disabled?: boolean }) {
  const { t } = usePreferences();
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = (file: File | undefined) => {
    if (!file) return;
    const ext = file.name.toLowerCase().split('.').pop();
    if (ext !== 'csv' && ext !== 'xlsx') return setError(t.data.clientBadType);
    if (file.size > MAX_BYTES) return setError(t.data.clientTooLarge);
    setError(null);
    onFile(file);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    if (!disabled && !busy) pick(e.dataTransfer.files[0]);
  };

  return (
    <div
      className={`rc-dropzone${over ? ' is-over' : ''}${busy ? ' is-busy' : ''}`}
      onDragOver={(e) => { e.preventDefault(); if (!disabled) setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
    >
      <span className="rc-dropzone__icon" aria-hidden="true">{busy ? <span className="rc-btn__spinner" /> : <FileSpreadsheet size={26} />}</span>
      <div className="rc-dropzone__copy">
        <label htmlFor={id} className={`rc-btn rc-btn--primary${disabled || busy ? ' is-disabled' : ''}`}>
          <Upload size={15} aria-hidden="true" /> {busy ? t.data.uploading : t.data.choose}
        </label>
        <span className="rc-list__meta">{t.data.drop}</span>
      </div>
      <p className="rc-list__meta">{t.data.uploadHint}</p>
      <input
        ref={input}
        id={id}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        disabled={disabled || busy}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(e) => {
          pick(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      {error && <p id={`${id}-error`} className="rc-form__error" role="alert">{error}</p>}
    </div>
  );
}
