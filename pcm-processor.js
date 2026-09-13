class HangOnPCM extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const { inputSampleRate, targetSampleRate } = options.processorOptions;
    this.ratio = inputSampleRate / targetSampleRate;
    this.pending = [];
    this.phase = 0;
    this.targetChunk = Math.floor(targetSampleRate * 0.05);
  }

  process(inputs) {
    const input = inputs[0]?.[0];
    if (!input) return true;
    for (let index = 0; index < input.length; index += 1) this.pending.push(input[index]);
    const available = (this.pending.length - this.phase) / this.ratio;
    if (available < this.targetChunk) return true;
    const pcm16 = new Int16Array(this.targetChunk);
    for (let index = 0; index < this.targetChunk; index += 1) {
      const position = this.phase + index * this.ratio;
      const left = Math.floor(position);
      const fraction = position - left;
      const a = this.pending[left] || 0;
      const b = this.pending[left + 1] || a;
      pcm16[index] = Math.max(-32768, Math.min(32767, Math.round((a + (b - a) * fraction) * 32767)));
    }
    const consumed = this.phase + this.targetChunk * this.ratio;
    const wholeSamples = Math.floor(consumed);
    this.phase = consumed - wholeSamples;
    this.pending.splice(0, wholeSamples);
    this.port.postMessage(pcm16.buffer, [pcm16.buffer]);
    return true;
  }
}

class HangOnPlayback extends AudioWorkletProcessor {
  constructor() {
    super();
    this.queue = [];
    this.offset = 0;
    this.buffered = 0;
    this.started = false;
    this.minimumBuffer = Math.floor(sampleRate * 0.14);
    this.port.onmessage = (event) => {
      if (event.data?.type === 'flush') {
        this.queue = [];
        this.offset = 0;
        this.buffered = 0;
        this.started = false;
        return;
      }
      if (event.data?.type === 'audio' && event.data.samples) {
        this.queue.push(new Float32Array(event.data.samples));
        this.buffered += event.data.samples.length;
      }
    };
  }

  process(_inputs, outputs) {
    const output = outputs[0]?.[0];
    if (!output) return true;
    output.fill(0);
    if (!this.started) {
      if (this.buffered < this.minimumBuffer) return true;
      this.started = true;
    }
    let written = 0;
    while (written < output.length && this.queue.length) {
      const current = this.queue[0];
      const available = current.length - this.offset;
      const count = Math.min(available, output.length - written);
      output.set(current.subarray(this.offset, this.offset + count), written);
      this.offset += count;
      written += count;
      this.buffered -= count;
      if (this.offset >= current.length) {
        this.queue.shift();
        this.offset = 0;
      }
    }
    if (written < output.length) this.started = false;
    return true;
  }
}

registerProcessor('hangon-pcm', HangOnPCM);
registerProcessor('hangon-playback', HangOnPlayback);
