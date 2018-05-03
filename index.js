"use strict";

const eNet = require('node-enet-api');

var Service, Characteristic, Accessory, UUIDGen;

module.exports = function (homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    Accessory = homebridge.platformAccessory;
    UUIDGen = homebridge.hap.uuid;

    homebridge.registerPlatform("homebridge-eNet-dev", "eNetPlatform-dev", eNetPlatform); //, true);
}


function eNetPlatform(log, config, api) {
    var eNetPlatform = this;
    this.log = log;
    this.config = config;
    this.accessories = [];
    this.delAccessories = [];
    this.gateways = [];
    this.loadState = 2; // didFinishLaunching & discover


    var discover = new eNet.discover();

    discover.on('discover', function(gw) {this.newGateway(gw)}.bind(this));

    if (api) {
        this.api = api;

        this.api.on('didFinishLaunching', function() {
            if (--this.loadState === 0) this.setupDevices();
        }.bind(this));
    }
    else --this.loadState;

    discover.discover(function(err) {
        if (err) console.log('Discovery error: ' + err);
        if (--this.loadState === 0) this.setupDevices();
    }.bind(this));

};

eNetPlatform.prototype.newGateway = function (gw) {
    ++this.loadState;
    var g = new eNet.gateway(gw);

    g.getChannelInfo(function(err, res) {
        if (!err)
        {
            if (res && Array.isArray(res.DEVICES)) {
                g.devices = res.DEVICES;
                this.gateways.push(g);
            }
            else err = JSON.stringify(res);
        }

        if (err) this.log.warn("Failed to get gateway channels, ignoring gateway. Error: " + err);
        if (--this.loadState === 0) this.setupDevices();
    }.bind(this));
};

eNetPlatform.prototype.setupDevices = function() {
    if (Array.isArray(this.config.gateways)) {
        for (var i = 0; i < this.config.gateways.length; ++i) {
            var gw = this.config.gateways[i];
            if (Array.isArray(gw.accessories)) {
                var g;
                if (gw.host) g = this.findGateway(gw.host);
                if (!g && gw.mac) g = this.findGateway(gw.mac);
                if (!g && gw.name) g = this.findGateway(gw.name);

                if (!g && gw.host) {
                    g = new eNet.gateway(gw);
                    ++this.loadState;

                    g.getChannelInfo(function(err, res) {
                        if (!err)
                        {
                            if (res && Array.isArray(res.DEVICES)) {
                                g.devices = res.DEVICES;
       				console.log("res.DEVICES are" + JSON.stringify(res));
                                this.gateways.push(g);
                            }
                            else err = JSON.stringify(res);
                        }

                        if (err) this.log.warn("Failed to get gateway channels, ignoring gateway. Error: " + err);
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
                            }
                            else {
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
                }
                else this.log.warn("Cannot find gateway: " + JSON.stringify(gw));
            }
            else this.log.warn("Gateway has no accessories: " + JSON.stringify(gw));
        }
    }
    else this.log.warn("No gateways defined: " + JSON.stringify(this.config));

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

                    service
			.getCharacteristic(Characteristic.Brightness)
                      	.on('get', getBrightness.bind(acc))
                      	.on('set', setBrightness.bind(acc));
                }
		else {
                    service.removeCharacteristic(Characteristic.Brightness);
                }
            }
            if (acc.context.type  === "Light") {
	    }
        }
        else {
            this.log.info("Deleting old accessory: " + JSON.stringify(acc.context));
            this.delAccessories.push(acc);
        }
    }

    if (this.delAccessories.length) this.api.unregisterPlatformAccessories("homebridge-eNet-dev", "eNetPlatform-dev", this.delAccessories);
    this.delAccessories = [];
    this.accessories = keep;

    this.log.info("Platform initialization finishd: " + this.accessories.length + " accessories available.");
    this.log.info("Signing in now!");

    //HIER SIGN IN!!!!!!!!!!!   #####################################
    var accChannels = [];
    for (var k = 0; k < this.accessories.length; k++) {
	accChannels.push(this.accessories[k].context.channel);
	this.accessories[k].on('UpdateAvailable', function (obje){
		console.log("Eventlistener for: " + this.accessories[k].context.name);
	}.bind(this));
    }
    ///###################################################################
    for (var i = 0; i < this.gateways.length; i++) {
        var gw = this.gateways[i];
	gw.updateAccessories(this.accessories);  //Gateway kennt seine Accesories!
	gw.signIn(accChannels);
	gw.on('UpdateAvailableForChannel', function (correctedChannelAsIndex, values) {
		this.updateChannel(correctedChannelAsIndex, values);
		//var service = this.accessories[correctedChannelAsIndex].getService(Service.Lightbulb);
		//service.getCharacteristic(Characteristic.On).updateValue(values.STATE);
		//service.getCharacteristic(Characteristic.Brightness).updateValue(values.VALUE);
	}.bind(this));




/*	gw.on('UpdateAvailable', function (obje){
//Muss überarbeitet werden -> emitter und so.... gibt mega delay!
		this.log.info("Received an update!" + JSON.stringify(obje));
		for (var i = 0; i < obje.length; i++) {
//			console.log("Doing" + obje[i].NUMBER);
			var service = this.accessories[obje[i].NUMBER-16].getService(Service.Lightbulb);
			if(service){
                                var state = (obje[i].STATE == "ON" ? true : false);
                                console.log("Channel: " + obje[i].NUMBER + " State: " + state + " Value: " + obje[i].VALUE);
				this.receivedState = state;
                                service.getCharacteristic(Characteristic.On).updateValue(state);
				this.brightness = obje[i].VALUE;
                                service.getCharacteristic(Characteristic.Brightness).updateValue(obje[i].VALUE);
                        }
		}
	}.bind(this));*/
    }
}

