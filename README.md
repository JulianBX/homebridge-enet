# Initially by ChristophFausak

This package has been forked after Julian's has disappeared from NPM Registry

# Changes:
 v0.7.0 : Position updates for shutter devices.
 v0.6.4 : Now the eNet-Commands can update the homekit states and brightness.
          So, when using a hardware dimmer or switch the lightbulbs current state will be reflected.
          There is an issue with time delay and overlapping messages by the mobileGate:
            When changing the dimmer setting the mobile gate gives an update too fast and the bulb gets updated "on the way" to the desired dim setting.
            Not yet sure how to slow things down!
            Nontheless, it works with my dimmers and switches.
            Hopefully I didn't break anything, so please be careful.

# homebridge-enet

Gira/Jung eNet plugin for homebridge: https://github.com/nfarina/homebridge

This plugin can communicate with Jung/Gira Mobile Gateways and their provisioned devices.
Currently, the whole setup needs to be done with the respective Jung/Gira eNet app.
Then you need to get the channels for your devices. You might guess them - first used channel is 16.
Or you use the sampe-gateway.js from the homebridge-enet package to read the config of your gateway.


# Installation

1. Install homebridge using: `npm install -g homebridge`
2. Install this plugin using: `npm install -g https://github.com/levlevin/homebridge-gira-enet`
3. Update your configuration file. See the sample below.

# Configuration

Configuration sample:

 ```javascript

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


`autodiscover` is **optional**. If set to false, no broadcast discovery takes place, all gateways need to have the "host" property set. Default is to autodiscover gateways using broadcasts.

`gateways` is a list of gateways.

For each gateway, you need to give an identification, which will be used to find the gateway on the network. You have three possibilities:
* `host` - if you provide a hostname or ip address that is the identification for the gateway.
* `mac` - you can specify the mac-address of the gateway, e.g. by running sampe-discovery.js from the homebridge-enet package.
* `name` - identify gateway by its name. You can set this name with the Jung/Gira eNet app. Factory default is "Mobile Gate"

`accessories` is a list of defined accessories on the gateway. Every accessory has the following properies:
* `channel` - The eNet channel assigned to the accessory.
* `name` - The HomeKit name of the accessory.
* `type` - Type of accessory. Currently supported:
    * `Shutter` - Window accessory. You can set the target position.
    * `Switch` - An on/off switch.
    * `Light` - Same as `Switch`, but with a Lightbulb icon on Homekit.
* `duration` - **optional** When the accessory is switched on, it will be automatically switched off after `duration` seconds. Only for `Switch` and `Light` accessories.
* `dimmable` - **optional** Only for `Light` accessories.




# License

Published under the MIT License.
