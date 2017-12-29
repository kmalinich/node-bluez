/* eslint no-console : 0 */

const EventEmitter = require('events').EventEmitter;

const DBus = require('dbus');
const util = require('util');

const Adapter = require('./Adapter');
const Device  = require('./Device');
const Agent   = require('./Agent');
// const Profile = require('./Profile');

const AVRCProfile   = require('./AVRCProfile');
const SerialProfile = require('./SerialProfile');


class Bluez extends EventEmitter {
	constructor(options) {
		super();

		this.options = Object.assign({
			service    : null, // connection local service
			objectPath : '/org/node/bluez',
		}, options);

		this.bus = this.options.bus || this.getUserService().bus;// DBus.getBus('system');

		if (this.options.service && typeof this.options.service !== 'string') { this.userService = this.options.service; }

		this.getInterface = util.promisify(this.bus.getInterface.bind(this.bus));

		this.adapter    = {};
		this.controls   = {};
		this.devices    = {};
		this.items      = {};
		this.players    = {};
		this.transports = {};
	}

	async init() {
		this.objectManager  = await this.getInterface('org.bluez', '/',          'org.freedesktop.DBus.ObjectManager');
		this.agentManager   = await this.getInterface('org.bluez', '/org/bluez', 'org.bluez.AgentManager1');
		this.profileManager = await this.getInterface('org.bluez', '/org/bluez', 'org.bluez.ProfileManager1');

		this.objectManager.on('InterfacesAdded',   this.onInterfacesAdded.bind(this));
		this.objectManager.on('InterfacesRemoved', this.onInterfaceRemoved.bind(this));
		this.objectManager.on('PropertiesChanged', this.onPropertiesChanged.bind(this));

		this.objectManager.GetManagedObjects((err, objs) => {
			if (err) {
				console.error(err);
				return;
			}

			Object.keys(objs).forEach((k) => {
				this.onInterfacesAdded(k, objs[k]);
			});
		});
	}

	async getAdapter(dev) {
		const match = dev.match(new RegExp('^/org/bluez/(\\w+)$'));

		if (match) dev = match[1];
		// If the adapter was not discovered yet, try the default path
		let path = '/org/bluez/' + dev;

		if (this.adapter[dev]) {
			if (typeof this.adapter[dev] === 'string') {
				path = this.adapter[dev];
			}
			else {
				// Adapter already created
				return this.adapter[dev];
			}
		}

		const interface_ = await this.getInterface('org.bluez', path, 'org.bluez.Adapter1').catch((err) => {
			// TODO check err
			console.error(err);
			return null;
		});

		if (!interface_) throw new Error('Adapter not found');

		this.adapter[dev] = new Adapter(interface_);
		return this.adapter[dev];
	}

	async getDevice(address) {
		const match = address.match(new RegExp('^/org/bluez/(\\w+)/dev_(\\w+)$'));

		if (match) address = match[2];
		address = address.replace(/:/g, '_');

		if (this.devices[address] && typeof this.devices[address] !== 'string') {
			// Device already created
			return this.devices[address];
		}

		if (!this.devices[address]) throw new Error('Device not found');
		const interface_ = await this.getInterface('org.bluez', this.devices[address], 'org.bluez.Device1');
		return new Device(interface_);
	}

	/*
		This registers a profile implementation

		If an application disconnects from the bus all its registered profiles will be removed

		HFP HS UUID: 0000111e-0000-1000-8000-00805f9b34fb

				Default RFCOMM channel is 6, and this requires authentication

		Available options:
			string Name

				Human readable name for the profile

			string Service

				The primary service class UUID
				(if different from the actual
				profile UUID)

			string Role

				For asymmetric profiles that do not
				have UUIDs available to uniquely
				identify each side this
				parameter allows specifying the
				precise local role.

				Possible values: "client", "server"

			uint16 Channel

				RFCOMM channel number that is used
				for client and server UUIDs.

				If applicable it will be used in the
				SDP record as well.

			uint16 PSM

				PSM number that is used for client
				and server UUIDs.

				If applicable it will be used in the
				SDP record as well.

			boolean RequireAuthentication

				Pairing is required before connections
				will be established. No devices will
				be connected if not paired.

			boolean RequireAuthorization

				Request authorization before any
				connection will be established.

			boolean AutoConnect

				In case of a client UUID this will
				force connection of the RFCOMM or
				L2CAP channels when a remote device
				is connected.

			string ServiceRecord

				Provide a manual SDP record.

			uint16 Version

				Profile version (for SDP record)

			uint16 Features

				Profile features (for SDP record)

		Possible errors:
			org.bluez.Error.InvalidArguments
			org.bluez.Error.AlreadyExists
			*/
	registerProfile(profile, options) {
		// assert(profile instance of Profile)
		const self = this;

		return new Promise((resolve, reject) => {
			self.profileManager.RegisterProfile(profile._DBusObject.path, profile.uuid, options, (err) => {
				if (err) return reject(err);

				resolve();
			});
		});
	}

