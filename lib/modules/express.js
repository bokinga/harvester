// dependencies
const patcher = require('../patcher');
const microtime = require('microtime');
const _ = require('lodash');

/**
 * Injects a series of functions into the `express` module so we can properly
 * record metrics for any web transactions that occur during runtime.
 *
 * This module is loaded via the patcher.
 *
 * Successful database queries are harvested as `web.request`.
 * 
 * @param {Object} harvester The parent agent that invoked this module
 * @param {Object} express The module that will be patched at runtime.
 * @return {null}
 */
module.exports = function expressInjector(harvester, express) {
  
  /**
   * Wraps the express `init` method so we can detect the version of express 
   * that this node application is currently using to handle http requests.
   * 
   * @param {Function} init The original `express.application.init` method
   * @return {Function} An injected version of the `init` method
   */
  function wrapInit(init) {
    return function injectedInit() {
      var version = 'unknown';

      // ensure that our checks match correctly
      if (express && express.application && express.application.init && 
          express.response && express.response.render && express.Router &&
          express.Router.process_params) {
        version = 4;
      }

      harvester._modules.express = version;
      return init.apply(this, arguments);
    };
  }

  /**
   * Wraps a response object's `end` method so we can track the metrics for a
   * web transaction after it's been completed.
   *
   * This method is used in `wrapProcessParams` (since we have access to the 
   * response object at that time)
   * 
   * @param {Function} end The original `res.end` method
   * @return {Function} The injected version of the `end` method
   */
  function wrapEnd(end) {
    return function injectedEnd() {
      // prep the harvester data for this response
      this.__harvesterData.duration = 
        ((microtime.now() - this.__harvesterData.startTime) / 1000);
      this.__harvesterData.request = {
        headers: this.req.headers,
        method: this.req.method,
        path: this.req.url,
        query: this.req.query,
        params: this.req.params
      };

      // remove the startTime from the data (since we don't need it anymore)
      delete this.__harvesterData.startTime;

      // harvest the web request's data
      harvester.harvest('web.request', this.__harvesterData);

      // we must return the result of the original `res.end` method or else
      // we'll break things
      return end.apply(this, arguments);
    };
  }

  /**
   * Wraps the express router's `handle` method (which is called when a new web
   * transaction occurs). Injecting into this function allows us to setup data
   * for when `response.end` is called.
   * 
   * @param {Function} handle The original `express.Router.handle` method
   * @return {Function} The injected version of the `handle` method
   */
  function wrapHandle(handle) {
    return function injectedHandle(req, res, done) {
      res.__harvesterData = {
        startTime: microtime.now()
      };
      
      // now wrap the response
      patcher.wrapMethod(res, 'end', wrapEnd.bind(res));

      // we must return the original handle method response so we don't break
      // anything in express
      return handle.apply(this, arguments);
    };
  }

  // wrap the methods we need to effectively listen to all web transactons
  // that come in via the express module.
  patcher.wrapMethod(express.application, 'init', wrapInit);
  patcher.wrapMethod(express.Router, 'handle', wrapHandle);

  // since we're using express to host a webserver, we need to track the
  // throughput (rpm) for the server as well

};
