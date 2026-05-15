import { BleClient, NumberToUUID } from '@capacitor-community/bluetooth-le';
import { Capacitor } from '@capacitor/core';

const BLUELINK_SERVICE_UUID = '4350-2d32-502d-4d45-5348-2d53-5643'; // CP-P2P-MESH-SVC
const DATA_CHARACTERISTIC_UUID = '4350-2d32-502d-4d45-5348-2d44-5441'; // CP-P2P-MESH-DTA
const MESH_INFO_CHARACTERISTIC_UUID = '4350-2d32-502d-4d45-5348-2d49-4e46'; // CP-P2P-MESH-INF

const MAX_HOPS = 5; // Maximum message relays
const MESSAGE_TTL = 300000; // 5 minutes TTL for undelivered messages
const MESSAGE_CACHE_SIZE = 100; // Max messages to remember (prevent loops)

export interface MeshNode {
  id: string;
  name: string;
  avatar?: string;
  signal: number;
  lastSeen: number;
  deviceId: string;
}

export interface MeshMessage {
  type: 'chat' | 'receipt' | 'call' | 'file' | 'presence';
  payload: any;
  senderId: string;
  timestamp: number;
  destinationId?: string; // For multi-hop routing
  hopCount?: number; // Current hop count
  messageId?: string; // Unique message ID for deduplication
}

interface QueuedMessage {
  message: MeshMessage;
  destinationId: string;
  hopCount: number;
  messageId: string;
  createdAt: number;
}

interface RoutingEntry {
  nodeId: string;
  nextHopDeviceId: string;
  lastUpdated: number;
  hops: number;
}

type MessageHandler = (deviceId: string, message: MeshMessage) => void;
type NodeHandler = (node: MeshNode) => void;

class BluetoothMesh {
  private isInitialized = false;
  private onNodeDiscovered: NodeHandler | null = null;
  private onMessageReceived: MessageHandler | null = null;
  private connectedDevices: Map<string, any> = new Map();
  private isAdvertising = false;
  private localName = '';
  private localId = '';

  // Multi-hop mesh additions
  private messageQueue: QueuedMessage[] = [];
  private routingTable: Map<string, RoutingEntry> = new Map();
  private seenMessages: Set<string> = new Set();
  private neighbors: Map<string, MeshNode> = new Map();

  async initialize() {
    if (this.isInitialized) return;
    if (Capacitor.isNativePlatform()) {
      try {
        await BleClient.initialize();
        this.isInitialized = true;
        console.log('Bluetooth LE initialized for offline mesh');
      } catch (e) {
        console.error('BLE Init failed', e);
      }
    }
  }

  async startDiscovery(onNode: NodeHandler) {
    this.onNodeDiscovered = onNode;
    if (!Capacitor.isNativePlatform()) {
      this.simulateDiscovery();
      return;
    }

    try {
      await BleClient.requestLEScan(
        { services: [] },
        (result) => {
          if (result.device.name?.includes('BlueLink') || result.device.name?.includes('Mesh')) {
            const node: MeshNode = {
              id: this.extractNodeId(result.device.name),
              name: result.device.name || 'BT Node',
              signal: result.rssi || -70,
              lastSeen: Date.now(),
              deviceId: result.device.deviceId
            };
            this.addNeighbor(node); // Register in mesh routing
            this.onNodeDiscovered?.(node);
          }
        }
      );
    } catch (e) {
      console.error('Scan failed', e);
    }
  }

  private extractNodeId(name: string): string {
    if (!name) return '';
    const parts = name.split(':');
    if (parts.length >= 1) {
      const id = parts[0].replace('BlueLink-', '').replace('BlueLink:', '');
      return id.startsWith('bluelink-') ? id : `bluelink-${id}`;
    }
    return name;
  }

  async stopDiscovery() {
    if (Capacitor.isNativePlatform()) {
      await BleClient.stopLEScan().catch(() => {});
    }
  }

  async startAdvertising(peerId: string, name: string, onMessage: MessageHandler) {
    this.onMessageReceived = onMessage;
    this.localName = name;
    this.localId = peerId;

    if (!Capacitor.isNativePlatform()) {
      console.log('Simulating BLE advertising as', `BlueLink:${name}:${peerId}`);
      return;
    }

    try {
      await BleClient.addService({
        uuid: BLUELINK_SERVICE_UUID,
        characteristics: [
          {
            uuid: DATA_CHARACTERISTIC_UUID,
            properties: {
              write: true,
              writeWithoutResponse: true,
              notify: true,
            },
            permissions: {
              write: true,
            },
            onWrite: (deviceId, value) => {
              try {
                const dec = new TextDecoder();
                const json = dec.decode(value);
                const message: MeshMessage = JSON.parse(json);
                // Use multi-hop handler for routing
                this.handleIncomingMessage(deviceId, message);
              } catch (e) {
                console.error('BLE Decode error', e);
              }
            }
          },
          {
            uuid: MESH_INFO_CHARACTERISTIC_UUID,
            properties: {
              read: true,
              notify: true,
            },
            permissions: {
              read: true,
            },
          },
        ],
      });

      await BleClient.startAdvertising({
        name: `BlueLink:${name}:${peerId}`,
        services: [BLUELINK_SERVICE_UUID],
      });
      this.isAdvertising = true;
      console.log('Mesh peripheral active and advertising:', `BlueLink:${name}:${peerId}`);
    } catch (e) {
      console.warn('BLE Peripheral mode not supported/failed', e);
    }
  }