	registerAVRCProfile(listener, mode, options = {}) {
		if (!mode) mode = 'client';

		const obj     = this.getUserServiceObject();
		const profile = new AVRCProfile(this, obj, listener);

		options = Object.assign({
			Name : 'Node A/V Remote Control',
			Role : mode,
		}, options);

		return this.registerProfile(profile, options);
	}

	registerSerialProfile(listener, mode, options) {
		if (!mode) mode = 'client';

		const obj     = this.getUserServiceObject();
		const profile = new SerialProfile(this, obj, listener);

		options = Object.assign({
			Name : 'Node Serial Port',
			Role : mode,
		}, options);

		return this.registerProfile(profile, options);
	}

	/*
		This registers an agent handler.

		The object path defines the path of the agent
		that will be called when user input is needed.

		Every application can register its own agent and
		for all actions triggered by that application its
		agent is used.

		It is not required by an application to register
		an agent. If an application does chooses to not
		register an agent, the default agent is used. This
		is on most cases a good idea. Only application
		like a pairing wizard should register their own
		agent.

		An application can only register one agent. Multiple
		agents per application is not supported.

		The capability parameter can have the values
		"DisplayOnly", "DisplayYesNo", "KeyboardOnly",
		"NoInputNoOutput" and "KeyboardDisplay" which
		reflects the input and output capabilities of the
		agent.

		If an empty string is used it will fallback to
		"KeyboardDisplay".

		Possible errors: org.bluez.Error.InvalidArguments
								org.bluez.Error.AlreadyExists
								*/
	registerAgent(agent, capabilities) {
		// assert(agent instance of Agent)
		const self = this;
		return new Promise((resolve, reject) => {
			self.agentManager.RegisterAgent(agent._DBusObject.path, capabilities, (err) => {
				if (err) return reject(err);
				resolve();
			});
		});
	}

	registerDefaultAgent() {
		const obj = this.getUserServiceObject();
		const agent = new Agent(this, obj);
		return this.registerAgent(agent, 'KeyboardDisplay');
	}

	getUserService() {
		if (!this.userService) {
			this.userService = DBus.registerService('system', this.options.service);
		}
		return this.userService;
	}

	getUserServiceObject() {
		if (!this.userServiceObject) {
			this.userServiceObject = this.getUserService().createObject(this.options.objectPath);
		}
		return this.userServiceObject;
	}


	async onPropertiesChanged(path, properties) {
		console.log('');
		console.log('');
		console.log('');
		console.log('');
		console.log('===== PropertiesChanged =====');
		console.log(JSON.stringify({ path : path, properties : properties }, null, 2));
		console.log('=============================');

		// {
		//   "path": "org.bluez.MediaPlayer1",
		//   "properties": {
		//     "Track": {
		//       "Item": "/org/bluez/hci0/dev_AC_37_43_8B_74_48/player0/NowPlaying/item8896",
		//       "Album": "GRM Daily Presents: The Shortlist",
		//       "TrackNumber": 86,
		//       "Genre": "Hip-Hop/Rap",
		//       "Duration": 151000,
		//       "NumberOfTracks": 100,
		//       "Title": "Army Of Two",
		//       "Artist": "Russ"
		//     }
		//   }
		// }

		let ok2emit = false;
		switch (path) {
			case 'org.bluez.Adapter1'        :
			case 'org.bluez.Device1'         :
			case 'org.bluez.Filesystem1'     :
			case 'org.bluez.MediaControl1'   :
			case 'org.bluez.MediaItem1'      :
			case 'org.bluez.MediaPlayer1'    :
			case 'org.bluez.MediaTransport1' :
			case 'org.bluez.Network1'        : {
				ok2emit = true;
				break;
			}
		}

		if (ok2emit === true) {
			let event_name = 'changed-' + path.replace(/org\.bluez\./g, '').replace(/1$/g, '');
			this.emit(event_name, properties);
		}
	}

