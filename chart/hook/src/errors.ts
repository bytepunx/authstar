/**
 * ProvisionError names exactly which service and which signet call failed,
 * so the hook's fail-fast log line (Story 001: "logs which service and
 * which call failed, stops immediately") never leaves an operator guessing.
 */
export class ProvisionError extends Error {
  readonly service: string;
  readonly call: string;
  readonly cause: unknown;

  constructor(service: string, call: string, cause: unknown) {
    const causeMessage = cause instanceof Error ? cause.message : String(cause);
    super(`${service}: ${call} failed: ${causeMessage}`);
    this.name = "ProvisionError";
    this.service = service;
    this.call = call;
    this.cause = cause;
  }
}
