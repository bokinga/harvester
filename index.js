// dependencies
const _ = require('lodash');
const os = require('os');
const extend = require('extend');
const usage = require('usage');
const bPromise = require('bluebird');
const patcher = require('./lib/patcher');
const utilities = require('./lib/utilities');
const Transport = require('./lib/transport');

// store a reference to the singleton socket connection
var _socketConnection = null;

function Harvester(opts) {
  // ensure we have (at the least) the default options we need
  const defaults = {
    host: 'http://localhost:30000',
    name: 'Node Application'
  };
  opts = extend({}, defaults, opts || {});

  // internal storage
  this._crops = {};
  this._filters = {};
  this._modules = {};

  // setup a new transport so we can harvest properly
  this._transport = new Transport({
    host: opts.host
  });
  this._transport.on('connected', this._onTransportConnect.bind(this));
  this._transport.on('disconnected', this._onTransportDisconnect.bind(this));

  // app name
  this.name = opts.name;

  // patch the loader so we can inject the harvester
  patcher.patchModuleLoader(this);
}

Harvester.prototype.startHarvesting = function startHarvesting(name, interval, callback) {
  if (!_.isFunction(callback)) {
    throw new Error('Callback must be a valid function');
  }

  interval = parseInt(interval, 10) || 3000;
  var harvest = _.partial(this.harvest.bind(this), name);

  // continue harvesting every `interval` of time
  this._crops[name] = setInterval(function performCropHarvest() {
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
  if (!this._crops[name]) {
    return;
  }

  clearInterval(this._crops[name]);
  delete this._crops[name];
};

Harvester.prototype.harvest = function harvest(name, data) {
  var harvestData = {
    appName: this.name,
    data: data
  };

  this._transport.send(name, harvestData);
};

Harvester.prototype._onTransportConnect = function _onTransportConnect() {
  // broadcast the environment data once (since we just connected)
  this._harvestEnvironmentData();

  // start our recurring harvest routines
  this.startHarvesting('process.info', 5000, this._getProcessInfo.bind(this));
};

Harvester.prototype._onTransportDisconnect = function _onTransportDisconnect() {
  this.stopHarvesting('process.info');
};

Harvester.prototype._harvestEnvironmentData = 
  function _harvestEnvironmentData() {
    var cpus = os.cpus();
    var environmentData = {
      title: process.title,
      version: process.version,
      architecture: process.arch,
      platform: process.platform,
      hostName: os.hostname(),
      pid: process.pid,
      ip: utilities.getIPAddresses(),
      ram: (os.totalmem()/1024/1024/1024) + 'gb',
      cpus: {
        count: cpus.length,
        type: (cpus.length > 0) ? cpus[0].model : 'unknown'
      }
    };

    // allow other plugins to modify the environment data
    environmentData = this.applyFilters('environment', environmentData);
    this.harvest('environment', environmentData);
  };

Harvester.prototype._getProcessInfo = function _getProcessInfo() {
  var promises = {
    usage: this._getProcessUsage(),
    modules: bPromise.resolve(this._modules),
    uptime: bPromise.resolve(process.uptime())
  };
  return bPromise.props(promises);
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

Harvester.prototype.addFilter = 
  function addFilter(name, callback, priority, context) {
    if (!_.isString(name) || name.length === 0 ) {
      throw new Error('Filter name must be a string with 1 or more characters');
    } else if (!_.isFunction(callback)) {
      throw new Error('Filter callback must be a valid function');
    }

    // ensure this filter name exists
    if (!_.isArray(this._filters[name])) {
      this._filters[name] = [];
    }

    // add the new filter and sort by priority
    this._filters[name].push({
      callback: callback,
      priority: (_.isNumber(priority) ? priority : 10),
      context: context || null
    });
    this._filters[name] = _.sortBy(this._filters[name], 'priority');
};

Harvester.prototype.removeFilter = 
  function removeFilter(name, callback) {
    if (!_.isString(name) || name.length === 0) {
      throw new Error('Filter name must be a string with 1 or more characters');
    } else if (!_.isFunction(callback)) {
      throw new Error('Filter callback must be a valid function');
    }

    // remove any filters that were previously added with the specified callback
    var filters = this._filters[name];
    for (var i = filters.length; i--;) {
      if (filters[i].callback === callback) {
        this._filters[name].splice(i, 1);
      }
    }
  };

Harvester.prototype.applyFilters = function applyFilters(/* name, data */) {
  var args = Array.prototype.slice.call(arguments);
  var name = args.shift();
  var data = args.shift();
  var filters = this._filters[name];

  if (!filters || filters.length === 0) {
    return data;
  }

  _.each(filters, function(filter) {
    var tmpArgs = args;
    tmpArgs.unshift(data);
    data = filter.callback.apply(filter.context, args);
  });

  return data;
};

exports = module.exports = function(opts) {
  opts = opts || {};
  return new Harvester(opts);
};
