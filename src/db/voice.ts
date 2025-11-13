import { AudioPlayer, AudioPlayerStatus, createAudioPlayer, createAudioResource } from "@discordjs/voice";
import { logger } from "../logger";
import config from 'config';

export class Instance {
  private socket?: WebSocket;
  public readonly player: AudioPlayer = createAudioPlayer();
  private messageId: string | null = null;
  private messages: Record<string, any>[] = [];
  private sequence: number = 0;

  constructor(
    private readonly agentId: string,
    private readonly agentSecret: string,
    private readonly instanceId: string,
    public channelId: string,
  ) {
    this.player.on(AudioPlayerStatus.AutoPaused, () => {
      logger.info('Player finished!');
    });

    this.player.on(AudioPlayerStatus.Playing, () => {
      logger.info('Player playing!');
    });

    this.player.on(AudioPlayerStatus.Idle, () => {
      logger.info('Player idle!');
      this.playNextMessage();
    });
  }

  async connect() {
    logger.info(`Connecting instance to ${this.channelId}`);

    this.socket = new WebSocket(
      `${config.get('services.breign.socket')}/agents/${this.agentId}/sockets`,
    );

    this.socket.addEventListener('message', (message) => {
      try {
        const event = JSON.parse(message.data.toString());

        switch (event.type) {
          case 'REQUEST_AUTHENTICATION':
            logger.info('Authenticating...');
            this.socket?.send(
              JSON.stringify({
                type: 'AUTHENTICATION_RESPONSE',
                authSecret: this.agentSecret,
              }),
            );
            break;
          case 'AUTHENTICATION_SUCCESS':
            logger.info('Authentication successful!');
            break;
          case 'INPUT':
            break;
          case 'INTERRUPT':
            this.handleInterruptCommand();
            logger.info({ event }, 'Received INTERRUPT event');
            this.player.stop();
            break;
          case 'SAY_FILLER':
            break;
          case 'SAY':
            logger.info({ event }, 'Received SAY event');
            this.handleSayCommand(event);
            break;
          default:
            logger.warn({ event }, 'Received unhandled event');
            break;
        }
      } catch (error: any) {
        logger.error({ error }, 'Error while handling agent socket event');
      }
    });

    const pingInterval = setInterval(() => {
      this.socket?.send(JSON.stringify({ type: 'PING' }));
    }, 25000);
    this.socket.addEventListener('close', (event) => {
      console.log('Connection closed', { event });

      clearInterval(pingInterval);
    });
  }

  async handleInterruptCommand() {
    this.messageId = null;
    this.messages = [];
    this.sequence = 0;
    this.player.stop(true);
  }

  async handleSayCommand(message: Record<string, any>) {
    if (this.messageId !== message.messageId) {
      await this.handleInterruptCommand();
    }

    this.messageId = message.messageId;
    this.messages.push(message);

    if (this.player.state.status === AudioPlayerStatus.Idle) {
      await this.playNextMessage();
    }
  }

  async playNextMessage() {
    logger.debug({
      messageId: this.messageId,
      sequence: this.sequence,
    }, 'Playing next message');
    if (!this.messageId || this.messages.length === 0) {
      return;
    }

    const nextMessage = this.messages.find(
      (message) =>
        message.messageId === this.messageId &&
        message.sequence === this.sequence &&
        message.type === 'SAY',
    );

    if (!nextMessage) {
      if (
        !this.messages.find(
          (message) =>
            message.messageId === this.messageId && (message.sequence ?? 0) > this.sequence,
        )
      ) {
        logger.debug('FINISHED PLAYING AUDIO');
        await fetch(`${config.get('services.breign.endpoint')}/agents/${this.agentId}/status`, {
          method: 'POST',
          headers: {
            'x-api-key': `${this.agentId}:${this.agentSecret}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            status: 'IDLE',
          }),
        }).then(() => {
          console.log('Marked connector as IDLE');
        });
        return;
      }

      return;
    }

    logger.debug({ nextMessage }, 'Playing message');

    if (nextMessage.audio?.src) {
      const audioSource = createAudioResource(nextMessage.audio.src);

      this.player.play(audioSource);
      this.sequence++;
    } else if (!nextMessage.final) {
      this.sequence++;
      this.playNextMessage();
    } else {
      this.sequence++;
      await fetch(`${config.get('services.breign.endpoint')}/agents/${this.agentId}/status`, {
        method: 'POST',
        headers: {
            'x-api-key': `${this.agentId}:${this.agentSecret}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          status: 'IDLE',
        }),
      }).then(() => {
        console.log('Marked connector as IDLE');
      });
      return;
    }
  }
}