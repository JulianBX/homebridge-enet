"use strict";

const eNet = require("./eNet-api/api");

var Service, Characteristic, Accessory, UUIDGen;

module.exports = function(homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    Accessory = homebridge.platformAccessory;
    UUIDGen = homebridge.hap.uuid;

    homebridge.registerPlatform("homebridge-eNet", "eNetPlatform", eNetPlatform);
}


function eNetPlatform(log, config, api) {
    this.log = log;
    this.config = config;
    this.accessories = [];
    this.delAccessories = [];
    this.gateways = [];
    this.loadState = 2; // didFinishLaunching & discover
    this.gatewayNotFound = false;

    var discover = new eNet.discover();

    discover.on('discover', function(gw) { this.newGateway(gw) }.bind(this));

    if (api) {
        this.api = api;

        this.api.on('didFinishLaunching', function() {
            if (--this.loadState === 0) this.setupDevices();
        }.bind(this));
    } else --this.loadState;

    discover.discover(function(err) {
        if (err) log.warn('Discovery error: ' + err);
        if (--this.loadState === 0) this.setupDevices();
    }.bind(this));
}

eNetPlatform.prototype.newGateway = function(gw) {
    ++this.loadState;
    var g = new eNet.gateway(gw, this.log);

    g.getChannelInfo(function(err, res) {
        if (!err) {
            if (res && Array.isArray(res.DEVICES)) {
                g.devices = res.DEVICES;
                this.gateways.push(g);
            } else err = JSON.stringify(res);
        }

        if (err) {
            this.gatewayNotFound = true;
            this.log.warn("Failed to get gateway channels, ignoring gateway. Error: " + err);
        }
        if (--this.loadState === 0) this.setupDevices();
    }.bind(this));
};

