// TypeScript types only the worker form of this constructor; Chrome's window form takes the track.
interface MediaStreamTrackProcessorInit {
  track: MediaStreamTrack;
}
