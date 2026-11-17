import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Eraser, Folder, ImagePlus, Pencil, RefreshCw, Trash2, Upload } from 'lucide-react';
import { baseOf, imageGroups, imageUsage } from '@/core/images';
import type { ImageRef } from '@/core/model';
import { addImageToScene, importImageFiles, reimportPsd, removeUnusedImages, renameImageAction, replaceImagePixels } from '@/store/actions';
import { assets } from '@/store/assets';
import { docStore, useProject } from '@/store/doc';
import { toast, uiStore } from '@/store/ui';
import { IconButton } from '../ui/controls';

function Thumb({ name }: { name: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const version = assets.get(name)?.version;
  useEffect(() => {
    const a = assets.get(name);
    if (!a) {
      setUrl(null);
      return;
    }
    const u = URL.createObjectURL(a.blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [name, version]);
  return url ? <img className="thumb" src={url} draggable={false} alt={name} /> : <div className="thumb" />;
}

/**
 * The Images window: the pictures of the project in folders (the part of a name before the last "/"), with rename (attachments follow),
 * replace (new pixels under the same name), the ones nothing shows marked, and a button that removes them.
 */
export function AssetsPanel() {
  const project = useProject();
  const fileRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  const psdRef = useRef<HTMLInputElement>(null);
  const replacing = useRef<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const uses = useMemo(() => imageUsage(project.skeleton), [project.skeleton]);
  const byName = useMemo(() => new Map(project.images.map((i) => [i.name, i] as const)), [project.images]);
  const groups = useMemo(() => imageGroups(project.images.map((i) => i.name)), [project.images]);
  const unused = project.images.filter((i) => !uses.has(i.name)).length;

  const removeImage = (name: string) => {
    if (uses.has(name)) {
      toast(`"${name}" is used by an attachment`, 'error');
      return;
    }
    docStore.update('Remove image', (d) => {
      d.images = d.images.filter((i) => i.name !== name);
    });
  };

  const tile = (img: ImageRef) => {
    const used = uses.get(img.name) ?? 0;
    return (
      <div
        key={img.id}
        className={`asset${used === 0 ? ' unused' : ''}`}
        draggable={renaming !== img.name}
        data-tip={`${img.name} — drag into the viewport, or double-click to add at the center${used === 0 ? ' · no attachment shows this image' : ''}`}
        onDragStart={(e) => {
          e.dataTransfer.setData('application/x-bone2d-image', img.name);
          e.dataTransfer.effectAllowed = 'copy';
        }}
        onDoubleClick={() => {
          if (renaming) return;
          const cam = uiStore.get().camera;
          addImageToScene(img.name, cam.x, cam.y);
        }}
      >
        <Thumb name={img.name} />
        {renaming === img.name ? (
          <input
            className="asset-rename"
            autoFocus
            defaultValue={img.name}
            aria-label="Image name"
            onFocus={(e) => e.target.select()}
            onBlur={(e) => {
              renameImageAction(img.name, e.target.value);
              setRenaming(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              else if (e.key === 'Escape') setRenaming(null);
              e.stopPropagation();
            }}
          />
        ) : (
          <span className="name">{baseOf(img.name)}</span>
        )}
        <span className="dim">
          {img.width}×{img.height}
          {used === 0 ? ' · unused' : ''}
        </span>
        <span className="asset-actions">
          <IconButton icon={Pencil} title="Rename image (a / in the name makes a folder)" small onClick={(e) => (e.stopPropagation(), setRenaming(img.name))} />
          <IconButton
            icon={Upload}
            title="Replace the picture, keep the name"
            small
            onClick={(e) => {
              e.stopPropagation();
              replacing.current = img.name;
              replaceRef.current?.click();
            }}
          />
          <IconButton icon={Trash2} title="Remove image" small onClick={(e) => (e.stopPropagation(), removeImage(img.name))} />
        </span>
      </div>
    );
  };

  return (
    <div className="panel" style={{ height: 260 }}>
      <div className="panel-head">
        <span className="title">Images</span>
        <IconButton icon={Eraser} title="Remove the images no attachment shows" small disabled={unused === 0} onClick={() => removeUnusedImages()} />
        <IconButton icon={ImagePlus} title="Import images (or a PSD file: every layer becomes a picture and a slot)" small onClick={() => fileRef.current?.click()} />
        <IconButton icon={RefreshCw} title="Update from PSD: layers with the name of a picture give it new pixels, new layers become slots" small disabled={project.images.length === 0} onClick={() => psdRef.current?.click()} />
        <input
          ref={psdRef}
          type="file"
          accept=".psd"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) await reimportPsd(file);
          }}
        />
        <input ref={fileRef} type="file" accept="image/*,.psd" multiple hidden onChange={async (e) => (await importImageFiles([...(e.target.files ?? [])]), (e.target.value = ''))} />
        <input
          ref={replaceRef}
          type="file"
          accept="image/*"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0];
            const name = replacing.current;
            e.target.value = '';
            if (file && name) await replaceImagePixels(name, file);
          }}
        />
      </div>
      <div
        className="panel-body"
        onDragOver={(e) => e.dataTransfer.types.includes('Files') && e.preventDefault()}
        onDrop={async (e) => {
          if (!e.dataTransfer.files.length) return;
          e.preventDefault();
          await importImageFiles([...e.dataTransfer.files]);
        }}
      >
        {project.images.length === 0 ? (
          <div className="drop-hint" onClick={() => fileRef.current?.click()}>
            Drop PNG / WebP images or a PSD file here
            <br />
            or click to browse
          </div>
        ) : (
          groups.map(([folder, names]) => (
            <div key={folder || '/'}>
              {folder !== '' && (
                <div className="row folder" onClick={() => setClosed({ ...closed, [folder]: !closed[folder] })}>
                  <span className="chev">{closed[folder] ? <ChevronRight size={13} /> : <ChevronDown size={13} />}</span>
                  <span className="ico">
                    <Folder size={13} />
                  </span>
                  <span className="label">{folder}</span>
                  <span className="dim row-meta">{names.length}</span>
                </div>
              )}
              {!closed[folder] && <div className="asset-grid">{names.map((n) => byName.get(n)).filter((i): i is ImageRef => !!i).map(tile)}</div>}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
