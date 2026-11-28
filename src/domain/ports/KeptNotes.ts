/**
 * Port: the notes files the reader chose to keep where they are (right beside their PDF)
 * when offered to move them into "Notes", so the offer isn't made again.
 */
export interface KeptNotes {
  has(notesPath: string): boolean;
  add(notesPath: string): void;
}
