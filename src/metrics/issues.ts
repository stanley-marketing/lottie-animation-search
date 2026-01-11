/**
 * IssueCollector - Handles issue reporting and persistence.
 *
 * Features:
 * - Async write queue to avoid blocking tool execution
 * - Maximum issue limit to prevent unbounded growth
 * - Fail-silent with logging on errors
 */

import {
  IssuesData,
  IssueReport,
  IssueSeverity,
  IssueCategory,
  createEmptyIssuesData,
} from "./types.js";
import {
  loadIssues,
  saveIssues,
  initializeIssuesFile,
  getIssuesFilePath,
} from "./storage.js";

/** Maximum number of issues to keep in the file */
const MAX_ISSUES = 100;

export class IssueCollector {
  private data: IssuesData;
  private serverName: string;
  private writeQueue: Promise<void> = Promise.resolve();
  private initialized: boolean = false;

  constructor(serverName: string) {
    this.serverName = serverName;
    // Start with empty data, will be populated on init
    this.data = createEmptyIssuesData(serverName);
  }

  /**
   * Initializes the collector by loading existing issues or creating a new file.
   * Should be called once at server startup.
   */
  async initialize(): Promise<void> {
    try {
      await initializeIssuesFile(this.serverName);
      this.data = await loadIssues(this.serverName);
      this.initialized = true;
    } catch (error) {
      console.error("Failed to initialize issues:", error);
      // Continue with empty data
      this.data = createEmptyIssuesData(this.serverName);
      this.initialized = true;
    }
  }

  /**
   * Generates a simple unique ID for issues.
   */
  private generateIssueId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `${timestamp}-${random}`;
  }

  /**
   * Reports a new issue.
   * Updates in-memory data immediately, queues async write to disk.
   *
   * @returns The created issue report
   */
  report(params: {
    title: string;
    description: string;
    severity: IssueSeverity;
    category: IssueCategory;
    steps_to_reproduce?: string;
    expected_behavior?: string;
    actual_behavior?: string;
    environment?: string;
  }): IssueReport {
    if (!this.initialized) {
      throw new Error("IssueCollector not initialized");
    }

    // Create new issue
    const issue: IssueReport = {
      id: this.generateIssueId(),
      title: params.title,
      description: params.description,
      severity: params.severity,
      category: params.category,
      steps_to_reproduce: params.steps_to_reproduce,
      expected_behavior: params.expected_behavior,
      actual_behavior: params.actual_behavior,
      environment: params.environment,
      created_at: new Date().toISOString(),
    };

    // Add to beginning of array (newest first)
    this.data.issues.unshift(issue);
    this.data.total_issues++;
    this.data.updated_at = new Date().toISOString();

    // Trim old issues if we exceed the limit
    if (this.data.issues.length > MAX_ISSUES) {
      this.data.issues = this.data.issues.slice(0, MAX_ISSUES);
    }

    // Queue async write (non-blocking, fire-and-forget)
    this.writeQueue = this.writeQueue
      .then(() => this.persistToDisk())
      .catch((error) => {
        console.error("Failed to persist issues:", error);
      });

    return issue;
  }

  /**
   * Persists issues to disk.
   */
  private async persistToDisk(): Promise<void> {
    try {
      await saveIssues(this.data);
    } catch (error) {
      console.error("Failed to save issues:", error);
    }
  }

  /**
   * Gets the current issues data (for testing/debugging).
   */
  getData(): IssuesData {
    return this.data;
  }

  /**
   * Gets the path to the issues file.
   */
  getFilePath(): string {
    return getIssuesFilePath(this.serverName);
  }
}
