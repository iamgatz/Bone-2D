import { useMemo, useState } from 'react';
import { Copy, Lock, LockOpen, Palette, Pencil, Plus, Trash2, Link2, Bone as BoneIcon } from 'lucide-react';
import type { Bone, Constraint, Id, SkeletonDoc, Skin } from '@/core/model';
import { overrideCount, overrideState } from '@/core/skins';
import { createSkin, deleteSkin, duplicateSkinAction, renameSkin, setActiveSkin, setSkinRequiredAction, setSkinScopeAction, toggleSkinOverride } from '@/store/actions';
import { useProject } from '@/store/doc';
import { useUi } from '@/store/ui';
import { IconButton } from '../ui/controls';

/** Bones in tree order with their depth (parents come first in the document, so one pass is enough). */
function boneRows(doc: SkeletonDoc): { bone: Bone; depth: number }[] {
  const depth = new Map<Id, number>();
  return doc.bones.map((bone) => {
    const d = bone.parent ? (depth.get(bone.parent) ?? 0) + 1 : 0;
    depth.set(bone.id, d);
    return { bone, depth: d };
  });
}

/** One bone or constraint of the scope list: the lock says it is only active in the skins that list it, the box says this skin does. */
function ScopeRow(props: { kind: 'bone' | 'constraint'; id: Id; name: string; icon: React.ReactNode; depth?: number; required: boolean; inSkin: boolean; skin: Skin | null }) {
  const { kind, id, required, skin } = props;
  return (
    <div className="row scope-row" style={{ paddingLeft: 8 + (props.depth ?? 0) * 12 }}>
      <span className="ico">{props.icon}</span>
      <span className={`label${required ? '' : ' dim'}`}>{props.name}</span>
      <input
        type="checkbox"
        className="scope-check"
        aria-label="In this skin"
        data-tip={skin ? 'Active in this skin' : 'Select a skin to choose'}
        disabled={!skin || !required}
        checked={required && props.inSkin}
        onChange={(e) => skin && setSkinScopeAction(skin.id, kind, id, e.target.checked)}
      />
      <IconButton
        icon={required ? Lock : LockOpen}
        title={required ? 'Skin required: only active in the skins that list it. Click to make it always active' : 'Always active. Click to make it active only in the skins that list it'}
        small
        active={required}
        onClick={() => setSkinRequiredAction(kind, id, !required)}
      />
    </div>
  );
}

/**
 * The Skins window (Spine's Skins view): the skins, what the chosen one overrides from the default skin, and its scope — the bones and
 * constraints that exist only in some skins (a skin with a different outfit, a hat, a second tail).
 */
export function SkinsPanel() {
  const project = useProject();
  const doc = project.skeleton;
  const skinId = useUi((s) => s.skinId);
  const [renaming, setRenaming] = useState<string | null>(null);
  const defaultSkin = doc.skins[0];
  const current = doc.skins.find((s) => s.id === skinId) ?? defaultSkin;
  const isDefault = current === defaultSkin;
  const skin = isDefault ? null : current;
  const bones = useMemo(() => boneRows(doc), [doc]);
  // a bone below a required one is required as well (the compiled skeleton does the same)
  const requiredBones = useMemo(() => {
    const set = new Set<Id>();
    for (const b of doc.bones) if (b.skinRequired || (b.parent && set.has(b.parent))) set.add(b.id);
    return set;
  }, [doc.bones]);

  const slots = doc.slots.filter((s) => Object.keys(defaultSkin?.attachments[s.id] ?? {}).length > 0);
  const constraintIcon = (c: Constraint) => <Link2 size={13} className={`k-${c.type}`} />;

  return (
    <div className="panel grow" style={{ minHeight: 160 }}>
      <div className="panel-head">
        <span className="title">Skins</span>
        <IconButton icon={Copy} title="Duplicate skin" small disabled={isDefault} onClick={() => duplicateSkinAction(current.id)} />
        <IconButton icon={Plus} title="New skin" small onClick={() => createSkin()} />
      </div>
      <div className="panel-body">
        {doc.skins.map((s, i) => (
          <div key={s.id} className={`row${s === current ? ' selected' : ''}`} onClick={() => setActiveSkin(i === 0 ? null : s.id)} onDoubleClick={() => i > 0 && setRenaming(s.id)}>
            <span className="ico">
              <Palette size={13} />
            </span>
            {renaming === s.id ? (
              <span className="label">
                <input
                  autoFocus
                  defaultValue={s.name}
                  aria-label="Skin name"
                  onFocus={(e) => e.target.select()}
                  onBlur={(e) => {
                    renameSkin(s.id, e.target.value);
                    setRenaming(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur();
                    else if (e.key === 'Escape') setRenaming(null);
                    e.stopPropagation();
                  }}
                />
              </span>
            ) : (
              <span className="label">{s.name}</span>
            )}
            <span className="dim row-meta">{i === 0 ? 'default' : `${overrideCount(s)} own`}</span>
            {i > 0 && (
              <span className="actions">
                <IconButton icon={Pencil} title="Rename skin" small onClick={(e) => (e.stopPropagation(), setRenaming(s.id))} />
                <IconButton icon={Trash2} title="Delete skin" small onClick={(e) => (e.stopPropagation(), deleteSkin(s.id))} />
              </span>
            )}
          </div>
        ))}

        <div className="section-label">Attachments</div>
        {isDefault ? (
          <div className="hint-text skin-hint">The default skin holds every attachment. Pick another skin to choose which attachments it replaces with its own copy.</div>
        ) : (
          <>
            <div className="hint-text skin-hint">Filled: this skin has its own copy. Click to make one, or to go back to the default skin's.</div>
            {slots.length === 0 && <div className="empty">No attachments yet.</div>}
            {slots.map((slot) => (
              <div key={slot.id} className="skin-slot">
                <span className="skin-slot-name">{slot.name}</span>
                <span className="skin-chips">
                  {Object.keys(defaultSkin.attachments[slot.id]).map((name) => {
                    const own = overrideState(doc, current.id, slot.id, name) === 'own';
                    return (
                      <button key={name} type="button" className={`chip skin-chip${own ? ' own' : ''}`} data-tip={own ? 'Own copy in this skin. Click to use the default one' : 'From the default skin. Click to make an own copy'} onClick={() => toggleSkinOverride(current.id, slot.id, name)}>
                        {name}
                      </button>
                    );
                  })}
                </span>
              </div>
            ))}
          </>
        )}

        <div className="section-label">Scope: bones</div>
        <div className="hint-text skin-hint">Lock a bone to make it exist only in the skins you tick (a hat, a second tail). The bones above it stay active.</div>
        {bones.map(({ bone, depth }) => (
          <ScopeRow key={bone.id} kind="bone" id={bone.id} name={bone.name} depth={depth} icon={<BoneIcon size={13} />} required={requiredBones.has(bone.id)} inSkin={!!skin?.bones.includes(bone.id)} skin={skin} />
        ))}

        {doc.constraints.length > 0 && <div className="section-label">Scope: constraints</div>}
        {doc.constraints.map((c) => (
          <ScopeRow key={c.id} kind="constraint" id={c.id} name={c.name} icon={constraintIcon(c)} required={c.skinRequired} inSkin={!!skin?.constraints.includes(c.id)} skin={skin} />
        ))}
      </div>
    </div>
  );
}
