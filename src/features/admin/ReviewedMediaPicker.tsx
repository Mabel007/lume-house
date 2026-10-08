import { useId, useState } from 'react';
import { reviewedImageLabel, type ImagePreview, type ReviewedAssets } from './reviewedMedia';

function Thumbnail({path}: {path: string}) {
  const [broken, setBroken] = useState(false);
  return broken ? <span className="admin-media-unavailable">Thumbnail unavailable</span> : <img src={path} alt="" loading="lazy" onError={() => setBroken(true)}/>;
}
export function ReviewedMediaPicker({assets, value, change, preview, previewChanged, reload, disabled=false}: {
  assets: ReviewedAssets; value: string; change: (path: string) => void; preview: ImagePreview;
  previewChanged: (preview: ImagePreview) => void; reload: () => void; disabled?: boolean;
}) {
  const id = useId(); const approved = assets.status === 'ready' && assets.paths.includes(value);
  return <fieldset className="admin-reviewed-picker" disabled={disabled}><legend>Reviewed product image</legend>
    <p className="admin-field-help">Choose a registered image that accurately represents this product. Selection is a draft until this section is saved. Use Tab and the arrow keys to select an image.</p>
    {assets.status === 'loading' && <p role="status">Loading reviewed media…</p>}
    {assets.status === 'error' && <p role="alert">{assets.message||'Reviewed media could not be loaded.'} Previous choices are unavailable. <button type="button" onClick={reload}>Reload media</button></p>}
    {assets.status === 'ready' && <>
      {!assets.paths.length && <p role="status">No reviewed assets are available.</p>}
      {value && !approved && <p role="status">The current image is not in the reviewed registry. It remains unchanged on the storefront; choose a reviewed replacement before saving.</p>}
      <div className="admin-media-grid">{assets.paths.map(path => <label key={path} className={`admin-media-option${path === value ? ' is-selected' : ''}`}>
        <input type="radio" name={`${id}-reviewed-image`} value={path} checked={path === value} required onChange={() => change(path)}/>
        <Thumbnail path={path}/><span>{reviewedImageLabel(path)}</span><span className="admin-media-path">{path}</span>{path === value && <strong>Selected</strong>}
      </label>)}</div>
      {approved && <div className="admin-media-selection"><p role="status">Selected image: {reviewedImageLabel(value)}. Not yet saved.</p>
        {preview.path === value && preview.status === 'broken' ? <p role="alert">Preview unavailable. Save is blocked; choose another image or reload to retry.</p> : <img key={value} className="admin-media-preview" src={value} alt={`Selected reviewed image: ${reviewedImageLabel(value)}`} onLoad={() => previewChanged({path: value, status: 'ready'})} onError={() => previewChanged({path: value, status: 'broken'})}/>}
        {(preview.path !== value || preview.status === 'loading') && <p role="status">Loading selected image preview…</p>}
      </div>}
      <button type="button" onClick={reload}>Reload reviewed images</button>
    </>}
  </fieldset>;
}
