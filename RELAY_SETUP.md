# Setting Up Static Relay Nodes

Relay nodes are cheap ESP32 devices ($5-10) that act as message forwarders between phones. They don't need the app - just power.

## Hardware Needed
- ESP32 Dev Board ($5-8)
- USB Power cable
- Optional: Small USB power bank for portable relays

## Flash the Relay Code

```cpp
// Arduino code for ESP32 relay node
#include <BLEDevice.h>
#include <BLEServer.h>

#define RELAY_SERVICE_UUID "BLRE"
#define DATA_CHARACTERISTIC_UUID "BLRD"

BLEServer *server = nullptr;
bool deviceConnected = false;

void setup() {
  Serial.begin(115200);

  // Create BLE server
  BLEDevice::init("bluelink-relay-001");
  server = BLEDevice::createServer();

  BLEService *service = server->createService(RELAY_SERVICE_UUID);

  // Data forwarding characteristic
  BLECharacteristic *dataChar = service->createCharacteristic(
    DATA_CHARACTERISTIC_UUID,
    BLECharacteristic::PROPERTY_READ |
    BLECharacteristic::PROPERTY_WRITE |
    BLECharacteristic::PROPERTY_NOTIFY
  );

  // Set up write callback to forward messages
  dataChar->setCallbacks(new CharacteristicCallbacks());

  service->start();

  // Start advertising
  BLEAdvertising *advertising = BLEDevice::getAdvertising();
  advertising->addServiceUUID(RELAY_SERVICE_UUID);
  advertising->setScanResponse(true);
  advertising->start();

  Serial.println("Relay node active!");
}

void loop() {
  // Relay nodes stay on continuously
  delay(100);
}
```

## Placement Suggestions

| Location | Benefit |
|----------|---------|
| Parks | Covers joggers, walkers |
| Libraries | High foot traffic |
| Community centers | Gathering points |
| Stores | Regular visitors |
| Subway stations | Dense population |

## How It Works

```
[Your Phone] ─BLE─→ [Relay Node] ─BLE─→ [Another Phone]
     50m                  50m                  50m
```

The relay just forwards any mesh message it receives to other devices. No storage needed - instant relay.

## Power Options

- **Fixed**: USB power adapter (home, office)
- **Portable**: USB power bank (24+ hours)
- **Solar**: 5V solar panel + USB charger (unlimited)

## Cost Estimate

| Item | Cost |
|------|------|
| ESP32 board | $5-8 |
| USB cable | $2-3 |
| Power bank (optional) | $10-20 |
| Solar panel (optional) | $8-15 |

Total: $5-15 per relay node