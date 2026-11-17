import { Bell, BookOpen, FilePlus2, FolderOpen, Keyboard, MessageSquareText, Sparkles } from 'lucide-react';
import { loadSample } from '@/store/sample';
import { newProject, openProjectFile } from '@/store/project';
import { setSettings, useSettings } from '@/store/settings';
import { uiStore } from '@/store/ui';
import { openSpineImport } from './importSpine';
import { REPO, SITE } from './changelog';
import { Dialog, Toggle } from './ui/controls';

/** One big choice of the welcome window. */
function Choice(props: { icon: typeof Sparkles; title: string; text: string; onClick: () => void; primary?: boolean }) {
  const Icon = props.icon;
  return (
    <button type="button" className={`choice${props.primary ? ' primary' : ''}`} onClick={props.onClick}>
      <Icon size={22} strokeWidth={1.7} />
      <span className="choice-title">{props.title}</span>
      <span className="choice-text">{props.text}</span>
    </button>
  );
}

const close = () => uiStore.patch({ welcomeOpen: false });

/** The welcome window (Spine has one too): the ways to start, the first three steps, and the way to the updates, the help and the feedback. */
export function WelcomeDialog() {
  const showAtStart = useSettings((s) => s.showWelcome);
  const go = (fn: () => void) => () => {
    close();
    fn();
  };
  return (
    <Dialog title="Welcome to Bone 2D" width={680} onClose={close}>
      <p className="hint-text flush mb">A 2D skeletal animation editor that runs in the browser and exports Spine 4.3 files. Nothing to install: everything stays on your computer.</p>
      <div className="choices">
        <Choice primary icon={Sparkles} title="Try the demo rig" text="A fox with IK legs, a physics tail, two skins and four animations" onClick={go(loadSample)} />
        <Choice icon={FilePlus2} title="New project" text="An empty skeleton: drop PNGs, draw bones" onClick={go(() => newProject())} />
        <Choice icon={FolderOpen} title="Open a project" text="A .bone2d file from your computer" onClick={go(openProjectFile)} />
        <Choice icon={FolderOpen} title="Import from Spine" text="A Spine .json (4.0 – 4.3) with its atlas and images" onClick={go(openSpineImport)} />
      </div>
      <h3 className="section-label flush mt">First steps</h3>
      <ol className="steps">
        <li>
          Drop PNG images into the window, then press <kbd className="kbd">B</kbd> and drag to draw bones.
        </li>
        <li>
          Press <kbd className="kbd">Tab</kbd> to animate: move the time marker, pose the bones, keys are made for you.
        </li>
        <li>
          <kbd className="kbd">Ctrl</kbd>
          <kbd className="kbd">E</kbd> exports the skeleton and atlas for Spine, or an animation as a GIF or a video.
        </li>
      </ol>
      <div className="links">
        <a href={`https://github.com/${REPO}#readme`} target="_blank" rel="noreferrer">
          <BookOpen size={15} /> Documentation
        </a>
        <button type="button" onClick={go(() => uiStore.patch({ updatesOpen: true }))}>
          <Bell size={15} /> What's new
        </button>
        <button type="button" onClick={go(() => uiStore.patch({ helpOpen: true }))}>
          <Keyboard size={15} /> Shortcuts
        </button>
        <button type="button" onClick={go(() => uiStore.patch({ feedbackOpen: true }))}>
          <MessageSquareText size={15} /> Send feedback
        </button>
        <a href={SITE} target="_blank" rel="noreferrer" className="muted">
          iamgatz.github.io/Bone-2D
        </a>
      </div>
      <div className="fb-info mt">
        <Toggle on={showAtStart} onChange={(v) => setSettings({ showWelcome: v })} title="Show this window when the editor starts with an empty project" />
        <span>Show this window when the editor starts with an empty project</span>
      </div>
    </Dialog>
  );
}
