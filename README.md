# homebridge-enet

Gira/Jung eNet plugin for [Homebridge](https://homebridge.io). Control eNet devices (lights, switches, shutters/blinds) through Jung/Gira Mobile Gateways via HomeKit.

Originally by [ChristophFausak](https://github.com/christophfausak/homebridge-enet), forked and maintained by [JulianBX](https://github.com/JulianBX/homebridge-enet).

## Features

- Lights (on/off, dimmable)
- Switches (on/off, optional auto-off timer)
- Shutters/Blinds (position control)
- Auto-discovery of gateways via UDP broadcast
- Real-time device state updates via gateway push notifications
- Homebridge Config UI X support

## Installation

### Via Homebridge UI (recommended)

Search for `homebridge-enet-julianbx` in the Homebridge plugin tab.

### Via npm

```bash
npm install -g homebridge-enet-julianbx
```

## Configuration

Configuration sample:

```json
{
    "platforms": [
        {
            "platform": "eNetPlatform",
            "name": "eNet",
            "autodiscover": true,
            "gateways": [{
                "name": "Mobile Gate",
                "mac": null,
                "host": null,
                "accessories": [
                    {
                        "channel": 16,
                        "name": "Kitchen",
                        "type": "Shutter"
                    },
                    {
                        "channel": 17,
                        "name": "Toaster",
                        "type": "Switch",
                        "duration": 120
                    },
                    {
                        "channel": 18,
                        "name": "Main Light",
                        "type": "Light",
                        "dimmable": true
                    }
                ]
            }]
        }
    ]
}
```

### Platform Options

| Option | Required | Default | Description |
|--------|----------|---------|-------------|
| `autodiscover` | No | `true` | Discover gateways via UDP broadcast. If `false`, all gateways need `host` set. |

### Gateway Identification

Each gateway needs one of these identifiers:

| Option | Description |
|--------|-------------|
| `host` | Hostname or IP address |
| `mac` | MAC address (e.g. `00:0a:b3:e8:2b:11`) |
| `name` | Gateway name as set in the Jung/Gira eNet app (default: "Mobile Gate") |

### Accessory Options

| Option | Required | Description |
|--------|----------|-------------|
| `channel` | Yes | eNet channel number (first user channel is 16) |
| `name` | Yes | Display name in HomeKit |
| `type` | Yes | `Light`, `Switch`, or `Shutter` |
| `dimmable` | No | Enable dimming for `Light` accessories |
| `duration` | No | Auto-off timer in seconds (for `Switch` and `Light`) |

## Debugging

Enable debug logging by starting Homebridge with the `-D` flag or enabling debug mode in the Homebridge UI. This will show all gateway communication (RX/TX messages) for troubleshooting.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history.

## License

Published under the MIT License.
