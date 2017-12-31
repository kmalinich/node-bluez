// BlueZ docs: https://git.kernel.org/pub/scm/bluetooth/bluez.git/tree/doc/media-api.txt

class MediaPlayer {
	constructor(_interface) {
		this._interface = _interface;
	}


	Play() {
		return new Promise((resolve, reject) => {
			this._interface.Play((err) => {
				if (err) return reject(err);
				resolve();
			});
		});
	}

	Pause() {
		return new Promise((resolve, reject) => {
			this._interface.Pause((err) => {
				if (err) return reject(err);
				resolve();
			});
		});
	}

	Stop() {
		return new Promise((resolve, reject) => {
			this._interface.Stop((err) => {
				if (err) return reject(err);
				resolve();
			});
		});
	}

	Next() {
		return new Promise((resolve, reject) => {
			this._interface.Next((err) => {
				if (err) return reject(err);
				resolve();
			});
		});
	}

	Previous() {
		return new Promise((resolve, reject) => {
			this._interface.Previous((err) => {
				if (err) return reject(err);
				resolve();
			});
		});
	}

	FastForward() {
		return new Promise((resolve, reject) => {
			this._interface.FastForward((err) => {
				if (err) return reject(err);
				resolve();
			});
		});
	}

	Rewind() {
		return new Promise((resolve, reject) => {
			this._interface.Rewind((err) => {
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

	Browsable() {
		return this.getProperty('Browsable');
	}

	Device() {
		return this.getProperty('Device');
	}

	Name() {
		return this.getProperty('Name');
	}

	Playlist() {
		return this.getProperty('Playlist');
	}

	Position() {
		return this.getProperty('Position');
	}

	Searchable() {
		return this.getProperty('Searchable');
	}

	Status() {
		return this.getProperty('Status');
	}

	Subtype() {
		return this.getProperty('Subtype');
	}

	Track() {
		return this.getProperty('Track');
	}

	Type() {
		return this.getProperty('Type');
	}


	/* Read-write properties */

	Equalizer(value) {
		if (value !== undefined) return this.setProperty('Equalizer', value);
		return this.getProperty('Equalizer');
	}

	Repeat(value) {
		if (value !== undefined) return this.setProperty('Repeat', value);
		return this.getProperty('Repeat');
	}

	Scan(value) {
		if (value !== undefined) return this.setProperty('Scan', value);
		return this.getProperty('Scan');
	}

	Shuffle(value) {
		if (value !== undefined) return this.setProperty('Shuffle', value);
		return this.getProperty('Shuffle');
	}
}

module.exports = MediaPlayer;
