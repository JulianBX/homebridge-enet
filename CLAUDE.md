# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Homebridge plugin for Gira/Jung eNet Smart Home system. Enables HomeKit control of eNet devices (lights, switches, shutters/blinds) through Jung/Gira Mobile Gateways.

**Language**: JavaScript (Node.js)
**Platform**: Homebridge plugin ecosystem
**No build step required** - pure JavaScript with no transpilation

## Commands

```bash
# Install dependencies (none currently - zero external deps)
npm install

# Install plugin locally for development
npm link

# Version erhöhen
npm patch version

#Änderungen veröffentlichen
npm publish

# Test plugin with homebridge
homebridge -D -P .
```

## Architecture

### Entry Point & Platform Registration
`index.js` - Main plugin file that:
- Registers `eNetPlatform` with Homebridge
- Manages accessory lifecycle (create, configure, delete)
- Handles HomeKit characteristic callbacks (get/set state, brightness, position)
- Processes gateway device update events (`UpdateAvailable`)

### eNet-api Module
Communication layer with eNet Mobile Gateways:

**`eNet-api/api.js`** - Module entry point, exports:
- `discover` - Gateway discovery class
- `gateway` - Gateway communication class

**`eNet-api/discover.js`** - UDP broadcast discovery:
- Sends discovery payload to port 3112
- Listens on port 2906 for gateway responses
- Parses response to extract IP, name, MAC address
- Emits `discover` event for each found gateway

**`eNet-api/gateway.js`** - TCP connection to gateway (port 9050):
- JSON-based protocol with `\r\n\r\n` delimiters
- Commands: `VERSION_REQ`, `GET_CHANNEL_INFO_ALL_REQ`, `ITEM_VALUE_SET`, `ITEM_VALUE_SIGN_IN_REQ`
- Event-driven: emits `gateway` for responses, `UpdateAvailable` for device state changes
- Auto-reconnects on connection close/error when signed in

### Device Types (HomeKit Services)
- **Light** (`Service.Lightbulb`) - On/off, optional dimming (0-100%)
- **Switch** (`Service.Switch`) - On/off only
- **Shutter** (`Service.Window`) - Position control (0-100%, inverted: 0=closed, 100=open)

### Key Data Flow
1. Platform starts → Discovery broadcasts → Gateways respond
2. `getChannelInfo()` retrieves available device channels per gateway
3. Config accessories matched to discovered gateways by host/mac/name
4. `signIn(channels)` subscribes to device updates
5. `ITEM_UPDATE_IND` messages trigger `UpdateAvailable` → HomeKit characteristic updates

### eNet Protocol Notes
- Position values are inverted between HomeKit (0=closed) and eNet (100=closed)
- Channel numbers start at 16 for user-configured devices
- States: `ON`, `OFF`, `UNDEFINED`, `VALUE_DIMM`, `VALUE_BLINDS`