	async onInterfacesAdded(path, interfaces) {
		const matches = {
			device          : path.match(new RegExp('^/org/bluez/(\\w+)(?:/dev_(\\w+))?$')),
			fd              : path.match(new RegExp('^/org/bluez/(\\w+)(?:/dev_(\\w+))?/fd([0-9]{1})$')),
			filesystem      : path.match(new RegExp('^/org/bluez/(\\w+)(?:/dev_(\\w+))?/player([0-9]{1})/Filesystem$')),
			nowplaying      : path.match(new RegExp('^/org/bluez/(\\w+)(?:/dev_(\\w+))?/player([0-9]{1})/NowPlaying$')),
			nowplaying_item : path.match(new RegExp('^/org/bluez/(\\w+)(?:/dev_(\\w+))?/player([0-9]{1})/NowPlaying/item([0-9]{1,})$')),
			player          : path.match(new RegExp('^/org/bluez/(\\w+)(?:/dev_(\\w+))?/player([0-9]{1})$')),
		};

		console.log('');
		console.log('');
		console.log('');
		console.log('');
		console.log('===== InterfacesAdded =====');
		console.log(JSON.stringify({ path : path, interfaces : interfaces, matches : matches }, null, 2));
		console.log('=============================');

		if (matches.device) {
			if (interfaces['org.bluez.Adapter1']) {
				this.adapter[matches.device[1]] = path;
				this.emit('Adapter', interfaces['org.bluez.Adapter1']);
			}

			if (interfaces['org.bluez.Device1']) {
				this.devices[matches.device[2]] = path;
				this.emit('Device', interfaces['org.bluez.Device1']);
			}

			if (interfaces['org.bluez.Network1']) {
				this.emit('Network', interfaces['org.bluez.Network1']);
			}

			if (interfaces['org.bluez.MediaControl1']) {
				this.emit('MediaControl', interfaces['org.bluez.MediaControl1']);

				if (typeof this.items['item' + matches.device[2]] === 'undefined' || this.items['item' + matches.device[2]] === null || this.items['item' + matches.device[2]] === '') {
					this.controls['control' + matches.device[2]] = await this.getInterface('org.bluez', path, 'org.freedesktop.DBus.Properties');
					this.controls['control' + matches.device[2]].on('InterfacesAdded',   this.onInterfacesAdded.bind(this));
					this.controls['control' + matches.device[2]].on('PropertiesChanged', this.onPropertiesChanged.bind(this));
				}
			}
		}

		if (matches.fd) {
			if (interfaces['org.bluez.MediaTransport1']) {
				this.emit('MediaTransport', interfaces['org.bluez.MediaTransport1']);

				if (typeof this.items['item' + matches.fd[3]] === 'undefined' || this.items['item' + matches.fd[3]] === null || this.items['item' + matches.fd[3]] === '') {
					this.transports['fd' + matches.fd[3]] = await this.getInterface('org.bluez', path, 'org.freedesktop.DBus.Properties');
					this.transports['fd' + matches.fd[3]].on('InterfacesAdded',   this.onInterfacesAdded.bind(this));
					this.transports['fd' + matches.fd[3]].on('PropertiesChanged', this.onPropertiesChanged.bind(this));
				}
			}
		}

		if (matches.filesystem) {
			if (interfaces['org.bluez.Filesystem1']) {
				this.emit('Filesystem', interfaces['org.bluez.Filesystem1']);
			}
		}

		if (matches.nowplaying_item) {
			if (interfaces['org.bluez.MediaItem1']) {
				this.emit('MediaItem', interfaces['org.bluez.MediaItem1']);

				if (typeof this.items['item' + matches.nowplaying_item[4]] === 'undefined' || this.items['item' + matches.nowplaying_item[4]] === null || this.items['item' + matches.nowplaying_item[4]] === '') {
					this.items['item' + matches.nowplaying_item[4]] = await this.getInterface('org.bluez', path, 'org.freedesktop.DBus.Properties');
					this.items['item' + matches.nowplaying_item[4]].on('InterfacesAdded',   this.onInterfacesAdded.bind(this));
					this.items['item' + matches.nowplaying_item[4]].on('PropertiesChanged', this.onPropertiesChanged.bind(this));
				}
			}
		}

		if (matches.player) {
			if (interfaces['org.bluez.MediaPlayer1']) {
				this.emit('MediaPlayer', interfaces['org.bluez.MediaPlayer1']);

				if (typeof this.items['item' + matches.player[3]] === 'undefined' || this.items['item' + matches.player[3]] === null || this.items['item' + matches.player[3]] === '') {
					this.players['player' + matches.player[3]] = await this.getInterface('org.bluez', path, 'org.freedesktop.DBus.Properties');
					this.players['player' + matches.player[3]].on('InterfacesAdded',   this.onInterfacesAdded.bind(this));
					this.players['player' + matches.player[3]].on('PropertiesChanged', this.onPropertiesChanged.bind(this));
				}
			}
		}
	}

	async onInterfaceRemoved(path, props/*: string[] */) {
		const match = path.match(new RegExp('^/org/bluez/(\\w+)(?:/dev_(\\w+))?$'));

		if (!match) return;

		if (match[2]) { // Device
			if (props.indexOf('org.bluez.Device1') >= 0) {
				delete this.devices[match[2]];
				// console.log("Remove device", props);
			}
		}
		else if (match[1]) { // Adapter
			if (props.indexOf('org.bluez.Adapter1') >= 0) {
				delete this.adapter[match[1]];
				// console.log("Remove adapter", props);
			}
		}
	}
}

module.exports = Bluez;
