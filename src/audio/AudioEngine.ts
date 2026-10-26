export const EQ_FREQUENCIES = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

export class AuraAudioEngine {
  private ctx: AudioContext | null = null;
  private audioA: HTMLAudioElement;
  private audioB: HTMLAudioElement;
  private isAActive = true;

  private sourceA: MediaElementAudioSourceNode | null = null;
  private sourceB: MediaElementAudioSourceNode | null = null;
  private gainA!: GainNode;
  private gainB!: GainNode;
  private masterGain!: GainNode;

  // SoundAlive DSP Suite
  private eqFilters: BiquadFilterNode[] = [];
  private compressor!: DynamicsCompressorNode;
  private convolver!: ConvolverNode;
  private reverbDryGain!: GainNode;
  private reverbWetGain!: GainNode;
  private tubeShaper!: WaveShaperNode;
  private tubeDryGain!: GainNode;
  private tubeWetGain!: GainNode;

  // Karaoke Subtraction Graph (L - R)
  private dryMusicGain!: GainNode;
  private karaokeOutGain!: GainNode;
  private karaokeSplitter!: ChannelSplitterNode;
  private karaokeMerger!: ChannelMergerNode;
  private karaokeInverter!: GainNode;

  // Live Stream Destination for WebRTC "Listen Together"
  private streamDestination!: MediaStreamAudioDestinationNode;
  private analyserNode!: AnalyserNode;

  public crossfadeDuration = 3;
  public playbackRate = 1.0;
  public eqGains = new Array(10).fill(0);
  public smartVolumeEnabled = true;
  public concertHallEnabled = false;
  public tubeAmpEnabled = false;
  public karaokeActive = false;

  constructor() {
    this.audioA = new Audio();
    this.audioB = new Audio();
    this.audioA.preservesPitch = true;
    this.audioB.preservesPitch = true;
  }

  public init() {
    if (this.ctx) return;
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    this.ctx = new AudioCtx();

    this.sourceA = this.ctx.createMediaElementSource(this.audioA);
    this.sourceB = this.ctx.createMediaElementSource(this.audioB);

    this.gainA = this.ctx.createGain();
    this.gainB = this.ctx.createGain();
    this.gainB.gain.value = 0;
    this.masterGain = this.ctx.createGain();

    this.sourceA.connect(this.gainA);
    this.sourceB.connect(this.gainB);

    const crossfadeBus = this.ctx.createGain();
    this.gainA.connect(crossfadeBus);
    this.gainB.connect(crossfadeBus);

    // 10-Band Equalizer
    let nodePipeline: AudioNode = crossfadeBus;
    this.eqFilters = EQ_FREQUENCIES.map((freq, i) => {
      const f = this.ctx!.createBiquadFilter();
      if (i === 0) f.type = 'lowshelf';
      else if (i === EQ_FREQUENCIES.length - 1) f.type = 'highshelf';
      else {
        f.type = 'peaking';
        f.Q.value = 1.414;
      }
      f.frequency.value = freq;
      f.gain.value = this.eqGains[i];
      nodePipeline.connect(f);
      nodePipeline = f;
      return f;
    });

    // Smart Volume Dynamic Compressor
    this.compressor = this.ctx.createDynamicsCompressor();
    this.compressor.threshold.setValueAtTime(-24, this.ctx.currentTime);
    this.compressor.knee.setValueAtTime(30, this.ctx.currentTime);
    this.compressor.ratio.setValueAtTime(12, this.ctx.currentTime);
    this.compressor.attack.setValueAtTime(0.003, this.ctx.currentTime);
    this.compressor.release.setValueAtTime(0.25, this.ctx.currentTime);
    nodePipeline.connect(this.compressor);

    // Concert Hall Reverb (Convolver)
    this.convolver = this.ctx.createConvolver();
    this.convolver.buffer = this.buildImpulse(2.8, 2.0);
    this.reverbDryGain = this.ctx.createGain();
    this.reverbWetGain = this.ctx.createGain();
    this.reverbWetGain.gain.value = 0;

    this.compressor.connect(this.reverbDryGain);
    this.compressor.connect(this.convolver);
    this.convolver.connect(this.reverbWetGain);

    const reverbMix = this.ctx.createGain();
    this.reverbDryGain.connect(reverbMix);
    this.reverbWetGain.connect(reverbMix);

    // Tube Amp Pro (Soft Harmonic Saturation)
    this.tubeShaper = this.ctx.createWaveShaper();
    this.tubeShaper.curve = this.buildTubeCurve(25);
    this.tubeShaper.oversample = '4x';
    this.tubeDryGain = this.ctx.createGain();
    this.tubeWetGain = this.ctx.createGain();
    this.tubeWetGain.gain.value = 0;

    reverbMix.connect(this.tubeDryGain);
    reverbMix.connect(this.tubeShaper);
    this.tubeShaper.connect(this.tubeWetGain);

    const tubeMix = this.ctx.createGain();
    this.tubeDryGain.connect(tubeMix);
    this.tubeWetGain.connect(tubeMix);

    // Hardware Karaoke Phase Inverter (L - R)
    this.dryMusicGain = this.ctx.createGain();
    this.karaokeOutGain = this.ctx.createGain();
    this.karaokeOutGain.gain.value = 0;

    this.karaokeSplitter = this.ctx.createChannelSplitter(2);
    this.karaokeMerger = this.ctx.createChannelMerger(2);
    this.karaokeInverter = this.ctx.createGain();
    this.karaokeInverter.gain.value = -1;

    tubeMix.connect(this.dryMusicGain);
    this.dryMusicGain.connect(this.masterGain);

    tubeMix.connect(this.karaokeSplitter);
    this.karaokeSplitter.connect(this.karaokeMerger, 0, 0);
    this.karaokeSplitter.connect(this.karaokeInverter, 1);
    this.karaokeInverter.connect(this.karaokeMerger, 0, 0);
    this.karaokeSplitter.connect(this.karaokeMerger, 1, 1);
    this.karaokeInverter.connect(this.karaokeMerger, 0, 1);

    this.karaokeMerger.connect(this.karaokeOutGain);
    this.karaokeOutGain.connect(this.masterGain);

    // Live Stream Destination & 60fps Visualizer
    this.streamDestination = this.ctx.createMediaStreamDestination();
    this.analyserNode = this.ctx.createAnalyser();
    this.analyserNode.fftSize = 256;
    this.analyserNode.smoothingTimeConstant = 0.85;

    this.masterGain.connect(this.analyserNode);
    this.masterGain.connect(this.streamDestination);
    this.analyserNode.connect(this.ctx.destination);
  }