eNetPlatform.prototype.updateChannel = function(correctedChannelAsIndex, values) {
	values.TIME = Math.floor(Date.now()/100);
	//{"NUMBER":"16","VALUE":"30","STATE":"ON","SETPOINT":"255","TIME":15143003617}
	console.log("UPDATES: " + JSON.stringify(values));

	var service = this.accessories[correctedChannelAsIndex].getService(Service.Lightbulb);
    var state = (values.UPDATES.STATE === "ON" ? true : false);
	console.log("Service: " + service + " State: " + state);	
//		service.getCharacteristic(Characteristic.On).updateValue(state);
//              service.getCharacteristic(Characteristic.Brightness).updateValue(this.latestUpdates[correctedChannelAsIndex].UPDATES.VALUE);
//		if(this.updateQueue[correctedChannelAsIndex]) clearTimeout(this.updateQueue[correctedChannelAsIndex]);
/*		else { 	//Wenn es noch keinen Timer gab...dann senden wir das erste Update direkt!
			//Dann werden die Updates gequeued.
			service.getCharacteristic(Characteristic.On).updateValue(state);
                        service.getCharacteristic(Characteristic.Brightness).updateValue(this.latestUpdates[correctedChannelAsIndex].UPDATES.VALUE);
			console.log("Immediately sending the update: " + this.latestUpdates[correctedChannelAsIndex].UPDATES.NUMBER);
		}
        	//Timer clearen wenn es ihn gibt und der gerade empfangene Datensatz nicht dem schon gespeichertem entspricht.
        	//if(!this.updateQueue[correctedChannelAsIndex]){ //Wenn schon ein Timer gesetzt wurde ersetzen wir ihn nicht!
        	        this.updateQueue[correctedChannelAsIndex] = setTimeout(function() {
        	  		service.getCharacteristic(Characteristic.On).updateValue(state);
			        service.getCharacteristic(Characteristic.Brightness).updateValue(this.latestUpdates[correctedChannelAsIndex].UPDATES.VALUE);
        	                this.updateQueue[correctedChannelAsIndex] = null;
				console.log("Just sending the update: " + this.latestUpdates[correctedChannelAsIndex].UPDATES.NUMBER + " to state: " + state + " value: " + this.latestUpdates[correctedChannelAsIndex].UPDATES.VALUE);
        	        }.bind(this), 1000);
        	//}
	}
//        console.log("Just sending the update: " + this.latestUpdates[correctedChannelAsIndex].UPDATES.NUMBER + " to state: " + state + " value: " + this.latestUpdates[correctedChannelAsIndex].UPDATES.VALUE);
/*	else if(this.updateQueue[correctedChannelAsIndex]) clearTimeout(this.updateQueue[correctedChannelAsIndex]);
	//Timer clearen wenn es ihn gibt und der gerade empfangene Datensatz nicht dem schon gespeichertem entspricht.
	if(!this.updateQueue[correctedChannelAsIndex]){ //Wenn schon ein Timer gesetzt wurde ersetzen wir ihn nicht!
		this.updateQueue[correctedChannelAsIndex] = setTimeout(function() {
			var service = this.accessories[correctedChannelAsIndex].getService(Service.Lightbulb);
			var state = (this.latestUpdates[correctedChannelAsIndex].UPDATES.STATE === "ON" ? true : false);
	        	service.getCharacteristic(Characteristic.On).updateValue(state);
        		service.getCharacteristic(Characteristic.Brightness).updateValue(this.latestUpdates[correctedChannelAsIndex].UPDATES.VALUE);
    			console.log("Just sending the update: " + this.latestUpdates[correctedChannelAsIndex].UPDATES.NUMBER + " to state: " + state + " value: " + this.latestUpdates[correctedChannelAsIndex].UPDATES.VALUE);
			this.updateQueue[correctedChannelAsIndex] = null;
		}.bind(this), 1000);
	}
*/
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

// Function invoked when homebridge tries to restore cached accessory.
// Developer can configure accessory at here (like setup event handler).
// Update current value.
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
        accessory.addService(Service.Window, conf.name)
    }
    else if (conf.type === "Light") {
        accessory.addService(Service.Lightbulb, conf.name)
    }
    else if (conf.type === "Switch") {
        accessory.addService(Service.Switch, conf.name)
    }
    else {
        this.log.warn("Cannot add accessory, invalid config: " + JSON.stringify(conf));
        return;
    }

    accessory.context.gateID = gate.id;
    accessory.context.type = conf.type;
    accessory.context.channel = conf.channel;
    accessory.context.name = conf.name;
    accessory.context.duration = conf.duration;
    accessory.context.dimmable = conf.dimmable;
    accessory.receivedBrightness = 0;
    accessory.receivedState = false;
    accessory.positionState = false;


    if (this.setupAccessory(accessory)) {
        accessory.reachable = true;
        accessory.gateway = gate;
        this.accessories.push(accessory);
        this.api.registerPlatformAccessories("homebridge-eNet-dev", "eNetPlatform-dev", [accessory]);
    }
}

