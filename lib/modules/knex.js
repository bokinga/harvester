// dependencies
const patcher = require('../patcher');
const microtime = require('microtime');
const _ = require('lodash');

/**
 * Injects a series of functions into the `knex` module so we can properly
 * record metrics for any database transactions that occur during runtime.
 *
 * This module is loaded via the patcher.
 *
 * Successful database queries are harvested as `db.query`.
 * 
 * @param {Object} harvester The parent agent that invoked this module
 * @param {Object} knex The module that will be patched at runtime.
 * @return {null}
 */
module.exports = function knexInjector(harvester, knex) {

  /**
   * Each client has a "Runner" in knex which is responsible for executing the
   * requested query. This method injects code that will extend each promise
   * to listen for when a query starts and finishes; doing this gives us metrics
   * for database query data so we can effectively debug slow-running queries.
   *
   * Todo: listen for errors as well
   * 
   * @param {Function} _query The original `Runner._query` method
   * @return {Function} An injected version of the original `_query` method
   */
  function wrapRunnerQuery(_query) {
    return function injectedRunnerQuery() {
      // log the time before the query is actually performed
      var startTime = microtime.now();

      // calling the original `_query` function will produce a promise
      // which gives us an opportunity to inject a `then`
      return _query.apply(this, arguments)
        .then(function harvestDatabaseQuery(queryObject) {
          // ensure that the query is in the place we expect it to be
          if (!_.isString(queryObject.sql)) {
            return queryObject;
          }

          // build the data for this query and then harvest it
          var harvestData = {
            duration: (microtime.now() - startTime),
            query: queryObject.sql
          };
          harvester.harvest('db.query', harvestData);

          // the original `queryObject` must be returned to ensure thay we
          // do not break anything knex does
          return queryObject;
        });
    };
  }

  /**
   * Knex has an initializer method that returns a new instance of knex.
   * This method will inject our custom logic into every new instance of each 
   * knex object. Without this, hooking into the `Runner._query` function 
   * wouldn't be possible.
   * 
   * @param  {Function} initialize The original `initialize` method
   * @return {Function} An injected version of the original `initialize` method
   */
  function wrapInitialize(initialize) {
    return function injectedInitializer() {
      // in order to get the newly instantiated object, we must cache the result
      // of the original `initialize` function and then make modifications
      // directly to it
      var result = initialize.apply(this, arguments);

      // let harvester know that this application is using knex
      var moduleName = 'knex (' + result.client.dialect + ')';
      harvester.registerModule(moduleName, result.VERSION);

      // patch the prototype for the `Runner._query` (which should exist on
      // every dialect of knex database clients) - doing this allows us to
      // listen to each and every query that's being performed
      patcher
        .wrapMethod(result.client.Runner.prototype, '_query', wrapRunnerQuery);
      
      // be sure to return the newly instantiated object so knext does not break
      return result;
    };
  }

  // inject our logic into the `initialize` method for knex
  patcher.wrapMethod(knex, 'initialize', wrapInitialize);

};
