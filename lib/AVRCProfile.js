const EventEmitter = require('events').EventEmitter;
const Profile      = require('./Profile');

class AVRCProfile extends Profile {
	constructor(bluez, DBusObject, listener) {
		super(bluez, DBusObject);
		this.listener = listener;
	}

	get uuid() {
		return AVRCProfile.uuid;
	}

	NewConnection(devicePath, fd, options, callback) {
		console.log('AVRCProfile.NewConnection.devicePath : \'%s\'', devicePath);
		console.log('AVRCProfile.NewConnection.fd : \'%s\'', fd);

		this.bluez.getDevice(devicePath).then((device) => {
			this.listener(device, new RawFdSocket(fd, {
				encoding : 'utf8',
			}));

			callback();
		}).catch((err) => {
			callback(err);
		});
	}
}

AVRCProfile.uuid = '0000110e-0000-1000-8000-00805f9b34fb';

module.exports = AVRCProfile;