  private buildImpulse(duration: number, decay: number): AudioBuffer {
    const rate = this.ctx!.sampleRate;
    const length = rate * duration;
    const impulse = this.ctx!.createBuffer(2, length, rate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);
    for (let i = 0; i < length; i++) {
      const mult = Math.pow(1 - i / length, decay);
      left[i] = (Math.random() * 2 - 1) * mult;
      right[i] = (Math.random() * 2 - 1) * mult;
    }
    return impulse;
  }

  private buildTubeCurve(amount: number): Float32Array {
    const n = 44100;
    const curve = new Float32Array(n);
    const deg = Math.PI / 180;
    for (let i = 0; i < n; ++i) {
      const x = (i * 2) / n - 1;
      curve[i] = ((3 + amount) * x * 20 * deg) / (Math.PI + amount * Math.abs(x));
    }
    return curve;
  }

  public getActiveAudio(): HTMLAudioElement {
    return this.isAActive ? this.audioA : this.audioB;
  }

  public getAnalyser(): AnalyserNode | null {
    return this.analyserNode;
  }

  public getLiveMediaStream(): MediaStream {
    this.init();
    return this.streamDestination.stream;
  }

  public async playTrack(url: string, crossfade = true) {
    this.init();
    if (this.ctx?.state === 'suspended') {
      await this.ctx.resume();
    }

    const currentAudio = this.getActiveAudio();
    const nextAudio = this.isAActive ? this.audioB : this.audioA;
    const currentGain = this.isAActive ? this.gainA : this.gainB;
    const nextGain = this.isAActive ? this.gainB : this.gainA;

    if (url.startsWith('blob:')) {
      nextAudio.removeAttribute('crossorigin');
    } else {
      nextAudio.crossOrigin = 'anonymous';
    }

    nextAudio.src = url;
    nextAudio.playbackRate = this.playbackRate;
    await nextAudio.load();

    const fade = crossfade ? this.crossfadeDuration : 0.05;
    const now = this.ctx!.currentTime;

    nextGain.gain.cancelScheduledValues(now);
    currentGain.gain.cancelScheduledValues(now);

    nextGain.gain.setValueAtTime(0.001, now);
    nextGain.gain.exponentialRampToValueAtTime(1.0, now + fade);

    if (!currentAudio.paused && currentAudio.src) {
      currentGain.gain.setValueAtTime(1.0, now);
      currentGain.gain.exponentialRampToValueAtTime(0.001, now + fade);
      setTimeout(() => currentAudio.pause(), fade * 1000);
    }

    await nextAudio.play();
    this.isAActive = !this.isAActive;
  }

  public setEQBand(index: number, db: number) {
    this.eqGains[index] = db;
    if (this.eqFilters[index] && this.ctx) {
      this.eqFilters[index].gain.setTargetAtTime(db, this.ctx.currentTime, 0.05);
    }
  }

  public toggleSmartVolume(active: boolean) {
    this.smartVolumeEnabled = active;
    if (!this.compressor || !this.ctx) return;
    this.compressor.ratio.setTargetAtTime(active ? 12 : 1, this.ctx.currentTime, 0.05);
  }

  public toggleConcertHall(active: boolean) {
    this.concertHallEnabled = active;
    if (!this.ctx) return;
    this.reverbWetGain.gain.setTargetAtTime(active ? 0.45 : 0, this.ctx.currentTime, 0.05);
    this.reverbDryGain.gain.setTargetAtTime(active ? 0.75 : 1, this.ctx.currentTime, 0.05);
  }

  public toggleTubeAmp(active: boolean) {
    this.tubeAmpEnabled = active;
    if (!this.ctx) return;
    this.tubeWetGain.gain.setTargetAtTime(active ? 0.4 : 0, this.ctx.currentTime, 0.05);
    this.tubeDryGain.gain.setTargetAtTime(active ? 0.8 : 1, this.ctx.currentTime, 0.05);
  }

  public toggleKaraoke(active: boolean) {
    this.karaokeActive = active;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (active) {
      this.dryMusicGain.gain.setTargetAtTime(0, now, 0.05);
      this.karaokeOutGain.gain.setTargetAtTime(1.0, now, 0.05);
    } else {
      this.dryMusicGain.gain.setTargetAtTime(1.0, now, 0.05);
      this.karaokeOutGain.gain.setTargetAtTime(0, now, 0.05);
    }
  }

  public setRate(rate: number) {
    this.playbackRate = Math.min(Math.max(rate, 0.5), 2.0);
    this.audioA.playbackRate = this.playbackRate;
    this.audioB.playbackRate = this.playbackRate;
  }
}

export const auraEngine = new AuraAudioEngine();