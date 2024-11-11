/** @format */

import WebSocket from 'ws';
import decodeAudio from 'audio-decode';
import fs from 'fs';
import { WaveFile } from 'wavefile';
//import { v4 as uuidv4 } from "uuid";
const BASE_URL = 'wss://api.openai.com/v1/realtime';
export enum RealtimeModels {
  GPT_4O_REALTIME = 'gpt-4o-realtime-preview-2024-10-01',
}
export class OpenAIRealtimeClient {
  private socket: WebSocket;
  private connectedPromiseMethods: {
    resolve: (val: boolean) => void;
    reject: (reason?: any) => void;
  } | null = null;
  private connectedPromise: Promise<boolean>;
  private textOutputBuffer = '';
  private audioOutputBase64Buffer: Buffer[] = [];
  private audioOuputTranscriptBuffer = '';
  private _connected: boolean = false;
  private pendingPromise: {
    resolve: (value: any) => void;
    reject: (reason?: any) => void;
  } | null = null;
  constructor(apiKey: string, model: RealtimeModels) {
    const url = new URL(BASE_URL);
    url.searchParams.append('model', model);
    console.time('connect');
    const ws = new WebSocket(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'OpenAI-Beta': 'realtime=v1',
      },
    });
    this.socket = ws;
    this.connectedPromise = new Promise((resolve, reject) => {
      ws.once('open', () => {
        console.log('Connected to OpenAI Realtime API');
        console.timeEnd('connect');
        this._connected = true;
        this.socket.send(
          JSON.stringify({
            type: 'session.update',
            session: {
              output_audio_format: 'pcm16',
            },
          })
        );
        this.connectedPromiseMethods = { resolve, reject };
      });
    });
    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        console.log('Received binary data');
        return;
      }
      const msg = JSON.parse(data.toString());
      console.log({ type: msg.type });
      switch (msg.type) {
        case 'session.updated':
          console.log({ outputAudio: msg.session.output_audio_format });
          this.connectedPromiseMethods?.resolve(true);
          break;
        case 'response.text.delta':
          this.textOutputBuffer += msg.delta + ' ';
          break;
        case 'response.audio.delta':
          this.audioOutputBase64Buffer.push(Buffer.from(msg.delta, 'base64'));
          break;
        case 'response.audio_transcript.delta':
          this.audioOuputTranscriptBuffer += msg.delta;
          break;
        case 'response.done':
          console.log('Full Model Output:', this.textOutputBuffer);
          console.log(
            'Full Audio Transcript:',
            this.audioOuputTranscriptBuffer
          );
          dumpAudio(this.audioOutputBase64Buffer);
          this.pendingPromise?.resolve(true);
          this.pendingPromise = null;
          break;
        case 'error':
          this.pendingPromise?.reject(msg.error.message);
          this.pendingPromise = null;
          break;
      }
    });
  }
  public async sendAudio(audio: string): Promise<any>;
  public async sendAudio(audio: Buffer): Promise<any>;
  public async sendAudio(audio: any): Promise<any> {
    const audioBuffer =
      typeof audio === 'string' ? await this.loadBufferFromFile(audio) : audio;
    const base64AudioData = audioBuffer.toString('base64');
    console.log({ base64AudioData });
    const event = {
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [
          {
            type: 'input_audio',
            audio: base64AudioData,
          },
        ],
      },
    };
    this.socket.send(JSON.stringify(event));
    // wait for response
    const promise = new Promise((resolve, reject) => {
      this.socket.send(
        JSON.stringify({
          type: 'response.create',
        })
      );
      this.pendingPromise = { resolve, reject };
    });
    return promise;
  }

  private async loadBufferFromFile(path: string): Promise<Buffer> {
    const myAudio = fs.readFileSync(path);

    const wavefile = new WaveFile();
    wavefile.fromBuffer(myAudio);
    wavefile.toBitDepth('16');
    wavefile.toSampleRate(24000);
    // const samples = wavefile.getSamples(); // only accepts mono
    return Buffer.from(wavefile.toBuffer());
  }

  public get connected(): boolean {
    return this._connected;
  }
  public async connect(): Promise<boolean> {
    return this.connectedPromise;
  }
}

function dumpAudio(base64: Buffer[]) {
  // const wavefileFromBase64 = new WaveFile();
  const buffer = Buffer.concat(base64);
  // let i = 0;
  // for (const it of base64) {
  //   fs.writeFileSync(`audio-${i}.wav`, it);
  //   i++;
  // }
  // const buffer = Buffer.from(base64, 'base64');
  const wavefileFromSratch = new WaveFile();
  wavefileFromSratch.fromScratch(1, 24000, '16', buffer);
  // wavefileFromBase64.fromBuffer(buffer);
  fs.writeFileSync('audio-from-buffer.wav', wavefileFromSratch.toBuffer());
  // fs.writeFileSync('audio-from-scratch.wav', wavefileFromSratch.toBuffer());
}
// Converts a Float32Array to base64-encoded PCM16 data
