<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# MetricSon

**A parameter-mapping sonification widget for cloud metrics**

Transform your AWS CloudWatch metrics, Lambda invocations, and API Gateway requests into an ambient soundscape that lets you monitor your infrastructure with your ears.

Based on academic research from [The Sonification Handbook](https://sonification.de/handbook/) and inspired by [Peep: The Network Auralizer](https://www.usenix.org/conference/lisa-2000/peep-network-auralizer-monitoring-your-network-sound).

## Why Audio Monitoring?

> "Environments in which large numbers of changing variables and/or temporally complex information must be monitored simultaneously are well suited for auditory displays"  
> — Kramer et al., 2010

Your ears can:
- Track multiple concurrent signals (the "cocktail party effect")
- Detect anomalies without focused attention
- Process temporal patterns that visual displays miss
- Continue monitoring while your eyes are on code

## Quick Start

```html
<script src="https://unpkg.com/tone@14"></script>
<script src="https://unpkg.com/metric-son"></script>
<script>
  const son = new MetricSon.Widget();
  
  document.getElementById('startBtn').addEventListener('click', async () => {
    await son.init({ scale: 'pentatonic', masterVolume: 0.4 });
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
</script>
```

## How It Sounds

| What Happens | What You Hear |
|--------------|---------------|
| Lambda invocation | Piano-like pluck, pitch unique to that Lambda |
| API Gateway request | Soft sustained pad |
| DynamoDB operation | Pitched percussion |
| Error | Dissonant, detuned note that grabs attention |
| High latency | More reverb (spatial metaphor for "distance") |
| Traffic spike | Denser note patterns |
| System health | Subtle ambient background texture |

All pitches use a **pentatonic scale** (C, D, E, G, A) so concurrent notes always sound pleasant together—no jarring clashes even during traffic spikes.

## API

### Initialization

```javascript
const son = new MetricSon.Widget();

await son.init({
  masterVolume: 0.5,      // 0-1, default 0.5
  baseNote: 'C4',         // Root note, default 'C4'
  scale: 'pentatonic',    // 'pentatonic' | 'major' | 'minor' | 'whole-tone'
  maxVoices: 16           // Polyphony limit
});
```

### Lifecycle

```javascript
await son.start();  // Must be called from user gesture (browser requirement)
son.stop();
son.dispose();      // Clean up all resources
```

### Emitting Events

```javascript
son.emit({
  source: 'payment-lambda',      // Unique ID → determines pitch
  type: 'invocation',            // 'invocation' | 'error' | 'latency' | 'throughput'
  duration: 150,                 // Execution time in ms → note length
  severity: 'info',              // 'info' | 'warn' | 'error' | 'critical'
  serviceType: 'lambda'          // 'lambda' | 'apigateway' | 'dynamodb' | 'sqs' | 'sns'
});
```

### Ambient Layer

```javascript
// Set overall system activity level (0-1)
// Creates a subtle background texture that represents system "presence"
son.setAmbientLevel(0.6);
```

### Volume Control

```javascript
son.setVolume(0.3);  // 0-1
```

## Design Principles

This widget implements **Parameter Mapping Sonification (PMSon)** as described in Chapter 15 of The Sonification Handbook:

| Data Dimension | Auditory Dimension | Rationale |
|----------------|-------------------|-----------|
| Metric source | Pitch | Categorical → discrete pitch |
| Value intensity | Velocity | Intuitive "more = louder" |
| Event rate | Note density | Temporal correlation |
| Duration | Note length | Direct temporal mapping |
| Latency | Reverb | Spatial metaphor |
| Errors | Dissonance | Attention-grabbing |
| Service type | Instrument | Categorical grouping |

Following the "sonic ecology" approach from Peep:
- **Normal state** = pleasant, ignorable ambient texture
- **Anomalies** = sounds that break the pattern

## Integration Examples

### CloudWatch Logs Subscription

```javascript
// Lambda that forwards to WebSocket
export const handler = async (event) => {
  const logEvents = event.records.map(r => 
    Buffer.from(r.data, 'base64').toString()
  );
  
  for (const log of logEvents) {
    await broadcastToWebSocket({
      source: log.logGroup,
      type: log.message.includes('ERROR') ? 'error' : 'invocation',
      duration: extractDuration(log.message),
      serviceType: 'lambda'
    });
  }
};
```

### Prometheus/Grafana

```javascript
// Poll Prometheus and emit to widget
async function pollMetrics() {
  const response = await fetch('/api/v1/query?query=rate(lambda_invocations[1m])');
  const data = await response.json();
  
  for (const result of data.data.result) {
    son.emit({
      source: result.metric.function_name,
      type: 'throughput',
      value: parseFloat(result.value[1]),
      serviceType: 'lambda'
    });
  }
}

setInterval(pollMetrics, 1000);
```

## Academic References

1. Hermann, T., Hunt, A., & Neuhoff, J. G. (Eds.). (2011). *The Sonification Handbook*. Logos Publishing House. https://sonification.de/handbook/

2. Grond, F. & Berger, J. (2011). Parameter Mapping Sonification. *The Sonification Handbook*, Chapter 15.

3. Walker, B. N. & Nees, M. A. (2011). Theory of Sonification. *The Sonification Handbook*, Chapter 2.

4. Barrass, S. & Vickers, P. (2011). Sonification Design and Aesthetics. *The Sonification Handbook*, Chapter 7.

5. Gilfix, M. & Couch, A. L. (2000). Peep (The Network Auralizer): Monitoring Your Network with Sound. *14th Systems Administration Conference (LISA 2000)*, USENIX.

6. Debashi, M. & Vickers, P. (2018). Sonification of network traffic flow for monitoring and situational awareness. *PLOS ONE*, 13(4), e0195948.

## License

MIT

---

*If you use this in research, please cite the academic sources above.*