eNetPlatform.prototype.setupDevices = function() {
    if (Array.isArray(this.config.gateways)) {
        for (var i = 0; i < this.config.gateways.length; ++i) {
            var gw = this.config.gateways[i];
            if (Array.isArray(gw.accessories)) {
                var g = null;
                if (gw.host) g = this.findGateway(gw.host);
                if (!g && gw.mac) g = this.findGateway(gw.mac);
                if (!g && gw.name) g = this.findGateway(gw.name);

                if (!g && gw.host) {
                    g = new eNet.gateway(gw, this.log);
                    ++this.loadState;

                    g.getChannelInfo(function(err, res) {
                        if (!err) {
                            if (res && Array.isArray(res.DEVICES)) {
                                g.devices = res.DEVICES;
                                this.gateways.push(g);
                            } else err = JSON.stringify(res);
                        }

                        if (err) {
                            this.gatewayNotFound = true;
                            this.log.warn("Failed to get gateway channels, ignoring gateway. Error: " + err);
                        }
                        if (--this.loadState === 0) this.setupDevices();
                    }.bind(this));

                    return;
                }

                if (g) {
                    for (var j = 0; j < gw.accessories.length; ++j) {
                        var acc = gw.accessories[j];

                        var a = this.findAccessory(g.id, acc.channel);
                        if (a) {
                            if ((a.context.type != acc.type) || (a.context.name != acc.name)) {
                                // kick this accessory out, create new one
                                a.reachable = false;
                            } else {
                                a.context.duration = acc.duration;
                                a.context.dimmable = acc.dimmable;

                                if (!a.reachable) {
                                    a.gateway = g;
                                    a.reachable = true;
                                }
                            }
                        }

                        if (!a || !a.reachable) this.createAccessory(g, acc);
                    }
                } else {
                    this.gatewayNotFound = true;
                    this.log.warn("Cannot find gateway: " + JSON.stringify(gw));
                }
            } else this.log.warn("Gateway has no accessories: " + JSON.stringify(gw));
        }
    } else this.log.warn("No gateways defined: " + JSON.stringify(this.config));

    var keep = [];
    for (var i = 0; i < this.accessories.length; ++i) {
        var acc = this.accessories[i];
        if (acc.reachable) {
            keep.push(acc);

            var service;
            if (service = acc.getService(Service.Lightbulb)) {
                if (acc.context.dimmable) {
                    this.log.info("Configuring brightness for " + acc.context.name);
                    acc.brightness = 100;

                    service.getCharacteristic(Characteristic.Brightness)
                        .on('get', getBrightness.bind(acc))
                        .on('set', setBrightness.bind(acc));
                } else {
                    service.removeCharacteristic(Characteristic.Brightness);
                }
            }
        } else if (!this.gatewayNotFound) {
            this.log.info("Deleting old accessory: " + JSON.stringify(acc.context));
            this.delAccessories.push(acc);
        }
    }

    if (this.delAccessories.length) this.api.unregisterPlatformAccessories("homebridge-eNet", "eNetPlatform", this.delAccessories);
    this.delAccessories = [];
    this.accessories = keep;

    this.log.info("Platform initialization finished: " + this.accessories.length + " accessories available.");

    // Sign in to device updates for each gateway
    for (var i = 0; i < this.gateways.length; i++) {
        var gw = this.gateways[i];

        var accChannels = [];
        for (var k = 0; k < this.accessories.length; k++) {
            if (this.accessories[k].context.gateID == gw.id) {
                accChannels.push(this.accessories[k].context.channel);
            }
        }

        gw.signIn(accChannels);

        // Handle device updates using destructured event format
        gw.on('UpdateAvailable', function({ rcvdOnGateway, msgRcvd }) {
            var acc = this.findAccessory(rcvdOnGateway.id, Number(msgRcvd.NUMBER));
            if (acc) {
                this.log.debug("UpdateAvailable: " + acc.context.name + " " + JSON.stringify(msgRcvd));

                var service;
                if (service = acc.getService(Service.Lightbulb)) {
                    if ((msgRcvd.STATE === "UNDEFINED") && acc.initialized) return;

                    var newValue = (msgRcvd.STATE === "ON");

                    if (!acc.initialized) {
                        this.log.info("Initializing light " + acc.context.name + " state to " + (newValue ? "ON" : "OFF"));
                        acc.realOn = newValue;
                        service.getCharacteristic(Characteristic.On).updateValue(newValue);

                        if (acc.context.dimmable) {
                            var brightness = msgRcvd.VALUE;
                            if ((brightness < 0) || (brightness > 100)) brightness = 100;
                            acc.brightness = brightness;
                            service.getCharacteristic(Characteristic.Brightness).updateValue(brightness);
                        }

                        acc.initialized = true;
                    } else {
                        if (acc.realOn != newValue) {
                            this.log.info("Changing light " + acc.context.name + " state " + (acc.realOn ? "ON" : "OFF") + " -> " + (newValue ? "ON" : "OFF"));
                            acc.realOn = newValue;
                            service.getCharacteristic(Characteristic.On).updateValue(newValue);

                            if (acc.callback) {
                                this.log.debug("Calling callback...");
                                acc.callback.call(null);
                                acc.callback = null;
                            }
                        }

                        if (acc.context.dimmable && (msgRcvd.VALUE >= 0) && (msgRcvd.VALUE <= 100) && (acc.brightness != msgRcvd.VALUE)) {
                            this.log.info("Changing light " + acc.context.name + " brightness " + acc.brightness + " -> " + msgRcvd.VALUE);
                            acc.brightness = msgRcvd.VALUE;
                            service.getCharacteristic(Characteristic.Brightness).updateValue(msgRcvd.VALUE);

                            if (acc.brightnessCallback) {
                                acc.brightnessCallback.call(null);
                                acc.brightnessCallback = null;
                            }
                        }
                    }
                } else if (service = acc.getService(Service.Switch)) {
                    if ((msgRcvd.STATE === "UNDEFINED") && acc.initialized) return;

                    var newValue = (msgRcvd.STATE === "ON");

                    if (!acc.initialized) {
                        this.log.info("Initializing switch " + acc.context.name + " state to " + (newValue ? "ON" : "OFF"));
                        acc.realOn = newValue;
                        service.getCharacteristic(Characteristic.On).updateValue(newValue);
                        acc.initialized = true;
                    } else {
                        if (acc.realOn != newValue) {
                            this.log.info("Changing switch " + acc.context.name + " state " + (acc.realOn ? "ON" : "OFF") + " -> " + (newValue ? "ON" : "OFF"));
                            acc.realOn = newValue;
                            service.getCharacteristic(Characteristic.On).updateValue(newValue);

                            if (acc.callback) {
                                this.log.debug("Calling callback...");
                                acc.callback.call(null);
                                acc.callback = null;
                            }
                        }
                    }
                } else if (service = acc.getService(Service.Window)) {
                    if (!acc.initialized) {
                        var pos = 100 - msgRcvd.VALUE;
                        if ((pos >= 0) && (pos <= 100)) acc.targetPosition = acc.position = pos;

                        this.log.info("Initializing shutter " + acc.context.name + " position to " + acc.position);

                        service.setCharacteristic(Characteristic.CurrentPosition, acc.position);
                        acc.initialized = true;
                    } else {
                        var position = 100 - msgRcvd.VALUE;
                        if ((position < 0) || (position > 100)) position = acc.position;

                        var targetPos = 100 - msgRcvd.SETPOINT;
                        if ((targetPos < 0) || (targetPos > 100)) targetPos = acc.targetPosition;

                        if (msgRcvd.STATE === "OFF") targetPos = position;

                        if (acc.targetPosition != targetPos) {
                            this.log.info("Changing shutter " + acc.context.name + " target position " + acc.targetPosition + " -> " + targetPos);
                            acc.targetPosition = targetPos;
                            service.getCharacteristic(Characteristic.TargetPosition).updateValue(targetPos);
                        }

                        if (acc.position != position) {
                            this.log.info("Changing shutter " + acc.context.name + " position " + acc.position + " -> " + position);
                            acc.position = position;
                            service.setCharacteristic(Characteristic.CurrentPosition, position);
                        }
                    }
                } else {
                    this.log.debug("UpdateAvailable: Unknown service type for " + acc.context.name);
                }
            }
        }.bind(this));
    }
}

