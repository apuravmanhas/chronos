import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { PolicyParser } from './parser.js';
import type { PolicyDefinition } from '../types/policy.js';
import { PolicyNotFoundError } from '../types/errors.js';

/**
 * Manages loading, indexing, and retrieving policy definitions.
 *
 * Policies are loaded from a directory tree and indexed by name.
 * Multiple versions of the same policy can coexist.
 */
export class PolicyManager {
  private policies: Map<string, PolicyDefinition[]> = new Map();
  private parser: PolicyParser;
  private loadPath: string;

  constructor(policiesPath: string) {
    this.parser = new PolicyParser();
    this.loadPath = policiesPath;
  }

  /**
   * Load all policy files from the configured directory (recursively).
   */
  async loadAll(): Promise<void> {
    this.policies.clear();
    await this.scanDirectory(this.loadPath);

    // Sort versions descending for each policy name
    for (const versions of this.policies.values()) {
      versions.sort((a, b) => b.metadata.version.localeCompare(a.metadata.version));
    }
  }

  /**
   * Recursively scan a directory for .policy.yaml files.
   */
  private async scanDirectory(dirPath: string): Promise<void> {
    let entries: string[];
    try {
      entries = await fs.readdir(dirPath);
    } catch {
      // Directory doesn't exist — not an error for MVP
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry);
      const stat = await fs.stat(fullPath);

      if (stat.isDirectory()) {
        await this.scanDirectory(fullPath);
      } else if (entry.endsWith('.policy.yaml') || entry.endsWith('.policy.yml')) {
        try {
          const policy = await this.parser.parseFile(fullPath);
          const name = policy.metadata.name;

          if (!this.policies.has(name)) {
            this.policies.set(name, []);
          }
          this.policies.get(name)!.push(policy);
        } catch (error) {
          console.warn(`Skipping invalid policy file ${fullPath}:`, error);
        }
      }
    }
  }

  /**
   * Get a policy by name and optionally version.
   * If version is omitted, returns the latest version.
   * Returns null if not found.
   */
  async getPolicy(name: string, version?: string): Promise<PolicyDefinition | null> {
    const versions = this.policies.get(name);
    if (!versions || versions.length === 0) {
      return null;
    }

    if (version) {
      return versions.find(p => p.metadata.version === version) || null;
    }

    // Return latest version (already sorted descending)
    return versions[0];
  }

  /**
   * Return a list of all loaded policies.
   */
  listPolicies(): PolicyDefinition[] {
    const all: PolicyDefinition[] = [];
    for (const versions of this.policies.values()) {
      all.push(...versions);
    }
    return all;
  }

  /**
   * Reload all policies from the configured directory.
   */
  async reload(): Promise<void> {
    await this.loadAll();
  }
}
