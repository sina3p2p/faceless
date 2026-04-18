export interface WordTimestamp {
  word: string;
  start: number;
  end: number;
}

export interface TTSResult {
  audioBuffer: Buffer;
  contentType: string;
  wordTimestamps: WordTimestamp[];
}
