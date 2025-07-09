import { createWriteStream, WriteStream } from 'fs';
import { resolve } from 'path';

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
  TRACE = 4
}

export interface LoggerOptions {
  level: LogLevel;
  useColor: boolean;
  logFile?: string;
}

export class Logger {
  private static instance: Logger;
  private options: LoggerOptions;
  private fileStream?: WriteStream | undefined;

  private constructor(options: LoggerOptions) {
    this.options = options;
    
    if (options.logFile) {
      this.fileStream = createWriteStream(resolve(options.logFile), { flags: 'a' });
    }
  }

  static getInstance(options?: LoggerOptions): Logger {
    if (!Logger.instance && options) {
      Logger.instance = new Logger(options);
    } else if (!Logger.instance) {
      Logger.instance = new Logger({
        level: LogLevel.INFO,
        useColor: true
      });
    }
    return Logger.instance;
  }

  static configure(options: LoggerOptions): Logger {
    Logger.instance = new Logger(options);
    return Logger.instance;
  }

  private shouldLog(level: LogLevel): boolean {
    return level <= this.options.level;
  }

  private formatMessage(level: LogLevel, message: string, prefix?: string): string {
    const timestamp = new Date().toISOString();
    const levelName = LogLevel[level];
    const fullPrefix = prefix ? `[${prefix}] ` : '';
    
    return `[${timestamp}] ${levelName}: ${fullPrefix}${message}`;
  }

  private colorize(text: string, color: string): string {
    if (!this.options.useColor) {
      return text;
    }

    const colors: Record<string, string> = {
      red: '\x1b[31m',
      yellow: '\x1b[33m',
      blue: '\x1b[34m',
      green: '\x1b[32m',
      gray: '\x1b[90m',
      reset: '\x1b[0m'
    };

    return `${colors[color] || ''}${text}${colors.reset}`;
  }

  private writeToFile(message: string): void {
    if (this.fileStream) {
      this.fileStream.write(`${message}\n`);
    }
  }

  error(message: string, prefix?: string): void {
    if (!this.shouldLog(LogLevel.ERROR)) return;
    
    const formatted = this.formatMessage(LogLevel.ERROR, message, prefix);
    const colored = this.colorize(formatted, 'red');
    
    console.error(colored);
    this.writeToFile(formatted);
  }

  warn(message: string, prefix?: string): void {
    if (!this.shouldLog(LogLevel.WARN)) return;
    
    const formatted = this.formatMessage(LogLevel.WARN, message, prefix);
    const colored = this.colorize(formatted, 'yellow');
    
    console.warn(colored);
    this.writeToFile(formatted);
  }

  info(message: string, prefix?: string): void {
    if (!this.shouldLog(LogLevel.INFO)) return;
    
    const formatted = this.formatMessage(LogLevel.INFO, message, prefix);
    const colored = this.colorize(formatted, 'blue');
    
    console.log(colored);
    this.writeToFile(formatted);
  }

  debug(message: string, prefix?: string): void {
    if (!this.shouldLog(LogLevel.DEBUG)) return;
    
    const formatted = this.formatMessage(LogLevel.DEBUG, message, prefix);
    const colored = this.colorize(formatted, 'gray');
    
    console.log(colored);
    this.writeToFile(formatted);
  }

  trace(message: string, prefix?: string): void {
    if (!this.shouldLog(LogLevel.TRACE)) return;
    
    const formatted = this.formatMessage(LogLevel.TRACE, message, prefix);
    const colored = this.colorize(formatted, 'gray');
    
    console.log(colored);
    this.writeToFile(formatted);
  }

  // Simple output methods without timestamps for user-facing messages
  success(message: string): void {
    if (!this.shouldLog(LogLevel.INFO)) return;
    const colored = this.colorize(`✅ ${message}`, 'green');
    console.log(colored);
  }

  progress(message: string): void {
    if (!this.shouldLog(LogLevel.INFO)) return;
    const colored = this.colorize(`🔄 ${message}`, 'blue');
    console.log(colored);
  }

  warning(message: string): void {
    if (!this.shouldLog(LogLevel.WARN)) return;
    const colored = this.colorize(`⚠️  ${message}`, 'yellow');
    console.warn(colored);
  }

  failure(message: string): void {
    if (!this.shouldLog(LogLevel.ERROR)) return;
    const colored = this.colorize(`❌ ${message}`, 'red');
    console.error(colored);
  }

  // Raw output without any formatting (for dry-run previews, etc.)
  raw(message: string): void {
    console.log(message);
  }

  setLevel(level: LogLevel): void {
    this.options.level = level;
  }

  setUseColor(useColor: boolean): void {
    this.options.useColor = useColor;
  }

  close(): void {
    if (this.fileStream) {
      this.fileStream.end();
      this.fileStream = undefined;
    }
  }
}