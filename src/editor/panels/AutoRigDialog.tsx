/**
 * The auto-rig dialog: what every picture of the character shows, as the names say it and as the user corrects it, with the skeleton
 * that comes out of it drawn over the pictures before anything is built.
 */
import { useEffect, useMemo, useState } from 'react';
import { PARTS } from '@/core/autorig';
import type { Part, RigPlan, Side } from '@/core/autorig';
import { assets } from '@/store/assets';
import { autoRig, planFor, rigCandidates, rigShapes } from '@/store/autoRigActions';
import type { RigCandidate } from '@/store/autoRigActions';
import { closeAutoRig, useAutoRigDialog } from '@/store/autoRigDialog';
import { Button, Dialog, SelectField, Toggle } from '../ui/controls';
import { Field } from '../ui/Field';
import { viewportApi } from '../viewport/Viewport';

const PART_NAMES: Record<Part, string> = {
  hips: 'Hips',
  torso: 'Torso',
  neck: 'Neck',
  head: 'Head',
  face: 'Part of the head',
  upperArm: 'Upper arm',
  forearm: 'Forearm',
  hand: 'Hand',
  arm: 'Whole arm',
  thigh: 'Thigh',
  shin: 'Shin',
  foot: 'Foot',
  leg: 'Whole leg',
  tail: 'Tail',
  near: 'Closest bone',
  keep: 'Leave as it is',
};
const PART_OPTIONS = PARTS.map((value) => ({ value, label: PART_NAMES[value] }));
const SIDE_OPTIONS: { value: Side; label: string }[] = [
  { value: '', label: '—' },
  { value: 'l', label: 'Left' },
  { value: 'r', label: 'Right' },
  { value: 'front', label: 'Front' },
  { value: 'back', label: 'Back' },
];
const UNSIDED: ReadonlySet<Part> = new Set<Part>(['hips', 'torso', 'neck', 'head', 'face', 'near', 'keep']);

/** Where the dialog is mounted: renders nothing while it is closed. */
export function AutoRigHost() {
  return useAutoRigDialog() ? <AutoRigDialog /> : null;
}

/** The pictures where the scene shows them, with the planned bones over them. */
function Preview({ rows, plan, marked }: { rows: RigCandidate[]; plan: RigPlan; marked: string | null }) {
  const [urls, setUrls] = useState<ReadonlyMap<string, string>>(new Map());
  // the pictures of the dialog are the same as long as it is open
  const [pictures] = useState(() => rows.map((r) => [r.slotId, r.image] as const));
  useEffect(() => {
    const made = new Map(
      pictures.flatMap(([slotId, image]) => {
        const asset = assets.get(image);
        return asset ? [[slotId, URL.createObjectURL(asset.blob)] as const] : [];
      }),
    );
    setUrls(made);
    return () => made.forEach((u) => URL.revokeObjectURL(u));
  }, [pictures]);
  const corners = rows.flatMap((r) => r.corners);
  const xs = corners.map((c) => c[0]);
  const ys = corners.map((c) => -c[1]);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  const width = Math.max(1, Math.max(...xs) - left);
  const height = Math.max(1, Math.max(...ys) - top);
  const pad = Math.max(width, height) * 0.04;
  const thick = Math.max(width, height) / 160;
  return (
    <svg
      className="rig-preview"
      role="img"
      aria-label="The skeleton that will be built"
      viewBox={`${left - pad} ${top - pad} ${width + 2 * pad} ${height + 2 * pad}`}
    >
      {rows.map((r) => {
        // the corners of the picture: top left, top right, bottom left (the drawing has y down, the scene y up)
        const [o, x, y] = r.corners;
        const m = [(x[0] - o[0]) / r.width, -(x[1] - o[1]) / r.width, (y[0] - o[0]) / r.height, -(y[1] - o[1]) / r.height, o[0], -o[1]];
        return (
          <image
            key={r.slotId}
            href={urls.get(r.slotId)}
            width={r.width}
            height={r.height}
            transform={`matrix(${m.join(' ')})`}
            opacity={marked && marked !== r.slotId ? 0.15 : 0.75}
          />
        );
      })}
      {plan.bones.map((b) => (
        <g key={b.key} data-bone={b.name}>
          <line
            x1={b.from[0]}
            y1={-b.from[1]}
            x2={b.to[0]}
            y2={-b.to[1]}
            stroke="var(--accent)"
            strokeWidth={thick}
            strokeLinecap="round"
          />
          <circle cx={b.from[0]} cy={-b.from[1]} r={thick * 1.3} fill="var(--panel-2)" stroke="var(--accent)" strokeWidth={thick / 2} />
        </g>
      ))}
    </svg>
  );
}

