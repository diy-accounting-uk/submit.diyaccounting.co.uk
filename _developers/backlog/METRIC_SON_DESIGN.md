<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# MetricSon: A Parameter-Mapping Sonification Widget for Cloud Metrics

## Academic Foundation

This design draws heavily from *The Sonification Handbook* (Hermann, Hunt & Neuhoff, 2011), particularly:

- **Chapter 2**: Theory of Sonification (Walker & Nees) - foundational principles
- **Chapter 7**: Sonification Design and Aesthetics (Barrass & Vickers) - design patterns
- **Chapter 15**: Parameter Mapping Sonification (Grond & Berger) - the core technique
- **Chapter 18**: Sonification for Process Monitoring - direct application domain

Additional influences:
- Peep: The Network Auralizer (Gilfix & Couch, USENIX LISA 2000)
- SoNSTAR (PLOS ONE, 2018) - soundscape approach to network monitoring

---

## Core Design Principles

### 1. Separation of Concerns

The widget handles **only** audio synthesis. The host page is responsible for:
- Data acquisition (WebSocket, polling, etc.)
- UI chrome (mute buttons, volume controls, visualisation)
- Metric routing decisions

This follows the Unix philosophy and makes the widget maximally reusable.

### 2. Parameter Mapping Sonification (PMSon)

From Grond & Berger (Chapter 15):

> "Effective PMSon involves translating data features (left) into sound synthesis 
> parameters (right). [...] Integrating both worlds is key in creating [effective displays]."

Our mapping strategy:

| Data Dimension | Auditory Dimension | Rationale |
|----------------|-------------------|-----------|
| **Metric source** (e.g. Lambda name) | Pitch (note) | Categorical → discrete pitch |
| **Value intensity** | Velocity/loudness | Intuitive "more = louder" |
| **Rate of events** | Note density | Temporal correlation preserved |
| **Duration** (execution time) | Note length | Direct temporal mapping |
| **Latency** | Reverb/delay | Spatial metaphor for "distance" |
| **Error state** | Timbre (dissonance) | Attention-grabbing deviation |
| **Service type** | Instrument family | Categorical grouping |

### 3. Polarity and Scaling

Walker (2002, 2007) established that mapping polarity matters enormously. We use:

- **Positive polarity** for intensity metrics (more activity = higher pitch would be wrong; 
  instead more activity = more notes, same pitch per source)
- **Logarithmic scaling** for rate metrics (human perception of loudness is logarithmic)
- **Constrained pitch range** to avoid listener fatigue (Walker's research suggests 
  limiting to 2-3 octaves for monitoring tasks)

### 4. Soundscape Approach

Following Peep and SoNSTAR, we use the "sonic ecology" metaphor:

- **Normal state** = pleasant, ignorable ambient texture
- **Anomalies** = sounds that break the pattern and demand attention
- **Background layer** = continuous drone representing aggregate system health

From Chapter 18:
> "Sounds that do not belong to the normal state of a forest were then used to 
> represent rarer, unusual, or anomalous events."

### 5. Listener Fatigue Mitigation

Chapter 7 emphasises that monitoring sonifications must be sustainable over hours:

- Use consonant intervals (pentatonic scale) for normal operations
- Reserve dissonance for errors only
- Implement automatic gain control
- Provide "breathing room" - not every data point needs a sound

---

## Widget API Design

```typescript
interface MetricSonWidget {
  // Lifecycle
  init(config: SonConfig): Promise<void>;
  start(): Promise<void>;  // Must be called from user gesture
  stop(): void;
  dispose(): void;
  
  // Core - push metrics to the widget
  emit(event: MetricEvent): void;
  
  // Background layer
  setAmbientLevel(level: number): void;  // 0-1, system health indicator
  
  // Callbacks for host page
  onStateChange?: (state: 'stopped' | 'running' | 'suspended') => void;
}

interface SonConfig {
  // Audio routing
  destination?: AudioNode;  // Default: speakers
  masterVolume?: number;    // 0-1, default 0.5
  
  // Musical configuration
  baseNote?: string;        // e.g. "C3", default "C4"
  scale?: ScaleType;        // 'pentatonic' | 'chromatic' | 'whole-tone'
  
  // Voice allocation
  maxVoices?: number;       // Polyphony limit, default 16
  
  // Instrument definitions (optional overrides)
  instruments?: InstrumentMap;
}

interface MetricEvent {
  // Required
  source: string;           // Unique ID for this metric source (e.g. Lambda ARN)
  type: EventType;          // 'invocation' | 'error' | 'latency' | 'custom'
  
  // Optional enrichment
  value?: number;           // Metric value (interpretation depends on type)
  duration?: number;        // For invocations: execution time in ms
  severity?: 'info' | 'warn' | 'error' | 'critical';
  serviceType?: ServiceType; // For instrument selection
  
  // Timing (if not provided, plays immediately)
  timestamp?: number;       // Unix ms, for replay scenarios
}

type EventType = 'invocation' | 'error' | 'latency' | 'throughput' | 'custom';
type ServiceType = 'lambda' | 'apigateway' | 'dynamodb' | 'sqs' | 'sns' | 'custom';
type ScaleType = 'pentatonic' | 'major' | 'minor' | 'chromatic' | 'whole-tone';
```

