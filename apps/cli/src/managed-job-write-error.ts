import { CliUsageError } from "./cli-usage-error.js";

export class ManagedJobDefaultServerWriteError extends CliUsageError {
  constructor(method: string, origin: string) {
    super({
      code: "managed_job_default_server_write",
      message: `Managed job refused ${method} ${origin}; set BB_SERVER_URL to your isolated server and verify its exact dataDir with bb status --json before writing.`,
      hint: null,
    });
    this.name = "ManagedJobDefaultServerWriteError";
  }
}