function AutoRigDialog() {
  const [rows, setRows] = useState(rigCandidates);
  const [legIk, setLegIk] = useState(true);
  const [armIk, setArmIk] = useState(false);
  const [faceBones, setFaceBones] = useState(true);
  const [marked, setMarked] = useState<string | null>(null);
  // looking at the pictures takes a moment: once, when the dialog opens
  const [shapes] = useState(() => rigShapes(rows.map((r) => r.slotId)));
  const options = useMemo(() => ({ legIk, armIk, faceBones }), [legIk, armIk, faceBones]);
  const plan = useMemo(() => planFor(rows, shapes, options), [rows, shapes, options]);
  const meshes = plan.layers.filter((l) => l.bones.length > 1).length;
  const change = (slotId: string, patch: Partial<RigCandidate>) =>
    setRows((list) => list.map((r) => (r.slotId === slotId ? { ...r, ...patch } : r)));
  const build = () => {
    autoRig(rows, options);
    closeAutoRig();
    // the character that was just built comes into view
    setTimeout(() => viewportApi.frame(), 60);
  };

  if (!rows.length) {
    return (
      <Dialog title="Auto-rig" onClose={closeAutoRig}>
        <p className="hint-text">Auto-rig needs pictures on the scene: import a layered PSD or ORA file first.</p>
      </Dialog>
    );
  }
  return (
    <Dialog
      title="Auto-rig"
      onClose={closeAutoRig}
      width={760}
      footer={
        <>
          <span className="hint-text">{`Bones: ${plan.bones.length}, meshes: ${meshes}`}</span>
          <span className="spacer" />
          <Button onClick={closeAutoRig}>Cancel</Button>
          <Button primary onClick={build} disabled={!plan.bones.length}>
            Build rig
          </Button>
        </>
      }
    >
      <p className="hint-text mb">
        Say what every picture shows. The skeleton is drawn from that and from the shapes of the pictures; one Undo takes it away again.
      </p>
      <div className="rig-dialog">
        <div className="rig-rows">
          {rows.map((r) => (
            <div
              key={r.slotId}
              className="rig-row"
              onPointerEnter={() => setMarked(r.slotId)}
              onPointerLeave={() => setMarked(null)}
              onFocus={() => setMarked(r.slotId)}
            >
              <span className="name" data-tip={r.slot}>
                {r.slot}
              </span>
              <SelectField<Part>
                name={`${r.slot}: part`}
                value={r.part}
                options={PART_OPTIONS}
                onChange={(part) => change(r.slotId, { part })}
              />
              {UNSIDED.has(r.part) ? (
                <span />
              ) : (
                <SelectField<Side>
                  name={`${r.slot}: side`}
                  value={r.side}
                  options={SIDE_OPTIONS}
                  onChange={(side) => change(r.slotId, { side })}
                />
              )}
            </div>
          ))}
        </div>
        <Preview rows={rows} plan={plan} marked={marked} />
      </div>
      <Field label="IK for legs" title="Each leg gets an IK constraint and a target to pull its foot by">
        <Toggle on={legIk} onChange={setLegIk} title="IK for legs" />
      </Field>
      <Field label="IK for arms" title="Each arm gets an IK constraint and a target to pull its hand by">
        <Toggle on={armIk} onChange={setArmIk} title="IK for arms" />
      </Field>
      {rows.some((r) => r.part === 'face') && (
        <Field label="Face bones" title="Eyes, mouth, hair, ears and hats each get a bone of their own on the head">
          <Toggle on={faceBones} onChange={setFaceBones} title="Face bones" />
        </Field>
      )}
    </Dialog>
  );
}
