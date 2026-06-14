import { AudioClip, AudioSource, Node, resources } from 'cc';
import { EventBus } from '../core/EventBus';

export class AudioManager {
    private readonly source: AudioSource;
    private boardingClip: AudioClip | null = null;
    private readonly unsubscribes: Array<() => void> = [];

    constructor(parent: Node) {
        const audioNode = new Node('AudioManager');
        parent.addChild(audioNode);
        this.source = audioNode.addComponent(AudioSource);
        this.source.volume = 0.45;
    }

    initialize(events: EventBus): void {
        resources.load('audio/passenger-board', AudioClip, (error, clip) => {
            if (!error && clip) {
                this.boardingClip = clip;
            }
        });
        this.unsubscribes.push(events.on('passenger-boarded', () => this.playPassengerStep()));
        this.unsubscribes.push(events.on('passenger-delivered', () => this.playPassengerStep()));
    }

    dispose(): void {
        this.unsubscribes.splice(0).forEach((unsubscribe) => unsubscribe());
    }

    private playPassengerStep(): void {
        if (this.boardingClip) {
            this.source.playOneShot(this.boardingClip, 1);
        }
    }
}
