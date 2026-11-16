import { useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { Bone as BoneIcon, BoxSelect, ChevronDown, ChevronRight, Crosshair, Diamond, Eye, EyeOff, Image as ImageIcon, Layers, Link2, Lock, Plus, Scissors, Shirt, Spline, Trash2, Unlock, Zap } from 'lucide-react';
import type { Bone, Id, Slot } from '@/core/model';
import { createEvent, createSkin, deleteBones, deleteEvent, deleteSkin, deleteSlots, keyEvent, moveSlot, renameBone, renameSkin, renameSlot, reparentBone, selectBone, selectSlot, setActiveSkin, setBoneProps, setSelection, setSlotBone, setSlotProps, updateEvent } from '@/store/actions';
import { useProject } from '@/store/doc';
import { createPathConstraint } from '@/store/pathConstraintActions';
import { createSlider } from '@/store/sliderActions';
import { useUi } from '@/store/ui';
import { getScene } from '../scene';
import { IconButton } from '../ui/controls';

function InlineName({ value, editing, onDone }: { value: string; editing: boolean; onDone: (v: string | null) => void }) {
  if (!editing) return <span className="label">{value}</span>;
  return (
    <span className="label">
      <input
        autoFocus
        defaultValue={value}
        onFocus={(e) => e.target.select()}
        onBlur={(e) => onDone(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onDone((e.target as HTMLInputElement).value);
          if (e.key === 'Escape') onDone(null);
          e.stopPropagation();
        }}
        onClick={(e) => e.stopPropagation()}
      />
    </span>
  );
}

export function TreePanel() {
  const project = useProject();
  const doc = project.skeleton;
  const selection = useUi((s) => s.selection);
  const skinId = useUi((s) => s.skinId);
  const mode = useUi((s) => s.mode);
  useUi((s) => (s.mode === 'animate' ? s.time : 0));
  const orderedSlots: Slot[] = mode === 'animate' ? getScene().skeleton.drawOrder.map((s) => doc.slots.find((x) => x.id === s.data.id)).filter((s): s is Slot => !!s) : doc.slots;
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [dropOn, setDropOn] = useState<string | null>(null);

  const childrenOf = useMemo(() => {
    const m = new Map<Id | null, Bone[]>();
    for (const b of doc.bones) {
      const k = b.parent;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(b);
    }
    return m;
  }, [doc.bones]);
  const slotsOf = useMemo(() => {
    const m = new Map<Id, Slot[]>();
    for (const s of doc.slots) {
      if (!m.has(s.bone)) m.set(s.bone, []);
      m.get(s.bone)!.push(s);
    }
    return m;
  }, [doc.slots]);

  const toggle = (id: string) => setCollapsed((c) => ({ ...c, [id]: !c[id] }));

  const renderSlot = (slot: Slot, depth: number) => {
    const selected = selection.slot === slot.id;
    const atts = doc.skins[0]?.attachments[slot.id] ?? {};
    const attNames = Object.keys(atts);
    const open = !collapsed['s:' + slot.id] && selected;
    return (
      <div key={slot.id}>
        <div
          className={`row${selected && !selection.attachment ? ' selected' : ''}`}
          style={{ paddingLeft: 8 + depth * 14 }}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData('application/x-bone2d-slot', slot.id);
            e.dataTransfer.effectAllowed = 'move';
          }}
          onClick={() => selectSlot(slot.id, slot.attachment)}
          onDoubleClick={() => setEditing('s:' + slot.id)}
        >
          <span className={`chev${attNames.length ? '' : ' hidden'}`} onClick={(e) => (e.stopPropagation(), toggle('s:' + slot.id))}>
            {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </span>
          <span className="ico">
            <Layers size={13} />
          </span>
          <InlineName
            value={slot.name}
            editing={editing === 's:' + slot.id}
            onDone={(v) => {
              setEditing(null);
              if (v !== null && v !== slot.name) renameSlot(slot.id, v);
            }}
          />
          <span className="actions">
            <IconButton icon={slot.hidden ? EyeOff : Eye} title={slot.hidden ? 'Show' : 'Hide'} small onClick={(e) => (e.stopPropagation(), setSlotProps(slot.id, { hidden: !slot.hidden }, 'Toggle slot'))} />
            <IconButton icon={Trash2} title="Delete slot" small onClick={(e) => (e.stopPropagation(), deleteSlots([slot.id]))} />
          </span>
        </div>
        {open &&
          attNames.map((name) => (
            <div key={name} className={`row${selected && selection.attachment === name ? ' selected' : ''}`} style={{ paddingLeft: 8 + (depth + 1) * 14 + 16 }} onClick={() => selectSlot(slot.id, name)}>
              <span className="ico">
                {atts[name].type === 'clipping' ? <Scissors size={12} /> : atts[name].type === 'boundingbox' ? <BoxSelect size={12} /> : atts[name].type === 'point' ? <Crosshair size={12} /> : atts[name].type === 'path' ? <Spline size={12} /> : <ImageIcon size={12} />}
              </span>
              <span className="label">{name}</span>
              {slot.attachment === name && <span className="chip">setup</span>}
              <span className="actions">
                <IconButton icon={Eye} title="Show this attachment in setup pose" small onClick={(e) => (e.stopPropagation(), setSlotProps(slot.id, { attachment: name }, 'Set attachment'))} />
              </span>
            </div>
          ))}
      </div>
    );
  };

  const renderBone = (bone: Bone, depth: number): ReactElement => {
    const kids = childrenOf.get(bone.id) ?? [];
    const slots = slotsOf.get(bone.id) ?? [];
    const hasKids = kids.length + slots.length > 0;
    const open = !collapsed['b:' + bone.id];
    const selected = selection.bones.includes(bone.id) && !selection.slot;
    return (
      <div key={bone.id}>
        <div
          className={`row${selected ? ' selected' : ''}${dropOn === bone.id ? ' drop' : ''}`}
          style={{ paddingLeft: 8 + depth * 14 }}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData('application/x-bone2d-bone', bone.id);
            e.dataTransfer.effectAllowed = 'move';
          }}
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes('application/x-bone2d-bone') || e.dataTransfer.types.includes('application/x-bone2d-slot')) {
              e.preventDefault();
              setDropOn(bone.id);
            }
          }}
          onDragLeave={() => setDropOn((d) => (d === bone.id ? null : d))}
          onDrop={(e) => {
            e.preventDefault();
            setDropOn(null);
            const bid = e.dataTransfer.getData('application/x-bone2d-bone');
            const sid = e.dataTransfer.getData('application/x-bone2d-slot');
            if (bid && bid !== bone.id) reparentBone(bid, bone.id);
            if (sid) setSlotBone(sid, bone.id);
          }}
          onClick={(e) => selectBone(bone.id, e.shiftKey || e.ctrlKey || e.metaKey)}
          onDoubleClick={() => setEditing('b:' + bone.id)}
        >
          <span className={`chev${hasKids ? '' : ' hidden'}`} onClick={(e) => (e.stopPropagation(), toggle('b:' + bone.id))}>
            {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </span>
          <span className="ico">
            <BoneIcon size={13} />
          </span>
          <InlineName
            value={bone.name}
            editing={editing === 'b:' + bone.id}
            onDone={(v) => {
              setEditing(null);
              if (v !== null && v !== bone.name) renameBone(bone.id, v);
            }}
          />
          <span className={`actions${bone.hidden || bone.locked ? ' pinned' : ''}`}>
            <IconButton icon={bone.locked ? Lock : Unlock} title={bone.locked ? 'Unlock' : 'Lock (not selectable in viewport)'} small onClick={(e) => (e.stopPropagation(), setBoneProps(bone.id, { locked: !bone.locked }, 'Lock bone'))} />
            <IconButton icon={bone.hidden ? EyeOff : Eye} title={bone.hidden ? 'Show' : 'Hide'} small onClick={(e) => (e.stopPropagation(), setBoneProps(bone.id, { hidden: !bone.hidden }, 'Hide bone'))} />
          </span>
        </div>
        {open && (
          <>
            {kids.map((k) => renderBone(k, depth + 1))}
            {slots.map((s) => renderSlot(s, depth + 1))}
          </>
        )}
      </div>
    );
  };

  const roots = childrenOf.get(null) ?? [];

  return (
    <div className="panel grow" style={{ minHeight: 120 }}>
      <div className="panel-head">
        <span className="title">Hierarchy</span>
        <IconButton icon={Trash2} title="Delete selected" small disabled={!selection.bones.length && !selection.slot} onClick={() => (selection.slot && !selection.bones.length ? deleteSlots([selection.slot]) : deleteBones(selection.bones))} />
      </div>
      <div
        className="panel-body"
        onClick={(e) => e.target === e.currentTarget && setSelection({})}
        onDragOver={(e) => e.dataTransfer.types.includes('application/x-bone2d-bone') && e.preventDefault()}
      >
        {roots.map((r) => renderBone(r, 0))}

        {doc.slots.length > 1 && (
          <>
            <div className="section-label">Draw order{mode === 'animate' ? ' · keyed at playhead' : ''}</div>
            {orderedSlots
              .map((s, i) => ({ s, i }))
              .reverse()
              .map(({ s, i }) => (
                <div
                  key={s.id}
                  className={`row${selection.slot === s.id ? ' selected' : ''}${dropOn === 'o:' + s.id ? ' drop' : ''}`}
                  style={{ paddingLeft: 14 }}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('application/x-bone2d-order', s.id);
                  }}
                  onDragOver={(e) => {
                    if (e.dataTransfer.types.includes('application/x-bone2d-order')) {
                      e.preventDefault();
                      setDropOn('o:' + s.id);
                    }
                  }}
                  onDragLeave={() => setDropOn(null)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDropOn(null);
                    const id = e.dataTransfer.getData('application/x-bone2d-order');
                    if (id && id !== s.id) moveSlot(id, i);
                  }}
                  onClick={() => selectSlot(s.id, s.attachment)}
                >
                  <span className="ico">
                    <Layers size={13} />
                  </span>
                  <span className="label">{s.name}</span>
                </div>
              ))}
          </>
        )}

        {(doc.constraints.length > 0 || doc.bones.length > 0) && (
          <>
            <div className="section-label" style={{ display: 'flex', alignItems: 'center' }}>
              <span style={{ flex: 1 }}>Constraints</span>
              <IconButton icon={Spline} title="New path constraint (the selected bones follow a path)" small onClick={() => createPathConstraint()} />
              <IconButton icon={Plus} title="New slider (applies an animation by hand or driven by a bone)" small onClick={() => createSlider(selection.bones[0] ?? null)} />
            </div>
            {doc.constraints.map((c) => (
              <div key={c.id} className={`row${selection.constraint === c.id ? ' selected' : ''}`} style={{ paddingLeft: 14 }} onClick={() => setSelection({ constraint: c.id })}>
                <span className="ico">{c.type === 'path' ? <Spline size={13} /> : <Link2 size={13} />}</span>
                <span className="label">{c.name}</span>
                <span className="chip" style={c.type === 'transform' ? { color: '#b38cff' } : c.type === 'slider' ? { color: '#4cc9f0' } : c.type === 'path' ? { color: '#ff7f00' } : undefined}>{c.type === 'ik' ? 'IK' : c.type === 'transform' ? 'TC' : c.type === 'path' ? 'PC' : 'SL'}</span>
              </div>
            ))}
          </>
        )}

        {doc.slots.length > 0 && (
          <>
            <div className="section-label" style={{ display: 'flex', alignItems: 'center' }}>
              <span style={{ flex: 1 }}>Skins</span>
              <IconButton icon={Plus} title="New skin" small onClick={() => createSkin()} />
            </div>
            {doc.skins.map((s, i) => {
              const active = (skinId ?? doc.skins[0].id) === s.id;
              return (
                <div key={s.id} className={`row${active ? ' selected' : ''}`} style={{ paddingLeft: 14 }} onClick={() => setActiveSkin(i === 0 ? null : s.id)} onDoubleClick={() => i > 0 && setEditing('k:' + s.id)}>
                  <span className="ico">
                    <Shirt size={13} />
                  </span>
                  <InlineName
                    value={s.name}
                    editing={editing === 'k:' + s.id}
                    onDone={(v) => {
                      setEditing(null);
                      if (v !== null && v !== s.name) renameSkin(s.id, v);
                    }}
                  />
                  {i > 0 && (
                    <span className="actions">
                      <IconButton icon={Trash2} title="Delete skin" small onClick={(e) => (e.stopPropagation(), deleteSkin(s.id))} />
                    </span>
                  )}
                </div>
              );
            })}
          </>
        )}

        {(doc.events.length > 0 || doc.slots.length > 0) && (
          <>
            <div className="section-label" style={{ display: 'flex', alignItems: 'center' }}>
              <span style={{ flex: 1 }}>Events</span>
              <IconButton icon={Plus} title="New event" small onClick={() => createEvent()} />
            </div>
            {doc.events.map((ev) => (
              <div key={ev.id} className="row" style={{ paddingLeft: 14 }} onDoubleClick={() => setEditing('e:' + ev.id)}>
                <span className="ico">
                  <Zap size={13} />
                </span>
                <InlineName
                  value={ev.name}
                  editing={editing === 'e:' + ev.id}
                  onDone={(v) => {
                    setEditing(null);
                    if (v !== null && v !== ev.name) updateEvent(ev.id, { name: v });
                  }}
                />
                <span className="actions pinned">
                  <IconButton icon={Diamond} title="Fire this event at the playhead" small onClick={() => keyEvent(ev.id)} />
                  <IconButton icon={Trash2} title="Delete event" small onClick={() => deleteEvent(ev.id)} />
                </span>
              </div>
            ))}
          </>
        )}

        {doc.bones.length <= 1 && doc.slots.length === 0 && (
          <div className="empty">
            Pick the <b>Create bone</b> tool <span className="kbd">B</span> and drag in the viewport.
            <br />
            Drop images into the viewport to add parts.
          </div>
        )}
      </div>
    </div>
  );
}

export { Plus };
