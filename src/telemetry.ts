import * as vscode from "vscode";

export class TelemetryProvider {
  private static instance: TelemetryProvider;
  private outputChannel: vscode.OutputChannel | undefined;

  private constructor() {
    // Hidden output channel for internal debugging/telemetry logging
    // In a real production app, this would send to an endpoint like AppInsights or Sentry
  }

  public static getInstance(): TelemetryProvider {
    if (!TelemetryProvider.instance) {
      TelemetryProvider.instance = new TelemetryProvider();
    }
    return TelemetryProvider.instance;
  }

  public setOutputChannel(channel: vscode.OutputChannel) {
    this.outputChannel = channel;
  }

  /**
   * Logs an event if telemetry is enabled by the user.
   */
  public logEvent(eventName: string, properties?: Record<string, string | number | boolean>) {
    if (!vscode.env.isTelemetryEnabled) {
      return;
    }

    const timestamp = new Date().toISOString();
    const payload = JSON.stringify({
      event: eventName,
      timestamp,
      ...properties
    });

    // For now, we only log to the output channel if available
    // This serves as a foundation for future integration
    if (this.outputChannel) {
      this.outputChannel.appendLine(`[Telemetry] ${payload}`);
    }
  }

  /**
   * Logs an error if telemetry is enabled.
   */
  public logError(error: Error | string, context?: string) {
    if (!vscode.env.isTelemetryEnabled) {
      return;
    }

    const message = error instanceof Error ? error.message : error;
    const stack = error instanceof Error ? error.stack : undefined;

    this.logEvent("error", {
      message,
      context: context || "unknown",
      stack: stack || "no stack trace"
    });
  }
}
