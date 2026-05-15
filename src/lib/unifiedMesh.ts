// Unified Mesh Manager - Combines BLE, Wi-Fi Direct, and Relay nodes
// Provides seamless multi-transport mesh networking for offline communication

import { bluetoothMesh, MeshNode, MeshMessage } from './bluetoothMesh';
import { wifiMesh, WifiMeshNode, WifiMessage } from './wifiMesh';
import { relayProtocol, RelayAnnounce, RelayPacket, RELAY_PROTOCOL } from './relayProtocol';

export interface UnifiedNode {
  id: string;
  name: string;
  transport: 'ble' | 'wifi' | 'relay';
  deviceId: string;
  signal: number;
  lastSeen: number;
  isRelay: boolean;
  isGateway: boolean;
}

export interface MeshMessage {
  id: string;
  type: 'chat' | 'receipt' | 'call' | 'file' | 'presence';
  payload: any;
  senderId: string;
  senderName: string;
  destinationId?: string;
  hopCount: number;
  hopLimit: number;
  timestamp: number;
  status: 'pending' | 'delivered' | 'failed';
}

interface MeshConfig {
  bleEnabled: boolean;
  wifiEnabled: boolean;
  relayEnabled: boolean;
  maxHops: number;
  messageTTL: number;
}

const DEFAULT_CONFIG: MeshConfig = {
  bleEnabled: true,
  wifiEnabled: true,
  relayEnabled: true,
  maxHops: 10,
  messageTTL: 3600000 // 1 hour
};

type MessageHandler = (message: MeshMessage) => void;
type NodeHandler = (node: UnifiedNode) => void;

class UnifiedMeshManager {
  private config: MeshConfig;
  private localId = '';
  private localName = '';
  private onNodeDiscovered: NodeHandler | null = null;
  private onMessageReceived: MessageHandler | null = null;

  // All discovered nodes across all transports
  private nodes: Map<string, UnifiedNode> = new Map();

  // Message queue for delay-tolerant delivery
  private messageQueue: Map<string, MeshMessage> = new Map();

  // Track seen messages to prevent loops
  private seenMessages: Set<string> = new Set();

