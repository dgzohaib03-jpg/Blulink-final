// Relay Node Protocol for static ESP32/ESP8266 devices
// These cheap devices ($5-10) can act as message forwarders
// No app needed - they just repeat any mesh message they receive

export const RELAY_PROTOCOL = {
  // Service identifiers
  SERVICE_UUID: 'BLRE',
  DATA_CHUNK_SIZE: 512,

  // Message types for relay communication
  ANNOUNCE: 'RELAY_ANNOUNCE',
  PING: 'RELAY_PING',
  PONG: 'RELAY_PONG',
  FORWARD: 'MESH_FORWARD',
  STATS: 'RELAY_STATS',

  // Relay types
  TYPE_STATIC: 'static',      // Fixed location relay
  TYPE_MOBILE: 'mobile',      // Phone acting as relay
  TYPE_GATEWAY: 'gateway',   // Can connect to internet when available
};

export interface RelayAnnounce {
  type: typeof RELAY_PROTOCOL.ANNOUNCE;
  version: string;
  relayId: string;
  relayName: string;
  relayType: 'static' | 'mobile' | 'gateway';
  capabilities: string[];  // ['forward', 'store', 'gateway']
  uptime: number;
  messagesForwarded: number;
  signal: number;
}

export interface RelayPacket {
  messageId: string;
  senderId: string;
  destinationId?: string;
  hopLimit: number;
  hopCount: number;
  payload: any;
  timestamp: number;
}

export interface RelayStats {
  type: typeof RELAY_PROTOCOL.STATS;
  relayId: string;
  uptime: number;
  messagesReceived: number;
  messagesForwarded: number;
  messagesStored: number;
  peerCount: number;
  memoryFree: number;
}

// Relay Node Discovery and Communication
class RelayProtocol {
  private discoveredRelays: Map<string, RelayAnnounce> = new Map();
  private isScanning = false;
  private relayHandler: ((relay: RelayAnnounce) => void) | null = null;

  // Initialize relay scanning
  async startRelayDiscovery(onRelayFound: (relay: RelayAnnounce) => void) {
    this.relayHandler = onRelayFound;
    this.isScanning = true;

    // BLE scan for relay devices (they advertise with specific name pattern)
    console.log('Scanning for relay nodes...');

    // Simulated discovery for demo
    this.simulateRelayDiscovery();
  }

  stopRelayDiscovery() {
    this.isScanning = false;
    this.relayHandler = null;
  }

  // Handle incoming relay packet
  parseRelayPacket(data: ArrayBuffer): RelayPacket | null {
    try {
      const decoder = new TextDecoder();
      const json = decoder.decode(data);
      return JSON.parse(json);
    } catch (e) {
      console.error('Failed to parse relay packet:', e);
      return null;
    }
  }

  // Create relay announcement message
  createAnnounceMessage(
    relayId: string,
    relayName: string,
    relayType: 'static' | 'mobile' | 'gateway'
  ): RelayAnnounce {
    return {
      type: RELAY_PROTOCOL.ANNOUNCE,
      version: '1.0',
      relayId,
      relayName,
      relayType,
      capabilities: ['forward', 'store'],
      uptime: Date.now(),
      messagesForwarded: 0,
      signal: -60
    };
  }

  // Create forward packet for relaying
  createForwardPacket(
    messageId: string,
    senderId: string,
    destinationId: string,
    payload: any,
    hopLimit: number = 10
  ): RelayPacket {
    return {
      messageId,
      senderId,
      destinationId,
      hopLimit,
      hopCount: 0,
      payload,
      timestamp: Date.now()
    };
  }

  // Serialize relay packet for transmission
  serializePacket(packet: RelayPacket): ArrayBuffer {
    const encoder = new TextEncoder();
    return encoder.encode(JSON.stringify(packet)).buffer;
  }

  // Get discovered relays
  getRelays(): RelayAnnounce[] {
    return Array.from(this.discoveredRelays.values());
  }

  // Get relay by ID
  getRelay(relayId: string): RelayAnnounce | undefined {
    return this.discoveredRelays.get(relayId);
  }

  // Filter only gateway relays (can connect to internet when available)
  getGateways(): RelayAnnounce[] {
    return Array.from(this.discoveredRelays.values())
      .filter(r => r.capabilities.includes('gateway'));
  }

  // Simulated discovery for development
  private simulateRelayDiscovery() {
    const demoRelays: RelayAnnounce[] = [
      {
        type: RELAY_PROTOCOL.ANNOUNCE,
        version: '1.0',
        relayId: 'relay-001',
        relayName: 'City Park Relay',
        relayType: 'static',
        capabilities: ['forward', 'store'],
        uptime: 86400000,
        messagesForwarded: 1234,
        signal: -65
      },
      {
        type: RELAY_PROTOCOL.ANNOUNCE,
        version: '1.0',
        relayId: 'relay-002',
        relayName: 'Library Relay',
        relayType: 'gateway',
        capabilities: ['forward', 'store', 'gateway'],
        uptime: 172800000,
        messagesForwarded: 5678,
        signal: -55
      }
    ];

    demoRelays.forEach(relay => {
      this.discoveredRelays.set(relay.relayId, relay);
      setTimeout(() => {
        this.relayHandler?.(relay);
      }, 1000);
    });
  }
}

export const relayProtocol = new RelayProtocol();