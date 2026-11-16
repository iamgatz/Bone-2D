import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import { attachmentImage } from '@/core/model';
import { addImageToScene, importImageFiles } from '@/store/actions';
import { assets } from '@/store/assets';
import { docStore, useProject } from '@/store/doc';
import { toast, uiStore } from '@/store/ui';
import { IconButton } from '../ui/controls';

function Thumb({ name }: { name: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const a = assets.get(name);
    if (!a) {
      setUrl(null);
      return;
    }
    const u = URL.createObjectURL(a.blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [name]);
  return url ? <img className="thumb" src={url} draggable={false} alt={name} /> : <div className="thumb" />;
}

export function AssetsPanel() {
  const project = useProject();
  const fileRef = useRef<HTMLInputElement>(null);

  const removeImage = (name: string) => {
    const used = project.skeleton.skins.some((s) => Object.values(s.attachments).some((m) => Object.values(m).some((a) => attachmentImage(a) === name)));
    if (used) {
      toast(`"${name}" is used by an attachment`, 'error');
      return;
    }
    docStore.update('Remove image', (d) => {
      d.images = d.images.filter((i) => i.name !== name);
    });
    assets.remove(name);
  };

  return (
    <div className="panel" style={{ height: 230 }}>
      <div className="panel-head">
        <span className="title">Images</span>
        <IconButton icon={ImagePlus} title="Import images" small onClick={() => fileRef.current?.click()} />
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={async (e) => (await importImageFiles([...(e.target.files ?? [])]), (e.target.value = ''))} />
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
            Drop PNG / WebP images here
            <br />
            or click to browse
          </div>
        ) : (
          <div className="asset-grid">
            {project.images.map((img) => (
              <div
                key={img.id}
                className="asset"
                draggable
                title={`${img.name} — drag into the viewport, or double-click to add at the center`}
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/x-bone2d-image', img.name);
                  e.dataTransfer.effectAllowed = 'copy';
                }}
                onDoubleClick={() => {
                  const cam = uiStore.get().camera;
                  addImageToScene(img.name, cam.x, cam.y);
                }}
              >
                <Thumb name={img.name} />
                <span className="name">{img.name}</span>
                <span className="dim">
                  {img.width}×{img.height}
                </span>
                <span style={{ position: 'absolute', top: 2, right: 2 }}>
                  <IconButton icon={Trash2} title="Remove image" small onClick={(e) => (e.stopPropagation(), removeImage(img.name))} />
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
