import { BleClient, NumberToUUID } from '@capacitor-community/bluetooth-le';
import { Capacitor } from '@capacitor/core';

const BLUELINK_SERVICE_UUID = '4350-2d32-502d-4d45-5348-2d53-5643'; // CP-P2P-MESH-SVC
const DATA_CHARACTERISTIC_UUID = '4350-2d32-502d-4d45-5348-2d44-5441'; // CP-P2P-MESH-DTA
const MESH_INFO_CHARACTERISTIC_UUID = '4350-2d32-502d-4d45-5348-2d49-4e46'; // CP-P2P-MESH-INF

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
                this.onMessageReceived?.(deviceId, message);
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
}

export const bluetoothMesh = new BluetoothMesh();