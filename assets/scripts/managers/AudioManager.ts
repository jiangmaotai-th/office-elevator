import { AudioClip, AudioSource, input, Input, Node, resources } from 'cc';
import { EventBus } from '../core/EventBus';

export class AudioManager {
    private readonly source: AudioSource;
    private boardingClip: AudioClip | null = null;
    private readonly unsubscribes: Array<() => void> = [];
    private unlockPlaybackDone = false;
    private pendingStepSounds = 0;

    constructor(parent: Node) {
        const audioNode = new Node('AudioManager');
        parent.addChild(audioNode);
        this.source = audioNode.addComponent(AudioSource);
        this.source.volume = 0.85;
    }

    initialize(events: EventBus): void {
        resources.load('audio/passenger-board', AudioClip, (error, clip) => {
            if (error || !clip) {
                console.warn('[AudioManager] passenger-board sound failed to load', error);
                return;
            }
            this.boardingClip = clip;
            if (this.unlockPlaybackDone) {
                this.flushPendingStepSounds();
            }
        });
        input.on(Input.EventType.TOUCH_START, this.unlockAudio, this);
        input.on(Input.EventType.MOUSE_DOWN, this.unlockAudio, this);
        this.unsubscribes.push(events.on('passenger-boarded', () => this.playPassengerStep()));
        this.unsubscribes.push(events.on('passenger-delivered', () => this.playPassengerStep()));
        this.unsubscribes.push(events.on('passenger-warning', () => this.playWarning()));
    }

    dispose(): void {
        input.off(Input.EventType.TOUCH_START, this.unlockAudio, this);
        input.off(Input.EventType.MOUSE_DOWN, this.unlockAudio, this);
        this.unsubscribes.splice(0).forEach((unsubscribe) => unsubscribe());
    }

    private playPassengerStep(): void {
        if (!this.boardingClip || !this.unlockPlaybackDone) {
            this.pendingStepSounds = Math.min(3, this.pendingStepSounds + 1);
            return;
        }
        this.source.playOneShot(this.boardingClip, 1);
    }

    private playWarning(): void {
        if (this.boardingClip && this.unlockPlaybackDone) {
            this.source.playOneShot(this.boardingClip, 0.7);
        }
    }

    private unlockAudio(): void {
        if (this.unlockPlaybackDone) {
            this.flushPendingStepSounds();
            return;
        }
        if (!this.boardingClip) {
            return;
        }
        this.source.playOneShot(this.boardingClip, 0.01);
        this.unlockPlaybackDone = true;
        this.flushPendingStepSounds();
    }

    private flushPendingStepSounds(): void {
        if (!this.boardingClip || !this.unlockPlaybackDone || this.pendingStepSounds <= 0) {
            return;
        }
        const soundsToPlay = this.pendingStepSounds;
        this.pendingStepSounds = 0;
        for (let index = 0; index < soundsToPlay; index += 1) {
            this.source.playOneShot(this.boardingClip, 1);
        }
    }
}
