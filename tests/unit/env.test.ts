import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getRequiredEnv,
  getEnv,
  getOptionalEnv,
  getEnvAsNumber,
  getEnvAsBoolean,
  validateRequiredEnvVars,
  EnvError,
} from "../../src/utils/env.js";

describe("environment variable utilities", () => {
  // Store original env vars to restore after tests
  const originalEnv: Record<string, string | undefined> = {};
  const testVars = [
    "TEST_REQUIRED",
    "TEST_OPTIONAL",
    "TEST_NUMBER",
    "TEST_BOOLEAN",
    "TEST_VAR_1",
    "TEST_VAR_2",
  ];

  beforeEach(() => {
    // Save original values
    for (const varName of testVars) {
      originalEnv[varName] = process.env[varName];
      delete process.env[varName];
    }
    // Suppress logger warnings during tests
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore original values
    for (const varName of testVars) {
      if (originalEnv[varName] !== undefined) {
        process.env[varName] = originalEnv[varName];
      } else {
        delete process.env[varName];
      }
    }
    vi.restoreAllMocks();
  });

  describe("getRequiredEnv", () => {
    it("should return the value when set", () => {
      process.env.TEST_REQUIRED = "my-value";
      
      const result = getRequiredEnv("TEST_REQUIRED");
      
      expect(result).toBe("my-value");
    });

    it("should throw EnvError when not set", () => {
      expect(() => getRequiredEnv("TEST_REQUIRED")).toThrow(EnvError);
      expect(() => getRequiredEnv("TEST_REQUIRED")).toThrow(
        /Required environment variable TEST_REQUIRED is not set/
      );
    });

    it("should throw EnvError when set to empty string", () => {
      process.env.TEST_REQUIRED = "";
      
      expect(() => getRequiredEnv("TEST_REQUIRED")).toThrow(EnvError);
    });

    it("should throw EnvError when set to whitespace only", () => {
      process.env.TEST_REQUIRED = "   ";
      
      expect(() => getRequiredEnv("TEST_REQUIRED")).toThrow(EnvError);
    });

    it("should include var name in error", () => {
      try {
        getRequiredEnv("TEST_REQUIRED");
      } catch (error) {
        expect(error).toBeInstanceOf(EnvError);
        expect((error as EnvError).varName).toBe("TEST_REQUIRED");
      }
    });
  });

  describe("getEnv", () => {
    it("should return the value when set", () => {
      process.env.TEST_OPTIONAL = "custom-value";
      
      const result = getEnv("TEST_OPTIONAL", "default");
      
      expect(result).toBe("custom-value");
    });

    it("should return default when not set", () => {
      const result = getEnv("TEST_OPTIONAL", "default-value");
      
      expect(result).toBe("default-value");
    });

    it("should return default when set to empty string", () => {
      process.env.TEST_OPTIONAL = "";
      
      const result = getEnv("TEST_OPTIONAL", "default");
      
      expect(result).toBe("default");
    });
  });

  describe("getOptionalEnv", () => {
    it("should return the value when set", () => {
      process.env.TEST_OPTIONAL = "some-value";
      
      const result = getOptionalEnv("TEST_OPTIONAL");
      
      expect(result).toBe("some-value");
    });

    it("should return undefined when not set", () => {
      const result = getOptionalEnv("TEST_OPTIONAL");
      
      expect(result).toBeUndefined();
    });

    it("should return undefined when set to empty string", () => {
      process.env.TEST_OPTIONAL = "";
      
      const result = getOptionalEnv("TEST_OPTIONAL");
      
      expect(result).toBeUndefined();
    });
  });

  describe("getEnvAsNumber", () => {
    it("should parse valid integer", () => {
      process.env.TEST_NUMBER = "42";
      
      const result = getEnvAsNumber("TEST_NUMBER", 0);
      
      expect(result).toBe(42);
    });

    it("should parse valid float", () => {
      process.env.TEST_NUMBER = "3.14";
      
      const result = getEnvAsNumber("TEST_NUMBER", 0);
      
      expect(result).toBe(3.14);
    });

    it("should parse negative numbers", () => {
      process.env.TEST_NUMBER = "-100";
      
      const result = getEnvAsNumber("TEST_NUMBER", 0);
      
      expect(result).toBe(-100);
    });

    it("should return default when not set", () => {
      const result = getEnvAsNumber("TEST_NUMBER", 999);
      
      expect(result).toBe(999);
    });

    it("should return default when not a valid number", () => {
      process.env.TEST_NUMBER = "not-a-number";
      
      const result = getEnvAsNumber("TEST_NUMBER", 123);
      
      expect(result).toBe(123);
    });

    it("should return default for empty string", () => {
      process.env.TEST_NUMBER = "";
      
      const result = getEnvAsNumber("TEST_NUMBER", 456);
      
      expect(result).toBe(456);
    });
  });

  describe("getEnvAsBoolean", () => {
    it.each([
      ["true", true],
      ["TRUE", true],
      ["True", true],
      ["1", true],
      ["yes", true],
      ["YES", true],
    ])("should parse '%s' as true", (input, expected) => {
      process.env.TEST_BOOLEAN = input;
      
      const result = getEnvAsBoolean("TEST_BOOLEAN", false);
      
      expect(result).toBe(expected);
    });

    it.each([
      ["false", false],
      ["FALSE", false],
      ["False", false],
      ["0", false],
      ["no", false],
      ["NO", false],
    ])("should parse '%s' as false", (input, expected) => {
      process.env.TEST_BOOLEAN = input;
      
      const result = getEnvAsBoolean("TEST_BOOLEAN", true);
      
      expect(result).toBe(expected);
    });

    it("should return default when not set", () => {
      expect(getEnvAsBoolean("TEST_BOOLEAN", true)).toBe(true);
      expect(getEnvAsBoolean("TEST_BOOLEAN", false)).toBe(false);
    });

    it("should return default for unrecognized value", () => {
      process.env.TEST_BOOLEAN = "maybe";
      
      const result = getEnvAsBoolean("TEST_BOOLEAN", true);
      
      expect(result).toBe(true);
    });
  });

  describe("validateRequiredEnvVars", () => {
    it("should not throw when all vars are set", () => {
      process.env.TEST_VAR_1 = "value1";
      process.env.TEST_VAR_2 = "value2";
      
      expect(() => 
        validateRequiredEnvVars(["TEST_VAR_1", "TEST_VAR_2"])
      ).not.toThrow();
    });

    it("should throw when one var is missing", () => {
      process.env.TEST_VAR_1 = "value1";
      
      expect(() => 
        validateRequiredEnvVars(["TEST_VAR_1", "TEST_VAR_2"])
      ).toThrow(EnvError);
      expect(() => 
        validateRequiredEnvVars(["TEST_VAR_1", "TEST_VAR_2"])
      ).toThrow(/TEST_VAR_2/);
    });

    it("should throw when multiple vars are missing", () => {
      expect(() => 
        validateRequiredEnvVars(["TEST_VAR_1", "TEST_VAR_2"])
      ).toThrow(/TEST_VAR_1.*TEST_VAR_2|TEST_VAR_2.*TEST_VAR_1/);
    });

    it("should not throw for empty array", () => {
      expect(() => validateRequiredEnvVars([])).not.toThrow();
    });
  });

  describe("EnvError", () => {
    it("should have correct name property", () => {
      const error = new EnvError("MY_VAR", "Test message");
      
      expect(error.name).toBe("EnvError");
    });

    it("should store the variable name", () => {
      const error = new EnvError("MY_VAR", "Test message");
      
      expect(error.varName).toBe("MY_VAR");
    });

    it("should be an instance of Error", () => {
      const error = new EnvError("MY_VAR", "Test message");
      
      expect(error).toBeInstanceOf(Error);
    });
  });
});
