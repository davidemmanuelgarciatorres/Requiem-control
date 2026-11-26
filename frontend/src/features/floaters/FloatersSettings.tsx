import { useRef, useState } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import { usePreferences } from '../../app/preferences';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { ApiError } from '../../lib/api';
import { interpolate } from '../../lib/format';
import { CropDialog } from './CropDialog';
import { useFloaters } from './FloatersContext';
import { SIZE_MAX, SIZE_MIN, type FloaterPrefs, type FloaterShape } from './floaterStore';

const MAX_SOURCE_BYTES = 15 * 1024 * 1024;
const SHAPES: FloaterShape[] = ['splash', 'stars', 'hearts', 'ring', 'sparks'];
const PRESETS = ['#ff6a1a', '#39ff8f', '#b8f0cc', '#ff4fa3', '#4aa8ff', '#ffd23f'];

export function FloatersSettings() {
  const { t } = usePreferences();
  const f = useFloaters();
  const p = f.preferences;
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const full = f.images.length >= f.max;

  const pick = (chosen: File | undefined) => {
    if (!chosen) return;
    if (chosen.size > MAX_SOURCE_BYTES) return setError(t.floaters.tooBig);
    if (chosen.type && !chosen.type.startsWith('image/')) return setError(t.floaters.notImage);
    setError(null);
    setFile(chosen);
  };

  const upload = async (blob: Blob) => {
    setFile(null);
    setBusy(true);
    try {
      await f.add(blob);
    } catch (e) {
      const code = e instanceof ApiError ? e.code : e instanceof Error ? e.message : '';
      setError((t.floaters.errors as Record<string, string>)[code] ?? t.auth.errors.generic);
    } finally {
      setBusy(false);
    }
  };

  const seg = <K extends keyof FloaterPrefs>(key: K, values: FloaterPrefs[K][], labels: Record<string, string>, label: string) => (
    <div className="rc-field">
      <span className="rc-field__label" id={`fl-${String(key)}`}>{label}</span>
      <div className="rc-segmented rc-segmented--wrap" role="group" aria-labelledby={`fl-${String(key)}`}>
        {values.map((v) => (
          <button key={String(v)} type="button" aria-pressed={p[key] === v} onClick={() => f.setPrefs({ [key]: v } as Partial<FloaterPrefs>)}>
            {labels[String(v)]}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <Card title={t.floaters.title} subtitle={t.floaters.lead} className="rc-span-2">
      <ul className="rc-floater-thumbs" aria-label={t.floaters.title}>
        {f.images.map((img, i) => (
          <li key={img.id}>
            <img src={img.url} alt={interpolate(t.floaters.imageAlt, { n: i + 1 })} />
            <Button size="sm" variant="ghost" icon={<Trash2 size={13} />} onClick={() => void f.remove(img.id)} aria-label={`${t.floaters.remove}: ${interpolate(t.floaters.imageAlt, { n: i + 1 })}`}>
              {t.floaters.remove}
            </Button>
          </li>
        ))}
        {!full && (
          <li className="rc-floater-thumbs__add">
            {/* Etiqueta nativa unida al campo de archivo: abre la galería/archivos sin depender de un click()
                programático, que algunos visores incrustados (WebView) bloquean. */}
            <label className={`rc-btn rc-btn--glass rc-file-label${busy ? ' is-busy' : ''}`} aria-busy={busy || undefined}>
              {busy ? <span className="rc-btn__spinner" aria-hidden="true" /> : <ImagePlus size={16} aria-hidden="true" />}
              {busy ? t.floaters.processing : t.floaters.add}
              <input ref={input} type="file" accept="image/*" className="sr-only" disabled={busy}
                onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
            </label>
            <span className="rc-list__meta">{t.floaters.addHint}</span>
          </li>
        )}
      </ul>
      {full && <p className="rc-list__meta">{t.floaters.limitReached}</p>}
      {error && <p className="rc-form__error" role="alert">{error}</p>}

      <label className="rc-switch">
        <input type="checkbox" checked={p.enabled} onChange={(e) => f.setPrefs({ enabled: e.target.checked })} />
        <span>{t.floaters.enabled}</span>
      </label>

      <div className="rc-floater-controls">
        <label className="rc-field">
          <span className="rc-field__label">{t.floaters.size}: <strong className="rc-tabular">{interpolate(t.floaters.sizeValue, { n: p.size })}</strong></span>
          <input type="range" className="rc-range" min={SIZE_MIN} max={SIZE_MAX} step={4} value={p.size} onChange={(e) => f.setPrefs({ size: Number(e.target.value) })} />
        </label>
        {seg('speed', ['slow', 'normal', 'fast'], t.floaters.speeds, t.floaters.speed)}
        {seg('effect_shape', SHAPES, t.floaters.shapes, t.floaters.effectShape)}
        <div className="rc-field">
          <span className="rc-field__label" id="fl-color">{t.floaters.effectColor}</span>
          <div className="rc-row" role="group" aria-labelledby="fl-color">
            {PRESETS.map((c) => (
              <button key={c} type="button" className="rc-swatch-btn" style={{ background: c }} aria-label={c} aria-pressed={p.effect_color.toLowerCase() === c} onClick={() => f.setPrefs({ effect_color: c })} />
            ))}
            <label className="rc-color-input">
              <input type="color" value={p.effect_color} onChange={(e) => f.setPrefs({ effect_color: e.target.value })} aria-label={t.floaters.customColor} />
            </label>
          </div>
        </div>
        {seg('layer', ['front', 'back'], t.floaters.layers, t.floaters.layer)}
      </div>
      <p className="rc-list__meta">{t.floaters.wallNote} {t.floaters.reducedNote}</p>
      {file && <CropDialog file={file} onCancel={() => setFile(null)} onDone={(b) => void upload(b)} />}
    </Card>
  );
}
