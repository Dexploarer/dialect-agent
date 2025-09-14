import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { z } from 'zod';

/**
 * String utilities
 */
export class StringUtils {
  /**
   * Truncate string to specified length with ellipsis
   */
  static truncate(str: string, maxLength: number, suffix = '...'): string {
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength - suffix.length) + suffix;
  }

  /**
   * Convert string to slug format
   */
  static slugify(str: string): string {
    return str
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  /**
   * Extract keywords from text
   */
  static extractKeywords(text: string, minLength = 3): string[] {
    const words = text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length >= minLength);

    // Remove duplicates and return
    return Array.from(new Set(words));
  }

  /**
   * Clean text for processing
   */
  static cleanText(text: string): string {
    return text
      .replace(/\s+/g, ' ')
      .replace(/\n+/g, '\n')
      .trim();
  }

  /**
   * Count words in text
   */
  static wordCount(text: string): number {
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
  }

  /**
   * Generate random string
   */
  static randomString(length: number, charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'): string {
    let result = '';
    for (let i = 0; i < length; i++) {
      result += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    return result;
  }

  /**
   * Check if string is valid email
   */
  static isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Escape HTML characters
   */
  static escapeHtml(text: string): string {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return text.replace(/[&<>"']/g, m => map[m]);
  }
}

/**
 * Date and time utilities
 */
export class DateUtils {
  /**
   * Format date to ISO string
   */
  static toISOString(date: Date = new Date()): string {
    return date.toISOString();
  }

  /**
   * Format date to human readable string
   */
  static toHumanString(date: Date): string {
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  /**
   * Get relative time string (e.g., "2 minutes ago")
   */
  static getRelativeTime(date: Date): string {
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) return 'just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} minutes ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`;
    if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 86400)} days ago`;
    if (diffInSeconds < 31536000) return `${Math.floor(diffInSeconds / 2592000)} months ago`;
    return `${Math.floor(diffInSeconds / 31536000)} years ago`;
  }

  /**
   * Add days to date
   */
  static addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  /**
   * Check if date is within range
   */
  static isWithinRange(date: Date, startDate: Date, endDate: Date): boolean {
    return date >= startDate && date <= endDate;
  }

  /**
   * Get start of day
   */
  static startOfDay(date: Date): Date {
    const result = new Date(date);
    result.setHours(0, 0, 0, 0);
    return result;
  }

  /**
   * Get end of day
   */
  static endOfDay(date: Date): Date {
    const result = new Date(date);
    result.setHours(23, 59, 59, 999);
    return result;
  }
}

/**
 * Array utilities
 */
export class ArrayUtils {
  /**
   * Chunk array into smaller arrays
   */
  static chunk<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Remove duplicates from array
   */
  static unique<T>(array: T[]): T[] {
    return Array.from(new Set(array));
  }

  /**
   * Group array by key function
   */
  static groupBy<T, K extends string | number | symbol>(
    array: T[],
    keyFn: (item: T) => K
  ): Record<K, T[]> {
    return array.reduce((groups, item) => {
      const key = keyFn(item);
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(item);
      return groups;
    }, {} as Record<K, T[]>);
  }

  /**
   * Shuffle array randomly
   */
  static shuffle<T>(array: T[]): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  /**
   * Get random item from array
   */
  static randomItem<T>(array: T[]): T | undefined {
    if (array.length === 0) return undefined;
    return array[Math.floor(Math.random() * array.length)];
  }

  /**
   * Check if arrays are equal
   */
  static areEqual<T>(arr1: T[], arr2: T[]): boolean {
    if (arr1.length !== arr2.length) return false;
    return arr1.every((item, index) => item === arr2[index]);
  }
}

/**
 * Object utilities
 */
export class ObjectUtils {
  /**
   * Deep clone object
   */
  static deepClone<T>(obj: T): T {
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof Date) return new Date(obj.getTime()) as T;
    if (obj instanceof Array) return obj.map(item => ObjectUtils.deepClone(item)) as T;

    const clonedObj = {} as T;
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        clonedObj[key] = ObjectUtils.deepClone(obj[key]);
      }
    }
    return clonedObj;
  }

  /**
   * Deep merge objects
   */
  static deepMerge<T extends Record<string, any>>(target: T, ...sources: Partial<T>[]): T {
    if (!sources.length) return target;
    const source = sources.shift();

    if (ObjectUtils.isObject(target) && ObjectUtils.isObject(source)) {
      for (const key in source) {
        if (ObjectUtils.isObject(source[key])) {
          if (!target[key]) Object.assign(target, { [key]: {} });
          ObjectUtils.deepMerge(target[key], source[key]);
        } else {
          Object.assign(target, { [key]: source[key] });
        }
      }
    }

    return ObjectUtils.deepMerge(target, ...sources);
  }

  /**
   * Check if value is object
   */
  static isObject(item: any): item is Record<string, any> {
    return item && typeof item === 'object' && !Array.isArray(item);
  }

  /**
   * Get nested property value
   */
  static getNestedValue<T = any>(obj: Record<string, any>, path: string): T | undefined {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  /**
   * Set nested property value
   */
  static setNestedValue(obj: Record<string, any>, path: string, value: any): void {
    const keys = path.split('.');
    const lastKey = keys.pop()!;
    const target = keys.reduce((current, key) => {
      if (!current[key] || typeof current[key] !== 'object') {
        current[key] = {};
      }
      return current[key];
    }, obj);
    target[lastKey] = value;
  }

  /**
   * Remove undefined properties from object
   */
  static removeUndefined<T extends Record<string, any>>(obj: T): Partial<T> {
    const result: Partial<T> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        result[key as keyof T] = value;
      }
    }
    return result;
  }
}

/**
 * Environment utilities
 */
export class EnvUtils {
  /**
   * Get environment variable with default
   */
  static get(key: string, defaultValue?: string): string | undefined {
    return process.env[key] || defaultValue;
  }

  /**
   * Get required environment variable
   */
  static getRequired(key: string): string {
    const value = process.env[key];
    if (!value) {
      throw new Error(`Required environment variable ${key} is not set`);
    }
    return value;
  }

  /**
   * Get boolean environment variable
   */
  static getBoolean(key: string, defaultValue = false): boolean {
    const value = process.env[key];
    if (!value) return defaultValue;
    return ['true', '1', 'yes', 'on'].includes(value.toLowerCase());
  }

  /**
   * Get number environment variable
   */
  static getNumber(key: string, defaultValue?: number): number | undefined {
    const value = process.env[key];
    if (!value) return defaultValue;
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? defaultValue : parsed;
  }

  /**
   * Get array environment variable (comma-separated)
   */
  static getArray(key: string, defaultValue: string[] = []): string[] {
    const value = process.env[key];
    if (!value) return defaultValue;
    return value.split(',').map(item => item.trim()).filter(Boolean);
  }

  /**
   * Check if running in production
   */
  static isProduction(): boolean {
    return process.env.NODE_ENV === 'production';
  }

  /**
   * Check if running in development
   */
  static isDevelopment(): boolean {
    return process.env.NODE_ENV === 'development';
  }

  /**
   * Check if running in test
   */
  static isTest(): boolean {
    return process.env.NODE_ENV === 'test';
  }
}

/**
 * File system utilities
 */
export class FileUtils {
  /**
   * Ensure directory exists
   */
  static ensureDir(dirPath: string): void {
    const fullPath = resolve(dirPath);
    if (!existsSync(fullPath)) {
      mkdirSync(fullPath, { recursive: true });
    }
  }

  /**
   * Read JSON file
   */
  static readJson<T = any>(filePath: string): T {
    const content = readFileSync(resolve(filePath), 'utf8');
    return JSON.parse(content);
  }

  /**
   * Write JSON file
   */
  static writeJson(filePath: string, data: any, pretty = true): void {
    const fullPath = resolve(filePath);
    FileUtils.ensureDir(dirname(fullPath));
    const content = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
    writeFileSync(fullPath, content, 'utf8');
  }

  /**
   * Get file extension
   */
  static getExtension(filePath: string): string {
    return filePath.split('.').pop()?.toLowerCase() || '';
  }

  /**
   * Get file size in bytes
   */
  static getFileSize(filePath: string): number {
    try {
      const stats = require('fs').statSync(filePath);
      return stats.size;
    } catch {
      return 0;
    }
  }

  /**
   * Format file size for humans
   */
  static formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

/**
 * Validation utilities
 */
export class ValidationUtils {
  /**
   * Validate using Zod schema with custom error formatting
   */
  static validate<T>(schema: z.ZodSchema<T>, data: unknown): { success: true; data: T } | { success: false; errors: string[] } {
    const result = schema.safeParse(data);
    if (result.success) {
      return { success: true, data: result.data };
    }

    const errors = result.error.errors.map(err => {
      const path = err.path.join('.');
      return `${path ? `${path}: ` : ''}${err.message}`;
    });

    return { success: false, errors };
  }

  /**
   * Check if string is valid UUID
   */
  static isUUID(str: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(str);
  }

  /**
   * Check if string is valid URL
   */
  static isURL(str: string): boolean {
    try {
      new URL(str);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Sanitize input string
   */
  static sanitizeString(input: string): string {
    return input
      .replace(/[<>]/g, '') // Remove potential HTML tags
      .replace(/javascript:/gi, '') // Remove javascript: protocol
      .trim();
  }
}

/**
 * Crypto utilities
 */
export class CryptoUtils {
  /**
   * Generate hash of string
   */
  static hash(input: string, algorithm: 'md5' | 'sha1' | 'sha256' | 'sha512' = 'sha256'): string {
    return createHash(algorithm).update(input).digest('hex');
  }

  /**
   * Generate content hash for caching
   */
  static contentHash(content: string): string {
    return CryptoUtils.hash(content, 'sha256').substring(0, 16);
  }

  /**
   * Generate secure random token
   */
  static generateToken(length = 32): string {
    const bytes = require('crypto').randomBytes(length);
    return bytes.toString('hex');
  }
}

/**
 * Performance utilities
 */
export class PerformanceUtils {
  private static timers = new Map<string, number>();

  /**
   * Start timing operation
   */
  static startTimer(name: string): void {
    PerformanceUtils.timers.set(name, Date.now());
  }

  /**
   * End timing operation and return duration
   */
  static endTimer(name: string): number {
    const startTime = PerformanceUtils.timers.get(name);
    if (!startTime) {
      throw new Error(`Timer ${name} was not started`);
    }
    const duration = Date.now() - startTime;
    PerformanceUtils.timers.delete(name);
    return duration;
  }

  /**
   * Measure async function execution time
   */
  static async measureAsync<T>(fn: () => Promise<T>): Promise<{ result: T; duration: number }> {
    const start = Date.now();
    const result = await fn();
    const duration = Date.now() - start;
    return { result, duration };
  }

  /**
   * Debounce function calls
   */
  static debounce<T extends (...args: any[]) => any>(
    func: T,
    wait: number
  ): (...args: Parameters<T>) => void {
    let timeout: NodeJS.Timeout;
    return (...args: Parameters<T>) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func(...args), wait);
    };
  }

  /**
   * Throttle function calls
   */
  static throttle<T extends (...args: any[]) => any>(
    func: T,
    limit: number
  ): (...args: Parameters<T>) => void {
    let inThrottle: boolean;
    return (...args: Parameters<T>) => {
      if (!inThrottle) {
        func(...args);
        inThrottle = true;
        setTimeout(() => (inThrottle = false), limit);
      }
    };
  }
}

/**
 * Math utilities for vector operations
 */
export class MathUtils {
  /**
   * Calculate dot product of two vectors
   */
  static dotProduct(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have the same length');
    }
    return a.reduce((sum, ai, i) => sum + ai * b[i], 0);
  }

  /**
   * Calculate vector magnitude (Euclidean norm)
   */
  static magnitude(vector: number[]): number {
    return Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  static cosineSimilarity(a: number[], b: number[]): number {
    const dotProd = MathUtils.dotProduct(a, b);
    const magnitudeA = MathUtils.magnitude(a);
    const magnitudeB = MathUtils.magnitude(b);

    if (magnitudeA === 0 || magnitudeB === 0) return 0;
    return dotProd / (magnitudeA * magnitudeB);
  }

  /**
   * Normalize vector to unit length
   */
  static normalize(vector: number[]): number[] {
    const mag = MathUtils.magnitude(vector);
    if (mag === 0) return vector;
    return vector.map(val => val / mag);
  }

  /**
   * Clamp number between min and max
   */
  static clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }

  /**
   * Round number to specified decimal places
   */
  static round(value: number, decimals: number): number {
    return Math.round(value * Math.pow(10, decimals)) / Math.pow(10, decimals);
  }
}

/**
 * Error utilities
 */
export class ErrorUtils {
  /**
   * Create standardized API error
   */
  static createAPIError(message: string, code = 'UNKNOWN_ERROR', details?: any) {
    const error = new Error(message) as any;
    error.code = code;
    error.details = details;
    error.timestamp = new Date().toISOString();
    return error;
  }

  /**
   * Check if error is instance of specific type
   */
  static isInstanceOf(error: unknown, type: string): boolean {
    return error instanceof Error && error.constructor.name === type;
  }

  /**
   * Extract error message safely
   */
  static getErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    return 'Unknown error occurred';
  }

  /**
   * Log error with context
   */
  static logError(error: unknown, context?: Record<string, any>): void {
    console.error('Error occurred:', {
      message: ErrorUtils.getErrorMessage(error),
      stack: error instanceof Error ? error.stack : undefined,
      context,
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * Retry utilities
 */
export class RetryUtils {
  /**
   * Retry async operation with exponential backoff
   */
  static async withRetry<T>(
    operation: () => Promise<T>,
    maxRetries = 3,
    baseDelay = 1000,
    maxDelay = 30000
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt === maxRetries) {
          throw lastError;
        }

        const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError!;
  }
}

// Export all utilities as a single object for convenience
export const Utils = {
  String: StringUtils,
  Date: DateUtils,
  Array: ArrayUtils,
  Object: ObjectUtils,
  Env: EnvUtils,
  File: FileUtils,
  Validation: ValidationUtils,
  Crypto: CryptoUtils,
  Performance: PerformanceUtils,
  Math: MathUtils,
  Error: ErrorUtils,
  Retry: RetryUtils,
};

// Export individual utilities as well
export {
  StringUtils,
  DateUtils,
  ArrayUtils,
  ObjectUtils,
  EnvUtils,
  FileUtils,
  ValidationUtils,
  CryptoUtils,
  PerformanceUtils,
  MathUtils,
  ErrorUtils,
  RetryUtils,
};