eNetPlatform.prototype.findGateway = function(id) {
    for (var i = 0; i < this.gateways.length; ++i) {
        var gw = this.gateways[i];
        if ((gw.mac === id) || (gw.name === id) || (gw.host === id)) return gw;
    }
}

eNetPlatform.prototype.findAccessory = function(gateID, channel) {
    for (var i = 0; i < this.accessories.length; ++i) {
        var a = this.accessories[i];
        if ((a.context.gateID === gateID) && (a.context.channel === channel)) return a;
    }
}

eNetPlatform.prototype.configureAccessory = function(accessory) {
    this.log.info("Configure accessory: " + JSON.stringify(accessory.context));
    if (this.setupAccessory(accessory)) {
        accessory.reachable = false;
        this.accessories.push(accessory);
    }
}

eNetPlatform.prototype.createAccessory = function(gate, conf) {
    var uuid;

    if (!conf.name || (typeof conf.channel !== 'number')) {
        this.log.warn("Cannot add accessory, invalid config: " + JSON.stringify(conf));
        return;
    }

    this.log.info("Creating accessory: " + JSON.stringify(conf));

    uuid = UUIDGen.generate(JSON.stringify(conf) + gate.id + this.accessories.length);

    var accessory = new Accessory(conf.name, uuid);

    if (conf.type === "Shutter") {
        accessory.addService(Service.Window, conf.name);
    } else if (conf.type === "Light") {
        accessory.addService(Service.Lightbulb, conf.name);
        accessory.realOn = false;
    } else if (conf.type === "Switch") {
        accessory.addService(Service.Switch, conf.name);
        accessory.realOn = false;
    } else {
        this.log.warn("Cannot add accessory, invalid config: " + JSON.stringify(conf));
        return;
    }

    accessory.context.gateID = gate.id;
    accessory.context.type = conf.type;
    accessory.context.channel = conf.channel;
    accessory.context.name = conf.name;
    accessory.context.duration = conf.duration;
    accessory.context.dimmable = conf.dimmable;

    if (this.setupAccessory(accessory)) {
        accessory.reachable = true;
        accessory.gateway = gate;
        this.accessories.push(accessory);
        this.api.registerPlatformAccessories("homebridge-eNet", "eNetPlatform", [accessory]);
    }
}

