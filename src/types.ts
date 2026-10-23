/** One processed camera frame. f and d are calibrated scores: how many "spreads" above this tester's resting face. */
export type Sample = { t: number; f: number; d: number; loud: number; face: boolean };

export type MomentKind = "frustration" | "delight" | "mark";

export type Moment = {
  id: string;
  t: number; // seconds from the start of the recording
  kind: MomentKind;
  strength: number; // peak score, boosted when the tester was loud; 0 for manual marks
  thumb?: string; // small JPEG data URL
  note: string;
  dismissed: boolean;
};

export type Session = {
  id: string;
  tester: string;
  build: string;
  createdAt: number;
  duration: number;
  mimeType: string;
  samples: Sample[];
  moments: Moment[];
};

export type Videos = { game: Blob; face: Blob };
