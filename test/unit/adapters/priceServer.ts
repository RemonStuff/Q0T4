import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

export interface Reply {
  readonly status: number;
  readonly body?: string;
  readonly headers?: Record<string, string>;
  /** Never answer, to test the client's timeout. */
  readonly hang?: boolean;
}

export type Route = Reply | ((request: IncomingMessage) => Reply);

/** A tiny local HTTP server: tests point the adapters at it and never touch the real network. */
export class PriceServer {
  readonly requests: { readonly path: string; readonly headers: IncomingMessage["headers"] }[] = [];
  private readonly server: Server;
  private readonly sockets = new Set<ServerResponse>();

  private constructor(private readonly routes: Map<string, Route>) {
    this.server = createServer((request, response) => {
      this.requests.push({ path: request.url ?? "", headers: request.headers });
      const route = this.routes.get(request.url ?? "") ?? { status: 404 };
      const reply = typeof route === "function" ? route(request) : route;
      if (reply.hang === true) {
        this.sockets.add(response);
        return;
      }
      response.writeHead(reply.status, reply.headers);
      response.end(reply.body ?? "");
    });
  }

  static async start(routes: Record<string, Route>): Promise<PriceServer> {
    const server = new PriceServer(new Map(Object.entries(routes)));
    await new Promise<void>((resolve) => server.server.listen(0, "127.0.0.1", resolve));
    return server;
  }

  get base(): string {
    return `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
  }

  set(path: string, route: Route): void {
    this.routes.set(path, route);
  }

  async stop(): Promise<void> {
    for (const response of this.sockets) response.destroy();
    this.server.closeAllConnections();
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }
}
