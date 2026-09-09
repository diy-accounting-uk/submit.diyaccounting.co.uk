/**
 * MetricSon - A Parameter-Mapping Sonification Widget for Cloud Metrics
 * 
 * Based on principles from The Sonification Handbook (Hermann, Hunt & Neuhoff, 2011)
 * and inspired by Peep: The Network Auralizer (Gilfix & Couch, USENIX LISA 2000)
 * 
 * @license SEE LICENSE IN LICENSE
 * @see https://sonification.de/handbook/
 */

import * as Tone from 'tone';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * @typedef {'invocation' | 'error' | 'latency' | 'throughput' | 'custom'} EventType
 * @typedef {'lambda' | 'apigateway' | 'dynamodb' | 'sqs' | 'sns' | 'custom'} ServiceType
 * @typedef {'pentatonic' | 'major' | 'minor' | 'chromatic' | 'whole-tone'} ScaleType
 * @typedef {'stopped' | 'running' | 'suspended'} WidgetState
 */

/**
 * @typedef {Object} MetricEvent
 * @property {string} source - Unique identifier for the metric source
 * @property {EventType} type - Type of metric event
 * @property {number} [value] - Metric value
 * @property {number} [duration] - Duration in milliseconds
 * @property {'info' | 'warn' | 'error' | 'critical'} [severity]
 * @property {ServiceType} [serviceType]
 * @property {number} [timestamp] - Unix timestamp in ms
 */

/**
 * @typedef {Object} SonConfig
 * @property {number} [masterVolume=0.5] - Master volume 0-1
 * @property {string} [baseNote='C4'] - Base note for pitch mapping
 * @property {ScaleType} [scale='pentatonic'] - Musical scale
 * @property {number} [maxVoices=16] - Maximum polyphony
 * @property {Object} [instruments] - Custom instrument definitions
 */

// ============================================================================
// Musical Constants
// ============================================================================

/**
 * Scale definitions in semitones from root
 * Pentatonic chosen as default for pleasant concurrent sounds
 * (Walker & Nees, Sonification Handbook Ch. 2)
 */
const SCALES = {
  pentatonic: [0, 2, 4, 7, 9],           // C D E G A - always consonant
  major: [0, 2, 4, 5, 7, 9, 11],         // Full major scale
  minor: [0, 2, 3, 5, 7, 8, 10],         // Natural minor
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  'whole-tone': [0, 2, 4, 6, 8, 10]      // Dreamy, ambiguous
};

/**
 * Instrument configurations by service type
 * Following the "earcon" design principles (Blattner et al., 1989)
 */
const DEFAULT_INSTRUMENTS = {
  lambda: {
    synth: 'Synth',
    options: {
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.01, decay: 0.2, sustain: 0.1, release: 0.3 }
    }
  },
  apigateway: {
    synth: 'Synth',
    options: {
      oscillator: { type: 'sine' },
      envelope: { attack: 0.1, decay: 0.3, sustain: 0.4, release: 0.8 }
    }
  },
  dynamodb: {
    synth: 'MembraneSynth',
    options: {
      pitchDecay: 0.05,
      octaves: 4,
      envelope: { attack: 0.001, decay: 0.2, sustain: 0, release: 0.2 }
    }
  },
  sqs: {
    synth: 'MetalSynth',
    options: {
      envelope: { attack: 0.001, decay: 0.4, release: 0.2 }
    }
  },
  sns: {
    synth: 'MetalSynth',
    options: {
      envelope: { attack: 0.001, decay: 0.3, release: 0.1 }
    }
  },
  custom: {
    synth: 'Synth',
    options: {
      oscillator: { type: 'square' },
      envelope: { attack: 0.01, decay: 0.1, sustain: 0.2, release: 0.3 }
    }
  },
  error: {
    synth: 'Synth',
    options: {
      oscillator: { type: 'sawtooth' },
      envelope: { attack: 0.001, decay: 0.1, sustain: 0.3, release: 0.5 }
    }
  }
};

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Deterministic hash function for consistent source→pitch mapping
 * @param {string} str 
 * @returns {number}
 */
function hashString(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
  }
  return Math.abs(hash);
}

/**
 * Convert MIDI note number to frequency
 * @param {number} midi 
 * @returns {number}
 */
function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Parse note string to MIDI number
 * @param {string} note - e.g. "C4", "F#3"
 * @returns {number}
 */
