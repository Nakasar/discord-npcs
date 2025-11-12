import pino from 'pino';
import config from 'config';

export const logger = pino({
    level: config.get('server.logging.level') || 'info',
});