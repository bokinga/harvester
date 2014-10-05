// dependencies
const patcher = require('./lib/patcher');
const _ = require('lodash');
const io = require('socket.io-client');
const os = require('os');
const extend = require('extend');
const usage = require('usage');
const bPromise = require('bluebird');

function Harvester(opts) {
  // ensure we have (at the least) the default options we need
  const defaults = {
    host: 'http://localhost:30000',
    name: 'Node Application'
  };
  opts = extend({}, defaults, opts);

  this.connected = false;
  this._crops = {};
  this._modules = {};

  // environment
  this.name = opts.name;

  // socket
  this.socket = io.connect(opts.host);
  this.socket.on('connect', this._onSocketConnected.bind(this));
  this.socket.on('disconnect', this._onSocketDisconnected.bind(this));

  // patch the loader so we can inject the harvester
  patcher.patchModuleLoader(this);
}

Harvester.prototype._getIPAddresses = function _getIP() {
  var interfaces = os.networkInterfaces();
  var addresses = [];

  Object.keys(interfaces).forEach(function(name) {
    Object.keys(interfaces[name]).forEach(function(property) {
      var address = interfaces[name][property];
      if (address.family === 'IPv4' && !address.internal) {
        addresses.push(address.address);
      }
    });
  });

  return addresses;
};

Harvester.prototype.startHarvesting = function startHarvesting(name, interval, callback) {
  if (!_.isFunction(callback)) {
    throw new Error('Callback must be a valid function');
  }

  interval = parseInt(interval, 10) || 3000;
  var harvest = _.partial(this.harvest.bind(this), name);

  // continue harvesting every `interval` of time
  this._crops[name] = setInterval(function() {
    var result = callback();

    // handle promises that are passed to us
    if (_.isFunction(result.then)) {
      return result.then(harvest);
    }
    
    // handle non-promises
    harvest(result);
  }, interval);
};

Harvester.prototype.stopHarvesting = function stopHarvesting(name) {
  if (this._crops[name]) {
    clearInterval(this._crops[name]);
    delete this._crops[name];
  }
};

Harvester.prototype.harvest = function harvest(name, data) {
  if (!this.connected) {
    return;
  }

  var harvestData = {
    appName: this.name,
    data: data
  };

  this.socket.emit(name, harvestData);
};

Harvester.prototype._onSocketConnected = function _onSocketConnected() {
  this.connected = true;

  // one-time harvesters
  var cpus = os.cpus();
  this.harvest('environment', {
    title: process.title,
    version: process.version,
    architecture: process.arch,
    platform: process.platform,
    hostName: os.hostname(),
    pid: process.pid,
    ip: this._getIPAddresses(),
    ram: (os.totalmem()/1024/1024/1024) + 'gb',
    cpus: {
      count: cpus.length,
      type: (cpus.length > 0) ? cpus[0].model : 'unknown'
    }
  });

  // interval harvesters
  this.startHarvesting('health', 5000, this._monitorHealth.bind(this));
  this.startHarvesting('process.info', 60000, this._monitorProcessInfo.bind(this));
};

Harvester.prototype._onSocketDisconnected = function _onSocketDisconnected() {
  this.connected = false;
  this.stopHarvesting('health');
  this.stopHarvesting('process.info');
};

Harvester.prototype._monitorHealth = function _monitorHealth() {
  var promises = {
    usage: this._getProcessUsage(),
    modules: bPromise.resolve(this._modules)
  };
  return bPromise.props(promises);
};

Harvester.prototype._monitorProcessInfo = function _monitorProcessInfo() {
  return {
    uptime: process.uptime()
  };
};

Harvester.prototype.registerModule = function registerModule(name, version) {
  this._modules[name] = version;
};

Harvester.prototype._getProcessUsage = function _getProcessUsage() {
  return new bPromise(function(resolve, reject) {
    var options = { keepHistory: true };
    usage.lookup(process.pid, function(err, result) {
      if (err) {
        return reject(err);
      }

      resolve(result);
    });
  });
};

exports = module.exports = Harvester;
