import * as fs from 'fs';
import * as path from 'path';

export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3,
}

const LOG_LEVEL_NAMES: Record<LogLevel, string> = {
    [LogLevel.DEBUG]: 'DEBUG',
    [LogLevel.INFO]: 'INFO',
    [LogLevel.WARN]: 'WARN',
    [LogLevel.ERROR]: 'ERROR',
};

interface LogContext {
    [key: string]: unknown;
}

class Logger {
    private level: LogLevel;
    private fileStream: fs.WriteStream | null = null;
    private logFilePath: string | null = null;

    constructor() {
        this.level = this.parseLogLevel(process.env.LOG_LEVEL);
        this.logFilePath = process.env.LOG_FILE || null;

        if (this.logFilePath) {
            this.initFileStream(this.logFilePath);
        }
    }

    private parseLogLevel(levelStr?: string): LogLevel {
        if (!levelStr) return LogLevel.INFO;

        const level = levelStr.toUpperCase();
        switch (level) {
            case 'DEBUG': return LogLevel.DEBUG;
            case 'INFO': return LogLevel.INFO;
            case 'WARN': return LogLevel.WARN;
            case 'ERROR': return LogLevel.ERROR;
            default: return LogLevel.INFO;
        }
    }

    private initFileStream(filePath: string): void {
        try {
            // Ensure directory exists
            const dir = path.dirname(filePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            // Open file in append mode
            this.fileStream = fs.createWriteStream(filePath, { flags: 'a' });
            this.fileStream.on('error', (err) => {
                console.error(`[Logger] Failed to write to log file: ${err.message}`);
                this.fileStream = null;
            });

            // Redirect all stderr to the log file as well
            // This captures uncaught exceptions, dependency warnings, etc.
            this.redirectStderr();
        } catch (err) {
            console.error(`[Logger] Failed to initialize log file: ${err}`);
        }
    }

    private stderrRedirected = false;

    private redirectStderr(): void {
        if (!this.fileStream) return;

        const fileStream = this.fileStream;
        const originalWrite = process.stderr.write.bind(process.stderr);

        process.stderr.write = ((
            chunk: Uint8Array | string,
            encodingOrCallback?: BufferEncoding | ((err?: Error) => void),
            callback?: (err?: Error) => void
        ): boolean => {
            // Write to the log file
            const text = typeof chunk === 'string' ? chunk : chunk.toString();
            fileStream.write(text);

            // Still write to original stderr
            if (typeof encodingOrCallback === 'function') {
                return originalWrite(chunk, encodingOrCallback);
            }
            return originalWrite(chunk, encodingOrCallback, callback);
        }) as typeof process.stderr.write;

        this.stderrRedirected = true;
    }

    private formatTimestamp(): string {
        return new Date().toISOString();
    }

    private formatMessage(level: LogLevel, message: string, context?: LogContext): string {
        const timestamp = this.formatTimestamp();
        const levelName = LOG_LEVEL_NAMES[level];

        let logLine = `[${timestamp}] [${levelName}] ${message}`;

        if (context && Object.keys(context).length > 0) {
            logLine += ` ${JSON.stringify(context)}`;
        }

        return logLine;
    }

    private write(level: LogLevel, message: string, context?: LogContext): void {
        if (level < this.level) return;

        const formattedMessage = this.formatMessage(level, message, context);

        // Always write to stderr (MCP uses stdout for communication)
        console.error(formattedMessage);

        // Write to file directly only if stderr is NOT redirected to the file
        // (otherwise console.error above already writes to the file via the redirect)
        if (this.fileStream && !this.stderrRedirected) {
            this.fileStream.write(formattedMessage + '\n');
        }
    }

    debug(message: string, context?: LogContext): void {
        this.write(LogLevel.DEBUG, message, context);
    }

    info(message: string, context?: LogContext): void {
        this.write(LogLevel.INFO, message, context);
    }

    warn(message: string, context?: LogContext): void {
        this.write(LogLevel.WARN, message, context);
    }

    error(message: string, context?: LogContext): void {
        this.write(LogLevel.ERROR, message, context);
    }

    /**
     * Close the file stream when shutting down
     */
    close(): void {
        if (this.fileStream) {
            this.fileStream.end();
            this.fileStream = null;
        }
    }

    /**
     * Get the current log configuration for debugging
     */
    getConfig(): { level: string; logFile: string | null } {
        return {
            level: LOG_LEVEL_NAMES[this.level],
            logFile: this.logFilePath,
        };
    }
}

// Singleton instance
export const logger = new Logger();
