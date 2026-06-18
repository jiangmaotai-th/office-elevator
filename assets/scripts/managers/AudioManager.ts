import { AudioClip, AudioSource, input, Input, Node, resources } from 'cc';
import { EventBus } from '../core/EventBus';

interface MelodicNote {
    frequency: number;
    volume: number;
}

const BOARDING_MELODY = [293.66, 329.63, 392.00, 440.00, 587.33, 440.00];
const DELIVERY_MELODY = [587.33, 659.25, 783.99, 880.00, 1174.66, 880.00];
const NOTE_INTERVAL_SECONDS = 0.1;
const NOTE_DURATION_SECONDS = 0.32;
const MAX_QUEUED_NOTES = 6;
const BOARDING_VOLUME = 0.28;
const DELIVERY_VOLUME = 0.24;

export class AudioManager {
    private readonly source: AudioSource;
    private boardingClip: AudioClip | null = null;
    private readonly unsubscribes: Array<() => void> = [];
    private unlockPlaybackDone = false;
    private noteTimer = 0;
    private boardingMelodyIndex = 0;
    private deliveryMelodyIndex = 0;
    private readonly noteQueue: MelodicNote[] = [];
    private audioContext: AudioContext | null = null;

    constructor(parent: Node) {
        const audioNode = new Node('AudioManager');
        parent.addChild(audioNode);
        this.source = audioNode.addComponent(AudioSource);
        this.source.volume = 0.55;
    }

    initialize(events: EventBus): void {
        resources.load('audio/passenger-board', AudioClip, (error, clip) => {
            if (error || !clip) {
                console.warn('[AudioManager] passenger-board sound failed to load', error);
                return;
            }
            this.boardingClip = clip;
        });
        input.on(Input.EventType.TOUCH_START, this.unlockAudio, this);
        input.on(Input.EventType.MOUSE_DOWN, this.unlockAudio, this);
        this.unsubscribes.push(events.on('passenger-boarded', () => this.enqueueBoardingNote()));
        this.unsubscribes.push(events.on('passenger-delivered', () => this.enqueueDeliveryNote()));
        this.unsubscribes.push(events.on('passenger-warning', () => this.playWarning()));
    }

    update(deltaTime: number): void {
        if (!this.unlockPlaybackDone || this.noteQueue.length === 0) {
            return;
        }
        this.noteTimer -= deltaTime;
        if (this.noteTimer > 0) {
            return;
        }
        const note = this.noteQueue.shift();
        if (!note) {
            return;
        }
        this.playNote(note);
        this.noteTimer = NOTE_INTERVAL_SECONDS;
    }

    dispose(): void {
        input.off(Input.EventType.TOUCH_START, this.unlockAudio, this);
        input.off(Input.EventType.MOUSE_DOWN, this.unlockAudio, this);
        this.unsubscribes.splice(0).forEach((unsubscribe) => unsubscribe());
        this.noteQueue.length = 0;
    }

    private enqueueBoardingNote(): void {
        if (this.noteQueue.length >= MAX_QUEUED_NOTES) {
            return;
        }
        const frequency = BOARDING_MELODY[this.boardingMelodyIndex % BOARDING_MELODY.length];
        this.boardingMelodyIndex += 1;
        this.noteQueue.push({ frequency, volume: BOARDING_VOLUME });
    }

    private enqueueDeliveryNote(): void {
        if (this.noteQueue.length >= MAX_QUEUED_NOTES) {
            return;
        }
        const frequency = DELIVERY_MELODY[this.deliveryMelodyIndex % DELIVERY_MELODY.length];
        this.deliveryMelodyIndex += 1;
        this.noteQueue.push({ frequency, volume: DELIVERY_VOLUME });
    }

    private playWarning(): void {
        if (!this.unlockPlaybackDone) {
            return;
        }
        if (this.audioContext) {
            this.playPluckedNote({ frequency: 880, volume: 0.18 }, true);
            return;
        }
        if (this.boardingClip) {
            this.source.playOneShot(this.boardingClip, 0.18);
        }
    }

    private unlockAudio(): void {
        if (this.unlockPlaybackDone) {
            void this.audioContext?.resume();
            return;
        }
        this.audioContext = this.createAudioContext();
        void this.audioContext?.resume();
        this.unlockPlaybackDone = true;
    }

    private playNote(note: MelodicNote): void {
        if (this.audioContext) {
            this.playPluckedNote(note, false);
            return;
        }
        if (this.boardingClip) {
            this.source.playOneShot(this.boardingClip, note.volume * 0.55);
        }
    }

    private playPluckedNote(note: MelodicNote, isWarning: boolean): void {
        if (!this.audioContext) {
            return;
        }
        const now = this.audioContext.currentTime;
        const output = this.audioContext.createGain();
        const brightness = this.audioContext.createBiquadFilter();
        brightness.type = 'highshelf';
        brightness.frequency.setValueAtTime(1800, now);
        brightness.gain.setValueAtTime(isWarning ? 2 : 5, now);

        output.gain.setValueAtTime(0.0001, now);
        output.gain.exponentialRampToValueAtTime(note.volume, now + 0.006);
        output.gain.exponentialRampToValueAtTime(note.volume * 0.32, now + 0.055);
        output.gain.exponentialRampToValueAtTime(0.0001, now + NOTE_DURATION_SECONDS);
        output.connect(brightness);
        brightness.connect(this.audioContext.destination);

        this.playPartial(note.frequency, 1, 1, now, output, 'triangle');
        this.playPartial(note.frequency, 2, 0.34, now, output, 'sine');
        this.playPartial(note.frequency, 3, 0.18, now, output, 'sine');
        this.playPartial(note.frequency, 5, 0.08, now, output, 'sine');
    }

    private playPartial(
        frequency: number,
        harmonic: number,
        level: number,
        startTime: number,
        output: GainNode,
        type: OscillatorType,
    ): void {
        if (!this.audioContext) {
            return;
        }
        const oscillator = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();
        oscillator.type = type;
        oscillator.frequency.setValueAtTime(frequency * harmonic * 1.012, startTime);
        oscillator.frequency.exponentialRampToValueAtTime(frequency * harmonic, startTime + 0.045);
        gain.gain.setValueAtTime(level, startTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, startTime + NOTE_DURATION_SECONDS);
        oscillator.connect(gain);
        gain.connect(output);
        oscillator.start(startTime);
        oscillator.stop(startTime + NOTE_DURATION_SECONDS + 0.03);
    }

    private createAudioContext(): AudioContext | null {
        if (typeof window === 'undefined') {
            return null;
        }
        const AudioContextConstructor = window.AudioContext
            ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        return AudioContextConstructor ? new AudioContextConstructor() : null;
    }
}