eNetPlatform.prototype.setupAccessory = function(accessory) {
    var service;

    accessory.log = this.log;

    if (service = accessory.getService(Service.Lightbulb)) {
        service
            .getCharacteristic(Characteristic.On)
            .on('set', setOn.bind(accessory))
            .on('get', getOn.bind(accessory));

        accessory.initialized = false;
    } else if (service = accessory.getService(Service.Switch)) {
        service
            .getCharacteristic(Characteristic.On)
            .on('set', setOn.bind(accessory))
            .on('get', getOn.bind(accessory));

        accessory.initialized = false;
    } else if (service = accessory.getService(Service.Window)) {
        accessory.position = 0;
        accessory.targetPosition = 0;
        accessory.initialized = false;

        service.setCharacteristic(Characteristic.CurrentPosition, accessory.position);
        service.getCharacteristic(Characteristic.CurrentPosition)
            .on('get', getCurrentPosition.bind(accessory));

        service.setCharacteristic(Characteristic.TargetPosition, accessory.position);
        service.getCharacteristic(Characteristic.TargetPosition)
            .on('get', getTargetPosition.bind(accessory))
            .on('set', setTargetPosition.bind(accessory));

        accessory.positionState = Characteristic.PositionState.STOPPED;

        service.setCharacteristic(Characteristic.PositionState, accessory.positionState);
        service.getCharacteristic(Characteristic.PositionState)
            .on('get', getPositionState.bind(accessory));
    } else {
        this.log.warn("Cannot configure accessory, no service found. " + JSON.stringify(accessory.context));
        this.delAccessories.push(accessory);
        return false;
    }

    accessory.on('identify', function(paired, callback) {
        this.log.info("Identify: " + JSON.stringify(this.context));
        callback();
    }.bind(accessory));

    return true;
}

////////////////////////////////////////////////////////////////////////////////
//
//  Accessory notifications
//

function getPositionState(callback) {
    if (this.initialized) {
        this.log.info("getPositionState " + this.context.name + ": " + this.positionState);
        callback(null, this.positionState);
    } else {
        this.log.info("getPositionState " + this.context.name + ": not initialized");
        callback(new Error("eNet device not initialized."));
    }
}

function getCurrentPosition(callback) {
    if (this.initialized) {
        this.log.info("getCurrentPosition " + this.context.name + ": " + this.position);
        callback(null, this.position);
    } else {
        this.log.info("getCurrentPosition " + this.context.name + ": not initialized");
        callback(new Error("eNet device not ready."));
    }
}

function getTargetPosition(callback) {
    if (this.initialized) {
        this.log.info("getTargetPosition " + this.context.name + ": " + this.targetPosition);
        callback(null, this.targetPosition);
    } else {
        this.log.info("getTargetPosition " + this.context.name + ": not initialized");
        callback(new Error("eNet device not ready."));
    }
}

function setTargetPosition(position, callback) {
    if (!this.gateway) {
        this.log.warn("eNet device not ready.");
        callback(new Error("eNet device not ready."));
        return;
    }

    if (this.targetPosition == position) {
        callback(null);
        return;
    }

    this.log.info("Setting " + this.context.name + " to " + position);

    if (this.position > position) this.positionState = Characteristic.PositionState.DECREASING;
    else this.positionState = Characteristic.PositionState.INCREASING;

    this.targetPosition = position;

    callback(null);

    this.gateway.setValueBlind(this.context.channel, 100 - position, function(err, res) {
        if (err) {
            this.log.warn("Error setting " + this.context.name + " to " + position + ": " + err);
        } else {
            this.log.info("Succeeded setting " + this.context.name + " to " + position + ": " + JSON.stringify(res));
        }
    }.bind(this));
}

