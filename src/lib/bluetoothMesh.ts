import { BleClient, NumberToUUID } from '@capacitor-community/bluetooth-le';
import { Capacitor } from '@capacitor/core';

const BLUELINK_SERVICE_UUID = '4350-2d32-502d-4d45-5348-2d53-5643'; // CP-P2P-MESH-SVC
const DATA_CHARACTERISTIC_UUID = '4350-2d32-502d-4d45-5348-2d44-5441'; // CP-P2P-MESH-DTA

export interface MeshNode {
  id: string;
  name: string;
  avatar?: string;
  signal: number;
  lastSeen: number;
  deviceId: string;
}

class BluetoothMesh {
  private isInitialized = false;
  private onNodeDiscovered: ((node: MeshNode) => void) | null = null;
  private onDataReceived: ((deviceId: string, data: any) => void) | null = null;

  async initialize() {
    if (this.isInitialized) return;
    if (Capacitor.isNativePlatform()) {
      try {
        await BleClient.initialize();
        this.isInitialized = true;
      } catch (e) {
        console.error('BLE Init failed', e);
      }
    }
  }

  async startDiscovery(onNode: (node: MeshNode) => void) {
    this.onNodeDiscovered = onNode;
    if (!Capacitor.isNativePlatform()) {
      this.simulateDiscovery();
      return;
    }

    try {
      await BleClient.requestLEScan(
        {
          services: [], // Scan all to find names
        },
        (result) => {
          if (result.device.name?.includes('BlueLink') || result.device.name?.includes('Mesh')) {
            const node: MeshNode = {
              id: `bluelink-${result.device.deviceId}`,
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

  async stopDiscovery() {
    if (Capacitor.isNativePlatform()) {
      await BleClient.stopLEScan().catch(() => {});
    }
  }

  async startAdvertising(peerId: string, name: string, onData: (deviceId: string, data: any) => void) {
    this.onDataReceived = onData;
    if (!Capacitor.isNativePlatform()) return;

    try {
      // Add Mesh Service and Data Characteristic
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
                const data = JSON.parse(json);
                this.onDataReceived?.(deviceId, data);
              } catch (e) {
                console.error('BLE Decode error', e);
              }
            }
          },
        ],
      });

      await BleClient.startAdvertising({
        name: `BlueLink:${name}:${peerId}`,
        services: [BLUELINK_SERVICE_UUID],
      });
      console.log('Mesh peripheral active and advertising');
    } catch (e) {
      console.warn('BLE Peripheral mode not supported/failed', e);
    }
  }

  async sendData(deviceId: string, data: any) {
    if (!Capacitor.isNativePlatform()) {
      console.log('Simulated BLE Send:', deviceId, data);
      return;
    }

    try {
      await BleClient.connect(deviceId);
      const json = JSON.stringify(data);
      const enc = new TextEncoder();
      const bytes = enc.encode(json);
      
      // Sending data might require breaking into chunks if > MTU
      // For now, simpler implementation
      await BleClient.write(deviceId, BLUELINK_SERVICE_UUID, DATA_CHARACTERISTIC_UUID, bytes.buffer as any);
      await BleClient.disconnect(deviceId);
    } catch (e) {
      console.error('BLE Send failed', e);
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
}

export const bluetoothMesh = new BluetoothMesh();
