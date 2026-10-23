// Chrome's insertable-streams API is missing from TypeScript's DOM lib.
declare class MediaStreamTrackProcessor<T = VideoFrame | AudioData> {
  constructor(init: { track: MediaStreamTrack; maxBufferSize?: number });
  readonly readable: ReadableStream<T>;
}