function getOn(callback) {
    if (!this.gateway) {
        this.log.warn("eNet device not ready.");
        callback(new Error("eNet device not ready."));
        return;
    }

    // Refresh state from gateway
    this.gateway.refresh();

    if (this.initialized) {
        this.log.info("getOn " + this.context.name + ": " + this.realOn);
        callback(null, this.realOn);
    } else {
        this.log.info("getOn " + this.context.name + ": not initialized");
        callback(new Error("eNet device not ready."));
    }
}

function setOn(position, callback) {
    if (!this.gateway) {
        this.log.warn("eNet device not ready.");
        callback(new Error("eNet device not ready."));
        return;
    }

    if (this.realOn == position) {
        callback(null);
        return;
    }

    this.log.info("Setting " + this.context.name + " to " + (position === true ? "on" : "off"));

    var service = this.getService(Service.Lightbulb) || this.getService(Service.Switch);
    if (service) {
        position = !!position;
        if (this.callback) this.callback.call(new Error("uncalled callback!"));
        this.callback = callback;

        this.gateway.setValue(this.context.channel, position, false, function(err, res) {
            if (err) {
                this.log.warn("Error setting " + this.context.name + " to " + (position ? "on" : "off") + ": " + err);
                if (this.callback) {
                    this.callback.call(err);
                    this.callback = null;
                }
            } else {
                this.log.info("Succeeded setting " + this.context.name + " to " + (position ? "on" : "off") + ": " + JSON.stringify(res));
                if (position && this.context.duration) {
                    var svc = this.getService(Service.Lightbulb) || this.getService(Service.Switch);
                    if (svc) {
                        setTimeout(function() {
                            svc.getCharacteristic(Characteristic.On).setValue(false);
                        }, this.context.duration * 1000);
                    }
                }
            }
        }.bind(this));
    } else {
        this.log.error("setOn: Unknown device type!");
        callback(new Error("Unknown device type!"));
    }
}


function getBrightness(callback) {
    if (!this.gateway) {
        this.log.warn("eNet device not ready.");
        callback(new Error("eNet device not ready."));
        return;
    }

    // Refresh state from gateway
    this.gateway.refresh();

    if (this.initialized) {
        this.log.info("getBrightness " + this.context.name + ": " + this.brightness);
        callback(null, this.brightness);
    } else {
        this.log.info("getBrightness " + this.context.name + ": not initialized");
        callback(new Error("eNet device not ready."));
    }
}

function setBrightness(brightness, callback) {
    if (!this.gateway) {
        this.log.warn("eNet device not ready.");
        callback(new Error("eNet device not ready."));
        return;
    }
    if (!this.context.dimmable) {
        this.log.warn("eNet device not dimmable.");
        callback(new Error("eNet device not dimmable."));
        return;
    }

    if (this.brightness == brightness) {
        callback(null);
        return;
    }

    this.log.info("setBrightness " + this.context.name + ": " + brightness);

    this.brightness = brightness;
    if (brightness > 0) this.realOn = true;
    else if (brightness == 0) this.realOn = false;

    if (this.brightnessCallback) this.brightnessCallback.call(new Error("uncalled callback!"));
    this.brightnessCallback = callback;

    this.gateway.setValueDim(this.context.channel, brightness, function(err, res) {
        if (err) {
            this.log.warn("Error setting " + this.context.name + " to " + this.brightness + ": " + err);
            if (this.brightnessCallback) {
                this.brightnessCallback.call(err);
                this.brightnessCallback = null;
            }
        } else {
            this.log.info("Succeeded setting " + this.context.name + " to " + this.brightness + ": " + JSON.stringify(res));
        }
    }.bind(this));
}
