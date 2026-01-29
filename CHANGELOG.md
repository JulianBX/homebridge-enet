# Changelog

All notable changes to this project will be documented in this file.

## [1.2.4] - 2025-01-29

### Fixed
- Implement proper ACK protocol (ITEM_VALUE_RES) after receiving ITEM_UPDATE_IND
- Gateway no longer re-sends duplicate updates due to missing acknowledgment
- Normalize VALUE == -1 to 0 (fix for some device types)

## [1.2.3] - 2025-01-29

### Changed
- Version bump for npm publish

## [1.2.2] - 2025-01-29

### Changed
- Add .serena/ and .claude/ to .gitignore

## [1.2.1] - 2025-01-29

### Added
- Homebridge Config UI X support via config.schema.json
- .gitignore for node_modules, IDE files, logs
- CLAUDE.md for AI-assisted development guidance

### Changed
- Rename package to homebridge-enet-julianbx
- Update repository URLs to JulianBX/homebridge-enet

### Fixed
- Merge local improvements: duplicate filtering, refresh() method, auto-reconnect
- Fix setTimeout argument order in gateway reconnect logic
- Fix typos (JSOM -> JSON, finishd -> finished)

## [1.0.0] - 2024-xx-xx

### Added
- Do not delete accessories if gateway was not found

### Fixed
- Shutter target position management

## [0.7.3]

### Added
- Integrated eNet-api into repository
- Improved debug logging
- Auto-reconnect gateway when signed in for device updates

### Fixed
- Device callbacks may be called twice

## [0.7.2]

### Added
- Position updates for switch devices
- Allow duration property on lightbulb devices

### Fixed
- Shutter callback issues
- Status updates when using multiple gateways

## [0.7.1]

### Fixed
- Timing issues on lightbulb devices

## [0.7.0]

### Added
- Position updates for shutter devices

## [0.6.4]

### Added
- eNet-Commands can update HomeKit states and brightness
- Hardware dimmer/switch changes reflected in HomeKit

### Known Issues
- Time delay with overlapping messages from mobileGate during dimming