  async stopAdvertising() {
    if (Capacitor.isNativePlatform() && this.isAdvertising) {
      try {
        await BleClient.stopAdvertising();
        this.isAdvertising = false;
      } catch (e) {
        console.error('Failed to stop advertising', e);
      }
    }
  }

  async sendMessage(deviceId: string, message: MeshMessage) {
    if (!Capacitor.isNativePlatform()) {
      console.log('Simulated BLE Send:', deviceId, message);
      return;
    }

    try {
      // First connect if not connected
      let connected = this.connectedDevices.get(deviceId);
      if (!connected) {
        await BleClient.connect(deviceId);
        this.connectedDevices.set(deviceId, true);
      }

      const json = JSON.stringify(message);
      const enc = new TextEncoder();
      const bytes = enc.encode(json);

      await BleClient.write(deviceId, BLUELINK_SERVICE_UUID, DATA_CHARACTERISTIC_UUID, bytes.buffer as any);
      console.log('Message sent to', deviceId);
    } catch (e) {
      console.error('BLE Send failed', e);
    }
  }

  async disconnect(deviceId: string) {
    if (this.connectedDevices.has(deviceId)) {
      try {
        await BleClient.disconnect(deviceId);
        this.connectedDevices.delete(deviceId);
      } catch (e) {
        console.error('Disconnect failed', e);
      }
    }
  }

  async disconnectAll() {
    for (const deviceId of this.connectedDevices.keys()) {
      await this.disconnect(deviceId);
    }
  }

  private simulateDiscovery() {
    const simulation = [
      { id: 'bluelink-nd-55', name: 'Mesh Relay Delta', signal: -82, deviceId: 'sim-55' },
      { id: 'bluelink-nd-67', name: 'Remote Terminal', signal: -67, deviceId: 'sim-67' }
    ];
    simulation.forEach((node, i) => {
      setTimeout(() => {
        this.onNodeDiscovered?.({ ...node, lastSeen: Date.now() });
      }, i * 2000);
    });
  }

  getLocalInfo() {
    return {
      name: this.localName,
      id: this.localId,
      isAdvertising: this.isAdvertising
    };
  }

  // ============================================
  // MULTI-HOP MESH ROUTING IMPLEMENTATION
  // ============================================

