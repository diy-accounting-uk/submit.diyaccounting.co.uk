/**
 * MetricSon - Standalone Browser Bundle
 * 
 * A Parameter-Mapping Sonification Widget for Cloud Metrics
 * Based on The Sonification Handbook (Hermann, Hunt & Neuhoff, 2011)
 * 
 * Usage:
 *   <script src="https://unpkg.com/tone@14"></script>
 *   <script src="metric-son.browser.js"></script>
 *   <script>
 *     const son = new MetricSon.Widget();
 *     await son.init();
 *     // ... connect to your data source
 *   </script>
 * 
 * @license SEE LICENSE IN LICENSE
 * @see https://sonification.de/handbook/
 */

(function(global) {
  'use strict';

  // ============================================================================
  // Musical Constants
  // ============================================================================

  const SCALES = {
    pentatonic: [0, 2, 4, 7, 9],
    major: [0, 2, 4, 5, 7, 9, 11],
    minor: [0, 2, 3, 5, 7, 8, 10],
    chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    'whole-tone': [0, 2, 4, 6, 8, 10]
  };

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

  function hashString(str) {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
    }
    return Math.abs(hash);
  }

  function midiToFreq(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  function noteToMidi(note) {
    const noteMap = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
    const match = note.match(/^([A-G])([#b]?)(\d+)$/);
    if (!match) return 60;
    
    let [, letter, accidental, octave] = match;
    let midi = noteMap[letter] + (parseInt(octave) + 1) * 12;
    if (accidental === '#') midi++;
    if (accidental === 'b') midi--;
    return midi;
  }

  // ============================================================================
  // Widget Class
  // ============================================================================

  class Widget {
    constructor() {
      this._config = {
        masterVolume: 0.5,
        baseNote: 'C4',
        scale: 'pentatonic',
        maxVoices: 16,
        instruments: {}
      };
      
      this._state = 'stopped';
      this._sourcePitchMap = new Map();
      this._synthPool = new Map();
      this._scaleNotes = [];
      this._baseMidi = 60;
      this._activeVoices = 0;
      
      this.onStateChange = null;
    }

    async init(config = {}) {
      // Check for Tone.js
      if (typeof Tone === 'undefined') {
        throw new Error('Tone.js is required. Include it before metric-son.browser.js');
      }

      this._config = { ...this._config, ...config };
      
      // Build scale
      this._baseMidi = noteToMidi(this._config.baseNote);
      const scaleIntervals = SCALES[this._config.scale] || SCALES.pentatonic;
      
      this._scaleNotes = [];
      for (let octave = -1; octave <= 1; octave++) {
        for (const interval of scaleIntervals) {
          this._scaleNotes.push(this._baseMidi + interval + (octave * 12));
        }
      }
      
      // Create audio graph
      this._masterGain = new Tone.Gain(this._config.masterVolume);
      this._masterGain.toDestination();
      
      this._reverb = new Tone.Reverb({ decay: 2, wet: 0 });
      await this._reverb.generate();
      this._reverb.connect(this._masterGain);
      
      // Ambient layer
      this._ambientNoise = new Tone.Noise('pink');
      this._ambientFilter = new Tone.Filter({
        frequency: 800,
        type: 'lowpass',
        rolloff: -24
      });
      this._ambientGain = new Tone.Gain(0);
      
      this._ambientNoise.connect(this._ambientFilter);
      this._ambientFilter.connect(this._ambientGain);
      this._ambientGain.connect(this._masterGain);
      
      this._initSynthPools();
      this._setState('stopped');
    }

    _initSynthPools() {
      const instruments = { ...DEFAULT_INSTRUMENTS, ...this._config.instruments };
      
      for (const [type, config] of Object.entries(instruments)) {
        const SynthClass = Tone[config.synth] || Tone.Synth;
        const synth = new SynthClass(config.options);
        synth.connect(this._reverb);
        this._synthPool.set(type, synth);
      }
    }

    async start() {
      if (this._state === 'running') return;
      
      await Tone.start();
      this._ambientNoise.start();
      this._setState('running');
    }

    stop() {
      if (this._state === 'stopped') return;
      
      this._ambientNoise.stop();
      
      for (const synth of this._synthPool.values()) {
        synth.triggerRelease();
      }
      
      this._setState('stopped');
    }

    emit(event) {
      if (this._state !== 'running') return;
      
      const {
        source,
        type,
        value,
        duration = 100,
        severity = 'info',
        serviceType = 'custom'
      } = event;
      
      const pitch = this._getPitchForSource(source);
      const noteDuration = Math.min(2, Math.max(0.05, Math.log10(duration + 1) / 3));
      
      const velocityMap = { info: 0.4, warn: 0.6, error: 0.8, critical: 1.0 };
      const velocity = velocityMap[severity] || 0.5;
      
      const synthKey = type === 'error' ? 'error' : serviceType;
      const synth = this._synthPool.get(synthKey) || this._synthPool.get('custom');
      
      if (value !== undefined && type === 'latency') {
        const normalizedLatency = Math.min(1, value / 5000);
        this._reverb.wet.rampTo(normalizedLatency * 0.7, 0.1);
      }
      
      const now = Tone.now();
      
      if (type === 'error') {
        const detunedPitch = pitch * (1 + (Math.random() - 0.5) * 0.05);
        synth.triggerAttackRelease(detunedPitch, noteDuration, now, velocity);
        
        const dissonantPitch = pitch * Math.pow(2, 1/12);
        setTimeout(() => {
          synth.triggerAttackRelease(dissonantPitch, noteDuration * 0.5, Tone.now(), velocity * 0.6);
        }, 20);
      } else {
        synth.triggerAttackRelease(pitch, noteDuration, now, velocity);
      }
      
      this._activeVoices++;
      setTimeout(() => this._activeVoices--, noteDuration * 1000 + 500);
    }

    setAmbientLevel(level) {
      if (this._state !== 'running') return;
      
      const clampedLevel = Math.max(0, Math.min(1, level));
      this._ambientGain.gain.rampTo(clampedLevel * 0.08, 0.5);
      this._ambientFilter.frequency.rampTo(400 + clampedLevel * 1200, 0.5);
    }

    _getPitchForSource(source) {
      if (!this._sourcePitchMap.has(source)) {
        const hash = hashString(source);
        const pitchIndex = hash % this._scaleNotes.length;
        this._sourcePitchMap.set(source, pitchIndex);
      }
      
      const pitchIndex = this._sourcePitchMap.get(source);
      const midiNote = this._scaleNotes[pitchIndex];
      return midiToFreq(midiNote);
    }

    _setState(newState) {
      this._state = newState;
      if (this.onStateChange) {
        this.onStateChange(newState);
      }
    }

    get state() {
      return this._state;
    }

    get activeVoices() {
      return this._activeVoices;
    }

    setVolume(volume) {
      this._masterGain.gain.rampTo(Math.max(0, Math.min(1, volume)), 0.1);
    }

    dispose() {
      this.stop();
      
      for (const synth of this._synthPool.values()) {
        synth.dispose();
      }
      this._synthPool.clear();
      
      this._reverb?.dispose();
      this._ambientNoise?.dispose();
      this._ambientFilter?.dispose();
      this._ambientGain?.dispose();
      this._masterGain?.dispose();
      
      this._sourcePitchMap.clear();
    }
  }

  // ============================================================================
  // Export
  // ============================================================================

  global.MetricSon = {
    Widget: Widget,
    SCALES: SCALES,
    version: '1.0.0'
  };

})(typeof window !== 'undefined' ? window : this);
