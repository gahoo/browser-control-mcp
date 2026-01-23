import { WebsocketClient } from "./client";
import { MessageHandler } from "./message-handler";
import { getConfig, generateSecret } from "./extension-config";

function initClient(port: number, secret: string) {
  console.log("[Extension] Initializing client:", { port });
  const wsClient = new WebsocketClient(port, secret);
  const messageHandler = new MessageHandler(wsClient);

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
