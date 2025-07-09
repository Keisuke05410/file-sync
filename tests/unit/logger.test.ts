import { describe, it, expect, beforeEach, afterEach, vi, MockedFunction } from 'vitest';
import { Logger, LogLevel } from '../../src/utils/logger.js';
import { createWriteStream } from 'fs';

// Mock fs module
vi.mock('fs', () => ({
  createWriteStream: vi.fn()
}));

const mockCreateWriteStream = createWriteStream as MockedFunction<typeof createWriteStream>;

describe('Logger', () => {
  let mockWriteStream: any;
  let originalConsole: any;
  
  beforeEach(() => {
    // Reset singleton instance
    (Logger as any).instance = undefined;
    
    // Mock console methods
    originalConsole = {
      log: console.log,
      error: console.error,
      warn: console.warn
    };
    console.log = vi.fn();
    console.error = vi.fn();
    console.warn = vi.fn();
    
    // Mock write stream
    mockWriteStream = {
      write: vi.fn(),
      end: vi.fn()
    };
    mockCreateWriteStream.mockReturnValue(mockWriteStream);
  });
  
  afterEach(() => {
    // Restore console methods
    console.log = originalConsole.log;
    console.error = originalConsole.error;
    console.warn = originalConsole.warn;
    
    vi.clearAllMocks();
  });

  describe('getInstance', () => {
    it('should create singleton instance with default options', () => {
      const logger = Logger.getInstance();
      
      expect(logger).toBeInstanceOf(Logger);
      expect(Logger.getInstance()).toBe(logger); // Same instance
    });

    it('should create singleton instance with provided options', () => {
      const options = {
        level: LogLevel.DEBUG,
        useColor: false,
        logFile: '/tmp/test.log'
      };
      
      const logger = Logger.getInstance(options);
      
      expect(logger).toBeInstanceOf(Logger);
      expect(mockCreateWriteStream).toHaveBeenCalledWith('/tmp/test.log', { flags: 'a' });
    });

    it('should not recreate instance if already exists', () => {
      const logger1 = Logger.getInstance();
      const logger2 = Logger.getInstance({
        level: LogLevel.ERROR,
        useColor: false
      });
      
      expect(logger1).toBe(logger2);
    });
  });

  describe('configure', () => {
    it('should create new instance with provided options', () => {
      const logger1 = Logger.getInstance();
      
      const options = {
        level: LogLevel.ERROR,
        useColor: false
      };
      const logger2 = Logger.configure(options);
      
      expect(logger2).toBeInstanceOf(Logger);
      expect(logger1).not.toBe(logger2);
    });
  });

  describe('logging methods', () => {
    let logger: Logger;
    
    beforeEach(() => {
      logger = Logger.configure({
        level: LogLevel.TRACE,
        useColor: false
      });
    });

    describe('error', () => {
      it('should log error messages', () => {
        logger.error('Test error message');
        
        expect(console.error).toHaveBeenCalledWith(
          expect.stringContaining('ERROR: Test error message')
        );
      });

      it('should log error messages with prefix', () => {
        logger.error('Test error message', 'TEST');
        
        expect(console.error).toHaveBeenCalledWith(
          expect.stringContaining('ERROR: [TEST] Test error message')
        );
      });

      it('should not log when level is too low', () => {
        const quietLogger = Logger.configure({
          level: LogLevel.ERROR - 1,
          useColor: false
        });
        
        quietLogger.error('Test error message');
        
        expect(console.error).not.toHaveBeenCalled();
      });
    });

    describe('warn', () => {
      it('should log warning messages', () => {
        logger.warn('Test warning message');
        
        expect(console.warn).toHaveBeenCalledWith(
          expect.stringContaining('WARN: Test warning message')
        );
      });

      it('should not log when level is too low', () => {
        const quietLogger = Logger.configure({
          level: LogLevel.ERROR,
          useColor: false
        });
        
        quietLogger.warn('Test warning message');
        
        expect(console.warn).not.toHaveBeenCalled();
      });
    });

    describe('info', () => {
      it('should log info messages', () => {
        logger.info('Test info message');
        
        expect(console.log).toHaveBeenCalledWith(
          expect.stringContaining('INFO: Test info message')
        );
      });

      it('should not log when level is too low', () => {
        const quietLogger = Logger.configure({
          level: LogLevel.WARN,
          useColor: false
        });
        
        quietLogger.info('Test info message');
        
        expect(console.log).not.toHaveBeenCalled();
      });
    });

    describe('debug', () => {
      it('should log debug messages', () => {
        logger.debug('Test debug message');
        
        expect(console.log).toHaveBeenCalledWith(
          expect.stringContaining('DEBUG: Test debug message')
        );
      });

      it('should not log when level is too low', () => {
        const quietLogger = Logger.configure({
          level: LogLevel.INFO,
          useColor: false
        });
        
        quietLogger.debug('Test debug message');
        
        expect(console.log).not.toHaveBeenCalled();
      });
    });

    describe('trace', () => {
      it('should log trace messages', () => {
        logger.trace('Test trace message');
        
        expect(console.log).toHaveBeenCalledWith(
          expect.stringContaining('TRACE: Test trace message')
        );
      });

      it('should not log when level is too low', () => {
        const quietLogger = Logger.configure({
          level: LogLevel.DEBUG,
          useColor: false
        });
        
        quietLogger.trace('Test trace message');
        
        expect(console.log).not.toHaveBeenCalled();
      });
    });
  });

  describe('user-facing methods', () => {
    let logger: Logger;
    
    beforeEach(() => {
      logger = Logger.configure({
        level: LogLevel.INFO,
        useColor: false
      });
    });

    it('should log success messages', () => {
      logger.success('Operation completed');
      
      expect(console.log).toHaveBeenCalledWith('✅ Operation completed');
    });

    it('should log progress messages', () => {
      logger.progress('Processing files');
      
      expect(console.log).toHaveBeenCalledWith('🔄 Processing files');
    });

    it('should log warning messages', () => {
      logger.warning('Something might be wrong');
      
      expect(console.warn).toHaveBeenCalledWith('⚠️  Something might be wrong');
    });

    it('should log failure messages', () => {
      logger.failure('Operation failed');
      
      expect(console.error).toHaveBeenCalledWith('❌ Operation failed');
    });

    it('should log raw messages without formatting', () => {
      logger.raw('Raw output message');
      
      expect(console.log).toHaveBeenCalledWith('Raw output message');
    });
  });

  describe('color support', () => {
    it('should apply colors when useColor is true', () => {
      const colorLogger = Logger.configure({
        level: LogLevel.INFO,
        useColor: true
      });
      
      colorLogger.error('Test error');
      
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('\x1b[31m') // Red color code
      );
    });

    it('should not apply colors when useColor is false', () => {
      const noColorLogger = Logger.configure({
        level: LogLevel.INFO,
        useColor: false
      });
      
      noColorLogger.error('Test error');
      
      expect(console.error).toHaveBeenCalledWith(
        expect.not.stringContaining('\x1b[31m')
      );
    });
  });

  describe('file logging', () => {
    it('should write to file when logFile is provided', () => {
      const logger = Logger.configure({
        level: LogLevel.INFO,
        useColor: false,
        logFile: '/tmp/test.log'
      });
      
      logger.info('Test message');
      
      expect(mockWriteStream.write).toHaveBeenCalledWith(
        expect.stringContaining('INFO: Test message\n')
      );
    });

    it('should not write to file when logFile is not provided', () => {
      const logger = Logger.configure({
        level: LogLevel.INFO,
        useColor: false
      });
      
      logger.info('Test message');
      
      expect(mockWriteStream.write).not.toHaveBeenCalled();
    });
  });

  describe('configuration methods', () => {
    let logger: Logger;
    
    beforeEach(() => {
      logger = Logger.configure({
        level: LogLevel.INFO,
        useColor: true
      });
    });

    it('should update log level', () => {
      logger.setLevel(LogLevel.ERROR);
      logger.info('This should not appear');
      
      expect(console.log).not.toHaveBeenCalled();
      
      logger.error('This should appear');
      expect(console.error).toHaveBeenCalled();
    });

    it('should update color setting', () => {
      logger.setUseColor(false);
      logger.error('Test error');
      
      expect(console.error).toHaveBeenCalledWith(
        expect.not.stringContaining('\x1b[')
      );
    });

    it('should close file stream', () => {
      const fileLogger = Logger.configure({
        level: LogLevel.INFO,
        useColor: false,
        logFile: '/tmp/test.log'
      });
      
      fileLogger.close();
      
      expect(mockWriteStream.end).toHaveBeenCalled();
    });
  });

  describe('message formatting', () => {
    let logger: Logger;
    
    beforeEach(() => {
      logger = Logger.configure({
        level: LogLevel.TRACE,
        useColor: false
      });
    });

    it('should include timestamp in formatted messages', () => {
      logger.info('Test message');
      
      expect(console.log).toHaveBeenCalledWith(
        expect.stringMatching(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] INFO: Test message/)
      );
    });

    it('should include prefix when provided', () => {
      logger.info('Test message', 'MODULE');
      
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('[MODULE] Test message')
      );
    });

    it('should format level name correctly', () => {
      logger.debug('Debug message');
      
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('DEBUG:')
      );
    });
  });
});