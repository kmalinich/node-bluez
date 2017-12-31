// BlueZ docs: https://git.kernel.org/pub/scm/bluetooth/bluez.git/tree/doc/media-api.txt

class MediaTransport {
	constructor(_interface) {
		this._interface = _interface;
	}


	Acquire() {
		return new Promise((resolve, reject) => {
			this._interface.Acquire((err) => {
				if (err) return reject(err);
				resolve();
			});
		});
	}

	TryAquire() {
		return new Promise((resolve, reject) => {
			this._interface.TryAquire((err) => {
				if (err) return reject(err);
				resolve();
			});
		});
	}

	Release() {
		return new Promise((resolve, reject) => {
			this._interface.Release((err) => {
				if (err) return reject(err);
				resolve();
			});
		});
	}


	/* Property functions */

	getProperties() {
		return new Promise((resolve, reject) => {
			this._interface.getProperties((err, props) => {
				if (err) return reject(err);
				resolve(props);
			});
		});
	}

	getProperty(name) {
		return new Promise((resolve, reject) => {
			this._interface.getProperty(name, (err, val) => {
				if (err) return reject(err);
				resolve(val);
			});
		});
	}

	setProperty(name, value) {
		return new Promise((resolve, reject) => {
			this._interface.setProperty(name, value, (err) => {
				if (err) return reject(err);
				resolve();
			});
		});
	}


	/* Read-only properties */

	Codec() {
		return this.getProperty('Codec');
	}

	Configuration() {
		return this.getProperty('Configuration');
	}

	Device() {
		return this.getProperty('Device');
	}

	State() {
		return this.getProperty('State');
	}

	UUID() {
		return this.getProperty('UUID');
	}


	/* Read-write properties */

	Delay(value) {
		if (value !== undefined) return this.setProperty('Delay', value);
		return this.getProperty('Delay');
	}

	Volume(value) {
		if (value !== undefined) return this.setProperty('Volume', value);
		return this.getProperty('Volume');
	}
}

module.exports = MediaTransport;