function noteToMidi(note) {
  const noteMap = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const match = note.match(/^([A-G])([#b]?)(\d+)$/);
  if (!match) return 60; // Default to middle C
  
  let [, letter, accidental, octave] = match;
  let midi = noteMap[letter] + (parseInt(octave) + 1) * 12;
  if (accidental === '#') midi++;
  if (accidental === 'b') midi--;
  return midi;
}

// ============================================================================
// Main Widget Class
// ============================================================================

export class MetricSon {
  /** @type {SonConfig} */
  #config;
  
  /** @type {WidgetState} */
  #state = 'stopped';
  
  /** @type {Map<string, number>} Source to pitch index mapping */
  #sourcePitchMap = new Map();
  
  /** @type {Map<string, Tone.Synth>} Synth pool by service type */
  #synthPool = new Map();
  
  /** @type {Tone.Gain} Master gain node */
  #masterGain;
  
  /** @type {Tone.Reverb} Shared reverb for latency effect */
  #reverb;
  
  /** @type {Tone.Noise} Ambient noise layer */
  #ambientNoise;
  
  /** @type {Tone.Filter} Filter for ambient noise */
  #ambientFilter;
  
  /** @type {Tone.Gain} Gain for ambient layer */
  #ambientGain;
  
  /** @type {number[]} Currently active scale notes (MIDI) */
  #scaleNotes = [];
  
  /** @type {number} Base MIDI note */
  #baseMidi;
  
  /** @type {number} Active voice count */
  #activeVoices = 0;
  
  /** @type {Function} State change callback */
  onStateChange;

  constructor() {
    this.#config = {
      masterVolume: 0.5,
      baseNote: 'C4',
      scale: 'pentatonic',
      maxVoices: 16,
      instruments: {}
    };
  }

  /**
   * Initialize the widget
   * @param {SonConfig} config 
   */
  async init(config = {}) {
    this.#config = { ...this.#config, ...config };
    
    // Build scale
    this.#baseMidi = noteToMidi(this.#config.baseNote);
    const scaleIntervals = SCALES[this.#config.scale] || SCALES.pentatonic;
    
    // Generate 3 octaves of scale notes
    this.#scaleNotes = [];
    for (let octave = -1; octave <= 1; octave++) {
      for (const interval of scaleIntervals) {
        this.#scaleNotes.push(this.#baseMidi + interval + (octave * 12));
      }
    }
    
    // Create audio graph
    this.#masterGain = new Tone.Gain(this.#config.masterVolume);
    this.#masterGain.toDestination();
    
    // Reverb for latency representation
    // (spatial metaphor: latency = distance = more reverb)
    this.#reverb = new Tone.Reverb({
      decay: 2,
      wet: 0
    });
    await this.#reverb.generate();
    this.#reverb.connect(this.#masterGain);
    
    // Ambient layer: filtered noise representing system "presence"
    // Inspired by Peep's "sonic ecology" approach
    this.#ambientNoise = new Tone.Noise('pink');
    this.#ambientFilter = new Tone.Filter({
      frequency: 800,
      type: 'lowpass',
      rolloff: -24
    });
    this.#ambientGain = new Tone.Gain(0);
    
    this.#ambientNoise.connect(this.#ambientFilter);
    this.#ambientFilter.connect(this.#ambientGain);
    this.#ambientGain.connect(this.#masterGain);
    
    // Pre-create synth pools for each service type
    this.#initSynthPools();
    
    this.#setState('stopped');
  }

  /**
   * Initialize synth pools for each service type
   * @private
   */
  #initSynthPools() {
    const instruments = { ...DEFAULT_INSTRUMENTS, ...this.#config.instruments };
    
    for (const [type, config] of Object.entries(instruments)) {
      const SynthClass = Tone[config.synth] || Tone.Synth;
      const synth = new SynthClass(config.options);
      synth.connect(this.#reverb);
      this.#synthPool.set(type, synth);
    }
  }

  /**
   * Start the sonification (must be called from user gesture)
   */
  async start() {
    if (this.#state === 'running') return;
    
    await Tone.start();
    this.#ambientNoise.start();
    this.#setState('running');
  }

  /**
   * Stop all sound
   */
  stop() {
    if (this.#state === 'stopped') return;
    
    this.#ambientNoise.stop();
    
    // Release all active synths
    for (const synth of this.#synthPool.values()) {
      synth.triggerRelease();
    }
    
    this.#setState('stopped');
  }

  /**
   * Emit a metric event to be sonified
   * @param {MetricEvent} event 
   */
  emit(event) {
    if (this.#state !== 'running') return;
    
    const {
      source,
      type,
      value,
      duration = 100,
      severity = 'info',
      serviceType = 'custom'
    } = event;
    
    // Get pitch for this source (deterministic assignment)
    const pitch = this.#getPitchForSource(source);
    
    // Calculate note duration from event duration
    // Logarithmic scaling as per psychoacoustic principles
    const noteDuration = Math.min(2, Math.max(0.05, Math.log10(duration + 1) / 3));
    
    // Calculate velocity from severity
    const velocityMap = { info: 0.4, warn: 0.6, error: 0.8, critical: 1.0 };
    const velocity = velocityMap[severity] || 0.5;
    
    // Select synth based on event type and service
    const synthKey = type === 'error' ? 'error' : serviceType;
    const synth = this.#synthPool.get(synthKey) || this.#synthPool.get('custom');
    
    // Set reverb based on value (if provided) - representing "distance" or latency
    if (value !== undefined && type === 'latency') {
      // Normalize latency to 0-1 range (assuming 0-5000ms typical)
      const normalizedLatency = Math.min(1, value / 5000);
      this.#reverb.wet.rampTo(normalizedLatency * 0.7, 0.1);
    }
    
    // Trigger the note
    const now = Tone.now();
    
    // For errors, add slight detuning for dissonance
    // (attention-grabbing per Sonification Handbook Ch. 7)
    if (type === 'error') {
      const detunedPitch = pitch * (1 + (Math.random() - 0.5) * 0.05);
      synth.triggerAttackRelease(detunedPitch, noteDuration, now, velocity);
      
      // Also play a minor second above for extra dissonance
      const dissonantPitch = pitch * Math.pow(2, 1/12);
      setTimeout(() => {
        synth.triggerAttackRelease(dissonantPitch, noteDuration * 0.5, Tone.now(), velocity * 0.6);
      }, 20);
    } else {
      synth.triggerAttackRelease(pitch, noteDuration, now, velocity);
    }
    
    this.#activeVoices++;
    setTimeout(() => this.#activeVoices--, noteDuration * 1000 + 500);
  }

  /**
   * Set the ambient background level (0-1)
   * Represents overall system activity/health
   * @param {number} level 
   */
  setAmbientLevel(level) {
    if (this.#state !== 'running') return;
    
    const clampedLevel = Math.max(0, Math.min(1, level));
    
    // Adjust ambient volume (subtle - should be ignorable when normal)
    this.#ambientGain.gain.rampTo(clampedLevel * 0.08, 0.5);
    
    // Adjust filter frequency (more activity = brighter sound)
    this.#ambientFilter.frequency.rampTo(400 + clampedLevel * 1200, 0.5);
  }

  /**
   * Get the frequency for a given source
   * Uses deterministic hashing for consistent pitch assignment
   * @private
   * @param {string} source 
   * @returns {number} Frequency in Hz
   */
  #getPitchForSource(source) {
    if (!this.#sourcePitchMap.has(source)) {
      const hash = hashString(source);
      const pitchIndex = hash % this.#scaleNotes.length;
      this.#sourcePitchMap.set(source, pitchIndex);
    }
    
    const pitchIndex = this.#sourcePitchMap.get(source);
    const midiNote = this.#scaleNotes[pitchIndex];
    return midiToFreq(midiNote);
  }

  /**
   * Update internal state and notify listeners
   * @private
   * @param {WidgetState} newState 
   */
  #setState(newState) {
    this.#state = newState;
    if (this.onStateChange) {
      this.onStateChange(newState);
    }
  }

  /**
   * Get current state
   * @returns {WidgetState}
   */
  get state() {
    return this.#state;
  }

  /**
   * Get current active voice count
   * @returns {number}
   */
  get activeVoices() {
    return this.#activeVoices;
  }

  /**
   * Set master volume
   * @param {number} volume 0-1
   */
  setVolume(volume) {
    this.#masterGain.gain.rampTo(Math.max(0, Math.min(1, volume)), 0.1);
  }

  /**
   * Clean up all resources
   */
  dispose() {
    this.stop();
    
    for (const synth of this.#synthPool.values()) {
      synth.dispose();
    }
    this.#synthPool.clear();
    
    this.#reverb?.dispose();
    this.#ambientNoise?.dispose();
    this.#ambientFilter?.dispose();
    this.#ambientGain?.dispose();
    this.#masterGain?.dispose();
    
    this.#sourcePitchMap.clear();
  }
}

export default MetricSon;
