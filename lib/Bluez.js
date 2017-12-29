/* eslint no-console : 0 */

const EventEmitter = require('events').EventEmitter;

const DBus = require('dbus');
const util = require('util');

const Adapter     = require('./Adapter');
const Agent       = require('./Agent');
const Device      = require('./Device');
const MediaPlayer = require('./MediaPlayer');
// const Profile     = require('./Profile');

const AVRCProfile   = require('./AVRCProfile');
const SerialProfile = require('./SerialProfile');


class Bluez extends EventEmitter {
	constructor(options) {
		super();

		this.options = Object.assign({
			service    : null, // connection local service
			objectPath : '/org/node/bluez',
		}, options);

		this.bus = this.options.bus || this.getUserService().bus;
		// DBus.getBus('system');

		if (this.options.service && typeof this.options.service !== 'string') { this.userService = this.options.service; }

		this.getInterface = util.promisify(this.bus.getInterface.bind(this.bus));

		this.adapter       = {};
		this.controls      = {};
		this.devices       = {};
		this.items         = {};
		this.media_players = {};
		this.players       = {};
		this.transports    = {};

		this.prop_media_players = {};
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

	async getMediaPlayer(path) {
		const match = path.match(new RegExp('^/org/bluez/(\\w+)/dev_(\\w+)$'));

		if (match) path = match[2];
		path = path.replace(/:/g, '_');

		// This is where the initial string value is checked in the this.{interface_type} object,
		// and if it is not a string, then it's interface is created
		if (this.media_players[path] && typeof this.media_players[path] !== 'string') {
			// Media player already created
			return this.media_players[path];
		}

		// Create PropertiesChanged listener
		this.prop_media_players[path] = await this.getInterface('org.bluez', this.media_players[path], 'org.freedesktop.DBus.Properties');
		this.prop_media_players[path].on('PropertiesChanged', this.onPropertiesChanged.bind(this));

		if (!this.media_players[path]) throw new Error('Media player not found');
		const interface_ = await this.getInterface('org.bluez', this.media_players[path], 'org.bluez.MediaPlayer1');
		return new MediaPlayer(interface_);
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

		Possible errors:
			org.bluez.Error.InvalidArguments
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
		if (process.env.NODE_ENV !== 'production') {
			console.log('===== PropertiesChanged =====');
			console.log(JSON.stringify({ path : path, properties : properties }, null, 2));
			console.log('=============================');
		}

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
			this.emit(event_name, { path : path, properties : properties });
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

		if (process.env.NODE_ENV !== 'production') {
			console.log('===== InterfacesAdded =====');
			console.log(JSON.stringify({ path : path, interfaces : interfaces, matches : matches }, null, 2));
			console.log('=============================');
		}

		// OK so what's supposed to happen here, is
		// we just emit the event for the added interface,
		// but we don't actually create the interface, that
		// step is done by the 'get{interface_name}(path)' functions
		//
		// In the mean time, this is sort of a proof of concept of further interfaces

		if (matches.device) {
			if (interfaces['org.bluez.Adapter1']) {
				let object = matches.device[1];

				// This is where the initial string value is set in the this.{interface_type} object
				this.adapter[object] = path;
				this.emit('added-Adapter', {  object : object, path : path, properties : interfaces['org.bluez.Adapter1'] });

				object = undefined;
			}

			if (interfaces['org.bluez.Device1']) {
				let object = matches.device[2];

				// This is where the initial string value is set in the this.{interface_type} object
				this.devices[object] = path;
				this.emit('added-Device', { object : object, path : path, properties : interfaces['org.bluez.Device1'] });

				object = undefined;
			}

			if (interfaces['org.bluez.Network1']) {
				let object = matches.device[2];

				this.emit('added-Network', { object : object, path : path, properties : interfaces['org.bluez.Network1'] });

				object = undefined;
			}

			if (interfaces['org.bluez.MediaControl1']) {
				let object = matches.device[2];

				this.emit('added-MediaControl', { object : object, path : path, properties : interfaces['org.bluez.MediaControl1'] });

				if (typeof this.items[object] === 'undefined' || this.items[object] === null || this.items[object] === '') {
					this.controls[object] = await this.getInterface('org.bluez', path, 'org.freedesktop.DBus.Properties');
					this.controls[object].on('InterfacesAdded',   this.onInterfacesAdded.bind(this));
					this.controls[object].on('PropertiesChanged', this.onPropertiesChanged.bind(this));
				}

				object = undefined;
			}
		}

		if (matches.player) {
			if (interfaces['org.bluez.MediaPlayer1']) {
				let object = matches.player[2] + '.' + 'player' + matches.player[3];

				// This is where the initial string value is set in the this.{interface_type} object
				this.media_players[object] = path;
				this.emit('added-MediaPlayer', { object : object, path : path, properties : interfaces['org.bluez.MediaPlayer1'] });

				object = undefined;
			}
		}


		if (matches.fd) {
			if (interfaces['org.bluez.MediaTransport1']) {
				let object = matches.fd[2] + '.' + 'fd' + matches.fd[3];

				this.emit('added-MediaTransport', { object : object, path : path, properties : interfaces['org.bluez.MediaTransport1'] });

				if (typeof this.items[object] === 'undefined' || this.items[object] === null || this.items[object] === '') {
					this.transports[object] = await this.getInterface('org.bluez', path, 'org.freedesktop.DBus.Properties');
					this.transports[object].on('InterfacesAdded',   this.onInterfacesAdded.bind(this));
					this.transports[object].on('PropertiesChanged', this.onPropertiesChanged.bind(this));
				}

				object = undefined;
			}
		}

		if (matches.filesystem) {
			if (interfaces['org.bluez.MediaItem1']) {
				let object = matches.filesystem[2];

				this.emit('added-Filesystem', { object : object, path : path, properties : interfaces['org.bluez.MediaItem1'] });

				object = undefined;
			}
		}

		if (matches.nowplaying) {
			if (interfaces['org.bluez.MediaItem1']) {
				let object = matches.nowplaying[2];

				this.emit('added-MediaItem', { object : object, path : path, properties : interfaces['org.bluez.MediaItem1'] });

				if (typeof this.items[object] === 'undefined' || this.items[object] === null || this.items[object] === '') {
					this.items[object] = await this.getInterface('org.bluez', path, 'org.freedesktop.DBus.Properties');
					this.items[object].on('InterfacesAdded',   this.onInterfacesAdded.bind(this));
					this.items[object].on('PropertiesChanged', this.onPropertiesChanged.bind(this));
				}

				object = undefined;
			}
		}

		if (matches.nowplaying_item) {
			if (interfaces['org.bluez.MediaItem1']) {
				let object = matches.nowplaying_item[2] + '.' + 'player' + matches.nowplaying_item[3] + '.' + 'item' + matches.nowplaying_item[4];

				this.emit('added-MediaItem', { object : object, path : path, properties : interfaces['org.bluez.MediaItem1'] });

				if (typeof this.items[object] === 'undefined' || this.items[object] === null || this.items[object] === '') {
					this.items[object] = await this.getInterface('org.bluez', path, 'org.freedesktop.DBus.Properties');
					this.items[object].on('InterfacesAdded',   this.onInterfacesAdded.bind(this));
					this.items[object].on('PropertiesChanged', this.onPropertiesChanged.bind(this));
				}

				object = undefined;
			}
		}
	}

	async onInterfaceRemoved(path, properties/*: string[] */) {
		const match = path.match(new RegExp('^/org/bluez/(\\w+)(?:/dev_(\\w+))?$'));

		if (process.env.NODE_ENV !== 'production') {
			console.log('===== InterfacesRemoved =====');
			console.log(JSON.stringify({ path : path, properties : properties }, null, 2));
			console.log('=============================');
		}

		if (!match) return;

		if (match[2]) { // Device
			if (properties.indexOf('org.bluez.Device1') >= 0) {
				if (process.env.NODE_ENV !== 'production') console.log('Remove device', properties);
				delete this.devices[match[2]];
			}
		}
		else if (match[1]) { // Adapter
			if (properties.indexOf('org.bluez.Adapter1') >= 0) {
				if (process.env.NODE_ENV !== 'production') console.log('Remove adapter', properties);
				delete this.adapter[match[1]];
			}
		}
	}
}

module.exports = Bluez;
