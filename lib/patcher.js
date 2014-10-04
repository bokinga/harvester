// dependencies
const _ = require('lodash');
const path = require('path');

// A bunch of modules will be loaded but this array allows us to filter
// them down to the ones we include here
const supportedModules = [
  'express',
  'knex'
];

function _postLoad(harvester, obj, name) {
  var moduleName = path.basename(name);

  if (supportedModules.indexOf(moduleName) !== -1) {
    _loadTool(harvester, moduleName, obj);
  }

  return obj;
}

function _loadTool(harvester, moduleName, module) {
  var fileName = path.join(__dirname, './modules/', moduleName + '.js');
  try {
    require(fileName)(harvester, module);
  } catch (err) {}
}

module.exports.patchModuleLoader = function(harvester) {
  var Module = require('module');
  module.exports.wrapMethod(Module, '_load', function(_load) {
    return function(file) {
      return _postLoad(harvester, _load.apply(this, arguments), file);
    };
  });
};

module.exports.unpatchModuleLoader = function() {
  var Module = require('module');
  module.exports.unwrapMethod(Module, '_load');
};

module.exports.wrapMethod = function(obj, method, wrapper) {
  if (!_.isObject(obj)) {
    throw new Error('An invalid object was supplied');
  } else if (!obj[method] || !_.isFunction(obj[method])) {
    throw new Error('Method must exist on the object');
  } else if (!_.isFunction(wrapper)) {
    throw new Error('Wrapper must be a valid callback');
  }

  var original = obj[method];
  if (_.isFunction(original.__harvesterUnwrap)) {
    return;
  }

  var wrapped = wrapper(original);
  wrapped.__harvesterOriginal = original;
  wrapped.__harvesterUnwrap = function() {
    obj[method] = original;
  };

  obj[method] = wrapped;
};

module.exports.unwrapMethod = function(obj, method) {
  if (!_.isObject(obj)) {
    throw new Error('An invalid object was supplied');
  } else if (!obj[method] || !_.isFunction(obj[method])) {
    throw new Error('Method must exist on the object');
  } else if (!_.isFunction(obj.__harvesterOriginal)) {
    return;
  }

  var wrapped = obj[method];
  wrapped.__harvesterUnwrap();
};
