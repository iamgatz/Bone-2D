import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { X } from 'lucide-react';
import { clamp, parseNumberExpr } from '@/core/math';
import { docStore } from '@/store/doc';

// ---------------------------------------------------------------- buttons

/** An icon-only button: its title is its accessible name and its tooltip, with the hotkey as a key cap. */
export function IconButton(props: { icon: LucideIcon; title: string; onClick?: (e: React.MouseEvent) => void; active?: boolean; animate?: boolean; disabled?: boolean; small?: boolean; size?: number; hotkey?: string; tipPlace?: 'top' | 'bottom' | 'left' | 'right'; style?: CSSProperties }) {
  const Icon = props.icon;
  return (
    <button type="button" className={`icon-btn${props.active ? ' on' : ''}${props.animate ? ' animate' : ''}${props.small ? ' sm' : ''}`} aria-label={props.title} aria-pressed={props.active} data-tip={props.title} data-tip-key={props.hotkey} data-tip-place={props.tipPlace} onClick={props.onClick} disabled={props.disabled} style={props.style}>
      <Icon size={props.size ?? (props.small ? 14 : 17)} strokeWidth={1.9} />
      {props.hotkey && <span className="kbd-tip">{props.hotkey}</span>}
    </button>
  );
}

export function Button(props: { children: ReactNode; onClick?: () => void; primary?: boolean; ghost?: boolean; danger?: boolean; small?: boolean; disabled?: boolean; title?: string; icon?: LucideIcon }) {
  const Icon = props.icon;
  return (
    <button type="button" className={`btn${props.primary ? ' primary' : ''}${props.ghost ? ' ghost' : ''}${props.danger ? ' danger' : ''}${props.small ? ' sm' : ''}`} onClick={props.onClick} disabled={props.disabled} data-tip={props.title}>
      {Icon && <Icon size={15} strokeWidth={1.9} />}
      {props.children}
    </button>
  );
}

export function Toggle({ on, onChange, title }: { on: boolean; onChange: (v: boolean) => void; title?: string }) {
  return <button type="button" className={`toggle${on ? ' on' : ''}`} onClick={() => onChange(!on)} aria-label={title} data-tip={title} role="switch" aria-checked={on} />;
}

// ---------------------------------------------------------------- number field

function fmt(v: number, precision: number): string {
  if (!Number.isFinite(v)) return '0';
  const s = v.toFixed(precision);
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
}

export function NumberField(props: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  precision?: number;
  min?: number;
  max?: number;
  suffix?: string;
  keyed?: boolean;
  disabled?: boolean;
  wide?: boolean;
  title?: string;
}) {
  const { value, onChange, step = 1, precision = 2, min, max } = props;
  const [text, setText] = useState<string | null>(null);
  const scrub = useRef<{ x: number; v: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const commit = (raw: string) => {
    const v = parseNumberExpr(raw, value);
    if (v !== null) onChange(clamp(v, min ?? -Infinity, max ?? Infinity));
    setText(null);
  };

  const onDown = (e: React.PointerEvent) => {
    if (props.disabled) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    scrub.current = { x: e.clientX, v: value };
    docStore.beginGesture('Edit value');
  };
  const onMove = (e: React.PointerEvent) => {
    const s = scrub.current;
    if (!s) return;
    const mult = (e.shiftKey ? 10 : 1) * (e.altKey ? 0.1 : 1);
    onChange(clamp(s.v + (e.clientX - s.x) * step * mult * 0.5, min ?? -Infinity, max ?? Infinity));
  };
  const onUp = (e: React.PointerEvent) => {
    if (!scrub.current) return;
    scrub.current = null;
    docStore.endGesture();
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className={`field${props.keyed ? ' keyed' : ''}${props.wide ? ' wide' : ''}${props.disabled ? ' disabled' : ''}`} data-tip={props.title} data-tip-place="top">
      <span className="flabel" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        {props.label}
      </span>
      <input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        spellCheck={false}
        value={text ?? fmt(value, precision) + (props.suffix ?? '')}
        onFocus={(e) => {
          setText(fmt(value, precision));
          requestAnimationFrame(() => e.target.select());
        }}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => text !== null && commit(text)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            commit(text ?? fmt(value, precision));
            inputRef.current?.blur();
          } else if (e.key === 'Escape') {
            setText(null);
            inputRef.current?.blur();
          } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const mult = (e.shiftKey ? 10 : 1) * (e.altKey ? 0.1 : 1);
            const nv = clamp(value + (e.key === 'ArrowUp' ? 1 : -1) * step * mult, min ?? -Infinity, max ?? Infinity);
            onChange(nv);
            setText(fmt(nv, precision));
          }
        }}
      />
    </div>
  );
}