  // Periodic tasks
  private cleanupInterval: NodeJS.Timeout | null = null;
  private broadcastInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.config = DEFAULT_CONFIG;
  }

  async initialize(
    localId: string,
    localName: string,
    onMessage: MessageHandler,
    onNode: NodeHandler
  ): Promise<void> {
    this.localId = localId;
    this.localName = localName;
    this.onMessageReceived = onMessage;
    this.onNodeDiscovered = onNode;

    console.log('Initializing unified mesh for:', localName);

    // Initialize all transports
    await Promise.all([
      this.initializeBLE(),
      this.initializeWiFi()
    ]);

    // Start periodic tasks
    this.startPeriodicTasks();

    console.log('Unified mesh ready');
  }

  private async initializeBLE() {
    if (!this.config.bleEnabled) return;

    try {
      await bluetoothMesh.initialize();
      await bluetoothMesh.startDiscovery((node: MeshNode) => {
        this.handleBLENode(node);
      });
      await bluetoothMesh.startAdvertising(
        this.localId,
        this.localName,
        (deviceId: string, message: MeshMessage) => {
          this.handleIncomingMessage('ble', deviceId, message);
        }
      );
      console.log('BLE mesh active');
    } catch (e) {
      console.warn('BLE initialization failed:', e);
    }
  }

  private async initializeWiFi() {
    if (!this.config.wifiEnabled) return;

    try {
      await wifiMesh.initialize();
      await wifiMesh.startAsRelayNode(
        this.localId,
        this.localName,
        (nodeId: string, message: WifiMessage) => {
          this.handleIncomingMessage('wifi', nodeId, message as any);
        }
      );
      await wifiMesh.scanForRelays((node: WifiMeshNode) => {
        this.handleWiFiNode(node);
      });
      console.log('WiFi mesh active');
    } catch (e) {
      console.warn('WiFi mesh initialization failed:', e);
    }
  }

  private async initializeRelays() {
    if (!this.config.relayEnabled) return;

    await relayProtocol.startRelayDiscovery((relay: RelayAnnounce) => {
      this.handleRelayNode(relay);
    });
  }

  // Handle node discovery from different transports
  private handleBLENode(node: MeshNode) {
    const unifiedNode: UnifiedNode = {
      id: node.id,
      name: node.name,
      transport: 'ble',
      deviceId: node.deviceId,
      signal: node.signal,
      lastSeen: node.lastSeen,
      isRelay: false,
      isGateway: false
    };
    this.addNode(unifiedNode);
  }

  private handleWiFiNode(node: WifiMeshNode) {
    const unifiedNode: UnifiedNode = {
      id: node.id,
      name: node.name,
      transport: 'wifi',
      deviceId: node.ssid,
      signal: node.signal,
      lastSeen: node.lastSeen,
      isRelay: node.isRelay,
      isGateway: false
    };
    this.addNode(unifiedNode);
  }

  private handleRelayNode(relay: RelayAnnounce) {
    const unifiedNode: UnifiedNode = {
      id: relay.relayId,
      name: relay.relayName,
      transport: 'relay',
      deviceId: relay.relayId,
      signal: relay.signal,
      lastSeen: Date.now(),
      isRelay: true,
      isGateway: relay.capabilities.includes('gateway')
    };
    this.addNode(unifiedNode);
  }

  private addNode(node: UnifiedNode) {
    const key = `${node.transport}-${node.id}`;
    const existing = this.nodes.get(key);

    if (existing) {
      existing.lastSeen = node.lastSeen;
      existing.signal = node.signal;
    } else {
      this.nodes.set(key, node);
      this.onNodeDiscovered?.(node);
    }
  }

  // Handle incoming messages from any transport
  private handleIncomingMessage(
    transport: 'ble' | 'wifi' | 'relay',
    deviceId: string,
    message: MeshMessage
  ) {
    const messageId = `${message.id}-${message.hopCount}`;

    // Deduplicate
    if (this.seenMessages.has(messageId)) {
      return;
    }
    this.seenMessages.add(messageId);

    // Clean up old seen messages
    if (this.seenMessages.size > 1000) {
      const oldest = this.seenMessages.values().next().value;
      if (oldest) this.seenMessages.delete(oldest);
    }

    // Check if message is for us
    const isForMe = !message.destinationId ||
      message.destinationId === this.localId;

    if (isForMe) {
      this.onMessageReceived?.(message);
    }

    // Forward to next hop if not exhausted
    if (message.hopCount < message.hopLimit) {
      this.forwardMessage(message, transport);
    }
  }

  // Send a message to any node in the mesh
  async sendMessage(
    destinationId: string,
    type: MeshMessage['type'],
    payload: any
  ): Promise<boolean> {
    const messageId = `${this.localId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const message: MeshMessage = {
      id: messageId,
      type,
      payload,
      senderId: this.localId,
      senderName: this.localName,
      destinationId,
      hopCount: 0,
      hopLimit: this.config.maxHops,
      timestamp: Date.now(),
      status: 'pending'
    };

    // Try to find route and send
    const sent = await this.routeMessage(message);

    if (!sent) {
      // Queue for later delivery
      this.queueMessage(message);
    }

    return sent;
  }

  private async routeMessage(message: MeshMessage): Promise<boolean> {
    // Find best path to destination
    const bestRoute = this.findBestRoute(message.destinationId || '');

    if (!bestRoute) {
      return false;
    }

    try {
      if (bestRoute.transport === 'ble') {
        await bluetoothMesh.sendMessage(bestRoute.deviceId, {
          type: message.type as any,
          payload: message.payload,
          senderId: message.senderId,
          timestamp: message.timestamp,
          destinationId: message.destinationId,
          hopCount: message.hopCount,
          messageId: message.id
        });
      } else if (bestRoute.transport === 'wifi') {
        await wifiMesh.sendToNode(bestRoute.deviceId, {
          type: message.type as any,
          payload: message.payload,
          senderId: message.senderId,
          timestamp: message.timestamp,
          destinationId: message.destinationId,
          hopCount: message.hopCount,
          messageId: message.id
        } as any);
      }

      message.status = 'delivered';
      return true;
    } catch (e) {
      console.warn('Route failed:', e);
      return false;
    }
  }

  private findBestRoute(destinationId: string): { transport: 'ble' | 'wifi' | 'relay'; deviceId: string } | null {
    // First check for direct connection
    for (const [key, node] of this.nodes) {
      if (node.id === destinationId) {
        return { transport: node.transport, deviceId: node.deviceId };
      }
    }

    // Check for relay/gateway that might know the path
    for (const [key, node] of this.nodes) {
      if (node.isRelay) {
        return { transport: node.transport, deviceId: node.deviceId };
      }
    }

    return null;
  }

  private async forwardMessage(message: MeshMessage, fromTransport: 'ble' | 'wifi' | 'relay') {
    const forwardedMessage = {
      ...message,
      hopCount: message.hopCount + 1
    };

    // Broadcast to all other nodes
    for (const [key, node] of this.nodes) {
      if (node.transport === fromTransport) continue;

      try {
        if (node.transport === 'ble') {
          await bluetoothMesh.sendMessage(node.deviceId, {
            type: message.type as any,
            payload: message.payload,
            senderId: message.senderId,
            timestamp: message.timestamp,
            destinationId: message.destinationId,
            hopCount: forwardedMessage.hopCount,
            messageId: message.id
          });
        }
      } catch (e) {
        // Continue to next node
      }
    }
  }

  private queueMessage(message: MeshMessage) {
    this.messageQueue.set(message.id, message);
    console.log('Message queued for later delivery:', message.id);
  }

  private startPeriodicTasks() {
    // Clean up stale data and retry messages every 30 seconds
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 30000);

    // Broadcast presence every 10 seconds
    this.broadcastInterval = setInterval(() => {
      this.broadcastPresence();
    }, 10000);
  }

  private cleanup() {
    const now = Date.now();

    // Remove stale nodes
    for (const [key, node] of this.nodes) {
      if (now - node.lastSeen > 60000) {
        this.nodes.delete(key);
      }
    }

    // Retry queued messages
    for (const [id, message] of this.messageQueue) {
      if (now - message.timestamp > this.config.messageTTL) {
        this.messageQueue.delete(id);
        message.status = 'failed';
        continue;
      }

      this.routeMessage(message).then(success => {
        if (success) {
          this.messageQueue.delete(id);
        }
      });
    }

    // Trigger BLE cleanup
    bluetoothMesh.cleanupStaleData();
  }

  private broadcastPresence() {
    const presence: MeshMessage = {
      id: `presence-${Date.now()}`,
      type: 'presence',
      payload: {
        id: this.localId,
        name: this.localName,
        timestamp: Date.now()
      },
      senderId: this.localId,
      senderName: this.localName,
      hopCount: 0,
      hopLimit: 3,
      timestamp: Date.now(),
      status: 'pending'
    };

    // Broadcast via BLE
    for (const [key, node] of this.nodes) {
      if (node.transport === 'ble') {
        bluetoothMesh.sendMessage(node.deviceId, {
          type: 'presence' as any,
          payload: presence.payload,
          senderId: this.localId,
          timestamp: Date.now()
        }).catch(() => {});
      }
    }
  }

  // Public API
  getNodes(): UnifiedNode[] {
    return Array.from(this.nodes.values());
  }

  getNodeCount(): { ble: number; wifi: number; relay: number; total: number } {
    let ble = 0, wifi = 0, relay = 0;
    for (const node of this.nodes.values()) {
      if (node.transport === 'ble') ble++;
      else if (node.transport === 'wifi') wifi++;
      else if (node.transport === 'relay') relay++;
    }
    return { ble, wifi, relay, total: this.nodes.size };
  }

  getPendingMessages(): MeshMessage[] {
    return Array.from(this.messageQueue.values());
  }

  async stop() {
    if (this.cleanupInterval) clearInterval(this.cleanupInterval);
    if (this.broadcastInterval) clearInterval(this.broadcastInterval);

    await bluetoothMesh.stopDiscovery();
    await bluetoothMesh.stopAdvertising();
    await wifiMesh.disconnect();
    relayProtocol.stopRelayDiscovery();

    this.nodes.clear();
    this.messageQueue.clear();
  }
}

export const meshManager = new UnifiedMeshManager();