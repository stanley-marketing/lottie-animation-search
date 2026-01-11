import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { logger, createLogger } from "../../src/utils/logger.js";

describe("logger", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  const originalLogLevel = process.env.LOG_LEVEL;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    // Restore original log level
    if (originalLogLevel !== undefined) {
      process.env.LOG_LEVEL = originalLogLevel;
    } else {
      delete process.env.LOG_LEVEL;
    }
  });

  describe("log levels", () => {
    it("should log info messages by default", () => {
      delete process.env.LOG_LEVEL;
      
      logger.info("Test message");
      
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy.mock.calls[0][0]).toContain("INFO");
      expect(consoleErrorSpy.mock.calls[0][0]).toContain("Test message");
    });

    it("should not log debug messages by default", () => {
      delete process.env.LOG_LEVEL;
      
      logger.debug("Debug message");
      
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it("should log debug messages when LOG_LEVEL=debug", () => {
      process.env.LOG_LEVEL = "debug";
      
      logger.debug("Debug message");
      
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy.mock.calls[0][0]).toContain("DEBUG");
    });

    it("should log warn messages", () => {
      logger.warn("Warning message");
      
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy.mock.calls[0][0]).toContain("WARN");
    });

    it("should log error messages", () => {
      logger.error("Error message");
      
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy.mock.calls[0][0]).toContain("ERROR");
    });

    it("should suppress all logs when LOG_LEVEL=silent", () => {
      process.env.LOG_LEVEL = "silent";
      
      logger.debug("Debug");
      logger.info("Info");
      logger.warn("Warn");
      logger.error("Error");
      
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it("should only log error when LOG_LEVEL=error", () => {
      process.env.LOG_LEVEL = "error";
      
      logger.info("Info");
      logger.warn("Warn");
      
      expect(consoleErrorSpy).not.toHaveBeenCalled();
      
      logger.error("Error");
      
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("message formatting", () => {
    it("should include timestamp in log output", () => {
      logger.info("Test");
      
      const output = consoleErrorSpy.mock.calls[0][0] as string;
      // Should match ISO timestamp format
      expect(output).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it("should format object data as JSON", () => {
      process.env.LOG_LEVEL = "debug";
      
      logger.debug("With data", { key: "value", count: 42 });
      
      const output = consoleErrorSpy.mock.calls[0][0] as string;
      expect(output).toContain('"key"');
      expect(output).toContain('"value"');
      expect(output).toContain("42");
    });

    it("should format Error objects with message and stack", () => {
      const error = new Error("Test error");
      
      logger.error("Failed", error);
      
      const output = consoleErrorSpy.mock.calls[0][0] as string;
      expect(output).toContain("Error: Test error");
      expect(output).toContain("Stack:");
    });

    it("should handle primitive data values", () => {
      logger.info("Count", 42);
      
      const output = consoleErrorSpy.mock.calls[0][0] as string;
      expect(output).toContain("42");
    });
  });

  describe("createLogger", () => {
    it("should create a prefixed logger", () => {
      const toolLogger = createLogger("my_tool");
      
      toolLogger.info("Tool message");
      
      const output = consoleErrorSpy.mock.calls[0][0] as string;
      expect(output).toContain("[my_tool]");
      expect(output).toContain("Tool message");
    });

    it("should support all log levels", () => {
      process.env.LOG_LEVEL = "debug";
      const prefixedLogger = createLogger("test");
      
      prefixedLogger.debug("Debug");
      prefixedLogger.info("Info");
      prefixedLogger.warn("Warn");
      prefixedLogger.error("Error");
      
      expect(consoleErrorSpy).toHaveBeenCalledTimes(4);
      
      for (const call of consoleErrorSpy.mock.calls) {
        expect(call[0]).toContain("[test]");
      }
    });
  });

  describe("stderr usage", () => {
    it("should use console.error (stderr) not console.log (stdout)", () => {
      const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      
      logger.info("Test");
      logger.warn("Test");
      logger.error("Test");
      
      expect(consoleLogSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledTimes(3);
      
      consoleLogSpy.mockRestore();
    });
  });
});
