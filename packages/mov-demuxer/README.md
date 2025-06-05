# @photo-gallery/mov-demuxer

A TypeScript/ES6 MOV/MP4 demuxer with WebCodecs API integration, inspired by FFmpeg's mov.c implementation.

## Features

- 🎬 Parse MOV/MP4 container format (ISO/IEC 14496-12)
- 📦 Extract video and audio streams
- 🔍 Support for various codecs (H.264, H.265, AAC, etc.)
- 🎯 WebCodecs API integration for hardware-accelerated decoding
- 🚀 Zero-dependency implementation
- 🐛 Comprehensive debug logging
- 📊 Frame-accurate seeking
- 🎮 Sample-level access

## Installation

```bash
pnpm add @photo-gallery/mov-demuxer
```

## Usage

### Basic Usage

```typescript
import { MOVDemuxer } from '@photo-gallery/mov-demuxer';

// Load your MOV/MP4 file
const response = await fetch('video.mp4');
const buffer = await response.arrayBuffer();

// Create demuxer
const demuxer = new MOVDemuxer(buffer, {
  enableVideo: true,
  enableAudio: true,
  debug: true
});

// Initialize
await demuxer.init();

// Get file info
const info = demuxer.getInfo();
console.log('Duration:', info.duration / info.timeScale, 'seconds');
console.log('Streams:', info.streams);
```

### WebCodecs Integration

```typescript
// Initialize WebCodecs decoders
await demuxer.initWebCodecs(
  // Video frame callback
  (videoFrame: VideoFrame) => {
    // Render video frame
    ctx.drawImage(videoFrame, 0, 0);
    videoFrame.close();
  },
  // Audio frame callback
  (audioData: AudioData) => {
    // Play audio data
    console.log('Audio frame:', audioData);
    audioData.close();
  },
  // Error callback
  (error: Error) => {
    console.error('Decode error:', error);
  }
);

// Read and decode frames
while (true) {
  const frame = await demuxer.readFrame();
  if (!frame) break; // End of file
  
  // Frame is automatically decoded via WebCodecs
  console.log('Frame:', frame.timestamp, frame.type);
}
```

### Manual Frame Processing

```typescript
// Read frames without WebCodecs
while (true) {
  const sample = demuxer.getNextSample();
  if (!sample) break;
  
  const data = demuxer.getSampleData(sample);
  console.log('Sample:', {
    timestamp: sample.timestamp,
    size: sample.size,
    isKeyframe: sample.isKeyframe,
    data: data
  });
}
```

### Seeking

```typescript
// Seek to 10 seconds (timestamp in microseconds)
demuxer.seek(10 * 1000000);

// Read frame at seek position
const frame = await demuxer.readFrame();
```

## API Reference

### MOVDemuxer

Main demuxer class.

#### Constructor

```typescript
new MOVDemuxer(buffer: ArrayBuffer, options?: MOVDemuxerOptions)
```

#### Options

```typescript
interface MOVDemuxerOptions {
  enableVideo?: boolean;    // Enable video streams (default: true)
  enableAudio?: boolean;    // Enable audio streams (default: true)
  debug?: boolean;          // Enable debug logging (default: false)
}
```

#### Methods

- `init(): Promise<void>` - Initialize the demuxer
- `initWebCodecs(onVideo?, onAudio?, onError?): Promise<void>` - Initialize WebCodecs
- `getNextSample(): MOVSample | null` - Get next sample
- `getSampleData(sample): Uint8Array` - Get sample data
- `readFrame(): Promise<EncodedFrame | null>` - Read and decode next frame
- `seek(timestamp: number): void` - Seek to timestamp (microseconds)
- `getInfo()` - Get file information
- `reset(): void` - Reset to beginning
- `close(): void` - Clean up resources

### Data Types

```typescript
interface MOVStreamContext {
  id: number;
  type: 'video' | 'audio';
  codecType: string;
  timeScale: number;
  duration: number;
  width?: number;           // Video only
  height?: number;          // Video only
  sampleRate?: number;      // Audio only
  channels?: number;        // Audio only
  extraData?: Uint8Array;   // Codec private data
}

interface MOVSample {
  offset: number;           // Offset in mdat
  size: number;             // Sample size in bytes
  timestamp: number;        // Timestamp in microseconds
  duration: number;         // Duration in microseconds
  isKeyframe: boolean;      // Is keyframe/sync sample
  streamId: number;         // Stream ID
}

interface EncodedFrame {
  data: Uint8Array;         // Frame data
  timestamp: number;        // Timestamp in microseconds
  duration: number;         // Duration in microseconds
  isKeyframe: boolean;      // Is keyframe
  streamId: number;         // Stream ID
  type: 'video' | 'audio';  // Frame type
}
```

## Supported Formats

### Container Formats
- MOV (QuickTime Movie)
- MP4 (MPEG-4 Part 14)
- M4V (iTunes Video)
- M4A (iTunes Audio)

### Video Codecs
- H.264/AVC (avc1, avc3)
- H.265/HEVC (hev1, hvc1)
- VP8 (vp08, vp80)
- VP9 (vp09, vp90)
- AV1 (av01)
- MPEG-4 Visual (mp4v)

### Audio Codecs
- AAC (mp4a)
- Opus (opus)
- MP3 (mp3)
- FLAC (fLaC)
- PCM variants

## Browser Compatibility

WebCodecs support varies by browser:
- Chrome 94+
- Edge 94+
- Safari 16.4+
- Firefox: Behind flag

For browsers without WebCodecs, you can still parse the container and extract raw frame data.

## Debugging

Enable debug mode to see detailed parsing information:

```typescript
const demuxer = new MOVDemuxer(buffer, { debug: true });
```

This will log:
- Box structure parsing
- Stream information
- Sample table details
- WebCodecs initialization
- Decode operations

## Implementation Notes

This demuxer is inspired by FFmpeg's `mov.c` implementation but written from scratch in TypeScript. Key design decisions:

- **Zero dependencies**: Pure TypeScript/ES6 implementation
- **Memory efficient**: Streaming box parser, minimal data copying
- **WebCodecs first**: Designed for modern web APIs
- **Extensible**: Modular architecture for easy extension

## License

MIT
