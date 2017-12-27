const Bluez = require('./lib/Bluez');

Bluez.Bluez = Bluez;

Bluez.Adapter = require('./lib/Adapter');
Bluez.Agent   = require('./lib/Agent');
Bluez.Device  = require('./lib/Device');
Bluez.Profile = require('./lib/Profile');

Bluez.RawFdSocket = require('./lib/RawFdSocket');

Bluez.AVRCProfile   = require('./lib/AVRCProfile');
Bluez.SerialProfile = require('./lib/SerialProfile');

module.exports = Bluez;
