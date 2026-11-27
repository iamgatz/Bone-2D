/** The list of what an import could not carry over exactly, shown to the person who opened the file. */
import { closeImportNotes, useImportNotes } from '@/store/importNotes';
import { Button, Dialog } from '../ui/controls';

/** Where the window is mounted: renders nothing while there is nothing to say. */
export function ImportNotesHost() {
  const shown = useImportNotes();
  if (!shown) return null;
  return (
    <Dialog
      title="Import notes"
      onClose={closeImportNotes}
      width={640}
      footer={
        <>
          <span className="spacer" />
          <Button primary onClick={closeImportNotes}>
            Got it
          </Button>
        </>
      }
    >
      <p className="hint-text mb">The character is open. These parts of the file did not carry over exactly:</p>
      <ul className="import-notes">
        {shown.notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </Dialog>
  );
}