export function TextField(props: { label?: string; value: string; onCommit: (v: string) => void; wide?: boolean; placeholder?: string }) {
  const [text, setText] = useState<string | null>(null);
  return (
    <div className={`field${props.wide ? ' wide' : ''}`}>
      {props.label && <span className="flabel" style={{ cursor: 'default' }}>{props.label}</span>}
      <input
        type="text"
        spellCheck={false}
        placeholder={props.placeholder}
        value={text ?? props.value}
        onFocus={(e) => {
          setText(props.value);
          requestAnimationFrame(() => e.target.select());
        }}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          if (text !== null && text !== props.value) props.onCommit(text);
          setText(null);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          else if (e.key === 'Escape') {
            setText(null);
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
    </div>
  );
}

export function SelectField<T extends string>(props: { label?: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; wide?: boolean }) {
  return (
    <div className={`field${props.wide ? ' wide' : ''}`}>
      {props.label && <span className="flabel" style={{ cursor: 'default' }}>{props.label}</span>}
      <select value={props.value} onChange={(e) => props.onChange(e.target.value as T)}>
        {props.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// ---------------------------------------------------------------- color

export function rgbaToHex(c: ArrayLike<number>): string {
  const h = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255))).toString(16).padStart(2, '0');
  return `#${h(c[0])}${h(c[1])}${h(c[2])}`;
}
export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return [1, 1, 1];
  return [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255];
}

export function ColorSwatch({ value, onChange, title }: { value: ArrayLike<number>; onChange: (rgb: [number, number, number]) => void; title?: string }) {
  return (
    <span className="swatch" data-tip={title} style={{ background: rgbaToHex(value) }}>
      <input type="color" aria-label={title ?? 'Color'} value={rgbaToHex(value)} onChange={(e) => onChange(hexToRgb(e.target.value))} />
    </span>
  );
}

// ---------------------------------------------------------------- menus / dialogs

export function useOutsideClose(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const k = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('mousedown', h);
    window.addEventListener('keydown', k);
    return () => {
      window.removeEventListener('mousedown', h);
      window.removeEventListener('keydown', k);
    };
  }, [open, close]);
  return ref;
}

export function Menu(props: { label: ReactNode; children: (close: () => void) => ReactNode; icon?: LucideIcon }) {
  const [open, setOpen] = useState(false);
  const ref = useOutsideClose(open, () => setOpen(false));
  const Icon = props.icon;
  return (
    <div className="menu" ref={ref}>
      <button className={`btn ghost${open ? ' on' : ''}`} onClick={() => setOpen(!open)}>
        {Icon && <Icon size={15} strokeWidth={1.9} />}
        {props.label}
      </button>
      {open && <div className="menu-pop">{props.children(() => setOpen(false))}</div>}
    </div>
  );
}

export function MenuItem(props: { icon?: LucideIcon; children: ReactNode; onClick: () => void; hotkey?: string; disabled?: boolean; close: () => void }) {
  const Icon = props.icon;
  return (
    <div
      className={`menu-item${props.disabled ? ' disabled' : ''}`}
      onClick={() => {
        props.close();
        props.onClick();
      }}
    >
      {Icon ? <Icon size={15} strokeWidth={1.9} /> : <span style={{ width: 15 }} />}
      <span>{props.children}</span>
      {props.hotkey && <span className="kbd">{props.hotkey}</span>}
    </div>
  );
}

export function Dialog(props: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; width?: number }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && props.onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [props]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="dialog" style={props.width ? { width: props.width } : undefined}>
        <div className="dialog-head">
          <span>{props.title}</span>
          <span className="spacer" />
          <IconButton icon={X} title="Close" onClick={props.onClose} small />
        </div>
        <div className="dialog-body">{props.children}</div>
        {props.footer && <div className="dialog-foot">{props.footer}</div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- splitter

export function Splitter(props: { dir: 'v' | 'h'; onDrag: (delta: number) => void }) {
  const [active, setActive] = useState(false);
  const last = useRef(0);
  return (
    <div
      className={`split-${props.dir}${active ? ' active' : ''}`}
      onPointerDown={(e) => {
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        last.current = props.dir === 'v' ? e.clientX : e.clientY;
        setActive(true);
      }}
      onPointerMove={(e) => {
        if (!active) return;
        const p = props.dir === 'v' ? e.clientX : e.clientY;
        props.onDrag(p - last.current);
        last.current = p;
      }}
      onPointerUp={() => setActive(false)}
      onPointerCancel={() => setActive(false)}
    />
  );
}
