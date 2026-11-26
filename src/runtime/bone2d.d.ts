/** Types of the Bone 2D web player (bone2d.js). */

/** The character file the editor saves. Its insides belong to the player of the same export. */
export interface CharacterData {
  bone2d: 1;
  name: string;
  skeleton: unknown;
  images: Record<string, string>;
  smooth: boolean;
}

export interface PlayOptions {
  /** Start again at the end (default: what the animation says in the editor). */
  loop?: boolean;
  /** Seconds over which the pose goes over from what was shown to the new animation (default 0.2, none for the first). */
  mix?: number;
  /** 1 = as made, 2 = twice as fast. */
  speed?: number;
}

export interface GameEvent {
  name: string;
  int: number;
  float: number;
  string: string;
  animation: string;
}

export interface Character {
  readonly animations: string[];
  readonly skins: string[];
  readonly data: CharacterData;
  /** The pictures, by name. */
  readonly images: Map<string, CanvasImageSource>;
  onEvent: ((event: GameEvent) => void) | null;
  /** Called once when an animation that does not loop reaches its end. */
  onEnd: ((animation: string) => void) | null;
  /** Where the origin of the skeleton is, y up. */
  x: number;
  y: number;
  /** 1 = the size it was made; negative mirrors the character. */
  scaleX: number;
  scaleY: number;
  readonly animation: string | null;
  readonly time: number;
  play(name: string, options?: PlayOptions): void;
  /** Plays an animation when the current one reaches its end (a looping one: at the end of this round). */
  playNext(name: string, options?: PlayOptions): void;
  /** Moves time on and poses the skeleton: call it once a frame. */
  update(seconds: number): void;
  setSkin(names: string | string[] | null): void;
  /** Puts a picture of its own into a slot (null empties it); undefined gives the slot back to the animation. */
  setAttachment(slot: string, attachment: string | null | undefined): void;
  bone(name: string): { x: number; y: number; rotation: number; length: number } | null;
  /** Holds a bone at a place, for example the target of an IK chain. */
  moveBone(name: string, x: number, y: number): void;
  releaseBone(name: string): void;
  bounds(): { x: number; y: number; width: number; height: number } | null;
  /** Lets the physics start from rest again: after the character was moved to a new place at once. */
  resetPhysics(): void;
}

export function loadCharacter(source: string | CharacterData): Promise<Character>;
/** A character without pictures loaded: for servers and tests. */
export function createCharacter(data: CharacterData): Character;

export interface Camera {
  /** The place of the game shown in the middle of the canvas, y up. */
  x?: number;
  y?: number;
  /** CSS pixels per unit of the game. */
  zoom?: number;
}

export function createView(
  canvas: HTMLCanvasElement,
  options?: { background?: [number, number, number, number] },
): {
  draw(characters: Character | Character[], camera?: Camera): void;
  dispose(): void;
};
