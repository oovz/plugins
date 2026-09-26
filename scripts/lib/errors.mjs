export class CliError extends Error {
  constructor(message, exitCode = 2, details = undefined) {
    super(message);
    this.name = "CliError";
    this.exitCode = exitCode;
    if (details !== undefined) this.details = details;
  }
}
