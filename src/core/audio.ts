/**
 * All sound is synthesized at runtime — no audio files, so the game loads
 * instantly and the whole build stays tiny. The AudioContext is created lazily
 * on first user gesture, which is what mobile browsers require anyway.
 */

type SfxName =
  | 'select'
  | 'start'
  | 'jump'
  | 'land'
  | 'crash'
  | 'coin'
  | 'ramp'
  | 'finish'
  | 'fail'

export class Audio {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private musicGain: GainNode | null = null
  private windGain: GainNode | null = null
  private windFilter: BiquadFilterNode | null = null
  private musicTimer: number | null = null
  private musicStep = 0
  private musicKey = 0

  muted = false

  /** Safe to call repeatedly; only the first call inside a gesture matters. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume()
      return
    }
    const Ctor = window.AudioContext ?? (window as any).webkitAudioContext
    if (!Ctor) return
    const ctx: AudioContext = new Ctor()
    this.ctx = ctx

    const master = ctx.createGain()
    master.gain.value = this.muted ? 0 : 0.9
    master.connect(ctx.destination)
    this.master = master

    const music = ctx.createGain()
    music.gain.value = 0
    music.connect(master)
    this.musicGain = music

    // Wind / water rush: filtered white noise whose cutoff tracks speed.
    const noise = ctx.createBufferSource()
    const len = ctx.sampleRate * 2
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
    noise.buffer = buf
    noise.loop = true

    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 300
    filter.Q.value = 0.6

    const gain = ctx.createGain()
    gain.gain.value = 0
    noise.connect(filter).connect(gain).connect(master)
    noise.start()
    this.windFilter = filter
    this.windGain = gain
  }

  setMuted(muted: boolean): void {
    this.muted = muted
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.9, this.ctx.currentTime, 0.05)
    }
  }

  /** speed01: 0..1 normalized velocity. Drives the wind bed. */
  setSpeed(speed01: number, active: boolean): void {
    if (!this.ctx || !this.windGain || !this.windFilter) return
    const t = this.ctx.currentTime
    const target = active ? 0.02 + speed01 * 0.11 : 0
    this.windGain.gain.setTargetAtTime(target, t, 0.25)
    this.windFilter.frequency.setTargetAtTime(240 + speed01 * 1500, t, 0.25)
  }

  private env(
    node: AudioNode,
    peak: number,
    attack: number,
    decay: number,
    when: number,
  ): GainNode {
    const ctx = this.ctx!
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, when)
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), when + attack)
    g.gain.exponentialRampToValueAtTime(0.0001, when + attack + decay)
    node.connect(g)
    g.connect(this.master!)
    return g
  }

  private tone(
    freq: number,
    type: OscillatorType,
    peak: number,
    attack: number,
    decay: number,
    delay = 0,
    freqTo?: number,
  ): void {
    if (!this.ctx || !this.master) return
    const ctx = this.ctx
    const when = ctx.currentTime + delay
    const osc = ctx.createOscillator()
    osc.type = type
    osc.frequency.setValueAtTime(freq, when)
    if (freqTo !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(freqTo, 1),
        when + attack + decay,
      )
    }
    this.env(osc, peak, attack, decay, when)
    osc.start(when)
    osc.stop(when + attack + decay + 0.05)
  }

  private noiseBurst(peak: number, decay: number, cutoff: number, delay = 0): void {
    if (!this.ctx || !this.master) return
    const ctx = this.ctx
    const when = ctx.currentTime + delay
    const dur = decay + 0.05
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
    const src = ctx.createBufferSource()
    src.buffer = buf
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(cutoff, when)
    filter.frequency.exponentialRampToValueAtTime(Math.max(cutoff * 0.25, 80), when + dur)
    src.connect(filter)
    this.env(filter, peak, 0.005, decay, when)
    src.start(when)
    src.stop(when + dur)
  }

  play(name: SfxName): void {
    if (!this.ctx || this.muted) return
    switch (name) {
      case 'select':
        this.tone(660, 'square', 0.1, 0.005, 0.07)
        break
      case 'start':
        this.tone(523.25, 'triangle', 0.16, 0.01, 0.12)
        this.tone(659.25, 'triangle', 0.16, 0.01, 0.12, 0.1)
        this.tone(1046.5, 'triangle', 0.18, 0.01, 0.3, 0.2)
        break
      case 'jump':
        this.tone(320, 'sine', 0.2, 0.008, 0.18, 0, 780)
        break
      case 'land':
        this.noiseBurst(0.22, 0.12, 900)
        this.tone(120, 'sine', 0.16, 0.005, 0.12, 0, 70)
        break
      case 'ramp':
        this.tone(200, 'sawtooth', 0.1, 0.01, 0.14, 0, 520)
        break
      case 'crash':
        this.noiseBurst(0.35, 0.35, 2400)
        this.tone(160, 'square', 0.18, 0.005, 0.3, 0, 60)
        break
      case 'coin':
        this.tone(880, 'square', 0.1, 0.004, 0.06)
        this.tone(1318.5, 'square', 0.1, 0.004, 0.12, 0.055)
        break
      case 'finish':
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
          this.tone(f, 'triangle', 0.18, 0.01, 0.35, i * 0.11)
        })
        break
      case 'fail':
        [392, 349.23, 293.66].forEach((f, i) => {
          this.tone(f, 'sawtooth', 0.14, 0.01, 0.3, i * 0.14)
        })
        break
    }
  }

  /** A simple arpeggiated bed. `key` shifts the scale per level. */
  startMusic(key: number): void {
    if (!this.ctx || !this.musicGain) return
    this.musicKey = key
    this.musicStep = 0
    this.musicGain.gain.setTargetAtTime(0.5, this.ctx.currentTime, 0.6)
    if (this.musicTimer !== null) return
    this.musicTimer = window.setInterval(() => this.tickMusic(), 250)
  }

  stopMusic(): void {
    if (this.musicTimer !== null) {
      clearInterval(this.musicTimer)
      this.musicTimer = null
    }
    if (this.musicGain && this.ctx) {
      this.musicGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3)
    }
  }

  private tickMusic(): void {
    if (!this.ctx || !this.musicGain || this.muted) return
    const ctx = this.ctx
    const root = 110 * Math.pow(2, this.musicKey / 12)
    const scale = [0, 3, 5, 7, 10]
    const step = this.musicStep++
    const bar = Math.floor(step / 8) % 4
    const bass = [0, -2, 3, -4][bar]

    const when = ctx.currentTime + 0.01
    const play = (freq: number, type: OscillatorType, peak: number, dur: number): void => {
      const osc = ctx.createOscillator()
      osc.type = type
      osc.frequency.setValueAtTime(freq, when)
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.0001, when)
      g.gain.exponentialRampToValueAtTime(peak, when + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, when + dur)
      osc.connect(g).connect(this.musicGain!)
      osc.start(when)
      osc.stop(when + dur + 0.05)
    }

    if (step % 4 === 0) {
      play(root * Math.pow(2, bass / 12) * 0.5, 'triangle', 0.18, 0.7)
    }
    const note = scale[(step * 2 + bar) % scale.length]
    play(root * Math.pow(2, (note + bass + 12) / 12), 'square', 0.05, 0.2)
    if (step % 8 === 4) {
      play(root * Math.pow(2, (note + bass + 24) / 12), 'sine', 0.045, 0.35)
    }
  }
}

export const audio = new Audio()
