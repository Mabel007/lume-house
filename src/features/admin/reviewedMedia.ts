import { useEffect, useRef, useState } from 'react';
import { adminRpc, adminReadFailure, isAdminDenied } from './adminRepository';
import { getSupabaseClient } from '../../lib/supabase/client';
import { isLocalProductImage } from './productEditorModel';

export type ReviewedAssets = { status: 'loading' | 'error' | 'ready'; paths: string[]; message?:string };
export type ImagePreview = { path: string; status: 'loading' | 'ready' | 'broken' };
export function parseReviewedAssets(value: unknown): string[] {
  if (!Array.isArray(value) || value.some(path => typeof path !== 'string' || !isLocalProductImage(path)) || new Set(value).size !== value.length) throw new Error('Invalid reviewed media response.');
  return [...value];
}
export function canSaveReviewedImage(assets: ReviewedAssets, path: string, preview: ImagePreview): boolean {
  return assets.status === 'ready' && assets.paths.includes(path) && preview.path === path && preview.status === 'ready';
}
// Registry membership, not a successful preview or a local-looking path, establishes approval.
export function useReviewedAssets(token: string, accessChanged?:(denied:boolean)=>void) {
  const [revision, setRevision] = useState(0);
  const generation = useRef(0);
  const [result, setResult] = useState<{token: string; revision: number; assets: ReviewedAssets}>({token, revision, assets: {status: 'loading', paths: []}});
  useEffect(() => {
    let active = true; const request = generation.current;
    void adminRpc(getSupabaseClient(), token, 'admin_media_assets').then(parseReviewedAssets).then(paths => {
      if (active && request === generation.current) {accessChanged?.(false);setResult({token, revision, assets: {status: 'ready', paths}});}
    }).catch(cause => {
      if (active && request === generation.current) {if(isAdminDenied(cause))accessChanged?.(true);setResult({token, revision, assets: {status: 'error', paths: [],message:adminReadFailure(cause,'Reviewed media')}});}
    });
    return () => { active = false; };
  }, [token, revision,accessChanged]);
  const assets: ReviewedAssets = result.token === token && result.revision === revision ? result.assets : {status: 'loading', paths: []};
  function reload() { generation.current += 1; setRevision(value => value + 1); }
  return {assets, reload};
}
export function reviewedImageLabel(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1).replace(/[-_]/g, ' ');
}