eNetPlatform.prototype.setupAccessory = function(accessory) {
    var service;
    console.log("setting up the accesory");
    accessory.log = this.log;

    if (accessory.getService(Service.WindowCovering)) {
        this.log.info("setupAccessory: Rejecting WindowCovering acessory" + accessory.context.name);

        this.delAccessories.push(accessory);
        return false;
    }

    if (service = accessory.getService(Service.Lightbulb)) {
        service
		.getCharacteristic(Characteristic.On)
                .on('set', setOn.bind(accessory))
		.on('get', getOn.bind(accessory));
    }
    else if (service = accessory.getService(Service.Switch)) {
        service
          .getCharacteristic(Characteristic.On)
          .on('set', setOn.bind(accessory));
    }
    else if (service = accessory.getService(Service.Window)) {
        accessory.position = 0;
        accessory.targetPosition = 0;

        service.setCharacteristic(Characteristic.CurrentPosition, accessory.position);
        service.getCharacteristic(Characteristic.CurrentPosition)
          .on('get', getCurrentPosition.bind(accessory));

        service.setCharacteristic(Characteristic.TargetPosition, accessory.position);
        service.getCharacteristic(Characteristic.TargetPosition)
          .on('set', setTargetPosition.bind(accessory));

        // Characteristic.PositionState.DECREASING = 0;
        // Characteristic.PositionState.INCREASING = 1;
        // Characteristic.PositionState.STOPPED = 2;
        accessory.positionState = Characteristic.PositionState.STOPPED;

        service.setCharacteristic(Characteristic.PositionState, accessory.positionState);
        service.getCharacteristic(Characteristic.PositionState)
          .on('get', getPositionState.bind(accessory));
    }
    else
    {
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

function getCurrentPosition(callback) {
  this.log.info("getCurrentPosition " + this.context.name + ": " + this.position);
  callback(null, this.position);
}

function setTargetPosition(position, callback) {
  if (!this.gateway) {
    this.log.warn("eNet device not ready.");
    callback(new Error("eNet device not ready."));
    return;
  }

  this.log.info("Setting " + this.context.name + " to " + position);

  if (this.position > position) this.positionState = Characteristic.PositionState.DECREASING
  else this.positionState = Characteristic.PositionState.INCREASING;

  this.position = position;

  this.getService(Service.Window).setCharacteristic(Characteristic.CurrentPosition, this.position);
  this.getService(Service.Window).setCharacteristic(Characteristic.PositionState, this.positionState);

  callback(null);

  this.gateway.setValueBlind(this.context.channel, 100 - position, function(err, res) {
      if (err) {
          this.log.warn("Error setting " + this.context.name + " to " + this.position + ": " + err);
          //callback(err);
      }
      else {
          this.log.info("Succeeded setting " + this.context.name + " to " + this.position + " : " + JSON.stringify(res));
          // this.getService(Service.Window).setCharacteristic(Characteristic.CurrentPosition, this.position);

          //callback(null);
      }
  }.bind(this));

  this.positionState = Characteristic.PositionState.STOPPED;
  this.getService(Service.Window).setCharacteristic(Characteristic.PositionState, this.positionState);
}

function getPositionState(callback) {
  this.log.info("getPositionState " + this.context.name + ": " + this.positionState);
  callback(null, this.positionState);
}

function getOn(callback) {
  if (!this.gateway) {
    this.log.warn("eNet device not ready.");
    callback(new Error("eNet device not ready."));
    return;
  }
  this.log.info("getOn " + this.context.name + ": " + this.receivedState);
  //this.positionState = this.receivedState;
  callback(null, this.receivedState);
}

function setOn(position, callback) {
  if (!this.gateway) {
    this.log.warn("eNet device not ready.");
    callback(new Error("eNet device not ready."));
    return;
  }
  this.log.info("Setting " + this.context.name + " to " + position);

  callback(null);
  this.log.info("Ich war bereits: " + this.receivedState);
  setTimeout(function() {}, 10000);
  this.log.info("Genug gewartet.");
//  if( position !== true && position !== false) {}
  if(this.receivedState === true && position === true) {} //Wenn aktuell schon an wenn schon aus, dann setze nochmal aus.
  else if( this.receivedState === false && position === false) {} //Wenn es gedimmt werden soll entspricht value einer Zahl und keinem boolean
  else {
	if (position === true || position === false){
		this.receivedState = position;
		var service = this.getService(Service.Lightbulb) || this.getService(Service.Switch);
                if (service) {
			service.getCharacteristic(Characteristic.On).setValue(position);
		}
	}
	this.gateway.setValue(this.context.channel, position, false, function(err, res) {
          if (err) {
            this.log.warn("Error setting " + this.context.name + " to " + (position ? "DEV2:on" : "DOFF2:off") + ": " + err);
            //callback(err);
          }
          else {
            this.log.info("Succeeded setting " + this.context.name + " to " + (position ? "DEV3:on" : "DOFF3:off") + ": ");
            //callback(null);
            if (position && this.context.duration) {
                var service = this.getService(Service.Lightbulb) || this.getService(Service.Switch);
                if (service) {
                    setTimeout(function() {
                    service.getCharacteristic(Characteristic.On).setValue(false);}, this.context.duration * 1000);
                }
            }
          }
    	}.bind(this));
   }
}



function getBrightness(callback) {
//  this.brightness = this.receivedBrightness;
  this.log.info("getBrightness " + this.context.name + ": " + this.brightness);
  callback(null, this.brightness);
}

function setBrightness(brightness, callback) {
  this.log.info("DEVMODESET:setBrightness " + this.context.name + ": " + brightness);
  callback(null);

  this.brightness = brightness;
  this.receivedState = (brightness > 0) ? true : false;
  this.gateway.setValueDim(this.context.channel, brightness, function(err, res) {
      if (err) {
          this.log.warn("setValueDim:Error setting " + this.context.name + " to " + this.brightness + ": " + err);
          //callback(err);
      }
      else {
          this.log.info("setValueDim:Succeeded setting " + this.context.name + " to " + this.brightness + " : " + JSON.stringify(res));
	  service.getCharacteristic(Characteristic.On).setValue(this.receivedState);
//    this.service.getCharacteristic(Characteristic.Brightness
          //callback(null);
      }
  }.bind(this));
}