  generateMessageId(): string {
    return `${this.localId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  addNeighbor(node: MeshNode) {
    this.neighbors.set(node.deviceId, node);
    this.updateRoutingTable(node);
  }

  removeNeighbor(deviceId: string) {
    this.neighbors.delete(deviceId);
  }

  private updateRoutingTable(node: MeshNode) {
    this.routingTable.set(node.id, {
      nodeId: node.id,
      nextHopDeviceId: node.deviceId,
      lastUpdated: Date.now(),
      hops: 1
    });
  }

  private findRoute(destinationId: string): string | null {
    const entry = this.routingTable.get(destinationId);
    if (entry && Date.now() - entry.lastUpdated < 120000) {
      return entry.nextHopDeviceId;
    }

    for (const [nodeId, entry] of this.routingTable.entries()) {
      if (nodeId === destinationId) {
        return entry.nextHopDeviceId;
      }
    }
    return null;
  }

  private haveSeenMessage(messageId: string): boolean {
    if (this.seenMessages.has(messageId)) {
      return true;
    }
    this.seenMessages.add(messageId);

    if (this.seenMessages.size > MESSAGE_CACHE_SIZE) {
      const oldest = this.seenMessages.values().next().value;
      if (oldest) this.seenMessages.delete(oldest);
    }
    return false;
  }

  async sendMessageToMesh(destinationId: string, message: MeshMessage): Promise<boolean> {
    const messageId = message.messageId || this.generateMessageId();
    const fullMessage: MeshMessage = {
      ...message,
      messageId,
      hopCount: 0,
      destinationId
    };

    // Check if destination is directly connected
    if (destinationId === this.localId) {
      this.onMessageReceived?.(this.localId, fullMessage);
      return true;
    }

    const nextHopDeviceId = this.findRoute(destinationId);

    if (nextHopDeviceId) {
      try {
        await this.sendMessage(nextHopDeviceId, fullMessage);
        console.log(`Routed message to ${destinationId} via ${nextHopDeviceId}`);
        return true;
      } catch (e) {
        console.error('Route failed, queuing message', e);
        this.queueMessage(fullMessage, destinationId);
        return false;
      }
    } else {
      // No route known - queue for when route becomes available
      console.log(`No route to ${destinationId}, queueing message`);
      this.queueMessage(fullMessage, destinationId);
      return false;
    }
  }

  private queueMessage(message: MeshMessage, destinationId: string) {
    const queued: QueuedMessage = {
      message,
      destinationId,
      hopCount: message.hopCount || 0,
      messageId: message.messageId || this.generateMessageId(),
      createdAt: Date.now()
    };
    this.messageQueue.push(queued);

    // Clean old messages
    this.messageQueue = this.messageQueue.filter(
      m => Date.now() - m.createdAt < MESSAGE_TTL
    );
  }

  async retryQueuedMessages() {
    const toRetry = [...this.messageQueue];
    const successfullyDelivered: string[] = [];

    for (const queued of toRetry) {
      const nextHopDeviceId = this.findRoute(queued.destinationId);
      if (nextHopDeviceId) {
        try {
          await this.sendMessage(nextHopDeviceId, {
            ...queued.message,
            hopCount: (queued.message.hopCount || 0) + 1
          });
          successfullyDelivered.push(queued.messageId);
          console.log(`Delivered queued message to ${queued.destinationId}`);
        } catch (e) {
          console.warn('Failed to retry queued message', e);
        }
      }
    }

    // Remove delivered messages
    this.messageQueue = this.messageQueue.filter(
      m => !successfullyDelivered.includes(m.messageId)
    );
  }

  handleIncomingMessage(deviceId: string, message: MeshMessage): boolean {
    const messageId = message.messageId || `${message.senderId}-${message.timestamp}`;

    // Check if we've seen this message before (prevent loops)
    if (this.haveSeenMessage(messageId)) {
      console.log('Duplicate message ignored:', messageId);
      return false;
    }

    const hopCount = (message.hopCount || 0) + 1;

    // Check if this message is for us
    const isForMe = !message.destinationId || message.destinationId === this.localId;

    if (isForMe) {
      // Deliver to app
      this.onMessageReceived?.(deviceId, {
        ...message,
        hopCount
      });
    }

    // Relay to next hop if not exhausted
    if (hopCount < MAX_HOPS && message.destinationId) {
      this.relayMessage(message, hopCount);
    }

    return isForMe;
  }

  private async relayMessage(message: MeshMessage, currentHop: number) {
    const nextHopDeviceId = this.findRoute(message.destinationId);

    if (nextHopDeviceId) {
      try {
        await this.sendMessage(nextHopDeviceId, {
          ...message,
          hopCount: currentHop
        });
        console.log(`Relayed message to ${message.destinationId}, hop ${currentHop}`);
      } catch (e) {
        console.warn('Failed to relay message', e);
        this.queueMessage(message, message.destinationId);
      }
    } else {
      // Queue for later when route becomes available
      this.queueMessage(message, message.destinationId);
    }
  }

  broadcastPresence() {
    const presence: MeshMessage = {
      type: 'presence',
      payload: {
        id: this.localId,
        name: this.localName,
        signal: -60,
        timestamp: Date.now()
      },
      senderId: this.localId,
      timestamp: Date.now()
    };

    for (const deviceId of this.neighbors.keys()) {
      this.sendMessage(deviceId, presence).catch(() => {});
    }
  }

  getMeshStats() {
    return {
      neighbors: this.neighbors.size,
      queuedMessages: this.messageQueue.length,
      routesKnown: this.routingTable.size,
      seenMessages: this.seenMessages.size
    };
  }

  getNeighbors(): MeshNode[] {
    return Array.from(this.neighbors.values());
  }

  async sendToDevice(destinationId: string, message: MeshMessage): Promise<boolean> {
    // If we have a direct route, use it; otherwise try mesh routing
    const route = this.findRoute(destinationId);
    if (route) {
      return this.sendMessage(route, message).then(() => true).catch(() => false);
    }
    // Fall back to mesh routing
    return this.sendMessageToMesh(destinationId, message);
  }

  // Periodic cleanup for mesh health
  cleanupStaleData() {
    const now = Date.now();
    const staleThreshold = 60000; // 1 minute

    // Clean up old neighbors
    for (const [deviceId, node] of this.neighbors) {
      if (now - node.lastSeen > staleThreshold) {
        this.neighbors.delete(deviceId);
        console.log('Removed stale neighbor:', node.id);
      }
    }

    // Clean up old routes
    for (const [nodeId, entry] of this.routingTable) {
      if (now - entry.lastUpdated > 120000) {
        this.routingTable.delete(nodeId);
      }
    }

    // Retry queued messages periodically
    this.retryQueuedMessages().catch(() => {});
  }
}

export const bluetoothMesh = new BluetoothMesh();