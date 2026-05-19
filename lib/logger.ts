type LogLevel = 'info' | 'warn' | 'error';

interface LogPayload {
  message: string;
  operationId?: string;
  userId?: string;
  operation?: string;
  error?: string;
  stack?: string;
  [key: string]: unknown;
}

interface LogEntry extends LogPayload {
  level: LogLevel;
  timestamp: string;
}

function log(level: LogLevel, payload: LogPayload): void {
  const entry: LogEntry = { level, timestamp: new Date().toISOString(), ...payload };

  if (__DEV__) {
    const { message, ...rest } = entry;
    const hasExtras = Object.keys(rest).some((k) => k !== 'level' && k !== 'timestamp');
    // eslint-disable-next-line no-console
    console[level](`[${level.toUpperCase()}] ${message}`, hasExtras ? rest : '');
  } else {
    // eslint-disable-next-line no-console
    console[level](JSON.stringify(entry));
  }
}

export const logger = {
  info: (payload: LogPayload) => log('info', payload),
  warn: (payload: LogPayload) => log('warn', payload),
  error: (payload: LogPayload) => log('error', payload),
};
