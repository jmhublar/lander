import type { GameRuntime } from './entities';

type VoiceNode = OscillatorNode | AudioBufferSourceNode;

type MarchMidiNote = {
  startMs: number;
  durationMs: number;
  frequency: number;
  velocity: number;
  wave: OscillatorType;
};

type MarchMidiData = {
  notes: MarchMidiNote[];
  loopDurationMs: number;
};

export class AudioSystem {
  private audioCtx: AudioContext | null = null;

  private thrustNode: AudioBufferSourceNode | null = null;

  private thrustGain: GainNode | null = null;

  private thrustFilter: BiquadFilterNode | null = null;

  private audioStarted = false;

  private marchPlaying = false;

  private marchTimeout: number | null = null;

  private marchOscillators: VoiceNode[] = [];

  private marchGainNode: GainNode | null = null;

  private marchMidiPromise: Promise<MarchMidiData | null> | null = null;

  private marchPlaybackToken = 0;

  private deathMarchPlaying = false;

  private deathMarchTimeout: number | null = null;

  private deathMarchOscillators: VoiceNode[] = [];

  private deathMarchGainNode: GainNode | null = null;

  initAudio(): void {
    if (this.audioStarted) {
      return;
    }
    const Ctor = (
      window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext }
    ).AudioContext || (
      window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext }
    ).webkitAudioContext;
    if (!Ctor) {
      return;
    }
    this.audioCtx = new Ctor();
    this.audioStarted = true;

    const bufferSize = 2 * this.audioCtx.sampleRate;
    const noiseBuffer = this.audioCtx.createBuffer(1, bufferSize, this.audioCtx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i += 1) {
      output[i] = Math.random() * 2 - 1;
    }

    this.thrustNode = this.audioCtx.createBufferSource();
    this.thrustNode.buffer = noiseBuffer;
    this.thrustNode.loop = true;

    this.thrustFilter = this.audioCtx.createBiquadFilter();
    this.thrustFilter.type = 'lowpass';
    this.thrustFilter.frequency.value = 150;
    this.thrustFilter.Q.value = 1;

    const midFilter = this.audioCtx.createBiquadFilter();
    midFilter.type = 'bandpass';
    midFilter.frequency.value = 80;
    midFilter.Q.value = 0.5;

    this.thrustGain = this.audioCtx.createGain();
    this.thrustGain.gain.value = 0;

    this.thrustNode.connect(this.thrustFilter);
    this.thrustFilter.connect(this.thrustGain);

    const thrustNode2 = this.audioCtx.createBufferSource();
    thrustNode2.buffer = noiseBuffer;
    thrustNode2.loop = true;
    const midGain = this.audioCtx.createGain();
    midGain.gain.value = 0.3;
    thrustNode2.connect(midFilter);
    midFilter.connect(midGain);
    midGain.connect(this.thrustGain);
    thrustNode2.start();

    this.thrustGain.connect(this.audioCtx.destination);
    this.thrustNode.start();
  }

  isAudioStarted(): boolean {
    return this.audioStarted;
  }

  isMarchPlaying(): boolean {
    return this.marchPlaying;
  }

  isDeathMarchPlaying(): boolean {
    return this.deathMarchPlaying;
  }

  updateThrustSound(isThrusting: boolean): void {
    if (!this.thrustGain) {
      return;
    }
    const target = isThrusting ? 0.35 : 0;
    this.thrustGain.gain.value += (target - this.thrustGain.gain.value) * 0.1;
    if (isThrusting && this.thrustFilter) {
      this.thrustFilter.frequency.value = 120 + Math.random() * 60;
    }
  }

  playExplosionSound(): void {
    if (!this.audioCtx) {
      return;
    }
    const bufLen = this.audioCtx.sampleRate * 0.8;
    const buf = this.audioCtx.createBuffer(1, bufLen, this.audioCtx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufLen);
    }
    const src = this.audioCtx.createBufferSource();
    src.buffer = buf;
    const filt = this.audioCtx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = 400;
    filt.frequency.linearRampToValueAtTime(50, this.audioCtx.currentTime + 0.8);
    const gain = this.audioCtx.createGain();
    gain.gain.value = 0.6;
    gain.gain.linearRampToValueAtTime(0, this.audioCtx.currentTime + 0.8);
    src.connect(filt);
    filt.connect(gain);
    gain.connect(this.audioCtx.destination);
    src.start();
  }

  playLandingSound(): void {
    if (!this.audioCtx) {
      return;
    }
    const osc = this.audioCtx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 200;
    osc.frequency.linearRampToValueAtTime(600, this.audioCtx.currentTime + 0.3);
    const gain = this.audioCtx.createGain();
    gain.gain.value = 0.3;
    gain.gain.linearRampToValueAtTime(0, this.audioCtx.currentTime + 0.5);
    osc.connect(gain);
    gain.connect(this.audioCtx.destination);
    osc.start();
    osc.stop(this.audioCtx.currentTime + 0.5);

    const osc2 = this.audioCtx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.value = 60;
    const gain2 = this.audioCtx.createGain();
    gain2.gain.value = 0.4;
    gain2.gain.linearRampToValueAtTime(0, this.audioCtx.currentTime + 0.2);
    osc2.connect(gain2);
    gain2.connect(this.audioCtx.destination);
    osc2.start();
    osc2.stop(this.audioCtx.currentTime + 0.2);
  }

  playMarchTheme(): void {
    if (!this.audioCtx || this.marchPlaying) {
      return;
    }
    this.stopDeathMarchTheme();
    this.marchPlaying = true;
    this.marchPlaybackToken += 1;
    const playbackToken = this.marchPlaybackToken;

    this.marchGainNode = this.audioCtx.createGain();
    this.marchGainNode.gain.value = 0.35;
    this.marchGainNode.connect(this.audioCtx.destination);

    void this.startMarchPlayback(playbackToken);
  }

  private async startMarchPlayback(playbackToken: number): Promise<void> {
    const midiData = await this.getMarchMidiData();
    if (!this.audioCtx || !this.marchPlaying || !this.marchGainNode || this.marchPlaybackToken !== playbackToken) {
      return;
    }
    if (midiData && midiData.notes.length > 0) {
      this.scheduleMidiMarchLoop(midiData, playbackToken);
      return;
    }
    this.scheduleSyntheticMarchLoop(playbackToken);
  }

  private getMarchMidiData(): Promise<MarchMidiData | null> {
    if (!this.marchMidiPromise) {
      this.marchMidiPromise = this.loadMarchMidiData();
    }
    return this.marchMidiPromise;
  }

  private async loadMarchMidiData(): Promise<MarchMidiData | null> {
    try {
      const response = await fetch('/bluedanub.mid');
      if (!response.ok) {
        return null;
      }
      const arrayBuffer = await response.arrayBuffer();
      return this.parseMarchMidiData(arrayBuffer);
    } catch {
      return null;
    }
  }

  private parseMarchMidiData(arrayBuffer: ArrayBuffer): MarchMidiData | null {
    const bytes = new Uint8Array(arrayBuffer);
    if (bytes.length < 14) {
      return null;
    }
    let offset = 0;
    const readString = (length: number): string | null => {
      if (offset + length > bytes.length) {
        return null;
      }
      const value = String.fromCharCode(...bytes.subarray(offset, offset + length));
      offset += length;
      return value;
    };
    const readU16 = (): number | null => {
      if (offset + 2 > bytes.length) {
        return null;
      }
      const value = (bytes[offset] << 8) | bytes[offset + 1];
      offset += 2;
      return value;
    };
    const readU32 = (): number | null => {
      if (offset + 4 > bytes.length) {
        return null;
      }
      const value =
        (bytes[offset] << 24) |
        (bytes[offset + 1] << 16) |
        (bytes[offset + 2] << 8) |
        bytes[offset + 3];
      offset += 4;
      return value >>> 0;
    };
    const readVarLenAt = (startOffset: number): { value: number; nextOffset: number } | null => {
      let value = 0;
      let nextOffset = startOffset;
      for (let i = 0; i < 4; i += 1) {
        if (nextOffset >= bytes.length) {
          return null;
        }
        const byte = bytes[nextOffset];
        nextOffset += 1;
        value = (value << 7) | (byte & 0x7f);
        if ((byte & 0x80) === 0) {
          return { value, nextOffset };
        }
      }
      return null;
    };

    if (readString(4) !== 'MThd') {
      return null;
    }
    const headerLength = readU32();
    if (headerLength === null || headerLength < 6) {
      return null;
    }
    const format = readU16();
    const trackCount = readU16();
    const division = readU16();
    if (format === null || trackCount === null || division === null || division <= 0 || (division & 0x8000) !== 0) {
      return null;
    }
    const headerRemainder = headerLength - 6;
    if (offset + headerRemainder > bytes.length) {
      return null;
    }
    offset += headerRemainder;

    type RawNote = { startTick: number; endTick: number; pitch: number; velocity: number; trackIndex: number };
    type TempoChange = { tick: number; microsPerQuarter: number };
    const rawNotes: RawNote[] = [];
    const tempoChanges: TempoChange[] = [{ tick: 0, microsPerQuarter: 500000 }];

    for (let trackIndex = 0; trackIndex < trackCount; trackIndex += 1) {
      if (readString(4) !== 'MTrk') {
        return null;
      }
      const trackLength = readU32();
      if (trackLength === null || offset + trackLength > bytes.length) {
        return null;
      }
      const trackEnd = offset + trackLength;
      let tick = 0;
      let runningStatus = 0;
      const activeNotes = new Map<string, { startTick: number; velocity: number; pitch: number }>();

      while (offset < trackEnd) {
        const varLen = readVarLenAt(offset);
        if (!varLen) {
          return null;
        }
        tick += varLen.value;
        offset = varLen.nextOffset;
        if (offset >= trackEnd) {
          break;
        }

        let status = bytes[offset];
        if (status < 0x80) {
          if (runningStatus === 0) {
            return null;
          }
          status = runningStatus;
        } else {
          offset += 1;
          if (status < 0xf0) {
            runningStatus = status;
          }
        }

        if (status === 0xff) {
          if (offset + 1 > trackEnd) {
            return null;
          }
          const metaType = bytes[offset];
          offset += 1;
          const metaLenVar = readVarLenAt(offset);
          if (!metaLenVar) {
            return null;
          }
          offset = metaLenVar.nextOffset;
          const metaLen = metaLenVar.value;
          if (offset + metaLen > trackEnd) {
            return null;
          }
          if (metaType === 0x51 && metaLen === 3) {
            const microsPerQuarter =
              (bytes[offset] << 16) | (bytes[offset + 1] << 8) | bytes[offset + 2];
            tempoChanges.push({ tick, microsPerQuarter });
          }
          offset += metaLen;
          continue;
        }

        if (status === 0xf0 || status === 0xf7) {
          const sysexLenVar = readVarLenAt(offset);
          if (!sysexLenVar) {
            return null;
          }
          offset = sysexLenVar.nextOffset;
          if (offset + sysexLenVar.value > trackEnd) {
            return null;
          }
          offset += sysexLenVar.value;
          continue;
        }

        const command = status & 0xf0;
        const channel = status & 0x0f;
        const dataLength = command === 0xc0 || command === 0xd0 ? 1 : 2;
        if (offset + dataLength > trackEnd) {
          return null;
        }
        const data1 = bytes[offset];
        const data2 = dataLength === 2 ? bytes[offset + 1] : 0;
        offset += dataLength;

        if (command === 0x90 || command === 0x80) {
          const key = `${channel}:${data1}`;
          const velocity = command === 0x90 ? data2 : 0;
          if (velocity > 0) {
            activeNotes.set(key, { startTick: tick, velocity, pitch: data1 });
          } else {
            const activeNote = activeNotes.get(key);
            if (activeNote && tick > activeNote.startTick) {
              rawNotes.push({
                startTick: activeNote.startTick,
                endTick: tick,
                pitch: activeNote.pitch,
                velocity: activeNote.velocity / 127,
                trackIndex,
              });
            }
            activeNotes.delete(key);
          }
        }
      }
      offset = trackEnd;
    }

    if (rawNotes.length === 0) {
      return null;
    }

    tempoChanges.sort((a, b) => a.tick - b.tick);
    const normalizedTempoChanges: TempoChange[] = [];
    for (const tempoChange of tempoChanges) {
      const lastTempo = normalizedTempoChanges[normalizedTempoChanges.length - 1];
      if (lastTempo && lastTempo.tick === tempoChange.tick) {
        lastTempo.microsPerQuarter = tempoChange.microsPerQuarter;
        continue;
      }
      normalizedTempoChanges.push({ ...tempoChange });
    }

    const sortedNotes = [...rawNotes].sort((a, b) => a.startTick - b.startTick || a.pitch - b.pitch);
    const waveTypes: OscillatorType[] = ['square', 'triangle', 'sawtooth', 'square'];

    const tickToSeconds = (targetTick: number): number => {
      let seconds = 0;
      for (let i = 0; i < normalizedTempoChanges.length; i += 1) {
        const current = normalizedTempoChanges[i];
        const next = normalizedTempoChanges[i + 1];
        const segmentEnd = next ? Math.min(next.tick, targetTick) : targetTick;
        if (segmentEnd <= current.tick) {
          continue;
        }
        const ticksInSegment = segmentEnd - current.tick;
        seconds += (ticksInSegment * current.microsPerQuarter) / division / 1_000_000;
        if (next && targetTick <= next.tick) {
          break;
        }
        if (!next) {
          break;
        }
      }
      return seconds;
    };

    const notes: MarchMidiNote[] = sortedNotes.map((note) => {
      const startSeconds = tickToSeconds(note.startTick);
      const endSeconds = tickToSeconds(note.endTick);
      const frequency = 440 * Math.pow(2, (note.pitch - 69) / 12);
      const wave = waveTypes[note.trackIndex % waveTypes.length] ?? 'square';
      return {
        startMs: startSeconds * 1000,
        durationMs: Math.max(35, (endSeconds - startSeconds) * 1000),
        frequency,
        velocity: Math.min(1, Math.max(0.18, note.velocity)),
        wave,
      };
    });

    const maxEndMs = notes.reduce((max, note) => Math.max(max, note.startMs + note.durationMs), 0);
    if (maxEndMs <= 0) {
      return null;
    }
    return {
      notes,
      loopDurationMs: maxEndMs,
    };
  }

  private scheduleMidiMarchLoop(midiData: MarchMidiData, playbackToken: number): void {
    const scheduleLoop = () => {
      if (
        !this.audioCtx ||
        !this.marchPlaying ||
        !this.marchGainNode ||
        this.marchPlaybackToken !== playbackToken
      ) {
        return;
      }

      const now = this.audioCtx.currentTime;
      midiData.notes.forEach((note) => {
        if (!this.audioCtx || !this.marchGainNode) {
          return;
        }
        const start = now + note.startMs / 1000;
        const end = start + note.durationMs / 1000;
        const peak = Math.min(0.34, 0.32 * note.velocity);
        const sustain = peak * 0.86;

        const osc = this.audioCtx.createOscillator();
        osc.type = note.wave;
        osc.frequency.value = note.frequency;
        const g = this.audioCtx.createGain();
        g.gain.setValueAtTime(0, start);
        g.gain.linearRampToValueAtTime(peak, start + 0.01);
        g.gain.setValueAtTime(sustain, Math.max(start + 0.015, end - 0.05));
        g.gain.linearRampToValueAtTime(0, end);
        osc.connect(g);
        g.connect(this.marchGainNode);
        osc.start(start);
        osc.stop(end + 0.05);
        this.marchOscillators.push(osc);
      });

      this.marchTimeout = window.setTimeout(scheduleLoop, Math.max(200, midiData.loopDurationMs - 50));
    };

    scheduleLoop();
  }

  private scheduleSyntheticMarchLoop(playbackToken: number): void {

    const BPM = 140;
    const q = 60000 / BPM;
    const e = q / 2;
    const h = q * 2;

    const c4 = 261.63;
    const d4 = 293.66;
    const e4 = 329.63;
    const f4 = 349.23;
    const g4 = 392;
    const a4 = 440;
    const b4 = 493.88;
    const c5 = 523.25;
    const c3 = 130.81;
    const g3 = 196;
    const f3 = 174.61;
    const e3 = 164.81;
    const a3 = 220;

    const melody: Array<[number, number, number]> = [
      [c4, e, 0], [c4, e, e], [g4, q, e * 2], [g4, e, e * 2 + q], [a4, e, e * 3 + q],
      [g4, q, e * 4 + q], [e4, q, e * 4 + q + q], [c4, e, e * 4 + q + q + q],
      [c4, e, e * 5 + q + q + q], [g4, q, e * 6 + q + q + q],
      [g4, e, e * 6 + q * 2 + q], [a4, e, e * 7 + q * 2 + q], [g4, h, e * 8 + q * 2 + q],
      [e4, e, e * 8 + q * 2 + q + h], [f4, e, e * 9 + q * 2 + q + h],
      [g4, e, e * 10 + q * 2 + q + h], [a4, q, e * 11 + q * 2 + q + h],
      [g4, e, e * 11 + q * 3 + q + h], [e4, e, e * 12 + q * 3 + q + h],
      [c5, q + e, e * 13 + q * 3 + q + h], [b4, e, e * 13 + q * 4 + q + e + h],
      [a4, e, e * 14 + q * 4 + q + e + h], [g4, h, e * 15 + q * 4 + q + e + h],
      [e4, e, e * 15 + q * 4 + q + e + h + h], [d4, e, e * 16 + q * 4 + q + e + h + h],
      [c4, h + q, e * 17 + q * 4 + q + e + h + h],
    ];

    const bassLine: Array<[number, number, number]> = [
      [c3, q, 0], [g3, q, q], [c3, q, q * 2], [g3, q, q * 3], [c3, q, q * 4],
      [g3, q, q * 5], [c3, q, q * 6], [g3, q, q * 7], [a3, q, q * 8], [e3, q, q * 9],
      [f3, q, q * 10], [g3, q, q * 11], [c3, q, q * 12], [g3, q, q * 13], [c3, h, q * 14],
    ];

    const snareHits: number[] = [];
    for (let i = 0; i < 16; i += 1) {
      if (i % 2 === 1) {
        snareHits.push(i * q);
      }
    }
    const loopDuration = q * 16;

    const scheduleLoop = () => {
      if (!this.audioCtx || !this.marchPlaying || !this.marchGainNode || this.marchPlaybackToken !== playbackToken) {
        return;
      }
      const now = this.audioCtx.currentTime;

      melody.forEach(([freq, dur, start]) => {
        if (!this.audioCtx || !this.marchGainNode) {
          return;
        }
        const osc = this.audioCtx.createOscillator();
        osc.type = 'square';
        osc.frequency.value = freq;
        const g = this.audioCtx.createGain();
        g.gain.setValueAtTime(0, now + start / 1000);
        g.gain.linearRampToValueAtTime(0.18, now + start / 1000 + 0.01);
        g.gain.setValueAtTime(0.18, now + (start + dur * 0.7) / 1000);
        g.gain.linearRampToValueAtTime(0, now + (start + dur) / 1000);
        osc.connect(g);
        g.connect(this.marchGainNode);
        osc.start(now + start / 1000);
        osc.stop(now + (start + dur + 10) / 1000);
        this.marchOscillators.push(osc);
      });

      bassLine.forEach(([freq, dur, start]) => {
        if (!this.audioCtx || !this.marchGainNode) {
          return;
        }
        const osc = this.audioCtx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        const g = this.audioCtx.createGain();
        g.gain.setValueAtTime(0, now + start / 1000);
        g.gain.linearRampToValueAtTime(0.24, now + start / 1000 + 0.01);
        g.gain.setValueAtTime(0.24, now + (start + dur * 0.6) / 1000);
        g.gain.linearRampToValueAtTime(0, now + (start + dur) / 1000);
        osc.connect(g);
        g.connect(this.marchGainNode);
        osc.start(now + start / 1000);
        osc.stop(now + (start + dur + 10) / 1000);
        this.marchOscillators.push(osc);
      });

      snareHits.forEach((start) => {
        if (!this.audioCtx || !this.marchGainNode) {
          return;
        }
        const bufLen = Math.floor(this.audioCtx.sampleRate * 0.05);
        const buf = this.audioCtx.createBuffer(1, bufLen, this.audioCtx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < bufLen; i += 1) {
          data[i] = (Math.random() * 2 - 1) * (1 - i / bufLen);
        }
        const src = this.audioCtx.createBufferSource();
        src.buffer = buf;
        const hp = this.audioCtx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 2000;
        const g = this.audioCtx.createGain();
        g.gain.value = 0.14;
        src.connect(hp);
        hp.connect(g);
        g.connect(this.marchGainNode);
        src.start(now + start / 1000);
        this.marchOscillators.push(src);
      });

      this.marchTimeout = window.setTimeout(scheduleLoop, loopDuration - 50);
    };

    scheduleLoop();
  }

  stopMarchTheme(): void {
    this.marchPlaying = false;
    this.marchPlaybackToken += 1;
    if (this.marchTimeout !== null) {
      window.clearTimeout(this.marchTimeout);
      this.marchTimeout = null;
    }
    if (this.marchGainNode && this.audioCtx) {
      const now = this.audioCtx.currentTime;
      this.marchGainNode.gain.cancelScheduledValues(now);
      this.marchGainNode.gain.setValueAtTime(this.marchGainNode.gain.value, now);
      this.marchGainNode.gain.linearRampToValueAtTime(0, now + 0.3);
      const captured = this.marchOscillators.splice(0);
      window.setTimeout(() => {
        captured.forEach((osc) => {
          try {
            osc.stop();
          } catch {
          }
        });
      }, 400);
      this.marchGainNode = null;
    }
  }

  playDeathMarchTheme(): void {
    if (!this.audioCtx) {
      return;
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
    if (this.deathMarchPlaying) {
      return;
    }
    this.stopMarchTheme();
    this.deathMarchPlaying = true;

    this.deathMarchGainNode = this.audioCtx.createGain();
    this.deathMarchGainNode.gain.value = 0.45;
    this.deathMarchGainNode.connect(this.audioCtx.destination);

    const soprano: Array<[number, number, number]> = [
      [0, 984, 67], [1024, 492, 68], [1536, 492, 68], [2048, 1400, 67], [4096, 984, 67],
      [5120, 492, 72], [5632, 492, 72], [6144, 1350, 71], [8192, 984, 74], [9216, 492, 72],
      [9728, 492, 69], [10240, 1380, 70], [12288, 984, 70], [13312, 492, 68],
      [13824, 492, 65], [14336, 1390, 67], [16384, 984, 72], [17408, 492, 72],
      [17920, 492, 71], [18432, 1450, 72],
    ];
    const alto: Array<[number, number, number]> = [
      [0, 984, 64], [1024, 492, 65], [1536, 492, 65], [2048, 1400, 64], [4096, 984, 63],
      [5120, 492, 63], [5632, 492, 65], [6144, 1350, 67], [8192, 984, 70], [9216, 492, 69],
      [9728, 492, 66], [10240, 1380, 67], [12288, 984, 67], [13312, 492, 65],
      [13824, 492, 62], [14336, 1390, 63], [16384, 984, 67], [17408, 492, 68],
      [17920, 492, 67], [18432, 1450, 64],
    ];
    const tenor: Array<[number, number, number]> = [
      [0, 984, 60], [1024, 492, 60], [1536, 492, 60], [2048, 1400, 60], [4096, 984, 60],
      [5120, 492, 60], [5632, 492, 60], [6144, 1350, 62], [8192, 984, 67], [9216, 492, 63],
      [9728, 492, 62], [10240, 1380, 62], [12288, 984, 63], [13312, 492, 60],
      [13824, 492, 58], [14336, 1390, 58], [16384, 984, 63], [17408, 492, 62],
      [17920, 492, 62], [18432, 1450, 60],
    ];
    const bass: Array<[number, number, number]> = [
      [0, 984, 48], [1024, 492, 53], [1536, 492, 53], [2048, 1400, 48], [4096, 984, 48],
      [5120, 492, 56], [5632, 492, 56], [6144, 1350, 55], [8192, 984, 55], [9216, 492, 60],
      [9728, 492, 62], [10240, 1380, 55], [12288, 984, 51], [13312, 492, 56],
      [13824, 492, 58], [14336, 1390, 51], [16384, 984, 48], [17408, 492, 53],
      [17920, 492, 55], [18432, 1450, 48],
    ];

    const ticksPerBeat = 256;
    const bpm = 120;
    const msPerTick = 60000 / (bpm * ticksPerBeat);
    const loopTicks = 20480;
    const loopDuration = loopTicks * msPerTick;
    const voices = [
      { notes: soprano, wave: 'square' as OscillatorType, gain: 0.17 },
      { notes: alto, wave: 'square' as OscillatorType, gain: 0.13 },
      { notes: tenor, wave: 'sawtooth' as OscillatorType, gain: 0.11 },
      { notes: bass, wave: 'triangle' as OscillatorType, gain: 0.2 },
    ];

    const midiNoteToFreq = (note: number) => 440 * Math.pow(2, (note - 69) / 12);

    const scheduleLoop = () => {
      if (!this.audioCtx || !this.deathMarchPlaying || !this.deathMarchGainNode) {
        return;
      }
      const now = this.audioCtx.currentTime;
      voices.forEach((voice) => {
        voice.notes.forEach(([startTick, durTick, midiNote]) => {
          if (!this.audioCtx || !this.deathMarchGainNode) {
            return;
          }
          const start = now + (startTick * msPerTick) / 1000;
          const end = now + ((startTick + durTick) * msPerTick) / 1000;
          const osc = this.audioCtx.createOscillator();
          osc.type = voice.wave;
          osc.frequency.value = midiNoteToFreq(midiNote);
          const g = this.audioCtx.createGain();
          g.gain.setValueAtTime(0, start);
          g.gain.linearRampToValueAtTime(voice.gain, start + 0.02);
          g.gain.setValueAtTime(voice.gain, start + (durTick * msPerTick * 0.8) / 1000);
          g.gain.linearRampToValueAtTime(0, end);
          osc.connect(g);
          g.connect(this.deathMarchGainNode);
          osc.start(start);
          osc.stop(end + 0.05);
          this.deathMarchOscillators.push(osc);
        });
      });

      const ticksPerClick = 512;
      for (let i = 0; i < loopTicks / ticksPerClick; i += 1) {
        if (!this.audioCtx || !this.deathMarchGainNode) {
          continue;
        }
        const startTick = i * ticksPerClick;
        const start = now + (startTick * msPerTick) / 1000;
        const osc = this.audioCtx.createOscillator();
        osc.type = 'square';
        osc.frequency.value = i % 2 === 0 ? 1500 : 1050;
        const g = this.audioCtx.createGain();
        g.gain.setValueAtTime(0, start);
        g.gain.linearRampToValueAtTime(0.03, start + 0.004);
        g.gain.linearRampToValueAtTime(0, start + 0.035);
        osc.connect(g);
        g.connect(this.deathMarchGainNode);
        osc.start(start);
        osc.stop(start + 0.05);
        this.deathMarchOscillators.push(osc);
      }
      this.deathMarchTimeout = window.setTimeout(scheduleLoop, loopDuration - 50);
    };

    scheduleLoop();
  }

  stopDeathMarchTheme(): void {
    this.deathMarchPlaying = false;
    if (this.deathMarchTimeout !== null) {
      window.clearTimeout(this.deathMarchTimeout);
      this.deathMarchTimeout = null;
    }
    if (this.deathMarchGainNode && this.audioCtx) {
      const now = this.audioCtx.currentTime;
      this.deathMarchGainNode.gain.cancelScheduledValues(now);
      this.deathMarchGainNode.gain.setValueAtTime(this.deathMarchGainNode.gain.value, now);
      this.deathMarchGainNode.gain.linearRampToValueAtTime(0, now + 0.3);
      const captured = this.deathMarchOscillators.splice(0);
      window.setTimeout(() => {
        captured.forEach((osc) => {
          try {
            osc.stop();
          } catch {
          }
        });
      }, 400);
      this.deathMarchGainNode = null;
    }
  }

  playStartJingle(): void {
    if (!this.audioCtx) {
      return;
    }
    const now = this.audioCtx.currentTime;
    const jingleGain = this.audioCtx.createGain();
    jingleGain.gain.value = 0.2;
    jingleGain.connect(this.audioCtx.destination);

    const notes: Array<{ f: number; t: number; d: number; wave: OscillatorType }> = [
      { f: 262, t: 0, d: 0.06, wave: 'square' },
      { f: 330, t: 0.07, d: 0.06, wave: 'square' },
      { f: 392, t: 0.14, d: 0.06, wave: 'square' },
      { f: 523, t: 0.21, d: 0.06, wave: 'square' },
      { f: 330, t: 0.35, d: 0.06, wave: 'square' },
      { f: 392, t: 0.42, d: 0.06, wave: 'square' },
      { f: 523, t: 0.49, d: 0.06, wave: 'square' },
      { f: 659, t: 0.56, d: 0.06, wave: 'square' },
      { f: 784, t: 0.7, d: 0.2, wave: 'square' },
      { f: 659, t: 0.7, d: 0.2, wave: 'square' },
      { f: 523, t: 0.7, d: 0.2, wave: 'triangle' },
      { f: 1047, t: 0.95, d: 0.35, wave: 'square' },
      { f: 784, t: 0.95, d: 0.35, wave: 'square' },
      { f: 523, t: 0.95, d: 0.35, wave: 'triangle' },
      { f: 262, t: 0.95, d: 0.35, wave: 'triangle' },
    ];

    notes.forEach((note) => {
      if (!this.audioCtx) {
        return;
      }
      const osc = this.audioCtx.createOscillator();
      osc.type = note.wave;
      osc.frequency.value = note.f;
      const g = this.audioCtx.createGain();
      g.gain.setValueAtTime(0, now + note.t);
      g.gain.linearRampToValueAtTime(0.18, now + note.t + 0.01);
      g.gain.setValueAtTime(0.18, now + note.t + note.d * 0.7);
      g.gain.linearRampToValueAtTime(0, now + note.t + note.d);
      osc.connect(g);
      g.connect(jingleGain);
      osc.start(now + note.t);
      osc.stop(now + note.t + note.d + 0.05);
    });

    jingleGain.gain.setValueAtTime(0.2, now + 1.3);
    jingleGain.gain.linearRampToValueAtTime(0, now + 1.4);
  }

  onTitleInteraction(runtime: GameRuntime): void {
    if (runtime.game.status === 'title' && !this.marchPlaying && this.audioStarted) {
      this.stopDeathMarchTheme();
      this.playMarchTheme();
    }
  }

  destroy(): void {
    this.stopMarchTheme();
    this.stopDeathMarchTheme();
    if (this.thrustNode) {
      try {
        this.thrustNode.stop();
      } catch {
        // Ignore
      }
      this.thrustNode.disconnect();
      this.thrustNode = null;
    }
    if (this.thrustGain) {
      this.thrustGain.disconnect();
      this.thrustGain = null;
    }
    if (this.thrustFilter) {
      this.thrustFilter.disconnect();
      this.thrustFilter = null;
    }
    if (this.audioCtx) {
      if (this.audioCtx.state !== 'closed') {
        this.audioCtx.close().catch(() => {});
      }
      this.audioCtx = null;
    }
    this.audioStarted = false;
  }
}
