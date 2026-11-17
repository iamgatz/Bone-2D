/** The marker dialog: name, frame, colour and a note for one marker of the open animation. */
import { MARKER_COLORS } from '@/core/model';
import { currentAnimation } from '@/store/actions';
import { useProject } from '@/store/doc';
import { closeMarkerDialog, deleteMarker, updateMarker, useMarkerDialog } from '@/store/markerActions';
import { setTime } from '@/store/actions';
import { Button, Dialog, NumberField, TextField } from '../ui/controls';
import { Field } from '../ui/Field';
import { MARKER_TOKENS } from '../ui/tokens';

/** Where the marker dialog is mounted: renders nothing while none is being edited. */
export function MarkerDialogHost() {
  const id = useMarkerDialog();
  return id ? <MarkerDialog id={id} /> : null;
}

function MarkerDialog({ id }: { id: string }) {
  const fps = useProject().skeleton.fps; // also follows every edit
  const m = currentAnimation()?.markers?.find((x) => x.id === id);
  if (!m) return <Dialog title="Marker" onClose={closeMarkerDialog}><p className="hint-text">This marker no longer exists.</p></Dialog>;
  return (
    <Dialog
      title="Marker"
      onClose={closeMarkerDialog}
      width={360}
      footer={
        <>
          <Button danger ghost onClick={() => deleteMarker(id)}>
            Delete marker
          </Button>
          <span className="spacer" />
          <Button onClick={() => setTime(m.time)}>Go to marker</Button>
          <Button primary onClick={closeMarkerDialog}>
            Done
          </Button>
        </>
      }
    >
      <Field label="Name">
        <TextField value={m.name} placeholder="beat, hit, footstep…" onCommit={(v) => updateMarker(id, { name: v.trim() })} wide />
      </Field>
      <Field label="Frame" title="The frame of the marker (seconds are frame / fps)">
        <NumberField label="f" value={Math.round(m.time * fps * 100) / 100} step={1} precision={2} min={0} onChange={(f) => updateMarker(id, { time: f / fps })} />
        <span className="hint-text">{`${m.time.toFixed(3)} s`}</span>
      </Field>
      <Field label="Colour">
        <div className="hstack" role="radiogroup" aria-label="Colour">
          {Array.from({ length: MARKER_COLORS }, (_, c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={m.color === c}
              aria-label={`Colour ${c + 1}`}
              className={`marker-swatch${m.color === c ? ' on' : ''}`}
              style={{ background: `var(${MARKER_TOKENS[c]})` }}
              onClick={() => updateMarker(id, { color: c })}
            />
          ))}
        </div>
      </Field>
      <Field label="Note">
        <TextField value={m.text} placeholder="a note for yourself or the team" onCommit={(v) => updateMarker(id, { text: v })} wide />
      </Field>
    </Dialog>
  );
}
