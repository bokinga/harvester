// dependencies
const _ = require('lodash');
const path = require('path');

// this will help to control multiple calls to `patchModuleLoader`
var moduleLoaderIsPatched = false;

// A bunch of modules will be loaded but this array allows us to filter
// them down to the ones we include here
const supportedModules = [
  'express',
  'knex'
];

/**
 * Compares the previously loaded module name with a list of "supported"
 * modules. If the module name is supported, we load our injector module
 * to begin the injection (for metrics).
 * 
 * @param {Object} harvester The instantiated harvester agent that
 *   called the `patchModuleLoader` function
 * @param {Object} obj The module object that was loaded into memory by
 *   the current application.
 * @param {String} name The path that was called in the `require()`
 *   command.
 * @return {Object} The module object that was loaded into memory. This
 *   is returned to the code that required it.
 */
function _onModuleLoaded(harvester, obj, name) {
  // use `path.basename` here because sometimes a module can be requested
  // with a relative/absolute path instead of a singular module name
  // i.e. - './modules/test' versus 'test'
  var moduleName = path.basename(name);

  // check to see if we need to load an injector module to patch this
  // `obj`
  if (supportedModules.indexOf(moduleName) !== -1) {
    _loadInjector(harvester, moduleName, obj);
  }

  // returning the loaded object is super important; if we don't, it
  // will break every single `require` call
  return obj;
}

/**
 * Attempts to load an injector module. If the injector module is loaded
 * properly, it is passed our harvester instance and the original module
 * (so it can be patched properly).
 * 
 * @param {Object} harvester The instantiated harvester agent that
 *   called the `patchModuleLoader` function
 * @param {String} moduleName The name of the module that was loaded
 *   into memory by the `require()` call
 * @param {Object} module The module object that was loaded into memory
 *   by the `require()` call
 * @return {null}
 */
function _loadInjector(harvester, moduleName, module) {
  var fileName = path.join(__dirname, './modules/', moduleName + '.js');
  try {
    require(fileName)(harvester, module);
  } catch (err) {}
}

/**
 * Patches the module loader so we can listen to each module that gets
 * loaded via `require` and patch it accordingly.
 * 
 * @param {Object} harvester The instantiated harvester agent that
 *   called this function
 * @return {null}
 */
module.exports.patchModuleLoader = function(harvester) {
  if (moduleLoaderIsPatched) {
    return;
  }

  var Module = require('module');
  module.exports.wrapMethod(Module, '_load', function(_load) {
    return function(file) {
      return _onModuleLoaded(harvester, _load.apply(this, arguments), file);
    };
  });

  moduleLoaderIsPatched = true;
};

/**
 * Unpatches the module loader so we stop listening to any module that
 * gets loaded via `require`.
 * 
 * @return {null}
 */
module.exports.unpatchModuleLoader = function() {
  if (!moduleLoaderIsPatched) {
    return;
  }

  var Module = require('module');
  module.exports.unwrapMethod(Module, '_load');
  moduleLoaderIsPatched = false;
};

/**
 * Wraps a method for an object with a wrapper function that injects
 * itself into the method.
 *
 * @param {Object} obj An object that owns the specified method
 * @param {String} method The name of the method that we want to wrap
 * @param {Function} wrapper Function that returns the newly patched
 *   method
 * @return {null}
 */
module.exports.wrapMethod = function(obj, method, wrapper) {
  // do some checking to make sure we're not going to break ANYTHING on
  // the injected method; if this function DID break something it could
  // potentially break the entire application.
  if (!_.isObject(obj)) {
    throw new Error('An invalid object was supplied');
  } else if (!obj[method] || !_.isFunction(obj[method])) {
    throw new Error('Method must exist on the object');
  } else if (!_.isFunction(wrapper)) {
    throw new Error('Wrapper must be a valid callback');
  }

  // if the method already contains our injected unwrap method, don't
  // patch it again, just bail
  var original = obj[method];
  if (_.isFunction(original.__harvesterUnwrap)) {
    return;
  }

  // Call the wrapper function and setup wrapper data so we can prevent
  // additional `wrapMethod` calls for this method (on this object)
  var wrapped = wrapper(original);
  wrapped.__harvesterOriginal = original;
  wrapped.__harvesterUnwrap = function() {
    obj[method] = original;
  };

  // set the objects method to the newly wrapped function
  obj[method] = wrapped;
};

/**
 * Unwraps a previously wrapped function. The function must contin the
 * same properties that we set when wrapping the method the first time
 * around.
 * 
 * @param {Object} obj The object we want to unwrap the method for
 * @param {String} method The name of the method we're trying to unwrap.
 * @return {null}
 */
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