---

## Sound Design

### Instrument Mapping by Service Type

| Service | Instrument Character | Rationale |
|---------|---------------------|-----------|
| Lambda | Piano/Pluck (fast attack, short decay) | Discrete invocations |
| API Gateway | Pad/String (slow attack, sustained) | Request flow |
| DynamoDB | Percussion (pitched) | Read/write operations |
| SQS/SNS | Bell/Chime | Message arrival |
| Errors | Distorted/Detuned variant | Breaks the pattern |

### Pitch Assignment Strategy

Sources are assigned pitches from a **pentatonic scale** (C, D, E, G, A) which:
- Sounds pleasant regardless of which notes play together
- Avoids the "computer music" feeling of chromatic scales
- Allows up to 15 distinct sources across 3 octaves before collision

Assignment is deterministic via hashing:
```javascript
const pitchIndex = hash(source) % scaleNotes.length;
const octave = Math.floor(hash(source + 'octave') % 3) - 1; // -1, 0, or +1
```

### The Ambient Layer

A continuous, slowly-evolving background texture that represents aggregate system health:

- **Implementation**: Filtered noise + subtle pad drone
- **0% health** (no traffic): Near-silence, occasional gentle pulse
- **50% health** (normal): Warm, ignorable bed of sound
- **100% health** (high load): Richer texture, more harmonic content
- **Anomaly**: Background shifts to minor key or adds subtle dissonance

---

## Implementation Notes

### Technology Choice: Tone.js

Tone.js provides the right abstraction level:
- Built-in synths with ADSR envelopes
- Transport for precise scheduling
- Effects (reverb, delay, filter) for the latency mapping
- Well-maintained, good browser compatibility

### Voice Management

To prevent audio overload:
1. **Voice stealing**: When maxVoices exceeded, steal quietest voice
2. **Debouncing**: Aggregate rapid-fire events into single sounds with velocity
3. **Automatic ducking**: Reduce ambient layer when many events occur

### Memory Management

- Dispose of oscillators/synths when not needed
- Use object pooling for frequently-triggered sounds
- Clear internal source→pitch mappings if sources exceed threshold

---

## Usage Example

```html
<script type="module">
import { MetricSon } from './metric-son.js';

const son = new MetricSon();

// Must be called from user gesture (e.g. button click)
document.getElementById('start').addEventListener('click', async () => {
  await son.init({ masterVolume: 0.4, scale: 'pentatonic' });
  await son.start();
  
  // Connect to your metrics source
  const ws = new WebSocket('wss://your-metrics-endpoint');
  ws.onmessage = (msg) => {
    const metric = JSON.parse(msg.data);
    son.emit({
      source: metric.functionName,
      type: 'invocation',
      duration: metric.durationMs,
      serviceType: 'lambda'
    });
  };
});

document.getElementById('stop').addEventListener('click', () => {
  son.stop();
});
</script>
```

---

## References

1. Hermann, T., Hunt, A., & Neuhoff, J. G. (Eds.). (2011). *The Sonification Handbook*. Logos Publishing House. https://sonification.de/handbook/

2. Gilfix, M., & Couch, A. L. (2000). Peep (The Network Auralizer): Monitoring Your Network with Sound. *14th Systems Administration Conference (LISA 2000)*, USENIX.

3. Debashi, M., & Vickers, P. (2018). Sonification of network traffic flow for monitoring and situational awareness. *PLOS ONE*, 13(4), e0195948.

4. Walker, B. N. (2002). Magnitude estimation of conceptual data dimensions for use in sonification. *Journal of Experimental Psychology: Applied*, 8(4), 211-221.

5. Barrass, S. (1997). *Auditory Information Design*. PhD thesis, Australian National University.

---

## License

MIT - but please cite the academic sources if you publish research using this widget.
