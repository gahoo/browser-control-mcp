import type { RunPromptExtensionMessage } from "@browser-control-mcp/common";
import { WebsocketClient } from "./client";
import { MessageHandler } from "./message-handler";
import { getConfig, generateSecret } from "./extension-config";

interface ConnectedClient {
  client: WebsocketClient;
  messageHandler: MessageHandler;
}

const clients: ConnectedClient[] = [];

function initClient(port: number, secret: string) {
  console.log("[Extension] Initializing client:", { port });
  const wsClient = new WebsocketClient(port, secret);
  const messageHandler = new MessageHandler(wsClient);

  clients.push({ client: wsClient, messageHandler });

  wsClient.connect();

  wsClient.addMessageListener(async (message) => {
    console.log("[Extension] Message from server:", { cmd: message.cmd, correlationId: message.correlationId });

    try {
      await messageHandler.handleDecodedMessage(message);
    } catch (error) {
      console.error("[Extension] Error handling message:", { cmd: message.cmd, correlationId: message.correlationId, error });
      if (error instanceof Error) {
        await wsClient.sendErrorToServer(message.correlationId, error.message);
      }
    }
  });

  console.log("[Extension] Client initialized for port:", { port });
}

// Listen for messages from popup
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "run-prompt") {
    console.log("[Background] Received run-prompt request");
    const activeClient = clients[0];
    if (!activeClient) {
      console.warn("[Background] No active client to handle prompt");
      return Promise.resolve({ error: "No connection to MCP server" });
    }

    const correlationId = Math.random().toString(36).substring(2);
    const promptMsg: RunPromptExtensionMessage = {
      resource: "run-prompt-request",
      correlationId,
      prompt: message.prompt,
      model: message.model
    };

    try {
      activeClient.client.sendResourceToServer(promptMsg);
      return activeClient.messageHandler.waitForPromptResult(correlationId);
    } catch (e: any) {
      return Promise.resolve({ error: e.message });
    }
  } else if (message.type === "get-server-status") {
    console.log("[Background] Received get-server-status request");
    const activeClient = clients[0];
    if (!activeClient) {
      return Promise.resolve({ error: "No connection to MCP server" });
    }
    const correlationId = Math.random().toString(36).substring(2);
    // Use proper message type from common
    // But direct object is easier for now in background.ts without importing everything
    const statusMsg = {
      resource: "get-server-status",
      correlationId
    };

    try {
      activeClient.client.sendResourceToServer(statusMsg as any);
      return activeClient.messageHandler.waitForResponse(correlationId);
    } catch (e: any) {
      return Promise.resolve({ error: e.message });
    }
  } else if (message.type === "get-connection-status") {
    const activeClient = clients[0];
    if (!activeClient) {
      return Promise.resolve({ isConnected: false, error: "No client initialized" });
    }
    const status = activeClient.client.getConnectionStatus();
    return Promise.resolve({ isConnected: status.isConnected });
  }
  return undefined; // return false/undefined for other messages
});

async function initExtension() {
  console.log("[Extension] Starting extension initialization...");
  let config = await getConfig();
  if (!config.secret) {
    console.log("[Extension] No secret found, generating new one");
    await generateSecret();
    // Open the options page to allow the user to view the config:
    await browser.runtime.openOptionsPage();
    config = await getConfig();
  }
  console.log("[Extension] Configuration loaded:", { ports: config.ports, hasSecret: !!config.secret });
  return config;
}

initExtension()
  .then((config) => {
    const secret = config.secret;

    if (!secret) {
      console.error("[Extension] Secret not found in storage - reinstall extension");
      return;
    }
    const portList = config.ports;
    if (portList.length === 0) {
      console.error("[Extension] No ports configured in extension config");
      return;
    }
    console.log("[Extension] Starting clients for ports:", { ports: portList });
    for (const port of portList) {
      initClient(port, secret);
    }
    console.log("[Extension] Browser extension fully initialized", { portCount: portList.length });
  })
  .catch((error) => {
    console.error("[Extension] Critical error initializing extension:", error);
  });
